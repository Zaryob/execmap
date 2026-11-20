---
title: Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma
description: Zamanlayıcı olaylarından engellenmiş ve çalışmaya hazır aralıkları çıkarın, perf raporlarını doğrulayın.
---

# Zamanlayıcı zaman çizelgelerini ve sürüme bağlı raporları okuma

Bir uygulama işaretleyicisi, bir iş parçacığının ilerlemeyi gözlemlediği yeri belirtir. Bir zamanlayıcı izi, bir görevin çalıştırılabilir hale geldiğinde, bir CPU'yu bıraktığında veya çalışmaya başladığında söyler. Görev kimliği ve açık bir zaman ilişkisi ile bunları bağlayın. Uzun bir işçi giriş aralığı tek başına bir zamanlayıcı gecikmesini tanımlamaz.

[Süreç ve iş parçacığı durumu](process-thread-ve-zamanlayici.md) ile başlayın, ardından olayları toplamak ve bir aralığı kendiniz hesaplamak için [planlama zaman çizelgesi laboratuvarı](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md)'yi tamamlayın.

## 1. Üç olay sınırını ayırt edin

`sched_switch`, `prev_pid`'deki giden görevi ve `next_pid`'deki gelen görevi adlandırır. Bu alanlar, `pid` son ekine rağmen görevleri (TID'ler) tanımlar. `sched_wakeup`, bir görevin çalıştırılabilir hale gelmesini belirtir; bu, görevin hemen çalıştırıldığı anlamına gelmez. Etkinliğin yayan görevi, mutlaka uyandırılan görev değildir.

Bir uyku görevi için, geçişten bir sonraki geçişe geçiş aralığı, çalıştırılabilir beklemenin ardından engellenmiş zamanı içerir. Eşleşen bir uyanıştan geçişe kadar olan aralık, ilgili olayların mevcut olması ve uyanışın aslında çalıştırılabilir aralıkta başlaması koşuluyla, çalıştırılabilir kısmı tahmin eder.

Önceden boşaltılmış bir çalıştırılabilir görev, yeni bir uyandırma olmadan geçiş yapabilir ve daha sonra geri dönebilir. Çalıştırılabilir bekleyişi, geçiş noktasında başlar. Bu nedenle, her geçişi yalnızca bir uyandırma ile eşleştirmek bir bekleme sınıfı kaybeder. Kaydedilen geçiş durumunu ve hedef çekirdeğin izleme noktasını tanımını kullanarak bu durumları ayırt edin.

Aktif tracefs mount altında `sched_switch/format` ve `sched_wakeup/format` dosyalarını inceleyin. [lab'in keşif komutları](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md#1-record-the-tool-and-tracepoint-contract) yerine evrensel sayısal `prev_state` maskesini varsayalım kullanın. İnsan tarafından okunabilir `perf script` çıkışı ve bir bpftrace sayısal alanı farklı gösterimlerdir.

## 2. Perf'in sütunlarını kapsamları ile okuyun

`perf sched timehist` etiketleri ** bekleme süresi**, **sch gecikme**ve** çalışma süresi**. [Linux v6.12 perf dokümantasyon](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-sched.txt), geçişten sonraki geçişe ve zamanlama gecikmesinden çalıştırılabilirden çalışmaya kadar bekleme süresini tanımlar. Zamanlama gecikmesi, bekleme aralığının içine aittir; her iki çift sayım süresini de ekler. Gösterilen çalışma zamanı değeri, aracın yeniden yapılandırılmış bir çalışma aralığını, C' ++ çalışma aralığını ifade etmez.

`perf sched latency`, görevle ilgili gecikmeleri özetlemektedir. Ortalaması ve maksimumu maksimum işlev süresi değildir. Bazı görünümler, bir adı paylaşan görevleri birleştirir; sayısal kimliği korur ve kurulu alt komutun yardımını kontrol eder. `perf sched map`, CPU / görev doluluğunu gösterir ve bir gecikme sırasında komşuların incelenmesine yardımcı olur; buna neden olan uygulama açıklamasını adlandıramaz.

Yakalama başlığını ve ham deşifre edilmiş olayları raporun yanında kaydedin. Kaydın başında veya sonunda eksik bir aralık veya aradaki kayıp kayıtlar yeniden yapılandırmayı önleyebilir. Boş bir rapor veya kullanılamıyor izleme noktası ölçülen bir sıfır değildir.

## 3. Deneyin bir parçası olarak analizör sürümünü tedavi edin

Çalışan çekirdek, iz noktası kayıtları üretir; yüklü perf ikilisi aralıkları yeniden oluşturur. Hem madde hem de sürüm dizeleri eşleşmemelidir. Dağıtım geri bağlantıları, beklediğiniz yukarı akış sürüm numarasını değiştirmeden analiz değiştirebilir.

Yukarı akış [timehist change d363c2a](https://github.com/torvalds/linux/commit/d363c2a880c611eea3d754a618b6125bac7f3044), hala çalışırken / çalıştırılabilirken değiştirilen görevler için zamanlama gecikmesi muhasebesi ekler. Daha önceki mantık, uyandırma zaman damgalarını kullandı ve bu önkoşul davasını kaçırabilir. Yakalamaları karşılaştırırken, perf paketini / inşasını kaydedin ve bu davranışın dahil edilip edilmediğini belirleyin. Farklı bir zamanlama gecikme sütunu, değişen bir iş yükü yerine değiştirilmiş yeniden yapılandırmayı yansıtabilir.

Şüpheli bir tutarsızlık için, bir giden çalıştırılabilir anahtarı, aynı TID için daha sonra gelen anahtarı ve araya giren uyandırmaları bulun. Ham olaylardan farkı hesaplayın. Bu belirli aralığı, toplam dağılımları karşılaştırmadan önce raporla karşılaştırın. Olay kaybı veya belirsiz eşleşme bu hesaplamayı engelliyorsa, bu sınırlamayı bildirin.

## 4. Uygulama ve zamanlayıcı kanıtlarını dikkatlice bağlayın

Çalıştırma kimliği, TID, dizi, çalıştırılabilir kimlik, yakalama sınırları ve saat seçimi tutun. C++ standardı `steady_clock`'nin bir çekirdeği izleme saati ile bir dönemi paylaştığını vaat etmez. Hedef üzerindeki ilişkilerini doğrulayana kadar iki akıştan mutlak zaman damgaları çıkarma. Kısa kalibrasyon belirteçleri bir ilişki kurabilir ve ofset / sürüklenmeyi açığa çıkarabilir; zaman damgaları tek başına birçok basamakla basılamaz.

Kontrollü bir kaynak gecikmesi, tüketici derhal programlanırken daha sonraki tüm işleri değiştirebilir. Tersine, bir tüketici iş geldikten sonra çalıştırılabilir bekleyebilir. Uygulama aralığını bulmak için [altı işaretli olay lab](../laboratuvarlar/olay-akisini-eslestirme.md)'yi ve bu aralıktaki görevi araştırmak için zamanlayıcı kayıtlarını kullanın. İki tür kanıt, sorunun farklı bölümlerini yanıtlar.

## 5. Yakalamayı dar ve tekrarlanabilir tutun

Sonlu sıradan bir politika iş yükü, kısa bir kayıt ve çağrı zinciri koleksiyonu olmadan başlayın. Kayıt CPU kullanılabilirliği, afinite, çekirdek / perf sürümleri, izleme saati, tam komut, ham dosya, kayıp olay teşhisleri ve eşleşen uygulama çıktısı. Sistem çapında bir zamanlayıcı yakalama yararlıdır, çünkü uyandırmalar başka bir yerden kaynaklanabilir; Gerçek TID tarafından nihai raporu filtrelemek, toplama zamanında gerekli bağlamı düşürmeden daha güvenlidir.

Daha büyük bir tampon bazı kayıpları azaltabilir, ancak zaten eksik bir izi onarmaz. İzleme davranışı değiştirir veya makineyi asarsa, [İzleme hatalarını ve sistem donmalarını inceleme](izleme-donmalari.md) izleyin Yakalama karmaşıklığını arttırmadan önce.
