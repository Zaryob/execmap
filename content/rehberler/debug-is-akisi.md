---
title: Debugging slow, stuck, and failing programs with perf and bpftrace
---

# Debugging slow, stuck, and failing programs with perf and bpftrace

This is a symptom-driven playbook. Each section starts from something you can observe, such as "the CPU is at 100 %" or "the process does nothing", and lists the commands that turn the symptom into evidence. It reuses the vocabulary of [performance analysis from zero](performans-analizine-giris.md) and the syntax from [bpftrace from zero](bpftrace-temelleri.md).

Throughout this page, `PID` is the process ID and `./prog` is the program under investigation. Commands that attach to a running process or trace the kernel need root on most systems.

## 0. Before choosing a branch

Spend one minute on these checks. They tell you which section below applies.

```bash
ps -o pid,tid,stat,pcpu,wchan:32,comm -L -p PID   # threads, state, CPU %, kernel wait function
grep -E 'State|Threads|voluntary' /proc/PID/status
sudo perf stat -p PID -- sleep 5                   # five seconds of counters
```

- **State** `R` means running or runnable, `S` sleeping (waiting for an event), `D` uninterruptible sleep (usually I/O inside the kernel), `T` stopped, `Z` exited but not yet reaped.
- **`wchan`** names the kernel function a sleeping thread is waiting in, when the kernel exposes it. Values such as `futex_wait_queue` (lock or condition variable), `do_select`/`do_epoll_wait` (waiting for I/O readiness), or `hrtimer_nanosleep` (sleep) point to the kind of wait. Names vary between kernel versions.
- **perf stat** `CPUs utilized` near or above 1 means the process is busy; near 0 means it waits.

