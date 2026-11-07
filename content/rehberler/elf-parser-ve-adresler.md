---
title: Validating ELF parsers and address calculations
---

# Validating ELF parsers and address calculations

Binary analysis tools such as Ghidra, IDA, radare2, pyelftools, and LIEF make different assumptions about file validity. A tool's inability to open a file, or its report of a malformed field, does not mean that the Linux kernel will reject that file.

This issue is discussed as **parser differentials** or within **LangSec** (language-theoretic security). The kernel and analysis tools validate different fields for different purposes; acceptance depends on the tool, architecture, and version. This does not by itself establish a performance tradeoff or imply that every analyzer assumes full ABI compliance.

## 1. A bounds-checked ELF64 inventory example

This C11 program reads only **ELF64 little-endian** headers and `PT_LOAD` ranges; it does not execute code. ELF64 wire-format sizes are 64 and 56 bytes for `Elf64_Ehdr` and `Elf64_Phdr`. Decoding fields from bytes avoids host-endianness assumptions and unaligned struct access. `e_phentsize` must be exactly 56; extended `PN_XNUM` numbering is unsupported and explicitly rejected.

The example accepts at most 64 MiB and reads the file into private memory. ELF32, big-endian data, section/relocation parsing, and complete Linux loadability checks are outside its scope. Acceptance does not mean the kernel can execute the file. Save it as `elf-envanter.c`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <inttypes.h>
#include <string.h>

enum { EH_SIZE = 64, PH_SIZE = 56, MAX_INPUT = 64 * 1024 * 1024 };

static uint16_t le16(const unsigned char *p) {
    return (uint16_t)((uint16_t)p[0] | (uint16_t)p[1] << 8);
}
static uint32_t le32(const unsigned char *p) {
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 |
           (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static uint64_t le64(const unsigned char *p) {
    return (uint64_t)le32(p) | (uint64_t)le32(p + 4) << 32;
}
static int reject(const char *reason) {
    fprintf(stderr, "ELF rejected: %s\n", reason);
    return 1;
}
static int parse_elf(const unsigned char *data, size_t size) {
    if (size < EH_SIZE) return reject("short header");
    if (memcmp(data, "\177ELF", 4) != 0) return reject("magic");
    if (data[4] != 2 || data[5] != 1)
        return reject("only ELF64 little-endian is supported");
    if (data[6] != 1 || le32(data + 20) != 1)
        return reject("version");
    if (le16(data + 52) != EH_SIZE) return reject("e_ehsize");
    uint64_t phoff = le64(data + 32);
    uint16_t count = le16(data + 56);
    if (count == 0xffff) return reject("PN_XNUM is unsupported");
    if (count != 0 && le16(data + 54) != PH_SIZE)
        return reject("e_phentsize");
    // Check offset first, then remaining bytes / entry size. No wrapping addition/multiplication.
    if (phoff > size || count > (size - (size_t)phoff) / PH_SIZE)
        return reject("program header file bounds");
    for (size_t i = 0; i < count; ++i) {
        const unsigned char *ph = data + (size_t)phoff + i * PH_SIZE;
        if (le32(ph) != 1) continue; // PT_LOAD
        uint64_t offset = le64(ph + 8), vaddr = le64(ph + 16);
        uint64_t filesz = le64(ph + 32), memsz = le64(ph + 40);
        uint64_t align = le64(ph + 48);
        if (offset > size || filesz > size - (size_t)offset)
            return reject("segment file bounds");
        if (filesz > memsz) return reject("p_filesz > p_memsz");
        if (memsz > UINT64_MAX - vaddr) return reject("virtual address overflow");
        if (align > 1 && ((align & (align - 1)) != 0 ||
                          offset % align != vaddr % align))
            return reject("segment alignment");
        printf("PT_LOAD[%zu] offset=0x%" PRIx64 " vaddr=0x%" PRIx64
               " filesz=0x%" PRIx64 " memsz=0x%" PRIx64 "\n",
               i, offset, vaddr, filesz, memsz);
    }
    puts("Inventory checks passed; loadability was not tested.");
    return 0;
}
int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "Usage: %s ELF\n", argv[0]); return 2; }
    FILE *file = fopen(argv[1], "rb");
    if (!file) { perror("fopen"); return 2; }
    if (fseek(file, 0, SEEK_END) != 0) { fclose(file); return 2; }
    long length = ftell(file);
    if (length < 0 || (uintmax_t)length > MAX_INPUT ||
        (uintmax_t)length > SIZE_MAX) {
        fclose(file); return reject("file size / 64 MiB limit");
    }
    rewind(file);
    size_t size = (size_t)length;
    unsigned char *data = malloc(size ? size : 1);
    if (!data) { fclose(file); return 2; }
    int bad = fread(data, 1, size, file) != size || ferror(file);
    if (fclose(file) != 0) bad = 1;
    int result = bad ? reject("could not read file") : parse_elf(data, size);
    free(data);
    return result;
}
```

```bash
cc -std=c11 -Wall -Wextra -Werror -O2 elf-envanter.c -o elf-envanter
./elf-envanter ./ornek
```

The repository's `python3 scripts/verify-examples.py` compiles this Markdown's actual C block with ASan/UBSan. It tests short headers, incorrect entry sizes, wrapped offsets, and segment ranges using **real malformed ELF files**, rather than relying only on an arithmetic model.

## 2. Building a segment inventory with pyelftools

For automation, use `pyelftools` to list segments. This example only reports fields; it is not a range validator on its own. Record the dependency version:

```python
#!/usr/bin/env python3
import sys
from elftools.elf.elffile import ELFFile

