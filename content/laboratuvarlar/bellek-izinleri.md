---
title: "Bir bellek alanının izin değişimini gözlemlemek"
---

# Bir bellek alanının izin değişimini gözlemlemek

Bu laboratuvar, anonim bir bellek eşlemesinin yazılabilir (`RW`) durumdan çalıştırılabilir (`RX`) duruma geçişini (`W^X` prensibinin dinamik ihlali) inceler. Örnek bilerek bellekte kod çalıştırmaz; böylece bir bellek alanına çalıştırma izni verilmiş olmasının, orada kesinlikle kod yürütüldüğü anlamına gelmediğini somut olarak kanıtlar.

## 1. Ön Koşullar ve Hazırlık

Laboratuvar için standart bir Linux sistemi, GCC veya Clang derleyicisi ve `strace` aracı gereklidir.

Geçici bir çalışma klasöründe `izin.c` dosyasını oluşturun:

```c
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>

int main(void) {
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) return 1;
    size_t size = (size_t)page;

    // 1. Anonim bellek ayır (Yazılabilir ve Okunabilir: RW)
    void *area = mmap(NULL, size, PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (area == MAP_FAILED) { perror("mmap"); return 1; }

    // Belleğe bayt yaz (RW iznini sına)
    ((unsigned char *)area)[0] = 0x90; // NOP baytı
    printf("pid=%ld area=%p size=%zu (Durum: RW)\n", (long)getpid(), area, size);
    fflush(stdout);

    // /proc/<pid>/maps dosyasını incelemek için 5 saniye bekle
    sleep(5);

    // 2. Bellek izinlerini Okunabilir ve Çalıştırılabilir (RX) yap
    if (mprotect(area, size, PROT_READ | PROT_EXEC) == -1) {
        perror("mprotect");
        munmap(area, size);
        return 1;
    }
    puts("Izin mprotect ile RX oldu; bu alanda hic kod calistirilmiyor!");
    fflush(stdout);

    // maps dosyasındaki değişimi incelemek için 5 saniye daha bekle
    sleep(5);

    // 3. Belleği serbest bırak
    if (munmap(area, size) == -1) { perror("munmap"); return 1; }
    return 0;
}
```

## 2. Derleme ve Sistem Çağrılarını İzleme (strace)

Programı hata ayıklama sembolleriyle derleyin ve sistem çağrılarını filtreleyerek çalıştırın:

```bash
gcc -Wall -Wextra -O0 -g izin.c -o izin
strace -e trace=mmap,mprotect,munmap ./izin
```

Beklenen `strace` çıktısı:

```text
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fa289c00000
pid=25410 area=0x7fa289c00000 size=4096 (Durum: RW)
mprotect(0x7fa289c00000, 4096, PROT_READ|PROT_EXEC) = 0
Izin mprotect ile RX oldu; bu alanda hic kod calistirilmiyor!
munmap(0x7fa289c00000, 4096)            = 0
+++ exited with 0 +++
```

> [!NOTE]
> Dinamik bağlayıcının (`ld-linux.so`) program başlarken kütüphaneleri yüklemek için yaptığı dahili `mmap` ve `mprotect` çağrıları da çıktıda görünecektir. Programın kendi yazdırdığı `area` adresiyle eşleşen satırlara odaklanın.

## 3. İkinci Bir Terminalden /proc/PID/maps Gözlemi

Program `sleep(5)` aşamasındayken ikinci bir terminal açarak yazdırılan PID numarasıyla bellek haritasını kontrol edin:

### İlk 5 Saniyede (RW Aşaması):
```bash
grep "7fa289c00000" /proc/25410/maps
```
Çıktı:
```text
7fa289c00000-7fa289c01000 rw-p 00000000 00:00 0                          [anon]
```

### Sonraki 5 Saniyede (mprotect Sonrası RX Aşaması):
```bash
grep "7fa289c00000" /proc/25410/maps
```
Çıktı:
```text
7fa289c00000-7fa289c01000 r-xp 00000000 00:00 0                          [anon]
```

Sayfa izinleri `rw-p` durumundan `r-xp` durumuna geçmiştir. Dosya yolu alanında hiçbir dosya adı bulunmamakta (`[anon]`) yani sayfa tamamen bellekte oluşturulmuş bir çalıştırılabilir kod sayfası görüntüsü sergilemektedir.

## 4. Analiz ve Hipotez Doğrulama

Bu deney neyi kanıtlamıştır?
1. **İzin Değişimi != Kod Yürütme**: Hedef alanda hiçbir makine komutu çalıştırılmamıştır (`RIP` yazmacı bu alana hiç yönlendirilmemiştir). Bu nedenle yalnızca bir sayfanın `r-xp` olduğunu görmek "bellek içi zararlı kod çalıştı" sonucuna varmak için yetersizdir.
2. **eBPF ve Perf ile Doğrulama**: `perf record -e cycles` ile izleme yapıldığında bu adrese ait hiçbir donanımsal örnek (sample) düşmez.
3. **Güvenlik Politikası (W^X / PaX / SELinux)**: Bazı kurumsal Linux dağıtımlarında anonim bir belleğe `PROT_EXEC` verilmesi çekirdek güvenlik politikaları (SELinux `execmem`) tarafından engellenebilir ve `mprotect` işlemi `EPERM` veya `EACCES` hatasıyla başarısız olabilir.

## İncelemeyi Derinleştir

Bellek izinlerini değiştiren özel yükleyicilerin ve paketleyicilerin çalışma mimarisini öğrenmek için [Özel yükleyiciler](../rehberler/ozel-yukleyiciler.md) rehberine geçin. Dinamik kütüphane fonksiyonlarının çağrı hedeflerini `LD_PRELOAD` ile değiştirmeyi denemek için [Sembol seçimi laboratuvarı](sembol-secimi.md) uygulamasına geçin.

## Kaynaklar

- [mmap — Linux man-pages (man 2 mmap)](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [mprotect — Linux man-pages (man 2 mprotect)](https://man7.org/linux/man-pages/man2/mprotect.2.html)
- [proc_pid_maps — Linux man-pages (man 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
