---
title: Debugging C++ call chains, objects, and registers with GDB
---

# Debugging C++ call chains, objects, and registers with GDB

Source-level operations can pass through wrappers, adapters, virtual dispatch, or a queue. Establish the actual call and thread relationship before inferring where time was spent. This guide uses the generic `Dispatcher` and `Worker` classes in the [event correlation laboratory](../laboratuvarlar/olay-akisini-eslestirme.md).

The commands below target a Linux debug build with DWARF information and `-O0`. Register-specific discussion is limited to Linux x86-64 with the System V AMD64 ABI. The initial source-level session also runs on Linux aarch64.

## 1. Stop on an actual member function

Build the lab's `event_pipeline` executable and create its results directory, then launch:

```bash
gdb --args ./build/event_pipeline direct baseline 3 gdb-run results/gdb.csv
```

Use this complete session in GDB:

```text gdb
set pagination off
break Worker::process
run
bt
info threads
info args
print seq
print this->completed
up
info args
down
finish
print worker_.completed
disable breakpoints
continue
```

At the first stop, expect `Worker::process`, `Dispatcher::dispatch`, and `main`. `seq` is 1 and `this->completed` is 0. After `finish`, the dispatcher can inspect its worker's counter as 1. These are deliberate properties of this small program, rather than assumptions about an arbitrary application's objects.

This direct call uses one thread. In the lab's queued mode, the source runs on the producer thread and the member call chain runs on the consumer thread. The producer's stack is not a caller frame underneath the consumer's stack. Connect those two sides using the propagated sequence number. A different TID in unmatched observations does not prove an asynchronous handoff.

## 2. Choose the right stepping boundary

`step` enters a source-level call; `next` advances over one. `finish` runs until the selected frame returns. `stepi` follows one machine instruction, including into a call; `nexti` normally steps over a call. Signals, other breakpoints, and optimized code can interrupt those operations.

To examine the actual instructions, use `disassemble /r 'Dispatcher::dispatch(unsigned int)'`, `x/10i $pc`, and `info symbol ADDRESS` with a real address from the target. Exact C++ signatures depend on the compiled symbol; `info functions Dispatcher` helps discover them. Outside GDB, `nm -C build/event_pipeline` displays readable C++ names and `nm build/event_pipeline` shows linker names. Do not assume a demangled display label is a valid raw uprobe symbol.

Inlining and tail-call optimization can remove expected frames or change their presentation. Reproduce with matching symbols and inspect disassembly before diagnosing a missing frame as a corrupted stack.

## 3. Interpret registers in the selected frame

Start with `frame 0`, `info frame`, and `info registers`. The `$pc` and `$sp` aliases avoid assuming x86 register names. On x86-64, `info registers rdi rsi rsp rbp rip` shows relevant registers, but their meaning depends on the current instruction and ABI.

A non-static member function has an implicit `this` argument. In this lab's simple `Worker::process(unsigned)` entry under the System V AMD64 ABI, the expected incoming values are the object pointer in `RDI` and `seq` in `ESI`. This explanation is not a rule for all C++ signatures: return-value conventions, argument types, wrappers, and thunks can change the layout.

A source breakpoint may stop after the prologue has already reused a register. To test entry registers, first resolve the exact function entry and stop there, as in the [first GDB laboratory](../laboratuvarlar/gdb-ilk-inceleme.md). Do not interpret an arbitrary RSI value halfway through a method as a valid pointer. Do not read memory through it until its type and mapping are established. Registers in outer frames can be reconstructed by unwinding rather than representing their live hardware contents.

## 4. Test a suspected overwrite

At a valid `Worker::process` stop, GDB understands `this` and the object's members. You can inspect `print *this` and save the counter address with `set $counter = &this->completed`. A separate investigation can use `watch -location *$counter` and continue to the write. Keep the object alive and delete the watchpoint when its lifetime ends.

A watchpoint can establish which instruction changes a watched value. It has hardware size/count limits and may fall back to expensive software stepping. It does not retrospectively identify an earlier overwrite. This workload does not intentionally corrupt memory; its expected increment is not a vulnerability demonstration.

For a real fault, preserve the exact binary and inspect `bt full`, `info frame`, `info proc mappings`, and `print $_siginfo` when signal information is available. Compare the fault address and access with actual mappings. A failed unwind, unusual register, canary failure, and stack exhaustion are different observations. A sanitizer report or a watchpoint catching the relevant write provides stronger evidence than an unfamiliar-looking backtrace alone.

## 5. Attach and remote debugging are separate measurements

With an already running process, use its exact executable and `gdb ./build/event_pipeline -p "$LAB_PID"`. `info threads` maps debugger numbers to target thread IDs; `thread apply all bt 15` gathers bounded stacks. Normal attach stops the target. Use `detach` to resume it, and keep debugger-affected timestamps separate from a baseline.

For a remote target, preserve executable/debug identity, target architecture support, and source-path mapping. The [runtime latency guide](calisma-zamani-gecikmesi.md#2-use-gdb-for-identity-and-call-relationships) provides an SSH-stdio gdbserver example. `set substitute-path` changes source lookup; it cannot repair a mismatched executable. IDE frontends have the same identity and mapping requirements. A breakpoint resolving to the intended function and source line is the check, rather than a successful connection alone.

For the full target/workstation workflow, matching artifacts, source and library paths, and CLion/VS Code settings, continue with [remote GDB setup](gdb-uzak-hedef.md).

For a side-by-side member call and C-linkage wrapper, see [Function ABIs and binary compatibility](abi.md#observe-a-c-member-and-a-c-linkage-wrapper).

## Sources

- [GDB C++ expressions](https://sourceware.org/gdb/current/onlinedocs/gdb.html/C-Plus-Plus-Expressions.html) documents member access and `this`.
- [GDB backtraces](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html), [machine-code inspection](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html), and [watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html) explain the observation boundaries.
- [System V x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI) defines argument classification for that target.
- [GDB attach/detach](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Attach.html) documents process stopping and release.
