---
title: bpftrace’e giriş: izleme noktaları, filtreler ve haritalar
description: bpftrace dilini, yerleşik değişkenleri, histogramları, zaman ölçümünü ve çağrı yığınlarını adım adım öğrenin.
---

# bpftrace’e giriş: izleme noktaları, filtreler ve haritalar

**bpftrace**, çalışan bir Linux sistemi sorularını sormak için kullanılan küçük bir betik dilidir; örneğin "bu işlem hangi dosyalarda açılır?", "bu işlev ne kadar sürer?" veya "uykuya girdiğinde bu iş parçacığı nerede?". Birkaç satır yazarsınız; bpftrace bunları bir eBPF programına derler, çekirdek, adını verdiğiniz olayları doğrular ve ekler ve sonuçları bpftrace yazdırır.

Bu kılavuz dili ilk komuttan öğretir. [Çalışma zamanı performans analizine giriş](performans-analizine-giris.md)'den performans analizi] makine hazırlığı varsayar. İz noktaları, kprobes ve uprobes hakkındaki arka plan [eBPF ile çalışma zamanı olaylarını gözlemleme](ebpf-ile-olaylar.md) ile çalışma zamanı etkinliklerinde; uygulama [bpftrace ile ilk adımlar](../laboratuvarlar/bpftrace-ilk-adimlar.md)'de].

Gösterilen hedefler **bpftrace 0.21 veya daha yeni**. Eski sürümler aşağıda belirtilen ayrıntılarda farklılık gösterir. Makinenizde her zaman `bpftrace --version` ve `man bpftrace`'yi kontrol edin.

## 1. İlk programınız

```bash
sudo bpftrace -e 'BEGIN { printf("hello from bpftrace\n"); exit(); }'
```

`-e` komut satırında programı geçer. `BEGIN` izleme başladığında bir kez ateş eden özel bir sondadır; `exit()` programı bitirir. `exit()` olmadan, bpftrace Ctrl-C'ye basana kadar çalışır.

Her bpftrace programı **probe bloklarının bir listesidir **:

```text bpftrace
probe_type:target:event
/filter/
{
    actions;
}
```

- **probe**, *ne zaman* bloğun çalıştığını söyler: bir çekirdek izleme noktasında, bir işlev girişinde, her 10 ms'de ve benzeri.
- **filter** (predicate olarak da adlandırılır) isteğe bağlıdır. Eylemler yalnızca doğru olduğunda çalışır.
- **actions** ne yapmalı: say, bir zaman kaydet, yazdır.

İkinci bir örnek, sistem çağrılarını işlem adı başına beş saniye sayar:

```bash
sudo bpftrace -e '
tracepoint:raw_syscalls:sys_enter { @calls[comm] = count(); }
interval:s:5 { exit(); }'
```

Program çıktığında, bpftrace her haritayı otomatik olarak yazdırır:

```text
@calls[bash]: 12
@calls[sshd]: 40
@calls[Xorg]: 381
```

Bu çıkış şekli açıklayıcıdır; işlem isimleriniz ve numaralarınız farklı olacaktır.

## 2. İlk kullanacağınız prob tipleri

| İzleme noktası | Ne zaman tetiklenir | Örnek |
| --- | --- | --- |
| `tracepoint:` | kararlı, adlandırılmış bir çekirdek olayı meydana gelir | `tracepoint:syscalls:sys_enter_openat` |
| `kprobe:` / `kretprobe:` | bir çekirdek işlevi girilir / geri döner | `kprobe:vfs_read` |
| `uprobe:` / `uretprobe:` | bir kullanıcı programı veya kitaplığındaki bir işlev girilir / geri döner | `uprobe:/bin/bash:readline` |
| `profile:hz:99` | 99 kez her CPU'da saniyede (örnekleme) | `profile:hz:99 { @[ustack] = count(); }` |
| `interval:s:1` | Bir CPU'da saniyede bir kez (baskı için zamanlayıcı) | `interval:s:1 { print(@x); clear(@x); }` |
| `BEGIN` / `END` | Program başlangıç / bitiş | `END { clear(@start); }` |

Birisi var olduğunda ** Tracepoints** tercih edin: isimleri ve alanları korunmuş bir arayüzdür. kprobes, yeniden adlandırılabilen, satır içi veya çekirdek sürümleri arasında kaldırılabilen dahili çekirdek işlevlerine bağlanır. uprobes belirli bir dosyada koda bağlanır: prob, ikiliyi takip eder, bu nedenle programı yeniden inşa etmek, sondayı yeniden kontrol etmek anlamına gelir.

## 3. Sondaları ve argümanlarını bulmak

Prob adlarını veya argüman alanlarını asla tahmin etmeyin. Listele:

