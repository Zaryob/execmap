---
title: Reading linker layout and memory maps
---

# Reading linker layout and memory maps

The linker (`GNU ld`, `LLVM lld`, or `mold`) completes the build by combining object files (`.o`) and libraries (`.a`, `.so`) into an executable ELF file.

Linker scripts and map files explain why function order differs between source and disassembly, how global variables are grouped, and why segment boundaries are aligned to page sizes such as 4 KB or 64 KB.

## 1. Input and output sections

The linker works with two basic concepts:

- **Input section**: A section from an input object, such as `.text` or `.rodata.str1.1` in `main.o`.
- **Output section**: A combined section in the final ELF file, such as its `.text` section.

```text
Input object files                         Final ELF
+-------------------------+                +-------------------------+
| main.o (.text.main)     |---+             | Segment 1: PT_LOAD (RX) |
+-------------------------+   |             |                         |
| helper.o (.text.calc)   |---+-----------> |   Output: .text         |
+-------------------------+   |             |   Output: .rodata       |
| math.o (.text.pow)      |---+             +-------------------------+
+-------------------------+                | Segment 2: PT_LOAD (RW) |
| main.o (.data.counter)  |---+             |                         |
+-------------------------+   +-----------> |   Output: .data         |
| helper.o (.bss.cache)   |---+             |   Output: .bss          |
+-------------------------+                +-------------------------+
```

With `-ffunction-sections` and `-fdata-sections`, the compiler places individual functions and data items into separate input sections, such as `.text.function_name`. During section garbage collection (`--gc-sections`), the linker can discard unreferenced sections.

## 2. VMA versus LMA

Two address types are important:

- **VMA (Virtual Memory Address)**: The address at which code or data resides during execution.
- **LMA (Load Memory Address)**: Its load address before any runtime copying to the execution location.

For ordinary Linux user-space programs, VMA and LMA are generally equal in the linker's representation. Embedded systems, bootloaders, and kernel images may use different LMAs and VMAs: data can be stored in ROM and copied into RAM for execution.

## 3. Linker scripts and the default layout

A **linker script** controls where input sections are placed. Inspect the system's default script with:

```bash
ld --verbose
```

A simplified script:

```text
SECTIONS
{
  . = 0x400000;              /* Set the location counter (.) */

  .text : {
    *(.text.entry)           /* Place the entry function first */
    *(.text*)                /* Include .text sections from all objects */
  }

  . = ALIGN(0x1000);         /* Align to a 4096-byte page boundary */

  .rodata : {
    *(.rodata*)              /* Read-only constants */
  }

  . = ALIGN(0x1000);         /* Start a new page for the data segment */

  .data : {
    *(.data*)                /* Initialized global variables */
  }

  .bss : {
    *(.bss*)                 /* Zero-initialized areas */
    *(COMMON)
  }
}
```

The dot (`.`) is the **location counter**. It advances as the linker lays out sections. `ALIGN(0x1000)` aligns the next location to a 4 KB boundary, which is useful when separating page permissions for an MMU or memory protection unit.

## 4. Examining the link map

Pass `-Wl,-Map,proje.map` during the build to inspect the layout in detail:

```bash
gcc -O2 -ffunction-sections -fdata-sections -Wl,--gc-sections,-Map,cikis.map main.c helper.c -o program
```

The generated `cikis.map` shows:

1. Which object files and functions were placed at which virtual addresses.
2. Discarded input sections, including functions removed by `--gc-sections`.
3. Padding and alignment bytes between sections.

No link map was measured during this revision. Inspect `Discarded input sections`, `.text.*`, and `*fill*` in your actual `cikis.map`. Do not assume the same elimination without `--gc-sections`, or that every discarded entry is attributable only to that option. Record alignment and addresses with compiler/linker versions.

## 5. Symbols defined by the linker

Linker scripts can define symbols that programs use to inspect image boundaries:

- `__executable_start`: The executable image's start in GNU ld's default script. This can include the ELF header and is not necessarily the RX `.text` start.
- `_etext` or `etext`: The end of the text area.
- `_edata` or `edata`: The end of initialized data.
- `_end` or `end`: The end of uninitialized data, not the actual program break or heap base. Consider ASLR and allocator mappings separately ([end(3)](https://man7.org/linux/man-pages/man3/end.3.html)).

Read these symbols in C through `extern` declarations:

```c
#include <stdio.h>

extern char etext, edata, end;

int main(void) {
    printf("Text end (etext) : %p\n", (void *)&etext);
    printf("Data end (edata): %p\n", (void *)&edata);
    printf("BSS end (end)   : %p\n", (void *)&end);
    return 0;
}
```

## Investigate further

Read [startup and auxv](baslangic-ve-auxv.md) to see how the kernel loads the resulting layout. Continue with [dynamic linking](dinamik-baglama.md) for the connection between functions and external libraries.

## Sources

- [GNU ld: Basic Linker Script Concepts](https://sourceware.org/binutils/docs/ld/Basic-Script-Concepts.html)
- [GNU ld: Linker Scripts](https://sourceware.org/binutils/docs/ld/Scripts.html)
- [Ian Lance Taylor: Linkers (20-part essay series)](https://www.airs.com/blog/archives/38)
- [LLVM lld: The LLVM Linker — ELF port](https://lld.llvm.org/)
