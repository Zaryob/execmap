---
title: "Çekirdek dökümleri (Core Dumps) ve bellek anlık görüntüleri (Snapshots)"
---

# Çekirdek dökümleri (Core Dumps) ve bellek anlık görüntüleri (Snapshots)

Linux'ta bir süreç kural dışı bir durumla karşılaşıp çöktüğünde (`SIGSEGV`, `SIGABRT`, `SIGBUS`, `SIGILL`), çekirdek sürecin o andaki tüm bellek uzayını ve işlemci yazmaçlarını diske yazar. Ortaya çıkan bu dosya, türü `ET_CORE` olan meşru bir ELF dosyasıdır.

Tersine mühendislik ve adli bilişim (forensics) açısından bir Core dökümü; sürecin belleğindeki şifresi çözülmüş dizgileri, enjekte edilmiş kabuk kodlarını (shellcode), kütüphane haritalarını ve çökme anındaki yığın durumunu dondurulmuş bir zaman kapsülü gibi sunar.

## 1. Bir ELF Core Dosyasının İç Mimarisi

Bir `ET_CORE` dosyası, diskteki çalıştırılabilir ikililerden (`ET_EXEC` veya `ET_DYN`) farklı bir yapıya sahiptir:
- Genellikle **Section Header tablosu içermez** (`e_shnum = 0`).
- Yalnızca **`PT_LOAD`** ve **`PT_NOTE`** program segmentlerinden oluşur.

```text
+-------------------------------------------------------+
|              ELF Core Başlığı (e_type = ET_CORE)      |
+-------------------------------------------------------+
|  PT_NOTE Segmenti (Meta Veriler)                      |
|    - NT_PRSTATUS : Yazmaçlar (RIP, RSP, RAX..), PID   |
|    - NT_PRPSINFO : Süreç adı, argümanlar, UID/GID    |
|    - NT_AUXV     : Başlangıçtaki Auxiliary Vector'ler |
|    - NT_FILE     : Eşlenmiş dosya yolları haritası    |
|    - NT_SIGINFO  : Çökmeye yol açan sinyal ayrıntısı  |
+-------------------------------------------------------+
|  PT_LOAD Segment 1 : Yığın Belleği (Stack)           |
+-------------------------------------------------------+
|  PT_LOAD Segment 2 : Heap Belleği                     |
+-------------------------------------------------------+
|  PT_LOAD Segment N : Anonim / RWX Bellek Sayfaları    |
+-------------------------------------------------------+
```

### readelf ile Core Notlarını Okumak
Core dosyasının içindeki meta verileri doğrudan `readelf -n` ile dökebilirsiniz:

```bash
readelf -n ./core
```

Örnek çıktı kesiti:

```text
Displaying notes found in: .note.linuxcore.prstatus
  Owner                Data size        Description
  CORE                 0x00000150       NT_PRSTATUS (prstatus structure)
    info.si_signo: 11 (SIGSEGV), info.si_code: 1, info.si_errno: 0
    cursig: 11, pid: 14209
    registers:
      rax: 0x0000000000000000   rbx: 0x000055d1a2b3c000   rcx: 0x00007f30a1b2c3d4
      rdx: 0x0000000000000001   rsi: 0x00007ffe312b4c50   rdi: 0x00000000deadbeef
      rbp: 0x00007ffe312b4c80   rsp: 0x00007ffe312b4c60   r8 : 0x0000000000000000
      rip: 0x000055d1a2b3c184 (Çökme anındaki instruction adresi!)
```

## 2. GDB ile Post-Mortem (Ölüm Sonrası) Analiz

Bir çökme dökümünü kaynak ikili dosya ile birlikte GDB'ye yükleyerek analiz edin:

```bash
gdb ./ornek ./core
```

GDB oturumu açıldığında en kritik adli analiz komutları:

```bash
# 1. Hangi fonksiyonun hangi satırda çöktüğünü göster (Backtrace)
(gdb) bt full

# 2. İşlemci yazmaçlarının durumunu listele
(gdb) info registers

# 3. Çökme anındaki komutu ve çevresini disasm et
(gdb) x/10i $rip - 15

# 4. Sürecin bellek haritasını dök (mapped files & anon memory)
(gdb) info proc mappings

# 5. Yığın üzerindeki yerel değişkenleri incele
(gdb) info locals
```

## 3. Canlı Bir Sürecin Snapshot'ını Almak (gcore) ve Bellek Ayıklama

Sürecin çökmesini beklemeden, çalışan herhangi bir sürecin (örneğin bellek içi şifresi çözülmüş bir zararlının) tam bellek dökümünü almak için `gcore` kullanılır:

```bash
# PID numarası 4821 olan sürecin bellek snapshot'ını al:
gcore -o snapshot 4821
```

Bu komut süreci sonlandırmaz (`SIGSTOP` ile anlık durdurur, bellek sayfalarını `snapshot.4821` adıyla diske yazar ve `SIGCONT` ile devam ettirir).

### Açılmış Kod Sayfasını Bellekten Ham Dosya Olarak Çıkarmak:
Paketlenmiş kod belleğe açıldıktan sonra GDB aracılığıyla doğrudan o sanal bellek aralığı diske bayt bayt dökülebilir:

```bash
gdb -p $PID --batch --eval-command="dump memory acilmis_kod.bin 0x55d1a2001000 0x55d1a2003000"
```

Oluşan `acilmis_kod.bin` dosyası, diskteki şifreli halinden arındırılmış, doğrudan Ghidra veya IDA içinde decompile edilebilecek saf makine kodunu barındırır.

## 4. İleri Düzey Rekonstrüksiyon: ECFS ve Modern CRIU

Standart bir Linux Core dosyası doğrudan tekrar çalıştırılamaz; çünkü dinamik semboller, GOT bağlantıları ve çalıştırılabilir dosya başlığı eksiktir.

- **ECFS (Extended Core File Snapshot)**: Ryan O'Neill (elfmaster) tarafından geliştirilen bu araştırma projesi, Linux core dökümlerini tersine çevirerek çalışan süreci tekrar bağımsız, çalıştırılabilir bir ELF ikilisine (`ET_EXEC`) dönüştürme fikrini ortaya koymuştur.
- **CRIU (Checkpoint/Restore in Userspace)**: ECFS felsefesinin modern kurumsal karşılığıdır. Çekirdek seviyesindeki `process_vm_readv` ve netlink soketlerini kullanarak tüm süreci dondurur, disk dosyasına çevirir ve başka bir sunucuda milisaniyeler içinde ayağa kaldırır.

## İncelemeyi Derinleştir

Çalışma anındaki performans ve yürütme yollarını donanımsal düzeyde izlemek için [Perf ile yürütme analizi](perf-ile-yurutme.md) konusuna geçin. Çekirdek ve kullanıcı alanı olaylarını sistem çapında gözlemlemek için [eBPF ile olaylar](ebpf-ile-olaylar.md) rehberini inceleyin.

## Kaynaklar

- [core — Linux man-pages (man 5 core)](https://man7.org/linux/man-pages/man5/core.5.html)
- [gcore — Generate a core file of a running program](https://man7.org/linux/man-pages/man1/gcore.1.html)
- [ECFS — Extended Core File Snapshot Architecture (Ryan O'Neill)](https://github.com/elfmaster/ecfs)
- [CRIU — Checkpoint/Restore in Userspace](https://github.com/checkpoint-restore/criu)
- [LIEF — Library to Instrument Executable Formats](https://github.com/lief-project/LIEF)
