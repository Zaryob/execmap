---
title: Measuring function entries and returns with probes
language: C++
---

# Measuring function entries and returns with probes

Write a probe that counts one generic function, then extend it to measure entry-to-entry and entry-to-return intervals. Read every probe action before running it. You will use the same `perform_work` workload as the [timing lab](zamanlama-ve-bekleme.md), so the application source and probe boundaries are visible.

## Before you start

Use Linux, Bash, a C++11 compiler, binutils, and **bpftrace 0.21 or a compatible newer version** with working uprobes and BPF permissions. `nsecs(monotonic)` is an explicit clock choice in these examples. A container without the necessary kernel capabilities is insufficient even if the executable is installed. Record unsupported features as unavailable; do not substitute a zero result.

Use a disposable lab machine that supports tracing. If tracing previously froze a host, read [tracing failures](../rehberler/izleme-donmalari.md) first. These commands do not modify kernel policy, scheduling, affinity, or frequency settings.

## 1. Build the function you will observe

Create a working directory and save the downloadable [timing_lab.cpp](../labs/runtime-timing/timing_lab.cpp) there as `timing_lab.cpp`. Keep this Bash terminal open:

```bash
mkdir -p function-probes
cd function-probes
mkdir -p build results
c++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -pthread timing_lab.cpp -o build/timing_lab
LAB_BIN=$(readlink -f build/timing_lab)
uname -a > results/kernel.txt
bpftrace --version > results/bpftrace-version.txt
sha256sum "$LAB_BIN" > results/executable.sha256
nm -an "$LAB_BIN" | grep ' perform_work$'
```

The compiler retains an out-of-line function and debug information. `LAB_BIN` is its absolute path. `nm` should show a defined text symbol for `perform_work`; an absent symbol means you must resolve that build problem before attaching a named probe. Keep this exercise's directory path free of spaces and probe-specification punctuation such as `:`.

Read the function in the downloaded source. It marks `WORK_ENTER`, sleeps or consumes CPU for approximately 20 ms, and marks `WORK_EXIT`. The `extern "C"` name avoids C++ mangling; `noinline` keeps a probeable function boundary in this build. Probes still observe instruction boundaries outside those internal application markers, so their durations need not be identical.

Ask the tracer whether it resolves that symbol:

```bash
sudo bpftrace -l "uprobe:$LAB_BIN:perform_work"
```

`-l` lists matching probe locations. It does not establish that a future capture will succeed or that the function ran.

## 2. Start with one entry counter

Write the complete first program yourself:

```bash
cat > results/count.bt <<EOF_BT
uprobe:$LAB_BIN:perform_work
/pid == cpid/
{ @calls = count(); }
EOF_BT
cat results/count.bt
```

The unquoted here-document expands `$LAB_BIN` into the actual absolute executable path. `uprobe` fires on entry. The predicate `/pid == cpid/` limits records to the process launched by bpftrace's `-c`; it does not follow every descendant. `@calls` is an aggregate map entry, and `count()` increments its count. Inspect the file before running it.

```bash
sudo bpftrace -c "$LAB_BIN sleep 10 100 results/count.csv" results/count.bt > results/count.txt 2> results/count.stderr
cat results/count.stderr
cat results/count.txt
```

`-c` runs the finite child and ends tracing when it terminates. The child inherits bpftrace's privileges, so this `sudo` command runs only the small trusted lab binary as root. It may create root-owned output files. Redirection keeps probe stdout and diagnostics separate from the child's CSV file.

The requested workload has ten calls. Compare `@calls` with ten; do not assume a complete capture just because the tool exited. Child-scoped tracing avoids manually selecting a stale PID, but startup/attachment details depend on the installed version. A missing count requires investigation, not adjustment of the expected number. Keep diagnostics and the exact version.

Check the application's own entries too:

```bash
head -n 1 results/count.csv
awk -F, '$5 == "WORK_ENTER" { print $3, $4, $5 }' results/count.csv
```

The output is sequence, TID, event. You should be able to account for sequences 1 through 10 on this single-thread workload. This is a second observation of the requested calls, rather than an analyzer's verdict.

## 3. Add timestamps and a return probe

