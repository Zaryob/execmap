---
title: Examining compiler differences and optimization levels
---

# Examining compiler differences and optimization levels

Compile the same calculation three ways. All three programs should print **285**, but their machine instructions and sizes may differ.

Optimization lets a compiler choose another way to produce the same observable result. This lab starts with the result you can check, then asks you to find what changed in the instructions.

## Before you start

Use Linux ELF, GCC, and GNU binutils (`objdump` and `size`). The instruction examples use x86-64; other architectures have different names and conventions. You need basic C loops and functions, not experience with every assembly instruction.

In a Linux terminal:

```bash
mkdir -p ~/execmap-labs/compiler-differences
cd ~/execmap-labs/compiler-differences
gcc --version
ld --version
objdump --version
uname -m
```

Keep these versions with your comparison. The exact transformations depend on the compiler and target.

## 1. Create a calculation with a helper function

Save this as `opt.c`:

```c
#include <stdio.h>

static int kare_al(int sayi) {
    return sayi * sayi;
}

// This experiment uses n=10; larger inputs require signed-overflow checks.
int seri_topla(int n) {
    int toplam = 0;
    for (int i = 0; i < n; i++) {
        toplam += kare_al(i);
    }
    return toplam;
}

int main(void) {
    int sonuc = seri_topla(10);
    printf("Result: %d\n", sonuc);
    return 0;
}
```

`kare_al` squares one number. `seri_topla(10)` adds the squares of 0 through 9. That is why the expected result is 285. Keep this input at 10 for the experiment; larger inputs would need arithmetic-overflow checks.

## 2. Build and run three executables

```bash
# Easier-to-inspect, unoptimized build:
gcc -Wall -Wextra -O0 -g opt.c -o opt_O0

# Speed-oriented optimization:
gcc -Wall -Wextra -O2 opt.c -o opt_O2

# Size-oriented optimization:
gcc -Wall -Wextra -Os opt.c -o opt_Os

./opt_O0
./opt_O2
./opt_Os
```

Each run should print:

```text
Result: 285
```

**Stop and check this first.** Comparing instructions is more useful once you know the programs still give the expected answer for the chosen input.

`-O0` makes a useful first inspection build. `-O2` and `-Os` give the compiler different optimization goals. They do not promise a particular instruction sequence or a particular final file size.

## 3. Compare sizes without predicting the winner

```bash
size opt_O0 opt_O2 opt_Os
ls -lh opt_O0 opt_O2 opt_Os
```

`size` summarizes sections in the executable; `ls` shows the size of the whole file, which also includes other contents such as debug information. Record both rather than treating them as the same measurement.

Does your size-oriented build have the smallest code or file? Write down what you actually see. `-Os` is a request to optimize for size, not a guarantee that every complete file will be smallest.

## 4. Inspect one function at a time

Show the full disassembly of `seri_topla` in each build:

```bash
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_O0
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_O2
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_Os
```

Use the function label to keep this comparison separate from unrelated startup code. You do not need to explain every line. Start with these questions:

1. Can you find a call to `kare_al`, or has the compiler put the calculation directly into the caller? Replacing a call with the called function's work is **inlining**.
2. Can you recognize the loop and the repeated square/add calculation?
3. Are temporary values kept in registers, on the stack, or represented differently?

For `-O0`, you may see a direct helper call and frequent accesses to stack locals. At `-O2`, inlining, register use, or a transformed loop may be more visible. `-Os` can make another set of choices. Treat those as things to investigate, not features every compiler version must produce.

**Your checkpoint:** describe one actual difference and explain why it does not change the checked result of 285.

## 5. Connect the result back to debugging

A helper missing from optimized disassembly may have been inlined. A source variable missing from GDB may no longer have its own storage location. Looking only for a familiar stack layout can therefore hide the data flow you are trying to understand.

A frame pointer, when used, helps refer to a stack frame. Do not assume every optimized function uses the same `rbp`-relative layout. Likewise, loop unrolling and alignment choices are compiler decisions rather than simple rules attached to an optimization label.

If you want a smaller next question, use [branches and pointers](dallanma-ve-pointer.md): it keeps one condition and one write while comparing `-O0` and `-O2`.

## If the output is confusing

**The disassembly looks unlike the examples:** confirm your architecture and GNU `objdump` version. `-M intel` is for the x86 syntax used here.

**The helper is absent:** look for its multiplication in the caller; absence of a separate function name does not establish that the calculation was removed.

**The main function looks very short:** a compiler can simplify this fixed-input calculation. Inspect the named function above as well as the actual path taken by `main` before deciding what executes.

**The three program answers differ:** first confirm that all files were built from the same saved source and with the shown input. A size comparison alone cannot establish correct behavior.

## What to keep and what to try next

Save the three outputs, sizes, compiler versions, and one annotated instruction difference. This checks a specific calculation; it is not a proof that all possible programs behave identically at all optimization levels.

An earlier macOS arm64/Apple Clang 21 check produced 285 in all three builds. That was a portable C behavior check, not a Linux/GCC instruction or size measurement.

For preparation, see [assembly reading](../rehberler/assembly-okuma.md) and the [first GDB investigation](gdb-ilk-inceleme.md). Continue with [binary diffing](../rehberler/ikili-fark-analizi.md) to compare larger changes, or [perf](../rehberler/perf-ile-yurutme.md) to investigate runtime samples.

## Sources

- [GCC Optimization Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html)
- [Godbolt Compiler Explorer](https://godbolt.org/)
- [Brendan Gregg: The Return of the Frame Pointers](https://www.brendangregg.com/blog/2024-03-17/the-return-of-the-frame-pointers.html)
