---
title: Investigating tracing failures and system lockups
---

# Investigating tracing failures and system lockups

A machine becoming unresponsive while a tracer runs is an observation. It does not identify a faulty PMU, probe, driver, kernel path, or application. Preserve the exact capture and recovery evidence before choosing a cause. This guide describes investigation; it does not deliberately reproduce a known host freeze.

## 1. Describe the failure boundary

Distinguish a blocked target, an unresponsive tracer, loss of SSH, a stalled desktop, and a kernel-reported lockup. Record whether another CPU, serial console, or independent machine could still communicate. Preserve the command, stderr, time window, reboot/recovery method, kernel build, CPU architecture, tracer version, and loaded tracing components.

The [kernel watchdog documentation](https://www.kernel.org/doc/html/latest/admin-guide/lockup-watchdogs.html) distinguishes soft lockups from hard lockups and explains that detection depends on configuration. A disconnected terminal alone establishes neither. Absence of a watchdog message does not exclude a kernel failure.

## 2. Recover evidence before rerunning

After recovery, use these read-only commands on a system with systemd's journal:

```bash
mkdir -p results/lockup-review
uname -a > results/lockup-review/kernel.txt
journalctl --list-boots > results/lockup-review/boots.txt
journalctl -k -b -1 --no-pager > results/lockup-review/previous-kernel.txt
ls -al /sys/fs/pstore > results/lockup-review/pstore-list.txt
```

`--list-boots` identifies retained boots. `-k -b -1` requests the previous boot's kernel messages; inspect its boot identity against the incident. Journals can be volatile, inaccessible, or end before the failure. `/sys/fs/pstore` can hold persistent crash records when a supported backend was configured. An empty directory is not evidence that nothing happened. Preserve readable records as files without deleting the originals.

Also retain existing serial-console, netconsole, hypervisor, or kdump artifacts. These channels must be prepared beforehand if local storage cannot survive a failure. Configuring recovery and crash dumping belongs to the host's operational setup; a userspace `timeout` cannot guarantee recovery from a kernel lockup.

## 3. Separate the frontend from its collection backend

A tool name does not specify the mechanism. A perf command can request hardware PMU events, software counters, tracepoints, or callchain capture. A probe tool can use user or kernel probes and output through buffered transport. Symbolization and DWARF unwinding introduce additional work beyond recording an event.

Save `perf --version`, `bpftrace --version`, `perf list`, the exact event selection, frequency, callgraph mode, attachment scope, and command output. Record any effective configuration printed by a wrapper, rather than assuming its default. Do not interpret an unsupported event or a permissions failure as a zero count.

## 4. Build a minimal comparison on a disposable test target

Once recovery is available, use the same finite generic workload for each comparison. Start with its own buffered application markers. Test one additional mechanism at a time: a software counter without stacks, one scheduler tracepoint, one hardware event without stacks if supported, one userspace function probe, and finally callchain collection. These are distinct branches of an investigation, not a requirement to run every mechanism after a failure.

For every step, record the exact command, duration, target identity, success/error status, lost records, and whether the target completed normally. Preserve the first failing configuration and its nearest successful comparison. If a particular mechanism already caused a host freeze, move that comparison to an isolated target with recovery; do not repeat it on the affected working machine.

A hardware-event failure with successful software counting narrows the comparison, but does not prove defective hardware. Adding stacks changes several costs, including capture size and unwinding. Vary one property at a time and retain the raw evidence needed for someone else to reproduce the boundary.

## 5. Continue with a measurable question

Use [thread counters](../laboratuvarlar/thread-sayaclari.md) for a bounded procfs observation, [function probes](../laboratuvarlar/fonksiyon-problari.md) for a visible entry/return measurement, or [scheduler timelines](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md) for task transitions on a supported test host. Each lab states its dependencies and what an unavailable capability means.

A useful report says what ran, what failed, what remained responsive, which evidence survived, and which interpretation is still uncertain. Historical production anecdotes and unrelated task names do not establish the cause of the current failure.

## Sources

- [Kernel lockup watchdogs](https://www.kernel.org/doc/html/latest/admin-guide/lockup-watchdogs.html) defines detector behavior and dependencies.
- [journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html) documents boot and kernel-message selection.
- [Kernel ramoops](https://docs.kernel.org/admin-guide/ramoops.html) describes one persistent crash-log backend.
- [Kernel kdump](https://docs.kernel.org/admin-guide/kdump/kdump.html) documents crash-dump prerequisites.
