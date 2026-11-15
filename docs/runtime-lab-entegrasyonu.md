# Runtime laboratuvarı: arşiv analizi ve entegrasyon

İnceleme: 14–15 Kasım 2026. Kaynak arşivin SHA-256 değeri:
`08c4590c116fb58da75d28c7a68cdb093a013025faa863e3204a040e09bc61fd`.

## Değerlendirme

`execmap-lab.zip`, aynı küçük C++ iş yüküyle çağrı aralığı, elapsed süre, thread CPU zamanı, off-CPU ve runnable beklemeyi ayırmak için uygun bir başlangıç. GDB, perf ve bpftrace örneklerinin aynı programı kullanması tekrar üretmeyi kolaylaştırıyor. Dosyaya ölçüm sonrasında yazmak ve invocation kimliği tutmak korunmaya değer.

Arşiv mevcut execmap görülmeden hazırlanmış. Bu nedenle kurucuyu çalıştırıp ikinci bir belge ağacını `docs/` altına kopyalamak yerine, içeriği mevcut İngilizce yayın ve arama sistemine uyarladım. Arşivdeki kurulum talimatları kullanıcının ek isteği olarak kabul edilmedi.

## Eklenen yapı

- `content/rehberler/calisma-zamani-gecikmesi.md`: metriklerin anlamı, saatler, GDB attach/remote eşlemesi, uprobe/uretprobe, off-CPU, perf sched, sistem bağlamı ve tracing kararsızlığı.
- `content/laboratuvarlar/zamanlama-ve-bekleme.md`: indirilebilir kaynaklarla sleep/busy/periyot aşımı deneyi ve doğrulama sözleşmesi.
- `examples/runtime-timing/`: C++11 kaynak, Python analiz betiği, CMake dosyası, BPF şablonları, boş deney formu ve doğrulama kaydı. Site üretimi yalnız belirlenen kaynak dosyalarını `labs/runtime-timing/` adresinde yayımlar; yerel derleme ve ölçüm çıktıları yayımlanmaz.
- `scripts/verify-runtime-lab.py`: gerçek yayımlanan kaynak üzerinde derleme/çalıştırma, sembol ve CSV kontrolleri; isteğe bağlı yayımlanan GDB oturumu ve CMake derlemesi.
- Runtime kataloğu, yedinci laboratuvar, okuma rotası, çapraz bağlantılar ve CI işi. C++ laboratuvarı kartında dil doğru gösteriliyor.

## Genelleştirme ve kapsam

Özel proje sınıfları, framework bağımlılıkları, thread adları, gerçek PID/TID'ler ve geçmiş uygulama ölçümleri aktarılmadı. Deneyde `Record`, `run_cycle` ve `perform_work` gibi işlevi anlatan genel adlar var. Tek thread, senkron çağrı ve recursion olmaması açık önkoşullar; üretim uygulaması için örtük varsayımlar değiller.

Arşivdeki `results/`, geçmiş olay anlatımı, oturuma özgü sanitizer sonuçları, sabit yerel proje yoluna sahip kurucu ve eski checksum listesi taşınmadı. Yeni kaynaklar değiştiğinden eski hash ve PASS sonuçları bu sürümü doğrulamaz. Affinity, gerçek zamanlı scheduling ve CPU frekansını değiştiren komutlar temel deneyin parçası yapılmadı; bunların ayrı değişken olarak ele alınması açıklandı.

Analiz betiği artık yalnız her grubun iç sırasını değil, thread başına olay akışını ve saatlerin invocation sınırlarında da geriye gitmemesini kontrol ediyor. Sequence boşlukları ve beklenen toplam sayıya göre tamamen eksik son çağrı reddediliyor. Geçiş ve caller tarafından kapsanan süreler de raporlanıyor. Alt-milisaniye örneğiyle birim dönüşümü, iç içe geçmiş farklı TID kayıtlarıyla kimlik ayrımı sınanıyor.

## Tekrar üretme ve inceleme

Linux üzerinde depo kökünden:

```sh
python3 scripts/verify-runtime-lab.py --require-linux --gdb --cmake
npm run check
npm run test:browser
```

Üretilen ham CSV'ler, tam komutlar, loglar, kaynak/binary hash'leri ve ortam bilgileri `output/runtime-validation/` altında kalır; depoya ölçüm çıktısı eklenmez. Sayısal timing eşikleri CI kabul koşulu değildir. Şema, çağrı kimliği, olay bütünlüğü, çalıştırılabilirlik ve hata reddi tekrarlanabilir kabul koşullarıdır. Perf/BPF kernel attach doğrulaması bu kontrollerin yerine geçmiş sayılmaz.

Gerçekte tamamlanan kontroller ve sınırlar [yayımlanan doğrulama kaydında](../examples/runtime-timing/validation.txt) bulunur. İnceleme için mevcut çalışma ağacı korundu; bu görev kapsamında commit yapılmadı.
