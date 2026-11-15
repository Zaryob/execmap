---
title: CPU profiling and flame graphs with perf
language: C
---

# CPU profiling and flame graphs with perf

Find out where a C program spends its CPU time, starting from nothing more than "it is slow". You will measure it with `time` and `perf stat`, sample it with `perf record`, read the report two ways, draw a flame graph, look at the hot instructions, fix the problem, and prove the fix with the same tools.

The program contains a deliberate mistake: it searches a sorted array linearly for every query, which makes the lookup stage quadratic. The point is not the bug, which you can see in the source, but learning how the tools reveal it when you cannot.

## Before you start

You need Linux on x86-64 or arm64, GCC or Clang, `perf` matching your kernel, and Git to download the flame graph scripts. Read [performance analysis from zero](../rehberler/performans-analizine-giris.md) for installation and permissions. Hardware counters may be missing in containers and some virtual machines; the steps that need them say so, and the rest still works with the software clock.

```bash
mkdir -p cpu-profile && cd cpu-profile
uname -r > env.txt
perf --version >> env.txt
cat /proc/sys/kernel/perf_event_paranoid >> env.txt
```

## 1. The program

Save this as `hotspot.c`. It has four stages, each in its own non-inlined function so that every stage gets a name in the profile. It also measures each stage with its own clock and prints the times to standard error: you will compare perf's view with the program's own view.

```c hotspot.c
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

/* A tiny deterministic generator: every run performs the same work. */
static unsigned next_value(unsigned *state) {
    *state = *state * 1103515245u + 12345u;
    return *state >> 8;
}

__attribute__((noinline)) void fill_ids(unsigned *ids, size_t n) {
    unsigned state = 42;
    for (size_t i = 0; i < n; i++)
        ids[i] = next_value(&state);
}

static int compare_unsigned(const void *a, const void *b) {
    unsigned x = *(const unsigned *)a, y = *(const unsigned *)b;
    return (x > y) - (x < y);
}

__attribute__((noinline)) void sort_ids(unsigned *ids, size_t n) {
    qsort(ids, n, sizeof ids[0], compare_unsigned);
}

/* Slow version: scans the array from the start for every key. */
__attribute__((noinline)) long find_linear(const unsigned *ids, size_t n, unsigned key) {
    for (size_t i = 0; i < n; i++)
        if (ids[i] == key)
            return (long)i;
    return -1;
}

/* Fixed version: the array is already sorted, so binary search is enough. */
__attribute__((noinline)) long find_binary(const unsigned *ids, size_t n, unsigned key) {
    size_t lo = 0, hi = n;
    while (lo < hi) {
        size_t mid = lo + (hi - lo) / 2;
        if (ids[mid] < key) lo = mid + 1;
        else hi = mid;
    }
    return (lo < n && ids[lo] == key) ? (long)lo : -1;
}

__attribute__((noinline)) unsigned long lookup_all(const unsigned *ids, size_t n, int fixed) {
    unsigned state = 7;
    unsigned long found = 0;
    for (size_t q = 0; q < n; q++) {
        /* Odd queries ask for a key that exists; even queries use a fresh value. */
        unsigned key = (q % 2) ? ids[(q * 7919) % n] : next_value(&state);
        long at = fixed ? find_binary(ids, n, key) : find_linear(ids, n, key);
        if (at >= 0)
            found++;
    }
    return found;
}

__attribute__((noinline)) unsigned long checksum(const unsigned *ids, size_t n, int rounds) {
    unsigned long sum = 0;
    for (int r = 0; r < rounds; r++)
        for (size_t i = 0; i < n; i++)
            sum = sum * 31 + (ids[i] ^ (unsigned)r);
    return sum;
}

int main(int argc, char **argv) {
    size_t n = argc > 1 ? strtoul(argv[1], NULL, 10) : 40000;
    int fixed = argc > 2 && strcmp(argv[2], "fixed") == 0;
    unsigned *ids = malloc(n * sizeof *ids);
    if (n == 0 || !ids) {
        fprintf(stderr, "usage: %s [count>0] [slow|fixed]\n", argv[0]);
        return 2;
    }
    double t0 = now_ms();
    fill_ids(ids, n);
    double t1 = now_ms();
    sort_ids(ids, n);
    double t2 = now_ms();
    unsigned long found = lookup_all(ids, n, fixed);
    double t3 = now_ms();
    unsigned long sum = checksum(ids, n, 2000);
    double t4 = now_ms();
    printf("mode=%s n=%zu found=%lu checksum=%lu\n", fixed ? "fixed" : "slow", n, found, sum);
    fprintf(stderr, "fill=%.1fms sort=%.1fms lookup=%.1fms checksum=%.1fms\n",
            t1 - t0, t2 - t1, t3 - t2, t4 - t3);
    free(ids);
    return 0;
}
```

