---
title: İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme
language: C++
description: Giriş sayacı ve giriş-dönüş izleme noktaları yazın, saat seçimini, eşleştirmeyi ve histogramı yorumlayın.
---

# İşlev girişlerini ve dönüşlerini izleme noktalarıyla ölçme

Bir genel işlevi sayan bir prob yazın, ardından giriş-giriş ve giriş-dönüş aralıklarını ölçmek için genişletin. Çalıştırmadan önce her prob eylemini okuyun. [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](zamanlama-ve-bekleme.md) ile aynı `perform_work` iş yükünü kullanacaksınız, böylece uygulama kaynağı ve prob sınırları görünür.

## Başlamadan önce

Linux, Bash, bir C++11 derleyicisi, binutils ve **bpftrace 0.21 veya çalışan uprobes ve BPF izinleri ile uyumlu daha yeni bir sürüm** kullanın. `nsecs(monotonic)` bu örneklerde açık bir saat seçimidir. Çalıştırılabilir çalıştırılabilir olsa bile gerekli çekirdek yetenekleri olmayan bir kap yetersizdir. Desteklenmeyen özellikleri kullanılamaz olarak kaydedin; sıfır bir sonuç vermeyin.

İzlemeyi destekleyen tek kullanımlık bir laboratuvar makinesi kullanın. İzleme daha önce bir ana bilgisayarı dondurduysa, [İzleme hatalarını ve sistem donmalarını inceleme](../rehberler/izleme-donmalari.md) okuyun önce. Bu komutlar çekirdek politikasını, zamanlama, afinite veya frekans ayarlarını değiştirmez.

## 1. Gözlemleyeceğiniz işlevi oluşturun

Bir çalışma dizini oluşturun ve indirilebilir [timing_lab.cpp](../labs/runtime-timing/timing_lab.cpp)'yi `timing_lab.cpp` olarak kaydedin. Bu Bash terminalini açık tutun:

```bash
mkdir -p function-probes
cd function-probes
mkdir -p build results
c++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -pthread timing_lab.cpp -o build/timing_lab
LAB_BIN=$(readlink -f build/timing_lab)
uname -a > results/kernel.txt
bpftrace --version > results/bpftrace-version.txt
sha256sum "$LAB_BIN" > results/executable.sha256
nm -an "$LAB_BIN" | grep ' perform_work$'
```

Derleyici, sıra dışı bir işlev ve hata ayıklama bilgisi tutar. `LAB_BIN`, mutlak yoludur. `nm`, `perform_work` için tanımlanmış bir metin sembolü göstermelidir; Eksik bir sembol, bu sorunu, adlandırılmış bir sonda takmadan önce çözmeniz gerektiği anlamına gelir. Bu egzersizin dizin yolunu, `:` gibi boşluklardan ve sondaya özgü noktalamalardan uzak tutun.

İndirilen kaynaktaki işlevi okuyun. `WORK_ENTER`'yi işaretler, yaklaşık 20 ms için CPU'yu uyur veya tüketir ve `WORK_EXIT`'yi işaretler. `extern "C"` adı C++ mangling'den kaçınır; `noinline` bu yapıda incelenebilir bir işlev sınırı tutar. Problar hala bu dahili uygulama belirteçlerinin dışındaki komut sınırlarını gözlemler, bu nedenle süreleri aynı olmamalıdır.

İzleyiciye bu sembolü çözüp çözmediğini sorun:

```bash
sudo bpftrace -l "uprobe:$LAB_BIN:perform_work"
```

`-l`, sonda konumlarını eşleştirir. Gelecekteki bir yakalamanın başarılı olacağını veya işlevin çalıştığını belirlemez.

## 2. Bir giriş sayacı ile başlayın

İlk programı kendiniz yazın:

```bash
cat > results/count.bt <<EOF_BT
uprobe:$LAB_BIN:perform_work
/pid == cpid/
{ @calls = count(); }
EOF_BT
cat results/count.bt
```

