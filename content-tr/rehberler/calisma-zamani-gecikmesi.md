---
title: Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma
description: Çağrılar arası süreyi, işlemci üzerinde ve dışında geçen zamanı ve çalışmaya hazır beklemeyi karşılaştırın.
---

# Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma

İki işlev girişi arasındaki alışılmadık uzun aralık, iki çağrının da bu kadar uzun süre çalıştığını göstermez. Bir kimlik ve bir ölçüm sınırıyla başlayın: sayıyı tanımlayan hangi koşu, iş parçacığı, çağrı, saat ve çift olay?

[zamanlama laboratuvarı](../laboratuvarlar/zamanlama-ve-bekleme.md), `run_cycle` ve `perform_work` genel işlevleri ile bağımsız bir C++11 iş yükü sağlar. Bir üretim uygulamasına bağlı olmadan uyku ve yoğun çalışmayı karşılaştırır. Aşağıdaki isteğe bağlı araçlardan önce temel çizgisini çalıştırın; Tüm komutlar için laboratuvar dizini kullanın ve her bir aracın yakalamasını ayrı tutun.

[Sürekli ve iş parçacığı durumu](process-thread-ve-zamanlayici.md) PID/TID, çalışmaya hazır bekleme veya zamanlayıcı sayaçları tanıdık değilse başlayın. Bir yukarı akış boşluğunu bir araya gelen bir çağrıcının içinde beklemekten ayırt etmek için [altı noktalı olay korelasyonu](../laboratuvarlar/olay-akisini-eslestirme.md) deneyini genişletin, sıralı bir iş parçacığı teslimi de dahil olmak üzere. [C++ GDB kılavuzu](cpp-cagri-zinciri.md), aynı genel iş yükü üzerinde üye çağrılarını ve nesne durumunu kontrol eder.

Tam bir uzaktan kurulum için [Uzaktan GDB ve IDE yapılandırmasını kullanın](gdb-uzak-hedef.md). Temelden sonra, komutla devam edin [İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme](../laboratuvarlar/fonksiyon-problari.md) ve [Zamanlayıcı çizelgesini durum geçişlerinden okuma](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md). [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](zamanlayici-izleri.md) ham geçişleri ve analizör sürümlerini kapsar; [İzleme hatalarını ve sistem donmalarını inceleme](izleme-donmalari.md) İyileşme ve izolasyonu genişletir.

## 1. Teşhis etmeden önce aralığı tanımla

Giriş aralığı, belirtilen bir kapsam içinde birbirini izleyen iki girişi karşılaştırır. Geçen süre, bir çağrı için giriş ve çıkışı karşılaştırır. Thread CPU zamanlaması, hizmeti aslında iş parçacığı tarafından tüketilen ölçür. CPU dışı zaman, uyku ve potansiyel olarak çalışmaya hazır bekleme dahil olmak üzere bir geçiş ve aşağıdaki geçiş süresini kapsar. Zamanlayıcı gecikmesi, çalışmadan önce harcanan kısmı ilgilendirir. Arayan-kallee geçişi, arayanın arama öncesi işaretleyicisini ve eşleşen kişiyi kullanır.

Her 100 ms olarak adlandırılan ve 20 ms için aktif olan varsayımsal bir işçi için, bu ilk iki miktar tasarıma göre farklılık gösterebilir. Bir 300 ms giriş boşluğu, arayan işi, kasıtlı bir bekleyiş, kaçırılan zamanlama fırsatlarını veya eksik gözlemleri içerebilir. Arayan kişinin içindeki gecikmeyi bulmak yetersizdir.

Nanosaniyeleri hesaplama farklılıklarına kadar tamsayı olarak tutun. Bir gösterimi `0 ms` tamsayı bölünmesinden sonra yüzlerce mikrosaniye gizlenebilir. Birimler doğruluk sözü vermez. `steady_clock` Geçilen aralıklar için uygundur; `system_clock` takvim korelasyonuna hizmet eder. C++ sabit saat döneminin Linux'a eşit olduğunu vaat etmez `CLOCK_MONOTONIC`. Çapraz kaynak hizalaması, doğrulanmış bir saat ilişkisi ve korelasyon belirteçlerine ihtiyaç duyar. BPF örnekleri açıkça kullanır `nsecs(monotonic)`; bpftrace'de 0.21 niteliksiz varsayılan `boot`, askıya alma süresini içerir.

Laboratuvar senkronize ve tekrarlayıcı değildir. `AFTER_CALL`, çalışanın dönüşünü takip eder. Kuyruklara uyarlanırsa, tamamlamayı göndermek alıcının tamamlanması anlamına gelmez: ileti aracılığıyla bir dizi kimliği çoğaltın. TID-sadece eşleştirme, yuvalanmış çağrıları veya birden fazla uçuş içi isteği ayırt edemez.

