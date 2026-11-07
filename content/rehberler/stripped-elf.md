---
title: "Stripped ELF dosyalarını anlamlandırmak"
---

# Stripped ELF dosyalarını anlamlandırmak

Tersine mühendislik pratiğinde karşılaşılan ikili dosyaların neredeyse tamamı **"stripped"** (sembolleri arındırılmış) durumdadır. Bir dosya üzerinde `strip` komutu çalıştırıldığında fonksiyon adları, kaynak kod satır numaraları ve yerel değişken isimleri silinir.

Ancak "stripped" olmak, bir ikili dosyanın tamamen isimsiz veya okunamaz bir bayt yığınına dönüştüğü anlamına gelmez. Dinamik bağlama gereksinimleri, istisna yönetimi (exception handling) tabloları ve derleyicinin ürettiği yapısal izler, dosyanın mimarisini yeniden inşa etmek için zengin ipuçları sunar.

## 1. strip Komutu Neyi Siler, Neyi Silemez?

Bir ELF dosyasında iki farklı sembol tablosu bulunabilir:

```text
+-------------------------------------------------------------------------+
| .symtab ve .strtab (Statik Sembol Tablosu)                              |
| - Tüm fonksiyonların (statik/dahili dahil) ve yerel değişkenlerin adı. |
| - strip komutu bunu TAMAMEN SİLER.                                      |
+-------------------------------------------------------------------------+
| .dynsym ve .dynstr (Dinamik Sembol Tablosu)                            |
| - Dışarıdan çağrılan veya dışarıya sunulan fonksiyonların adı.         |
| - strip komutu bunu SİLEMEZ! Çünkü silinirse dinamik yükleyici          |
|   (ld-linux.so) çalışma anında sembolleri çözümleyemez.                 |
+-------------------------------------------------------------------------+
| .debug_* (DWARF Hata Ayıklama Bölümleri)                                |
| - Kaynak kod dosya yolları, satır numaraları, tip tanımları.            |
| - strip komutu bunu TAMAMEN SİLER.                                      |
+-------------------------------------------------------------------------+
| .eh_frame ve .eh_frame_hdr (Unwind Tabloları)                          |
| - C++ exception handling ve stack unwinding için gereklidir.           |
| - strip komutu bunu SİLEMEZ!                                            |
+-------------------------------------------------------------------------+
```

`file ./ornek` komutu çıktısında:
- `not stripped`: `.symtab` mevcuttur.
- `stripped`: `.symtab` silinmiştir, ancak dinamik bağlıysa `.dynsym` hâlâ yerindedir.

```bash
# Dinamik sembolleri listele (strip edilmiş olsa bile çalışır):
readelf --dyn-syms ./ornek
nm -D ./ornek
```

## 2. sstrip (Super Strip) ve Bölüm Tablosu Yanılsaması

Standart GNU `strip`, sembolleri temizlese bile dosyanın sonundaki Section Header tablosunu korur. Ancak Brian Raiter'ın geliştirdiği klasik **`sstrip` (Super Strip)** aracı, ELF tersine mühendisliğinde çığır açan temel bir gerçeği ispatlamıştır:

> **Linux çekirdeğinin ELF yükleyicisi (`fs/binfmt_elf.c`), dosyadaki Section Header tablosunu (`.text`, `.data`, `.rodata`) asla okumaz. Çekirdek sadece Program Header (`PT_LOAD`) segmentlerine bakar.**

`sstrip` çalıştırıldığında veya `e_shoff = 0` yapıldığında:
1. `readelf -S ./ornek` çıktısı "There are no sections in this file" der.
2. Ghidra, IDA ve statik araçlar bölümleri otomatik sınıflandırmakta zorlanır.
3. Ancak çekirdek dosyayı kusursuz biçimde belleğe yükler ve çalıştırır.

### Runtime'da Bölümsüz Dosyayı Ortaya Çıkarmak:
Statik olarak bölüm başlığı olmayan bir ikilinin kod ve veri sınırları çalışma anında `/proc/<pid>/maps` üzerinden saniyeler içinde çıkarılır:

```bash
cat /proc/$PID/maps
```

Çıktıdaki `r-xp` izni taşıyan sayfa doğrudan kod (`.text`), `rw-p` izni taşıyan sayfa ise veri (`.data` / `.bss`) segmentidir. Bölüm adları olmasa dahi çekirdeğin bellek haritası yalan söylemez.

