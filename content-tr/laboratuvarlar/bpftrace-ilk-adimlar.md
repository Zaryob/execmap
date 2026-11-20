---
title: bpftrace ile ilk adımlar
language: C
description: Sonucu öngörülebilen bir C programını izleyin, sayaçları, histogramları ve yığınları kaynak kodla karşılaştırın.
---

# bpftrace ile ilk adımlar

Tamamen bildiğiniz küçük bir C programını izleyin, böylece her sayıda bpftrace baskısı kaynağa karşı kontrol edilebilir. Probları listeleyecek, sistem çağrılarını sayacak, başarısız bir `open` yakalayacak, bir histogram oluşturacak, kendi programınızda bir işlev sondalayacak, dönüş değerini okuyacak, zaman ayıracak ve sistem çağrısına yol açan çağrı yığınını yazdıracaksınız.

İş yükü deterministiktir: varsayılan 50 öğeleri için her olayın kaç kez gerçekleşmesi gerektiğini önceden hesaplayabilirsiniz. Bu, her adımı sadece bir gösteri değil, sondanızın bir testine dönüştürür.

## Başlamadan önce

Linux, GCC veya Clang ve ** bpftrace'e ihtiyacınız var 0.21 veya daha yeni** kök erişimi ile (bpftrace 0.19 ve 0.20 Ayrıca kabul `args.field` burada kullanılan sözdizimi; eski sürümlerde yazma `args->field`). [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md) okumak için tıklayın ilk; bu laboratuvar kendi bölümlerini sırayla uygular. Tek kullanımlık veya kişisel bir makine kullanın. bpftrace'in `-c` iş yükünü kök olarak çalıştırır, bu yüzden sadece bu laboratuvar programını onunla çalıştırın.

```bash
mkdir -p bpftrace-first && cd bpftrace-first
bpftrace --version | tee env.txt
uname -r | tee -a env.txt
```

## 1. İş yükü

Bunu `worker.c` olarak kaydet:

```c worker.c
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define INPUT "worker-input.txt"
#define INPUT_SIZE 10000

/* The function we will probe: its cost depends on id % 5. */
__attribute__((noinline)) int process_item(int id) {
    volatile unsigned long x = 0;
    for (int i = 0; i < (id % 5 + 1) * 200000; i++)
        x += (unsigned long)i;
    return id % 7;
}

static int make_input(void) {
    char data[INPUT_SIZE];
    memset(data, 'x', sizeof data);
    int fd = open(INPUT, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return -1;
    ssize_t w = write(fd, data, sizeof data);
    close(fd);
    return w == (ssize_t)sizeof data ? 0 : -1;
}

/* Reads the input in 4096-byte chunks: 4096 + 4096 + 1808, then 0 (EOF). */
static long read_input(void) {
    char buf[4096];
    long total = 0;
    ssize_t r;
    int fd = open(INPUT, O_RDONLY);
    if (fd < 0) return -1;
    while ((r = read(fd, buf, sizeof buf)) > 0)
        total += r;
    close(fd);
    return total;
}

int main(int argc, char **argv) {
    int items = argc > 1 ? atoi(argv[1]) : 50;
    long result_sum = 0;
    if (items <= 0 || make_input() != 0) {
        fprintf(stderr, "usage: %s [items>0] (run in a writable directory)\n", argv[0]);
        return 2;
    }
    for (int i = 0; i < items; i++) {
        if (i % 10 == 0) {
            /* An optional file that never exists: this open fails with ENOENT. */
            int fd = open("missing.conf", O_RDONLY);
            if (fd >= 0) close(fd);
            else if (errno != ENOENT) perror("missing.conf");
        }
        if (read_input() != INPUT_SIZE) {
            fprintf(stderr, "short read on %s\n", INPUT);
            return 1;
        }
        result_sum += process_item(i);
        struct timespec pause = { 0, 2 * 1000 * 1000 }; /* 2 ms */
        nanosleep(&pause, NULL);
    }
    printf("items=%d result_sum=%ld pid=%ld\n", items, result_sum, (long)getpid());
    return 0;
}
```

