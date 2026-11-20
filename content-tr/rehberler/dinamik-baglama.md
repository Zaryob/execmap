---
title: Dinamik bağlama, GOT, PLT ve sembol çözümleme
description: Yeniden konumlandırmaları inceleyin ve bir çağrının gerçek hedefini bulun.
---

# Dinamik bağlama, GOT, PLT ve sembol çözümleme

Linux'ta dinamik olarak bağlı bir ELF dosyası, `libc.so.6`'deki `puts` veya `malloc` gibi harici kütüphanelerdeki işlevlerin çalışma zamanı adreslerini derleyerek bilemez. ASLR, paylaşılan kütüphaneleri her yürütmede farklı adreslere yükleyebilir.

ELF bunu desteklemek için iki önemli yapı kullanır:

1. **GOT (Global Offset Table)**: Veri ve işlevler için çözümlenmiş bellek adreslerini tutan bir işaret tablosu.
2. ** PLT (Procedure Linkage Table)**: İlk çağrıyı gecikmeli bağlama ve daha sonra çözümlenmiş GOT yuvası üzerinden yapılan çağrılar için dinamik bağlayıcı üzerinden yönlendirebilen çalıştırılabilir çağrı koçanları.

GOT/PLT mekanizması, harici çağrıları, işlev kancalarını ve RELRO bellek korumalarını açıklamaya yardımcı olur.

## 1. GOT ve PLT nasıl etkileşime girer?

