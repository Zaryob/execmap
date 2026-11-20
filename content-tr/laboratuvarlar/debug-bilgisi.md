---
title: Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma
description: Hata ayıklama bilgisini ayrı dosyaya taşıyıp GDB’nin kaynak kodu yeniden bulmasını sağlayın.
---

# Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma

Bir programın hata ayıklama bilgilerini kaldırın, ardından GDB'nin ayrı bir dosyada tekrar bulmasına yardımcı olun. Program, deney boyunca **10 + 20 = 30** eklemeye devam edecektir.

Hata ayıklama bilgileri, makine talimatlarını kaynak satırlarına, işlev adlarına ve değişkenlere bağlar. Hata ayıklayıcının çalışan bir programı açıklamasına yardımcı olur; CPU'nun uyguladığı talimatlarla aynı şey değildir.

## Başlamadan önce

Linux, GCC, GNU binutils (`objcopy`, `strip` ve `readelf`) ve GDB kullanın. Basic C yeterlidir. [GDB ile ilk inceleme: C’den makine koduna](gdb-ilk-inceleme.md) hata ayıklayıcı istemi sizin için yeniyse kullanışlıdır.

Sadece bu laboratuvarın çalıştırılabilir dosyası üzerinde çalışın. Bir Linux terminalinde:

```bash
mkdir -p ~/execmap-labs/debug-information
cd ~/execmap-labs/debug-information
```

## 1. Programı oluştur ve oluştur

Bunu `hesap.c` olarak kaydet:

```c hesap.c
#include <stdio.h>

int topla(int a, int b) {
    int sonuc = a + b;
    return sonuc;
}

int main(void) {
    int x = 10;
    int y = 20;
    int toplam = topla(x, y);
    printf("Total: %d\n", toplam);
    return 0;
}
```

Hata ayıklama bilgileriyle derleyin, tam bir kopyasını saklayın ve çalıştırın:

```bash
gcc -Wall -Wextra -O0 -g3 hesap.c -o hesap
cp hesap hesap.full
./hesap
ls -lh hesap
file hesap
```

Beklenen program çıktısı:

```text
Total: 30
```

`file` çalıştırılabilir yazılımı hata ayıklama bilgilerine sahip ve `not stripped` olarak tanımlamalıdır. `hesap.full` yedeklemesi, daha sonra orijinal yapı ile karşılaştırma yapmanızı sağlar.

## 2. Ayrı bir hata ayıklama dosyası yapın

Bu komutları sırasıyla çalıştırın:

```bash
# Save the debug information before removing it:
objcopy --only-keep-debug hesap hesap.debug

# Remove debug information and unneeded ordinary symbols from the working file:
strip --strip-debug --strip-unneeded hesap

# Add a note telling GDB which separate file to look for:
objcopy --add-gnu-debuglink=hesap.debug hesap
```

Artık farklı işlerle ilgili üç dosyanız var:

- `hesap.full`, değiştirilmemiş orijinal çalıştırılabilir dosyanızdır.
- `hesap` çalıştıracağınız ve hata ayıklama yapacağınız soyulmuş çalıştırılabilir dosyadır.
- `hesap.debug` ayrı hata ayıklama bilgilerini içerir; program olarak çalıştırma.

`hesap.debug`'yi bu egzersiz için `hesap`'nin yanında tutun. `.gnu_debuglink` notu, dosya adını ve GDB'nin yer tespit ederken kontrol edebileceği bir çeki kaydeder.

## 3. Davranışın aynı kaldığını kontrol edin

```bash
./hesap.full
./hesap
ls -lh hesap.full hesap hesap.debug
file hesap
readelf -S hesap
readelf -x .gnu_debuglink hesap
```

Her iki program da `Total: 30`'yi yazdırmalıdır. Soyunan `hesap` orijinalinden daha küçük olmalı ve `stripped` olarak bildirilmelidir. `readelf -S`'de `.gnu_debuglink`'yi arayın; sıradan `.debug_*` bölümleri artık bu çalışan çalıştırılabilir dosyada olmamalıdır.

** Kontrol noktanız:** kaynak düzeyinde hata ayıklama bilgilerini kaybetmenin neden programın yaptığı eklemeyi kaldırmadığını açıklayın.

## 4. GDB'nin iki dosyayı yeniden bağlamasına izin ver

Terminalde, `.debug` dosyasını değil **striped çalıştırılabilir ** dosyasını açın:

```bash
gdb -q ./hesap
```

Başarılı bir yük, aşağıdaki gibi mesajları içerebilir; yol sizin olacaktır:

