---
title: Reading scheduler timelines and version-dependent reports
---

# Reading scheduler timelines and version-dependent reports

An application marker says where a thread observed progress. A scheduler trace says when a task became runnable, left a CPU, or started running. Connect them by task identity and an explicit time relationship. A long worker-entry interval alone does not identify a scheduler delay.

Begin with [process and thread state](process-thread-ve-zamanlayici.md), then complete the [scheduler timeline laboratory](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md) to collect events and calculate one interval yourself.

## 1. Distinguish three event boundaries

`sched_switch` names the outgoing task in `prev_pid` and incoming task in `next_pid`. These fields identify tasks (TIDs), despite the `pid` suffix. `sched_wakeup` names a task becoming runnable; it does not mean the task immediately ran. The event's emitting task is not necessarily the task being woken.

For a sleeping task, the interval from switch-out to its next switch-in includes blocked time followed by runnable waiting. The interval from a matching wakeup to switch-in estimates the runnable part, provided the relevant events are present and the wakeup actually begins that runnable interval.

A preempted runnable task can switch out and later return without a new wakeup. Its runnable wait starts at switch-out. Therefore, pairing every switch-in only with a wakeup loses a class of waits. Distinguish these cases using the recorded switch-out state and the target kernel's tracepoint definition.

Inspect the `sched_switch/format` and `sched_wakeup/format` files under the active tracefs mount. Use the [lab's discovery commands](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md#1-record-the-tool-and-tracepoint-contract) rather than assuming a universal numeric `prev_state` mask. Human-readable `perf script` output and a bpftrace numeric field are different representations.

## 2. Read perf's columns with their scope

`perf sched timehist` labels **wait time**, **sch delay**, and **run time**. The [Linux v6.12 perf documentation](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt) defines wait time from switch-out to the following switch-in and scheduling delay from runnable to running. Scheduling delay belongs inside that wait interval; adding both double-counts time. A displayed run-time value refers to the tool's reconstructed running interval, not a C++ function's entry/return boundary.

`perf sched latency` summarizes scheduling delays by task. Its average and maximum are not maximum function duration. Some views merge tasks sharing a name; retain numeric identity and check the installed subcommand's help. `perf sched map` shows CPU/task occupancy and helps examine neighbors during a delay; it cannot name the application statement that caused it.

Save the capture header and raw decoded events alongside the report. An incomplete interval at the start or end of recording, or lost records in between, can prevent reconstruction. An empty report or unavailable tracepoint is not a measured zero.

## 3. Treat analyzer version as part of the experiment

The running kernel produces tracepoint records; the installed perf binary reconstructs intervals. Both matter, and their version strings need not match. Distribution backports can change analysis without changing the upstream version number you expected.

The upstream [timehist change d363c2a](https://github.com/torvalds/linux/commit/d363c2a880c611eea3d754a618b6125bac7f3044) adds scheduling-delay accounting for tasks switched out while still running/runnable. Earlier logic used wakeup timestamps and could miss this preemption case. When comparing captures, record the perf package/build and determine whether this behavior is included. A different scheduling-delay column can reflect changed reconstruction rather than a changed workload.

For a suspected discrepancy, find one outgoing runnable switch, the later incoming switch for the same TID, and any intervening wakeups. Calculate the difference from the raw events. Compare that particular interval to the report before comparing aggregate distributions. If event loss or ambiguous pairing prevents this calculation, report that limitation.

## 4. Connect application and scheduler evidence carefully

Keep run ID, TID, sequence, executable identity, capture boundaries, and clock selection. The C++ standard does not promise that `steady_clock` shares an epoch with a kernel trace clock. Do not subtract absolute timestamps from the two streams until you have verified their relationship on the target. Short calibration markers can establish a relationship and expose offset/drift; timestamps printed with many digits alone cannot.

A controlled source delay can shift all later work while the consumer remains promptly scheduled. Conversely, a consumer can wait runnable after work arrives. Use the [six-marker event lab](../laboratuvarlar/olay-akisini-eslestirme.md) to locate the application interval, and scheduler records to investigate the task during that interval. The two kinds of evidence answer different parts of the question.

## 5. Keep the capture narrow and reproducible

Start with a finite ordinary-policy workload, a short recording, and no callchain collection. Record CPU availability, affinity, kernel/perf versions, trace clock, exact command, raw file, lost-event diagnostics, and the matching application output. A system-wide scheduler capture is useful because wakeups can originate elsewhere; filtering the final report by the actual TID is safer than dropping necessary context at collection time.

A larger buffer can reduce some losses but does not repair an already incomplete trace. If tracing changes behavior or hangs the machine, follow [tracing instability](izleme-donmalari.md) before increasing capture complexity.
