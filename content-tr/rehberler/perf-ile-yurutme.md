---
title: perf ile yürütme analizi ve donanım izleme
description: Sayımlar, örnekleme ve Intel PT ile kodun nerede çalıştığını belirleyin.
---

# perf ile yürütme analizi ve donanım izleme

Statik sökme her zaman ikilinin gerçek çalışma zamanı davranışını ortaya çıkarmaz. Profilleme karmaşık dalları, dinamik işlev işaretçileri ve dolaylı çağrıları olan programlardaki sıcak yolları belirlemeye yardımcı olur.

Linux **perf** PMU sayaç ve izleme noktası verilerini toplar. Maliyet, zaman çözünürlüğü ve kapsama alanı olay türüne, CPU, çekirdek, perf oluşturma ve tampon ayarlarına bağlıdır. Bu kılavuz Linux perf ile ilgilidir; Intel PT bölümü de desteklenen Intel donanımı gerektirir.

Performans analizine yeni mi? [Çalışma zamanı performans analizine giriş](performans-analizine-giris.md)'den önce kurulum, izinler ve CPU/kapalı CPU ayrımı için performans analizi yapın, sonra buraya dönün. Eller açık olan yoldaş [perf ile CPU profili ve alev grafiği](../laboratuvarlar/cpu-profili.md)'dir.

## 0. beş komutta perf

perf birçok alt komutu olan bir programdır. Bir aceminin beşi gerekir:

| Komut | Ne işe yarıyor? | Teknik |
| --- | --- | --- |
| `perf list` | Bu makinenin sayabileceği veya örnek alabileceği olayları listeler | — |
| `perf stat ./prog` | tüm çalışma için olayları sayar ve toplamları yazdırır | sayım |
| `perf top` | canlı, sistem çapında en sıcak işlevlerin görünümü | örnekleme |
| `perf record -g ./prog` | programı `perf.data`'ye örnekler | örnekleme |
| `perf report` / `perf annotate` | `perf.data`: fonksiyona göre / talimata göre | analiz |

Diğer her şey (`perf trace`, `perf sched`, `perf diff`, `perf script`) bunların üzerine inşa edilir.

### Etkinlikler

`perf list` olayları çeşitlere ayırır. ** Donanım olayları**gibi `cycles`, `instructions`, `cache-misses`, ve `branch-misses` CPU'nun performans izleme biriminden (PMU) gelir.** Yazılım olayları **gibi `task-clock`, `context-switches`, ve `page-faults` çekirdek tarafından sayılır ve çoğu sanal makine dahil her yerde çalışır.** Tracepoints** `sched:sched_switch` veya `syscalls:sys_enter_openat` çekirdek olayları olarak adlandırılır, bpftrace'in kullandığı aynı olaylardır.

```bash
perf list hw
perf list sw
perf list 'sched:*'
```

### Okuma perf stat

```bash
perf stat -r 3 ./ornek
```

Çıktının olay başına bir satırı vardır. İlk önce önemli olan alanlar:

- **`task-clock`... `CPUs utilized`**: CPU zamanı kullanılır ve çalışma sırasında meşgul olan CPU'ların ortalama sayısı. 1.0 hakkında, çoğunlukla bekleyen bir program için 0'ye yakın tek bir meşgul iş parçacığı için.
- **`context-switches`**: iş parçacığının CPU'dan ne sıklıkta ayrıldığı. Düşük CPU kullanım noktasına sahip birçok anahtar bekleme noktası.
- **`page-faults`**: bellek sayfaları ilk kez dokunmuş veya diskten getirilmiştir.
- **`cycles`, `instructions`, `insn per cycle`**: döngü başına komutlar (IPC) CPU'nun ne kadar verimli çalıştığını gösterir; Düşük IPC genellikle bellek için bekleme anlamına gelir. Bunlar bir PMU'ya ihtiyaç duyar.
- **`+- 1.23%`**: `-r` ile, tekrarlanan çalışır arasındaki varyasyon.
- **`(66.67%)` bir satırın sonunda**: olay sadece o zamanın payı için sayıldı çünkü PMU'nun sayaçları (çoklu karıştırma); perf değeri ölçeklendirir. Kesin sayımlar için daha az olay talep edin.
- **`<not supported>` veya `<not counted>`**: olay burada kullanılamaz. Bu sıfır değildir.