Burada belirtilmemiş olan belge `$LAB_BIN`'yi gerçek mutlak çalıştırılabilir yola genişletir. `uprobe` girişte yangın çıkarır. `/pid == cpid/` önkoşulu, kayıtları bpftrace'in `-c` tarafından başlatılan işleme sınırlar; her soyundan takip etmez. `@calls`, toplam bir harita girişidir ve `count()`, dosyanın sayımından önce çalışır.

```bash
sudo bpftrace -c "$LAB_BIN sleep 10 100 results/count.csv" results/count.bt > results/count.txt 2> results/count.stderr
cat results/count.stderr
cat results/count.txt
```

`-c` sonlu çocuğu çalıştırır ve sonlandığında izlemeyi bitirir. Çocuk bpftrace'in ayrıcalıklarını devralır, bu yüzden bu `sudo` komutu sadece küçük güvenilir laboratuvar ikilisini kök olarak çalıştırır. Köke ait çıktı dosyaları oluşturabilir. Yönlendirme, sonda stdout'u ve teşhisleri çocuğun CSV dosyasından ayrı tutar.

İstenen iş yükünün on araması vardır. `@calls`'yi on ile karşılaştırın; sadece araç çıktığı için tam bir yakalama varsaymayın. Çocuk-gözlemli izleme, eski bir PID'yi manuel olarak seçmekten kaçınır, ancak başlangıç/eklem ayrıntıları kurulu sürüme bağlıdır. Eksik bir sayı, beklenen sayının ayarlanması değil, araştırılmasını gerektirir. Teşhis ve kesin sürümü saklayın.

Uygulamanın kendi girişlerini de kontrol edin:

```bash
head -n 1 results/count.csv
awk -F, '$5 == "WORK_ENTER" { print $3, $4, $5 }' results/count.csv
```

Çıktı dizi, TID, olaydır. 1 üzerinden 10 üzerinden bu tek iş parçacığı iş yükü üzerinden dizileri hesaplayabilmelisiniz. Bu, bir analizci kararı yerine, istenen çağrıların ikinci bir gözlemidir.

## 3. Zaman damgaları ve bir dönüş probu ekleyin

İndirilebilir [functions-child.bt.in](../labs/runtime-timing/functions-child.bt.in) dosyasını `functions-child.bt.in` olarak kaydedin. Aç ve bu tam programı oku:

```text bpftrace
uprobe:@BINARY@:perform_work
/pid == cpid/
{
    $now = nsecs(monotonic);
    if (@last[tid]) { @entry_interval_ns = hist($now - @last[tid]); }
    @last[tid] = $now;
    @start[tid] = $now;
    @calls = count();
}
uretprobe:@BINARY@:perform_work
/pid == cpid && @start[tid]/
{
    @elapsed_ns = hist(nsecs(monotonic) - @start[tid]);
    @returns = count();
    delete(@start[tid]);
}
END { clear(@last); clear(@start); }
```

`$now` bu girişin monotonik zaman damgasını saklar. `@last[tid]` bu iş parçacığı üzerindeki önceki girişi hatırlar. İlk aramada daha önce giriş yoktur, bu nedenle giriş aralığına katkıda bulunmaz. `hist`, tamsayı nanosaniye farkı için logaritmik histogram kovasını artırır; bireysel çağrı kimliklerini tutmaz.

`@start[tid]` bu çağrının girişini hatırlar. `uretprobe` dönüşte yangınlar; onun predicate kayıtlı bir giriş gerektirir. Subtracting CPU kapalı harcanan zaman dahil olmak üzere geçen süre verir. `@returns` eşleştirilmiş döner sayar. `delete` tamamlanmış eşleşme kaldırır. `END`'de, sadece defter tutma haritaları temizlenir; iki onun togram basılır ve sayım kalır.

