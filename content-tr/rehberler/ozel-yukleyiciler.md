---
title: Özel yükleyiciler ve bellekten çalıştırma
description: Yeni bir exec çağrısı olmadan belleğe yerleştirilen kodu izleyin.
---

# Özel yükleyiciler ve bellekten çalıştırma

> [!WARNING]
> `memfd_create`/`fexecve` bölümündeki 2 işlevi, verilen ELF baytları ne olursa olsun çalıştırır ve 4 bölümündeki LIEF örneği değiştirilmiş bir çalıştırılabilir yazar. Bunları yalnızca kendiniz derlediğiniz programlarla kullanın. Dosyalarınıza veya ağınıza erişmeden, atabileceğiniz izole bir sanal makinenin içinde inşa edemediğiniz herhangi bir örneği ele alın.

Linux'ta `execve`, mevcut işlem görüntüsünün yerini alır. `fork`'den önce bir öncekini gerektirmez ve PID'yi değiştirmez. `execveat` başka bir yürütme yoludur. Bu nedenle sadece `sys_enter_execve` izlemek her yolu kapsamaz; aracı doğrulayın ve kapsama alanını ayrı ayrı yönetin.

Gelişmiş kötü amaçlı yazılımlar, paketleyiciler ve bellek içi modüller, disk üzerindeki eserleri azaltmak veya `execve`'ye odaklanan kontrollerden kaçınmak için **özel yükleyiciler **veya** kullanıcı-uzay eki ** kullanır. Bu teknikler, çekirdekteki `load_elf_binary`'nin parçalarını kullanıcı alanında yeniden üretir, bir ELF görüntüsünü bellekte ayrıştırır ve yükler.

## 1. Bellek içi yüklemeye yaklaşır

Linux bellek içi yürütme teknikleri üç geniş yaklaşımla gruplandırılabilir:

```text
1. File-descriptor-based loading (memfd_create)
   [RAM] -> memfd_create() -> fexecve(fd) -> [Kernel ELF loading]
   (Kernel exec path; the syscall can be execveat or execve)

2. User-space loader
   [RAM] -> mmap(MAP_ANON) -> Copy segments -> Relocate -> jmp *e_entry
   (No new exec call; the existing process and PID remain)

3. Replacing memory inside a process (hollowing / /proc/self/mem)
   [Existing process] -> Unmap old image -> Map new ELF -> Prepare stack
```

## 2. memfd_yaratma ve frexecve

Linux 3.17'de tanıtılan `memfd_create`, geleneksel bir dosya sistemi dosyası oluşturmadan anonim, bellek destekli bir dosya için bir tanımlayıcı oluşturur:

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <limits.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <sys/mman.h>
#include <fcntl.h>

