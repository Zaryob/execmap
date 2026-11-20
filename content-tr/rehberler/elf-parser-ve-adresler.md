---
title: ELF ayrıştırıcısını ve adres hesaplarını doğrulama
description: Ayrıştırıcı çıktısını ve adres aralıklarını doğrulayın, pyelftools ile bir envanter çıkarın.
---

# ELF ayrıştırıcısını ve adres hesaplarını doğrulama

Ghidra, IDA, radare2, pyelftools ve LIEF gibi ikili analiz araçları, dosya geçerliliği hakkında farklı varsayımlarda bulunur. Bir aracın bir dosyayı açamaması veya hatalı bir alan bildirmesi, Linux çekirdeğinin o dosyayı reddedeceği anlamına gelmez.

Bu konu, "parser farklılıkları" veya "dil teorik güvenliği" (LangSec) kapsamında ele alınmaktadır. Çekirdek ve analiz araçları, farklı amaçlar için farklı alanları doğrular; kabul, araç, mimari ve sürümle ilgilidir.

## 1. Sınır kontrolü ile bir ELF64 envanter örneği

Bu C11 programı yalnızca **ELF64 little-endian** başlıklarını ve `PT_LOAD` aralıklarını okur; kodu çalıştırmaz. ELF64 wire-format boyutları, `Elf64_Ehdr` ve `Elf64_Phdr` için 64 ve 56 bayttır. Baytlardan alanları çözmek, ana bilgisayar endian'ına yönelik varsayımları ortadan kaldırır ve hizasız yapıya erişimi önler. `e_phentsize`'ın tam olarak 56 olması gerekir; genişletilmiş `PN_XNUM` numaralandırması desteklenmez ve açıkça reddedilir.

Bu örnek, en fazla 64 MiB'ı kabul eder ve dosyayı özel belleğe yükler. ELF32, big-endian veri, bölüm/yer değiştirme ayrıştırma ve tam Linux yükleme kontrolleri, kapsamı dışındadır. Kabul, çekirdeğin dosyayı çalıştırmayacağı anlamına gelmez. `elf-envanter.c` olarak kaydedin:

```c elf-envanter.c
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

Deponun `python3 scripts/verify-examples.py` betiği, bu Markdown'taki gerçek C bloğunu ASan/UBSan ile derler. Bu, yalnızca aritmetik bir modele güvenmek yerine, kısa başlıkları, yanlış giriş boyutlarını, sarılmış ofsetleri ve bölüm aralıklarını gerçek, hatalı ELF dosyaları kullanarak test eder.

## 2. pyelftools ile bir bölüm envanteri oluşturma

Otomasyon için, bölümleri listelemek için `pyelftools`'ı kullanın. Bu örnek yalnızca alanları bildirir; kendi başına bir aralık doğrulaması değildir. Bağımlılık sürümünü kaydedin:

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

## 3. Parser farklılıkları ve tuzaklar

Kötü amaçlı yazılımlar ve analiz araçlarının varsayımlarını istismar etmek için, ELF başlıklarını kasıtlı olarak değiştirebilir.

### A. Bozuk veya kaldırılmış bölüm başlıkları

Normal bir program yükleme, bölüm başlık tablosunu gerektirmez. `ehdr->e_shoff = 0` ve `ehdr->e_shnum = 0` ile `readelf -S`, bölümleri listleyemez ve Ghidra ve IDA gibi araçlar, sembolleri ve işlevleri belirlemede zorlanabilir. Diğer gereksinimler karşılanıyorsa, Linux yine de dosyayı yükleyebilir. Bu alanları tek başına temizlemek, yüklenebilirlik kanıtı değildir.

### B. Kesişen bölümler

Farklı `PT_LOAD` bölümleri aynı dosya ofsetini (`p_offset`) farklı sanal adreslerde eşleştirebilir. Örneğin, ELF başlığını içeren `0x0000` ofseti hem okumaya yalnızca izin verilen veri bölümüne hem de kod bölümüne eşleştirilebilir. Bu, bir analizcinin kontrol akış grafığını karmaşıklaştırabilir.

### C. Çakışan ELF başlıkları

ELF ve program başlıkları aynı baytları paylaştığında, bir alan en az bir yapının kısıtlamalarını karşılamalıdır. Kabul, mimariye, çekirdek sürümüne ve başlık doğrulamasına bağlıdır. Evrensel bir minimum dosya boyutu veya her sistemde çalışmayı varsaymayın. `e_phoff`, `e_phentsize` ve `e_phnum` değerlerini dosya sınırlarıyla ve [Linux v6.12 yükleyici kontrolleri](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) ile karşılaştırın.

## 4. fq ve Binsider ile yapısal inceleme

`readelf` ve `objdump` ile birlikte, bu araçlar yapısal ikili incelemeyi destekler:

- **`fq`**: Öncelikle, çözücünün kendi yapısını gösterin:
  ```bash
  fq -d elf '.' ./ornek
  ```
  Bu komut, macOS arm64 üzerinde ELF64 bir örneğe karşı fq 0.15.1 ile çalıştırılmıştır. Sürümünüzün çıktısından sorgu alanlarını seçin. Daha eski `.program_headers[].type == "LOAD"` tarifi, doğrulanmış bir API olarak burada sunulmamaktadır; çözücü sembolleri ve alan yolları sürümle bağımlıdır. [Çözücü kaynağı](https://github.com/wader/fq/blob/master/format/elf/elf.go) ile karşılaştırın.

- **`binsider`**: ELF başlıkları, bağımlılıkları, dize ve heksdump'lar için etkileşimli bir terminal arayüzü:
  ```bash
  binsider ./ornek
  ```

## Daha fazla araştırma yapın

Segment ve ofset hesaplamalarını kontrol ettikten sonra, segmentlerin oluşturma sırasında nasıl düzenlendiğini görmek için [linker layout](linker-duzeni.md) ile devam edin. `main`'den önce çekirdek yükleme ve yürütme için [startup ve auxv](baslangic-ve-auxv.md)'yi okuyun.

## Kaynaklar

- [pyelftools — GitHub (Eli Bendersky)](https://github.com/eliben/pyelftools)
- [fq — jq for binary formats](https://github.com/wader/fq)
- [Binsider — Terminal ELF Analyzer (Orhun Parmaksız)](https://github.com/orhun/binsider)
- [The Cerberus ELF Interface (Phrack #61)](https://phrack.org/issues/61/8)
- [Linux v6.12: ELF yükleyici doğrulaması](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
