# execmap

[English](README.md) · **Türkçe**

Linux'ta ELF yüklemesi, ikili dosya analizi ve çalışma zamanı gözlemi üzerine kaynaklara dayalı bir çalışma. Uygulamalı C, C++ ve Python laboratuvarlarıyla birlikte İngilizce bir teknik başvuru olarak yayımlanır.

[Siteyi açın](https://zaryob.github.io/execmap/) · [Araştırma yöntemi](content/kaynaklar.md) · [Literatür ve araçlar](content/kaynak-kutuphanesi.md)

## Araştırma kapsamı

execmap bir programı ELF dosya düzeninden başlayarak bağlama ve süreç başlangıcı üzerinden bellek eşlemelerine ve gözlenen çalışmaya kadar izler. On sekiz rehber birbirine bağlı üç alanı kapsar:

- **ELF ve yükleme:** segmentler ve bölümler, adres çevirisi, ayrıştırıcı doğrulaması, bağlayıcı düzeni, yardımcı vektörler, yeniden konumlandırmalar ve sembol çözümleme.
- **İkili dosya analizi:** sembolleri silinmiş çalıştırılabilir dosyalar, sürüm karşılaştırma, kullanıcı alanı yükleyicileri, paketlenmiş kod, core dosyaları ve süreç anlık görüntüleri.
- **Çalışma zamanı gözlemi:** perf örneklemesi, Intel PT, eBPF olayları, gözlemci etkisi ve eksik izlerin yorumlanması.

Dokuz laboratuvar şunları inceler: GDB ile komut komut ilerleme, dallanmalar ve işaretçiler, bellek izinleri, sembol araya girmesi (interposition), ayrı hata ayıklama bilgisi, derleyici iyileştirmesi, çalışma zamanı zamanlaması, sıra eşleştirme ve iş parçacığı başına sayaçlar. Her biri kaynak kodu, komutları ve beklenen gözlemleri içerir. Yeni bir assembly hazırlık rehberi, sembolsüz ikili dosya analizinden önceki iki GDB laboratuvarına götürür. Yazılar, gezinme, arama ve ortak arayüz denetimleri İngilizcedir. Mevcut genel URL yolları ve kaynak tanımlayıcıları korunur.

## Yöntem ve literatür

Araştırma bir soruyu belgelenmiş bir mekanizmaya, küçük bir deneye ve elde edilen kanıtın sınırlarına bağlar. Bir bellek izni değişikliği tek başına kodun çalıştığını göstermez; örneklenen bir komut adresi çalıştırılan her komutu tarif etmez.

Başvuru tabanı [System V ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html), [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [v6.12 Linux ELF yükleyici kaynağı](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c), [Linux man-pages](https://man7.org/linux/man-pages/man5/elf.5.html), [GNU ld belgeleri](https://sourceware.org/binutils/docs/ld/Scripts.html), [DWARF](https://dwarfstd.org/) ve araç yazarlarının belgelerinden oluşur. Konuya özel kaynaklar her rehberin sonunda yer alır.

Bu bağımsız bir teknik sentez ve deneysel çalışmadır. Yerleşik mekanizmaları ve yeniden üretilebilir soruları belgeler; yeni güvenlik açıkları veya özgün algoritmalar öne sürmez. Beklenen çıktılar açıklayıcı örneklerdir, yayımlanmış bir ölçüm veri kümesi değildir. Bir laboratuvarı yeniden üretirken mimariyi, çekirdeği, libc'yi, derleyiciyi, araç sürümlerini, komut satırını ve ilgili izinleri kaydedin.

## Yerelde çalıştırma

Node.js 22 veya üstü ile npm kullanın:

```sh
npm ci
npm run dev
```

`http://127.0.0.1:4173/execmap/` adresini açın. Sunucu yalnızca loopback arayüzünü dinler; başka bir adrese bağlamak için `HOST` değişkenini ayarlayın. Site sunucu başlarken derlenir; içeriği düzenledikten sonra yeniden başlatın. Üretilen site `_site/` dizinine yazılır.

```sh
npm run build
npm run check
npx playwright install --only-shell chromium
npm run test:browser
```

`npm run check` siteyi derler ve Node.js içerik ve etkileşim denetimlerini çalıştırır. Tarayıcı denetimleri masaüstü ve mobil düzenleri, aramayı, gezinmeyi ve kod kopyalamayı kapsar.

Varsayılan yayın öneki `/execmap`'tir. Alan adı kökünden sunmak için:

```sh
SITE_BASEURL='' npm run dev
```

`SITE_BASEURL='' npm run check` bu düzeni denetler. Yerel portu değiştirmek için `PORT` değişkenini ayarlayın.

Laboratuvarlar GNU/Linux, bir C derleyicisi, GNU binutils ve GDB gerektirir. İzleme bölümleri ayrıca strace, perf, bpftrace, çekirdek izleme desteği, uygun yetkiler veya Intel PT donanımı gerektirebilir. Komutları bir Linux ortamını tarif eder; bu siteyi derlemek laboratuvarları çalıştırmaz.

Assembly eklemelerinin kaynak rolleri, üst kaynak atıfları, kabul ölçütleri ve doğrulama sınırlarını içeren bir [araştırma ve uygulama kaydı](docs/assembly-arastirma-plani.md) vardır. Yayımlanan C örneklerini doğrudan Markdown'dan çalıştırın:

```sh
python3 scripts/verify-assembly-labs.py
# GCC, GNU binutils ve GDB bulunan yerel Linux x86-64; GDB denetimleri çalışamazsa başarısız olur:
python3 scripts/verify-assembly-labs.py --require-linux-gdb
```

Denetim, dallanma programının iki derlemesini de kabul edilen 2001 tamsayı değerinin tamamı için beklenen sonuçla karşılaştırır, geçersiz girdileri sınar ve komutları, kaynak özetlerini ve sonuçları `output/assembly-validation/` altına kaydeder. Linux kipi ayrıca işlev girişindeki ABI değerlerini, adım adım ilerlemeyi, hata ayıklayıcı müdahalesini, izleme noktalarını ve disassembly çıktısını denetler. C kodunun başka bir platformda taşınabilir biçimde çalışması, Linux'taki register veya hata ayıklayıcı davranışını doğrulamaz.

Taşınabilir ayrıştırıcı denetimi **rehberden çıkarılan C bloğunu** ASan/UBSan ile
derler, gerçek bozuk ELF örnekleri yazar ve reddetme sonuçlarını denetler:

```sh
python3 scripts/verify-examples.py
```

Ayrıca taşınabilir aritmetik örneklerini ve entropi karşı örneklerini çalıştırır.
Çıktılar ve JSON sonuçları `output/technical-validation/` dizinine yazılır. Bu denetim
ayrıştırıcının bellek erişimini ve seçili örnekleri sınar; ELF'in Linux'ta
yüklenebilirliğini sınamaz.

İsteğe bağlı API denetimleri yalıtılmış, sürümü sabitlenmiş Python bağımlılıkları kullanır:

```sh
uv run --with lief==0.17.1 --with pyelftools==0.32 python scripts/verify-tool-apis.py
# Yalnızca denetimin oluşturduğu yardımcı süreci enstrümante eder; bağlanma (attach) izni gerekir:
uv run --with lief==0.17.1 --with pyelftools==0.32 --with frida==17.5.1 python scripts/verify-tool-apis.py --frida
```

Yayımlanan fq envanter komutunu denetlemek için `--fq /mutlak/yol/fq` verin (0.15.1 ile
doğrulanmıştır). LIEF çıktısı yeniden ayrıştırılır, yeni giriş noktası ve çalıştırılabilir
segmenti denetlenir; çalıştırılmaz. Linux izleme, GOT araya girmesi, core ve
checkpoint/restore deneyleri yine uygun bir Linux ortamı gerektirir.

Yerel Linux/glibc kabul denetimi site denetimlerinden ayrıdır:

```sh
python3 scripts/verify-linux-labs.py
python3 scripts/verify-packed-oep.py --upx /mutlak/yol/upx
```

İlk komut yayımlanan C bloklarını çıkarır ve RW→RX eşlemelerini, araya girme ile
`-Bsymbolic` davranışını, `LD_DEBUG` çıktısını, debuglink/Build-ID eşleşmesini, bağlayıcı
haritalarını, TRACEME'yi, memfd/fexecve/execveat'i ve core denetimlerini kaydeder. İkincisi
bilinen bir statik ELF örneği oluşturur, paketler ve özgün giriş baytlarını canlı bir
donanım kesme noktası gözlemiyle karşılaştırır. Güvendiğiniz, açıkça seçilmiş bir UPX
derlemesi ve boş bir çıktı dizini kullanın. Gerçek sürümler, sınırlı sonuçlar ve kalan
BPF/PT/restore ön koşulları için [Linux deney kaydına](docs/linux-deney-kaydi.md) bakın.

GitHub Actions iş akışı yayımdan önce `verify-assembly-labs.py --require-linux-gdb`,
`verify-examples.py`, `verify-runtime-lab.py --require-linux --gdb --cmake` ve
`verify-tool-apis.py` (Frida ve fq seçenekleri olmadan) denetimlerini şart koşar.
`verify-linux-labs.py` orada yayını engellemeyen bir kanıt işi olarak çalışır;
`verify-packed-oep.py` ise ayrıca edinilmesi gereken bir UPX derlemesine ihtiyaç
duyduğu için CI'da çalıştırılmaz.

## Çalışma zamanı zamanlama laboratuvarı

[Çalışma zamanı gecikmesi rehberi](content/rehberler/calisma-zamani-gecikmesi.md) GDB,
bpftrace, perf ve zamanlayıcı kanıtlarını tek bir
[zamanlama laboratuvarına](content/laboratuvarlar/zamanlama-ve-bekleme.md) bağlar.
İndirilebilir [dosyaları](examples/runtime-timing) genel amaçlı eşzamanlı işçi
işlevleri, C++11 ve Python standart kitaplığını kullanır. Linux'ta depo kökünden:

```sh
python3 scripts/verify-runtime-lab.py --require-linux --gdb --cmake
```

Bu komut yayımlanan gerçek kaynağı derler, uyku/meşgul bekleme/süre aşımı kayıtlarını
doğrular, bozuk izleri ve bağımsız değişkenleri denetler, yayımlanan GDB oturumunu ve
alternatif CMake derlemesini çalıştırır. Kanıtlar `output/runtime-validation/` dizinine
yazılır; perf ve BPF bağlanması ayrıca raporlanan yetenekler olarak kalır. Bayraklar
verilmediğinde diğer sistemler çözümleyiciyi doğrular ve Linux'ta çalıştırmayı açıkça
atlar. Kapsam ve sınırlar için [bütünleştirme incelemesine](docs/runtime-lab-entegrasyonu.md)
ve indirilebilir [doğrulama kaydına](examples/runtime-timing/validation.txt) bakın.

## C++ hata ayıklama ve olay eşleştirme

[C++ GDB rehberi](content/rehberler/cpp-cagri-zinciri.md) ve
[süreç/iş parçacığı rehberi](content/rehberler/process-thread-ve-zamanlayici.md),
[iki olay akışı kipine](content/laboratuvarlar/olay-akisini-eslestirme.md) ve bir
[procfs sayaç laboratuvarına](content/laboratuvarlar/thread-sayaclari.md) götürür.
Uygulamaya özgü çatıların yerini genel `Dispatcher`, `Worker` ve `TraceBuffer` sınıfları
alır. Sıra numarası taşıyan altı olay kaynak boşluklarını, çağıranın beklemesini ve
kuyruğa alınmış devri birbirinden ayırır; birikimli zamanlayıcı sayaçları kendi ayrı
anlamlarını korur.

```sh
python3 scripts/verify-debugging-labs.py --require-linux --gdb
```

Doğrulayıcı altı kip/senaryo birleşimini, iş parçacıkları arası eşleştirmeyi, bozuk
izleri, canlı ve salt okunur bir procfs örneğini ve yayımlanan C++ üye GDB oturumunu
sınar. Kanıtlar `output/debugging-validation/` dizinine yazılır. Mevcut çalışma zamanı
CI işi bu doğrulayıcıyı da şart koşar. Sağlanan rapordan genelleştirilmiş rehberlere ve
laboratuvarlara eşleme için [rapor bütünleştirme notlarına](docs/debugging-raporu-entegrasyonu.md)
bakın.

## Arama ve dil sözleşmesi

Proje kaydı kararlı `/execmap/` yollarını ve dokuz laboratuvarlık kataloğu korur.
Kayıttaki görünen adlar, varsa `title_en` değerini kullanır. Üretilen iki arama dizini de
assembly rehberi ve iki GDB laboratuvarı dahil 30 okuma sayfası içerir. Ortak
bağdaştırıcı `search.json`; `type: "execmap/"`, `lang: "en"`, tam metin ve seçilen
derleme önekini kullanan bağlantılar yayımlar. Tüketiciler bu içerik dili alanını
korumalıdır. Yerel `search-index.json`, ifade ve kod sorgularını sıralamak için kod ve
başlık alanlarını da taşır. Türkçe içerik sürümü veya dil seçici yoktur; kayıtlı dil
tercihleri ve `?lang=tr` İngilizce ürünü değiştirmez.

`public/assets/console/` içindeki bütün dosyalar `console-theme/assets/console/`
dizininden bayt bayt aynı kopyalardır; `theme.js` İngilizce yedek metinler içerir ve SVG
lisans notu yanındaki `ICONS-LICENSE.txt` dosyasını gösterir. Eşitleme ve doğrulamayı
kardeş `console-theme` deposundan `python3 scripts/sync.py` ve `npm run check` ile yapın.
Kayıt değiştirilmeden `public/console-projects.json` olarak kopyalanır. Node derlemesi
paketleme bağdaştırıcısıdır: Jekyll include'ları, dil seçici veya dağıtılan
tercih/sözlük betikleri olmadan İngilizce işaretleme ve yerel arama üretir. Ortak arama
tüketicileri bu derlemenin ürettiği `lang: "en"` üst verisini korumalıdır.

## Depo düzeni

- `content/rehberler/` — teknik rehberler ve konu başına kaynaklar.
- `content/laboratuvarlar/` — kendi içinde tam C deneyleri ve yorum notları.
- `content/kaynaklar.md` ve `content/kaynak-kutuphanesi.md` — yöntem ve literatür.
- `src/` — içerik ayrıştırma, gezinme üst verisi ve URL işleme.
- `scripts/` — statik üretim ve yerel sunucu.
- `public/` — tarayıcı kodu, stiller, ortak konsol dosyaları ve yerel yazı tipleri.
- `tests/` — içerik, etkileşim ve tarayıcı denetimleri.

GitHub Actions iş akışı hem `/execmap` hem de alan adı kökü derlemelerini denetler. `main` dalına yapılan push'lar denetimler geçtikten sonra GitHub Pages'e yayımlanır. Deponun Pages ayarlarında yayın kaynağı olarak **GitHub Actions** seçin.

## Lisans

Telif hakkı (C) 2026 Suleyman Poyraz.

Aksi belirtilmedikçe proje kaynağı, teknik metinler ve laboratuvar örnekleri **GNU GPL sürüm 3 veya sonrası** ile lisanslıdır. Bkz. [LICENSE](LICENSE). Proje hiçbir garanti olmaksızın sunulur.

Ortak konsol dosyaları **GPL-2.0-or-later** bildirimlerini korur. IBM Plex yazı tipleri **SIL OFL 1.1** kullanır. Font Awesome SVG dosyaları atıflarını ve **CC BY 4.0** koşullarını korur. Konumlar ve teşekkürler için [NOTICE.md](NOTICE.md) dosyasına bakın. Harici yayınlar ve araçlar kendi yazarlarının lisanslarına tabidir.
