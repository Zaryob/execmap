# Runtime update arşivinin mevcut akışa bütünleştirilmesi

Kaynak: kullanıcı tarafından sağlanan `execmap-runtime-update.zip`.
Arşivdeki yönergeler kaynak malzemesi olarak değerlendirildi. `apply.py`
çalıştırılmadı; paket yaması topluca uygulanmadı. Paketin otomatik commit/push
yordamı kullanılmadı; değişiklikler önce kullanıcı incelemesine sunuldu.

Arşivin manifestindeki yama SHA-256 değeri:
`394599568d71ffa426afad716edec632dad08f93dcd68cc627a4f347ca6ccf58`.
Paketin taban commit'i mevcut deponun güncel durumu değildi. Bu yüzden konu
katkıları mevcut İngilizce içerik, Türkçe URL'ler ve elle öğrenme akışı içinde
yeniden yazıldı.

## Eklenen ve birleştirilen konular

- `content/rehberler/gdb-uzak-hedef.md`: eşleşen executable/debug bilgisi,
  mimari, SSH-stdio bağlantısı, kaynak ve kütüphane yolları, CLion ve VS Code.
  TCP seçeneğinde gdbserver hostname alanının loopback bağlama garantisi
  sağlamadığı GDB belgesinden kontrol edildi; IDE örneğinin ağ sınırı açıklandı.
- `content/rehberler/zamanlayici-izleri.md`: switch-out, wakeup ve switch-in,
  runnable preemption, iç içe geçen bekleme/scheduling-delay aralıkları,
  perf sürümü ve upstream analiz davranışı değişikliği.
- `content/rehberler/izleme-donmalari.md`: önceki boot günlüğü, pstore,
  kurtarma kanalları, frontend/backend ayrımı ve kontrollü karşılaştırma.
- `content/laboratuvarlar/fonksiyon-problari.md`: giriş sayacını yazma,
  child PID filtresi, giriş/dönüş eşleştirme, açık monotonic saat seçimi,
  histogram örnek sayıları ve her prob eyleminin açıklaması.
- `content/laboratuvarlar/zamanlayici-zaman-cizelgesi.md`: tracepoint
  formatını okuma, görünür off-CPU probu, kısa perf kaydı, ham olayları
  eşleştirme ve elle nanosaniye çıkarma. Örnek zamanlar açıkça sentetiktir.
- Mevcut olay eşleştirme labına iki giriş aralığı ile iki geçiş süresi
  arasındaki cebirsel özdeşlik ve ham CSV üzerinden Bash hesabı eklendi.
- Süreç/thread rehberine System V, POSIX, süreç içi kuyruk ve socket
  ayrımı; mevcut gecikme rehberine sınırlı strace görünümü eklendi.

Paketin saatler, C++ register/stack okuma, temel GDB, olay devri ve sistem
ayarları konuları mevcut rehber/lablarla örtüşüyordu. Aynı konular için
ikinci sayfa dizisi açılmadı. Önceki dokuz labın sırası korundu; iki yeni lab
sona eklendi. Katalog, okuma rotaları, arama ve indirme dosyaları güncellendi.

## Genelleştirme ve yeniden üretilebilirlik

Uygulamaya özgü sınıf/thread adları, özel ölçüm etiketleri, üretim vakası ve
geçmiş performans değerleri aktarılmadı. Örnekler mevcut `Worker`, `Dispatcher`,
`TraceBuffer`, `run_cycle` ve `perform_work` üzerinden anlatılıyor. Kuyruk
semantiği bir çatı adına değil gerçek API/uygulamaya bağlanıyor.

Mevcut C++ kaynakları ve daha sıkı CSV çözümleyicileri değiştirilmedi.
Paketin eski fixture/çözümleyici kopyaları içeri alınmadı. Yeni child-probe
şablonu açık dosya listesiyle yayımlanıyor; yerel ikili/CSV çıktıları yayıma
dahil edilmiyor. Ana öğretim akışları bir doğrulama scriptine devredilmiyor:
komut, ham alan, eşleştirme kuralı, çıkarma ve yorum birlikte gösteriliyor.

Paketin kendi sentetik kayıtları bu adlandırılmış örneklerin yeni çalıştırma
kanıtı olarak sunulmuyor. Paket test raporu ile mevcut çalışma alanında
çalıştırılan denetimler farklı kapsamlar olarak tutuluyor.

## Bu düzenlemede yapılan doğrulama

- `/execmap` ve kök URL derlemeleri: 36 içerik, 40 HTML, 35 arama kaydı;
  her birinde 20 site/etkileşim denetimi.
- Mevcut tarayıcı paketi: 13 başarılı, 1 planlı atlama.
- Altı ilgili sayfada 320, 390 ve 1440 px: toplam 18 taşma denetimi;
  prob kodunun panoya eksiksiz kopyalanması ve ekran görüntüleri.
- Yeni Bash bloklarında sözdizimi kontrolü; şablonun yayımlanan prob
  örneğiyle birebir eşitliği; Bash/sed yol yerleştirmesinin BPF değişkenlerini
  koruması.
- Yeni olay aralığı hesabı daha önce doğrulanmış Linux ham CSV'si üzerinde
  yayımlanan komutlarla tekrarlandı; iki ifade bağımsız tam sayı hesabıyla
  eşleşti. C++ kaynağı bu düzenlemede değişmedi.
- Scheduler örneğinde 83 ms = 80 ms + 3 ms hesabı çalıştırıldı. Bu, sentetik
  aritmetik denetimidir; canlı scheduler kaydı iddiası değildir.
- Mevcut runtime/debugging doğrulayıcılarının macOS üzerinde desteklenen
  çözümleyici ve bozuk-girdi denetimleri geçti; Linux çalıştırması atlandı.

BPF attach, perf scheduler kaydı, uzak GDB/IDE oturumları bu düzenlemede canlı
hedefte çalıştırılmadı. Yerel Docker daemon'ı yanıt vermedi. Bu yetenekler için
hedefe özgü doğrulama gereksinimi sayfalarda korunuyor. Kernel ayarı, RT
politikası, affinity veya frekans değiştirilmedi.

İnceleme çıktıları `output/runtime-update-review/`, görsel denetimler
`output/playwright/` altındadır. Bu dizinler git'e dahil edilmez.