int run_from_memory(const unsigned char *elf_bytes, size_t size, char **argv, char **envp) {
    // 1. Create an anonymous memory-backed file
    int fd = syscall(SYS_memfd_create, "memory_module", MFD_CLOEXEC);
    if (fd < 0) { perror("memfd_create"); return -1; }

    // 2. Handle short writes and EINTR
    size_t done = 0;
    while (done < size) {
        size_t chunk = size - done;
        if (chunk > (size_t)SSIZE_MAX) chunk = (size_t)SSIZE_MAX;
        ssize_t n = write(fd, elf_bytes + done, chunk);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) {
            if (n == 0) errno = EIO;
            perror("write"); close(fd); return -1;
        }
        done += (size_t)n;
    }

    // 3. glibc 2.27+ can use execveat on a suitable kernel;
    // older / fallback implementations use /proc/self/fd.
    fexecve(fd, argv, envp);


    // A successful exec never returns here
    perror("fexecve");
    close(fd);
    return -1;
}
```

Bu Linux/glibc işlev parçası ELF baytlarını bekler ve geçerli olur `argv`/`envp`. Linux aarch64/glibc 2.36 Kasım ayında doğrulama 7, 2026 ayrı bir dosya okuma koşumu ile bu parçayı derledi. strace başarılı olduğunu doğruladı `execveat` ile `AT_EMPTY_PATH`; yük PID'yi korudu, argv / envp aldı ve açık değildi `memory_module` descriptor. Controls bir CLOEXEC betiği (`ENOENT`), boş bir görüntü (`ENOEXEC`), EINTR/kısa-yazma kurtarma ve sıfır yazma (`EIO`. [fexecve()]3)](https://man7.org/linux/man-pages/man3/fexecve.3.html) belgeler glibc 2.27+ kullanarak `execveat` uygun bir çekirdek üzerinde. Haritalamalarda bir memfd adı görünebilir veya `/proc/<pid>/fd` açıkken. Başarılı exec bir `MFD_CLOEXEC` descriptor, bu yüzden fd-list girdisinin kaldığını varsaymayın. Betik dosyaları için, CLOEXEC de neden olabilir `ENOENT`. Bellek desteği disk eserlerinin olmayışını garanti etmez: takas ve yürütme politikalarını düşünün.

## 3. Kullanıcı alanında ELF yükleniyor

Bir kullanıcı-uzay yükleyicisi, mevcut adres alanına yeni bir `execve` olmadan kod yerleştirebilir. Desteklediği ELF türlerine bağlı olarak, haritalama, yer değiştirme ve başlangıç durumu için sorumluluk alır. Aşağıdaki kontrol listesi [ELF yükleyicisi](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) ve [x86-64 ABI](https://gitlab.com/x86-psABIs/x86-64-ABI); bir soruşturma çerçevesi, eksiksiz bir uygulama değil:

1. **Anıyıyı ayrıştır **: `PROT_READ | PROT_WRITE | PROT_EXEC` için `mmap()` veya ayrı RX/RW segmentleri kullanın.
2. **Copy segmentleri**: `PT_LOAD` içeriğini hesaplanan `p_vaddr` konumlarına yerleştirin.
3. **Zero BSS**: `p_memsz > p_filesz` kuyruğunu temizleyin.
4. **Yer değiştirmeleri çöz**: Dinamik bir görüntü için `DT_RELA` dahil ilgili tabloları işleyin ve yüklü kütüphane adreslerini kullanarak işaretçileri güncelleyin.
5. **Yığın ve auxv ** Hazırla: Beklenen `argc`, `argv`, `envp` ve `auxv` yapılarını tedarik edin.
6. **Transfer kontrolü**: Görüntüye girerken yer değiştirme tabanının hesabı. Dinamik görüntüler ayrıca yorumlayıcı, TLS ve diğer çalışma zamanı kurulumu gerektirir.

Yeni bir işlem gerekli değildir, bu nedenle PID değişmeden kalabilir. `mmap` ve `mprotect` gibi çekirdek olayları hala gözlemlenebilir. Programlar işlem adlarını değiştirebilir; sabit kimlik alanları evrensel bir tespit kuralı değildir.

## 4. İkili yama: ERESI / elfsh'den LIEF'e

Tarihsel **ERESI/elfsh**araç seti, segment ekleme ve kaynak kodu olmadan kontrol akışını yönlendirmeyi araştırdı. Bugün,**[LIEF](https://github.com/lief-project/LIEF)** Python'da programsal ikili dönüşümü desteklemektedir.

Bu örnek, bölüm tablosu olan bir Linux x86-64 ELF dosyasında **LIEF 0.17.1 Python API’sini** kullanır. Yeni giriş noktası yalnızca `exit(0)` işlemini yapar ve özgün uygulamayı sürdürmez. Çıktı yapısal olarak denetlendi. 14 Kasım 2026’da küçük bir dinamik bağlı test programının dönüştürülmüş kopyası, ARM ana makinede emülasyonla çalışan bir Debian Bookworm amd64 konteynerinde de çalıştı. Özgün dosya 7, dönüştürülmüş dosya 0 koduyla çıktı. Bu sonuç tek bir test dosyasına aittir. Örneği bölüm tablosu olmayan bir dosyaya doğrudan uygulamayın.

```python
import lief

