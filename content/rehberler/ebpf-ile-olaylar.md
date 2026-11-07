---
title: "eBPF ile çalışma anı olaylarını izlemek"
---

# eBPF ile çalışma anı olaylarını izlemek

Klasik hata ayıklayıcılar (`gdb`, `strace`) süreçleri durdurmak ve sistem çağrılarını izlemek için `ptrace()` sistem çağrısını kullanır. Ancak modern zararlı yazılımlar ve korumalı ikili dosyalar, `ptrace` varlığını kolayca tespit ederek çalışmasını durdurabilir veya sahte kod yollarına sapabilir.

**eBPF (Extended Berkeley Packet Filter)**, Linux çekirdeğinin içinde güvenli ve kumhavuzlu (sandboxed) bayt kod çalıştıran devrimsel bir sanal makinedir. eBPF sayesinde bir ikili dosyanın sistem çağrılarını, bellek eşlemelerini ve hatta kullanıcı alanı fonksiyonlarını (uprobes), **hedef sürece hiç dokunmadan ve hedef süreç tarafından fark edilmeden** çekirdek seviyesinde izlemek mümkündür.

## 1. eBPF Gözlem Mimarisi: Tracepoints, Kprobes ve Uprobes

eBPF, sistemin farklı katmanlarına dinamik kancalar (hooks) atabilir:

```text
Kullanıcı Alanı (Userspace)
  [Hedef Süreç: ornek] --------> [libc.so / malloc]
           |                            |
           v (uprobe)                   v (uprobe)
+-------------------------------------------------------+
| Linux Çekirdeği (Kernel Space)                        |
|                                                       |
|  [Syscall Katmanı] ----> Tracepoint: sys_enter_mmap   |
|  [VFS / Dosya]     ----> Kprobe: vfs_read             |
|  [Bellek Yönetimi] ----> Kprobe: do_mprotect_pkey     |
|                                                       |
|  +-------------------------------------------------+  |
|  | eBPF Programı (Çekirdekte doğrulanmış bayt kod)|  |
|  +-------------------------------------------------+  |
|                         |                             |
|                         v BPF Ring Buffer             |
+-------------------------------------------------------+
                          |
                          v
Kullanıcı Alanı Gözlemcisi (bpftrace / libbpf / EDR)
```

- **Tracepoints**: Çekirdeğin içine statik olarak yerleştirilmiş kararlı olay noktalarıdır (örneğin `tracepoint:syscalls:sys_enter_mprotect`).
- **Kprobes / Kretprobes**: Çekirdekteki hemen hemen her iç fonksiyonun girişine ve dönüşüne dinamik kanca atılmasını sağlar.
- **Uprobes / Uretprobes**: Kullanıcı alanındaki bir ikili dosyanın veya paylaşımlı kütüphanenin belirli bir sanal adresine veya sembolüne çekirdek tarafından yerleştirilen kancadır.

## 2. bpftrace ile Pratik İzleme Senaryoları

Tek satırlık `bpftrace` komutlarıyla hedef süreci hiçbir şekilde yavaşlatmadan adli analiz yapabilirsiniz:

### Senaryo A: Anonim Bellek Açan ve İzin Değiştiren Süreçleri Yakalamak
Paketleyicilerin ve kabuk kodlarının (shellcode) tipik davranışı olan `mmap` ve `mprotect` çağrılarını anında yakalayan betik:

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_mprotect /comm == "ornek"/ {
    printf("[PID %d] mprotect(addr=0x%lx, len=%d, prot=0x%x)\n",
           pid, args.start, args.len, args.prot);
}
'
```

Örnek terminal çıktısı:
```text
Attaching 1 probe...
[PID 24102] mprotect(addr=0x7f9a1b2000, len=4096, prot=0x5) => PROT_READ | PROT_EXEC !
```

### Senaryo B: Stripped İkilide Fonksiyona uprobe Takmak
Sembolleri tamamen silinmiş bir ikili dosyada dahi, fonksiyonun dosya ofsetini belirledikten sonra doğrudan o adrese bir uprobe yerleştirebilirsiniz:

```bash
# ornek ikilisinin 0x1140 ofsetindeki fonksiyonuna uprobe bağla:
sudo bpftrace -e '
uprobe:/usr/bin/ornek:0x1140 {
    printf("Hedef fonksiyon cagirildi! RDI argumani: %d\n", reg("di"));
}
'
```

## 3. eBPF Neden Tespit Edilemez (Evasion Resistant)?

Geleneksel analiz araçları hedef sürecin adres uzayına kod enjekte eder (`LD_PRELOAD`), sinyal gönderir (`SIGTRAP`) veya ptrace ile süreci durdurur.

eBPF ile gözlemin etkisi bağlanma türüne göre değerlendirilmelidir. Tracepoint, kprobe ve uprobe aynı mekanizma değildir; uprobes hedef komut konumunda breakpoint kullanabilir. `TracerPid: 0` yalnızca ptrace ilişkisini sınar ve başka gözlem yöntemlerini dışlamaz. Olay üretimi, tampon doluluğu ve tüketici hızı zamanlamayı etkileyebilir.

## 4. eBPF'in Kötüye Kullanımı ve Evasion Tartışmaları

eBPF programlarının yapabilecekleri program türüne, izinlere ve çekirdek yapılandırmasına bağlıdır. Örneğin [bpf-helpers(7)](https://man7.org/linux/man-pages/man7/bpf-helpers.7.html), `bpf_probe_write_user` yardımcısının kullanım koşullarını ve sınırlarını açıklar. Bir olay kaydını yorumlarken sistemdeki mevcut programları da inceleyin.

Tersine mühendislik uzmanı, sistemdeki eBPF programlarını ve haritalarını denetlemek için `bpftool` aracını kullanmalıdır:

```bash
# Sistemde çalışan eBPF programlarını listele:
sudo bpftool prog list
```

## İncelemeyi Derinleştir

Hedef programın analiz araçlarını algılamak için hangi hilelere başvurduğunu anlamak için [Analiz aracının etkisi](analiz-aracinin-etkisi.md) rehberini inceleyin. Toplanan izleri doğru hipotezlerle birleştirmek için [İzleri yorumlamak](izleri-yorumlamak.md) bölümünü okuyun.

## Kaynaklar

- [Kernel: libbpf overview](https://docs.kernel.org/bpf/libbpf/libbpf_overview.html)
- [Kernel: BPF ring buffer](https://docs.kernel.org/bpf/ringbuf.html)
- [Kernel: Uprobe-tracer documentation](https://docs.kernel.org/trace/uprobetracer.html)
- [bpftrace Reference Guide](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
