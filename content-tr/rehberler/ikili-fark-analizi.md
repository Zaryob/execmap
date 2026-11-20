---
title: İkili dosya farkları ve sürüm karşılaştırması
description: Farklı baytların davranışa etkisini anlamak için sürümleri ve işlevleri karşılaştırın.
---

# İkili dosya farkları ve sürüm karşılaştırması

İkili diffing, 1.0 ve 1.1 sürümleri gibi bir programın iki yapısı arasındaki yapısal farklılıkları tanımlar veya bir güvenlik yamasından önce ve sonra inşa eder ve aday semantik değişiklikleri araştırır. Bayt veya grafik eşleşmeleri tek başına davranışsal eşdeğerliği kanıtlamaz.

Önemli bir uygulama, 1-gün analizi olarak da adlandırılan **patch diffing** 'dir. Bir satıcı bir güvenlik düzeltmesi yayınladıktan sonra, araştırmacılar, güvenlik açığının kök nedenini ve istismar edilebilirliğini araştırmak için eski ve yeni ikilileri karşılaştırabilir. Zaman ve sonuçlar, numunenin karmaşıklığına ve mevcut kanıtlara bağlıdır.

## 1. Neden tek başına bayt karşılaştırması yetersiz

Tek satırlık kaynak değişimi veya küçük bir yapı seçeneği değişimi ikili üzerinde geniş etkilere sahip olabilir:

```text
One source line changes
       |
       v
A function grows by four bytes
       |
       v
Following function addresses may shift
       |
       v
Relative branches, relocations, and jump tables may change
       |
       v
cmp/diff can report widespread byte changes (comparison noise)
```

İkili karşılaştırma bu nedenle bayt farklılıklarına ek olarak ** kontrol-akış grafiği (CFG)**ve**semantik** analizine ihtiyaç duyar.

| Seviye | Araçlar | Karşılaştırma temeli | Kullanım ve limitler |
| :--- | :--- | :--- | :--- |
| ** Bayt** | `biodiff`, `vbindiff`, `cmp` | Ham bayt dizileri ve dosya ofsetleri | Küçük sabit konum yamaları için kullanışlı |
| **Simbols** | `nm`, `readelf`, `bloaty` | Işlev ve bölüm boyutları | Geniş yapısal farklılıklar |
| **Grafikler / bloklar** | `BinDiff`, `Ghidra Version Tracking` | Temel bloklar, CFG'ler, çağrı grafikleri | Dar yama adayları; yanlış eşleşmeler mümkün olmaya devam ediyor |
| **Mikrosektör ** | `fnprint` (deneysel) | Giriş/çıkış davranışı ve yan etkiler | Obfuscated kodun araştırılması; burada denetlenmeyen genç bir proje, bu nedenle eşleşmeleri lider olarak ele alın |

## 2. Grafik eşleştirme nasıl çalışır

`BinDiff` ve `Ghidra Version Tracking` gibi araçlar birkaç eşleşen sinyal kullanır:

1. ** İsimler ve semboller**: Semboller mevcut olduğunda doğrudan isimleri eşleştirin.
2. **Call graph topology**: Arayanları ve arayanları karşılaştır.
3. ** Temel blok imzaları**: Blok/kenar sayımlarını, döngüleri, siklomatik karmaşıklığı ve aritmetik, bellek erişimi ve kontrol aktarımı gibi komut kategorilerini karşılaştırın.
4. **Standartlar ve dize referansları**: Sihirli sabitleri ve dizelere referansları karşılaştırın.

Sonuç bir benzerlik puanı (`0.0–1.0`) ve güven puanı içerebilir. Tanımları araç ve korrelatora bağlıdır. `0.85–0.98` gibi bir aralık yama konumunu belirlemez ve derleyici farklılıkları puanları değiştirebilir. Mevcut olduğunda sökme, veri akışı ve kaynak diff'lerine karşı eşleşmeleri doğrulayın.

