---
title: "ELF'i dosyadan belleğe takip etmek"
---

# ELF'i dosyadan belleğe takip etmek

Linux ortamında çalıştırılabilir bir ikili dosyanın (`ELF` - Executable and Linkable Format) diskteki durağan baytlardan bellekte çalışan bir süreç görüntüsüne (process image) dönüşmesi, işletim sistemi çekirdeği ve dinamik yükleyicinin ortaklaşa yürüttüğü katı bir protokole dayanır.

Tersine mühendislikte sıkça düşülen ilk hata, analiz aracına (Ghidra, IDA veya IDA benzeri araçlar) güvenip doğrudan `main()` fonksiyonunu aramaktır. Oysa modern sistemlerde ikili dosya, önce çekirdeğin `execve` altyapısı, ardından dinamik yükleyici (`ld-linux.so`) tarafından işlenir. Dosyanın diskteki baytlarının hangi sanal adreslere, hangi izinlerle ve nasıl eşlendiğini anlamak, tüm statik ve dinamik analizin temel taşıdır.

## 1. Segmentler ve Section'lar: İki Farklı Dünyanın Görünümü

Bir ELF dosyası iki farklı perspektiften okunabilir: **Bağlama (linking) görünümü** ve **Çalıştırma (execution) görünümü**.

```text
+-------------------------------------------------------+
|                     ELF Header                        |
+-------------------------------------------------------+
|             Program Header Table (Segments)           |  <-- Çekirdek (Kernel / Loader)
|  - PT_LOAD (RX)  -> .text, .rodata                    |      Sanal belleğe neyin eşleneceğini
|  - PT_LOAD (RW)  -> .data, .bss                       |      belirler. Section'ları bilmez.
|  - PT_DYNAMIC    -> .dynamic                          |
|  - PT_INTERP     -> "/lib64/ld-linux-x86-64.so.2"     |
+-------------------------------------------------------+
|                    Section'lar                        |
|  - .text (Kod)                                        |  <-- Linker / Debugger / Tersine Müh.
|  - .rodata (Salt okunur veri)                         |      Mantıksal parçaları ve sembolleri
|  - .data (Başlatılmış veri)                           |      ayırt etmek için kullanılır.
|  - .bss (Sıfırlanmış veri)                            |
+-------------------------------------------------------+
|              Section Header Table (Sections)          |  <-- Stripped olunca tamamen silinebilir!
+-------------------------------------------------------+
```

### Program Header Tablosu (Segments)
Çekirdeğin `fs/binfmt_elf.c` modülü içindeki `load_elf_binary()` fonksiyonu dosyayı belleğe alırken Section Header tablosunu **asla okumaz**. Çekirdek yalnızca `Program Header` tablosuna (Phdr) bakar:
- **`PT_LOAD`**: Sanal belleğe doğrudan eşlenecek bellek aralıklarını tanımlar. İzinleri (`PF_R`, `PF_W`, `PF_X`) bellidir.
- **`PT_INTERP`**: Dinamik yükleyicinin disk yolunu (`/lib64/ld-linux-x86-64.so.2`) içerir.
- **`PT_DYNAMIC`**: Dinamik sembol bağlama ve relocation tablolarının konumunu verir.
- **`PT_GNU_STACK`**: Yığının çalıştırılabilir (`RWX`) olup olmadığını belirler (NX/DEP güvenliği).
- **`PT_GNU_RELRO`**: Yükleme sonrasında salt-okunur yapılacak bellek segmentini tanımlar (Full/Partial RELRO).

### Section Header Tablosu (Sections)
Linker (`ld`, `lld`) ve hata ayıklayıcılar (`gdb`) tarafından kullanılır. `.text`, `.data`, `.symtab`, `.strtab` gibi mantıksal bölümler buradadır. Bir saldırgan ya da zararlı yazılım yazarının Section Header tablosunu sıfırlaması veya bozması (stripping / section mangling), dosyanın çalışmasını **kesinlikle engellemez**. Bu yüzden sadece section adlarına güvenen bir analiz motoru kolaylıkla yanıltılabilir.