## 2. Kimlik ve çağrı ilişkileri için GDB kullanın

Çağrı zincirini kurmak için laboratuvarda gösterildiği gibi hata ayıklayıcıyı başlatın. Halihazırda çalışan bir laboratuvar sürecine bağlanmak için yeni bir çalışma başlatın:

```bash
./build/timing_lab sleep 200 100 results/attach.csv &
LAB_PID=$!
gdb ./build/timing_lab -p "$LAB_PID"
```

GDB'nin içinde `info threads`, `thread apply all bt` ve `info registers` kullanılır. GDB'nin iş parçacığı numarası Linux LWP/TID'den farklıdır. Attach hedefi durdurur; `detach` onu serbest bırakır ve yürütmeye devam eder. Bu çalışmayı zamanlama çizgisi yerine hata ayıklayıcı kanıtı olarak koruyun.

Uzak ataş için, yerel bir çalıştırılabilir dosya kullanın ve tam hedef oluşturmadan verileri ayıklayın. Aşağıdaki yolları, ana bilgisayarı ve PID'yi değiştirin:

```text gdb
file /local/exact-build/timing_lab
target remote | ssh -T HOST gdbserver --attach - PID
set substitute-path /original/source /local/source
info sources
bt
detach
```

Çizgileri yorumlamadan önce kaynak çözünürlüğünü ve ikili kimliği doğrulayın. yazmaç isimleri hedef mimariye bağlıdır; sağlam olmayan bir çerçevedeki şaşırtıcı değerler yığın yolsuzluğu oluşturmaz. [ilk GDB soruşturmasına devam edin](../laboratuvarlar/gdb-ilk-inceleme.md) x86-64 komut seviyesi argümanı ve bellek kontrolleri için.

## 3. Geri dönüş süreleri ile uprobe giriş aralıklarını karşılaştırın

Bu indirilebilir betikler, bpftrace 0.21 sözdizimi hedeflemektedir. `bpftrace --version` ve `sudo bpftrace --info` kaydedin; yerel izleme noktası alanlarını doğrulayın. Eksik özellikler veya reddedilen atak kullanılamaz ölçülerdir.

```bash
LAB_BIN=$(realpath build/timing_lab)
nm "$LAB_BIN" | grep -E ' (perform_work|run_cycle)$'
sudo bpftrace -l "uprobe:$LAB_BIN:perform_work"
sudo bpftrace -lv 'tracepoint:sched:sched_switch'
```

Prob dosyasını gerçek yerine koyma ile oluşturun, ardından yeni bir işlem izleyin. Python değiştirme, yol karakterlerini sed değiştirme sözdizimi olarak yorumlamaktan kaçınır:

```bash
python3 - <<'PY'
from pathlib import Path
binary = str(Path('build/timing_lab').resolve())
if any(character.isspace() or character in ':*?[]' for character in binary):
    raise SystemExit('Use a lab directory without whitespace or probe-pattern characters')
Path('results/functions.bt').write_text(
    Path('functions.bt.in').read_text().replace('@BINARY@', binary))
PY
./build/timing_lab sleep 100 100 results/uprobe.csv &
LAB_PID=$!
sudo bpftrace results/functions.bt "$LAB_PID"
```

İş yükü sona erdiğinde Ctrl-C ile bpftrace'i durdurun, ardından `wait "$LAB_PID"`. Komut dosyası, işlem kimliği ile filtreler ve her bir olayı yazdırmak yerine nanosaniye histogramlarını toplar. Amaçlanan modlar 100 ms yakın bir giriş aralığı ve 20 ms yakın bir süreyi göstermeli, ortama bağlı olmayan değişikliklerle birlikte; Aramadan önce.

Işlev tekrarlayıcı olmadığı için tek bir `@start[tid]` burada geçerlidir. Tekrarlama üzerine yazar; istisnalar, eksik olaylar ve olağandışı kontrol aktarımları dönüş eşleşmesini bozabilir. Düzensiz bir laboratuvar sembolü ayrıca C++ demangling sorununu önler: diğer uygulamalarda `nm -C` okunabilir bir etiket sağlarken, `nm` kabul edilen iz ile gerçek bağlantı adını gösterir.

## 4. Zamanlayıcı görev kimlikleri ile CPU dışı zamanı ölçün

Bu yakalama için ayrı bir işlem kullanın:

```bash
./build/timing_lab sleep 100 100 results/offcpu.csv &
LAB_PID=$!
sudo bpftrace offcpu.bt "$LAB_PID"
```

