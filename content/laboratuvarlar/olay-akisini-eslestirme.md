---
title: Correlating six event boundaries across direct and queued calls
language: C++
---

# Correlating six event boundaries across direct and queued calls

Follow one event through a caller and a worker. Add a delay in two different places and use the recorded markers to find **where the extra time first appears**.

This lab has two versions of the same flow. In `direct` mode, one thread performs everything. In `queued` mode, one thread receives events and another takes them from a queue. The classes are simply `Dispatcher`, `Worker`, and `TraceBuffer`; no external service or application framework is needed.

## Before you start

Use Linux, a C++11 compiler, and Python 3.7 or newer. GDB is optional. Complete [timing and waiting](zamanlama-ve-bekleme.md) first if elapsed duration and entry interval are unfamiliar.

A **sequence ID** is a number attached to one event. It lets us recognize that event at several points, even after another thread handles it. A **queue** lets the receiving thread hand work to a consumer thread.

## 1. Get the two files and build

Choose one workspace. If you have the repository, start at its root and run:

```bash
cd examples/event-pipeline
```

Website-only readers can instead create an empty directory:

```bash
mkdir -p ~/execmap-labs/event-pipeline
cd ~/execmap-labs/event-pipeline
```

Download [event_pipeline.cpp](../labs/event-pipeline/event_pipeline.cpp) and this lab's [analyze.py](../labs/event-pipeline/analyze.py) into it. Keep this directory separate from the timing lab: the two analyzers have the same filename but expect different records.

In your chosen directory:

```bash
ls event_pipeline.cpp analyze.py
mkdir -p build results
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread event_pipeline.cpp -o build/event_pipeline
sha256sum event_pipeline.cpp analyze.py build/event_pipeline > results/inputs.sha256
```

The last command records file identities for repeatability. It writes to a file, so no terminal output from that command is expected.

## 2. Follow the direct call first

```bash
./build/event_pipeline direct baseline 8 direct-baseline results/direct.csv
python3 analyze.py results/direct.csv --mode direct --expected-count 8
```

The first command means: use **direct** calls, add **no artificial delay**, process **8** events, label the run **direct-baseline**, and save its CSV. A run label distinguishes captures that reuse sequence numbers.

The analyzer should begin with:

```text
PASS: run=direct-baseline count=8 mode=direct
```

It then prints one summary line for each sequence number. Each event has six markers:

```text
RECEIVED → DISPATCH_ENTER → BEFORE_CALL → WORK_ENTER → WORK_EXIT → AFTER_CALL
```

Read the names as a small story: an event arrives, the dispatcher starts handling it, the dispatcher is about to call the worker, the worker enters and exits, and the dispatcher resumes after the call. Eight events produce **48 records**.

In this mode, every marker for an event has the same TID. That is the operating-system thread ID. You can open `results/direct.csv` in a text editor to see it directly.

## 3. Move receipt and processing onto different threads

```bash
./build/event_pipeline queued baseline 8 queued-baseline results/queued.csv
python3 analyze.py results/queued.csv --mode queued --expected-count 8
```

Here the source thread records `RECEIVED` and puts the event into a queue. The consumer thread records the remaining five markers. They have different TIDs, but keep the **same run label and sequence number** for the same event.

The consumer's dispatcher still calls its worker synchronously: it waits for that function to return. The thread handoff happened earlier, at the queue. This is why a queued application can contain ordinary synchronous calls too.

**Your checkpoint:** locate one sequence in the CSV and explain the TID change. If you grouped records only by TID, you would split this one event into two incomplete pieces.

## 4. Add a gap before an event arrives

```bash
./build/event_pipeline direct source-gap 8 source-gap-run results/source-gap.csv
python3 analyze.py results/source-gap.csv --mode direct --expected-count 8
```

The source normally waits 10 ms between iterations. Before **sequence 3**, this scenario adds another 30 ms sleep.

Find sequence 3 in the report. Its `source_interval_ms` should show the longer interval between receipts. The worker's entry interval can grow too, because that event reached the whole flow later. Its own call can still be short.

