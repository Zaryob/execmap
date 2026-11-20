---
title: Function ABIs and binary compatibility
description: Compare System V AMD64, Microsoft x64, and Linux AArch64 argument locations, then test a shared library change with an existing binary.
---

# Function ABIs and binary compatibility

An API describes how source code calls an interface. An application binary interface (ABI) specifies what the compiled caller and callee must agree on, including where arguments and results go, which registers survive the call, how data is laid out, and how symbols are linked. Start with [reading x86-64 assembly](assembly-okuma.md), [C++ call chains](cpp-cagri-zinciri.md), and [ELF dynamic linking](dinamik-baglama.md) for the corresponding inspection techniques.

## Function calling convention explorer

Choose a platform ABI and the number of explicit parameters. Every parameter is a 64-bit integer or pointer, declared in order in an ordinary nonvariadic function. Locations are measured at callee entry, before any stack adjustment or register spills. Floating-point and vector arguments, aggregates, implicit C++ parameters and other hidden arguments need additional classification rules.

[[abi-explorer]]

| Function ABI | Integer and pointer argument registers | First stack argument at entry | 64-bit integer or pointer result |
| --- | --- | --- | --- |
| System V AMD64 | `rdi, rsi, rdx, rcx, r8, r9` | Argument 7 at `[rsp + 8]` | `rax` |
| Microsoft x64 | `rcx, rdx, r8, r9` | Argument 5 at `[rsp + 40]` | `rax` |
| AAPCS64 on Linux | `x0–x7` | Argument 9 at `[sp]` | `x0` |

