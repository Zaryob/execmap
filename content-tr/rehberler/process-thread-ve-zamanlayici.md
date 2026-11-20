---
title: Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu
description: Görevleri tanıyın, zamanlayıcı sayaçlarını, işlemci yakınlığını ve kaynak baskısını yorumlayın.
---

# Linux’ta süreç, iş parçacığı ve zamanlayıcı durumu

Hata ayıklayıcı veya izleyici eklemeden önce görevi ve gözlem penceresini tanımlayın. Linux bireysel görevleri zamanlar; bir işlem farklı politikalar, yakınlıklar ve bekleme durumlarıyla birkaç konu içerebilir. Süreç çapında kullanım değeri her bir parçacığın gecikme süresini açıklayamaz.

Bu kılavuz, [zamanlama laboratuvarı](../laboratuvarlar/zamanlama-ve-bekleme.md) ve [olay korelasyon laboratuvarı](../laboratuvarlar/olay-akisini-eslestirme.md) genel iş yüklerini kullanır. Hizmet adı, sabit PID veya uygulama çerçevesi gerekmez.

## 1. Kimlikleri ve durumları ayırt edin

Iş parçacığı grubu liderinin TID'si işlem kimliğine eşittir. Ek iş parçacıklarının kendi TID'leri vardır. Bir hata ayıklayıcının iş parçacığı numarası, bir OS iş parçacığı kimliği, bir CPU numarası ve bir iş parçacığı adı farklı tanımlayıcılardır. İsimler kesilebilir veya paylaşılabilir ve benzersiz korelasyon tuşları olarak uygun değildir.

Çalışan bir görev şu anda bir CPU üzerinde çalışır. Çalıştırılabilir bir görev planlandığında çalıştırılabilir. Uykuda veya engellenmiş bir görev bir zamanlayıcı, I/O, senkronizasyon veya başka bir durum bekler. `ps` eyalet `R` covers running/runnable, yani bir anlık görüntü `R` onları ayırt etmez. Devlet `S` Kesilebilir uykuyu belirtir; `D` Kesintisiz uykuyu belirtir. Tek bir durum örneği, geçmiş bir bekleyişin süresini veya nedenini göstermez.

Sentetik bir örnek düşünün: bir görev 0 ms'de dışarı çıkar, 80 ms'de çalıştırılabilir hale gelir ve 83 ms'de çalışır. CPU dışı aralığı 83 ms'dir, yaklaşık 3 ms çalıştırılabilir hale geldikten sonra. Tüm 83 ms'nin planlandığı gibi tedavi edilmesi, bekleme süresi gecikmesini içerir.

## 2. Tam hedef belirlemek

Kendi laboratuvarınızı kurarken `$!`'yi hemen koruyun. Mevcut bir işlem için `pgrep -af timing_lab` adayların yerini belirleyebilir; tam komutu, kullanıcıyı, çalıştırılabilir programı ve başlatma zamanını seçmeden önce inceleyin. İşlem adları tek başına kimlik belirlemez.

`LAB_PID` ile gerçek işlem kimliğine ayarlandı:

```bash
ps -L -p "$LAB_PID" -o pid,tid,comm,stat,psr,pcpu,cls,rtprio,pri,wchan
ls "/proc/$LAB_PID/task"
readlink "/proc/$LAB_PID/exe"
```

`PSR`, izin verilen CPU seti değil, gözlemlenen bir işlemcidir. `%CPU`, aracın zaman tabanına sahip bir kullanım istatistikleridir, gecikme kaydı değildir. `WCHAN`, bir çekirdek bekleme yerini işaret edebilir; izinler, çekirdek yapılandırması veya geçici durum bunu gizleyebilir. Kullanıcı alanı sessiz dil bilgisinin sahibini tanımlamaz.

Bu işlemin görev dizininden gerçek bir `LAB_TID` seçin:

```bash
cat "/proc/$LAB_PID/task/$LAB_TID/status"
cat "/proc/$LAB_PID/task/$LAB_TID/wchan"
cat "/proc/$LAB_PID/task/$LAB_TID/schedstat"
chrt -p "$LAB_TID"
taskset -pc "$LAB_TID"
```

Bunlar gözlemlerdir. Zamanlama politikasını veya afinitesini değiştirmezler. Bir görev komutlar arasında çıkabilir, bu nedenle eksik veriler için sıfırın yerine geçmek yerine hataları saklayın.

