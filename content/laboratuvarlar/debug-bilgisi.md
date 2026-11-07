---
title: "Debug bilgisini ayırmak, strip etmek ve geri bağlamak"
---

# Debug bilgisini ayırmak, strip etmek ve geri bağlamak

Modern yazılım dağıtımlarında (Red Hat, Ubuntu, Debian), performans ve disk tasarrufu sağlamak amacıyla son kullanıcılara sembolleri ve DWARF hata ayıklama bilgileri temizlenmiş (`stripped`) ikili dosyalar sunulur. Ancak hata raporlama ve çökme analizi gerektiğinde, ayrı paketlerde tutulan (`-dbgsym` / `debuginfo`) hata ayıklama dosyaları ikiliye harici olarak geri bağlanır.

Bu laboratuvar; bir ikili dosyanın debug verisini `objcopy` ile bağımsız bir dosyaya ayırmayı, ana dosyayı `strip` etmeyi ve `.gnu_debuglink` mekanizması ile GDB'nin bu iki parçayı nasıl otomatik olarak birleştirdiğini adım adım inceler.

## 1. Deney Kodunun Hazırlanması

Basit bir döngü ve yerel değişkenler içeren `hesap.c` dosyası:

```c
#include <stdio.h>

int topla(int a, int b) {
    int sonuc = a + b;
    return sonuc;
}

int main(void) {
    int x = 10;
    int y = 20;
    int toplam = topla(x, y);
    printf("Toplam: %d\n", toplam);
    return 0;
}
```

## 2. Programın Debug Sembolleriyle Derlenmesi

Programı zengin DWARF formatında (`-g3`) derleyin:

```bash
gcc -Wall -Wextra -O0 -g3 hesap.c -o hesap
```

Dosya boyutunu ve sembol durumunu kontrol edin:

```bash
ls -lh hesap
file hesap
```
`file` çıktısında `with debug_info, not stripped` ifadesini görmelisiniz.

## 3. Debug Verisini Ayırma ve Strip Etme

Standart GNU Binutils araçlarıyla debug verisini izole edin:

```bash
# 1. Debug bölümlerini bağımsız bir 'hesap.debug' dosyasına aktar:
objcopy --only-keep-debug hesap hesap.debug

# 2. Ana dosyayı tamamen strip et (tüm semboller ve debug bölümleri silinir):
strip --strip-debug --strip-unneeded hesap

# 3. Ana ikilinin içine debug dosyasının adını ve CRC32 sağlamasını göm:
objcopy --add-gnu-debuglink=hesap.debug hesap
```

Şimdi tekrar kontrol edin:
- `ls -lh hesap hesap.debug`: `hesap` dosyasının boyutunun belirgin şekilde küçüldüğünü göreceksiniz.
- `file hesap`: Artık `stripped` olarak raporlanacaktır.
- `readelf -S hesap`: `.debug_*` bölümlerinin kaybolduğunu, yerine `.gnu_debuglink` bölümünün eklendiğini görebilirsiniz.

```bash
readelf -x .gnu_debuglink hesap
```

Örnek çıktı:
```text
Hex dump of section '.gnu_debuglink':
  0x00000000 68657361 702e6465 62756700 00000000 hesap.debug.....
  0x00000010 3a5b81c2                            :[..
```
Son 4 bayt (`3a5b81c2`), `hesap.debug` dosyasının CRC32 kontrol toplamıdır. Eğer debug dosyası sonradan değiştirilirse GDB uyumsuzluk uyarısı verir.

## 4. GDB ile Otomatik Sembol Eşleştirmesini Doğrulamak

Ana dosyayı GDB ile çalıştırın:

```bash
gdb -q ./hesap
```

GDB başlarken şu mesajı gösterecektir:
```text
Reading symbols from ./hesap...
Reading symbols from /path/to/hesap.debug...
```

Artık dosya stripped olmasına rağmen kaynak kod satır numaraları ve fonksiyon adları kusursuzca görüntülenebilir:

```bash
(gdb) break topla
(gdb) run
(gdb) list
(gdb) print a
(gdb) print b
```

GDB, `.gnu_debuglink` içindeki dosya adını okumuş, aynı dizindeki veya `/usr/lib/debug/` altındaki `hesap.debug` dosyasını bularak sembolleri belleğe yüklemiştir.

## 5. Build-ID Tabanlı Eşleştirme

Modern sistemlerde dosya adına bağımlı kalmamak için **Build-ID** kullanılır (`.note.gnu.build-id`). GDB, bir ikilinin SHA-1 özetini alarak şu dizinde arama yapar:

```text
/usr/lib/debug/.build-id/ab/1234567890abcdef.debug
```

Burada ilk 2 bayt dizin adı (`ab`), kalan baytlar ise debug dosyasının adıdır. Bu sayede dosya adı veya konumu değişse bile semboller daima doğru ikiliyle eşleşir.

## İncelemeyi Derinleştir

Sembolleri tamamen bulunmayan ikililerde analiz yöntemlerini kavramak için [Stripped ELF](../rehberler/stripped-elf.md) rehberine geçin. Derleyici optimizasyonlarının kod yapısını nasıl değiştirdiğini görmek için [Derleme farkları laboratuvarı](derleme-farklari.md) uygulamasını yapın.

## Kaynaklar

- [GDB: Separate Debug Files](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [objcopy — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/objcopy.html)
- [GNU strip — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/strip.html)
- [DWARF Debugging Information Format Standard](https://dwarfstd.org/)
