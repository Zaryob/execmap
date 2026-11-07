---
title: Making sense of stripped ELF files
---

# Making sense of stripped ELF files

If you are new to instructions, argument registers, and memory access, complete [assembly preparation](assembly-okuma.md) and the [first GDB investigation](../laboratuvarlar/gdb-ilk-inceleme.md) first. Boundary inference here builds on that basic data-flow knowledge.

Many binaries encountered during reverse engineering are **stripped**. Running `strip` can remove function names, source line information, and local variable names.

A stripped binary is not necessarily a nameless, unreadable byte sequence. Dynamic linking requirements, exception-handling data, and compiler-generated structure provide clues for reconstructing its layout.

## 1. What strip removes and what remains

An ELF file may contain two different symbol tables:

```text
+-----------------------------------------------------------------------+
| .symtab and .strtab: ordinary symbol table                             |
| Function names, including local/static symbols.                       |
| Ordinary stripping removes this table.                                |
+-----------------------------------------------------------------------+
| .dynsym and .dynstr: dynamic symbol table                              |
| Symbols required for dynamic linking, including imports and exports.   |
| Required dynamic entries remain after ordinary stripping.              |
+-----------------------------------------------------------------------+
| .debug_*: DWARF debug sections                                        |
| Source paths, line numbers, and type descriptions.                     |
| These are removed by stripping debug data.                             |
+-----------------------------------------------------------------------+
| .eh_frame and .eh_frame_hdr: unwind information                        |
| Used for exception handling and stack unwinding.                       |
| Normally retained by ordinary stripping.                              |
+-----------------------------------------------------------------------+
```

In `file ./ornek` output:

- `not stripped` indicates that the ordinary symbol table remains.
- `stripped` indicates its removal; dynamically linked files can still retain `.dynsym`.

```bash
# List dynamic symbols (also works after ordinary stripping):
readelf --dyn-syms ./ornek
nm -D ./ornek
```

## 2. sstrip and the section-table assumption

Ordinary GNU `strip` retains a section header table even after removing symbols. Brian Raiter's **sstrip** illustrates an important distinction:

> Normal ELF segment loading is driven by program headers; section names and an ordinary section table are not required for it. This is not a rule that section tables are never read by any ELF extension or kernel validation path.

After `sstrip`, or when section-table metadata is appropriately removed:

1. `readelf -S ./ornek` may report “There are no sections in this file.”
2. Ghidra, IDA, and other static tools may find automatic classification harder.
3. The kernel may still load the file if other requirements hold; changing `e_shoff` alone is not sufficient validation.

### Inspecting a sectionless file at runtime

Use `/proc/<pid>/maps` to inspect its runtime mapping ranges:

```bash
cat /proc/$PID/maps
```

`r-xp` denotes an executable private mapping; `rw-p` denotes a writable private mapping. A mapping may include multiple sections or padding. Permissions do not reveal exact `.text`/`.data` boundaries. Compare with `PT_LOAD` offsets; execution and maliciousness require separate evidence.

## 3. Candidate function boundaries in .eh_frame

Compilers generate `.eh_frame` for unwinding needs such as C++ exception handling, C cancellation paths, and debugger stack reconstruction.

This section contains DWARF Call Frame Information (CFI). An FDE's start and range describe instructions covered by unwind information. A source function need not correspond to exactly one FDE: inlining, split code, and missing tables break that one-to-one assumption.

```bash
readelf --debug-dump=frames ./ornek | grep -E "FDE.*pc="
```

Binutils commonly displays ranges without `0x`, such as `pc=0000000000001140..0000000000001185` (schematic addresses). The end is exclusive. An unwind range is a candidate function boundary, not a perfect inventory of source-level functions.

## 4. Function-entry heuristics

Without useful unwind information, disassemblers can use architecture-specific prologue patterns to identify candidate functions. For example, a build using `-fno-asynchronous-unwind-tables` and with `.eh_frame` removed may require other clues.

### A conventional x86-64 prologue

```assembly
endbr64                 # f3 0f 1e fa (Intel CET Indirect Branch Tracking)
pushq   %rbp            # 55
movq    %rsp, %rbp      # 48 89 e5
subq    $0x20, %rsp     # Allocate stack space
```

### An epilogue

```assembly
leaveq                  # c9
retq                    # c3
```

> [!NOTE]
> Modern optimized builds may omit frame pointers, so `push %rbp` is not guaranteed. Stack-pointer adjustments such as `sub $N, %rsp`, or a function consisting only of `ret`, are also possible.

## 5. Recovering debug data with Build-ID and debuginfod

A linker may embed an optional **Build-ID** note. GNU ld supports multiple styles; SHA-1 is not mandatory. A Build-ID is neither a universal uniqueness guarantee nor necessarily the current checksum of a modified file ([GNU ld options](https://sourceware.org/binutils/docs/ld/Options.html)):

```bash
readelf -n ./ornek | grep "Build ID"
```

A schematic SHA-1-style identifier, not a measured identity:

```text
Build ID: a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

**debuginfod** can use this identifier to locate debug data. GDB or `debuginfod-find` may download matching original symbols and source from a suitable server even when they are not installed locally. Replace the illustrative identifier below with an actual Build-ID:

```bash
debuginfod-find debuginfo a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

## Investigate further

Complete the [debug information laboratory](../laboratuvarlar/debug-bilgisi.md) to separate symbols, strip a file, and reconnect the data in GDB. Continue with [binary diffing](ikili-fark-analizi.md) to match code changes across versions without ordinary symbols.

## Sources

- [ELFkickers & sstrip — Brian Raiter](http://www.muppetlabs.com/~breadbox/software/elfkickers.html)
- [GNU strip — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/strip.html)
- [GDB: Separate Debug Files](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [MaskRay: Stack unwinding](https://maskray.me/blog/2020-11-08-stack-unwinding)
- [Kernel ORC unwinder documentation](https://www.kernel.org/doc/html/next/x86/orc-unwinder.html)
- [elfutils: debuginfod service](https://sourceware.org/elfutils/Debuginfod.html)
