---
title: x86-64 assembly okumaya hazırlık
description: Makine kodundan çıkarılan assembly’yi okumak için yazmaçları, adreslemeyi, yığını ve System V çağrı kurallarını öğrenin.
---

# x86-64 assembly okumaya hazırlık

Bir derleyici, baytları komutlar olarak yorumlar; otomatik olarak kaynak değişken adlarını veya programcının amacını geri getiremez. İlk hedef, birkaç komutun değerleri okumasına ve yazmasına yönelik adımlarını takip etmektir. Bu kılavuz, [GDB ile ilk inceleme: C’den makine koduna](../laboratuvarlar/gdb-ilk-inceleme.md) ve [Optimizasyon altında dallanma ve işaretçiler](../laboratuvarlar/dallanma-ve-pointer.md) için sizi hazırlar.

Kapsam, Linux x86-64, System V AMD64 ABI ve tipik LP64 veri modelidir: `int` 4 bayttır ve işaretçiler 8 bayttır. Windows x64 kuralları, x32, AArch64 ve çekirdek kodu bu örneklerin dışındadır. Komutların anlamları için [Intel SDM hacimleri 1 ve 2](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html) ve işlev sınır sözleşmeleri için [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)'yi kullanın.

## 1. Baytları, değerleri ve adresleri ayırın

`0x2a` onaltılık sistemde 42'dir. Bir kaydın içindeki bu bitler mutlaka bir adres değildir. C türünü, talimatı ve bellek haritasını birlikte düşünün. x86-64 little-endian'dir: 32 bitlik `0x12345678`, `78 56 34 12` şeklinde artan bellek adreslerinde görünür.

`rax` 64 bitlik bir kayıştır; `eax` onun düşük 32 bitidir, `ax` düşük 16 bitidir ve `al` düşük 8 bitidir. 64 bit modunda, `eax` gibi bir genel amaçlı 32 bitlik kaydın yazılması, karşılık gelen 64 bitlik kaydın üst yarısını sıfırlar. Bu, `ax` veya `al` için geçerli değildir. `rsi`'yi tümü bir tamsayı olarak ele almaktan ziyade, `esi` kullanarak bir C `int` argümanını okuyun ve doğru işaretli yorumu kullanın.

## 2. Intel ve AT&T sözdizimlerini ayırın

Bu kılavuz ve laboratuvarlar Intel sözdizimini kullanır: GNU objdump'ta `-M intel` ve GDB'de `set disassembly-flavor intel` seçin. Ancak, bu seride tutarlılık yoktur. [Program başlangıcı, yığın düzeni ve yardımcı vektör](baslangic-ve-auxv.md), [Dinamik bağlama, GOT, PLT ve sembol çözümleme](dinamik-baglama.md), [Sembolleri ayıklanmış ELF dosyalarını okuma](stripped-elf.md) ve [Gözlemin programa etkisi ve analiz karşıtı davranışlar](analiz-aracinin-etkisi.md) kılavuzlarındaki parçalar, x86-64'te varsayılan olarak GNU objdump ve GDB tarafından da yazılan AT&T sözdizimini kullanır. Herhangi bir listeyi okumadan önce operand sırasını kontrol edin. [objdump belgeleri](https://sourceware.org/binutils/docs/binutils/objdump.html) bu seçeneği tanımlar.

Bu satırlar aynı işlemi tanımlar; bunlar bağımsız bir program değildir:

```text asm
mov eax, DWORD PTR [rdi]   # Intel: destination, source
movl (%rdi), %eax          # AT&T: source, destination
```

Her ikisi de `rdi` adresindeki dört baytı okur. Buna karşılık, `mov rax, rdi` bellekten okumadan kaydın bitlerini kopyalar. Parantez içindeki ifadeler, Intel sözdiziminde bir bellek operandına yönelik bir ipucu sağlar.

## 3. Adres hesaplaması ile bellek okumaları

Intel sözdiziminde, `[base + index * scale + displacement]` bir adres ifadesidir; donanım ölçekleri 1, 2, 4 veya 8 olabilir. Bu bölüm şemaya aittir: `rdi`, geçerli bir `int` dizisinin başlangıcını temsil ederken, `rsi` ise sınır içindeki bir indeksi temsil eder:

```x86asm asm
lea rdx, [rdi + rsi*4]    # Compute the address of dizi[i]
mov eax, DWORD PTR [rdx]  # Read the value of dizi[i]
add eax, 3               # Increment the value
mov DWORD PTR [rdx], eax  # Write back to the same element
```

`lea` (load effective address), belirtilen adresten veri okumadan adres ifadesini hesaplar. Derleyici, bunu aritmetik işlemler için de kullanabilir. Her `lea` ifadesi bir C işaretçi değişkenine karşılık gelmez ve her bellek erişimi ayrı bir değişkeni temsil etmeyebilir. `DWORD PTR`, burada 4 baytlık bir erişimi belirtir, işaretçinin boyutunu değil.

## 4. Fon çağrısında kontrol edilmesi gerekenler

Bu laboratuvarlardaki basit tamsayı/işaretçi imzaları için, ilk altı argüman sırasıyla `rdi`, `rsi`, `rdx`, `rcx`, `r8` ve `r9` kullanılır. Bir `int` için düşük 32 bitin değerini yorumlayın; `int` dönüş değeri `eax`'te bulunur. Yapılar, kayan nokta değerleri ve değişken sayıda argümanlı çağrılar için ek kurallar geçerlidir. Bu, Linux'taki `syscall` kayıt sözlüğünden farklıdır.

