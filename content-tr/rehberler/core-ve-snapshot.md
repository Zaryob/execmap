---
title: Core dökümleri ve süreç belleği
description: Bir core dosyasını yazmaçlar, iş parçacıkları, bellek eşlemeleri ve modüller üzerinden okuyun.
---

# Core dökümleri ve süreç belleği

Linux'ta, bazı sinyaller çekirdek dökümü üreten varsayılan bir eyleme sahiptir. Nesil izinlere, boşaltılabilir duruma, kaynak sınırlarına ve `core_pattern` İşleyici. `coredump_filter` ve `MADV_DONTDUMP` bellek kapsama alanını sınırlayın. Bir ELF `ET_CORE` döküm seçili işlem belleği ve iş parçacığı yazmaları gibi notlar içerir; bu mutlaka belleğin tam bir kopyası değildir ([core(5)](https://man7.org/linux/man-pages/man5/core.5.html)).

Ters mühendislik ve adli tıp için, bir çekirdek, şifresi çözülmüş dizeleri, enjekte edilen kabuk kodunu, kütüphane haritalarını ve bir çarpışma anındaki durumu koruyabilir.

## 1. Bir ELF çekirdek dosyası içinde

Bir `ET_CORE` dosyası çalıştırılabilir dosyadan farklıdır (`ET_EXEC` veya `ET_DYN`):

- Çekirdeğin yazdığı bir core dökümünde genellikle **bölüm başlığı tablosu bulunmaz** (`e_shnum = 0`). Bu her üretici için geçerli değildir. Aşağıda ele alınan GDB `gcore` komutu bir bölüm başlığı tablosu yazar. 14 Kasım 2026’da GDB 13.1 ile küçük bir aarch64 sürecinden alınan görüntüde 14 bölüm başlığı vardı: bir `note0` bölümü ve `load` bölümleri. Bölüm başlıklarının yokluğunu bir core dosyasını tanımak için kullanmayın.
- Linux işlem çekirdekleri genellikle bellek aralıkları için **`PT_LOAD`**ve işlem / iş parçacığı bilgileri için**`PT_NOTE`** kullanır; ayrıntılar üreticiye bağlıdır.

```text
+-------------------------------------------------------+
| ELF core header (e_type = ET_CORE)                     |
+-------------------------------------------------------+
| PT_NOTE: metadata                                     |
|   NT_PRSTATUS : Registers (RIP, RSP, RAX...), PID       |
|   NT_PRPSINFO : Process name, arguments, UID/GID       |
|   NT_AUXV     : Initial auxiliary vector              |
|   NT_FILE     : Mapped file information               |
|   NT_SIGINFO  : Signal details                        |
+-------------------------------------------------------+
| PT_LOAD 1: Stack memory                               |
+-------------------------------------------------------+
| PT_LOAD 2: Heap memory                                |
+-------------------------------------------------------+
| PT_LOAD N: Anonymous / RWX memory pages                |
+-------------------------------------------------------+
```

### Readelf ile çekirdek notaları okumak

`readelf -n` ile çekirdek meta verilerini inceleyin:

```bash
readelf -n ./core
```

GNU binutils `readelf -n` not sahiplerini, türlerini ve boyutlarını gösterir; ayrıntılı bir bilgi vermesini beklemeyin `NT_PRSTATUS` register dökümü. Bölümsüz bir çekirdekte, not konumları dosya ofsetleri olarak bildirilir. `eu-readelf -n` elfütillerden daha fazla ayrıntıyı çözebilir; yazmaçlar için aşağıdaki GDB komutlarını kullanın. Linux aarch64 doğrulaması Kasım ayında 7, 2026 hem çekirdek çökme çekirdeği hem de GDB anlık görüntüsü üretti. GDB anlık görüntü arkasını okudu, yazmaç yaptı ve haritalama; anonim bir işaretleyici okunabilirken bir `MADV_DONTDUMP` işaretleyici erişilemezdi. Farklı araçlardan çıkan çıktılar ayrı kalır.

## 2. GDB ile otopsi sonrası analiz

Orijinal çalıştırılabilir dosyasıyla birlikte GDB'ye bir çökme dökümü yükleyin:

```bash
gdb ./ornek ./core
```

