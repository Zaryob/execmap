---
title: Dosyadan belleğe ELF
description: ELF başlıklarını, segmentleri ve bölümleri okuyup dosya konumlarını bellek adresleriyle eşleştirin.
---

# Dosyadan belleğe ELF

Linux’ta yürütülebilir bir ELF (Executable and Linkable Format) dosyasını çalışan bir süreç görüntüsüne dönüştürmek için çekirdek ve dinamik bağlayıcı birlikte çalışır.

Tersine mühendislikte sık yapılan bir hata, Ghidra veya IDA gibi bir araca güvenip hemen `main()` işlevini aramaktır. İkili dosya önce çekirdeğin `execve` yolundan, dinamik bağlıysa sonra da dinamik bağlayıcıdan (`ld-linux.so`) geçer. Hangi baytların hangi izinlerle hangi sanal adreslere eşlendiğini anlamak, statik ve dinamik analizin temelidir.

## 1. Segmentler ve bölümler: iki görünüm

Bir ELF dosyasını **bağlama görünümü** ve **yürütme görünümü** olmak üzere iki açıdan okuyabilirsiniz.

```text
+-------------------------------------------------------+
| ELF header                                            |
+-------------------------------------------------------+
| Program header table: segments                        | <-- Kernel / loader
|   PT_LOAD (R)  -> ELF header, .dynsym, .rela.*        |     Determines mappings
|   PT_LOAD (RX) -> .init, .plt, .text                  |     and permissions.
|   PT_LOAD (R)  -> .rodata, .eh_frame                  |
|   PT_LOAD (RW) -> .dynamic, .got, .data, .bss         |
|   PT_DYNAMIC   -> .dynamic                            |
|   PT_INTERP    -> "/lib64/ld-linux-x86-64.so.2"         |
+-------------------------------------------------------+
| Sections                                              |
|   .text   : Code                                      | <-- Linker / debugger
|   .rodata : Read-only data                            |     Logical organization
|   .data   : Initialized data                          |     and symbols.
|   .bss    : Zero-initialized data                      |
+-------------------------------------------------------+
| Section header table                                  | <-- May be removed
+-------------------------------------------------------+
```

Dört `PT_LOAD` satırı şematiktir ve GNU ld’nin x86-64 Linux’ta varsayılan olarak oluşturduğu düzeni izler. Bu düzende salt okunur veri ile kod ayrı tutulur (`-z separate-code`). Segment sayısı sabit değildir. 14 Kasım 2026’da Debian Bookworm’un GNU ld 2.40 sürümüyle aynı küçük C programı derlendiğinde x86-64 çıktısında dört, aarch64 çıktısında iki `PT_LOAD` segmenti vardı. Kendi dosyanızda `readelf -lW` çıktısındaki bölüm-segment eşlemesine bakın.

### Program başlığı tablosu: segmentler

Çekirdekte, `fs/binfmt_elf.c` dosyasındaki `load_elf_binary()` normal segment yükleme kararlarını program başlıklarına göre verir. Olağan yükleme için bölüm tablosu gerekmez. Genişletilmiş program başlığı numaralandırması gibi ELF uzantıları ayrıca incelenmelidir:

- **`PT_LOAD`**: `PF_R`, `PF_W` ve `PF_X` izinleriyle eşlenecek bellek aralıkları.
- **`PT_INTERP`**: Dinamik bağlayıcının dosya yolu. Örneğin `/lib64/ld-linux-x86-64.so.2`.
- **`PT_DYNAMIC`**: Dinamik bağlama ve yeniden konumlandırma yapılarının yerini gösteren bilgiler.
- **`PT_GNU_STACK`**: Çalıştırılabilir yığın isteği. NX/DEP ile ilişkilidir.
- **`PT_GNU_RELRO`**: Yeniden konumlandırmadan sonra salt okunur yapılan bölge. Kısmi veya tam RELRO ile ilişkilidir.

### Bölüm başlığı tablosu: bölümler

Bağlayıcılar (`ld`, `lld`) ve hata ayıklayıcılar (`gdb`), `.text`, `.data`, `.symtab` ve `.strtab` gibi mantıksal bölümleri kullanır. Sembolleri ayıklama veya bölümleri değiştirme sırasında bölüm başlığı tablosu temizlense ya da bozulsa bile, diğer yükleme koşulları sağlanıyorsa dosya çalışabilir. Yalnızca bölüm adlarına dayanan bir analiz bu yüzden yanıltıcı olabilir.

## 2. readelf ile başlıkları ve segmentleri inceleme

Derlediğiniz programın mimarisini ve segmentlerini inceleyin:

```bash
readelf -h ./ornek
readelf -lW ./ornek
```

`-lW` segment türlerini, dosya konumlarını, sanal adresleri, `FileSiz`, `MemSiz`, izinleri ve hizalama değerini gösterir. Bu revizyonda Linux üzerinde `readelf` çıktısı alınmadığı için sabit adresli bir örnek verilmiyor. Kendi derlemenizin tam çıktısını kaydedin. Bir ELF64 program başlığı 56 bayttır. Tablo boyutunu girdi sayısıyla karşılaştırın.

### FileSiz ve MemSiz arasındaki fark: .bss alanı

`PT_LOAD` için `p_memsz > p_filesz` olması, segmentin bellekteki son kısmının sıfırla doldurulduğunu ve bu baytların dosyada karşılığı olmadığını gösterir. Olağan `.bss` düzeni bunu gerektirir. Linux v6.12’deki `elf_load()` yolunda `padzero()` dosyaya dayanan son sayfanın kalanını temizler. `vm_brk_flags` kalan tam sayfaları sıfırlanmış anonim bellek olarak ayırır. Bu fark tek başına paketleme kanıtı değildir.

