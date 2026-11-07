---
title: Following ELF from file to memory
---

# Following ELF from file to memory

On Linux, an executable ELF (Executable and Linkable Format) file becomes a running process image through a protocol implemented jointly by the kernel and dynamic linker.

A common reverse engineering mistake is trusting an analysis tool such as Ghidra or IDA and immediately looking for `main()`. The binary first passes through the kernel's `execve` machinery and, when dynamically linked, the dynamic linker (`ld-linux.so`). Understanding which bytes are mapped to which virtual addresses, under which permissions, is the foundation for static and dynamic analysis.

## 1. Segments and sections: two views

An ELF file can be read from two perspectives: its **linking view** and its **execution view**.

```text
+-------------------------------------------------------+
| ELF header                                            |
+-------------------------------------------------------+
| Program header table: segments                        | <-- Kernel / loader
|   PT_LOAD (RX) -> .text, .rodata                       |     Determines mappings
|   PT_LOAD (RW) -> .data, .bss                         |     and permissions.
|   PT_DYNAMIC   -> .dynamic                            |
|   PT_INTERP    -> "/lib64/ld-linux-x86-64.so.2"         |
+-------------------------------------------------------+
| Sections                                              |
|   .text   : Code                                      | <-- Linker / debugger
|   .rodata : Read-only data                            |     Logical organization
|   .data   : Initialized data                          |     and symbols.
|   .bss    : Zero-initialized data                      |
+-------------------------------------------------------+
| Section header table                                  | <-- May be removed
+-------------------------------------------------------+
```

### Program header table: segments

The kernel's `load_elf_binary()` in `fs/binfmt_elf.c` uses program headers for normal segment loading decisions. A section table is unnecessary for ordinary loading; ELF extensions such as extended program-header numbering require separate examination:

- **`PT_LOAD`**: Memory ranges to map, with `PF_R`, `PF_W`, and `PF_X` permissions.
- **`PT_INTERP`**: The dynamic linker's file path, such as `/lib64/ld-linux-x86-64.so.2`.
- **`PT_DYNAMIC`**: Information locating dynamic linking and relocation structures.
- **`PT_GNU_STACK`**: The executable-stack request, relevant to NX/DEP.
- **`PT_GNU_RELRO`**: A region to make read-only after relocation, relevant to partial/full RELRO.

### Section header table: sections

Linkers (`ld`, `lld`) and debuggers (`gdb`) use logical sections such as `.text`, `.data`, `.symtab`, and `.strtab`. Clearing or corrupting the section header table through stripping or section mangling may leave a file runnable if other loading conditions hold. An analyzer relying only on section names can therefore be misled.

## 2. Inspecting headers and segments with readelf

Inspect the architecture and segments of a program you compiled:

```bash
readelf -h ./ornek
readelf -lW ./ornek
```

`-lW` displays segment types, file and virtual addresses, `FileSiz`, `MemSiz`, permissions, and alignment. No Linux `readelf` dump was generated during this revision, so no fixed-address output is presented. Save a full dump from your own build. An ELF64 program header is 56 bytes; compare the table size with its record count.

### FileSiz versus MemSiz: the .bss area

For `PT_LOAD`, `p_memsz > p_filesz` means a zero-filled memory tail without corresponding file bytes; ordinary `.bss` requires this. In Linux v6.12 `elf_load()`, `padzero()` clears the tail of the last file-backed page, and `vm_brk_flags` provides the remaining full pages as zeroed anonymous memory. This difference alone is not evidence of packing.

## 3. Converting a file offset to a memory address

A `PT_LOAD` segment connects a byte's offset on disk to its virtual address in the process.

The formula is:

```text
Runtime virtual address (VMA) = Load bias + p_vaddr + (File offset - p_offset)
```

Where:

- **`p_offset`** is the segment's starting file offset.
- **`p_vaddr`** is the virtual address recorded for the segment in the ELF file.
- **Load bias** is the base-address adjustment applied when mapping the file, including ASLR/PIE relocation. It is usually 0 for non-PIE executables; PIE loading commonly selects a randomized base.

> [!WARNING]
> This formula applies only to bytes within `FileSiz`. The zero-filled `.bss` part of `MemSiz` has no corresponding file offset.

## 4. Checking runtime mappings with /proc/PID/maps

Read `/proc/<pid>/maps` to see actual process mappings:

```bash
# Use the PID printed by the target:
PID=4821
cat /proc/"$PID"/maps
```

The following are **schematic mapping lines**, not a captured execution. `cat /proc/self/maps` reads the `cat` process's mappings, not your target's:

```text
55e4b6000000-55e4b6001000 r--p 00000000 103:02 12345678  /usr/bin/ornek
55e4b6001000-55e4b6002000 r-xp 00001000 103:02 12345678  /usr/bin/ornek
55e4b6002000-55e4b6003000 rw-p 00002000 103:02 12345678  /usr/bin/ornek
55e4b6003000-55e4b6004000 rw-p 00000000 00:00 0
7ffc39f0b000-7ffc39f2c000 rw-p 00000000 00:00 0         [stack]
7ffc39fdd000-7ffc39fe1000 r--p 00000000 00:00 0         [vvar]
7ffc39fe1000-7ffc39fe3000 r-xp 00000000 00:00 0         [vdso]
```

The columns mean:

1. **Address range**: Page-aligned start and end virtual addresses; pages are commonly 4 KB (`0x1000`).
2. **Permissions**: `r` (read), `w` (write), `x` (execute), and `p` (private/CoW) or `s` (shared).
3. **Offset**: The backing file offset at which the mapping starts.
4. **Device and inode**: The backing file's device and filesystem inode.
5. **Path**: The backing file. Unnamed anonymous mappings usually have an empty path. Since Linux 5.17, named private anonymous mappings may appear as `[anon:name]`. `maps` does not describe section boundaries or record code execution.

## 5. Dynamic linking and the entry point

The ELF header's `e_entry` field does not point directly to `main`.

For a dynamically linked ELF:

1. The kernel loads the executable and reads `PT_INTERP`.
2. It transfers control to the dynamic linker, such as `/lib64/ld-linux-x86-64.so.2`.
3. The linker loads dependencies (`DT_NEEDED`) and applies relocations.
4. Control transfers to the executable's `e_entry` address (`_start`).
5. `_start` (glibc `sysdeps/x86_64/start.S`) reads arguments from the kernel-prepared stack and ultimately reaches `main` through `__libc_start_main`.

In GDB, use `starti` rather than `break main` to catch the initial instruction:

```bash
gdb -q ./ornek
(gdb) starti
(gdb) info proc mappings
(gdb) x/5i $rip
```

`starti` stops at the first machine instruction. For a dynamically linked executable, `$rip` initially points into `ld-linux.so`; for a static executable it points into the program's own startup code.

## Investigate further

Continue with [ELF parsers and addresses](elf-parser-ve-adresler.md) to validate program headers and address ranges in code. Read [linker layout](linker-duzeni.md) for the build-time arrangement and [startup and auxv](baslangic-ve-auxv.md) for the kernel/user-space handoff.

## Sources

- [ELF — Linux man-pages (man 5 elf)](https://man7.org/linux/man-pages/man5/elf.5.html)
- [execve — Linux man-pages (man 2 execve)](https://man7.org/linux/man-pages/man2/execve.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
- [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)
- [Linux Kernel: fs/binfmt_elf.c implementation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
- [GCC: Code Generation Options — PIC/PIE](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)
