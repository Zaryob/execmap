---
title: "Dinamik bağlama: GOT, PLT ve sembol çözümleme"
---

# Dinamik bağlama: GOT, PLT ve sembol çözümleme

Linux üzerinde dinamik olarak bağlanan (`dynamically linked`) bir ELF dosyası, harici kütüphanelerdeki (örneğin `libc.so.6` içindeki `puts` veya `malloc`) fonksiyonların adreslerini derleme anında bilemez. Çünkü paylaşımlı kütüphaneler her çalıştırmada ASLR nedeniyle belleğin farklı bir adresine yüklenebilir.

Bu sorunu çözmek için ELF mimarisi iki temel veri yapısı kullanır:
1. **GOT (Global Offset Table)**: Verilerin ve fonksiyonların nihai bellek adreslerini tutan işaretçi tablosu.
2. **PLT (Procedure Linkage Table)**: Fonksiyon çağrılarını dinamik yükleyici üzerinden ilk seferde çözümleyip (lazy binding) GOT'a yazan çalıştırılabilir atlama tablosu.

Tersine mühendislikte harici çağrıları izlemek, fonksiyonların kancalanmasını (hooking) anlamak ve bellek korumalarını (RELRO) kavramak için GOT PLT mekanizması anahtar roldedir.

## 1. GOT ve PLT Çalışma Mekanizması

Aşağıdaki şema, ilk kez çağrılan bir `puts("Merhaba")` fonksiyonunun PLT ve GOT arasındaki adım adım yolculuğunu gösterir:

```text
Kullanıcı Kodu                    PLT Bölümü (.plt)                      GOT Bölümü (.got.plt)
+-----------------------+         +----------------------------+         +----------------------------+
| call puts@plt         | ------> | puts@plt:                  | ------> | GOT[puts]                  |
+-----------------------+         |   jmp *GOT[puts]           |         |   (İlk başta PLT'nin       |
                                  |   push $reloc_offset       | <------ |    ikinci satırına döner!) |
                                  |   jmp PLT0                 |         +----------------------------+
                                  +----------------------------+                       |
                                                |                                      |
                                                v                                      v
                                  +----------------------------+         +----------------------------+
                                  | PLT0 (Ortak Çözücü):       | ------> | _dl_runtime_resolve()      |
                                  |   push *GOT[1] (link_map)  |         |   (libc.so içinde puts'u   |
                                  |   jmp  *GOT[2] (dl_resolve)|         |    bulur ve GOT[puts]'a    |
                                  +----------------------------+         |    gerçek adresi yazar)    |
                                                                         +----------------------------+
                                                                                       |
                                                                                       v
                                                                         puts() asıl adresi çalışır.
```

### Tembel Bağlama (Lazy Binding) Adımları:
1. **İlk Çağrı**: `call puts@plt` işletilir. Kontrol `puts@plt` adresine geçer.
2. **İlk Atlama**: `jmp *GOT[puts]` çalışır. Ancak ilk anda `GOT[puts]` hücresi henüz `puts` adresini tutmaz; `puts@plt`'nin hemen altındaki `push $reloc_offset` satırını gösterir!
3. **Çözücüye Geçiş**: Fonksiyonun relocation ofseti yığına atılır ve `jmp PLT0` ile dinamik yükleyicinin ortak çözücüsüne atlanır.
4. **Çözümleme ve Güncelleme**: Dinamik yükleyicinin `_dl_runtime_resolve()` fonksiyonu sembol tablosunu tarar, `libc.so` içindeki `puts` sanal adresini bulur ve `GOT[puts]` hücresine kalıcı olarak yazar.
5. **İkinci Çağrı**: Program daha sonra tekrar `puts@plt` çağırdığında, `jmp *GOT[puts]` doğrudan çözümlenmiş adrese atlar; yükleyici bir daha devreye girmez.

## 2. readelf ile Relocation Tablolarını İncelemek

Bir ELF dosyasının dış bağımlılıklarını ve relocation kayıtlarını `readelf -r` ile görebilirsiniz:

```bash
readelf -r ./ornek
```

Örnek çıktı:

```text
Relocation section '.rela.dyn' at offset 0x5a0 contains 4 entries:
  Offset          Info           Type           Sym. Value    Sym. Name + Addend
000000003df8  000200000006 R_X86_64_GLOB_DAT 0000000000000000 __libc_start_main + 0
000000003e00  000300000006 R_X86_64_GLOB_DAT 0000000000000000 __gmon_start__ + 0

Relocation section '.rela.plt' at offset 0x600 contains 2 entries:
  Offset          Info           Type           Sym. Value    Sym. Name + Addend
000000004018  000400000007 R_X86_64_JUMP_SLOT 0000000000000000 puts + 0
000000004020  000500000007 R_X86_64_JUMP_SLOT 0000000000000000 exit + 0
```

### Başlıca Relocation Tipleri (x86-64):
- **`R_X86_64_JUMP_SLOT`**: PLT tarafından çözülecek fonksiyon adresleri için GOT girdisi.
- **`R_X86_64_GLOB_DAT`**: Kütüphanelerden çekilen global değişkenlerin adresleri için GOT girdisi.
- **`R_X86_64_RELATIVE`**: ASLR/PIE nedeniyle taban adrese eklenmesi gereken göreceli adresler.
- **`R_X86_64_IRELATIVE`**: GNU IFUNC (Indirect Function) tarafından çalışma anında çözülecek fonksiyonlar (örneğin işlemcinin AVX2 desteğine göre farklı `memcpy` seçilmesi).

