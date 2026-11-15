---
title: Observing a memory permission change
---

# Observing a memory permission change

Give a memory region permission to run code, then ask: **does that prove any code actually ran there?**

This program first makes a page readable and writable, writes one byte, then changes it to readable and executable. It never calls that memory as a function. Your goal is to observe the permission change and explain the limit of that observation.

## Before you start

Use Linux, GCC or Clang, and `strace`. Python 3.7 or newer is needed only for the optional automatic mapping viewer in step 4.

A **mapping** is a range of virtual addresses assigned to a process. The permission letters used here are `R` for read, `W` for write, and `X` for execute. The program uses `RW`, then `RX`; it does not make this mapping writable and executable at the same time.

In a Linux terminal, create an empty working directory:

```bash
mkdir -p ~/execmap-labs/memory-permissions
cd ~/execmap-labs/memory-permissions
```

## 1. Save the small program

Create a file named `izin.c` with this content:

```c izin.c
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

Follow the program's three actions before running it:

1. `mmap` asks Linux for a page of memory with read/write permissions.
2. `mprotect` changes that same page to read/execute permissions after five seconds.
3. `munmap` releases the page after another five seconds.

The page size comes from the system. The byte `0x90` is only written as data; there is no call or jump into the page.

## 2. Build and run with strace

In the terminal:

```bash
gcc -Wall -Wextra -O0 -g izin.c -o izin
strace -e trace=mmap,mprotect,munmap ./izin
```

`strace` shows selected requests the program makes to the kernel. The run takes about ten seconds because the program deliberately pauses twice. Wait until it exits before typing another command in this terminal.

The program prints its own PID, the address named `area`, and the allocation size. **Use the address from your run** to locate the relevant trace entries.

> [!NOTE]
> Loading libraries also produces mapping calls. Follow the `area` address printed by this program rather than assuming the first `mmap` belongs to your allocation.

## 3. Read the three important results

The following is a schematic example, not output you must match byte for byte:

```text
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fa289c00000
pid=25410 area=0x7fa289c00000 size=4096 (State: RW)
mprotect(0x7fa289c00000, 4096, PROT_READ|PROT_EXEC) = 0
mprotect changed permissions to RX; no code is executed in this region!
munmap(0x7fa289c00000, 4096) = 0
+++ exited with 0 +++
```

Read it in order. `mmap` returns the new address. `mprotect` uses that address again and returns 0 for success. `munmap` releases it and also returns 0.

**Your checkpoint:** find your own `area` address in the permission-changing call. The address, PID, and page size can differ from this illustration.

At this point you have completed the main observation: Linux accepted a change from `RW` to `RX`. Now check the source: no statement transfers control into `area`. Execute permission allowed a possible action; it did not record that action occurring.

## 4. Optional: watch the mapping change automatically

`/proc/PID/maps` lists a live process's memory ranges. A line containing `rw-p` is readable/writable; `r-xp` is readable/executable. The trailing `p` denotes a private mapping.

Rather than racing to copy a PID during a five-second pause, use the block below in the **same directory after step 2 has finished**. It starts a fresh `./izin`, reads that run's address, and prints the containing mapping whenever its line changes:

```bash
python3 - <<'PY'
from pathlib import Path
import re
import subprocess
import time

with subprocess.Popen(['./izin'], stdout=subprocess.PIPE, text=True) as process:
    first = process.stdout.readline()
    print(first.strip(), flush=True)
    match = re.search(r'area=(0x[0-9a-fA-F]+)', first)
    if not match:
        raise SystemExit('No allocation address was printed; inspect the program error.')
    address = int(match[1], 16)
    previous = None
    while process.poll() is None:
        try:
            lines = Path(f'/proc/{process.pid}/maps').read_text().splitlines()
        except FileNotFoundError:
            break
        for line in lines:
            start, end = line.split()[0].split('-')
            if int(start, 16) <= address < int(end, 16) and line != previous:
                print(line, flush=True)
                previous = line
        time.sleep(0.2)
    process.communicate(timeout=15)
    if process.returncode != 0:
        raise SystemExit(f'Program exited with {process.returncode}; inspect its error.')
PY
```

You should normally see a containing line with `rw-p`, then one with `r-xp`. The script checks whether the address lies *inside* a range: Linux can combine adjacent mappings, so the range does not have to start exactly at `area`.

This is a second run with a new identity. It illustrates the same change through procfs; it does not add evidence of execution. The empty pathname on an unnamed anonymous mapping is normal.

## If the experiment does not complete

**`strace` is missing:** install your Linux distribution's strace package before this step, or run `./izin` alone first. Running alone checks the program, but does not produce a syscall trace.

**`mmap` or `mprotect` reports an error:** keep that message. A system policy can reject executable anonymous memory, for example with `EPERM` or `EACCES`. A rejected change is not a successful RX observation.

**The PID disappears from procfs:** the process has exited. A new run has a new PID; the automatic viewer obtains it from the child it launches.

**There are many unrelated mappings:** focus on the address printed by the program, not a fixed address copied from this page.

## What to keep and what it means

Save the printed address, successful `mprotect` result, and, if you used step 4, the before/after mapping lines. Explain why those records establish a permission change but do not establish execution.

The separate RW and RX stages illustrate **W^X** (write xor execute) for this mapping: it is not writable and executable at the same time.

Linux aarch64 validation on November 7, 2026 confirmed the published C program's RW → RX change with strace and procfs. A separate unaligned-address control returned `EINVAL`. Those are bounded validation results; keep your own environment and errors when repeating the lab.

For actual execution evidence, see [custom loaders](../rehberler/ozel-yukleyiciler.md). Sampling can miss brief execution, so the absence of a perf sample alone would not prove nonexecution either. Continue with [symbol selection](sembol-secimi.md) for another small experiment.

## Sources

- [mmap — Linux man-pages (man 2 mmap)](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [mprotect — Linux man-pages (man 2 mprotect)](https://man7.org/linux/man-pages/man2/mprotect.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
