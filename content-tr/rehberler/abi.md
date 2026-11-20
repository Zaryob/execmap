---
title: İşlev ABI’leri ve ikili uyumluluk
description: System V AMD64, Microsoft x64 ve Linux AArch64 argüman konumlarını karşılaştırın, bir kitaplık değişikliğini mevcut ikili dosyayla sınayın.
---

# İşlev ABI’leri ve ikili uyumluluk

API, kaynak kodun bir arayüzü nasıl kullandığını açıklar. Uygulama ikili arayüzü (ABI) ise derlenmiş çağıran ile çağrılan tarafın üzerinde anlaşması gereken kuralları belirtir: argüman ve sonuçların nereye konduğu, çağrı boyunca hangi yazmaçların korunduğu, veri yerleşimi ve sembollerin bağlanması. İnceleme teknikleri için [x86-64 assembly okumaya hazırlık](assembly-okuma.md), [C++ çağrı zincirleri](cpp-cagri-zinciri.md) ve [ELF dinamik bağlama](dinamik-baglama.md) rehberlerine bakın.

## İşlev çağrı kongre kaşif

Bir platform ABI ve açık parametre sayısı seçin. Her parametre, sıradan bir değişken olmayan fonksiyonda sırayla ilan edilen bir 64-bit tamsayısı veya işaretçisidir. Konumlar, herhangi bir yığın ayarı veya yazmaç dökülmelerinden önce, arayan girişinde ölçülür. Yüzer nokta ve vektör argümanları, agregalar, örtülü C++ parametreleri ve diğer gizli argümanlar ek sınıflandırma kurallarına ihtiyaç duyar.

[[abi-explorer]]

| İşlev ABI | Integer ve Pointer argümanları | Girişte ilk yığın argümanı | 64-bit tamsayısı veya işaretçi sonucu |
| --- | --- | --- | --- |
| Sistem V AMD64 | `rdi, rsi, rdx, rcx, r8, r9` | `[rsp + 8]`'de 7 argümanı | `rax` |
| Microsoft x64 | `rcx, rdx, r8, r9` | `[rsp + 40]`'de 5 argümanı | `rax` |
| Linux'ta AASPCS64 | `x0–x7` | `[sp]`'de 9 argümanı | `x0` |

Bu modeldeki her ek yığın argümanı bir 8-byte yuvası. x86-64 normal bir `call` dönüş adresini aşağıdaki şekilde `[rsp]`Microsoft x64 bir daha rezerve ediyor 32 bytes itibaren `[rsp + 8]` için `[rsp + 39]` gölge alanı olarak. Arayan kişi orada yazmaç argümanlarını dökebilir. Arama başladığında değerlerinin bu yuvalarda bulunması gerekmez. AArch64'te, `bl` Dönüş adresini yaz `x30` ve yapraklar `sp` yerinde. [Sistem V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [Microsoft x64 çağrı kuralı](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170), [Arm AAPPCS64](https://github.com/ARM-software/abi-aa/blob/main/aapcs64/aapcs64.rst).

