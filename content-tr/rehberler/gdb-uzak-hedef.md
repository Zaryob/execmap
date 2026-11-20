---
title: Uzak GDB oturumu ve IDE kurulumu
description: Eşleşen derleme çıktıları ve kaynak yolu eşlemeleriyle CLion veya VS Code üzerinden uzak hedefe bağlanın.
---

# Uzak GDB oturumu ve IDE kurulumu

Uzak bir hata ayıklayıcının iki konumu vardır: Linux hedefi programı ve `gdbserver`'yi çalıştırır; iş istasyonunuz GDB'yi çalıştırır ve sembolleri ve kaynağı okur. Önce komut satırı oturumunun çalışmasını sağlayın. Sonra bir IDE'ye aynı çalıştırılabilir, bağlantı ve yol haritalamalarını verin.

[Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](../laboratuvarlar/zamanlama-ve-bekleme.md) den genel `timing_lab` kullanın. `perform_work` işlevi yararlı bir kesme noktası yapar. Kesme noktası yürütme zamanlamasını değiştirir; Durumu denetlemek ve ilişkileri aramak için bu oturumu kullanın.

## 1. Çalıştırılabilir ve simgeleri bir arada tutun

Hedefte, laboratuvarın hata ayıklama yapısını bitirin ve kimliğini kaydedin:

```bash
file ./build/timing_lab
sha256sum ./build/timing_lab
readelf -n ./build/timing_lab
```

`file` mimari ve çalıştırılabilir türünü bildirir. hash bu tam baytları tanımlar. `readelf -n`, bağlantıcı bir tane verdiğinde bir Build ID görüntüler. Bu çalıştırılabilir dosyayı iş istasyonuna `/local/artifacts/timing_lab` olarak kopyalayın, hata ayıklama bilgilerini saklayın. Her iki makinede de hashleri karşılaştırın. Aynı kaynaktan gelen yerel bir yeniden yapılandırma hala adresler, optimizasyon veya bağlı kütüphanelerde farklılık gösterebilir.

Aşağıdaki tüm `/local/...` yolları, kendi mutlak yollarınızla değiştirilecek yer tutuculardır. Hedefin Linux mimarisini destekleyen bir GDB istemcisi seçin; bir iş istasyonunun yerel hata ayıklayıcısının desteklemesine gerek yoktur. Çalıştırılabilir sürümü üreten kaynak revizyonunu saklayın. Hata ayıklama bilgisi ayrıysa, [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](../laboratuvarlar/debug-bilgisi.md) kullanarak yeniden bağlayın.

## 2. Hedef süreci başlat ve tanımla

Hedef bir Bash terminalinde, sonlu bir iş yükü başlatın ve PID'sini saklayın:

```bash
./build/timing_lab sleep 600 100 results/remote.csv &
LAB_PID=$!
ps -p "$LAB_PID" -o pid,user,lstart,args
readlink "/proc/$LAB_PID/exe"
printf 'target PID: %s\n' "$LAB_PID"
```

`$!`, yeni başlattığınız çocuktur. `ps` ve `readlink`, eklenmeden önce komut ve çalıştırılabilirliği doğrular. İş istasyonu oturumu için gerçek sayısal PID'ye dikkat edin. kabaca bir dakikalık iş yükü çıkışından önce bağlanın veya yeni bir çalışma başlatın ve yeni PID'sini kullanın.

## 3. SSH standart giriş/çıkış üzerinden bağlan

İş istasyonunun hedef kapasiteli GDB'sini başlatın:

```bash
gdb -q /local/artifacts/timing_lab
```

GDB'de, `user@target` ve `PID`'yi SSH hedefiniz ve gerçek sayısal hedef PID'nizle değiştirin:

```text gdb
set pagination off
target remote | ssh -T user@target gdbserver --attach - PID
info files
info threads
break perform_work
continue
bt
info args
info sources
detach
quit
```

