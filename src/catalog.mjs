export const sections = [
  { name: 'ELF and loading', key: 'elf', label: '01', pages: ['elf-dosyadan-bellege', 'elf-parser-ve-adresler', 'linker-duzeni', 'baslangic-ve-auxv', 'dinamik-baglama'] },
  { name: 'Reverse engineering', key: 're', label: '02', pages: ['assembly-okuma', 'stripped-elf', 'ikili-fark-analizi', 'ozel-yukleyiciler', 'paketli-elf', 'core-ve-snapshot'] },
  { name: 'Runtime', key: 'tracing', label: '03', pages: ['perf-ile-yurutme', 'ebpf-ile-olaylar', 'analiz-aracinin-etkisi', 'izleri-yorumlamak'] },
];
export const labOrder = ['gdb-ilk-inceleme', 'dallanma-ve-pointer', 'bellek-izinleri', 'sembol-secimi', 'debug-bilgisi', 'derleme-farklari'];
export const summaries = {
  'assembly-okuma': 'Prepare to read disassembly with registers, addressing, the stack, and System V calling conventions.',
  'gdb-ilk-inceleme': 'Follow arguments, pointer stores, and function returns instruction by instruction with GDB.',
  'dallanma-ve-pointer': 'Examine the same condition under O0 and O2; verify data selection and the target memory store.',
  'elf-dosyadan-bellege': 'Headers, segments, and sections. From file offsets to runtime addresses.',
  'elf-parser-ve-adresler': 'Test parser results, validate ranges, and build an inventory with pyelftools.',
  'linker-duzeni': 'Input sections, output sections, VMA, and LMA. Read the layout left by the linker.',
  'baslangic-ve-auxv': 'Kernel, interpreter, and runtime: what happens before main.',
  'dinamik-baglama': 'GOT, PLT, relocations, and symbol resolution. Find a call’s actual target.',
  'stripped-elf': 'Symbols, unwind information, and separate debug files after names are removed.',
  'ikili-fark-analizi': 'From byte differences to behavior changes. Compare versions and functions.',
  'ozel-yukleyiciler': 'Trace code placed in memory without a new exec.',
  'paketli-elf': 'Packing indicators, unpacking, and interpreting code recovered from memory.',
  'core-ve-snapshot': 'Interpret a core file through registers, threads, mappings, and modules.',
  'perf-ile-yurutme': 'Counters, sampling, and Intel PT. Interpret where execution took place.',
  'ebpf-ile-olaylar': 'Connect syscall, mapping, and uprobe events to process context.',
  'analiz-aracinin-etkisi': 'Direct syscalls, ptrace checks, and observation’s effect on a program.',
  'izleri-yorumlamak': 'Observation, hypothesis, and evidence. Account for time, identity, and missing records.',
  'bellek-izinleri': 'Change anonymous memory from RW to RX. Examine what a permission change establishes.',
  'sembol-secimi': 'One executable, two libraries. Compare actual call targets with LD_PRELOAD.',
  'debug-bilgisi': 'Separate debug data, strip the working copy, and reconnect the names.',
  'derleme-farklari': 'Use three builds to distinguish optimization from a change in behavior.',
};
export const routes = [
  { n: '01', title: 'From file to memory', text: 'Read ELF structures, match addresses, and follow the loader.', pages: ['rehberler/elf-dosyadan-bellege', 'rehberler/elf-parser-ve-adresler', 'rehberler/baslangic-ve-auxv'], code: 'readelf -lW ./ornek' },
  { n: '02', title: 'From names to behavior', text: 'Understand stripped files and meaningful differences between versions.', pages: ['rehberler/stripped-elf', 'rehberler/dinamik-baglama', 'rehberler/ikili-fark-analizi'], code: 'objdump -d ./ornek' },
  { n: '03', title: 'Observe runtime', text: 'Test findings with perf samples and eBPF events.', pages: ['rehberler/perf-ile-yurutme', 'rehberler/ebpf-ile-olaylar', 'rehberler/izleri-yorumlamak'], code: 'perf record -g -- ./ornek' },
];