```text
Reading symbols from ./hesap...
Reading symbols from /path/to/hesap.debug...
```

`(gdb)` isteminde, girin:

```text gdb
break topla
run
list
print a
print b
```

Bir kesme noktası, seçilen bir yerde yürütmeyi duraklatır. Burada GDB, `topla`'yi tanımalı, kaynağını göstermeli ve `a = 10` ve `b = 20`'yi rapor etmelidir. Bunlar, ayrı bilgilerin bulunduğu ve kullanılabilir olduğu somut kontrollerdir.

Denetim tamamlandığında, programın çıkmasına izin vermek için `continue`'ye, ardından GDB'yi kapatmak için `quit`'ye girin.

## GDB kaynak bilgileri bulamazsa

** `topla` kesme noktası çözülemez:** `hesap.debug`'nin `hesap`'nin yanında olup olmadığını, hata ayıklama bağlantısını eklediğinizi ve her iki dosyanın da aynı yapıdan geldiğini kontrol edin.

** Hata ayıklama dosyası değiştirildi veya değiştirildi:** çekleri artık eşleşmeyebilir. İlişkisiz bir dosya eklemek yerine 1 adımını yeniden oluşturun.

**Yeniden başlamak istiyorsunuz:** `hesap.c`'den yeniden derleyin veya başlangıç çalıştırılabiliriniz olarak tam yedeklemeyi kullanın. Kaldırılan hata ayıklama bölümlerini, zaten çıkarılmış kopyadan çıkararak kurtarmaya çalışmayın.

**Farklı bir derleyici veya binutiller kullanıldı:** versiyonlarını kaydedin ve gerçek çıktıyı inceleyin. Bu komutlar Linux ELF ve GNU araçlarını hedef alır.

## İsteğe bağlı: hata ayıklama ve Build-ID eşleştirme

Bu laboratuvar için, adlandırılmış hata ayıklama dosyasını çalıştırılabilir dosyanın yanında tutmak yeterlidir. GDB ayrıca bir `.debug` alt dizinini arayabilir ve küresel hata ayıklama dizinlerini yapılandırabilir; tam [arama kuralları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html) bu konumları açıklar.

`.gnu_debuglink` notu, dört baytlık bir sınıra dolgu yapan bir dosya adı ve bir CRC-32 çekum içerir. `hesap.debug` için dosya adı artı sonlandırma sıfır baytı 12 baytlarını kaplar, bu nedenle çekum `0x0c`'nin ofsetinde başlar. Laboratuvarı tamamlamak için çekum'u elle hesaplamanıza gerek yoktur.

### Build-ID ile eşleşiyor

A **Build-ID**, GDB'nin ayrı bilgileri bulmak için kullanabileceği başka bir kimliktir. Bir şematik 20-byte kimliği için arama yolu şu şekilde görünebilir:

```text
ab1234567890abcdef1234567890abcdef123456
/usr/lib/debug/.build-id/ab/1234567890abcdef1234567890abcdef123456.debug
```

İlk iki onaltılık karakter dizin olur, gerisi dosya adı olur. Build-ID formatları bağlayıcıya bağımlı ve isteğe bağlıdır. GDB gömülü kimliği okur; tüm çalıştırılabilir SHA-1'yi elde etmek için yeniden hesaplamaz. ID ayrıca değiştirilmiş bir dosyanın hala eşleşen içeriğe sahip olduğunu vaat etmez.

## Ne tutmak için

İki `Total: 30` çıktısını, bölüm denetimini ve GDB'nin kaynak/argüman ekranını kaydedin. Linux aarch64 doğrulaması Kasım 7, 2026 ayrıca değiştirilmiş bir hata ayıklama dosyasının hata ayıklama yüklemesini ve reddini kontrol etti, Build-ID eşleştirmesi ayrı ayrı test edildi. Bu kontrollerin farklı kapsamları vardır.

Yardımcı isimler olmadığında analiz için [Sembolleri ayıklanmış ELF dosyalarını okuma](../rehberler/stripped-elf.md) veya optimize edilmiş kaynağın hata ayıklamasının neden daha zor olabileceğini görmek için [Derleyici ve optimizasyon düzeyi farklarını inceleme](derleme-farklari.md) ile devam edin.

## Kaynaklar

- [GDB: Ayrı Hata Ayıklama Dosyaları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [objcopy Binutils Belgelendirme](https://sourceware.org/binutils/docs/binutils/objcopy.html)
- [GNU şerit Binutils Belgelendirme](https://sourceware.org/binutils/docs/binutils/strip.html)
- [DWARF Hata Ayıklama Bilgi Biçimi Standard](https://dwarfstd.org/)
