---
title: Program startup, stack layout, and the auxiliary vector
---

# Program startup, stack layout, and the auxiliary vector

When Linux starts a program with `execve`, `main()` is not the first code to run. For a dynamically linked program, even the first user-space code is outside the executable's own code.

After setting up memory mappings, the kernel writes critical configuration data to the user stack before transferring control to user space. This includes arguments (`argv`), environment variables (`envp`), and the **auxiliary vector (`auxv`)**, a bridge between the operating system and the runtime.

## 1. Initial stack layout

The kernel's `create_elf_tables()` function in `fs/binfmt_elf.c` builds the initial user-space stack according to the System V AMD64 ABI:

```text
Low address -> high address (Linux x86-64, schematic)
%rsp -> argc
        argv[0], ..., argv[argc-1], NULL
        envp[0], ..., envp[n-1], NULL
        auxv[0].type, auxv[0].value
        ... other auxv pairs ...
        AT_NULL, 0
        ... padding, random bytes, argv/env/platform strings ...
```

The auxv `AT_NULL` terminator is toward the higher-address end. Do not treat the order of other keys as a stable API; it can vary by architecture and kernel version. String and random-byte regions are schematic here.

When the processor transfers control to the user-space entry point, the stack pointer (`%rsp`) points at `argc`.

## 2. The _start and __libc_start_main routines

On glibc-based systems, `_start` is located at an executable's `e_entry` address (`sysdeps/x86_64/start.S`). The fragment below schematically explains the glibc 2.40 Linux x86-64 LP64 startup contract. It is not a standalone CRT implementation covering x32, static PIE, and architecture-specific details. Link normal applications with the CRT supplied by the compiler:

```assembly
.global _start
_start:
    xorl %ebp, %ebp        # Clear RBP to mark the end of the call stack for unwinding
    movq %rdx, %r9         # Dynamic linker termination function (rtld_fini)
    popq %rsi              # Read argc from RSP (RSI = argc)
    movq %rsp, %rdx        # The remaining stack begins at argv (RDX = argv)

    # Align the stack to 16 bytes
    andq $~15, %rsp

    pushq %rax             # Stack alignment padding
    pushq %rsp             # Stack-end parameter

    # __libc_start_main(main, argc, argv, init, fini, rtld_fini, stack_end)
    xorl %ecx, %ecx        # init = NULL (current glibc startup)
    xorl %r8d, %r8d        # fini = NULL
    movq main@GOTPCREL(%rip), %rdi  # PIC addressing: main
    call *__libc_start_main@GOTPCREL(%rip)
    hlt                    # Must not return here
```

`__libc_start_main` participates in glibc startup and constructor invocation; `main` is eventually called. Initial TLS for a dynamically linked program is set up by the loader; the static glibc path initializes TLS during libc startup ([libc-start.c](https://github.com/bminor/glibc/blob/glibc-2.40/csu/libc-start.c)). Malloc infrastructure may initialize lazily. Do not interpret every `__libc_start_main` call as evidence that the heap has already been initialized ([malloc.c](https://github.com/bminor/glibc/blob/glibc-2.40/malloc/malloc.c)).

## 3. Inspecting the auxiliary vector

The auxiliary vector is a `(key, value)` table through which the kernel reports hardware capabilities, security state, and memory addresses to the dynamic linker and C runtime.

### Inspecting auxv in a terminal with glibc

Set glibc's `LD_SHOW_AUXV=1` environment variable to display the auxv entries supplied by the kernel:

```bash
LD_SHOW_AUXV=1 /bin/true
```

Run this on Linux/glibc and save actual output. `AT_PHDR`, `AT_PHENT`, `AT_PHNUM`, `AT_ENTRY`, `AT_BASE`, `AT_SECURE`, and `AT_RANDOM` help explain loading; addresses, hardware capabilities, and available fields depend on the environment. No `LD_SHOW_AUXV` output was measured during this revision.

### Reading auxv in C with getauxval()

A C program can access these values through `getauxval()`, declared in `<sys/auxv.h>`:

```c
#include <stdio.h>
#include <sys/auxv.h>
#include <elf.h>

int main(void) {
    unsigned long entry = getauxval(AT_ENTRY);
    unsigned long phdr  = getauxval(AT_PHDR);
    unsigned long vdso  = getauxval(AT_SYSINFO_EHDR);
    unsigned long rnd   = getauxval(AT_RANDOM);

    printf("Program entry     (AT_ENTRY) : 0x%lx\n", entry);
    printf("Program headers  (AT_PHDR)  : 0x%lx\n", phdr);
    printf("vDSO address     (AT_SYSINFO): 0x%lx\n", vdso);

    if (rnd) {
        printf("Random bytes     (AT_RANDOM): ");
        unsigned char *p = (unsigned char *)rnd;
        for (int i = 0; i < 16; i++) printf("%02x ", p[i]);
        printf("\n");
    }

    return 0;
}
```

## 4. auxv in security and reverse engineering

### AT_SECURE and LD_PRELOAD restrictions

`AT_SECURE` indicates secure-execution mode; effective UID/GID changes, capability acquisition, and security module decisions may contribute. Setting a file's setuid bit alone does not guarantee this mode on every execution.

In secure-execution mode, glibc ignores `LD_LIBRARY_PATH`. For `LD_PRELOAD`, paths containing slashes are ignored; there is a narrow exception for preload objects with the setuid bit in standard directories. Removing variables from the program environment and processing them under restrictions are separate matters. `DT_RPATH`/`DT_RUNPATH` are not simply eliminated; the claim that only the cache and system directories remain is incorrect. See [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html).

### AT_RANDOM and stack canaries

For stack-protector checks (`-fstack-protector`), glibc derives the stack canary from the 16 random bytes addressed by `AT_RANDOM`. On the x86-64 glibc path, the guard is stored in the thread control block, accessed through the FS register.

## Investigate further

Continue with [dynamic linking](dinamik-baglama.md) to examine library resolution involving `ld.so` at `AT_BASE`. Read [binary diffing](ikili-fark-analizi.md) to investigate binary differences after understanding the loaded process.

## Sources

- [getauxval — Linux man-pages (man 3 getauxval)](https://man7.org/linux/man-pages/man3/getauxval.3.html)
- [x86-64 psABI — process initialization and calling conventions](https://gitlab.com/x86-psABIs/x86-64-ABI)
- [Linux Kernel: fs/binfmt_elf.c create_elf_tables()](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
- [glibc sysdeps/x86_64/start.S source](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/x86_64/start.S)
