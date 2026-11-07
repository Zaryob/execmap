# execmap

A source-backed study of Linux ELF loading, binary analysis, and runtime observation, published as a Turkish technical reference with practical C laboratories.

[Read the site](https://zaryob.github.io/execmap/) · [Research method](content/kaynaklar.md) · [Literature and tools](content/kaynak-kutuphanesi.md)

## Research scope

execmap follows a program from its ELF file layout through linking and process startup to memory mappings and observed execution. Fourteen guides cover three connected areas:

- **ELF and loading:** segments and sections, address translation, parser validation, linker layout, auxiliary vectors, relocations, and symbol resolution.
- **Binary analysis:** stripped executables, version comparison, user-space loaders, packed code, core files, and process snapshots.
- **Runtime observation:** perf sampling, Intel PT, eBPF events, observer effects, and interpreting incomplete traces.

Four laboratories examine memory permissions, symbol interposition, separate debug information, and compiler optimization. Each includes source, commands, and expected observations. The technical articles and local search are Turkish; shared interface controls support Turkish and English.

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
