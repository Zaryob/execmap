---
title: Reading routes and study map
---

# Reading routes and study map

`execmap` provides a learning path from the byte layout of a binary through kernel memory mapping, reverse engineering methods, and runtime hardware observation.

Choose one of the three main routes according to your experience and interests.

## Preparation: from C to assembly

If you understand basic C functions and pointers but are new to disassembly, begin here. The experiments share a Linux x86-64 target and the System V AMD64 ABI.

1. **[Preparing to read assembly](rehberler/assembly-okuma.md)**: Register widths, Intel/AT&T syntax, address calculation, the stack, and argument passing. Milestone: distinguish `lea` from a memory read, and pointer size from access width.
2. **[A first GDB investigation](laboratuvarlar/gdb-ilk-inceleme.md)**: Stop at the exact function entry and follow a store through a pointer. Milestone: explain the 7 → 12 change and the result of 16 after changing one argument.
3. **[Branches and pointers](laboratuvarlar/dallanma-ve-pointer.md)**: `-O0`/`-O2` data flow and watchpoints. Milestone: test result equality over 2001 valid inputs and explain why a source-level `if` does not require a `jcc` instruction.

This sequence draws on the small-program approach of the [mytechnotalent/Reverse-Engineering](https://github.com/mytechnotalent/Reverse-Engineering#x64-course) course directory. The experiments here are original; technical contracts are tied to Intel, psABI, GCC, and GDB sources. The [education section of the resource library](kaynak-kutuphanesi.md#7-assembly-and-reverse-engineering-preparation) explains those roles. Continue with Route 02, or Route 01 for the file/memory relationship.

---

## Route 01: from file to memory — ELF and loading

Study how the operating system reads binaries, the distinction between segments and sections, linker layout, and startup before `main()`. This is a starting point for systems programmers and readers interested in low-level mechanisms.

1. **[Following ELF from file to memory](rehberler/elf-dosyadan-bellege.md)**: Headers, program headers, section headers, and virtual memory offset calculations.
2. **[Validating ELF parsers and address calculations](rehberler/elf-parser-ve-adresler.md)**: Parser differences, segment checks with `pyelftools`, and range overflows.
3. **[Reading linker layout and memory maps](rehberler/linker-duzeni.md)**: Input/output sections, VMA versus LMA, linker scripts, and map files.
4. **[Program startup and auxv](rehberler/baslangic-ve-auxv.md)**: The initial stack, `_start`, and the auxiliary vector bridge.
5. **[Dynamic linking: GOT and PLT](rehberler/dinamik-baglama.md)**: Lazy binding, relocation types, and RELRO.

> **Practice laboratories**:
> - [Symbol selection and LD_PRELOAD](laboratuvarlar/sembol-secimi.md)
> - [Separating and reconnecting debug information](laboratuvarlar/debug-bilgisi.md)

---

## Route 02: from names to behavior — reverse engineering

Interpret stripped binaries, distinguish logic and security patches between versions, and investigate packers and in-memory loaders. This route is intended for security researchers and reverse engineers.

If you are new to assembly and debuggers, complete the three preparation steps above first.

1. **[C++ call-chain debugging](rehberler/cpp-cagri-zinciri.md)**: Inspect generic member calls and object state; distinguish a synchronous stack from a queued thread handoff.
2. **[Making sense of stripped ELF files](rehberler/stripped-elf.md)**: Recover candidate function boundaries and prologues using `.eh_frame` CFI records.
3. **[Binary diffing](rehberler/ikili-fark-analizi.md)**: Analyze patches through basic blocks and call graph topology.
4. **[Custom loaders and in-memory execution](rehberler/ozel-yukleyiciler.md)**: Investigate `memfd_create` and user-space loading mechanisms.
5. **[Packed and encrypted ELF analysis](rehberler/paketli-elf.md)**: High entropy, OEP candidates, tail jumps, and memory dumps.
6. **[Core dumps](rehberler/core-ve-snapshot.md)**: `ET_CORE`, `NT_PRSTATUS` registers, and postmortem analysis with GDB.

> **Practice laboratories**:
> - [Observing a memory permission change](laboratuvarlar/bellek-izinleri.md)
> - [Examining compiler differences and optimization levels](laboratuvarlar/derleme-farklari.md)

For a Linux target on another machine, continue with [remote GDB and IDE setup](rehberler/gdb-uzak-hedef.md). Match the executable and source before configuring CLion or VS Code.

---

## Route 03: observing runtime — profiling and the kernel

Examine a running process with passive and active techniques, investigate anti-analysis behavior, and interpret traces using evidence-aware methods.

1. **[Process, thread, and scheduler state](rehberler/process-thread-ve-zamanlayici.md)**: Establish task identity, cumulative counters, policy, affinity, frequency, and pressure.
2. **[Execution analysis with perf](rehberler/perf-ile-yurutme.md)**: PMU hardware counters, 99 Hz sampling, and instruction-flow reconstruction with Intel PT.
3. **[Runtime events with eBPF](rehberler/ebpf-ile-olaylar.md)**: Uprobes, kprobes, and ring buffers for observing process and kernel events.
4. **[Runtime latency and scheduler delay](rehberler/calisma-zamani-gecikmesi.md)**: Distinguish call intervals, elapsed time, thread CPU time, and runnable waiting on one workload.
5. **[Scheduler timelines](rehberler/zamanlayici-izleri.md)**: Reconstruct sleeping and runnable intervals, inspect raw events, and account for perf version differences.
6. **[Tracing failures and lockups](rehberler/izleme-donmalari.md)**: Preserve recovery evidence and narrow a failing tracing configuration.
7. **[Observer effects and anti-debugging](rehberler/analiz-aracinin-etkisi.md)**: `ptrace` checks, timing effects, and direct syscalls.
8. **[Interpreting runtime traces](rehberler/izleri-yorumlamak.md)**: Observation, hypothesis, evidence, and correlation across telemetry sources.

Complete the **[timing and waiting laboratory](laboratuvarlar/zamanlama-ve-bekleme.md)** to compare sleep/busy modes, validate invocation identities, and repeat with a period shorter than the work. The milestone is explaining which measured interval changed without assuming a scheduler root cause.

Then use **[six-point event correlation](laboratuvarlar/olay-akisini-eslestirme.md)** to follow one invocation across direct and queued calls. Complete **[thread counter sampling](laboratuvarlar/thread-sayaclari.md)** to measure a bounded task window without tracing. The milestone is distinguishing application queueing from runnable waiting and unavailable counters from measured zero.

Then write and inspect [function probes](laboratuvarlar/fonksiyon-problari.md), checking entry/return counts and the first missing entry interval. Finish with [a scheduler timeline](laboratuvarlar/zamanlayici-zaman-cizelgesi.md), manually pairing switch-out, wakeup, and switch-in before comparing perf reports.

---

## Next step

Visit the [resource library](kaynak-kutuphanesi.md) for detailed references and articles connecting these topics.
