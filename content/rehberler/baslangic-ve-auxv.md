---
title: "Program başlangıcı, yığın düzeni ve auxiliary vector (auxv)"
---

# Program başlangıcı, yığın düzeni ve auxiliary vector (auxv)

Linux'ta bir program `execve` sistem çağrısıyla başlatıldığında, ilk çalışan kod `main()` fonksiyonu değildir. Hatta dinamik bağlı bir programda ilk çalışan kullanıcı alanı kodu, ikili dosyanın kendi kodu bile değildir.

Çekirdek (`kernel`), süreci oluşturup bellek eşlemelerini yaptıktan sonra, kullanıcı alanına (userspace) geçiş yaparken yığına (`stack`) kritik yapılandırma parametreleri yazar. Bu parametreler arasında argümanlar (`argv`), ortam değişkenleri (`envp`) ve işletim sisteminin çalışma anına dair sunduğu en önemli köprü olan **Yardımcı Vektör (Auxiliary Vector - `auxv`)** yer alır.

## 1. İlk Yığın Düzeni (Initial Stack Layout)

Çekirdeğin `fs/binfmt_elf.c` dosyasındaki `create_elf_tables()` fonksiyonu, kullanıcı alanı yığınının en tepesini System V AMD64 ABI kurallarına göre şöyle inşa eder:

```text
Yüksek Adresler (Stack Bottom)
+-------------------------------------------------------+
|  Platform string, execfn string, env/arg stringleri   |
+-------------------------------------------------------+
|  16-byte Rastgele Baytlar (AT_RANDOM için seed)       |
+-------------------------------------------------------+
|  Auxiliary Vector Entries: (uint64_t type, val)       |
|    ...                                                |
|    AT_SYSINFO_EHDR (vDSO adresi)                      |
|    AT_RANDOM       (Yığındaki rastgele bayt adresi)   |
|    AT_SECURE       (Setuid/Yetki bayrağı: 0 veya 1)   |
|    AT_ENTRY        (İkilinin asıl giriş adresi)       |
|    AT_BASE         (Dinamik yükleyicinin taban adresi)|
|    AT_PHDR         (Program Header tablosunun adresi) |
|    AT_NULL = 0     (Vektör sonlandırıcısı)            |
+-------------------------------------------------------+
|  NULL Gösterici                                       |
+-------------------------------------------------------+
|  envp[n-1], ..., envp[0]                              |
+-------------------------------------------------------+
|  NULL Gösterici                                       |
+-------------------------------------------------------+
|  argv[argc-1], ..., argv[0]                           |
+-------------------------------------------------------+
|  argc (Argüman sayısı, 64-bit tamsayı)                | <-- %rsp (Giriş anındaki Stack Pointer)
+-------------------------------------------------------+
Düşük Adresler
```

