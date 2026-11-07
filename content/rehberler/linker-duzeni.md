---
title: "Linker düzenini ve bellek haritasını okumak"
---

# Linker düzenini ve bellek haritasını okumak

Derleme sürecinin son halkası olan bağlayıcı (linker; `GNU ld`, `LLVM lld`, `mold`), derleyicinin ürettiği bağımsız nesne dosyalarını (`.o`) ve kütüphaneleri (`.a`, `.so`) tek bir çalıştırılabilir ELF dosyasında birleştirir.

Tersine mühendislik sırasında kaynak kodun fonksiyon sırasıyla disasm çıktısındaki fonksiyon sırasının neden uyuşmadığını, global değişkenlerin bellekte nasıl gruplandığını ve segment sınırlarının neden sayfa boyutuna (4KB / 64KB) hizalandığını anlamak için linker'ın çalışma düzenini (Linker Script ve Map dosyası) bilmek zorunludur.

## 1. Input Section ve Output Section Kavramı

Linker iki temel kavram üzerinden çalışır:
- **Input Section**: Giriş nesne dosyalarından gelen ham bölümler (örneğin `main.o` içindeki `.text` veya `.rodata.str1.1`).
- **Output Section**: Nihai ELF dosyasında bir araya getirilen birleşik bölüm (örneğin nihai dosyadaki tek bir devasa `.text` bölümü).

```text
Nesne Dosyaları (Inputs)                        Nihai ELF (Output)
+-------------------------+                     +------------------------+
| main.o (.text.main)     |-----+               | Segment 1: PT_LOAD (RX)|
+-------------------------+     |               |                        |
| helper.o (.text.calc)   |-----+-------------> |   Output: .text        |
+-------------------------+     |               |   Output: .rodata      |
| math.o (.text.pow)      |-----+               +------------------------+
+-------------------------+                     | Segment 2: PT_LOAD (RW)|
| main.o (.data.counter)  |-----+               |                        |
+-------------------------+     +-------------> |   Output: .data        |
| helper.o (.bss.cache)   |                     |   Output: .bss         |
+-------------------------+                     +------------------------+
```

Derleyiciye `-ffunction-sections` ve `-fdata-sections` bayrakları verildiğinde, her fonksiyon ve veri ayrı bir input section içine konur (`.text.fonksiyon_adi`). Linker, ölü kod eliminasyonu (`--gc-sections`) sırasında referans verilmeyen bölümleri dosyadan tamamen atabilir.

## 2. VMA ve LMA Farkı

Linker terminolojisinde iki kritik adres türü vardır:
- **VMA (Virtual Memory Address)**: Kodun veya verinin çalışma anında bellekte bulunacağı sanal adres.
- **LMA (Load Memory Address)**: Segmentin ikili dosya belleğe ilk yüklendiğinde bulunacağı adres.

Standart kullanıcı alanı Linux programlarında VMA ve LMA **birbirine eşittir**. Ancak gömülü sistemlerde, bootloader'larda veya Linux çekirdeğinin kendisinde LMA ve VMA farklıdır: Kod ROM'a veya diske yüklenir (LMA), çalışma anında RAM'e kopyalanır (VMA).

## 3. Linker Script Mantığı ve Varsayılan Düzen

Linker'ın hangi input section'ı nereye koyacağını bir metin dosyası olan **Linker Script** belirler. Sistemdeki varsayılan linker script'i görmek için:

```bash
ld --verbose
```

Basitleştirilmiş bir Linker Script örneği:

```text
SECTIONS
{
  . = 0x400000;              /* Konum sayacını (Location Counter .) ayarla */

  .text : {
    *(.text.entry)           /* Önce giriş fonksiyonunu koy */
    *(.text*)                /* Tüm nesne dosyalarındaki .text bölümlerini ekle */
  }

  . = ALIGN(0x1000);         /* 4096 baytlık sayfa sınırına hizala */

  .rodata : {
    *(.rodata*)              /* Salt-okunur sabitler */
  }

  . = ALIGN(0x1000);         /* Veri segmenti için yeni sayfa sınırına geç */

  .data : {
    *(.data*)                /* Başlatılmış global değişkenler */
  }

  .bss : {
    *(.bss*)                 /* Sıfırlanmış alanlar */
    *(COMMON)
  }
}
```

