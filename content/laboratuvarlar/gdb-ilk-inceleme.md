---
title: A first GDB investigation — from C to machine code
description: Observe function arguments, the return address, and stores through a pointer one instruction at a time.
---

# A first GDB investigation — from C to machine code

Follow one small function from its input arguments to the number it changes in memory. You will first get **12** from an ordinary run, then use GDB to change one argument and get **16**.

GDB is a debugger: it can pause a program so you can inspect its current state. You do not need to understand every assembly instruction to complete this lab. Focus on one question: **which instruction changes the number?**

## Before you start

Use **Linux x86-64**, GCC, GNU binutils, and GDB. Basic C functions and pointers are enough; the [assembly preparation guide](../rehberler/assembly-okuma.md) explains registers and the stack. The C program can run on other systems, but the register commands below are specific to Linux x86-64.

Open a Linux terminal and create a separate working directory. Keep using this terminal unless a step explicitly says “inside GDB”:

```bash
mkdir -p ~/execmap-labs/first-gdb
cd ~/execmap-labs/first-gdb
uname -sm
gcc --version
gcc -dumpmachine
ld --version
objdump --version
gdb --version
getconf GNU_LIBC_VERSION
```

**Check before continuing:** `uname -sm` should identify Linux and `x86_64`. Save the version output with your notes. On macOS, a command named `gcc` may actually be Clang; run this investigation inside the intended Linux environment.

## 1. Create and run the program

Save the following source in this directory as `ilk-inceleme.c`:

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

The main program starts `sayi` at 7. It passes the **address** of that number and the increment 5 to `hesapla`. Inside the function, `hedef` points to the number and `artis` holds the increment. The function writes 7 + 5 into the original number, then returns that value.

In the terminal, compile and run it:

```bash
gcc -std=c11 -Wall -Wextra -Werror -O0 -g -fno-omit-frame-pointer ilk-inceleme.c -o ilk-inceleme
./ilk-inceleme
file ./ilk-inceleme
readelf -hW ./ilk-inceleme
objdump -d -M intel --disassemble=hesapla ./ilk-inceleme
```

The program should print:

```text
value=12 result=12
```

`value` is the number stored in `main`; `result` is the returned value. They should agree. `-g` adds debugger information and `-O0` keeps this first investigation easier to follow. `readelf` describes the executable; `objdump` shows the machine instructions for `hesapla`. Addresses and exact instructions can differ on your machine.

## 2. Pause at the function's first instruction

In the same terminal, open the debugger:

```bash
gdb -q ./ilk-inceleme
```

You should now see a `(gdb)` prompt. Enter the next block **inside GDB**, without typing the prompt itself:

```text gdb
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

`start` pauses in `main`. `break *hesapla` places a breakpoint at the function's first machine instruction; `continue` runs until that breakpoint. A breakpoint is a place where the debugger stops the program.

Read these three observations first:

- `esi` should be **5**, the increment passed to the function.
- `x/wd $hedef_adresi` should show **7**, the number before the write.
- `x/i $pc` shows the instruction that will execute next.

The values beginning with `$` that we create using `set` are debugger notes. `$hedef_adresi` saves the target address so we can keep inspecting it even if a register changes.

The remaining commands also inspect the stack. At this exact entry point, `[rsp]` holds the return address and `rsp % 16` should be 8 for this call. Keep these as additional observations; you can complete the memory-write exercise before studying the ABI details in the [assembly guide](../rehberler/assembly-okuma.md).

## 3. Watch the number change

Still inside GDB, run this short block repeatedly:

```text gdb
stepi
x/i $pc
info registers rip rsp rbp
x/wd $hedef_adresi
```

Each `stepi` executes one machine instruction. After each step, look at the value shown by `x/wd $hedef_adresi`. It will stay 7 for several steps, then become 12.

**Your checkpoint:** identify the instruction that changes the target from **7 to 12**. The instruction shown by `$pc` after a step is the *next* instruction; the write is the one you just executed. Not every `mov` writes your target: some only save values on the stack. Compare the destination address with `$hedef_adresi`.

Once you have seen 12, stop stepping while you are still inside `hesapla`. Then enter:

```text gdb
finish
p/d (int)$eax
p sayi
continue
quit
```

`finish` runs until the current function returns to its caller. Both `eax` and `sayi` should now show 12. `continue` lets the program finish, and `quit` closes GDB.

If you accidentally step through the return instruction before using `finish`, restart from step 2. `finish` always applies to the currently selected function.

## 4. Change one input and predict the result

The original call added 5 to 7. Predict what should happen if it adds 9 instead.

Open a **fresh** session in the terminal:

```bash
gdb -q ./ilk-inceleme
```

Then enter this block inside GDB:

```text gdb
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

This time the source-level breakpoint lets GDB find the argument by its name, `artis`. `set variable artis = 9` changes that argument in the running process. The expected program output is:

```text
value=16 result=16
```

Run `./ilk-inceleme` once more outside GDB. It should return to `value=12 result=12`: the debugger changed one run, not the executable file.

## Check your understanding

You have completed the lab when you can explain:

1. Why the first argument is an address rather than the number 7.
2. Which instruction writes 12 through that address.
3. Why changing the increment to 9 produces 16 in both output fields.

Keep your compiler versions, disassembly, before/after values, and the instruction responsible for the write. Continue with [branches and pointers](dallanma-ve-pointer.md).

## If something looks different

**An x86 register is unknown:** recheck the target architecture. These register names do not transfer directly to ARM.

**GDB cannot start the program:** a container or sandbox may restrict debugging (`ptrace`). An ordinary successful run does not prove that the debugger steps worked.

**Addresses change between runs:** that is expected with ASLR. The exercise saves addresses from the current run instead of assuming fixed ones.

**One source line produces several instructions:** that is normal. Likewise, optimized builds may hide variables or use a different layout. This lab uses `-O0`; debugger stepping is not a timing measurement. See [debug information](debug-bilgisi.md) and [stripped ELF](../rehberler/stripped-elf.md) when you are ready to explore those differences.

## Sources and supplementary study

- [GDB: Machine Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html): `disassemble /r` and the source/instruction relationship.
- [GDB: Continuing and Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [Memory](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html), [Assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html).
- [GCC: Debugging Options](https://gcc.gnu.org/onlinedocs/gcc/Debugging-Options.html) and [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI).
- [mytechnotalent/Reverse-Engineering](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): lessons 160–163, supplementary study connecting small-program inspection to behavior changes. This laboratory's code and prose were created for execmap.
