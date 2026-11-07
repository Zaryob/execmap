---
title: ELF literatürü ve teknik kaynak kütüphanesi
---

# ELF literatürü ve teknik kaynak kütüphanesi

Bu kütüphane, dosya yapısından çalışma anına uzanan inceleme soruları için standartları, uygulama kaynaklarını ve araç yazarlarının belgelerini bir araya getirir. Her kaynak belirli bir teknik soruya bağlanır; bir aracın varlığı, ürettiği yorumun doğruluğunu tek başına kanıtlamaz.

## 1. Biçim ve Mimari Sözleşmeleri

- **[System V ABI: ELF](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html)** — ELF başlıkları, program yükleme ve dinamik bağlama için genel sözleşme.
- **[x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)** — x86-64 çağrı kuralları, süreç başlangıç durumu ve mimariye özgü relocation tanımları. Genel ELF şartnamesinden ayrı okunmalıdır.
- **[elf(5)](https://man7.org/linux/man-pages/man5/elf.5.html)** — Linux üzerinde kullanılan ELF veri yapıları ve alanları. [Dosyadan belleğe](rehberler/elf-dosyadan-bellege.md) rehberinin başvuru metni.
- **[DWARF standardı](https://dwarfstd.org/)** — Debug bilgisi, satır tabloları ve çağrı çerçevesi tanımları. [Debug bilgisi laboratuvarı](laboratuvarlar/debug-bilgisi.md) ile birlikte okunabilir.

## 2. Çekirdek ve Dinamik Yükleyici

- **[Linux v6.12: fs/binfmt_elf.c](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)** — `load_elf_binary`, segment eşleme ve ilk yığın düzeninin uygulaması. Sürüm sabittir; başka sürümdeki davranış ayrıca kontrol edilmelidir.
- **[execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)** ve **[getauxval(3)](https://man7.org/linux/man-pages/man3/getauxval.3.html)** — Süreç görüntüsünün değişmesi ve yardımcı vektör alanları. [Başlangıç ve auxv](rehberler/baslangic-ve-auxv.md).
- **[ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)** — Kütüphane arama yolları, `LD_PRELOAD`, `LD_DEBUG` ve güvenli yürütme modu. [Dinamik bağlama](rehberler/dinamik-baglama.md).
- **[mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)**, **[mprotect(2)](https://man7.org/linux/man-pages/man2/mprotect.2.html)** ve **[proc_pid_maps(5)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)** — Bellek eşlemelerinin oluşturulması, izinleri ve gözlenen adres aralıkları.
- **[memfd_create(2)](https://man7.org/linux/man-pages/man2/memfd_create.2.html)** — Dosya tanımlayıcısı üzerinden kullanılan anonim dosyalar. [Özel yükleyiciler](rehberler/ozel-yukleyiciler.md).

## 3. Bağlayıcılar ve Sembol Çözümleme Literatürü

- **[GNU ld: Linker Scripts](https://sourceware.org/binutils/docs/ld/Scripts.html)** — Girdi bölümlerinin çıktı bölümlerine yerleşimi, adresler ve bellek düzeni. [Linker düzeni](rehberler/linker-duzeni.md).
- **[Fangrui Song: All about -fPIC and -fPIE](https://maskray.me/blog/2021-05-09-all-about-fpic-and-fpie)** — Konumdan bağımsız kodun derleyici ve bağlayıcı tarafları.
- **[Fangrui Song: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)** — Sembol araya girme davranışı ve bağlayıcı seçeneklerinin etkileri. [Sembol seçimi laboratuvarı](laboratuvarlar/sembol-secimi.md).
- **[Fangrui Song: All about symbol versioning](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)** — Sembol sürüm tabloları ve ABI uyumluluğu.
- **[Ian Lance Taylor: Linkers](https://www.airs.com/blog/archives/38)** — Bağlayıcının görevlerini adım adım açıklayan teknik yazı dizisi.

## 4. Ayrıştırma ve İkili Dönüştürme

- **[pyelftools — Eli Bendersky ve katkıcılar](https://github.com/eliben/pyelftools)** — Python ile ELF ve DWARF ayrıştırma. [Parser ve adresler](rehberler/elf-parser-ve-adresler.md).
- **[LIEF](https://github.com/lief-project/LIEF)** — Çalıştırılabilir biçimleri okuma ve değiştirme; [ELF düzenleme örneği](https://lief.re/doc/latest/tutorials/02_elf_hooking.html).
- **[PatchELF](https://github.com/NixOS/patchelf)** — ELF interpreter, RPATH ve RUNPATH alanlarını değiştirme.
- **[fq — Mattias Wadman ve katkıcılar](https://github.com/wader/fq)** — İkili yapıları sorgulama ve bayt düzeyinde inceleme.
- **[Binsider — Orhun Parmaksız ve katkıcılar](https://github.com/orhun/binsider)** — ELF başlıklarını ve bağımlılıklarını terminalde inceleme.
- **[ELFkickers — Brian Raiter](https://github.com/BR903/ELFkickers)** — `sstrip` dahil küçük ELF araçları; yükleme için gerekli yapıların incelenmesine yardımcı olur. [Stripped ELF](rehberler/stripped-elf.md).
- **[UPX](https://github.com/upx/upx)** — Açık kaynaklı çalıştırılabilir paketleyici ve açıcı. [Paketli ELF](rehberler/paketli-elf.md) için incelenebilir bir uygulama.

## 5. Karşılaştırma, Debug ve Snapshot

- **[Ghidra — NSA](https://github.com/NationalSecurityAgency/ghidra)** — Disassembly, decompilation ve Version Tracking bileşenleri. [İkili fark analizi](rehberler/ikili-fark-analizi.md).
- **[BinDiff](https://github.com/google/bindiff)** — Fonksiyon ve temel blok eşleştirme; eşleşme skoru davranış eşitliği kanıtı değildir.
- **[BioDiff — 8051Enthusiast](https://github.com/8051Enthusiast/biodiff)** — Bayt dizilerini hizalayarak görsel karşılaştırma.
- **[GDB belgeleri](https://sourceware.org/gdb/current/onlinedocs/gdb.html/)** — Ayrı debug dosyaları, core incelemesi ve çalışan süreçten döküm alma.
- **[core(5)](https://man7.org/linux/man-pages/man5/core.5.html)** — Core üretim koşulları ve sınırları. [Core ve snapshot](rehberler/core-ve-snapshot.md).
- **[ECFS — Ryan O'Neill](https://github.com/elfmaster/ecfs)** — Genişletilmiş core snapshot biçimi üzerine araştırma.
- **[CRIU](https://github.com/checkpoint-restore/criu)** — Süreç durumunu kaydetme ve geri yükleme. Bir core dosyasının incelenmesinden farklı bir kapsamı vardır.

## 6. Çalışma Anı Gözlemi ve Ölçüm

- **[Kernel: perf events and tool security](https://docs.kernel.org/admin-guide/perf-security.html)** — Sayaç verileri, örnekleme ve erişim denetimi. [Perf ile yürütme](rehberler/perf-ile-yurutme.md).
- **[Linux v6.12: Intel PT belgeleri](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)** — Donanımsal izleme paketleri, çözümleme ve kayıt sınırları.
- **[Kernel: libbpf overview](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)** ve **[BPF ring buffer](https://docs.kernel.org/bpf/ringbuf.html)** — BPF programları ve kullanıcı alanına olay aktarımı.
- **[Kernel: Uprobe tracer](https://docs.kernel.org/trace/uprobetracer.html)** — Kullanıcı alanında dosya ofsetine bağlanan izleme noktaları. [eBPF ile olaylar](rehberler/ebpf-ile-olaylar.md).
- **[bpftrace](https://bpftrace.org/docs)** — İzleme dili ve kullanılan sürüme ait başvuru belgeleri.
- **[Brendan Gregg: BPF Performance Tools](https://www.brendangregg.com/bpf-performance-tools-book.html)** — Sistem performansını BPF araçlarıyla inceleyen kitap ve örnekler.

## Kaynakları Kullanırken

Bir şartname amaçlanan sözleşmeyi, kaynak kod belirli bir uygulamayı, deney ise belirli bir ortamda gözlenen sonucu gösterir. Bu üç katmanı [araştırma yöntemindeki](kaynaklar.md) kayıtlarla ilişkilendirin. Dış kaynaklar kendi yazarlarının telif ve lisanslarına tabidir; burada bağlantı verilmesi içeriklerinin yeniden lisanslandığı anlamına gelmez.