SSH `gdbserver`'yi uzaktan başlatır. `-T` bir terminal devre dışı bırakır; gdbserver'ın `-` iletişim argümanı, hata ayıklayıcı protokolünü bir hedef TCP dinleyicisi açmadan standart giriş/çıkış üzerinden taşır. `--attach` mevcut süreci durdurur. Eklenti izin hatası, makinenin küresel frace politikasını değiştirmek için bir neden değil, başarısız bir kurulumdur.

`target remote` zaten alta bağlı olanla bağlantı kurar. `continue` Kırılma noktasına kadar devam eder. `bt` ve `info args` Duran çağrıyı kontrol edin. `detach` programı bitirebilmesi için serbest bırakır; sonra sıradan `target remote` bağlantı kesme. Bir saniye yayınlama `attach` veya `run` bu iş akışında. Ayrı `gdbserver --multi` / `target extended-remote` İş akışı farklı yaşam döngüsü kurallarına sahiptir.

Hedefin orijinal kabuğuna geri dönen `wait "$LAB_PID"`, çocuğun çıkış durumunu toplar. Bu SSH-stdio taşıması [GDB sunucu belgesi](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Server.html)'yi takip eder.

### IDE yapılandırması için alternatif TCP taşıma

Aşağıdaki IDE örnekleri TCP uç noktasını kullanır. Bu varyantı yalnızca mevcut ağ izolasyonu veya zorunlu erişim politikası diğer makinelerin hata ayıklayıcı portuna ulaşmasını engelleyen bir hedef üzerinde kullanın. gdbserver'a bir `127.0.0.1:PORT` argümanı ** taşınabilir bir geri döngü-bağlantı garantisi değildir**: GDB kılavuzu, ana bilgisayar adı kısmının göz ardı edildiğini belirtir. SSH bağlantı noktası yönlendirmesi, hedefin dinleyicisini kısıtlamaz. SSH bağlantı noktası yönlendirmesi, hedefin dinleyicisini kısıtlamaz. Yukarıdaki stdio iş akışı sınırını tercih edin.

Bu izole hedef üzerinde tanımlanmış bir canlı `LAB_PID` için:

```bash
gdbserver --once --attach :2345 "$LAB_PID"
```

`--once`, ilk bağlantıdan sonra dinleme soketini kapatır. İkinci bir hedef terminalde, `ss -ltnp`'yi inceleyin ve kurulum kaydının bir parçası olarak dinleyici ve zorunlu ağ sınırını koruyun. Sunucu yerleşik kimlik doğrulaması olmadan hata ayıklayıcı kontrolü sağlar.

Bir iş istasyonu terminalinde, SSH üzerinden yerel bir geri dönüş portu ileri:

```bash
ssh -N -L 127.0.0.1:2345:127.0.0.1:2345 user@target
```

`-L`, iş istasyonunun yerel bağlantı noktasını hedef bağlantı noktasına iletir; `-N`, bir kabuk başlatmadan tüneli açık tutar. Bu terminalin çalışmasını bırakın. Yerel bir bağlanma hatası, bağlantı noktasının işgal edildiği anlamına gelir; başka bir yerel bağlantı noktası seçin ve hata ayıklayıcıda da kullanın. Bu varyantta, stdio bağlantı komutu yerine `target remote 127.0.0.1:2345` kullanın veya aşağıdaki IDE'yi yapılandırın. Ayrıldıktan sonra, Crl tüneli kapatın.

## 4. Temsil ettikleri yollara göre onarım yolları

GDB bir kaynak dosya adını biliyor ancak açamıyorsa, `info sources` veya `info source`'yi inceleyin. DWARF'da kaydedilen gerçek derleme önekini eşleşen yerel kaynağı içeren dizine haritalayın:

```text gdb
set substitute-path /build/source /local/source
show substitute-path
list perform_work
```

Bu, bir kaynak önekini değiştirir; paylaşılan kütüphaneleri bulamaz. Hedef dosya sisteminin yerel bir kopyasını kullanarak hedef kütüphaneleri incelemek için, aşağıdaki **'yi yapılandırın** bağlanmadan önce, örnek dizinleri değiştirin:

```text gdb
set sysroot /local/target-root
set solib-search-path /local/target-root/lib:/local/target-root/usr/lib
```

