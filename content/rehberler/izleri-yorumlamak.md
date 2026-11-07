---
title: "Çalışma anı izlerini yorumlamak ve adli bilişim metodolojisi"
---

# Çalışma anı izlerini yorumlamak ve adli bilişim metodolojisi

Tersine mühendislik ve ikili dosya analizinde en tehlikeli yanılgı, elde edilen tek bir veriyi veya araç çıktısını nihai gerçek sanmaktır. `strace` günlüğündeki bir satır, `gdb` içindeki bir yazmaç değeri veya `perf` çıktısındaki bir oran; doğru metodoloji ve bağlamla birleştirilmediğinde analisti yanlış sonuçlara sürükler.

Başarılı bir tersine mühendislik süreci, doğa bilimlerindeki gibi **hipotez kurma, yanlışlanabilirlik (falsifiability) ve bağımsız kaynaklarla doğrulama** ilkelerine dayanmalıdır.

## 1. Temel Analiz Yanılgıları ve Tuzaklar

Analistlerin en sık düştüğü bilişsel ve metodolojik hatalar:

```text
+-----------------------------------+---------------------------------------------------------+
| Yaygın Yanılgı                    | Teknik Gerçeklik                                        |
+-----------------------------------+---------------------------------------------------------+
| "mprotect ile bir bellek RX oldu, | Bellek sayfasının çalıştırılabilir izne geçmesi, orada |
|  demek ki burada kod çalıştırıldı"| kesinlikle kod yürütüldüğünü kanıtlamaz. Kodun o adrese |
|                                   | sıçradığı (EIP/RIP) bağımsız olarak doğrulanmalıdır.    |
+-----------------------------------+---------------------------------------------------------+
| "perf kaydında bu fonksiyona ait  | Örnekleme tabanlı bir araç (sampling), çok kısa süren   |
|  hiç örnek yok, demek ki çağrılmadı" veya nadir tetiklenen kod yollarını ıskalayabilir.     |
|                                   | Yokluk kanıtı, kanıtın yokluğu değildir.               |
+-----------------------------------+---------------------------------------------------------+
| "İkili dosyada '/bin/sh' dizesi   | Dizenin ikili içinde bulunması çağrıldığı anlamına       |
|  var, demek ki kabuk açıyor"      | gelmez. Ölü bir veri bloğu veya analizciyi yanıltmak   |
|                                   | için yerleştirilmiş sahte bir tuzak (decoy) olabilir.   |
+-----------------------------------+---------------------------------------------------------+
```

## 2. Çoklu Telemetri Korelasyonu (Cross-Correlation)

Güvenilir bir bulguya ulaşmak için tek bir araca değil, en az iki farklı katmandan gelen bağımsız telemetrinin kesişimine bakılmalıdır:

```text
               +----------------------------------+
               |        Hipotez: Süreç           |
               |   Bellek İçi Kod Yürütüyor      |
               +----------------------------------+
                                |
        +-----------------------+-----------------------+
        |                                               |
        v                                               v
[Statik / Bellek Analizi]                     [Dinamik Olay İzleme]
/proc/<pid>/maps'te dosyaya dayanmayan        eBPF ile mmap/mprotect
anonim bir 'r-xp' sayfası bulundu mu?         olayları yakalandı mı?
        |                                               |
        +-----------------------+-----------------------+
                                |
                                v
               [Donanımsal Yürütme Kanıtı]
               Intel PT veya perf örneği, RIP'in
               gerçekten o sayfaya sıçradığını
               kaydetti mi?
                                |
                                v
                      [KESİNLEŞMİŞ KANIT]
```

## 3. Adli Bilişim Metodolojisi: Adım Adım Analiz Protokolü

Bir ikili dosya incelenirken takip edilmesi gereken standart protokol:

### Adım 1: İzole Edilmiş Temiz Ortam
Analiz her zaman ağ bağlantısı kesilmiş, anlık görüntüsü (snapshot) alınmış temiz bir sanal makinede veya konteynerde yürütülmelidir.

### Adım 2: Statik Envanter ve Sağlama Toplamı (Hashing)
Dosyanın SHA-256 özeti alınarak kimliği sabitlenir. ELF başlığı, segmentler, mimari ve dış bağımlılıklar çıkarılır:
```bash
sha256sum ./supheli_ikili
readelf -h -lW ./supheli_ikili
```

### Adım 3: Pasif Dinamik Gözlem (Çekirdek Düzeyi)
Süreci durdurup kancalamadan, çekirdek düzeyindeki araçlarla (`bpftrace`, `perf`) ilk çalıştırma davranışı izlenir:
- Hangi sistem çağrılarını yapıyor?
- Dosya sisteminde nereye yazıyor?
- Ağ soketi açmaya çalışıyor mu?

### Adım 4: Aktif Hata Ayıklama ve Hipotez Doğrulama
Pasif gözlemde şüpheli bulunan fonksiyonlar ve bellek adresleri GDB ile hedeflenir. Kesme noktaları konularak parametreler ve dönüş değerleri adım adım incelenir.

### Adım 5: Bulguların Raporlanması
Ulaşılan her iddia (örneğin "bu ikili dosya bellek enjeksiyonu yapmaktadır"), sistem günlüğü, bellek adresi ve komut çıktısıyla desteklenerek belgelenir.

## İncelemeyi Derinleştir

Bu metodolojinin ilk adımını C kodu ve `mprotect` sistem çağrısıyla sınamak için [Bellek izinleri laboratuvarı](../laboratuvarlar/bellek-izinleri.md) sayfasına dönün. Derleyici optimizasyonlarının analiz üzerindeki yanıltıcı etkisini görmek için [Derleme farkları laboratuvarı](../laboratuvarlar/derleme-farklari.md) uygulamasını tamamlayın.

## Kaynaklar

- [Brendan Gregg: Systems Performance: Enterprise and the Cloud](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)
- [Linux man-pages: proc_pid_status](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [The Science of Binary Analysis (CMU SEI)](https://insights.sei.cmu.edu/blog/binary-analysis/)
- [NIST Special Publication 800-86: Guide to Integrating Forensic Techniques into Incident Response](https://csrc.nist.gov/publications/detail/sp/800-86/final)
