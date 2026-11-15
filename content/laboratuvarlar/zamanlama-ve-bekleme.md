---
title: Measuring call intervals, elapsed time, and thread CPU time
language: C++
---

# Measuring call intervals, elapsed time, and thread CPU time

Build an elapsed-time and thread-CPU measurement, then calculate the results from the raw records yourself. You will read the C++ measurement points, select matching CSV rows, subtract integer timestamps in Bash, and explain the difference between one call's duration and the interval between calls.

The core exercise does not use `analyze.py`. Its optional check appears only after you have done the calculations.

## Before you start

Use **64-bit Linux, Bash, a C++11 compiler, and ordinary command-line tools** (`awk`, `head`, `wc`). The commands use `g++`; with Clang, use `clang++` in the compiler command. Python is needed only for the optional checker.

Open Bash for the shell commands below. Keep the same shell open: later calculations use variables you assigned earlier.

In an execmap checkout, start at the repository root and run:

```bash
cd examples/runtime-timing
```

For a website-only copy, create a directory and save [timing_lab.cpp](../labs/runtime-timing/timing_lab.cpp) there:

```bash
mkdir -p ~/execmap-labs/manual-timing
cd ~/execmap-labs/manual-timing
```

You need only that C++ file for the core exercise.

## 1. Understand what a record contains

Open the complete source in your editor, or print it in the terminal:

```bash
cat timing_lab.cpp
```

`cat` displays the file; it does not compile or execute it. The argument parser checks inputs. The measurement itself is built from the following source excerpt:

```cpp
using Clock = std::chrono::steady_clock;
struct Record {
    std::int64_t timestamp_ns, thread_cpu_ns;
    unsigned seq;
    long tid;
    const char* event;
};
static std::vector<Record> records;
static bool busy_mode;
static long worker_tid;

static std::int64_t steady_ns() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        Clock::now().time_since_epoch()).count();
}

static std::int64_t thread_cpu_ns() {
    timespec value{};
    if (clock_gettime(CLOCK_THREAD_CPUTIME_ID, &value) != 0)
        throw std::runtime_error("cannot read thread CPU clock");
    return static_cast<std::int64_t>(value.tv_sec) * 1000000000 + value.tv_nsec;
}

static void mark(unsigned seq, const char* event) {
    const auto timestamp = steady_ns();
    const auto cpu = thread_cpu_ns();
    records.push_back(Record{timestamp, cpu, seq, worker_tid, event});
}
```

Read the excerpt in this order:

1. `Clock` names `std::chrono::steady_clock`, used for elapsed intervals.
2. `Record` stores two clock readings, one call number (`seq`), the thread ID (`tid`), and the event name.
3. `steady_ns()` reads the elapsed clock and expresses its reading as integer nanoseconds. Its epoch is not used as a calendar date here.
4. `thread_cpu_ns()` reads `CLOCK_THREAD_CPUTIME_ID`. The seconds part is multiplied by one billion, then the nanoseconds part is added. This measures CPU service consumed by this thread, rather than time spent sleeping.
5. `mark()` reads both clocks and appends one record to memory. It does not write a log file on every call.

Do not subtract a CPU timestamp from an elapsed timestamp. They are different clocks. We will subtract two readings of the **same** clock at two matching events.

## 2. Locate the measurement boundaries in C++

These are the two functions you will measure:

```cpp
extern "C" __attribute__((noinline)) void perform_work(unsigned seq) {
    mark(seq, "WORK_ENTER");
    if (busy_mode) {
        const auto end = Clock::now() + std::chrono::milliseconds(20);
        while (Clock::now() < end) { }
    } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    mark(seq, "WORK_EXIT");
}

extern "C" __attribute__((noinline)) void run_cycle(unsigned seq) {
    mark(seq, "CYCLE_ENTER");
    mark(seq, "BEFORE_CALL");
    perform_work(seq);
    mark(seq, "AFTER_CALL");
}
```

`run_cycle` records `BEFORE_CALL`, calls `perform_work`, and records `AFTER_CALL` only after that synchronous call returns. The worker places `WORK_ENTER` and `WORK_EXIT` around its body. The same `seq` is passed to every marker, so one invocation can be identified.

