---
title: Runtime performance analysis from zero
---

# Runtime performance analysis from zero

This guide is the starting point for readers who have never profiled or traced a program. It explains the vocabulary, a repeatable method, the role of each tool, and how to prepare a Linux machine for `perf` and `bpftrace`. No previous kernel or performance knowledge is assumed; you should be comfortable compiling a C program and running commands in a terminal.

By the end you should be able to state a performance question precisely, take a first baseline, decide whether a program is *running* or *waiting*, and choose the next tool instead of guessing.

## 1. The questions performance analysis answers

"The program is slow" is a feeling, not a measurement. Turn it into a question that a tool can answer:

- **How long does one operation take?** That is *latency*: the time from a start event to an end event, for example one request or one function call.
- **How many operations finish per second?** That is *throughput*.
- **How busy is a resource?** That is *utilization*: the fraction of time a CPU, disk, or lock was in use.
- **Is work queuing for a resource?** That is *saturation*: runnable threads waiting for a CPU, I/O waiting for a device, threads waiting for a mutex.
- **Are operations failing?** Errors such as a failing `open()` can make a program retry, wait, or take a slower path.

Two time measurements appear everywhere and must not be confused:

| Measurement | Meaning | Typical source |
| --- | --- | --- |
| Wall-clock (elapsed) time | Real time that passed between two moments | `time`'s `real`, `clock_gettime(CLOCK_MONOTONIC)` |
| CPU time | Time a CPU actually spent executing this process or thread | `time`'s `user` + `sys`, `/proc/<pid>/stat` |

If elapsed time is much larger than CPU time, the program spent most of its life **off-CPU**: sleeping, waiting for I/O, waiting for a lock, or runnable but not scheduled. If CPU time is close to elapsed time (per busy thread), the program is **on-CPU** and the question becomes *which code* uses the CPU. This single comparison decides which half of the toolbox you need.

## 2. Three ways to observe a running program

Every tool on this site uses one of three techniques. Knowing which one a tool uses tells you what it can and cannot see.

- **Counting** keeps a total and reports it later. `perf stat` counts events such as instructions, cycles, context switches, and page faults. Counting is cheap, but it says *how many*, not *where*.
- **Sampling** interrupts the program periodically and records where it was, for example 99 times per second. `perf record` and bpftrace's `profile` probe sample. Samples show *where CPU time goes* statistically, but a short or rare function can be missed entirely and sampling sees nothing while a thread is asleep.
- **Tracing** records every occurrence of a specific event, such as every `openat` system call or every entry to a function. `bpftrace`, `perf trace`, and `strace` trace. Tracing is exact for the chosen events, but each event costs time; tracing a very frequent event can slow the program noticeably.

The cost of observing is called **overhead** or the **observer effect**. Record it as part of the experiment: compare the elapsed time with and without the tool. The [observer effects guide](analiz-aracinin-etkisi.md) treats this in depth.

## 3. A method: from symptom to evidence

Use the same loop for every investigation. It prevents the most common mistake: changing code based on an unverified guess.

1. **Describe the problem** in one sentence with a number: "`./report` takes 3 s for 200 jobs; last week it took 0.1 s."
2. **Record the environment**: kernel (`uname -r`), CPU model, compiler and flags, tool versions, and the exact command line. Results without this context cannot be compared.
3. **Take a baseline**: run the program several times and note the spread. A 5 % change is meaningless if repeated runs already vary by 10 %.
4. **Decide on-CPU or off-CPU**: compare elapsed time with CPU time (section 6).
5. **Drill down with one tool**, chosen from the table in section 4.
6. **Form a hypothesis** that predicts something you have not measured yet: "If the lookup is quadratic, doubling the input should roughly quadruple lookup time."
7. **Test the prediction** with a second, independent observation. Then change the code and measure again under the same conditions.

A complementary checklist for system resources is Brendan Gregg's **USE method**: for every resource (CPU, memory, disk, network, locks) check **U**tilization, **S**aturation, and **E**rrors. It is useful when you do not yet know which resource is involved.

