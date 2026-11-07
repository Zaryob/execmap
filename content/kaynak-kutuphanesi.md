---
title: ELF literature and technical resource library
---

# ELF literature and technical resource library

This library brings together standards, implementation sources, and tool authors' documentation for questions spanning file layout and runtime behavior. Each resource is tied to a technical question; a tool's existence alone does not establish that its interpretation is correct.

## 1. Format and architecture contracts

- **[System V ABI: ELF](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html)** — The general contract for ELF headers, program loading, and dynamic linking.
- **[x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)** — x86-64 calling conventions, initial process state, and architecture-specific relocations. Read it separately from the generic ELF specification.
- **[elf(5)](https://man7.org/linux/man-pages/man5/elf.5.html)** — ELF structures and fields used on Linux. A reference for [from file to memory](rehberler/elf-dosyadan-bellege.md).
- **[DWARF standard](https://dwarfstd.org/)** — Debug information, line tables, and call frame descriptions. Read alongside the [debug information laboratory](laboratuvarlar/debug-bilgisi.md).

## 2. Kernel and dynamic linker

- **[Linux v6.12: fs/binfmt_elf.c](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)** — The implementation of `load_elf_binary`, segment mapping, and initial stack layout. The version is pinned; check other versions separately.
- **[execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)** and **[getauxval(3)](https://man7.org/linux/man-pages/man3/getauxval.3.html)** — Replacing the process image and accessing auxiliary vector fields. [Startup and auxv](rehberler/baslangic-ve-auxv.md).
- **[ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)** — Library search paths, `LD_PRELOAD`, `LD_DEBUG`, and secure-execution mode. [Dynamic linking](rehberler/dinamik-baglama.md).
- **[mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)**, **[mprotect(2)](https://man7.org/linux/man-pages/man2/mprotect.2.html)**, and **[proc_pid_maps(5)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)** — Creating mappings, permissions, and observed address ranges.
- **[memfd_create(2)](https://man7.org/linux/man-pages/man2/memfd_create.2.html)** — Anonymous files accessed through file descriptors. [Custom loaders](rehberler/ozel-yukleyiciler.md).

## 3. Linkers and symbol resolution

- **[GNU ld: Linker Scripts](https://sourceware.org/binutils/docs/ld/Scripts.html)** — Placing input sections in output sections, addresses, and memory layout. [Linker layout](rehberler/linker-duzeni.md).
- **[GCC: Code Generation Options](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)** — The compiler contract for PIC/PIE options.
- **[Fangrui Song: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)** — Symbol interposition and the effects of linker options. [Symbol selection laboratory](laboratuvarlar/sembol-secimi.md).
- **[Fangrui Song: All about symbol versioning](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)** — Symbol version tables and ABI compatibility.
- **[Ian Lance Taylor: Linkers](https://www.airs.com/blog/archives/38)** — A technical series explaining a linker's responsibilities step by step.

## 4. Parsing and binary transformation

- **[pyelftools — Eli Bendersky and contributors](https://github.com/eliben/pyelftools)** — ELF and DWARF parsing with Python. [Parsers and addresses](rehberler/elf-parser-ve-adresler.md).
- **[LIEF](https://github.com/lief-project/LIEF)** — Reading and modifying executable formats; [ELF Python API](https://lief.re/doc/latest/formats/elf/python.html).
- **[PatchELF](https://github.com/NixOS/patchelf)** — Modifying ELF interpreter, RPATH, and RUNPATH fields.
- **[fq — Mattias Wadman and contributors](https://github.com/wader/fq)** — Querying binary structures and inspecting bytes.
- **[Binsider — Orhun Parmaksız and contributors](https://github.com/orhun/binsider)** — Inspecting ELF headers and dependencies in the terminal.
- **[ELFkickers — Brian Raiter](https://github.com/BR903/ELFkickers)** — Small ELF tools including `sstrip`, useful for examining structures required for loading. [Stripped ELF](rehberler/stripped-elf.md).
- **[UPX](https://github.com/upx/upx)** — An open-source executable packer and unpacker, providing an implementation to investigate in [packed ELF](rehberler/paketli-elf.md).

## 5. Comparison, debugging, and snapshots

- **[Ghidra — NSA](https://github.com/NationalSecurityAgency/ghidra)** — Disassembly, decompilation, and Version Tracking. [Binary diffing](rehberler/ikili-fark-analizi.md).
- **[BinDiff](https://github.com/google/bindiff)** — Function and basic block matching; a matching score is not proof of behavioral equivalence.
- **[BioDiff — 8051Enthusiast](https://github.com/8051Enthusiast/biodiff)** — Visual comparison through byte sequence alignment.
- **[GDB documentation](https://sourceware.org/gdb/current/onlinedocs/gdb.html/)** — Separate debug files, core analysis, and dumps of running processes.
- **[core(5)](https://man7.org/linux/man-pages/man5/core.5.html)** — Core generation conditions and limits. [Core and snapshots](rehberler/core-ve-snapshot.md).
- **[ECFS — Ryan O'Neill](https://github.com/elfmaster/ecfs)** — An extended core format for analysis; re-execution belongs to the separate [ecfs_exec prototype](https://github.com/elfmaster/ecfs_exec). Check the snapshot helpers' README limitations.
- **[CRIU](https://github.com/checkpoint-restore/criu)** — Linux process checkpoint/restore. Its scope and kernel/resource compatibility requirements differ from core analysis; it is not an ECFS successor.

## 6. Runtime observation and measurement

- **[Kernel: perf events and tool security](https://docs.kernel.org/admin-guide/perf-security.html)** — Counter data, sampling, and access control. [Execution with perf](rehberler/perf-ile-yurutme.md).
- **[Linux v6.12: Intel PT documentation](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)** — Hardware trace packets, decoding, and recording limits.
- **[Kernel: libbpf overview](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)** and **[BPF ring buffer](https://docs.kernel.org/bpf/ringbuf.html)** — BPF programs and event delivery to user space.
- **[Kernel: Uprobe tracer](https://docs.kernel.org/trace/uprobetracer.html)** — User-space tracing points attached by file offset. [Events with eBPF](rehberler/ebpf-ile-olaylar.md).
- **[bpftrace](https://bpftrace.org/docs)** — The tracing language and reference documentation for the version in use.
- **[Brendan Gregg: BPF Performance Tools](https://www.brendangregg.com/bpf-performance-tools-book.html)** — A book and examples for investigating system performance with BPF tools.

## 7. Assembly and reverse engineering preparation

- **[Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)** — Volume 1 covers registers and data representation; volume 2 covers instruction semantics. The technical reference for `lea`/`mov`, signed/unsigned conditions, and access width in [assembly preparation](rehberler/assembly-okuma.md).
- **[System V AMD64 psABI: Low Level System Information](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)** — Linux x86-64 function-entry arguments, stack, and return conventions. These are not Windows x64 or syscall conventions.
- **[GDB: Machine Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html), [Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [Memory](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html), [Assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html)** — Command contracts for the [first GDB laboratory](laboratuvarlar/gdb-ilk-inceleme.md). Changing a running process is a different observation from changing a binary on disk.
- **[GCC: Optimize Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html), [GDB: Optimized Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html), [Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html)** — Instruction transformations, debug visibility, and target memory changes in the [branches/pointers laboratory](laboratuvarlar/dallanma-ve-pointer.md).
- **[mytechnotalent/Reverse-Engineering and contributors](https://github.com/mytechnotalent/Reverse-Engineering)** — Supplementary education and study sequence. Lessons 127–132 of the x64 directory cover data width, calls, and addressing; 160–163 cover variables, branches, and pointers in small programs. This directory does not replace ABI or instruction specifications. The reviewed [README revision](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/README.md) was recorded on November 7, 2026. The repository root has an [Apache-2.0 license](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/LICENSE); linked external works are assessed separately. No upstream text, code, artwork, or binaries were imported; the new prose and C experiments were written for execmap.

## Using the sources

A specification describes the intended contract, source code a particular implementation, and an experiment an observation in a particular environment. Connect these layers using the records described in the [research method](kaynaklar.md). External works retain their authors' copyright and licenses; linking to them does not relicense their contents.
