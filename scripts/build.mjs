import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import { loadPages, escapeHtml as e, slugify, normalizeBase, pageUrl, rewriteLink } from '../src/content.mjs';
import { sections, labOrder, routes } from '../src/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const base = normalizeBase(process.env.SITE_BASEURL ?? '/execmap');
const url = id => pageUrl(id, base);
const asset = name => `${base}/${name}`;
const pages = await loadPages(path.join(root, 'content'));
const projects = JSON.parse(await readFile(path.join(root, 'public/console-projects.json'), 'utf8'));
const byId = new Map(pages.map(page => [page.id, page]));
const pageIds = new Set(byId.keys());
const guides = pages.filter(p => p.kind === 'rehber').sort((a, b) => a.order - b.order);
const labs = labOrder.map(slug => byId.get(`laboratuvarlar/${slug}`));
// The home page features the first guide of each reading route and four labs;
// the full catalogs stay on rehberler/index and laboratuvarlar/index.
// The route cards already open each route's first guide; feature the next one so every home link leads somewhere different.
const featuredGuides = routes.map(route => byId.get(route.pages[1] ?? route.pages[0]));
const featuredLabs = [1, 5, 8, 11].map(number => labs[number - 1]);
const icon = (name, size = 18) => {
  const paths = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', chevron: '<path d="m6 9 6 6 6-6"/>', terminal: '<path d="m4 6 5 6-5 6m8 0h8"/>' };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
// Code blocks with a file name are also published as downloads.
const codeFiles = [];
const numberedLanguages = new Set(['c', 'cpp', 'python', 'x86asm', 'json']);
const foldLines = 30;
function renderMarkdown(page) {
  const toc = [];
  const seen = new Map();
  const md = new Marked({ gfm: true, breaks: false });
  md.use({ renderer: {
    heading({ tokens, depth }) {
      const content = this.parser.parseInline(tokens);
      const raw = tokens.map(t => t.text || '').join('');
      const slug = slugify(raw);
      const count = seen.get(slug) || 0;
      seen.set(slug, count + 1);
      const id = count ? `${slug}-${count + 1}` : slug;
      if (depth === 2 || depth === 3) toc.push({ title: raw.replace(/[`*]/g, ''), id, depth });
      return `<h${depth} id="${id}" aria-label="${e(raw.replace(/[`*]/g, ''))}">${content}<a class="heading-anchor" href="#${id}" aria-label="${e(raw)} section link">#</a></h${depth}>\n`;
    },
    code({ text, lang }) {
      // Info string: a highlight.js language, then an optional display label
      // (`text gdb` renders as plain text labelled "gdb"). A label containing
      // a dot or slash is a file name (`c hotspot.c`): the block gets an
      // editor-style file tab, line numbers and a published download.
      const [language, label = language] = (lang || 'text').trim().split(/\s+/);
      const target = language === 'sh' ? 'bash' : language;
      if (!hljs.getLanguage(target)) throw new Error(`Unsupported code fence language "${language}" in ${page.id}`);
      const highlighted = hljs.highlight(text, { language: target }).value;
      const lines = text.split('\n').length;
      const fileName = /[./]/.test(label) ? label : null;
      let download = '';
      if (fileName) {
        if (!/^[A-Za-z0-9_.-]+$/.test(fileName) || fileName.startsWith('.')) throw new Error(`Unsafe code file name "${fileName}" in ${page.id}`);
        if (codeFiles.some(file => file.page === page.id && file.name === fileName)) throw new Error(`Duplicate code file "${fileName}" in ${page.id}`);
        const published = `code/${page.id}/${fileName}`;
        codeFiles.push({ page: page.id, name: fileName, path: published, text: text.endsWith('\n') ? text : `${text}\n` });
        download = `<a class="code-download" href="${asset(published)}" download="${e(fileName)}" aria-label="Download ${e(fileName)}"><span class="code-download-word">Download&nbsp;</span>↓</a>`;
      }
      const numbered = fileName || numberedLanguages.has(target);
      const gutter = numbered ? `<span class="code-gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</span>` : '';
      const head = fileName
        ? `<div class="code-language code-file"><span class="code-tab" title="${e(fileName)}">${e(fileName)}</span><span class="code-info">${e(language)} · ${lines} lines</span>${download}</div>`
        : `<div class="code-language">${e(label)}</div>`;
      const foldable = lines > foldLines ? ` data-code-fold="${lines}"` : '';
      return `<div class="code-block${numbered ? ' code-numbered' : ''}"${foldable}>${head}<pre tabindex="0" role="group" aria-label="${e(label)} code example"${numbered ? ' class="has-lines"' : ''}>${gutter}<code class="language-${e(language)}">${highlighted}</code></pre></div>\n`;
    },
    link({ href, title, tokens }) {
      const address = rewriteLink(href, page.id, base, pageIds);
      return `<a href="${e(address)}"${title ? ` title="${e(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    blockquote({ text, tokens }) {
      const note = text.match(/^\[!(NOTE|WARNING)\]\s*\n?/);
      if (!note) return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      const label = note[1] === 'WARNING' ? 'Warning' : 'Note';
      return `<aside class="admonition admonition-${note[1].toLowerCase()}" aria-label="${label}"><p class="admonition-title">${label}</p>${md.parse(text.slice(note[0].length))}</aside>\n`;
    },
    html({ text }) { return e(text); },
  }});
  const content = page.markdown.replace(/^\s*# .+\r?\n/, '');
  return { html: md.parse(content), toc };
}
function header(current) {
  const selected = current.startsWith('rehberler') ? 'rehberler' : current.startsWith('laboratuvarlar') ? 'laboratuvarlar' : current.includes('kaynak') ? 'kaynak-kutuphanesi' : current === 'index' ? 'index' : '';
  const nav = [['index', 'Start'], ['rehberler/index', 'Guides'], ['laboratuvarlar/index', 'Labs'], ['kaynak-kutuphanesi', 'Resources']];
  return `<a class="skip-link" href="#main">Skip to content</a>
  <header class="console-header"><div class="console-header__inner">
    <div class="console-identity"><a class="console-brand" href="https://zaryob.github.io/">zaryob</a><span class="console-prompt-separator">:</span>
      <details class="console-projects" data-console-projects><summary><span class="console-project-path">~/execmap</span><span class="console-sr-only"> — Switch project</span><span class="console-prompt-dollar" aria-hidden="true">$</span><span class="console-prompt-cursor" aria-hidden="true"></span>${icon('chevron', 12)}</summary><div class="console-project-menu">
        ${projects.map(project => `<a href="${e(project.key === 'execmap' ? `https://zaryob.github.io${base}/` : `https://zaryob.github.io${project.path}`)}"${project.key === 'execmap' ? ' aria-current="location"' : ''}><span>${e(project.title_en || project.title)}</span><small>${e(project.prompt)}</small></a>`).join('')}
      </div></details>
    </div>
    <div class="console-header-actions"><button type="button" class="console-search-compact" data-site-search aria-label="Search this site">${icon('search')}</button><button type="button" class="console-menu" data-console-menu aria-label="Open menu" aria-controls="console-navigation" aria-expanded="false">${icon('menu')}</button></div>
    <nav class="console-nav" id="console-navigation" aria-label="Main navigation">${nav.map(([id, label]) => `<a href="${url(id)}"${(selected === id.split('/')[0] || selected === id) ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}
      <div class="console-tools"><button type="button" class="console-search-open" data-site-search aria-label="Search Execmap" aria-haspopup="dialog">${icon('search', 16)}<span>Search Execmap</span><kbd>/</kbd></button><label class="console-theme"><span>Theme</span><select data-console-theme aria-label="Color theme"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label></div>
    </nav>
  </div></header>`;
}
function footer() {
  const column = (title, label, links) => `<nav class="suite-footer__col" aria-label="${e(label)}"><p class="suite-footer__title">${title}</p><ul>${links.map(link => `<li>${link}</li>`).join('')}</ul></nav>`;
  const site = column('~/execmap/', 'execmap', [`<a href="${url('index')}">execmap/</a>`, `<a href="${url('kaynaklar')}">kaynaklar.html<span class="console-sr-only"> — Sources</span></a>`, `<a href="${asset('lisanslar.html')}">lisanslar.html<span class="console-sr-only"> — Licenses</span></a>`, `<a href="https://github.com/Zaryob/execmap">GitHub <span aria-hidden="true">↗</span></a>`]);
  const suite = column('~/sites/', 'Zaryob sites', projects.filter(project => project.key !== 'home').map(project => `<a href="${e(project.key === 'execmap' ? `https://zaryob.github.io${base}/` : `https://zaryob.github.io${project.path}`)}"${project.key === 'execmap' ? ' aria-current="location"' : ''}>${e(project.prompt)}/<span class="console-sr-only"> — ${e(project.title_en || project.title)}</span></a>`)).replace('<ul>', '<ul class="console-suite__list">');
  const contact = column('~/contact', 'Social links', ['<a href="https://github.com/Zaryob" rel="me">GitHub <span aria-hidden="true">↗</span></a>', '<a href="https://linkedin.com/in/suleyman_poyraz" rel="me">LinkedIn <span aria-hidden="true">↗</span></a>', '<a href="https://medium.com/@zaryob" rel="me">Medium <span aria-hidden="true">↗</span></a>', '<a href="mailto:zaryob.dev@gmail.com">Email</a>']);
  return `<footer class="suite-footer" id="site-footer" lang="en"><div class="suite-footer__inner"><p class="suite-footer__prompt" aria-hidden="true"><span class="suite-footer__host">zaryob</span>:~/execmap $ <span class="suite-footer__cmd">ls -F</span></p><div class="suite-footer__cols">${site}${suite}${contact}</div><div class="suite-footer__legal"><span><span aria-hidden="true"># </span>© Süleyman Poyraz · A Linux reverse engineering desk.</span><span>Read the file. Observe runtime. Verify the finding.<a class="suite-footer__top" href="#main"><span aria-hidden="true">↑ </span>Back to top</a></span></div></div></footer>`;
}
function searchDialog() {
  return `<dialog lang="en" class="console-search" id="site-search" aria-labelledby="search-title"><div class="console-search__heading"><h2 id="search-title">execmap / search</h2><button type="button" class="search-close" data-search-close aria-label="Close search"><span class="search-close-long">Esc / Close</span><span class="search-close-short" aria-hidden="true">×</span></button></div><label for="search-input">Search guides, code examples, and resources</label><input id="search-input" type="search" placeholder="GOT, mprotect, stripped ELF…" autocomplete="off" spellcheck="false"><p id="search-status" class="console-search__status" role="status" aria-live="polite">Type a few letters to search.</p><ul id="search-results" class="console-search__results"></ul></dialog>`;
}
function documentHtml({ title, description, current = 'index', body, article = false, indexable = true }) {
  const fullTitle = title === 'execmap' ? 'execmap — Linux reverse engineering desk' : `${title} · execmap`;
  const address = `https://zaryob.github.io${url(current)}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><meta name="theme-color" content="#f5f3ed"><script defer src="https://cloud.umami.is/script.js" data-website-id="2ddfb587-71f9-4068-a66b-1f92ad4bf209"></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-M6NQ8DV1XP"></script><script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-M6NQ8DV1XP');</script><meta name="site-root" content="${base}/"><meta name="description" content="${e(description)}"><title>${e(fullTitle)}</title><link rel="icon" type="image/svg+xml" href="${asset('favicon.svg')}">${indexable ? `<link rel="canonical" href="${address}">` : '<meta name="robots" content="noindex">'}<meta property="og:title" content="${e(fullTitle)}"><meta property="og:description" content="${e(description)}">${indexable ? `<meta property="og:url" content="${address}">` : ''}<meta property="og:site_name" content="execmap"><meta property="og:locale" content="en_US"><meta property="og:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="execmap — Linux reverse engineering desk. Read the file. Observe runtime. Verify the finding."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(fullTitle)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta name="twitter:image:alt" content="execmap — Linux reverse engineering desk"><meta property="og:type" content="${article ? 'article' : 'website'}"><script src="${asset('assets/console/theme.js')}"></script><link rel="stylesheet" href="${asset('assets/console/theme.css')}"><link rel="stylesheet" href="${asset('style.css')}"><script type="module" src="${asset('app.js')}"></script></head><body class="console-site execmap-site">${header(current)}${body}${footer()}${searchDialog()}<div class="console-sr-only" id="site-announcement" role="status" aria-live="polite"></div></body></html>`;
}
function listRow(page, index) {
  return `<li class="catalog-row" data-catalog-item data-group="${e(page.group)}" data-search="${e(`${page.title} ${page.description} ${page.section}`)}"><span class="row-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><a class="row-title" href="${url(page.id)}">${e(page.title)}</a><p>${e(page.description)}</p></div><span class="row-meta">${e(page.section)}<br>${page.minutes} min read</span></li>`;
}
function catalog(items, title, filter = true) {
  return `<section id="catalog" class="catalog-section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">find ./guides -type f</p><h2 id="catalog-title">${title}</h2></div><span class="section-count">${items.length} guides</span></div>
  <div class="catalog-controls" data-js-only hidden><label class="catalog-search">${icon('search')}<span class="console-sr-only">Filter guides</span><input id="catalog-query" type="search" placeholder="Search by title or topic…" autocomplete="off"></label>${filter ? `<div class="filter-tabs" role="group" aria-label="Topic filter"><button type="button" data-filter="all" aria-pressed="true">All</button>${sections.map(section => `<button type="button" data-filter="${section.key}" aria-pressed="false">${section.name}</button>`).join('')}</div>` : ''}</div>
  <p class="filter-status" id="catalog-status" role="status" aria-live="polite" data-js-only hidden></p><ol class="catalog-list">${items.map(listRow).join('')}</ol><div class="empty-state" id="catalog-empty" hidden><p>No guides match this search.</p><button type="button" data-reset-filters>Clear filters</button></div></section>`;
}
function home() {
  const main = `<main id="main" lang="en" class="home-main" tabindex="-1"><section class="console-hero"><div class="console-hero__inner"><div class="intro-copy console-hero__copy"><p class="eyebrow">GNU/Linux investigation desk</p><h1 class="console-hero__title">Follow Linux programs from file to memory.</h1><p class="console-hero__lead">Read the ELF file, loader, and runtime<br class="desktop-break"> as parts of the same story.</p><p class="intro-detail">Source-backed guides and small, practical reverse engineering labs. Start with <code>readelf</code>; verify your findings with GDB, perf, and eBPF.</p><div class="console-hero__actions"><a class="primary-link" href="${url('rehberler/elf-dosyadan-bellege')}">Open the first guide ${icon('arrow')}</a><a href="${url('okuma-rotalari')}">Reading routes ↗</a></div></div>
    <div class="terminal-preview console-hero__panel" aria-label="Investigation steps from an ELF file to runtime"><div class="terminal-title console-hero__panel-head"><span>${icon('terminal', 15)} the journey of an ELF</span><span>x86-64 / Linux</span></div><div class="terminal-body"><p><span class="prompt">$</span> readelf -lW ./ornek</p><p class="terminal-muted">Elf file type is DYN</p><div class="segment-line"><span>LOAD</span><span>0x0000</span><span>R--</span><i class="segment-bar seg-a"></i></div><div class="segment-line"><span>LOAD</span><span>0x1000</span><span>R-X</span><i class="segment-bar seg-b"></i></div><div class="segment-line"><span>LOAD</span><span>0x2000</span><span>R--</span><i class="segment-bar seg-c"></i></div><div class="segment-line"><span>LOAD</span><span>0x3000</span><span>RW-</span><i class="segment-bar seg-d"></i></div><div class="trace-line"><span>file</span><b>→</b><span>loader</span><b>→</b><span>memory</span><b>→</b><span>execution</span></div><p class="terminal-caption">Illustrative layout · not an analysis of a real file.</p><p class="terminal-final"><span class="prompt">$</span> <span class="cursor" aria-hidden="true">▌</span></p></div></div></div></section><div class="home-content">
    <div class="stats-strip" aria-label="Content overview"><span><strong>${guides.length}</strong> guides</span><span><strong>${labs.length}</strong> labs</span><span>ELF · GDB · perf · eBPF</span><a href="${url('kaynak-kutuphanesi')}">Follow it to the source ↗</a></div>
    <section class="routes-section" aria-labelledby="routes-title"><div class="section-heading"><div><p class="eyebrow">cd ./where-to-start</p><h2 id="routes-title">Choose an investigation question.</h2></div><a href="${url('okuma-rotalari')}">All routes →</a></div><div class="route-grid">${routes.map(route => `<a class="route-card" href="${url(route.pages[0])}"><span class="route-number">/${route.n}</span><h3>${route.title} <span>↗</span></h3><p>${route.text}</p><code>${e(route.code)}</code></a>`).join('')}</div></section>
    <section class="catalog-section" aria-labelledby="featured-title"><div class="section-heading"><div><p class="eyebrow">find ./guides -type f</p><h2 id="featured-title">Featured guides</h2></div><span class="section-count">${featuredGuides.length} of ${guides.length} guides</span></div><ol class="catalog-list">${featuredGuides.map(page => listRow(page, guides.indexOf(page))).join('')}</ol><p class="section-more"><a href="${url('rehberler/index')}">All guides →</a></p></section>
    <section class="lab-section" aria-labelledby="labs-title"><div class="section-heading"><div><p class="eyebrow">mkdir experiment &amp;&amp; cd experiment</p><h2 id="labs-title">Read. Compile. Compare.</h2><p class="section-note">Each lab: code + commands + expected results.</p></div></div><div class="lab-grid">${featuredLabs.map(lab => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(labs.indexOf(lab) + 1).padStart(2, '0')} <span>${e(lab.language || 'C')} / Linux</span></span><h3>${e(lab.title)} ↗</h3><p>${e(lab.description)}</p></a>`).join('')}</div><p class="section-more"><a href="${url('laboratuvarlar/index')}">All labs →</a></p></section>
    <section class="source-banner"><div><p class="eyebrow">man elf · reference desk</p><h2>A finding is as strong as its source.</h2><p>ABI specifications, Linux source, and tool authors’ documentation,<br class="desktop-break"> with their scope and limits explained.</p></div><a href="${url('kaynak-kutuphanesi')}">Open the resource library ${icon('arrow')}</a></section>
  </div></main>`;
  return documentHtml({ title: 'execmap', description: byId.get('index').description, body: main });
}
function sidebar(current) {
  const active = id => id === current ? ' aria-current="page"' : '';
  const treeIcon = (name, className = 'tree-icon', sheet = 'regular') => `<svg class="${className}" aria-hidden="true"><use href="${asset(`assets/console/${sheet}.svg`)}#${name}"></use></svg>`;
  const file = (page, className = '') => `<a href="${url(page.id)}"${className ? ` class="${className}"` : ''}${active(page.id)}>${treeIcon('file')}<span>${e(page.title)}</span></a>`;
  const branch = (label, name, items) => {
    const selected = items.some(page => page.id === current);
    return `<details class="sidebar-group tree-group${selected ? ' is-current' : ''}"${selected ? ' open' : ''}><summary>${treeIcon('folder', 'tree-icon tree-folder-closed')}${treeIcon('folder-open', 'tree-icon tree-folder-open')}<span class="tree-group-name">${e(label)} / ${e(slugify(name))}/</span>${treeIcon('chevron-down', 'tree-chevron', 'site')}</summary><div class="tree-children">${items.map(page => file(page)).join('')}</div></details>`;
  };
  const branches = sections.map(section => branch(section.label, section.name, section.pages.map(slug => byId.get(`rehberler/${slug}`))));
  branches.push(branch('04', 'Labs', labs), branch('05', 'Reading desk', ['okuma-rotalari', 'kaynak-kutuphanesi', 'kaynaklar'].map(id => byId.get(id))));
  const home = { id: 'index', title: 'README.md' };
  return `<aside lang="en" class="reading-sidebar" aria-label="Guide directory"><details class="sidebar-menu" open><summary>${treeIcon('guides', 'tree-icon tree-root-icon', 'site')}<span>Contents</span>${treeIcon('chevron-down', 'tree-chevron', 'site')}</summary><nav class="sidebar-links" aria-label="Reading tree">${file(home, 'tree-index')}${branches.join('')}</nav></details></aside>`;
}

// The lead repeats the first paragraph when the description was cut from it.
const visibleText = html => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]).replace(/\s+/g, ' ').trim();
function leadRepeatsBody(lead, html) {
  const first = html.match(/^\s*<p>([\s\S]*?)<\/p>/);
  const text = visibleText(lead).replace(/…$/, '').trim();
  return Boolean(first && text && visibleText(first[1]).startsWith(text));
}
function article(page) {
  const { html, toc } = renderMarkdown(page);
  const kindLabel = page.kind === 'laboratuvar' ? 'practice' : page.kind === 'sayfa' ? 'reference' : 'guide';
  const eyebrow = page.section.toLowerCase() === kindLabel ? page.section : `${page.section} / ${kindLabel}`;
  const lead = leadRepeatsBody(e(page.description), html) ? '' : `<p class="article-lead">${e(page.description)}</p>`;
  const ordered = page.kind === 'laboratuvar' ? labs : guides;
  const index = ordered.findIndex(item => item.id === page.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const parent = page.kind === 'laboratuvar' ? ['laboratuvarlar/index', 'Labs'] : page.kind === 'rehber' ? ['rehberler/index', 'Guides'] : null;
  const breadcrumbs = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${url('index')}">execmap</a><span aria-hidden="true">/</span>${parent ? `<a href="${url(parent[0])}">${parent[1]}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${e(page.title)}</span></nav>`;
  const tocHtml = (open = true) => `<details class="toc-details"${open ? ' open' : ''}><summary>On this page</summary><ol>${toc.map(item => `<li class="toc-depth-${item.depth}"><a href="#${e(item.id)}">${e(item.title)}</a></li>`).join('')}</ol></details>`;
  return documentHtml({ title: page.title, description: page.description, current: page.id, article: true, body: `<div class="reading-layout">${sidebar(page.id)}<main id="main" lang="en" class="reading-main" tabindex="-1">${breadcrumbs}<article lang="en" data-pagefind-body><header class="article-header"><p class="eyebrow">${e(eyebrow)}</p><h1>${e(page.title)}</h1><div class="article-meta console-meta"><span>${page.minutes} min read</span><span>English · Linux</span><a href="${asset(`raw/${page.id}.md`)}" download>Source Markdown ↓</a></div>${lead}</header><div class="mobile-toc">${tocHtml(false)}</div><div class="prose">${html}</div></article>${previous || next ? `<nav class="page-neighbors" aria-label="Previous and next page">${previous ? `<a href="${url(previous.id)}"><small>← Previous</small>${e(previous.title)}</a>` : '<span></span>'}${next ? `<a href="${url(next.id)}"><small>Next →</small>${e(next.title)}</a>` : '<span></span>'}</nav>` : ''}</main><aside lang="en" class="reading-toc" aria-label="Sections on this page">${tocHtml()}<a class="toc-top" href="#main">Back to top ↑</a></aside></div>` });
}
function listing(kind) {
  const isLab = kind === 'laboratuvarlar';
  const items = isLab ? labs : guides;
  const title = isLab ? 'Labs' : 'Guides';
  const desc = isLab ? 'Reproduce behavior with small C and C++ programs, observe it with tools, and compare results.' : 'From ELF layout to runtime: focused guides backed by technical sources.';
  const body = `<main id="main" lang="en" class="listing-main" tabindex="-1"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${url('index')}">execmap</a><span aria-hidden="true">/</span><span aria-current="page">${isLab ? 'labs' : 'guides'}</span></nav><div class="listing-intro"><p class="eyebrow">ls ./${isLab ? 'labs' : 'guides'}</p><h1>${title}</h1><p class="lead">${desc}</p>${isLab ? '<p>Use Linux, a C or C++ compiler, and GNU tools in your own working directory. Each lab lists its requirements and gives code, commands and expected results.</p>' : `<a href="${url('okuma-rotalari')}">Follow the reading routes →</a>`}</div>${isLab ? `<div class="labs-list">${labs.map((lab, i) => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(i + 1).padStart(2, '0')} <span>${e(lab.language || 'C')} / Linux</span></span><h2>${e(lab.title)} ↗</h2><p>${e(lab.description)}</p></a>`).join('')}</div>` : catalog(items, 'All guides')}</main>`;
  return documentHtml({ title, description: desc, current: `${kind}/index`, body });
}
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE.txt'));
await cp(path.join(root, 'NOTICE.md'), path.join(out, 'NOTICE.md'));
// Publish only the tested lab inputs, never local builds or measurement files.
const runtimeDownloads = path.join(out, 'labs/runtime-timing');
await mkdir(runtimeDownloads, { recursive: true });
for (const name of ['timing_lab.cpp', 'analyze.py', 'CMakeLists.txt', 'functions.bt.in', 'functions-child.bt.in', 'offcpu.bt', 'evidence.txt', 'validation.txt']) {
  await cp(path.join(root, 'examples/runtime-timing', name), path.join(runtimeDownloads, name));
}
for (const [directory, files] of [
  ['event-pipeline', ['event_pipeline.cpp', 'analyze.py', 'validation.txt']],
  ['thread-observation', ['sample_thread.py']],
]) {
  const destination = path.join(out, 'labs', directory);
  await mkdir(destination, { recursive: true });
  for (const name of files) await cp(path.join(root, 'examples', directory, name), path.join(destination, name));
}
async function save(name, html) { const file = path.join(out, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, html); }
await save('index.html', home());
for (const page of pages.filter(page => page.id !== 'index')) {
  await save(`${page.id}.html`, article(page));
  await save(`raw/${page.id}.md`, await readFile(path.join(root, 'content', `${page.id}.md`), 'utf8'));
}
for (const kind of ['rehberler', 'laboratuvarlar']) await save(`${kind}/index.html`, listing(kind));
const searchPages = [...guides, ...labs, ...pages.filter(page => page.kind === 'sayfa' && page.id !== 'index')];
await save('search-index.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, code: page.code, headings: page.headings, url: url(page.id), kind: page.kind, section: page.section })), null, 2));
for (const file of codeFiles) await save(file.path, file.text);
await save('search.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, url: url(page.id), type: 'execmap/', lang: 'en' })), null, 2));
await save('lisanslar.html', documentHtml({ title: 'Licenses and source notices', description: 'Licenses and source notices for execmap, the shared console theme, and fonts.', current: 'lisanslar', body: `<main id="main" lang="en" class="legal-main" tabindex="-1"><h1>Licenses and source notices</h1><div class="prose"><p>Copyright (C) 2026 Suleyman Poyraz. Unless otherwise stated, project code, technical writing, and laboratory examples are distributed under <code>GPL-3.0-or-later</code> without warranty. <a href="${asset('LICENSE.txt')}">GNU GPL v3 text</a> and <a href="${asset('NOTICE.md')}">source notices</a>.</p><p>The shared console theme comes from Zaryob’s <a href="https://github.com/Zaryob/console-theme">console-theme</a> project. Its CSS and JavaScript files retain their <code>GPL-2.0-or-later</code> notices. <a href="${asset('assets/console/COPYING')}">GNU GPL v2 text</a>.</p><p>IBM Plex Mono and IBM Plex Sans fonts are served locally. <a href="${asset('assets/console/fonts/OFL.txt')}">SIL Open Font License</a>.</p><p>Font Awesome SVG icons retain their attribution and are subject to CC BY 4.0. <a href="${asset('assets/console/ICONS-LICENSE.txt')}">Icon license notice</a>.</p><p>Citations credit the authors of standards, documentation, and research. External text, code, and artwork retain their own licenses.</p><p>Build tools: <a href="https://github.com/markedjs/marked">Marked</a> and <a href="https://github.com/highlightjs/highlight.js">highlight.js</a>. These libraries run at build time and are not bundled for the browser.</p><p><a href="${url('kaynak-kutuphanesi')}">Back to the resource library →</a></p></div></main>` }));
await save('404.html', documentHtml({ title: 'Page not found', description: 'Find the page you need in the guide directory.', current: '404', indexable: false, body: `<main id="main" lang="en" class="legal-main" tabindex="-1"><p class="eyebrow">execmap: No such file or directory</p><h1>404 / This page does not exist.</h1><p>The link may have changed. Continue from the guide directory or search the site.</p><p><a href="${url('rehberler/index')}">Back to the guide directory →</a></p></main>` }));
await save('.nojekyll', '');
const sitemapIds = ['index', ...pages.filter(page => page.id !== 'index').map(page => page.id), 'rehberler/index', 'laboratuvarlar/index'];
await save('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapIds.map(id => `<url><loc>https://zaryob.github.io${e(url(id))}</loc></url>`).join('')}</urlset>`);
console.log(`execmap: ${pages.length} content pages, 2 directories, resources and search index → _site/ (base: ${base || '/'})`);