## 4. Which tool answers which question

| Question | First tool | Next step |
| --- | --- | --- |
| How long did it take, and was it busy? | `/usr/bin/time -v ./prog` | compare `real` with `user` + `sys` |
| Which threads are busy or switching? | `pidstat -t -u -w 1 -p <pid>` (sysstat) | [process and thread state](process-thread-ve-zamanlayici.md) |
| How many instructions, cycles, faults, and switches? | `perf stat ./prog` | [perf guide](perf-ile-yurutme.md) |
| Which functions consume CPU? | `perf record -g ./prog`, `perf report` | flame graph, `perf annotate` |
| Which system calls happen, and which fail? | `bpftrace` syscall one-liners, `perf trace -s` | [bpftrace from zero](bpftrace-temelleri.md) |
| How long does one function or syscall take? | bpftrace entry/return probes with a histogram | [function probe lab](../laboratuvarlar/fonksiyon-problari.md) |
| Why is a thread not running? | off-CPU analysis with `sched_switch` | [scheduler timelines](zamanlayici-izleri.md) |
| What is the program doing *right now*, frozen? | `gdb -p <pid>` with `thread apply all bt` | [debugging playbook](debug-is-akisi.md) |

`strace` and GDB use `ptrace`, which stops the target for every event; they are excellent for correctness questions and costly for timing questions. `perf` and `bpftrace` collect data inside the kernel without stopping the process for each event, which usually makes them better suited for measuring time.

## 5. Preparing a Linux machine

The laboratories assume a native Linux machine or a virtual machine you control. Containers and some cloud VMs hide hardware counters or block tracing; the tools then report `<not supported>` or permission errors. Treat those as *unavailable measurements*, never as zero.

### Install the tools

```bash
# Debian
sudo apt install linux-perf bpftrace sysstat gdb build-essential

# Ubuntu (perf comes from the kernel-specific linux-tools package)
sudo apt install linux-tools-common "linux-tools-$(uname -r)" bpftrace sysstat gdb build-essential

# Fedora / RHEL family
sudo dnf install perf bpftrace sysstat gdb gcc
```

Package names vary between releases; search your distribution's package index if one is missing. Ubuntu's `perf` must match the running kernel, which is why the package name contains `$(uname -r)`.

### Record versions first

```bash
uname -r
perf --version
bpftrace --version
sudo bpftrace --info 2>&1 | head -n 40
lscpu | head -n 20
```

`bpftrace --info` lists kernel features, such as BTF and uprobe support. Save this output next to your results.

### Permissions

perf access for unprivileged users is controlled by `/proc/sys/kernel/perf_event_paranoid`; higher values allow less. bpftrace needs root or the BPF capabilities (`CAP_BPF`, `CAP_PERFMON`, and for some probes `CAP_SYS_ADMIN`). Read the values before deciding how to run:

```bash
cat /proc/sys/kernel/perf_event_paranoid
cat /proc/sys/kernel/kptr_restrict
```

