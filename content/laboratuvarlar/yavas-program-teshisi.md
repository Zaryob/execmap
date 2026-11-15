---
title: Diagnosing a slow program that barely uses the CPU
language: C
---

# Diagnosing a slow program that barely uses the CPU

A program takes three seconds for work that should take a tenth of a second, yet the CPU is almost idle. A CPU profile will not explain it, because the time is spent **waiting**. In this lab you will prove that the program is off-CPU, find out which thread waits and for what, identify the thread that causes the wait, confirm it with a debugger snapshot, and verify a fix.

This is the most common shape of a real performance bug in multi-threaded code: one thread holds a lock while doing something slow, and everyone else queues behind it. You will diagnose it as if you could not read the source, and only then look at the line responsible.

## Before you start

You need Linux, GCC or Clang with POSIX threads, `perf`, **bpftrace 0.21 or newer** (0.19+ for the `args.` syntax), and GDB. Complete the [first bpftrace lab](bpftrace-ilk-adimlar.md) first; this lab assumes its techniques. The [debugging playbook](../rehberler/debug-is-akisi.md) explains each decision taken here in general form.

```bash
mkdir -p offcpu-diagnosis && cd offcpu-diagnosis
{ uname -r; perf --version; bpftrace --version; gdb --version | head -n 1; ldd --version | head -n 1; } | tee env.txt
```

## 1. The program

Save this as `slowjobs.c`. Read only `main` for now: it starts a background thread, then computes and records 200 jobs.

```c slowjobs.c
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static pthread_mutex_t table_lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned long table[64];
static atomic_int done;
static int fixed_mode;

static void sleep_ms(long ms) {
    struct timespec ts = { ms / 1000, (ms % 1000) * 1000000L };
    nanosleep(&ts, NULL);
}

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

/* Background thread: copies the table and "writes it out" (simulated by a 30 ms sleep). */
__attribute__((noinline)) unsigned long flush_table(void) {
    unsigned long snapshot[64], total = 0;
    pthread_mutex_lock(&table_lock);
    memcpy(snapshot, table, sizeof snapshot);
    if (!fixed_mode)
        sleep_ms(30); /* BUG: the slow step runs while the lock is held */
    pthread_mutex_unlock(&table_lock);
    if (fixed_mode)
        sleep_ms(30); /* FIX: the slow step runs after the lock is released */
    for (int i = 0; i < 64; i++)
        total += snapshot[i];
    return total;
}

static void *flusher(void *arg) {
    (void)arg;
    while (!atomic_load(&done)) {
        flush_table();
        sleep_ms(1);
    }
    return NULL;
}

/* Roughly half a millisecond of arithmetic per job. */
__attribute__((noinline)) unsigned long compute_job(int id) {
    unsigned long h = (unsigned long)id;
    for (int i = 0; i < 400000; i++)
        h = h * 6364136223846793005UL + 1442695040888963407UL;
    return h >> 60;
}

__attribute__((noinline)) void record_job(int id, unsigned long value) {
    pthread_mutex_lock(&table_lock);
    table[id % 64] += value;
    pthread_mutex_unlock(&table_lock);
}

int main(int argc, char **argv) {
    int jobs = argc > 1 ? atoi(argv[1]) : 200;
    fixed_mode = argc > 2 && strcmp(argv[2], "fixed") == 0;
    unsigned long sum = 0;
    pthread_t thread;
    if (jobs <= 0 || pthread_create(&thread, NULL, flusher, NULL) != 0) {
        fprintf(stderr, "usage: %s [jobs>0] [slow|fixed]\n", argv[0]);
        return 2;
    }
    double start = now_ms();
    for (int i = 0; i < jobs; i++) {
        unsigned long value = compute_job(i);
        record_job(i, value);
        sum += value;
    }
    double elapsed = now_ms() - start;
    atomic_store(&done, 1);
    pthread_join(thread, NULL);
    printf("mode=%s jobs=%d sum=%lu elapsed=%.0fms\n", fixed_mode ? "fixed" : "slow", jobs, sum, elapsed);
    return 0;
}
```

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer -pthread slowjobs.c -o slowjobs
BIN=$(readlink -f ./slowjobs)
```

## 2. Is it running or waiting?

```bash
time ./slowjobs
```

Shape of the result from a reference run on a different machine:

```text
mode=slow jobs=200 sum=1480 elapsed=2851ms
real    0m3.08s
user    0m0.14s
sys     0m0.01s
```

`sum=1480` is the correctness check and must not change later. The important comparison is `real` against `user + sys`: about 3 s elapsed but only 0.15 s of CPU. More than 95 % of the time, no thread of this process was running. **This is an off-CPU problem.**

`perf stat` says the same with different words:

```bash
perf stat -e task-clock,context-switches,cpu-migrations ./slowjobs
```

Expect `CPUs utilized` around 0.05 and a few hundred context switches. Each voluntary switch is a moment when a thread stopped because it had to wait.

## 3. See why a CPU profile is the wrong tool here

```bash
perf record -F 999 -g -o cpu.data ./slowjobs
perf report -i cpu.data --stdio --no-children | head -n 20
```

The report is dominated by `compute_job`. That is accurate: during the few moments the CPU was busy, it was computing. But fixing `compute_job` could save at most the 0.15 s of CPU time; the other 2.9 s are invisible to sampling. Keep this report as a reminder: **a CPU profile answers "where does CPU time go", not "where does elapsed time go"**.

## 4. Which threads wait, and in which system call?

A thread that waits usually waits inside a system call. Sum the time each thread spends in the two candidates that a quick `perf trace -s ./slowjobs` or the syscall count from the previous lab would point to, `futex` and `clock_nanosleep`:

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:syscalls:sys_enter_futex,
tracepoint:syscalls:sys_enter_clock_nanosleep
/pid == cpid/ { @start[tid] = nsecs; }

tracepoint:syscalls:sys_exit_futex,
tracepoint:syscalls:sys_exit_clock_nanosleep
/pid == cpid && @start[tid]/ {
    @ms[tid, probe] = sum((nsecs - @start[tid]) / 1000000);
    @calls[tid, probe] = count();
    delete(@start[tid]);
}
END { clear(@start); }'
```

