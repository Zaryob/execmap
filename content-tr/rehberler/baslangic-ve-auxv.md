---
title: Program başlangıcı, yığın düzeni ve yardımcı vektör
description: main çalışmadan önce çekirdeğin, yorumlayıcının ve çalışma zamanı bileşenlerinin ne yaptığını inceleyin.
---

# Program başlangıcı, yığın düzeni ve yardımcı vektör

Linux `execve` ile bir program başlattığında, `main()` çalıştırılacak ilk kod değildir. Dinamik olarak bağlı bir program için, ilk kullanıcı-uzay kodu bile çalıştırılabilir kodun kendi kodunun dışındadır.

Bellek haritalamalarını ayarladıktan sonra çekirdek, kullanıcı alanına kontrol aktarmadan önce kullanıcı yığınına kritik yapılandırma verileri yazar. Bu, argümanları (`argv`), ortam değişkenlerini (`envp`) ve işletim sistemi ile çalışma zamanı arasındaki bir köprü olan ** yardımcı vektörü (`auxv`)** içerir.

## 1. İlk yığın düzeni

`fs/binfmt_elf.c`'deki çekirdek `create_elf_tables()` işlevi, System V AMD64 ABI'ye göre ilk kullanıcı alanı yığınını oluşturur:

```text
Low address -> high address (Linux x86-64, schematic)
%rsp -> argc
        argv[0], ..., argv[argc-1], NULL
        envp[0], ..., envp[n-1], NULL
        auxv[0].type, auxv[0].value
        ... other auxv pairs ...
        AT_NULL, 0
        ... padding, random bytes, argv/env/platform strings ...
```

auxv `AT_NULL` sonlandırıcısı daha yüksek adres sonuna doğru. Diğer anahtarların sırasını kararlı bir API olarak ele almayın; mimari ve çekirdek sürümüne göre değişebilir. Dize ve rastgele baytlı bölgeler burada şematiktir.

İşlemci kontrolü kullanıcı-uzay giriş noktasına aktardığında, yığın işaretçisi (`%rsp`) `argc`'yi işaret eder.

## 2. _başlat ve __libc_start_ana rutinleri

glibc tabanlı sistemlerde `_start`, bir çalıştırılabilir `e_entry` adresi (`sysdeps/x86_64/start.S`) üzerinde bulunur. Aşağıdaki parça, glibc 2.40 Linux x86-64 LP64 başlangıç sözleşmesini şematik olarak açıklar. X32, statik PIE ve mimariye özgü ayrıntılarla sağlanan bağımsız bir CRT uygulaması değildir.

```text asm
.global _start
_start:
    xorl %ebp, %ebp        # Clear RBP to mark the end of the call stack for unwinding
    movq %rdx, %r9         # Dynamic linker termination function (rtld_fini)
    popq %rsi              # Read argc from RSP (RSI = argc)
    movq %rsp, %rdx        # The remaining stack begins at argv (RDX = argv)

    # Align the stack to 16 bytes
    andq $~15, %rsp

    pushq %rax             # Stack alignment padding
    pushq %rsp             # Stack-end parameter

    # __libc_start_main(main, argc, argv, init, fini, rtld_fini, stack_end)
    xorl %ecx, %ecx        # init = NULL (current glibc startup)
    xorl %r8d, %r8d        # fini = NULL
    movq main@GOTPCREL(%rip), %rdi  # PIC addressing: main
    call *__libc_start_main@GOTPCREL(%rip)
    hlt                    # Must not return here
```