Bunu inşa edin ve izlemeden bir kez çalıştırın:

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer worker.c -o worker
./worker
```

PID dışında beklenen çıktı:

```text
items=50 result_sum=147 pid=<pid>
```

`result_sum` Toplamı nedir `i % 7` için `i` itibaren 0 için 49, olan 147. İkilinin mutlak yolunu bir değişkende tutun; uprobes buna ihtiyaç duyar:

```bash
BIN=$(readlink -f ./worker)
echo "$BIN"
```

İzlemeden önce, `main`'yi okuyarak programın 50 öğeleri için ne yaptığını tahmin edin:

| Etkinlik | Beklenen sayım | Neden mi? |
| --- | --- | --- |
| `process_item` çağrıları | 50 | öğe başına bir kez |
| `open` `missing.conf` (`ENOENT` ile başarısız olur) | 5 | ürünler 0, 10, 20, 30, 40 |
| `worker-input.txt`'nin başarılı açılışı | 51 | biri oluşturmak için, 50 okumak için |
| `read` veriyi döndürür | 150 | öğe başına üç parça: 4096 + 4096 + 1808 |
| `read` geri dönüyor 0 (dosya sonu) | 50 | öğe başına bir kez |
| uykular | 50 | 2 ms her öğeden sonra |

## 2. Merhaba, sonda listesi

```bash
sudo bpftrace -e 'BEGIN { printf("bpftrace works\n"); exit(); }'
sudo bpftrace -l 'tracepoint:syscalls:sys_enter_open*'
sudo bpftrace -lv 'tracepoint:syscalls:sys_exit_read'
sudo bpftrace -l "uprobe:$BIN:process_item"
```

İlk komut izinleri kontrol eder. İkinci açık ilgili sistemin bu çekirdeği izleyebileceği gösterir; Modern glibc, `open()`'yi **`openat`** sistem çağrısıyla uygular, bu nedenle bu laboratuvar `openat`'yi değil, `open`'yi izler. Üçüncü, okuma çıkış iz noktasının alanlarını gösterir, eğer `ret` dahil olmak üzere hiçbir şey yanlış değilse, dördüncü, bp fonksiyonunu çözdüğünü doğrular.

## 3. Her sistem çağrısını say

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:raw_syscalls:sys_enter /pid == cpid/ { @syscalls = count(); }'
```

`raw_syscalls:sys_enter` her sistem çağrısı için ateşler; filtre sadece `-c` tarafından başlatılan çocuğu tutar. Toplam yukarıdaki tablodan daha büyüktür: dinamik yükleyici ve C kütüphanesi `main`'den (haritalama kütüphaneleri, bellek kurma) önce ve çıkışta sistem çağrıları yapar. Bu fark ilk derstir: ** kodunuz işlemdeki tek kod değildir**.

Şimdi sistem çağrı adını say. Wildcard sistem çağrısı başına bir sonda ekler, bu yüzden başlatma birkaç saniye sürer:

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_enter_* /pid == cpid/ { @[probe] = count(); }'
```

Masanıza karşı kontrol edin:

- `sys_enter_read` en az 200 olmalıdır (150 verileri + 50 dosya sonu okumaları, artı kütüphane başlıklarının birkaç yükleyici okuması).
- `sys_enter_openat` en az 56 (51 + 5, artı yükleyici `/etc/ld.so.cache` ve `libc.so.6` gibi açılır) olmalıdır.
- uyku, C kütüphanesine bağlı olarak `sys_enter_clock_nanosleep` veya `sys_enter_nanosleep` olarak görünür. glibc, `nanosleep()`'yi mevcut sürümlerde `clock_nanosleep` sistem çağrısı ile uygular: bir kütüphane işlev adı ve kullandığı sistem çağrısının eşleşmesine gerek yoktur.

## 4. İzleme dosyası açılır ve arızayı yakalar

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @path[tid] = str(args.filename); }
tracepoint:syscalls:sys_exit_openat /pid == cpid/ {
    @opens[@path[tid], args.ret >= 0 ? 0 : -args.ret] = count();
    delete(@path[tid]);
}
END { clear(@path); }'
```

