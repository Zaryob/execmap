---
title: Az CPU kullanan yavaş bir programı teşhis etme
language: C
description: Sistem çağrıları, uprobes, zaman çizelgesi ve GDB ile yavaş adım boyunca tutulan kilidi bulun.
---

# Az CPU kullanan yavaş bir programı teşhis etme

Bir program saniyenin onda birini alması gereken iş için üç saniye sürer, ancak CPU neredeyse boştadır. Bir CPU profili bunu açıklamayacaktır, çünkü zaman **beklemektedir**. Bu laboratuvarda programın CPU'dan uzak olduğunu kanıtlayacaksınız, hangi iş parçacığının beklediğini ve ne için beklediğini, beklemeye neden olan iş parçacığını tespit edin, hata ayıklayıcı anlık görüntüsüyle doğrulayın ve bir düzeltmeyi doğrulayın.

Bu, çok iş parçacıklı koddaki gerçek performans hatasının en yaygın şeklidir: bir iş parçacığı yavaş bir şey yaparken bir kilidi tutar ve herkes arkasında kuyruklar. Kaynağı okuyamamış gibi teşhis edeceksiniz ve ancak o zaman sorumlu olan çizgiye bakacaksınız.

## Başlamadan önce

POSIX iş parçacıklarını ile Linux, GCC veya Clang'a ihtiyacınız var, `perf`, **bpftrace 0.21 veya daha yeni** (0.19+ için `args.` sözdizimi), ve GDB. [bpftrace ile ilk adımlar](bpftrace-ilk-adimlar.md) önce; bu laboratuvar tekniklerini varsayar. [perf ve bpftrace ile yavaş, takılan ve hata veren programları inceleme](../rehberler/debug-is-akisi.md) Burada alınan her kararın genel şekli açıklanır.

```bash
mkdir -p offcpu-diagnosis && cd offcpu-diagnosis
{ uname -r; perf --version; bpftrace --version; gdb --version | head -n 1; ldd --version | head -n 1; } | tee env.txt
```

## 1. Program

Bunu `slowjobs.c` olarak kaydedin. Şimdilik sadece `main` okuyun: bir arka plan iş parçacığını başlatır, ardından 200 işlerini hesaplar ve kaydeder.

```c slowjobs.c
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static pthread_mutex_t table_lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned long table[64];
static atomic_int done;
static int fixed_mode;

static void sleep_ms(long ms) {
    struct timespec ts = { ms / 1000, (ms % 1000) * 1000000L };
    nanosleep(&ts, NULL);
}

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

/* Background thread: copies the table and "writes it out" (simulated by a 30 ms sleep). */
__attribute__((noinline)) unsigned long flush_table(void) {
    unsigned long snapshot[64], total = 0;
    pthread_mutex_lock(&table_lock);
    memcpy(snapshot, table, sizeof snapshot);
    if (!fixed_mode)
        sleep_ms(30); /* BUG: the slow step runs while the lock is held */
    pthread_mutex_unlock(&table_lock);
    if (fixed_mode)
        sleep_ms(30); /* FIX: the slow step runs after the lock is released */
    for (int i = 0; i < 64; i++)
        total += snapshot[i];
    return total;
}

static void *flusher(void *arg) {
    (void)arg;
    while (!atomic_load(&done)) {
        flush_table();
        sleep_ms(1);
    }
    return NULL;
}

/* Roughly half a millisecond of arithmetic per job. */
__attribute__((noinline)) unsigned long compute_job(int id) {
    unsigned long h = (unsigned long)id;
    for (int i = 0; i < 400000; i++)
        h = h * 6364136223846793005UL + 1442695040888963407UL;
    return h >> 60;
}

__attribute__((noinline)) void record_job(int id, unsigned long value) {
    pthread_mutex_lock(&table_lock);
    table[id % 64] += value;
    pthread_mutex_unlock(&table_lock);
}

int main(int argc, char **argv) {
    int jobs = argc > 1 ? atoi(argv[1]) : 200;
    fixed_mode = argc > 2 && strcmp(argv[2], "fixed") == 0;
    unsigned long sum = 0;
    pthread_t thread;
    if (jobs <= 0 || pthread_create(&thread, NULL, flusher, NULL) != 0) {
        fprintf(stderr, "usage: %s [jobs>0] [slow|fixed]\n", argv[0]);
        return 2;
    }
    double start = now_ms();
    for (int i = 0; i < jobs; i++) {
        unsigned long value = compute_job(i);
        record_job(i, value);
        sum += value;
    }
    double elapsed = now_ms() - start;
    atomic_store(&done, 1);
    pthread_join(thread, NULL);
    printf("mode=%s jobs=%d sum=%lu elapsed=%.0fms\n", fixed_mode ? "fixed" : "slow", jobs, sum, elapsed);
    return 0;
}
```

