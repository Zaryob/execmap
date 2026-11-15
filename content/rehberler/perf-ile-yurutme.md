---
title: Execution analysis and hardware tracing with perf
---

# Execution analysis and hardware tracing with perf

Static disassembly does not always reveal a binary's actual runtime behavior. Profiling helps identify hot paths in programs with complex branches, dynamic function pointers, and indirect calls.

Linux **perf** collects PMU counter and tracepoint data. Cost, time resolution, and coverage depend on the event type, CPU, kernel, perf build, and buffer settings. This guide concerns Linux perf; the Intel PT section also requires supported Intel hardware.

New to performance analysis? Read [performance analysis from zero](performans-analizine-giris.md) first for installation, permissions, and the on-CPU/off-CPU distinction, then return here. The hands-on companion is the [CPU profiling and flame graph lab](../laboratuvarlar/cpu-profili.md).

## 0. perf in five commands

perf is one program with many subcommands. A beginner needs five:

| Command | What it does | Technique |
| --- | --- | --- |
| `perf list` | lists the events this machine can count or sample | — |
| `perf stat ./prog` | counts events for the whole run and prints totals | counting |
| `perf top` | live, system-wide view of the hottest functions | sampling |
| `perf record -g ./prog` | samples the program into `perf.data` | sampling |
| `perf report` / `perf annotate` | reads `perf.data`: by function / by instruction | analysis |

Everything else (`perf trace`, `perf sched`, `perf diff`, `perf script`) builds on these.

### Events

`perf list` groups events into kinds. **Hardware events** such as `cycles`, `instructions`, `cache-misses`, and `branch-misses` come from the CPU's performance monitoring unit (PMU). **Software events** such as `task-clock`, `context-switches`, and `page-faults` are counted by the kernel and work everywhere, including most virtual machines. **Tracepoints** such as `sched:sched_switch` or `syscalls:sys_enter_openat` are named kernel events, the same ones bpftrace uses.

```bash
perf list hw
perf list sw
perf list 'sched:*'
```

### Reading perf stat

```bash
perf stat -r 3 ./ornek
```

The output has one line per event. The fields that matter first:

- **`task-clock` … `CPUs utilized`**: CPU time used, and the average number of CPUs busy during the run. About 1.0 for a single busy thread, close to 0 for a program that mostly waits.
- **`context-switches`**: how often threads left the CPU. Many switches with low CPU use point to waiting.
- **`page-faults`**: memory pages touched for the first time or brought in from disk.
- **`cycles`, `instructions`, `insn per cycle`**: instructions per cycle (IPC) indicates how efficiently the CPU executes; low IPC often means waiting for memory. These need a PMU.
- **`+- 1.23%`**: with `-r`, the variation between repeated runs.
- **`(66.67%)` at the end of a line**: the event was only counted for that share of the time because more events were requested than the PMU has counters (multiplexing); perf scales the value. Request fewer events for exact counts.
- **`<not supported>` or `<not counted>`**: the event is unavailable here. That is not zero.

### Call graphs and symbols

`perf record -g` uses the frame-pointer chain by default. Two alternatives exist when frame pointers are missing:

```bash
perf record --call-graph dwarf ./ornek    # copies stack memory, unwinds later with debug info; large files
perf record --call-graph lbr ./ornek      # hardware last-branch record; supported Intel CPUs only, short depth
```

perf turns addresses into names with the symbol tables and debug information of the binaries that were running. Keep the same files in place until you have run `perf report`; rebuilding the program before reporting breaks symbol resolution. Use `perf report --sort dso,symbol` to see which binary or library each sample belongs to, and `perf buildid-list` to see which builds were recorded.


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

This guide shows no numerical report of its own; the [CPU profiling lab](../laboratuvarlar/cpu-profili.md) produces one with expected results you can check. Save your report with `perf report --stdio`. `[.]` denotes user-space symbols and `[k]` kernel symbols. `Self` is the function's own share of the selected event, which need not measure wall-clock time. `Children` can include cumulative descendant contributions, causing overlap between rows. `caller` indicates caller orientation; do not read that tree as a list of callees. Call-chain accuracy depends on frame-pointer/DWARF methods and the build.

### Flame graphs

A flame graph draws all sampled stacks at once: width is the share of samples, height is stack depth, and the x-axis is sorted alphabetically, not by time. The usual pipeline uses Brendan Gregg's scripts:

```bash
perf script > out.perf
./FlameGraph/stackcollapse-perf.pl out.perf > out.folded
./FlameGraph/flamegraph.pl out.folded > out.svg
```

Look for wide plateaus at the top: those functions were executing themselves, not just calling others. The [CPU profiling lab](../laboratuvarlar/cpu-profili.md) walks through a complete example, including reading the folded text.

### perf for waiting, not just computing

Sampling CPU cycles cannot see a sleeping thread. For programs that wait, two perf tools trace instead of sampling:

```bash
sudo perf trace -s ./ornek           # per-thread system call counts and times
sudo perf sched record ./ornek       # scheduler events
sudo perf sched latency              # per-task scheduling delay summary
```

The [debugging playbook](debug-is-akisi.md) and [scheduler timelines](zamanlayici-izleri.md) explain how to interpret them.

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

Use the [runtime latency guide](calisma-zamani-gecikmesi.md) and [timing laboratory](../laboratuvarlar/zamanlama-ve-bekleme.md) for a reproducible sleep/busy comparison and `perf sched` wait-time versus runnable-delay analysis.

Continue with [events with eBPF](ebpf-ile-olaylar.md) for syscall and user-function observation. Read [observer effects](analiz-aracinin-etkisi.md) to understand how analysis tools can be detected by a target.

## Sources

- [Linux Kernel: perf security documentation](https://docs.kernel.org/admin-guide/perf-security.html)
- [Intel PT Documentation — Linux Kernel](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)
- [Brendan Gregg: Linux perf Examples](https://www.brendangregg.com/perf.html)
- [Brendan Gregg: Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [perf wiki tutorial](https://perfwiki.github.io/main/tutorial/)
- [perf-stat(1)](https://man7.org/linux/man-pages/man1/perf-stat.1.html) and [perf-record(1)](https://man7.org/linux/man-pages/man1/perf-record.1.html)
