---
title: İnceleme yöntemi ve birincil kaynaklar
description: ELF dosyaları, yükleme süreci ve çalışma zamanı gözlemleri üzerine rehberlerin yöntemini ve dayandığı kaynakları okuyun.
---

# İnceleme yöntemi ve birincil kaynaklar

`execmap`, Linux ELF dosyasını diskteki hâliyle, yükleme süreciyle ve çalışma zamanındaki gözlemlerle birlikte inceleyen bağımsız bir araştırma ve başvuru projesidir. Rehberler belgelenmiş mekanizmaları kaynaklarıyla açıklar. Laboratuvarlar bu mekanizmaları küçük C programlarıyla inceler.

## Araştırma soruları

- Dosya ofseti, ELF sanal adresi ve süreçte gözlemlenen adres hangi koşullarda birbirine karşılık gelir?
- Sembol tablosu, yeniden konumlandırma kaydı ve dinamik bağlayıcı, bir çağrının hedefini nasıl belirler?
- Derleyici optimizasyonunu program davranışındaki değişiklikten nasıl ayırt edebiliriz?
- Bir bellek eşlemesi, örnekleme kaydı veya sistem çağrısı hangi çıkarımları destekler? Hangi sorular açık kalır?

## Her kaynağın rolü

**Biçim ve kurallar.** [System V ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html), [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI) ve [DWARF](https://dwarfstd.org/), alanların anlamlarını ve mimari kuralları tanımlar.

**Uygulama.** [Linux v6.12 ELF yükleyicisi](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c), çekirdeğin bir dosyayı nasıl doğruladığını ve belleğe eşlediğini belirli bir sürüm üzerinden gösterir. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html), dinamik bağlayıcının arama ve sembol çözümleme kurallarını açıklar. Ayrıntılar çekirdek ve libc sürümleri arasında değişebilir.

**Araçlar ve yorum.** [GNU ld](https://sourceware.org/binutils/docs/ld/Scripts.html), [GDB](https://sourceware.org/gdb/current/onlinedocs/gdb.html/), [perf erişim modeli](https://docs.kernel.org/admin-guide/perf-security.html) ve [uprobe belgeleri](https://docs.kernel.org/trace/uprobetracer.html), gözlemlerin nasıl elde edildiğini açıklar. Araç yazarlarının teknik incelemelerini [kaynak kütüphanesinde](kaynak-kutuphanesi.md) bulabilirsiniz.

## Deneyler ve tekrarlanabilirlik

1. Deneyden önce soruyu ve işlemesini beklediğiniz mekanizmayı belirtin.
2. Mimarinin adını, çekirdek ve libc sürümlerini, derleyiciyi, derleme seçeneklerini ve araç sürümlerini kaydedin.
3. Karşılaştırdığınız koşullar arasında tek bir değişkeni değiştirin. Laboratuvarın kaynak kodunu ve komutların tamamını saklayın.
4. Dosya incelemesini, bellek haritalarını ve çalışma zamanı kayıtlarını ayrı gözlemler olarak toplayın.
5. Beklenen sonuçları gerçek çıktıdan ayırın. Başarısız deneyleri ve eksik kayıtları da bildirin.

[Bellek izinleri](laboratuvarlar/bellek-izinleri.md), [sembol seçimi](laboratuvarlar/sembol-secimi.md), [hata ayıklama bilgisi](laboratuvarlar/debug-bilgisi.md) ve [derleyici farkları](laboratuvarlar/derleme-farklari.md) laboratuvarları bu yöntemi uygular.

[Assembly hazırlık rehberi](rehberler/assembly-okuma.md), komutları ve ABI’yi açıklayan kaynakları ayırır. [GDB ile ilk inceleme](laboratuvarlar/gdb-ilk-inceleme.md), işlev girişinde, belleğe yazmada ve işlev dönüşünde ne olduğunu sınar. [Dallanma ve işaretçiler](laboratuvarlar/dallanma-ve-pointer.md) deneyiyse derleme sonuçlarını, tanımlanan tam sayı girdi aralığı boyunca beklenen değerlerle karşılaştırır. Derslerdeki konu sırasının ötesinde, birincil belgeleri, beklenen sonuçları ve uygulanan kontrolleri ayrı ayrı kaydedin.

## Bulguların sınırları

Rehberlerdeki beklenen çıktılar açıklama amaçlı örneklerdir. Ölçüm sonuçları kullandığınız dağıtım ve ortamla sınırlıdır. Bir izin değişikliğinden kodun gerçekten çalıştığı, tek bir örnekten de komut akışının tamamı çıkarılamaz. eBPF, perf ve hata ayıklayıcıların kapsamları, erişim gereksinimleri ve ölçüm maliyetleri farklıdır.

Bu çalışma belgelenmiş mekanizmaları araştırma sorularına ve tekrarlanabilir deneylere bağlar. Dış kaynaklar kendi yazarlarının telif haklarına ve lisanslarına tabidir.

[Okuma rotalarıyla](okuma-rotalari.md) başlayın. Bulguları değerlendirirken [çalışma zamanı izlerini yorumlama rehberine](rehberler/izleri-yorumlamak.md) başvurun.
