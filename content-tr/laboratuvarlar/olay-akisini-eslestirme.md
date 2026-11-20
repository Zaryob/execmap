---
title: Doğrudan ve kuyruklu çağrılarda altı olay sınırını eşleştirme
language: C++
description: Doğrudan çağrıları ve kuyruk geçişlerini inceleyin, aşamaların süresini altı olay işaretinden hesaplayın.
---

# Doğrudan ve kuyruklu çağrılarda altı olay sınırını eşleştirme

**6 kaynak kod işaretleyicisi** aracılığıyla bir olayı takip ederek bir gecikme bulun. Kayıt kodunu okuyun, derleyin, ham CSV'sinde bir dizi seçin ve zaman damgalarını kendiniz çıkarın. Ardından bir sıra ile tekrarlayın ve her işaretleyicinin hangi iş parçacığının üretildiğini gösterin.

Egzersiz bir analiz betiği gerektirmez. Son isteğe bağlı dama, satırları ve formülleri anladıktan sonra çalışmayı doğrulayabilir.

## Başlamadan önce

64-bit Linux, Bash, bir C++11 derleyicisi ve `awk` kullanın. [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](zamanlama-ve-bekleme.md) ilk Bash `read`, tamsayı çıkarma ve passed/CPU saat ayrımları için] tamamlayın. Bu dosya sadece leapsed zaman damgaları içerir.

Execmap deposunun kök dizininde çalıştırın:

```bash
cd examples/event-pipeline
```

Web sitesi okuyucuları ayrı bir dizin oluşturabilir ve [event_pipeline.cpp](../labs/event-pipeline/event_pipeline.cpp)'yi orada kaydedebilirler:

```bash
mkdir -p ~/execmap-labs/manual-pipeline
cd ~/execmap-labs/manual-pipeline
```

Hesaplamalar boyunca aynı Bash oturumunu açık tutun.

## 1. Her işaretleyicinin nasıl oluşturulduğunu okuyun

Dosyanın tamamını göster:

```bash
cat event_pipeline.cpp
```

Kayıt sınıfı:

```cpp
class TraceBuffer {
    long tid_;
public:
    std::vector<Record> records;
    explicit TraceBuffer(unsigned count) : tid_(syscall(SYS_gettid)) {
        if (tid_ < 1) throw std::runtime_error("cannot read thread identity");
        records.reserve(static_cast<std::size_t>(count) * 6);
    }
    void mark(unsigned seq, const char* event) {
        const auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
            Clock::now().time_since_epoch()).count();
        records.push_back(Record{ns, seq, tid_, event});
    }
};
```

Bir `TraceBuffer`, onu oluşturan iş parçacıklarına aittir. Yapılandırıcı, bu iş parçacığının Linux TID'sini alır ve depolamayı rezerve eder. `mark` sabit saati okur ve zaman damgası, dizi, TID ve olay adını birlikte saklar. Çalışan çalışırken bir satır yazdırmaz.

İşçinin vücudu tamamen incelenecek kadar küçüktür:

```cpp
class Worker {
    TraceBuffer& trace_;
public:
    unsigned completed = 0;
    explicit Worker(TraceBuffer& trace) : trace_(trace) {}
    __attribute__((noinline)) void process(unsigned seq) {
        trace_.mark(seq, "WORK_ENTER");
        ++completed;
        trace_.mark(seq, "WORK_EXIT");
    }
};
```

`WORK_ENTER` nesnenin sayacını artırmadan önce kaydedilir; `WORK_EXIT` daha sonra kaydedilir. Bu fark bu gövdeyi ve etrafındaki ölçüm maliyetlerini ölçer. Olay girişten önce ne kadar beklediğini ölçmez.

Arayan kişi üç işaret daha koyar:

```cpp
class Dispatcher {
    TraceBuffer& trace_;
    Worker& worker_;
    bool delay_;
public:
    Dispatcher(TraceBuffer& trace, Worker& worker, bool delay)
        : trace_(trace), worker_(worker), delay_(delay) {}
    __attribute__((noinline)) void dispatch(unsigned seq) {
        trace_.mark(seq, "DISPATCH_ENTER");
        trace_.mark(seq, "BEFORE_CALL");
        if (delay_ && seq == 3) std::this_thread::sleep_for(std::chrono::milliseconds(30));
        worker_.process(seq);
        trace_.mark(seq, "AFTER_CALL");
    }
};
```