def analyze_elf(filename):
    with open(filename, 'rb') as f:
        elf = ELFFile(f)
        print(f"Architecture: {elf.get_machine_arch()}")
        print(f"Entry point: 0x{elf.header['e_entry']:x}")
        print("\nSegments:")
        for i, segment in enumerate(elf.iter_segments()):
            header = segment.header
            p_type = header['p_type']
            p_offset = header['p_offset']
            p_vaddr = header['p_vaddr']
            p_filesz = header['p_filesz']
            p_memsz = header['p_memsz']
            flags = segment['p_flags']

            flag_str = ""
            flag_str += "R" if flags & 4 else "-"
            flag_str += "W" if flags & 2 else "-"
            flag_str += "X" if flags & 1 else "-"

            print(f"  [{i:02d}] {p_type:<12} Offset: 0x{p_offset:08x} VAddr: 0x{p_vaddr:08x} "
                  f"Filesz: 0x{p_filesz:06x} Memsz: 0x{p_memsz:06x} [{flag_str}]")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <elf-file>")
        sys.exit(1)
    analyze_elf(sys.argv[1])
```

## 3. Parser differentials and traps

Malware and anti-analysis techniques may deliberately modify ELF headers to exploit analyzer assumptions.

### A. Corrupted or removed section headers

Ordinary program loading does not require a section header table. With `ehdr->e_shoff = 0` and `ehdr->e_shnum = 0`, `readelf -S` cannot list sections, and tools such as Ghidra and IDA may have difficulty identifying symbols and functions. Linux may still load the file if other requirements hold. Clearing these fields alone is not proof of loadability.

### B. Overlapping segments

Different `PT_LOAD` segments may map the same file offset (`p_offset`) at different virtual addresses. For example, offset `0x0000` containing the ELF header may be mapped into both a read-only data segment and a code segment. This can complicate an analyzer's control-flow graph.

### C. Overlapping ELF headers

When ELF and program headers share bytes, a field must satisfy more than one structure's constraints. Acceptance depends on architecture, kernel version, and header validation. Do not assume a universal minimum file size or execution on every system. Compare `e_phoff`, `e_phentsize`, and `e_phnum` with file boundaries and the [Linux v6.12 loader checks](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c).

## 4. Structural inspection with fq and Binsider

Alongside `readelf` and `objdump`, these tools support structural binary inspection:

- **`fq`**: First display the decoder's own structure:
  ```bash
  fq -d elf '.' ./ornek
  ```
  This inventory command was run with fq 0.15.1 on macOS arm64 against an ELF64 fixture. Select query fields from your version's output. The older `.program_headers[].type == "LOAD"` recipe is not presented here as a validated API; decoder symbols and field paths depend on the version. Compare with the [decoder source](https://github.com/wader/fq/blob/master/format/elf/elf.go).

- **`binsider`**: An interactive terminal interface for ELF headers, dependencies, strings, and hexdumps:
  ```bash
  binsider ./ornek
  ```

## Investigate further

After checking segment and offset calculations, continue with [linker layout](linker-duzeni.md) to see how segments are arranged during the build. Read [startup and auxv](baslangic-ve-auxv.md) for kernel loading and execution before `main`.

## Sources

- [pyelftools — GitHub (Eli Bendersky)](https://github.com/eliben/pyelftools)
- [fq — jq for binary formats](https://github.com/wader/fq)
- [Binsider — Terminal ELF Analyzer (Orhun Parmaksız)](https://github.com/orhun/binsider)
- [The Cerberus ELF Interface (Phrack #61)](http://phrack.org/issues/61/8.html)
- [Linux v6.12: ELF loader validation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
