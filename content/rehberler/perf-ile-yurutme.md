---
title: "perf ile yürütme analizi ve donanımsal izleme"
---

# perf ile yürütme analizi ve donanımsal izleme

Tersine mühendislikte bir ikili dosyanın statik disasm çıktısı, kodun çalışma anındaki gerçek davranışını her zaman yansıtmaz. Karmaşık dallanmalar, dinamik fonksiyon göstericileri (function pointers) ve dolaylı çağrılar (indirect calls) içeren bir programın en çok hangi kod yollarını (hotspots) tükettiğini anlamanın yolu çalışma anı profillemesidir.

Linux çekirdeğinin resmi performans alt sistemi olan **`perf`**, işlemcinin donanımsal Performans İzleme Birimini (PMU) ve çekirdek izleme noktalarını (tracepoints) kullanarak uygulamayı neredeyse sıfır gecikmeyle (overhead) nano-saniye hassasiyetinde izler.

## 1. Donanımsal Örnekleme (Sampling) Mantığı

`perf`, programı her komutta durdurup yavaşlatmak yerine **örnekleme (sampling)** yöntemini kullanır:

```text
[İşlemci PMU Sayacı: Her 1.000.000 CPU Döngüsünde (cycles) Bir Kesme Üret]
      |
      +---> Kesme anındaki Program Counter (%rip) kaydedilir.
      |
      +---> Çağrı yığını (Call Stack / Frame Pointer) kaydedilir.
      |
      +---> İşlemci yürütmeye devam eder (Süreçte neredeyse hiç yavaşlama olmaz).
```

### Neden 99 Hz?
Örnekleme frekansı seçilirken sıkça `perf record -F 99` kullanılır. Linux çekirdek zamanlayıcısı (kernel timer tick) 100 Hz, 250 Hz veya 1000 Hz frekansta çalışır. Tam 100 Hz seçildiğinde örnekleme zamanlayıcı vuruşlarıyla rezonansa girerek veriyi yanıltabilir; 99 Hz bu döngüyü kırarak saf ve tarafsız dağılım sağlar.

## 2. perf record ve perf report İş Akışı

Hedef bir programın yürütme profilini kaydetmek için:

```bash
perf record -F 99 -g -- ./ornek
```

Parametreler:
- `-F 99`: Saniyede çekirdek başına 99 örnek alır.
- `-g`: Çağrı grafiğini (call graph / stack unwinding) kaydeder.
- `--`: İzlenecek komut ve parametreleri.

Kayıt tamamlandığında oluşan `perf.data` dosyasını terminalde görselleştirmek için:

```bash
perf report -g 'graph,0.5,caller'
```

Örnek rapor görünümü:

```text
Samples: 2K of event 'cycles', Event count (approx.): 1823901230
Children      Self  Command  Shared Object      Symbol
........  ........  .......  .................  ..........................
  92.40%    88.10%  ornek    ornek              [.] hesapla_karmasik
            |
            ---hesapla_karmasik
               |
                --4.30%-- yardimci_algoritma
   5.20%     5.10%  ornek    libc.so.6          [.] __memmove_avx_unaligned
   2.40%     0.00%  ornek    [kernel.kallsyms]  [k] __x64_sys_read
```

Bu raporda:
- `[.]`: Kullanıcı alanındaki (userspace) bir sembolü gösterir.
- `[k]`: Çekirdek alanındaki (kernel) bir fonksiyonu gösterir.
- `Self`: Zamanın doğrudan bu fonksiyonun kendi komutlarında harcandığını gösterir.
- `Children`: Bu fonksiyonun alt fonksiyonlarıyla birlikte tükettiği toplam süreyi gösterir.

## 3. En Üst Düzey Donanımsal İzleme: Intel PT (Processor Trace)

Standart örnekleme yalnızca istatistiksel bir tahmin sunar; her talimatı tek tek kaydetmez. Ancak modern Intel işlemcilerde bulunan **Intel PT (Processor Trace)** donanımı, programın çalıştırdığı **istisnasız her bir dallanmayı ve komutu** donanımsal olarak kaydeder!

Intel PT ile izleme başlatmak:

```bash
# Sadece kullanıcı alanındaki (//u) dallanmaları donanımsal buffer'a yaz
perf record -e intel_pt//u -- ./ornek
```

Kaydedilen ham donanım izini komut komut disasm dökümüne çevirmek:

```bash
perf script --insn-trace --xed
```

Örnek Intel PT çıktısı:

```text
ornek  1234 [001]  0.000123:  instruction:   0x55e1a2001150  push %rbp
ornek  1234 [001]  0.000124:  instruction:   0x55e1a2001151  mov %rsp, %rbp
ornek  1234 [001]  0.000125:  instruction:   0x55e1a2001154  cmp $0x10, %rax
ornek  1234 [001]  0.000126:  instruction:   0x55e1a2001158  je 0x55e1a2001180  => Dallanma Gerçekleşti!
```

Intel PT, anti-debugging mekanizmalarına (`ptrace` kontrolleri) yakalanmadan, kod üzerinde hiçbir yavaşlama veya breakpoint izi bırakmadan sürecin tüm akışını yeniden oynatmayı (execution replay) mümkün kılar.

## İncelemeyi Derinleştir

Çalışma anı olaylarını sistem çağrıları ve kullanıcı alanı kancalarıyla izlemek için [eBPF ile olaylar](ebpf-ile-olaylar.md) rehberine geçin. Analiz araçlarının hedef yazılım tarafından nasıl algılandığını öğrenmek için [Analiz aracının etkisi](analiz-aracinin-etkisi.md) konusunu okuyun.

## Kaynaklar

- [Linux Kernel: perf security documentation](https://docs.kernel.org/admin-guide/perf-security.html)
- [Intel PT Documentation — Linux Kernel](https://github.com/torvalds/linux/blob/master/tools/perf/Documentation/perf-intel-pt.txt)
- [Brendan Gregg: Linux perf Examples](https://www.brendangregg.com/perf.html)
- [Brendan Gregg: Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
