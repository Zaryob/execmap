---
title: A first GDB investigation — from C to machine code
description: Observe function arguments, the return address, and stores through a pointer one instruction at a time.
---

# A first GDB investigation — from C to machine code

**Question:** How does `hesapla(&sayi, 5)` pass its arguments, when does it change memory, and how does it return a result? Read [assembly preparation](../rehberler/assembly-okuma.md) first. This experiment targets Linux x86-64 with GCC, GNU binutils, and GDB. The C arithmetic can run elsewhere; the register and ELF investigations below require Linux x86-64.

## 1. Record the environment and hypothesis

Hypothesis: at entry, the first argument is an address and the second is 5. The four-byte memory target changes from 7 to 12, and the function returns 12. Do not fix addresses in advance. Run in a terminal:

```bash
uname -sm
gcc --version
gcc -dumpmachine
ld --version
objdump --version
gdb --version
getconf GNU_LIBC_VERSION
```

Expect `x86_64` from `uname -m`. On macOS, the name `gcc` may refer to Clang; use these inspection commands in the Linux environment. The debugger traces a process it starts itself; attaching to a separate process is unnecessary. If a container or sandbox prevents `ptrace`, do not report ordinary program execution as GDB validation.

## 2. Create the small program

Save this as `ilk-inceleme.c`:

```c
#include <stdio.h>

int hesapla(int *hedef, int artis) {
    int onceki = *hedef;
    *hedef = onceki + artis;
    return *hedef;
}

int main(void) {
    int sayi = 7;
    int sonuc = hesapla(&sayi, 5);
    printf("value=%d result=%d\n", sayi, sonuc);
    return 0;
}
```

```bash
gcc -std=c11 -Wall -Wextra -Werror -O0 -g -fno-omit-frame-pointer ilk-inceleme.c -o ilk-inceleme
./ilk-inceleme
file ./ilk-inceleme
readelf -hW ./ilk-inceleme
objdump -d -M intel --disassemble=hesapla ./ilk-inceleme
```

Expected stdout is `value=12 result=12`, with exit code 0. `-g` adds debug data; `-O0` and a frame pointer make inspection easier. They do not guarantee one instruction per source line or a fixed prologue. See [GCC debugging options](https://gcc.gnu.org/onlinedocs/gcc/Debugging-Options.html). The distribution's PIE default is retained; record the ELF type from your own `readelf` output.

## 3. Stop at the first machine instruction

Open `gdb -q ./ilk-inceleme` in the terminal. The following blocks contain GDB commands; do not prefix them with `(gdb)`:

```gdb
set pagination off
set disassembly-flavor intel
set disable-randomization off
start
break *hesapla
continue
info registers rip rsp rbp rdi esi
set $hedef_adresi = (int *)$rdi
set $donus_adresi = *(void **)$rsp
x/wd $hedef_adresi
x/gx $rsp
p/x $donus_adresi
p (unsigned long)$rsp % 16
disassemble /r hesapla
x/i $pc
```

`break *hesapla` sets an address breakpoint at the symbol's first instruction. `break hesapla` may instead select a source location after the prologue. `start` loads the program's modules before the address breakpoint is created. ASLR stays enabled; addresses need not match between runs.

At exact entry, `esi` should be 5 and the `int` at `$hedef_adresi` should be 7. `[rsp]` holds the return address; this simple call should have `rsp % 16 == 8`. `$donus_adresi` should point after the call in `main`. Do not apply this entry-state interpretation after the prologue. Argument passing for this signature follows the [System V AMD64 ABI](https://gitlab.com/x86-psABIs/x86-64-ABI).

## 4. Follow the read, store, and return

```gdb
stepi
x/i $pc
info registers rip rsp rbp
x/wd $hedef_adresi
```

Repeat these four commands until reaching the instruction that writes the target memory. `stepi` advances one machine instruction; source-level `step` advances toward the next source step. `nexti` can step over a call. See [GDB stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html).

When you see `mov DWORD PTR [...], ...`, first verify that the address is `$hedef_adresi`; not every prologue store writes `sayi`. The target should read 7 before its store and 12 afterward. The saved GDB convenience variable retains the address even if `rdi` later changes. While still inside the function, continue with:

```gdb
finish
p/d (int)$eax
p sayi
continue
quit
```

`finish` returns to the caller; expect 12 in `eax` and `sayi`. If you already stepped through `ret`, the innermost frame is now `main`; restart the experiment before using this sequence. `x/wd` displays four bytes as a signed decimal value; `x/gx` displays eight bytes in hexadecimal. Check units in the [GDB memory documentation](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html).

## 5. Change one variable to test the hypothesis

Close the previous GDB session and open a fresh `gdb -q ./ilk-inceleme`. This time, change the second argument at the source breakpoint, where arguments are accessible:

```gdb
set pagination off
set disable-randomization off
break hesapla
run
p artis
p *hedef
set variable artis = 9
finish
p/d (int)$eax
p sayi
continue
quit
```

Expected output becomes `value=16 result=16`. GDB assignment changes the running process, not the file on disk. Running `./ilk-inceleme` outside GDB again should produce the result with 12. The `set variable` syntax follows [GDB assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html). Keep this intervention separate from the unmodified execution record.

## 6. Evidence and limits

Save the disassembly, entry arguments, store address and width, target values before/after, and return value. Acceptance requires observing both 12 during normal execution and 16 after changing one argument, and explaining which store produces them.

This experiment uses an unoptimized program with source and symbols available. Optimized values may disappear from the debugger; do not generalize `rbp`-relative local-variable patterns. GDB stepping affects timing, so this is not an independent performance measurement. Continue with [branches and pointers](dallanma-ve-pointer.md), then [debug information](debug-bilgisi.md) and [stripped ELF](../rehberler/stripped-elf.md).

## Sources and supplementary study

- [GDB: Machine Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html): `disassemble /r` and the source/instruction relationship.
- [GDB: Continuing and Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [Memory](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html), [Assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html).
- [GCC: Debugging Options](https://gcc.gnu.org/onlinedocs/gcc/Debugging-Options.html) and [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI).
- [mytechnotalent/Reverse-Engineering](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): lessons 160–163, supplementary study connecting small-program inspection to behavior changes. This laboratory's code and prose were created for execmap.