Normal bir `call`, bir dönüş adresini kaydırır ve kontrolü aktarır; normal bir `ret`, o adresten geri döner. `rsp` (stack pointer) ve `rip` (instruction pointer) değerleridir. Bir işlevin ilk komutundan önce, işlevin ön sözlüğünün çalıştırılmasından önce, `[rsp]` dönüş adresini tutar. `push` veya `sub rsp, ...` gibi işlemlerden sonra, bu varsayımı tekrar kullanmayın, çünkü bunlar yığın üzerinde değişiklik yapar.

Bu basit psABI çağrıları için, çağrıdan önce yığın 16 baytlık bir hizalamaya sahiptir. 8 baytlık dönüş adresi, `(rsp + 8) % 16 == 0` şeklinde giriş durumunda geçerlidir. `rbp` (register base pointer) bir çerçeve göstergesi olabilir, ancak zorunda değildir. 128 baytlık kullanıcı alanı "red zone", yaprak işlevlerin yığını büyütmeden geçici verileri tutmasına olanak tanır. Bu nedenle, `sub rsp` veya `push rbp` gibi işlemlerin kullanılması, işlev sınırının varlığını ortadan kaldırmaz. Daha fazla bilgi için [psABI düşük seviyeli sistem bilgileri bölümü](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)'a bakın.

## 5. Koşul nerede temsil edilir?

`cmp` (compare), bir çıkarma işlemi gibi, sonucu depolamadan bayrakları ayarlar; `test` ise bit düzeyinde AND işlemi ile bayrakları ayarlar. Daha sonraki bir koşullu komut, bu bayrakları kullanır. İşaretli `<` ile `jl` (jump if less) ve işaretsiz `<` ile `jb` (jump if below), farklı koşulları temsil eder. Bunları türleri dikkate almadan eşdeğer olarak yorumlamayın.

Bir C `if` ifadesi, koşullu bir atlama (`jcc`), koşullu bir taşıma (`cmovcc`), `setcc` veya aritmetik bir işlem olabilir. `cmov` veri seçer; ancak kendisi başka bir komut adresine yürütmeyi aktarmaz. Sabit bir koşul tamamen ortadan kalkabilir. Intel'in referansında ve [GCC optimizasyon belgelerinde](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html), komutların anlamlarını kontrol edin ve olası dönüşümlerini inceleyin.

## 6. Bir derleme kodu okuma yöntemi

1. Mimari ve sözdizimini kaydedin: `file ./program`, `readelf -hW ./program`.
2. Bir işlevi açın: `objdump -d -M intel --disassemble=hesapla ./program`.
3. Her komutun giriş kayıtlarını, bellek genişliğini ve yazılan hedefi not alın.
4. Giriş ABI bilgilerini, sonraki veri akışından ayırın; argüman kayıtları değişebilir.
5. Statik adresleri süreceyle ilişkilendirirken PIE/ASLR'yi dikkate alın. Bir dosya ofsetini sanal bir adresten eşleştirmeyin; [ELF ayrıştırıcısını ve adres hesaplarını doğrulama](elf-parser-ve-adresler.md) dönün.
6. Hipotezi doğrulamak için GDB'de bir komutu adım adım çalıştırın ve belleği yeniden okuyun. GDB'nin `x` çıktısı, belleğin seçilmiş bir temsilidir ve C türünün kanıtı değildir.

Anlayışınızı kontrol edin: `lea` neden bir bellek okuması değildir? `eax`'i yazdıktan sonra `rax`'ın üst yarısı ne olur? Bir C `if` ifadesinin her zaman `jne` aramasına yol açması gerek mi? Eğer komut ve ABI kaynaklarını kullanarak cevap verebilirseniz, [GDB ile ilk inceleme: C’den makine koduna](../laboratuvarlar/gdb-ilk-inceleme.md) devam edin, ardından [Sembolleri ayıklanmış ELF dosyalarını okuma](stripped-elf.md) dönün.

[İşlev ABI’leri ve ikili uyumluluk](abi.md)'de farklı platformlarda giriş kayıtlarını ve yığın slotlarını karşılaştırın.

## Ek kaynaklar ve çalışma materyalleri

- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html): Yazmaçlar ve veri gösterimi için 1. cilt. `MOV`, `LEA`, `CMP`, `TEST`, `Jcc`, `CMOVcc`, `CALL` ve `RET` için 2. cilt.
- [System V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI): veri modeli, parametre geçişi ve yığın sözleşmeleri.
- [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html): sözdizimi ve sembol bazlı derleme.
- [GDB: Registers](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Registers.html): seçilen çerçevede kayıtları okuma; giriş noktasına en iç çerçeveyi kullanın.
- [mytechnotalent/Geri Mühendislik, x64 Kurs](https://github.com/mytechnotalent/Reverse-Engineering#x64-course): Özellikle 127-132 ve 160-163 numaralı dersler, ek çalışma için. Konu dizisi, bir ilham kaynağıdır; bu kılavuzun yazısı ve laboratuvar kodu, execmap için hazırlanmıştır. Teknik sözleşmeler, yukarıdaki temel belgelerle doğrulanmaktadır.
