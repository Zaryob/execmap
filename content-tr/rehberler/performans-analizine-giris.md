---
title: Çalışma zamanı performans analizine giriş
description: Temel kavramları, ölçüm yöntemini, araç seçimini ve perf ile bpftrace kurulumunu öğrenin.
---

# Çalışma zamanı performans analizine giriş

Bu kılavuz, bir programı profillememiş veya izlememiş okuyucular için başlangıç noktasıdır. Kelime dağarcığını, tekrarlanabilir bir yöntemi, her bir aracın rolünü ve `perf` ve `bpftrace` için bir Linux makinesinin nasıl hazırlanacağını açıklar. Daha önce hiçbir çekirdek veya performans bilgisi varsayılmaz; bir C programını derlemek ve bir terminalde komutları çalıştırmak için rahat olmalısınız.

Sonunda bir performans sorusunu tam olarak belirtebilmeli, ilk temel çizgiyi atabilmeli, bir programın * çalışıyor * veya * bekliyor * olup olmadığına karar vermeli ve tahmin etmek yerine bir sonraki aracı seçmelisiniz.

## 1. Performans analizinin cevapladığı sorular

"Program yavaş" bir histir, bir ölçüm değil. Bir aracın cevaplayabileceği bir soruya dönüştürün:

- **Bir işlem ne kadar sürer?** Bu * gecikmedir*: bir başlangıç olayından bir bitiş olayına, örneğin bir istek veya bir işlev çağrısına kadar olan süre.
- **Saniyede kaç işlem biter?** Bu * aracılığıyla *.
- **Bir kaynak ne kadar meşgul?** Bu *kullanımdır*: bir CPU, disk veya kilidin kullanımda olduğu zamanın kesiridir.
- **İş bir kaynak için kuyruk mu yapıyor?** Bu *doygunluk*: CPU için çalışan iş parçacıkları, bir cihaz için bekleyen I/O, bir dilsiz için bekleyen iş parçacıkları.
- ** İşlemler başarısız mı?** Başarısız `open()` gibi hatalar bir programı yeniden deneyebilir, bekleyebilir veya daha yavaş bir yol alabilir.

İki zaman ölçümü her yerde görünür ve karıştırılmamalıdır:

| Ölçüm | Anlamı | Tipik kaynak |
| --- | --- | --- |
| Duvar saati (geçmiş) zamanı | Gerçek zaman iki an arasında geçti | `time`'s `real`, `clock_gettime(CLOCK_MONOTONIC)` |
| CPU zamanı | Bir CPU'nun bu işlemi veya iş parçacığını yürütmeyi gerçekten harcadığı zaman | `time`'s `user` + `sys`, `/proc/<pid>/stat` |

Eğer geçen süre CPU zamanından çok daha büyükse, program ömrünün çoğunu **off-CPU **geçirdi: uyku, I/O'yu beklemek, kilit beklemek veya çalıştırılabilir ancak programlanmamış. CPU süresi geçen zamana yakınsa (işlek iş parçacığını başına), program**on-CPU** ve soru olur *hangi kod* CPU'yu kullanır. Bu tek karşılaştırma, ihtiyaç duyduğunuz araç kutusunun hangi yarısına karar verir.

## 2. Çalışan bir programı gözlemlemenin üç yolu

Bu sitedeki her araç üç teknikten birini kullanır. Bir aracın hangisini kullandığını bilmek, neyi görebildiğini ve göremediğini söyler.

- **Counting** bir toplam tutar ve daha sonra bildirir. `perf stat`, komutlar, döngüler, bağlam anahtarları ve sayfa hataları gibi olayları sayar. Saymak ucuzdur, ancak * kaç *, nerede * değil * yazar.
- ** Örnekleme** periyodik olarak programı keser ve nerede olduğunu kaydeder, örneğin 99 saniyede iki kez. `perf record` ve bpftrace'in `profile` sonda örneği. Örnekler, CPU zamanının istatistiksel olarak gittiği * gösterir, ancak kısa veya nadir bir işlev tamamen kaçırılabilir ve örnekleme bir iş parçacığı uyurken hiçbir şey görmez.
- **Tracing**, her `openat` sistemi çağrısı veya bir fonksiyona her giriş gibi belirli bir olayın her bir oluşumunu kaydeder. `bpftrace`, `perf trace` ve `strace` izi. İzleme seçilen olaylar için kesindir, ancak her olay zaman maliyeti; Çok sık bir olayın izlenmesi programı fark edilebilir bir şekilde yavaşlatabilir.