## 3. Kümülatif zamanlayıcı sayaçlarını delta olarak okuyun

Per-task `schedstat` üç sayaç ortaya çıkarır: CPU yürütme nanosaniye, runqueue bekleme nanosaniye ve bir timelice sayısı. Bunlar kümülatif değerlerdir. Bir gözlem penceresini tanımlamak için aynı canlı görev için iki anlık görüntü çıkarın. Sadece TID aynı olduğu için farklı görev ömürlerini karşılaştırmayın.

`/proc/sys/kernel/sched_schedstats`'yi mevcut olduğunda okuyun. Çekirdek yapılandırması ve istatistiklerin etkin olup olmadığı yorumlamayı, özellikle de sıfır runqueue-wait değerini etkiler. Engelli veya bilinmeyen koleksiyon sıfır bekleme oluşturmaz. İki uç noktada bayrağı okumak, pencere sırasında başka bir işlemi de dışlayamaz.

[Dağıtım sayacı laboratuvarı](../laboratuvarlar/thread-sayaclari.md) doğrudan dosya okuma, PID/TID başlangıç zamanı kontrolleri, ham örnek tutma ve tamsayı çıkarma öğretir. İsteğe bağlı okuyucusu da sayaç düşüşlerini reddeder ve desteklenmeyen bekleme muhasebesini açıkça bildirir. Başlangıç zamanlarının kene çözünürlüğü vardır ve procfs okumaları atomik değildir; Bu, yarışsız bir işlem kolu değil, sınırlı bir teşhis kontrolüdür.

Bekleme sayaçlarındaki artış, pencerede toplam çalıştırılabilir beklemeyi tanımlar. Bir çağrı başına maksimum süre vermez veya hangi uygulama bildiriminin geciktiğini söylemez. Sıralı etiketli uygulama kayıtları ile daha uzun bir gözlem yapın, ardından soru bireysel geçişler gerektirdiğinde zamanlayıcı olaylarını kullanın.

## 4. Ayrı ayrı yorum politikası ve afinite

`SCHED_OTHER`, zamanlayıcı önceliği sıfır kullanır. Bu, görevin asla çalışmayacağı bir tahmin değil, bir politika kongresidir. `SCHED_RR` ve `SCHED_FIFO` gibi gerçek zamanlı politikalar başka bir öncelik şeması kullanır. `PRI` sütunu, aracın ekran gösterimidir; negatif bir ekran değerini negatif RT önceliği olarak ele almaktan ziyade gerçek politikayı ve önceliği sorgulayın.

Affinity, bir görevi yürütmeye uygun CPU'ları kısıtlar; bunları rezerve etmez. Bir deney için bir CPU seçmeden önce izin verilen seti elde edin. Konular farklı ayarlara sahip olabilir. Mevcut konuları kapsayan işlemler, gelecekteki iş parçacıklarının aynı son nitelikleri koruduğunu kanıtlamaz.

Bir politika veya afinite hipotezini test etmek için, sonlu, tek kullanımlık bir iş yükü başlatın, her görevin başlangıç ayarlarını kaydedin, bir ayarı değiştirin ve eşdeğer pencereleri karşılaştırın. Değiştirdiğiniz herhangi bir işlem için tam restorasyon değerlerini koruyun. Bu kılavuzun tekrarlanabilir temel çizgisi, sıradan politikayı kullanır ve böyle bir değişiklik yapmaz. Öncelik yükseltmek veya farklı bir çekirdek yüklemek, orijinal gecikmenin nedeninin kanıtı değildir.

## 5. Kapsama ile kayıt frekansı ve basınç

Gerçekte var olan CPUFreq politika dizinlerini inceleyin:

```bash
for policy in /sys/devices/system/cpu/cpufreq/policy*; do
    [ -d "$policy" ] || continue
    for field in scaling_driver scaling_governor scaling_min_freq scaling_max_freq scaling_cur_freq; do
        [ ! -r "$policy/$field" ] || { printf '%s: ' "$policy/$field"; cat "$policy/$field"; }
    done
done
cat /proc/pressure/cpu
cat /proc/pressure/io
cat /proc/pressure/memory
vmstat 1 5
```

Bir politika birden fazla CPU'yu kapsayabilir. Frekans alanları genellikle kHz kullanır; `scaling_cur_freq` sürücüye bağımlıdır ve tam bir anlık donanım okuması gerekmez. Aktif `intel_pstate` ile `powersave` etiketi CPU'nun sürekli olarak minimum frekansında çalıştığı anlamına gelmez. İstenen min/maks limitleri termal ve güç kısıtlamalarını kaldırmaz.