```bash
gcc -std=c11 -Wall -Wextra -O2 -g -fno-omit-frame-pointer -pthread slowjobs.c -o slowjobs
BIN=$(readlink -f ./slowjobs)
```

## 2. Çalışıyor mu yoksa bekliyor mu?

```bash
time ./slowjobs
```

Farklı bir makinede yapılan bir referans çalışmasından elde edilen sonucun şekli:

```text
mode=slow jobs=200 sum=1480 elapsed=2851ms
real    0m3.08s
user    0m0.14s
sys     0m0.01s
```

`sum=1480` doğruluk kontrolüdür ve daha sonra değişmemelidir. Önemli karşılaştırma `real`'ye karşı `user + sys`: 3 s'ye yaklaşık olarak geçti ancak sadece 0.15 s CPU. 95'den daha fazla zaman, bu işlemin hiçbir iş parçacığını çalışmıyordu.  Bu bir CPU dışı sorun.

`perf stat` farklı kelimelerle aynı şeyi söylüyor:

```bash
perf stat -e task-clock,context-switches,cpu-migrations ./slowjobs
```

`CPUs utilized` etrafında 0.05 ve birkaç yüz bağlam anahtarı bekleyin. Her gönüllü anahtar, beklemek zorunda olduğu için bir iş parçacığının durduğu bir andır.

## 3. Bir CPU profilinin neden yanlış bir araç olduğunu görün

```bash
perf record -F 999 -g -o cpu.data ./slowjobs
perf report -i cpu.data --stdio --no-children | head -n 20
```

Rapor `compute_job` tarafından yönetilmektedir. Bu doğrudur: CPU meşgul olduğu birkaç dakika boyunca, hesaplamaydı. Ancak `compute_job`'yi sabitlemek, CPU zamanının en fazla 0.15'sini kurtarabilir; diğer 2.9'ler örneklemeye görünmez. Bu raporu bir hatırlatma olarak saklayın:  bir CPU profili " CPU zamanı nereye gider", "nereye gider" değil, "nereye gider".

## 4. Hangi iş parçacıkları bekler ve hangi sistem çağırır?

Bekleyen bir iş parçacığı genellikle bir sistem çağrısının içinde bekler. Her iş parçacığının hızlı bir `perf trace -s ./slowjobs` veya önceki laboratuvardan gelen syscall sayısının işaret edeceği iki adayda harcadığı zamanı sum, `futex` ve `clock_nanosleep`:

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:syscalls:sys_enter_futex,
tracepoint:syscalls:sys_enter_clock_nanosleep
/pid == cpid/ { @start[tid] = nsecs; }

