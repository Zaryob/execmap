---
title: Optimizasyon altında dallanma ve işaretçiler
description: Aynı koşulun iki derlemesini ve bir işaretçinin hedef değiştirdiği anı karşılaştırın.
---

# Optimizasyon altında dallanma ve işaretçiler

Bir C fonksiyonunu iki kez derleyin ve makine komutları değiştiğinde bile aynı cevabı verdiğini kontrol edin. Ardından bir işaretçi aracılığıyla yazdığı anı yakalamak için bir GDB saat noktası kullanın.

Soru basit: **Kaynak seviyesinde bir `if` koşullu bir sıçrama olmak zorunda mı?** C kodundan tahmin etmek yerine derleyicinin gerçek çıktısını inceleyeceksiniz.

## Başlamadan önce

İsteğe bağlı tam giriş kontrolü için Linux x86-64, GCC, GNU binutils, GDB ve Python 3 kullanın. [GDB ile ilk inceleme: C’den makine koduna](gdb-ilk-inceleme.md)'yi ilk olarak tamamlayın; işaretçileri, yazmaç denetimini ve hata ayıklayıcı istemini tanıtır.

Bir Linux terminalinde, ayrı bir dizin oluşturun:

```bash
mkdir -p ~/execmap-labs/branches
cd ~/execmap-labs/branches
```

Derleyici, hata ayıklayıcı ve mimari sürümleri ilk laboratuvarda gösterildiği gibi kaydedin. Kabuk komutlarını burada terminalde çalıştırın; yalnızca açıkça GDB olarak işaretlenen blok hata ayıklayıcının içine aittir.

## 1. Okumadan önce kuralı okuyun

Bunu `dallanma.c` olarak kaydet:

```c dallanma.c
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

int sec_ve_yaz(int *hedef, int x) {
    int deger;
    if (x < 0) {
        deger = -x;
    } else {
        deger = x + 3;
    }
    *hedef = deger;
    return deger;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <-1000..1000>\n", argv[0]);
        return 2;
    }
    char *son;
    errno = 0;
    long girdi = strtol(argv[1], &son, 10);
    if (errno != 0 || son == argv[1] || *son != '\0' ||
        girdi < -1000 || girdi > 1000) {
        fputs("Invalid input\n", stderr);
        return 2;
    }
    int hedef = 0;
    int sonuc = sec_ve_yaz(&hedef, (int)girdi);
    printf("input=%d target=%d result=%d\n", (int)girdi, hedef, sonuc);
    return 0;
}
```

`sec_ve_yaz` iki kuraldan birini uygular: negatif girdiler pozitif olur ve negatif olmayan girdiler 3 eklenir. `*hedef`'ye cevabı yazar ve aynı cevabı döndürür.

Örneğin, -7 7 olur, sıfır 3 olur ve 7 10 olur. Program sadece `-1000..1000` kabul eder, aritmetiği tanımlanmış aralığı içinde tutar. `hedef` geçerli bir yazılabilir tamsayıya işaret etmelidir; `main` bir tane sağlar.

## 2. İki versiyon oluşturun ve cevaplarını karşılaştırın

Terminalde:

```bash
gcc -std=c11 -Wall -Wextra -Werror -g -fno-omit-frame-pointer -fno-inline -O0 dallanma.c -o dallanma_O0
gcc -std=c11 -Wall -Wextra -Werror -g -fno-omit-frame-pointer -fno-inline -O2 dallanma.c -o dallanma_O2
./dallanma_O0 -7
./dallanma_O2 -7
./dallanma_O0 0
./dallanma_O2 0
./dallanma_O0 7
./dallanma_O2 7
```

Aşağıdaki her cevap iki kez görünmelidir: her çalıştırılabilirden bir kez.

```text
input=-7 target=7 result=7
input=0 target=3 result=3
input=7 target=10 result=10
```

`target`, işaretçi aracılığıyla değiştirilen tam sayıdır; `result` işlevin dönüş değeridir. Eşitlikleri, korumak istediğimiz davranıştır.

İki derleme komutu sadece `-O0`'yi `-O2` olarak değiştirir. Diğer seçenekler sabit kalır. `-fno-inline` bu işlevi ayrı ayrı incelemeyi kolaylaştırır; diğer tüm optimizasyonları kapatmaz.

**İsteğe bağlı giriş kontrolü:** `-1000` üretmeli 1000, ve `1000` üretmeli 1003. gibi girişler `abc`, `7x`Boş bir tartışma veya `1001` Çıkış kodu ile reddedilmelidir 2. Ayrıştırıcı bir lider kabul eder `+` ve izin verildiği gibi beyaz alan `strtol`.

## 3. Her yapı kendi cevabını nasıl seçer bul

Sadece karşılaştırdığımız işlevi göster:

```bash
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O0
objdump -d -M intel --disassemble=sec_ve_yaz ./dallanma_O2
```

Tek seferde tek bir yapı üzerinden çalışın. `x`'nin sıfırla karşılaştırılması, cevabın hesaplanması, hedefe yazma ve dönüş değeri için bakın.

Bir koşullu atlama, bir sonraki komut çalışır değişiklikler. Genellikle `cmov` olarak adlandırılan koşullu bir hareket, atlama bu tür almadan bir değer seçebilir. Her iki yaklaşım da aynı C kuralını uygulayabilir. Optimize edilmiş yapı hala bir atlama içerebilir; Belirli bir opcode başarı için bir gereklilik değildir.

