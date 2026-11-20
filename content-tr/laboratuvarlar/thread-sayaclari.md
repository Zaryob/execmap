---
title: Zamanlayıcı izi olmadan iş parçacığı sayaçlarını örnekleme
language: Bash
description: procfs dosyalarını okuyun, görev kimliğini denetleyin ve Bash ile sayaçların farkını alın.
---

# Zamanlayıcı izi olmadan iş parçacığı sayaçlarını örnekleme

Linux'un iş başına dosyaları doğrudan okuyun, iki ham sayaç anlık görüntüsünü kaydedin, aynı göreve ait olup olmadıklarını kontrol edin ve Bash'te çıkarın. Ardından, bir uyku sürecini, başlattığınız ve kendinizi durdurduğunuz CPU tüketen bir işlemle karşılaştırın.

Ana egzersiz için okuyucu programı gerekmez. Aksi takdirde bir karşı örnekleme betiğinin gizleyeceği işlemleri gerçekleştireceksiniz.

## Başlamadan önce

Kullanım **64-bit Linux ve Bash**, procfs at `/proc`, procps (`ps`) ve sıradan komut satırı araçları: `cat`, `grep`, `awk`, `cmp`, `sleep`, ve `sha256sum`. Python ve C++ zamanlama programı gerekli değildir. [Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu](../rehberler/process-thread-ve-zamanlayici.md) Programlayıcı terminolojisini açıklar.

Bir Bash terminali açın ve tüm laboratuvar için açık tutun. Kabuk değişkenleri ve çocuk işlemleri bu oturuma aittir. Bir dizin oluşturun:

```bash
mkdir -p ~/execmap-labs/manual-thread-counters
cd ~/execmap-labs/manual-thread-counters
mkdir -p results
```

`results/` dizini önceden belirlenmiş bir rapor değil **raw procfs okumalarını** içerecektir. İlk hedefi başlatmadan önce adımları bir kez okuyun, böylece temizleme komutunun nerede olduğunu bilirsiniz.

## 1. PID'sini bildiğiniz bir işlemi başlatın

```bash
sleep 900 &
LAB_PID=$!
printf 'Our sleeping process has PID %s\n' "$LAB_PID"
```

`sleep 900`, bu çocuğun 900 saniyelerini beklemesini ister ve size incelemeniz için zaman verir. `&` arka planda çalıştırır ve kabuğunuzu kullanılabilir bırakır. `$!`, arka plan komutunun yeni başlatılan PID'sidir. Hemen kaydedin: `$!`'nin yerini başka bir arka plan lansmanı alır.

7 adımında bu çocuğu durduracaksınız; egzersizi bitirmek için on beş dakika beklemenize gerek yok.

Şimdi ipliklerini inceleyin:

```bash
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu
```

`-p` sürecinizi seçer. `-L` ipliklerini listeler. `-o` görüntülenen sütunları seçer. `PID` süreci tanımlar, `TID` içinde bir görev, `COMM` Adı, `STAT` Mevcut durumu, `PSR` Gözlemlenen bir CPU ve `%CPU` aralıklı iz yerine kullanım istatistikleri.

Bu basit `sleep` işlemi için bir görev olmalı ve PID, TID'ye eşit olmalıdır. `STAT` genellikle uyurken `S` gösterecektir. Gözlemlenen bir CPU numarası bir afinite garantisi değildir.

## 2. Bu görevi procfs'de ele alın

TID'yi kontrol ettiğiniz tek iplikten ayarlayın, ardından yolunu oluşturun:

```bash
LAB_TID=$LAB_PID
LAB_TASK_DIR="/proc/$LAB_PID/task/$LAB_TID"
printf '%s\n' "$LAB_TASK_DIR"
```

Bu ana iş parçacığı örneği için TID eşittir PID. Çok iş parçacığılı bir programda, `ps -L`'den gerçek TID'yi seçin; her işçi için süreç liderini değiştirmeyin.

Seçilen kimlik alanlarını oku:

```bash
grep -E '^(Name|Tgid|Pid|Threads|Cpus_allowed_list):' "$LAB_TASK_DIR/status"
```