Each additional stack argument in this model occupies an 8-byte slot. On x86-64 a normal `call` places its return address at `[rsp]`. Microsoft x64 reserves a further 32 bytes from `[rsp + 8]` to `[rsp + 39]` as shadow space. The callee can spill register arguments there. Their values need not be present in those slots when the call begins. On AArch64, `bl` writes the return address to `x30` and leaves `sp` in place. [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [Microsoft x64 calling convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170), [Arm AAPCS64](https://github.com/ARM-software/abi-aa/blob/main/aapcs64/aapcs64.rst).

Beyond argument locations, check caller-saved and callee-saved registers, result classification and any platform unwind requirements. For example, System V AMD64 allows functions to use a 128-byte red zone below `rsp` for data that need not survive a nested call. Microsoft x64 treats memory below `rsp` as volatile. [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [Microsoft x64 stack usage](https://learn.microsoft.com/en-us/cpp/build/stack-usage?view=msvc-170).

## Observe the same C signature on three targets

Download both sources into an empty directory. The call uses ten positions so every target has at least one stack argument. The second argument is a pointer.

```c abi-caller.c
typedef unsigned long long word;
word abi_sum(word, const word *, word, word, word, word, word, word, word, word);

int main(void) {
    const word two = 2;
    return abi_sum(1, &two, 3, 4, 5, 6, 7, 8, 9, 10) == 55 ? 0 : 1;
}
```

```c abi-callee.c
typedef unsigned long long word;

word abi_sum(word a, const word *b, word c, word d, word e,
             word f, word g, word h, word i, word j) {
    return a + *b + c + d + e + f + g + h + i + j;
}
```

Emit assembly with Clang. These sources have no system headers and `-S` stops before assembling or linking, so this inspection doesn't require a target sysroot.

```sh
for target in x86_64-linux-gnu x86_64-pc-windows-msvc aarch64-linux-gnu; do
  clang --target="$target" -O2 -fno-optimize-sibling-calls -S abi-caller.c -o "$target-caller.s"
  clang --target="$target" -O2 -S abi-callee.c -o "$target-callee.s"
done
```

Find the call to `abi_sum` in each caller and follow the values into the chosen ABI's registers and stack slots. For x86-64, add eight to the caller's stack offsets as seen immediately before `call` to compare them with callee entry. On AArch64 the stack offset stays the same across `bl`. The optimized callee may combine loads or reorder independent operations. Add back any changes to the stack pointer before comparing an instruction's offset to the explorer.

On native Linux, build and run the pair with debug info. An address breakpoint stops before the function prologue, so the register and stack positions correspond to the explorer. The test exits with status 0 when the sum is 55.

```sh
cc -Og -g -fno-lto abi-caller.c abi-callee.c -o abi-c
./abi-c
gdb -q -ex 'break *abi_sum' -ex run -ex 'disassemble /r abi_sum' ./abi-c
```

Use `info registers rdi rsi rdx rcx r8 r9 rsp` and `x/5gx $rsp` at entry on Linux x86-64. The first memory word holds the return address and the next four contain 7 through 10. On Linux AArch64 use `info registers x0 x1 x2 x3 x4 x5 x6 x7 x30 sp` and `x/2gx $sp` to see 9 and 10 on the stack. Follow the second argument with `x/gx $rsi` or `x/gx $x1` to read 2 from the pointed-to object.

## Observe a C++ member and a C-linkage wrapper

The nonstatic member of `Counter` receives `this` before its explicit integer parameter. The free wrapper declares C linkage and takes the pointer explicitly.

```cpp abi-cpp.cpp
using word = unsigned long long;

struct Counter {
    word base;
    word add(word increment) const;
};

[[gnu::noinline]] word Counter::add(word increment) const {
    return base + increment;
}

extern "C" [[gnu::noinline]] word counter_add(const Counter *counter, word increment) {
    return counter->add(increment);
}

int main() {
    const Counter counter{40};
    return counter_add(&counter, 2) == 42 ? 0 : 1;
}
```

```sh
c++ -O0 -g abi-cpp.cpp -o abi-cpp
./abi-cpp
nm abi-cpp | grep -E 'counter_add|_ZNK7Counter'
nm -C abi-cpp | grep -E 'counter_add|Counter::add'
gdb -q -ex 'break *counter_add' -ex run -ex 'disassemble /r counter_add' ./abi-cpp
```

On Linux with the usual compiler C++ ABI, compare `counter_add` and the mangled member symbol `_ZNK7Counter3addEy`. In this example `counter` and `this` occupy the first argument register and 2 the second at their respective entries. The wrapper still relies on callers agreeing about the representation of `Counter`. A stable C-facing API commonly uses an opaque pointer with construction and destruction functions in the same library. Exporting C++ objects by value, standard library types, virtual methods or exceptions makes the compiler and runtime contracts part of the interface. [Itanium C++ ABI, data layout, function calls and mangling](https://itanium-cxx-abi.github.io/cxx-abi/abi.html).

## Test an existing client against another library build

Use Linux with a C compiler, GNU-compatible ELF linker and Binutils. The client requires the `abi_value` export in version node `DEMO_1.0` from the shared library whose SONAME is `libabi-demo.so.1`.

```c version-client.c
unsigned long long abi_value(unsigned long long);

int main(void) {
    return abi_value(41) == 42 ? 0 : 1;
}
```

```c version-library.c
unsigned long long abi_value(unsigned long long value) {
    return value + 1;
}
```

```text abi-v1.map
DEMO_1.0 {
    global: abi_value;
    local: *;
};
```

```text abi-v2.map
DEMO_2.0 {
    global: abi_value;
    local: *;
};
```

```sh
mkdir -p old candidate
cc -fPIC -shared version-library.c -Wl,-soname,libabi-demo.so.1 \
  -Wl,--version-script=abi-v1.map -o old/libabi-demo.so.1
cc version-client.c old/libabi-demo.so.1 -o version-client
readelf -dW version-client | grep NEEDED
readelf --version-info version-client | grep DEMO
LD_LIBRARY_PATH="$PWD/old" ./version-client

cc -fPIC -shared version-library.c -Wl,-soname,libabi-demo.so.1 \
  -Wl,--version-script=abi-v2.map -o candidate/libabi-demo.so.1
readelf --dyn-syms --wide candidate/libabi-demo.so.1 | grep abi_value
LD_LIBRARY_PATH="$PWD/candidate" ./version-client
```

The first run exits 0. The replacement exports `abi_value@@DEMO_2.0` and the second run fails at load time because `DEMO_1.0` is missing. The source implementation is identical in this experiment. A compatible release can retain the old symbol version and its behavior alongside new exports. An intentionally incompatible release can use a new SONAME so both generations can coexist. [GNU ld VERSION command](https://sourceware.org/binutils/docs/ld/VERSION.html).

An unchanged SONAME and symbol list still permit silent breaks. For example, inserting a field into a public struct can change offsets in an old caller even if the `extern "C"` export remains identical. A size- or version-tagged struct can support extension when the implementation checks the size before reading new fields and the existing layout is preserved. Compare architecture, object format, SONAME, exported symbols and version requirements, then compare layouts and calling contracts using headers, debug information or disassembly. Run previously built clients against the candidate and compare outcomes under representative inputs. Recompiling clients answers a different question about source compatibility. See [binary diffing and version comparison](ikili-fark-analizi.md) for interpreting binary changes.

Continue with [From a function call to a Linux system call](syscall-boundary.md) to inspect the kernel boundary.
