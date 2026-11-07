export const sections = [
  { name: 'ELF ve yükleme', key: 'elf', label: '01', pages: ['elf-dosyadan-bellege', 'elf-parser-ve-adresler', 'linker-duzeni', 'baslangic-ve-auxv', 'dinamik-baglama'] },
  { name: 'Tersine mühendislik', key: 're', label: '02', pages: ['stripped-elf', 'ikili-fark-analizi', 'ozel-yukleyiciler', 'paketli-elf', 'core-ve-snapshot'] },
  { name: 'Çalışma anı', key: 'tracing', label: '03', pages: ['perf-ile-yurutme', 'ebpf-ile-olaylar', 'analiz-aracinin-etkisi', 'izleri-yorumlamak'] },
];
export const labOrder = ['bellek-izinleri', 'sembol-secimi', 'debug-bilgisi', 'derleme-farklari'];
export const summaries = {
  'elf-dosyadan-bellege': 'Header, segment ve section. Dosya offset’inden çalışma adresine uzanan yol.',
  'elf-parser-ve-adresler': 'Parser sonucunu sınamak, aralıkları doğrulamak ve pyelftools ile envanter çıkarmak.',
  'linker-duzeni': 'Input section, output section, VMA ve LMA. Linker’ın bıraktığı düzeni okumak.',
  'baslangic-ve-auxv': 'Kernel, interpreter, runtime. main’e ulaşmadan önce gerçekleşenler.',
  'dinamik-baglama': 'GOT, PLT, relocation ve sembol çözümleme. Bir çağrının gerçek hedefini bulmak.',
  'stripped-elf': 'İsimler silindiğinde kalan semboller, unwind verisi ve ayrı debug dosyaları.',
  'ikili-fark-analizi': 'Bayt farkından davranış farkına. Sürümleri ve fonksiyonları karşılaştırmak.',
  'ozel-yukleyiciler': 'Yeni bir exec olmadan belleğe yerleştirilen kodun izini sürmek.',
  'paketli-elf': 'Paketleme belirtileri, açılma anı ve bellekten alınan kodu yorumlamak.',
  'core-ve-snapshot': 'Core dosyasını register, thread, mapping ve modül bilgisiyle anlamlandırmak.',
  'perf-ile-yurutme': 'Sayaçlar, örnekleme ve Intel PT. Nerede çalışıldığını doğru yorumlamak.',
  'ebpf-ile-olaylar': 'Syscall, mapping ve uprobe olaylarını süreç bağlamıyla ilişkilendirmek.',
  'analiz-aracinin-etkisi': 'Doğrudan syscall, ptrace kontrolleri ve gözlemin program üzerindeki etkisi.',
  'izleri-yorumlamak': 'Gözlem, hipotez ve kanıt. Zamanı, kimliği ve eksik kayıtları hesaba katmak.',
  'bellek-izinleri': 'Anonim belleği RW’den RX’e geçir. İzin değişiminin neyi kanıtladığını gör.',
  'sembol-secimi': 'Aynı executable, iki kütüphane. LD_PRELOAD ile gerçek çağrı hedefini karşılaştır.',
  'debug-bilgisi': 'Debug verisini ayır, çalışma kopyasını strip et ve isimleri geri bağla.',
  'derleme-farklari': 'Üç derlemeyle optimizasyon farkını davranış değişikliğinden ayır.',
};
export const routes = [
  { n: '01', title: 'Dosyadan belleğe', text: 'ELF yapısını oku, adresleri eşleştir ve yükleyiciyi takip et.', pages: ['rehberler/elf-dosyadan-bellege', 'rehberler/elf-parser-ve-adresler', 'rehberler/baslangic-ve-auxv'], code: 'readelf -lW ./ornek' },
  { n: '02', title: 'İsimlerden davranışa', text: 'Stripped dosyaları ve sürümler arasındaki anlamlı farkları çöz.', pages: ['rehberler/stripped-elf', 'rehberler/dinamik-baglama', 'rehberler/ikili-fark-analizi'], code: 'objdump -d ./ornek' },
  { n: '03', title: 'Çalışma anına bak', text: 'perf örnekleri ve eBPF olaylarıyla bulgularını sına.', pages: ['rehberler/perf-ile-yurutme', 'rehberler/ebpf-ile-olaylar', 'rehberler/izleri-yorumlamak'], code: 'perf record -g -- ./ornek' },
];
