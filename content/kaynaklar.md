---
title: Araştırma yöntemi ve birincil kaynaklar
---

# Araştırma yöntemi ve birincil kaynaklar

`execmap`, Linux ELF dosyalarının diskteki yapısını, yükleme adımlarını ve çalışma anındaki gözlemleri birlikte inceleyen bağımsız bir teknik araştırma ve başvuru çalışmasıdır. Rehberler yerleşik mekanizmaları kaynaklarla açıklar; laboratuvarlar bunları küçük C programlarıyla sınamak için hazırlanmıştır.

## Araştırma Soruları

- Dosya ofseti, ELF sanal adresi ve süreçte gözlenen adres hangi koşullarda eşleşir?
- Sembol tablosu, relocation kaydı ve dinamik yükleyici bir çağrının hedefini nasıl belirler?
- Derleyici optimizasyonu ile programın davranışındaki değişim nasıl ayrılır?
- Bir bellek eşlemesi, örnekleme kaydı veya sistem çağrısı hangi sonucu destekler; hangisini desteklemez?

## Kaynakların Rolü

**Biçim ve sözleşme:** [System V ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html), [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI) ve [DWARF](https://dwarfstd.org/) alanların anlamını ve mimari sözleşmeleri tanımlar.

**Uygulama:** [Linux v6.12 ELF yükleyicisi](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c), çekirdeğin dosyayı nasıl doğruladığını ve eşlediğini incelemek için sürümü belirtilmiş bir örnektir. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html), dinamik yükleyicinin arama ve sembol çözümleme davranışlarını açıklar. Başka çekirdek ve libc sürümlerinde ayrıntılar değişebilir.

**Araç ve yorum:** [GNU ld](https://sourceware.org/binutils/docs/ld/Scripts.html), [GDB](https://sourceware.org/gdb/current/onlinedocs/gdb.html/), [perf erişim modeli](https://docs.kernel.org/admin-guide/perf-security.html) ve [uprobe belgeleri](https://docs.kernel.org/trace/uprobetracer.html), elde edilen çıktının hangi yöntemle üretildiğini anlamak için kullanılır. İlgili yazarların teknik incelemeleri [kaynak kütüphanesinde](kaynak-kutuphanesi.md) ayrı başlıklar altında bulunur.

## Deney ve Tekrarlanabilirlik

1. Soruyu ve beklenen mekanizmayı deneyden önce yazın.
2. Mimariyi, çekirdek ve libc sürümünü, derleyiciyi, derleme seçeneklerini ve araç sürümlerini kaydedin.
3. Karşılaştırılan koşullarda tek değişkeni değiştirin. Laboratuvarlardaki kaynakları ve tam komutları saklayın.
4. Dosya incelemesini, bellek haritasını ve çalışma anı kaydını ayrı gözlemler olarak toplayın.
5. Beklenen sonuç ile gerçekten alınan çıktıyı ayırın; başarısız deneyi ve eksik kayıtları da raporlayın.

[Bellek izinleri](laboratuvarlar/bellek-izinleri.md), [sembol seçimi](laboratuvarlar/sembol-secimi.md), [debug bilgisi](laboratuvarlar/debug-bilgisi.md) ve [derleme farkları](laboratuvarlar/derleme-farklari.md) bu yaklaşımın uygulamalarıdır.

## Bulguların Sınırları

Rehberlerdeki beklenen çıktılar açıklama amaçlıdır; yayımlanmış bir ölçüm veri kümesi veya tüm dağıtımlar için doğrulama sonucu değildir. İzin değişimi tek başına kod yürütüldüğünü, bir örnekleme kaydı da tüm komut akışının görüldüğünü göstermez. eBPF, perf ve hata ayıklayıcılar farklı kapsam, erişim ve ölçüm maliyetlerine sahiptir.

Bu çalışma yeni bir açık ya da algoritma keşfi iddiası taşımaz. Katkısı, belgelenmiş mekanizmaları inceleme soruları ve tekrarlanabilir deney adımlarıyla ilişkilendirmektir. Dış kaynakların telif ve lisansları kendi yazarlarına aittir.

Başlamak için [okuma rotalarını](okuma-rotalari.md), bulguları değerlendirmek için [izleri yorumlamak](rehberler/izleri-yorumlamak.md) rehberini kullanın.