`DISPATCH_ENTER`, işleyici girişini işaretler. `BEFORE_CALL`, kontrollü gecikme ve işçi aramasından hemen önce. `AFTER_CALL`'ye işçi döndükten sonra ulaşılıyor. `if`'ye dikkat edin: sadece dizi 3 bekler ve sadece `delay_` doğru olduğunda. `dispatch-wait` senaryosu, bayrağın; temel çizginin yapmadığı setleri.

Kaynak, `RECEIVED`'yi diziyi dağıtmadan önce yerleştirir. Doğrudan modda, göndericiyi aynı iş parçacığı üzerinde çağırır. Bu işlemler birlikte her dizi için altı işaret üretir.

## 2. Üç doğrudan çağrı oluşturun ve kaydedin

Çıktı dizinlerini oluştur:

```bash
mkdir -p build results
```

Derleme:

```bash
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread event_pipeline.cpp -o build/event_pipeline
```

Laboratuvarda 7 olarak `-std` C++11'yi seçer, `-g3` hata ayıklama bilgilerini ekler, `-O0` denetimini basit tutar, uyarı bayrakları teşhis talep eder, `-pthread` iş parçacığı desteği sağlar ve `-o` çıktıyı adlandırır. Tam kaynak, burada gösterilen alıntıların etrafında argüman denetimi ve CSV yazımı içerir.

Doğrudan temel çizgiyi çalıştır:

```bash
./build/event_pipeline direct baseline 3 direct-first results/direct.csv
```

argümanlar ** direct**çağrıları,** baseline**davranışı,**3**olayları, çalıştırılan etiket** direct-first** ve bir çıktı dosyası seçer. Çalıştırılan etiket bu yakalamayı tanımlar; her yeni çalıştırmada dizi numaraları 1'de yeniden başlatılır.

Formatı kontrol edin ve sayın:

```bash
head -n 1 results/direct.csv
wc -l results/direct.csv
```

Başlık `run_id,timestamp_ns,seq,tid,event`. **19 satırlarını bekleyin**: bir başlık artı üç olayın her biri için altı işaret.

Laboratuvar 7'den önemli fark: Geçen zaman damgası artık ** sütun 2** çünkü sütun 1 çalıştırıcı kimliğini tutar. Bir sütun numarasını körü körü körüne yeniden kullanmak yerine başlığı inceleyin.

## 3. Bir olayı izole edin ve kimliğini inceleyin

```bash
awk -F, '$1 == "direct-first" && $3 == 1' results/direct.csv
```

`-F,` virgülde bölünür. `$1` Run etiketini seçer ve `$3` sırayı seçer 1. Her iki koşul da gereklidir, bu nedenle başka bir olay veya çalışmadan gelen belirteçler hesaplamaya ikame edilemez.

Bu isimleri sırasıyla görmelisiniz:

```text
RECEIVED
DISPATCH_ENTER
BEFORE_CALL
WORK_ENTER
WORK_EXIT
AFTER_CALL
```

4 sütununu kontrol edin: Altı TID'nin hepsi de bu doğrudan kayıtta eşleşmelidir. Henüz bir sırayı geçmedik.

Altı adet geçilen zaman damgasını ayrı dosyalara ayıklayın:

```bash
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "RECEIVED" { print $2 }' results/direct.csv > results/received.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "DISPATCH_ENTER" { print $2 }' results/direct.csv > results/dispatch.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "BEFORE_CALL" { print $2 }' results/direct.csv > results/before.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "WORK_ENTER" { print $2 }' results/direct.csv > results/work-enter.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "WORK_EXIT" { print $2 }' results/direct.csv > results/work-exit.ns
awk -F, '$1 == "direct-first" && $3 == 1 && $5 == "AFTER_CALL" { print $2 }' results/direct.csv > results/after.ns
```

Her komut aynı görünür işlemi gerçekleştirir: çalıştırma, dizi ve olay seçin; zaman damgası sütunu 2 yazdırın; bir değer bir dosyaya yönlendirin. Her dosya tam olarak bir tamsayı içermelidir. Herhangi bir değer eksikse seçilen altı satırı yeniden kontrol edin.

Bu değerleri değişkenlere yükle:

```bash
read -r LAB_RECEIVED_NS < results/received.ns
read -r LAB_DISPATCH_NS < results/dispatch.ns
read -r LAB_BEFORE_NS < results/before.ns
read -r LAB_WORK_ENTER_NS < results/work-enter.ns
read -r LAB_WORK_EXIT_NS < results/work-exit.ns
read -r LAB_AFTER_NS < results/after.ns
```

