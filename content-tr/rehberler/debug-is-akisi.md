---
title: perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme
description: İşlemci kullanan, bekleyen, takılan ya da gerileyen programlar için belirtiden yola çıkın.
---

# perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme

Bu semptom odaklı bir oyun kitabıdır. Her bölüm, "CPU 100'de" veya "işlem hiçbir şey yapmaz" gibi gözlemleyebileceğiniz bir şeyden başlar ve semptomu kanıta dönüştüren komutları listeler. [sıfır](performans-analizine-giris.md)'den performans analizi ve [sıfır](bpftrace-temelleri.md)'den gelen sözdizimi] kelime dağarcığını yeniden kullanır.

Bu sayfa boyunca `PID` süreç kimliğidir ve `./prog` soruşturma altında olan programdır. Çalışan bir işleme bağlanan veya çekirdeğin izini süren komutlar çoğu sistemde köke ihtiyaç duyar.

## 0. Bir şube seçmeden önce

Bu çeklere bir dakikanızı ayırın. Aşağıdaki bölümün hangi bölüme uygulanacağını söylerler.

```bash
ps -o pid,tid,stat,pcpu,wchan:32,comm -L -p PID   # threads, state, CPU %, kernel wait function
grep -E 'State|Threads|voluntary' /proc/PID/status
sudo perf stat -p PID -- sleep 5                   # five seconds of counters
```

- ** Devlet** `R` koşmak veya çalıştırılabilir, `S` uyumak (bir olayı beklemek), `D` kesintisiz uyku (genellikle çekirdek içindeki I/O), `T` durdu, `Z` çıktı ancak henüz biçilmedi.
- **`wchan`**, çekirdek bunu açığa çıkardığında bir uyku ipliğinin beklediği çekirdek fonksiyonunu belirtir. `futex_wait_queue` (kilit veya durum değişkeni), `do_select` / `do_epoll_wait` (I / O hazırlığını bekliyor) veya `hrtimer_nanosleep` (uyku) gibi değerler, bekleme türüne işaret eder. İsimler çekirdek sürümleri arasında değişir.
- **perf stat** `CPUs utilized` yakın veya 1 üzerinde işlem meşgul anlamına gelir; 0 yakın bekleme anlamına gelir.