Build an optimized binary that keeps debug information and frame pointers:

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer hotspot.c -o hotspot
```

`-O2` keeps the build realistic. `-g` lets perf map addresses to function names and source lines. `-fno-omit-frame-pointer` keeps the frame-pointer chain that perf's default call-graph mode walks.

## 2. Measure before profiling

```bash
time ./hotspot
```

The output has the shape:

```text
fill=0.1ms sort=3.3ms lookup=318.6ms checksum=58.7ms
mode=slow n=40000 found=20051 checksum=7322226836377315584
real    0m0.39s
user    0m0.38s
sys     0m0.00s
```

These numbers come from one reference run on a different machine; yours will differ with the CPU and operating system. Three things should hold everywhere:

- `found=20051` and the checksum are identical on every run and in both modes: they are the correctness check for the fix.
- `real` is close to `user`: one thread was busy the whole time. This is an **on-CPU** problem, so a CPU profiler is the right tool.
- The program's own timer says `lookup` dominates. Keep that number; perf should agree with it.

Now count events with `perf stat`, repeating five times to see the variation:

```bash
perf stat -r 5 ./hotspot > /dev/null
```

Read these lines in the output:

- `task-clock` and `CPUs utilized`: about 1.0 CPUs utilized confirms a single busy thread.
- `context-switches` and `page-faults`: small numbers. The program is not waiting or allocating much.
- `cycles`, `instructions`, and `insn per cycle`: the hardware view. If they show `<not supported>`, your environment does not expose the PMU; continue anyway.
- `+- x.xx%` after each value: the run-to-run variation. A later improvement must be larger than this.

## 3. Record samples

```bash
perf record -F 999 -g -o slow.data ./hotspot
```

- `-F 999` asks for about 999 samples per second. The program runs for less than half a second; 99 Hz would give only a few dozen samples.
- `-g` records the call chain at each sample.
- `-o slow.data` names the output file so you can keep several captures.

perf prints how many samples it wrote. Fewer than a hundred samples is too few to trust small percentages; increase `-F` or run a longer workload (`./hotspot 80000`).

If perf refuses to run, check `perf_event_paranoid` and try with `sudo`. If it warns that kernel symbols are restricted, you will see `[k]` entries without names; that does not affect this user-space exercise.

## 4. Read the report: self time first

```bash
perf report -i slow.data --stdio --no-children | head -n 40
```

`--no-children` sorts functions by **self** samples: the percentage of samples in which that function's own instructions were executing. Expect `find_linear` at the top with a large majority, followed by `checksum`, and small entries for `qsort` internals and `compare_unsigned`.

Check perf against the program: `lookup` took roughly 85 % of the program's own total in the reference run, and `find_linear` should hold a similar share of samples. The two measurements are independent (a clock inside the program versus interrupts from the kernel); agreement makes the finding much stronger than either alone.

## 5. Read the report: children and call paths

```bash
perf report -i slow.data --stdio --children | head -n 60
```

With `--children`, each function also gets the samples of everything it called. `main` is now near 100 % because everything runs under it, and `lookup_all` has its own small self share plus the large share of `find_linear` below it. Expand the call graph lines under `find_linear` and confirm the path `main → lookup_all → find_linear`.

Use the two views for two questions:

| View | Answers |
| --- | --- |
| self (`--no-children`) | which instructions burn the CPU? |
| children (`--children`) | which higher-level operation is expensive, including everything it calls? |

## 6. Draw a flame graph

A flame graph puts every sampled stack side by side: the x-axis is the share of samples (not time order), the y-axis is stack depth, and the width of a box is how often that function was on the stack.

```bash
git clone --depth 1 https://github.com/brendangregg/FlameGraph
perf script -i slow.data > slow.perf
FlameGraph/stackcollapse-perf.pl slow.perf > slow.folded
FlameGraph/flamegraph.pl slow.folded > slow.svg
```

Open `slow.svg` in a browser; it is interactive, so you can click a box to zoom in. You should see a wide `find_linear` plateau above `lookup_all`, and a narrower `checksum` tower beside it. Wide **top edges** are where the CPU time is spent.

`slow.folded` is plain text: one line per unique stack, frames separated by `;`, followed by a sample count. Reading a few lines shows exactly what the picture is drawn from:

```bash
sort -t' ' -k2 -nr slow.folded | head -n 5
```

Recent perf versions can also produce a flame graph directly with `perf script report flamegraph`; that command depends on your perf build and may need extra Python packages.

## 7. Look at the hot instructions

```bash
perf annotate -i slow.data --stdio -s find_linear | head -n 40
```

perf prints the disassembly of `find_linear` with the percentage of samples that landed on each instruction. Expect most samples on a short loop: a load from the array, a compare with the key, a conditional jump back. Samples usually appear on or just after the instruction that was slow to complete, not always on the exact one; read the loop as a whole. The [assembly reading guide](../rehberler/assembly-okuma.md) explains the instructions.

The annotation confirms what kind of problem this is: the CPU is not stalled on something unusual, it is simply executing the loop body an enormous number of times. That is an algorithm problem, not a micro-optimization problem.

## 8. Form a hypothesis and test it before fixing

Hypothesis: lookup time grows with the square of `n`, because each of `n` queries scans up to `n` elements. Prediction: doubling `n` should roughly quadruple lookup time, while `checksum` only doubles.

```bash
./hotspot 20000 > /dev/null
./hotspot 40000 > /dev/null
./hotspot 80000 > /dev/null
```

Compare the `lookup=` and `checksum=` values on standard error. If lookup grows about fourfold per doubling and checksum about twofold, the prediction holds. This test uses no profiler at all, which makes it an independent check.

## 9. Fix it and measure again

The program contains the fix already: the array is sorted, so `find_binary` can be used. Run the fixed mode with the same tools:

```bash
./hotspot 40000 fixed
perf stat -r 5 ./hotspot 40000 fixed > /dev/null
perf record -F 999 -g -o fixed.data ./hotspot 40000 fixed
perf report -i fixed.data --stdio --no-children | head -n 20
```

Check, in order:

1. `found=` and `checksum=` are the same as in slow mode: the fix did not change the result.
2. Total time dropped by much more than the `perf stat` variation.
3. In the new profile, `checksum` is now at the top. Removing one bottleneck reveals the next; whether it is worth optimizing depends on your goal.

Compare the two captures directly:

```bash
perf diff slow.data fixed.data | head -n 30
```

`perf diff` shows percentage shares. `checksum` *grows* in share although its own time did not change; the total got smaller. Always read shares together with absolute time from `perf stat` or the program's own timers.

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| functions appear as hexadecimal addresses | no symbols | build with `-g`, do not strip, keep the binary next to `perf.data` |
| call graph stops at the first frame | frame pointers missing | rebuild with `-fno-omit-frame-pointer`, or try `perf record --call-graph dwarf` |
| `find_linear` missing from the report | it was inlined | check `noinline`; inspect with `nm hotspot \| grep find_` |
| `<not supported>` for cycles | PMU not available (VM or container) | use `-e task-clock`; sampling falls back to a software clock |
| very few samples | short run | raise `-F`, increase `n` |

`--call-graph dwarf` copies part of the stack with every sample and unwinds it later using debug information. It works without frame pointers but produces much larger files.

## What you practised

- Decided on-CPU versus off-CPU from `real` versus `user`.
- Counted with `perf stat`, sampled with `perf record`, read self and children views.
- Drew and read a flame graph and the folded stacks it comes from.
- Confirmed a hotspot with an independent measurement and a scaling prediction.
- Measured a fix and interpreted percentage shifts correctly.

Continue with the [first bpftrace lab](bpftrace-ilk-adimlar.md) to count and time specific events instead of sampling, and read [execution analysis with perf](../rehberler/perf-ile-yurutme.md) for counter details and Intel PT.

## Sources

- [perf-record(1)](https://man7.org/linux/man-pages/man1/perf-record.1.html), [perf-report(1)](https://man7.org/linux/man-pages/man1/perf-report.1.html), [perf-annotate(1)](https://man7.org/linux/man-pages/man1/perf-annotate.1.html), [perf-diff(1)](https://man7.org/linux/man-pages/man1/perf-diff.1.html)
- [Brendan Gregg: CPU Flame Graphs](https://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html)
- [FlameGraph scripts](https://github.com/brendangregg/FlameGraph)
- [perf wiki tutorial](https://perfwiki.github.io/main/tutorial/)
