---
title: Measuring call intervals, elapsed time, and thread CPU time
language: C++
---

# Measuring call intervals, elapsed time, and thread CPU time

Run a function that waits, then a function that stays busy. Both spend about 20 ms between entry and exit, but they use the CPU differently.

By the end, you should be able to explain three numbers: **how long one call took**, **how much CPU it used**, and **how long until the next call started**.

## Before you start

Use Linux, GCC or Clang with C++11 support, Python 3, and GNU binutils. macOS can build the website, but this program uses Linux thread IDs. CMake, GDB, perf, and bpftrace are optional follow-up tools, not requirements for the first comparison.

The vocabulary for this lab is small:

- **Elapsed time:** the time from entering a function to leaving it, including any waiting.
- **Thread CPU time:** the time the CPU spends executing this thread.
- **Entry interval:** the gap between the starts of two calls.

A call can take 20 ms and start every 50 ms. Those two measurements answer different questions.

## 1. Prepare the files and build once

Choose **one** way to get the sources.

If you have an execmap checkout, open a terminal at its repository root—the directory containing `package.json`—then run:

```bash
cd examples/runtime-timing
```

If you are following only the website, create a working directory:

```bash
mkdir -p ~/execmap-labs/runtime-timing
cd ~/execmap-labs/runtime-timing
```

Download [timing_lab.cpp](../labs/runtime-timing/timing_lab.cpp) and this lab's [analyze.py](../labs/runtime-timing/analyze.py) into that directory. Keep both names unchanged. The later event-pipeline lab has a different `analyze.py`, so keep the labs in separate directories.

From your chosen directory, compile and record the inputs:

```bash
ls timing_lab.cpp analyze.py
mkdir -p build results
uname -a > results/kernel.txt
cat /etc/os-release > results/os.txt
g++ --version > results/compiler.txt
python3 --version > results/python.txt
sha256sum timing_lab.cpp analyze.py > results/source.sha256
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread timing_lab.cpp -o build/timing_lab
sha256sum build/timing_lab > results/binary.sha256
readelf -n build/timing_lab > results/elf-notes.txt
nm build/timing_lab | grep -E ' (perform_work|run_cycle)$'
```

Several commands save environment information in `results/` rather than printing it. The final command should show the two function names. **Your first checkpoint:** the build finishes and `build/timing_lab` exists.

## 2. Run the waiting version

```bash
./build/timing_lab sleep 20 50 results/sleep.csv
python3 analyze.py results/sleep.csv --expected-count 20
```

Read the first command as: use **sleep** mode, perform **20** calls, aim for a **50 ms** period, and save the records to `results/sleep.csv`. This run should take about one second.

The analyzer should begin with:

```text
PASS: 20 complete invocations, 100 records, 1 TID(s)
```

An *invocation* is one function call. A TID is an operating-system thread ID. This program does its work on one thread, so there is one TID in the records. Its PID and TID are also printed when the program starts.

Look at the `median` values in these lines:

- `work_elapsed_ms` should usually be around 20 ms or more: the function requests a 20 ms sleep.
- `work_cpu_ms` should be much smaller: a sleeping thread is not executing for most of that time.
- `entry_interval_ms` should usually be near the requested 50 ms period.

Your numbers will vary. PASS means that the recorded events are complete and correctly paired; it does not mean the machine met a performance target.

## 3. Run the busy version and compare

```bash
./build/timing_lab busy 20 50 results/busy.csv
python3 analyze.py results/busy.csv --expected-count 20
```

The function now repeatedly checks the clock for about 20 ms instead of sleeping. Compare its report with the sleeping version.

**Your checkpoint:** elapsed time can be similar while CPU time becomes much larger. The entry interval still aims for 50 ms. This is why “the function took 20 ms” does not by itself tell you how much CPU it consumed.

The busy loop ends according to elapsed time. If the thread is interrupted or preempted, it may receive less than 20 ms of CPU service. Do not treat this as a request for an exact amount of CPU time.

## 4. Ask for a period shorter than the work

```bash
./build/timing_lab sleep 5 10 results/overrun.csv
python3 analyze.py results/overrun.csv --expected-count 5
```

Here the program asks for a new call every **10 ms**, but each call already requests **20 ms** of sleep. It cannot keep that schedule.

Look at `entry_interval_ms`. If it is closer to the work duration than to 10 ms, that is the expected lesson: the loop cannot fit 20 ms of work inside a 10 ms period. A valid event sequence can therefore pass the analyzer even when a requested period cannot be achieved.

