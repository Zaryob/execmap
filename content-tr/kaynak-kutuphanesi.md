---
title: ELF literatürü ve teknik kaynaklar
description: Dosya düzeni ve çalışma zamanı davranışı için standartlara, uygulama kaynaklarına ve araç belgelerine ulaşın.
---

# ELF literatürü ve teknik kaynaklar

Bu kütüphane, dosya düzenini ve çalışma zamanı davranışını incelerken başvurabileceğiniz standartları, kaynak kodunu ve araç belgelerini bir araya getirir. Her kaynak belirli bir teknik soruya yanıt verir. Araç çıktılarından yaptığınız çıkarımları ilgili belgeler ve ölçümlerle doğrulayın.

## 1. Dosya biçimi ve mimari kurallar

- **[System V ABI: ELF](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html)** ELF başlıkları, program yükleme ve dinamik bağlantı için genel sözleşme.
- **[x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)** x86-64 çağrı kuralı, başlangıç işlem durumu ve mimariye özgü yer değiştirmeler. Genel ELF spesifikasyonundan ayrı olarak okuyun.
- **[elf(5)](https://man7.org/linux/man-pages/man5/elf.5.html)** Linux'ta kullanılan ELF yapıları ve alanları. [Dosyadan belleğe ELF](rehberler/elf-dosyadan-bellege.md) rehberinin başvuru kaynağı.
- **[DWARF standardı](https://dwarfstd.org/)** Hata ayıklama bilgileri, satır tabloları ve çağrı çerçevesi açıklamaları. [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](laboratuvarlar/debug-bilgisi.md)'nin yanında okuyun.

## 2. Çekirdek ve dinamik bağlayıcı

- **[Linux v6.12: fs/binfmt_elf.c](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)** `load_elf_binary`, segment haritalama ve ilk yığın düzeninin uygulanması. Sürüm sabitlendi; diğer sürümleri ayrı ayrı kontrol edin.
- **[execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)** ve **[getauxval(3)](https://man7.org/linux/man-pages/man3/getauxval.3.html)** İşlem görüntüsünün değiştirilmesi ve yardımcı vektör alanlarına erişim. [Program başlangıcı, yığın düzeni ve yardımcı vektör](rehberler/baslangic-ve-auxv.md).
- **[ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)** Kütüphane arama yolları, `LD_PRELOAD`, `LD_DEBUG` ve güvenli yürütme modu. [Dinamik bağlama, GOT, PLT ve sembol çözümleme](rehberler/dinamik-baglama.md).
- **[mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)**, **[mprotect(2)](https://man7.org/linux/man-pages/man2/mprotect.2.html)** ve **[proc_pid_maps(5)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)** Haritalar, izinler ve gözlemlenen adres aralıkları oluşturma.
- **[memfd_create(2)](https://man7.org/linux/man-pages/man2/memfd_create.2.html)** Dosya tanımlayıcıları aracılığıyla erişilen anonim dosyalar. [Özel yükleyiciler ve bellekten çalıştırma](rehberler/ozel-yukleyiciler.md).

## 3. Bağlayıcılar ve sembol çözümleme

- **[GNU ld: Linker Scripts](https://sourceware.org/binutils/docs/ld/Scripts.html)** Girdi bölümlerini çıktı bölümlerine yerleştirme, adresler ve bellek düzeni. [Bağlayıcı düzenini ve bellek haritalarını okuma](rehberler/linker-duzeni.md).
- **[GCC: Kod Oluşturma Seçenekleri](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)** PIC/PIE seçenekleri için derleyici sözleşmesi.
- **[Fangrui Song: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)** Bir sembolün başka bir tanımla karşılanması ve bağlayıcı seçeneklerinin buna etkisi. [LD_PRELOAD ile sembol seçimi ve işlevi geçersiz kılma](laboratuvarlar/sembol-secimi.md).
- **[Fangrui Song: All about symbol versioning](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)** Sembol sürüm tabloları ve ABI uyumluluğu.
- **[Ian Lance Taylor: Linkers](https://www.airs.com/blog/archives/38)** Bağlayıcının sorumluluklarını adım adım açıklayan teknik bir seri.

## 4. Ayrıştırma ve ikili dönüşüm

- **[pyelftools Eli Bendersky ve katkıda bulunanlar](https://github.com/eliben/pyelftools)** ELF ve DWARF Python ile ayrıştırılıyor. [ELF ayrıştırıcısını ve adres hesaplarını doğrulama](rehberler/elf-parser-ve-adresler.md).
- **[LIEF](https://github.com/lief-project/LIEF)** Çalıştırılabilir formatları okuma ve değiştirme; [ELF Python API](https://lief.re/doc/latest/formats/elf/python.html).
- **[PatchELF](https://github.com/NixOS/patchelf)** ELF yorumlayıcısını, RPATH ve RUNPATH alanlarını değiştirme.
- **[fq Mattias Wadman ve katkıda bulunanlar](https://github.com/wader/fq)** İkili yapıları sorgulamak ve baytları incelemek.
- **[Binsider Orhun Parmaksız ve katkıda bulunanlar](https://github.com/orhun/binsider)** Terminalde ELF başlıkları ve bağımlılıkları inceleniyor.
- **[ELFkickers Brian Raiter](https://github.com/BR903/ELFkickers)** `sstrip` dahil küçük ELF araçları, yükleme için gerekli yapıları incelemek için kullanışlıdır. [Sembolleri ayıklanmış ELF dosyalarını okuma](rehberler/stripped-elf.md).
- **[UPX](https://github.com/upx/upx)** Çalıştırılabilir dosyaları paketleyen ve açan özgür yazılım. Örnek kullanım [Paketlenmiş ve şifrelenmiş ELF dosyalarını inceleme](rehberler/paketli-elf.md).

## 5. Karşılaştırma, hata ayıklama ve anlık görüntüler

- **[Ghidra NSA](https://github.com/NationalSecurityAgency/ghidra)** Makine kodundan assembly çıkarma, ters derleme ve sürüm takibi. [İkili dosya farkları ve sürüm karşılaştırması](rehberler/ikili-fark-analizi.md).
- **[BinDiff](https://github.com/google/bindiff)** İşlev ve temel blok eşlemesi. Eşleme puanı yapısal benzerliği ölçer. Davranışı ayrıca doğrulayın.
- **[BioDiff — 8051Enthusiast](https://github.com/8051Enthusiast/biodiff)** Bayt dizilerini hizalayarak görsel karşılaştırma.
- **[GDB belgeleri](https://sourceware.org/gdb/current/onlinedocs/gdb.html/)** Ayrı hata ayıklama dosyaları, çekirdek analizi ve çalışan süreçlerin dökümleri.
- **[core(5)](https://man7.org/linux/man-pages/man5/core.5.html)** Çekirdek dökümünün oluşma koşulları ve sınırları. [Core dökümleri ve süreç belleği](rehberler/core-ve-snapshot.md).
- **[ECFS Ryan O'Neill](https://github.com/elfmaster/ecfs)** Analiz için genişletilmiş bir çekirdek biçimi; yeniden yürütme ayrı [ecfs_exec prototipi](https://github.com/elfmaster/ecfs_exec). Yardımcı araçların README dosyalarındaki sınırlamalara bakın.
- **[CRIU](https://github.com/checkpoint-restore/criu)** Linux süreçlerinin durumunu kaydedip geri yükleme. Çekirdek dökümü analizinden farklı bir kapsamı ve uyumluluk gereksinimleri vardır.

## 6. Çalışma zamanı gözlemi ve ölçümü

- **[Çekirdek belgeleri — perf olayları ve araç güvenliği](https://docs.kernel.org/admin-guide/perf-security.html)** Sayaç verileri, örnekleme ve erişim kontrolü. [perf ile yürütme analizi ve donanım izleme](rehberler/perf-ile-yurutme.md) ile uygulama.
- **[Linux v6.12 — Intel PT belgeleri](https://github.com/torvalds/linux/blob/v6.12/tools/perf/Documentation/perf-intel-pt.txt)** Donanım izleme paketleri, kod çözme ve kayıt limitleri.
- **[Çekirdek belgeleri — libbpf’e genel bakış](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)** ve **[BPF halka tamponu](https://docs.kernel.org/bpf/ringbuf.html)** BPF programları ve olayların kullanıcı alanına aktarılması.
- **[Çekirdek belgeleri — uprobe ile izleme](https://docs.kernel.org/trace/uprobetracer.html)** Dosya ofsetine bağlanan kullanıcı alanı izleme noktaları. [eBPF ile çalışma zamanı olaylarını gözlemleme](rehberler/ebpf-ile-olaylar.md) ile olaylar.
- **[bpftrace](https://bpftrace.org/docs)** Kullanılan sürüm için izleme dili ve referans belgeleri.
- **[Brendan Gregg: BPF Performans Araçları](https://www.brendangregg.com/bpf-performance-tools-book.html)** BPF araçlarıyla sistem performansını araştırmak için bir kitap ve örnekler.

### Sıfırdan perf ve bpftrace

Performans analizine yeni başlıyorsanız bu kaynakları [başlangıç rotasındaki](okuma-rotalari.md#beginner-track-perf-and-bpftrace-from-zero) sırayla okuyun.

- **[Brendan Gregg — USE yöntemi](https://www.brendangregg.com/usemethod.html)** Kaynak kullanımı, doygunluk ve hatalar için bir kontrol listesi. [Çalışma zamanı performans analizine giriş](rehberler/performans-analizine-giris.md)'den performans analizi.
- **[perf vikisi — eğitim](https://perfwiki.github.io/main/tutorial/)** `perf stat`, `perf record` ve `perf report`, perf topluluğu tarafından açıklanmış, çıktı alanları ile birlikte.
- **[Brendan Gregg: Linux perf örnekleri](https://www.brendangregg.com/perf.html)** Araştırma sorusuna göre gruplandırılmış tek satırlık komut örnekleri.
- **[Brendan Gregg: CPU Alev Grafiği](https://www.brendangregg.com/FlameGraphs/cpuflamegraphs.html)** ve **[FlameGraph betikleri](https://github.com/brendangregg/FlameGraph)** Alev grafiklerinin nasıl oluşturulduğu ve okunduğu. [perf ile CPU profili ve alev grafiği](laboratuvarlar/cpu-profili.md).
- **[Tek satırlık örneklerle bpftrace](https://github.com/bpftrace/bpftrace/blob/master/docs/tutorial_one_liners.md)** Her biri dilin bir özelliğini tanıtan on iki kısa ders. [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](rehberler/bpftrace-temelleri.md).
- **[bpftrace kılavuzu](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)** Prob tipleri, yerleşikler, harita işlevleri ve seçenekleri; `bpftrace --version` ile eşleşen sürümü kontrol edin.
- **[Brendan Gregg: Off-CPU Analysis](https://www.brendangregg.com/offcpuanalysis.html)** CPU örneklemesinin bekleme süresini neden kaçırdığı ve bu sürenin nasıl ölçüleceği. [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](rehberler/debug-is-akisi.md), [Az CPU kullanan yavaş bir programı teşhis etme](laboratuvarlar/yavas-program-teshisi.md).

## 7. Assembly ve tersine mühendislik hazırlığı

- **[Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)** Birinci cilt yazmaçları ve verinin gösterimini, ikinci cilt komutların davranışını açıklar. `lea` ve `mov` komutları, işaretli ve işaretsiz koşullar ile erişim genişliği için teknik başvuru kaynağı. [x86-64 assembly okumaya hazırlık](rehberler/assembly-okuma.md) rehberine de bakın.
- **[System V AMD64 psABI: Low Level System Information](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)** Linux x86-64 işlevlerine girişte argüman aktarımı, yığın ve dönüş kuralları. Windows x64 ve sistem çağrıları için ayrı kurallar geçerlidir.
- **[GDB — Makine kodu](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html), [Adımlama](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [Bellek](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html), [Atama](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html)** — [GDB ile ilk inceleme](laboratuvarlar/gdb-ilk-inceleme.md) laboratuvarında kullanılan komutlar. Laboratuvarda çalışan sürecin belleği değiştirilir. Diskteki ikili dosyaya yapılan değişiklikler ayrı bir inceleme konusudur.
- **[GCC — Optimizasyon seçenekleri](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html), [GDB: Optimize Edilmiş Kod](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html), [Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html)** Komut dönüşümleri, hata ayıklayıcıdaki görünürlük ve hedef bellekteki değişiklikler. [Optimizasyon altında dallanma ve işaretçiler](laboratuvarlar/dallanma-ve-pointer.md) laboratuvarında kullanılır.
- **[mytechnotalent/Reverse-Engineering ve katkıda bulunanlar](https://github.com/mytechnotalent/Reverse-Engineering)** Çalışma dizisini tamamlayan eğitim kaynağı. x64 dizisindeki 127–132. dersler veri genişliğini, çağrıları ve adreslemeyi, 160–163. dersler ise küçük programlardaki değişkenleri, dallanmayı ve işaretçileri ele alır. ABI ve komut kuralları için ilgili standartlara başvurun. İncelenen [README revizyonu](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/README.md) 7 Kasım 2026’da kayda alındı. Depo kökündeki [Apache-2.0 lisansı](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/LICENSE) depoyu kapsar. Bağlantı verilen dış eserler kendi lisanslarına tabidir. Metinler ve C deneyleri Execmap için yazıldı.

## Kaynakları kullanmak

Standart beklenen davranışı, kaynak kodu belirli bir uygulamayı, deney ise belirli bir ortamda yapılan gözlemi açıklar. Bunları ilişkilendirmek için [inceleme yöntemi rehberindeki](kaynaklar.md) kayıtları tutun. Bağlantı verilen eserler, yazarlarının telif haklarına ve kendi lisanslarına tabidir.
