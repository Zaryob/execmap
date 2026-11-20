---
title: Derleyici ve optimizasyon düzeyi farklarını inceleme
description: Aynı hesabı üç biçimde derleyin ve sonucu koruyarak üretilen komutları karşılaştırın.
---

# Derleyici ve optimizasyon düzeyi farklarını inceleme

Aynı hesaplamayı üç şekilde derleyin. Her üç program da **285** yazdırmalıdır, ancak makine komutları ve boyutları farklı olabilir.

Optimizasyon, bir derleyicinin aynı gözlemlenebilir sonucu üretmenin başka bir yolunu seçmesini sağlar. Bu laboratuvar, kontrol edebileceğiniz sonuçla başlar, ardından talimatlarda neyin değiştiğini bulmanızı ister.

## Başlamadan önce

Linux ELF, GCC ve GNU binutils (`objdump` ve `size`) kullanın. Komut örnekleri x86-64 içindir. Diğer mimarilerde komut adları ve kurallar değişebilir. C’de döngüleri ve işlevleri bilmeniz yeterli.

Linux terminalinde:

```bash
mkdir -p ~/execmap-labs/compiler-differences
cd ~/execmap-labs/compiler-differences
gcc --version
ld --version
objdump --version
uname -m
```

Karşılaştırmanızla bu sürümleri koruyun. Kesin dönüşümler derleyiciye ve hedefe bağlıdır.

## 1. Yardımcı bir işlevle bir hesaplama oluşturun

Bunu `opt.c` olarak kaydet:

```c opt.c
#include <stdio.h>

static int kare_al(int sayi) {
    return sayi * sayi;
}

// This experiment uses n=10; larger inputs require signed-overflow checks.
int seri_topla(int n) {
    int toplam = 0;
    for (int i = 0; i < n; i++) {
        toplam += kare_al(i);
    }
    return toplam;
}

int main(void) {
    int sonuc = seri_topla(10);
    printf("Result: %d\n", sonuc);
    return 0;
}
```

`kare_al` bir sayıyı kareler. `seri_topla(10)`, 0'nin karelerini 9'den ekler. Bu nedenle beklenen sonuç 285'dir. Bu girdiyi deney için 10'de tutun; daha büyük girdilerin aritmetik-aşırı akış kontrollerine ihtiyacı olacaktır.

## 2. Üç çalıştırılabilir dosya oluştur ve çalıştır

```bash
# Easier-to-inspect, unoptimized build:
gcc -Wall -Wextra -O0 -g opt.c -o opt_O0

# Speed-oriented optimization:
gcc -Wall -Wextra -O2 opt.c -o opt_O2

# Size-oriented optimization:
gcc -Wall -Wextra -Os opt.c -o opt_Os

./opt_O0
./opt_O2
./opt_Os
```

Her çalışma yazdırmalıdır:

```text
Result: 285
```

**Dur ve bunu ilk kontrol et.** Komutları karşılaştırmak, programların hala seçilen girdi için beklenen cevabı verdiğini bildiğinizde daha kullanışlıdır.

`-O0` kullanışlı bir ilk denetim yapısı yapar. `-O2` ve `-Os` derleyiciye farklı optimizasyon hedefleri verir. Belirli bir komut dizisi veya belirli bir son dosya boyutu vaat etmezler.

## 3. Kazananı tahmin etmeden boyutları karşılaştırın

```bash
size opt_O0 opt_O2 opt_Os
ls -lh opt_O0 opt_O2 opt_Os
```

`size` çalıştırılabilir dosyadaki bölümleri özetler; `ls`, hata ayıklama bilgileri gibi diğer içerikleri de içeren tüm dosyanın boyutunu gösterir. Her ikisini de aynı ölçüm olarak ele almak yerine kaydedin.

Boyut odaklı yapınız en küçük koda veya dosyaya sahip mi? Gerçekte gördüğünüzü yazın. `-Os`, her tam dosyanın en küçük olacağının garantisi değil, boyut için optimize etme isteğidir.

## 4. Bir seferde bir işlevi kontrol edin

Her yapıda `seri_topla`'nin tam sökülmesini göster:

```bash
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_O0
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_O2
objdump -d -M intel --no-show-raw-insn --disassemble=seri_topla opt_Os
```

Bu karşılaştırmayı ilgisiz başlangıç kodundan ayrı tutmak için işlev etiketini kullanın. Her satırı açıklamanıza gerek yoktur. Bu sorularla başlayın:

1. `kare_al`'ye bir çağrı bulabilir misiniz, yoksa derleyici hesaplamayı doğrudan arayanın içine mi koydu? Bir çağrıyı, çağrılan işlevin çalışmasıyla değiştirmek **inlining**'dir.
2. Döngüyü ve tekrarlanan kare/ek hesaplamayı tanıyabilir misiniz?
3. Geçici değerler yazmaçlarda, yığında mı tutulur, yoksa farklı şekilde mi temsil edilir?

`-O0` için, yerel halkı istiflemek için doğrudan bir yardımcı çağrı ve sık erişimler görebilirsiniz. `-O2`'de, astarlama, yazmaç kullanımı veya dönüştürülmüş bir döngü daha görünür olabilir. `-Os` başka bir seçim seti yapabilir. Bunları araştırmak için bir şeyler olarak ele alın, her derleyici sürümünün üretmesi gereken özellikler değil.

** Kontrol noktanız:** bir gerçek farkı tarif eder ve 285'nin kontrol edilen sonucunu neden değiştirmediğini açıklar.

## 5. sonucu hata ayıklamaya geri bağlayın

Optimize edilmiş sökme işleminden eksik bir yardımcı satır içi olabilir. GDB'de eksik olan bir kaynak değişkeninin artık kendi depolama konumu olmayabilir. Sadece tanıdık bir yığın düzeni aramak, anlamaya çalıştığınız veri akışını gizleyebilir.

Bir çerçeve işaretçisi, kullanıldığında, bir yığın çerçevesine atıfta bulunmaya yardımcı olur. Her optimize edilmiş işlevin aynı `rbp`-ilişkisel düzenini kullandığını varsaymayın. Aynı şekilde, döngü açma ve hizalama seçimleri, bir optimizasyon etiketine bağlı basit kurallar yerine derleyici kararlarıdır.

Daha küçük bir sonraki soru istiyorsanız, [Optimizasyon altında dallanma ve işaretçiler](dallanma-ve-pointer.md): `-O0` ve `-O2`'yi karşılaştırırken bir koşul ve bir yazı tutar.

## Eğer çıktı kafa karıştırıcı ise

** Sökme, örneklerden farklı olarak görünüyor:** mimarinizi ve GNU `objdump` sürümünü doğrulayın. `-M intel` burada kullanılan x86 sözdizimi içindir.

**Yardımcı yok:** Arayandaki çarpmayı arayın; ayrı bir işlev adının olmaması, hesaplamanın kaldırıldığını göstermez.

**Ana işlev çok kısa görünüyor:** Bir derleyici bu sabit giriş hesaplamasını basitleştirebilir. Yukarıda belirtilen işlevin yanı sıra neyin çalıştırılacağına karar vermeden önce `main` tarafından alınan gerçek yolu inceleyin.

**Üç program cevapları farklıdır:** İlk önce tüm dosyaların aynı kaydedilmiş kaynaktan ve gösterilen girdiyle oluşturulduğunu onaylayın. Tek başına bir boyut karşılaştırması doğru davranışı belirleyemez.

## Ne tutmak ve ne sonraki denemek için

Üç çıktıyı, boyutu, derleyici sürümlerini ve bir açıklamalı komut farkını kaydedin. Bu, belirli bir hesaplamayı kontrol eder; tüm olası programların tüm optimizasyon seviyelerinde aynı şekilde davrandığının bir kanıtı değildir.

Daha önceki bir macOS arm64/Apple Clang 21 kontrolü, her üç yapıda da 285 üretti. Bu, Linux / GCC komut veya boyut ölçümü değil, taşınabilir bir C davranış kontrolüydü.

Hazırlık için, [x86-64 assembly okumaya hazırlık](../rehberler/assembly-okuma.md) ve [GDB ile ilk inceleme: C’den makine koduna](gdb-ilk-inceleme.md) bölümüne bakın. Daha büyük değişiklikleri karşılaştırmak için [İkili dosya farkları ve sürüm karşılaştırması](../rehberler/ikili-fark-analizi.md) veya [perf ile yürütme analizi ve donanım izleme](../rehberler/perf-ile-yurutme.md) ile devam edin.

## Kaynaklar

- [GCC Optimizasyon Seçenekleri](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html)
- [Godbolt Derleyici Explorer](https://godbolt.org/)
- [Brendan Gregg: Çerçeve İşaretçilerinin Dönüşü](https://www.brendangregg.com/blog/2024-03-17/the-return-of-the-frame-pointers.html)
