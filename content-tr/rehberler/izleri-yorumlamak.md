---
title: Çalışma zamanı izlerini yorumlama
description: Gözlemi hipotez ve kanıtla ilişkilendirin. Zaman, görev kimliği ve eksik kayıtları hesaba katın.
---

# Çalışma zamanı izlerini yorumlama

İkili analizde tehlikeli bir hata, tek bir gözlem veya araç çıktısını nihai gerçek olarak ele almaktır. `strace` günlüğündeki bir satır, `gdb`'deki bir yazmaç değeri veya `perf`'deki bir yüzde, bağlam ve ses yöntemi olmadan yanlış sonuca yol açabilir.

Ters mühendislik, **hipotez oluşumu, yanlışlanabilirlik ve bağımsız doğrulama ** ilkelerinden yararlanır.

## 1. Ortak analitik tuzaklar

Bu metodolojik hatalara dikkat edin:

- ** "mprotect bölgeyi RX yaptı, bu yüzden kod orada çalıştı."** Çalıştırma izni bir yürütme kaydı değildir. Bu adrese kontrol transferi ayrı olarak doğrulanmalıdır.
- ** "Perf örneği yok, bu yüzden işlev çağrılmadı."** Örnekleme kısa veya nadir infazı kaçırabilir. Kanıt yokluğu, yokluğun kanıtı değildir.
- **"İkili `/bin/sh` içerir, bu yüzden bir kabuk başlatır."** Bir dize ölü veri veya bir yem olabilir. Tüketen kod yolunu ve gerçek aramayı doğrulayın.

## 2. Birden fazla telemetri kaynağının bozulması

Güvenilir bir bulgu için, en az iki katmandan bağımsız gözlemler arasında anlaşma arayın:

```text
+----------------------------------+
              | Hypothesis: the process executes |
              | code created in memory           |
              +----------------------------------+
                               |
        +----------------------+----------------------+
        |                                             |
        v                                             v
[Static / memory analysis]                 [Dynamic event observation]
Is an anonymous executable                Were mmap/mprotect events
mapping visible in /proc/<pid>/maps?       recorded with eBPF?
        |                                             |
        +----------------------+----------------------+
                               |
                               v
                [Hardware execution evidence]
                Did Intel PT or a perf sample
                record RIP in the relevant page?
                               |
                               v
                [A finding with a defined scope]
```

## 3. Adım adım adli iş akışı

Aşağıdaki analiz protokolünü kullanın:

### Adım 1: temiz, izole bir ortam

Güvenilir olmayan ikilileri, uygun bir izolasyon politikası, gerektiğinde bağlantısız ağ ve kaydedilmiş bir temel veya anlık görüntü ile temiz bir sanal makine veya konteynerde analiz edin.

### Adım 2: statik envanter ve hash

Kimlik oluşturmak için dosyanın SHA-256 hash'ini kaydedin. ELF başlığını, segmentlerini, mimarisini ve harici bağımlılıklarını çıkarın:

```bash
sha256sum ./supheli_ikili
readelf -h -lW ./supheli_ikili
```

### Adım 3: çekirdek düzeyinde gözlem

İlk gözlemler için `bpftrace` ve `perf` kullanın. Kayıt sonda tipleri, örnekleme ve kayıp limitleri ve gözlem maliyeti. Bir uprobe'un hedef talimata bir kesme noktası ekleme olasılığı için hesap:

- Hangi sistem çağrıları gerçekleşir?
- İşlem dosya sisteminde nerede yazıyor?
- Ağ soketlerini açmaya mı çalışıyor?

### Adım 4: aktif hata ayıklama ve hipotez testi

GDB ile şüpheli işlevleri ve adresleri hedefleyin. Kesme noktalarını ayarlayın ve parametreleri inceleyin ve değerleri adım adım döndürün.

### Adım 5: raporlama bulguları

Destekleyici günlükler, bellek adresleri ve komut çıkışı ile birlikte "bu ikili bellek enjeksiyonu gerçekleştirir" gibi her iddiayı belgeleyin.

## Derinlemesine inceleme

[Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](calisma-zamani-gecikmesi.md) kullanarak giriş aralıklarını çağrı süresinden ve CPU dışı zamandan, çalıştırılabilir gecikmeden ayırt edin. [Çağrı aralığını, geçen süreyi ve iş parçacığının CPU süresini ölçme](../laboratuvarlar/zamanlama-ve-bekleme.md), bu karşılaştırmaları tekrarlamak için bir iş yükü ve kayıt doğrulayıcı sağlar.

C ve `mprotect` kullanarak bu ayrımları test etmek için [Bellek izni değişimini gözlemleme](../laboratuvarlar/bellek-izinleri.md)'ye geri dönün. Optimizasyonun analizi nasıl yanıltabileceğini görmek için [Derleyici ve optimizasyon düzeyi farklarını inceleme](../laboratuvarlar/derleme-farklari.md)'yi tamamlayın.

## Kaynaklar

- [Brendan Gregg: Sistem Performansı: Kurumsal ve Cloud](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)
- [Linux adam-sayfaları: proc_pid_status](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [NIST Özel Yayın 800-86: Adli Teknikleri Olay Yanıtına Entegre Etme Rehberi](https://csrc.nist.gov/pubs/sp/800/86/final)
