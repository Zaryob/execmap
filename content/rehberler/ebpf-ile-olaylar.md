---
title: Observing runtime events with eBPF
---

# Observing runtime events with eBPF

Traditional tools such as `gdb` and `strace` use `ptrace()` to stop processes and inspect execution or system calls. Malware and protected binaries may detect this relationship, stop running, or follow decoy paths.

**eBPF** collects events through programs verified by the Linux kernel. It can observe syscall tracepoints or user functions without creating a ptrace relationship, but this does not guarantee invisibility or zero cost. Uprobes, tracepoints, and kprobes are distinct mechanisms. Linux v6.12 x86 uprobes can place a `0xcc` software breakpoint in the target address space ([opcode definition](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/uprobes.h), [implementation](https://github.com/torvalds/linux/blob/v6.12/kernel/events/uprobes.c)).

## 1. Tracepoints, kprobes, and uprobes

eBPF can attach observation programs at different system layers:

```text
User space
  [Target: ornek] -----------> [libc.so / malloc]
         |                             |
         v (uprobe)                    v (uprobe)
+-------------------------------------------------------+
| Linux kernel                                          |
|                                                       |
| [Syscalls] -------> Tracepoint: sys_enter_mmap          |
| [VFS / files] ----> Kprobe: vfs_read                    |
| [Memory] ---------> Kprobe: do_mprotect_pkey            |
|                                                       |
| +---------------------------------------------------+ |
| | eBPF program (kernel-verified bytecode)             | |
| +---------------------------------------------------+ |
|                         |                             |
|                         v BPF ring buffer             |
+-------------------------------------------------------+
                          |
                          v
User-space observer (bpftrace / libbpf / EDR)
```

- **Tracepoints**: Statically defined kernel event points, such as `tracepoint:syscalls:sys_enter_mprotect`.
- **Kprobes / kretprobes**: Dynamic probes at supported kernel locations, subject to prohibited locations and configuration limits.
- **Uprobes / uretprobes**: Kernel-managed probes for locations or symbols in a user executable or shared library.

## 2. Practical bpftrace scenarios

These examples require Linux syscall tracepoints, appropriate BPF privileges, and bpftrace. First record `bpftrace --version`, `uname -r`, and `sudo bpftrace -lv "tracepoint:syscalls:sys_enter_mprotect"`. Confirm field names in that output; measure overhead and dropped records separately.

### Scenario A: processes mapping anonymous memory and changing permissions

The script below observes `mmap` and `mprotect`, calls often involved in packing and shellcode allocation:

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_mprotect /comm == "ornek"/ {
    printf("[PID %d] mprotect(addr=0x%lx, len=%lu, prot=0x%x)\n",
           pid, args.start, args.len, args.prot);
}
'
```

The output **schema**, not an executed trace:

```text
[PID <pid>] mprotect(addr=0x<address>, len=<length>, prot=0x<permissions>)
```

On Linux, `prot=0x5` requests READ|EXEC. An entry event does not establish success or execution; correlate the `sys_exit_mprotect` result with the same thread. A `comm` filter matches a name; use a PID filter to distinguish processes sharing that name.

### Scenario B: attaching a uprobe in a stripped binary

Check how your bpftrace version interprets numeric uprobe addresses: a virtual address and a file offset need not have the same numeric value. Here `0x1140` is an illustrative location converted into the address form expected by the version in use. Verify the instruction boundary and attachment result in the actual file. `reg("di")` is specific to x86-64:

```bash
# After verifying the location for the file and bpftrace version:
sudo bpftrace -e '
uprobe:/usr/bin/ornek:0x1140 {
    printf("Target function called! RDI argument: %d\n", reg("di"));
}
'
```

## 3. Observer effects and detection limits

Tools have different effects. `LD_PRELOAD` changes loaded objects and symbol selection; ptrace-based tools establish a tracing relationship and may stop the process.

Assess eBPF observation by attachment type. Tracepoints, kprobes, and uprobes are not the same mechanism; uprobes may use breakpoints at target instructions. `TracerPid: 0` only tests a ptrace relationship and does not exclude other observation methods. Event production, buffer occupancy, and consumer speed can affect timing.

## 4. eBPF misuse and evasion

BPF capabilities depend on program type, permissions, and kernel configuration. For example, [bpf-helpers(7)](https://man7.org/linux/man-pages/man7/bpf-helpers.7.html) documents conditions and limits for `bpf_probe_write_user`. Inspect existing programs when interpreting an event record.

Use `bpftool` to inspect the system's BPF programs and maps:

```bash
# List BPF programs loaded on the system:
sudo bpftool prog list
```

## Investigate further

Read [observer effects](analiz-aracinin-etkisi.md) to understand how targets detect analysis tools. Continue with [interpreting traces](izleri-yorumlamak.md) to connect records to properly bounded hypotheses.

## Sources

- [Kernel: libbpf overview](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)
- [Kernel: BPF ring buffer](https://docs.kernel.org/bpf/ringbuf.html)
- [Kernel: Uprobe-tracer documentation](https://docs.kernel.org/trace/uprobetracer.html)
- [bpftrace Reference Guide](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