`grep` eşleşen satırları seçer. `-E` ile ayrılan alternatifleri mümkün kılar `|`; `^` Her hattın başında onları sabitleyin. `Tgid` iş parçacığı grubu/process ID, `Pid` İşte görev kimliği ve `Threads` Gruptaki görevleri sayar. `Cpus_allowed_list` Uygun CPU'ları tanımlar, ayrılmış CPU'ları değil.

Çıkaracağımız sayaçları okuyun:

```bash
cat "$LAB_TASK_DIR/schedstat"
```

Bu dosya üç beyaz alan ayrılmış kümülatif tamsayı içerir:

```text
CPU_RUNTIME_NS RUNQUEUE_WAIT_NS TIMESLICES
```

Bu isimler pozisyonları açıklar; gerçek dosya sayılar içerir. Birincisi, nanosaniye cinsinden CPU yürütme süresidir. İkincisi bir runqueue bekliyor. Üçüncüsü bir timelice sayacıdır. Ham kümülatif değer bir sonraki saniye boyunca ne olduğunu söylemez; iki okumaya ihtiyacımız var.

## 3. Bekleme istatistiklerinin toplanıp toplanmadığını kontrol edin

```bash
cat /proc/sys/kernel/sched_schedstats > results/collection-before.txt || printf 'unknown\n' > results/collection-before.txt
cat results/collection-before.txt
```

İlk `cat` bir ayarı okur; bir ayarı değiştirmez. `>` bunu kaydeder. `||`'den sonraki komut yalnızca okuma başarısız olursa çalışır, ayar sıfırmış gibi davranmak yerine gerçek kelime `unknown` kaydeder.

Sonuç `0` ise, runqueue muhasebesi devre dışı bırakılır. Eksikse, reddedilirse veya `unknown`, kullanılabilirliği belirlenmemiştir. Bir `1`, bu okumada toplamanın etkin olduğunu söylüyor. Engelli/bilinmeyen durumlarda, ham sayaçları saklayın ancak ** sıfır bekleme sayacını sıfır bekleme olarak yorumlamayın**. Zaman dilimi sayacı da destek konuları olan ham bir gözlemdir.

Bu ayara egzersizin bir parçası olarak yazmayın. Amaç, ortamınızın gerçekte sağladığı verileri anlamaktır.

## 4. Bir görev kimliğini ve ilk anlık görüntüsünü kaydedin

Bir görev çıkışından sonra sayısal PID/TID tekrar kullanılabilir. Başlangıç zamanını başka bir kimlik kontrolü olarak kaydedin:

```bash
LAB_STAT=$(cat "$LAB_TASK_DIR/stat")
LAB_FIELDS="${LAB_STAT##*) }"
printf '%s\n' "$LAB_FIELDS" | awk '{ print $20 }' > results/start-before.txt
cat results/start-before.txt
```

`$(...)`, komutun çıktısını değişken olarak yakalar. `stat` dosyası PID ve parantezlenmiş bir komut adı ile başlar. Bu ad boşluklar veya parantezler içerebilir, bu nedenle boşluklardaki tüm satırın bölünmesi daha sonraki alanları yanlış numaralandırır.

`${LAB_STAT##*) }`, `) `'de biten en uzun öneki kaldırır, ilk alan olarak görev durumu olan orijinal alan 3'yi bırakır. Başlangıç zamanı orijinal alan 22'dir, bu nedenle **alan 20, bu ilk iki alanı çıkardıktan sonra**. `awk`, alanı çıkarmadan veya dönüştürmeden yazdırır.

Şimdi ham zamanlayıcı sayaçlarını kaydedin:

```bash
cat "$LAB_TASK_DIR/schedstat" > results/sleep-before.txt
cat results/sleep-before.txt
```

İlk komut okunur ve kaydedilir; ikincisi tam olarak kaydedilmiş değerleri gösterir. Bunları başka bir makineden örnek numaralarla değiştirmeyin.

## 5. Bekle, tekrar oku ve kimliği doğrula

```bash
sleep 1
cat "$LAB_TASK_DIR/schedstat" > results/sleep-after.txt
```

Bu `sleep 1`, **observer kabuğunuzun ön plan komutunu** duraklatırken arka plan hedefi kendi uykusunu devam ettirir. Aralık, komutunuzu ve yazma sürenizi de içerir; tam bir saniyelik zaman damgalı yakalama değildir.

Sayaç okunduktan sonra kimliği tekrar okuyun:

```bash
LAB_STAT_AFTER=$(cat "$LAB_TASK_DIR/stat")
LAB_FIELDS_AFTER="${LAB_STAT_AFTER##*) }"
printf '%s\n' "$LAB_FIELDS_AFTER" | awk '{ print $20 }' > results/start-after.txt
cmp results/start-before.txt results/start-after.txt && printf 'Start time matches\n'
```

`cmp`, kaydedilen iki kimlik değerini karşılaştırır. `&&`'den sonraki mesaj yalnızca eşleştiklerinde görünür. Bir kimlik farklıysa, görev kaybolur veya gerekli okuma başarısız olursa, dur: o çiftten bir ölçüm hesaplamayın.

Koleksiyon ayarını tekrar okuyun:

```bash
cat /proc/sys/kernel/sched_schedstats > results/collection-after.txt || printf 'unknown\n' > results/collection-after.txt
cat results/collection-before.txt results/collection-after.txt
```

Sadece iki etkin okuma, runqueue deltasını yorumlamayı destekler ve bunlar bile aralarında bir ayar değişikliğini dışlayamaz. Başlangıç zamanı karşılaştırması, yarışsız bir işlem kolu değil, yararlı bir tanıdır: procf'ler okumalar ayrı işlemlerdir ve başlangıç süreleri kene çözünürlüğüne sahiptir. Çok işli bir işlemdeki farklı bir işçi için hem süreci hem de görev başlangıç kimliklerini kaydedin.

## 6. Ham sayaçları kendiniz çıkarın

Her iki anlık görüntüyü de önce göster:

```bash
cat results/sleep-before.txt results/sleep-after.txt
```

Her dosyadan üç sütunu yükleyin:

```bash
read -r LAB_CPU_BEFORE LAB_WAIT_BEFORE LAB_SLICES_BEFORE < results/sleep-before.txt
read -r LAB_CPU_AFTER LAB_WAIT_AFTER LAB_SLICES_AFTER < results/sleep-after.txt
```

Laboratuvarlardaki virgülle ayrılmış dosyaların aksine 7–8, `schedstat` Beyaz alan kullanır. Bash `read` Bu beyaz alanı, adı verilen üç değişkene böler. `<` Kaydedilen dosyayı temin etmek ve `-r` girdiyi gerçek olarak tutar.

Her sayaç için eksiden önce hesapla:

```bash
LAB_CPU_DELTA=$((LAB_CPU_AFTER - LAB_CPU_BEFORE))
LAB_WAIT_DELTA=$((LAB_WAIT_AFTER - LAB_WAIT_BEFORE))
LAB_SLICES_DELTA=$((LAB_SLICES_AFTER - LAB_SLICES_BEFORE))
printf 'CPU execution delta: %s ns\n' "$LAB_CPU_DELTA"
printf 'raw waiting-counter delta: %s ns\n' "$LAB_WAIT_DELTA"
printf 'raw timeslice-counter delta: %s\n' "$LAB_SLICES_DELTA"
```

`$((...))` tamsayı aritmetiği gerçekleştirir. Negatif sonuç, pencereyi reddetmek için bir nedendir, sıfıra kıskaçlamak için bir değer değildir. Kimliğinizi ve anlık görüntülerinizi tekrar kontrol edin.

CPU hizmeti uyku işlemi için sıfır veya küçük olabilir. Ham bekleme deltası hala iki toplama ayar okuması kullanılarak yorumlanmalıdır. Koleksiyon devre dışı bırakılmış veya bilinmiyorsa, ham çıkarma sıfır olduğunda bile notlarınıza **bekletme** yazın.

CPU zamanını milisaniye cinsinden görüntülemek için:

```bash
awk -v ns="$LAB_CPU_DELTA" 'BEGIN { printf "CPU execution: %.6f ms\n", ns/1000000 }'
```

`-v`, zaten çıkarılan tamsayıyı sağlar; `BEGIN` bir kez çalışır; bir milyona bölünmesi nanosaniyeleri milisaniyelere dönüştürür. Şimdi örnekleyicinin temel çalışmasını kendiniz gerçekleştirdiniz: iki okuma, bir kimlik kontrolü ve bir kullanılabilirlik koşulu ile çıkarma.

## 7. Yarattığınız uyuyan çocuğu durdurun