Nokta karakteri (`.`) **Location Counter** (Konum Sayacı) olarak adlandırılır. Linker bölümleri yerleştirdikçe bu sayacı otomatik olarak artırır. `ALIGN(0x1000)` direktifi, donanımsal sayfa koruma (Memory Protection Unit / MMU) kurallarını uygulayabilmek için yeni bir 4KB sayfa başlatır.

## 4. Linker Haritası (Map File) ile İkiliyi Çözümlemek

Bir ikili dosyanın linker düzenini en ince ayrıntısına kadar görmek için derleme sırasında `-Wl,-Map,proje.map` parametresi verilir:

```bash
gcc -O2 -ffunction-sections -fdata-sections -Wl,-Map,cikis.map main.c helper.c -o program
```

Oluşan `cikis.map` dosyası şunları gösterir:
1. Hangi nesne dosyasının hangi fonksiyonunun hangi sanal adrese yerleştiği.
2. Ölü kod eliminasyonu (`--gc-sections`) ile hangi fonksiyonların silindiği (`Discarded input sections`).
3. Bölümler arasındaki boşluklar (padding) ve hizalama baytları.

Örnek Map dosyası kesiti:

```text
.text.main      0x0000000000001149       0x2b /tmp/ccX4yZ.o
                0x0000000000001149                main
.text.yardimci  0x0000000000001174       0x40 /tmp/ccX4yZ.o
                0x0000000000001174                yardimci_hesap
 *fill*         0x00000000000011b4        0xc
```

`*fill*` satırı, bir sonraki fonksiyonun önbellek veya dallanma performansı için (örneğin 16-bayt hizalama) linker tarafından doldurulduğunu gösterir.

## 5. Linker Tarafından Otomatik Üretilen Semboller

Linker, programın segment ve bölüm sınırlarını çalışma anında kodun okuyabilmesi için özel semboller tanımlar:
- `__executable_start`: Kod segmentinin başlangıç adresi.
- `_etext` veya `etext`: Kod (`.text`) bölümünün bittiği adres.
- `_edata` veya `edata`: Başlatılmış veri (`.data`) bölümünün bittiği adres.
- `_end` veya `end`: Başlatılmamış veri (`.bss`) alanının bittiği, yani heap'in başladığı adres.

Bu semboller bir C programında harici (`extern`) tanımlanarak okunabilir:

```c
#include <stdio.h>

extern char etext, edata, end;

int main(void) {
    printf("Kod sonu (etext) : %p\n", (void *)&etext);
    printf("Veri sonu (edata): %p\n", (void *)&edata);
    printf("BSS sonu (end)   : %p (Heap baslangici)\n", (void *)&end);
    return 0;
}
```

## İncelemeyi Derinleştir

Linker'ın oluşturduğu bu yapının çekirdek tarafından nasıl belleğe taşındığını görmek için [Başlangıç ve auxv](baslangic-ve-auxv.md) rehberine geçin. Fonksiyonların dış kütüphanelerle dinamik olarak nasıl eşleştirildiğini anlamak için [Dinamik bağlama](dinamik-baglama.md) sayfasını inceleyin.

## Kaynaklar

- [GNU ld: Basic Linker Script Concepts](https://sourceware.org/binutils/docs/ld/Basic-Script-Concepts.html)
- [MaskRay: Linker Script Internals](https://maskray.me/blog/2021-07-04-linker-script-internals)
- [Ian Lance Taylor: Linkers (20-part essay series)](https://www.airs.com/blog/archives/38)
- [LLVM lld: The ELF Linker](https://lld.llvm.org/ELF/)
