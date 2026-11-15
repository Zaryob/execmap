---
title: Correlating six event boundaries across direct and queued calls
language: C++
---

# Correlating six event boundaries across direct and queued calls

Find a delay by following one event through **six source-code markers**. Read the recording code, compile it, select one sequence in its raw CSV, and subtract the timestamps yourself. Then repeat with a queue and show which thread produced each marker.

The exercise does not require an analysis script. The final optional checker can verify the work after you understand the rows and formulas.

## Before you start

Use 64-bit Linux, Bash, a C++11 compiler, and `awk`. Complete [manual timing](zamanlama-ve-bekleme.md) first for Bash `read`, integer subtraction, and elapsed/CPU clock distinctions. This file contains elapsed timestamps only.

From an execmap repository root:

```bash
cd examples/event-pipeline
```

Website readers can create a separate directory and save [event_pipeline.cpp](../labs/event-pipeline/event_pipeline.cpp) there:

```bash
mkdir -p ~/execmap-labs/manual-pipeline
cd ~/execmap-labs/manual-pipeline
```

Keep the same Bash session open throughout the calculations.

## 1. Read how each marker is created

Display the complete file:

```bash
cat event_pipeline.cpp
```

The recording class is:

```cpp
class TraceBuffer {
    long tid_;
public:
    std::vector<Record> records;
    explicit TraceBuffer(unsigned count) : tid_(syscall(SYS_gettid)) {
        if (tid_ < 1) throw std::runtime_error("cannot read thread identity");
        records.reserve(static_cast<std::size_t>(count) * 6);
    }
    void mark(unsigned seq, const char* event) {
        const auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
            Clock::now().time_since_epoch()).count();
        records.push_back(Record{ns, seq, tid_, event});
    }
};
```

A `TraceBuffer` belongs to the thread that constructs it. The constructor gets that thread's Linux TID and reserves storage. `mark` reads the steady clock and stores timestamp, sequence, TID, and event name together. It does not print a line while the worker is running.

The worker's body is small enough to inspect completely:

```cpp
class Worker {
    TraceBuffer& trace_;
public:
    unsigned completed = 0;
    explicit Worker(TraceBuffer& trace) : trace_(trace) {}
    __attribute__((noinline)) void process(unsigned seq) {
        trace_.mark(seq, "WORK_ENTER");
        ++completed;
        trace_.mark(seq, "WORK_EXIT");
    }
};
```

`WORK_ENTER` is recorded before incrementing the object's counter; `WORK_EXIT` is recorded afterward. That difference measures this body plus the measurement costs around it. It does not measure how long the event waited before entry.

The caller places three more markers:

```cpp
class Dispatcher {
    TraceBuffer& trace_;
    Worker& worker_;
    bool delay_;
public:
    Dispatcher(TraceBuffer& trace, Worker& worker, bool delay)
        : trace_(trace), worker_(worker), delay_(delay) {}
    __attribute__((noinline)) void dispatch(unsigned seq) {
        trace_.mark(seq, "DISPATCH_ENTER");
        trace_.mark(seq, "BEFORE_CALL");
        if (delay_ && seq == 3) std::this_thread::sleep_for(std::chrono::milliseconds(30));
        worker_.process(seq);
        trace_.mark(seq, "AFTER_CALL");
    }
};
```

`DISPATCH_ENTER` marks handler entry. `BEFORE_CALL` is immediately before the controlled delay and worker call. `AFTER_CALL` is reached after the worker returns. Notice the `if`: only sequence 3 waits, and only when `delay_` is true. The `dispatch-wait` scenario sets that flag; baseline does not.

The source places `RECEIVED` before handing off the sequence. In direct mode it then calls the dispatcher on the same thread. Together these operations produce six markers for each sequence.

## 2. Build and record three direct calls

Create the output directories:

```bash
mkdir -p build results
```

Compile:

```bash
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread event_pipeline.cpp -o build/event_pipeline
```

