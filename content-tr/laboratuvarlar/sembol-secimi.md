---
title: LD_PRELOAD ile sembol seçimi ve işlevi geçersiz kılma
description: Bir işlevi sağlayan kitaplığı seçerek aynı programın 11 veya 22 yazdırmasını sağlayın.
---

# LD_PRELOAD ile sembol seçimi ve işlevi geçersiz kılma

Aynı çalıştırılabilir baskıyı yapın **11**, ardından **22**, hangi kütüphanenin bir işlev sağladığını değiştirerek. Çalıştırılabilir dosyayı bir kez inşa edecek ve bu karşılaştırma sırasında değişmeden bırakacaksınız.

Paylaşılan bir kütüphane, bir programın yükleyebileceği, genellikle Linux'ta `.so` ile biten bir işlev dosyasıdır. ** İşlev interpozisyonu**, bir programın aradığı bir işlevin başka bir tanımını sağlamak anlamına gelir. Bu laboratuvar, bu fikri tek bir dönüş değeri ile görünür kılar.

## Başlamadan önce

Linux'u glibc, GCC ve GNU binutils ile kullanın. Bunu sıradan, ayrıcalıklı olmayan bir laboratuvar programı olarak çalıştırın. Özel güvenli yürütme kuralları yükleyicinin ortam değişkenlerine nasıl davrandığını değiştirebilir.

Terminalde bir çalışma dizini oluşturun:

```bash
mkdir -p ~/execmap-labs/symbol-selection
cd ~/execmap-labs/symbol-selection
```

Komutları bu dizinden çalıştırmaya devam edin. Örnekteki kütüphane yolları geçerli dizine işaret eder.

## 1. Aynı işlev çağrısına iki cevap oluşturun

İlk kütüphaneyi `liba.c` olarak kaydedin. `secim` işlevi 11 değerini gönderir:

```c liba.c
#include <stdio.h>

int secim(void) {
    return 11;
}
```

Yedek kütüphaneyi `libb.c` olarak kaydedin. Aynı işlev adını tanımlar ancak 22 değerini gönderir:

```c libb.c
#include <stdio.h>

int secim(void) {
    return 22;
}
```

Ana programı `ana.c` olarak kaydedin. Bu işlevin kendisini tanımlamadan `secim`'yi çağırır:

```c ana.c
#include <stdio.h>

// Declaration of an external function
int secim(void);

int main(void) {
    printf("secim() called, return value: %d\n", secim());
    return 0;
}
```

**Derlemeden önce:** üç dosyanız olduğunu ve yalnızca iki kütüphane dosyasının `secim`'yi tanımladığını onaylayın.

## 2. İki kütüphaneyi ve bir çalıştırılabilir dosya oluştur

Terminalde:

```bash
# Build the two shared libraries:
gcc -Wall -Wextra -fPIC -shared liba.c -o liba.so
gcc -Wall -Wextra -fPIC -shared libb.c -o libb.so

# Build the executable, initially linked against liba:
gcc -Wall -Wextra ana.c -L. -la -Wl,-rpath,. -o ana
```

`-shared` paylaşılan bir kütüphane oluşturur. `-fPIC` farklı adreslerde yükleme için uygun kod oluşturur. Çalıştırılabilir dosya için `-L.`, bağlantılayıcının bu dizini aramasına izin verir ve `-la` `liba.so`'yi seçer. `rpath` seçeneği, çalışan örneğe de kütüphanesini burada aramasına izin verir.

Artık kaynak dosyalarına ek olarak `liba.so`, `libb.so` ve `ana`'ye sahip olmalısınız.

## 3. Sıradan sürümü çalıştırın

```bash
./ana
```

Beklenen çıktı:

```text
secim() called, return value: 11
```

Çalıştırılabilir dosya normalde `liba.so`'den `secim` tanımını kullanır.

## 4. Değiştirmeyi önyükle

```bash
LD_PRELOAD=./libb.so ./ana
```

Beklenen çıktı:

```text
secim() called, return value: 22
```

