---
title: Dynamic linking — GOT, PLT, and symbol resolution
---

# Dynamic linking — GOT, PLT, and symbol resolution

A dynamically linked ELF file on Linux cannot know at compile time the runtime addresses of functions in external libraries, such as `puts` or `malloc` in `libc.so.6`. ASLR can load shared libraries at different addresses on each execution.

ELF uses two important structures to support this:

1. **GOT (Global Offset Table)**: A pointer table holding resolved memory addresses for data and functions.
2. **PLT (Procedure Linkage Table)**: Executable call stubs that can route the first call through the dynamic linker for lazy binding and subsequent calls through the resolved GOT slot.

The GOT/PLT mechanism helps explain external calls, function hooking, and RELRO memory protections.

## 1. How the GOT and PLT interact

The following diagram illustrates the first `puts("Hello")` call as it passes through the PLT and GOT:

```text
User code                  PLT (.plt)                    GOT (.got.plt)
+------------------+       +------------------------+    +-------------------------+
| call puts@plt    | ----> | puts@plt:              | -> | GOT[puts]               |
+------------------+       |   jmp *GOT[puts]       |    | Initially points back   |
                          |   push $reloc_offset   | <- | into the PLT entry      |
                          |   jmp PLT0             |    +-------------------------+
                          +------------------------+
                                     |
                                     v
                          +------------------------+    +-------------------------+
                          | PLT0 (common resolver) | -> | _dl_runtime_resolve()   |
                          |   push *GOT[1]         |    | Find puts in libc.so    |
                          |   jmp  *GOT[2]         |    | and update GOT[puts]    |
                          +------------------------+    +-------------------------+
                                                                   |
                                                                   v
                                                        Execute resolved puts()
```

### Lazy binding, step by step

1. **First call**: `call puts@plt` transfers control to the PLT entry.
2. **Initial jump**: `jmp *GOT[puts]` executes. Initially the slot points back into the PLT entry, at the `push $reloc_offset` path, rather than to `puts`.
3. **Resolver entry**: The relocation information is pushed, and `jmp PLT0` transfers control to the common dynamic linker resolver path.
4. **Resolution and update**: The `_dl_runtime_resolve()` path resolves the symbol, locates `puts` in `libc.so`, and updates `GOT[puts]` with the resolved address.
5. **Later calls**: Another call to `puts@plt` jumps directly through the resolved GOT slot without repeating that resolution.

## 2. Inspecting relocations with readelf

Use `readelf -r` to examine an ELF file's relocation records and external references:

```bash
readelf -r ./ornek
```

No relocation dump was generated during this revision. Save the declared record count together with every entry in actual output; addresses and records vary by build and linker.

### Common x86-64 relocation types

- **`R_X86_64_JUMP_SLOT`**: A GOT entry for a function address resolved through the PLT.
- **`R_X86_64_GLOB_DAT`**: A GOT address relocation for a function or data symbol.
- **`R_X86_64_RELATIVE`**: A relative address adjusted by the load base for ASLR/PIE.
- **`R_X86_64_IRELATIVE`**: Indirect resolution at runtime, associated with GNU IFUNC behavior such as selecting a `memcpy` implementation for available CPU features.

## 3. Partial and full RELRO

Writable GOT slots are targets for memory corruption, including GOT overwrite attacks. **RELRO (Relocation Read-Only)** reduces this writable area after relocation.

Common GNU/Linux ELF options are:

- `-Wl,-z,norelro`: Do not request a RELRO region.
- `-Wl,-z,relro`: Create `PT_GNU_RELRO`; lazy PLT slots may remain writable.
- `-Wl,-z,relro,-z,now`: The common “full RELRO” arrangement; resolve dynamic function relocations at startup and make the relevant GOT area read-only.

