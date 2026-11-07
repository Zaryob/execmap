---
title: Interpreting runtime traces and forensic methodology
---

# Interpreting runtime traces and forensic methodology

A dangerous mistake in binary analysis is treating a single observation or tool output as the final truth. A line in a `strace` log, a register value in `gdb`, or a percentage in `perf` can lead to the wrong conclusion without context and a sound method.

Reverse engineering benefits from the principles of **hypothesis formation, falsifiability, and independent validation**.

## 1. Common analytical traps

Watch for these methodological errors:

- **“mprotect made the region RX, so code ran there.”** Execute permission is not an execution record. Control transfer to that address must be verified separately.
- **“There is no perf sample, so the function was not called.”** Sampling can miss brief or rare execution. Absence of evidence is not evidence of absence.
- **“The binary contains `/bin/sh`, so it launches a shell.”** A string may be dead data or a decoy. Verify its consuming code path and the actual call.

## 2. Correlating multiple telemetry sources

For a reliable finding, look for agreement between independent observations from at least two layers:

```text
+----------------------------------+
              | Hypothesis: the process executes |
              | code created in memory           |
              +----------------------------------+
                               |
        +----------------------+----------------------+
        |                                             |
        v                                             v
[Static / memory analysis]                 [Dynamic event observation]
Is an anonymous executable                Were mmap/mprotect events
mapping visible in /proc/<pid>/maps?       recorded with eBPF?
        |                                             |
        +----------------------+----------------------+
                               |
                               v
                [Hardware execution evidence]
                Did Intel PT or a perf sample
                record RIP in the relevant page?
                               |
                               v
                [A finding with a defined scope]
```

## 3. A step-by-step forensic workflow

Use the following analysis protocol:

### Step 1: a clean, isolated environment

Analyze untrusted binaries in a clean VM or container with an appropriate isolation policy, disconnected networking where required, and a saved baseline or snapshot.

### Step 2: static inventory and hashing

Record the file's SHA-256 hash to establish identity. Extract its ELF header, segments, architecture, and external dependencies:

```bash
sha256sum ./supheli_ikili
readelf -h -lW ./supheli_ikili
```

### Step 3: kernel-level observation

Use `bpftrace` and `perf` for initial observations. Record probe types, sampling and loss limits, and observation cost. Account for the possibility that a uprobe inserts a breakpoint at the target instruction:

- Which system calls occur?
- Where does the process write in the filesystem?
- Does it attempt to open network sockets?

### Step 4: active debugging and hypothesis testing

Target suspicious functions and addresses with GDB. Set breakpoints and examine parameters and return values step by step.

### Step 5: reporting findings

Document each claim, such as “this binary performs memory injection,” together with supporting logs, memory addresses, and command output.

## Investigate further

Return to the [memory permissions laboratory](../laboratuvarlar/bellek-izinleri.md) to test these distinctions using C and `mprotect`. Complete the [compiler differences laboratory](../laboratuvarlar/derleme-farklari.md) to see how optimization can mislead analysis.

## Sources

- [Brendan Gregg: Systems Performance: Enterprise and the Cloud](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)
- [Linux man-pages: proc_pid_status](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [NIST Special Publication 800-86: Guide to Integrating Forensic Techniques into Incident Response](https://csrc.nist.gov/publications/detail/sp/800-86/final)