Gözlem maliyeti **overhead**veya**observer etkisi** olarak adlandırılır. Deneyin bir parçası olarak kaydedin: Geçen zamanı araçla ve araç olmadan karşılaştırın. [Gözlemin programa etkisi ve analiz karşıtı davranışlar](analiz-aracinin-etkisi.md) bunu derinlemesine ele alır.

## 3. Bir yöntem: belirtiden kanıta

Her soruşturma için aynı döngüyü kullanın. En yaygın hatayı önler: doğrulanmamış bir tahmine dayanarak kodu değiştirmek.

1. **Sorun**'u bir cümlede bir sayıyla tanımlayın: "`./report`, 200 işleri için 3 s alır; geçen hafta 0.1 s aldı."
2. ** Çevreyi kaydet**: çekirdek (`uname -r`), CPU modeli, derleyici ve bayraklar, araç sürümleri ve tam komut satırı. Bu bağlam olmadan sonuçlar karşılaştırılamaz.
3. **Başlangıcı al**: programı birkaç kez çalıştır ve yayılımı not et. Tekrarlanan çalıştırmalar zaten 10'ye göre değişirse 5% 'lik bir değişiklik anlamsızdır.
4. **CPU veya CPU dışı karar ver **: CPU zamanı ile geçen zamanı karşılaştırın (bölüm 6).
5.  4 bölümündeki tablodan seçilen tek bir araçla aşağı doğru sürün.
6. Henüz ölçmediğiniz bir şeyi öngören bir hipotez oluşturun: "Eğer arama dörtlü ise, girdiyi iki katına çıkarmak kabaca dört kat arama süresi olmalıdır."
7. **İkinci, bağımsız bir gözlemle tahmini** test edin. Ardından kodu değiştirin ve aynı koşullar altında tekrar ölçün.

Sistem kaynakları için tamamlayıcı bir kontrol listesi Brendan Gregg'in **USE yöntemi **: her kaynak için **U**tilization, **S **ature, ve **E **rrors kontrol edin. Hangi kaynağın dahil olduğunu henüz bilmiyorsanız yararlıdır.

## 4. Hangi araç hangi soruyu yanıtlıyor?

| Soru | İlk araç | Sonraki adım |
| --- | --- | --- |
| Ne kadar sürdü ve meşgul müydü? | `/usr/bin/time -v ./prog` | `real` ile `user` + `sys` karşılaştırması |
| Hangi iş parçacıkları meşgul veya değişiyor? | `pidstat -t -u -w 1 -p <pid>` (sysstat) | [Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu](process-thread-ve-zamanlayici.md) |
| Kaç tane komut, döngü, hata ve anahtar var? | `perf stat ./prog` | [perf ile yürütme analizi ve donanım izleme](perf-ile-yurutme.md) |
| Hangi işlevler CPU tüketir? | `perf record -g ./prog`, `perf report` | alev grafiği, `perf annotate` |
| Hangi sistem çağrıları gerçekleşir ve hangi başarısız olur? | `bpftrace` syscall tek satırlı, `perf trace -s` | [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](bpftrace-temelleri.md) |
| Bir işlev veya syscall ne kadar sürer? | histogram ile bpftrace giriş/dönüş probları | [İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme](../laboratuvarlar/fonksiyon-problari.md) |
| Neden bir iş parçacığı çalışmıyor? | `sched_switch` ile CPU dışı analiz | [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](zamanlayici-izleri.md) |
| Program şu anda *Donmuş* ne yapıyor? | `gdb -p <pid>` ile `thread apply all bt` | [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](debug-is-akisi.md) |

`strace` ve GDB, her olay için hedefi durduran `ptrace`'yi kullanır; bunlar doğru sorular için mükemmeldir ve zamanlama soruları için maliyetlidir. `perf` ve `bpftrace`, her olay için süreci durdurmadan çekirdek içinde veri toplar, bu da genellikle zamanı ölçmek için daha uygun hale getirir.

## 5. Bir Linux makinesi hazırlamak

Laboratuvarlar, yerel bir Linux makinesi veya kontrol ettiğiniz sanal bir makine varsayar. Konteynerler ve bazı bulut sanal makineleri donanım sayaçlarını veya blok izlemeyi gizler; araçlar daha sonra `<not supported>` veya izin hataları bildirir. Bunları asla sıfır olarak değil, * kullanılabilir olmayan ölçümler* olarak ele alın.

### Araçları kur