binary = lief.ELF.parse("./ornek")
if binary is None or binary.header.machine_type != lief.ELF.ARCH.X86_64:
    raise ValueError("Linux x86-64 ELF required")
if len(binary.sections) < 2:
    raise ValueError("This example requires an existing section table")
section = lief.ELF.Section(".yukleyici")
section.type = lief.ELF.Section.TYPE.PROGBITS
# Linux x86-64: mov eax,60; xor edi,edi; syscall -> exit(0)
section.content = list(b"\xb8\x3c\x00\x00\x00\x31\xff\x0f\x05")
section.flags = lief.ELF.Section.FLAGS.ALLOC | lief.ELF.Section.FLAGS.EXECINSTR
added = binary.add(section, loaded=True)
binary.header.entrypoint = added.virtual_address
binary.write("./ornek_yamali")
```

Yazılan dosyayı yeniden ayrıştırın. Giriş noktasının çalıştırılabilir bir `PT_LOAD` aralığında olduğunu ve eklenen baytların değişmediğini doğrulayın. Enum adlarının hangi tarihte değiştiği konusunda varsayım yapılmıyor. [LIEF ELF API](https://lief.re/doc/latest/formats/elf/python.html) bağlantısı, örneğin kullandığı 0.17.1’i değil, en güncel sürümü izler. 14 Kasım 2026’daki denetimde bu sürüm 1.0.0’dı. Kod bloğu iki sürümle de aynı yapısal denetimden geçti. Kendi ortamınızdaki adları `lief.__version__` ile karşılaştırın.

## 5. Özel yükleyicileri bellekte araştırmak

Aşağıdaki gözlemler tersine mühendislik ve olay tepkisine rehberlik edebilir.

### A. Geleneksel bir destek dosyası olmadan çalıştırılabilir bellek

Anonim çalıştırılabilir bellek JIT derlemesi gibi meşru açıklamalara sahip olabilir. Bir memfd haritalama dosya desteklidir ve isimsiz bir haritalama ile aynı değildir. İsimsiz haritalamalar genellikle boş bir yola sahiptir; adı verilen özel anonim haritalamalar aşağıdaki gibi görünebilir: `[anon:name]`. Bölüm adlarını, yürütmeyi veya kötü niyetliliği yalnızca izinleri haritalamaktan çıkarmayın ([proc_pid_maps(5)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)).

### B. İzin geçişleri

Eşzamanlı `rwx` temel WX'i ihlal eder. RW-then-RX geçişi, daha katı ekseksiyon politikaları geçişi yasaklayabilse de bu prensibi korur. Her ikisi de soruşturma ipuçlarıdır. Özel bir yükleyicinin mevcut olduğu sonucuna varmadan önce içeriği, kontrol akışını ve çağrıları ilişkilendirin.

## Derinlemesine inceleme

[Bellek izni değişimini gözlemleme](../laboratuvarlar/bellek-izinleri.md) izin değişikliklerini gözlemlemek için. [Paketlenmiş ve şifrelenmiş ELF dosyalarını inceleme](paketli-elf.md) ile devam edin bellek içi yükleyici mantığı içeren kendi kendine paketlenmemiş ikililer için.

## Kaynaklar

- [stelf-loader David Buchanan (GitHub)](https://github.com/DavidBuchanan314/stelf-loader)
- [LIEF: ELF Python API](https://lief.re/doc/latest/formats/elf/python.html) (son sürüm; yukarıdaki örnek 0.17.1'ye sabitlenmiştir)
- [memfd_create Linux adam-sayfaları](https://man7.org/linux/man-pages/man2/memfd_create.2.html)
- [Linux v6.12: ELF yükleme uygulaması](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