As in lab 7, `-std` selects C++11, `-g3` adds debug information, `-O0` keeps inspection straightforward, the warning flags request diagnostics, `-pthread` provides thread support, and `-o` names the output. The complete source includes argument checking and CSV writing around the excerpts shown here.

Run the direct baseline:

```bash
./build/event_pipeline direct baseline 3 direct-first results/direct.csv
```

The arguments choose **direct** calls, **baseline** behavior, **3** events, the run label **direct-first**, and an output file. The run label identifies this capture; sequence numbers restart at 1 in every new run.

Inspect the format and count:

```bash
head -n 1 results/direct.csv
wc -l results/direct.csv
```

The header is `run_id,timestamp_ns,seq,tid,event`. Expect **19 lines**: one header plus six markers for each of three events.

Important difference from lab 7: the elapsed timestamp is now **column 2** because column 1 holds the run ID. Inspect the header instead of reusing a column number blindly.

## 3. Isolate one event and inspect its identity

```bash
awk -F, '$1 == "direct-first" && $3 == 1' results/direct.csv
```

`-F,` splits at commas. `$1` selects the run label and `$3` selects sequence 1. Both conditions are required, so markers from another event or run cannot be substituted into the calculation.

You should see these names, in order:

```text
RECEIVED
DISPATCH_ENTER
BEFORE_CALL
WORK_ENTER
WORK_EXIT
AFTER_CALL
```

Check column 4: all six TIDs must match in this direct recording. We have not crossed a queue yet.

Extract the six elapsed timestamps into individual files:

```bash
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "RECEIVED" { print $2 }' results/direct.csv > results/received.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "DISPATCH_ENTER" { print $2 }' results/direct.csv > results/dispatch.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "BEFORE_CALL" { print $2 }' results/direct.csv > results/before.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "WORK_ENTER" { print $2 }' results/direct.csv > results/work-enter.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "WORK_EXIT" { print $2 }' results/direct.csv > results/work-exit.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "AFTER_CALL" { print $2 }' results/direct.csv > results/after.ns
```

Every command performs the same visible operation: choose run, sequence, and event; print timestamp column 2; redirect that one value into a file. Each file must contain exactly one integer. Recheck the six selected rows if any value is missing.

Load those values into variables:

```bash
read -r LAB_RECEIVED_NS < results/received.ns
read -r LAB_DISPATCH_NS < results/dispatch.ns
read -r LAB_BEFORE_NS < results/before.ns
read -r LAB_WORK_ENTER_NS < results/work-enter.ns
read -r LAB_WORK_EXIT_NS < results/work-exit.ns
read -r LAB_AFTER_NS < results/after.ns
```

Here there is only one value per line, so `read` does not need a comma separator. `<` supplies the file to the command. `-r` keeps the input literal.

## 4. Calculate the five adjacent stages

```bash
LAB_HANDOFF_NS=$((LAB_DISPATCH_NS - LAB_RECEIVED_NS))
LAB_PREPARE_NS=$((LAB_BEFORE_NS - LAB_DISPATCH_NS))
LAB_TRANSITION_NS=$((LAB_WORK_ENTER_NS - LAB_BEFORE_NS))
LAB_WORK_NS=$((LAB_WORK_EXIT_NS - LAB_WORK_ENTER_NS))
LAB_RETURN_NS=$((LAB_AFTER_NS - LAB_WORK_EXIT_NS))
```

Read each subtraction back against the source:

1. Receipt → dispatcher entry: time before handling begins.
2. Dispatcher entry → before-call: caller preparation.
3. Before-call → worker entry: transition to the worker, including any wait inserted before that call.
4. Worker entry → worker exit: elapsed worker body.
5. Worker exit → after-call: time until the caller's next marker.

Print the numbers you calculated:

```bash
printf 'receipt to dispatcher: %s ns\n' "$LAB_HANDOFF_NS"
printf 'dispatcher preparation: %s ns\n' "$LAB_PREPARE_NS"
printf 'before-call to worker: %s ns\n' "$LAB_TRANSITION_NS"
printf 'worker body: %s ns\n' "$LAB_WORK_NS"
printf 'worker return to caller: %s ns\n' "$LAB_RETURN_NS"
```

