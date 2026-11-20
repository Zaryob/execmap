---
title: Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme
language: C++
description: C++ ölçüm noktalarını okuyun ve ham CSV kayıtlarından süreleri hesaplayın.
---

# Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme

Eleme süresi ve iş parçacığı-CPU ölçümü yapın, ardından ham kayıtlardan elde edilen sonuçları kendiniz hesaplayın. C++ ölçüm noktalarını okuyacak, eşleşen CSV satırlarını seçecek, Bash'te tam sayı zaman damgalarını çıkaracaksınız ve bir çağrının süresi ile aramalar arasındaki aralık arasındaki farkı açıklayacaksınız.

Çekirdek egzersiz `analyze.py` kullanmaz. İsteğe bağlı kontrolü sadece hesaplamaları yaptıktan sonra görünür.

## Başlamadan önce

**64-bit Linux, Bash, bir C++11 derleyicisi ve sıradan komut satırı araçlarını kullanın** (`awk`, `head`, `wc`). Komutlar `g++`; Clang ile derleyici komutunda `clang++` kullanın. Python yalnızca isteğe bağlı kontrolör için gereklidir.

Aşağıdaki kabuk komutları için Bash'i açın. Aynı kabuğu açık tutun: daha sonra hesaplamalar daha önce atadığınız değişkenleri kullanır.

Execmap deposunun kök dizininde çalıştırın:

```bash
cd examples/runtime-timing
```

Yalnızca web sitesi kopyası için bir dizin oluşturun ve [timing_lab.cpp](../labs/runtime-timing/timing_lab.cpp)'yi orada kaydedin:

```bash
mkdir -p ~/execmap-labs/manual-timing
cd ~/execmap-labs/manual-timing
```

Çekirdek egzersiz için sadece o C++ dosyasına ihtiyacınız var.

## 1. Bir kaydın ne içerdiğini anlayın

Düzenleyicinizdeki kaynağın tamamını açın veya terminalde yazdırın:

```bash
cat timing_lab.cpp
```

`cat` dosyayı görüntüler; derlemez veya çalıştırmaz. argüman ayrıştırıcı girişleri kontrol eder. Ölçümün kendisi aşağıdaki kaynak alıntıdan oluşturulmuştur:

```cpp
using Clock = std::chrono::steady_clock;
struct Record {
    std::int64_t timestamp_ns, thread_cpu_ns;
    unsigned seq;
    long tid;
    const char* event;
};
static std::vector<Record> records;
static bool busy_mode;
static long worker_tid;

static std::int64_t steady_ns() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        Clock::now().time_since_epoch()).count();
}

static std::int64_t thread_cpu_ns() {
    timespec value{};
    if (clock_gettime(CLOCK_THREAD_CPUTIME_ID, &value) != 0)
        throw std::runtime_error("cannot read thread CPU clock");
    return static_cast<std::int64_t>(value.tv_sec) * 1000000000 + value.tv_nsec;
}

static void mark(unsigned seq, const char* event) {
    const auto timestamp = steady_ns();
    const auto cpu = thread_cpu_ns();
    records.push_back(Record{timestamp, cpu, seq, worker_tid, event});
}
```

Bu sırada alıntıyı okuyun:

1. `Clock`, geçen aralıklar için kullanılan `std::chrono::steady_clock` adını verir.
2. `Record`, iki saat okuması, bir çağrı numarası (`seq`), iş parçacığı kimliği (`tid`) ve olay adı saklar.
3. `steady_ns()`, geçen saati okur ve okumasını tamsayı nanosaniye olarak ifade eder. Çağı burada takvim tarihi olarak kullanılmaz.
4. `thread_cpu_ns()`, `CLOCK_THREAD_CPUTIME_ID`'yi okur. Saniye kısmı bir milyarla çarpılır, sonra nanosaniye kısmı eklenir. Bu, uyku için harcanan zamandan ziyade bu iş parçacığı tarafından tüketilen CPU hizmetini ölçer.
5. `mark()` her iki saati de okur ve bir kaydı hafızaya ekler. Her çağrıya bir günlük dosyası yazmaz.

Bir CPU zaman damgasını geçen zaman damgasından çıkarmayın. Bunlar farklı saatlerdir. İki eşleme olayında **same ** saatinin iki okumasını çıkaracağız.

## 2. C++'da ölçüm sınırlarını bulun

İşte ölçeceğiniz iki işlev:

```cpp
extern "C" __attribute__((noinline)) void perform_work(unsigned seq) {
    mark(seq, "WORK_ENTER");
    if (busy_mode) {
        const auto end = Clock::now() + std::chrono::milliseconds(20);
        while (Clock::now() < end) { }
    } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    mark(seq, "WORK_EXIT");
}

extern "C" __attribute__((noinline)) void run_cycle(unsigned seq) {
    mark(seq, "CYCLE_ENTER");
    mark(seq, "BEFORE_CALL");
    perform_work(seq);
    mark(seq, "AFTER_CALL");
}
```

`run_cycle` `BEFORE_CALL`'yi kaydeder, `perform_work`'yi arar ve `AFTER_CALL`'yi ancak bu senkron çağrı geri döndükten sonra kaydeder. İşçi, `WORK_ENTER` ve `WORK_EXIT`'yi vücudunun etrafına yerleştirir. Aynı `seq` her işaretleyiciye geçer, böylece bir çağrı tanımlanabilir.

`extern "C"`, bu iki bağlantı adını sembol araması için serbest tutar. `noinline`, çağrı sınırının incelenmesi için uygun kalması için ayrı işlev organları talep eder. Ölçümün kendisi hala açık `mark` çağrılarından geliyor.

Uyku modunda, çalışan işletim sisteminden 20 ms için uyumasına izin vermesini ister. Yoğun modda, 20 ms geçene kadar geçen saati okumaya devam eder. İkincisi, benzer bir zaman geçirmesine rağmen çok daha fazla CPU kullanabilir.

`main`'nin içinde zamanlama döngüsü:

```cpp
        worker_tid = syscall(SYS_gettid);
        if (worker_tid < 1) throw std::runtime_error("cannot read TID");
        records.reserve(static_cast<std::size_t>(count) * 5);
        std::cerr << "pid=" << getpid() << " tid=" << worker_tid << " mode=" << mode << '\n';
        auto deadline = Clock::now();
        for (unsigned seq = 1; seq <= count; ++seq) {
            run_cycle(seq);
            deadline += std::chrono::milliseconds(period);
            std::this_thread::sleep_until(deadline);
        }
```

`SYS_gettid`, bu kayıtlar tarafından kullanılan mevcut Linux iş parçacığı kimliğini elde eder. `reserve(count * 5)`, kayıt başlamadan önce arama başına beş kayıt için yer açar. Son başvuru tarihi, her aramadan sonra `period` tarafından ilerler. `sleep_until(deadline)`, yalnızca bu son başvuru tarihi hala öndeyse bekler. Çalışmadan sonra ek bir tam süre talep etmez.

Döngüden sonra, kaynak bir çıkış akışı açar ve kayıtları yazar:

```cpp
        std::ofstream stream(output);
        if (!stream) throw std::runtime_error("cannot open output file");
        stream << "timestamp_ns,thread_cpu_ns,seq,tid,event\n";
        for (const auto& record : records)
            stream << record.timestamp_ns << ',' << record.thread_cpu_ns << ','
                   << record.seq << ',' << record.tid << ',' << record.event << '\n';
        stream.close();
        if (!stream) throw std::runtime_error("output write failed");
```

Bu nedenle CSV sadece çalışma bittikten sonra görünür. Saat okumaları ve bellek uzantılarının hala bir maliyeti vardır, ancak dosya çıktısı ölçülen işçi çağrılarının dışındadır. Küresel tampon bu deneyde tek bir iş parçacığı tarafından kullanılır.

## 3. Kaynağı derleyin ve seçenekleri açıklayın

İlk önce iki çıktı dizinini yapın:

```bash
mkdir -p build results
```

`-p`, `mkdir`'nin zaten var olan dizinleri yeniden kullanmasına izin verir. `build/` çalıştırılabilir dosyayı tutacak; `results/` kayıtlarınızı tutacak.

Şimdi derle:

```bash
g++ -std=c++11 -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic -pthread timing_lab.cpp -o build/timing_lab
```

`g++`, kaynağı derler ve bağlar. `-std=c++11` dil sürümünü seçer. `-g3` hata ayıklayıcı bilgilerini içerir; `-O0` bu denetim yapısı için optimizasyondan kaçınır. `-fno-omit-frame-pointer` bir çerçeve işaretçisi ister. Üç uyarı seçeneği tanılama ister. `-pthread`, iş parçacığı desteğini seçer. `-o` çalıştırılabilir yolu verir.

Hangi girdiyi ve derleyiciyi kullandığınızı kaydedin:

```bash
g++ --version
uname -sm
sha256sum timing_lab.cpp build/timing_lab > results/inputs.sha256
```

