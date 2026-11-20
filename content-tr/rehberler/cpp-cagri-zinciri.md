---
title: GDB ile C++ çağrı zincirleri, nesneler ve yazmaçlar
description: Üye işlev çağrılarını, nesne durumunu ve iş parçacığı sınırlarını GDB ile inceleyin.
---

# GDB ile C++ çağrı zincirleri, nesneler ve yazmaçlar

Kaynak düzeyindeki işlemler ambalajlar, adaptörler, sanal gönderim veya bir kuyruktan geçebilir. Zamanın geçtiği yeri açıklamadan önce gerçek çağrı ve iş parçacığı ilişkisini oluşturun. Bu kılavuz genel olarak `Dispatcher` ve `Worker` [Doğrudan ve kuyruklu çağrılarda altı olay sınırını eşleştirme](../laboratuvarlar/olay-akisini-eslestirme.md).

Aşağıdaki komutlar DWARF bilgisi ve `-O0` ile bir Linux hata ayıklama yapısını hedeflemektedir. yazmaçlara özel tartışma, System V AMD64 ABI ile Linux x86-64 ile sınırlıdır. İlk kaynak düzeyinde oturum Linux aarch64 üzerinde de çalışır.

## 1. Gerçek bir üye işlevini durdurun

Laboratuvarın `event_pipeline` çalıştırılabilir dosyasını oluşturun ve sonuç dizini oluşturun, ardından başlatın:

```bash
gdb --args ./build/event_pipeline direct baseline 3 gdb-run results/gdb.csv
```

Bu tam oturumu GDB'de kullanın:

```text gdb
set pagination off
break Worker::process
run
bt
info threads
info args
print seq
print this->completed
up
info args
down
finish
print worker_.completed
disable breakpoints
continue
```

İlk durakta, bekle `Worker::process`, `Dispatcher::dispatch`, ve `main`. `seq` var 1 ve `this->completed` var 0. sonra `finish`, gönderici işçi sayacını aşağıdaki gibi denetleyebilir 1. Bunlar, keyfi bir uygulamanın nesneleri hakkındaki varsayımlardan ziyade, bu küçük programın kasıtlı özellikleridir.

Bu doğrudan çağrı tek bir iş parçacığı kullanır. Laboratuvarın sıralı modunda, kaynak üretici iş parçacığı üzerinde çalışır ve üye çağrı zinciri tüketici iş parçacığı üzerinde çalışır. Üretici yığını tüketici yığınının altında bir arayan çerçeve değildir. Bu iki tarafı çoğaltılmış dizi numarasını kullanarak bağlayın. Eşsiz gözlemlerde farklı bir TID, eşzamanlı bir teslimi kanıtlamaz.

## 2. Doğru adım sınırını seçin

`step` kaynak düzeyinde bir çağrıya girer; `next` bir üzerinde ilerler. `finish` seçilen çerçeve dönene kadar çalışır. `stepi` bir çağrıya dahil olmak üzere bir makine talimatını izler; `nexti` normalde bir çağrının üzerine basar. Sinyaller, diğer kesme noktaları ve optimize edilmiş kod bu işlemleri kesintiye uğratabilir.

Gerçek komutları incelemek için, hedeften gerçek bir adresle `disassemble /r 'Dispatcher::dispatch(unsigned int)'`, `x/10i $pc` ve `info symbol ADDRESS` kullanın. Tam C++ imzaları derlenen sembole bağlıdır; `info functions Dispatcher` bunları keşfetmeye yardımcı olur. GDB dışında, `nm -C build/event_pipeline` okunabilir C++ adlarını ve `nm build/event_pipeline` bağlantı adlarını gösterir. Bir demangle ekran etiketini varsaymayın.

İnlining ve kuyruk arama optimizasyonu beklenen çerçeveleri kaldırabilir veya sunumlarını değiştirebilir. Eksik bir çerçeveyi bozuk bir yığın olarak teşhis etmeden önce eşleşen sembollerle yeniden biçimlendirin ve sökme işlemini inceleyin.

## 3. Seçilen çerçeveye yorum yazar

`frame 0`, `info frame` ve `info registers` ile başlayın. `$pc` ve `$sp` takma adları x86 yazmaç adlarını varsaymaktan kaçınır. x86-64'de `info registers rdi rsi rsp rbp rip` ilgili yazmaç defterlerini gösterir, ancak anlamları mevcut talimata ve ABI'ye bağlıdır.

Statik olmayan bir üye işlevinin bir örtüklüğü vardır `this` Bu laboratuvarda basit bir `Worker::process(unsigned)` Sistem V AMD64 ABI altında giriş, beklenen gelen değerler nesne işaretçisidir `RDI` ve `seq` içinde `ESI`. Bu açıklama tüm C++ imzaları için bir kural değildir: geri dönüş değeri sözleşmeleri, argüman türleri, ambalajlar ve tunks düzeni değiştirebilir.