The loop advances deadlines from the original schedule and skips no calls. `sleep_until` does not wait for a deadline already in the past. Another application might choose to skip missed periods; that would be a different scheduling policy to test.

## 5. Understand what is in the CSV

Each call has a sequence number, `seq`, and five markers in this order:

```text
CYCLE_ENTER → BEFORE_CALL → WORK_ENTER → WORK_EXIT → AFTER_CALL
```

The markers are timestamps placed around the same synchronous call. `WORK_EXIT − WORK_ENTER` gives `work_elapsed_ms`. The CPU counter difference at those same markers gives `work_cpu_ms`.

`WORK_ENTER − BEFORE_CALL` is the caller-to-worker transition. `AFTER_CALL − BEFORE_CALL` covers the whole call from the caller's viewpoint. Successive `WORK_ENTER` timestamps give the entry interval.

Twenty calls produce **100 marker records** but only **19 entry intervals**: there is no preceding entry to compare with the first one. Nanoseconds are stored in the CSV and converted to milliseconds for display. A displayed `0.000` can be a rounded short duration, not literally zero time.

## 6. Optional: see the call chain in GDB

Keep debugger output separate from the earlier timing results. In the terminal:

```bash
gdb --args ./build/timing_lab sleep 3 50 results/gdb.csv
```

At the `(gdb)` prompt, enter:

```text gdb
set pagination off
break perform_work
run
bt
info threads
info args
up
list
down
finish
disable breakpoints
continue
```

The breakpoint pauses in `perform_work`. `bt` should show `perform_work`, then its caller `run_cycle`, then `main`. `up` and `down` change which stack frame you inspect; they do not execute those functions again. `finish` runs until the worker returns.

After the program exits, enter `quit` to leave GDB. Stopping at breakpoints changes timing, so this run is evidence of a call relationship, not your baseline performance measurement.

## If a command fails

**A source file is missing:** check the directory with `pwd` and `ls`. The compiler and analyzer commands assume both required files are in your current directory.

**The analyzer rejects the CSV:** make sure the program finished, use the matching file for this run, and use this lab's analyzer. A complete missing final call is caught by `--expected-count`; do not remove that check just to obtain PASS.

**The timing differs from the description:** repeat with a fresh output filename and record system load. Exact millisecond values are not portable acceptance thresholds.

**A tiny CPU duration slightly exceeds its elapsed counterpart:** the two clocks are read one after the other, not in one atomic snapshot. Preserve the raw values rather than silently changing them.

## Further details and repeatability

The CSV uses `steady_clock` for elapsed timestamps and `CLOCK_THREAD_CPUTIME_ID` for CPU time. The buffer is reserved before recording and written to disk after the run, but clock reads and record appends still add overhead. This buffer is single-threaded; it is not a ready-made concurrent logger.

Optional files are [CMakeLists.txt](../labs/runtime-timing/CMakeLists.txt), [functions.bt.in](../labs/runtime-timing/functions.bt.in), [offcpu.bt](../labs/runtime-timing/offcpu.bt), and the [experiment record](../labs/runtime-timing/evidence.txt). For a separate CMake build, run `cmake -S . -B build-cmake` and `cmake --build build-cmake`; that executable is `build-cmake/timing_lab`. CMake 3.16 or newer is required for that path.

From the **repository root**, the automated check is:

```bash
python3 scripts/verify-runtime-lab.py --require-linux
```

It records commands, hashes, and results in `output/runtime-validation/report.json`. Non-Linux runs explicitly skip Linux execution; `--require-linux` makes that skip a failure. GDB, perf, and BPF have separate validation status. See the [validation record](../labs/runtime-timing/validation.txt) for what has actually run.

Save your sleep/busy/overrun reports and explain the three time measurements in your own words. Continue with [event correlation](olay-akisini-eslestirme.md) to follow one event across threads, or the [runtime latency guide](../rehberler/calisma-zamani-gecikmesi.md) for optional tracing.

## Sources

- [C++ draft: steady_clock](https://eel.is/c++draft/time.clock.steady) defines the elapsed clock contract.
- [Linux clock_gettime](https://man7.org/linux/man-pages/man3/clock_gettime.3.html) defines thread CPU time and clock resolution.
- [CMake CXX_STANDARD_REQUIRED](https://cmake.org/cmake/help/latest/prop_tgt/CXX_STANDARD_REQUIRED.html) documents standard selection.
- [GNU GDB: backtraces](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html) explains the stopped call chain.