Giriş izleme noktası dosya adını bilir; çıkış izleme noktası sonucu bilir. `tid` tarafından anahtarlanan bir harita, ismi girişten çıkışa taşır. İkinci anahtar başarı için `0` veya bir hata için hata numarasıdır.

Yükleyici yollarınızla beklenen girişler:

```text
@opens[missing.conf, 2]: 5
@opens[worker-input.txt, 0]: 51
@opens[/etc/ld.so.cache, 0]: 1
@opens[/lib/x86_64-linux-gnu/libc.so.6, 0]: 1
```

Hata numarası 2 var `ENOENT`, "böyle bir dosya veya dizin yok". Program bu hatayı sessizce görmezden gelir; bpftrace yine de görür. Gerçek bir programda gizli özyineleri ve eksik yapılandırmayı tam olarak böyle bulabilirsiniz. Terner ifade eski bir bpftrace tarafından reddedilirse, kullanın `args.ret` Bunun yerine anahtar olarak ve olumsuz değerleri hata olarak okuyun.

## 5. Okuma boyutlarının Histogramı

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_exit_read /pid == cpid/ { @bytes = hist(args.ret); }'
```

Beklenen şekil:

```text
@bytes:
[0]                   50 |@@@@@@@@@@@@@@@@@@@@@@@@@@               |
[1K, 2K)              50 |@@@@@@@@@@@@@@@@@@@@@@@@@@               |
[4K, 8K)             100 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|
```

Ayrıca birkaç yükleyici diğer kovalarda da okur. Her kova programa uyuyor: 50 dosya sonu okuması geri dönüyor 0, 50 okundu 1808 baytlar ve 100 okundu 4096 bayt. Şimdi deneyin `lhist(args.ret, 0, 5000, 1000)` yerine `hist` ve aynı verilerin doğrusal kovalarla nasıl göründüğünü karşılaştırın.

## 6. Kendi programınızda bir işlevi sondalayın

```bash
sudo bpftrace -c "$BIN" -e "uprobe:$BIN:process_item /pid == cpid/ { @calls = count(); @ids = lhist(arg0, 0, 50, 10); }"
```

Program bu kez çift tırnak içinde, böylece kabuk `$BIN` genişletir. `arg0` ilk argüman, `id`, çağrı kongre koyar yazmaçtan okunuyor. `@calls: 50` ve her biri on beş histogram kovası bekliyoruz.

Dönüş değerini bir dönüş probu ile okuyun:

```bash
sudo bpftrace -c "$BIN" -e "uretprobe:$BIN:process_item /pid == cpid/ { @ret = lhist(retval, 0, 7, 1); @sum = sum(retval); }"
```

`@sum`, programın baskılarıyla aynı değerde 147 olmalıdır. Bir sonda programın kendi çıktısına katıldığında, doğru işleve bağlı sondayı bilirsiniz ve her çağrıyı görürsünüz.

## 7. Zaman işlevi

```bash
sudo bpftrace -c "$BIN" -e "
uprobe:$BIN:process_item /pid == cpid/ { @start[tid] = nsecs; @id[tid] = arg0; }
uretprobe:$BIN:process_item /pid == cpid && @start[tid]/ {
    @us_by_cost[@id[tid] % 5] = hist((nsecs - @start[tid]) / 1000);
    delete(@start[tid]); delete(@id[tid]);
}
END { clear(@start); clear(@id); }"
```

`process_item`, `(id % 5 + 1) * 200000` kez döngü yapar, bu nedenle süresi beş adımda artmalıdır. Harita `id % 5` tarafından anahtarlanmıştır: anahtar 4, anahtar 0'nin yaklaşık beş katı süreler göstermelidir. Mutlak mikrosaniyeler CPU'nuza bağlıdır. Beş grup yoğun bir şekilde üst üste biniyorsa, makine meşguldü veya CPU frekansı değişti; tekrarla ve not edin.

Bu önlemlerin neler olduğuna dikkat edin: iş parçacığı önceden boşaltıldığı herhangi bir zaman dahil olmak üzere giriş ve dönüş arasındaki geçen süre. [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](../rehberler/calisma-zamani-gecikmesi.md), CPU zamanından geçen zamanı ayırır.

## 8. Bu sistem çağrısını kim aradı?

```bash
sudo bpftrace -c "$BIN" -e 'tracepoint:syscalls:sys_enter_*nanosleep /pid == cpid/ { @[probe, ustack] = count(); }'
```

Wildcard, C kütüphanenizin kullandığı `sys_enter_nanosleep` ve `sys_enter_clock_nanosleep` ile eşleşir; Anahtardaki `probe`, hangisinin ateşlendiğini gösterir. Çıktı, önce 50'nin bir sayımı olan bir yığın, en içteki çerçevedir:

```text
@[
    clock_nanosleep+…
    __nanosleep+…
    main+…
    __libc_start_call_main+…
]: 50
```

Bu şekil açıklayıcıdır. Yığın libc çerçevesinde durursa, C kitaplığınız çerçeve işaretçileri olmadan inşa edilmiştir; programın kendi çerçeveleri hala göründükleri yerde doğrudur. Sadece onaltılık adresler görürseniz, bpftrace sembolleri okuyamaz: `$BIN`'deki ikilinin değişmediğini kontrol edin.

## 9. Temizleme

```bash
rm -f worker-input.txt
```

Takip edilen çocuk tarafından oluşturulan dosyalar köke aittir, çünkü `-c` onu bpftrace'in ayrıcalıklarıyla çalıştırır; gerekirse `sudo rm` kullanın.

## Ne yaptın

| Adım | Konsept | Kılavuz bölümü |
| --- | --- | --- |
| 2 | Sondaların ve alanların listelenmesi | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#3-finding-probes-and-their-arguments) |
| 3 | iz noktaları, filtreler, `count()` | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#5-filters-limiting-the-noise) |
| 4 | iş parçacığı başına durum, dize argümanları, hata numaraları | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#6-maps-counting-and-summarizing-inside-the-kernel) |
| 5 | histogramlar | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#6-maps-counting-and-summarizing-inside-the-kernel) |
| 6 | uprobes, `arg0`, `retval` | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#2-probe-types-you-will-use-first) |
| 7 | giriş/dönüş çiftleri ile zamanlama | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#7-measuring-how-long-something-takes) |
| 8 | yığınlar | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](../rehberler/bpftrace-temelleri.md#8-stacks-who-called-this) |

Her adımda bpftrace'in çıktısını kaynaktan türettiğiniz bir sayıyla karşılaştırdık. Bu alışkanlığı gerçek programlarla koruyun: bildiğiniz bir şeyi bulun (gönderilen istekler, işlenen öğeler) ve zamanlamasına güvenmeden önce sondanızı ona karşı kontrol edin.

Yavaşlığı bir CPU profilinde görünmeyen bir programda bu teknikleri kullanan [Az CPU kullanan yavaş bir programı teşhis etme](yavas-program-teshisi.md) ile devam edin.

## Kaynaklar

- [bpftrace kılavuzu](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [bpftrace tek satırlık öğretici](https://github.com/bpftrace/bpftrace/blob/master/docs/tutorial_one_liners.md)
- [openat(2)](https://man7.org/linux/man-pages/man2/openat.2.html), [okuma(2)](https://man7.org/linux/man-pages/man2/read.2.html), [saat_nanosleep(2)](https://man7.org/linux/man-pages/man2/clock_nanosleep.2.html)
- [errno(3)](https://man7.org/linux/man-pages/man3/errno.3.html)