```bash
# Debian
sudo apt install linux-perf bpftrace sysstat gdb build-essential

# Ubuntu (perf comes from the kernel-specific linux-tools package)
sudo apt install linux-tools-common "linux-tools-$(uname -r)" bpftrace sysstat gdb build-essential

# Fedora / RHEL family
sudo dnf install perf bpftrace sysstat gdb gcc
```

Paket adları sürümler arasında değişir; Bir tanesi eksikse dağıtımınızın paket dizinini arayın. Ubuntu'nun `perf`'si çalışan çekirdekle eşleşmelidir, bu nedenle paket adı `$(uname -r)` içerir.

### Önce sürümleri kaydet

```bash
uname -r
perf --version
bpftrace --version
sudo bpftrace --info 2>&1 | head -n 40
lscpu | head -n 20
```

`bpftrace --info`, BTF ve uprobe desteği gibi çekirdek özelliklerini listeler. Bu çıktıyı sonuçlarınızın yanına kaydedin.

### İzinler

ayrıcalıklı olmayan kullanıcılar için perf erişimi `/proc/sys/kernel/perf_event_paranoid` tarafından kontrol edilir; daha yüksek değerler daha az izin verir. bpftrace kök veya BPF yeteneklerine ihtiyaç duyar (`CAP_BPF`, `CAP_PERFMON` ve bazı sondalar için `CAP_SYS_ADMIN`). Nasıl çalışacağına karar vermeden önce değerleri okuyun:

```bash
cat /proc/sys/kernel/perf_event_paranoid
cat /proc/sys/kernel/kptr_restrict
```