Prolog bir kaydı yeniden kullandıktan sonra kaynak kesme noktası durabilir. Giriş kayıtlarını test etmek için, ilk olarak [GDB ile ilk inceleme: C’den makine koduna](../laboratuvarlar/gdb-ilk-inceleme.md)'de olduğu gibi, tam işlev girişini çözün ve orada durun. Bir yöntem boyunca geçerli bir işaretçi olarak keyfi bir RSI değerini yarı yarıya yorumlamayın. Türü ve haritalama kurulana kadar belleği okumayın. Dış çerçevelerdeki yazmaçlar, canlı donanımlarını temsil etmekten ziyade gevşeterek yeniden yapılandırılabilir.

## 4. Şüpheli bir üzerine yazma testi

Geçerli bir `Worker::process` durağında, GDB `this` ve nesnenin üyelerini anlar. `print *this`'yi inceleyebilir ve `set $counter = &this->completed` ile karşı adresi kaydedebilirsiniz. Ayrı bir soruşturma `watch -location *$counter`'yi kullanabilir ve yazmaya devam edebilir. Nesneyi canlı tutun ve ömrü sona erdiğinde saat noktasını silin.

Bir saat noktası, hangi komutun izlenen bir değeri değiştirdiğini belirleyebilir. Donanım boyutu / sayım sınırları vardır ve pahalı yazılım adımlarına geri dönebilir. Daha önce bir üzerine yazmayı geriye dönük olarak tanımlamaz. Bu iş yükü kasıtlı olarak hafızayı bozmaz; beklenen artışı bir güvenlik açığı gösterisi değildir.

Gerçek bir hata için, tam ikili korumak ve `bt full`, `info frame`, `info proc mappings` ve `print $_siginfo` sinyal bilgisi mevcut olduğunda incelemek. Hata adresini ve erişim gerçek haritalama ile karşılaştırın. Başarısız bir gevşeme, alışılmadık yazmaç, kanarya arızası ve yığın tükenmesi farklı gözlemlerdir. Bir dezenfektan raporu veya ilgili yazıyı yakalayan bir saat noktası, yabancı bir geri izden daha güçlü kanıtlar sağlar.

## 5. Takma ve uzaktan hata ayıklama ayrı ölçümlerdir

Zaten çalışan bir işlemle, tam çalıştırılabilir ve `gdb ./build/event_pipeline -p "$LAB_PID"` kullanın. `info threads`, iş parçacığı kimliklerini hedeflemek için hata ayıklayıcı numaralarını haritalandırır; `thread apply all bt 15` sınırlandırılmış yığınları toplar. Normal ataşman hedefi durdurur. Devam etmek için `detach` kullanın ve hata ayıklayıcıdan etkilenen zaman damgalarını bir temel çizgiden ayrı tutun.

Uzak bir hedef için çalıştırılabilir/hata ayıklama kimliğini, hedef mimari desteğini ve kaynak-yol haritalamasını koruyun. [Geçen süreyi, CPU süresini ve zamanlayıcı gecikmesini ayırma](calisma-zamani-gecikmesi.md#2-use-gdb-for-identity-and-call-relationships) bir SSH-stdio gdbserver örneği sağlar. `set substitute-path` kaynak aramasını değiştirir; uyumsuz bir çalıştırılabilir dosyayı onaramaz. IDE ön uçları tek başına kimlik ve haritalama gereksinimlerine sahiptir. Amaçlanan işlev ve kaynak satırına bir kesme noktası çözme başarılı bir kontroldür.

Tam hedef/iş istasyonu iş akışı, eşleşen eserler, kaynak ve kütüphane yolları ve CLion/VS Code ayarları için [Uzak GDB oturumu ve IDE kurulumu](gdb-uzak-hedef.md) ile devam edin.

Yan yana üye çağrısı ve C-linkage sarmalayıcısı için [İşlev ABI’leri ve ikili uyumluluk](abi.md#observe-a-c-member-and-a-c-linkage-wrapper).

## Kaynaklar

- [GDB C++ ifadeleri](https://sourceware.org/gdb/current/onlinedocs/gdb.html/C-Plus-Plus-Expressions.html) belge üyesi erişimi ve `this`.
- [GDB backtraces](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Backtrace.html), [makine kodu denetimi](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html), ve [watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html) gözlem sınırlarını açıklar.
- [Sistem V x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), bu hedef için argüman sınıflandırmasını tanımlar.
- [GDB ataşman/detach](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Attach.html) belgeleri durdurma ve bırakma işlemi.
