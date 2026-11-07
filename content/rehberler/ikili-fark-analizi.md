---
title: "İkili fark analizi (Binary Diffing) ve sürüm karşılaştırma"
---

# İkili fark analizi (Binary Diffing) ve sürüm karşılaştırma

İkili fark analizi (Binary Diffing), aynı programın iki farklı derlemesi (örneğin sürüm 1.0 ile sürüm 1.1) veya bir güvenlik yamasından önceki ve sonraki halleri arasındaki anlamsal farkları ortaya çıkarma disiplinidir.

Tersine mühendislikte en kritik kullanım alanlarından biri **Yama Analizi (Patch Diffing / 1-day Analysis)** sürecidir. Bir yazılım üreticisi bir güvenlik açığı için yama yayınladığında, güvenlik araştırmacıları eski ve yeni ikiliyi karşılaştırarak yamalanan zaafiyetin tam kök nedenini (root cause) ve istismar edilebilirliğini (exploitability) dakikalar içinde tespit edebilir.

## 1. Neden Basit Bayt Farkı (diff / cmp) Yetersizdir?

Kaynak kodda yapılan tek satırlık bir değişiklik veya derleme bayrağındaki küçük bir fark, ikili dosya üzerinde bir çığ etkisi (avalanche effect) yaratır:

```text
Kaynak Kod Değişikliği (1 satır)
       |
       v
Fonksiyonun uzunluğu 4 bayt uzar
       |
       v
Takip eden TÜM fonksiyonların sanal adresleri kayar
       |
       v
Tüm göreceli dallanmalar (jmp, call), relocation ofsetleri ve jump table'lar değişir
       |
       v
"cmp" veya "diff" dosyaların %90'ının değiştiğini söyler! (Yanıltıcı Gürültü)
```

Bu nedenle ikili fark analizi bayt seviyesinde değil, **Kontrol Akış Grafiği (CFG)** ve **Semantik (Anlamsal)** seviyede yapılmalıdır.

| Seviye | Kullanılan Araç | Karşılaştırma Temeli | Hassasiyet |
| :--- | :--- | :--- | :--- |
| **Bayt Seviyesi** | `biodiff`, `vbindiff`, `cmp` | Ham bayt dizilimleri, dosya ofsetleri | Sadece küçük sabit yamalarda yararlı |
| **Sembolik Seviye** | `nm`, `readelf`, `bloaty` | Fonksiyon boyutları, bölüm hacimleri | Genel mimari farklar |
| **Grafik / Blok Seviyesi** | `BinDiff`, `Ghidra Version Tracking` | Temel bloklar, CFG yapısı, çağrı grafikleri | **En yüksek doğruluk (Yama analizi)** |
| **Mikroyürütme (Dynamic)** | `fnprint` | Girdi/çıktı davranışları, yan etkiler | Obfuscated kodlar için |

## 2. Grafik Eşleme (Graph Matching) Nasıl Çalışır?

`BinDiff` ve `Ghidra Version Tracking` gibi gelişmiş araçlar iki ikiliyi şu adımlarla eşleştirir:

1. **İsim ve Sembol Eşlemesi**: Eğer semboller mevcutsa doğrudan adlar eşleştirilir.
2. **Çağrı Grafiği Topolojisi (Call Graph Matching)**: Fonksiyonların kimleri çağırdığı ve kimler tarafından çağrıldığı eşleştirilir.
3. **Temel Blok (Basic Block) İmzaları**: Fonksiyonun içindeki dallanma grafiği ayrıştırılır:
   - Temel blok sayısı ve kenar (edge) sayısı.
   - Döngü sayıları ve siklomatik karmaşıklık.
   - Blok içindeki talimat türleri (aritmetik, bellek, kontrol transferi).
4. **Sabitler ve Dize Referansları**: Fonksiyonun kullandığı sabit sayılar (magic constants) ve string göstericileri eşleştirilir.

Eşleme sonucunda benzerlik skoru (`Similarity: 0.0 - 1.0`) ve güven skoru (`Confidence`) hesaplanır. Benzerliği `0.85 - 0.98` aralığında olan fonksiyonlar, yamanın yapıldığı yerlerdir.

## 3. Ghidra ile Patch Diffing İş Akışı

Ghidra'nın dahili **Version Tracking** aracı ile iki ELF dosyasını karşılaştırma adımları:

1. **Analiz**: Her iki ikili dosya (`eski_surum` ve `yeni_surum`) Ghidra projesine aktarılır ve otomatik analizi tamamlanır.
2. **Session Başlatma**: `File -> New Version Tracking Session` seçilerek kaynak ve hedef programlar belirlenir.
3. **Korelatörleri Çalıştırma**:
   - `Exact Symbol Name Match`: Bilinen fonksiyonları sabitler.
   - `Duplicate Function Match`: Birebir aynı kalan fonksiyonları eler.
   - `Exact Function Instructions Match`: Talimat dizilimi değişmeyenleri ayırır.
   - `Similar Function Instructions Match`: Değişen fonksiyonları listeler.
4. **Grafiksel Karşılaştırma**: Değişen fonksiyonun üzerine sağ tıklanıp `Compare Code` seçildiğinde, eklenen temel bloklar (yeşil) ve silinen bloklar (kırmızı) yan yana disasm ve decompile görünümünde açılır.

## 4. Derleyici Optimizasyonu ile Mantık Farkını Ayırt Etmek

İkili fark analizinde en çok zaman kaybettiren unsur, derleyicinin optimizasyon tercihleridir:
- **Fonksiyon İçi Genişletme (Inlining)**: Küçük bir fonksiyonun doğrudan çağrıldığı yere gömülmesi, o fonksiyonun yok olduğu hissini yaratabilir.
- **Döngü Açma (Loop Unrolling)**: 10 adımlık bir döngünün art arda 10 kez yazılması temel blok sayısını artırır.
- **Vektörizasyon (SIMD / AVX)**: Basit bir skaler döngünün AVX2/AVX-512 talimatlarına çevrilmesi blok yapısını radikal biçimde değiştirir.

Gerçek bir mantık/güvenlik düzeltmesini optimizasyondan ayırmak için disasm yerine decompile (C benzeri sözde kod) üzerinden veri akışını (Data Flow) ve sınır kontrollerini (`bounds check: if (len > MAX)`) takip edin.

## İncelemeyi Derinleştir

Derleme bayraklarının ikili kod üzerindeki etkisini kendi gözlerinizle görmek için [Derleme farkları laboratuvarı](../laboratuvarlar/derleme-farklari.md) uygulamasını yapın. Dinamik olarak belleğe yüklenen ve diskte dosya bırakmayan ikilileri analiz etmek için [Özel yükleyiciler](ozel-yukleyiciler.md) rehberine geçin.

## Kaynaklar

- [BioDiff — Hex/Binary Difference Tool (8051Enthusiast)](https://github.com/8051Enthusiast/biodiff)
- [Ghidra Patch Diffing Guide (CVE North Stars)](https://cve-north-stars.github.io/docs/Ghidra-Patch-Diffing)
- [BinDiff — Zynamics / Google](https://www.zynamics.com/bindiff.html)
- [fnprint — Microexecution Function Identification (1rhino2)](https://github.com/1rhino2/fnprint)
- [Halvar Flake: Structural Comparison of Executable Objects (DIMVA)](https://link.springer.com/chapter/10.1007/978-3-540-27814-6_11)