```bash
sudo bpftrace -l 'tracepoint:syscalls:sys_enter_open*'
sudo bpftrace -lv 'tracepoint:syscalls:sys_enter_openat'
sudo bpftrace -l 'uprobe:/usr/bin/bash:*readline*'
```

`-l`, sondaları eşleştiren listeleri; `-v` alanları ekler. `sys_enter_openat` için alan listesi `filename`, `flags` ve `mode`'yi içerir. Bir programda bunları `args.filename` olarak okursunuz.

> [!NOTE]
> bpftrace 0.19, iz noktası argümanlarını bir işaretçiden bir yapıya değiştirdi. 0.19 ve daha yeni `args.filename` yazın; Debian kitap kurdu 0.17 gibi eski sürümlerde, `args->filename` yazın. Bazı yeni sürümler ok formu için bir ön izleme uyarısı yazdırır.

Kprobes ve uprobes için argümanlar, platform çağrı kuralını takiben `arg0`, `arg1` olarak konumlandırılarak kullanılabilir. Dönüş sondalarında dönüş değeri `retval`'dir. Konumsal argümanların hiçbir türü yoktur: işlevin parametrelerinin ne anlama geldiğini bilmelisiniz.

## 4. Dahili değişkenler

| Değişken | Anlamı |
| --- | --- |
| `pid` | süreç kimliği (bir işlemin tüm konuları bunu paylaşır) |
| `tid` | iş parçacığı kimliği |
| `comm` | süreç veya iş parçacığı adı, 15 karakterlerine kadar |
| `uid` | kullanıcı kimliği |
| `cpu` | Probu çalıştıran CPU numarası |
| `nsecs` | nanosaniye zaman damgası (aşağıdaki saat notuna bakın) |
| `elapsed` | bpftrace başladığından beri nanosaniyeler |
| `probe`, `func` | tam prob adı, işlev adı |
| `kstack`, `ustack` | çekirdek ve kullanıcı çağrı yığınları şu anda |
| `cpid` | Çocuğun PID'si `-c` ile başladı |
| `$1`, `$2` | script'ten sonra geçen konum parametreleri |

`comm` isimleri ilgisiz süreçlerle paylaşılabilir ve program tarafından değiştirilebilir. Hassaslık söz konusu olduğunda PID tarafından filtrelenir. [Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu](process-thread-ve-zamanlayici.md) PID/TID ayrımını açıklar.

> [!NOTE]
> Bpftrace 0.21'de düz `nsecs`, askıya alınan süreyi içeren önyükleme saatini kullanır. Bir çalışma içindeki aralıklar için, `nsecs(monotonic)`, [İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme](../laboratuvarlar/fonksiyon-problari.md)'nin yaptığı gibi seçimi açık bir şekilde yapar. Eski sürümler argümanı kabul etmeyebilir.

## 5. Filtreler: gürültüyü sınırlamak

Sistem çapında her işlem için bir izleme noktası yangınları. Filtre mümkün olduğunca erken:

```bash
# Only one process ID
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat /pid == 1234/ { printf("%s\n", str(args.filename)); }'

# Only processes named "worker"
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat /comm == "worker"/ { printf("%s\n", str(args.filename)); }'

# Only the command bpftrace starts itself
sudo bpftrace -c './worker 50' -e 'tracepoint:syscalls:sys_enter_openat /pid == cpid/ { printf("%s\n", str(args.filename)); }'
```

`-c` deneyler için en güvenilir seçimdir: bpftrace sondalarını ekler, komutu başlatır ve bittiğinde çıkar. Komut, bpftrace'in ayrıcalıklarıyla çalışır, bu nedenle aşağıdaki `sudo` root olarak çalışır; sadece güvendiğiniz programlarla kullanın. `str()` izlenen işlemin belleğinden bir dize kopyalar; `filename` Sen yapana kadar sadece bir işaretçi.

## 6. Haritalar: çekirdek içinde sayma ve özetleme

`@` ile başlayan değişkenler **haritalar**: program çalışırken çekirdekte yaşayan anahtar/değer tablolarıdır. çekirdek içinde özetlemek bpftrace'i ucuz yapan şeydir: bir milyon satır yazdırmak yerine bir sayaç günceller.

```text bpftrace
@total = count();               // one counter
@by_name[comm] = count();       // one counter per process name
@bytes[comm] = sum(args.ret);   // a sum per key
@size = hist(args.ret);         // power-of-two histogram
@lat = lhist($ms, 0, 100, 10);  // linear histogram: 0..100 in steps of 10
@s = stats(args.ret);           // count, average, and total
```

Faydalı harita eylemleri:

- `print(@m)` artık baskılar; `clear(@m)` boşaltır; `delete(@m[key])` bir anahtarı kaldırır.
- Çıkış bpftrace'de boş olmayan her haritayı yazdırır; çıktıyı temiz tutmak için `END` bloğundaki yardımcı haritaları temizleyin.
- `$` ile başlayan değişkenler **scratch değişkenleri**, yerelden bir bloka yürütmedir.

`hist()` sonucunu okumak: Her satır bir `[low, high)` aralığı ve içine düşen değer sayısıdır. Çubuk göreceli boyutu gösterir.

```text
@size:
[1K, 2K)               5 |@@@@@@@@@@@@@                          |
[2K, 4K)               0 |                                       |
[4K, 8K)              10 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|
```

Bu örnek, 1024 ve 2047 arasında beş değerin, 4096 ve 8191 arasında on değerin olduğu anlamına gelir. Histogramlar kesin değerleri kaybeder, ancak genellikle ihtiyacınız olan şekli korur: gecikme bir sıkı küme, iki küme veya uzun bir kuyruk mu?

## 7. Bir şeyin ne kadar sürdüğünü ölçmek

Zamanlama iki sonda ve iş parçacığı başına duruma ihtiyaç duyar. Girişte, iş parçacığı kimliği ile anahtarlanmış bir zaman damgası saklayın; Dönüşte, çıkarma ve silme:

```bash
sudo bpftrace -e '
kprobe:vfs_read { @start[tid] = nsecs; }
kretprobe:vfs_read /@start[tid]/ {
    @read_us = hist((nsecs - @start[tid]) / 1000);
    delete(@start[tid]);
}
END { clear(@start); }'
```

Neden her bölüm önemlidir:

- **Keyed by `tid`**: birçok iş parçacığı aynı anda `vfs_read` içinde olabilir; tek bir değişken başlangıç sürelerini karıştırır.
- **Süzgeç `/@start[tid]/`** izleme başlamadan önce girişini yaptı geri dönüşleri görmezden gelir.
- **`delete`**, eski girişlerin daha sonra, ilgisiz bir dönüşle eşleşmesini önler.
- **Bölüm son** olur, bu yüzden kısa aralıklar çok erken sıfıra yuvarlanmaz.

Aynı kalıp `uprobe` / `uretprobe` için kendi fonksiyonlarınızda ve `sys_enter_*` / `sys_exit_*` sistem çağrılarındaki izleme noktaları için çalışır.

## 8. Yığınlar: Bunu kim çağırdı?

`ustack` ve `kstack`, sonda ateşlendiğinde çağrı yığınını yakalar. Bir yığın harita anahtarı olarak kullanmak, aynı çağrı yollarını sayar:

```bash
sudo bpftrace -c './worker 50' -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @[ustack] = count(); }'
```

Kullanıcı yığınları, yalnızca program ve kütüphaneleri çerçeve işaretçilerini veya bpftrace'in kullanabileceği diğer gevşeme desteğini tuttuğunda güvenilirdir. Bir veya iki kareden sonra duran veya ham onaltılık adresleri gösteren bir yığın, kısa bir çağrı yolu değil, bir yapı veya sembol sorunudur. `-fno-omit-frame-pointer` ve takip ederken çalıştırılabilir dosyayı yerinde tutun. `ustack(perf)` alev grafik betikleri tarafından beklenen formattaki yığınları yazdırır; `ustack(5)` derinliğini sınırlar.

## 9. Tek katlı yemek kitabı

Her satır bir yeni başlayan soruya cevap verir. `1234`'yi gerçek bir PID ile değiştirin veya `-c` kullanın.

```bash
# Which processes make the most system calls?
sudo bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }'

# Which system calls does PID 1234 make?
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_* /pid == 1234/ { @[probe] = count(); }'

# Which files are being opened, by whom?
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%-16s %s\n", comm, str(args.filename)); }'

# Which opens fail, and with which error number?
sudo bpftrace -e 'tracepoint:syscalls:sys_exit_openat /args.ret < 0/ { @errors[comm, -args.ret] = count(); }'

# Distribution of successful read sizes for PID 1234
sudo bpftrace -e 'tracepoint:syscalls:sys_exit_read /pid == 1234 && args.ret > 0/ { @bytes = hist(args.ret); }'

# How often is a function in my program called?
sudo bpftrace -e 'uprobe:/path/to/prog:process_item { @calls = count(); }'

# What does it return?
sudo bpftrace -e 'uretprobe:/path/to/prog:process_item { @ret = lhist(retval, 0, 10, 1); }'

# Where does PID 1234 spend CPU time? (sampled user stacks, 99 Hz)
sudo bpftrace -e 'profile:hz:99 /pid == 1234/ { @[ustack] = count(); }'

# Print a per-second rate instead of a total
sudo bpftrace -e 'tracepoint:raw_syscalls:sys_enter /pid == 1234/ { @n = count(); } interval:s:1 { print(@n); clear(@n); }'
```

