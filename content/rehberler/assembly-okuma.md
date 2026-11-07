---
title: Preparing to read x86-64 assembly
description: Move from C to disassembly through registers, addressing, the stack, and System V calling conventions.
---

# Preparing to read x86-64 assembly

A disassembler interprets bytes as instructions; it does not automatically recover source variable names or the programmer's intent. The first goal is to follow where a few instructions read and write values. This guide prepares you for the [first GDB investigation](../laboratuvarlar/gdb-ilk-inceleme.md) and [branches and pointers laboratory](../laboratuvarlar/dallanma-ve-pointer.md).

The scope is Linux x86-64, the System V AMD64 ABI, and the usual LP64 data model: `int` is 4 bytes and pointers are 8 bytes. Windows x64 conventions, x32, AArch64, and kernel code are outside these examples. Use [Intel SDM volumes 1 and 2](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html) for instruction meanings and the [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI) for function-boundary contracts.

## 1. Separate bytes, values, and addresses

`0x2a` is 42 in hexadecimal. Those bits in a register are not necessarily an address. Consider the C type, consuming instruction, and memory mapping together. x86-64 is little-endian: a 32-bit `0x12345678` appears at increasing memory addresses as `78 56 34 12`.

`rax` is a 64-bit register; `eax` is its low 32 bits, `ax` its low 16 bits, and `al` its low 8 bits. In 64-bit mode, writing a 32-bit general-purpose register such as `eax` zeros the upper half of the corresponding 64-bit register. This does not apply to `ax` or `al`. Read a C `int` argument using `esi`, rather than treating all of `rsi` as that integer, and use the correct signed interpretation.

## 2. Keep Intel and AT&T syntax distinct

This series uses Intel syntax: select `-M intel` in GNU objdump and `set disassembly-flavor intel` in GDB. The [objdump documentation](https://sourceware.org/binutils/docs/binutils/objdump.html) describes that option.

These lines describe the same operation; they are not a standalone program:

```asm
mov eax, DWORD PTR [rdi]   # Intel: destination, source
movl (%rdi), %eax          # AT&T: source, destination
```

Both read four bytes at the address in `rdi`. In contrast, `mov rax, rdi` copies register bits without reading memory. Square brackets are an initial clue to a memory operand in Intel syntax.

## 3. Address calculation versus memory reads

In Intel syntax, `[base + index * scale + displacement]` is an effective-address expression; hardware scales can be 1, 2, 4, or 8. This fragment is schematic: `rdi` represents the start of a valid `int` array and `rsi` an in-bounds index:

```asm
lea rdx, [rdi + rsi*4]    # Compute the address of dizi[i]
mov eax, DWORD PTR [rdx]  # Read the value of dizi[i]
add eax, 3               # Increment the value
mov DWORD PTR [rdx], eax  # Write back to the same element
```

`lea` computes the address expression without reading memory at that address. The compiler can also use it for arithmetic. Not every `lea` corresponds to a C pointer variable, and not every memory access represents a separate source variable. `DWORD PTR` specifies a four-byte access here, not the pointer's size.

## 4. What to inspect at function entry

For the simple integer/pointer signatures in these labs, the first six arguments use `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9`, in that order. Interpret the low 32 bits for an `int`; an `int` return value is in `eax`. Structures, floating-point values, and variadic calls have additional rules. This is separate from the Linux `syscall` register contract.

An ordinary near `call` pushes a return address and transfers control; an ordinary `ret` returns through that address. `rsp` is the stack pointer and `rip` the instruction pointer. At the **first instruction** of a function, before its prologue runs, `[rsp]` holds the return address. Do not reuse that assumption after `push` or `sub rsp, ...` changes the stack.

For these simple psABI calls, the stack is 16-byte aligned before the call. The eight-byte return address means `(rsp + 8) % 16 == 0` at entry. `rbp` can be a frame pointer but need not be. The 128-byte user-space red zone lets leaf functions hold temporary data without growing the stack. Absence of `sub rsp` or `push rbp` therefore does not rule out a function boundary. See the [psABI low-level system information chapter](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex).

## 5. Where is the condition represented?

`cmp` sets flags as a subtraction would, without storing the result; `test` sets flags from a bitwise AND. A later conditional instruction consumes them. Signed `<` with `jl` and unsigned `<` with `jb` are different conditions. Do not interpret them as equivalent without considering types.

A C `if` may become a conditional jump (`jcc`), conditional move (`cmovcc`), `setcc`, or arithmetic. `cmov` selects data; it does not itself transfer execution to another instruction address. A constant condition may disappear entirely. Check instruction meanings in Intel's reference and possible transformations in the [GCC optimization documentation](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html).

## 6. A method for reading disassembly

1. Record architecture and syntax: `file ./program`, `readelf -hW ./program`.
2. Open a bounded function: `objdump -d -M intel --disassemble=hesapla ./program`.
3. Note each instruction's input registers, memory width, and written destination.
4. Distinguish entry ABI information from subsequent data flow; argument registers can change.
5. Account for PIE/ASLR when relating static addresses to the process. Do not equate a file offset with a virtual address; return to the [address guide](elf-parser-ve-adresler.md).
6. Test the hypothesis by stepping one instruction in GDB and rereading memory. The debugger's `x` output is a chosen representation of memory, not proof of a C type.

Check your understanding: why is `lea` not a memory read? What happens to the upper half of `rax` after writing `eax`? Why should a C `if` not always lead you to search for `jne`? If you can answer using instruction and ABI sources, continue with the [GDB laboratory](../laboratuvarlar/gdb-ilk-inceleme.md), then return to [stripped ELF](stripped-elf.md).

## Sources and supplementary study

- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html): volume 1 for registers and data representation; volume 2 for `MOV`, `LEA`, `CMP`, `TEST`, `Jcc`, `CMOVcc`, `CALL`, and `RET`.
- [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI): data model, parameter passing, and stack contracts.
- [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html): syntax and symbol-specific disassembly.
- [GDB: Registers](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Registers.html): reading registers in the selected frame; use the innermost frame at entry.
- [mytechnotalent/Reverse-Engineering, x64 Course](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): especially lessons 127–132 and 160–163 for supplementary study. The topic sequence is an inspiration; this guide's prose and lab code were created for execmap. Technical contracts are validated against the primary documents above.
