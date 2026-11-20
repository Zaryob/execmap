---
title: GDB ile ilk inceleme: C’den makine koduna
description: Bir C programını durdurun, bellekteki değerin değişimini gözleyin ve bir argümanı değiştirin.
---

# GDB ile ilk inceleme: C’den makine koduna

Küçük bir işlevin, girişte aldığı argümanlarla bellekteki bir değeri nasıl değiştirdiğini izleyin. Programı normal biçimde çalıştırınca sonuç **12** olur. Ardından GDB ile bir argümanı değiştirip **16** sonucunu elde edin.

GDB, bir programı durdurup o andaki durumunu incelemenizi sağlayan bir hata ayıklayıcıdır. Bu laboratuvarı tamamlamak için her assembly komutunu anlamanız gerekmez. **Bellekteki değeri hangi komut değiştiriyor?**

## Başlamadan önce

**Linux x86-64**, GCC, GNU binutils ve GDB kullanın. C işlevleri ve işaretçiler hakkında temel bilgi yeterli. Yazmaçları ve yığını [x86-64 assembly okumaya hazırlık](../rehberler/assembly-okuma.md) rehberinde bulabilirsiniz. C programı başka sistemlerde de çalışabilir. Aşağıdaki yazmaç komutları Linux x86-64’e özgüdür.

Bir Linux terminali açın ve ayrı bir çalışma dizini oluşturun. Bir adım açıkça "GDB'nin içinde" demedikçe bu terminale devam edin:

```bash
mkdir -p ~/execmap-labs/first-gdb
cd ~/execmap-labs/first-gdb
uname -sm
gcc --version
gcc -dumpmachine
ld --version
objdump --version
gdb --version
getconf GNU_LIBC_VERSION
```

** Devam etmeden önce kontrol edin:** `uname -sm` Linux ve `x86_64`'yi tanımlamalıdır. Sürüm çıktısını notlarınızla kaydedin. macOS'ta, `gcc` adlı bir komut aslında Clang olabilir; Bu soruşturmayı amaçlanan Linux ortamı içinde çalıştırın.

## 1. Programı oluştur ve çalıştır

Aşağıdaki kaynağı bu dizinde `ilk-inceleme.c` olarak kaydedin:

```c ilk-inceleme.c
#include <stdio.h>

int hesapla(int *hedef, int artis) {
    int onceki = *hedef;
    *hedef = onceki + artis;
    return *hedef;
}

int main(void) {
    int sayi = 7;
    int sonuc = hesapla(&sayi, 5);
    printf("value=%d result=%d\n", sayi, sonuc);
    return 0;
}
```

Ana program başlıyor `sayi` at 7. Bu sayının **adres**'ini ve artışını geçer 5 için `hesapla`. Işlevin içinde, `hedef` sayıyı gösterir ve `artis` artış tutar. Işlev yazar 7 + 5 Orijinal sayıya girer, sonra bu değeri döndürür.

Terminalde, derleyin ve çalıştırın:

```bash
gcc -std=c11 -Wall -Wextra -Werror -O0 -g -fno-omit-frame-pointer ilk-inceleme.c -o ilk-inceleme
./ilk-inceleme
file ./ilk-inceleme
readelf -hW ./ilk-inceleme
objdump -d -M intel --disassemble=hesapla ./ilk-inceleme
```

Program yazdırılmalıdır:

```text
value=12 result=12
```

`value`, `main`'de depolanan numaradır; `result`, geri dönen değerdir. Katılmaları gerekir. `-g` hata ayıklayıcı bilgileri ekler ve `-O0` bu ilk soruşturmayı takip etmeyi daha kolay tutar. `readelf` çalıştırılabilir olanı tanımlar; `objdump`, `hesapla`'nin makine talimatlarını makinenizle farklılaştırabilir.

## 2. Işlevin ilk talimatında duraklat

Aynı terminalde, hata ayıklayıcıyı açın:

```bash
gdb -q ./ilk-inceleme
```

Şimdi bir `(gdb)` istemini görmelisiniz. Bir sonraki bloğa girin ** GDB** içinde, istemin kendisini yazmadan:

```text gdb
set pagination off
set disassembly-flavor intel
set disable-randomization off
start
break *hesapla
continue
info registers rip rsp rbp rdi esi
set $hedef_adresi = (int *)$rdi
set $donus_adresi = *(void **)$rsp
x/wd $hedef_adresi
x/gx $rsp
p/x $donus_adresi
p (unsigned long)$rsp % 16
disassemble /r hesapla
x/i $pc
```

`start`, `main`'de duraklar. `break *hesapla`, işlevin ilk makine talimatına bir kesme noktası yerleştirir; `continue` bu kırılma noktasına kadar çalışır. Bir kesme noktası, hata ayıklayıcının programı durdurduğu bir yerdir.

Önce şu üç gözlemi okuyun:

- `esi` **5** olmalıdır, artış fonksiyona geçti.
- `x/wd $hedef_adresi`, yazmadan önceki sayı olan **7**'yi göstermelidir.
- `x/i $pc`, bir sonraki çalıştırılacak talimatı gösterir.

ile başlayan değerler `$` kullanarak oluşturduğumuz `set` Hata ayıklayıcı notlarıdır. `$hedef_adresi` Hedef adresi kaydeder, böylece bir yazmaç değişse bile incelemeye devam edebiliriz.