`sysroot`, hedefin dosya sistemi düzenini yerel bir kök altında korur. `solib-search-path` ek kütüphane arama dizinleri sağlar; mimariler de çok anarşili kütüphane dizinlerine ihtiyaç duyabilir. İş istasyonunun libc'sinden ziyade hedefle eşleşen kütüphaneler ve semboller kullanın. Bağlantıdan sonra `info sharedlibrary`'yi kontrol edin. Dosya uyumsuzluğu, eksik hata ayıklama bilgileri ve yanlış kaynak haritalaması ayrı sorunlardır.

## 5. KLION'da aynı gerçekleri girin

Uzaktan Hata Ayıklama yapılandırması oluşturun. Hedefi destekleyen bir hata ayıklayıcı seçin, 'hedef uzaktan' args `127.0.0.1:2345`'ye ayarlayın ve Symbol dosyası'u eşleşen yerel çalıştırılabilir dosyaya ayarlayın. Kopyalanmış bir hedef dosya sistemi kullanırken Sysroot'u yapılandırın ve DWARF kaynak öneki için  Path haritalamaları'yı kullanın. Yukarıdaki izole edilmiş TCP kurulumunu kullanın ve tünelini ve gdbuserver'ı çalıştırmadan önce ekli tutun.

CLion'un Uzaktan Hata Ayıklama yapılandırması, eserleri senkronize etmez. Hedef yapıyı değiştirdikten sonra kopya ve kimlik kontrolünü tekrarlayın. Bir kesme noktası çözülmezse, kesme noktası davranışını değiştirmeden önce çalıştırılabilir ve kaynak haritalamasını karşılaştırın. Bu alanlar [CLion Remote Debug documentation](https://www.jetbrains.com/help/clion/remote-debug.html) bölümünde açıklanmıştır.

## 6. VS Kodunun C/C++ hata ayıklayıcısını yapılandırın

Microsoft'un C / C++ uzantısı ve aynı bağlı sunucu ile, bir `launch.json` yapılandırması şunları içerebilir:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "Linux remote worker",
    "type": "cppdbg",
    "request": "launch",
    "program": "/local/artifacts/timing_lab",
    "cwd": "/local/source",
    "MIMode": "gdb",
    "miDebuggerPath": "/absolute/path/to/target-capable-gdb",
    "miDebuggerServerAddress": "127.0.0.1:2345",
    "launchCompleteCommand": "None",
    "sourceFileMap": { "/build/source": "/local/source" }
  }]
}
```

Her örnek yolu değiştirin. Burada `request: launch` uzaktan hata ayıklayıcı bağlantısını başlatır; gdbserver hedefi zaten bağlamıştır. `launchCompleteCommand: None` Varsayılandan kaçınır `exec-run` bu ekli işlem üzerinde. Durdurulan görev ve kırılma noktasını kontrol ettikten sonra açıkça devam edin. `sourceFileMap` harita kaynak yolları; uyumsuz semboller onarılmaz. Kütüphane denetiminiz gerektirdiğinde GDB sysroot kurulum komutları ekleyin. Alan anlamları [C/C++ başlatma referansında belgelenmiştir.](https://code.visualstudio.com/docs/cpp/launch-json-reference).

## Tutmak için kanıt

Hedef ve hata ayıklayıcı sürümlerini, mimarisini, çalıştırılabilir hash/Build ID'sini, kaynak revizyonunu, kütüphane kimliklerini, bağlantı modunu ve kaynak düzeltme haritalamasını kaydedin. Başarılı bir kaynak kesme noktası, bu kurulumun bu yapıyı inceleyebileceğini gösterir; durdurulurken alınan zamanlama ölçümlerini doğrulamaz.

## Kaynaklar

- [GDB uzaktan bağlantıları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Connecting.html) bağlantı ve alt yaşam döngüsü kurallarını tanımlar.
- [GDB kaynak yolları](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Source-Path.html) önek ikamesini açıklar.
- [GDB kitaplığı araması](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Files.html) çalıştırılabilir, sembol ve kütüphane konumlarını ayırt eder.