## 2. readelf ile Başlık ve Segment İncelemesi

Kendi derlediğin bir programın mimarisini ve segmentlerini terminalden adım adım incele:

```bash
readelf -h ./ornek
readelf -lW ./ornek
```

`-lW` (geniş format) çıktısı segmentlerin bellek yerleşimini açıkça sergiler:

```text
Type           Offset   VirtAddr           PhysAddr           FileSiz  MemSiz   Flg Align
PHDR           0x000040 0x0000000000000040 0x0000000000000040 0x0002d0 0x0002d0 R   0x8
INTERP         0x000310 0x0000000000000310 0x0000000000000310 0x00001c 0x00001c R   0x1
LOAD           0x000000 0x0000000000000000 0x0000000000000000 0x000800 0x000800 R   0x1000
LOAD           0x001000 0x0000000000001000 0x0000000000001000 0x000450 0x000450 R E 0x1000
LOAD           0x002000 0x0000000000002000 0x0000000000002000 0x000180 0x000180 RW  0x1000
LOAD           0x002e00 0x0000000000003e00 0x0000000000003e00 0x000200 0x000840 RW  0x1000
DYNAMIC        0x002e10 0x0000000000003e10 0x0000000000003e10 0x0001e0 0x0001e0 RW  0x8
```

### FileSiz ve MemSiz Arasındaki Fark: .bss Alanı
Yukarıdaki son `LOAD` segmentine dikkat et:
- `FileSiz`: `0x000200` bayt
- `MemSiz`: `0x000840` bayt

`MemSiz > FileSiz` durumu, aradaki `0x640` baytlık alanın diskte yer kaplamadığını, çekirdek tarafından bellekte ayrılıp sıfırlandığını (`zero-initialized`) gösterir. Bu alan C programındaki global başlatılmamış değişkenlerin (`.bss`) yeridir. Çekirdek `fs/binfmt_elf.c` içinde `padzero()` çağrısı yaparak diskten okunmayan bu kısmı sıfır baytlarla doldurur. Bu durum tek başına bir packing/obfuscation belirtisi değil, ELF standart formatının doğal bir parçasıdır.

## 3. Dosya Offset'inden Bellek Adresine Dönüşüm

Statik analizde bir baytın diskteki offset'i ile sürecin adres uzayındaki sanal adresi (VMA) arasındaki ilişki `PT_LOAD` segmenti üzerinden kurulur.

Formül şöyledir:

```text
Çalışma Sanal Adresi (VMA) = Load Bias + p_vaddr + (Dosya Offset'i - p_offset)
```

Burada:
- **`p_offset`**: Segmentin dosyadaki başlangıç bayt offset'i.
- **`p_vaddr`**: Segmentin ELF başlığında belirtilen hedef sanal adresi.
- **`Load Bias`**: ASLR (Address Space Layout Randomization) veya PIE (Position Independent Executable) nedeniyle dosyanın belleğe yüklendiği taban adres kaymasıdır. Non-PIE ikililerde genellikle `0`'dır; PIE ikililerde çekirdek tarafından rastgele belirlenir.

