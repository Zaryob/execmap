---
title: Branches and pointers under optimization
description: Compare the same C condition under O0 and O2, observe its pointer store, and validate boundary inputs.
---

# Branches and pointers under optimization

Compile one C function twice and check that it gives the same answer, even when its machine instructions change. Then use a GDB watchpoint to catch the moment it writes through a pointer.

The question is simple: **does a source-level `if` have to become a conditional jump?** You will inspect the compiler's actual output rather than guessing from the C code.

## Before you start

Use Linux x86-64, GCC, GNU binutils, GDB, and Python 3 for the optional full input check. Complete the [first GDB investigation](gdb-ilk-inceleme.md) first; it introduces pointers, register inspection, and the debugger prompt.

In a Linux terminal, create a separate directory:

```bash
mkdir -p ~/execmap-labs/branches
cd ~/execmap-labs/branches
```

Record the compiler, debugger, and architecture versions as shown in the first lab. Run the shell commands here in the terminal; only the block explicitly marked as GDB belongs inside the debugger.

## 1. Read the rule before reading assembly

Save this as `dallanma.c`:

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

`sec_ve_yaz` applies one of two rules: negative inputs become positive, and nonnegative inputs have 3 added. It writes the answer to `*hedef` and returns the same answer.

For example, -7 becomes 7, zero becomes 3, and 7 becomes 10. The program accepts only `-1000..1000`, keeping the arithmetic inside its defined range. `hedef` must point to a valid writable integer; `main` supplies one.

## 2. Build two versions and compare their answers

In the terminal:

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

Each answer below should appear twice: once from each executable.

```text
input=-7 target=7 result=7
input=0 target=3 result=3
input=7 target=10 result=10
```

`target` is the integer changed through the pointer; `result` is the function's return value. Their equality is the behavior we want to preserve.

The two compilation commands change only `-O0` to `-O2`. The other options stay fixed. `-fno-inline` keeps this function easier to inspect separately; it does not turn off every other optimization.

**Optional input check:** `-1000` should produce 1000, and `1000` should produce 1003. Inputs such as `abc`, `7x`, an empty argument, or `1001` should be rejected with exit code 2. The parser accepts a leading `+` and whitespace as allowed by `strtol`.

## 3. Find how each build selects its answer

Display only the function we are comparing:

```bash
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O0
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O2
```

Work through one build at a time. Look for the comparison of `x` with zero, the calculation of the answer, the write to the target, and the return value.

A conditional jump changes which instruction runs next. A conditional move, often named `cmov`, can choose a value without taking that kind of jump. Either approach can implement the same C rule. The optimized build may still contain a jump; a particular opcode is not a requirement for success.

**Your checkpoint:** explain where the value 7 comes from for input -7, and which instruction writes four bytes to the target. Do not count branches from the argument parser in `main` as branches in this function.

## 4. Catch the write with GDB

In the terminal, open the unoptimized build:

```bash
gdb -q ./dallanma_O0
```

Enter the following at the `(gdb)` prompt:

```text gdb
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

The first breakpoint pauses before the function changes the target. You should see `x = -7` and `*hedef = 0`.

`watch -l *hedef` asks GDB to stop when that memory value changes. After `continue`, the watchpoint should report **old value 0, new value 7**. That is the write you were looking for. After `finish`, the return value in `eax` should also be 7.

`delete $bpnum` removes the watchpoint before the program can reuse that stack address. On native x86-64, a hardware watchpoint commonly stops just *after* the write, so the current `$pc` is not automatically the address of the instruction that performed it.

## 5. Decide what you have established

You have completed the basic lab when both executables give the expected answers and you have caught the unoptimized build writing 7 to the target.

Three examples do not cover every accepted input. For a full check, open a terminal at the **execmap repository root**—the directory containing `package.json`—and run:

```bash
python3 scripts/verify-assembly-labs.py
```

This extracts the published C code, checks all 2001 accepted integer inputs against the mathematical rule, and tries invalid arguments. Results go to `output/assembly-validation/report.json`. On Linux x86-64 it also checks the GDB exercises. Other platforms explicitly skip those debugger checks; `--require-linux-gdb` makes them mandatory.

## If something looks different

**The optimized function uses different instructions:** compare the selected value and the final write. Different instructions can preserve the same answer.

**GDB displays `<optimized out>`:** the compiler may have removed or moved a variable. This does not mean the value never existed.

**The optimized target is not initially zero:** `main`'s initial zero is overwritten before the program uses it, so the compiler may remove that initialization. The zero-to-seven watchpoint exercise deliberately uses `-O0`. For `-O2`, check the incoming argument, final stored value, and return value instead.

**You want to inspect `-O2` entry registers:** start a fresh session with `start -7`, set `break *sec_ve_yaz`, then `continue`. At exact entry, `(int)$esi` is the input and `(int *)$rdi` is the pointer for this signature. Save the pointer before stepping. The [assembly guide](../rehberler/assembly-okuma.md) explains why those entry values cannot be assumed later in the function.

## Next experiment

Use [compiler differences](derleme-farklari.md) to study loops and inlining, or [binary diffing](../rehberler/ikili-fark-analizi.md) to compare builds. Later, [stripped ELF](../rehberler/stripped-elf.md) removes the helpful symbol names from the investigation.

## Sources

- [GCC: Optimize Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html): if-conversion, inlining, and optimization-level limits.
- [GDB: Optimized Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html) and [Set Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html).
- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html), [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html), [strtol(3)](https://man7.org/linux/man-pages/man3/strtol.3.html).
- [mytechnotalent/Reverse-Engineering, x64 Course](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): lessons 131–132 and 162–163 for supplementary pointer, addressing, and branch study. This program, input domain, and validation method were created for execmap.