Sistem çağrı çıkış iz noktalarından gelen negatif dönüş değerleri, reddedilmiş hata numaralarıdır: `-2`, `ENOENT` (böyle bir dosya yok), `-13` `EACCES` (izin reddedildi). `errno -l` (`moreutils` paketinden) veya `/usr/include/asm-generic/errno-base.h` ile bunları araştırın.

`sys_enter_*` joker kartı yüzlerce sondayı ekler; başlatma daha yavaştır ve baş üstü tek bir iz noktasından daha yüksektir. Uzun süredir çalışan bir monitör değil, iyi bir keşif aracıdır.

## 10. Güvenlik ve havai

- bpftrace programları, güvenli olmayan bellek erişimini ve sınırsız döngüleri reddeden çekirdek doğrulayıcı tarafından kontrol edilir. Bu, çekirdek'i korur, zamanlama sonuçlarınızı değil.
- Her sonda isabet süresi. Saniyede milyonlarca kez denilen bir işlevin araştırılması programı önemli ölçüde yavaşlatabilir. Sayımlarla başlayın, olay oranını kontrol edin, ardından zaman damgası veya yığın ekleyin.
- `printf` her olay için bir tampon aracılığıyla veri gönderir; tüketici geride kalırsa, bpftrace `Lost N events` bildirir. Oran yüksek olduğunda yazdırmak yerine haritalarla bir araya gelin.
- x86-64 üzerindeki uprobes, takip edilen koda bir kesme noktası talimatı yerleştirir; program prensip olarak bunu algılayabilir. [Gözlemin programa etkisi ve analiz karşıtı davranışlar](analiz-aracinin-etkisi.md).
- Komutları çalıştıran `system()` gibi işlevler `--unsafe` gerektirir. Paylaşılan ortamlarda kullanmayın.
- İzleme bir makineyi dondurduysa, daha fazla denemeden önce [İzleme hatalarını ve sistem donmalarını inceleme](izleme-donmalari.md)'yi okuyun.

## 11. Yaygın hatalar ve ne anlama geldikleri

| Mesaj (şekil) | Olası sebep | Ne denemek için |
| --- | --- | --- |
| `ERROR: … permission denied` / `Operation not permitted` | eksik kök veya BPF yetenekleri veya kilitli çekirdek | `sudo` ile çalıştır; `bpftrace --info`'yi kontrol edin; Konteynerler ekstra ayrıcalıklara ihtiyaç duyar |
| `ERROR: Could not resolve symbol` | işlev adı ikilinin sembol tablosunda değil (inlined, `static` ve soyulmuş, C++ mangled) | `nm -an ./prog \| grep name`; `-g` ve `noinline` ile inşa edin; mangled adını veya `extern "C"`'yi kullanın |
| `No probes to attach` / `does not exist` | yanlış prob adı, veya bu çekirdekte iz noktası eksik | `bpftrace -l` ile listele |
| `Can not access field` / bilinmeyen alan | alan adı bu çekirdek veya sürümde farklılık gösterir | `bpftrace -lv` ile kontrol edin; `args.`'ye karşı `args->`'yi kontrol edin |
| `Lost N events` | çıkış tampon taşması | haritalarda toplu; `printf` azaltmak |
| `0x…` adresleri veya `[unknown]` yığınları | eksik semboller, çerçeve işaretçileri veya ikili değişti | `-g -fno-omit-frame-pointer` ile yeniden inşa edin; aynı dosyayı yerinde tutun |

Notlarınıza tam mesajı kaydedin. Bir ek hatası, ölçümün gerçekleşmediği anlamına gelir; sıfırı bildirmeyin.

## Bir sonraki nereye

[bpftrace ile ilk adımlar](../laboratuvarlar/bpftrace-ilk-adimlar.md) 'deki her bölümü uygulayın. Daha sonra bu tek satırlıları gerçek semptomlara uygulamak için [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](debug-is-akisi.md)'yi ve [İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme](../laboratuvarlar/fonksiyon-problari.md)'yi uygulama tarafı kaydıyla giriş / dönüş eşleştirmesini doğrulamak için kullanın.

## Kaynaklar

- [bpftrace kılavuzu (adoc)](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [bpftrace tek satırlık öğretici](https://github.com/bpftrace/bpftrace/blob/master/docs/tutorial_one_liners.md)
- [bpftrace 0.21 belgelendirme](https://bpftrace.org/docs/0.21)
- [bpftrace changelog](https://github.com/bpftrace/bpftrace/blob/master/CHANGELOG.md)
- [Brendan Gregg: BPF Performans Araçları (kitap)](https://www.brendangregg.com/bpf-performance-tools-book.html)
- [Linux çekirdek: olay izleme](https://docs.kernel.org/trace/events.html)
