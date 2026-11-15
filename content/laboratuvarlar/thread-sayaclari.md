---
title: Sampling thread counters without scheduler tracing
language: Bash
---

# Sampling thread counters without scheduler tracing

Read Linux's per-thread files directly, save two raw counter snapshots, check that they belong to the same task, and subtract them in Bash. Then compare a sleeping process with a CPU-consuming process that you start and stop yourself.

No reader program is required for the main exercise. You will perform the operations that a counter-sampling script would otherwise hide.

## Before you start

Use **64-bit Linux and Bash**, procfs at `/proc`, procps (`ps`), and ordinary command-line tools: `cat`, `grep`, `awk`, `cmp`, `sleep`, and `sha256sum`. Python and the C++ timing program are not required. The [process/thread guide](../rehberler/process-thread-ve-zamanlayici.md) explains the scheduler terminology.

Open one Bash terminal and keep it open for the whole lab. Shell variables and the child processes belong to this session. Create a directory:

```bash
mkdir -p ~/execmap-labs/manual-thread-counters
cd ~/execmap-labs/manual-thread-counters
mkdir -p results
```

The `results/` directory will contain the **raw procfs readings**, not a precomputed report. Read the steps once before launching the first target so you know where its cleanup command is.

## 1. Start a process whose PID you know

```bash
sleep 900 &
LAB_PID=$!
printf 'Our sleeping process has PID %s\n' "$LAB_PID"
```

`sleep 900` asks this child to wait for 900 seconds, giving you time to inspect it. `&` runs it in the background, leaving your shell available. `$!` is the PID of the background command just launched. Save it immediately: another background launch would replace `$!`.

You will stop this child in step 7; you do not need to wait fifteen minutes to finish the exercise.

Now inspect its threads:

```bash
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu
```

`-p` selects your process. `-L` lists its threads. `-o` chooses the displayed columns. `PID` identifies the process, `TID` a task within it, `COMM` its name, `STAT` its current state, `PSR` an observed CPU, and `%CPU` a utilization statistic rather than an interval trace.

For this simple `sleep` process there should be one task and PID should equal TID. `STAT` will usually show `S` while sleeping. An observed CPU number is not an affinity guarantee.

## 2. Address that task in procfs

Set the TID from the single thread you just checked, then construct its path:

```bash
LAB_TID=$LAB_PID
LAB_TASK_DIR="/proc/$LAB_PID/task/$LAB_TID"
printf '%s\n' "$LAB_TASK_DIR"
```

For this main-thread example, TID equals PID. In a multithreaded program, select the actual TID from `ps -L`; do not substitute the process leader for every worker.

Read selected identity fields:

```bash
grep -E '^(Name|Tgid|Pid|Threads|Cpus_allowed_list):' "$LAB_TASK_DIR/status"
```

`grep` selects matching lines. `-E` enables the alternatives separated by `|`; `^` anchors them at the start of each line. `Tgid` is the thread-group/process ID, `Pid` here is the task ID, and `Threads` counts tasks in the group. `Cpus_allowed_list` describes eligible CPUs, not reserved CPUs.

Read the counters we will subtract:

```bash
cat "$LAB_TASK_DIR/schedstat"
```

This file contains three whitespace-separated cumulative integers:

```text
CPU_RUNTIME_NS RUNQUEUE_WAIT_NS TIMESLICES
```

These names explain the positions; the real file contains numbers. The first is CPU execution time in nanoseconds. The second is waiting on a runqueue. The third is a timeslice counter. A raw cumulative value does not say what happened during the next second; we need two readings.

## 3. Check whether waiting statistics are collected

```bash
cat /proc/sys/kernel/sched_schedstats > results/collection-before.txt || printf 'unknown\n' > results/collection-before.txt
cat results/collection-before.txt
```

The first `cat` reads a setting; it does not change one. `>` saves it. The command after `||` runs only if the read fails, recording the literal word `unknown` rather than pretending the setting was zero.

If the result is `0`, runqueue accounting is disabled. If it is missing, denied, or `unknown`, its availability is not established. A `1` says collection is enabled at that read. In the disabled/unknown cases, keep the raw counters but **do not interpret a zero waiting counter as zero waiting**. The timeslice counter is also a raw observation whose collection support matters.

Do not write to this setting as part of the exercise. The purpose is to understand the data your environment actually provides.

## 4. Save a task identity and the first snapshot

A numeric PID/TID can be reused after a task exits. Save its start time as another identity check:

```bash
LAB_STAT=$(cat "$LAB_TASK_DIR/stat")
LAB_FIELDS="${LAB_STAT##*) }"
printf '%s\n' "$LAB_FIELDS" | awk '{ print $20 }' > results/start-before.txt
cat results/start-before.txt
```

`$(...)` captures the command's output in a variable. The `stat` file starts with the PID and a parenthesized command name. That name can contain spaces or parentheses, so splitting the entire line on spaces would misnumber later fields.