Burada satır başına sadece bir değer vardır, bu nedenle `read` virgül ayırıcıya ihtiyaç duymaz. `<` dosyayı komuta sağlar. `-r` girdiyi gerçek olarak tutar.

## 4. Beş bitişik aşamayı hesaplayın

```bash
LAB_HANDOFF_NS=$((LAB_DISPATCH_NS - LAB_RECEIVED_NS))
LAB_PREPARE_NS=$((LAB_BEFORE_NS - LAB_DISPATCH_NS))
LAB_TRANSITION_NS=$((LAB_WORK_ENTER_NS - LAB_BEFORE_NS))
LAB_WORK_NS=$((LAB_WORK_EXIT_NS - LAB_WORK_ENTER_NS))
LAB_RETURN_NS=$((LAB_AFTER_NS - LAB_WORK_EXIT_NS))
```

Her çıkarmayı kaynağa karşı tekrar okuyun:

1. Receipt  gönderici girişi: işleme başlamadan önce zaman.
2. Dispatcher girişi  ön arama: caller preparation.
3. işçi girişi: işçiye geçiş, bu çağrıdan önce eklenen herhangi bir bekleme dahil.
4. İşçi girişi  işçi çıkışı: Geçen işçi gövdesi.
5. İşçi çıkışı  çağrı sonrası: Arayanın bir sonraki işaretleyicisine kadar geçen süre.

Hesapladığınız sayıları yazdırın:

```bash
printf 'receipt to dispatcher: %s ns\n' "$LAB_HANDOFF_NS"
printf 'dispatcher preparation: %s ns\n' "$LAB_PREPARE_NS"
printf 'before-call to worker: %s ns\n' "$LAB_TRANSITION_NS"
printf 'worker body: %s ns\n' "$LAB_WORK_NS"
printf 'worker return to caller: %s ns\n' "$LAB_RETURN_NS"
```

Arayan kişinin tüm ölçülen çağrısı farklı bir çıkarmadır:

```bash
LAB_CALL_NS=$((LAB_AFTER_NS - LAB_BEFORE_NS))
printf 'whole caller interval: %s ns\n' "$LAB_CALL_NS"
printf 'sum of its three stages: %s ns\n' "$((LAB_TRANSITION_NS + LAB_WORK_NS + LAB_RETURN_NS))"
```

Bu son iki tamsayı aynı fikirde olmalı: aynı bahis uçlarını kullanıyorlar. Bu aritmetik kontrol yanlış eşleşmeyi yakalamaya yardımcı olur. Hesaplama için tamsayı nanosaniyesini tutun; son farkı sadece milisaniyeler görüntülendiğinde bir milyona bölün.

### Geçişlerine karşı iki ardışık giriş aralığını kontrol edin

Aynı `direct-first` çalışmasından ilk iki diziyi kullanın. Yukarıdaki değişkenler hala 1'nin `BEFORE_CALL` ve `WORK_ENTER` dizisini tutar. 2'nin eşleşen işaretleyicilerini ayıklayın:

```bash
awk -F, '$1 == "direct-first" && $3 == 2 && $5 == "BEFORE_CALL" { print $2 }' results/direct.csv > results/before-2.ns
awk -F, '$1 == "direct-first" && $3 == 2 && $5 == "WORK_ENTER" { print $2 }' results/direct.csv > results/work-enter-2.ns
cat results/before-2.ns results/work-enter-2.ns
read -r LAB_BEFORE_2_NS < results/before-2.ns
read -r LAB_WORK_ENTER_2_NS < results/work-enter-2.ns
LAB_CALLER_GAP_NS=$((LAB_BEFORE_2_NS - LAB_BEFORE_NS))
LAB_WORKER_GAP_NS=$((LAB_WORK_ENTER_2_NS - LAB_WORK_ENTER_NS))
LAB_TRANSITION_2_NS=$((LAB_WORK_ENTER_2_NS - LAB_BEFORE_2_NS))
printf 'worker gap minus caller gap: %s ns\n' "$((LAB_WORKER_GAP_NS - LAB_CALLER_GAP_NS))"
printf 'transition 2 minus transition 1: %s ns\n' "$((LAB_TRANSITION_2_NS - LAB_TRANSITION_NS))"
```

