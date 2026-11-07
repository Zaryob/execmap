---
title: "Özel yükleyiciler ve bellek içi çalıştırma (In-Memory Execution)"
---

# Özel yükleyiciler ve bellek içi çalıştırma (In-Memory Execution)

Geleneksel Linux mimarisinde yeni bir program çalıştırmanın yolu bellidir: bir süreç `fork()` ile çatallanır ve `execve()` sistem çağrısıyla yeni bir ELF dosyasını diskten yükler. EDR sistemleri, `auditd`, Falco ve güvenlik izleyicileri tam da bu noktada devreye girerek `sys_enter_execve` olaylarını denetler.

İleri düzey zararlı yazılımlar, paketleyiciler (packers) ve bellek içi modüller, disk üzerinde iz bırakmamak ve `execve` kontrollerini atlatmak için **Özel Yükleyiciler (Custom Loaders / Userland Execve)** kullanır. Bu teknikler, çekirdeğin yükleme rutinini (`load_elf_binary`) doğrudan kullanıcı alanında (userspace) taklit ederek ELF dosyasını tamamen bellek içinde ayrıştırıp çalıştırır.

## 1. Bellek İçi Yükleme Yöntemlerinin Evrimi

Linux'ta bellek içi çalıştırma teknikleri temel olarak üç ana mimari evreye ayrılır:

```text
1. Dosya Tanımlayıcı Tabanlı (memfd_create)
   [RAM] -> memfd_create() -> fexecve(fd) -> [Kernel standart yükleme yapar]
   (Diske dosya yazılmaz, ancak kernel hâlâ bir 'execve' olayı üretir)

2. Kullanıcı Alanı Yükleyicisi (Userland Exec)
   [RAM] -> mmap(MAP_ANON) -> Segmentleri kopyala -> Relocation çöz -> jmp *e_entry
   (Hiçbir execve çağrısı yapılmaz; süreç kimliği ve PID değişmez)

3. Süreç İçi Bellek Üzerine Yazma (Process Hollowing / /proc/self/mem)
   [Mevcut Süreç] -> Kendini veya hedefi unmap et -> Yeni ELF'i mmap et -> Yığını ayarla
```

## 2. memfd_create ve fexecve Yaklaşımı

Linux 3.17 ile gelen `memfd_create` sistem çağrısı, diskte herhangi bir dosya oluşturmadan tamamen RAM üzerinde isimsiz bir dosya tanımlayıcısı (file descriptor) yaratır:

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <sys/mman.h>
#include <fcntl.h>

int run_from_memory(const unsigned char *elf_bytes, size_t size, char **argv, char **envp) {
    // 1. RAM üzerinde anonim bir dosya oluştur
    int fd = syscall(SYS_memfd_create, "gizli_modul", MFD_CLOEXEC);
    if (fd < 0) { perror("memfd_create"); return -1; }

    // 2. ELF ikili baytlarını bu dosya tanımlayıcısına yaz
    if (write(fd, elf_bytes, size) != (ssize_t)size) {
        perror("write");
        close(fd);
        return -1;
    }

    // 3. Dosya tanımlayıcısı üzerinden programı çalıştır
    // Çekirdekte bu işlem /proc/self/fd/<fd> üzerinden execve'ye dönüşür
    fexecve(fd, argv, envp);

    // Başarılıysa buraya asla dönmez
    perror("fexecve");
    close(fd);
    return -1;
}
```

Bu yöntem diske dosya yazmaz; ancak adli bilişim (forensics) incelemesinde `/proc/<pid>/fd/` altında `memfd:gizli_modul (deleted)` şeklinde net bir iz bırakır.

## 3. Kullanıcı Alanında ELF Yükleme

Kullanıcı alanı yükleyicisi, yeni bir `execve` çağrısı yapmadan kodu mevcut adres uzayına yerleştirebilir. Desteklediği ELF türüne bağlı olarak segment eşleme, relocation ve başlangıç durumu görevlerini üstlenir. Aşağıdaki liste [ELF yükleyicisinin](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c) ve [x86-64 ABI sözleşmesinin](https://gitlab.com/x86-psABIs/x86-64-ABI) görevlerinden hareketle bir inceleme çerçevesidir; tam bir yükleyici uygulaması değildir:

1. **Bellek Ayırma**: `mmap()` ile `PROT_READ | PROT_WRITE | PROT_EXEC` veya ayrı ayrı `RX` ve `RW` segmentleri açılır.
2. **Segmentlerin Kopyalanması**: ELF'in `PT_LOAD` segmentleri hesaplanan `p_vaddr` adreslerine yerleştirilir.
3. **BSS Sıfırlama**: `p_memsz > p_filesz` olan alanlar `memset(0)` ile temizlenir.
4. **Relocation Çözümleme**: Eğer ikili dinamik bağlıysa, `DT_RELA` tablosu okunarak GOT ve fonksiyon göstericileri dinamik kütüphanelerin adreslerine göre güncellenir.
5. **Yığın ve auxv Kurulumu**: Yeni programın beklediği `argc`, `argv`, `envp` ve `auxv` yapıları yığına yazılır.
6. **Kontrole Geçiş**: Relocation tabanı hesaba katılarak giriş noktasına geçilir. Dinamik ikililerde interpreter, TLS ve diğer runtime gereksinimleri de karşılanmalıdır.

Bu senaryoda işletim sistemi hiçbir yeni süreç açıldığını bilmez; var olan süreç kimliği (PID), ana süreç adı ve dosya yolu `/proc/<pid>/exe` değişmeden kalır.

## 4. İkili Yamalama: ERESI/elfsh'ten LIEF'e

Tarihsel **`ERESI / elfsh`** aracı, kaynak kod olmadan bir ikili dosyanın içine doğrudan yeni segment ekleme ve kontrol akışını yönlendirme teorisini geliştirmiştir. Günümüzde bu işlem modern **[LIEF](https://github.com/lief-project/LIEF)** kütüphanesiyle Python üzerinden programatik olarak yapılır:

```python
import lief