## 3. RELRO Güvenliği: Partial ve Full RELRO

GOT tablosu doğası gereği yazılabilir (`writable`) olduğunda, bellek güvenliği açıklarında saldırganların en çok hedef aldığı alandır (GOT Overwrite saldırısı). Bu riski önlemek için **RELRO (Relocation Read-Only)** koruması geliştirilmiştir.

| RELRO Seviyesi | Derleme Seçeneği | Lazy Binding? | .got İzni | .got.plt İzni | Güvenlik Durumu |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **No RELRO** | `-Wl,-z,norelro` | Var | RW | RW | Tamamen savunmasız |
| **Partial RELRO** | `-Wl,-z,relro` | Var | R (Salt-okunur) | RW (Yazılabilir) | `.got.plt` hâlâ ezilebilir |
| **Full RELRO** | `-Wl,-z,relro,-z,now` | **Yok (BIND_NOW)** | R (Salt-okunur) | Yok (Tümü .got içinde) | **Tam Koruma** |

Full RELRO ile derlenen bir programda (`gcc -Wl,-z,relro,-z,now`):
1. Dinamik yükleyici, program başlarken **tüm sembolleri anında** çözer (Tembel bağlama iptal edilir).
2. Çözümleme bittikten hemen sonra `mprotect()` çağrısı yapılarak tüm GOT tablosu salt-okunur (`PROT_READ`) yapılır.
3. Artık hiçbir zararlı kod çalışma anında GOT girdilerini değiştiremez.

## 4. PLTHook Mekanizması ve Modern Karşılıkları (Frida & eBPF)

Tarihsel **`PLTHook`** aracı, GOT/PLT mekanizmasını en saf C koduyla manipüle eden klasik bir örnektir. Yaptığı işlem temelde şudur:
1. Bellekteki `PT_DYNAMIC` segmentini tarayarak `DT_JMPREL` (relocation girdileri) ve `DT_STRTAB` dizgilerini bulur.
2. Hedef fonksiyonun adıyla (`puts`) eşleşen `R_X86_64_JUMP_SLOT` girdisinin GOT ofsetini tespit eder.
3. `mprotect()` ile o bellek sayfasını geçici olarak `PROT_READ | PROT_WRITE` yapar.
4. GOT hücresindeki orijinal fonksiyon göstericisini kendi kanca fonksiyonuyla değiştirir.

### Modern İkizleri:
- **Kullanıcı Alanında: [Frida](https://frida.re/) Interceptor**:
  PLTHook mantığını modern bir JavaScript API arkasında otomatikleştirir:
  ```javascript
  Interceptor.attach(Module.findExportByName(null, "puts"), {
      onEnter: function (args) { console.log("[+] puts: " + Memory.readUtf8String(args[0])); }
  });
  ```
- **Çekirdek Düzeyinde: [eBPF uprobes](https://docs.kernel.org/trace/uprobetracer.html)**:
  Sürecin belleğine hiç yazmadan, doğrudan çekirdek seviyesinde fonksiyon adresine kanca takar. Program `Full RELRO` ile korunsa veya `mprotect` engellense dahi eBPF çağrıyı görünmez biçimde izler:
  ```bash
  sudo bpftrace -e 'uprobe:/usr/lib/libc.so.6:puts { printf("puts: %s\n", str(arg0)); }'
  ```

## 5. Sembol Çözümleme Sırası ve LD_PRELOAD

Dinamik yükleyici bir sembolü ararken belirli bir arama kapsamı (`lookup scope`) uygular:
1. **Ana İkili**: Programın kendisi.
2. **`LD_PRELOAD`**: Kullanıcı tarafından önceden yüklenen kütüphaneler.
3. **`DT_RPATH` / `DT_RUNPATH`**: İkili dosyaya gömülü kütüphane arama yolları.
4. **`LD_LIBRARY_PATH`**: Ortam değişkenindeki yollar.
5. **`/etc/ld.so.cache`**: Sistem kütüphane önbelleği.
6. **Varsayılan Yollar**: `/lib64`, `/usr/lib64`.

Bu öncelik sırası nedeniyle `LD_PRELOAD` ile araya girilerek sistem çağrıları ve C fonksiyonları kolayca kancalanabilir (interposition).

## İncelemeyi Derinleştir

Sembol seçiminin `LD_PRELOAD` ile çalışma anında nasıl değiştiğini bizzat denemek için [Sembol seçimi laboratuvarı](../laboratuvarlar/sembol-secimi.md) uygulamasına geçin. Sembolleri ve hata ayıklama bilgilerini tamamen silinmiş ikililerde analiz yöntemlerini öğrenmek için [Stripped ELF](stripped-elf.md) rehberini inceleyin.

## Kaynaklar

- [MaskRay: All about symbol versioning](https://maskray.me/blog/2020-11-26-all-about-symbol-versioning)
- [MaskRay: ELF interposition and -Bsymbolic](https://maskray.me/blog/2021-05-16-elf-interposition-and-bsymbolic)
- [MaskRay: Copy relocations and canonical PLT entries](https://maskray.me/blog/2021-01-09-copy-relocations-canonical-plt-entries)
- [glibc elf/dl-runtime.c: _dl_runtime_resolve implementation](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/dl-runtime.c)
- [PLTHook — Hook function calls via PLT](https://github.com/kubo/plthook)

- [ld.so — Linux man-pages](https://man7.org/linux/man-pages/man8/ld.so.8.html)
