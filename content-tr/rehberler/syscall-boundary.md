---
title: İşlev çağrısından Linux sistem çağrısına
description: pread çağrısını uygulamadan libc üzerinden çekirdeğe kadar izleyin ve yazmaç kurallarını karşılaştırın.
---

# İşlev çağrısından Linux sistem çağrısına

Bir C programı `pread` işlevini platformunun işlev ABI’sine göre çağırır. libc sarmalayıcısı Linux sistem çağrısının argümanlarını hazırlar, çekirdeğe geçer ve çekirdek hatalarını C kitaplığının kullandığı biçime dönüştürür. Linux x86-64’te bu iki geçişi izleyin, ardından AArch64’teki yazmaç görevleriyle karşılaştırın. Kullanıcı alanındaki çağrı kuralları için [İşlev ABI’leri ve ikili uyumluluk](abi.md) rehberine bakın.

## Her geçişte yazmaçların görevi

| Geçiş | Seçici ve denetim aktarımı | Sırasıyla tamsayı ve işaretçi argümanları | Sonuç |
| --- | --- | --- | --- |
| Linux x86-64 işlev çağrısı | Kullanıcı alanındaki bir adrese `call` | `rdi, rsi, rdx, rcx, r8, r9`, ardından yığın | `rax` |
| Linux x86-64 sistem çağrısı | Numara `rax` yazmacında. `syscall` çekirdeğe geçer. | `rdi, rsi, rdx, r10, r8, r9` | `rax` |
| Linux AArch64 işlev çağrısı | Kullanıcı alanındaki bir adrese `bl` veya `blr` | `x0–x7`, ardından yığın | `x0` |
| Linux AArch64 sistem çağrısı | Numara `w8` yazmacında. `svc #0` çekirdeğe geçer. | `x0–x5` | `x0` |

x86-64’te `syscall`, kullanıcı alanındaki dönüş adresi için `rcx`, saklanan bayraklar için `r11` kullanır. Bu nedenle Linux dördüncü argümanı `r10` yazmacında alır. AArch64’te bu örnekteki ilk altı argümanın yazmaçları iki çağrı türünde de aynıdır ve sistem çağrısı numarasının kendi yazmacı vardır. Mimarilere göre numara ve eşlemeler için [sistem çağrısı kurallarına](https://zaryob.github.io/syscall/#conventions), [x86-64 tablosuna](https://zaryob.github.io/syscall/arch/x64/) ve [AArch64 tablosuna](https://zaryob.github.io/syscall/arch/arm64/) bakın. [Linux man-pages syscall(2)](https://man7.org/linux/man-pages/man2/syscall.2.html), [Linux x86-64 çekirdek giriş kodu](https://github.com/torvalds/linux/blob/master/arch/x86/entry/entry_64.S).

## Dört argümanlı bir çağrıyı izleme

Bu program bir dosyanın ikinci baytını okur. `pread` bir dosya tanıtıcısı, bir arabellek işaretçisi, bayt sayısı ve ofset alır. Yukarıdaki Linux hedeflerinde çekirdekteki çağrı [pread64](https://zaryob.github.io/syscall/call/pread64/) adını taşır. Kaynak kod, libc’nin genel amaçlı `syscall()` işlevini hedefin `SYS_pread64` sabitiyle çağırmaya da izin verir.

```c pread-boundary.c
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>

int main(int argc, char **argv) {
    int fd = open("fixture.txt", O_RDONLY);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    char byte;
    ssize_t count;
    if (argc > 1 && argv[1][0] == 's') {
        count = syscall(SYS_pread64, fd, &byte, (size_t)1, (off_t)1);
    } else {
        count = pread(fd, &byte, 1, 1);
    }
    if (count < 0) {
        perror("pread");
    } else if (count == 1) {
        putchar(byte);
        putchar('\n');
    }
    close(fd);
    return count == 1 ? 0 : 1;
}
```

Kaynak kodu indirip Linux’ta, C derleyicisi, Binutils ve strace kurulu bir ortamın boş dizininde aşağıdaki komutları çalıştırın.

```sh
printf 'ABC\n' > fixture.txt
cc -g -O0 pread-boundary.c -o pread-boundary
strace -e trace=pread64 ./pread-boundary
strace -e trace=pread64 ./pread-boundary syscall
objdump -dr --disassemble=main ./pread-boundary
```

Her iki komut da `B` yazdırır ve 1 ofsetinden bir bayt okuyan `pread64` çağrısını izler. İzdeki argümanları `pread64(fd, "B", 1, 1) = 1` ile eşleştirin. Dosya tanıtıcısı sürece bağlıdır ve dinamik bağlayıcı daha önce başka `pread64` çağrıları yapabilir. Uygulamanın makine kodu dökümünde normal işlev çağrıları, strace çıktısında ise çekirdeğe geçişler görünür.

### Yazmaç değerlerini GDB ile inceleme

Linux x86-64’te glibc kullanıyorsanız `gdb -q ./pread-boundary` komutunu başlatın. Normal `pread` yolunu çalıştırıp sarmalayıcının girişinde durun. GDB, `pread` eş adları için birden fazla kesme noktası gösterirse uygulama çağrısında duran noktayı kullanın. `bt` çıktısından doğrulayabilirsiniz.

```text gdb
break main
run
break *pread
continue
info registers rdi rsi rdx rcx
catch syscall pread64
continue
info registers orig_rax rdi rsi rdx r10
continue
info registers rax
```

Sarmalayıcıya girişte dördüncü argümanın değeri 1’dir ve `rcx` yazmacındadır. Çekirdeğe girişte aynı değer `r10` yazmacındadır. GDB’nin Linux x86-64 sistem çağrısı yakalama noktası, saklanan çağrı numarasını `orig_rax` olarak gösterir. Dönüş yakalama noktasında bayt sayısını görmek için `rax` değerini okuyun. Sarmalayıcı, libc’ye ve süreç durumuna bağlı olarak iptal işlemlerini ele alan koddan geçebilir. Genel amaçlı `syscall()` yolunda çağrı numarası ilk C argümanıdır. Bu yüzden işlev girişinde ofset beşinci argüman olarak `r8` yazmacındadır. Çekirdek her iki yolda da aynı ofseti `r10` yazmacında görür. [GDB sistem çağrısı yakalama noktaları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Catchpoints.html), [glibc x86-64 sistem çağrısı sarmalayıcısı](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/unix/sysv/linux/x86_64/syscall.S).

## Dönüş değerini doğru katmanda yorumlama

Linux x86-64 ve AArch64, çekirdek düzeyindeki bu geçişte negatif hata numaraları kullanır. libc’nin `pread()` ve `syscall()` işlevleri hata durumunda `-1` döndürüp `errno` değerini ayarlar. Kısa okumada yalnızca okunan bayt sayısı döner. Sıfırdan fazla bayt talep eden bu örnekte sıfır sonucu dosya sonunu gösterir. Bir C kitaplığı işlevi farklı adlı bir sistem çağrısını sarmalayabilir veya işlemi kullanıcı alanında yapabilir. Bu örneği başka sistemlere ve mimarilere uyarlarken [pread kılavuzuna](https://man7.org/linux/man-pages/man2/pread.2.html) ve [sistem çağrısı referansına](https://zaryob.github.io/syscall/#conventions) bakın.
