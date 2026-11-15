---
title: Separating runtime latency, CPU time, and scheduler delay
---

# Separating runtime latency, CPU time, and scheduler delay

An unusually long interval between two function entries does not establish that either invocation ran for that long. Begin with an identity and a measurement boundary: which run, thread, invocation, clock, and pair of events does the number describe?

The [timing laboratory](../laboratuvarlar/zamanlama-ve-bekleme.md) provides a standalone C++11 workload with the generic functions `run_cycle` and `perform_work`. It compares sleeping and busy work without depending on a production application. Run its baseline before the optional tools below; use the lab directory for all commands and keep each tool's capture separate.

Begin with [process and thread state](process-thread-ve-zamanlayici.md) if PID/TID, runnable waiting, or scheduler counters are unfamiliar. Extend the experiment with [six-point event correlation](../laboratuvarlar/olay-akisini-eslestirme.md) to distinguish an upstream gap from waiting inside a caller, including a queued thread handoff. The [C++ GDB guide](cpp-cagri-zinciri.md) checks member calls and object state on that same generic workload.

## 1. Define the interval before diagnosing it

Entry interval compares two successive entries within a stated scope. Elapsed duration compares entry and exit for one invocation. Thread CPU time measures service actually consumed by the thread. Off-CPU time spans a switch-out and the following switch-in, including sleep and potentially runnable waiting. Scheduler delay concerns the part spent runnable before running. Caller-to-callee transition uses the caller's before-call marker and the matching callee entry.

For a hypothetical worker called every 100 ms and active for 20 ms, those first two quantities differ by design. A 300 ms entry gap could include caller work, an intentional wait, missed scheduling opportunities, or missing observations. It is insufficient to locate the delay inside the callee.

Keep nanoseconds as integers until computing differences. A display of `0 ms` after integer division can hide hundreds of microseconds. Units do not promise accuracy. `steady_clock` is appropriate for elapsed intervals; `system_clock` serves calendar correlation. C++ does not promise that the steady clock epoch equals Linux `CLOCK_MONOTONIC`. Cross-source alignment needs a verified clock relationship and correlation markers. The BPF examples explicitly use `nsecs(monotonic)`; in bpftrace 0.21 the unqualified default is `boot`, which includes suspend time.

The lab is synchronous and non-recursive. `AFTER_CALL` follows the worker's return. If adapted to queues, send completion does not imply receiver completion: propagate a sequence ID through the message. TID-only pairing cannot distinguish nested calls or multiple in-flight requests.

## 2. Use GDB for identity and call relationships

Launch the debugger as shown in the laboratory to establish the call chain. To attach to an already running lab process, start a fresh run:

```bash
./build/timing_lab sleep 200 100 results/attach.csv &
LAB_PID=$!
gdb ./build/timing_lab -p "$LAB_PID"
```

Inside GDB use `info threads`, `thread apply all bt`, and `info registers`. GDB's thread number is distinct from the Linux LWP/TID. Attach stops the target; `detach` releases it and resumes execution. Preserve this run as debugger evidence rather than timing baseline.

For remote attach, use a local executable and debug data from the exact target build. Replace the paths, host, and PID below:

```text gdb
file /local/exact-build/timing_lab
target remote | ssh -T HOST gdbserver --attach - PID
set substitute-path /original/source /local/source
info sources
bt
detach
```

Verify source resolution and binary identity before interpreting lines. Register names depend on the target architecture; surprising values in an unwound frame do not establish stack corruption. Continue with the [first GDB investigation](../laboratuvarlar/gdb-ilk-inceleme.md) for x86-64 instruction-level argument and memory checks.

## 3. Compare uprobe entry intervals with return durations

These downloadable scripts target bpftrace 0.21 syntax. Record `bpftrace --version` and `sudo bpftrace --info`; verify the local tracepoint fields. Missing features or denied attach are unavailable measurements.

```bash
LAB_BIN=$(realpath build/timing_lab)
nm "$LAB_BIN" | grep -E ' (perform_work|run_cycle)$'
sudo bpftrace -l "uprobe:$LAB_BIN:perform_work"
sudo bpftrace -lv 'tracepoint:sched:sched_switch'
```

Generate the probe file with literal replacement, then trace a fresh process. Python replacement avoids interpreting path characters as sed replacement syntax:

```bash
python3 - <<'PY'
from pathlib import Path
binary = str(Path('build/timing_lab').resolve())
if any(character.isspace() or character in ':*?[]' for character in binary):
    raise SystemExit('Use a lab directory without whitespace or probe-pattern characters')
Path('results/functions.bt').write_text(
    Path('functions.bt.in').read_text().replace('@BINARY@', binary))
PY
./build/timing_lab sleep 100 100 results/uprobe.csv &
LAB_PID=$!
sudo bpftrace results/functions.bt "$LAB_PID"
```

Stop bpftrace with Ctrl-C when the workload ends, then `wait "$LAB_PID"`. The script filters by process ID and keeps entry/return state per TID. It aggregates nanosecond histograms instead of printing each event. The intended modes should show an entry interval near 100 ms and elapsed duration near 20 ms, with environment-dependent variation. Calls before attach are absent; do not expect the full application count.

A single `@start[tid]` is valid here because the function is non-recursive. Recursion overwrites it; exceptions, missing events, and unusual control transfers can break return matching. An unmangled lab symbol also avoids the C++ demangling issue: in other applications `nm -C` provides a readable label, while `nm` exposes the actual linker name. Confirm the name accepted by the installed tracer.

## 4. Measure off-CPU time with scheduler task IDs

Use a separate process for this capture:

```bash
./build/timing_lab sleep 100 100 results/offcpu.csv &
LAB_PID=$!
sudo bpftrace offcpu.bt "$LAB_PID"
```

Stop the tracer when the workload ends and wait for the child. This single-threaded workload has TID equal to PID. A multithreaded target requires the actual target TID: `sched_switch` fields `prev_pid` and `next_pid` identify scheduler tasks. Filtering only by the process context executing the probe can miss one side of the switch.

The histogram includes the worker's sleep and the period wait. It is not a runqueue-delay histogram. Capture boundaries leave an initial or final partial interval unmeasured. TID reuse, missing events, and tracing cost limit interpretation. A wakeup-to-switch-in probe pair alone would also miss runnable waits after preemption; full scheduler accounting needs more state.

## 5. Use perf for counters, samples, and scheduler context

First compare software counters on two fresh runs:

```bash
perf stat -e task-clock,context-switches,cpu-migrations,page-faults -- ./build/timing_lab sleep 20 50 results/perf-sleep.csv
perf stat -e task-clock,context-switches,cpu-migrations,page-faults -- ./build/timing_lab busy 20 50 results/perf-busy.csv
```

`task-clock` concerns CPU service, not elapsed command duration. Busy work should usually consume more CPU. Zero migrations does not establish that affinity was configured. Record `perf --version`, `perf list`, and permission failures. This experiment does not require PMU hardware counters.

An optional sampling capture uses a fresh busy run:

```bash
perf record -F 49 -e cpu-clock -o results/cpu.data -- ./build/timing_lab busy 40 100 results/cpu.csv
perf report -i results/cpu.data --stdio
```

Samples may attribute CPU consumption to `perform_work` or the clock functions it calls. They do not count all invocations. Call graphs add cost and are a separate variable; see the [perf guide](perf-ile-yurutme.md) for unwinding and Intel PT.

For scheduler evidence on a stable Linux lab host with event access:

```bash
sudo perf sched record -a -o results/sched.data -- ./build/timing_lab sleep 40 100 results/sched.csv
sudo perf sched latency -i results/sched.data
sudo perf sched timehist -i results/sched.data
sudo perf sched map -i results/sched.data
```

Use `perf sched timehist -i results/sched.data --tid TID` with the actual printed TID. Capture is system-wide; reporting is filtered afterward. A process-filtered `sched_switch` capture can omit target switch-ins occurring in another task's context.

In `timehist`, wait time spans switch-out to switch-in, scheduling delay spans runnable to running, and run time describes CPU execution. A sleeping task can have large wait time and small scheduling delay. Inspect the relevant TID and interval before attributing an extreme maximum to starvation. Preserve capture warnings and lost-event counts; missing wakeups and capture edges can invalidate interval reconstruction.

## 6. Record system context before changing it

During a separate long lab run, use `ps -L -p "$LAB_PID" -o pid,tid,psr,cls,rtprio,pri,ni,stat,comm`, `chrt -p "$LAB_PID"`, and `taskset -pc "$LAB_PID"`. `PSR` is an observed CPU, not an affinity promise. A displayed `PRI` value is not the numeric real-time priority.

Read `/proc/pressure/cpu`, `/proc/pressure/io`, `/proc/pressure/memory`, and `vmstat 1 5` over the same observation window. PSI describes contention-related stalls, not CPU utilization. High aggregate idle time does not exclude contention within a restricted CPU set or cgroup.

Affinity limits eligible CPUs without reserving them. Select from the allowed set instead of assuming CPU 0 exists in the target's allocation. For an affinity experiment, record the original set and launch a fresh, finite process with `taskset -c` using a permitted CPU. Real-time policies and frequency settings are additional variables, each requiring its own before/after record. Neither proves deadline guarantees. Governor labels depend on the driver; record policy and driver before interpreting a frequency observation. This laboratory's baseline changes none of those settings.

## 7. Separate application latency from tracing instability

If observation makes the host unresponsive, retain the last successful step and exact failing command. Start with application timestamps and read-only system context on a stable lab host. Do not repeatedly escalate probe rates on the failing system. A short userspace timeout cannot guarantee recovery from a kernel lockup.

After reboot, `journalctl --list-boots` and `journalctl -k -b -1 --no-pager` can identify an available previous kernel log; `/sys/fs/pstore/` may contain persistent crash evidence. Missing persistent records leave the cause unresolved. Watchdog lockups, RCU stalls, OOM, and a stalled UI require different evidence. Two tools provoking similar symptoms is a lead for kernel-path investigation, not proof that the application's original latency shares that cause.

Use the downloadable [experiment record](../labs/runtime-timing/evidence.txt) to distinguish measured observations, reported history, hypotheses, and unavailable tests. Historical reports remain separate from newly captured evidence.

## Sources

- [C++ steady_clock contract](https://eel.is/c++draft/time.clock.steady) and [Linux clock_gettime](https://man7.org/linux/man-pages/man3/clock_gettime.3.html) define the two time measurements.
- [GDB attach/detach](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Attach.html) documents stopping and resuming a process; [gdbserver](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Server.html) covers remote attachment.
- [bpftrace 0.21](https://bpftrace.org/docs/0.21) documents explicit clocks, maps, and probe syntax.
- [Linux v6.12 perf sched](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt) defines the scheduler reports; [perf stat](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-stat.txt) documents counters and scope.
- [Kernel PSI](https://docs.kernel.org/accounting/psi.html) and [CPUFreq](https://docs.kernel.org/admin-guide/pm/cpufreq.html) describe pressure and frequency policy.
- [Kernel lockup watchdogs](https://www.kernel.org/doc/html/v6.12/admin-guide/lockup-watchdogs.html) distinguishes watchdog symptoms from application delays.