Kalan komutlar da yığını denetler. Bu tam giriş noktasında, `[rsp]` dönüş adresini tutar ve `rsp % 16` bu çağrı için 8 olmalıdır. Bunları ek gözlemler olarak saklayın; [x86-64 assembly okumaya hazırlık](../rehberler/assembly-okuma.md)'deki ABI ayrıntılarını incelemeden önce bellek yazma egzersizini tamamlayabilirsiniz.

## 3. Sayı değişimini izleyin

GDB'nin içinde hala, bu kısa bloğu tekrar tekrar çalıştırın:

```text gdb
stepi
x/i $pc
info registers rip rsp rbp
x/wd $hedef_adresi
```

Her `stepi` bir makine talimatı uygular. Her adımdan sonra `x/wd $hedef_adresi` tarafından gösterilen değere bakın. Birkaç adım için 7 kalacak, ardından 12 olacaktır.

** Kontrol noktanız:**Hedefi değiştiren talimatı tanımlayın**7'den 12'ye **. `$pc` tarafından bir adım sonra gösterilen komut *next* talimatıdır; yazma işlemi sadece gerçekleştirdiğiniz komuttur. Her `mov` hedefinizi yazmaz: bazıları sadece yığın üzerinde değer tasarrufu sağlar. Hedef adresi `$hedef_adresi` ile karşılaştırın.

12'yi gördükten sonra, `hesapla`'nin içindeyken adım atmayı bırakın. Sonra:

```text gdb
finish
p/d (int)$eax
p sayi
continue
quit
```

`finish`, mevcut işlev arayana dönene kadar çalışır. `eax` ve `sayi` artık 12'yi göstermelidir. `continue`, programın bitmesine izin verir ve `quit` GDB'yi kapatır.

`finish` kullanmadan önce yanlışlıkla iade talimatını adım adım geçerseniz, 2 adımından yeniden başlatın. `finish` her zaman şu anda seçilen işlev için geçerlidir.

## 4. Bir girdiyi değiştirin ve sonucu tahmin edin

Orijinal çağrı 5'yi 7'ye ekledi. Bunun yerine 9 eklerse ne olacağını tahmin edin.

Terminalde **taze** oturumu açın:

```bash
gdb -q ./ilk-inceleme
```

Sonra GDB içindeki bu bloğu girin:

```text gdb
set pagination off
set disable-randomization off
break hesapla
run
p artis
p *hedef
set variable artis = 9
finish
p/d (int)$eax
p sayi
continue
quit
```

Bu sefer kaynak düzeyindeki kesme noktası GDB'nin argümanı kendi adıyla bulmasını sağlar, `artis`. `set variable artis = 9` çalışan süreçte bu argümanı değiştirir. Beklenen program çıktısı:

```text
value=16 result=16
```

`./ilk-inceleme`'yi GDB dışında bir kez daha çalıştırın. `value=12 result=12`'ye geri dönmelidir: hata ayıklayıcı çalıştırılabilir dosyayı değil, bir çalıştırmayı değiştirdi.

## Anlayışınızı kontrol edin

Laboratuvarı şu şekilde açıklayabilirsiniz:

1. Neden ilk argüman 7 numarası yerine bir adrestir.
2. Hangi komut 12'yi bu adres üzerinden yazar.
3. Neden artırımı 9 olarak değiştirmek, her iki çıktı alanında da 16 üretir.

Derleyici sürümlerinizi, sökme, değerlerden önce/sonrası ve yazma talimatını sorumlu tutun. [Optimizasyon altında dallanma ve işaretçiler](dallanma-ve-pointer.md) ile devam edin.

## Bir şey farklı görünüyorsa

** Bir x86 kaydı bilinmiyor:** hedef mimariyi yeniden kontrol edin. Bu yazmaç adları doğrudan ARM'ye aktarılmaz.

** GDB programı başlatamaz:** Bir konteyner veya kum havuzu hata ayıklamayı kısıtlayabilir (`ptrace`). Sıradan başarılı bir çalışma hata ayıklayıcı adımlarının çalıştığını kanıtlamaz.

**Adresler, ASLR ile beklenen:** arasında değişir. Egzersiz, adresleri sabit olanları varsaymak yerine mevcut çalışmadan kaydeder.

**Bir kaynak satırı birkaç komut üretir:** bu normaldir. Aynı şekilde, optimize edilmiş yapılar değişkenleri gizleyebilir veya farklı bir düzen kullanabilir. Bu laboratuvar `-O0` kullanır; hata ayıklayıcı adımlama bir zamanlama ölçümü değildir. [Hata ayıklama bilgisini ayırma ve GDB’ye yeniden tanıtma](debug-bilgisi.md) ve [Sembolleri ayıklanmış ELF dosyalarını okuma](../rehberler/stripped-elf.md)'ye bakın.

## Kaynaklar ve ek okumalar

- [GDB: Machine Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html): `disassemble /r` ve kaynak/enstrüksiyon ilişkisi.
- [GDB: Devam ve Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [Memory](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html), [Assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html).
- [GCC: Hata ayıklama seçenekleri](https://gcc.gnu.org/onlinedocs/gcc/Debugging-Options.html) ve [Sistem V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI).
- [mytechnotalent/Reverse-Engineering](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): Küçük bir programı inceleyerek davranış değişikliklerini gözlemlemek için 160–163. dersler. Bu laboratuvarın kodu ve metni Execmap için hazırlandı.