This is a controlled test: you know where the wait was inserted. On a real application, a large receipt interval would narrow the investigation to before that marker, but would not identify the ultimate hardware or external-source cause by itself.

## 5. Add a wait inside the caller

```bash
./build/event_pipeline direct dispatch-wait 8 dispatch-wait-run results/dispatch-wait.csv
python3 analyze.py results/dispatch-wait.csv --mode direct --expected-count 8
```

For sequence 3, the dispatcher now waits 30 ms **after `BEFORE_CALL` but before worker entry**. Look at `call_transition_ms` for that sequence. It should contain the added wait, while `work_elapsed_ms` can stay small.

Now repeat with the queue:

```bash
./build/event_pipeline queued dispatch-wait 8 queued-wait-run results/queued-wait.csv
python3 analyze.py results/queued-wait.csv --mode queued --expected-count 8
```

While the consumer waits, the producer can receive later events. Those events may spend longer between receipt and dispatcher entry, visible as `receive_to_dispatch_ms`.

**Your checkpoint:** distinguish “the worker itself took longer” from “work waited before the worker started.” A large caller-to-worker interval alone does not prove scheduler delay; in this experiment the caller deliberately sleeps there.

## 6. Read only the fields needed for your question

Start with four report fields:

- `source_interval_ms`: how long since the previous event was received?
- `receive_to_dispatch_ms`: how long from receipt until handling began?
- `call_transition_ms`: how long from before-call until worker entry?
- `work_elapsed_ms`: how long between worker entry and exit?

The remaining fields fill in the smaller boundaries: `dispatch_prepare_ms` is dispatcher entry to before-call, `return_transition_ms` is worker exit to after-call, and `caller_elapsed_ms` covers before-call to after-call. `work_entry_interval_ms` compares the starts of successive worker calls.

A direct call blocks the source loop until it returns, so a caller-side wait can also delay a *later* receipt. Compare the sequence number and event order rather than assigning a root cause from one large interval.

## If the report is rejected

**Unexpected header:** confirm you are using the event-pipeline analyzer, not the timing lab's analyzer.

**Missing or mixed events:** wait for the program to finish and analyze one complete file. Keep a separate run label and output file per experiment; do not concatenate captures.

**Thread relationship does not match mode:** pass `--mode direct` for a direct recording and `--mode queued` for a queued one. The analyzer checks that relationship instead of guessing it.

**Timings differ from a nominal 10 or 30 ms:** other load can delay any step. Look for the controlled change and its location rather than exact millisecond equality.

## Further details and verification

Each thread has its own `TraceBuffer`. Buffers and queue storage are allocated before recording, merged after the consumer joins, and written afterward. Clock reads, locks, wakeups, and buffering still affect timing. This is a single-producer, single-consumer, FIFO example without recursion.

The analyzer checks all six ordered events, contiguous sequence numbers, one run ID, monotonic clocks, and the selected TID relationship. All elapsed timestamps use the same process's steady clock. CPU counters belonging to different threads could not be subtracted in the same way. The receipt-to-dispatch interval includes application queueing and scheduling opportunities; it is not a pure runqueue-delay measurement.

From the **repository root** on Linux:

```bash
python3 scripts/verify-debugging-labs.py --require-linux --gdb
```

This checks all six mode/scenario combinations, invalid traces, known synthetic intervals, and the published C++ GDB session. Reports go to `output/debugging-validation/`. See the [validation record](../labs/event-pipeline/validation.txt) for actual tool coverage; perf/BPF and remote debugging have separate evidence.

Keep one sequence's six markers and explain which boundary changed in each scenario. Continue with [C++ call-chain debugging](../rehberler/cpp-cagri-zinciri.md) to inspect the objects, or [thread counters](thread-sayaclari.md) to observe a task without tracing.

## Sources

- [C++ steady_clock](https://eel.is/c++draft/time.clock.steady) defines the clock contract.
- [Linux gettid](https://man7.org/linux/man-pages/man2/gettid.2.html) defines OS thread identity.
- [GDB C++ expressions](https://sourceware.org/gdb/current/onlinedocs/gdb.html/C-Plus-Plus-Expressions.html) supports the follow-up member inspection.
