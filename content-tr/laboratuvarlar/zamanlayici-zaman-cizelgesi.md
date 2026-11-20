---
title: Zamanlayıcı çizelgesini durum geçişlerinden okuma
language: Bash
description: Ham görev geçişlerini eşleştirip engellenmiş ve çalışmaya hazır bekleme sürelerini hesaplayın.
---

# Zamanlayıcı çizelgesini durum geçişlerinden okuma

Bir görevi bırakıp bir CPU'ya geri dönen bir görevi gözlemleyin, ardından tüm CPU dışı aralığını çalıştırılabilir olarak harcanan parçadan ayırt edin. Ham olayları inceleyecek ve perf'in özetini okumadan önce kendiniz çıkarma gerçekleştireceksiniz.

## Başlamadan önce

64-bit Linux, Bash, tracefs, programlayıcı iz noktalarına sahip çekirdek uyumlu bir perf kurulumu ve izleme iznini kullanın. İsteğe bağlı BPF gözlemi, bpftrace 0.21 veya uyumlu daha yeni bir sürüm gerektirir. Yüklenen bir program çekirdek desteği oluşturmaz. İzinler veya olaylar kullanılamıyorsa, hatayı koruyun ve yakalamayı durdurun; boş bir dosya sıfır bekleme oluşturamaz.

[Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](zamanlama-ve-bekleme.md)'yi bitirin ve `build/timing_lab`'nin bulunduğu dizininden aşağıdaki komutları çalıştırın. Sıradan zamanlama politikasını koruyun. [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](../rehberler/zamanlayici-izleri.md) sürüme bağlı yeniden yapılandırmayı açıklar; [İzleme hatalarını ve sistem donmalarını inceleme](../rehberler/izleme-donmalari.md) etkilenen bir konak için kurtarma kanıtlarını kapsar.

## 1. Aracı ve iz noktası sözleşmesini kaydedin

```bash
mkdir -p results/scheduler
uname -a > results/scheduler/kernel.txt
perf --version > results/scheduler/perf-version.txt
perf list 'sched:*' > results/scheduler/events.txt
cat results/scheduler/events.txt
```

`perf list` mevcut zamanlayıcı olaylarını açıklar. `sched_switch` ve uyandırma olaylarını kontrol edin. Dağıtımınız perf'i değiştirirse paketi / yapı kimliğini de kaydedin. Mevcut tracefs mount'u bulun:

```bash
findmnt -t tracefs
LAB_TRACEFS=/sys/kernel/tracing
if [ ! -r "$LAB_TRACEFS/events/sched/sched_switch/format" ]; then
    LAB_TRACEFS=/sys/kernel/debug/tracing
fi
sudo cat "$LAB_TRACEFS/events/sched/sched_switch/format" > results/scheduler/switch-format.txt
sudo cat "$LAB_TRACEFS/events/sched/sched_wakeup/format" > results/scheduler/wakeup-format.txt
cat results/scheduler/switch-format.txt
cat results/scheduler/wakeup-format.txt
```

`findmnt` farklı bir bağlama noktası gösterirse `LAB_TRACEFS` değişkenini o yola ayarlayın. Devam edebilmek için tracefs bağlı ve olay biçimi okunabilir olmalı. Bu komutlar yalnızca olay tanımlarını okur. `prev_pid`, `next_pid`, `prev_state` alanlarını ve uyandırılan görevin `pid` değerini inceleyin. Durum etiketlerinin anlamını biçimdeki yazdırma ifadesinden çıkarabilirsiniz. Sayısal durum maskesini çalıştığınız çekirdeğin olay biçiminden alın.

## 2. İsteğe bağlı: BPF ile bir switch-out / switch-in çiftini ölçün

Bu ön gözlemde, PID'si de tek TID olan bir çocuk `sleep` kullanılır. Mevcut Bash terminalinde başlatın:

```bash
sleep 60 &
LAB_TASK=$!
printf 'owned sleep task: %s\n' "$LAB_TASK"
ps -L -p "$LAB_TASK" -o pid,tid,stat,args
```

Ölçümü görünür olsun diye tüm sondayı yazın:

```bash
cat > results/scheduler/offcpu.bt <<'EOF_BT'
tracepoint:sched:sched_switch
/args->prev_pid == $1/
{
    @out[args->prev_pid] = nsecs(monotonic);
}
tracepoint:sched:sched_switch
/args->next_pid == $1 && @out[args->next_pid]/
{
    $in = nsecs(monotonic);
    printf("tid=%d out_ns=%llu in_ns=%llu offcpu_ns=%llu\n",
           args->next_pid, @out[args->next_pid], $in,
           $in - @out[args->next_pid]);
    delete(@out[args->next_pid]);
    exit();
}
END { clear(@out); }
EOF_BT
cat results/scheduler/offcpu.bt
```

İstenen TID bir CPU'dan ayrıldığında ilk önbelleğe alınan kayıtlar. İkincisi, aynı TID'nin geri dönmesini ve kaydedilen bir çıkış zaman damgasına sahip olmasını gerektirir. `printf`, hem uç noktaları hem de farklarını ortaya çıkarır. `delete` çifti tamamlar; `exit()`, bu bir sonuçtan sonra izleyiciyi bitirir. `$1`, burada verilen ilk BPftrace'ın ilk konum argümanıdır.

