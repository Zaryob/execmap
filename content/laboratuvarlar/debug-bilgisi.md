---
title: Separating, stripping, and reconnecting debug information
---

# Separating, stripping, and reconnecting debug information

Distributions such as Red Hat, Ubuntu, and Debian commonly ship binaries with ordinary symbols and DWARF debug information removed to reduce distribution size. Separate debug files (`-dbgsym` / `debuginfo`) can be reconnected for bug reports and crash analysis.

This laboratory separates debug data with `objcopy`, strips the main file, and examines how `.gnu_debuglink` lets GDB reconnect the two.

## 1. Prepare the program

Create `hesap.c`, with a small loop and local variables:

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

## 2. Compile with debug information

Use `-g3` to include rich DWARF information:

```bash
gcc -Wall -Wextra -O0 -g3 hesap.c -o hesap
```

Check file size and symbol status:

```bash
ls -lh hesap
file hesap
```

Expect `with debug_info, not stripped` in the `file` output.

## 3. Separate debug data and strip the binary

Use GNU binutils:

```bash
# 1. Extract debug sections into a separate 'hesap.debug' file:
objcopy --only-keep-debug hesap hesap.debug

# 2. Remove debug data and ordinary symbols (dynamic linking entries may remain):
strip --strip-debug --strip-unneeded hesap

# 3. Embed the debug filename and CRC-32 in the main binary:
objcopy --add-gnu-debuglink=hesap.debug hesap
```

Inspect the result:

- `ls -lh hesap hesap.debug`: The `hesap` file should be smaller.
- `file hesap`: It should now be reported as `stripped`.
- `readelf -S hesap`: `.debug_*` sections should be gone and `.gnu_debuglink` present.

```bash
readelf -x .gnu_debuglink hesap
```

The `.gnu_debuglink` layout is a NUL-terminated filename, 0–3 padding bytes to the next four-byte boundary, then a CRC-32 in the target ELF's byte order. `hesap.debug\0` occupies 12 bytes, so the CRC starts at `0x0c`, not `0x10`. Its value depends on the actual debug file. Linux aarch64 validation on November 7, 2026 recorded the GNU objcopy/readelf output and GDB source-line lookup. An altered debug file was rejected for CRC mismatch; Build-ID lookup was tested separately, including rejection of a different embedded identity. Once GDB finds the file through its name/path search, it checks the CRC too.

## 4. Verify automatic matching with GDB

Open the main binary:

```bash
gdb -q ./hesap
```

If GDB finds the matching debug file, expect a message similar to this schematic example:

```text
Reading symbols from ./hesap...
Reading symbols from /path/to/hesap.debug...
```

Even though the working binary is stripped, source lines and function names become available when matching debug data is loaded:

```bash
(gdb) break topla
(gdb) run
(gdb) list
(gdb) print a
(gdb) print b
```

GDB's `.gnu_debuglink` search includes the executable directory, its `.debug` subdirectory, and paths under global debug directories corresponding to the executable's absolute directory. Verify actual loading in your session.

## 5. Build-ID matching

GDB reads the embedded Build-ID rather than hashing the entire executable with SHA-1 again. It looks for matching identity in separate debug data. For this **schematic 20-byte identifier**:

```text
ab1234567890abcdef1234567890abcdef123456
/usr/lib/debug/.build-id/ab/1234567890abcdef1234567890abcdef123456.debug
```

The first **two hexadecimal characters form one byte** (`ab`) and become the directory name; the remaining 38 characters become the filename. Build-ID is optional, with length/style depending on the linker. It does not guarantee matching debug contents on every server or represent the file's current checksum after modification. Check [GDB's search rules](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html).

## Investigate further

Read [stripped ELF](../rehberler/stripped-elf.md) for analysis without ordinary symbols. Use the [compiler differences laboratory](derleme-farklari.md) to investigate optimization's effect on code structure.

## Sources

- [GDB: Separate Debug Files](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [objcopy — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/objcopy.html)
- [GNU strip — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/strip.html)
- [DWARF Debugging Information Format Standard](https://dwarfstd.org/)
