---
title: Bellek izni değişimini gözlemleme
description: Bir sayfanın yazılabilir durumdan çalıştırılabilir duruma geçişini izleyin ve bulguyu yorumlayın.
---

# Bellek izni değişimini gözlemleme

Kod çalıştırmak için bir bellek bölgesi izni verin, sonra sorun: **Herhangi bir kodun gerçekten orada çalıştığını kanıtlayanlar var mı?**

Bu program önce bir sayfayı okunabilir ve yazılabilir hale getirir, bir bayt yazar, ardından okunabilir ve çalıştırılabilir olarak değiştirir. Bu belleği hiçbir zaman bir işlev olarak adlandırmıyor. Amacınız izin değişimini gözlemlemek ve bu gözlemin sınırını açıklamaktır.

## Başlamadan önce

Linux, GCC veya Clang ve `strace` kullanın. Python 3.7 veya daha yenisi, yalnızca 4 adımında isteğe bağlı otomatik haritalama görüntüleyicisi için gereklidir.

Bir ** haritalama**, bir işleme atanan bir dizi sanal adrestir. Burada kullanılan izin mektupları `R` okumak için, `W` yazmak için ve `X` çalıştırmak için. Program `RW`, daha sonra `RX` kullanır; bu haritalamayı aynı anda yazılabilir ve çalıştırılabilir yapmaz.

Bir Linux terminalinde, boş bir çalışma dizini oluşturun:

```bash
mkdir -p ~/execmap-labs/memory-permissions
cd ~/execmap-labs/memory-permissions
```

## 1. Küçük programı kaydet

Bu içerikle `izin.c` adında bir dosya oluşturun:

```c izin.c
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>

int main(void) {
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) return 1;
    size_t size = (size_t)page;

    // 1. Allocate anonymous memory (read/write: RW)
    void *area = mmap(NULL, size, PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (area == MAP_FAILED) { perror("mmap"); return 1; }

    // Write a byte to memory (test RW access)
    ((unsigned char *)area)[0] = 0x90; // NOP byte
    printf("pid=%ld area=%p size=%zu (State: RW)\n", (long)getpid(), area, size);
    fflush(stdout);

    // Wait five seconds to inspect /proc/<pid>/maps
    sleep(5);

    // 2. Change memory permissions to read/execute (RX)
    if (mprotect(area, size, PROT_READ | PROT_EXEC) == -1) {
        perror("mprotect");
        munmap(area, size);
        return 1;
    }
    puts("mprotect changed permissions to RX; no code is executed in this region!");
    fflush(stdout);

    // Wait another five seconds to inspect the mapping change
    sleep(5);

    // 3. Release the mapping
    if (munmap(area, size) == -1) { perror("munmap"); return 1; }
    return 0;
}
```

Çalıştırmadan önce programın üç eylemini izleyin:

1. `mmap` Linux'tan okuma/yazma izinleri olan bir bellek sayfası ister.
2. `mprotect`, aynı sayfayı beş saniye sonra izinleri okumak / uygulamak için değiştirir.
3. `munmap`, sayfayı beş saniye sonra yayınlar.

Sayfa boyutu sistemden gelir. `0x90` bayt sadece veri olarak yazılır; sayfaya çağrı veya atlama yoktur.

## 2. Strace ile inşa edin ve çalıştırın

Terminalde:

```bash
gcc -Wall -Wextra -O0 -g izin.c -o izin
strace -e trace=mmap,mprotect,munmap ./izin
```

`strace`, programın çekirdek'e yaptığı seçilmiş istekleri gösterir. Çalıştırma yaklaşık on saniye sürer, çünkü program kasıtlı olarak iki kez duraklar. Bu terminalde başka bir komut yazmadan önce çıkana kadar bekleyin.

Program kendi PID'sini, `area` adlı adresi ve tahsis boyutunu yazdırır. ** İlgili izin girişlerini bulmak için çalıştırınız** adresi kullanın.

> [!NOTE]
> Kütüphaneler yükleniyor, haritalama çağrıları da üretiyor. İlk `mmap`'nin tahsisinize ait olduğunu varsaymak yerine bu program tarafından basılan `area` adresini takip edin.

## 3. Üç önemli sonucu okuyun

Aşağıdaki şematik bir örnektir, bayt için bayt eşleşmesi gereken çıktı değil:

```text
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fa289c00000
pid=25410 area=0x7fa289c00000 size=4096 (State: RW)
mprotect(0x7fa289c00000, 4096, PROT_READ|PROT_EXEC) = 0
mprotect changed permissions to RX; no code is executed in this region!
munmap(0x7fa289c00000, 4096) = 0
+++ exited with 0 +++
```

Sırayla okuyun. `mmap` yeni adresi döndürür. `mprotect` bu adresi tekrar kullanır ve başarı için 0 döndürür. `munmap` onu serbest bırakır ve ayrıca 0 döndürür.

** Kontrol noktanız:** izin değiştiren aramada kendi `area` adresinizi bulun. Adres, PID ve sayfa boyutu bu illüstrasyondan farklı olabilir.