```bash
kill "$LAB_PID"
wait "$LAB_PID"
```

`kill` başka bir sinyal seçeneği olmadan SIGTERM'i o yakalanan PID'ye gönderir. `wait`, çocuğu çıktıktan sonra toplar. Bash, `Terminated` yazdırabilir ve `wait`, SIGTERM'den sonra 143 döndürebilir; Bu kasıtlı olarak durdurulan laboratuvar çocuğu için beklenir. Kaydedilen anlık görüntüleri geçersiz kılmaz.

PID'yi kendi lansmanınızdan kullanın, bu sayfadan kopyalanan bir örnek asla. Bu durdurulana veya zaten çıkana kadar yeni bir hedef başlatmayın.

## 8. CPU tüketen bir çocuğu başlatın ve inceleyin

```bash
sha256sum /dev/zero > /dev/null &
LAB_PID=$!
LAB_TID=$LAB_PID
LAB_TASK_DIR="/proc/$LAB_PID/task/$LAB_TID"
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu
```

`/dev/zero`, sıfır baytlık sürekli bir akış sağlar. `sha256sum`, CPU'yu tüketen bu akışı karıştırmaya devam eder. Nihai çıktısını `/dev/null`'ye yönlendirmek, giriş akışını durdurmaz. Bu çocuğu adım 10'de durdurmalısınız. Sıradan zamanlama politikası altında çalışır; hiçbir afinite veya öncelik değişikliği söz konusu değildir.

PID'nin `sha256sum`'ye ait olduğunu doğrulayın ve iş parçacığı listelemesini inceleyin. Burada `timeout` sarmalayıcısı yok: `$!`, başka bir işlem bekleyen bir ambalajın PID'si yerine örneklemeyi düşündüğümüz işlemdir.

## 9. Okumaları tekrarlayın ve CPU deltalarını karşılaştırın

Yeni görevin kimliğini ve toplama bayrağını kaydet:

```bash
LAB_BUSY_STAT=$(cat "$LAB_TASK_DIR/stat")
LAB_BUSY_FIELDS="${LAB_BUSY_STAT##*) }"
printf '%s\n' "$LAB_BUSY_FIELDS" | awk '{ print $20 }' > results/busy-start-before.txt
cat /proc/sys/kernel/sched_schedstats > results/busy-collection-before.txt || printf 'unknown\n' > results/busy-collection-before.txt
```

Bu, **yeni** PID için öncekiyle aynı kimlik çıkarmadır. Şimdi iki karşı anlık görüntü okuyun:

```bash
cat "$LAB_TASK_DIR/schedstat" > results/busy-before.txt
sleep 1
cat "$LAB_TASK_DIR/schedstat" > results/busy-after.txt
```

Okunduktan sonra kimliğini kontrol edin ve toplama bayrağını saklayın:

```bash
LAB_BUSY_STAT_AFTER=$(cat "$LAB_TASK_DIR/stat")
LAB_BUSY_FIELDS_AFTER="${LAB_BUSY_STAT_AFTER##*) }"
printf '%s\n' "$LAB_BUSY_FIELDS_AFTER" | awk '{ print $20 }' > results/busy-start-after.txt
cmp results/busy-start-before.txt results/busy-start-after.txt && printf 'Busy task start time matches\n'
cat /proc/sys/kernel/sched_schedstats > results/busy-collection-after.txt || printf 'unknown\n' > results/busy-collection-after.txt
```

Kimlik kontrolü veya gerekli herhangi bir sayaç okuması başarısız olduysa durdurun. Aksi takdirde yükleme ve çıkarma:

```bash
read -r LAB_BUSY_CPU_BEFORE LAB_BUSY_WAIT_BEFORE LAB_BUSY_SLICES_BEFORE < results/busy-before.txt
read -r LAB_BUSY_CPU_AFTER LAB_BUSY_WAIT_AFTER LAB_BUSY_SLICES_AFTER < results/busy-after.txt
LAB_BUSY_CPU_DELTA=$((LAB_BUSY_CPU_AFTER - LAB_BUSY_CPU_BEFORE))
printf 'sleep CPU delta: %s ns\n' "$LAB_CPU_DELTA"
printf 'busy CPU delta:  %s ns\n' "$LAB_BUSY_CPU_DELTA"
cat results/busy-collection-before.txt results/busy-collection-after.txt
```

