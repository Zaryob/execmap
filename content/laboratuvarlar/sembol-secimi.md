---
title: Symbol selection and function interposition with LD_PRELOAD
---

# Symbol selection and function interposition with LD_PRELOAD

Make the same executable print **11**, then **22**, by changing which library supplies one function. You will build the executable once and leave it unchanged during that comparison.

A shared library is a file of functions that a program can load, usually ending in `.so` on Linux. **Function interposition** means supplying another definition of a function that a program calls. This lab makes that idea visible with a single return value.

## Before you start

Use Linux with glibc, GCC, and GNU binutils. Run this as an ordinary, nonprivileged lab program. Special secure-execution rules can change how the loader treats environment variables.

Create a working directory in the terminal:

```bash
mkdir -p ~/execmap-labs/symbol-selection
cd ~/execmap-labs/symbol-selection
```

Keep running the commands from this directory. The example's library paths refer to the current directory.

## 1. Create two answers to the same function call

Save the first library as `liba.c`. Its `secim` function returns 11:

```c
#include <stdio.h>

int secim(void) {
    return 11;
}
```

Save the replacement library as `libb.c`. It defines the same function name but returns 22:

```c
#include <stdio.h>

int secim(void) {
    return 22;
}
```

Save the main program as `ana.c`. It calls `secim` without defining that function itself:

```c
#include <stdio.h>

// Declaration of an external function
int secim(void);

int main(void) {
    printf("secim() called, return value: %d\n", secim());
    return 0;
}
```

**Before compiling:** confirm that you have three files, and that only the two library files define `secim`.

## 2. Build the two libraries and one executable

In the terminal:

```bash
# Build the two shared libraries:
gcc -Wall -Wextra -fPIC -shared liba.c -o liba.so
gcc -Wall -Wextra -fPIC -shared libb.c -o libb.so

# Build the executable, initially linked against liba:
gcc -Wall -Wextra ana.c -L. -la -Wl,-rpath,. -o ana
```

`-shared` creates a shared library. `-fPIC` builds code suitable for loading at different addresses. For the executable, `-L.` lets the linker search this directory and `-la` selects `liba.so`. The `rpath` option lets the running example look here for its library too.

You should now have `liba.so`, `libb.so`, and `ana` in addition to the source files.

## 3. Run the ordinary version

```bash
./ana
```

Expected output:

```text
secim() called, return value: 11
```

The executable normally uses the `secim` definition from `liba.so`.

## 4. Preload the replacement

```bash
LD_PRELOAD=./libb.so ./ana
```

Expected output:

```text
secim() called, return value: 22
```

The environment variable asks the dynamic linker to preload `libb.so`. In this ordinary glibc setup, its definition is selected for the call. The executable still has the same dependency on `liba.so`; we changed function selection without rebuilding `ana`.

The variable assignment above applies to that command. Run `./ana` again normally: it should print 11 again.

**Your checkpoint:** predict the result before each run and explain which library supplies `secim`.

## 5. Confirm the selected library in a loader log

Run this optional investigation from the same directory:

```bash
LD_DEBUG=symbols,bindings LD_PRELOAD=./libb.so ./ana >ana.stdout 2>ana.ld-debug
grep -E 'symbol=secim|binding file.*secim' ana.ld-debug
```

`ana.stdout` contains the program's answer. `ana.ld-debug` contains the loader's much longer diagnostic output. The final command keeps the lines relevant to `secim`.

Look for a binding of the reference in `ana` to the definition in `libb.so`. A lookup line says the loader is looking for a name; a binding line says which definition was chosen. PID and path formatting will vary. Do not expect every library to be searched after a suitable definition has already been found.

## If a run fails

**`liba.so` cannot be found:** run from the directory containing `ana` and both `.so` files. This teaching example uses relative paths.

**The preload file is ignored:** check its name, location, and architecture. This exercise assumes an ordinary glibc process outside secure-execution mode; do not test it by changing setuid bits or system privileges.

**Your replacement still gives 11:** check that `libb.c` returns 22, rebuild `libb.so`, and confirm that the preload assignment is on the same command as `./ana`.

## Further details

`DT_NEEDED` records a shared-library dependency in the executable. Preloading a definition does not rewrite that record. See [dynamic linking](../rehberler/dinamik-baglama.md) for the lookup machinery.

Secure execution (`AT_SECURE`) restricts preload behavior, including paths containing slashes. A setuid bit alone does not establish that a particular run entered this mode. The [startup guide](../rehberler/baslangic-ve-auxv.md) explains how to inspect it.

The linker option `-Bsymbolic` concerns references **inside the shared object** being built. Our call comes from `ana`, outside `liba`, so adding that option to `liba.so` does not by itself make this call ignore the preload. A separate internal-call fixture in the Linux validation showed why those scopes matter.

Linux/glibc validation on November 7, 2026 confirmed the two answers and the lookup/binding log. Those results do not replace your own run's evidence. Save the two program outputs and the relevant binding line, then continue with [debug information](debug-bilgisi.md).

## Sources

- [ld.so — Linux man-pages (man 8 ld.so)](https://man7.org/linux/man-pages/man8/ld.so.8.html)
- [MaskRay: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [PLTHook — GitHub](https://github.com/kubo/plthook)