`${LAB_STAT##*) }` removes the longest prefix ending in `) `, leaving original field 3, the task state, as the first field. Start time is original field 22, so it is **field 20 after removing those first two fields**. `awk` prints that field without subtracting or converting it. It is a count of clock ticks since boot, not nanoseconds.

Now save the raw scheduler counters:

```bash
cat "$LAB_TASK_DIR/schedstat" > results/sleep-before.txt
cat results/sleep-before.txt
```

The first command reads and saves; the second displays the exact saved values. Do not replace them with example numbers from another machine.

## 5. Wait, read again, and confirm the identity

```bash
sleep 1
cat "$LAB_TASK_DIR/schedstat" > results/sleep-after.txt
```

This `sleep 1` pauses your **observer shell's foreground command**, while the background target continues its own sleep. The interval includes your command and typing time too; it is not an exact one-second timestamped capture.

Read the identity again after the counter read:

```bash
LAB_STAT_AFTER=$(cat "$LAB_TASK_DIR/stat")
LAB_FIELDS_AFTER="${LAB_STAT_AFTER##*) }"
printf '%s\n' "$LAB_FIELDS_AFTER" | awk '{ print $20 }' > results/start-after.txt
cmp results/start-before.txt results/start-after.txt && printf 'Start time matches\n'
```

`cmp` compares the two saved identity values. The message after `&&` appears only when they match. If an identity differs, the task disappears, or any required read fails, stop: do not calculate a measurement from that pair.

Read the collection setting again:

```bash
cat /proc/sys/kernel/sched_schedstats > results/collection-after.txt || printf 'unknown\n' > results/collection-after.txt
cat results/collection-before.txt results/collection-after.txt
```

Only two enabled readings support interpreting the runqueue delta, and even those cannot exclude a setting change in between. A start-time comparison is a useful diagnostic, not a race-free process handle: procfs reads are separate operations and start times have tick resolution. For a different worker in a multithreaded process, record both the process and task start identities.

## 6. Subtract the raw counters yourself

Display both snapshots first:

```bash
cat results/sleep-before.txt results/sleep-after.txt
```

Load the three columns from each file:

```bash
read -r LAB_CPU_BEFORE LAB_WAIT_BEFORE LAB_SLICES_BEFORE < results/sleep-before.txt
read -r LAB_CPU_AFTER LAB_WAIT_AFTER LAB_SLICES_AFTER < results/sleep-after.txt
```

Unlike the comma-separated files in labs 7–8, `schedstat` uses whitespace. Bash `read` splits that whitespace into the three named variables. `<` supplies the saved file, and `-r` keeps input literal.

Calculate after minus before for each counter:

```bash
LAB_CPU_DELTA=$((LAB_CPU_AFTER - LAB_CPU_BEFORE))
LAB_WAIT_DELTA=$((LAB_WAIT_AFTER - LAB_WAIT_BEFORE))
LAB_SLICES_DELTA=$((LAB_SLICES_AFTER - LAB_SLICES_BEFORE))
printf 'CPU execution delta: %s ns\n' "$LAB_CPU_DELTA"
printf 'raw waiting-counter delta: %s ns\n' "$LAB_WAIT_DELTA"
printf 'raw timeslice-counter delta: %s\n' "$LAB_SLICES_DELTA"
```

`$((...))` performs integer arithmetic. A negative result is a reason to reject the window, not a value to clamp to zero. Check your identity and snapshots again.

CPU service can be zero or small for the sleeping process. The raw waiting delta must still be interpreted using the two collection-setting readings. If collection was disabled or unknown, write **waiting unavailable** in your notes even when the raw subtraction was zero.

To display CPU time in milliseconds:

```bash
awk -v ns="$LAB_CPU_DELTA" 'BEGIN { printf "CPU execution: %.6f ms\n", ns/1000000 }'
```

`-v` supplies the already subtracted integer; `BEGIN` runs once; division by one million converts nanoseconds to milliseconds. You have now performed the sampler's essential work yourself: two reads, an identity check, and subtraction with an availability condition.

## 7. Stop the sleeping child you created

```bash
kill "$LAB_PID"
wait "$LAB_PID"
```

`kill` without another signal option sends SIGTERM to that captured PID. `wait` collects the child after it exits. Bash may print `Terminated`, and `wait` can return 143 after SIGTERM; this is expected for the deliberately stopped lab child. It does not invalidate the saved snapshots.

Use the PID from your own launch, never an example PID copied from this page. Do not launch a new target until this one has been stopped or has already exited.

## 8. Start a CPU-consuming child and inspect it

```bash
sha256sum /dev/zero > /dev/null &
LAB_PID=$!
LAB_TID=$LAB_PID
LAB_TASK_DIR="/proc/$LAB_PID/task/$LAB_TID"
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu
```

`/dev/zero` provides a continuing stream of zero bytes. `sha256sum` keeps hashing that stream, consuming CPU. Redirecting its eventual output to `/dev/null` does not stop the input stream. You must stop this child in step 10. It runs under the ordinary scheduling policy; no affinity or priority change is involved.

Confirm that the PID belongs to `sha256sum` and inspect its thread listing. There is no `timeout` wrapper here: `$!` is the process we intend to sample, rather than the PID of a wrapper waiting for another process.