GDB oturumunda yararlı adli komutlar şunları içerir:

```text gdb
# 1. Show the crashing function and source line (backtrace)
bt full

# 2. List processor registers
info registers

# 3. Disassemble from the current instruction (portable GDB PC alias)
x/10i $pc

# 4. Display process mappings (files and anonymous memory)
info proc mappings

# 5. Inspect local variables in the stack frame
info locals
```

## 3. Canlı bir süreci gcore ile eşleme

`gcore`'yi kullanarak, seçili bellek durumunu, çökmesini beklemeden erişilebilir bir canlı işlemden kaydetmek için:

```bash
# Take a memory snapshot of process 4821:
gcore -o snapshot 4821
```

Başarılı bir komut `snapshot.4821` oluşturur; GDB hedefe bağlanabilir ve durdurabilir, ardından ayrılabilir. Duraklama zamanlamayı etkiler ve kaynak veya erişim kısıtlamaları başarısızlığa neden olabilir. GDB sürümünün davranışını önceden durdurulmuş bir işlem ve gcore filtre ayarları için kontrol edin.

### Paketlenmemiş kodu ham bayt olarak çıkarmak

Paketlenmiş kod bellekte açıldıktan sonra, ilgili sanal adres aralığını diske atmak için GDB'yi kullanın:

```bash
gdb -p $PID --batch --eval-command="dump memory acilmis_kod.bin 0x55d1a2001000 0x55d1a2003000"
```

Elde edilen dosya, bu aralıktaki ham baytları içerir; bunlar ayrıca veri veya hala paketlenmiş içerik içerebilir. Doğru mimari ve temel adrese sahip bir analiz aracına aktarın. ELF meta verileri otomatik olarak eklenmez.

## 4. Gelişmiş yeniden yapılandırma: ECFS ve CRIU

Standart bir çekirdek, çalıştırılabilir bir çalıştırılabilir veya genel bir kontrol noktası değil, bir analiz girdisidir. Dosya tanımlayıcılarını, soketleri ve harici kaynakları geri yüklemek ek bir çalışma gerektirir.

- **[ECFS](https://github.com/elfmaster/ecfs)** analiz için bölüm, sembol ve yer değiştirme bilgileri ile Linux çekirdek biçimini zenginleştirir. Canlı işlem ve `/proc` verilerine bağlıdır; README ayrıca anlık görüntü yardımcıları ile ilgili sorunları da kaydeder. Çekirdekten çalıştırılabilir yeniden yapılandırma ayrı **[ecfs_exec](https://github.com/elfmaster/ecfs_exec)** araştırma prototipi ile ilişkilidir.
- **[CRIU](https://github.com/checkpoint-restore/criu)**, ECFS'nin tarihsel bir devamı değil, bir Linux işlem kontrol noktası / geri yükleme projesidir. Desteklenen kaynakları, çekirdek özelliklerini, ayrıcalıkları ve kaynak / hedef uyumluluğu kontrol edin. Her işlemin aynı zamanlamayla başka bir sunucuda geri yükleneceğini garanti etmez ([CRIU](https://github.com/checkpoint-restore/criu/blob/criu-dev/README.md)).

## Derinlemesine inceleme

[perf ile yürütme analizi ve donanım izleme](perf-ile-yurutme.md) ile yürütme analizi] okuyun. [eBPF ile çalışma zamanı olaylarını gözlemleme](ebpf-ile-olaylar.md) ile etkinliklere bakın.

## Kaynaklar

- [core Linux adam-sayfaları (5 çekirdeği)](https://man7.org/linux/man-pages/man5/core.5.html)
- [gcore Çalışan bir programın çekirdek dosyasını oluştur](https://man7.org/linux/man-pages/man1/gcore.1.html)
- [ECFS Genişletilmiş Çekirdek Dosyası Snapshot Mimarisi (Ryan O'Neill)](https://github.com/elfmaster/ecfs)
- [CRIU Kullanıcı Alanında Kontrol Noktası/Yeniden Yükleme](https://github.com/checkpoint-restore/criu)
- [LIEF Kütüphaneden Enstrüman Yürütülebilir Formatlara](https://github.com/lief-project/LIEF)
