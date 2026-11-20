---
title: Bağlayıcı düzenini ve bellek haritalarını okuma
description: Girdi ve çıktı bölümlerini, sanal adresleri (VMA) ve yükleme adreslerini (LMA) inceleyin.
---

# Bağlayıcı düzenini ve bellek haritalarını okuma

Bağlayıcı (`GNU ld`, `LLVM lld` veya `mold`), nesne dosyalarını (`.o`) ve kütüphaneleri (`.a`, `.so`) yürütülebilir bir ELF dosyasına birleştirerek derleme işlemini tamamlar.

Bağlayıcı betikleri ve harita dosyaları, işlevlerin kaynak ve derlenmiş kod arasındaki farklılığının nedenini, küresel değişkenlerin nasıl gruplandırıldığını ve segment sınırlarının 4 KB veya 64 KB gibi sayfa boyutlarına nasıl hizalandığını açıklar.

## 1. Giriş ve çıkış bölümleri

Bağlayıcı, iki temel kavramla çalışır:

- **Giriş bölümü**: `main.o` gibi bir giriş nesnesinden bir bölüm, örneğin `.text` veya `.rodata.str1.1`.
- **Çıkış bölümü**: Son ELF dosyasındaki birleştirilmiş bir bölüm, örneğin `.text` bölümü.

```text
Input object files                         Final ELF
+-------------------------+                +-------------------------+
| main.o (.text.main)     |---+             | Segment 1: PT_LOAD (RX) |
+-------------------------+   |             |                         |
| helper.o (.text.calc)   |---+-----------> |   Output: .text         |
+-------------------------+   |             |   Output: .rodata       |
| math.o (.text.pow)      |---+             +-------------------------+
+-------------------------+                | Segment 2: PT_LOAD (RW) |
| main.o (.data.counter)  |---+             |                         |
+-------------------------+   +-----------> |   Output: .data         |
| helper.o (.bss.cache)   |---+             |   Output: .bss          |
+-------------------------+                +-------------------------+
```

`-ffunction-sections` ve `-fdata-sections` ile derleyici, bireysel işlevleri ve veri öğelerini ayrı giriş bölümlerine yerleştirir, örneğin `.text.function_name`. Bölüm toplama (`--gc-sections`) sırasında, bağlayıcı referanslanmamış bölümleri atabilir.

## 2. VMA ile LMA

İki adres türü önemlidir:

- **VMA (Sanal Bellek Adresi)**: Kod veya verinin yürütme sırasında bulunduğu adres.
- **LMA (Yükleme Bellek Adresi)**: Yürütme konumuna herhangi bir çalışma zamanı kopyalama yapılmadan önce yükleme adresi.

Normal Linux kullanıcı alanı programları için, bağlayıcının temsilinde VMA ve LMA genellikle aynıdır. Yerleşik sistemler, başlatıcılar ve çekirdek görüntüleri farklı LMAlar ve VMAlar kullanabilir: Veriler ROM'a kaydedilebilir ve yürütme için RAM'e kopyalanabilir.

## 3. Bağlayıcı betikleri ve varsayılan düzen

Bir **bağlayıcı betiği**, giriş bölümlerinin nereye yerleştirileceğini kontrol eder. Sistemi varsayılan betiği şu komutla inceleyin:

```bash
ld --verbose
```

Basitleştirilmiş bir betik:

```text
SECTIONS
{
  . = 0x400000;              /* Set the location counter (.) */

  .text : {
    *(.text.entry)           /* Place the entry function first */
    *(.text*)                /* Include .text sections from all objects */
  }

  . = ALIGN(0x1000);         /* Align to a 4096-byte page boundary */

  .rodata : {
    *(.rodata*)              /* Read-only constants */
  }

  . = ALIGN(0x1000);         /* Start a new page for the data segment */

  .data : {
    *(.data*)                /* Initialized global variables */
  }

  .bss : {
    *(.bss*)                 /* Zero-initialized areas */
    *(COMMON)
  }
}
```