## 3. Fonksiyon Sınırlarını Keşfetmenin Gizli Silahı: .eh_frame

C++ programlarında `try/catch` blokları, C programlarında ise `pthread_cancel` veya hata ayıklayıcıların çağrı yığını oluşturması (`stack unwinding`) için derleyici `.eh_frame` bölümünü oluşturur.

Bu bölüm DWARF Call Frame Information (CFI) kayıtlarını içerir. Her fonksiyon için bir **FDE (Frame Description Entry)** kaydı bulunur. Bu kaydın içinde:
- Fonksiyonun başlangıç sanal adresi (`initial_location`)
- Fonksiyonun bayt cinsinden tam uzunluğu (`address_range`)

açıkça yer alır! Yani bir ELF stripped olsa dahi, `.eh_frame` okunarak programdaki neredeyse tüm fonksiyonların başlangıç ve bitiş adresleri kusursuz bir kesinlikle çıkarılabilir:

```bash
readelf --debug-dump=frames ./ornek | grep -E "FDE.*pc="
```

Örnek çıktı:

```text
00000060 0000000000000014 00000064 FDE cie=00000000 pc=0x1140..0x1185
```

Burada `pc=0x1140..0x1185` ifadesi, `0x1140` adresinde başlayıp `0x1185` adresinde biten (uzunluğu `0x45` bayt) kesin bir fonksiyon sınırını gösterir.

## 4. Fonksiyon Giriş Heuristikleri (Prolog Analizi)

Eğer dosya `-fno-asynchronous-unwind-tables` ile derlenmiş ve `.eh_frame` de temizlenmişse, disassembler'lar fonksiyon sınırlarını mimariye özgü giriş kalıplarıyla (prologue) tespit eder:

### x86-64 Geleneksel Prologue:
```assembly
endbr64                 # f3 0f 1e fa (Intel CET Indirect Branch Tracking)
pushq   %rbp            # 55
movq    %rsp, %rbp      # 48 89 e5
subq    $0x20, %rsp     # Yığında yer açma
```

### Fonksiyon Bitişi (Epilogue):
```assembly
leaveq                  # c9
retq                    # c3
```

> [!NOTE]
> Modern derleyicilerde `-fomit-frame-pointer` varsayılan olduğundan `push %rbp` her zaman bulunmayabilir. Bunun yerine doğrudan yığın işaretçisini ayarlayan `sub $N, %rsp` veya sadece `ret` talimatları aranır.

## 5. Build-ID ve debuginfod ile Sembolleri Geri Kazanmak

Modern Linux dağıtımlarında (Ubuntu, Fedora, Debian, Arch) derlenen ikililere benzersiz bir SHA-1 sağlama toplamı olan **Build-ID** gömülür:

```bash
readelf -n ./ornek | grep "Build ID"
```

Çıktı:
```text
Build ID: a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

Bu kimlik, Linux dünyasının küresel hata ayıklama sunucu protokolü olan **`debuginfod`** ile eşleşir. GDB veya `debuginfod-find` aracı, sistemde kurulu olmasa bile dağıtım depolarından bu ikiliye ait özgün sembol ve kaynak dosyalarını otomatik olarak indirebilir:

```bash
debuginfod-find debuginfo a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

## İncelemeyi Derinleştir

Debug sembollerini ayırmayı, dosyayı strip etmeyi ve GDB ile ayrılmış sembolleri çalışma anında bağlamayı uygulamalı görmek için [Debug bilgisi laboratuvarı](../laboratuvarlar/debug-bilgisi.md) sayfasını tamamlayın. Sürümler arası kod farklarını sembolsüz ortamda eşleştirmek için [İkili fark analizi](ikili-fark-analizi.md) rehberine geçin.

## Kaynaklar

- [ELFkickers & sstrip — Brian Raiter](http://www.muppetlabs.com/~breadbox/software/elfkickers.html)
- [GNU strip — Binutils Documentation](https://sourceware.org/binutils/docs/binutils/strip.html)
- [GDB: Separate Debug Files](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [MaskRay: All about .eh_frame](https://maskray.me/blog/2020-11-08-stack-unwinding)
- [Kernel ORC unwinder documentation](https://www.kernel.org/doc/html/next/x86/orc-unwinder.html)
- [elfutils: debuginfod service](https://sourceware.org/elfutils/Debuginfod.html)
