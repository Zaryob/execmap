---
title: Analyzing packed and encrypted ELF files
---

# Analyzing packed and encrypted ELF files

Packers and crypters store a program's original code in compressed or encrypted form and unpack it into memory at runtime. Originally associated with reducing executable size, as with UPX, these techniques are also used to complicate reverse engineering, evade static antivirus signatures, and protect intellectual property.

Static inspection can reveal the unpacking stub, data layout, and possible unpacking mechanism. In-memory analysis may also be necessary. Do not assume every sample unpacks completely at one instant. This guide makes no unverified claim about Burneye's encryption algorithm or historical priority.

## 1. Indicators of packing

A missing section table, few dynamic symbols, unpacking patterns, and high byte entropy are **clues to assess together**. Each can also occur in ordinary binaries. Do not apply UPX PE section names, such as `UPX0`, to all ELF files; examine [UPX's ELF implementation](https://github.com/upx/upx/tree/devel/src).

### A. Shannon entropy

Byte-histogram entropy ranges from 0 to 8 bits per byte. A high value may support a compression or encryption hypothesis, but a universal threshold of 7.2 is not a diagnostic guarantee. Repeating the deterministic sequence `00..ff` gives 8. Single-byte XOR only relabels histogram bins and does not change entropy. Record the selected region, sample size, and calculation.

### B. Dynamic symbols

Few imports may indicate packing, but static linking or a small program can produce the same appearance. Raw `syscall` instructions need not have `.dynsym` entries.

### C. FileSiz / MemSiz

`p_memsz > p_filesz` is normal for `.bss`. A packer can also allocate its destination later with `mmap`; a large difference is neither necessary nor sufficient evidence of packing.

## 2. Unpacking loops and the original entry point

Some unpackers follow this pattern, but staged unpacking, existing RX/RWX regions, and other permission policies are possible:

```text
[Stub starts]
      |
      v
[Allocate memory] (mmap or an existing segment)
      |
      v
[Decrypt / decompress] (XOR / LZMA / aPLib)
      |
      v
[Adjust permissions] (mprotect: RW -> RX)
      |
      v
[Tail jump] -----> jmp *%rax / push %rax; ret
                          |
                          v
                [OEP: original program starts]
```

An investigation may seek the **tail jump** from the unpacker into the original program. In this pattern, the stub restores expected register state and jumps to the original entry point (OEP).

## 3. Finding an OEP candidate with GDB

The following techniques can help investigate a packed file.

### Method A: inspecting permission transitions

RW→RX preserves basic W^X by avoiding simultaneous write and execute permissions. Stricter execmem/W!→X policies may prohibit this transition too. Not every packer needs such a transition.

These **Linux x86-64 GDB steps** do not guarantee OEP recovery and were not run against a packed fixture during this revision:

```text
(gdb) catch syscall mprotect
(gdb) run
# At the GDB “call to syscall” entry stop:
(gdb) set $region = $rdi
(gdb) set $length = $rsi
(gdb) set $protection = $rdx
(gdb) continue
# At the “returned from syscall” exit stop:
(gdb) p/d (long)$rax
```

In multithreaded processes, correlate entry and exit by thread. After a successful return, inspect the saved range using mappings and disassembly, then identify the actual control-transfer target. `finish` runs until return from the current function; it is not a syscall-exit command. `$region` is a page address, not necessarily the OEP. Set a breakpoint only at a verified candidate instruction and compare with a known unpacked program ([GDB catchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Catchpoints.html)).

### Method B: observing unpacking with eBPF

If a program has anti-debugging checks, use kernel-level eBPF observation to capture its `mprotect` calls, PID, and memory address:

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_mprotect /comm == "paketli_ornek"/ {
    printf("mprotect: addr=0x%lx len=%lu prot=0x%x\n", args.start, args.len, args.prot);
}'
```

## 4. Dumping memory

Save the relevant ranges at a known unpacking point. With staged unpacking, not all code may be present; core coverage also depends on filters and permissions:

```bash
# 1. Generate a core inside GDB (check coverage):
(gdb) gcore acilmis_program.dump

# 2. Or save only the unpacked code page as raw bytes:
(gdb) dump memory acilmis_kod.bin 0x401000 0x405000
```

A raw dump is not an ELF file. Import it using its architecture, base address, and range metadata. Missing pages and runtime relocations further complicate rebuilding a runnable file.

## Investigate further

Read [core dumps and snapshots](core-ve-snapshot.md) to analyze memory dumps and module information. Continue with [execution analysis with perf](perf-ile-yurutme.md) to profile runtime CPU paths.

## Sources

- [UPX: the Ultimate Packer for eXecutables](https://upx.github.io/)
- [UPX Recovery Tool — Nozomi Networks (GitHub)](https://github.com/NozomiNetworks/upx-recovery-tool)
- [Ghidra — official project and documentation](https://github.com/NationalSecurityAgency/ghidra)
- [UPX source code](https://github.com/upx/upx)


## Bounded OEP validation

On November 8, 2026, a known static AArch64 ET_EXEC fixture was packed with UPX 5.3.0 and run on Linux 6.12.76. In a live GDB inferior, a hardware breakpoint at the original ELF entry (`0x400580`) was reached from the packed stub entry (`0x4dcdc4`). The first 32 bytes matched the original file, normal execution reached `main`, and UPX decompression reproduced the original SHA-256. This comparison uses a known original; it is not an automatic OEP-discovery method. It does not validate the x86-64 syscall-register procedure above, Intel PT, or arbitrary packers.