İlk iki komut sürüm ve mimari yazdırır. Üçüncüsü kaynak ve çalıştırılabilir hash'leri saklar. `>` çıktıyı bir dosyaya yönlendirir; başarılı bir şekilde çalıştırılan bir mesaj değildir.

## 4. Küçük bir ham kayıt üretin

Her kaydı inceleyebilmeniz için sadece üç arama yapın:

```bash
./build/timing_lab sleep 3 50 results/sleep.csv
```

Tartışmalar uyku modu, üç arama, 50 ms hedef süresi ve CSV varış noktası anlamına gelir. Program PID / TID'ini terminale yazdırır. Ana ipliğini kullanır, bu nedenle bu tanımlayıcılar eşleşir.

Herhangi bir şeyi hesaplamadan önce dosyayı kontrol edin:

```bash
head -n 1 results/sleep.csv
wc -l results/sleep.csv
```

`head -n 1` başlığı basar. Bu:

```text
timestamp_ns,thread_cpu_ns,seq,tid,event
```

`wc -l`, **16 satırlarını saymalıdır **: üç aramanın her biri için bir başlık ve beş kayıt.

Başlık seçin ve 1'yi arayın:

```bash
awk -F, 'NR == 1 || $3 == 1' results/sleep.csv
```

`-F,` alan ayırıcı olarak virgül yapar. `$3` üçüncü alandır, `seq`. `NR` giriş satırı numarasıdır. `||` "veya" anlamına gelir, bu nedenle komut başlığı veya sırası 1 olan bir satırı basar. Bu komutta mümkün olan zaman damgası aritmetiği yoktur. Bu oluşturulan alanlar, bu alan için gömülü bir vir değildir;

Beş olay adı `CYCLE_ENTER`, `BEFORE_CALL`, `WORK_ENTER`, `WORK_EXIT`, `AFTER_CALL`, bu sırayla olmalıdır. Aynı diziliş ve TID'ye sahip olup olmadıklarını kontrol edin.

## 5. Eşleşen işçi giriş ve çıkışını seçin

İki satırı ayrı küçük dosyalarda tutun:

```bash
awk -F, '$3 == 1 && $5 == "WORK_ENTER"' results/sleep.csv > results/enter.csv
awk -F, '$3 == 1 && $5 == "WORK_EXIT"' results/sleep.csv > results/exit.csv
cat results/enter.csv results/exit.csv
```

Burada `&&` her iki koşulun da tutması gerektiği anlamına gelir: sıra 1 **ve** olay adı eşleşmelidir. Bu, bir çağrının sonunun diğerinin başından çıkarılmasını önler. Seçilen her dosya tam olarak bir satır içermelidir. Boşsa veya birden fazla satır içeriyorsa, seçimi durdurun ve düzeltin.

Sütunlarını kabuk değişkenlerine okuyun:

```bash
IFS=, read -r LAB_ENTER_NS LAB_ENTER_CPU_NS LAB_ENTER_SEQ LAB_ENTER_TID LAB_ENTER_EVENT < results/enter.csv
IFS=, read -r LAB_EXIT_NS LAB_EXIT_CPU_NS LAB_EXIT_SEQ LAB_EXIT_TID LAB_EXIT_EVENT < results/exit.csv
```

`read` bir satır okur. `IFS=,` bu komut için virgüldeki satırı böler ve `-r` virgülleri düz olarak tutar. `<` dosyayı girdi olarak sağlar. İlk değişken, geçmiş zaman damgası sütunu 1 alır; ikincisi, CPU zaman damgası sütunu 2 alır. Kalan değişkenler, olayı tutar ve kimlik tutar.

Yüklediğiniz kimlikleri yazdırın:

```bash
printf 'entry: seq=%s tid=%s event=%s\n' "$LAB_ENTER_SEQ" "$LAB_ENTER_TID" "$LAB_ENTER_EVENT"
printf 'exit:  seq=%s tid=%s event=%s\n' "$LAB_EXIT_SEQ" "$LAB_EXIT_TID" "$LAB_EXIT_EVENT"
```

Her iki dizi numarası da 1 olmalı ve her iki TID'nin de eşleşmesi gerekir. Olaylar sırasıyla giriş ve çıkış olmalıdır. Bu kasıtlı olarak tek iplikli, tekrarlayıcı olmayan programda, ihtiyacımız olan çifti tanımlar.

## 6. Geçen zamanı ve CPU zamanını kendiniz hesaplayın