**Kontrol noktanız:** değeri nerede açıkla 7 giriş için gelir -7, ve hangi komut hedefe dört bayt yazar. argüman ayrıştırıcısından dalları sayma `main` Bu fonksiyondaki dallar gibi.

## 4. GDB ile yazma yakala

Terminalde, optimize edilmemiş yapıyı açın:

```bash
gdb -q ./dallanma_O0
```

`(gdb)` isteminde aşağıdakileri girin:

```text gdb
set pagination off
set disassembly-flavor intel
set disable-randomization off
break sec_ve_yaz
run -7
p x
p *hedef
set $hedef_adresi = hedef
disassemble /r sec_ve_yaz
watch -l *hedef
continue
x/wd $hedef_adresi
delete $bpnum
finish
p/d (int)$eax
continue
quit
```

İlk kesme noktası, işlev hedefi değiştirmeden duraklar. `x = -7` ve `*hedef = 0`'yi görmelisiniz.

`watch -l *hedef`, GDB'den bellek değeri değiştiğinde durmasını ister. `continue`'den sonra, saat noktası **eski değer 0, yeni değer 7** rapor etmelidir. Aradığınız yazı buydu. `finish`'den sonra, `eax`'deki dönüş değeri de 7 olmalıdır.

`delete $bpnum`, programın bu yığın adresini yeniden kullanabilmesi için saat noktasını kaldırır. Yerel x86-64'de, bir donanım saat noktası genellikle yazmadan sonra * sonra * durur, bu nedenle mevcut `$pc` otomatik olarak bunu gerçekleştiren komutun adresi değildir.

## 5. Ne kurduğuna karar ver

Her iki çalıştırılabilir dosya da beklenen cevapları verdiğinde temel laboratuvarı tamamladınız ve hedefle 7 yazan optimize edilmemiş yapıyı yakaladınız.

Üç örnek kabul edilen her girdiyi kapsamaz. Tam bir kontrol için, `package.json` içeren dizin olan **execmap depo root**'ta bir terminal açın ve çalıştırın:

```bash
python3 scripts/verify-assembly-labs.py
```

Bu, yayınlanan C kodunu çıkarır, tüm 2001 kabul edilen tamsayı girdilerini matematiksel kurala karşı kontrol eder ve geçersiz argümanları dener. Sonuçlar `output/assembly-validation/report.json`'ye gider. Linux x86-64'de ayrıca GDB alıştırmalarını da kontrol eder. Diğer platformlar açıkça bu hata ayıklayıcı kontrollerini atlar; `--require-linux-gdb` bunları zorunlu kılar.

## Bir şey farklı görünüyorsa

**Optimize edilmiş işlev farklı komutlar kullanır:** seçilen değeri ve son yazımı karşılaştırır. Farklı komutlar aynı cevabı koruyabilir.

**GDB `<optimized out>`'yi görüntüler:** derleyici bir değişkeni kaldırmış veya taşımış olabilir. Bu, değerin hiç var olmadığı anlamına gelmez.

** Optimize edilmiş hedef başlangıçta sıfır değildir:** `main`'nin başlangıç sıfırı program kullanmadan önce üzerine yazılır, bu nedenle derleyici bu başlatmayı kaldırabilir. Sıfırdan yediye saat noktası egzersizi kasıtlı olarak `-O0` kullanır. `-O2` için gelen argümanı, son depolanan değeri ve bunun yerine geri dönüş değerini kontrol edin.

**Denetlemek istiyorsunuz `-O2` giriş yazmaçları:** ile yeni bir oturum başlat `start -7`, set `break *sec_ve_yaz`, sonra `continue`. Tam girişte, `(int)$esi` Giriş ve `(int *)$rdi` bu imza için işaretçidir. Basmadan önce işaretçiyi kaydedin. [x86-64 assembly okumaya hazırlık](../rehberler/assembly-okuma.md) Bu giriş değerlerinin neden daha sonra fonksiyonda üstlenilemeyeceğini açıklar.

## Sonraki deney

Döngüleri incelemek ve astarlamak için [Derleyici ve optimizasyon düzeyi farklarını inceleme](derleme-farklari.md) veya yapı karşılaştırması yapmak için [İkili dosya farkları ve sürüm karşılaştırması](../rehberler/ikili-fark-analizi.md) kullanın. Daha sonra, [Sembolleri ayıklanmış ELF dosyalarını okuma](../rehberler/stripped-elf.md), araştırmadaki yararlı sembol adlarını kaldırır.

## Kaynaklar

- [GCC: Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html)'yi optimize edin: if-dönüşüm, inlining ve optimizasyon-seviyesi limitleri.
- [GDB: Optimize Edilmiş Kod](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html) ve [Set Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html).
- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html), [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html), [strtol(3)](https://man7.org/linux/man-pages/man3/strtol.3.html).
- [mytechnotalent/Reverse-Engineering, x64 Course](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): İşaretçiler, adresleme ve dallanma üzerine ek çalışma için 131–132 ve 162–163. dersler. Bu program, girdi kümesi ve doğrulama yöntemi Execmap için hazırlandı.