Save the downloadable [functions-child.bt.in](../labs/runtime-timing/functions-child.bt.in) as `functions-child.bt.in`. Open it and read this complete program:

```text bpftrace
uprobe:@BINARY@:perform_work
/pid == cpid/
{
    $now = nsecs(monotonic);
    if (@last[tid]) { @entry_interval_ns = hist($now - @last[tid]); }
    @last[tid] = $now;
    @start[tid] = $now;
    @calls = count();
}
uretprobe:@BINARY@:perform_work
/pid == cpid && @start[tid]/
{
    @elapsed_ns = hist(nsecs(monotonic) - @start[tid]);
    @returns = count();
    delete(@start[tid]);
}
END { clear(@last); clear(@start); }
```

`$now` stores this entry's monotonic timestamp. `@last[tid]` remembers the previous entry on this thread. The first call has no previous entry, so it contributes no entry interval. `hist` increments a logarithmic histogram bucket for the integer nanosecond difference; it does not retain individual invocation IDs.

`@start[tid]` remembers this invocation's entry. `uretprobe` fires on return; its predicate requires a saved entry. Subtracting gives elapsed time including time spent off CPU. `@returns` counts matched returns. `delete` removes the completed pairing. At `END`, only bookkeeping maps are cleared; the two histograms and counts remain to be printed.

TID pairing is sufficient here because the function is non-recursive and calls do not overlap on one thread. A recursive function would overwrite its outer start timestamp; adapting this program would require a depth or invocation key. Do not reuse it unchanged for arbitrary C++ call graphs.

Replace the placeholder using an ordinary text substitution:

```bash
sed "s|@BINARY@|$LAB_BIN|g" functions-child.bt.in > results/functions.bt
cat results/functions.bt
```

`sed` replaces only the literal `@BINARY@`. The BPF `$now` remains untouched because the template is read as a file, rather than reinterpreted by Bash. For this simple substitution, keep the lab path free of `|`, `&`, and backslashes as well as spaces/colons. Confirm the two probe paths point to your build.

## 4. Run and read the two distributions

```bash
sudo bpftrace -c "$LAB_BIN sleep 10 100 results/sleep.csv" results/functions.bt > results/sleep-probes.txt 2> results/sleep-probes.stderr
cat results/sleep-probes.stderr
cat results/sleep-probes.txt
```

For ten fully observed calls, expect ten entries, ten matched returns, ten elapsed samples, and **nine** entry intervals. Add the counts printed beside the buckets to check sample totals. A bucket range is in nanoseconds and is not an exact percentile. The elapsed distribution should reflect roughly 20 ms of sleep; entry intervals should reflect the roughly 100 ms period, subject to scheduling and probe effects.

Repeat with a fresh child that consumes CPU:

```bash
sudo bpftrace -c "$LAB_BIN busy 10 100 results/busy.csv" results/functions.bt > results/busy-probes.txt 2> results/busy-probes.stderr
cat results/busy-probes.stderr
cat results/busy-probes.txt
```

Busy and sleep durations can look similar in elapsed time. Neither histogram measures thread CPU service. To establish the difference, extract and subtract the application's `thread_cpu_ns` values using the [manual timing exercise](zamanlama-ve-bekleme.md#6-calculate-elapsed-time-and-cpu-time-yourself). Do not subtract absolute BPF and C++ timestamps: their epochs have not been verified as equivalent.

## What to explain before moving on

Explain why the first entry has no interval, why the return needs saved state, and why an elapsed probe cannot distinguish sleeping from CPU consumption. Retain the source hash, version, generated probe file, stdout, stderr, application rows, and count checks. If counts differ, investigate probe availability, target identity, early exits, attachment behavior, and capture loss before interpreting distributions. Continue with the [scheduler timeline lab](zamanlayici-zaman-cizelgesi.md) when you need to observe task transitions.

## Sources

- [bpftrace command-line documentation, version 0.21](https://bpftrace.org/docs/0.21) defines `-c`, `cpid`, probe predicates, explicit clock modes, and histogram maps.
- [bpftrace versioned language reference](https://github.com/bpftrace/bpftrace/blob/v0.21.0/docs/reference_guide.md) supplies the matching language contract.