TID eşlemesi burada yeterlidir, çünkü işlev özyinesizdir ve çağrılar tek bir iş parçacığı üzerinde çakışmaz. Özyinelemeli bir işlev, dış başlangıç zaman damgasının üzerine yazar; bu programı uyarlamak bir derinlik veya çağrı anahtarı gerektirir. Rastgele C++ çağrı grafikleri için değişmeden yeniden kullanmayın.

Yer tutucuyu sıradan bir metin ikamesi kullanarak değiştirin:

```bash
sed "s|@BINARY@|$LAB_BIN|g" functions-child.bt.in > results/functions.bt
cat results/functions.bt
```

`sed`, sadece gerçek `@BINARY@`'nin yerini alır. BPF `$now`, şablon Bash tarafından yeniden yorumlanmak yerine bir dosya olarak okunduğu için dokunulmamış kalır. Bu basit ikame için, laboratuvar yolunu `|`, `&` ve backslaves'in yanı sıra boşluk / kolonlardan arındırın. İki sonda yolunuzu doğrulayın.

## 4. İki dağıtımı çalıştırın ve okuyun

```bash
sudo bpftrace -c "$LAB_BIN sleep 10 100 results/sleep.csv" results/functions.bt > results/sleep-probes.txt 2> results/sleep-probes.stderr
cat results/sleep-probes.stderr
cat results/sleep-probes.txt
```

Tam olarak gözlemlenen on çağrı için, on giriş, on eşleştirilmiş dönüş, on passed numune ve **dokuz** giriş aralıkları bekleyin. Örnek toplamlarını kontrol etmek için kovaların yanına basılan sayıları ekleyin. Bir kova aralığı nanosaniye cinsindendir ve tam bir yüzdelik değildir. Geçen dağılım kabaca 20 ms uykuyu yansıtmalıdır; giriş aralıkları kabaca 100 ms periyodunu yansıtmalıdır, zamanlama ve sondama etkilerine tabidir.

CPU tüketen taze bir çocukla tekrarlayın:

```bash
sudo bpftrace -c "$LAB_BIN busy 10 100 results/busy.csv" results/functions.bt > results/busy-probes.txt 2> results/busy-probes.stderr
cat results/busy-probes.stderr
cat results/busy-probes.txt
```

Meşgul ve uyku süreleri geçen zamanda benzer görünebilir. Histogram ne iş parçacığı CPU hizmetini ölçer. Farkı belirlemek için, [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](zamanlama-ve-bekleme.md#6-calculate-elapsed-time-and-cpu-time-yourself) kullanarak uygulamanın `thread_cpu_ns` değerlerini çıkarın ve çıkarın. Mutlak BPF ve C++ zaman damgalarını çıkarmayın: çağları eşdeğer olarak doğrulanmadı.

## Devam etmeden önce neleri açıklamalısınız

İlk girişin neden aralık olmadığını, geri dönüşün neden kurtarıldığını ve geçilen bir sondanın neden CPU tüketiminden uykuyu ayırt edemediğini açıklayın. Kaynak hash, sürüm, oluşturulan sonda dosyasını, stdout, stderr, uygulama satırlarını ve sayım kontrollerini koruyun. Sayımlar farklıysa, dağıtımları yorumlamadan önce sonda kullanılabilirliğini, hedef kimliğini, erken çıkışları, bağlanma davranışını ve yakalama kaybını araştırın. [Zamanlayıcı çizelgesini durum geçişlerinden okuma](zamanlayici-zaman-cizelgesi.md) Görev geçişlerini gözlemlemeniz gerektiğinde.

## Kaynaklar

- [bpftrace komut satırı dokümantasyonu, sürüm 0.21](https://bpftrace.org/docs/0.21) tanımlar `-c`, `cpid`, sonda, açık saat modları ve histogram haritaları belirtir.
- [bpftrace sürümlü dil referansı](https://github.com/bpftrace/bpftrace/blob/v0.21.0/docs/reference_guide.md) eşleşen dil sözleşmesini sağlar.
