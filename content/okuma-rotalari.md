---
title: "Okuma rotaları ve çalışma haritası"
---

# Okuma rotaları ve çalışma haritası

`execmap` içeriği; bir ikili dosyanın bayt seviyesindeki yapısından başlayıp, çekirdek tarafından belleğe eşlenmesine, tersine mühendislik yöntemlerine ve en nihayetinde çalışma anındaki donanımsal gözleme kadar uzanan eksiksiz bir öğrenme patikası sunar.

Seviyenize ve odaklanmak istediğiniz alana göre aşağıdaki üç ana rotadan birini seçerek ilerleyebilirsiniz.

---

## Rota 01: Dosyadan Belleğe (ELF ve Yükleme Mimarisi)

Bu rota; işletim sisteminin ikili dosyaları nasıl okuduğunu, segment ve section farkını, linker düzenini ve programın `main()` öncesindeki ilk ayağa kalkış adımlarını inceler. Sistem programcıları ve düşük seviye meraklıları için temel başlangıç noktasıdır.

1. **[ELF'i dosyadan belleğe takip etmek](rehberler/elf-dosyadan-bellege.md)**: Header, program header, section header ve sanal bellek ofset hesapları.
2. **[ELF parser'ları ve adres hesaplarını doğrulamak](rehberler/elf-parser-ve-adresler.md)**: Parser farklılıkları, `pyelftools` ile segment denetimi ve sınır taşmaları.
3. **[Linker düzenini ve bellek haritasını okumak](rehberler/linker-duzeni.md)**: Input/Output section kavramı, VMA ve LMA ayrımı, linker script ve map dosyaları.
4. **[Program başlangıcı ve auxv](rehberler/baslangic-ve-auxv.md)**: Çekirdeğin yığın mimarisi, `_start` girişi ve Auxiliary Vector köprüsü.
5. **[Dinamik bağlama: GOT ve PLT](rehberler/dinamik-baglama.md)**: Tembel bağlama (lazy binding), relocation türleri ve RELRO korumaları.

> **Pekiştirici Laboratuvarlar**:
> - [Sembol seçimi ve LD_PRELOAD](laboratuvarlar/sembol-secimi.md)
> - [Debug bilgisini ayırmak ve bağlamak](laboratuvarlar/debug-bilgisi.md)

---

## Rota 02: İsimlerden Davranışa (Tersine Mühendislik Pratiği)

Bu rota; sembolleri silinmiş (stripped) ikili dosyaları anlamlandırmayı, sürümler arasındaki mantık ve güvenlik yamalarını ayırt etmeyi, paketleyicileri ve bellek içi yükleyicileri çözmeyi hedefler. Güvenlik araştırmacıları ve tersine mühendisler için tasarlanmıştır.

1. **[Stripped ELF dosyalarını anlamlandırmak](rehberler/stripped-elf.md)**: `.eh_frame` CFI kayıtlarıyla fonksiyon sınırlarını ve prolokları kurtarmak.
2. **[İkili fark analizi (Binary Diffing)](rehberler/ikili-fark-analizi.md)**: Temel blok ve çağrı grafiği topolojisiyle yama analizi yapmak.
3. **[Özel yükleyiciler ve in-memory execution](rehberler/ozel-yukleyiciler.md)**: `memfd_create` ve `userland exec` mekanizmalarını tespit etmek.
4. **[Paketli ve şifrelenmiş ELF analizi](rehberler/paketli-elf.md)**: Yüksek entropi, OEP tespiti, tail jump ve bellek dökümü (dumping).
5. **[Çekirdek dökümleri (Core Dumps)](rehberler/core-ve-snapshot.md)**: `ET_CORE` yapısı, `NT_PRSTATUS` yazmaçları ve GDB ile ölüm sonrası analiz.

> **Pekiştirici Laboratuvarlar**:
> - [Bir bellek alanının izin değişimini gözlemlemek](laboratuvarlar/bellek-izinleri.md)
> - [Derleme farklarını ve optimizasyon seviyelerini incelemek](laboratuvarlar/derleme-farklari.md)

---

## Rota 03: Çalışma Anına Bak (Gözlem, Profilleme ve Çekirdek)

Bu rota; çalışan bir sürecin davranışını pasif ve aktif tekniklerle en derin seviyede izlemeyi, anti-analiz tuzaklarını etkisiz kılmayı ve toplanan izleri adli bilişim standartlarında yorumlamayı amaçlar.

1. **[perf ile yürütme analizi](rehberler/perf-ile-yurutme.md)**: PMU donanım sayaçları, 99 Hz örnekleme ve Intel PT ile komut komut izleme.
2. **[eBPF ile çalışma anı olaylarını izlemek](rehberler/ebpf-ile-olaylar.md)**: Uprobes, kprobes ve ring buffer ile hedefe hissettirmeden sistem çağrılarını yakalamak.
3. **[Analiz aracının etkisi ve anti-debugging](rehberler/analiz-aracinin-etkisi.md)**: `ptrace` kontrolleri, zamanlama saldırıları ve doğrudan syscall tuzaklarını aşmak.
4. **[Çalışma anı izlerini yorumlamak](rehberler/izleri-yorumlamak.md)**: Gözlem, hipotez ve kanıt ayrımı; çoklu telemetri korelasyonu.

---

## Sonraki Adım

Konular arasındaki derin teknik referansları ve makale arşivini incelemek için [Kaynak kütüphanesini](kaynak-kutuphanesi.md) ziyaret edin.
