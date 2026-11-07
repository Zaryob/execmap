---
title: Core dumps and process memory snapshots
---

# Core dumps and process memory snapshots

On Linux, some signals have a default action that produces a core dump. Generation depends on permissions, dumpable state, resource limits, and the `core_pattern` handler. `coredump_filter` and `MADV_DONTDUMP` limit memory coverage. An ELF `ET_CORE` dump contains selected process memory and notes such as thread registers; it is not necessarily a complete copy of memory ([core(5)](https://man7.org/linux/man-pages/man5/core.5.html)).

For reverse engineering and forensics, a core can preserve decrypted strings, injected shellcode, library mappings, and stack state at the moment of a crash.

## 1. Inside an ELF core file

An `ET_CORE` file differs from an executable (`ET_EXEC` or `ET_DYN`):

- It usually **has no section header table** (`e_shnum = 0`).
- Linux process cores generally use **`PT_LOAD`** for memory ranges and **`PT_NOTE`** for process/thread information; details depend on the producer.

```text
+-------------------------------------------------------+
| ELF core header (e_type = ET_CORE)                     |
+-------------------------------------------------------+
| PT_NOTE: metadata                                     |
|   NT_PRSTATUS : Registers (RIP, RSP, RAX...), PID       |
|   NT_PRPSINFO : Process name, arguments, UID/GID       |
|   NT_AUXV     : Initial auxiliary vector              |
|   NT_FILE     : Mapped file information               |
|   NT_SIGINFO  : Signal details                        |
+-------------------------------------------------------+
| PT_LOAD 1: Stack memory                               |
+-------------------------------------------------------+
| PT_LOAD 2: Heap memory                                |
+-------------------------------------------------------+
| PT_LOAD N: Anonymous / RWX memory pages                |
+-------------------------------------------------------+
```

### Reading core notes with readelf

Inspect core metadata with `readelf -n`:

```bash
readelf -n ./core
```

GNU binutils `readelf -n` shows note owners, types, and sizes; do not expect it to provide a detailed `NT_PRSTATUS` register dump. In a core without sections, note locations are reported as file offsets. `eu-readelf -n` from elfutils can decode more detail; use the GDB commands below for registers. No Linux core was generated and measured during this revision; outputs from different tools are not presented as one combined example.

## 2. Postmortem analysis with GDB

Load a crash dump into GDB together with its original executable:

```bash
gdb ./ornek ./core
```

Useful forensic commands in the GDB session include:

```bash
# 1. Show the crashing function and source line (backtrace)
(gdb) bt full

# 2. List processor registers
(gdb) info registers

# 3. Disassemble around the instruction at the crash
(gdb) x/10i $rip - 15

# 4. Display process mappings (files and anonymous memory)
(gdb) info proc mappings

# 5. Inspect local variables in the stack frame
(gdb) info locals
```

## 3. Snapshotting a live process with gcore

Use `gcore` to record selected memory state from an accessible live process without waiting for it to crash:

```bash
# Take a memory snapshot of process 4821:
gcore -o snapshot 4821
```

A successful command creates `snapshot.4821`; GDB may attach to and stop the target, then detach. The pause affects timing, and resource or access restrictions may cause failure. Check the GDB version's behavior for an already stopped process and its gcore filter settings.

### Extracting unpacked code as raw bytes

Once packed code has been unpacked in memory, use GDB to dump the relevant virtual address range to disk:

```bash
gdb -p $PID --batch --eval-command="dump memory acilmis_kod.bin 0x55d1a2001000 0x55d1a2003000"
```

The resulting file contains the raw bytes in that range; these may also include data or still-packed content. Import it into an analysis tool with the correct architecture and base address. ELF metadata is not added automatically.

## 4. Advanced reconstruction: ECFS and CRIU

A standard core is an analysis input, not a runnable executable or a general checkpoint. Restoring file descriptors, sockets, and external resources requires additional work.

- **[ECFS](https://github.com/elfmaster/ecfs)** enriches the Linux core format with section, symbol, and relocation information for analysis. It depends on live-process and `/proc` data; its README also records problems with snapshot helpers. Core-to-executable reconstruction is associated with the separate **[ecfs_exec](https://github.com/elfmaster/ecfs_exec)** research prototype.
- **[CRIU](https://github.com/checkpoint-restore/criu)** is a Linux process checkpoint/restore project, not a historical continuation of ECFS. Check supported resources, kernel features, privileges, and source/target compatibility. It does not guarantee that every process can be restored on another server with identical timing ([CRIU README](https://github.com/checkpoint-restore/criu/blob/criu-dev/README.md)).

## Investigate further

Read [execution analysis with perf](perf-ile-yurutme.md) for hardware-level performance and execution-path observation. See [events with eBPF](ebpf-ile-olaylar.md) for kernel and user-space events across the system.

## Sources

- [core — Linux man-pages (man 5 core)](https://man7.org/linux/man-pages/man5/core.5.html)
- [gcore — Generate a core file of a running program](https://man7.org/linux/man-pages/man1/gcore.1.html)
- [ECFS — Extended Core File Snapshot Architecture (Ryan O'Neill)](https://github.com/elfmaster/ecfs)
- [CRIU — Checkpoint/Restore in Userspace](https://github.com/checkpoint-restore/criu)
- [LIEF — Library to Instrument Executable Formats](https://github.com/lief-project/LIEF)