On a disposable lab machine the simplest approach is to run the measuring tool with `sudo`. Lowering `perf_event_paranoid` system-wide changes security policy for every user; do not do it on a shared or production machine. The [Linux perf security document](https://docs.kernel.org/admin-guide/perf-security.html) explains each level. If kernel symbols appear as `[unknown]` or zero addresses, `kptr_restrict` or missing privileges are the usual reason.

### Build programs so that tools can explain them

Profilers report addresses; turning addresses into function names and stacks needs help from the build:

- `-g` keeps debug information (DWARF) so tools can name functions, source lines, and inlined code.
- `-fno-omit-frame-pointer` keeps the frame-pointer chain, the cheapest and most reliable way for `perf` and bpftrace to walk user stacks.
- `-O2` keeps the build realistic. Profiling an `-O0` build measures code you will not ship. The [compiler differences lab](../laboratuvarlar/derleme-farklari.md) shows how much the code changes.
- `__attribute__((noinline))` or a non-`static` function keeps a separate symbol that a uprobe can attach to. The laboratories use it on purpose; real programs may inline small functions, leaving no entry to probe.

System libraries may lack frame pointers or local debug information. Many distributions provide separate debug packages or a `debuginfod` server; see [debug information](../laboratuvarlar/debug-bilgisi.md) for how tools find them.

## 6. Your first sixty seconds with a slow program

Run the program once under `time`, preferably GNU time with `-v` for extra counters:

```bash
/usr/bin/time -v ./prog 2> time.txt
grep -E 'Elapsed|User time|System time|Percent of CPU|context switches|page faults' time.txt
```

Read the result in this order:

1. **Elapsed** versus **User + System**. Roughly equal for a single-threaded program: on-CPU, continue with `perf record`. Much smaller: off-CPU, continue with system calls, locks, and scheduler events.
2. **System time**. High system time means the CPU was busy in the kernel on the program's behalf: many system calls, page faults, or copying data.
3. **Voluntary context switches** count the times a thread gave up the CPU because it had to wait (sleep, I/O, lock). **Involuntary** switches count the times the scheduler took the CPU away, which suggests CPU competition.
4. **Page faults**. Many *major* faults mean data was read from disk to satisfy memory accesses.

`perf stat` gives a similar first look with hardware counters, and works on a running process too:

```bash
perf stat ./prog
sudo perf stat -p <pid> -- sleep 10      # attach to a running process for 10 s
```

`task-clock` with "CPUs utilized" near 1.0 means one CPU was busy for the whole run; near 0.05 means the program mostly waited. The [CPU profiling lab](../laboratuvarlar/cpu-profili.md) walks through the remaining fields.

## 7. Common beginner mistakes

- **Profiling once.** Repeat runs and report the spread. `perf stat -r 5` repeats a command and prints the variation.
- **Profiling the wrong build.** Debug builds without optimization have different hotspots.
- **Reading a CPU profile for a waiting program.** A sampling profiler sees nothing while threads sleep. If the program is mostly off-CPU, its CPU profile describes the small busy part, not the slowness.
- **Trusting `[unknown]` frames.** Missing symbols or broken stacks are a measurement problem to fix, not a function to optimize.
- **Treating "no event" as "did not happen".** A probe may have attached late, events may have been dropped, or sampling may have missed it. Check counts against something you know, such as the number of requests you sent.
- **Changing several things at once.** Change one variable, measure again, keep the old result.

## Where to go next

Follow the runtime route in order; each page reuses vocabulary from the previous one:

1. [Process, thread, and scheduler state](process-thread-ve-zamanlayici.md): what a PID and TID are, and which counters the kernel keeps.
2. [Execution analysis with perf](perf-ile-yurutme.md), then the hands-on [CPU profiling and flame graph lab](../laboratuvarlar/cpu-profili.md).
3. [bpftrace from zero](bpftrace-temelleri.md), then the [first bpftrace lab](../laboratuvarlar/bpftrace-ilk-adimlar.md).
4. [Debugging slow, stuck, and failing programs](debug-is-akisi.md), then the [off-CPU diagnosis lab](../laboratuvarlar/yavas-program-teshisi.md).
5. The deeper timing material: [runtime latency](calisma-zamani-gecikmesi.md), [timing and waiting lab](../laboratuvarlar/zamanlama-ve-bekleme.md), and [scheduler timelines](zamanlayici-izleri.md).

## Sources

- [Brendan Gregg: The USE Method](https://www.brendangregg.com/usemethod.html)
- [Brendan Gregg: Linux Performance](https://www.brendangregg.com/linuxperf.html)
- [perf-stat(1) manual](https://man7.org/linux/man-pages/man1/perf-stat.1.html)
- [time(1) manual](https://man7.org/linux/man-pages/man1/time.1.html)
- [pidstat(1) manual](https://man7.org/linux/man-pages/man1/pidstat.1.html)
- [Linux kernel: perf events and tool security](https://docs.kernel.org/admin-guide/perf-security.html)
- [bpftrace installation notes](https://github.com/bpftrace/bpftrace/blob/master/INSTALL.md)