tracepoint:syscalls:sys_exit_futex,
tracepoint:syscalls:sys_exit_clock_nanosleep
/pid == cpid && @start[tid]/ {
    @ms[tid, probe] = sum((nsecs - @start[tid]) / 1000000);
    @calls[tid, probe] = count();
    delete(@start[tid]);
}
END { clear(@start); }'
```

Beklenen şekil (TID'ler farklı olacaktır; ana iş parçacığının TID'si işlem kimliğine eşittir):

```text
@ms[<main tid>, tracepoint:syscalls:sys_exit_futex]: ~2800
@ms[<other tid>, tracepoint:syscalls:sys_exit_clock_nanosleep]: ~3000
```

İki iş parçacığı, iki farklı bekleme türü:

- **Ana konu**, `futex`'de geçen zamanın neredeyse tamamını geçirir. `pthread_mutex_lock` kullanan bir programda, uzun bir `futex` bekleme "başka birinin tuttuğu bir kilidi beklemek" anlamına gelir.
- **Diğer iş parçacığı** zamanını kasıtlı bir uyku olan `clock_nanosleep`'de geçirir. Kendi başına uyumak zararsızdır; soru, kilidi tutarken ana iş parçacığının ihtiyacı * uyuyup uyumadığıdır.

Artık test etmek için bir hipoteziniz var. İkinci konu ayrıca birkaç kısa `futex` çağrısı yapar; bunlar, kilidini açtıktan sonra gönderdiği uyandırmalardır.

## 5. Hangi kod yolu bekler?

Sistem çağrıları * ana iş parçacığının beklediğini gösterir; programın kendi işlevlerindeki uprobes * nerede * gösterir. `record_job` zamanı ve içinde kaç `futex` beklediğini sayın:

```bash
sudo bpftrace -c "$BIN" -e "
uprobe:$BIN:record_job /pid == cpid/ { @in[tid] = nsecs; }
uretprobe:$BIN:record_job /pid == cpid && @in[tid]/ {
    @record_job_ms = hist((nsecs - @in[tid]) / 1000000);
    delete(@in[tid]);
}
tracepoint:syscalls:sys_enter_futex /pid == cpid && @in[tid]/ { @futex_inside_record_job = count(); }
END { clear(@in); }"
```

Beklenen: `@record_job_ms` iki kümeye sahiptir: kilidi aynı anda kovaya koyan aramalar `[0]`ve kilit çoğunlukla toprak tutulurken gelen aramalar `[16, 32)`, floşun çoğunu beklemek. Bir dizi elemanını güncellemek alamaz 30 ms CPU; bu aramalar bekledi. `@futex_inside_record_job` sıfır olmayan, futex zamanını adımdan birbirine bağlayan 4 bu fonksiyona. Aynı sondayı çalıştır `compute_job` Ve bir tek sımsıkı küme bulursun, o da hiç beklemez.

## 6. Kilidi kim tutuyor ve ne yapıyor?

Kilit işlemlerinin kısa bir zaman çizelgesini yazdırın ve her iki konu için de uyku. `pthread_mutex_lock` ve `pthread_mutex_unlock` C kütüphanesinde yaşıyor, bu yüzden önce yolunu bulun:

```bash
LIBC=$(ldd "$BIN" | awk '/libc\.so/ { print $3 }')
echo "$LIBC"
sudo bpftrace -l "uprobe:$LIBC:pthread_mutex_*lock"
```

glibc 2.34 ve daha yenisinde bu işlevler `libc.so.6`'dedir. Eski sistemlerde `libpthread.so.0`'dedirler; bunun yerine bu yolu kullanın. Şimdi 20 işlerini izleyin, böylece çıktı kısa kalır:

```bash
sudo bpftrace -c "$BIN 20" -e "
uprobe:$LIBC:pthread_mutex_lock   /pid == cpid/ { printf(\"%8d us  tid %-7d lock    %p\n\",   elapsed / 1000, tid, arg0); }
uprobe:$LIBC:pthread_mutex_unlock /pid == cpid/ { printf(\"%8d us  tid %-7d unlock  %p\n\",   elapsed / 1000, tid, arg0); }
tracepoint:syscalls:sys_enter_clock_nanosleep /pid == cpid/ { printf(\"%8d us  tid %-7d sleep   begin\n\", elapsed / 1000, tid); }
tracepoint:syscalls:sys_exit_clock_nanosleep  /pid == cpid/ { printf(\"%8d us  tid %-7d sleep   end\n\",   elapsed / 1000, tid); }
tracepoint:syscalls:sys_enter_futex /pid == cpid/ { printf(\"%8d us  tid %-7d futex   begin\n\", elapsed / 1000, tid); }
tracepoint:syscalls:sys_exit_futex  /pid == cpid/ { printf(\"%8d us  tid %-7d futex   end\n\",   elapsed / 1000, tid); }" > timeline.txt
less timeline.txt
```

Bunun gibi tekrar eden bir desen arayın (illüstratif, TID'ler kısaltıldı):

```text
  101200 us  tid B  lock    0x5581…4040
  101210 us  tid B  sleep   begin
  101650 us  tid A  lock    0x5581…4040
  101660 us  tid A  futex   begin
  131300 us  tid B  sleep   end
  131310 us  tid B  unlock  0x5581…4040
  131320 us  tid B  futex   begin
  131330 us  tid B  futex   end
  131340 us  tid A  futex   end
```

Satır satır oku: B iş parçacığını adrese kilitlenir `…4040` ve uykuya gider **kilidini açmadan**. Thread A aynı adresi ister ve bekler `futex`Otuz milisaniye sonra B uyanır, kilidini açar ve kendi kısa `futex` çağrı uyanır A. Adres, her iki iş parçacığının de aynı kilidi kullandığını kanıtlar; sıra, uykunun kritik bölüm içinde gerçekleştiğini kanıtlar. Adımdan hipotez 4 doğrudan kanıtlarla doğrulanmıştır.

`pthread_mutex_lock` girişte incelenir: A için "kilit" satırı, kilidin A * istenmiş * anlamına gelir, onu elde ettiğini değil. İstenmeyen bir kilit `futex`'yi hiç çağırmaz, bu nedenle birçok kilit / kilitlenmemiş çift futex hattı olmadan görünür.

## 7. Hata ayıklayıcı anlık görüntüsü ile onaylayın

Bağımsız bir araç kabul etmelidir. Programı arka planda başlatın ve yavaşken tüm konuları bir anlık görüntü çekin:

```bash
./slowjobs 400 &
sleep 1
sudo gdb -p $! -batch -ex 'thread apply all bt' > snapshot.txt 2>&1
wait
grep -E '^Thread|^#' snapshot.txt | head -n 30
```

GDB, yığınlarını okumak için işlemi kısaca durdurur, ardından ayrılır. C kütüphanesinin kilit bekleme yolunun içinde bir iş parçacığı bekleyin `record_job`Ve bir tanesi içeri `clock_nanosleep` tarafından seslendirildi `sleep_ms` tarafından seslendirildi `flush_table`. Tek bir anlık görüntü şanssız bir anı yakalayabilir, bu nedenle sonuçlandırmadan önce iki veya üç tane alın. Ekleme bir izin hatasıyla başarısız olursa, kontrol edin `/proc/sys/kernel/yama/ptrace_scope` ve kullanımı `sudo`.

## 8. Kaynağı okuyun, düzeltin ve doğrulayın

Sadece şimdi açık `flush_table`. The 30 ms `sleep_ms` çağrı, yavaş I/O için ayakta durmak, örneğin bir dosya yazmak, arasında çalışır `pthread_mutex_lock` ve `pthread_mutex_unlock`. İhtiyacı olan veriler zaten kopyalandı `snapshot`, böylece yavaş adım kilidini açtıktan sonra çalışabilir. Programın `fixed` mod tam olarak bunu yapar:

```bash
time ./slowjobs 200 fixed
```

Beklenen: aynı `sum=1480`, ve saf hesaplama süresine yakın geçen süre (referans çalışmasında 0.1 s civarında). `-c "$BIN 200 fixed"` ile adım 4'den ölçüm tekrar çalıştır:

- ana iş parçacığı `futex` zaman sıfıra yakın düşer;
- İkinci iş parçacığı hala eskisi kadar uzun süre uyur, çünkü uyku hiçbir zaman sorun değildi, uyku **kilidi tutarken** idi.

Sabit ikili ile 5 adımını tekrar çalıştırın: `@record_job_ms`, `[0]` kovasına çöker.

## 9. İsteğe bağlı: zamanlayıcıdan CPU dışı zaman

Sistem çağrıları beklemenin bir görünümüdür; zamanlayıcı başka bir şeydir. `sched_switch` izleme noktası, bir iş parçacığının her bir CPU'dan ayrıldığında veya aldığında kaydeder:

```bash
sudo bpftrace -c "$BIN" -e '
tracepoint:sched:sched_switch /pid == cpid/ { @off[tid] = nsecs; }
tracepoint:sched:sched_switch /@off[args.next_pid]/ {
    @offcpu_ms[args.next_pid] = sum((nsecs - @off[args.next_pid]) / 1000000);
    delete(@off[args.next_pid]);
}
END { clear(@off); }'
```

Toplamlar 4 adımından sistem çağrı zamanlarına yakın olmalıdır. Tam olarak eşleşmeyecekler: CPU dışı zaman ayrıca çalıştırılabilir olmayı da içeriyor ancak henüz programlanmamış ve syscall ölçümü çekirdek içinde küçük bir CPU çalışması içeriyor. [Zamanlayıcı çizelgesini durum geçişlerinden okuma](zamanlayici-zaman-cizelgesi.md) bu parçaları ayırır.

## Tanı kaydı

```text
Symptom:      200 jobs take ~3 s; expected ~0.1 s
Step 2:       real 3.1 s vs user+sys 0.15 s          → off-CPU
Step 3:       CPU profile: compute_job               → explains only the CPU part
Step 4:       main thread ~2.8 s in futex; flusher ~3 s in clock_nanosleep
Step 5:       record_job bimodal: <1 ms or 16–32 ms; futex waits inside it
Step 6:       flusher locks L, sleeps 30 ms, unlocks; main waits on the same L
Step 7:       gdb: main in lock wait from record_job; flusher in nanosleep from flush_table
Fix:          move the slow step after unlock
Verification: sum unchanged; elapsed ~0.1 s; main futex time ≈ 0
```

Her satır, adı verilen bir araçtan bir gözlemdir ve sonuç birkaç bağımsız olana dayanır. [Çalışma zamanı izlerini yorumlama](../rehberler/izleri-yorumlamak.md)'nin istediği standarttır.

## Kaynaklar

- [fütex(2)](https://man7.org/linux/man-pages/man2/futex.2.html) ve [pthread_mutex_lock(3p)](https://man7.org/linux/man-pages/man3/pthread_mutex_lock.3p.html)
- [Brendan Gregg: CPU Analizi](https://www.brendangregg.com/offcpuanalysis.html)
- [bpftrace kılavuzu](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [GDB: iş parçacıkları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Threads.html)
- [Linux çekirdek: zamanlayıcı izleme noktaları ve olay izleme](https://docs.kernel.org/trace/events.html)
