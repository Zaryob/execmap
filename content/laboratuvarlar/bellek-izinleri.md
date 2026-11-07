---
title: Observing a memory permission change
---

# Observing a memory permission change

This laboratory examines an anonymous mapping changing from writable (`RW`) to executable (`RX`), preserving basic **W^X** by avoiding simultaneous write and execute permissions. The example deliberately does not execute code from the mapping, demonstrating that execute permission alone does not establish execution.

## 1. Requirements and preparation

Use a standard Linux system, GCC or Clang, and `strace`.

Create `izin.c` in a temporary working directory:

```c
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>

int main(void) {
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) return 1;
    size_t size = (size_t)page;

    // 1. Allocate anonymous memory (read/write: RW)
    void *area = mmap(NULL, size, PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (area == MAP_FAILED) { perror("mmap"); return 1; }

    // Write a byte to memory (test RW access)
    ((unsigned char *)area)[0] = 0x90; // NOP byte
    printf("pid=%ld area=%p size=%zu (State: RW)\n", (long)getpid(), area, size);
    fflush(stdout);

    // Wait five seconds to inspect /proc/<pid>/maps
    sleep(5);

    // 2. Change memory permissions to read/execute (RX)
    if (mprotect(area, size, PROT_READ | PROT_EXEC) == -1) {
        perror("mprotect");
        munmap(area, size);
        return 1;
    }
    puts("mprotect changed permissions to RX; no code is executed in this region!");
    fflush(stdout);

    // Wait another five seconds to inspect the mapping change
    sleep(5);

    // 3. Release the mapping
    if (munmap(area, size) == -1) { perror("munmap"); return 1; }
    return 0;
}
```

## 2. Compilation and syscall tracing

Build with debug symbols and run with filtered system-call tracing:

```bash
gcc -Wall -Wextra -O0 -g izin.c -o izin
strace -e trace=mmap,mprotect,munmap ./izin
```

The published C source was run on Linux 6.12.76 aarch64 with glibc 2.36 on November 7, 2026: strace and procfs both confirmed RW → RX. An additional unaligned-address control returned `EINVAL`. The excerpt below remains schematic; use your own page size, PID, and addresses:

```text
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fa289c00000
pid=25410 area=0x7fa289c00000 size=4096 (State: RW)
mprotect(0x7fa289c00000, 4096, PROT_READ|PROT_EXEC) = 0
mprotect changed permissions to RX; no code is executed in this region!
munmap(0x7fa289c00000, 4096)            = 0
+++ exited with 0 +++
```

> [!NOTE]
> The dynamic linker (`ld-linux.so`) also makes `mmap` and `mprotect` calls while loading libraries. Focus on entries matching the `area` address printed by this program.

## 3. Inspecting /proc/PID/maps from another terminal

During each `sleep(5)`, open another terminal and inspect mappings using the printed PID.

### First five seconds: the RW stage

```bash
grep "7fa289c00000" /proc/25410/maps
```

Schematic line:

```text
7fa289c00000-7fa289c01000 rw-p 00000000 00:00 0
```

### Next five seconds: RX after mprotect

```bash
grep "7fa289c00000" /proc/25410/maps
```

Schematic line:

```text
7fa289c00000-7fa289c01000 r-xp 00000000 00:00 0
```

After a successful `mprotect`, expect `rw-p` → `r-xp`. An unnamed anonymous mapping has an empty path; do not expect a generic `[anon]` label. Linux may display named private anonymous mappings as `[anon:name]`.

## 4. Analysis and hypothesis testing

The experiment tests these distinctions:

1. **Permission change != code execution**: No control transfer into the target area occurs. A page appearing as `r-xp` is therefore insufficient evidence that malicious in-memory code ran.
2. **Sampling limits**: The source does not transfer control to the area, but absence of perf samples alone would not prove nonexecution. Sampling can miss brief or rare execution. Mappings and permission changes are not execution records either.
3. **Security policy: W^X / PaX / SELinux**: Kernel policy, such as SELinux `execmem`, may prohibit adding `PROT_EXEC` to anonymous memory, causing `mprotect` to fail with an error such as `EPERM` or `EACCES`.

## Investigate further

Read [custom loaders](../rehberler/ozel-yukleyiciler.md) to understand loaders and packers that change memory permissions. Try the [symbol selection laboratory](sembol-secimi.md) to redirect library calls with `LD_PRELOAD`.

## Sources

- [mmap — Linux man-pages (man 2 mmap)](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [mprotect — Linux man-pages (man 2 mprotect)](https://man7.org/linux/man-pages/man2/mprotect.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