| What you see | Go to |
| --- | --- |
| high CPU, slow | [section 1](#1-the-program-is-busy-on-cpu-and-slow) |
| low CPU, slow | [section 2](#2-the-program-is-slow-but-the-cpu-is-mostly-idle) |
| no progress at all | [section 3](#3-the-program-is-stuck) |
| wrong behavior, silent failures, retries | [section 4](#4-the-program-fails-or-retries-silently) |
| slower than a previous version | [section 5](#5-it-got-slower-after-a-change) |
| memory grows, many page faults | [section 6](#6-memory-growth-and-page-faults) |

## 1. The program is busy on-CPU and slow

The question is **which code** uses the CPU. Sample it.

```bash
sudo perf top -p PID                              # live view, press q to quit
sudo perf record -F 99 -g -p PID -- sleep 10      # 10 s of stack samples
sudo perf report --stdio --no-children | head -n 60
```

`--no-children` sorts by **self** time: the functions whose own instructions were executing. Then switch to `--children` to find the caller whose whole subtree is expensive. A flame graph shows both views at once; the [CPU profiling lab](../laboratuvarlar/cpu-profili.md) builds one step by step.

When one function dominates, look at its instructions:

```bash
sudo perf annotate --stdio -s function_name | head -n 60
```

Read the hot instructions with the [assembly preparation guide](assembly-okuma.md). A hot loop of comparisons often means an algorithm problem (a linear search in a loop). A hot instruction after a memory load can mean cache misses; confirm with counters:

```bash
sudo perf stat -e cycles,instructions,cache-references,cache-misses,branch-misses -p PID -- sleep 5
```

Instructions per cycle (IPC, printed as `insn per cycle`) well below 1 on a modern CPU suggests the CPU often waits for memory. Counter names and availability depend on the CPU and on virtualization; `<not supported>` means unavailable, not zero.

bpftrace can sample too, which is useful when you want to combine samples with a filter you write yourself:

```bash
sudo bpftrace -e 'profile:hz:99 /pid == PID/ { @[ustack] = count(); } interval:s:10 { exit(); }'
```

**Evidence to keep:** the report, the exact command, the sample count, and whether stacks were complete.

## 2. The program is slow but the CPU is mostly idle

A CPU profile cannot explain time spent waiting. You need to find **what the threads wait for**.

### 2a. Which system calls take the time?

Count system calls and time them per name. This one-liner records how long each system call took, grouped by name, for the child process:

```bash
sudo bpftrace -c './prog' -e '
tracepoint:raw_syscalls:sys_enter /pid == cpid/ { @start[tid] = nsecs; @id[tid] = args.id; }
tracepoint:raw_syscalls:sys_exit /pid == cpid && @start[tid]/ {
    @total_us[@id[tid]] = sum((nsecs - @start[tid]) / 1000);
    delete(@start[tid]); delete(@id[tid]);
}
END { clear(@start); clear(@id); }'
```

`raw_syscalls` reports a system call *number*, not a name. Map numbers to names with `ausyscall --dump` (auditd package) or the kernel's syscall table. A simpler but heavier alternative that prints names directly is perf's syscall summary:

```bash
sudo perf trace -s ./prog
```

`perf trace -s` prints, per thread, each system call's count, total, average, and maximum time. Look for calls that are few but long (`futex`, `poll`, `epoll_wait`, `clock_nanosleep`, `read` on a pipe or socket, `fsync`).

### 2b. Interpret the waiting system call

| Long syscall | Usually means | Next step |
| --- | --- | --- |
| `futex` | waiting for a mutex, condition variable, or thread join | find the lock holder: [diagnosis lab](../laboratuvarlar/yavas-program-teshisi.md) |
| `clock_nanosleep`, `nanosleep` | deliberate sleep, backoff, polling loop | find the caller with `ustack` |
| `poll`, `epoll_wait`, `select` | waiting for network or pipe data | check the peer; time the request end to end |
| `read`, `write`, `fsync` on a file | disk I/O | `biolatency`-style block tracing, device utilization |
| `connect`, `recvfrom` | network latency or a slow server | measure on both ends |

The `futex` case is the most common in multi-threaded programs, and the hardest to see. A thread waiting for a lock is off-CPU *because another thread holds the lock*; the waiting thread's stack tells you which lock, and the holder's stack tells you why it is held for long.

### 2c. Off-CPU time per thread

The scheduler tracepoint `sched:sched_switch` fires whenever a thread leaves or gets a CPU. Recording the time between leaving and returning gives off-CPU time per thread:

```bash
sudo bpftrace -c './prog' -e '
tracepoint:sched:sched_switch /pid == cpid/ { @off[tid] = nsecs; }
tracepoint:sched:sched_switch /@off[args.next_pid]/ {
    @offcpu_ms[args.next_pid] = sum((nsecs - @off[args.next_pid]) / 1000000);
    delete(@off[args.next_pid]);
}
END { clear(@off); }'
```

The first block runs in the context of the thread that is leaving, so `pid` and `tid` identify it. The second uses `next_pid`, which despite its name is the **thread** ID of the task that gets the CPU. Off-CPU time includes sleeping and waiting to be scheduled; the [scheduler timeline lab](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md) separates the two.

## 3. The program is stuck

When nothing progresses, take a **snapshot** of every thread before changing anything.

```bash
cat /proc/PID/task/*/stat | awk '{print $1, $3}'     # TID and state of each thread
sudo cat /proc/PID/task/*/stack                       # kernel stacks (root, if the kernel exposes them)
sudo gdb -p PID -batch -ex 'thread apply all bt'     # user stacks of all threads
```

GDB stops the process while it is attached and lets it continue when it detaches. It is the most informative snapshot for user code, especially with debug information. Two threads each waiting for a lock the other holds is a deadlock; their back traces show both lock calls. A single thread in `D` state for a long time points to the kernel or a device; its kernel stack is the evidence.

If attaching a debugger is not allowed, sample stacks of the sleeping threads with bpftrace when they go off-CPU:

```bash
sudo bpftrace -e 'tracepoint:sched:sched_switch /pid == PID/ { @[kstack, ustack, comm] = count(); } interval:s:5 { exit(); }'
```

A program that is truly stuck may not switch at all during the window; then the GDB snapshot or `/proc/PID/task/*/stack` is the better tool. For a crash instead of a hang, use [core dumps](core-ve-snapshot.md).

## 4. The program fails or retries silently

Many "slow" programs are failing and retrying. System call errors are visible from the kernel even when the program hides them.

```bash
# Every failing system call of the child, by syscall number and error number
sudo bpftrace -c './prog' -e 'tracepoint:raw_syscalls:sys_exit /pid == cpid && args.ret < 0/ { @fail[args.id, -args.ret] = count(); }'

# Which file paths fail to open, and why
sudo bpftrace -c './prog' -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @path[tid] = str(args.filename); }
tracepoint:syscalls:sys_exit_openat /pid == cpid/ {
    if (args.ret < 0) { printf("open %s failed: errno %d\n", @path[tid], -args.ret); }
    delete(@path[tid]);
}
END { clear(@path); }'
```

Some failures are normal: `ENOENT` for optional configuration files, `EAGAIN` for non-blocking I/O. What matters is a failure that repeats in a loop, or one that happens just before the symptom. `strace -f -e trace=%file ./prog` shows the same information with arguments decoded and is a good cross-check, at the cost of stopping the process for every call.

## 5. It got slower after a change

Compare like with like: the same input, machine, and build flags.

```bash
perf stat -r 5 ./prog-old > /dev/null 2> old.txt
perf stat -r 5 ./prog-new > /dev/null 2> new.txt
perf record -g -o old.data ./prog-old
perf record -g -o new.data ./prog-new
perf diff old.data new.data | head -n 40
```

`-r 5` reports the mean and the variation; if the difference between versions is smaller than the variation, there is no finding yet. `perf diff` lists functions whose share of samples changed. It compares *percentages*: a function can grow in share because something else got faster. Use the [binary diffing guide](ikili-fark-analizi.md) when the source of the change is unknown.

## 6. Memory growth and page faults

```bash
perf stat -e page-faults,minor-faults,major-faults ./prog
sudo perf record -e page-faults -g ./prog          # where faults happen
sudo bpftrace -c './prog' -e 'uprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc /pid == cpid/ { @bytes[ustack(6)] = sum(arg0); }'
```

The library path differs between distributions; find it with `ldd ./prog`. Probing `malloc` is expensive in allocation-heavy programs, so try a short run first. Summing requested sizes by stack shows who asks for memory, not who forgets to free it; for leaks, pair `malloc` with `free` or use a dedicated tool such as Valgrind or AddressSanitizer.

## 7. Write down what you found

A short record makes the finding reviewable and repeatable:

```text
Symptom:        report takes 3.0 s for 200 jobs (baseline 0.1 s)
Environment:    kernel 6.8, x86-64, gcc 13 -O2 -g -fno-omit-frame-pointer, bpftrace 0.21
Observation 1:  elapsed 3.0 s, user+sys 0.15 s  → mostly off-CPU
Observation 2:  main thread: 2.8 s in futex; flusher thread holds table_lock ~30 ms per flush
Hypothesis:     main waits for table_lock while flusher sleeps inside the critical section
Prediction:     moving the sleep outside the lock removes most futex time
Result:         fixed build 0.1 s; futex time near zero
Limits:         one machine, 5 runs; probe overhead not separately measured
```

This example matches the [off-CPU diagnosis lab](../laboratuvarlar/yavas-program-teshisi.md), where you can reproduce every line. The [trace interpretation guide](izleri-yorumlamak.md) explains why the "Limits" line matters.

## Sources

- [perf-trace(1)](https://man7.org/linux/man-pages/man1/perf-trace.1.html), [perf-diff(1)](https://man7.org/linux/man-pages/man1/perf-diff.1.html), [perf-annotate(1)](https://man7.org/linux/man-pages/man1/perf-annotate.1.html)
- [proc_pid_stat(5)](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) and [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [futex(2)](https://man7.org/linux/man-pages/man2/futex.2.html)
- [Brendan Gregg: Off-CPU Analysis](https://www.brendangregg.com/offcpuanalysis.html)
- [bpftrace manual](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [GDB: debugging programs with multiple threads](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Threads.html)
