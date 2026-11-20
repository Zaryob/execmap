---
title: perf ile CPU profili ve alev grafiği
language: C
description: perf stat, perf record ve alev grafiğiyle bir C programının en çok işlemci kullanan bölümünü bulun ve düzeltmenin etkisini ölçün.
---

# perf ile CPU profili ve alev grafiği

Bir C programının CPU zamanını nerede harcadığını öğrenin, "yavaş"tan başka bir şeyden başlayarak. `time` ve `perf stat` ile ölçecek, `perf record` ile örnekleyecek, raporu iki şekilde okuyacak, bir alev grafiği çizecek, sıcak talimatlara bakacak, sorunu düzeltecek ve aynı araçlarla düzeltmeyi kanıtlayacaksınız.

Program kasıtlı bir hata içerir: her sorgu için doğrusal olarak sıralanmış bir dizi arar, bu da arama aşamasını dörtlü yapar. Nokta, kaynakta görebileceğiniz hata değil, araçların bunu yapamadığınızda nasıl ortaya çıkardığını öğrenmektir.

## Başlamadan önce

X86-64 veya arm64, GCC veya Clang, `perf` çekirdeğinize uyuyor ve Git'ten alev grafiği komut dosyalarını indirmek için Linux'a ihtiyacınız var. [Çalışma zamanı performans analizine giriş](../rehberler/performans-analizine-giris.md)'den performans analizi] okuyun. Donanım sayaçları konteynerlerde ve bazı sanal makinelerde eksik olabilir; bunları söylemeleri gereken adımlar ve geri kalanı hala yazılım saati ile çalışıyor.

```bash
mkdir -p cpu-profile && cd cpu-profile
uname -r > env.txt
perf --version >> env.txt
cat /proc/sys/kernel/perf_event_paranoid >> env.txt
```

## 1. Program

Bunu `hotspot.c` olarak kaydedin. Her bir aşamanın profilde bir isim alması için her biri kendi satır dışı işlevinde dört aşamaya sahiptir. Ayrıca her aşamayı kendi saati ile ölçer ve zamanları standart hataya basar: perf'in görünümünü programın kendi görünümüyle karşılaştıracaksınız.

```c hotspot.c
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

/* A tiny deterministic generator: every run performs the same work. */
static unsigned next_value(unsigned *state) {
    *state = *state * 1103515245u + 12345u;
    return *state >> 8;
}

__attribute__((noinline)) void fill_ids(unsigned *ids, size_t n) {
    unsigned state = 42;
    for (size_t i = 0; i < n; i++)
        ids[i] = next_value(&state);
}

static int compare_unsigned(const void *a, const void *b) {
    unsigned x = *(const unsigned *)a, y = *(const unsigned *)b;
    return (x > y) - (x < y);
}

__attribute__((noinline)) void sort_ids(unsigned *ids, size_t n) {
    qsort(ids, n, sizeof ids[0], compare_unsigned);
}

/* Slow version: scans the array from the start for every key. */
__attribute__((noinline)) long find_linear(const unsigned *ids, size_t n, unsigned key) {
    for (size_t i = 0; i < n; i++)
        if (ids[i] == key)
            return (long)i;
    return -1;
}

/* Fixed version: the array is already sorted, so binary search is enough. */
__attribute__((noinline)) long find_binary(const unsigned *ids, size_t n, unsigned key) {
    size_t lo = 0, hi = n;
    while (lo < hi) {
        size_t mid = lo + (hi - lo) / 2;
        if (ids[mid] < key) lo = mid + 1;
        else hi = mid;
    }
    return (lo < n && ids[lo] == key) ? (long)lo : -1;
}

__attribute__((noinline)) unsigned long lookup_all(const unsigned *ids, size_t n, int fixed) {
    unsigned state = 7;
    unsigned long found = 0;
    for (size_t q = 0; q < n; q++) {
        /* Odd queries ask for a key that exists; even queries use a fresh value. */
        unsigned key = (q % 2) ? ids[(q * 7919) % n] : next_value(&state);
        long at = fixed ? find_binary(ids, n, key) : find_linear(ids, n, key);
        if (at >= 0)
            found++;
    }
    return found;
}

__attribute__((noinline)) unsigned long checksum(const unsigned *ids, size_t n, int rounds) {
    unsigned long sum = 0;
    for (int r = 0; r < rounds; r++)
        for (size_t i = 0; i < n; i++)
            sum = sum * 31 + (ids[i] ^ (unsigned)r);
    return sum;
}

int main(int argc, char **argv) {
    size_t n = argc > 1 ? strtoul(argv[1], NULL, 10) : 40000;
    int fixed = argc > 2 && strcmp(argv[2], "fixed") == 0;
    unsigned *ids = malloc(n * sizeof *ids);
    if (n == 0 || !ids) {
        fprintf(stderr, "usage: %s [count>0] [slow|fixed]\n", argv[0]);
        return 2;
    }
    double t0 = now_ms();
    fill_ids(ids, n);
    double t1 = now_ms();
    sort_ids(ids, n);
    double t2 = now_ms();
    unsigned long found = lookup_all(ids, n, fixed);
    double t3 = now_ms();
    unsigned long sum = checksum(ids, n, 2000);
    double t4 = now_ms();
    printf("mode=%s n=%zu found=%lu checksum=%lu\n", fixed ? "fixed" : "slow", n, found, sum);
    fprintf(stderr, "fill=%.1fms sort=%.1fms lookup=%.1fms checksum=%.1fms\n",
            t1 - t0, t2 - t1, t3 - t2, t4 - t3);
    free(ids);
    return 0;
}
```

