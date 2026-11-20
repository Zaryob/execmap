---
title: Sembolleri ayıklanmış ELF dosyalarını okuma
description: Adlar kaldırıldıktan sonra kalan sembolleri, yığın çözümleme bilgisini ve ayrı hata ayıklama dosyalarını inceleyin.
---

# Sembolleri ayıklanmış ELF dosyalarını okuma

Komutlar, argüman yazmaçları ve bellek erişimi konusunda yeniyseniz, [x86-64 assembly okumaya hazırlık](assembly-okuma.md) ve [GDB ile ilk inceleme: C’den makine koduna](../laboratuvarlar/gdb-ilk-inceleme.md)'yi tamamlayın. Burada sınır çıkarımı bu temel veri akışı bilgisini temel alır.

Ters mühendislik sırasında karşılaşılan birçok ikili ** striped**'dir. `strip` çalıştırmak işlev adlarını, kaynak satır bilgilerini ve yerel değişken adlarını kaldırabilir.

Soyulmuş bir ikili, mutlaka isimsiz, okunamaz bir bayt dizisi değildir. Dinamik bağlantı gereksinimleri, istisna-elverişli veriler ve derleyici tarafından oluşturulan yapı, düzenini yeniden yapılandırmak için ipuçları sağlar.

## 1. Hangi şerit kaldırır ve ne kalır

Bir ELF dosyası iki farklı sembol tablosu içerebilir:

```text
+-----------------------------------------------------------------------+
| .symtab and .strtab: ordinary symbol table                             |
| Function names, including local/static symbols.                       |
| Ordinary stripping removes this table.                                |
+-----------------------------------------------------------------------+
| .dynsym and .dynstr: dynamic symbol table                              |
| Symbols required for dynamic linking, including imports and exports.   |
| Required dynamic entries remain after ordinary stripping.              |
+-----------------------------------------------------------------------+
| .debug_*: DWARF debug sections                                        |
| Source paths, line numbers, and type descriptions.                     |
| These are removed by stripping debug data.                             |
+-----------------------------------------------------------------------+
| .eh_frame and .eh_frame_hdr: unwind information                        |
| Used for exception handling and stack unwinding.                       |
| Normally retained by ordinary stripping.                              |
+-----------------------------------------------------------------------+
```

`file ./ornek` çıkışında:

- `not stripped`, sıradan sembol tablosunun kaldığını gösterir.
- `stripped`, kaldırıldığını gösterir; dinamik olarak bağlı dosyalar `.dynsym`'yi hala tutabilir.

```bash
# List dynamic symbols (also works after ordinary stripping):
readelf --dyn-syms ./ornek
nm -D ./ornek
```

## 2. sstrip ve bölüm tablosu varsayımı

Sıradan GNU `strip`, sembolleri kaldırdıktan sonra bile bir bölüm başlık tablosunu tutar. Brian Raiter'ın **strip** önemli bir ayrımı göstermektedir:

> Normal ELF segment yüklemesi program başlıkları tarafından yönlendirilir; bölüm adları ve sıradan bir bölüm tablosu gerekli değildir. Bu, bölüm tablolarının hiçbir zaman herhangi bir ELF uzantısı veya çekirdek doğrulama yolu tarafından okunmadığı bir kural değildir.

`sstrip`'den sonra veya bölüm tablosu meta verileri uygun şekilde kaldırıldığında:

1. `readelf -S ./ornek`, "Bu dosyada bölüm yok" şeklinde rapor verebilir.
2. Ghidra, IDA ve diğer statik araçlar otomatik sınıflandırmayı daha zor bulabilir.
3. Kernel, diğer gereksinimler geçerliyse dosyayı hala yükleyebilir; `e_shoff`'yi tek başına değiştirmek yeterli bir doğrulama değildir.

### Çalışma zamanında bölümsüz bir dosyanın incelenmesi

Çalışma zamanı haritalama aralıklarını incelemek için `/proc/<pid>/maps`'yi kullanın:

```bash
cat /proc/$PID/maps
```

`r-xp` çalıştırılabilir özel haritalamayı gösterir; `rw-p` yazılabilir özel haritalamayı belirtir. Bir haritalama birden fazla bölüm veya doldurma içerebilir. İzinler tam `.text` / `.data` sınırlarını göstermez. `PT_LOAD` ofsetleri ile karşılaştırın; yürütme ve kötü niyetlilik ayrı kanıt gerektirir.