Verify the protected range with `readelf -lW` and runtime mappings. The disappearance of a `.got.plt` section is not a necessary part of the definition. RELRO reduces the writable-GOT attack surface; it is not absolute protection against an attacker already executing arbitrary code in the process. Permission policy may allow pages to become writable again through `mprotect` ([glibc RELRO implementation](https://github.com/bminor/glibc/blob/glibc-2.40/elf/dl-reloc.c), [mprotect(2)](https://man7.org/linux/man-pages/man2/mprotect.2.html)).

## 4. PLTHook, Frida, and eBPF

**PLTHook** is an example of manipulating the GOT/PLT mechanism in C. In outline, it:

1. Scans the in-memory `PT_DYNAMIC` segment to find `DT_JMPREL` relocations and `DT_STRTAB` strings.
2. Locates the GOT offset of a matching `R_X86_64_JUMP_SLOT` for a function such as `puts`.
3. Temporarily changes the page to `PROT_READ | PROT_WRITE` using `mprotect()`.
4. Replaces the GOT slot's function pointer with a hook.

### Other observation mechanisms

- **User space: [Frida](https://frida.re/) Interceptor**:
  Frida instruments a target function; its implementation is not the same as replacing a GOT slot. This example uses the **Frida 17 API** ([17.0.0 release notes](https://frida.re/news/2025/05/17/frida-17-0-0-released/), [API](https://frida.re/docs/javascript-api/)); the `puts` export must be loaded:
  ```javascript
  Interceptor.attach(Module.getGlobalExportByName("puts"), {
      onEnter(args) { console.log("[+] puts: " + args[0].readUtf8String()); }
  });
  ```
  This block intercepted a `puts` call in our own test process using Frida 17.5.1 on macOS arm64. That API check does not validate Linux attach permissions or conditions.
- **Kernel level: [eBPF uprobes](https://docs.kernel.org/trace/uprobetracer.html)**:
  A uprobe can observe a user function without establishing a ptrace relationship; the Linux x86 implementation may write a software breakpoint at the target instruction. RELRO data pages and uprobes are different mechanisms. The [eBPF guide](ebpf-ile-olaylar.md) discusses access, cost, and detection limits. Use the actual libc file path on your distribution.

## 5. Symbol lookup and LD_PRELOAD

**Symbol lookup scope** selects definitions from loaded objects. The main program, preloaded objects, and dependencies participate in normal glibc startup; visibility, symbol versioning, `-Bsymbolic`, `dlopen` scopes, and namespaces can change the result. A libc hook does not cover raw syscalls.

**Library file search** is a separate operation. For a dependency name without a slash, glibc `ld.so` generally searches:

1. The relevant `DT_RPATH` when `DT_RUNPATH` is absent.
2. `LD_LIBRARY_PATH` outside secure-execution mode.
3. `DT_RUNPATH`, only for that object's direct dependencies.
4. `/etc/ld.so.cache`.
5. The target ABI's default directories.

A name containing a slash is interpreted as a path. See [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html) for details such as `-z nodefaultlib` and glibc-hwcaps; do not assume `/lib64` on every architecture.

## Investigate further

Try the [symbol selection laboratory](../laboratuvarlar/sembol-secimi.md) to observe `LD_PRELOAD` changing call targets. Continue with [stripped ELF](stripped-elf.md) for analysis when ordinary symbol and debug information is absent.

## Sources

- [MaskRay: All about symbol versioning](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)
- [MaskRay: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [MaskRay: Copy relocations, canonical PLT entries and protected visibility](https://maskray.me/blog/2021-01-09-copy-relocations-canonical-plt-entries-and-protected)
- [glibc 2.40: _dl_fixup (elf/dl-runtime.c)](https://github.com/bminor/glibc/blob/glibc-2.40/elf/dl-runtime.c)
- [glibc 2.40: x86-64 resolver trampoline](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/x86_64/dl-trampoline.h)
- [PLTHook — Hook function calls via PLT](https://github.com/kubo/plthook)
- [ld.so — Linux man-pages](https://man7.org/linux/man-pages/man8/ld.so.8.html)
