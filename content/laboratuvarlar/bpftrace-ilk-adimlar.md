---
title: First steps with bpftrace
language: C
---

# First steps with bpftrace

Trace a small C program that you know completely, so that every number bpftrace prints can be checked against the source. You will list probes, count system calls, catch a failing `open`, build a histogram, probe a function in your own program, read its return value, time it, and print the call stack that leads to a system call.

The workload is deterministic: for the default 50 items you can calculate in advance how many times each event must happen. That turns each step into a test of your probe, not just a demonstration.

## Before you start

You need Linux, GCC or Clang, and **bpftrace 0.21 or newer** with root access (bpftrace 0.19 and 0.20 also accept the `args.field` syntax used here; on older releases write `args->field`). Read [bpftrace from zero](../rehberler/bpftrace-temelleri.md) first; this lab practises its sections in order. Use a disposable or personal machine. bpftrace's `-c` runs the workload as root, so run only this lab program with it.

```bash
mkdir -p bpftrace-first && cd bpftrace-first
bpftrace --version | tee env.txt
uname -r | tee -a env.txt
```

## 1. The workload

Save this as `worker.c`:

```c worker.c
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define INPUT "worker-input.txt"
#define INPUT_SIZE 10000

/* The function we will probe: its cost depends on id % 5. */
__attribute__((noinline)) int process_item(int id) {
    volatile unsigned long x = 0;
    for (int i = 0; i < (id % 5 + 1) * 200000; i++)
        x += (unsigned long)i;
    return id % 7;
}

static int make_input(void) {
    char data[INPUT_SIZE];
    memset(data, 'x', sizeof data);
    int fd = open(INPUT, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return -1;
    ssize_t w = write(fd, data, sizeof data);
    close(fd);
    return w == (ssize_t)sizeof data ? 0 : -1;
}

/* Reads the input in 4096-byte chunks: 4096 + 4096 + 1808, then 0 (EOF). */
static long read_input(void) {
    char buf[4096];
    long total = 0;
    ssize_t r;
    int fd = open(INPUT, O_RDONLY);
    if (fd < 0) return -1;
    while ((r = read(fd, buf, sizeof buf)) > 0)
        total += r;
    close(fd);
    return total;
}

int main(int argc, char **argv) {
    int items = argc > 1 ? atoi(argv[1]) : 50;
    long result_sum = 0;
    if (items <= 0 || make_input() != 0) {
        fprintf(stderr, "usage: %s [items>0] (run in a writable directory)\n", argv[0]);
        return 2;
    }
    for (int i = 0; i < items; i++) {
        if (i % 10 == 0) {
            /* An optional file that never exists: this open fails with ENOENT. */
            int fd = open("missing.conf", O_RDONLY);
            if (fd >= 0) close(fd);
            else if (errno != ENOENT) perror("missing.conf");
        }
        if (read_input() != INPUT_SIZE) {
            fprintf(stderr, "short read on %s\n", INPUT);
            return 1;
        }
        result_sum += process_item(i);
        struct timespec pause = { 0, 2 * 1000 * 1000 }; /* 2 ms */
        nanosleep(&pause, NULL);
    }
    printf("items=%d result_sum=%ld pid=%ld\n", items, result_sum, (long)getpid());
    return 0;
}
```