Her iki çıkarılmış dosyada bir tamsayı olmalıdır. İki basılı fark tam olarak aynı fikirde olmalıdır: arayan ve işçi girdileri `C1`, `C2`, `W1` ve `W2` ise, daha sonra `(W2-W1)-(C2-C1) = (W2-C2)-(W1-C1)`. Bu aynı dört zaman damgasından bir kimliktir, zamanlamanın düzenli olduğu iddiası değildir.

Her iki eşli geçiş de küçükse, iki giriş aralığı arasındaki keyfi olarak büyük bir anlaşmazlığı açıklayamazlar. Anlaşmazlığı "farklı metriklere" bağlamadan önce koşu, dizi, TID, saat, eksik satırlar ve olay tanımlarını kontrol edin. Kuyruk teslimi ile, aynı diziyi iş parçacıkları arasında koruyun ve hangi girdinin bitişik olduğunu eşleştirmek yerine siparişleri onaylayın.

## 5. İşçi girişinden önce bilinen bir bekleyiş koyun

Yeni bir çalışma kaydet:

```bash
./build/event_pipeline direct dispatch-wait 3 direct-wait results/direct-wait.csv
awk -F, '$1 == "direct-wait" && $3 == 3' results/direct-wait.csv
```

İkinci komut, **Sıra 3**'yi seçer, çünkü bu, gönderici kaynağında uyuyan daldır. 1'nin ön aramasını 3'nin girişi ile karşılaştırmayın.

Etkilenen aşamayı ve işçi gövdesini bu diziden hesaplayın:

```bash
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "BEFORE_CALL" { print $2 }' results/direct-wait.csv > results/wait-before.ns
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "WORK_ENTER" { print $2 }' results/direct-wait.csv > results/wait-enter.ns
awk -F, '$1 == "direct-wait" && $3 == 3 && $5 == "WORK_EXIT" { print $2 }' results/direct-wait.csv > results/wait-exit.ns
read -r LAB_WAIT_BEFORE_NS < results/wait-before.ns
read -r LAB_WAIT_ENTER_NS < results/wait-enter.ns
read -r LAB_WAIT_EXIT_NS < results/wait-exit.ns
printf 'caller-to-worker transition: %s ns\n' "$((LAB_WAIT_ENTER_NS - LAB_WAIT_BEFORE_NS))"
printf 'worker body: %s ns\n' "$((LAB_WAIT_EXIT_NS - LAB_WAIT_ENTER_NS))"
```

İlk fark kasıtlı 30 ms beklemeyi içermelidir; ikincisi kısa kalabilir. Ek süreyi bir özet etiketi yerine kaynak yerleştirme ve eşleşen satırlarla belirlediniz. İşçi vücudunun tüm geçiş aralığını aldığını söylemek yanlış olur.

## 6. Bunun yerine makbuz öncesi bekleyin

Kaynak döngü şu ayrı durumu içerir:

```cpp
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            if (scenario == "source-gap" && seq == 3)
                std::this_thread::sleep_for(std::chrono::milliseconds(30));
            source.mark(seq, "RECEIVED");
```

`source-gap`, `RECEIVED` dizisi için 3'den önce bekleme süresini ekler. Normal döngü zaten yinelemeler arasında 10 ms uyur.

```bash
./build/event_pipeline direct source-gap 3 source-wait results/source-gap.csv
awk -F, '$1 == "source-wait" && $5 == "RECEIVED" { print $3, $4, $2 }' results/source-gap.csv
```

Basılı alanlar dizi, TID ve geçilen zaman damgasıdır. 2 ve 3 dizileri için makbuz zaman damgalarını seçin ve bunları çıkarın:

```bash
awk -F, '$1 == "source-wait" && $3 == 2 && $5 == "RECEIVED" { print $2 }' results/source-gap.csv > results/source-second.ns
awk -F, '$1 == "source-wait" && $3 == 3 && $5 == "RECEIVED" { print $2 }' results/source-gap.csv > results/source-third.ns
read -r LAB_SOURCE_SECOND_NS < results/source-second.ns
read -r LAB_SOURCE_THIRD_NS < results/source-third.ns
printf 'receipt 2 to receipt 3: %s ns\n' "$((LAB_SOURCE_THIRD_NS - LAB_SOURCE_SECOND_NS))"
```

Bu, 3 etkinliğinin içinde bir süre değil, iki olay arasındaki  giriş aralığıdır. Eklenen bekleyiş burada görülmelidir; keyfi sistem yükü altında 40 ms ile tam eşitlik gerektirmez.