Hata ayıklama bilgilerini ve çerçeve işaretçilerini tutan optimize edilmiş bir ikili yapı oluşturun:

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer hotspot.c -o hotspot
```

`-O2`, yapıyı gerçekçi tutar. `-g`, perf harita adreslerinin işlev adlarına ve kaynak satırlarına izin verir. `-fno-omit-frame-pointer`, perf'in varsayılan çağrı-graf modunun yürüdüğü çerçeve-nokta zincirini tutar.

## 2. Profil oluşturmadan önce ölçün

```bash
time ./hotspot
```

Çıkış şekline sahiptir:

```text
fill=0.1ms sort=3.3ms lookup=318.6ms checksum=58.7ms
mode=slow n=40000 found=20051 checksum=7322226836377315584
real    0m0.39s
user    0m0.38s
sys     0m0.00s
```

Bu sayılar farklı bir makinede tek bir referans çalışmasından gelir; sizinki CPU ve işletim sistemi ile farklı olacaktır. Her yerde üç şey tutmalıdır:

- `found=20051` ve checksum her çalışma ve her iki modda da aynıdır: düzeltme için doğru kontroldür.
- `real` `user`'ye yakındır: bir iş parçacığı tüm zaman boyunca meşguldü. Bu bir **on-CPU** sorunudur, bu nedenle bir CPU profilleyicisi doğru araçtır.
- Programın kendi zamanlayıcısı `lookup`'nin hakim olduğunu söylüyor. Bu sayıyı koru; perf buna katılmalı.

Şimdi `perf stat` ile olayları sayın, varyasyonu görmek için beş kez tekrarlayın:

```bash
perf stat -r 5 ./hotspot > /dev/null
```

Çıktıdaki şu satırları okuyun:

- `task-clock` ve `CPUs utilized`: kullanılan 1.0 CPU'ları hakkında tek bir meşgul iş parçacığı doğrular.
- `context-switches` ve `page-faults`: küçük sayılar. Program çok fazla beklemez veya tahsis etmez.
- `cycles`, `instructions` ve `insn per cycle`: donanım görünümü. `<not supported>`'yi gösterirlerse, ortamınız PMU'yu açığa çıkarmaz; yine de devam edin.
- `+- x.xx%` her değerden sonra: çalıştırılacak varyasyon. Daha sonra bir iyileştirme bundan daha büyük olmalıdır.

## 3. Kayıt örnekleri

```bash
perf record -F 999 -g -o slow.data ./hotspot
```

- `-F 999` saniyede 999 örnekleri hakkında soru sorar. Program yarım saniyeden az bir süre çalışır; 99 Hz sadece birkaç düzine örnek verirdi.
- `-g` her örnekteki çağrı zincirini kaydeder.
- `-o slow.data`, çıktı dosyasını adlandırır, böylece birkaç yakalamayı saklayabilirsiniz.

perf kaç örnek yazdığını yazdırır. Yüz örnekten daha az örnek küçük yüzdelere güvenmek için çok az; `-F`'yi artırın veya daha uzun bir iş yükü (`./hotspot 80000`) çalıştırın.

Perf çalışmayı reddederse, `perf_event_paranoid`'yi kontrol edin ve `sudo` ile deneyin. Çekirdek sembollerinin kısıtlandığı konusunda uyarıda bulunursa, `[k]` girişlerini adsız olarak görürsünüz; bu, kullanıcı alanı egzersizini etkilemez.

## 4. Raporu okuyun: önce kendi kendine zaman

```bash
perf report -i slow.data --stdio --no-children | head -n 40
```

`--no-children`, ** self** örnekleriyle çalışır: bu işlevin kendi talimatlarının uygulandığı örneklerin yüzdesi. `find_linear`'yi büyük bir çoğunlukla üstte bekleyin, ardından `checksum` ve `qsort` iç ve `compare_unsigned` için küçük girişler.

Programa karşı perf kontrol edin: `lookup` kabaca 85'yi referans çalıştırmada programın kendi toplamının% 'sini aldı ve `find_linear`'nin benzer bir örnek payına sahip olması gerekir. İki ölçüm bağımsızdır (programın içindeki bir saat kernelden kesintilere karşı); anlaşma, bulguyu tek başına her ikisinden de çok daha güçlü hale getirir.

## 5. Raporu okuyun: çocuklar ve çağrı yolları

```bash
perf report -i slow.data --stdio --children | head -n 60
```

`--children` ile her işlev aynı zamanda çağırdığı her şeyin örneklerini alır. `main` şimdi 100'ye yakın çünkü her şey altında çalışıyor ve `lookup_all`'nin kendi küçük kendi payı artı `find_linear`'nin altındaki büyük payı var. `find_linear` altındaki çağrı grafiği çizgilerini genişletin ve `main → lookup_all → find_linear` yolunu doğrulayın.

İki soru için iki görüş kullanın:

| Görünüm | Yanıtladığı soru |
| --- | --- |
| benlik (`--no-children`) | Hangi komutlar CPU'yu yakar? |
| çocuklar (`--children`) | Hangi üst düzey operasyon, çağırdığı her şey dahil olmak üzere pahalıdır? |

## 6. Bir alev grafiği çizin

Bir alev grafiği, her örneklenmiş yığını yan yana koyar: x ekseni örneklerin payıdır (zaman sırası değil), y ekseni yığın derinliğidir ve bir kutunun genişliği, bu işlevin yığın üzerinde ne sıklıkta olduğudur.

```bash
git clone --depth 1 https://github.com/brendangregg/FlameGraph
perf script -i slow.data > slow.perf
FlameGraph/stackcollapse-perf.pl slow.perf > slow.folded
FlameGraph/flamegraph.pl slow.folded > slow.svg
```

Bir tarayıcıda `slow.svg` açın; interaktiftir, bu yüzden yakınlaştırmak için bir kutuya tıklayabilirsiniz. `lookup_all`'nin üzerinde geniş bir `find_linear` platosu ve yanında daha dar bir `checksum` kulesi görmelisiniz. Geniş **üst kenarlar** CPU zamanının harcandığı yerdir.

`slow.folded` düz metindir: benzersiz yığın başına bir satır, `;` ile ayrılmış çerçeveler, ardından bir örnek sayımı. Birkaç satır okumak, resmin tam olarak neyden çekildiğini gösterir:

```bash
sort -t' ' -k2 -nr slow.folded | head -n 5
```

Son perf sürümleri de doğrudan `perf script report flamegraph` ile bir alev grafiği üretebilir; bu komut perf yapınıza bağlıdır ve ekstra Python paketlerine ihtiyaç duyabilir.

## 7. Sıcak talimatlara bakın

```bash
perf annotate -i slow.data --stdio -s find_linear | head -n 40
```

perf demontajı `find_linear` Her komut üzerine indi örneklerin yüzdesi ile. Kısa bir döngü üzerinde çoğu örnek bekleyin: diziden bir yük, anahtarla bir karşılaştırma, koşullu bir atlama geri. Örnekler genellikle tam olarak değil, tamamlanması yavaş olan talimattan sonra veya hemen sonra görünür; döngüyü bir bütün olarak okuyun. [x86-64 assembly okumaya hazırlık](../rehberler/assembly-okuma.md) komutları açıklar.

Not, bunun ne tür bir sorun olduğunu doğrular: CPU olağandışı bir şey üzerinde durmaz, döngü gövdesini çok sayıda çalıştırır. Bu bir algoritma sorunudur, mikro optimizasyon sorunu değildir.

## 8. Bir hipotez oluşturun ve düzeltmeden önce test edin

Hipotez: arama süresi `n` kare ile büyür, çünkü `n` sorgularının her biri `n` öğelerini tarar. Tahmin: `n`'yi ikiye katlamak kabaca dört katına çıkma süresi, `checksum` ise sadece iki katına çıkar.

```bash
./hotspot 20000 > /dev/null
./hotspot 40000 > /dev/null
./hotspot 80000 > /dev/null
```

Standart hata üzerindeki `lookup=` ve `checksum=` değerlerini karşılaştırın. Eğer arama, iki katına çıkma ve iki katına çıkma başına yaklaşık dört kat büyürse, tahmin tutar. Bu test hiçbir profilleyici kullanmaz, bu da onu bağımsız bir kontrol yapar.

## 9. Düzeltin ve tekrar ölçün

Programda düzeltme zaten var: dizi sıralanmış, bu yüzden `find_binary` kullanılabilir. Sabit modu aynı araçlarla çalıştırın:

```bash
./hotspot 40000 fixed
perf stat -r 5 ./hotspot 40000 fixed > /dev/null
perf record -F 999 -g -o fixed.data ./hotspot 40000 fixed
perf report -i fixed.data --stdio --no-children | head -n 20
```

Kontrol, sırayla:

1. `found=` ve `checksum=` yavaş moddakiyle aynıdır: düzeltme sonucu değiştirmedi.
2. Toplam süre `perf stat` varyasyonundan çok daha fazla düştü.
3. Yeni profilde `checksum` artık en üst sırada. Bir darboğazın kaldırılması bir sonrakini ortaya çıkarır; optimize etmeye değer olup olmadığına hedefinize bağlıdır.

İki yakalamayı doğrudan karşılaştırın:

```bash
perf diff slow.data fixed.data | head -n 30
```

`perf diff` yüzde hisselerini gösterir. `checksum` * kendi zamanı değişmese de payda * büyür; toplam küçüldü. `perf stat` veya programın kendi zamanlayıcılarından mutlak zaman ile birlikte hisseleri daima okuyun.

## 10. Sorun giderme

| Symptom | Neden | Düzelt |
| --- | --- | --- |
| işlevler onaltılık adresler olarak görünür | semboller yok | `-g` ile inşa edin, soyunmayın, ikiliyi `perf.data`'nin yanında tutun |
| çağrı grafiği ilk karede durur | çerçeve işaretçileri eksik | `-fno-omit-frame-pointer` ile yeniden inşa edin veya `perf record --call-graph dwarf`'yi deneyin |
| `find_linear` eksik rapor | satır içi | kontrol `noinline`; `nm hotspot \| grep find_` ile kontrol edin |
| `<not supported>` döngüler için | PMU mevcut değil (VM veya konteyner) | `-e task-clock` kullanın; örnekleme bir yazılım saatine geri düşer |
| Çok az örnek | kısa koşu | `-F` yükseltin, `n` yükseltin |

`--call-graph dwarf`, yığının bir kısmını her örnekle kopyalar ve daha sonra hata ayıklama bilgilerini kullanarak gevşetir. Çerçeve işaretçileri olmadan çalışır, ancak çok daha büyük dosyalar üretir.

## Ne yaptın

- `real`'den `user`'ye karşı CPU-dışına karar verildi.
- `perf stat` ile birlikte sayılmış, `perf record` ile örneklenmiş, kendi kendine ve çocuk görünümlerini oku.
- Drew ve bir alev grafiği ve onun geldiği katlanmış yığınları oku.
- Bağımsız ölçüm ve ölçekleme tahmini ile bir sıcak noktayı doğruladı.
- Bir düzeltme ölçülmüş ve doğru bir şekilde yorumlanmış yüzde kaymaları.

Örnekleme yerine belirli olayları saymak ve zamanlamak için [bpftrace ile ilk adımlar](bpftrace-ilk-adimlar.md) ile devam edin ve [perf ile yürütme analizi ve donanım izleme](../rehberler/perf-ile-yurutme.md) ile yürütme analizi] okuyun.

## Kaynaklar

- [perf-record(1)](https://man7.org/linux/man-pages/man1/perf-record.1.html), [perf-report(1)](https://man7.org/linux/man-pages/man1/perf-report.1.html), [perf-annot(1)](https://man7.org/linux/man-pages/man1/perf-annotate.1.html), [perf-diff(1)](https://man7.org/linux/man-pages/man1/perf-diff.1.html)
- [Brendan Gregg: CPU Alev Grafiği](https://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html)
- [FlameGraph betikleri](https://github.com/brendangregg/FlameGraph)
- [perf wiki öğretici](https://perfwiki.github.io/main/tutorial/)