Expected shape (TIDs will differ; the main thread's TID equals the process ID):

```text
@ms[<main tid>, tracepoint:syscalls:sys_exit_futex]: ~2800
@ms[<other tid>, tracepoint:syscalls:sys_exit_clock_nanosleep]: ~3000
```

Two threads, two different kinds of waiting:

- The **main thread** spends nearly all of its elapsed time in `futex`. In a program that uses `pthread_mutex_lock`, a long `futex` wait means "waiting for a lock somebody else holds".
- The **other thread** spends its time in `clock_nanosleep`, a deliberate sleep. Sleeping by itself is harmless; the question is whether it sleeps *while holding the lock the main thread needs*.

You now have a hypothesis to test. The second thread also makes a few short `futex` calls; those are wake-ups it sends after unlocking.

## 5. Which code path waits?

System calls show *that* the main thread waits; uprobes on the program's own functions show *where*. Time `record_job`, and count how many `futex` waits happen inside it:

```bash
sudo bpftrace -c "$BIN" -e "
uprobe:$BIN:record_job /pid == cpid/ { @in[tid] = nsecs; }
uretprobe:$BIN:record_job /pid == cpid && @in[tid]/ {
    @record_job_ms = hist((nsecs - @in[tid]) / 1000000);
    delete(@in[tid]);
}
tracepoint:syscalls:sys_enter_futex /pid == cpid && @in[tid]/ { @futex_inside_record_job = count(); }
END { clear(@in); }"
```

Expected: `@record_job_ms` has two clusters: calls that got the lock at once land in bucket `[0]`, and calls that arrived while the lock was held land mostly in `[16, 32)`, waiting for most of a flush. Updating one array element cannot take 30 ms of CPU; those calls waited. `@futex_inside_record_job` is non-zero, connecting the futex time from step 4 to this function. Run the same probe on `compute_job` and you will find a single tight cluster: it never waits.

## 6. Who holds the lock, and what is it doing?

Print a short timeline of lock operations and sleeps for both threads. `pthread_mutex_lock` and `pthread_mutex_unlock` live in the C library, so find its path first:

```bash
LIBC=$(ldd "$BIN" | awk '/libc\.so/ { print $3 }')
echo "$LIBC"
sudo bpftrace -l "uprobe:$LIBC:pthread_mutex_*lock"
```

On glibc 2.34 and newer these functions are in `libc.so.6`. On older systems they are in `libpthread.so.0`; use that path instead. Now trace 20 jobs so the output stays short:

```bash
sudo bpftrace -c "$BIN 20" -e "
uprobe:$LIBC:pthread_mutex_lock   /pid == cpid/ { printf(\"%8d us  tid %-7d lock    %p\n\",   elapsed / 1000, tid, arg0); }
uprobe:$LIBC:pthread_mutex_unlock /pid == cpid/ { printf(\"%8d us  tid %-7d unlock  %p\n\",   elapsed / 1000, tid, arg0); }
tracepoint:syscalls:sys_enter_clock_nanosleep /pid == cpid/ { printf(\"%8d us  tid %-7d sleep   begin\n\", elapsed / 1000, tid); }
tracepoint:syscalls:sys_exit_clock_nanosleep  /pid == cpid/ { printf(\"%8d us  tid %-7d sleep   end\n\",   elapsed / 1000, tid); }
tracepoint:syscalls:sys_enter_futex /pid == cpid/ { printf(\"%8d us  tid %-7d futex   begin\n\", elapsed / 1000, tid); }
tracepoint:syscalls:sys_exit_futex  /pid == cpid/ { printf(\"%8d us  tid %-7d futex   end\n\",   elapsed / 1000, tid); }" > timeline.txt
less timeline.txt
```

Look for a repeating pattern like this (illustrative, TIDs shortened):

```text
  101200 us  tid B  lock    0x5581…4040
  101210 us  tid B  sleep   begin
  101650 us  tid A  lock    0x5581…4040
  101660 us  tid A  futex   begin
  131300 us  tid B  sleep   end
  131310 us  tid B  unlock  0x5581…4040
  131320 us  tid B  futex   begin
  131330 us  tid B  futex   end
  131340 us  tid A  futex   end
```

Read it line by line: thread B takes the lock at address `…4040` and goes to sleep **without unlocking**. Thread A asks for the same address and waits in `futex`. Thirty milliseconds later B wakes up, unlocks, and its own short `futex` call wakes A. The address proves both threads use the same lock; the order proves the sleep happens inside the critical section. The hypothesis from step 4 is confirmed with direct evidence.

Note that `pthread_mutex_lock` is probed at entry: the "lock" line for A means A *asked* for the lock, not that it got it. An uncontended lock does not call `futex` at all, which is why many lock/unlock pairs appear without a futex line.

## 7. Confirm with a debugger snapshot

An independent tool should agree. Start the program in the background and take one snapshot of all threads while it is slow:

```bash
./slowjobs 400 &
sleep 1
sudo gdb -p $! -batch -ex 'thread apply all bt' > snapshot.txt 2>&1
wait
grep -E '^Thread|^#' snapshot.txt | head -n 30
```

GDB briefly stops the process to read its stacks, then detaches. Expect one thread inside the C library's lock-wait path called from `record_job`, and one in `clock_nanosleep` called from `sleep_ms` called from `flush_table`. A single snapshot can catch an unlucky moment, so take two or three before concluding. If attaching fails with a permission error, check `/proc/sys/kernel/yama/ptrace_scope` and use `sudo`.

## 8. Read the source, fix, and verify

Only now open `flush_table`. The 30 ms `sleep_ms` call, standing in for slow I/O such as writing a file, runs between `pthread_mutex_lock` and `pthread_mutex_unlock`. The data it needs was already copied to `snapshot`, so the slow step can run after unlocking. The program's `fixed` mode does exactly that:

```bash
time ./slowjobs 200 fixed
```

Expected: the same `sum=1480`, and elapsed time near the pure compute time (around 0.1 s in the reference run). Re-run the measurement from step 4 with `-c "$BIN 200 fixed"`:

- the main thread's `futex` time drops to near zero;
- the second thread still sleeps about as long as before, because sleeping was never the problem, sleeping **while holding the lock** was.

Re-run step 5 with the fixed binary as well: `@record_job_ms` collapses into the `[0]` bucket.

## 9. Optional: off-CPU time from the scheduler

System calls are one view of waiting; the scheduler is another. The `sched_switch` tracepoint records every time a thread leaves or gets a CPU:

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:sched:sched_switch /pid == cpid/ { @off[tid] = nsecs; }
tracepoint:sched:sched_switch /@off[args.next_pid]/ {
    @offcpu_ms[args.next_pid] = sum((nsecs - @off[args.next_pid]) / 1000000);
    delete(@off[args.next_pid]);
}
END { clear(@off); }'
```

The totals should be close to the system call times from step 4. They will not match exactly: off-CPU time also includes being runnable but not yet scheduled, and the syscall measurement includes a little on-CPU work inside the kernel. The [scheduler timeline lab](zamanlayici-zaman-cizelgesi.md) separates those parts.

## Diagnosis record

```text
Symptom:      200 jobs take ~3 s; expected ~0.1 s
Step 2:       real 3.1 s vs user+sys 0.15 s          → off-CPU
Step 3:       CPU profile: compute_job               → explains only the CPU part
Step 4:       main thread ~2.8 s in futex; flusher ~3 s in clock_nanosleep
Step 5:       record_job bimodal: <1 ms or 16–32 ms; futex waits inside it
Step 6:       flusher locks L, sleeps 30 ms, unlocks; main waits on the same L
Step 7:       gdb: main in lock wait from record_job; flusher in nanosleep from flush_table
Fix:          move the slow step after unlock
Verification: sum unchanged; elapsed ~0.1 s; main futex time ≈ 0
```

Every line is an observation from a named tool, and the conclusion rests on several independent ones. That is the standard the [trace interpretation guide](../rehberler/izleri-yorumlamak.md) asks for.

## Sources

- [futex(2)](https://man7.org/linux/man-pages/man2/futex.2.html) and [pthread_mutex_lock(3p)](https://man7.org/linux/man-pages/man3/pthread_mutex_lock.3p.html)
- [Brendan Gregg: Off-CPU Analysis](https://www.brendangregg.com/offcpuanalysis.html)
- [bpftrace manual](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [GDB: threads](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Threads.html)
- [Linux kernel: scheduler tracepoints and event tracing](https://docs.kernel.org/trace/events.html)
