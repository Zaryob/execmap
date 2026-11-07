---
title: "Paketli ve şifrelenmiş ELF (Packers) analizi"
---

# Paketli ve şifrelenmiş ELF (Packers) analizi

Paketleyiciler (packers) ve kriptörler (crypters), bir ikili dosyanın asıl kodunu sıkıştırarak veya şifreleyerek diske saklayan, çalışma anında ise bu içeriği belleğe açıp yürüten özel yazılımlardır. Başlangıçta dosya boyutunu küçültmek amacıyla (örneğin UPX) geliştirilen bu araçlar; günümüzde tersine mühendisliği zorlaştırmak, statik anti-virüs imzalarını atlatmak ve fikri mülkiyeti korumak için sıkça kullanılır.

Linux dünyasında bu mimarinin kurucu öncüsü, TESO grubu tarafından 2002 yılında yazılan **`Burneye`** projesidir. Burneye; ikiliyi AES/XOR ile şifreleme, doğrudan çekirdek sistem çağrılarıyla anti-debugging yapma ve çalışma anında sayfa izinlerini manipüle ederek OEP'ye atlama kalıbını ilk kez mükemmelleştirmiştir.

Bir analistin paketli bir dosyayı disasm etmeye çalışması zaman kaybıdır; çünkü ekranda görünen kod yalnızca açıcı rutine (unpacking stub) aittir. Asıl program mantığını görebilmek için dosyanın bellekte açıldığı anı (Original Entry Point - OEP) tespit etmek ve programı bellekten dökmek (dumping) gerekir.

## 1. Bir ELF'in Paketli Olduğunu Gösteren Belirtiler

Paketlenmiş bir ikili dosya, statik incelemede şu karakteristik anormallikleri sergiler:

```text
Normal ELF                                         Paketlenmiş ELF
+-------------------------------+                  +-------------------------------+
| Section'lar: .text, .rodata   |                  | Section'lar: Yok ya da UPX0   |
| Düşük/Orta Entropi (~5.5-6.5) |                  | Yüksek Entropi (> 7.5 - Kaos) |
| Onlarca Dinamik Sembol        |                  | Çok Az Sembol (mmap, mprotect)|
| Normal p_filesz == p_memsz    |                  | p_memsz >> p_filesz           |
+-------------------------------+                  +-------------------------------+
```

### A. Yüksek Shannon Entropisi
Sıkıştırılmış veya AES/RC4/XOR ile şifrelenmiş veri blokları yüksek matematiksel rastgelelik sergiler. 8.0 üzerinden 7.2'nin üzerindeki entropi değerleri, segmentin şifreli veya sıkıştırılmış olduğunu neredeyse garantiler.

### B. Aşırı Kısıtlı İçe Aktarım (Import) Tablosu
Karmaşık bir program normalde onlarca libc fonksiyonu kullanır. Ancak paketli bir ikilinin `readelf --dyn-syms` çıktısında yalnızca bellek tahsis fonksiyonları (`mmap`, `mprotect`) veya doğrudan ham sistem çağrıları (`syscall`) görülür.

### C. Aşırı Boyut Farkı (p_memsz >> p_filesz)
Paketleyici stub'ı, açılacak orijinal ikili için bellekte devasa bir alan açar; bu nedenle `LOAD` segmentinin `MemSiz` değeri `FileSiz` değerinin katbekat üstündedir.

## 2. Açılma Döngüsü ve OEP (Original Entry Point)

Tüm paketleyiciler temel bir yaşam döngüsünü takip eder:

```text
[Stub Başlar]
      |
      v
[Bellek Alanı Ayır] (mmap veya mevcut segment)
      |
      v
[Şifreyi Çöz / Sıkıştırmayı Aç] (XOR / LZMA / aPLib)
      |
      v
[İzinleri Düzelt (W^X İhlali)] (mprotect: RW -> RX)
      |
      v
[Kuyruk Atlama (Tail Jump)] -----> jmp *%rax  /  push %rax; ret
                                           |
                                           v
                              [OEP: Orijinal Program Başlar!]
```

Analistin nihai hedefi **Tail Jump** (Kuyruk Atlaması) anını yakalamaktır. Açıcı rutin bittiğinde, işlemci kayıtlarını orijinal programın beklediği ilk duruma getirir ve orijinal giriş noktasına (OEP) uzun bir atlama (`jmp`) yapar.

## 3. GDB ile OEP Tespiti ve Manuel Unpacking

Paketli bir dosyayı GDB ile adım adım çözmek için şu dinamik teknikler kullanılır:

### Yöntem A: mprotect Sistem Çağrısını Yakalamak (W^X Geçişi)
Açıcı rutin kodu belleğe yazarken sayfa yazılabilir (`RW`) durumdadır. Kodu çalıştırmadan hemen önce sayfayı `RX` yapmak zorundadır:

```bash
gdb -q ./paketli_ornek
(gdb) catch syscall mprotect
(gdb) run
# mprotect tetiklendiğinde argümanları incele:
(gdb) info registers $rdi $rsi $rdx
# $rdx == 0x5 ise sayfa PROT_READ | PROT_EXEC oluyordur!
# mprotect tamamlanıp döner dönmez:
(gdb) finish
# Sayfadaki ilk komuta donanımsal kesme koy:
(gdb) hbreak *$rdi
(gdb) continue
```

İşlemci donanımsal kesmeyle durduğunda program OEP noktasındadır.

### Yöntem B: eBPF ile Açılma Anını Dışarıdan İzlemek
Program anti-debugging içeriyorsa, çekirdek seviyesindeki eBPF ile hedef sürecin `mprotect` çağrısını yakalayıp PID ve bellek adresini dökün:

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_mprotect /comm == "paketli_ornek"/ {
    printf("mprotect: addr=0x%lx len=%d prot=0x%x\n", args.start, args.len, args.prot);
}'
```

## 4. Bellekten İkiliyi Dökmek (Memory Dumping)

Program OEP noktasına ulaştığında bellekte tamamen deşifre edilmiş durumdadır. Bu aşamada sürecin bellek görüntüsü diske aktarılır:

```bash
# 1. GDB içinden tam core snapshot almak:
(gdb) gcore acilmis_program.dump

# 2. Veya yalnızca açılmış kod sayfasını ham bayt olarak kaydetmek:
(gdb) dump memory acilmis_kod.bin 0x401000 0x405000
```

Dökülen bu dosya üzerinde `strings`, sembol aramaları ve disassembler analizi, paketleyici engeline takılmaksızın doğrudan orijinal kod üzerinden yürütülebilir.

## İncelemeyi Derinleştir

Bellekten dökülen core dosyalarını analiz etmek ve modül bilgilerini ayrıştırmak için [Core ve snapshot](core-ve-snapshot.md) rehberine geçin. Sürecin çalışma anındaki CPU yürütme yollarını profillemek için [Perf ile yürütme analizi](perf-ile-yurutme.md) konusunu inceleyin.

## Kaynaklar

- [UPX: the Ultimate Packer for eXecutables](https://upx.github.io/)
- [UPX Recovery Tool — Nozomi Networks (GitHub)](https://github.com/NozomiNetworks/upx-recovery-tool)
- [Ghidra: Analyzing packed and obfuscated binaries](https://ghidra-sre.org/)

- [UPX source code](https://github.com/upx/upx)