Ortam değişkeni dinamik bağlayıcıdan `libb.so`'yi ön yüklemesini ister. Bu sıradan glibc kurulumunda, arama için tanımı seçilir. Çalıştırılabilir dosya hala `liba.so`'ye aynı bağımlılığa sahiptir; `ana`'yi yeniden inşa etmeden işlev seçimini değiştirdik.

Yukarıdaki değişken atama bu komut için geçerlidir. `./ana`'yi normal olarak tekrar çalıştırın: 11'yi tekrar yazdırmalıdır.

** Kontrol noktanız:** Her çalışmadan önce sonucu tahmin edin ve hangi kütüphanenin `secim`'yi sağladığını açıklayın.

## 5. Seçili kütüphaneyi yükleyici günlüğünde onaylayın

Bu isteğe bağlı soruşturmayı aynı dizinden yürüt:

```bash
LD_DEBUG=symbols,bindings LD_PRELOAD=./libb.so ./ana >ana.stdout 2>ana.ld-debug
grep -E 'symbol=secim|binding file.*secim' ana.ld-debug
```

`ana.stdout`, programın cevabını içerir. `ana.ld-debug`, yükleyicinin çok daha uzun teşhis çıktısını içerir. Son komut, `secim` ile ilgili satırları tutar.

`ana`'deki referansın `libb.so`'deki tanım için bir bağlayıcı arayın. Bir arama satırı yükleyicinin bir isim aradığını söylüyor; bir bağlayıcı satır hangi tanımın seçildiğini söylüyor. PID ve yol biçimlendirmesi değişecektir. Uygun bir tanım bulunduktan sonra her kütüphanenin aranmasını beklemeyin.

## Eğer bir koşu başarısız olursa

**`liba.so` bulunamadı:** `ana` ve her iki `.so` dosyasını içeren dizinden çalıştır. Bu öğretim örneği göreceli yolları kullanır.

** Önyükleme dosyası görmezden gelindi:** Adını, konumunu ve mimarisini kontrol edin. Bu alıştırma güvenli yürütme modunun dışında sıradan bir glibc işlemi varsayar; Ayarlanmış bitleri veya sistem ayrıcalıklarını değiştirerek test etmeyin.

** Yedek 11'yi hala verir:** `libb.c`'nin 22'yi iade ettiğini kontrol edin, `libb.so`'yi yeniden inşa edin ve önyükleme görevinin `./ana` ile aynı komutta olduğunu onaylayın.

## Daha fazla detay

`DT_NEEDED` çalıştırılabilir dosyada paylaşılan kütüphane bağımlılığı kaydeder. Bir tanım ön yüklemesi bu kaydı yeniden yazmaz. Bakınız [Dinamik bağlama, GOT, PLT ve sembol çözümleme](../rehberler/dinamik-baglama.md) arama makineleri için.

Güvenli yürütme (`AT_SECURE`) önceden yükleme davranışını kısıtlar, kesik içeren yollar da dahil olmak üzere. Tek başına bir ayarlayıcı bit, belirli bir çalıştırmanın bu moda girdiğini belirlemez. [Program başlangıcı, yığın düzeni ve yardımcı vektör](../rehberler/baslangic-ve-auxv.md) nasıl inceleneceğini açıklar.

`-Bsymbolic` bağlantı seçeneği referansları ilgilidir **paylaşılan nesnenin içinde** inşa ediliyor. Çağrımız `ana`'den geliyor, `liba` dışında, bu seçeneği `liba.so`'ye eklemek bu çağrıyı önyüklemeyi görmezden gelmiyor. Linux doğrulamasında ayrı bir dahili çağrı fikstürü, bu kapsamların neden önemli olduğunu gösterdi.

Linux/glibc doğrulama Kasım 7, 2026 iki cevabı ve arama/bağlama kaydını doğruladı. Bu sonuçlar kendi çalışmanızın kanıtlarının yerini almaz. İki program çıktısını ve ilgili bağlama satırını kaydedin, ardından [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](debug-bilgisi.md) ile devam edin.

## Kaynaklar

- [ld.so Linux insan sayfaları (adam 8 ld.so)](https://man7.org/linux/man-pages/man8/ld.so.8.html)
- [MaskRay: ELF interpozisyonu ve -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [PLTHook GitHub](https://github.com/kubo/plthook)
