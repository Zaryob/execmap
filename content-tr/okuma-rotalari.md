---
title: Okuma rotaları
description: Dosya yapısından çekirdek bellek eşlemelerine, tersine mühendisliğe ve donanım düzeyinde izlemeye ilerleyin.
---

# Okuma rotaları

`execmap`, bir ikili dosyanın bayt düzeninden başlayıp çekirdeğin bellek eşlemelerine, tersine mühendisliğe ve çalışma zamanında donanım olaylarını gözlemlemeye uzanan bir çalışma dizisi sunar.

Deneyiminize ve ilgi alanınıza göre üç ana rotadan birini seçin. Çalışma zamanı performansını perf ve bpftrace ile incelemeye yeni başlıyorsanız doğrudan [başlangıç rotasına](#beginner-track-perf-and-bpftrace-from-zero) geçin.

## Hazırlık — C’den assembly’ye

C’de işlevleri ve işaretçileri biliyor, makine kodunu okumaya yeni başlıyorsanız buradan ilerleyin. Deneylerin tümü Linux x86-64 ve System V AMD64 ABI’yi temel alır.

1. **[x86-64 assembly okumaya hazırlık](rehberler/assembly-okuma.md)** ile yazmaç genişliklerini, Intel ve AT&T sözdizimlerini, adres hesaplamayı, yığını ve argüman aktarımını öğrenin. `lea` komutunun bellek okumasından, işaretçi boyutunun da bellek erişiminin genişliğinden nasıl ayrıldığını açıklayın.
2. **[GDB ile ilk inceleme](laboratuvarlar/gdb-ilk-inceleme.md)** sırasında tam işlev girişinde durun ve işaretçi üzerinden belleğe yapılan yazmayı izleyin. Değerin 7’den 12’ye çıkmasını ve bir argüman değişince sonucun neden 16 olduğunu açıklayın.
3. **[Dallanma ve işaretçiler](laboratuvarlar/dallanma-ve-pointer.md)** laboratuvarında `-O0` ve `-O2` ile üretilen kodun veri akışını izleme noktalarıyla inceleyin. 2001 geçerli girdide sonuçların eşitliğini sınayın ve kaynak koddaki `if` ifadesinin neden her zaman bir `jcc` komutuna dönüşmediğini açıklayın.

Çalışma dizisi, [mytechnotalent/Reverse-Engineering](https://github.com/mytechnotalent/Reverse-Engineering#x64-course) derslerinin küçük programlarla ilerleme yönteminden yararlanır. Execmap deneyleri özgündür. Teknik kurallar için Intel, psABI, GCC ve GDB belgeleri temel alınır. [Kaynak kütüphanesinin ilgili bölümünde](kaynak-kutuphanesi.md#7-assembly-and-reverse-engineering-preparation) her kaynağın kapsamı açıklanır. Buradan Rota 02’ye geçebilir veya dosya ile bellek arasındaki ilişkiyi incelemek için Rota 01’i seçebilirsiniz.

---

## Başlangıç rotası — Sıfırdan perf ve bpftrace

Daha önce bir programı profillemediyseniz veya izlemediyseniz Rota 03’ten önce bu dört adımı tamamlayın. Her rehberin yanında, beklenen sonucu kaynak kodundan çıkarabileceğiniz bir laboratuvar var. Böylece aracın doğru ölçüm yapıp yapmadığını sınayabilirsiniz.

1. **[Çalışma zamanı performans analizine giriş](rehberler/performans-analizine-giris.md)** ile temel kavramları, CPU’da çalışma ve CPU dışında bekleme ayrımını, inceleme yöntemini ve araçların kurulum ve izin gereksinimlerini öğrenin. `time` çıktısından hareketle hangi araç grubuna başvuracağınızı belirleyin.
2. **[perf ile yürütme analizi](rehberler/perf-ile-yurutme.md)** rehberini ve **[CPU profilleme laboratuvarını](laboratuvarlar/cpu-profili.md)** tamamlayın. `perf stat`, `perf record`, işlevin kendi maliyeti ile alt çağrılarının maliyeti, alev grafikleri ve `perf annotate` üzerinde çalışın. Darboğazı bağımsız bir ölçümle doğrulayın ve düzeltmenin etkisini ölçün.
3. **[Sıfırdan bpftrace](rehberler/bpftrace-temelleri.md)** rehberini okuyup **[ilk bpftrace laboratuvarına](laboratuvarlar/bpftrace-ilk-adimlar.md)** geçin. İzleme noktaları, filtreler, haritalar, histogramlar, süreler ve çağrı yığınlarıyla çalışın. Yazdırdığınız her sayacı kaynak kodundan hesapladığınız değerle karşılaştırın.
4. **[Yavaşlayan, takılan ve hata veren programlarda hata ayıklama](rehberler/debug-is-akisi.md)** rehberini okuyup **[CPU dışı gecikme teşhisi laboratuvarını](laboratuvarlar/yavas-program-teshisi.md)** tamamlayın. CPU profilinde görünmeyen üç saniyelik gecikmeyi üç aracın çıktısıyla açıklayın.

Ardından [Rota 03’ün](#route-03-observing-runtime-profiling-and-the-kernel) kalan adımlarına geçin.

---

## Rota 01 — Dosyadan belleğe ELF ve yükleme

İşletim sisteminin ikili dosyaları nasıl okuduğunu, segmentlerle bölümler arasındaki farkı, bağlayıcının yerleşimini ve `main()` öncesi başlangıç adımlarını inceleyin. Sistem programcıları ve düşük seviyeli mekanizmaları merak edenler buradan başlayabilir.

1. **[Dosyadan belleğe ELF](rehberler/elf-dosyadan-bellege.md)** ile dosya, program ve bölüm başlıklarını okuyun ve sanal bellekteki ofsetleri hesaplayın.
2. **[ELF ayrıştırıcılarını ve adres hesaplarını doğrulama](rehberler/elf-parser-ve-adresler.md)** rehberinde ayrıştırıcıları karşılaştırın, segmentleri `pyelftools` ile denetleyin ve aralık taşmalarını inceleyin.
3. **[Bağlayıcı düzenini ve bellek haritalarını okuma](rehberler/linker-duzeni.md)** rehberinde girdi ve çıktı bölümlerini, VMA ve LMA’yı, bağlayıcı betiklerini ve harita dosyalarını inceleyin.
4. **[Program başlangıcı ve auxv](rehberler/baslangic-ve-auxv.md)** rehberinde ilk yığını, `_start` giriş noktasını ve yardımcı vektörü okuyun.
5. **[GOT ve PLT ile dinamik bağlama](rehberler/dinamik-baglama.md)** rehberinde ertelenmiş bağlamayı, yeniden konumlandırma türlerini ve RELRO’yu inceleyin.

> **Uygulama laboratuvarları**
> - [Sembol seçimi ve LD_PRELOAD](laboratuvarlar/sembol-secimi.md)
> - [Hata ayıklama bilgisini ayırma ve yeniden bağlama](laboratuvarlar/debug-bilgisi.md)

---

## Rota 02 — Adlardan davranışa, tersine mühendislik

Sembolleri ayıklanmış ikili dosyaları yorumlayın, sürümler arasındaki mantık değişikliklerini ve güvenlik yamalarını ayırt edin, paketleyicileri ve bellek içi yükleyicileri inceleyin. Bu rota güvenlik araştırmacılarına ve tersine mühendislik yapanlara yöneliktir.

Assembly ve hata ayıklayıcılara yeniyseniz önce yukarıdaki üç hazırlık adımını tamamlayın.

1. **[C++ çağrı zincirini hata ayıklayıcıyla izleme](rehberler/cpp-cagri-zinciri.md)** rehberinde genel üye işlevi çağrılarını ve nesne durumunu inceleyin. Eşzamanlı çağrı yığınını, bir kuyruğa alınarak başka bir iş parçacığına devredilen çağrıdan ayırın.
2. **[Sembolleri ayıklanmış ELF dosyalarını okuma](rehberler/stripped-elf.md)** rehberinde `.eh_frame` CFI kayıtlarından olası işlev sınırlarını ve giriş dizilerini çıkarın.
3. **[İkili dosyaları karşılaştırma](rehberler/ikili-fark-analizi.md)** rehberinde temel bloklar ve çağrı grafiğinin yapısı üzerinden yamaları inceleyin.
4. **[Özel yükleyiciler ve bellek içinden çalıştırma](rehberler/ozel-yukleyiciler.md)** rehberinde `memfd_create` ve kullanıcı alanındaki yükleme mekanizmalarını inceleyin.
5. **[Paketlenmiş ve şifrelenmiş ELF analizi](rehberler/paketli-elf.md)** rehberinde yüksek entropiyi, olası özgün giriş noktalarını (OEP), son atlamaları ve bellek dökümlerini inceleyin.
6. **[Çekirdek dökümleri](rehberler/core-ve-snapshot.md)** rehberinde `ET_CORE` dosyalarını, `NT_PRSTATUS` içindeki yazmaçları ve GDB ile çökme sonrası analizi inceleyin.

> **Uygulama laboratuvarları**
> - [Bellek izinlerindeki değişikliği gözlemleme](laboratuvarlar/bellek-izinleri.md)
> - [Derleyici farklarını ve optimizasyon düzeylerini inceleme](laboratuvarlar/derleme-farklari.md)

Başka bir makinedeki Linux hedefi için [uzak GDB ve IDE kurulumu](rehberler/gdb-uzak-hedef.md) rehberine geçin. CLion veya VS Code’u yapılandırmadan önce çalıştırılabilir dosya ile kaynak kodun eşleştiğini doğrulayın.

---

## Rota 03 — Çalışma zamanını gözlemleme, profilleme ve çekirdek

Çalışan bir süreci etkin ve edilgen yöntemlerle gözlemleyin, analizi zorlaştıran davranışları inceleyin ve iz kayıtlarını topladığınız kanıtlara göre yorumlayın.

1. **[Çalışma zamanı performans analizine giriş](rehberler/performans-analizine-giris.md)** temel kavramları, inceleme yöntemini, araç seçimini, kurulumu ve izinleri kapsar.
2. **[Süreç, iş parçacığı ve zamanlayıcı durumu](rehberler/process-thread-ve-zamanlayici.md)** görev kimliğini, birikimli sayaçları, zamanlama politikasını, CPU yakınlığını, frekansı ve kaynak baskısını belirlemeyi ele alır.
3. **[perf ile yürütme analizi](rehberler/perf-ile-yurutme.md)** `perf stat`, örnekleme, çağrı grafikleri, alev grafikleri ve Intel PT ile işlemci komut akışını yeniden kurmayı kapsar.
4. **[Sıfırdan bpftrace](rehberler/bpftrace-temelleri.md)** izleme noktalarını, filtreleri, yerleşik değerleri, haritaları, histogramları, süreleri ve çağrı yığınlarını açıklar.
5. **[eBPF ile çalışma zamanı olayları](rehberler/ebpf-ile-olaylar.md)** süreç ve çekirdek olaylarını gözlemlemek için uprobe, kprobe ve halka tampon kullanımını gösterir.
6. **[Yavaşlayan, takılan ve hata veren programlarda hata ayıklama](rehberler/debug-is-akisi.md)** perf ve bpftrace ile belirtiden başlayarak teşhis koymayı gösterir.
7. **[Çalışma zamanı gecikmesi ve zamanlayıcıda bekleme](rehberler/calisma-zamani-gecikmesi.md)** aynı iş yükünde çağrı aralıklarını, geçen süreyi, iş parçacığının CPU süresini ve çalışmaya hazır bekleme süresini ayırır.
8. **[Zamanlayıcı zaman çizelgeleri](rehberler/zamanlayici-izleri.md)** uyku ve çalışmaya hazır bekleme aralıklarını yeniden kurmayı, ham olayları incelemeyi ve perf sürüm farklarını hesaba katmayı anlatır.
9. **[İzlemede hatalar ve kilitlenmeler](rehberler/izleme-donmalari.md)** kurtarma için gerekli kanıtların saklanmasını ve soruna yol açan izleme ayarlarının daraltılmasını ele alır.
10. **[Gözlemci etkisi ve hata ayıklamayı engelleme](rehberler/analiz-aracinin-etkisi.md)** `ptrace` kontrollerini, zamanlama etkilerini ve doğrudan sistem çağrılarını inceler.
11. **[Çalışma zamanı izlerini yorumlama](rehberler/izleri-yorumlamak.md)** gözlem, hipotez, kanıt ve ölçüm kaynakları arasında eşleştirme üzerinde durur.

**[Zamanlama ve bekleme laboratuvarında](laboratuvarlar/zamanlama-ve-bekleme.md)** uyuyan ve işlemciyi meşgul eden çalışma biçimlerini karşılaştırın. Çağrı kimliklerini doğrulayın ve deneyi, işin süresinden daha kısa bir periyotla yineleyin. Hangi ölçüm aralığının değiştiğini açıklarken sebebi baştan zamanlayıcıya bağlamayın.

**[Altı noktada olay eşleştirme](laboratuvarlar/olay-akisini-eslestirme.md)** ile bir çağrıyı doğrudan ve kuyruk üzerinden yürütülen adımlar boyunca takip edin. **[İş parçacığı sayaçlarını örnekleme](laboratuvarlar/thread-sayaclari.md)** ile izleme açmadan, belirli bir zaman aralığında görevi ölçün. Uygulama kuyruğundaki beklemeyi çalışmaya hazır beklemeden, okunamayan sayacı da sıfır olarak ölçülen sayaçtan ayırın.

Sonra [işlev izleme noktalarını](laboratuvarlar/fonksiyon-problari.md) yazıp inceleyin. Giriş ve dönüş sayılarını kontrol edin ve ilk eksik girişin hangi aralıkta olduğunu belirleyin. [Zamanlayıcı zaman çizelgesi](laboratuvarlar/zamanlayici-zaman-cizelgesi.md) ile bitirin. perf raporlarını karşılaştırmadan önce görevden çıkış, uyandırma ve göreve geçiş olaylarını elle eşleştirin.

---

## Sonraki adım

Konular arasındaki ilişkileri anlatan yazıları ve ayrıntılı teknik referansları [kaynak kütüphanesinde](kaynak-kutuphanesi.md) bulabilirsiniz.
