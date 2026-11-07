---
title: "ELF parser'ları ve adres hesaplarını doğrulamak"
---

# ELF parser'ları ve adres hesaplarını doğrulamak

Tersine mühendislik ve ikili dosya analizinde kullanılan araçlar (Ghidra, IDA, radare2, pyelftools, LIEF vb.) dosyanın geçerliliği hakkında birbirinden farklı varsayımlarda bulunur. Bir aracın dosyayı açamaması veya bir alanı bozuk olarak işaretlemesi, Linux çekirdeğinin o dosyayı reddedeceği anlamına gelmez.

Bu durum, güvenlik ve tersine mühendislik literatüründe **Parser Differential** (Ayrıştırıcı Farklılığı) veya **LangSec** (Dil Tabanlı Güvenlik) problemi olarak adlandırılır. Çekirdeğin ELF yükleyicisi (`fs/binfmt_elf.c`), dosya çalıştırma performansını maksimize etmek için asgari seviyede kontrol yaparken; analiz araçları dosyanın spesifikasyona (System V ABI) tam uyumlu olduğunu varsayar.

## 1. C ile Basit ve Sağlam Bir ELF Parser Mimarisi

Standart `<elf.h>` kütüphanesini kullanarak bir 64-bit ELF dosyasının başlık ve segment tablosunu güvenli biçimde ayrıştıran bir C örneği:

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <elf.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/mman.h>

