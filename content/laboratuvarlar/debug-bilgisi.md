---
title: Separating, stripping, and reconnecting debug information
---

# Separating, stripping, and reconnecting debug information

Remove a program's debugging information, then help GDB find it again in a separate file. The program will still add **10 + 20 = 30** throughout the experiment.

Debug information connects machine instructions to source lines, function names, and variables. It helps the debugger explain a running program; it is not the same thing as the instructions the CPU executes.

## Before you start

Use Linux, GCC, GNU binutils (`objcopy`, `strip`, and `readelf`), and GDB. Basic C is enough. The [first GDB lab](gdb-ilk-inceleme.md) is useful if the debugger prompt is new to you.

Work only on this lab's executable. In a Linux terminal:

```bash
mkdir -p ~/execmap-labs/debug-information
cd ~/execmap-labs/debug-information
```

## 1. Create and build the program

Save this as `hesap.c`:

```c
#include <stdio.h>

int topla(int a, int b) {
    int sonuc = a + b;
    return sonuc;
}

int main(void) {
    int x = 10;
    int y = 20;
    int toplam = topla(x, y);
    printf("Total: %d\n", toplam);
    return 0;
}
```

Compile it with debugging information, keep a full copy, and run it:

```bash
gcc -Wall -Wextra -O0 -g3 hesap.c -o hesap
cp hesap hesap.full
./hesap
ls -lh hesap
file hesap
```

Expected program output:

```text
Total: 30
```

`file` should describe the executable as having debug information and being `not stripped`. The backup `hesap.full` lets you compare with the original build later.

## 2. Make a separate debug file

Run these commands in order:

```bash
# Save the debug information before removing it:
objcopy --only-keep-debug hesap hesap.debug

# Remove debug information and unneeded ordinary symbols from the working file:
strip --strip-debug --strip-unneeded hesap

# Add a note telling GDB which separate file to look for:
objcopy --add-gnu-debuglink=hesap.debug hesap
```

You now have three files with different jobs:

- `hesap.full` is your unchanged original executable.
- `hesap` is the stripped executable you will run and debug.
- `hesap.debug` contains the separate debug information; do not run it as a program.

Keep `hesap.debug` beside `hesap` for this exercise. The `.gnu_debuglink` note records its filename and a checksum that GDB can check when locating it.

## 3. Check that behavior stayed the same

```bash
./hesap.full
./hesap
ls -lh hesap.full hesap hesap.debug
file hesap
readelf -S hesap
readelf -x .gnu_debuglink hesap
```

Both programs should print `Total: 30`. The stripped `hesap` should be smaller than the original and reported as `stripped`. In `readelf -S`, look for `.gnu_debuglink`; the ordinary `.debug_*` sections should no longer be in this working executable.

**Your checkpoint:** explain why losing source-level debugging information did not remove the addition that the program performs.

## 4. Let GDB reconnect the two files

In the terminal, open the **stripped executable**, not the `.debug` file:

```bash
gdb -q ./hesap
```

A successful load may include messages like these; the path will be yours:

```text
Reading symbols from ./hesap...
Reading symbols from /path/to/hesap.debug...
```

At the `(gdb)` prompt, enter:

```text gdb
break topla
run
list
print a
print b
```

A breakpoint pauses execution at a chosen place. Here GDB should recognize `topla`, show its source, and report `a = 10` and `b = 20`. Those are the concrete checks that the separate information was found and usable.

When finished inspecting, enter `continue` to let the program exit, then `quit` to close GDB.

## If GDB cannot find the source information

**The `topla` breakpoint cannot be resolved:** check that `hesap.debug` is next to `hesap`, that you added the debuglink, and that both files came from the same build.

**The debug file was changed or replaced:** its checksum may no longer match. Rebuild from step 1 rather than attaching an unrelated file.

**You want to start again:** recompile from `hesap.c` or use the full backup as your starting executable. Do not try to recover removed debug sections by extracting them from the already stripped copy.

**A different compiler or binutils was used:** record their versions and inspect the actual output. These commands target Linux ELF and GNU tools.

## Optional: debuglink and Build-ID matching

For this lab, keeping the named debug file beside the executable is enough. GDB can also search a `.debug` subdirectory and configured global debug directories; its full [search rules](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html) explain those locations.

The `.gnu_debuglink` note contains a filename, padding to a four-byte boundary, and a CRC-32 checksum. For `hesap.debug`, the filename plus its terminating zero byte occupies 12 bytes, so the checksum starts at offset `0x0c`. You do not need to calculate the checksum by hand to complete the lab.

### Matching by Build-ID

A **Build-ID** is another identity GDB can use to locate separate information. For a schematic 20-byte ID, the search path can look like this:

```text
ab1234567890abcdef1234567890abcdef123456
/usr/lib/debug/.build-id/ab/1234567890abcdef1234567890abcdef123456.debug
```

The first two hexadecimal characters become the directory, and the rest become the filename. Build-ID formats are linker-dependent and optional. GDB reads the embedded identity; it does not recalculate the entire executable's SHA-1 to obtain it. The ID also does not promise that an altered file still has matching contents.

## What to keep

Save the two `Total: 30` outputs, section inspection, and GDB's source/argument display. Linux aarch64 validation on November 7, 2026 also checked debuglink loading and rejection of a modified debug file, with Build-ID matching tested separately. These checks have distinct scopes.

Continue with [stripped ELF](../rehberler/stripped-elf.md) for analysis when helpful names are absent, or [compiler differences](derleme-farklari.md) to see why optimized source can be harder to debug.

## Sources

- [GDB: Separate Debug Files](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [objcopy — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/objcopy.html)
- [GNU strip — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/strip.html)
- [DWARF Debugging Information Format Standard](https://dwarfstd.org/)
