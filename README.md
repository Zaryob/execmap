# execmap

A source-backed study of Linux ELF loading, binary analysis, and runtime observation, published as an English technical reference with practical C laboratories.

[Read the site](https://zaryob.github.io/execmap/) · [Research method](content/kaynaklar.md) · [Literature and tools](content/kaynak-kutuphanesi.md)

## Research scope

execmap follows a program from its ELF file layout through linking and process startup to memory mappings and observed execution. Fifteen guides cover three connected areas:

- **ELF and loading:** segments and sections, address translation, parser validation, linker layout, auxiliary vectors, relocations, and symbol resolution.
- **Binary analysis:** stripped executables, version comparison, user-space loaders, packed code, core files, and process snapshots.
- **Runtime observation:** perf sampling, Intel PT, eBPF events, observer effects, and interpreting incomplete traces.

Six laboratories examine GDB instruction stepping, branches and pointers, memory permissions, symbol interposition, separate debug information, and compiler optimization. Each includes source, commands, and expected observations. A new assembly preparation guide leads into the two GDB laboratories before stripped-binary analysis. Articles, navigation, search, and shared interface controls are English. Existing public URL paths and source identifiers are preserved.

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

Open `http://localhost:4173/execmap/`. The server builds the site when it starts; restart it after editing content. The generated site is written to `_site/`.

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

## Search and language contract

The project registry retains stable `/execmap/` paths and the six-laboratory
catalog. Registry display names use `title_en` when available. Both generated
search indexes contain 24 reading pages, including the assembly guide and two
GDB laboratories. The suite adapter `search.json` publishes `type: "execmap/"`,
`lang: "en"`, full text, and links using the selected build prefix. Consumers
should preserve that content-language field. The local `search-index.json`
also carries code and heading fields for ranking phrase and code queries.
There is no Turkish content variant or language selector; saved language
preferences and `?lang=tr` leave the English product intact.

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
