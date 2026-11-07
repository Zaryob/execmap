---
title: "Derleme farklarını ve optimizasyon seviyelerini incelemek"
---

# Derleme farklarını ve optimizasyon seviyelerini incelemek

Tersine mühendislik sırasında kaynak kodun mimarisi ile disassembler'da görülen makine kodu arasındaki en büyük sapma derleyici optimizasyonlarından kaynaklanır. Aynı C fonksiyonu, farklı derleme bayraklarıyla derlendiğinde tanınmaz derecede farklı montaj kodları üretebilir.

Bu laboratuvar; aynı C kaynak dosyasını üç farklı optimizasyon seviyesinde (`-O0`, `-O2`, `-Os`) derleyerek fonksiyon içi genişletme (inlining), döngü açma (loop unrolling), yazmaç tahsisi ve çerçeve işaretçisi (frame pointer) farklarını `objdump` ile adım adım analiz eder.

## 1. Deney Kodunun Hazırlanması

Basit bir matematiksel hesaplama ve yardımcı fonksiyon içeren `opt.c` dosyası:

```c
#include <stdio.h>

static int kare_al(int sayi) {
    return sayi * sayi;
}

int seri_topla(int n) {
    int toplam = 0;
    for (int i = 0; i < n; i++) {
        toplam += kare_al(i);
    }
    return toplam;
}

int main(void) {
    int sonuc = seri_topla(10);
    printf("Sonuc: %d\n", sonuc);
    return 0;
}
```

## 2. Üç Farklı Optimizasyon ile Derleme

Programı üç farklı bayrak setiyle derleyin:

```bash
# 1. Hata Ayıklama / Optimizasyonsuz Derleme:
gcc -Wall -Wextra -O0 -g opt.c -o opt_O0

# 2. Standart Üretim / Yüksek Hız Optimizasyonu:
gcc -Wall -Wextra -O2 opt.c -o opt_O2

# 3. Boyut Odaklı Optimizasyon (Gömülü Sistemler):
gcc -Wall -Wextra -Os opt.c -o opt_Os
```

Dosya ve kod bölümü boyutlarını `size` komutuyla karşılaştırın:

```bash
size opt_O0 opt_O2 opt_Os
```

Çıktı:
```text
   text    data     bss     dec     hex filename
   2045     600       8    2653     a5d opt_O0
   1685     592       8    2285     8ed opt_O2
   1550     592       8    2150     866 opt_Os
```

## 3. Disassembly Karşılaştırması (objdump)

Her üç dosyanın `seri_topla` fonksiyonunu `objdump -d -M intel` ile inceleyin:

### A. -O0 Seviyesi (Doğrudan Yığın Tabanlı, Yavaş)
```bash
objdump -d -M intel --no-show-raw-insn opt_O0 | grep -A 25 "<seri_topla>:"
```
Karakteristik özellikler:
- `push rbp; mov rbp, rsp` çerçeve işaretçisi kurulur.
- Her değişken yerel yığında saklanır (`[rbp-0x4]`, `[rbp-0x8]`).
- Her döngü adımında `kare_al` için açık bir `call` talimatı verilir. Değişkenler her seferinde bellekten okunup tekrar belleğe yazılır.

### B. -O2 Seviyesi (Yazmaç Odaklı, Inlining)
```bash
objdump -d -M intel --no-show-raw-insn opt_O2 | grep -A 25 "<seri_topla>:"
```
Karakteristik özellikler:
- **Frame pointer atılmıştır (`-fomit-frame-pointer`)**: `push rbp` yoktur; `RBP` genel amaçlı bir yazmaç gibi kullanılır.
- **Inlining (İçiçe Genişletme)**: `kare_al` fonksiyonuna hiçbir `call` yapılmaz! Çarpma işlemi (`imul`) doğrudan döngünün içine gömülmüştür.
- Tüm sayaçlar ve ara toplamlar işlemci yazmaçlarında (`EAX`, `EDX`, `ECX`) tutulur; RAM erişimi sıfıra indirilmiştir.

### C. -Os Seviyesi (En Az Bayt, Kompakt Kod)
```bash
objdump -d -M intel --no-show-raw-insn opt_Os | grep -A 20 "<seri_topla>:"
```
Karakteristik özellikler:
- Döngü açma (unrolling) kesinlikle yapılmaz.
- Talimat bayt uzunlukları minimum olan opkodlar tercih edilir (`xor eax, eax` vs `mov eax, 0`).
- Fonksiyon hizalama boşlukları (`nop` dolguları) en aza indirilir.

## 4. Analist Açısından Alınacak Dersler

1. **Fonksiyon Yokluğu Yanılgısı**: Ghidra veya IDA'da kaynak koddaki bir yardımcı fonksiyonun adını bulamıyorsanız, o fonksiyon silinmemiş; `-O2` veya `-O3` tarafından üst fonksiyona **inline** edilmiş olabilir.
2. **Yığın Değişkenleri**: Tersine mühendislik yaparken yerel değişkenleri daima `[RBP-X]` adresinde aramak `-O0` alışkanlığıdır. Optimize kodda değişkenler yaşam döngüleri boyunca yazmaçlar arasında yer değiştirir (`register allocation`).

## İncelemeyi Derinleştir

Sürümler arasındaki optimizasyon ve kod değişikliklerini grafiksel olarak karşılaştırmak için [İkili fark analizi](../rehberler/ikili-fark-analizi.md) rehberini inceleyin. Çalışma anında işlemcinin en çok hangi fonksiyonlarda zaman harcadığını görmek için [Perf ile yürütme analizi](../rehberler/perf-ile-yurutme.md) konusuna dönün.

## Kaynaklar

- [GCC Optimization Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html)
- [Godbolt Compiler Explorer](https://godbolt.org/)
- [Brendan Gregg: Why Frame Pointers are Essential](https://www.brendangregg.com/blog/2024-03-17/the-return-of-the-frame-pointers.html)