The caller's whole measured call is a different subtraction:

```bash
LAB_CALL_NS=$((LAB_AFTER_NS - LAB_BEFORE_NS))
printf 'whole caller interval: %s ns\n' "$LAB_CALL_NS"
printf 'sum of its three stages: %s ns\n' "$((LAB_TRANSITION_NS + LAB_WORK_NS + LAB_RETURN_NS))"
```

Those last two integers should agree: they use the same bookends. This arithmetic check helps catch a mistaken pairing. Keep integer nanoseconds for the calculation; divide the final difference by one million only when displaying milliseconds.

### Check two successive entry intervals against their transitions

Use the first two sequences from the same `direct-first` run. The variables above still hold sequence 1's `BEFORE_CALL` and `WORK_ENTER`. Extract sequence 2's matching markers:

```bash
awk -F, '$1 == "direct-first" && $3 == 2 && $5 == "BEFORE_CALL" { print $2 }' results/direct.csv > results/before-2.ns
awk -F, '$1 == "direct-first" && $3 == 2 && $5 == "WORK_ENTER" { print $2 }' results/direct.csv > results/work-enter-2.ns
cat results/before-2.ns results/work-enter-2.ns
read -r LAB_BEFORE_2_NS < results/before-2.ns
read -r LAB_WORK_ENTER_2_NS < results/work-enter-2.ns
LAB_CALLER_GAP_NS=$((LAB_BEFORE_2_NS - LAB_BEFORE_NS))
LAB_WORKER_GAP_NS=$((LAB_WORK_ENTER_2_NS - LAB_WORK_ENTER_NS))
LAB_TRANSITION_2_NS=$((LAB_WORK_ENTER_2_NS - LAB_BEFORE_2_NS))
printf 'worker gap minus caller gap: %s ns\n' "$((LAB_WORKER_GAP_NS - LAB_CALLER_GAP_NS))"
printf 'transition 2 minus transition 1: %s ns\n' "$((LAB_TRANSITION_2_NS - LAB_TRANSITION_NS))"
```

Both extracted files must contain one integer. The two printed differences must agree exactly: if caller and worker entries are `C1`, `C2`, `W1`, and `W2`, then `(W2-W1)-(C2-C1) = (W2-C2)-(W1-C1)`. This is an identity from the same four timestamps, not a claim that scheduling is regular.

If both paired transitions are small, they cannot explain an arbitrarily large disagreement between the two entry intervals. Check the run, sequence, TID, clock, missing rows, and event definitions before attributing the disagreement to “different metrics.” With queue handoff, preserve the same sequence across threads and confirm ordering rather than pairing whichever entries happen to be adjacent.

## 5. Put a known wait before worker entry

Record a new run:

```bash
./build/event_pipeline direct dispatch-wait 3 direct-wait results/direct-wait.csv
awk -F, '$1 == "direct-wait" && $3 == 3' results/direct-wait.csv
```

The second command selects **sequence 3**, because that is the branch that sleeps in the dispatcher source. Do not compare sequence 1's before-call with sequence 3's entry.

Calculate the affected stage and the worker body from that sequence:

```bash
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "BEFORE_CALL" { print $2 }' results/direct-wait.csv > results/wait-before.ns
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "WORK_ENTER" { print $2 }' results/direct-wait.csv > results/wait-enter.ns
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "WORK_EXIT" { print $2 }' results/direct-wait.csv > results/wait-exit.ns
read -r LAB_WAIT_BEFORE_NS < results/wait-before.ns
read -r LAB_WAIT_ENTER_NS < results/wait-enter.ns
read -r LAB_WAIT_EXIT_NS < results/wait-exit.ns
printf 'caller-to-worker transition: %s ns\n' "$((LAB_WAIT_ENTER_NS - LAB_WAIT_BEFORE_NS))"
printf 'worker body: %s ns\n' "$((LAB_WAIT_EXIT_NS - LAB_WAIT_ENTER_NS))"
```

