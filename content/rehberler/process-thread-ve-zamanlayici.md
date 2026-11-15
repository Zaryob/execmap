---
title: Reading Linux process, thread, and scheduler state
---

# Reading Linux process, thread, and scheduler state

Before attaching a debugger or tracer, identify the task and the observation window. Linux schedules individual tasks; a process can contain several threads with different policies, affinities, and wait states. A process-wide utilization value cannot explain every thread's latency.

This guide uses the generic workloads from the [timing laboratory](../laboratuvarlar/zamanlama-ve-bekleme.md) and [event correlation laboratory](../laboratuvarlar/olay-akisini-eslestirme.md). No service name, fixed PID, or application framework is needed.

## 1. Distinguish identities and states

The thread-group leader's TID equals the process ID. Additional threads have their own TIDs. A debugger's thread number, an OS thread ID, a CPU number, and a thread name are different identifiers. Names can be truncated or shared and are unsuitable as unique correlation keys.

A running task currently executes on a CPU. A runnable task can execute when scheduled. A sleeping or blocked task awaits a timer, I/O, synchronization, or another condition. `ps` state `R` covers running/runnable, so a snapshot of `R` does not distinguish them. State `S` denotes interruptible sleep; `D` denotes uninterruptible sleep. A single state sample does not reveal the duration or cause of a past wait.

Consider a synthetic example: a task switches out at 0 ms, becomes runnable at 80 ms, and runs at 83 ms. Its off-CPU interval is 83 ms, with about 3 ms after becoming runnable. Treating all 83 ms as scheduler delay would include intentional waiting. These are illustrative values, not measurements.

## 2. Establish the exact target

When launching your own lab, retain `$!` immediately. For an existing process, `pgrep -af timing_lab` can locate candidates; inspect the full command, user, executable, and start time before choosing one. Process names alone do not establish identity.

With `LAB_PID` set to the actual process ID:

```bash
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu,cls,rtprio,pri,wchan
ls "/proc/$LAB_PID/task"
readlink "/proc/$LAB_PID/exe"
```

`PSR` is an observed processor, not the allowed CPU set. `%CPU` is a utilization statistic with the tool's time basis, not a latency record. `WCHAN` may hint at a kernel wait location; permissions, kernel configuration, or transient state can hide it. It does not identify the owner of a userspace mutex.

Select a real `LAB_TID` from this process's task directory:

```bash
cat "/proc/$LAB_PID/task/$LAB_TID/status"
cat "/proc/$LAB_PID/task/$LAB_TID/wchan"
cat "/proc/$LAB_PID/task/$LAB_TID/schedstat"
chrt -p "$LAB_TID"
taskset -pc "$LAB_TID"
```

These are observations. They do not change scheduling policy or affinity. A task can exit between commands, so preserve errors instead of substituting zero for missing data.

## 3. Read cumulative scheduler counters as deltas

Per-task `schedstat` exposes three counters: CPU execution nanoseconds, runqueue waiting nanoseconds, and a timeslice count. These are cumulative values. Subtract two snapshots for the same live task to describe an observation window. Do not compare different task lifetimes just because the TID is the same.

Read `/proc/sys/kernel/sched_schedstats` when available. Kernel configuration and whether statistics were enabled affect interpretation, especially a zero runqueue-wait value. Disabled or unknown collection does not establish zero waiting. Reading the flag at two endpoints also cannot exclude another process toggling it during the window.

The [thread counter laboratory](../laboratuvarlar/thread-sayaclari.md) supplies a reader that checks PID/TID start-time identities, retains raw samples, rejects counter decreases, and reports unsupported wait accounting explicitly. Start times have tick resolution and procfs reads are not atomic; this is a bounded diagnostic check, not a race-free process handle.

An increase in wait counters describes aggregate runnable waiting in the window. It does not give a per-invocation maximum or say which application statement was delayed. Align a longer observation with sequence-tagged application records, then use scheduler events when the question requires individual transitions.

## 4. Interpret policy and affinity separately

`SCHED_OTHER` uses scheduler priority zero. That is a policy convention, not a prediction that the task will never run. Real-time policies such as `SCHED_RR` and `SCHED_FIFO` use another priority scheme. The `PRI` column is the tool's display representation; query the actual policy and priority rather than treating a negative display value as a negative RT priority.

Affinity restricts the CPUs eligible to run a task; it does not reserve them. Obtain the allowed set before selecting a CPU for an experiment. Threads can have different settings. Operations that cover current threads do not prove that future threads retain the same final attributes.

To test a policy or affinity hypothesis, launch a finite, disposable workload, record each task's initial settings, vary one setting, and compare equivalent windows. Keep exact restoration values for any existing process you change. This guide's reproducible baseline uses the ordinary policy and makes no such changes. Raising priority or installing a different kernel is not evidence of the original delay's cause.

## 5. Record frequency and pressure with scope

Inspect the CPUFreq policy directories that actually exist:

```bash
for policy in /sys/devices/system/cpu/cpufreq/policy*; do
    [ -d "$policy" ] || continue
    for field in scaling_driver scaling_governor scaling_min_freq scaling_max_freq scaling_cur_freq; do
        [ ! -r "$policy/$field" ] || { printf '%s: ' "$policy/$field"; cat "$policy/$field"; }
    done
done
cat /proc/pressure/cpu
cat /proc/pressure/io
cat /proc/pressure/memory
vmstat 1 5
```

A policy may cover multiple CPUs. Frequency fields commonly use kHz; `scaling_cur_freq` is driver-dependent and need not be an exact instantaneous hardware reading. With active `intel_pstate`, a `powersave` label does not mean the CPU constantly runs at its minimum frequency. Requested min/max limits do not remove thermal and power constraints.

PSI measures contention-related stalls, not CPU utilization. Restricted affinity or cgroups can leave particular tasks waiting while other CPUs are idle. Preserve the same window, CPU set, cgroup, and workload when comparing these observations. System-wide averages from unrelated windows cannot establish causation.

## Continue the investigation

Use the [runtime latency guide](calisma-zamani-gecikmesi.md) for perf and BPF capture, clock alignment, and tracing-instability evidence. Use [C++ call-chain debugging](cpp-cagri-zinciri.md) to determine which synchronous function and object are active at a stop.

## Sources

- [Linux proc_pid_task](https://man7.org/linux/man-pages/man5/proc_pid_task.5.html) documents the task directories.
- [Linux proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) defines states and start-time identity fields.
- [Kernel scheduler statistics](https://docs.kernel.org/scheduler/sched-stats.html) defines cumulative counters and per-task `schedstat`.
- [util-linux chrt](https://man7.org/linux/man-pages/man1/chrt.1.html) documents policy queries.
- [Kernel CPUFreq](https://docs.kernel.org/admin-guide/pm/cpufreq.html), [intel_pstate](https://docs.kernel.org/admin-guide/pm/intel_pstate.html), and [PSI](https://docs.kernel.org/accounting/psi.html) define the system context.