Bu noktada ana gözlemi tamamladınız: Linux, `RW`'den `RX`'ye bir değişiklik kabul etti. Şimdi kaynağı kontrol edin: hiçbir ifade kontrolü `area`'ye aktarmıyor. Çalıştırma izni olası bir eyleme izin verdi; bu eylemin gerçekleştiğini kaydetmedi.

## 4. İsteğe bağlı: haritalama değişikliğini otomatik olarak izleyin

`/proc/PID/maps` canlı bir işlemin bellek aralıklarını listeler. Bir satır içeren `rw-p` okunabilir/yazılımlıdır; `r-xp` okunabilir/eylemlenebilir. Takip eden `p` Özel bir haritalamayı belirtir.

Beş saniyelik bir duraklama sırasında bir PID kopyalamak için yarış yerine, 2 bittikten sonra **aynı dizinde aşağıdaki bloğu kullanın**. Taze bir `./izin` başlatır, bu adresi okur ve satırı değiştiğinde içeren haritalamayı yazdırır:

```bash
python3 - <<'PY'
from pathlib import Path
import re
import subprocess
import time

with subprocess.Popen(['./izin'], stdout=subprocess.PIPE, text=True) as process:
    first = process.stdout.readline()
    print(first.strip(), flush=True)
    match = re.search(r'area=(0x[0-9a-fA-F]+)', first)
    if not match:
        raise SystemExit('No allocation address was printed; inspect the program error.')
    address = int(match[1], 16)
    previous = None
    while process.poll() is None:
        try:
            lines = Path(f'/proc/{process.pid}/maps').read_text().splitlines()
        except FileNotFoundError:
            break
        for line in lines:
            start, end = line.split()[0].split('-')
            if int(start, 16) <= address < int(end, 16) and line != previous:
                print(line, flush=True)
                previous = line
        time.sleep(0.2)
    process.communicate(timeout=15)
    if process.returncode != 0:
        raise SystemExit(f'Program exited with {process.returncode}; inspect its error.')
PY
```

Normalde `rw-p` ile bir satır, sonra `r-xp` ile bir satır görmelisiniz. Betik adresin *içerde * bir aralıkta olup olmadığını kontrol eder: Linux bitişik haritaları birleştirebilir, bu nedenle aralığın `area`'den tam olarak başlaması gerekmez.

Bu yeni bir kimlik ile ikinci bir çalışmadır. Aynı değişikliği procfs aracılığıyla gösterir; yürütme kanıtı eklemez. İsimsiz bir anonim haritalamadaki boş yol adı normaldir.

## Eğer deney tamamlanmazsa

**`strace` eksik:** Linux dağıtımınızın strace paketini bu adımdan önce yükleyin veya `./izin`'yi ilk önce tek başına çalıştırın. Tek başına çalıştırmak programı kontrol eder, ancak bir syscall izi üretmez.

**`mmap` veya `mprotect` bir hata bildirir:** Bu mesajı saklayın. Bir sistem politikası çalıştırılabilir anonim belleği reddedebilir, örneğin `EPERM` veya `EACCES` ile. Reddedilen bir değişiklik başarılı bir RX gözlemi değildir.

**PID procfs'dan kaybolur:** süreç çıktı. Yeni bir çalıştırmanın yeni bir PID'si vardır; Otomatik görüntüleyici, başlattığı çocuktan alır.

**İlgisiz birçok haritalama vardır:** program tarafından basılan adrese odaklanır, bu sayfadan kopyalanan sabit bir adrese değil.

## Ne tutmak ve ne anlama geldiğini

Yazdırılan adresi, başarılı `mprotect` sonucunu ve adım 4'yi kullandıysanız, haritalama satırlarının önce/sonrasını kaydedin. Bu kayıtların neden bir izin değişikliği oluşturduğunu ancak yürütmeyi oluşturmadığını açıklayın.

Ayrı RW ve RX aşamaları bu haritalama için ** WX** (yazılım xor çalıştır) 'ı göstermektedir: aynı anda yazılabilir ve çalıştırılabilir değildir.

Linux aarch64 doğrulama Kasım 7, 2026 yayınlanan C programının RW  RX değişimini strace ve procfs ile doğruladı. Ayrı bir hizalanmamış adres kontrolü `EINVAL` döndürdü. Bunlar sınırlı doğrulama sonuçlarıdır; laboratuvarı tekrarlarken kendi ortamınızı ve hatalarınızı koruyun.

Gerçek yürütme kanıtı için, [Özel yükleyiciler ve bellekten çalıştırma](../rehberler/ozel-yukleyiciler.md). Örnekleme kısa yürütmeyi kaçırabilir, bu nedenle tek başına bir perf örneğinin yokluğu da icra edilemez. [LD_PRELOAD ile sembol seçimi ve işlevi geçersiz kılma](sembol-secimi.md) ile devam edin.

## Kaynaklar

- [map Linux man-pages (adam 2 mmap)](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [mprotect Linux insan sayfaları (2 mprotect)](https://man7.org/linux/man-pages/man2/mprotect.2.html)
- [proc_pid_maps Linux man-pages (adam 5 proc_pid_maps)](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
