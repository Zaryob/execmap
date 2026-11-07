---
title: "Sembol seçimi ve LD_PRELOAD ile fonksiyon kancalama"
---

# Sembol seçimi ve LD_PRELOAD ile fonksiyon kancalama

Dinamik bağlı bir ELF dosyasında bir fonksiyon çağrıldığında, o fonksiyonun hangi paylaşımlı nesneden (`.so`) temin edileceğini dinamik yükleyicinin sembol arama kapsamı (`lookup scope`) belirler.

Bu laboratuvar, aynı isimde (`secim`) bir fonksiyona sahip iki farklı paylaşımlı kütüphane hazırlar. `LD_PRELOAD` mekanizması kullanılarak ana programın ikili kodunda (`DT_NEEDED`) hiçbir değişiklik yapmadan, çağrı hedefinin nasıl yönlendirildiğini adım adım inceler.

## 1. Deney Kodlarının Hazırlanması

Laboratuvar için üç küçük kaynak dosya oluşturacağız: `liba.c`, `libb.c` ve `ana.c`.

### Birinci Kütüphane: `liba.c`
```c
#include <stdio.h>

int secim(void) {
    return 11;
}
```

### İkinci Kütüphane (Kancalama Kütüphanesi): `libb.c`
```c
#include <stdio.h>

int secim(void) {
    return 22;
}
```

### Ana Program: `ana.c`
```c
#include <stdio.h>

// Dışarıdan gelecek fonksiyon bildirimi
int secim(void);

int main(void) {
    printf("secim() fonksiyonu cagirildi, donus degeri: %d\n", secim());
    return 0;
}
```

## 2. Kütüphanelerin ve Ana Programın Derlenmesi

Konumdan Bağımsız Kod (PIC - Position Independent Code) bayrağıyla paylaşımlı kütüphaneleri ve ardından ana programı derleyin:

```bash
# 1. Kütüphaneleri paylaşımlı nesne (.so) olarak derle:
gcc -Wall -Wextra -fPIC -shared liba.c -o liba.so
gcc -Wall -Wextra -fPIC -shared libb.c -o libb.so

# 2. Ana programı liba.so'ya bağlayarak derle:
# -Wl,-rpath,. parametresi çalışma anında kütüphaneyi mevcut dizinde aramasını sağlar
gcc -Wall -Wextra ana.c -L. -la -Wl,-rpath,. -o ana
```

## 3. Çalıştırma ve Karşılaştırma Deneyi

### Normal Çalıştırma:
Ana programı doğrudan çalıştırın:

```bash
./ana
```
Çıktı:
```text
secim() fonksiyonu cagirildi, donus degeri: 11
```

Program `DT_NEEDED` girdisinde kayıtlı olan `liba.so` kütüphanesini yükledi ve oradaki `secim` fonksiyonunu çağırdı.

### LD_PRELOAD ile Sembol Araya Girme (Interposition):
Şimdi `libb.so` kütüphanesini `LD_PRELOAD` ortam değişkeniyle öne alarak çalıştırın:

```bash
LD_PRELOAD=./libb.so ./ana
```
Çıktı:
```text
secim() fonksiyonu cagirildi, donus degeri: 22
```

Bu deneyin normal, secure-execution olmayan glibc ortamında beklenen çıktıları sırasıyla `11` ve `22` olur. Ana programın `DT_NEEDED` girdisini değiştirmeden sembol seçimi değişmiştir.

## 4. Dinamik Yükleyicinin Arama Sırasını İzlemek

Dinamik yükleyicinin sembolü ararken izlediği adımları `LD_DEBUG=symbols` ile ayrıntılı olarak görebilirsiniz:

```bash
LD_DEBUG=symbols LD_PRELOAD=./libb.so ./ana 2>&1 | grep "symbol=secim"
```

Çıktı:
```text
symbol=secim;  lookup in file=./libb.so [0]
symbol=secim;  lookup in file=./liba.so [0]
binding file ./ana to ./libb.so: normal symbol `secim`
```

Yükleyici önce `LD_PRELOAD` listesindeki `libb.so` dosyasına bakmış, aranan sembolü orada bulduğu anda aramayı sonlandırmış ve ana programın GOT girdisini `libb.so` içindeki adrese bağlamıştır.

## 5. Güvenlik Sınırları ve -Bsymbolic Korunması

1. **AT_SECURE ve Yetkili İkililer**: Eğer `ana` programı `setuid` bayrağına sahip olsaydı (`sudo chmod +s ./ana`), çekirdek `AT_SECURE=1` bayrağı koyar ve glibc `LD_PRELOAD` değişkenini güvenlik nedeniyle **yok sayardı**.
2. **Linker'da -Bsymbolic Kullanımı**: Bir kütüphane derlenirken `gcc -shared -Wl,-Bsymbolic` bayrağı verilirse, kütüphane içindeki fonksiyon çağrıları kendi içindeki tanımlara kilitlenir; dışarıdan `LD_PRELOAD` ile araya girilmesi engellenir.

## İncelemeyi Derinleştir

Dinamik bağlama ve GOT/PLT mekanizmalarının iç yapısını teorik olarak kavramak için [Dinamik bağlama](../rehberler/dinamik-baglama.md) rehberine dönün. Sembolleri ve hata ayıklama bilgilerini stripped dosyalardan ayrıştırmak için [Debug bilgisi laboratuvarı](debug-bilgisi.md) uygulamasını yapın.

## Kaynaklar

- [ld.so — Linux man-pages (man 8 ld.so)](https://man7.org/linux/man-pages/man8/ld.so.8.html)
- [MaskRay: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [PLTHook — GitHub](https://github.com/kubo/plthook)