# 1. Mevcut ikiliyi yükle
binary = lief.parse("./ornek")

# 2. Yeni bir çalıştırılabilir yükleyici segmenti ekle
section = lief.ELF.Section(".yukleyici")
section.content = list(b"\x90\x90\xcc\xc3")  # Enjekte edilecek makine kodu
section.flags = lief.ELF.SECTION_FLAGS.ALLOC | lief.ELF.SECTION_FLAGS.EXECINSTR
binary.add(section, loaded=True)

# 3. Giriş noktasını yeni segmente yönlendir
binary.header.entrypoint = section.virtual_address
binary.write("./ornek_yamali")
```

## 5. Özel Yükleyicileri Bellekte Tespit Etmek

Tersine mühendislik ve olay müdahalesi (incident response) sırasında özel bir yükleyicinin varlığı şu anomalilerden anlaşılır:

### A. Unbacked Executable Memory (Dosyaya Dayanmayan Kod Sayfaları)
Normal bir Linux programında çalıştırılabilir (`r-xp`) sayfalar diskteki bir dosyaya bağlıdır (örneğin `/usr/lib/libc.so`). Eğer `/proc/<pid>/maps` içinde bir `r-xp` sayfasının dosya yolu boşsa `[anon]` veya `memfd:` içeriyorsa, bellek içi bir yükleyici çalışıyor demektir:

```bash
grep "r-xp" /proc/$PID/maps | grep -v "/"
```

### B. W^X (Write XOR Execute) İhlalleri
Bir bellek alanının aynı anda hem yazılabilir hem çalıştırılabilir (`rwx`) olması ya da bir sayfanın önce `rw-`, ardından `mprotect` ile `r-x` yapılması yükleyicinin kod açma aşamasını ele verir.

## İncelemeyi Derinleştir

Bellek izinlerinin değişimini strace ve C koduyla canlı simüle etmek için [Bellek izinleri laboratuvarı](../laboratuvarlar/bellek-izinleri.md) çalışmasını yapın. Kendi kendini açan ve bellek içi yükleyici barındıran paketli ikilileri analiz etmek için [Paketli ELF](paketli-elf.md) rehberine geçin.

## Kaynaklar

- [stelf-loader — David Buchanan (GitHub)](https://github.com/DavidBuchanan314/stelf-loader)
- [LIEF: ELF Binary Modification Guide](https://lief-project.github.io/doc/latest/tutorials/02_elf_hooking.html)
- [memfd_create — Linux man-pages](https://man7.org/linux/man-pages/man2/memfd_create.2.html)

- [Linux v6.12: ELF loading implementation](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)