> [!WARNING]
> Bu formül yalnızca `FileSiz` aralığında kalan baytlar için geçerlidir. `MemSiz` içindeki sıfırlanmış `.bss` bölgesinin diskte bir karşılığı (offset'i) bulunmaz.

## 4. Çalışma Anında /proc/PID/maps Doğrulaması

Bir sürecin belleğe gerçekten nasıl eşlendiğini görmek için `/proc/<pid>/maps` dosyasını okuyun:

```bash
cat /proc/self/maps
```

Örnek çıktı satırları:

```text
55e4b6000000-55e4b6001000 r--p 00000000 103:02 12345678  /usr/bin/ornek
55e4b6001000-55e4b6002000 r-xp 00001000 103:02 12345678  /usr/bin/ornek
55e4b6002000-55e4b6003000 rw-p 00002000 103:02 12345678  /usr/bin/ornek
55e4b6003000-55e4b6004000 rw-p 00000000 00:00 0         [anon]
7ffc39f0b000-7ffc39f2c000 rw-p 00000000 00:00 0         [stack]
7ffc39fdd000-7ffc39fe1000 r--p 00000000 00:00 0         [vvar]
7ffc39fe1000-7ffc39fe3000 r-xp 00000000 00:00 0         [vdso]
```

Her sütunun kesin teknik anlamı:
1. **Adres Aralığı**: Sayfa hizalı (genellikle 4KB - `0x1000`) başlangıç ve bitiş sanal adresi.
2. **İzinler**: `r` (read), `w` (write), `x` (execute), `p` (private/CoW) veya `s` (shared).
3. **Ofset**: Dosyanın hangi ofsetinden itibaren belleğe eşlendiği.
4. **Cihaz & Inode**: Dosyanın bulunduğu blok cihaz ve dosya sistemi inode numarası.
5. **Dosya Yolu**: Eşlemenin bağlı olduğu dosya. `[anon]` ifadesi, diskte bir dosyaya dayanmayan, doğrudan `mmap` ile ayrılmış anonim belleği ifade eder (örneğin heap veya `.bss` uzantısı).

## 5. Dinamik Bağlama ve Giriş Adresi (Entry Point)

ELF başlığındaki `e_entry` alanı doğrudan `main` adresini işaret etmez.

Dinamik bağlı bir ELF dosyasında:
1. Çekirdek ikiliyi yükler ve `PT_INTERP` segmentini okur.
2. Çekirdek, kontrolü doğrudan ikiliye değil, dinamik yükleyiciye (`/lib64/ld-linux-x86-64.so.2`) devreder.
3. Dinamik yükleyici bağımlı kütüphaneleri (`DT_NEEDED`) yükler, relocation işlemlerini çözer.
4. Kontrol ikilinin `e_entry` adresine (`_start`) devredilir.
5. `_start` (glibc `sysdeps/x86_64/start.S`) fonksiyonu, yığındaki `argc`, `argv`, `envp` ve `auxv` vektörlerini hazırlar ve `__libc_start_main` üzerinden nihayet `main` fonksiyonunu çağırır.

GDB'de programın ilk anını yakalamak için `break main` yerine `starti` komutunu kullanın:

```bash
gdb -q ./ornek
(gdb) starti
(gdb) info proc mappings
(gdb) x/5i $rip
```

`starti`, ilk işlemci komutunda durur. Dinamik bağlı ikililerde `$rip` ilk anda `ld-linux.so` içindedir; statik ikililerde ise doğrudan programın `_start` adresindedir.

## İncelemeyi Derinleştir

Dosya ve bellek eşleme temellerini kavradıktan sonra, program header ve section tablolarını kodla doğrulamak için [ELF parser ve adresler](elf-parser-ve-adresler.md) rehberine geçin. Bellek haritasının linker tarafından nasıl oluşturulduğunu görmek için [Linker düzeni](linker-duzeni.md) sayfasını, sürecin ayağa kalkışındaki çekirdek-kullanıcı alanı el sıkışmasını anlamak için ise [Başlangıç ve auxv](baslangic-ve-auxv.md) rehberini inceleyin.

## Kaynaklar

- [ELF — Linux man-pages (man 5 elf)](https://man7.org/linux/man-pages/man5/elf.5.html)
- [execve — Linux man-pages (man 2 execve)](https://man7.org/linux/man-pages/man2/execve.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
- [System V AMD64 ABI — Draft 0.99.6](https://refspecs.linuxfoundation.org/elf/x86_64-abi-0.99.pdf)
- [Linux Kernel: fs/binfmt_elf.c implementation](https://github.com/torvalds/linux/blob/master/fs/binfmt_elf.c)
- [MaskRay: All about -fPIC and -fPIE](https://maskray.me/blog/2021-05-09-all-about-fpic-and-fpie)