PSI, CPU kullanımı değil, çekişme ile ilgili tezgahları ölçer. Kısıtlı afinite veya cgroups, diğer CPU'lar boştayken belirli görevleri bekletebilir. Bu gözlemleri karşılaştırırken aynı pencereyi, CPU setini, cgroup'u ve iş yükünü koruyun. Sistem genelinde ilgisiz pencerelerden gelen ortalamalar nedensellik oluşturamaz.

## 6. Derinliğini incelemeden önce kuyruğu tanımlayın

"queue" gibi bir kelime bir işletim sistemi API'sini tanımlamaz. İlk önce enqueue/dequeue uygulamasını ve kullandığı kimliği inceleyin:

- **Sistem V mesajları** `msgsnd`/`msgrcv` kullanın. `ipcs -q`, mevcut IPC ad alanında görünen kuyrukları listeler. Bilinen bir kuyruk için `msgctl(IPC_STAT)`, `msg_qnum` (mesajlar), `msg_cbytes` (mevcut bayt bayt) ve `msg_qbytes` (bayt sınırı). Say ve kapasite farklı birimlere sahiptir.
- **POSIX mesaj kuyrukları** `mq_send`/`mq_receive` kullanın. `mq_getattr`, `mq_curmsgs`, `mq_maxmsg` ve `mq_msgsize`; monte edilmiş bir `/dev/mqueue`, adlandırılmış kuyrukları ortaya çıkarır. `ipcs -q` bu kuyrukları denetlemez.
- **İşlem içi kuyruklar** uygulama ve senkronizasyonlarına bağlıdır. Etkinlik laboratuvarının vektör kuyruğu, bekleyen öğe sayısı olarak `available - read` kullanır, kuyruk sessizliğini tutarken gözlenir. Sistem V veya POSIX mesaj kuyruğu değildir.
- **Socket tamponları** ayrı taşıma ve muhasebe kurallarına sahiptir. Soket bayt sayısı çerçeveleme bilmeden uygulama mesajı sayısı olarak ele alınamaz.

Anlık bir derinlik, belirli bir öğenin ne kadar beklediği ortaya çıkmaz. Aynı sıra kimliğini enqueue ve dequeue yoluyla taşıyın, her iki zaman damgasını da bilinen bir saat ilişkisiyle kaydedin ve her bir işaretleyicinin operasyondan önce veya sonra olup olmadığını belirtin. Bir dilsiz almadan önce bir işaretleyici de kilit alma süresini içerir. [olay korelasyonu lab](../laboratuvarlar/olay-akisini-eslestirme.md) bu sınırları görünür kılar; makbuz-çıkarma aralığı saf kuyruk ikametinden daha fazlasını içerir.

## Soruşturmaya devam edin

Perf ve BPF yakalama, saat hizalama ve izleme-stabilite kanıtı için [runtime latency guide](calisma-zamani-gecikmesi.md) kullanın. Bir durakta hangi eşzamanlı işlevin ve nesnenin aktif olduğunu belirlemek için [C++ çağrı-zincir hata ayıklama](cpp-cagri-zinciri.md) kullanın.

## Kaynaklar

- [msgctl](https://man7.org/linux/man-pages/man2/msgctl.2.html), Sistem V kuyruk sayısını ve bayt alanlarını tanımlar.
- [mq_getattr](https://man7.org/linux/man-pages/man3/mq_getattr.3.html) POSIX kuyruk özelliklerini tanımlar.

- [Linux proc_pid_task](https://man7.org/linux/man-pages/man5/proc_pid_task.5.html) görev dizinlerini belgelemektedir.
- [Linux proc_pid_stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) durum ve başlangıç zamanı kimlik alanlarını tanımlar.
- [çekirdek zamanlayıcı istatistikleri](https://docs.kernel.org/scheduler/sched-stats.html) kümülatif sayaçları ve görev başına `schedstat` tanımlar.
- [util-linux chrt](https://man7.org/linux/man-pages/man1/chrt.1.html) belge politika sorguları.
- [çekirdek CPUFreq](https://docs.kernel.org/admin-guide/pm/cpufreq.html), [intel_pstate](https://docs.kernel.org/admin-guide/pm/intel_pstate.html), ve [PSI](https://docs.kernel.org/accounting/psi.html) sistem bağlamını tanımlar.