Build it and run it once without tracing:

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer worker.c -o worker
./worker
```

Expected output, apart from the PID:

```text
items=50 result_sum=147 pid=<pid>
```

`result_sum` is the sum of `i % 7` for `i` from 0 to 49, which is 147. Keep the absolute path of the binary in a variable; uprobes need it:

```bash
BIN=$(readlink -f ./worker)
echo "$BIN"
```

Before tracing, predict what the program does for 50 items by reading `main`:

| Event | Expected count | Why |
| --- | --- | --- |
| `process_item` calls | 50 | once per item |
| `open` of `missing.conf` (fails with `ENOENT`) | 5 | items 0, 10, 20, 30, 40 |
| successful opens of `worker-input.txt` | 51 | one to create it, 50 to read it |
| `read` returning data | 150 | three chunks per item: 4096 + 4096 + 1808 |
| `read` returning 0 (end of file) | 50 | once per item |
| sleeps | 50 | 2 ms after each item |

## 2. Hello, probe list

```bash
sudo bpftrace -e 'BEGIN { printf("bpftrace works\n"); exit(); }'
sudo bpftrace -l 'tracepoint:syscalls:sys_enter_open*'
sudo bpftrace -lv 'tracepoint:syscalls:sys_exit_read'
sudo bpftrace -l "uprobe:$BIN:process_item"
```

The first command checks permissions. The second shows which open-related system calls this kernel can trace; modern glibc implements `open()` with the **`openat`** system call, which is why this lab traces `openat`, not `open`. The third shows the fields of the read exit tracepoint, including `ret`. The fourth confirms that bpftrace can resolve the function name in your binary; if it prints nothing, the function was inlined or the path is wrong.

## 3. Count every system call the program makes

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:raw_syscalls:sys_enter /pid == cpid/ { @syscalls = count(); }'
```

`raw_syscalls:sys_enter` fires for every system call; the filter keeps only the child started by `-c`. The total is larger than the table above predicts: the dynamic loader and C library make system calls before `main` (mapping libraries, setting up memory) and at exit. That difference is the first lesson: **your code is not the only code in your process**.

Now count by system call name. The wildcard attaches one probe per system call, so startup takes a few seconds:

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_enter_* /pid == cpid/ { @[probe] = count(); }'
```

Check against your table:

- `sys_enter_read` should be at least 200 (150 data reads + 50 end-of-file reads, plus a few loader reads of library headers).
- `sys_enter_openat` should be at least 56 (51 + 5, plus loader opens such as `/etc/ld.so.cache` and `libc.so.6`).
- the sleep appears as `sys_enter_clock_nanosleep` or `sys_enter_nanosleep`, depending on the C library. glibc implements `nanosleep()` with the `clock_nanosleep` system call on current versions: a library function name and the system call it uses need not match.

## 4. Watch file opens and catch the failure

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @path[tid] = str(args.filename); }
tracepoint:syscalls:sys_exit_openat /pid == cpid/ {
    @opens[@path[tid], args.ret >= 0 ? 0 : -args.ret] = count();
    delete(@path[tid]);
}
END { clear(@path); }'
```

The entry tracepoint knows the file name; the exit tracepoint knows the result. A map keyed by `tid` carries the name from entry to exit. The second key is `0` for success, or the error number for a failure.

Expected entries, with your loader paths:

```text
@opens[missing.conf, 2]: 5
@opens[worker-input.txt, 0]: 51
@opens[/etc/ld.so.cache, 0]: 1
@opens[/lib/x86_64-linux-gnu/libc.so.6, 0]: 1
```

Error number 2 is `ENOENT`, "no such file or directory". The program ignores this failure silently; bpftrace sees it anyway. That is exactly how you find hidden retries and missing configuration in a real program. If the ternary expression is rejected by an old bpftrace, use `args.ret` as the key instead and read negative values as errors.

