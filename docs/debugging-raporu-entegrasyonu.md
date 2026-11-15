# Linux C++ debugging raporu: genelleştirme ve yayın eşlemesi

İnceleme: 15 Kasım 2026. Kullanıcının eklediği rapor öğretici malzeme olarak incelendi. İçindeki geçmiş konuşma anlatımı, yapılacak test önerileri ve ölçüldüğü bildirilen sayılar bu oturumun talimatı veya bağımsız doğrulanmış kanıtı sayılmadı. Geçmiş özel uygulamadaki gecikmenin nedeni hakkında yeni bir sonuç çıkarılmadı.

Kaynak raporun SHA-256 değeri: `bf6ccf77f7eebf63f622a894b5f007f05b59cf9c59d73c84c70cda3d5c583c57`.

## Mevcut içerikle örtüşen bölümler

Çağrı aralığı/elapsed/thread CPU/off-CPU/runnable ayrımı, açık BPF saat seçimi, perf stat ve sched kapsamı, GDB attach/remote kaynak eşleme, tracing sırasında donmanın ayrı araştırılması daha önce eklenen [runtime kılavuzunda](../content/rehberler/calisma-zamani-gecikmesi.md) ve [zamanlama laboratuvarında](../content/laboratuvarlar/zamanlama-ve-bekleme.md) korunuyor. Aynı bilgileri ikinci bir araç dokümanı olarak kopyalamadım; yeni sayfalardan bu akışa bağlantı verdim.

Raporun çıplak `nsecs` için yaptığı genel monotonic kabulü taşınmadı: mevcut BPF örnekleri açık `nsecs(monotonic)` kullanıyor. Elapsed ölçüm CPU execution süresi olarak adlandırılmadı. Chrono örnekleri için C++17 zorunluluğu getirilmedi; C++11 yeterli. Önceki aralık tablolarından ortalama/medyan veya nedensellik yeniden üretilmedi.

## İki yeni kılavuz

[Process, thread ve scheduler durumu](../content/rehberler/process-thread-ve-zamanlayici.md), raporun process/thread, procfs, policy, affinity, frekans ve PSI konularını bir başlangıç akışında birleştiriyor. PID/TID/CPU/debugger thread numarası ayrımı, kümülatif sayaçların farkı, istatistiklerin kapalı olma durumu ve gözlem penceresi açıklanıyor. Sabit bir CPU listesi, governor sonucu veya gerçek zamanlı priority değeri çözüm olarak önerilmiyor.

[C++ çağrı zincirini GDB ile inceleme](../content/rehberler/cpp-cagri-zinciri.md), genel üye fonksiyonları ve nesne durumunu kullanıyor. `this`, member breakpoint, stack, source/instruction stepping, isim çözümleme, x86-64 giriş register'larının sınırı, watchpoint ve bellek hatası kanıtı ayrılıyor. Tek bir backtrace veya şaşırtıcı register değeri stack corruption olarak sunulmuyor. Remote debug mevcut SSH-stdio örneğine bağlanıyor; yeni bir özel IDE/host yapılandırması eklenmiyor.

## İki yeni laboratuvar

[Altı noktalı olay eşleştirme](../content/laboratuvarlar/olay-akisini-eslestirme.md), `Dispatcher`, `Worker`, `TraceBuffer` sınıflarından oluşan genel bir C++11 programı kullanıyor. Olaylar `RECEIVED`, `DISPATCH_ENTER`, `BEFORE_CALL`, `WORK_ENTER`, `WORK_EXIT`, `AFTER_CALL`. Özel ağ/protokol/framework adları, generated connector sınıfları ve eski ölçüm etiketleri aktarılmadı.

Programın `direct` ve `queued` modları var. İkinci moddaki handoff, uygulama içindeki kuyrukta gerçekleşiyor; tüketici içindeki dispatcher→worker çağrısı yine senkron. Böylece TID ve sequence ID'nin farklı görevleri gerçek bir küçük örnekte gösteriliyor. Buffer'lar thread başına ayrılıyor, çıktı join sonrasında yazılıyor. Kaynak boşluğu ve çağıran içinde bekleme kontrollü olarak farklı sınırlara yerleştiriliyor. Bunlar özel uygulamanın ölçümleri veya scheduler benchmark'ı değil.

[Thread sayaçlarını örnekleme](../content/laboratuvarlar/thread-sayaclari.md), mevcut zamanlama programını sonlu hedef olarak kullanıyor. Python okuyucu procfs'ten process/thread start-time kimliğini ve `schedstat` örneklerini alıyor. Ayar yazmıyor. İstatistikler kapalı/belirsizse runnable wait JSON null; hedef kaybolur veya kimlik değişirse unavailable. Start-time çözünürlüğü ve atomik olmayan procfs okuması açık sınırlamalar.

## Tekrar üretme ve otomatik doğrulama

Kaynaklar `examples/event-pipeline/` ve `examples/thread-observation/` altında. Siteye yalnız belirlenen kaynak dosyaları kopyalanıyor; build, ham CSV, JSON ve loglar yayınlanmıyor. İndirilen dosyalarla doğrulanan kaynakların bayt eşitliği site testinde kontrol ediliyor.

Linux depo kökünden:

```sh
python3 scripts/verify-debugging-labs.py --require-linux --gdb
npm run check
npm run test:browser
```

Verifier iki mod × üç senaryoyu, bilinen sentetik aşama sürelerini, thread'ler arası invocation eşleştirmeyi, eksik/bozuk/karışmış kayıtları, genel C++ GDB oturumunu ve canlı sonlu task örneğini kontrol ediyor. Kontrollü 30 ms beklemenin çevreleyen ölçümde görülmesi için geniş bir alt sınır kullanılıyor; genel performans veya deadline eşiği uygulanmıyor. Procfs fixture'ları kimlik değişimi, geriye giden sayaç ve kapalı istatistik yorumunu sınar.

Raporlar `output/debugging-validation/` altında; yerel Linux konteyneri çalışmasında `output/debugging-validation-linux/` kullanıldı. Komutlar, sürümler, kaynak/binary hash'leri, CSV'ler ve loglar birlikte tutuluyor. Gerçekte tamamlanan adımlar [yayımlanan doğrulama kaydında](../examples/event-pipeline/validation.txt).

Arama, katalog, okuma rotaları, önceki/sonraki sayfalar ve mevcut runtime CI işi güncellendi. Önceki yerel değişiklikler korunuyor. Bu ek rapor için de commit yapılmadı.