İşlemcinin kontrolü kullanıcı alanındaki giriş noktasına devredildiğinde, yığın işaretçisi (`%rsp` register'ı) doğrudan `argc` değerini gösterir.

## 2. _start ve __libc_start_main Giriş Rutini

Glibc tabanlı sistemlerde derlenen bir ikilinin `e_entry` adresinde `_start` sembolü bulunur (`sysdeps/x86_64/start.S`). Bu montaj kodu şu adımları izler:

```assembly
.global _start
_start:
    xorl %ebp, %ebp        # Call stack sonunu işaretlemek için RBP'yi sıfırla (DWARF unwinder için)
    movq %rdx, %r9         # Dinamik yükleyicinin sonlandırma fonksiyonu (rtld_fini)
    popq %rsi              # RSP'den argc değerini al (RSI = argc)
    movq %rsp, %rdx        # Geriye kalan RSP artık argv dizisidir (RDX = argv)

    # 16-bayt yığın hizalaması sağla
    andq $~15, %rsp

    pushq %rax             # Yığın hizalama padding'i
    pushq %rsp             # Stack end parametresi

    # __libc_start_main(main, argc, argv, init, fini, rtld_fini, stack_end)
    movq $main, %rdi       # 1. Argüman: main fonksiyonu
    call __libc_start_main
    hlt                    # Asla buraya dönmemeli
```

`__libc_start_main` çağrısı; `malloc` heap altyapısını başlatır, Thread-Local Storage (TLS) alanlarını kurar, C++ global kurucularını (`.init_array`) çalıştırır ve en nihayetinde `main(argc, argv, envp)` çağrısını yapar.

## 3. Auxiliary Vector (auxv) İncelemesi

Auxiliary Vector, çekirdeğin dinamik yükleyiciye ve C çalışma zamanına (libc) donanım yeteneklerini, güvenlik durumunu ve bellek adreslerini bildirdiği bir `(anahtar, değer)` tablosudur.

### Glibc ile auxv Değerlerini Terminalde İncelemek
Çalışma anında glibc'nin `LD_SHOW_AUXV=1` ortam değişkenini vererek çekirdeğin aktardığı tüm auxv girdilerini görebilirsiniz:

```bash
LD_SHOW_AUXV=1 /bin/true
```

Örnek çıktı:

```text
AT_SYSINFO_EHDR: 0x7ffd039d5000  (vDSO ELF başlığı)
AT_HWCAP:        0xbfebfbff      (İşlemci donanım yetenekleri)
AT_PAGESZ:       4096            (Sistem bellek sayfası: 4KB)
AT_CLKTCK:       100             (Saat vuruşu frekansı)
AT_PHDR:         0x55d2a1b24040  (Program Header tablosu)
AT_PHENT:        56              (Her bir Phdr girdisi boyutu)
AT_PHNUM:        13              (Program Header sayısı)
AT_BASE:         0x7f4b88a00000  (Dinamik yükleyici ld.so taban adresi)
AT_FLAGS:        0x0
AT_ENTRY:        0x55d2a1b25060  (Uygulamanın asıl giriş noktası _start)
AT_UID:          1000
AT_EUID:         1000
AT_GID:          1000
AT_EGID:         1000
AT_SECURE:       0               (Güvenli çalıştırma modu: Hayır)
AT_RANDOM:       0x7ffd039d3329  (Stack canary için 16 rastgele bayt)
AT_EXECFN:       /bin/true       (Çalıştırılan dosya yolu)
```

### C Kodu ile auxv Okumak: getauxval()
Bir C programında bu değerlere doğrudan erişmek için `<sys/auxv.h>` kütüphanesindeki `getauxval()` fonksiyonu kullanılır:

```c
#include <stdio.h>
#include <sys/auxv.h>
#include <elf.h>

int main(void) {
    unsigned long entry = getauxval(AT_ENTRY);
    unsigned long phdr  = getauxval(AT_PHDR);
    unsigned long vdso  = getauxval(AT_SYSINFO_EHDR);
    unsigned long rnd   = getauxval(AT_RANDOM);

    printf("Asil Giris Adresi (AT_ENTRY) : 0x%lx\n", entry);
    printf("Phdr Tablosu     (AT_PHDR)  : 0x%lx\n", phdr);
    printf("vDSO Adresi      (AT_SYSINFO): 0x%lx\n", vdso);

    if (rnd) {
        printf("Rastgele Baytlar (AT_RANDOM): ");
        unsigned char *p = (unsigned char *)rnd;
        for (int i = 0; i < 16; i++) printf("%02x ", p[i]);
        printf("\n");
    }

    return 0;
}
```

## 4. Güvenlik ve Tersine Mühendislik Açısından auxv

### AT_SECURE ve LD_PRELOAD Koruması
Bir ikili dosya `setuid`, `setgid` yetkilerine sahipse veya dosya yetenekleri (`file capabilities`, örn. `cap_net_raw`) atanmışsa, çekirdek `AT_SECURE=1` bayrağını zorunlu kılar.
Dinamik yükleyici `AT_SECURE == 1` gördüğünde:
- `LD_PRELOAD` ve `LD_LIBRARY_PATH` değişkenlerini derhal yok sayar (unset eder).
- Kütüphane arama yolunu yalnızca `/etc/ld.so.cache` ve güvenli sistem dizinleriyle (`/lib64`, `/usr/lib64`) sınırlar.

### AT_RANDOM ve Stack Canaries
Derleyicinin yığın taşmalarını önlemek için eklediği Stack Canary (`-fstack-protector`), glibc tarafından `AT_RANDOM` işaretçisinin gösterdiği 16 rastgele bayttan alınır ve Thread Control Block (TCB / FS register) alanına kopyalanır.

## İncelemeyi Derinleştir

Yükleyicinin `AT_BASE` adresindeki `ld.so` ile başlayan çalışma anı kütüphane çözümlemesini incelemek için [Dinamik bağlama](dinamik-baglama.md) rehberine geçin. Süreç belleğe yerleştikten sonra ikili farklılıkları tespit etmek için [İkili fark analizi](ikili-fark-analizi.md) bölümünü okuyun.

## Kaynaklar

- [getauxval — Linux man-pages (man 3 getauxval)](https://man7.org/linux/man-pages/man3/getauxval.3.html)
- [System V AMD64 ABI: Process Initialization](https://refspecs.linuxfoundation.org/elf/x86_64-abi-0.99.pdf)
- [Linux Kernel: fs/binfmt_elf.c create_elf_tables()](https://github.com/torvalds/linux/blob/master/fs/binfmt_elf.c)
- [glibc sysdeps/x86_64/start.S source](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/start.S)
- [MaskRay: Process initialization and the auxiliary vector](https://maskray.me/blog/2021-09-19-process-initialization)