## 5. Histogram of read sizes

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_exit_read /pid == cpid/ { @bytes = hist(args.ret); }'
```

Expected shape:

```text
@bytes:
[0]                   50 |@@@@@@@@@@@@@@@@@@@@@@@@@@               |
[1K, 2K)              50 |@@@@@@@@@@@@@@@@@@@@@@@@@@               |
[4K, 8K)             100 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|
```

plus a few loader reads in other buckets. Each bucket matches the program: 50 end-of-file reads returning 0, 50 reads of 1808 bytes, and 100 reads of 4096 bytes. Now try `lhist(args.ret, 0, 5000, 1000)` instead of `hist` and compare how the same data looks with linear buckets.

## 6. Probe a function in your own program

```bash
sudo bpftrace -c "$BIN" -e "uprobe:$BIN:process_item /pid == cpid/ { @calls = count(); @ids = lhist(arg0, 0, 50, 10); }"
```

The program is in double quotes this time so the shell expands `$BIN`. `arg0` is the first argument, `id`, read from the register where the calling convention puts it. Expect `@calls: 50` and five histogram buckets of ten each.

Read the return value with a return probe:

```bash
sudo bpftrace -c "$BIN" -e "uretprobe:$BIN:process_item /pid == cpid/ { @ret = lhist(retval, 0, 7, 1); @sum = sum(retval); }"
```

`@sum` must be 147, the same value the program prints. When a probe agrees with the program's own output, you know the probe attached to the right function and saw every call.

## 7. Time the function

```bash
sudo bpftrace -c "$BIN" -e "
uprobe:$BIN:process_item /pid == cpid/ { @start[tid] = nsecs; @id[tid] = arg0; }
uretprobe:$BIN:process_item /pid == cpid && @start[tid]/ {
    @us_by_cost[@id[tid] % 5] = hist((nsecs - @start[tid]) / 1000);
    delete(@start[tid]); delete(@id[tid]);
}
END { clear(@start); clear(@id); }"
```

`process_item` loops `(id % 5 + 1) * 200000` times, so its duration should grow in five steps. The map is keyed by `id % 5`: key 4 should show durations roughly five times those of key 0. The absolute microseconds depend on your CPU. If the five groups overlap heavily, the machine was busy or the CPU frequency changed; repeat and note it.

Notice what this measures: elapsed time between entry and return, including any time the thread was preempted. The [runtime latency guide](../rehberler/calisma-zamani-gecikmesi.md) separates elapsed time from CPU time.

## 8. Who called this system call?

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_enter_*nanosleep /pid == cpid/ { @[probe, ustack] = count(); }'
```

The wildcard matches both `sys_enter_nanosleep` and `sys_enter_clock_nanosleep`, whichever your C library uses; `probe` in the key shows which one fired. The output is a stack, innermost frame first, with a count of 50:

```text
@[
    clock_nanosleep+…
    __nanosleep+…
    main+…
    __libc_start_call_main+…
]: 50
```

That shape is illustrative. If the stack stops at the libc frame, your C library was built without frame pointers; the program's own frames are still correct where they appear. If you see only hexadecimal addresses, bpftrace could not read symbols: check that the binary at `$BIN` is unchanged.

## 9. Clean up

```bash
rm -f worker-input.txt
```

Files created by the traced child are owned by root because `-c` runs it with bpftrace's privileges; use `sudo rm` if needed.

## What you practised

| Step | Concept | Guide section |
| --- | --- | --- |
| 2 | listing probes and fields | [finding probes](../rehberler/bpftrace-temelleri.md#3-finding-probes-and-their-arguments) |
| 3 | tracepoints, filters, `count()` | [filters](../rehberler/bpftrace-temelleri.md#5-filters-limiting-the-noise) |
| 4 | per-thread state, string arguments, error numbers | [maps](../rehberler/bpftrace-temelleri.md#6-maps-counting-and-summarizing-inside-the-kernel) |
| 5 | histograms | [maps](../rehberler/bpftrace-temelleri.md#6-maps-counting-and-summarizing-inside-the-kernel) |
| 6 | uprobes, `arg0`, `retval` | [probe types](../rehberler/bpftrace-temelleri.md#2-probe-types-you-will-use-first) |
| 7 | timing with entry/return pairs | [measuring time](../rehberler/bpftrace-temelleri.md#7-measuring-how-long-something-takes) |
| 8 | stacks | [stacks](../rehberler/bpftrace-temelleri.md#8-stacks-who-called-this) |

Every step compared bpftrace's output with a count you derived from the source. Keep that habit with real programs: find something you know (requests sent, items processed) and check your probe against it before trusting its timing.

Continue with the [off-CPU diagnosis lab](yavas-program-teshisi.md), which uses these techniques on a program whose slowness is not visible in a CPU profile.

## Sources

- [bpftrace manual](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [bpftrace one-liner tutorial](https://github.com/bpftrace/bpftrace/blob/master/docs/tutorial_one_liners.md)
- [openat(2)](https://man7.org/linux/man-pages/man2/openat.2.html), [read(2)](https://man7.org/linux/man-pages/man2/read.2.html), [clock_nanosleep(2)](https://man7.org/linux/man-pages/man2/clock_nanosleep.2.html)
- [errno(3)](https://man7.org/linux/man-pages/man3/errno.3.html)