## 3. Ghidra ile yama diffing

İki ELF dosyasını karşılaştırmak için Ghidra'nın **Version Tracking** dosyasını kullanın:

1. **Analize**: Her iki ikiliyi (`eski_surum` ve `yeni_surum`) içe aktarın ve otomatik analizi tamamlayın.
2. ** Oturumu başlatın**: Ghidra 11.4.2'nin Sürüm İzleme aracında, `File -> New Session`'yi seçin ve sihirbazdaki kaynak ve hedef programlarını seçin ([araç help](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_11.4.2_build/Ghidra/Features/VersionTracking/src/main/help/help/topics/VersionTrackingPlugin/VT_Tool.html)).
3. **Koşun korelators**: Ghidra **11.4.2** yardım listeleri `Exact Symbol Name Match`, `Exact Function Instructions Match`, ve `Duplicate Function Instructions Match`. Son üretilen 1:N/M:N adayları; sadece aynı işlevleri ortadan kaldırmaz. Komut kornelatorleri operandları maskeleyebilir, bu nedenle bir puan 1.0 bayt eşitliği değildir. Yüklenen sürümün yardımında seçenekleri onaylayın ([resmi korrelator dokümantasyonu](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_11.4.2_build/Ghidra/Features/VersionTracking/src/main/help/help/topics/VersionTrackingPlugin/VT_Correlators.html)).
4. **Karşılaştırma**: Sürümün işlev karşılaştırma görünümünde açık adaylar. Renkler ve menü adları sürüme/tema'ya göre değişir; vurgulanan bir blok tek başına bir güvenlik yamasını kanıtlamaz.

## 4. Optimizasyonu mantık değişikliklerinden ayırmak

Derleyici dönüşümleri ikili karşılaştırmayı zorlaştırabilir:

- **Inlining**, çağrı alanına bir işlev yerleştirerek, ortadan kaybolmuş gibi görünmesini sağlar.
- **Loop unrolling ** tekrarlanan işlemleri genişletir ve blok sayısını artırabilir.
- **SIMD vektörizasyon**, skaler işlemleri AVX2/AVX-512 gibi talimatlarla değiştirir ve blok yapısını önemli ölçüde değiştirebilir.

Makine kodundan çıkarılan assembly ile ters derleyicinin ürettiği sözde kodu birlikte inceleyin. Veri akışını ve sınır kontrollerini izleyin. Ters derleyici çıktısı, araç tarafından üretilen bir yorumdur. Çıkarımlarınızı diğer kanıtlarla doğrulayın.

## Derinlemesine inceleme

Yapı-seçenek etkilerini gözlemlemek için [kombiler farklılıkları laboratuvar](../laboratuvarlar/derleme-farklari.md)'yi çalıştırın. [özel yükleyiciler](ozel-yukleyiciler.md) ile devam edin, geleneksel bir on-disk çalıştırılabilir yolu olmadan dinamik olarak belleğe yüklenen kod için.

[ABI uyumluluğu kontrollerini kullanın](abi.md#test-an-existing-client-against-another-library-build) önceden bağlı bir istemci ile yedek paylaşılan kütüphaneyi test etmek için.

## Kaynaklar

- [BioDiff Hex/Binary Fark Aracı (8051Enthusiast)](https://github.com/8051Enthusiast/biodiff)
- [Ghidra resmi projesi](https://github.com/NationalSecurityAgency/ghidra)
- [BinDiff Zynamics / Google](https://www.zynamics.com/bindiff.html)
- [fnprint Microexecution Function Identification (1rhino2)](https://github.com/1rhino2/fnprint): deneysel; depo Ağustos 2026'de oluşturuldu ve kodu bu kılavuz için gözden geçirilmedi.
- [Halvar Flake: Yürütülebilir Nesnelerin Yapısal Karşılaştırması yazarın PDF](https://www.zynamics.com/downloads/dimva_paper2.pdf)