The first difference should contain the deliberate 30 ms wait; the second can stay short. You have located the extra time by source placement and matching rows, rather than by a summary label. It would be incorrect to say the worker body itself took the entire transition interval.

## 6. Put a wait before receipt instead

The source loop contains this separate condition:

```cpp
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            if (scenario == "source-gap" && seq == 3)
                std::this_thread::sleep_for(std::chrono::milliseconds(30));
            source.mark(seq, "RECEIVED");
```

`source-gap` adds its wait before `RECEIVED` for sequence 3. The normal loop already sleeps 10 ms between iterations.

```bash
./build/event_pipeline direct source-gap 3 source-wait results/source-gap.csv
awk -F, '$1 == "source-wait" && $5 == "RECEIVED" { print $3, $4, $2 }' results/source-gap.csv
```

The printed fields are sequence, TID, and elapsed timestamp. Select receipt timestamps for sequences 2 and 3 and subtract them:

```bash
awk -F, '$1 == "source-wait" && $3 == 2 && $5 == "RECEIVED" { print $2 }' results/source-gap.csv > results/source-second.ns
awk -F, '$1 == "source-wait" && $3 == 3 && $5 == "RECEIVED" { print $2 }' results/source-gap.csv > results/source-third.ns
read -r LAB_SOURCE_SECOND_NS < results/source-second.ns
read -r LAB_SOURCE_THIRD_NS < results/source-third.ns
printf 'receipt 2 to receipt 3: %s ns\n' "$((LAB_SOURCE_THIRD_NS - LAB_SOURCE_SECOND_NS))"
```

This is an **entry interval between two events**, not a duration inside event 3. The added wait should be visible here; do not require exact equality to 40 ms under arbitrary system load.

## 7. Inspect the actual queue handoff

In queued mode, the source uses this branch to publish a sequence:

```cpp
                {
                    std::lock_guard<std::mutex> lock(mutex);
                    queue[available++] = seq;
                }
                ready.notify_one();
```

The lock protects the shared queue and count. `notify_one` notifies the waiting consumer; it does not mean that the consumer has already run or finished handling the event.

The consumer reads with:

```cpp
        if (mode == "queued") {
            consumer = std::thread([&] {
                try {
                    TraceBuffer trace(count);
                    Worker worker(trace);
                    Dispatcher dispatcher(trace, worker, scenario == "dispatch-wait");
                    unsigned read = 0;
                    for (;;) {
                        std::unique_lock<std::mutex> lock(mutex);
                        ready.wait(lock, [&] { return read < available || done; });
                        if (read == available && done) break;
                        const unsigned seq = queue[read++];
                        lock.unlock();
                        dispatcher.dispatch(seq);
                    }
                    consumer_records = std::move(trace.records);
                } catch (...) { consumer_error = std::current_exception(); }
            });
        }
```

`std::thread` starts the consumer function. Its `[&]` capture lets it refer to the shared queue and synchronization objects in `main`. The `TraceBuffer`, `Worker`, and `Dispatcher` are constructed inside that consumer, so its markers use the consumer TID and its own buffer. The producer has a separate source buffer.

`ready.wait` releases the mutex while waiting and reacquires it before returning. The predicate checks whether there is work or shutdown. After copying a sequence out of the queue, `unlock` releases the mutex **before** calling the dispatcher. The producer can therefore enqueue later events while that dispatcher works or sleeps.

When the producer finishes its loop, `main` shuts the consumer down and collects its records:

```cpp
        if (consumer.joinable()) {
            {
                std::lock_guard<std::mutex> lock(mutex);
                done = true;
            }
            ready.notify_one();
            consumer.join();
            if (consumer_error) std::rethrow_exception(consumer_error);
        }
        source.records.insert(source.records.end(), consumer_records.begin(), consumer_records.end());
        std::stable_sort(source.records.begin(), source.records.end(),
                         [](const Record& a, const Record& b) { return a.ns < b.ns; });
```

`done` is changed while holding the same mutex. The notification lets the consumer notice shutdown; it still drains already published work before its loop exits. `join` waits for the thread to finish, making its completed buffer available to `main`. Only then are the records merged and sorted. A stored consumer exception is rethrown instead of silently reporting a completed capture.