## 9. Repeat the reads and compare CPU deltas

Save the new task's identity and collection flag:

```bash
LAB_BUSY_STAT=$(cat "$LAB_TASK_DIR/stat")
LAB_BUSY_FIELDS="${LAB_BUSY_STAT##*) }"
printf '%s\n' "$LAB_BUSY_FIELDS" | awk '{ print $20 }' > results/busy-start-before.txt
cat /proc/sys/kernel/sched_schedstats > results/busy-collection-before.txt || printf 'unknown\n' > results/busy-collection-before.txt
```

This is the same identity extraction as before, for the **new** PID. Now read two counter snapshots:

```bash
cat "$LAB_TASK_DIR/schedstat" > results/busy-before.txt
sleep 1
cat "$LAB_TASK_DIR/schedstat" > results/busy-after.txt
```

Check its identity after the read and retain the collection flag:

```bash
LAB_BUSY_STAT_AFTER=$(cat "$LAB_TASK_DIR/stat")
LAB_BUSY_FIELDS_AFTER="${LAB_BUSY_STAT_AFTER##*) }"
printf '%s\n' "$LAB_BUSY_FIELDS_AFTER" | awk '{ print $20 }' > results/busy-start-after.txt
cmp results/busy-start-before.txt results/busy-start-after.txt && printf 'Busy task start time matches\n'
cat /proc/sys/kernel/sched_schedstats > results/busy-collection-after.txt || printf 'unknown\n' > results/busy-collection-after.txt
```

Stop if the identity check or any required counter read failed. Otherwise load and subtract:

```bash
read -r LAB_BUSY_CPU_BEFORE LAB_BUSY_WAIT_BEFORE LAB_BUSY_SLICES_BEFORE < results/busy-before.txt
read -r LAB_BUSY_CPU_AFTER LAB_BUSY_WAIT_AFTER LAB_BUSY_SLICES_AFTER < results/busy-after.txt
LAB_BUSY_CPU_DELTA=$((LAB_BUSY_CPU_AFTER - LAB_BUSY_CPU_BEFORE))
printf 'sleep CPU delta: %s ns\n' "$LAB_CPU_DELTA"
printf 'busy CPU delta:  %s ns\n' "$LAB_BUSY_CPU_DELTA"
cat results/busy-collection-before.txt results/busy-collection-after.txt
```

The busy process should usually accumulate substantially more CPU service over a comparable observation window. It need not receive a whole CPU-second: other tasks and the observer run too. No fixed ratio is a portable acceptance threshold.

You can apply the same visible after-minus-before formulas to its waiting and timeslice fields. Collection availability still applies; CPU use alone does not prove runnable starvation or explain the latency of one application message.

## 10. Stop the CPU child and explain the evidence

```bash
kill "$LAB_PID"
wait "$LAB_PID"
```

This stops the child you just sampled. Keep both raw before/after files, the start-time checks, and the collection settings. You should now be able to explain each field and show the exact subtraction behind your CPU result.

These are cumulative counter changes over a command window. They do not provide a per-call maximum. Do not interpret `one second minus CPU delta` as a precise off-CPU interval: your reads and commands do not share atomic endpoints. Use [event correlation](olay-akisini-eslestirme.md) and, if justified, [scheduler tracing](../rehberler/calisma-zamani-gecikmesi.md) for that different question.

## If a manual step fails

A missing `/proc` file can mean the target exited. Permission errors are unavailable observations. Empty files or failed `read` commands are not zero counters. Start over with a newly launched target and identity; do not carry old PID/TID values into a new measurement.

The examples use simple main-thread targets. The start-time field extraction deliberately handles parenthesized names; `awk '{print $22}'` on the original unparsed `stat` file is not a general replacement. Read the [process/thread guide](../rehberler/process-thread-ve-zamanlayici.md) before adapting this to several workers or cgroup restrictions.

## Optional: understand what the supplied reader automates

After doing the raw-file exercise, inspect the optional [sample_thread.py](../labs/thread-observation/sample_thread.py). Its `identity` function performs the field extraction, `snapshot` reads counters around identity checks, and `difference` performs after-minus-before. It records a monotonic sampling interval and uses JSON `null` for unavailable waiting information.

Python 3.7 or newer is needed only if you choose that reader. From the execmap repository root, `python3 scripts/verify-debugging-labs.py --require-linux` checks it against a finite child and synthetic invalid windows. The [validation record](../labs/event-pipeline/validation.txt) describes that automated coverage. Neither tool replaces the commands and decisions you have just carried out manually.

## Sources

- [Kernel scheduler statistics](https://docs.kernel.org/scheduler/sched-stats.html) defines the three cumulative counters.
- [Linux proc_pid_task](https://man7.org/linux/man-pages/man5/proc_pid_task.5.html) defines task paths.
- [Linux proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) defines start-time fields and their resolution.

- [GNU Bash manual: arithmetic expansion](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) and [Bash builtins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) document the shell calculations and `read`.
