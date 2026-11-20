---
title: Gözlemin programa etkisi ve analiz karşıtı davranışlar
description: Doğrudan sistem çağrılarını, ptrace denetimlerini ve izlemenin programı nasıl etkilediğini inceleyin.
---

# Gözlemin programa etkisi ve analiz karşıtı davranışlar

Gözlemci etkileri yazılım analizinde de önemlidir: bir programı denetlemek için tanıtılan her araç (`gdb`, `strace`, `ltrace`, `LD_PRELOAD` veya sanal bir makine) yürütme ortamını değiştirir.

Sofistike ikililer bu değişiklikleri arayabilir. Bir hata ayıklayıcı veya izleyiciyi tespit ederken, kontrol akışını değiştirebilir, sahte işlevleri yürütebilir veya sessizce çıkabilirler.

## 1. Yaygın hata ayıklama ve savunma teknikleri

Linux üzerinde yaygın anti-analiz mekanizmaları şunlardır:

```text
+-----------------------+---------------------------------------------------------+
| Method                | Mechanism                                               |
+-----------------------+---------------------------------------------------------+
| ptrace(PTRACE_TRACEME)| Only one ptrace tracer can trace a process at a time.     |
|                       | Failure may reflect permissions, policy, or a tracer.   |
+-----------------------+---------------------------------------------------------+
| /proc/self/status     | Read TracerPid. A nonzero visible PID indicates a        |
|                       | ptrace tracer, not every possible observation method.    |
+-----------------------+---------------------------------------------------------+
| RDTSC timing          | Compare CPU timing between operations. Stepping may      |
|                       | increase latency; other timing effects remain possible.  |
+-----------------------+---------------------------------------------------------+
| Direct syscalls       | Bypass libc wrappers with a syscall instruction,         |
|                       | avoiding hooks focused on LD_PRELOAD interposition.      |
+-----------------------+---------------------------------------------------------+
| INT 3 (0xCC) scan     | Inspect code bytes for a software breakpoint opcode.     |
+-----------------------+---------------------------------------------------------+
```

### C örneği: izleme durumunu değiştirmeden TracerPid okumak

