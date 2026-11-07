---
title: execmap
description: Linux ELF tersine mühendisliği, dosya yapısı, çekirdek yükleyicisi, bellek haritaları ve çalışma anı gözlem rehberi.
---

# Linux ikili analizi ve ELF başucu kitabı

Bir ELF (Executable and Linkable Format) dosyası, bir programın bellekteki canlı varlığının durağan planıdır. İşletim sistemi çekirdeği dosyanın segmentlerini sanal belleğe eşler, dinamik yükleyici kütüphane sembollerini çözer, derleyicinin kurduğu yapılar çalışma anında ete kemiğe bürünür. Özel yükleyiciler ve paketleyiciler ise bu süreci kullanıcı alanında taklit ederek kodu bellek içinde gizlice açabilir.

`execmap`; diskteki durağan baytlardan çekirdekteki dinamik çalışma anına uzanan tüm mekanizmaları, belgelenmiş sistem davranışları ve pratik laboratuvarlarla açıklayan kapsamlı bir Türkçe tersine mühendislik başvuru kitabıdır.

---

## Araştırma Soruna Göre Başla

- **Dosya belleğe nasıl yerleşiyor?** [ELF dosyadan belleğe](rehberler/elf-dosyadan-bellege.md), [Parser doğrulama](rehberler/elf-parser-ve-adresler.md), [Linker düzeni ve bellek haritası](rehberler/linker-duzeni.md).
- **Çağrı gerçekte nereye gidiyor?** [Başlangıç ve auxv](rehberler/baslangic-ve-auxv.md), [Dinamik bağlama: GOT ve PLT](rehberler/dinamik-baglama.md).
- **İsimler ve semboller silindiğinde ne kalır?** [Stripped ELF](rehberler/stripped-elf.md), [İkili fark analizi (Binary Diffing)](rehberler/ikili-fark-analizi.md).
- **Kod bellekte mi oluşuyor ve gizleniyor?** [Özel yükleyiciler ve in-memory execution](rehberler/ozel-yukleyiciler.md), [Paketli ve şifrelenmiş ELF](rehberler/paketli-elf.md), [Core dökümleri ve snapshot](rehberler/core-ve-snapshot.md).
- **Çalışma anında neyi, nasıl ölçebilirim?** [perf ve Intel PT](rehberler/perf-ile-yurutme.md), [eBPF ile olaylar](rehberler/ebpf-ile-olaylar.md), [Analiz aracının etkisi ve anti-debugging](rehberler/analiz-aracinin-etkisi.md), [İzleri yorumlamak](rehberler/izleri-yorumlamak.md).

---

## Uygulamalı Laboratuvarlar

Kendi terminalinizde derleyip çalıştırabileceğiniz somut deneylerle öğrenin:

- **[Bellek İzinleri](laboratuvarlar/bellek-izinleri.md)**: Anonim belleğin RW'den RX'e geçişini ve izin değişiminin yürütme kanıtı olmadığını görün.
- **[Sembol Seçimi](laboratuvarlar/sembol-secimi.md)**: `LD_PRELOAD` ile ikiliyi değiştirmeden çağrı hedeflerini kancalayın.
- **[Debug Bilgisi](laboratuvarlar/debug-bilgisi.md)**: DWARF sembollerini ikiliden ayırın, strip edin ve `.gnu_debuglink` ile GDB'ye bağlayın.
- **[Derleme Farkları](laboratuvarlar/derleme-farklari.md)**: `-O0`, `-O2` ve `-Os` arasındaki inlining, yığın ve döngü dönüşümlerini inceleyin.

---

## Başvuru Masası ve Rotalar

- **[Okuma Rotaları](okuma-rotalari.md)**: Temel yükleyici mimarisinden ileri düzey çekirdek gözlemine 3 yapılandırılmış öğrenme patikası.
- **[Kaynak Kütüphanesi](kaynak-kutuphanesi.md)**: ABI şartnameleri, Linux kaynak kodu, GNU belgeleri ve ikili analiz literatürü.
- **[Birincil Kaynaklar ve Felsefe](kaynaklar.md)**: Linux çekirdeği, System V ABI ve DWARF standartlarının teknik temelleri.
