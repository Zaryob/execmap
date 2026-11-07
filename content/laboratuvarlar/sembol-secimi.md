---
title: Symbol selection and function interposition with LD_PRELOAD
---

# Symbol selection and function interposition with LD_PRELOAD

For a call in a dynamically linked ELF, the dynamic linker's lookup scope determines which shared object (`.so`) supplies the function definition.

This laboratory creates two libraries defining the same function, `secim`. It uses `LD_PRELOAD` to redirect the call without changing the main executable's `DT_NEEDED` entries.

## 1. Prepare the source files

Create three small files: `liba.c`, `libb.c`, and `ana.c`.

### First library: liba.c

```c
#include <stdio.h>

int secim(void) {
    return 11;
}
```

### Second library: libb.c, the interposer

```c
#include <stdio.h>

int secim(void) {
    return 22;
}
```

### Main program: ana.c

```c
#include <stdio.h>

// Declaration of an external function
int secim(void);

int main(void) {
    printf("secim() called, return value: %d\n", secim());
    return 0;
}
```

## 2. Build the libraries and executable

Use position-independent code (`-fPIC`) for the shared libraries, then link the main program:

```bash
# 1. Build the libraries as shared objects (.so):
gcc -Wall -Wextra -fPIC -shared liba.c -o liba.so
gcc -Wall -Wextra -fPIC -shared libb.c -o libb.so

# 2. Link the main program against liba.so:
# -Wl,-rpath,. adds the current directory to the runtime library search path
gcc -Wall -Wextra ana.c -L. -la -Wl,-rpath,. -o ana
```

## 3. Run and compare

### Normal execution

Run the main program directly:

```bash
./ana
```

Output:

```text
secim() called, return value: 11
```

The program loads `liba.so`, listed in `DT_NEEDED`, and calls its `secim` definition.

### Interposition with LD_PRELOAD

Preload `libb.so` using the environment variable:

```bash
LD_PRELOAD=./libb.so ./ana
```

Output:

```text
secim() called, return value: 22
```

In a normal glibc environment outside secure-execution mode, expected outputs are 11 and 22 respectively. Symbol selection changes without modifying the main executable's `DT_NEEDED` entry.

## 4. Trace dynamic linker lookup

Capture a log on Linux/glibc outside secure-execution mode:

```bash
LD_DEBUG=symbols,bindings LD_PRELOAD=./libb.so ./ana >ana.stdout 2>ana.ld-debug
grep -E 'symbol=secim|binding file.*secim' ana.ld-debug
```

No Linux linker log was measured during this revision. Compare `secim` lookup lines with the binding of the `ana` reference to the `libb.so` definition in your recording. PID, paths, and version formatting may differ. `symbols` reports lookup and `bindings` reports binding; `grep "symbol=secim"` alone does not show the binding line. Do not assume every remaining library in scope is searched after a definition is found.

## 5. AT_SECURE and -Bsymbolic limits

1. **AT_SECURE**: A setuid bit alone does not guarantee secure execution on every run. In this mode, glibc restricts preload paths, ignoring those containing slashes, with a narrow exception for setuid objects in standard directories. See [startup and auxv](../rehberler/baslangic-ve-auxv.md). This laboratory does not change privileges.
2. **`-Bsymbolic`**: Binds a shared object's internal references to its own global definitions where available. The call **from the main program**, `ana → secim`, is outside that scope. Even if `liba.so` is rebuilt with the option, the expected result of `LD_PRELOAD=./libb.so ./ana` here remains 22. To test internal references, add another function in `liba` that calls `secim` ([GNU ld](https://sourceware.org/binutils/docs/ld/Options.html)).

## Investigate further

Return to [dynamic linking](../rehberler/dinamik-baglama.md) for GOT/PLT mechanics. Complete the [debug information laboratory](debug-bilgisi.md) to separate and reconnect symbols for a stripped binary.

## Sources

- [ld.so — Linux man-pages (man 8 ld.so)](https://man7.org/linux/man-pages/man8/ld.so.8.html)
- [MaskRay: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [PLTHook — GitHub](https://github.com/kubo/plthook)
