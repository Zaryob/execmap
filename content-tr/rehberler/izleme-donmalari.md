---
title: İzleme hatalarını ve sistem donmalarını inceleme
description: Yanıt vermeyen sistemden kalan kanıtları koruyup donmayla ilişkili izleme mekanizmasını belirleyin.
---

# İzleme hatalarını ve sistem donmalarını inceleme

Bir makine, izleyici çalışırken tepkisiz hale gelmek bir gözlemdir. Hatalı bir PMU, sonda, sürücü, çekirdek yolu veya uygulama tanımlamaz. Bir neden seçmeden önce kesin yakalama ve kurtarma kanıtlarını koruyun. Bu kılavuz soruşturmayı tanımlar; bilinen bir konak donmasını kasıtlı olarak çoğaltmaz.

## 1. Arıza sınırını açıklayın

Engellenen bir hedefi, yanıt vermeyen bir izleyiciyi, SSH'nin kaybını, duraklamış bir masaüstünü ve çekirdek tarafından bildirilen bir kilitlemeyi ayırt edin. Başka bir CPU, seri konsol veya bağımsız makinenin hala iletişim kurabileceğini kaydedin. Komutu, stderr, zaman penceresi, yeniden başlatma / kurtarma yöntemini, çekirdek oluşturma, CPU mimarisi, izleyici sürümü ve yüklü izleme bileşenlerini koruyun.

[çekirdek watchdog documentation](https://www.kernel.org/doc/html/latest/admin-guide/lockup-watchdogs.html), yumuşak kilitleri sert kilitlerden ayırır ve algılamanın yapılandırmaya bağlı olduğunu açıklar. Bağlantısız bir terminal tek başına ikisini de kuramaz. Bir bekçi köpeği mesajının olmaması, bir çekirdek arızasını dışlamaz.

## 2. Yeniden çalıştırmadan önce kanıtları kurtarın

İyileştikten sonra, systemd'in günlüğü olan bir sistemde bu salt okunur komutları kullanın:

```bash
mkdir -p results/lockup-review
uname -a > results/lockup-review/kernel.txt
journalctl --list-boots > results/lockup-review/boots.txt
journalctl -k -b -1 --no-pager > results/lockup-review/previous-kernel.txt
ls -al /sys/fs/pstore > results/lockup-review/pstore-list.txt
```

`--list-boots`, tutulan botları tanımlar. `-k -b -1`, önceki önyüklemenin çekirdek mesajlarını ister; önyükleme kimliğini olaya karşı kontrol edin. Dergiler, arızadan önce uçucu, erişilemez veya sona erebilir. `/sys/fs/pstore`, desteklenen bir arka uç yapılandırıldığında kalıcı çökme kayıtlarını tutabilir. Boş bir dizin, hiçbir şeyin olmadığının kanıtı değildir. Okunabilir kayıtları orijinalleri silmeden dosyalar olarak koruyun.

Ayrıca mevcut seri konsol, netkonsol, hipervizör veya kdump eserlerini de muhafaza edin. Yerel depolama bir arızadan kurtulamazsa bu kanallar önceden hazırlanmalıdır. Kurtarma ve çökme dökümünün yapılandırılması, ana bilgisayarın operasyonel kurulumuna aittir; bir kullanıcı alanı `timeout`, bir çekirdek kilidinden kurtarmayı garanti edemez.

## 3. Ön ucu toplama arka ucundan ayırın

Bir araç adı mekanizmayı belirtmez. Bir perf komutu donanım PMU olayları, yazılım sayaçları, izleme noktaları veya çağrı zinciri yakalaması isteyebilir. Bir sonda aracı, kullanıcı veya çekirdek sondalarını ve çıktıyı tamponlu taşıma yoluyla kullanabilir. Sembolizasyon ve DWARF gevşemesi, bir olayı kaydetmenin ötesinde ek çalışmalar sunar.

`perf --version`, `bpftrace --version`, `perf list`, tam olay seçimi, frekans, çağrı modu, eklenti kapsamı ve komut çıktısını kaydedin. Varsayılan olarak varsaymak yerine bir sarmalayıcı tarafından basılan herhangi bir etkili yapılandırmayı kaydedin. Desteklenmeyen bir olayı veya izinleri sıfır sayı olarak yorumlamayın.

## 4. Tek kullanımlık test hedefi üzerinde minimum karşılaştırma yapın

Kurtarma işlemi mümkün olduğunda, her karşılaştırma için aynı sonlu genel iş yükünü kullanın. Kendi tamponlu uygulama işaretleyicileriyle başlayın. Tek seferde bir ek mekanizmayı test edin: yığınsız bir yazılım sayacı, bir zamanlayıcı izleme noktası, destekleniyorsa yığınsız bir donanım olayı, bir kullanıcı alanı işlev sondası ve son olarak da çağrı zinciri koleksiyonu. Bunlar, bir arızadan sonra her mekanizmayı çalıştırmak için bir gereklilik değil, bir araştırmanın farklı dallarıdır.

Her adımda, kesin komut, süre, hedef kimlik, başarı / hata durumu, kayıp kayıtları ve hedefin normal olarak tamamlanıp tamamlanmadığını kaydedin. İlk başarısız yapılandırmayı ve en yakın başarılı karşılaştırmasını koruyun. Belirli bir mekanizma zaten bir konak donmasına neden olduysa, bu karşılaştırmayı kurtarma ile izole edilmiş bir hedefe taşıyın; Etkilenen çalışma makinesinde tekrarlamayın.

Başarılı yazılım sayma ile bir donanım-olay hatası karşılaştırmayı daraltır, ancak kusurlu donanım kanıtlamaz. Yığın eklemek, yakalama boyutu ve gevşeme de dahil olmak üzere çeşitli maliyetleri değiştirir. Bir seferde bir mülke karar verin ve bir başkasının sınırı yeniden üretmesi için gereken ham kanıtları saklayın.

## 5. Ölçülebilir bir soruyla devam edin

Sınırlı bir procfs görüntüsü almak için [iş parçacığı sayaçları](../laboratuvarlar/thread-sayaclari.md), giriş ve dönüş ölçümü için [işlev izleme noktaları](../laboratuvarlar/fonksiyon-problari.md), desteklenen bir test sisteminde görev geçişleri için [zamanlayıcı çizelgesi](../laboratuvarlar/zamanlayici-zaman-cizelgesi.md) deneyini kullanın. Her laboratuvar, bağımlılıkları ve bir yetenek kullanılamadığında bunun ne anlama geldiğini belirtir.

Yararlı bir rapor neyin koştuğunu, neyin başarısız olduğunu, neyin yanıt verdiğini, hangi kanıtların hayatta kaldığını ve hangi yorumun hala belirsiz olduğunu söylüyor. Tarihsel üretim anekdotları ve ilgisiz görev adları mevcut başarısızlığın nedenini belirlemez.

## Kaynaklar

- [çekirdek lokavt watchdogs](https://www.kernel.org/doc/html/latest/admin-guide/lockup-watchdogs.html) dedektör davranışını ve bağımlılıklarını tanımlar.
- [gazetectl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html) belgeleri önyükleme ve çekirdek-mesaj seçimi.
- [çekirdek ramops](https://docs.kernel.org/admin-guide/ramoops.html) kalıcı bir çökme-log arka ucunu tanımlar.
- [çekirdek kdump](https://docs.kernel.org/admin-guide/kdump/kdump.html) belgeleri çökme-damping önkoşulları.
