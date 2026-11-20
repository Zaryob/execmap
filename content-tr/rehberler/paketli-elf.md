---
title: Paketlenmiş ve şifrelenmiş ELF dosyalarını inceleme
description: Paketleme belirtilerini tanıyın ve bellekten çıkarılan kodu yorumlayın.
---

# Paketlenmiş ve şifrelenmiş ELF dosyalarını inceleme

> [!WARNING]
> Bu sayfadaki adımlar hedefi çalıştırır: GDB'deki `run` başlatır, bpftrace komutu köke ihtiyaç duyar ve paketlenmiş kodu açar. Yalnızca derleyip paketlediğiniz programlara uygulayın. Dosyalarınıza veya ağınıza erişmeden, atabileceğiniz izole bir sanal makinenin içine inşa edemediğiniz herhangi bir örneği ele alın; Bir konteyner ana çekirdeği paylaşır ve bu sınır değildir.

Paketleyiciler ve şifreleyiciler, bir programın orijinal kodunu sıkıştırılmış veya şifrelenmiş formda depolar ve çalışma zamanında hafızaya yerleştirir. Başlangıçta çalıştırılabilir boyutu azaltmakla ilişkili olarak, UPX'te olduğu gibi, bu teknikler tersine mühendisliği karmaşıklaştırmak, statik antivirüs imzalarından kaçınmak ve fikri mülkiyeti korumak için de kullanılır.

Statik denetim, açma koçanını, veri düzenini ve olası açma mekanizmasını ortaya çıkarabilir. Bellek içi analiz de gerekli olabilir. Her numunenin bir anda tamamen açıldığını varsaymayın.

## 1. Ambalajlama göstergeleri