### Çağrı grafikleri ve semboller

`perf record -g` varsayılan olarak çerçeve işaretçi zincirini kullanır. Çerçeve işaretçileri eksik olduğunda iki alternatif vardır:

```bash
perf record --call-graph dwarf ./ornek    # copies stack memory, unwinds later with debug info; large files
perf record --call-graph lbr ./ornek      # hardware last-branch record; supported Intel CPUs only, short depth
```

perf, çalışan ikililerin sembol tabloları ve hata ayıklama bilgileriyle adresleri isimlere dönüştürür. `perf report` çalıştırana kadar aynı dosyaları yerinde tutun; programı, sembol çözünürlüğünü kırmadan önce yeniden inşa edin. Her bir numunenin hangi ikili veya kütüphaneye ait olduğunu görmek için `perf report --sort dso,symbol` ve hangi yapıların kaydedildiğini görmek için `perf buildid-list` kullanın.


## 1. Donanım örneklemesi

Her talimatta durmak yerine, perf **örnekleme** kullanabilir.

Örnekler belirli sayıda PMU olayından (`-c` dönemi) sonra veya istenen bir hedef frekansta (`-F`) tetiklenebilir. Kayıtlar program sayacını ve isteğe bağlı olarak bir çağrı zincirini içerir. "Her milyon döngü" evrensel bir varsayılan değildir; çekirdek örnekleme oranlarını sınırlayabilir.

### Neden 99 Hz?

`-F 99` düşük maliyetli bir başlangıç noktası olabilir. Yuvarlak periyodik frekanslardan kaçınmak bazı takma ad alma risklerini azaltabilir, ancak tarafsız örneklemeyi garanti etmez. Çalışma süresini, örnek sayısını, kısıntı / kayıp uyarılarını ve diğer frekanslarda tekrarlanan yakalamaları karşılaştırın.

## 2. Perf kayıt / perf rapor iş akışı

Hedefin yürütme profilini kaydet:

```bash
perf record -F 99 -g -- ./ornek
```

Seçenekler:

- `-F 99`: Seçilen etkinlik için 99 Hz'nin hedef örnekleme frekansı isteyin; elde edilen oranı ölçün.
- `-g`: Yığın gevşetme için kayıt çağrı zincirleri.
- `--`: Perf seçeneklerini hedef komut ve argümanlardan ayırın.

Yakalandıktan sonra, `perf.data`'yi terminalde inceleyin:

```bash
perf report -g 'graph,0.5,caller'
```

Bu kılavuz, kendisine ait bir sayısal rapor göstermez; [perf ile CPU profili ve alev grafiği](../laboratuvarlar/cpu-profili.md) kontrol edebileceğiniz beklenen sonuçlarla bir tane üretir. Raporunuzu aşağıdakilerle kaydedin `perf report --stdio`. `[.]` kullanıcı-uzay sembollerini belirtir ve `[k]` çekirdek sembolleri. `Self` işlevin, seçilen etkinliğin kendi payıdır ve bu da saatin duvar saatini ölçmeye ihtiyaç duymaz. `Children` kümülatif soyundan katkılar içerebilir, bu da satırlar arasında örtüşmeye neden olur. `caller` arayan yönlendirmeyi gösterir; bu ağacı arayanların listesi olarak okumayın. Çağrı zinciri doğruluğu çerçeve işaretçisi / DWARF yöntemlerine ve yapıya bağlıdır.

### Alev grafikleri

Bir alev grafiği, tüm örneklenmiş yığınları bir kerede çizer: genişlik örneklerin payıdır, yükseklik yığın derinliğidir ve x ekseni zamana göre değil alfabetik olarak sıralanır. Her zamanki boru hattı Brendan Gregg'in komut dosyalarını kullanır:

```bash
perf script > out.perf
./FlameGraph/stackcollapse-perf.pl out.perf > out.folded
./FlameGraph/flamegraph.pl out.folded > out.svg
```

Üstte geniş platolar arayın: bu işlevler sadece başkalarını çağırmak değil, kendilerini çalıştırıyorlardı. [perf ile CPU profili ve alev grafiği](../laboratuvarlar/cpu-profili.md), katlanmış metni okumak da dahil olmak üzere eksiksiz bir örnekten geçer.

### Bekleyen için perf, sadece hesaplama değil

Örnekleme CPU döngüleri uyku ipliğini göremez. Bekleyen programlar için örnekleme yerine iki perf aracı izlenir:

```bash
sudo perf trace -s ./ornek           # per-thread system call counts and times
sudo perf sched record ./ornek       # scheduler events
sudo perf sched latency              # per-task scheduling delay summary
```

[perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](debug-is-akisi.md) ve [Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma](zamanlayici-izleri.md) bunları nasıl yorumlayacağını açıklar.

## 3. Intel İşlemci Trace

Sıradan örnekleme, her komutun bir kaydı değil, istatistiksel bir görünüm sağlar. Desteklenen Intel CPU'larda, ** Intel PT** sıkıştırılmış kontrol akışı ve zamanlama paketleri üretir. Bir kod çözücü, doğru çalıştırılabilir baytları kullanarak komut akışını yeniden yapılandırabilir; Bu, her komutun kendi kaydı veya zaman damgası olduğu anlamına gelmez.

Intel PT yakalamayı başlat:

```bash
# Record only user-space (//u) branches in the hardware buffer
perf record -e intel_pt//u -- ./ornek
```

Donanım izini komut odaklı bir sökme işlemine kodlayın:

```bash
perf script --insn-trace --xed
```

`--xed`, Intel XED desteği ile oluşturulmuş perf gerektirir; sürümünüzün `perf script -h`'sini kontrol edin. Sözdizimi ve çıktı alanları perf sürümüne bağlıdır. Burada çalıştırılan PT dökümü sunulmaz.

Intel PT, bir ptrace ilişkisi veya geleneksel yazılım kesme noktaları olmadan kontrol akışını gözlemleyebilir. Hala performans etkileri vardır ve büyük AUX veri hacimleri oluşturabilir. Tam tamponlar, kayıp iz, filtreler ve PSB senkronizasyonu boşluklar bırakabilir. Doğru kod görüntüsünün sağlanması özellikle JIT veya kendi kendini değiştiren kod için zordur. Akışın çözülmesi tüm kayıt / bellek durumunu kaydetmez ve deterministik yürütme tekrarı değildir. [Linux v6.1](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt).

## Derinlemesine inceleme

[Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](calisma-zamani-gecikmesi.md) için tıklayın ve [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](../laboratuvarlar/zamanlama-ve-bekleme.md) Tekrarlanabilir uyku/meşgul karşılaştırması ve `perf sched` Bekle-zamanı, runnable-delay analizine karşı.

[eBPF ile çalışma zamanı olaylarını gözlemleme](ebpf-ile-olaylar.md) ile olaylar] ile devam edin. [Gözlemin programa etkisi ve analiz karşıtı davranışlar](analiz-aracinin-etkisi.md) dosyasını okuyun ve analiz araçlarının bir hedef tarafından nasıl algılanabileceğini öğrenin.

## Kaynaklar

- [Linux Kernel: perf güvenlik belgeleri](https://docs.kernel.org/admin-guide/perf-security.html)
- [Intel PT Dokümantasyonu Linux Kernel](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)
- [Brendan Gregg: Linux perf Örnekleri](https://www.brendangregg.com/perf.html)
- [Brendan Gregg: Alev Grafiği](https://www.brendangregg.com/flamegraphs.html)
- [perf wiki öğretici](https://perfwiki.github.io/main/tutorial/)
- [perf-stat(1)](https://man7.org/linux/man-pages/man1/perf-stat.1.html) ve [perf-record(1)](https://man7.org/linux/man-pages/man1/perf-record.1.html)