**İkinci bir terminalde**, `12345`'nin yerine basılı sayısal TID ile yakalamayı çalıştırın:

```bash
sudo bpftrace results/scheduler/offcpu.bt 12345
```

Aynı çalışma dizini kullanın. Probların eklendiğini bildirene kadar bekleyin. Orijinal terminalde, sahip olunan görevi kısaca durdurun ve devam ettirin:

```bash
kill -STOP "$LAB_TASK"
sleep 0.1
kill -CONT "$LAB_TASK"
wait "$LAB_TASK"
```

Durdurma ve devam etme kasten kendi sonlu çocuğunuz için durum geçişleri oluşturur. Eklenti ve sinyal işleme bağlı olarak, gözlemlenen tam çift beklediğinizden farklı bir geçiş içerebilir. Gerçek zaman damgalarını inceleyin; Eğer tam bir çift meydana gelmezse, Ctrl-C ile bpftrace'i durdurun. Bağlanmadan önce başlayan ilk uyku için bir son nokta icat etmeyin. Çocuk sonunda normal olarak çıkar.

Bu fark ** off-CPU** süresidir. Görev çalıştırılabilir hale geldiğinde ne prob kayıtları, bu nedenle çıkış beklemeyi engellenmiş ve çalıştırılabilir bileşenlere bölemez. Bu nedenle iki anahtar zaman damgasını tek başına çıkarmak, zamanlayıcı gecikmeli bir talep için yetersizdir.

## 3. Kısa bir perf zamanlayıcı izi kaydedin

Sistem çapında bir zamanlayıcı yakalama altında sonlu bir iş yükü çalıştırın:

```bash
sudo perf sched record -a -o results/scheduler/sched.data -- ./build/timing_lab sleep 10 100 results/scheduler/application.csv
```

`-a`, çalışanları uyandıran görevler de dahil olmak üzere olayları diğer görevlerden ve CPU'lardan korur. `-o`, bu çalışmayı diğer perf yakalamalarından ayrı tutar. Burada yığın koleksiyonu yoktur. `--`'yi takip eden komut on çağrı yapar ve iş tamamlandıktan sonra uygulama kayıtları yazar. `sudo perf` aracılığıyla başlatıldığında, iş yükü de bu ayrıcalıklarla çalışır; yalnızca bu güvenilir laboratuvar çalıştırılabilirini kullanın.

Uygulama kimliğini okuyun ve raporlamadan önce kaydı doğrulayın:

```bash
head -n 6 results/scheduler/application.csv
LAB_TID=$(awk -F, '$5 == "WORK_ENTER" { print $4; exit }' results/scheduler/application.csv)
printf 'recorded worker TID: %s\n' "$LAB_TID"
sudo perf script -i results/scheduler/sched.data --header > results/scheduler/capture-header.txt
sudo perf script -i results/scheduler/sched.data --ns > results/scheduler/events.txt
less results/scheduler/capture-header.txt
less results/scheduler/events.txt
```

Dördüncü CSV alanı bu koşunun gerçek TID'sini sağlar. `less`, sonra çevredeki zamanlayıcı olaylarını inceleyin. `--ns` nanosaniye zaman damgası görüntülemesi ister; orijinal zaman damgası doğruluğunu iyileştirmez. Stderr ve kayıp olay uyarılarını kayıt / koddan koruyun. Bir izleme noktasının önündeki basılı görev yayıcıdır; giden, gelen veya uyanmış görevi tanımlamak için olayın hedef alanlarını okuyun. Çıkış biçimlendirmesi perf sürümüne göre değişir, bu nedenle sabit bir varsayımda bulunmayın. `grep prev_pid=...` Düzen.

## 4. Bir uyku görevinin bekleme süresini çiğ sınırlardan hesaplayın

Aynı TID için tam bir aralık bulun: uyku durumuna geçiş, uyandırma işlemi çalıştırılabilir hale getirme ve bir sonraki devreye alma. Ara geçişler, göç, görev çıkışı ve kayıp için çevredeki olayları kontrol edin. Aralık eksikse, başka bir tam aralık seçin veya kullanılamıyor olduğunu bildirin.

Alıştırma için şu **temsili göreli zaman damgalarını** kullanın. Çıkış 1.000.000 ns, uyanma 81.000.000 ns, yeniden çalışma 84.000.000 ns. Bu değerleri girip aralıkları hesaplayın:

```bash
LAB_OUT_NS=1000000
LAB_WAKE_NS=81000000
LAB_IN_NS=84000000
LAB_OFFCPU_NS=$((LAB_IN_NS - LAB_OUT_NS))
LAB_BLOCKED_NS=$((LAB_WAKE_NS - LAB_OUT_NS))
LAB_RUNNABLE_NS=$((LAB_IN_NS - LAB_WAKE_NS))
printf 'off CPU: %s ns\n' "$LAB_OFFCPU_NS"
printf 'blocked: %s ns\n' "$LAB_BLOCKED_NS"
printf 'runnable: %s ns\n' "$LAB_RUNNABLE_NS"
printf 'parts: %s ns\n' "$((LAB_BLOCKED_NS + LAB_RUNNABLE_NS))"
```

