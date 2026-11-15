---
title: Sampling thread counters without scheduler tracing
language: Python
---

# Sampling thread counters without scheduler tracing

Take two snapshots of one Linux thread's counters and subtract them. You will learn what the thread did during a short observation window, without attaching a tracer or changing its scheduling policy.

The main lesson is also about missing information: **an unavailable waiting counter is not a measured zero**.

## Before you start

Use Linux procfs, Python 3.7 or newer, and read access to your own lab process. Procfs is the information filesystem mounted at `/proc`.

Build `timing_lab` by completing the setup in [timing and waiting](zamanlama-ve-bekleme.md). You need its executable, but do not need to repeat all its timing comparisons. The [process and thread guide](../rehberler/process-thread-ve-zamanlayici.md) explains PID, TID, and scheduler state if those terms are new.

Download [sample_thread.py](../labs/thread-observation/sample_thread.py) **before launching the target**. It is already in `examples/thread-observation` if you have the checkout.

## 1. Select the reader and check the files

Open a terminal in the timing lab's working directory—the one containing `build/timing_lab` and `results/`. In a checkout, this is `examples/runtime-timing`.

Choose the reader path that matches your setup. For the checkout layout:

```bash
LAB_SAMPLER=../thread-observation/sample_thread.py
```

If you downloaded the reader into the current working directory instead, use:

```bash
LAB_SAMPLER=./sample_thread.py
```

Then check both files:

```bash
ls ./build/timing_lab "$LAB_SAMPLER"
mkdir -p results
```

**Check before continuing:** both paths should exist. `LAB_SAMPLER` is just a shell variable holding the reader's location; the next commands use that path.

## 2. Launch, sample, and wait in one block

Run this whole block in the same terminal so the short-lived target remains alive during sampling:

```bash
./build/timing_lab sleep 100 50 results/thread-sleep.csv &
LAB_PID=$!
LAB_TID=$LAB_PID
ps -L -p "$LAB_PID" -o pid,tid,stat,psr,cls,rtprio,pri,wchan
python3 "$LAB_SAMPLER" "$LAB_PID" "$LAB_TID" --interval 0.25 > results/thread-sample.json
wait "$LAB_PID"
```

The `&` starts the target in the background. `$!` gives the PID of the process you just launched. This particular program does its work in its main thread, so its TID equals its PID. That shortcut does not apply to an arbitrary worker in another application.

`ps` lists the task. The reader then takes a snapshot, waits about a quarter second, and takes another snapshot. Its JSON goes into `results/thread-sample.json`, so a quiet terminal is normal. `wait` lets the finite target finish; the whole block usually takes about five seconds.

## 3. Open the result and check its status

```bash
cat results/thread-sample.json
```

Start with `status`:

- `measured` means the reader obtained two usable snapshots for the task it checked.
- `unavailable` means the observation failed. Read `reason`; do not turn missing data into zero activity.

For a measured result, look at `sample_interval_ns`, `runtime_ns`, and `runqueue_status` before reading the full endpoint records. A nanosecond is one billionth of a second; **1,000,000 ns = 1 ms**.

## 4. Interpret CPU activity and waiting separately

`runtime_ns` is the change in the task's CPU execution counter. `sample_interval_ns` is the actual interval between the reader's sampling timestamps. It can be longer than the requested quarter second.

`timeslices` is the raw change in the third scheduler counter. The `before` and `after` objects preserve both original readings, so you can inspect what was subtracted.

For runqueue waiting, two outcomes are possible:

- With `runqueue_status: enabled-at-endpoints`, `runqueue_wait_ns` contains the counter difference. It describes aggregate runnable waiting during the window.
- With `runqueue_status: disabled-or-unknown`, `runqueue_wait_ns` is JSON `null`. The kernel did not provide enough collection-status information for the reader to interpret that wait counter.

**Your checkpoint:** explain the difference between a numeric zero and `null`. A successful CPU-counter sample can coexist with unavailable wait accounting.

The sampler reads `/proc/sys/kernel/sched_schedstats` where available; it never enables it. Even enabled readings at both ends cannot rule out someone changing the setting in between.

## 5. Optional: compare a busy target

Keep `LAB_SAMPLER` set and run a new process, using different output files:

```bash
./build/timing_lab busy 100 50 results/thread-busy.csv &
LAB_PID=$!
LAB_TID=$LAB_PID
python3 "$LAB_SAMPLER" "$LAB_PID" "$LAB_TID" --interval 0.25 > results/thread-busy-sample.json
wait "$LAB_PID"
cat results/thread-busy-sample.json
```

Busy mode will usually consume more CPU during comparable windows than sleep mode. Do not demand a fixed ratio: the sampler's window can overlap different parts of the periodic workload, and system load varies. Each run has a new PID/TID, which the block obtains afresh.

## If sampling fails

**The executable or reader is missing:** recheck `pwd` and both paths from step 1. Build the target first and select the correct reader location.

**The process disappears:** run the launch-and-sample block again. Do not reuse a PID after its process has ended, and do not pause between launching the finite target and sampling it.

**Permission is denied or procfs data is absent:** keep the unavailable result and its reason. This lab does not require changing system-wide permissions or enabling tracing.

**The reader reports a changed identity or decreasing counter:** do not subtract those samples. They are not a valid comparison window.

## What the two snapshots cannot tell you

The reader checks process and thread start times as well as numeric IDs. Start times have tick resolution and procfs reads are not atomic, so this is a diagnostic identity check rather than a perfect lifetime guarantee. Names containing spaces or parentheses are handled by the supplied reader; a simple whitespace split of the whole `stat` line would get its fields wrong.

Cumulative counter changes do not give the maximum delay of one function call. Likewise, subtracting CPU runtime from this sampling interval is not a precise off-CPU measurement: clock and counter reads happen at different instants.

For individual events, use the [event correlation lab](olay-akisini-eslestirme.md) and, when justified, the [runtime tracing guide](../rehberler/calisma-zamani-gecikmesi.md). A task counter can narrow a question without proving that one message spent its entire delay waiting for a CPU.

## Keep your evidence and repeat the check

Save the raw JSON, source/executable identities, PID/TID, kernel, and collection flag with your notes. Explain whether runnable waiting was measured or unavailable.

From the **repository root**, `python3 scripts/verify-debugging-labs.py --require-linux` tests the reader against a finite live child. Synthetic fixtures check disabled accounting, identity changes, reversed counters, and parenthesized task names. The [validation record](../labs/event-pipeline/validation.txt) distinguishes those checks from perf/BPF execution.

## Sources

- [Kernel scheduler statistics](https://docs.kernel.org/scheduler/sched-stats.html) defines the three cumulative counters.
- [Linux proc_pid_task](https://man7.org/linux/man-pages/man5/proc_pid_task.5.html) defines task paths.
- [Linux proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) defines start-time fields and their resolution.
