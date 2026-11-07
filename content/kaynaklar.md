---
title: Research method and primary sources
---

# Research method and primary sources

`execmap` is an independent research and reference project examining Linux ELF files on disk, the loading process, and runtime observations together. Guides explain established mechanisms with sources; laboratories investigate them through small C programs.

## Research questions

- Under what conditions do a file offset, an ELF virtual address, and an address observed in a process correspond?
- How do a symbol table, relocation record, and dynamic linker determine a call target?
- How can compiler optimization be distinguished from a change in program behavior?
- What conclusions does a memory mapping, sample record, or system call support, and what does it leave unresolved?

## The role of each source

**Format and contract:** The [System V ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html), [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), and [DWARF](https://dwarfstd.org/) define field meanings and architectural contracts.

**Implementation:** The [Linux v6.12 ELF loader](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) is a versioned example of how the kernel validates and maps a file. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html) explains dynamic linker search and symbol resolution. Details can differ across kernel and libc versions.

**Tools and interpretation:** [GNU ld](https://sourceware.org/binutils/docs/ld/Scripts.html), [GDB](https://sourceware.org/gdb/current/onlinedocs/gdb.html/), the [perf access model](https://docs.kernel.org/admin-guide/perf-security.html), and [uprobe documentation](https://docs.kernel.org/trace/uprobetracer.html) explain how observations are produced. Technical analyses by their authors are listed separately in the [resource library](kaynak-kutuphanesi.md).

## Experiments and reproducibility

1. State the question and expected mechanism before running the experiment.
2. Record architecture, kernel and libc versions, compiler, build options, and tool versions.
3. Change one variable between compared conditions. Keep the laboratory source and complete commands.
4. Collect file inspection, memory maps, and runtime records as separate observations.
5. Distinguish expected results from actual output; report unsuccessful experiments and missing records too.

[Memory permissions](laboratuvarlar/bellek-izinleri.md), [symbol selection](laboratuvarlar/sembol-secimi.md), [debug information](laboratuvarlar/debug-bilgisi.md), and [compiler differences](laboratuvarlar/derleme-farklari.md) put this approach into practice.

The [assembly preparation guide](rehberler/assembly-okuma.md) separates instruction and ABI sources; the [first GDB investigation](laboratuvarlar/gdb-ilk-inceleme.md) tests the entry/store/return hypothesis. The [branches and pointers](laboratuvarlar/dallanma-ve-pointer.md) experiment compares two builds against expected results throughout its defined integer input domain. A course's topic sequence is not evidence of a technical contract: primary documents, expected results, and checks actually executed are recorded separately.

## Limits of the findings

Expected outputs in the guides are explanatory examples, not a published measurement dataset or validation across every distribution. A permission change alone does not prove code execution, and a sample does not establish the complete instruction stream. eBPF, perf, and debuggers differ in scope, access requirements, and measurement cost.

This work does not claim a new vulnerability or algorithm. Its contribution is connecting documented mechanisms to investigation questions and reproducible experiments. External works remain under their authors' copyright and licenses.

Start with the [reading routes](okuma-rotalari.md), and use [interpreting traces](rehberler/izleri-yorumlamak.md) to assess findings.