Sonuçlar 83 ms CPU kapalı, 80 ms engellenmiş ve 3 ms çalıştırılabilir. Parçalar bütünü toplam.

Kendi izinden doğrulanmış tam bir üçlü için, her olayın ondalık zaman damgasını bir değişkene kopyalayın. Aşağıdaki değerler aynı örnekleme örneğini temsil eder; üçünü de seçtiğiniz ham olay zaman damgalarıyla değiştirin:

```bash
LAB_OUT_S=0.001000000
LAB_WAKE_S=0.081000000
LAB_IN_S=0.084000000
```

`perf script --ns` ile, her kesirli parçanın dokuz ondalık basamak olduğunu doğrulayın. Ekranınızın daha az basamaklı olması durumunda, devam etmeden önce nanosaniyelere sağdaki ped. Saniyeleri ve kesirli nanosaniyeleri böl, sonra bunları tamsayılar olarak birleştir:

```bash
LAB_OUT_NS=$((10#${LAB_OUT_S%.*} * 1000000000 + 10#${LAB_OUT_S#*.}))
LAB_WAKE_NS=$((10#${LAB_WAKE_S%.*} * 1000000000 + 10#${LAB_WAKE_S#*.}))
LAB_IN_NS=$((10#${LAB_IN_S%.*} * 1000000000 + 10#${LAB_IN_S#*.}))
printf 'out=%s wake=%s in=%s ns\n' "$LAB_OUT_NS" "$LAB_WAKE_NS" "$LAB_IN_NS"
```

`${value%.*}` ondalık nokta ve kesirini kaldırır; `${value#*.}` saniyeleri ve noktayı kaldırır. `10#` Bash'e, sıfır ile başlayan kesirler de dahil olmak üzere on tabanındaki basamakları okumasını söyler. Çarpma saniyeleri nanosaniyelere dönüştürür. Yukarıdaki çıkarma komutlarını bu üç tamsayı ile tekrarlayın. Orijinal olay satırlarını sonucun yanında tutun; Olay kimliğini doğrulayın ve aritmetikten önce sipariş verin. Floating-pm büyük çıkarmada kullanma

Bir görev hala çalıştırılabilirken başka bir eşlemeye ihtiyaç duyarken değiştirildi: geçiş yapmak için geçiş, başka bir uyandırma olmadan bile çalışmaya hazır bekleme olabilir. Durumu ve ilgili olay geçmişini kontrol edin. Sadece uyandırma hesaplaması bu durumu kaçırır.

## 5. Hesaplamayı perf'in yorumuyla karşılaştırın

```bash
sudo perf sched timehist -i results/scheduler/sched.data --tid "$LAB_TID"
sudo perf sched latency -i results/scheduler/sched.data
sudo perf sched map -i results/scheduler/sched.data
```

Danışma `perf sched timehist -h` yüklü sürümünüz bu TID-filter seçeneğini kabul etmiyorsa. Hesapladığınız belirli aralığı karşılaştırın `timehist`, yerine tam çalışan bir ortalamayı ona eşitlemek. **Bekleme süresi** CPU dışı aralığı içerir; **sch gecikmesi ** bu analizör tarafından yeniden yapılandırılan çalıştırılabilir kısmı tanımlar. Bu sütunları eklemeyin. `latency` Görev gecikmelerini özetler; `map` Yakınlardaki CPU'ları hangi görevlerin işgal ettiğini denetlemeye yardımcı olur.

Bir rapor tutarsızlığı olay kaybı, bir sınır aralığı, yanlış kimlik veya analizci davranışından kaynaklanabilir. [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](../rehberler/zamanlayici-izleri.md#3-treat-analyzer-version-as-part-of-the-experiment) kontrol etmek için önkoşul hesaplama değişikliğini açıklar. Kayıttan sonra `ps` ile örneklenen bir durum eksik tarihi olayları onaramaz.

## Ne tutmak ve açıklamak için

Kernel/perf sürümlerini ve paket kimliğini, izleme noktası biçimlerini, kesin yakalama komutunu, uygulama CSV'sini, perf verilerini, deşifre edilen olayları, tanıları ve bir manuel eşleştirilmiş aralığı saklayın. CPU dışı zamanın neden otomatik olarak çalıştırılabilir gecikme olmadığını, önyüklü bir görevin neden uyanmadığını ve neden mutlak C++ ve çekirdek zaman damgalarının çapraz akış çıkarmadan önce saat doğrulaması gerektirdiğini açıklayın.

## Kaynaklar

- [Linux v6.12 perf sched documentation](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt) rapor görünümlerini tanımlar.
- [Linux izleme olay biçimleri](https://docs.kernel.org/trace/events.html) tracefs format dosyalarını açıklar.
- [bpftrace] 0.21](https://bpftrace.org/docs/0.21) belgeler iz noktası argümanları, konum parametreleri, saatler ve `exit()`.
