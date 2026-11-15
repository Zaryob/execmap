# execmap

**English** · [Türkçe](README.tr.md)

A source-backed study of Linux ELF loading, binary analysis, and runtime observation, published as an English technical reference with practical C, C++, and Python laboratories.

[Read the site](https://zaryob.github.io/execmap/) · [Research method](content/kaynaklar.md) · [Literature and tools](content/kaynak-kutuphanesi.md)

## Research scope

execmap follows a program from its ELF file layout through linking and process startup to memory mappings and observed execution. Twenty-four guides cover three connected areas:

- **ELF and loading:** segments and sections, address translation, parser validation, linker layout, auxiliary vectors, relocations, and symbol resolution.
- **Binary analysis:** stripped executables, version comparison, user-space loaders, packed code, core files, and process snapshots.
- **Runtime observation:** perf sampling, Intel PT, eBPF events, observer effects, and interpreting incomplete traces.

A beginner track teaches runtime performance analysis and debugging from zero: [performance analysis from zero](content/rehberler/performans-analizine-giris.md), [bpftrace from zero](content/rehberler/bpftrace-temelleri.md), and a [symptom-driven debugging playbook](content/rehberler/debug-is-akisi.md), each paired with a lab ([CPU profiling and flame graphs](content/laboratuvarlar/cpu-profili.md), [first steps with bpftrace](content/laboratuvarlar/bpftrace-ilk-adimlar.md), [diagnosing an off-CPU slowdown](content/laboratuvarlar/yavas-program-teshisi.md)) whose expected counts can be derived from the source.

Fourteen laboratories examine GDB instruction stepping, branches and pointers, memory permissions, symbol interposition, separate debug information, compiler optimization, CPU profiling, first bpftrace programs, off-CPU diagnosis, runtime timing, sequence correlation, per-thread counters, function probes, and scheduler timelines. Each includes source, commands, and expected observations. A new assembly preparation guide leads into the two GDB laboratories before stripped-binary analysis. Articles, navigation, search, and shared interface controls are English. Existing public URL paths and source identifiers are preserved.

## Method and literature

The research connects a question to a documented mechanism, a small experiment, and the limits of the resulting evidence. A memory permission change alone does not establish execution; a sampled instruction address does not describe every instruction executed.

The reference base includes the [System V ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html), [x86-64 psABI](https://gitlab.com/x86-psABIs/x86-64-ABI), [Linux ELF loader source at v6.12](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c), [Linux man-pages](https://man7.org/linux/man-pages/man5/elf.5.html), [GNU ld documentation](https://sourceware.org/binutils/docs/ld/Scripts.html), [DWARF](https://dwarfstd.org/), and the tool authors' documentation. Topic-specific references appear at the end of each guide.

This is an independent technical synthesis and experimental study. It documents established mechanisms and reproducible questions; it does not claim new vulnerabilities or novel algorithms. Expected outputs are explanatory examples rather than a published measurement dataset. Record the architecture, kernel, libc, compiler, tool versions, command line, and relevant permissions when reproducing a laboratory.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173/execmap/`. The server listens on the loopback interface only; set `HOST` to bind another address. It builds the site when it starts; restart it after editing content. The generated site is written to `_site/`.

```sh
npm run build
npm run check
npx playwright install --only-shell chromium
npm run test:browser
```

`npm run check` builds the site and runs the Node.js content and interaction checks. Browser checks cover desktop and mobile layouts, search, navigation, and code copying.

The default deployment prefix is `/execmap`. To serve at the domain root:

```sh
SITE_BASEURL='' npm run dev
```

`SITE_BASEURL='' npm run check` checks that layout. Set `PORT` to change the local port.

The laboratories require GNU/Linux, a C compiler, GNU binutils, and GDB. Tracing chapters may also require strace, perf, bpftrace, kernel tracing support, suitable privileges, or Intel PT hardware. Their commands describe a Linux environment; building this website does not execute the laboratories.

The assembly additions have a [research and implementation record](docs/assembly-arastirma-plani.md), including source roles, upstream attribution, acceptance criteria, and validation limits. Run their published C examples directly from Markdown:

```sh
python3 scripts/verify-assembly-labs.py
# Native Linux x86-64 with GCC, GNU binutils, and GDB; fail if GDB checks cannot run:
python3 scripts/verify-assembly-labs.py --require-linux-gdb
```

The check compares both branch-program builds against the expected result for all 2001 accepted integer values, tests invalid inputs, and records commands, source hashes, and results under `output/assembly-validation/`. The Linux mode also checks function-entry ABI values, stepping, debugger intervention, watchpoints, and disassembly. Portable C execution on another platform does not validate Linux register or debugger behavior.

The portable parser check compiles the **C block extracted from the guide** with
ASan/UBSan, writes real malformed ELF fixtures, and checks rejection results:

```sh
python3 scripts/verify-examples.py
```

It also runs the portable arithmetic examples and entropy counterexamples.
Artifacts and JSON results go to `output/technical-validation/`. This checks
parser memory access and selected examples, not Linux ELF loadability.

The beginner perf/bpftrace labs have a portable check that extracts their C
programs from the Markdown, compiles them with `-Werror`, and verifies the
deterministic results and timing relationships the pages promise (dominant
stage, quadratic scaling, the effect of each fix):

```sh
python3 scripts/verify-perf-labs.py
```

Results go to `output/perf-lab-validation/`. It does not run perf or bpftrace;
tool output must still be checked on Linux.

Optional API checks use isolated, pinned Python dependencies:

```sh
uv run --with lief==0.17.1 --with pyelftools==0.32 python scripts/verify-tool-apis.py
# Instrument only the helper process created by the check; requires attach permissions:
uv run --with lief==0.17.1 --with pyelftools==0.32 --with frida==17.5.1 python scripts/verify-tool-apis.py --frida
```

Pass `--fq /absolute/path/to/fq` to check the published fq inventory command
(validated with 0.15.1). LIEF output is reparsed and its new entry and executable
segment are checked; it is not executed. Linux tracing, GOT interposition, core,
and checkpoint/restore experiments still require a suitable Linux environment.

Native Linux/glibc acceptance is separate from the website checks:

```sh
python3 scripts/verify-linux-labs.py
python3 scripts/verify-packed-oep.py --upx /absolute/path/to/upx
```

The first command extracts published C blocks and records RW→RX mappings,
interposition/`-Bsymbolic`, `LD_DEBUG`, debuglink/Build-ID matching, linker maps,
TRACEME, memfd/fexecve/execveat, and core controls. The second creates a known
static ELF fixture, packs it, and compares its original entry bytes with a live
hardware-breakpoint observation. Use a trusted, explicitly selected UPX build
and an empty output directory. See the [Linux experiment record](docs/linux-deney-kaydi.md)
for actual versions, bounded results, and remaining BPF/PT/restore prerequisites.

The GitHub Actions workflow requires `verify-assembly-labs.py --require-linux-gdb`,
`verify-examples.py`, `verify-runtime-lab.py --require-linux --gdb --cmake`,
and `verify-tool-apis.py` (without the Frida and fq options)
before deployment. `verify-linux-labs.py` runs there as a non-blocking evidence job,
and `verify-packed-oep.py` is not run in CI because it needs a separately
obtained UPX build.

## Runtime timing laboratory

The [runtime latency guide](content/rehberler/calisma-zamani-gecikmesi.md) connects
GDB, bpftrace, perf, and scheduler evidence to one
[timing laboratory](content/laboratuvarlar/zamanlama-ve-bekleme.md). Its downloadable
[assets](examples/runtime-timing) use generic synchronous worker functions,
C++11, and the Python standard library. From the repository root on Linux:

```sh
python3 scripts/verify-runtime-lab.py --require-linux --gdb --cmake
```

This builds the actual published source, validates sleep/busy/overrun recordings,
checks malformed traces and arguments, and runs the published GDB session and
alternative CMake build. Evidence goes to `output/runtime-validation/`; perf and
BPF attach remain separately reported capabilities. Without flags, other hosts
validate the analyzer and explicitly skip Linux execution. See the
[integration review](docs/runtime-lab-entegrasyonu.md) and the downloadable
[validation record](examples/runtime-timing/validation.txt) for scope and limits.

## C++ debugging and event correlation

The [C++ GDB guide](content/rehberler/cpp-cagri-zinciri.md) and
[process/thread guide](content/rehberler/process-thread-ve-zamanlayici.md) lead into
[two event-flow modes](content/laboratuvarlar/olay-akisini-eslestirme.md) and a
[procfs counter laboratory](content/laboratuvarlar/thread-sayaclari.md). Generic
`Dispatcher`, `Worker`, and `TraceBuffer` classes replace application-specific
frameworks. Six sequence-tagged events distinguish source gaps, caller waiting,
and queued handoff; cumulative scheduler counters retain their separate meaning.

```sh
python3 scripts/verify-debugging-labs.py --require-linux --gdb
```

The verifier exercises six mode/scenario combinations, cross-thread correlation,
malformed traces, a live read-only procfs sample, and the published C++ member
GDB session. Evidence goes to `output/debugging-validation/`. The existing
runtime CI job also requires this verifier. See the
[report integration notes](docs/debugging-raporu-entegrasyonu.md) for the mapping
from the supplied report to generalized guides and labs.

## Additional runtime investigations

The [runtime update integration](docs/runtime-update-entegrasyonu.md) adds
[remote GDB and IDE setup](content/rehberler/gdb-uzak-hedef.md),
[scheduler interpretation](content/rehberler/zamanlayici-izleri.md), and
[tracing failure investigation](content/rehberler/izleme-donmalari.md).
The new [function probe](content/laboratuvarlar/fonksiyon-problari.md) and
[scheduler timeline](content/laboratuvarlar/zamanlayici-zaman-cizelgesi.md) labs
show the probe code, raw records, pairing rules, and manual calculations.
Queue API distinctions and a paired interval identity extend the existing flow.
Kernel tracing and remote IDE execution require separate target validation;
site checks do not establish those capabilities.

## Search and language contract

The project registry retains stable `/execmap/` paths and the eleven-laboratory
catalog. Registry display names use `title_en` when available. Both generated
search indexes contain 35 reading pages, including the assembly guide and two
GDB laboratories. The suite adapter `search.json` publishes `type: "execmap/"`,
`lang: "en"`, full text, and links using the selected build prefix. Consumers
should preserve that content-language field. The local `search-index.json`
also carries code and heading fields for ranking phrase and code queries.
There is no Turkish content variant or language selector; saved language
preferences and `?lang=tr` leave the English product intact.

A code fence whose label is a file name, such as ` ```c hotspot.c `, renders as
an editor-style block: a file tab, a line-number gutter kept outside the
copyable text, and a download published at `code/<page-id>/<file>` from the
same Markdown. C, C++, Python, assembly, and JSON blocks are numbered; shell
blocks are not. Blocks longer than 30 lines start folded when JavaScript runs
and stay complete without it, in print, and when a search highlight falls
inside them. The verification scripts accept both fence forms.

All files in `public/assets/console/` are byte-identical copies from
`console-theme/assets/console/`; `theme.js` has English fallbacks and the SVG
license notice references its bundled sibling `ICONS-LICENSE.txt`. Sync and
verify from the sibling `console-theme` repository with `python3 scripts/sync.py`
and `npm run check`. The registry is copied unchanged to
`public/console-projects.json`. The Node build is the packaging adapter: it
renders English markup/local search without Jekyll includes, a language
selector, or loading the distributed preference/vocabulary scripts. Shared
search consumers must retain the `lang: "en"` metadata emitted by this build.

## Repository layout

- `content/rehberler/` — technical guides and per-topic references.
- `content/laboratuvarlar/` — self-contained C experiments and interpretation notes.
- `content/kaynaklar.md` and `content/kaynak-kutuphanesi.md` — method and literature.
- `src/` — content parsing, navigation metadata, and URL handling.
- `scripts/` — static generation and local serving.
- `public/` — browser code, styles, shared console assets, and local fonts.
- `tests/` — content, interaction, and browser checks.

The GitHub Actions workflow checks both `/execmap` and domain-root builds. Pushes to `main` deploy to GitHub Pages after checks pass. In the repository's Pages settings, select **GitHub Actions** as the publishing source.

## License

Copyright (C) 2026 Suleyman Poyraz.

Unless otherwise stated, the project source, technical writing, and laboratory examples are licensed under **GNU GPL version 3 or later**. See [LICENSE](LICENSE). The project is provided without warranty.

Shared console assets retain their **GPL-2.0-or-later** notices. IBM Plex fonts use **SIL OFL 1.1**. Font Awesome SVG assets retain their attribution and **CC BY 4.0** terms. See [NOTICE.md](NOTICE.md) for locations and acknowledgments. External publications and tools remain under their authors' licenses.