Aşağıdaki yürüyüş sadece **gecikmeli bağlama** altında tutar. Anında bağlama ile (`-z now`, veya `LD_BIND_NOW` ortama ayarlanır), dinamik bağlantıcı başlangıçta işlev yer değiştirmelerini çözer, bu nedenle ilk çağrı zaten ulaşır `puts` ve çözümleyici adımı gözlemlenemez. Araç zinciri bağlantılarınızı tembelce varsaymayın: Ubuntu, örneğin listeler `BIND_NOW` [varsayılan derleyici ve bağlayıcı bayrakları] arasında](https://documentation.ubuntu.com/security/security-features/process-memory/compiler-flags/). Diziyi çoğaltmak için, tembel bağlanmayı açıkça talep edin ve dinamik bölümü kontrol edin:

```bash
gcc -Wl,-z,lazy ornek.c -o ornek
readelf -dW ./ornek | grep NOW
```

Çıkış yok, bu da hemen bağlanma bayrağı kaydedilmediği anlamına geliyor. A `BIND_NOW` giriş `FLAGS`, veya `NOW` içinde `FLAGS_1`, dosyanın başlangıçta bağlı olduğu anlamına gelir; Debian kitap kurdunda GNU ld ile kontrol eder 2.40 (x86-64 Kasım 1964 14, 2026, `-z now` hem üretti hem de `-z lazy` İkisi de değil. `LD_BIND_NOW` Çevrede hala çalışma zamanında hemen bağlanmayı zorlar ([ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)).

Bu ön koşulla, aşağıdaki şema, PLT ve GOT'tan geçerken ilk `puts("Hello")` çağrısını göstermektedir. `GOT[puts]`, işlevin `.got.plt` yuvası anlamına gelir; `GOT+8` ve `GOT+16`, dinamik bağlantılayıcının bağlantı haritalayıcı ve çözümleyici adresi ile doldurduğu `.got.plt`'nin ikinci ve üçüncü kelimeleridir:

```text
User code                  PLT (.plt)                    GOT (.got.plt)
+------------------+       +------------------------+    +-------------------------+
| call puts@plt    | ----> | puts@plt:              | -> | GOT[puts]               |
+------------------+       |   jmp *GOT[puts]       |    | Initially points back   |
                          |   push $reloc_offset   | <- | into the PLT entry      |
                          |   jmp PLT0             |    +-------------------------+
                          +------------------------+
                                     |
                                     v
                          +------------------------+    +-------------------------+
                          | PLT0 (common resolver) | -> | _dl_runtime_resolve()   |
                          |   pushq GOT+8(%rip)    |    | Find puts in libc.so    |
                          |   jmp *GOT+16(%rip)    |    | and update GOT[puts]    |
                          +------------------------+    +-------------------------+
                                                                   |
                                                                   v
                                                        Execute resolved puts()
```

Stub metni [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)'nin tembel PLT'sini takip eder. `-fcf-protection` ile yapılan yapılar `endbr64` ve ayrı bir `.plt.sec` ile bir varyant kullanabilir; şematik yerine kendi dosyanızdan `objdump -d -j .plt` çıktısını karşılaştırın.

### Tembel bağlama, adım adım

1. ** İlk arama**: `call puts@plt` PLT girişine kontrolü aktarır.
2. **İlk atlama**: `jmp *GOT[puts]` çalıştırır. Başlangıçta slot, `puts` yerine `push $reloc_offset` yolunda PLT girişine geri döner.
3. ** Çözücü girişi**: Yer değiştirme bilgileri itilir ve `jmp PLT0`, kontrolü ortak dinamik bağlantı çözümleyici yoluna aktarır.
4. ** Çözünürlük ve güncelleme**: `_dl_runtime_resolve()` yolu sembolü çözer, `puts`'yi `libc.so`'de bulur ve `GOT[puts]`'yi çözümlenmiş adresle günceller.
5. ** Daha sonra arar**: `puts@plt`'ye yapılan bir başka çağrı, bu çözünürlüğü tekrar etmeden doğrudan çözülmüş GOT yuvasından atlar.

## 2. redelf ile yer değiştirmelerin incelenmesi

Bir ELF dosyasının yer değiştirme kayıtlarını ve harici referansları incelemek için `readelf -r`'yi kullanın:

```bash
readelf -r ./ornek
```

Bu revizyon sırasında hiçbir yer değiştirme dökümü oluşturulmadı. Bildirilen kayıt sayısını gerçek çıktıdaki her girişle birlikte kaydedin; adresler ve kayıtlar yapı ve bağlantıya göre değişir.

### Ortak x86-64 yer değiştirme tipleri

- **`R_X86_64_JUMP_SLOT`**: PLT aracılığıyla çözülen bir işlev adresi için GOT girişi.
- **`R_X86_64_GLOB_DAT`**: Bir işlev veya veri sembolü için GOT adresinin yeniden yerleştirilmesi.
- **`R_X86_64_RELATIVE`**: ASLR/PIE için yük tabanı tarafından ayarlanan göreceli bir adres.
- **`R_X86_64_IRELATIVE`**: Çalışma zamanında dolaylı çözünürlük, mevcut CPU özellikleri için bir `memcpy` uygulaması seçmek gibi GNU IFUNC davranışıyla ilişkili.

## 3. Kısmi ve tam RELRO

Yazılabilir GOT yuvaları, GOT overwrite saldırıları da dahil olmak üzere bellek bozulmasının hedefleridir. ** RELRO (Relocation Read-Only)**, yer değiştirmeden sonra bu yazılabilir alanı azaltır.

Yaygın GNU/Linux ELF seçenekleri şunlardır:

- `-Wl,-z,norelro`: RELRO bölgesi talep etmeyin.
- `-Wl,-z,relro`: `PT_GNU_RELRO` oluşturun; Tembel PLT yuvaları yazılabilir kalabilir.
- `-Wl,-z,relro,-z,now`: Ortak "tam RELRO" düzenlemesi; Başlangıçta dinamik işlev yer değiştirmelerini çözün ve ilgili GOT alanını salt okunur hale getirin.

Korunan aralığı doğrulayın `readelf -lW` ve runtime haritalamaları. Bir kayıp `.got.plt` bölüm tanımın gerekli bir parçası değildir. RELRO yazılabilir-GOT saldırı yüzeyini azaltır; bu işlemde keyfi kod çalıştıran bir saldırgana karşı mutlak koruma değildir. İzin politikası sayfaların tekrar yazılabilir hale gelmesine izin verebilir `mprotect` ([glibc RELRO uygulaması](https://github.com/bminor/glibc/blob/glibc-2.40/elf/dl-reloc.c), [mprotect()]2)](https://man7.org/linux/man-pages/man2/mprotect.2.html)).

## 4. PLTHook, Frida, ve eBPF

**PLTHook**, C. Anahatta GOT/PLT mekanizmasını manipüle etmenin bir örneğidir:

1. `PT_DYNAMIC` segmentini tarayarak `DT_JMPREL` yer değiştirmelerini ve `DT_STRTAB` dizgelerini bulur.
2. `puts` gibi bir işlev için eşleşen bir `R_X86_64_JUMP_SLOT`'nin GOT ofsetini bulur.
3. `mprotect()` kullanarak sayfayı geçici olarak `PROT_READ | PROT_WRITE` olarak değiştirir.
4. GOT yuvasının işlev işaretçisini kanca ile değiştirir.

### Diğer gözlem mekanizmaları

- **Kullanıcı alanı: [Frida](https://frida.re/) Interceptor**:
  Frida bir hedef işlevi enstrümanlar; uygulanması bir GOT yuvasının değiştirilmesi ile aynı değildir. Bu örnek **Frida 17 API'sini kullanır** ([17.0.0 sürüm notları](https://frida.re/news/2025/05/17/frida-17-0-0-released/), [API](https://frida.re/docs/javascript-api/)); `puts` dışa aktarması yüklenmelidir:
  ```javascript
  Interceptor.attach(Module.getGlobalExportByName("puts"), {
      onEnter(args) { console.log("[+] puts: " + args[0].readUtf8String()); }
  });
  ```
  Bu blok, macOS arm64'te Frida 17.5.1 kullanarak kendi test sürecimizde bir `puts` çağrısına engel oldu. Bu API kontrolü Linux ataşma izinlerini veya koşullarını doğrulamaz.
- ** çekirdek seviyesi: [eBPF uprobes](https://docs.kernel.org/trace/uprobetracer.html)**:
  Bir uprobe, bir praks ilişkisi kurmadan bir kullanıcı işlevini gözlemleyebilir; Linux x86 uygulaması, hedef talimatta bir yazılım kesme noktası yazabilir. RENRO veri sayfaları ve uproblar farklı mekanizmalardır. [eBPF ile çalışma zamanı olaylarını gözlemleme](ebpf-ile-olaylar.md) erişim, maliyet ve algılama sınırlarını tartışır. Dağıtımınızda gerçek libc dosya yolunu kullanın.

## 5. Sembol arama ve LD_PRELOAD

**Symbol arama kapsamı** yüklü nesnelerden tanımları seçer. Ana program, önceden yüklenmiş nesneler ve bağımlılıklar normal glibc başlatmaya katılır; görünürlük, sembol sürümleme, `-Bsymbolic`, `dlopen` kapsamları ve ad uzayları sonucu değiştirebilir. Bir libc kancası ham syscalls kapsamaz.

**Kütüphane dosya arama ** ayrı bir işlemdir. Slash olmadan bir bağımlılık adı için, glibc `ld.so` genellikle arar:

1. `DT_RUNPATH` bulunmadığında ilgili `DT_RPATH`.
2. `LD_LIBRARY_PATH`, güvenli yürütme modu dışında.
3. `DT_RUNPATH`, sadece o nesnenin doğrudan bağımlılıkları için.
4. `/etc/ld.so.cache`.
5. Hedef ABI'nin varsayılan dizinleri.

Bir slash içeren bir isim bir yol olarak yorumlanır. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)`-z nodefaultlib` ve glibc-hwcaps gibi ayrıntılar için; `/lib64`'yi her mimaride varsaymayın.

## Derinlemesine inceleme

`LD_PRELOAD` değişen çağrı hedeflerini gözlemlemek için [LD_PRELOAD ile sembol seçimi ve işlevi geçersiz kılma](../laboratuvarlar/sembol-secimi.md)'yi deneyin. Sıradan sembol ve hata ayıklama bilgisi olmadığında analiz için [Sembolleri ayıklanmış ELF dosyalarını okuma](stripped-elf.md) ile çırpın.

[İşlev ABI’leri ve ikili uyumluluk](abi.md#test-an-existing-client-against-another-library-build) değişmemiş bir işlev gövdesi ile bir yükleyici hatası gözlemlemek için.

## Kaynaklar

- [MaskRay: Sembol versiyonu hakkında her şey](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)
- [MaskRay: ELF interpozisyonu ve -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [MaskRay: Yer değiştirmeleri, kanonik PLT girişlerini ve korumalı görünürlüğü kopyala](https://maskray.me/blog/2021-01-09-copy-relocations-canonical-plt-entries-and-protected)
- [glibc 2.40: _dl_fixup (elf/dl-runtime.c)](https://github.com/bminor/glibc/blob/glibc-2.40/elf/dl-runtime.c)
- [glibc 2.40: x86-64 çözücü trambolin](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/x86_64/dl-trampoline.h)
- [PLTHook Kanca işlevi PLT](https://github.com/kubo/plthook) üzerinden aramalar
- [ld.so Linux man-pages](https://man7.org/linux/man-pages/man8/ld.so.8.html)