Tartışma konumlarının ötesinde, arayan ve arayan kayıtlı yazmaçları, sonuç sınıflandırmasını ve herhangi bir platform gevşeme gereksinimini kontrol edin. Örneğin, System V AMD64, işlevlerin bir 128-byte kırmızı bölge aşağıda `rsp` iç içe geçmiş bir çağrıda hayatta kalması gerekmeyen veriler için. Microsoft x64 aşağıdaki belleği ele alır `rsp` uçucu olarak. [Sistem V AMD64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [Microsoft x64 yığın kullanımı](https://learn.microsoft.com/en-us/cpp/build/stack-usage?view=msvc-170).

## Üç hedef üzerinde aynı C imzasını gözlemleyin

Her iki kaynağı da boş bir dizine indirin. Çağrı on pozisyon kullanır, böylece her hedefin en az bir yığın argümanı vardır. İkinci argüman bir işaretçidir.

```c abi-caller.c
typedef unsigned long long word;
word abi_sum(word, const word *, word, word, word, word, word, word, word, word);

int main(void) {
    const word two = 2;
    return abi_sum(1, &two, 3, 4, 5, 6, 7, 8, 9, 10) == 55 ? 0 : 1;
}
```

```c abi-callee.c
typedef unsigned long long word;

word abi_sum(word a, const word *b, word c, word d, word e,
             word f, word g, word h, word i, word j) {
    return a + *b + c + d + e + f + g + h + i + j;
}
```

Clang ile assembly çıktısı üretin. Bu kaynaklar sistem başlıklarını kullanmaz. `-S` seçeneği derlemeyi assembly çıktısında durdurduğu için bu incelemede hedef sisteme ait bir sysroot gerekmez.

```sh
for target in x86_64-linux-gnu x86_64-pc-windows-msvc aarch64-linux-gnu; do
  clang --target="$target" -O2 -fno-optimize-sibling-calls -S abi-caller.c -o "$target-caller.s"
  clang --target="$target" -O2 -S abi-callee.c -o "$target-callee.s"
done
```

Her arayanda `abi_sum`'ye yapılan çağrıyı bulun ve değerleri seçilen ABI'nin kayıtlarına ve yığın yuvalarına takip edin. x86-64 için, arayan girişiyle karşılaştırmak için `call`'den hemen önce görülen çağrıcının yığın ofsetlerine sekiz ekleyin. AArch64'te yığın ofset, `bl`'ye göre aynı kalır.

Yerel Linux'ta, çifti hata ayıklama bilgisi ile oluşturun ve çalıştırın. Bir adres kesme noktası, işlev prologundan önce durur, böylece yazmaç ve yığın konumları kâşifle eşleşir. Test, toplam 55 olduğunda 0 durumuyla birlikte çıkar.

```sh
cc -Og -g -fno-lto abi-caller.c abi-callee.c -o abi-c
./abi-c
gdb -q -ex 'break *abi_sum' -ex run -ex 'disassemble /r abi_sum' ./abi-c
```

Kullan `info registers rdi rsi rdx rcx r8 r9 rsp` ve `x/5gx $rsp` Linux x86 girişinde-64. İlk bellek kelimesi geri dönüş adresini tutar ve sonraki dört sözcük içerir 7 aracılığıyla 10. Linux AArch64 kullanımında `info registers x0 x1 x2 x3 x4 x5 x6 x7 x30 sp` ve `x/2gx $sp` görmek için 9 ve 10 yığın üzerinde. İkinci argümanı aşağıdaki ile takip edin `x/gx $rsi` veya `x/gx $x1` okumak için 2 Noktalı nesneden.

## Bir C++ üyesini ve bir C-linkage ambalajını gözlemleyin

`Counter`'nin statik olmayan üyesi, `this`'yi açık tamsayı parametresinden önce alır. Serbest sarmalayıcı C bağlantısını ilan eder ve işaretçiyi açıkça alır.

```cpp abi-cpp.cpp
using word = unsigned long long;

struct Counter {
    word base;
    word add(word increment) const;
};

[[gnu::noinline]] word Counter::add(word increment) const {
    return base + increment;
}

extern "C" [[gnu::noinline]] word counter_add(const Counter *counter, word increment) {
    return counter->add(increment);
}

int main() {
    const Counter counter{40};
    return counter_add(&counter, 2) == 42 ? 0 : 1;
}
```

```sh
c++ -O0 -g abi-cpp.cpp -o abi-cpp
./abi-cpp
nm abi-cpp | grep -E 'counter_add|_ZNK7Counter'
nm -C abi-cpp | grep -E 'counter_add|Counter::add'
gdb -q -ex 'break *counter_add' -ex run -ex 'disassemble /r counter_add' ./abi-cpp
```

Linux'ta her zamanki derleyici C++ ABI ile karşılaştırın `counter_add` ve parçalanmış üye sembolü `_ZNK7Counter3addEy`. Bu örnekte `counter` ve `this` İlk argüman kaydını işgal etmek ve 2 ikinci ilgili girişlerinde. Ambalaj hala çağrıcılar temsil hakkında hemfikir güveniyor `Counter`. İstikrarlı bir C-yüzeyli API, aynı kütüphanede inşaat ve yıkım fonksiyonlarına sahip opak bir işaretçi kullanır. C++ nesnelerini değere, standart kütüphane türlerine, sanal yöntemlere veya istisnalara göre dışa aktarma, derleyiciyi ve çalışma zamanı sözleşmelerini arayüzün bir parçası yapar. [Itanium C++ ABI, veri düzeni, işlev çağrıları ve mangling](https://itanium-cxx-abi.github.io/cxx-abi/abi.html).

## Mevcut bir istemciyi başka bir kütüphane yapısına karşı test edin

Linux'u bir C derleyicisi, GNU uyumlu ELF bağlantılayıcısı ve Binutils ile kullanın. İstemci, SONAME'ı `libabi-demo.so.1` olan paylaşılan kütüphaneden `abi_value` sürüm düğümünde `DEMO_1.0` dışa aktarmasını gerektirir.

```c version-client.c
unsigned long long abi_value(unsigned long long);

int main(void) {
    return abi_value(41) == 42 ? 0 : 1;
}
```

```c version-library.c
unsigned long long abi_value(unsigned long long value) {
    return value + 1;
}
```

```text abi-v1.map
DEMO_1.0 {
    global: abi_value;
    local: *;
};
```

```text abi-v2.map
DEMO_2.0 {
    global: abi_value;
    local: *;
};
```

```sh
mkdir -p old candidate
cc -fPIC -shared version-library.c -Wl,-soname,libabi-demo.so.1 \
  -Wl,--version-script=abi-v1.map -o old/libabi-demo.so.1
cc version-client.c old/libabi-demo.so.1 -o version-client
readelf -dW version-client | grep NEEDED
readelf --version-info version-client | grep DEMO
LD_LIBRARY_PATH="$PWD/old" ./version-client

cc -fPIC -shared version-library.c -Wl,-soname,libabi-demo.so.1 \
  -Wl,--version-script=abi-v2.map -o candidate/libabi-demo.so.1
readelf --dyn-syms --wide candidate/libabi-demo.so.1 | grep abi_value
LD_LIBRARY_PATH="$PWD/candidate" ./version-client
```

İlk koşu çıkışları 0. Yedek ihracat `abi_value@@DEMO_2.0` ve ikinci çalışma yükleme zamanında başarısız olur çünkü `DEMO_1.0` eksik. Bu deneyde kaynak uygulama aynıdır. Uyumlu bir sürüm, eski sembol sürümünü ve davranışını yeni ihracatın yanında tutabilir. Kasıtlı olarak uyumsuz bir sürüm, her iki neslin bir arada yaşayabilmesi için yeni bir SONAME kullanabilir. [GNU ld VERSİYON komutu](https://sourceware.org/binutils/docs/ld/VERSION.html).

Değişmeyen bir SONAME ve sembol listesi hala sessiz molalara izin verir. Örneğin, bir alanı bir kamu yapısına eklemek, eski bir arayanda, bir alan olsa bile, bir alandaki bir alandaki ofsetleri değiştirebilir. `extern "C"` ihracat aynı kalır. Bir boyut veya sürüm etiketli yapı, uygulama yeni alanları okumadan önce boyutu kontrol ettiğinde ve mevcut düzen korunduğunda uzantıyı destekleyebilir. Mimariyi, nesne biçimini, SONAME'ı, dışa aktarılan sembolleri ve sürüm gereksinimlerini karşılaştırın, ardından düzenleri ve çağrı sözleşmelerini başlıkları, hata ayıklama bilgilerini veya sökme kullanarak karşılaştırın. Önceden oluşturulmuş müşterileri adayla karşılaştırın ve sonuçları temsilci girdileri altında karşılaştırın. Yeniden derleme istemcileri kaynak uyumluluğu hakkında farklı bir soruya cevap verir ve bölmeye bakın. [İkili dosya farkları ve sürüm karşılaştırması](ikili-fark-analizi.md) İkili değişiklikleri yorumlamak için.

[İşlev çağrısından Linux sistem çağrısına](syscall-boundary.md)'yi çekirdek sınırını incelemek için arayın.