`extern "C"` keeps these two linker names unmangled for symbol lookup. `noinline` requests separate function bodies so that the call boundary remains convenient to inspect. The measurement itself still comes from the explicit `mark` calls.

In sleep mode, the worker asks the OS to let it sleep for 20 ms. In busy mode, it keeps reading the elapsed clock until 20 ms have passed. The latter can use much more CPU despite having a similar elapsed duration.

Inside `main`, the timing loop is:

```cpp
        worker_tid = syscall(SYS_gettid);
        if (worker_tid < 1) throw std::runtime_error("cannot read TID");
        records.reserve(static_cast<std::size_t>(count) * 5);
        std::cerr << "pid=" << getpid() << " tid=" << worker_tid << " mode=" << mode << '\n';
        auto deadline = Clock::now();
        for (unsigned seq = 1; seq <= count; ++seq) {
            run_cycle(seq);
            deadline += std::chrono::milliseconds(period);
            std::this_thread::sleep_until(deadline);
        }
```

`SYS_gettid` obtains the current Linux thread ID used by these records. `reserve(count * 5)` makes room for five records per call before recording begins. The deadline advances by `period` after every call. `sleep_until(deadline)` waits only if that deadline is still ahead. It does not request an additional full period after the work.

After the loop, the source opens an output stream and writes the records:

```cpp
        std::ofstream stream(output);
        if (!stream) throw std::runtime_error("cannot open output file");
        stream << "timestamp_ns,thread_cpu_ns,seq,tid,event\n";
        for (const auto& record : records)
            stream << record.timestamp_ns << ',' << record.thread_cpu_ns << ','
                   << record.seq << ',' << record.tid << ',' << record.event << '\n';
        stream.close();
        if (!stream) throw std::runtime_error("output write failed");
```

This is why the CSV appears only after the run finishes. Clock reads and memory appends still have a cost, but file output is outside the measured worker calls. The global buffer is used by one thread in this experiment.

## 3. Compile the source and explain the options

First make the two output directories:

```bash
mkdir -p build results
```

`-p` lets `mkdir` reuse directories that already exist. `build/` will hold the executable; `results/` will hold your records.

Now compile:

```bash
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread timing_lab.cpp -o build/timing_lab
```

`g++` compiles and links the source. `-std=c++11` chooses the language version. `-g3` includes debugger information; `-O0` avoids optimization for this inspection build. `-fno-omit-frame-pointer` requests a frame pointer. The three warning options ask for diagnostics. `-pthread` selects thread support. `-o` gives the executable's path.

Record which input and compiler you used:

```bash
g++ --version
uname -sm
sha256sum timing_lab.cpp build/timing_lab > results/inputs.sha256
```

The first two commands print versions and architecture. The third stores source and executable hashes. `>` redirects output to a file; it is not a successful-run message.

## 4. Produce a small raw recording

Run just three calls so that you can inspect every record:

```bash
./build/timing_lab sleep 3 50 results/sleep.csv
```

The arguments mean sleep mode, three calls, a 50 ms target period, and the CSV destination. The program prints its PID/TID to the terminal. It uses its main thread, so those identifiers match.

Inspect the file before calculating anything:

```bash
head -n 1 results/sleep.csv
wc -l results/sleep.csv
```

`head -n 1` prints the header. It is:

```text
timestamp_ns,thread_cpu_ns,seq,tid,event
```

`wc -l` should count **16 lines**: one header and five records for each of three calls.

Select the header and call 1:

```bash
awk -F, 'NR == 1 || $3 == 1' results/sleep.csv
```

`-F,` makes commas the field separator. `$3` is the third field, `seq`. `NR` is the input line number. `||` means “or,” so the command prints the header or a row whose sequence is 1. There is no timestamp arithmetic in this command. These generated fields contain no embedded commas; this simple field splitting is for this controlled format, not every possible CSV file.

The five event names should be `CYCLE_ENTER`, `BEFORE_CALL`, `WORK_ENTER`, `WORK_EXIT`, `AFTER_CALL`, in that order. Check that they have the same sequence and TID.

## 5. Select the matching worker entry and exit

Keep the two rows in separate small files:

```bash
awk -F, '$3 == 1 && $5 == "WORK_ENTER"' results/sleep.csv > results/enter.csv
awk -F, '$3 == 1 && $5 == "WORK_EXIT"' results/sleep.csv > results/exit.csv
cat results/enter.csv results/exit.csv
```