Bu Linux procfs örneği sadece mevcut ptrace ilişkisini sorgular. `PTRACE_TRACEME`'yi aramaz: başarılı bir TRACEME ebeveyni izleyici yapar, bu nedenle TracerPid'i hemen okumak, kendinizin yeni yarattığı bir ilişkiyi algılayabilir. Bir TRACEME hatası tek başına hata ayıklayıcı varlığını da kanıtlamaz ([ptrace(2)](https://man7.org/linux/man-pages/man2/ptrace.2.html)).

```c
#include <stdio.h>

int main(void) {
    FILE *f = fopen("/proc/self/status", "r");
    if (!f) { perror("/proc/self/status"); return 2; }
    char line[256];
    int tracer = -1;
    while (fgets(line, sizeof(line), f)) {
        if (sscanf(line, "TracerPid: %d", &tracer) == 1) break;
    }
    int bad = ferror(f);
    fclose(f);
    if (bad || tracer < 0) { fputs("Could not read TracerPid\n", stderr); return 2; }
    printf("TracerPid: %d\n", tracer);
    return tracer != 0;
}
```

Compile ile `cc -Wall -Wextra -Werror tracer.c -o tracer`. Geçerli PID ad alanında görünen bir izleyici sıfır olmayan bir PID üretmeli ve çıkmalıdır. 1; görünür izleyici üretmemelidir 0 ve çıkış 0. Okuma hatası çıkışları 2. İsim uzayı kısıtlamaları ve ptrace dışındaki gözlem yöntemleri şu anlama gelir: 0 programın gözlemlenmediğini belirtmez. Linux aarch64 doğrulaması Kasım 7, 2026 doğrulanmış çıkış 0 Tracker ve çıkış olmadan 1 GDB altında. Ayrı bir ebeveyn/çocuk kontrolü, başarılı bir şekilde takip edildikten sonra ebeveyn PID'yi gözlemledi ve `EPERM` Tekrarlanan bir Traceme çağrısı.

## 2. Doğrudan sistem çağrıları

Analistler genellikle dış çağrıları takip etmek için `LD_PRELOAD` veya `ltrace`'yi kullanırlar. Bir ikili C kütüphanesini (`glibc`) atlayabilir ve `syscall` talimatını kullanarak doğrudan çekirdekle iletişim kurabilir:

```text asm
# x86-64 direct SYS_write (1) call
movq $1, %rax           # Syscall number (SYS_write)
movq $1, %rdi           # Argument 1: stdout (fd 1)
leaq mesaj(%rip), %rsi  # Argument 2: string address
movq $14, %rdx          # Argument 3: length
syscall                 # Enter the kernel directly (no libc PLT/GOT)
```

Doğrudan sistem çağrısı ilgili libc/PLT kancasına uğramaz. [ltrace(1)](https://man7.org/linux/man-pages/man1/ltrace.1.html), mimari ve sürüm destekliyorsa `-S` ile sistem çağrılarını da gösterebilir. strace ve uygun sistem çağrısı izleme noktaları da gözlem için kullanılabilir. Yukarıdaki assembly parçası Linux x86-64 sistem çağrısı ABI’sini gösterir. Tam bir program için çevre kodun `mesaj` verisini ve gerçek uzunluğunu sağlaması gerekir.

## 3. Yan kanallar ve önbellek analizi

Bir gözlem aracı işleme, tamponlama ve zamanlama etkilerini tanıtabilir. Ölçülen gecikme tek başına bir kancanın varlığını belirlemez: CPU frekansı, zamanlama, önbellek durumu ve diğer işlemler de sonuçları etkiler. Kontrol durumunu, tekrar sayısını ve dağıtımını kaydedin; Belirli bir mekanizmaya zamanlama farkı atfedilmeden önce bağımsız kanıtlara karşı test yapın. [perf documentation](https://docs.kernel.org/admin-guide/perf-security.html) toplanan veri türlerini ve erişim koşullarını açıklar.

## 4. Karşı önlemler ve şeffaf gözlem

Anti-analiz mekanizmalarını araştırmak için stratejiler şunlardır:

1. ** çekirdek düzeyinde gözlem**: **eBPF**ve**Intel PT** kullanıcı-uzay kancalarından farklı gözlem noktaları sağlar. Ölçüm maliyeti, donanım desteği ve erişim koşulları, tamamen görünmez olarak kabul edilmemeleri gerektiği anlamına gelir.
2. **Kontrollü kullanıcı-uzay kancaları**: Kendi test numunenizde, libc'yi değiştirin `ptrace` ambalajlayıcı veya procfs okuma işlevi ve davranışı karşılaştırmak. `/proc/self/status` bir dosya yolu, bir syscall adı değil. Doğrudan bir syscall bu kancayı atlayabilir. [DebugOff](https://github.com/0xor0ne/debugoff) Linux analizini zorlaştıran bir Pas kütüphanesidir, bypass aracı değil. [ScyllaHide](https://github.com/x64dbg/ScyllaHide) Windows hata ayıklayıcı ekosistemi için bir anti-hata ayıklama aracıdır, bir Linux ptrace/procfs çözümü değildir.
3. ** Statik ikili yama**: `jz/jnz` talimatını bir çek uygulayarak ters çevirin veya uygun komut baytlarını `nop` (`0x90`) ile değiştirin.

## Derinlemesine inceleme

Gözlem güvenilirliğini değerlendirmek ve bir kanıt izi sürdürmek için [yorumlama izleri](izleri-yorumlamak.md) ile devam edin. [Savunma-hata ayıklama davranışının varlığında donanım izleme için perf](perf-ile-yurutme.md) ile yürütme analizi] okuyun.

## Kaynaklar

- [DebugOff Linux anti-analiz Pas kütüphanesi (0xor0ne)](https://github.com/0xor0ne/debugoff)
- [ptrace Linux insan sayfaları (man 2 ptrace)](https://man7.org/linux/man-pages/man2/ptrace.2.html)