Geçen zaman damgalarını çıkar, sonra CPU zaman damgalarını ayrı ayrı çıkar:

```bash
LAB_WALL_NS=$((LAB_EXIT_NS - LAB_ENTER_NS))
LAB_CPU_NS=$((LAB_EXIT_CPU_NS - LAB_ENTER_CPU_NS))
printf 'elapsed=%s ns, thread CPU=%s ns\n' "$LAB_WALL_NS" "$LAB_CPU_NS"
```

`$((...))` Bash tamsayı aritmetiğidir. Formül **çıkış eksi giriş**, bir seferde bir saat kullanarak. Zaman damgası değerleri çıkarma sırasında tam sayı kalır.

Sunum için, bu farklılıkları milisaniyeye dönüştürün:

```bash
awk -v wall="$LAB_WALL_NS" -v cpu="$LAB_CPU_NS" 'BEGIN { printf "elapsed=%.3f ms, CPU=%.3f ms\n", wall/1000000, cpu/1000000 }'
```

`-v`, hesaplanan farklılıkları awk'a geçirir. `BEGIN`, bir dosyayı okumadan bir kez çalışır. Bir milyona bölünerek nanosaniyeleri milisaniyelere dönüştürür; `%.3f` üç ondalık basamak görüntüler. Çıkarmadan önce büyük mutlak zaman damgalarını yuvarlamak yerine **farkları** dönüştürürüz.

Uyku modu için, geçen süre normalde 20 ms hakkında en az olmalıdır, iş parçacığı CPU süresi ise çok daha küçüktür. Bu sonucu bir PASS etiketinden değil, `sleep_for`'ye yapılan aramadan açıklayın. Saatler ardışık olarak okundu, bu nedenle çok küçük eşleştirilmiş aralıklı tutarsızlıklar mümkündür.

## 7. Farklı bir miktar hesaplayın: giriş aralığı

Şimdi 2'nin girişini arayan geçmiş zaman damgasını seçin:

```bash
awk -F, '$3 == 2 && $5 == "WORK_ENTER" { print $1 }' results/sleep.csv > results/next-enter.ns
read -r LAB_NEXT_ENTER_NS < results/next-enter.ns
LAB_INTERVAL_NS=$((LAB_NEXT_ENTER_NS - LAB_ENTER_NS))
printf 'entry interval=%s ns\n' "$LAB_INTERVAL_NS"
```

`print $1` sadece ilk sütunu çıkarır. Çıkarma şimdi **sonraki giriş eksi önceki giriş**, eksi giriş değil. Genellikle işçinin 20 ms hakkında yaptığı çağrıya rağmen istenen 50 ms periyoduna yakın olacaktır.

Üç çağrı iki bitişik giriş aralığı sağlar. İlk girişle karşılaştırmak için daha önce bir çağrı yoktur.

## 8. Yoğun iş için aynı hesaplamayı tekrarlayın

```bash
./build/timing_lab busy 3 50 results/busy.csv
awk -F, '$3 == 1 && $5 == "WORK_ENTER"' results/busy.csv > results/busy-enter.csv
awk -F, '$3 == 1 && $5 == "WORK_EXIT"' results/busy.csv > results/busy-exit.csv
cat results/busy-enter.csv results/busy-exit.csv
```

Olay seçimi aynıdır; sadece giriş kaydı değişmiştir. Değerleri okumadan önce dizisini/TID çiftini kontrol edin:

```bash
IFS=, read -r LAB_BUSY_ENTER_NS LAB_BUSY_ENTER_CPU_NS LAB_BUSY_SEQ LAB_BUSY_TID LAB_BUSY_EVENT < results/busy-enter.csv
IFS=, read -r LAB_BUSY_EXIT_NS LAB_BUSY_EXIT_CPU_NS LAB_BUSY_END_SEQ LAB_BUSY_END_TID LAB_BUSY_END_EVENT < results/busy-exit.csv
LAB_BUSY_WALL_NS=$((LAB_BUSY_EXIT_NS - LAB_BUSY_ENTER_NS))
LAB_BUSY_CPU_NS=$((LAB_BUSY_EXIT_CPU_NS - LAB_BUSY_ENTER_CPU_NS))
printf 'busy elapsed=%s ns, thread CPU=%s ns\n' "$LAB_BUSY_WALL_NS" "$LAB_BUSY_CPU_NS"
```

Bu farklılıkları uyku sonucuyla karşılaştırın. CPU hizmeti artarken geçen süre benzer kalabilir. Geçen süre ile sınırlanmış yoğun bir döngü hala önyüklenebilir; tam olarak 20 ms CPU hizmetini garanti etmez.