## 3..eh_frame'de aday işlev sınırları

Derleyiciler, C++ istisna işleme, C iptal yolları ve hata ayıklayıcı yığını yeniden yapılandırması gibi gevşeme ihtiyaçları için `.eh_frame` üretir.

Bu bölüm DWARF Çağrı Çerçevesi Bilgisi (CFI) içerir. Bir FDE'nin başlangıç ve aralığı gevşeme bilgisinin kapsadığı komutları tanımlar. Kaynak işlevinin tam olarak bir FDE'ye karşılık gelmesi gerekmez: astarlama, bölme kodu ve eksik tablolar bu bire bir varsayımı bozar.

```bash
readelf --debug-dump=frames ./ornek | grep -E "FDE.*pc="
```

Binutils, `0x` (schematic adresler) gibi `pc=0000000000001140..0000000000001185` içermeyen aralıkları gösterir. Son özeldir. Bir gevşeme aralığı, kaynak düzeyindeki işlevlerin mükemmel bir envanteri değil, bir aday işlev sınırıdır.

## 4. Işlev-giriş buluşları

Yararlı gevşeme bilgisi olmadan, sökücüler aday işlevlerini tanımlamak için mimariye özgü prolog desenlerini kullanabilir. Örneğin, `-fno-asynchronous-unwind-tables` ve `.eh_frame` kaldırılmış bir yapı başka ipuçları gerektirebilir.

### Geleneksel bir x86-64 prologu

```text asm
endbr64                 # f3 0f 1e fa (Intel CET Indirect Branch Tracking)
pushq   %rbp            # 55
movq    %rsp, %rbp      # 48 89 e5
subq    $0x20, %rsp     # Allocate stack space
```

### Bir epilog

```text asm
leaveq                  # c9
retq                    # c3
```

> [!NOTE]
> Modern optimize edilmiş yapılar çerçeve işaretçilerini atlayabilir, bu nedenle `push %rbp` garanti edilmez. `sub $N, %rsp` gibi yığın işaretçi ayarlamaları veya sadece `ret`'den oluşan bir işlev de mümkündür.

## 5. Build-ID ve hata ayıklama ile hata ayıklama verilerinin kurtarılması

Bir bağlantıcı isteğe bağlı bir **Build-ID ** notu yerleştirebilir. GNU ld birden fazla stili destekler; SHA-1 zorunlu değildir. Bir Build-ID ne evrensel bir benzersizlik garantisi ne de değiştirilmiş bir dosyanın geçerli kontrolleri ([GNU ld seçenekleri](https://sourceware.org/binutils/docs/ld/Options.html)):

```bash
readelf -n ./ornek | grep "Build ID"
```

Bir şematik SHA-1 tarzı tanımlayıcı, ölçülen bir kimlik değil:

```text
Build ID: a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

** debuginfod** hata ayıklama verilerini bulmak için bu tanımlayıcıyı kullanabilir. GDB veya `debuginfod-find`, yerel olarak yüklenmediklerinde bile uygun bir sunucudan orijinal semboller ve kaynak eşleştirmesini indirebilir. Aşağıdaki illüstratif tanımlayıcıyı gerçek bir Build-ID ile değiştirin:

```bash
debuginfod-find debuginfo a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
```

## Derinlemesine inceleme

Sembolleri ayırmak, bir dosyayı soymak ve verileri GDB'de yeniden bağlamak için [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](../laboratuvarlar/debug-bilgisi.md)'yi tamamlayın. [İkili dosya farkları ve sürüm karşılaştırması](ikili-fark-analizi.md) ile devam ederek sıradan semboller olmadan sürümler arasında kod değişikliklerini eşleştirin.

## Kaynaklar

- [ELFkickers & sstrip Brian Raiter](http://www.muppetlabs.com/~breadbox/software/elfkickers.html)
- [GNU şerit Binutils Belgelendirme](https://sourceware.org/binutils/docs/binutils/strip.html)
- [GDB: Ayrı Hata Ayıklama Dosyaları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Separate-Debug-Files.html)
- [MaskRay: Yığın gevşetme](https://maskray.me/blog/2020-11-08-stack-unwinding)
- [çekirdek ORC gevşetici dokümantasyon](https://www.kernel.org/doc/html/next/x86/orc-unwinder.html)
- [elfutils: debuginfod service](https://sourceware.org/elfutils/Debuginfod.html)