`__libc_start_main` glibc startup ve constructor invocation'a katılır; `main` sonunda denir. Dinamik olarak bağlı bir program için başlangıç TLS yükleyici tarafından ayarlanır; statik glibc yolu libc başlatma sırasında TLS'yi başlatır ([libc-start.c](https://github.com/bminor/glibc/blob/glibc-2.40/csu/libc-start.c)). Malloc altyapısı tembelce başlatılabilir. Her şeyi yorumlama `__libc_start_main` yığın zaten başlatıldığını kanıt olarak çağırın ([malloc.c](https://github.com/bminor/glibc/blob/glibc-2.40/malloc/malloc.c)).

## 3. Yardımcı vektörü incelemek

Yardımcı vektör, çekirdeklerin donanım yeteneklerini, güvenlik durumunu ve bellek adreslerini dinamik bağlantılayıcıya ve C çalışma süresine bildirdiği bir `(key, value)` tablosudur.

### glibc ile bir terminalde auxv'nin incelenmesi

çekirdek tarafından sağlanan auxv girdilerini görüntülemek için glibc'nin `LD_SHOW_AUXV=1` ortam değişkenini ayarlayın:

```bash
LD_SHOW_AUXV=1 /bin/true
```

Bunu Linux/glibc'de çalıştırın ve gerçek çıktıyı kaydedin. `AT_PHDR`, `AT_PHENT`, `AT_PHNUM`, `AT_ENTRY`, `AT_BASE`, `AT_SECURE`, ve `AT_RANDOM` yüklemeyi açıklamaya yardımcı olur; adresler, donanım yetenekleri ve kullanılabilir alanlar çevreye bağlıdır. Hayır `LD_SHOW_AUXV` Bu revizyon sırasında çıktı ölçüldü.

### getauxval() ile C'de auxv okuma

Bir C programı, `<sys/auxv.h>`'de ilan edilen `getauxval()` aracılığıyla bu değerlere erişebilir:

```c
#include <stdio.h>
#include <sys/auxv.h>
#include <elf.h>

int main(void) {
    unsigned long entry = getauxval(AT_ENTRY);
    unsigned long phdr  = getauxval(AT_PHDR);
    unsigned long vdso  = getauxval(AT_SYSINFO_EHDR);
    unsigned long rnd   = getauxval(AT_RANDOM);

    printf("Program entry     (AT_ENTRY) : 0x%lx\n", entry);
    printf("Program headers  (AT_PHDR)  : 0x%lx\n", phdr);
    printf("vDSO address     (AT_SYSINFO_EHDR): 0x%lx\n", vdso);

    if (rnd) {
        printf("Random bytes     (AT_RANDOM): ");
        unsigned char *p = (unsigned char *)rnd;
        for (int i = 0; i < 16; i++) printf("%02x ", p[i]);
        printf("\n");
    }

    return 0;
}
```

`AT_SYSINFO_EHDR`, vDSO'nun ELF başlığının adresidir. [getauxval(3)](https://man7.org/linux/man-pages/man3/getauxval.3.html)'nin x86-64'de bulunmadığı şekilde listelediği bir vDSO sistem çağrı giriş noktası olan `AT_SYSINFO`'den farklı bir anahtardır.

## 4. güvenlik ve ters mühendislikte auxv

### AT_SECURE ve LD_PRELOAD kısıtlamaları

`AT_SECURE` güvenli yürütme modunu gösterir; etkin UID/GID değişiklikleri, yetenek kazanımı ve güvenlik modülü kararları katkıda bulunabilir. Bir dosyanın ayarlı bitini tek başına ayarlamak, her yürütmede bu modu garanti etmez.

Güvenli yürütme modunda, glibc görmezden gelir `LD_LIBRARY_PATH`. için `LD_PRELOAD`, kesik içeren yollar göz ardı edilir; Standart dizinlerde setuid biti olan ön yükleme nesneleri için dar bir istisna vardır. Program ortamından değişkenleri kaldırmak ve bunları kısıtlamalar altında işlemek ayrı konulardır. `DT_RPATH`/`DT_RUNPATH` bu modda basitçe elenmemektedir. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html).

### AT_RANDOM ve yığın kanaryaları

Yığın koruyucu kontrolleri için (`-fstack-protector`), glibc tüm kullanmaz 16 tarafından adreslenen rastgele baytlar `AT_RANDOM` Kanarya için. glibc'de 2.40, `_dl_setup_stack_chk_guard` ilk işaretçi boyutu bölümünü kopyalar (8 x86 üzerinde bayt-64) ve sonra bir baytı temizler, küçük-endian hedeflerinin en düşük adresli baytı, böylece kanarya hafızada sıfır bayt ile başlar. `_dl_setup_pointer_guard` aşağıdakileri alır 8 baytlar işaretçi koruması olarak, depolanan kod işaretçilerini karıştırmak için kullanılan ayrı bir değer ([dl-osinfo.h](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/generic/dl-osinfo.h)). Yukarıdaki program tarafından basılan baytlar bu nedenle kanaryanın kendisi değil, ham girdidir. x86-64 glibc yolu, koruma, FS kaydı üzerinden erişilen iş parçacığı kontrol bloğunda saklanır.

## Derinlemesine inceleme

`AT_BASE`'de `ld.so`'yi içeren kütüphane çözünürlüğünü incelemek için [dinamik bağlama](dinamik-baglama.md) ile devam edin. Yüklü işlemi anladıktan sonra ikili farklılıkları araştırmak için [binary diffing](ikili-fark-analizi.md) okuyun.

## Kaynaklar

- [getauxval Linux adam sayfaları (3 getauxval)](https://man7.org/linux/man-pages/man3/getauxval.3.html)
- [x86-64 psABI süreç başlatma ve çağrı kuralı](https://gitlab.com/x86-psABIs/x86-64-ABI)
- [Linux Kernel: fs/binfmt_elf.c create_elf_tables()](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
- [glibc sysdeps/x86_64/start.S kaynağı](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/x86_64/start.S)