## 9. Çalışmaya uymayan bir süre yapın

```bash
./build/timing_lab sleep 3 10 results/overrun.csv
awk -F, '$3 == 1 && $5 == "WORK_ENTER" { print $1 }' results/overrun.csv > results/overrun-first.ns
awk -F, '$3 == 2 && $5 == "WORK_ENTER" { print $1 }' results/overrun.csv > results/overrun-second.ns
read -r LAB_FIRST_NS < results/overrun-first.ns
read -r LAB_SECOND_NS < results/overrun-second.ns
printf 'overrun entry interval=%s ns\n' "$((LAB_SECOND_NS - LAB_FIRST_NS))"
```

Formül aynı giriş-giriş çıkarmadır. 20 ms uyumak isteyen bir işlev her 10 ms bir döngü bitiremez. `deadline += period` ve `sleep_until` satırlarını yeniden ziyaret edin: Geçmişte zaten bir süre başka bir uyku eklemez. Bu kaynakta hiçbir çağrı atlanmaz.

## Şimdi neleri açıklayabilmen gerekiyor

Her sayının arkasındaki iki kaynak işaretleyiciye ve iki CSV satırına işaret edin. Giriş aralığının, geçen sürenin ve CPU süresinin neden farklı olduğunu açıklayın. Bir seçim satır oluşturmazsa, aritmetik denemeden önce başlığı, olay adını ve diziyi yeniden kontrol edin; Ayarlanmamış bir kabuk değişkeni sıfır zamanın kanıtı değildir.

## İsteğe bağlı: işinizi doğrulayın veya yığını inceleyin

Sadece manuel hesaplamalarınızdan sonra, bu laboratuvarın [analyze.py](../labs/runtime-timing/analyze.py) dosyasını indirin ve arama başına özetini aynı ham dosyayla karşılaştırın:

```bash
python3 analyze.py results/sleep.csv --expected-count 3
```

Dama, kayıt sözleşmesini onaylar ve toplamları bildirir. Yukarıdaki hesaplamaların yerini almaz. [deney kaydı](../labs/runtime-timing/evidence.txt) komutlarınızı, hashlerinizi ve gözlemlerinizi tutabilir. İsteğe bağlı [CMake](../labs/runtime-timing/CMakeLists.txt) ve [BPF dosyaları](../labs/runtime-timing/functions.bt.in) ayrı amaçlara sahiptir; [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](../rehberler/calisma-zamani-gecikmesi.md) izlemeyi kapsar.

Ayrı bir GDB soruşturması için terminalden fırlatılın:

```bash
gdb --args ./build/timing_lab sleep 3 50 results/gdb.csv
```

`(gdb)` isteminde:

```text gdb
set pagination off
break perform_work
run
bt
info threads
info args
up
list
down
finish
disable breakpoints
continue
```

`bt`, işçi  döngüsü  ana göstermelidir. `up` / `down` çerçeveleri seçer, `finish` işçinin dönüşüne çalışır ve kesme noktalarını devre dışı bırakmak çalışma bitişini sağlar. `quit`'yi daha sonra girin. Bu hata ayıklayıcıdan etkilenen zamanlamayı temel çizginizden ayrı tutun.

Depo kökünden `python3 scripts/verify-runtime-lab.py --require-linux` otomatik regresyon kontrollerini çalıştırır. [doğrulama kaydı](../labs/runtime-timing/validation.txt) gerçek araç kapsamını tanımlar; manuel egzersizi bu koşum takımına bağlı kılmaz.

## Kaynaklar

- [C++ taslağı: sabit_clock](https://eel.is/c++draft/time.clock.steady), geçen saat sözleşmesini tanımlar.
- [Linux clock_gettime](https://man7.org/linux/man-pages/man3/clock_gettime.3.html), iş parçacığı CPU zamanını ve saat çözünürlüğünü tanımlar.
- [CMake CXX_STANDARD_REQUIRED](https://cmake.org/cmake/help/latest/prop_tgt/CXX_STANDARD_REQUIRED.html) standart seçimi belgelemektedir.
- [GNU GDB: backtraces](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html) durdurulan çağrı zincirini açıklıyor.

- [GNU Bash kılavuzu: aritmetik genişleme](https://www.gnu.org/software/bash/manual/html_node/Arithmetic-Expansion.html) ve [Bash buildins](https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html) kabuk hesaplamalarını ve `read`'yi belgelemektedir.