Record a queued baseline and show sequence 1:

```bash
./build/event_pipeline queued baseline 3 queued-first results/queued.csv
awk -F, '$1 == "queued-first" && $3 == 1 { print $3, $4, $5, $2 }' results/queued.csv
```

The output is sequence, TID, event, timestamp. `RECEIVED` belongs to the producer; the other five markers belong to the consumer. The common sequence connects them. Filtering everything by the producer's TID would lose the consumer's markers.

## 8. Measure a queued event's wait yourself

Let the consumer wait inside sequence 3 while the producer continues receiving later sequences:

```bash
./build/event_pipeline queued dispatch-wait 6 queued-wait results/queued-wait.csv
awk -F, '$1 == "queued-wait" && $3 == 4' results/queued-wait.csv
```

Now measure receipt → dispatcher entry for **sequence 4**, using its two timestamps even though their TIDs differ:

```bash
awk -F, '$1 == "queued-wait" && $3 == 4 && $5 == "RECEIVED" { print $2 }' results/queued-wait.csv > results/queued-received.ns
awk -F, '$1 == "queued-wait" && $3 == 4 && $5 == "DISPATCH_ENTER" { print $2 }' results/queued-wait.csv > results/queued-dispatch.ns
read -r LAB_QUEUED_RECEIVED_NS < results/queued-received.ns
read -r LAB_QUEUED_DISPATCH_NS < results/queued-dispatch.ns
printf 'sequence 4 receipt to handler: %s ns\n' "$((LAB_QUEUED_DISPATCH_NS - LAB_QUEUED_RECEIVED_NS))"
```

This interval can grow because the consumer is occupied with an earlier event. Actual load can change whether and how much backlog accumulates. The interval includes application queueing and scheduling opportunities; it is not a pure runnable-wait measurement. A direct call also blocks the source loop, so a caller delay can shift a later receipt there too.

All timestamps here use the same process's steady clock, making this elapsed subtraction across threads meaningful. Thread CPU counters from different threads could not be compared in the same way. Buffers are merged after `join`, then sorted by elapsed timestamp for CSV output; file position alone is not an invocation identity.

## What to demonstrate before using a checker

Show one direct sequence's five adjacent differences and its matching caller total. Show the changed stage for `dispatch-wait`, the receipt interval for `source-gap`, and the producer/consumer TIDs for a queued event. Explain each result by pointing to the exact marker placement in the source.

If any extracted file is empty, contains several rows, or has a different run/sequence identity, stop before subtraction. The source and parser are deliberately limited to one producer, one FIFO consumer, and no recursion; they are not a general distributed tracing implementation.

## Optional: check the complete file and inspect objects

After the manual work, you can download this lab's [analyze.py](../labs/event-pipeline/analyze.py) and compare its results:

```bash
python3 analyze.py results/direct.csv --mode direct --expected-count 3
```

It checks completeness, ordering, run/sequence identity, and the chosen thread relationship. The program's `[run_id, sequence]` pairing differs from lab 7's same-thread timing file, so the analyzers are not interchangeable.

The [C++ GDB guide](../rehberler/cpp-cagri-zinciri.md) lets you stop in these generic objects and inspect the member counter. From the repository root, `python3 scripts/verify-debugging-labs.py --require-linux --gdb` runs regression checks. Its [validation record](../labs/event-pipeline/validation.txt) describes tool coverage; it is not a substitute for the raw-row exercise.

## Sources

- [C++ steady_clock](https://eel.is/c++draft/time.clock.steady) defines the clock contract.
- [Linux gettid](https://man7.org/linux/man-pages/man2/gettid.2.html) defines OS thread identity.
- [GDB C++ expressions](https://sourceware.org/gdb/current/onlinedocs/gdb.html/C-Plus-Plus-Expressions.html) supports the follow-up member inspection.

- [GNU Bash manual: arithmetic expansion](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) and [Bash builtins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) document the shell calculations and `read`.
