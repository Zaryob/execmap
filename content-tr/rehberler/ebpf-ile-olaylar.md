---
title: eBPF ile çalışma zamanı olaylarını gözlemleme
description: Sistem çağrılarını, bellek eşleme olaylarını ve uprobe kayıtlarını süreç bağlamıyla ilişkilendirin.
---

# eBPF ile çalışma zamanı olaylarını gözlemleme

`gdb` ve `strace` gibi geleneksel araçlar, süreçleri durdurmak ve yürütme veya sistem çağrılarını denetlemek için `ptrace()` kullanır. Kötü amaçlı yazılımlar ve korumalı ikililer bu ilişkiyi tespit edebilir, çalışmayı durdurabilir veya sahte yolları izleyebilir.

**eBPF** Linux çekirdeği tarafından doğrulanan programlar aracılığıyla olayları toplar. Bir psrace ilişkisi oluşturmadan syscall izleme noktalarını veya kullanıcı işlevlerini gözlemleyebilir, ancak bu görünmezlik veya sıfır maliyet garanti etmez. Yükseltme, izleme noktaları ve kproblar farklı mekanizmalardır. Linux v6.12 x86 uprobes bir `0xcc` hedef adres uzayındaki yazılım kesme noktası ([opcode description](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/uprobes.h), [uygulama](https://github.com/torvalds/linux/blob/v6.12/kernel/events/uprobes.c)).

Daha önce bir bpftrace programı yazmadıysanız, [bpftrace’e giriş: izleme noktaları, filtreler ve haritalar](bpftrace-temelleri.md) ve [bpftrace ile ilk adımlar](../laboratuvarlar/bpftrace-ilk-adimlar.md) ile başlayın. Bu sayfa sözdizimi olduğunu varsayar ve ek mekanizmalarına ve sınırlarına odaklanır.

## 1. İz noktaları, kprobes ve uprobes

eBPF farklı sistem katmanlarına gözlem programları ekleyebilir:

```text
User space
  [Target: ornek] -----------> [libc.so / malloc]
         |                             |
         v (uprobe)                    v (uprobe)
+-------------------------------------------------------+
| Linux kernel                                          |
|                                                       |
| [Syscalls] -------> Tracepoint: sys_enter_mmap          |
| [VFS / files] ----> Kprobe: vfs_read                    |
| [Memory] ---------> Kprobe: do_mprotect_pkey            |
|                                                       |
| +---------------------------------------------------+ |
| | eBPF program (kernel-verified bytecode)             | |
| +---------------------------------------------------+ |
|                         |                             |
|                         v BPF ring buffer             |
+-------------------------------------------------------+
                          |
                          v
User-space observer (bpftrace / libbpf / EDR)
```

- ** Tracepoints**: `tracepoint:syscalls:sys_enter_mprotect` gibi statik olarak tanımlanmış çekirdek olay noktaları.
- **Kprobes / kretprobes**: Desteklenen çekirdek konumlarında dinamik problar, yasak konumlara ve yapılandırma sınırlarına tabi.
- **Uprobes / üretprobes**: Bir kullanıcı çalıştırılabilir veya paylaşılan kitaplıkta konumlar veya semboller için çekirdek tarafından yönetilen sondalar.

## 2. Pratik bpftrace senaryoları

Bu örnekler Linux syscall izleme noktaları, uygun BPF ayrıcalıkları ve bpftrace gerektirir. İlk kayıt `bpftrace --version`, `uname -r`, ve `sudo bpftrace -lv "tracepoint:syscalls:sys_enter_mprotect"`. Bu çıktıdaki alan adlarını onaylayın; üstte ölçün ve kayıtları ayrı ayrı bırakın. Bu sayfadaki betikler iz noktası alanlarını aşağıdaki gibi okurlar: `args.start`. Bu formun bpftrace'e ihtiyacı var 0.19.0 veya daha sonra, kimin [değiştir](https://github.com/bpftrace/bpftrace/blob/master/CHANGELOG.md) kayıtlar `args` bir işaretçi yerine bir yapı haline gelmek; eski sürümlerde, örneğin 0.17.0 Bu projenin Debian kitap kurdu test konteynerinde, yaz `args->start`, `args->len`, ve `args->prot`.

### Senaryo A: anonim belleğin haritalandırılması ve izinlerin değiştirilmesi işlemleri

Aşağıdaki betik, `mmap` ve `mprotect`'yi gözlemler, genellikle paketleme ve kabuk kodu tahsisinde yer alan çağrılar:

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_mprotect /comm == "ornek"/ {
    printf("[PID %d] mprotect(addr=0x%lx, len=%lu, prot=0x%x)\n",
           pid, args.start, args.len, args.prot);
}
'
```

Çıktı **schema **, çalıştırılmış bir iz değil:

```text
[PID <pid>] mprotect(addr=0x<address>, len=<length>, prot=0x<permissions>)
```

Linux'ta `prot=0x5` READEXEC ister. Bir giriş olayı başarı veya yürütme oluşturmaz; `sys_exit_mprotect` sonucunu aynı iplikle ilişkilendirin. Bir `comm` filtresi bir isimle eşleşir; bu adı paylaşan süreçleri ayırt etmek için bir PID filtresi kullanın.

### Senaryo B: Soyulmuş bir ikiliye bir abur cubur takmak

Bpftrace sürümünün sayısal uprobe adreslerini nasıl yorumladığını kontrol edin: sanal bir adres ve dosya ofsetinin aynı sayısal değere sahip olması gerekmez. Burada `0x1140` kullanılan sürüm tarafından beklenen adres formuna dönüştürülen bir gösterim yeridir. Gerçek dosyadaki komut sınırı ve ek sonucunu doğrulayın. `reg("di")` x86'ya özeldir-64:

```bash
# After verifying the location for the file and bpftrace version:
sudo bpftrace -e '
uprobe:/usr/bin/ornek:0x1140 {
    printf("Target function called! RDI argument: %d\n", reg("di"));
}
'
```

## 3. Gözlemci etkileri ve algılama sınırları

Araçlar farklı etkilere sahiptir. `LD_PRELOAD` yüklü nesneleri ve sembol seçimini değiştirir; ptrace tabanlı araçlar bir izleme ilişkisi kurar ve süreci durdurabilir.

EBPF gözlemini ek türüne göre değerlendirin. İz noktaları, kproblar ve uproblar aynı mekanizma değildir; uproblar hedef talimatlarda kesme noktaları kullanabilir. `TracerPid: 0` sadece bir praksi ilişkisini test eder ve diğer gözlem yöntemlerini dışlamaz. Olay üretimi, tampon tampon tamponu ve tüketici hızı zamanlamayı etkileyebilir.

## 4. eBPF yanlış kullanım ve kaçınma

BPF yetenekleri program türüne, izinlere ve çekirdek yapılandırmasına bağlıdır. Örneğin, [bpf-helpers(7)](https://man7.org/linux/man-pages/man7/bpf-helpers.7.html), `bpf_probe_write_user` için koşulları ve sınırları belgelemektedir. Bir olay kaydını yorumlarken mevcut programları inceleyin.

Sistemin BPF programlarını ve haritalarını incelemek için `bpftool`'yi kullanın:

```bash
# List BPF programs loaded on the system:
sudo bpftool prog list
```

## Derinlemesine inceleme

Bu sondaları yavaş, sıkışmış veya başarısız programlara uygulamak için [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](debug-is-akisi.md) kullanın. Hedeflerin analiz araçlarını nasıl tespit ettiğini anlamak için [Gözlemin programa etkisi ve analiz karşıtı davranışlar](analiz-aracinin-etkisi.md) okuyun. Kayıtları düzgün sınırlanmış hipotezlere bağlamak için [Çalışma zamanı izlerini yorumlama](izleri-yorumlamak.md) ile devam edin.

Bir indirilebilir iş yükü üzerinde korelasyonlu giriş/geri dönüş ve CPU dışı deneyler için, [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](calisma-zamani-gecikmesi.md) ve [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](../laboratuvarlar/zamanlama-ve-bekleme.md) kullanın.

## Kaynaklar

- [Kernel: libbpf genel bakış](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)
- [Kernel: BPF halka tamponu](https://docs.kernel.org/bpf/ringbuf.html)
- [Kernel: Uprobe-kaza dokümantasyonu](https://docs.kernel.org/trace/uprobetracer.html)
- [bpftrace Referans Kılavuzu](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