## 7. Gerçek kuyruk teslimini inceleyin

Kuyruklu modda, kaynak bir dizi yayınlamak için bu dalı kullanır:

```cpp
                {
                    std::lock_guard<std::mutex> lock(mutex);
                    queue[available++] = seq;
                }
                ready.notify_one();
```

Kilit paylaşılan kuyruğu ve sayımı korur. `notify_one`, bekleyen tüketiciyi bilgilendirir; bu, tüketicinin etkinliği zaten çalıştırdığı veya tamamladığı anlamına gelmez.

Tüketici şunları okur:

```cpp
        if (mode == "queued") {
            consumer = std::thread([&] {
                try {
                    TraceBuffer trace(count);
                    Worker worker(trace);
                    Dispatcher dispatcher(trace, worker, scenario == "dispatch-wait");
                    unsigned read = 0;
                    for (;;) {
                        std::unique_lock<std::mutex> lock(mutex);
                        ready.wait(lock, [&] { return read < available || done; });
                        if (read == available && done) break;
                        const unsigned seq = queue[read++];
                        lock.unlock();
                        dispatcher.dispatch(seq);
                    }
                    consumer_records = std::move(trace.records);
                } catch (...) { consumer_error = std::current_exception(); }
            });
        }
```

`std::thread` tüketici işlevini başlatır. `[&]` yakalaması, `main`'deki paylaşılan kuyruk ve senkronizasyon nesnelerine atıfta bulunmasını sağlar. `TraceBuffer`, `Worker` ve `Dispatcher`, bu tüketicinin içinde inşa edilmiştir, bu nedenle belirteçleri tüketici TID'sini ve kendi tamponunu kullanır. Üreticinin ayrı bir kaynak tamponu vardır.

`ready.wait`, beklerken muteks'i serbest bırakır ve geri almadan önce tekrar alır. Önad, iş mi yoksa kapanma mı olduğunu kontrol eder. Sıradan bir dizi kopyaladıktan sonra, `unlock`, göndericiyi çağırmadan önce  muteks'i serbest bırakır. Bu nedenle, üretici daha sonra olayları, gönderici çalışırken veya uyurken düzenleyebilir.

Üretici döngüyü tamamladığında `main` tüketiciyi kapatır ve kayıtlarını toplar:

```cpp
        if (consumer.joinable()) {
            {
                std::lock_guard<std::mutex> lock(mutex);
                done = true;
            }
            ready.notify_one();
            consumer.join();
            if (consumer_error) std::rethrow_exception(consumer_error);
        }
        source.records.insert(source.records.end(), consumer_records.begin(), consumer_records.end());
        std::stable_sort(source.records.begin(), source.records.end(),
                         [](const Record& a, const Record& b) { return a.ns < b.ns; });
```

`done` aynı sessizliği tutarken değiştirilir. Bildirim, tüketici bildirimin kapanmasına izin verir; döngü çıkmadan önce yayınlanmış çalışmaları hala boşaltır. `join`, iş parçacığının bitmesini bekler, tamamlanmış tamponunu `main`'ye hazır hale getirir. Sadece o zaman kayıtlar birleştirilir ve sıralanır. Depolanmış bir tüketici istisnası, tamamlanmış bir yakalamayı sessizce bildirmek yerine yeniden atılır.

Sıralı bir temel kayıt ve 1 dizisini göster:

```bash
./build/event_pipeline queued baseline 3 queued-first results/queued.csv
awk -F, '$1 == "queued-first" && $3 == 1 { print $3, $4, $5, $2 }' results/queued.csv
```

Çıktı dizi, TID, olay, zaman damgasıdır. `RECEIVED` üreticiye aittir; diğer beş işaretçi tüketiciye aittir. Ortak dizi onları birbirine bağlar. Üreticinin TID'sine göre her şeyi filtrelemek tüketicinin işaretçilerini kaybeder.

## 8. Sıralı bir etkinliğin ölçülmesi kendinizi bekleyin

Tüketicinin 3 dizisinin içinde beklemesine izin verin, üretici daha sonraki dizileri almaya devam ederken:

```bash
./build/event_pipeline queued dispatch-wait 6 queued-wait results/queued-wait.csv
awk -F, '$1 == "queued-wait" && $3 == 4' results/queued-wait.csv
```

Şimdi makbuzu ölçün  **Sınıf 4** için gönderici girişi, TID'leri farklı olsa da iki kez damgasını kullanarak:

```bash
awk -F, '$1 == "queued-wait" && $3 == 4 && $5 == "RECEIVED" { print $2 }' results/queued-wait.csv > results/queued-received.ns
awk -F, '$1 == "queued-wait" && $3 == 4 && $5 == "DISPATCH_ENTER" { print $2 }' results/queued-wait.csv > results/queued-dispatch.ns
read -r LAB_QUEUED_RECEIVED_NS < results/queued-received.ns
read -r LAB_QUEUED_DISPATCH_NS < results/queued-dispatch.ns
printf 'sequence 4 receipt to handler: %s ns\n' "$((LAB_QUEUED_DISPATCH_NS - LAB_QUEUED_RECEIVED_NS))"
```

Bu aralık büyüyebilir çünkü tüketici daha önceki bir olayla meşguldür. Gerçek yük, backlog'un birikip birikmediğini ve ne kadarının birikip birikmediğini değiştirebilir. Aralık, uygulama kuyruğu ve zamanlama fırsatlarını içerir; saf bir çalışmaya hazır bekleme ölçümü değildir. Doğrudan bir çağrı ayrıca kaynak döngüyü de engeller, böylece bir arayan gecikmesi de orada daha sonraki bir makbuzu değiştirebilir.

Buradaki tüm zaman damgaları aynı işlemin sabit saatini kullanır, bu da bu geçilen çıkarmayı anlamlı kılar. Farklı ipliklerden gelen iş parçacığı CPU sayaçları aynı şekilde karşılaştırılamaz. Tamponlar `join`'den sonra birleştirilir, daha sonra CSV çıkışı için geçilen zaman damgasına göre sıralanır; dosya konumu tek başına bir çağrı kimliği değildir.

## Dama kullanmadan önce ne gösterilmelidir

Bir doğrudan dizinin beş bitişik farkını ve eşleşen arayan toplamını göster. `dispatch-wait` için değiştirilen aşamayı, `source-gap` için makbuz aralığını ve sıralı bir olay için üretici / tüketici TID'lerini göster. Her sonucu, kaynaktaki tam işaretleyici yerleşimine işaret ederek açıklayın.

Çıkarılan herhangi bir dosya boşsa, birkaç satır içeriyorsa veya farklı bir çalışma / dizi kimliğine sahipse, çıkarmadan önce durun. Kaynak ve ayrıştırıcı kasıtlı olarak bir üretici, bir FIFO tüketicisi ve tekrarlama olmadan sınırlıdır; bunlar genel dağıtılmış bir izleme uygulaması değildir.

## İsteğe bağlı: tam dosyayı kontrol edin ve nesneleri inceleyin

Manuel çalışmadan sonra, bu laboratuvarın [analyze.py](../labs/event-pipeline/analyze.py) dosyasını indirebilir ve sonuçlarını karşılaştırabilirsiniz:

```bash
python3 analyze.py results/direct.csv --mode direct --expected-count 3
```

Tamamlayıcılık, sipariş verme, çalıştırma/sıralama kimliği ve seçilen iş parçacığı ilişkisini kontrol eder. Programın `[run_id, sequence]` eşleşmesi, 7'nin aynı iş parçacığı zamanlama dosyasından farklıdır, bu nedenle analizörler değiştirilebilir değildir.

[GDB ile C++ çağrı zincirleri, nesneler ve yazmaçlar](../rehberler/cpp-cagri-zinciri.md), bu genel nesnelerde durmanızı ve üye sayacını incelemenizi sağlar. Depo kökünden `python3 scripts/verify-debugging-labs.py --require-linux --gdb`, regresyon kontrollerini çalıştırır. [doğrulama kaydı](../labs/event-pipeline/validation.txt) araç kapsamını tanımlar; ham-satır egzersizinin yerini almaz.

## Kaynaklar

- [C++ staint_clock](https://eel.is/c++draft/time.clock.steady) saat sözleşmesini tanımlar.
- [Linux gettid](https://man7.org/linux/man-pages/man2/gettid.2.html), OS iş parçacığı kimliğini tanımlar.
- [GDB C++ ifadeleri](https://sourceware.org/gdb/current/onlinedocs/gdb.html/C-Plus-Plus-Expressions.html), takip eden üye denetimini destekler.

- [GNU Bash kılavuzu: aritmetik genişleme](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) ve [Bash buildins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) kabuk hesaplamalarını ve `read`'yi belgelemektedir.
