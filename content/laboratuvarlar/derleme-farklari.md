---
title: Examining compiler differences and optimization levels
---

# Examining compiler differences and optimization levels

Compiler optimization is a major reason source structure differs from the machine code seen in a disassembler. The same C function can produce substantially different assembly under different build options.

This laboratory builds one C file at three optimization levels (`-O0`, `-O2`, `-Os`) and uses `objdump` to examine inlining, loop unrolling, register allocation, and frame-pointer differences.

Use Linux ELF, GNU binutils, and GCC; x86-64 register/opcode explanations do not transfer directly to other architectures. Record `gcc --version`, `ld --version`, `objdump --version`, and the target architecture. The features below are hypotheses to check, not guarantees for every version.

## 1. Prepare the program

Create `opt.c` with a small calculation and helper function:

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

## 2. Build at three optimization levels

Compile with three option sets:

```bash
# 1. Debug / unoptimized build:
gcc -Wall -Wextra -O0 -g opt.c -o opt_O0

# 2. Standard production / speed optimization:
gcc -Wall -Wextra -O2 opt.c -o opt_O2

# 3. Size optimization (embedded systems):
gcc -Wall -Wextra -Os opt.c -o opt_Os
```

Compare file/code sizes with `size`:

```bash
size opt_O0 opt_O2 opt_Os
```

During this revision, all three builds on macOS arm64 with Apple Clang 21 produced `Result: 285`. This is not a Linux/GCC assembly or size measurement. Record GNU `size` results in your own environment; `-Os` does not guarantee the smallest complete file in every example.

## 3. Compare disassembly

Inspect `seri_topla` in all three files with `objdump -d -M intel`.

### A. -O0: a straightforward stack-oriented build

```bash
objdump -d -M intel --no-show-raw-insn opt_O0 | grep -A 25 "<seri_topla>:"
```

Possible features to verify:

- `push rbp; mov rbp, rsp` establishes a frame pointer.
- Locals are stored on the stack, such as `[rbp-0x4]` and `[rbp-0x8]`.
- The loop explicitly calls `kare_al`, with repeated memory reads and writes.

### B. -O2: register allocation and inlining

```bash
objdump -d -M intel --no-show-raw-insn opt_O2 | grep -A 25 "<seri_topla>:"
```

Possible features to verify:

- The frame pointer may be omitted, depending on the target, options, and function requirements.
- `kare_al` may be inlined, and the loop may be vectorized or algebraically transformed. Inspect actual instructions.
- Counters and intermediate sums may use registers; this does not imply all memory accesses disappear.

### C. -Os: size-oriented code

```bash
objdump -d -M intel --no-show-raw-insn opt_Os | grep -A 20 "<seri_topla>:"
```

Possible features to verify:

- Code-size costs affect transformation decisions; loop unrolling is not absolutely prohibited.
- Instructions may be selected for size, without a guarantee of minimum length for each operation.
- Function-alignment padding (`nop` sequences) may be reduced.

## 4. Lessons for analysis

1. **The missing-function assumption**: A helper name absent from Ghidra or IDA may have been inlined by `-O2` or `-O3`, rather than simply deleted.
2. **Stack variables**: Always looking for locals at `[RBP-X]` is an `-O0` habit. Optimized values may move between registers over their lifetimes.

## Investigate further

Complete the [branches and pointers laboratory](dallanma-ve-pointer.md) for conditions represented as jumps or data selection and stores through pointers. If you are new to assembly/GDB, follow [preparation](../rehberler/assembly-okuma.md) with the [first investigation](gdb-ilk-inceleme.md).

Read [binary diffing](../rehberler/ikili-fark-analizi.md) to compare code changes across builds graphically. Continue with [perf execution analysis](../rehberler/perf-ile-yurutme.md) to investigate where execution time or sampled events accumulate.

## Sources

- [GCC Optimization Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html)
- [Godbolt Compiler Explorer](https://godbolt.org/)
- [Brendan Gregg: The Return of the Frame Pointers](https://www.brendangregg.com/blog/2024-03-17/the-return-of-the-frame-pointers.html)