Yoğun işlem genellikle karşılaştırılabilir bir gözlem penceresi üzerinde önemli ölçüde daha fazla CPU hizmeti biriktirmelidir. Tam bir CPU saniyesi almasına gerek yoktur: diğer görevler ve gözlemci de çalışır. Sabit bir oran taşınabilir kabul eşiği değildir.

Aynı görünür sonra-eksi-önce formülleri bekleme ve zaman dilimli alanlarına uygulayabilirsiniz. Toplama kullanılabilirliği hala geçerlidir; CPU kullanımı tek başına açlığını kanıtlayamaz veya bir uygulama mesajının gecikmesini açıklamaz.

## 10. CPU çocuğunu durdurun ve kanıtları açıklayın

```bash
kill "$LAB_PID"
wait "$LAB_PID"
```

Bu, örneklediğiniz çocuğu durdurur. Dosyalardan önce/sonrası, başlangıç-zamanı kontrolleri ve toplama ayarlarını hem çiğ tutun. Artık her alanı açıklayabilmeli ve CPU sonucunun arkasındaki tam çıkarmayı göstermelisiniz.

Bunlar bir komut penceresi üzerinden kümülatif sayaç değişiklikleridir. Çağrı başına maksimum sağlamazlar. `one second minus CPU delta`'yi kesin bir CPU dışı aralık olarak yorumlamayın: okumalarınız ve komutlarınız atomik uç noktalarını paylaşmaz. [Doğrudan ve kuyruklu çağrılarda altı olay sınırını eşleştirme](olay-akisini-eslestirme.md) ve haklıysa, [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](../rehberler/calisma-zamani-gecikmesi.md) kullanın.

## Eğer manuel bir adım başarısız olursa

Eksik bir `/proc` dosyası, hedefin çıktığı anlamına gelebilir. İzin hataları mevcut olmayan gözlemlerdir. Boş dosyalar veya başarısız `read` komutları sıfır sayaç değildir. Yeni başlatılan bir hedef ve kimlikle yeniden başlayın; eski PID / TID değerlerini yeni bir ölçüme taşımayın.

Örnekler basit ana iş parçacığı hedefleri kullanır. Başlangıç zamanı alan çıkarma, parantezlenmiş isimleri kasıtlı olarak işler; `awk '{print $22}'` orijinal açıklanmamış `stat` dosyasında genel bir yedek değildir. Bunu birkaç işçiye veya cgroup kısıtlamasına uyarlamadan önce [Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu](../rehberler/process-thread-ve-zamanlayici.md)'yi okuyun.

## İsteğe bağlı: sağlanan okuyucunun otomatikleştirdiklerini anlamak

Ham dosya egzersizini yaptıktan sonra, isteğe bağlı [sample_thread.py](../labs/thread-observation/sample_thread.py)'i inceleyin. `identity` işlevi alan çıkarma işlemini gerçekleştirir, `snapshot` kimlik kontrolleri etrafında sayaçları okur ve `difference` eksi-öncesi-sonrası gerçekleştirir. Monoton bir örnekleme aralığı kaydeder ve uygun olmayan bekleme bilgileri için JSON `null` kullanır.

Python 3.7 veya daha yenisine yalnızca o okuyucuyu seçerseniz ihtiyaç duyulur. Eksmap deposu kökünden `python3 scripts/verify-debugging-labs.py --require-linux` sonlu bir çocuğa ve sentetik geçersiz pencerelere karşı kontrol eder. [doğrulama kaydı](../labs/event-pipeline/validation.txt) otomatik kapsama alanını açıklar. Ne araç, sadece manuel olarak gerçekleştirdiğiniz komutları ve kararları değiştirir.

## Kaynaklar

- [çekirdek zamanlayıcı istatistikleri](https://docs.kernel.org/scheduler/sched-stats.html) üç kümülatif sayaç tanımlar.
- [Linux proc_pid_task](https://man7.org/linux/man-pages/man5/proc_pid_task.5.html) görev yollarını tanımlar.
- [Linux proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) başlangıç zamanı alanlarını ve çözümlerini tanımlar.

- [GNU Bash kılavuzu: aritmetik genişleme](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) ve [Bash buildins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) kabuk hesaplamalarını ve `read`'yi belgelemektedir.