Here `&&` means both conditions must hold: the sequence must be 1 **and** the event name must match. This avoids subtracting the end of one call from the beginning of another. Each selected file must contain exactly one row. If it is empty or contains multiple rows, stop and fix the selection.

Read their columns into shell variables:

```bash
IFS=, read -r LAB_ENTER_NS LAB_ENTER_CPU_NS LAB_ENTER_SEQ LAB_ENTER_TID LAB_ENTER_EVENT < results/enter.csv
IFS=, read -r LAB_EXIT_NS LAB_EXIT_CPU_NS LAB_EXIT_SEQ LAB_EXIT_TID LAB_EXIT_EVENT < results/exit.csv
```

`read` reads one line. `IFS=,` splits that line at commas for this command, and `-r` keeps backslashes literal. `<` supplies the file as input. The first variable receives elapsed timestamp column 1; the second receives CPU timestamp column 2. The remaining variables hold the identity and event name.

Print the identities you just loaded:

```bash
printf 'entry: seq=%s tid=%s event=%s\n' "$LAB_ENTER_SEQ" "$LAB_ENTER_TID" "$LAB_ENTER_EVENT"
printf 'exit:  seq=%s tid=%s event=%s\n' "$LAB_EXIT_SEQ" "$LAB_EXIT_TID" "$LAB_EXIT_EVENT"
```

Both sequence numbers must be 1 and both TIDs must match. The events must be entry and exit respectively. In this deliberately single-threaded, non-recursive program, that identifies the pair we need.

## 6. Calculate elapsed time and CPU time yourself

Subtract the elapsed timestamps, then separately subtract the CPU timestamps:

```bash
LAB_WALL_NS=$((LAB_EXIT_NS - LAB_ENTER_NS))
LAB_CPU_NS=$((LAB_EXIT_CPU_NS - LAB_ENTER_CPU_NS))
printf 'elapsed=%s ns, thread CPU=%s ns\n' "$LAB_WALL_NS" "$LAB_CPU_NS"
```

`$((...))` is Bash integer arithmetic. The formula is **exit minus entry**, using one clock at a time. The timestamp values remain integers during subtraction.

For presentation, convert those differences to milliseconds:

```bash
awk -v wall="$LAB_WALL_NS" -v cpu="$LAB_CPU_NS" 'BEGIN { printf "elapsed=%.3f ms, CPU=%.3f ms\n", wall/1000000, cpu/1000000 }'
```

`-v` passes the already calculated differences into awk. `BEGIN` runs once without reading a file. Dividing by one million converts nanoseconds to milliseconds; `%.3f` displays three decimal places. We convert the **differences**, rather than rounding large absolute timestamps before subtraction.

For sleep mode, elapsed time should normally be at least about 20 ms, while thread CPU time is much smaller. Explain that result from the call to `sleep_for`, not from a PASS label. The clocks were read consecutively, so very small paired-duration discrepancies are possible.

## 7. Calculate a different quantity: entry interval

Now select the elapsed timestamp of call 2's entry:

```bash
awk -F, '$3 == 2 && $5 == "WORK_ENTER" { print $1 }' results/sleep.csv > results/next-enter.ns
read -r LAB_NEXT_ENTER_NS < results/next-enter.ns
LAB_INTERVAL_NS=$((LAB_NEXT_ENTER_NS - LAB_ENTER_NS))
printf 'entry interval=%s ns\n' "$LAB_INTERVAL_NS"
```

`print $1` extracts only the first column. The subtraction is now **next entry minus previous entry**, not exit minus entry. It will usually be near the requested 50 ms period even though the worker call took about 20 ms.

Three calls provide two adjacent entry intervals. There is no earlier call to compare with the first entry.

## 8. Repeat the same calculation for busy work

```bash
./build/timing_lab busy 3 50 results/busy.csv
awk -F, '$3 == 1 && $5 == "WORK_ENTER"' results/busy.csv > results/busy-enter.csv
awk -F, '$3 == 1 && $5 == "WORK_EXIT"' results/busy.csv > results/busy-exit.csv
cat results/busy-enter.csv results/busy-exit.csv
```

The event selection is identical; only the input recording changed. Check its sequence/TID pair before reading the values:

```bash
IFS=, read -r LAB_BUSY_ENTER_NS LAB_BUSY_ENTER_CPU_NS LAB_BUSY_SEQ LAB_BUSY_TID LAB_BUSY_EVENT < results/busy-enter.csv
IFS=, read -r LAB_BUSY_EXIT_NS LAB_BUSY_EXIT_CPU_NS LAB_BUSY_END_SEQ LAB_BUSY_END_TID LAB_BUSY_END_EVENT < results/busy-exit.csv
LAB_BUSY_WALL_NS=$((LAB_BUSY_EXIT_NS - LAB_BUSY_ENTER_NS))
LAB_BUSY_CPU_NS=$((LAB_BUSY_EXIT_CPU_NS - LAB_BUSY_ENTER_CPU_NS))
printf 'busy elapsed=%s ns, thread CPU=%s ns\n' "$LAB_BUSY_WALL_NS" "$LAB_BUSY_CPU_NS"
```

Compare these differences with the sleep result. The elapsed duration can stay similar while CPU service increases. A busy loop bounded by elapsed time can still be preempted; it does not guarantee exactly 20 ms of CPU service.

## 9. Make a period that cannot fit the work

```bash
./build/timing_lab sleep 3 10 results/overrun.csv
awk -F, '$3 == 1 && $5 == "WORK_ENTER" { print $1 }' results/overrun.csv > results/overrun-first.ns
awk -F, '$3 == 2 && $5 == "WORK_ENTER" { print $1 }' results/overrun.csv > results/overrun-second.ns
read -r LAB_FIRST_NS < results/overrun-first.ns
read -r LAB_SECOND_NS < results/overrun-second.ns
printf 'overrun entry interval=%s ns\n' "$((LAB_SECOND_NS - LAB_FIRST_NS))"
```

The formula is the same entry-to-entry subtraction. A function asking to sleep 20 ms cannot finish a cycle every 10 ms. Revisit the `deadline += period` and `sleep_until` lines: a deadline already in the past does not add another sleep. No calls are skipped in this source.

## What you should now be able to explain

Point to the two source markers and two CSV rows behind each number. Explain why entry interval, elapsed duration, and CPU duration differ. If a selection produces no row, recheck the header, event name, and sequence before attempting arithmetic; an unset shell variable is not evidence of zero time.

## Optional: verify your work or inspect the stack

Only after your manual calculations, download this lab's [analyze.py](../labs/runtime-timing/analyze.py) and compare its per-call summary with the same raw file:

```bash
python3 analyze.py results/sleep.csv --expected-count 3
```

The checker validates the record contract and reports aggregates. It does not replace the calculations above. The [experiment record](../labs/runtime-timing/evidence.txt) can hold your commands, hashes, and observations. Optional [CMake](../labs/runtime-timing/CMakeLists.txt) and [BPF files](../labs/runtime-timing/functions.bt.in) have separate purposes; the [runtime guide](../rehberler/calisma-zamani-gecikmesi.md) covers tracing.

For a separate GDB investigation, launch from the terminal:

```bash
gdb --args ./build/timing_lab sleep 3 50 results/gdb.csv
```

At the `(gdb)` prompt:

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

`bt` should show worker → cycle → main. `up`/`down` select frames, `finish` runs to the worker's return, and disabling breakpoints lets the run finish. Enter `quit` afterward. Keep this debugger-affected timing separate from your baseline.

From the repository root, `python3 scripts/verify-runtime-lab.py --require-linux` runs the automated regression checks. Its [validation record](../labs/runtime-timing/validation.txt) describes actual tool coverage; it does not make the manual exercise depend on that harness.

## Sources

- [C++ draft: steady_clock](https://eel.is/c++draft/time.clock.steady) defines the elapsed clock contract.
- [Linux clock_gettime](https://man7.org/linux/man-pages/man3/clock_gettime.3.html) defines thread CPU time and clock resolution.
- [CMake CXX_STANDARD_REQUIRED](https://cmake.org/cmake/help/latest/prop_tgt/CXX_STANDARD_REQUIRED.html) documents standard selection.
- [GNU GDB: backtraces](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html) explains the stopped call chain.

- [GNU Bash manual: arithmetic expansion](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) and [Bash builtins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) document the shell calculations and `read`.
