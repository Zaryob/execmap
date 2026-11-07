---
title: "Analiz aracının etkisi ve anti-tersine mühendislik"
---

# Analiz aracının etkisi ve anti-tersine mühendislik

Kuantum fiziğindeki "Gözlemci Etkisi" (Observer Effect), tersine mühendislik ve kötü amaçlı yazılım analizinde de birebir geçerlidir: Bir programı incelemek için devreye soktuğunuz her araç (`gdb`, `strace`, `ltrace`, `LD_PRELOAD`, sanal makine ortamı), sürecin çalıştığı ekosistemi değiştirir.

Gelişmiş ikili dosyalar bu değişimleri proaktif olarak tarar; bir hata ayıklayıcı veya izleme aracı sezdiğinde çalışma akışını değiştirir, sahte fonksiyonlar çalıştırır veya sessizce sonlanır.

## 1. Yaygın Anti-Debugging ve Savunma Teknikleri

Linux ortamında en sık karşılaşılan anti-analiz mekanizmaları şunlardır:

```text
+-----------------------+-----------------------------------------------------------+
| Yöntem                | Çalışma Prensibi                                          |
+-----------------------+-----------------------------------------------------------+
| ptrace(PTRACE_TRACEME)| Linux'ta bir sürece AYNI ANDA YALNIZCA BİR tracer         |
|                       | bağlanabilir. Program kendi kendine TRACEME çağrısı yapar;|
|                       | hata dönerse (-1) bir hata ayıklayıcı var demektir!       |
+-----------------------+-----------------------------------------------------------+
| /proc/self/status     | TracerPid alanını okur. 0 harici bir değer (örn. GDB'nin  |
|                       | PID'si) görünürse analizi tespit eder.                    |
+-----------------------+-----------------------------------------------------------+
| RDTSC Zamanlama       | rdtsc talimatı ile iki işlem arasındaki CPU vuruşunu      |
| (Timing Attacks)      | ölçer. Adım adım yürütme (stepping) varsa süre uzar.      |
+-----------------------+-----------------------------------------------------------+
| Doğrudan Syscall      | Libc fonksiyonlarını baypas ederek doğrudan 'syscall'     |
| (Direct Syscalls)     | montaj talimatı kullanır; LD_PRELOAD kancalarını boşa     |
|                       | çıkarır.                                                  |
+-----------------------+-----------------------------------------------------------+
| INT 3 (0xCC) Taraması | Kendi kod bölümünü (.text) bellekten okuyarak yazılım     |
|                       | kesme noktası (breakpoint: 0xCC baytı) var mı bakar.      |
+-----------------------+-----------------------------------------------------------+
```

### Örnek C Kodu: ptrace ve TracerPid Kontrolü

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/ptrace.h>
#include <string.h>

int check_debugger(void) {
    // 1. ptrace kontrolü
    if (ptrace(PTRACE_TRACEME, 0, 1, 0) < 0) {
        return 1; // Hata ayıklayıcı bağlandı!
    }

    // 2. /proc/self/status TracerPid kontrolü
    FILE *f = fopen("/proc/self/status", "r");
    if (!f) return 0;

    char line[128];
    int tracer_pid = 0;
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "TracerPid:", 10) == 0) {
            tracer_pid = atoi(&line[10]);
            break;
        }
    }
    fclose(f);

    return (tracer_pid != 0);
}

int main(void) {
    if (check_debugger()) {
        puts("Hata ayiklayici tespit edildi! Cikis yapiliyor.");
        exit(1);
    }
    puts("Normal calisma akisi devam ediyor.");
    return 0;
}
```

Bu programı doğrudan çalıştırırsanız normal mesajı verir; ancak `gdb ./ornek` veya `strace ./ornek` ile çalıştırdığınız an tespit mesajını basıp sonlanır.

## 2. Doğrudan Sistem Çağrıları (Direct Syscalls)

Analistler genellikle harici çağrıları izlemek için `LD_PRELOAD` veya `ltrace` kullanır. Ancak modern ikili dosyalar C kütüphanesini (`glibc`) tamamen atlayarak çekirdekle doğrudan `syscall` montaj talimatıyla konuşur:

```assembly
# x86-64 Doğrudan SYS_write (1) Çağrısı
movq $1, %rax           # Syscall numarası (SYS_write)
movq $1, %rdi           # 1. Argüman: stdout (fd 1)
leaq mesaj(%rip), %rsi  # 2. Argüman: Karakter dizisi adresi
movq $14, %rdx          # 3. Argüman: Uzunluk
syscall                 # Çekirdeğe doğrudan geçiş (Libc PLT/GOT kullanılmaz!)
```

Bu tarz çağrılar `ltrace` ve fonksiyon kancalama (hooking) kütüphaneleri tarafından **asla görülemez**.

## 3. Yan Kanallar ve Ön Bellek Analizi

Bir gözlem aracı ek işlem, tamponlama ve zamanlama etkileri oluşturabilir. Ölçülen gecikme tek başına bir kancanın varlığını kanıtlamaz: CPU frekansı, zamanlayıcı, önbellek durumu ve diğer süreçler de sonucu değiştirir. Kontrol koşulunu, tekrar sayısını ve dağılımı kaydedin; süre farkını belirli bir mekanizmaya bağlamadan önce bağımsız kayıtla sınayın. [Perf belgeleri](https://docs.kernel.org/admin-guide/perf-security.html), toplanan veri türlerinin ve erişim koşullarının kapsamını açıklar.

## 4. Karşı Tedbirler ve Saydam Gözlem

Anti-analiz mekanizmalarını etkisiz hale getirmek için analistin uygulayabileceği stratejiler:

1. **Çekirdek Düzeyinde Gözlem**: **eBPF** ve **Intel PT**, kullanıcı alanındaki kancalardan farklı gözlem noktaları sağlar. Ölçüm maliyeti, donanım desteği ve erişim koşulları nedeniyle bunların tamamen görünmez olduğu varsayılmamalıdır.
2. **Kancalama ile Savunmayı Yanıltma (DebugOff / ScyllaHide)**: `ptrace` ve `/proc/self/status` sistem çağrıları analizcinin kendi yazdığı bir kütüphane ile manipüle edilerek her zaman `0` döndürmesi sağlanabilir.
3. **Statik Yama (Binary Patching)**: Kontrolü yapan `jz/jnz` dallanma talimatı tersine çevrilir veya `nop` (0x90) baytlarıyla doldurulur.

## İncelemeyi Derinleştir

Gözlem sırasında elde edilen verilerin güvenilirliğini sınamak ve adli bilişim zincirini kurmak için [İzleri yorumlamak](izleri-yorumlamak.md) rehberine geçin. Donanımsal izleme ile anti-debugging mekanizmalarını aşmayı görmek için [Perf ile yürütme analizi](perf-ile-yurutme.md) sayfasını inceleyin.

## Kaynaklar

- [DebugOff — Bypass anti-debugging via userspace hooks (0xor0ne)](https://github.com/0xor0ne/debugoff)
- [Silvio Cesare: Linux Anti-Debugging Techniques](https://vxug.fakedoma.in/)
- [ptrace — Linux man-pages (man 2 ptrace)](https://man7.org/linux/man-pages/man2/ptrace.2.html)

- [ptrace — Linux man-pages](https://man7.org/linux/man-pages/man2/ptrace.2.html)