İş yükü bittiğinde izleyiciyi durdurun ve çocuğu bekleyin. Bu tek iş parçacığı iş yükü, PID'ye eşit TID'ye sahiptir. Çok iş parçacığılı bir hedef, gerçek hedef TID gerektirir: `sched_switch` alanları `prev_pid` ve `next_pid` zamanlayıcı görevlerini tanımlar. Sondayı çalıştıran işlem bağlamına göre filtreleme, anahtarın bir tarafını kaçırabilir.

Histogram, işçinin uykusunu ve periyodu beklemesini içerir. Bu bir rün-gecikme histogramı değildir. Sınırları yakalamak, ölçülmemiş bir başlangıç veya son kısmi aralık bırakır. TID yeniden kullanımı, eksik olaylar ve izleme maliyet sınırı yorumu. Uyandırma-anahtarlama-çık-çıkış sonda çifti tek başına, önyüklemeden sonra çalıştırılabilir beklemeleri de kaçırır; tam zamanlayıcı muhasebesinin daha fazla duruma ihtiyacı vardır.

## 5. Sayaçlar, örnekler ve zamanlayıcı bağlamı için perf kullanın

İlk olarak iki taze çalışmadaki yazılım sayaçlarını karşılaştırın:

```bash
perf stat -e task-clock,context-switches,cpu-migrations,page-faults -- ./build/timing_lab sleep 20 50 results/perf-sleep.csv
perf stat -e task-clock,context-switches,cpu-migrations,page-faults -- ./build/timing_lab busy 20 50 results/perf-busy.csv
```

`task-clock`, CPU hizmetini ilgilendiren, geçen komut süresi değil. Meşgul çalışma genellikle daha fazla CPU tüketmelidir. Sıfır göçleri afinitenin yapılandırıldığını belirlemez. `perf --version`, `perf list` ve izin başarısızlıklarını kaydedin. Bu deney PMU donanım sayaçları gerektirmez.

İsteğe bağlı örnekleme yakalama, taze yoğun bir çalışma kullanır:

```bash
perf record -F 49 -e cpu-clock -o results/cpu.data -- ./build/timing_lab busy 40 100 results/cpu.csv
perf report -i results/cpu.data --stdio
```

Örnekler, CPU tüketimini `perform_work`'ye veya aradığı saat işlevlerine bağlayabilir. Tüm çağrıları saymazlar. Çağrı grafikleri maliyet ekler ve ayrı bir değişkendir; gevşeme ve Intel PT için [perf kılavuzu](perf-ile-yurutme.md)'ye bakın.

Olay erişimi olan kararlı bir Linux laboratuvar sunucusunda zamanlama kanıtı için:

```bash
sudo perf sched record -a -o results/sched.data -- ./build/timing_lab sleep 40 100 results/sched.csv
sudo perf sched latency -i results/sched.data
sudo perf sched timehist -i results/sched.data
sudo perf sched map -i results/sched.data
```

Gerçek baskılı TID ile `perf sched timehist -i results/sched.data --tid TID` kullanın. Yakalama sistem çapındadır; raporlama daha sonra filtrelenir. İşlem filtreli bir `sched_switch` yakalama, başka bir görevin bağlamında meydana gelen hedef geçişleri atlayabilir.

`timehist`'de bekleme süresi geçişe geçiş, zamanlama gecikmesi çalışma süresi ve çalışma süresi CPU yürütmesini tanımlar. Bir uyku görevi büyük bekleme süresi ve küçük zamanlama gecikmesine sahip olabilir. Açlık için aşırı maksimum atamadan önce ilgili TID ve aralığı inceleyin. Yakalama uyarılarını ve kayıp olay sayımlarını koruyun; Uyandırma ve yakalama kenarları eksik aralık yeniden yapılandırmasını geçersiz kılabilir.

### Soruya ihtiyaç duyduğunda kısa bir syscall görünümü ekleyin

Strace ile bir Linux laboratuvar sunucusunda, ayrı bir sonlu çalıştırma başlat:

```bash
strace -f -ttt -T -e trace=clock_nanosleep,nanosleep,futex,read,write -o results/syscalls.txt -- ./build/timing_lab sleep 10 100 results/syscall-run.csv
less results/syscalls.txt
```

`-f` çocuk/gerilim yürütmesini takip eder, `-o` uygulama çıktısından izini ayırır ve `-e trace=` syscall setini kısıtlar. `-ttt` Unix-epoch zaman damgalarını basar; `-T`, bu syscall'ın gözlemlenen giriş/geri dönüş değerlerini doğrudan yazdırır. Ne iş parçacığı CPU hizmetidir. Bu nedenle izleme perturbs yürütmeden ayrı çalışır.

