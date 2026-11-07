---
title: Execution analysis and hardware tracing with perf
---

# Execution analysis and hardware tracing with perf

Static disassembly does not always reveal a binary's actual runtime behavior. Profiling helps identify hot paths in programs with complex branches, dynamic function pointers, and indirect calls.

Linux **perf** collects PMU counter and tracepoint data. Cost, time resolution, and coverage depend on the event type, CPU, kernel, perf build, and buffer settings. This guide concerns Linux perf; the Intel PT section also requires supported Intel hardware.

## 1. Hardware sampling

Rather than stopping at every instruction, perf can use **sampling**.

Samples can be triggered after a given number of PMU events (`-c` period), or at a requested target frequency (`-F`). Records include the program counter and optionally a call chain. “Every million cycles” is not a universal default; the kernel may limit sampling rates.

### Why 99 Hz?

`-F 99` can be a low-cost starting point. Avoiding round periodic frequencies may reduce some aliasing risks, but it does not guarantee unbiased sampling. Compare runtime, sample count, throttling/loss warnings, and repeated captures at other frequencies.

## 2. The perf record / perf report workflow

Record a target's execution profile:

```bash
perf record -F 99 -g -- ./ornek
```

Options:

- `-F 99`: Request a target sampling frequency of 99 Hz for the selected event; measure the achieved rate.
- `-g`: Record call chains for stack unwinding.
- `--`: Separate perf options from the target command and arguments.

After capture, inspect `perf.data` in the terminal:

```bash
perf report -g 'graph,0.5,caller'
```

No perf run was performed in this session, so no numerical report is presented. Save your report with `perf report --stdio`. `[.]` denotes user-space symbols and `[k]` kernel symbols. `Self` is the function's own share of the selected event, which need not measure wall-clock time. `Children` can include cumulative descendant contributions, causing overlap between rows. `caller` indicates caller orientation; do not read that tree as a list of callees. Call-chain accuracy depends on frame-pointer/DWARF methods and the build.

## 3. Intel Processor Trace

Ordinary sampling provides a statistical view, not a record of every instruction. On supported Intel CPUs, **Intel PT** produces compressed control-flow and timing packets. A decoder can reconstruct instruction flow using the correct executable bytes; this does not mean every instruction has its own record or timestamp.

Start Intel PT capture:

```bash
# Record only user-space (//u) branches in the hardware buffer
perf record -e intel_pt//u -- ./ornek
```

Decode the hardware trace into an instruction-oriented disassembly:

```bash
perf script --insn-trace --xed
```

`--xed` requires perf built with Intel XED support; check your version's `perf script -h`. Syntax and output fields depend on perf version. No executed PT dump is presented here.

Intel PT can observe control flow without a ptrace relationship or conventional software breakpoints. It still has performance effects and can generate large AUX data volumes. Full buffers, lost trace, filters, and PSB synchronization can leave gaps. Providing the correct code image is especially difficult for JIT or self-modifying code. Decoding the flow does not record all register/memory state and is not deterministic execution replay. See the [Linux v6.12 perf-intel-pt documentation](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt).

## Investigate further

Continue with [events with eBPF](ebpf-ile-olaylar.md) for syscall and user-function observation. Read [observer effects](analiz-aracinin-etkisi.md) to understand how analysis tools can be detected by a target.

## Sources

- [Linux Kernel: perf security documentation](https://docs.kernel.org/admin-guide/perf-security.html)
- [Intel PT Documentation — Linux Kernel](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)
- [Brendan Gregg: Linux perf Examples](https://www.brendangregg.com/perf.html)
- [Brendan Gregg: Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