## 3. Dosya ofsetini bellek adresine dönüştürme

Bir `PT_LOAD` segmenti, diskteki bir baytın dosya ofsetini süreçteki sanal adresiyle ilişkilendirir.

Formül şöyledir:

```text
Runtime virtual address (VMA) = Load bias + p_vaddr + (File offset - p_offset)
```

Burada:

- **`p_offset`** segmentin dosyadaki başlangıç ofsetidir.
- **`p_vaddr`** ELF dosyasında segment için kaydedilen sanal adrestir.
- **Yükleme farkı (load bias)**, dosya eşlenirken taban adrese uygulanan düzeltmedir. ASLR ve PIE nedeniyle yapılan yeniden konumlandırmayı da kapsar. PIE olmayan yürütülebilirlerde genellikle 0’dır. PIE yüklemesinde çoğunlukla rastgele bir taban adresi seçilir.

> [!WARNING]
> Formül yalnızca `FileSiz` kapsamındaki baytlar için geçerlidir. `MemSiz` içindeki sıfırla doldurulan `.bss` kısmının dosyada karşılığı yoktur.

## 4. /proc/PID/maps ile çalışma zamanı eşlemelerini denetleme

Sürecin gerçek eşlemelerini görmek için `/proc/<pid>/maps` dosyasını okuyun:

```bash
# Use the PID printed by the target:
PID=4821
cat /proc/"$PID"/maps
```

Aşağıdaki satırlar **temsili eşlemelerdir**. `cat /proc/self/maps` hedef sürecin değil, `cat` sürecinin eşlemelerini okur:

```text
55e4b6000000-55e4b6001000 r--p 00000000 103:02 12345678  /usr/bin/ornek
55e4b6001000-55e4b6002000 r-xp 00001000 103:02 12345678  /usr/bin/ornek
55e4b6002000-55e4b6003000 rw-p 00002000 103:02 12345678  /usr/bin/ornek
55e4b6003000-55e4b6004000 rw-p 00000000 00:00 0
7ffc39f0b000-7ffc39f2c000 rw-p 00000000 00:00 0         [stack]
7ffc39fdd000-7ffc39fe1000 r--p 00000000 00:00 0         [vvar]
7ffc39fe1000-7ffc39fe3000 r-xp 00000000 00:00 0         [vdso]
```

Sütunların anlamı:

1. **Adres aralığı**: Sayfa sınırına hizalanmış başlangıç ve bitiş sanal adresleri. Sayfa boyutu çoğunlukla 4 KB’dir (`0x1000`).
2. **İzinler**: `r` okuma, `w` yazma, `x` çalıştırma, `p` özel (yazmada kopyalama) ve `s` paylaşımlı eşleme anlamına gelir.
3. **Ofset**: Eşlemenin, dayandığı dosyada başladığı konum.
4. **Aygıt ve inode**: Eşlemenin dayandığı dosyanın aygıtı ve dosya sistemindeki inode numarası.
5. **Yol**: Eşlemenin dayandığı dosya. Adsız anonim eşlemelerin yol alanı çoğunlukla boştur. Linux 5.17’den itibaren adlandırılmış özel anonim eşlemeler `[anon:name]` biçiminde görünebilir. `maps`, bölüm sınırlarını göstermez ve hangi kodun çalıştığını kaydetmez.

## 5. Dinamik bağlama ve giriş noktası

ELF başlığındaki `e_entry` alanı doğrudan `main` işlevine işaret etmez.

Dinamik bağlı bir ELF için sıralama şöyledir:

1. Çekirdek yürütülebilir dosyayı yükler ve `PT_INTERP` alanını okur.
2. Denetimi `/lib64/ld-linux-x86-64.so.2` gibi bir dinamik bağlayıcıya devreder.
3. Bağlayıcı bağımlılıkları (`DT_NEEDED`) yükler ve yeniden konumlandırmaları uygular.
4. Denetim yürütülebilir dosyanın `e_entry` adresine (`_start`) geçer.
5. `_start` (glibc’de `sysdeps/x86_64/start.S`), çekirdeğin hazırladığı yığından argümanları okur ve `__libc_start_main` yoluyla `main` işlevine ulaşır.

GDB’de ilk komutta durmak için `break main` yerine `starti` kullanın:

```bash
gdb -q ./ornek
```

Ardından GDB isteminde:

```text gdb
starti
info proc mappings
x/5i $rip
```

`starti` ilk makine komutunda durur. Dinamik bağlı bir yürütülebilirde `$rip` başlangıçta `ld-linux.so` içindeki bir adrese, statik bağlı bir yürütülebilirde ise programın kendi başlangıç koduna işaret eder.

## Derinlemesine inceleme

Program başlıklarını ve adres aralıklarını kodla doğrulamak için [ELF ayrıştırıcısı ve adres hesapları](elf-parser-ve-adresler.md) rehberine geçin. Derleme sırasında oluşan düzeni [bağlayıcı düzeni](linker-duzeni.md), çekirdekten kullanıcı alanına geçişi ise [program başlangıcı ve auxv](baslangic-ve-auxv.md) rehberinde inceleyin.

## Kaynaklar

- [ELF — Linux man-pages (man 5 elf)](https://man7.org/linux/man-pages/man5/elf.5.html)
- [execve — Linux man-pages (man 2 execve)](https://man7.org/linux/man-pages/man2/execve.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
- [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)
- [Linux Kernel: fs/binfmt_elf.c implementation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
- [GCC: Code Generation Options — PIC/PIE](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)