Süreyi yorumlamadan önce gerçek uyku syscall ve argümanlarını / geri dönüş değerini inceleyin. Bir kullanıcı alanı sessiz veya kuyruk, bir fütex syscall olmadan çalışabilir; bir fütex satırının yokluğu, hiçbir C++ senkronizasyonunun olmadığını kanıtlamaz. ltrace'den gelen bir libc çağrı görünümü, syscalls'tan farklı sınırlara ve kapsama alanına sahiptir ve işlem içi kuyruk derinliğini kuramaz. [strace kılavuzu](https://man7.org/linux/man-pages/man1/strace.1.html) Bu izleme ve zaman damgası seçeneklerini tanımlar.

## 6. Değiştirmeden önce sistem bağlamını kaydedin

Ayrı bir uzun laboratuvar çalışması sırasında `ps -L -p "$LAB_PID" -o pid,tid,psr,cls,rtprio,pri,ni,stat,comm`, `chrt -p "$LAB_PID"` ve `taskset -pc "$LAB_PID"` kullanın. `PSR`, bir afinite vaadi değil, gözlemlenen bir CPU'dur. Gösterilen bir `PRI` değeri sayısal gerçek zamanlı öncelik değildir.

`/proc/pressure/cpu`, `/proc/pressure/io`, `/proc/pressure/memory` ve `vmstat 1 5`'yi aynı gözlem penceresinden okuyun. PSI, CPU kullanımı değil, çekişme ile ilgili durakları tanımlar. Yüksek agrega boşta kalma süresi, sınırlı bir CPU seti veya cgroup içindeki çekişmeyi dışlamaz.

Affinity, uygun CPU'ları rezerve etmeden sınırlar. Hedefin tahsisinde CPU 0 olduğunu varsaymak yerine izin verilen kümeden birini seçin. Bir afinite deneyi için, orijinal seti kaydedin ve izin verilen bir CPU kullanarak `taskset -c` ile taze, sonlu bir işlem başlatın. Gerçek zamanlı politikalar ve frekans ayarları, her biri kendi laboratuvarını gerektiren ek değişkenlerdir. Bu son tarih garantilerini kanıtlamaz. Vali etiketleri sürücüye bağlı değildir; ve kayıt politikası

## 7. Ayrı uygulama gecikmesi izleme istikrarsızlığından

Gözlem, ana bilgisayarı yanıtsız hale getirirse, son başarılı adımı ve tam olarak başarısız komutu koruyun. Sabit bir laboratuvar sunucusunda uygulama zaman damgaları ve salt okunur sistem bağlamı ile başlayın. Başarısız sistemdeki sonda oranlarını tekrar tekrar yükseltmeyin. Kısa bir kullanıcı alanı zaman aşımı, bir çekirdek kilitlemesinden kurtarmayı garanti edemez.

Yeniden başlatıldıktan sonra, `journalctl --list-boots` ve `journalctl -k -b -1 --no-pager`, mevcut bir önceki çekirdek kaydını tanımlayabilir; `/sys/fs/pstore/` kalıcı çökme kanıtı içerebilir. Eksik kalıcı kayıtlar nedeni çözülmemiş bırakır. Watchdog kilitlemeleri, RCU tezgahları, OOM ve duraklamış bir kullanıcı arayüzü farklı kanıtlar gerektirir. Benzer semptomları tetikleyen iki araç, uygulamanın orijinal gecikme süresinin neden olduğunu kanıtlayan bir kanıt değil, çekirdek yolu araştırması için bir kurşundur.

İndirilebilir [deney kaydı](../labs/runtime-timing/evidence.txt) kullanarak ölçülen gözlemleri, bildirilen geçmişi, hipotezleri ve kullanılamayan testleri ayırt edin. Tarihsel raporlar yeni yakalanan kanıtlardan ayrı kalır.

## Kaynaklar

- [C++ sabit_saat sözleşmesi](https://eel.is/c++draft/time.clock.steady) ve [Linux saat_gettime](https://man7.org/linux/man-pages/man3/clock_gettime.3.html) iki zaman ölçümünü tanımlar.
- [GDB ataşman/detach](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Attach.html) belgeleri bir işlemi durdurur ve devam ettirir; [gdbserver](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Server.html) uzaktan bağlanmayı kapsar.
- [bpftrace 0.21](https://bpftrace.org/docs/0.21) açık saatler, haritalar ve sonda sözdizimi belgelerini içerir.
- [Linux v6.12 perf sched](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt), zamanlayıcı raporlarını tanımlar; [perf stat](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-stat.txt) belgeleri sayaçları ve kapsamı.
- [çekirdek PSI](https://docs.kernel.org/accounting/psi.html) ve [CPUFreq](https://docs.kernel.org/admin-guide/pm/cpufreq.html) basınç ve frekans politikasını tanımlar.
- [çekirdek lokavt watchdogs](https://www.kernel.org/doc/html/v6.12/admin-guide/lockup-watchdogs.html), watchdog semptomlarını uygulama gecikmelerinden ayırt eder.