Tek kullanımlık bir laboratuvar makinesinde en basit yaklaşım, ölçüm aracını `sudo` ile çalıştırmaktır. `perf_event_paranoid` sistem çapında düşürmek, her kullanıcı için güvenlik politikasını değiştirir; paylaşılan veya üretim makinesinde yapmayın. [Linux perf güvenlik belgesi](https://docs.kernel.org/admin-guide/perf-security.html) her seviyeyi açıklar. Çekirdek sembolleri `[unknown]` veya sıfır adres olarak görünürse, `kptr_restrict` veya eksik ayrıcalıklar her zamanki gibidir.

### Araçların açıklayabilmesi için programlar oluşturun

Profilerler adresleri rapor eder; adresleri işlev adlarına ve yığınlara dönüştürmek, yapıdan yardıma ihtiyaç duyar:

- `-g` hata ayıklama bilgilerini (DWARF) tutar, böylece araçlar işlevleri, kaynak satırlarını ve satır içi kodu adlandırabilir.
- `-fno-omit-frame-pointer`, kullanıcı yığınlarını yürümek için `perf` ve bpftrace için en ucuz ve en güvenilir yol olan çerçeve işaretçi zincirini tutar.
- `-O2`, yapıyı gerçekçi tutar. `-O0` yapı ölçüleri kodu oluşturmak, göndermeyeceğiniz. [Derleyici ve optimizasyon düzeyi farklarını inceleme](../laboratuvarlar/derleme-farklari.md) kodun ne kadar değiştiğini gösterir.
- `__attribute__((noinline))` veya `static` olmayan bir işlev, bir uprobe'un bağlayabileceği ayrı bir sembol tutar. Laboratuvarlar bunu bilerek kullanır; Gerçek programlar küçük işlevleri sıralayabilir, sondaya giriş yapamaz.

Sistem kütüphaneleri çerçeve işaretçileri veya yerel hata ayıklama bilgilerinden yoksun olabilir. Birçok dağıtım ayrı hata ayıklama paketleri veya bir `debuginfod` sunucusu sağlar; araçların onları nasıl bulduğuna dair [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](../laboratuvarlar/debug-bilgisi.md) bölümüne bakın.

## 6. Yavaş bir programla ilk altmış saniyeniz

Programı `time` altında bir kez, tercihen GNU zamanı `-v` ile ekstra sayaçlar için çalıştırın:

```bash
/usr/bin/time -v ./prog 2> time.txt
grep -E 'Elapsed|User time|System time|Percent of CPU|context switches|page faults' time.txt
```

Sonuç şu sırayla okundu:

1. **Elapsed**karşı**User + System**. Tek iş parçacığı program için kabaca eşittir: on-CPU, `perf record` ile devam edin. Çok daha küçük: off-CPU, sistem çağrıları, kilitler ve zamanlayıcı etkinlikleri ile devam edin.
2. **Sistem zamanı**. Yüksek sistem süresi, CPU'nun programın adına çekirdek'de meşgul olduğu anlamına gelir: birçok sistem çağrısı, sayfa hataları veya veri kopyalama.
3. **Gönüllü bağlam anahtarları** bir iş parçacığının CPU'dan vazgeçme sürelerini sayar çünkü beklemek zorunda kalır (uyku, I/O, kilit). **İstemsiz** anahtarlar, programlayıcının CPU'yu uzaklaştırdığı süreyi sayar, bu da CPU rekabetini önerir.
4. **Sayfa hataları**. Birçok *major* hatası bellek erişimlerini karşılamak için diskten veri okunduğu anlamına gelir.

`perf stat`, donanım sayaçlarıyla benzer bir ilk bakış sunar ve çalışan bir işlem üzerinde de çalışır:

```bash
perf stat ./prog
sudo perf stat -p <pid> -- sleep 10      # attach to a running process for 10 s
```

`task-clock`'nin yanında "CPU'lar kullanıldı" ile 1.0, bir CPU'nun tüm çalışma için meşgul olduğu anlamına gelir; 0.05'nin yakınında, programın çoğunlukla beklediği anlamına gelir. [perf ile CPU profili ve alev grafiği](../laboratuvarlar/cpu-profili.md) kalan alanlardan geçer.

## 7. Yaygın başlangıç hataları

- **Bir kez dosyalama.** Tekrarlama çalışır ve yayılımı bildirir. `perf stat -r 5` bir komutu tekrarlar ve varyasyonu yazdırır.
- **Yanlış yapıyı sağlamak.** Optimizasyon olmadan hata ayıklama yapıları farklı sıcak noktalara sahiptir.
- **Bekleme programı için CPU profili okumak.** Örnekleme profili yapan bir kişi, iş parçacıkları uyurken hiçbir şey görmez. Program çoğunlukla CPU dışındaysa, CPU profili yavaşlığı değil, küçük yoğun kısmı tanımlar.
- **`[unknown]` çerçevelerine güvenmek.** Eksik semboller veya kırık yığınlar, optimize edilecek bir işlev değil, düzeltilmesi gereken bir ölçüm problemidir.
- ** "Olmamış" olarak "olmamış"ı ele geçirmek.** Bir sonda geç eklenmiş olabilir, olaylar düşmüş olabilir veya örnekleme bunu kaçırmış olabilir. Gönderdiğiniz istek sayısı gibi bildiğiniz bir şeye karşı sayımları kontrol edin.
- **Bir kerede birkaç şeyi değiştirmek.** Bir değişkeni değiştirin, tekrar ölçün, eski sonucu koruyun.

## Bir sonraki nereye

Sırayla çalışma zamanı rotasını takip edin; her sayfa bir öncekinden gelen kelime dağarcığını yeniden kullanır:

1. [Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu](process-thread-ve-zamanlayici.md): bir PID ve TID'nin ne olduğu ve çekirdeğin tuttuğuna karşı çıkan.
2. [perf ile yürütme analizi ve donanım izleme](perf-ile-yurutme.md) ile execution analizi, daha sonra eller [perf ile CPU profili ve alev grafiği](../laboratuvarlar/cpu-profili.md).
3. [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](bpftrace-temelleri.md), sonra [bpftrace ile ilk adımlar](../laboratuvarlar/bpftrace-ilk-adimlar.md).
4. [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](debug-is-akisi.md), sonra [Az CPU kullanan yavaş bir programı teşhis etme](../laboratuvarlar/yavas-program-teshisi.md).
5. Daha derin zamanlama malzemesi: [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](calisma-zamani-gecikmesi.md), [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](../laboratuvarlar/zamanlama-ve-bekleme.md), ve [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](zamanlayici-izleri.md).

## Kaynaklar

- [Brendan Gregg: KULLANIM Yöntemi](https://www.brendangregg.com/usemethod.html)
- [Brendan Gregg: Linux Performansı](https://www.brendangregg.com/linuxperf.html)
- [perf-stat(1) manuel](https://man7.org/linux/man-pages/man1/perf-stat.1.html)
- [zaman(1) manuel](https://man7.org/linux/man-pages/man1/time.1.html)
- [pidstat(1) manuel](https://man7.org/linux/man-pages/man1/pidstat.1.html)
- [Linux çekirdek: perf olaylar ve araç güvenliği](https://docs.kernel.org/admin-guide/perf-security.html)
- [bpftrace kurulum notları](https://github.com/bpftrace/bpftrace/blob/master/INSTALL.md)
