---
title: Reading a scheduler timeline one transition at a time
language: Bash
---

# Reading a scheduler timeline one transition at a time

Observe a task leaving and returning to a CPU, then distinguish its whole off-CPU interval from the part spent runnable. You will inspect raw events and perform subtraction yourself before reading perf's summary.

## Before you start

Use 64-bit Linux, Bash, tracefs, a kernel-compatible perf installation with scheduler tracepoints, and tracing permission. The optional BPF observation needs bpftrace 0.21 or a compatible newer version. A program being installed does not establish kernel support. If permissions or events are unavailable, preserve the error and stop that capture; an empty file cannot establish zero waiting.

Finish the [timing lab](zamanlama-ve-bekleme.md) and run the following commands from its directory, where `build/timing_lab` exists. Keep its ordinary scheduling policy. The [scheduler guide](../rehberler/zamanlayici-izleri.md) explains version-dependent reconstruction; [tracing failures](../rehberler/izleme-donmalari.md) covers recovery evidence for an affected host.

## 1. Record the tool and tracepoint contract

```bash
mkdir -p results/scheduler
uname -a > results/scheduler/kernel.txt
perf --version > results/scheduler/perf-version.txt
perf list 'sched:*' > results/scheduler/events.txt
cat results/scheduler/events.txt
```

`perf list` describes available scheduler events. Check for `sched_switch` and wakeup events. Save the package/build identity as well if your distribution backports perf changes. Locate the existing tracefs mount:

```bash
findmnt -t tracefs
LAB_TRACEFS=/sys/kernel/tracing
if [ ! -r "$LAB_TRACEFS/events/sched/sched_switch/format" ]; then
    LAB_TRACEFS=/sys/kernel/debug/tracing
fi
sudo cat "$LAB_TRACEFS/events/sched/sched_switch/format" > results/scheduler/switch-format.txt
sudo cat "$LAB_TRACEFS/events/sched/sched_wakeup/format" > results/scheduler/wakeup-format.txt
cat results/scheduler/switch-format.txt
cat results/scheduler/wakeup-format.txt
```

If `findmnt` reports another mountpoint, set `LAB_TRACEFS` to it instead. No mount or readable format is a failed prerequisite. These commands read definitions; they do not enable tracefs events. Inspect `prev_pid`, `next_pid`, `prev_state`, and the wakeup task's `pid`. The format's print expression helps explain state labels; do not copy a numeric state mask from an unrelated kernel.

## 2. Optional: measure one switch-out/switch-in pair with BPF

This preliminary observation uses a child `sleep` whose PID is also its sole TID. Launch it in the current Bash terminal:

```bash
sleep 60 &
LAB_TASK=$!
printf 'owned sleep task: %s\n' "$LAB_TASK"
ps -L -p "$LAB_TASK" -o pid,tid,stat,args
```

Write the whole probe so its measurement is visible:

```bash
cat > results/scheduler/offcpu.bt <<'EOF_BT'
tracepoint:sched:sched_switch
/args->prev_pid == $1/
{
    @out[args->prev_pid] = nsecs(monotonic);
}
tracepoint:sched:sched_switch
/args->next_pid == $1 && @out[args->next_pid]/
{
    $in = nsecs(monotonic);
    printf("tid=%d out_ns=%llu in_ns=%llu offcpu_ns=%llu\n",
           args->next_pid, @out[args->next_pid], $in,
           $in - @out[args->next_pid]);
    delete(@out[args->next_pid]);
    exit();
}
END { clear(@out); }
EOF_BT
cat results/scheduler/offcpu.bt
```

The first predicate records when the requested TID leaves a CPU. The second requires that same TID to return and have a saved outgoing timestamp. `printf` exposes both endpoints and their difference. `delete` completes the pair; `exit()` ends the tracer after this one result. `$1` is bpftrace's first positional argument, supplied next. The quoted here-document preserves BPF variables without Bash expansion.

In a **second terminal**, run the capture with the printed numeric TID, replacing `12345`:

```bash
sudo bpftrace results/scheduler/offcpu.bt 12345
```

Use the same working directory. Wait until it reports that probes are attached. In the original terminal, stop the owned task briefly and resume it:

```bash
kill -STOP "$LAB_TASK"
sleep 0.1
kill -CONT "$LAB_TASK"
wait "$LAB_TASK"
```

Stopping and resuming intentionally creates state transitions for your own finite child. Depending on attachment and signal handling, the observed complete pair can include a different transition than you expected. Inspect the actual timestamps; if no complete pair occurs, stop bpftrace with Ctrl-C. Do not invent an endpoint for the initial sleep that began before attachment. The child eventually exits normally.

This difference is an **off-CPU** duration. Neither probe records when the task became runnable, so the output cannot divide the wait into blocked and runnable components. This is why subtracting two switch timestamps alone is insufficient for a scheduler-delay claim.

## 3. Record a short perf scheduler trace

Run a finite workload under a system-wide scheduler capture:

```bash
sudo perf sched record -a -o results/scheduler/sched.data -- ./build/timing_lab sleep 10 100 results/scheduler/application.csv
```

`-a` keeps events from other tasks and CPUs, including tasks that wake the worker. `-o` keeps this run separate from other perf captures. There is no stack collection here. The command following `--` performs ten calls and writes application records after work completes. When launched through `sudo perf`, the workload also runs with those privileges; use only this trusted lab executable.

Read the application identity and verify the recording before reporting:

```bash
head -n 6 results/scheduler/application.csv
LAB_TID=$(awk -F, '$5 == "WORK_ENTER" { print $4; exit }' results/scheduler/application.csv)
printf 'recorded worker TID: %s\n' "$LAB_TID"
sudo perf script -i results/scheduler/sched.data --header > results/scheduler/capture-header.txt
sudo perf script -i results/scheduler/sched.data --ns > results/scheduler/events.txt
less results/scheduler/capture-header.txt
less results/scheduler/events.txt
```

The fourth CSV field supplies this run's actual TID. Search for it in `less`, then inspect the surrounding scheduler events. `--ns` requests nanosecond timestamp display; it does not improve the original timestamp accuracy. Preserve stderr and lost-event warnings from record/decode. The printed task before a tracepoint is its emitter; read the event's target fields to identify the outgoing, incoming, or woken task. Output formatting varies by perf version, so do not assume a fixed `grep prev_pid=...` layout.

## 4. Calculate a sleeping task's wait from raw boundaries

Find a complete interval for the same TID: switch-out into a sleeping state, wakeup making it runnable, and its next switch-in. Check surrounding events for intervening transitions, migration, task exit, and loss. If the interval is incomplete, choose another complete interval or report it unavailable.

For practice, these are **illustrative relative timestamps**, not output from your machine: switch-out at 1,000,000 ns, wakeup at 81,000,000 ns, and switch-in at 84,000,000 ns. Enter them and do the arithmetic:

```bash
LAB_OUT_NS=1000000
LAB_WAKE_NS=81000000
LAB_IN_NS=84000000
LAB_OFFCPU_NS=$((LAB_IN_NS - LAB_OUT_NS))
LAB_BLOCKED_NS=$((LAB_WAKE_NS - LAB_OUT_NS))
LAB_RUNNABLE_NS=$((LAB_IN_NS - LAB_WAKE_NS))
printf 'off CPU: %s ns\n' "$LAB_OFFCPU_NS"
printf 'blocked: %s ns\n' "$LAB_BLOCKED_NS"
printf 'runnable: %s ns\n' "$LAB_RUNNABLE_NS"
printf 'parts: %s ns\n' "$((LAB_BLOCKED_NS + LAB_RUNNABLE_NS))"
```

The results are 83 ms off CPU, 80 ms blocked, and 3 ms runnable. The parts sum to the whole.

For a verified complete triple from your own trace, copy each event's decimal timestamp into a variable. The values below represent the same illustrative example; replace all three with your chosen raw event timestamps:

```bash
LAB_OUT_S=0.001000000
LAB_WAKE_S=0.081000000
LAB_IN_S=0.084000000
```

With `perf script --ns`, confirm that each fractional part has nine decimal digits. If your display has fewer digits, pad on the right to nanoseconds before continuing. Split seconds and fractional nanoseconds, then combine them as integers:

```bash
LAB_OUT_NS=$((10#${LAB_OUT_S%.*} * 1000000000 + 10#${LAB_OUT_S#*.}))
LAB_WAKE_NS=$((10#${LAB_WAKE_S%.*} * 1000000000 + 10#${LAB_WAKE_S#*.}))
LAB_IN_NS=$((10#${LAB_IN_S%.*} * 1000000000 + 10#${LAB_IN_S#*.}))
printf 'out=%s wake=%s in=%s ns\n' "$LAB_OUT_NS" "$LAB_WAKE_NS" "$LAB_IN_NS"
```

`${value%.*}` removes the decimal point and fraction; `${value#*.}` removes the seconds and point. `10#` tells Bash to read digits in base ten, including fractions beginning with zero. Multiplication converts seconds to nanoseconds. Repeat the subtraction commands above with these three integers. Keep the original event lines beside the result; verify event identity and ordering before arithmetic. Do not use floating-point subtraction on large absolute timestamps or substitute application clock values.

A task switched out while still runnable needs a different pairing: switch-out to switch-in can itself be runnable waiting, even without another wakeup. Check the state and relevant event history. A wakeup-only calculation misses this case.

## 5. Compare the calculation with perf's interpretation

```bash
sudo perf sched timehist -i results/scheduler/sched.data --tid "$LAB_TID"
sudo perf sched latency -i results/scheduler/sched.data
sudo perf sched map -i results/scheduler/sched.data
```

Consult `perf sched timehist -h` if your installed version does not accept this TID-filter option. Compare the particular interval you calculated to `timehist`, rather than equating a whole-run average to it. **Wait time** includes the off-CPU interval; **sch delay** describes the runnable part reconstructed by this analyzer. Do not add these columns. `latency` summarizes task delays; `map` helps inspect which tasks occupied CPUs nearby.

A report discrepancy can come from event loss, a boundary interval, incorrect identity, or analyzer behavior. The [version discussion](../rehberler/zamanlayici-izleri.md#3-treat-analyzer-version-as-part-of-the-experiment) explains the preemption-accounting change to check. A state sampled with `ps` after recording cannot repair missing historical events.

## What to retain and explain

Keep kernel/perf versions and package identity, tracepoint formats, the exact capture command, application CSV, perf data, decoded events, diagnostics, and one manually paired interval. Explain why off-CPU time is not automatically runnable delay, why a preempted task may have no wakeup, and why absolute C++ and kernel timestamps require clock validation before cross-stream subtraction.

## Sources

- [Linux v6.12 perf sched documentation](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt) defines the report views.
- [Linux trace event formats](https://docs.kernel.org/trace/events.html) explains the tracefs format files.
- [bpftrace 0.21](https://bpftrace.org/docs/0.21) documents tracepoint arguments, positional parameters, clocks, and `exit()`.
