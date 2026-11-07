---
title: Custom loaders and in-memory execution
---

# Custom loaders and in-memory execution

On Linux, `execve` replaces the current process image. It does not require a preceding `fork`, and it does not change the PID. `execveat` is another execution path. Watching only `sys_enter_execve` therefore does not cover every path; validate tool and rule coverage separately.

Advanced malware, packers, and in-memory modules use **custom loaders** or **user-space exec** to reduce on-disk artifacts or avoid checks focused on `execve`. These techniques reproduce parts of the kernel's `load_elf_binary` work in user space, parsing and loading an ELF image in memory.

## 1. Approaches to in-memory loading

Linux in-memory execution techniques can be grouped into three broad approaches:

```text
1. File-descriptor-based loading (memfd_create)
   [RAM] -> memfd_create() -> fexecve(fd) -> [Kernel ELF loading]
   (Kernel exec path; the syscall can be execveat or execve)

2. User-space loader
   [RAM] -> mmap(MAP_ANON) -> Copy segments -> Relocate -> jmp *e_entry
   (No new exec call; the existing process and PID remain)

3. Replacing memory inside a process (hollowing / /proc/self/mem)
   [Existing process] -> Unmap old image -> Map new ELF -> Prepare stack
```

## 2. memfd_create and fexecve

Introduced in Linux 3.17, `memfd_create` creates a descriptor for an anonymous, memory-backed file without creating a conventional filesystem file:

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <limits.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <sys/mman.h>
#include <fcntl.h>

int run_from_memory(const unsigned char *elf_bytes, size_t size, char **argv, char **envp) {
    // 1. Create an anonymous memory-backed file
    int fd = syscall(SYS_memfd_create, "memory_module", MFD_CLOEXEC);
    if (fd < 0) { perror("memfd_create"); return -1; }

    // 2. Handle short writes and EINTR
    size_t done = 0;
    while (done < size) {
        size_t chunk = size - done;
        if (chunk > (size_t)SSIZE_MAX) chunk = (size_t)SSIZE_MAX;
        ssize_t n = write(fd, elf_bytes + done, chunk);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) {
            if (n == 0) errno = EIO;
            perror("write"); close(fd); return -1;
        }
        done += (size_t)n;
    }

    // 3. glibc 2.27+ can use execveat on a suitable kernel;
    // older / fallback implementations use /proc/self/fd.
    fexecve(fd, argv, envp);


    // A successful exec never returns here
    perror("fexecve");
    close(fd);
    return -1;
}
```

This Linux/glibc function fragment expects ELF bytes and valid `argv`/`envp`. Linux aarch64/glibc 2.36 validation on November 7, 2026 compiled this fragment with a separate file-reading harness. strace confirmed successful `execveat` with `AT_EMPTY_PATH`; the payload retained the PID, received argv/envp, and had no open `memory_module` descriptor. Controls covered a CLOEXEC script (`ENOENT`), an empty image (`ENOEXEC`), EINTR/short-write recovery, and a zero write (`EIO`). [fexecve(3)](https://man7.org/linux/man-pages/man3/fexecve.3.html) documents glibc 2.27+ using `execveat` on a suitable kernel. A memfd name may appear in mappings or `/proc/<pid>/fd` while the descriptor is open. Successful exec closes an `MFD_CLOEXEC` descriptor, so do not assume its fd-list entry remains. For script files, CLOEXEC can also cause `ENOENT`. Memory backing does not guarantee an absence of disk artifacts: consider swap and execution policies.

## 3. Loading ELF in user space

A user-space loader can place code in the existing address space without a new `execve`. Depending on the ELF types it supports, it takes responsibility for mappings, relocations, and startup state. The following checklist derives from the [ELF loader](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) and [x86-64 ABI](https://gitlab.com/x86-psABIs/x86-64-ABI); it is an investigation framework, not a complete implementation:

1. **Allocate memory**: Use `mmap()` for `PROT_READ | PROT_WRITE | PROT_EXEC` or separate RX/RW segments.
2. **Copy segments**: Place `PT_LOAD` contents at the calculated `p_vaddr` locations.
3. **Zero BSS**: Clear the `p_memsz > p_filesz` tail.
4. **Resolve relocations**: For a dynamic image, process the relevant tables, including `DT_RELA`, and update pointers using loaded library addresses.
5. **Prepare the stack and auxv**: Supply the expected `argc`, `argv`, `envp`, and `auxv` structures.
6. **Transfer control**: Account for the relocation base when entering the image. Dynamic images also require interpreter, TLS, and other runtime setup.

A new process is not required, so the PID may remain unchanged. Kernel events such as `mmap` and `mprotect` can still be observed. Programs can change their process name; stable identity fields are not a universal detection rule.

## 4. Binary patching: from ERESI/elfsh to LIEF

The historical **ERESI/elfsh** toolkit explored adding segments and redirecting control flow without source code. Today, **[LIEF](https://github.com/lief-project/LIEF)** supports programmatic binary transformation in Python.

This example uses the **LIEF 0.17.1 Python API** on a Linux x86-64 ELF with a section table. The new entry point only performs `exit(0)`; it is not a loader that resumes the original application. Its output was checked structurally, but Linux execution was not tested during this revision. Do not apply the example directly to a sectionless file.

```python
import lief

binary = lief.ELF.parse("./ornek")
if binary is None or binary.header.machine_type != lief.ELF.ARCH.X86_64:
    raise ValueError("Linux x86-64 ELF required")
if len(binary.sections) < 2:
    raise ValueError("This example requires an existing section table")
section = lief.ELF.Section(".yukleyici")
section.type = lief.ELF.Section.TYPE.PROGBITS
# Linux x86-64: mov eax,60; xor edi,edi; syscall -> exit(0)
section.content = list(b"\xb8\x3c\x00\x00\x00\x31\xff\x0f\x05")
section.flags = lief.ELF.Section.FLAGS.ALLOC | lief.ELF.Section.FLAGS.EXECINSTR
added = binary.add(section, loaded=True)
binary.header.entrypoint = added.virtual_address
binary.write("./ornek_yamali")
```

Reparse the written file and verify that its entry point lies in an executable `PT_LOAD` range and that the added bytes are intact. No historical enum-transition date is assumed here; use the [LIEF ELF API](https://lief.re/doc/latest/formats/elf/python.html).

## 5. Investigating custom loaders in memory

The following observations can guide reverse engineering and incident response.

### A. Executable memory without a conventional backing file

Anonymous executable memory may have legitimate explanations such as JIT compilation. A memfd mapping is file-backed and is not the same as an unnamed anonymous mapping. Unnamed mappings usually have an empty path; named private anonymous mappings may appear as `[anon:name]`. Do not infer section names, execution, or maliciousness from mapping permissions alone ([proc_pid_maps(5)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)).

### B. Permission transitions

Simultaneous `rwx` violates basic W^X. An RW-then-RX transition preserves that principle, although stricter execmem policies may forbid the transition. Both are investigation clues. Correlate content, control flow, and calls before concluding that a custom loader is present.

## Investigate further

Use C and strace in the [memory permissions laboratory](../laboratuvarlar/bellek-izinleri.md) to observe permission changes. Continue with [packed ELF](paketli-elf.md) for self-unpacking binaries containing in-memory loader logic.

## Sources

- [stelf-loader — David Buchanan (GitHub)](https://github.com/DavidBuchanan314/stelf-loader)
- [LIEF: ELF Python API](https://lief.re/doc/latest/formats/elf/python.html)
- [memfd_create — Linux man-pages](https://man7.org/linux/man-pages/man2/memfd_create.2.html)
- [Linux v6.12: ELF loading implementation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
