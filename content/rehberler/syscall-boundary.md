---
title: From a function call to a Linux system call
description: Follow a pread call from application code through libc into the Linux kernel, then compare the function and syscall register conventions.
---

# From a function call to a Linux system call

A C program calls `pread` using its platform's function ABI. A libc wrapper arranges the Linux syscall arguments, enters the kernel, and converts kernel errors to the C library's interface. Follow both boundaries on Linux x86-64, then compare the register roles on AArch64. See [Function ABIs and binary compatibility](abi.md) for the user-space calling conventions.

## Register roles at each boundary

| Boundary | Selector and transfer | Positional integer and pointer arguments | Result |
| --- | --- | --- | --- |
| Linux x86-64 function | `call` to a user-space address | `rdi, rsi, rdx, rcx, r8, r9`, then stack | `rax` |
| Linux x86-64 syscall | `rax` carries the number, `syscall` enters the kernel | `rdi, rsi, rdx, r10, r8, r9` | `rax` |
| Linux AArch64 function | `bl` or `blr` to a user-space address | `x0–x7`, then stack | `x0` |
| Linux AArch64 syscall | `w8` carries the number, `svc #0` enters the kernel | `x0–x5` | `x0` |

On x86-64, `syscall` uses `rcx` for the user-space return address and `r11` for saved flags. Linux therefore uses `r10` for argument four. On AArch64 the first six argument registers line up in this example, and the syscall number has its own register. Read the [Syscall conventions reference](https://zaryob.github.io/syscall/#conventions), the Linux [x86-64 table](https://zaryob.github.io/syscall/arch/x64/) and [AArch64 table](https://zaryob.github.io/syscall/arch/arm64/) for architecture-dependent numbers and mappings. [Linux man-pages syscall(2)](https://man7.org/linux/man-pages/man2/syscall.2.html), [Linux x86-64 kernel entry](https://github.com/torvalds/linux/blob/master/arch/x86/entry/entry_64.S).

## Trace a four-argument call

This program reads the second byte of a file. `pread` accepts a file descriptor, a buffer pointer, a byte count, and an offset. On the Linux targets above, the kernel call is [pread64](https://zaryob.github.io/syscall/call/pread64/). The source also lets you use libc's generic `syscall()` function with the target's `SYS_pread64` constant.

```c pread-boundary.c
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>

int main(int argc, char **argv) {
    int fd = open("fixture.txt", O_RDONLY);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    char byte;
    ssize_t count;
    if (argc > 1 && argv[1][0] == 's') {
        count = syscall(SYS_pread64, fd, &byte, (size_t)1, (off_t)1);
    } else {
        count = pread(fd, &byte, 1, 1);
    }
    if (count < 0) {
        perror("pread");
    } else if (count == 1) {
        putchar(byte);
        putchar('\n');
    }
    close(fd);
    return count == 1 ? 0 : 1;
}
```

Download the source and run these commands in an empty directory with Linux, a C compiler, Binutils, and strace.

```sh
printf 'ABC\n' > fixture.txt
cc -g -O0 pread-boundary.c -o pread-boundary
strace -e trace=pread64 ./pread-boundary
strace -e trace=pread64 ./pread-boundary syscall
objdump -dr --disassemble=main ./pread-boundary
```

Both commands print `B` and trace a one-byte `pread64` at offset 1. Match the arguments to `pread64(fd, "B", 1, 1) = 1` in the trace. The descriptor depends on the process, and the dynamic loader may issue earlier `pread64` calls. The application disassembly shows the regular function calls, while strace observes the kernel entries.

### Inspect register values with GDB

On Linux x86-64 with glibc, start `gdb -q ./pread-boundary`, run the ordinary `pread` path, and stop at the wrapper entry. If your GDB prints several breakpoints for aliases of `pread`, keep the one that stops at the application call; inspect `bt` to confirm it.

```text gdb
break main
run
break *pread
continue
info registers rdi rsi rdx rcx
catch syscall pread64
continue
info registers orig_rax rdi rsi rdx r10
continue
info registers rax
```

At wrapper entry the fourth argument is 1 in `rcx`. At kernel entry it is 1 in `r10`. GDB's Linux x86-64 syscall catchpoint exposes the saved number as `orig_rax`. Check `rax` at the return catchpoint to see the byte count. The wrapper may pass through cancellation-handling code depending on libc and process state. The generic `syscall()` path has an extra initial C argument for the number, so at its function entry the offset is the fifth parameter, in `r8`. The kernel sees the same offset in `r10` either way. [GDB syscall catchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Catchpoints.html), [glibc x86-64 syscall wrapper](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/unix/sysv/linux/x86_64/syscall.S).

## Interpret the return value at the right layer

Linux x86-64 and AArch64 use negative error numbers at this raw syscall boundary. libc's `pread()` and `syscall()` both return `-1` on error and set `errno`. For a short read only the returned byte count was written, and a zero result represents end of file for this nonzero request. More generally a C library function can wrap a differently named syscall or handle an operation in user space. Check the [pread manual](https://man7.org/linux/man-pages/man2/pread.2.html) for this operation and the [Syscall reference](https://zaryob.github.io/syscall/#conventions) when moving between architectures.