| Belirti | İlgili bölüm |
| --- | --- |
| yüksek CPU, yavaş | [Bölüm 1](#1-the-program-is-busy-on-cpu-and-slow) |
| düşük CPU, yavaş | [Bölüm 2](#2-the-program-is-slow-but-the-cpu-is-mostly-idle) |
| Hiçbir ilerleme yok | [Bölüm 3](#3-the-program-is-stuck) |
| yanlış davranış, sessiz başarısızlıklar, tekrarlar | [Bölüm 4](#4-the-program-fails-or-retries-silently) |
| Önceki sürümden daha yavaş | [Bölüm 5](#5-it-got-slower-after-a-change) |
| bellek büyür, birçok sayfa hatası | [Bölüm 6](#6-memory-growth-and-page-faults) |

## 1. Program CPU üzerinde yoğun ve yavaş

Soru şu: **hangi kod** CPU'yu kullanıyor. Örnekle.

```bash
sudo perf top -p PID                              # live view, press q to quit
sudo perf record -F 99 -g -p PID -- sleep 10      # 10 s of stack samples
sudo perf report --stdio --no-children | head -n 60
```

`--no-children`, ** self** zamana göre sıralanır: kendi talimatlarını uygulayan işlevler. Sonra, tüm alt ağacı pahalı olan arayanı bulmak için `--children`'ye geçin. Bir alev grafiği, her iki görünümü de aynı anda gösterir; [CPU profilleme laboratuvarı](../laboratuvarlar/cpu-profili.md) adım adım inşa eder.

Bir işlev baskın olduğunda, talimatlarına bakın:

```bash
sudo perf annotate --stdio -s function_name | head -n 60
```

[assembly okumaya hazırlık rehberi](assembly-okuma.md) ile sıcak komutları okuyun. Karşılaştırmaların sıcak bir döngüsü genellikle bir algoritma sorunu (bir döngüde doğrusal bir arama) anlamına gelir. Bir bellek yükünden sonra sıcak bir komut önbellek ıskalaması anlamına gelebilir; Sayaçlarla onaylayın:

```bash
sudo perf stat -e cycles,instructions,cache-references,cache-misses,branch-misses -p PID -- sleep 5
```

Döngü başına komutlar (IPC, `insn per cycle` olarak basıldı) 1'nin çok altında modern bir CPU üzerinde CPU'nun genellikle bellek beklemesini önerir. Sayaç adları ve kullanılabilirlik CPU'ya ve sanallaştırmaya bağlıdır; `<not supported>`, sıfır değil, kullanılamaz anlamına gelir.

bpftrace de örnek alabilir, bu da örnekleri kendiniz yazdığınız bir filtre ile birleştirmek istediğinizde kullanışlıdır:

```bash
sudo bpftrace -e 'profile:hz:99 /pid == PID/ { @[ustack] = count(); } interval:s:10 { exit(); }'
```

**Saklamak için kanıt:** rapor, tam komut, örnek sayısı ve yığınların tamamlanıp tamamlanmadığı.

## 2. Program yavaş ama CPU çoğunlukla boşta

Bir CPU profili bekleme süresi açıklayamaz. Thread'lerin beklediği şeyi bulmanız gerekir.

### Hangi sistem aramaları zaman alır?

Sistem çağrılarını ve isim başına süreyi sayın. Bu tek satırlık, her sistem çağrısının çocuk işlemi için ne kadar sürdüğünü kaydeder:

```bash
sudo bpftrace -c './prog' -e '
tracepoint:raw_syscalls:sys_enter /pid == cpid/ { @start[tid] = nsecs; @id[tid] = args.id; }
tracepoint:raw_syscalls:sys_exit /pid == cpid && @start[tid]/ {
    @total_us[@id[tid]] = sum((nsecs - @start[tid]) / 1000);
    delete(@start[tid]); delete(@id[tid]);
}
END { clear(@start); clear(@id); }'
```

`raw_syscalls` bir sistem çağrısı bildirir * numara *, bir isim değil. `ausyscall --dump` (sesli paket) veya çekirdek'in syscall tablosu ile isimlere harita numaraları. İsimleri doğrudan yazdıran daha basit ama daha ağır bir alternatif perf'in syscall özetidir:

```bash
sudo perf trace -s ./prog
```

`perf trace -s` baskılar, iş parçacığı başına, her sistem çağrısının sayısı, toplam, ortalama ve maksimum süresi. Az ama uzun olan aramaları arayın (`futex`, `poll`, `epoll_wait`, `clock_nanosleep`, `read` bir boru veya sokette, `fsync`).

### 2b. Bekleme sistemi çağrısını yorumla

| Uzun syscall | Genellikle anlamı | Sonraki adım |
| --- | --- | --- |
| `futex` | bir muteks, durum değişkeni veya iş parçacığı birleştirmesini beklemek | Kilit tutucuyu bulun: [tanıtım lab](../laboratuvarlar/yavas-program-teshisi.md) |
| `clock_nanosleep`, `nanosleep` | kasıtlı uyku, geri çekilme, anket döngüsü | `ustack` ile arayanı bul |
| `poll`, `epoll_wait`, `select` | ağ veya boru verilerini beklemek | akranı kontrol edin; istek sona erdiğinde |
| `read`, `write`, `fsync` bir dosya üzerinde | disk I/O | `biolatency` tarzı blok izleme, cihaz kullanımı |
| `connect`, `recvfrom` | ağ gecikmesi veya yavaş bir sunucu | Her iki uçta da ölçü |

`futex` durumu çok iş parçacıklı programlarda en yaygın olanıdır ve görülmesi en zor olanıdır. Kilit bekleyen bir iş parçacığı CPU'dan uzaktır * çünkü başka bir iş parçacığı kilidi tutar *; bekleme ipliğinin yığını hangi kilidin olduğunu söyler ve tutucu yığını neden uzun süre tutulduğunu söyler.

### 2c. Iş parçacığı başına CPU dışı zaman

Zamanlayıcı izleme noktası `sched:sched_switch`, bir iş parçacığı ne zaman bir CPU'dan ayrılsa veya alsa ateşler. Ayrılma ve geri dönme arasındaki süreyi kaydetmek, iş parçacığı başına CPU dışı zaman verir:

```bash
sudo bpftrace -c './prog' -e '
tracepoint:sched:sched_switch /pid == cpid/ { @off[tid] = nsecs; }
tracepoint:sched:sched_switch /@off[args.next_pid]/ {
    @offcpu_ms[args.next_pid] = sum((nsecs - @off[args.next_pid]) / 1000000);
    delete(@off[args.next_pid]);
}
END { clear(@off); }'
```

İlk blok, ayrılan iş parçacığı bağlamında çalışır, bu nedenle `pid` ve `tid` onu tanımlar. İkincisi, ismine rağmen CPU'yu alan görevin **thread** kimliği olan `next_pid`'yi kullanır. CPU dışı zaman, uyumayı ve programlanmayı beklemeyi içerir; [scheduler zaman çizelgesi laboratuvarı](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md) ikisini ayırır.

## 3. Program sıkışmış

Hiçbir şey ilerlemediğinde, herhangi bir şeyi değiştirmeden önce her iş parçacığının **snapshot**'unu alın.

```bash
cat /proc/PID/task/*/stat | awk '{print $1, $3}'     # TID and state of each thread
sudo cat /proc/PID/task/*/stack                       # kernel stacks (root, if the kernel exposes them)
sudo gdb -p PID -batch -ex 'thread apply all bt'     # user stacks of all threads
```

GDB, takılıyken işlemi durdurur ve ayrıldığında devam etmesini sağlar. Özellikle hata ayıklama bilgileriyle kullanıcı kodu için en bilgilendirici anlık görüntüdür. Her biri bir kilit bekleyen iki iş parçacığı, diğer tutma kilit açmadır; arka izleri her iki kilit aramasını da gösterir. `D` durumunda uzun süre tek bir iş parçacığı, çekirdeği veya cihazı işaret eder; çekirdek yığını kanıttır.

Bir hata ayıklayıcının takılmasına izin verilmezse, uyku ipliklerinin örnek yığınları CPU'dan çıktıklarında bpftrace ile:

```bash
sudo bpftrace -e 'tracepoint:sched:sched_switch /pid == PID/ { @[kstack, ustack, comm] = count(); } interval:s:5 { exit(); }'
```

Gerçekten sıkışmış bir program pencere sırasında hiç değişmeyebilir; daha sonra GDB anlık görüntüsü veya `/proc/PID/task/*/stack` daha iyi bir araçtır. Asılı yerine bir çökme için, [çekirdek dökümleri](core-ve-snapshot.md) kullanın.

## 4. Program başarısız olur veya sessizce geri döner

Birçok "yavaş" program başarısız oluyor ve yeniden deniyor. Sistem arama hataları, program bunları gizlediğinde bile çekirdekten görülebilir.

```bash
# Every failing system call of the child, by syscall number and error number
sudo bpftrace -c './prog' -e 'tracepoint:raw_syscalls:sys_exit /pid == cpid && args.ret < 0/ { @fail[args.id, -args.ret] = count(); }'

# Which file paths fail to open, and why
sudo bpftrace -c './prog' -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @path[tid] = str(args.filename); }
tracepoint:syscalls:sys_exit_openat /pid == cpid/ {
    if (args.ret < 0) { printf("open %s failed: errno %d\n", @path[tid], -args.ret); }
    delete(@path[tid]);
}
END { clear(@path); }'
```

Bazı arızalar normaldir: İsteğe bağlı yapılandırma dosyaları için `ENOENT`, engellenmeyen I/O için `EAGAIN`. Önemli olan, bir döngüde tekrarlayan bir arızadır veya semptomdan hemen önce gerçekleşen bir hatadır. `strace -f -e trace=%file ./prog`, her çağrı için süreci durdurma pahasına, çözülmüş argümanlarla aynı bilgileri gösterir ve iyi bir çapraz kontroldür.

## 5. Bir değişiklikten sonra yavaşladı

Benzeri ile karşılaştırın: aynı giriş, makine ve bayraklar inşa edin.

```bash
perf stat -r 5 ./prog-old > /dev/null 2> old.txt
perf stat -r 5 ./prog-new > /dev/null 2> new.txt
perf record -g -o old.data ./prog-old
perf record -g -o new.data ./prog-new
perf diff old.data new.data | head -n 40
```

`-r 5` ortalama ve varyasyonu bildirir; eğer versiyonlar arasındaki fark varyasyondan daha küçükse, henüz bir bulgu yoktur. `perf diff` örneklerin payı değişen işlevleri listeler. *% percentages * karşılaştırır: bir işlev, başka bir şey daha hızlı olduğu için paylaşımda büyüyebilir. [İkili dosya farkları ve sürüm karşılaştırması](ikili-fark-analizi.md) Değişimin kaynağı bilinmediği zaman.

## 6. Bellek büyümesi ve sayfa hataları

```bash
perf stat -e page-faults,minor-faults,major-faults ./prog
sudo perf record -e page-faults -g ./prog          # where faults happen
sudo bpftrace -c './prog' -e 'uprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc /pid == cpid/ { @bytes[ustack(6)] = sum(arg0); }'
```

Kütüphane yolu dağıtımlar arasında farklılık gösterir; `ldd ./prog` ile bulun. `malloc`'yi araştırmak, tahsis ağırlıklı programlarda pahalıdır, bu yüzden önce kısa bir çalışma deneyin. İstenen boyutları, bellek isteyen yığın şovları tarafından summing, kim onu serbest bırakmayı unutur; sızıntılar için `malloc` ile `free` çifti veya Valgrind veya AdresSaniizer gibi özel bir araç kullanın.

## 7. Ne bulduğunu yaz

Kısa bir kayıt, bulguyu gözden geçirilebilir ve tekrarlanabilir hale getirir:

```text
Symptom:        report takes 3.0 s for 200 jobs (baseline 0.1 s)
Environment:    kernel 6.8, x86-64, gcc 13 -O2 -g -fno-omit-frame-pointer, bpftrace 0.21
Observation 1:  elapsed 3.0 s, user+sys 0.15 s  → mostly off-CPU
Observation 2:  main thread: 2.8 s in futex; flusher thread holds table_lock ~30 ms per flush
Hypothesis:     main waits for table_lock while flusher sleeps inside the critical section
Prediction:     moving the sleep outside the lock removes most futex time
Result:         fixed build 0.1 s; futex time near zero
Limits:         one machine, 5 runs; probe overhead not separately measured
```

Bu örnek, her satırı yeniden üretebileceğiniz [CPU dışı tanı lab](../laboratuvarlar/yavas-program-teshisi.md) ile eşleşir. [izleme yorumlama kılavuzu](izleri-yorumlamak.md), "Sınırlar" çizgisinin neden önemli olduğunu açıklar.

## Kaynaklar

- [perf-trace(1)](https://man7.org/linux/man-pages/man1/perf-trace.1.html), [perf-diff(1)](https://man7.org/linux/man-pages/man1/perf-diff.1.html), [perf-annot(1)](https://man7.org/linux/man-pages/man1/perf-annotate.1.html)
- [proc_pid_stat(5)](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) ve [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [Futex(2)](https://man7.org/linux/man-pages/man2/futex.2.html)
- [Brendan Gregg: CPU Analizi](https://www.brendangregg.com/offcpuanalysis.html)
- [bpftrace kılavuzu](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [GDB: birden fazla konu ile programları hata ayıklama](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Threads.html)