void parse_elf(const char *filepath) {
    int fd = open(filepath, O_RDONLY);
    if (fd < 0) { perror("open"); return; }

    struct stat st;
    if (fstat(fd, &st) < 0) { perror("fstat"); close(fd); return; }
    size_t file_size = st.st_size;

    if (file_size < sizeof(Elf64_Ehdr)) {
        fprintf(stderr, "Hata: Dosya boyutu ELF basligindan kucuk!\n");
        close(fd);
        return;
    }

    uint8_t *map = mmap(NULL, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (map == MAP_FAILED) { perror("mmap"); return; }

    Elf64_Ehdr *ehdr = (Elf64_Ehdr *)map;

    // 1. Magic byte kontrolü: 0x7f, 'E', 'L', 'F'
    if (memcmp(ehdr->e_ident, ELFMAG, SELFMAG) != 0) {
        fprintf(stderr, "Hata: Gecersiz ELF magic baytlari!\n");
        munmap(map, file_size);
        return;
    }

    // 2. 64-bit mimari kontrolü
    if (ehdr->e_ident[EI_CLASS] != ELFCLASS64) {
        fprintf(stderr, "Bilgi: Bu parser yalnizca 64-bit ELF destekler.\n");
        munmap(map, file_size);
        return;
    }

    printf("Giris Adresi (e_entry): 0x%lx\n", (unsigned long)ehdr->e_entry);
    printf("Program Header Tablosu Ofseti (e_phoff): 0x%lx\n", (unsigned long)ehdr->e_phoff);
    printf("Program Header Sayisi (e_phnum): %u\n", ehdr->e_phnum);

    // 3. Program Header tablosunun dosya sınırları içinde kaldığının doğrulanması
    size_t phdr_end = ehdr->e_phoff + (size_t)ehdr->e_phnum * ehdr->e_phentsize;
    if (phdr_end > file_size) {
        fprintf(stderr, "Uyari: Program header tablosu dosya sinirlarini asiyor!\n");
        munmap(map, file_size);
        return;
    }

    Elf64_Phdr *phdrs = (Elf64_Phdr *)(map + ehdr->e_phoff);
    for (int i = 0; i < ehdr->e_phnum; i++) {
        Elf64_Phdr *ph = &phdrs[i];
        if (ph->p_type == PT_LOAD) {
            printf("\n[PT_LOAD Segment %d]\n", i);
            printf("  Dosya Ofseti (p_offset): 0x%08lx\n", (unsigned long)ph->p_offset);
            printf("  Sanal Adres (p_vaddr) : 0x%08lx\n", (unsigned long)ph->p_vaddr);
            printf("  Dosya Boyutu (p_filesz): 0x%08lx\n", (unsigned long)ph->p_filesz);
            printf("  Bellek Boyutu (p_memsz): 0x%08lx\n", (unsigned long)ph->p_memsz);
            printf("  Izinler (p_flags)      : %c%c%c\n",
                   (ph->p_flags & PF_R) ? 'R' : '-',
                   (ph->p_flags & PF_W) ? 'W' : '-',
                   (ph->p_flags & PF_X) ? 'X' : '-');

            // Aralık taşma kontrolü (Overflow & Out-of-bounds check)
            if (ph->p_offset + ph->p_filesz > file_size) {
                fprintf(stderr, "  KRITIK HATA: p_offset + p_filesz dosya boyutunu asiyor!\n");
            }
            if (ph->p_filesz > ph->p_memsz) {
                fprintf(stderr, "  UYARI: p_filesz > p_memsz (ABI ihlali)\n");
            }
        }
    }

    munmap(map, file_size);
}
```

## 2. pyelftools ile Segment Envanteri Çıkarmak

Otomasyon ve betik analizlerinde Python'ın `pyelftools` kütüphanesi endüstri standardıdır. Bu araçla segmentlerin aralıklarını ve dosya ofsetlerini hızla doğrulayabilirsiniz:

```python
#!/usr/bin/env python3
import sys
from elftools.elf.elffile import ELFFile

def analyze_elf(filename):
    with open(filename, 'rb') as f:
        elf = ELFFile(f)
        print(f"Mimari: {elf.get_machine_arch()}")
        print(f"Giriş Adresi: 0x{elf.header['e_entry']:x}")
        print("\nSegmentler:")
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
        print(f"Kullanım: {sys.argv[0]} <elf-dosyası>")
        sys.exit(1)
    analyze_elf(sys.argv[1])
```

## 3. Parser Farklılıkları ve Tuzaklar (Parser Differentials)

Zararlı yazılımlar ve anti-analiz mekanizmaları, statik analiz araçlarının zaaflarından faydalanmak için ELF başlıklarını kasıtlı olarak tahrif eder:

### A. Section Header Tablosunun Bozulması / Silinmesi
ELF spesifikasyonuna göre bir programın çalışması için Section Header tablosu zorunlu değildir. `ehdr->e_shoff = 0` ve `ehdr->e_shnum = 0` yapıldığında `readelf -S` hiçbir şey göremez; Ghidra ve IDA gibi araçlar sembol ve fonksiyon ayrıştırmasında zorlanır, fakat Linux çekirdeği programı kusursuzca çalıştırır.

### B. Overlapping (Çakışan) Segmentler
İki farklı `PT_LOAD` segmentinin aynı dosya ofsetini (`p_offset`) farklı sanal adreslere eşlemesi mümkündür. Örneğin ELF başlığının bulunduğu `0x0000` ofseti, hem salt-okunur bir veri segmenti olarak hem de kod segmenti olarak eşlenebilir. Bu durum, statik ayrıştırıcıların kontrol akış grafiğini (CFG) çarpıtabilir.

### C. Başlık İçinde Başlık (Overlapping ELF Headers)
ELF ve program başlıklarının aynı baytları paylaşması, bir alanın birden fazla yapının koşullarını sağlamasını gerektirir. Böyle bir düzenin kabul edilmesi mimariye, çekirdek sürümüne ve başlık doğrulamalarına bağlıdır. Sabit bir asgari dosya boyutu veya her ortamda çalışabilirlik varsaymayın; `e_phoff`, `e_phentsize` ve `e_phnum` değerlerini dosya sınırları ve [Linux v6.12 yükleyici kontrolleri](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) ile karşılaştırın.

## 4. Modern Ayrıştırma Araçları: fq ve Binsider

Geleneksel `readelf` ve `objdump` araçlarının yanı sıra yapısal ikili inceleme için geliştirilmiş modern araçlar:

- **`fq`**: İkili dosyaları `jq` benzeri sözdizimiyle sorgulayan ve dilimleyen güçlü bir araçtır:
  ```bash
  fq '.program_headers[] | select(.type == "LOAD") | {offset: .offset, vaddr: .vaddr, memsz: .memsz}' ./ornek
  ```
- **`binsider`**: ELF başlıklarını, bağımlılıkları, string'leri ve hexdump görünümünü modern bir terminal arayüzünde (TUI) interaktif olarak sunar:
  ```bash
  binsider ./ornek
  ```

## İncelemeyi Derinleştir

Segment ve ofset hesaplarının sağlamlığını test ettikten sonra, bu segmentlerin derleme aşamasında linker tarafından nasıl yerleştirildiğini görmek için [Linker düzeni](linker-duzeni.md) rehberine geçin. Dosyanın çekirdek tarafından yüklenip `main` öncesi ilk komutun nasıl işletildiğini incelemek için [Başlangıç ve auxv](baslangic-ve-auxv.md) konusuna odaklanın.

## Kaynaklar

- [pyelftools — GitHub (Eli Bendersky)](https://github.com/eliben/pyelftools)
- [fq — jq for binary formats](https://github.com/wader/fq)
- [Binsider — Terminal ELF Analyzer (Orhun Parmaksız)](https://github.com/orhun/binsider)
- [The Cerberus ELF Interface (Phrack #61)](http://phrack.org/issues/61/8.html)

- [Linux v6.12: ELF loader validation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