Eksik bir bölüm tablosu, birkaç dinamik sembol, açma desenleri ve yüksek bayt entropisi birlikte değerlendirmek için  uçlarıdır. Her biri sıradan ikililerde de oluşabilir. `UPX0` gibi UPX PE bölüm adlarını tüm ELF dosyalarına uygulamayın; [UPX'in ELF uygulaması](https://github.com/upx/upx/tree/devel/src)'yi inceleyin.

### A. Shannon entropisi

Byte-histogram entropisi aşağıdakilerden oluşur: 0 için 8 bit bölü bayt. Yüksek bir değer sıkıştırma veya şifreleme hipotezini destekleyebilir, ancak evrensel bir eşik 7.2 tanılama garantisi değildir. Deterministik diziyi tekrarlamak `00..ff` verir 8. Tek baytlı XOR sadece histogram kutularını yeniden etiketler ve entropiyi değiştirmez. Seçilen bölgeyi, örnek büyüklüğü ve hesaplamayı kaydedin.

### B. Dinamik semboller

Çok az ithalat paketlemeyi gösterebilir, ancak statik bağlantı veya küçük bir program aynı görünümü üretebilir. Raw `syscall` talimatlarının `.dynsym` girişine sahip olması gerekmez.

### C. Filesiz / Memsiz

`p_memsz > p_filesz`, `.bss` için normaldir. Bir paketçi, varış yerini daha sonra `mmap` ile tahsis edebilir; büyük bir fark, paketlemenin ne gerekli ne de yeterli kanıtıdır.

## 2. Açma döngüleri ve orijinal giriş noktası

Bazı paketleyiciler bu şablonu izler, ancak sahnelenmiş paket açma, mevcut RX / RWX bölgeleri ve diğer izin politikaları mümkündür:

```text
[Stub starts]
      |
      v
[Allocate memory] (mmap or an existing segment)
      |
      v
[Decrypt / decompress] (XOR / LZMA / aPLib)
      |
      v
[Adjust permissions] (mprotect: RW -> RX)
      |
      v
[Tail jump] -----> jmp *%rax / push %rax; ret
                          |
                          v
                [OEP: original program starts]
```

Bir soruşturma, paketin orijinal programa paketlenmesinden **kuyruk atlama** isteyebilir. Bu kalıpta, koçan beklenen yazmaç durumunu geri yükler ve orijinal giriş noktasına (OEP) atlar.

## 3. GDB ile bir OEP adayı bulmak

Aşağıdaki teknikler paketlenmiş bir dosyayı araştırmaya yardımcı olabilir.

### Yöntem A: izin geçişlerini denetlemek

RWRX, eş zamanlı yazma ve yürütme izinlerinden kaçınarak temel WX'i korur. Daha sıkı ekscm/W!X politikaları da bu geçişi yasaklayabilir. Her paketleyicinin böyle bir geçişe ihtiyacı yoktur.

Bunlar **Linux x86-64 GDB adımları** OEP kurtarmasını garanti etmez ve bu revizyon sırasında paketlenmiş bir fikstüre karşı çalıştırılmaz:

```text gdb
catch syscall mprotect
run
# At the GDB “call to syscall” entry stop:
set $region = $rdi
set $length = $rsi
set $protection = $rdx
continue
# At the “returned from syscall” exit stop:
p/d (long)$rax
```

Çok iş parçacıklı işlemlerde, giriş ve çıkışları iplikle ilişkilendirin. Başarılı bir dönüşten sonra, haritalama ve sökme kullanarak kaydedilen aralığı inceleyin, ardından gerçek kontrol-transfer hedefini belirleyin. `finish` Geçerli işlevden dönene kadar çalışır; bir syscall-çıkış komutu değildir. `$region` sayfa adresidir, OEP'nin olması gerekmez. Sadece doğrulanmış bir aday talimatında bir kesme noktası ayarlayın ve bilinen bir paketlenmemiş programla karşılaştırın ([GDB yakalama noktaları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Catchpoints.html)).

### Yöntem B: eBPF ile paket açmanın gözlemlenmesi

Bir programın hata ayıklama karşıtı kontrolleri varsa, `mprotect` çağrılarını, PID'yi ve bellek adresini yakalamak için çekirdek düzeyinde eBPF gözlemini kullanın:

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_mprotect /comm == "paketli_ornek"/ {
    printf("mprotect: addr=0x%lx len=%lu prot=0x%x\n", args.start, args.len, args.prot);
}'
```

`args.start`, bpftrace 0.19.0 veya daha sonrasını gerektirir; eski sürümler `args->start`, `args->len` ve `args->prot`'ye ihtiyaç duyar. Versiyon kontrolü ve alan listesi için [eBPF ile çalışma zamanı olaylarını gözlemleme](ebpf-ile-olaylar.md) bölümüne bakın.

## 4. Damping belleği

İlgili aralıkları bilinen bir açma noktasında kaydedin. Sahnelenmiş açma ile tüm kodlar mevcut olmayabilir; çekirdek kapsama alanı ayrıca filtrelere ve izinlere bağlıdır:

```text gdb
# 1. Generate a core inside GDB (check coverage):
gcore acilmis_program.dump

# 2. Or save only the unpacked code page as raw bytes:
dump memory acilmis_kod.bin 0x401000 0x405000
```

Ham döküm bir ELF dosyası değildir. Mimarisini, temel adresini ve aralık meta verilerini kullanarak içe aktarın. Eksik sayfalar ve çalışma zamanı yer değiştirmeleri, çalıştırılabilir bir dosyanın yeniden oluşturulmasını daha da zorlaştırmaktadır.

## Derinlemesine inceleme

[Core dökümleri ve süreç belleği](core-ve-snapshot.md) bellek dökümleri ve modül bilgilerini analiz etmek için. [perf ile yürütme analizi ve donanım izleme](perf-ile-yurutme.md) ile devam edin CPU yollarını profillemek için.

## Kaynaklar

- [UPX: eXecutables](https://upx.github.io/) için Ultimate Packer
- [UPX Kurtarma Aracı Nozomi Ağları (GitHub)](https://github.com/NozomiNetworks/upx-recovery-tool)
- [Ghidra resmi proje ve dokümantasyon](https://github.com/NationalSecurityAgency/ghidra)
- [UPX kaynak kodu](https://github.com/upx/upx)


## Sınırlandırılmış OEP doğrulaması

8 Kasım 2026’da özgün hâli bilinen statik bir AArch64 ET_EXEC test dosyası UPX 5.3.0 ile paketlenip Linux 6.12.76 üzerinde çalıştırıldı. GDB’de çalışan süreç, paketleyici kodunun girişinden (`0x4dcdc4`) başlatıldığında özgün ELF girişindeki (`0x400580`) donanım kesme noktasına ulaştı. İlk 32 bayt özgün dosyayla eşleşti, normal yürütme `main` işlevine ulaştı ve UPX ile açıldığında özgün SHA-256 değeri elde edildi. Bu karşılaştırma özgün dosyanın bilindiği bir örnektir. Otomatik bir OEP bulma yöntemi değildir ve yukarıdaki x86-64 sistem çağrısı yazmaçlarıyla yapılan işlemi, Intel PT’yi veya diğer paketleyicileri doğrulamaz.
