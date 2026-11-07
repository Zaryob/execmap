---
title: Branches and pointers under optimization
description: Compare the same C condition under O0 and O2, observe its pointer store, and validate boundary inputs.
---

# Branches and pointers under optimization

**Question:** Must a C `if` become a conditional jump? How do you distinguish writing through a pointer from merely calculating an address? Complete [assembly preparation](../rehberler/assembly-okuma.md) and the [first GDB investigation](gdb-ilk-inceleme.md) first. Use Linux x86-64, GCC, GNU binutils, and GDB; record the environment versions listed in the previous laboratory.

This experiment extends [compiler differences](derleme-farklari.md) using one condition and one memory target. Hypothesis: `-O0` and `-O2` produce equal values throughout the defined input domain, while instruction layouts may differ. Conversion of a source condition into `jcc`, `cmovcc`, or another selection mechanism relates to [GCC if-conversion and optimization options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html). A particular opcode is not an acceptance criterion.

## 1. A program with runtime input

Save this as `dallanma.c`. Inputs are restricted to `-1000..1000`, avoiding signed `int` overflow in `-x` and `x + 3`. Reading an argument at runtime prevents the complete result from becoming a compile-time constant.

```c
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

int sec_ve_yaz(int *hedef, int x) {
    int deger;
    if (x < 0) {
        deger = -x;
    } else {
        deger = x + 3;
    }
    *hedef = deger;
    return deger;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <-1000..1000>\n", argv[0]);
        return 2;
    }
    char *son;
    errno = 0;
    long girdi = strtol(argv[1], &son, 10);
    if (errno != 0 || son == argv[1] || *son != '\0' ||
        girdi < -1000 || girdi > 1000) {
        fputs("Invalid input\n", stderr);
        return 2;
    }
    int hedef = 0;
    int sonuc = sec_ve_yaz(&hedef, (int)girdi);
    printf("input=%d target=%d result=%d\n", (int)girdi, hedef, sonuc);
    return 0;
}
```

The `sec_ve_yaz` contract requires `hedef` to point to a valid writable `int` and `x` to lie in the stated range. `main` satisfies both. Null/dangling pointers and out-of-range arithmetic are not part of the behavioral comparison. The end-pointer and error checks follow [strtol(3)](https://man7.org/linux/man-pages/man3/strtol.3.html); leading whitespace and a `+` sign are accepted.

## 2. Change only the optimization level

```bash
gcc -std=c11 -Wall -Wextra -Werror -g -fno-omit-frame-pointer -fno-inline -O0 dallanma.c -o dallanma_O0
gcc -std=c11 -Wall -Wextra -Werror -g -fno-omit-frame-pointer -fno-inline -O2 dallanma.c -o dallanma_O2
./dallanma_O0 -7
./dallanma_O2 -7
./dallanma_O0 0
./dallanma_O2 0
./dallanma_O0 7
./dallanma_O2 7
```

Both programs should produce `input=-7 target=7 result=7`, `input=0 target=3 result=3`, and `input=7 target=10 result=10`, respectively, with exit code 0. Boundary inputs produce 1000 for `-1000` and 1003 for `1000`. Expect exit code 2 for `abc`, `7x`, an empty argument, `1001`, `-1001`, or a number overflowing `long`.

`-g`, `-fno-omit-frame-pointer`, and `-fno-inline` stay fixed between builds. Disabling inlining is an experimental choice that makes the function easier to inspect separately, not a general model of production builds. It does not disable all other transformations or guarantee that locals remain accessible in GDB under `-O2`.

## 3. Follow the condition and the store

```bash
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O0
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O2
```

For each build, trace input `x` to the selected value, then to `*hedef` and the return register. Do not mix the argument parser's branches outside the function into this comparison. [objdump](https://sourceware.org/binutils/docs/binutils/objdump.html) supports symbol-specific disassembly.

Answer these questions in your actual output:

1. Which `cmp` or `test` represents the condition? Which instruction consumes its flags?
2. Where are the negative/nonnegative results produced? If a `cmov` appears, explain its data-selection role.
3. Which instruction calculates the pointer address, and which writes four bytes there?
4. Is the stored value equal to the `eax` return value? Establish this through data flow, not register names alone.

`-O2` may produce `cmov` or arithmetic selection; retaining a conditional jump is valid too. Two source branches do not guarantee two separate basic blocks in machine code. Check instruction meanings in [Intel SDM volume 2](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html).

## 4. Verify the pointer target with GDB

Open `gdb -q ./dallanma_O0`:

```gdb
set pagination off
set disassembly-flavor intel
set disable-randomization off
break sec_ve_yaz
run -7
p x
p *hedef
set $hedef_adresi = hedef
disassemble /r sec_ve_yaz
watch -l *hedef
continue
x/wd $hedef_adresi
delete $bpnum
finish
p/d (int)$eax
continue
quit
```

At the breakpoint, expect `x=-7` and `*target=0`. When the watchpoint detects the change, expect old value 0 and new value 7. `delete $bpnum` removes the last-created watchpoint before later reuse of the stack address can confuse the record. This observes the pointed-to object; inspect disassembly separately to determine how the condition is represented. Native x86-64 hardware watchpoints usually stop after the store completes, so do not automatically identify current `$pc` as the store address. See [GDB watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html) for support and resource limits.

For the optimized binary, use a fresh session with `start -7`, `break *sec_ve_yaz`, and `continue` to stop at its first instruction. Read arguments through `(int)$esi` and `(int *)$rdi`, and save the pointer. Do not treat post-prologue registers as unchanged entry arguments. `<optimized out>` does not mean the input or store never existed; [optimized-code debugging limits](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html) apply.

## 5. Check equivalence within a defined domain

Three matching examples do not establish equality for every input. Execute all 2001 accepted integer values in both builds and compare them against the expected mathematical result too:

```bash
python3 scripts/verify-assembly-labs.py
```

Run this from the execmap repository root. It extracts and compiles the published C blocks and writes `output/assembly-validation/report.json`. On Linux x86-64 it also checks GDB sessions, entry ABI values, and a watchpoint. Other platforms check portable C behavior and explicitly mark Linux/GDB checks as skipped. Use `--require-linux-gdb` to make Linux validation mandatory.

Acceptance requires both builds to match the expected function for all valid integers, reject invalid arguments, and demonstrate the store in GDB. This does not cover other compiler versions, other programs, or invalid pointer use. Interpret addresses and instructions alongside the report's environment; values here are expected results.

## Continue and revisit the sources

Use [compiler differences](derleme-farklari.md) for inlining/loops and [binary diffing](../rehberler/ikili-fark-analizi.md) for matching functions across builds. In [stripped ELF](../rehberler/stripped-elf.md), try rebuilding the same data flow without symbol names.

- [GCC: Optimize Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html): if-conversion, inlining, and optimization-level limits.
- [GDB: Optimized Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html) and [Set Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html).
- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html), [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html), [strtol(3)](https://man7.org/linux/man-pages/man3/strtol.3.html).
- [mytechnotalent/Reverse-Engineering, x64 Course](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): lessons 131–132 and 162–163 for supplementary pointer, addressing, and branch study. This program, input domain, and validation method were created for execmap.