Nokta (`.`), **konum sayacıdır**. Bağlayıcı bölümleri yerleştirirken ilerler. `ALIGN(0x1000)`, bir MMU veya bellek koruma birimi için sayfa izinlerini ayırmak için bir 4 KB sınırına hizalanan bir sonraki konumu belirtir.

## 4. Bağlantı haritasını inceleme

Derleme sırasında `-Wl,-Map,cikis.map` parametresini kullanarak, düzeni ayrıntılı olarak inceleyin:

```bash
gcc -O2 -ffunction-sections -fdata-sections -Wl,--gc-sections,-Map,cikis.map main.c helper.c -o program
```

Oluşturulan `cikis.map`, şunları gösterir:

1. Hangi nesne dosyalarının ve işlevlerin hangi sanal adreslere yerleştirildiğini.
2. `--gc-sections` ile kaldırılan işlevler da dahil olmak üzere, atılan giriş bölümleri.
3. Bölümler arasındaki dolgu ve hizalama baytları.

Linux, aarch64/GNU ld 2.40, 7 Kasım 2026 tarihinde, ek iki dosya içeren bir test ortamı kullandı: Kullanılmayan işlev, atık giriş bölümlerinde görünüyor ve `nm` ile birlikte ortadan kalkıyor; GC olmadan ise kalıyor. Yayınlanan sınır sembol örneği de derlendi ve çalıştırıldı. Gerçek `cikis.map` dosyanızdaki `Discarded input sections`, `.text.*` ve `*fill*` bölümlerini inceleyin. `--gc-sections` seçeneği olmadan aynı ortadan kaldırılmanın gerçekleştiğini veya her ortadan kaldırılan girdinin yalnızca bu seçeneğe ait olduğunu varsaymayın. Derleyici/bağlayıcı sürümleriyle hizalama ve adresleri kaydedin.

## 5. Bağlayıcı tarafından tanımlanan semboller

Bağlayıcı betikleri, programların görüntü sınırlarını incelemesine yardımcı olacak sembolleri tanımlayabilir:

- `__executable_start`: GNU ld'nin varsayılan betiğinde, çalıştırılabilir görüntünün başlangıcı. Bu, ELF başlığını içerebilir ve RX `.text` başlangıcı olmayabilir.
- `_etext` veya `etext`: Metin alanının sonu.
- `_edata` veya `edata`: Başlatılmış verilerin sonu.
- `_end` veya `end`: Başlatılmamış verilerin sonu, gerçek program durdurma veya heap tabanının değil. ASLR ve ayırıcı haritaları ayrı ayrı değerlendirin ([end(3)](https://man7.org/linux/man-pages/man3/end.3.html)).

Bu sembolleri `extern` bildirimleri aracılığıyla C dilinde okuyun:

```c
#include <stdio.h>

extern char etext, edata, end;

int main(void) {
    printf("Text end (etext) : %p\n", (void *)&etext);
    printf("Data end (edata): %p\n", (void *)&edata);
    printf("BSS end (end)   : %p\n", (void *)&end);
    return 0;
}
```

## Daha fazla araştırma yapın

[Program başlangıcı, yığın düzeni ve yardımcı vektör](baslangic-ve-auxv.md)'u okuyarak, çekirdeğin sonuçtaki düzeni nasıl yüklediğini görün. Işlevler ve harici kütüphaneler arasındaki bağlantı için [Dinamik bağlama, GOT, PLT ve sembol çözümleme](dinamik-baglama.md) ile devam edin.

## Kaynaklar

- [GNU ld: Temel Bağlayıcı Beti Kavramları](https://sourceware.org/binutils/docs/ld/Basic-Script-Concepts.html)
- [GNU ld: Bağlayıcı Betikleri](https://sourceware.org/binutils/docs/ld/Scripts.html)
- [Ian Lance Taylor: Bağlayıcılar (20 bölümden oluşan bir makale serisi)](https://www.airs.com/blog/archives/38)
- [LLVM lld: LLVM Bağlayıcı — ELF port](https://lld.llvm.org/)
