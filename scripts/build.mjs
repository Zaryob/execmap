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
const icon = (name, size = 18) => {
  const paths = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', chevron: '<path d="m6 9 6 6 6-6"/>', terminal: '<path d="m4 6 5 6-5 6m8 0h8"/>' };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
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
      return `<h${depth} id="${id}">${content}<a class="heading-anchor" href="#${id}" aria-label="${e(raw)} section link">#</a></h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || 'text').split(/\s/)[0];
      const target = language === 'sh' ? 'bash' : language;
      const highlighted = hljs.getLanguage(target) ? hljs.highlight(text, { language: target }).value : e(text);
      return `<div class="code-language">${e(language)}</div><pre tabindex="0" aria-label="${e(language)} code example"><code class="language-${e(language)}">${highlighted}</code></pre>\n`;
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
      <details class="console-projects" data-console-projects><summary aria-label="Switch project"><span class="console-project-path">~/execmap</span><span class="console-prompt-dollar">$</span>${icon('chevron', 12)}</summary><div class="console-project-menu">
        ${projects.map(project => `<a href="${e(project.key === 'execmap' ? `https://zaryob.github.io${base}/` : `https://zaryob.github.io${project.path}`)}"${project.key === 'execmap' ? ' aria-current="location"' : ''}><span>${e(project.title_en || project.title)}</span><small>${e(project.prompt)}</small></a>`).join('')}
      </div></details>
    </div>
    <div class="console-header-actions"><button type="button" class="console-search-compact" data-site-search aria-label="Search this site">${icon('search')}</button><button type="button" class="console-menu" data-console-menu aria-label="Open menu" aria-controls="console-navigation" aria-expanded="false">${icon('menu')}</button></div>
    <nav class="console-nav" id="console-navigation" aria-label="Main navigation">${nav.map(([id, label]) => `<a href="${url(id)}"${(selected === id.split('/')[0] || selected === id) ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}
      <div class="console-tools"><button type="button" class="search-button" data-site-search>${icon('search', 16)}<span>Search</span><kbd>/</kbd></button><label class="console-theme"><span class="console-sr-only">Theme</span><select data-console-theme aria-label="Color theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    </nav>
  </div></header>`;
}
function footer() {
  return `<footer class="console-footer" lang="en"><div><a href="${url('index')}">execmap</a><span class="footer-sep"> / </span>A Linux reverse engineering desk.<br><span class="footer-note">Read the file. Observe runtime. Verify the finding.</span></div><div class="footer-links"><a href="${url('kaynaklar')}">Sources</a><a href="https://github.com/Zaryob/execmap">GitHub ↗</a><a href="${asset('lisanslar.html')}">Licenses</a><a href="#main">Back to top ↑</a></div></footer>`;
}
function searchDialog() {
  return `<dialog lang="en" class="console-search" id="site-search" aria-labelledby="search-title"><div class="console-search__heading"><h2 id="search-title">execmap / search</h2><button type="button" data-search-close aria-label="Close search">Esc / Close</button></div><label for="search-input">Search guides, code examples, and resources</label><input id="search-input" type="search" placeholder="GOT, mprotect, stripped ELF…" autocomplete="off" spellcheck="false"><p id="search-status" class="console-search__status" role="status" aria-live="polite">Type a few letters to search.</p><ul id="search-results" class="console-search__results"></ul></dialog>`;
}
function documentHtml({ title, description, current = 'index', body, article = false }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f3ed"><meta name="site-root" content="${base}/"><meta name="description" content="${e(description)}"><title>${e(title)}${title === 'execmap' ? ' — Linux reverse engineering desk' : ' · execmap'}</title><link rel="icon" type="image/svg+xml" href="${asset('favicon.svg')}"><link rel="canonical" href="https://zaryob.github.io${url(current)}"><meta property="og:title" content="${e(title)} · execmap"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="https://zaryob.github.io${url(current)}"><meta property="og:site_name" content="execmap"><meta property="og:locale" content="en_US"><meta property="og:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="execmap — Linux reverse engineering desk. Read the file. Observe runtime. Verify the finding."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)} · execmap"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta name="twitter:image:alt" content="execmap — Linux reverse engineering desk"><meta property="og:type" content="${article ? 'article' : 'website'}"><script src="${asset('assets/console/theme.js')}"></script><link rel="stylesheet" href="${asset('assets/console/theme.css')}"><link rel="stylesheet" href="${asset('style.css')}"><script type="module" src="${asset('app.js')}"></script></head><body class="console-site execmap-site">${header(current)}${body}${footer()}${searchDialog()}<div class="console-sr-only" id="site-announcement" role="status" aria-live="polite"></div></body></html>`;
}
function listRow(page, index) {
  return `<li class="catalog-row" data-catalog-item data-group="${e(page.group)}" data-search="${e(`${page.title} ${page.description} ${page.section}`)}"><span class="row-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><a class="row-title" href="${url(page.id)}">${e(page.title)}</a><p>${e(page.description)}</p></div><span class="row-meta">${e(page.section)}<br>${page.minutes} min read</span><a class="row-arrow" href="${url(page.id)}" aria-label="${e(page.title)} — open guide">↗</a></li>`;
}
function catalog(items, title, filter = true) {
  return `<section id="catalog" class="catalog-section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">find ./guides -type f</p><h2 id="catalog-title">${title}</h2></div><span class="section-count">${items.length} guides</span></div>
  <div class="catalog-controls" data-js-only hidden><label class="catalog-search">${icon('search')}<span class="console-sr-only">Filter guides</span><input id="catalog-query" type="search" placeholder="Search by title or topic…" autocomplete="off"></label>${filter ? `<div class="filter-tabs" role="group" aria-label="Topic filter"><button type="button" data-filter="all" aria-pressed="true">All</button>${sections.map(section => `<button type="button" data-filter="${section.key}" aria-pressed="false">${section.name}</button>`).join('')}</div>` : ''}</div>
  <p class="filter-status" id="catalog-status" role="status" aria-live="polite" data-js-only hidden>${items.length} guides shown.</p><ol class="catalog-list">${items.map(listRow).join('')}</ol><div class="empty-state" id="catalog-empty" hidden><p>No guides match this search.</p><button type="button" data-reset-filters>Clear filters</button></div></section>`;
}
function home() {
  const main = `<main id="main" lang="en" class="home-main" tabindex="-1"><section class="home-intro"><div class="intro-copy"><p class="eyebrow">~/execmap · GNU/Linux investigation desk</p><h1>Follow Linux programs<br>from file to memory.</h1><p class="lead">Read the ELF file, loader, and runtime<br class="desktop-break"> as parts of the same story.</p><p class="intro-detail">Source-backed guides and small, practical reverse engineering labs. Start with <code>readelf</code>; verify your findings with GDB, perf, and eBPF.</p><div class="intro-actions"><a class="primary-link" href="${url('rehberler/elf-dosyadan-bellege')}">Open the first guide ${icon('arrow')}</a><a href="${url('okuma-rotalari')}">Reading routes ↗</a></div></div>
    <div class="terminal-preview" aria-label="Investigation steps from an ELF file to runtime"><div class="terminal-title"><span>${icon('terminal', 15)} the journey of an ELF</span><span>x86-64 / Linux</span></div><div class="terminal-body"><p><span class="prompt">$</span> readelf -lW ./ornek</p><p class="terminal-muted">Elf file type is DYN</p><div class="segment-line"><span>LOAD</span><span>0x0000</span><span>R--</span><i class="segment-bar seg-a"></i></div><div class="segment-line"><span>LOAD</span><span>0x1000</span><span>R-X</span><i class="segment-bar seg-b"></i></div><div class="segment-line"><span>LOAD</span><span>0x2000</span><span>R--</span><i class="segment-bar seg-c"></i></div><div class="segment-line"><span>LOAD</span><span>0x3000</span><span>RW-</span><i class="segment-bar seg-d"></i></div><div class="trace-line"><span>file</span><b>→</b><span>loader</span><b>→</b><span>memory</span><b>→</b><span>execution</span></div><p class="terminal-caption">Illustrative layout · not an analysis of a real file.</p><p class="terminal-final"><span class="prompt">$</span> <span class="cursor" aria-hidden="true">▌</span></p></div></div></section>
    <div class="stats-strip" aria-label="Content overview"><span><strong>${guides.length}</strong> guides</span><span><strong>${labs.length}</strong> labs</span><span>ELF · GDB · perf · eBPF</span><a href="${url('kaynak-kutuphanesi')}">Follow it to the source ↗</a></div>
    <section class="routes-section" aria-labelledby="routes-title"><div class="section-heading"><div><p class="eyebrow">cd ./where-to-start</p><h2 id="routes-title">Choose an investigation question.</h2></div><a href="${url('okuma-rotalari')}">All routes →</a></div><div class="route-grid">${routes.map(route => `<a class="route-card" href="${url(route.pages[0])}"><span class="route-number">/${route.n}</span><h3>${route.title} <span>↗</span></h3><p>${route.text}</p><code>${e(route.code)}</code></a>`).join('')}</div></section>
    ${catalog(guides, 'Guide directory')}
    <section class="lab-section" aria-labelledby="labs-title"><div class="section-heading"><div><p class="eyebrow">mkdir experiment &amp;&amp; cd experiment</p><h2 id="labs-title">Read. Compile. Compare.</h2></div><a href="${url('laboratuvarlar/index')}">Browse the labs →</a></div><div class="lab-grid">${labs.map((lab, i) => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(i + 1).padStart(2, '0')} <span>C / Linux</span></span><h3>${e(lab.title)} ↗</h3><p>${e(lab.description)}</p><span class="lab-bottom">Code + commands + expected results</span></a>`).join('')}</div></section>
    <section class="source-banner"><div><p class="eyebrow">man elf · reference desk</p><h2>A finding is as strong as its source.</h2><p>ABI specifications, Linux source, and tool authors’ documentation,<br class="desktop-break"> with their scope and limits explained.</p></div><a href="${url('kaynak-kutuphanesi')}">Open the resource library ${icon('arrow')}</a></section>
  </main>`;
  return documentHtml({ title: 'execmap', description: byId.get('index').description, body: main });
}
function sidebar(current) {
  const active = id => id === current ? ' aria-current="page"' : '';
  return `<aside lang="en" class="reading-sidebar" aria-label="Guide directory"><details class="sidebar-menu" open><summary>Contents ${icon('chevron', 14)}</summary><div class="sidebar-links"><a class="sidebar-home" href="${url('index')}">← Investigation desk</a>${sections.map(section => `<div class="sidebar-group"><p>${section.label} / ${section.name}</p>${section.pages.map(slug => byId.get(`rehberler/${slug}`)).map(page => `<a href="${url(page.id)}"${active(page.id)}>${e(page.title)}</a>`).join('')}</div>`).join('')}<div class="sidebar-group"><p>04 / Labs</p>${labs.map(page => `<a href="${url(page.id)}"${active(page.id)}>${e(page.title)}</a>`).join('')}</div><div class="sidebar-group"><p>05 / Reading desk</p>${['okuma-rotalari', 'kaynak-kutuphanesi', 'kaynaklar'].map(id => `<a href="${url(id)}"${active(id)}>${e(byId.get(id).title)}</a>`).join('')}</div></div></details></aside>`;
}
function article(page) {
  const { html, toc } = renderMarkdown(page);
  const ordered = page.kind === 'laboratuvar' ? labs : guides;
  const index = ordered.findIndex(item => item.id === page.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const parent = page.kind === 'laboratuvar' ? ['laboratuvarlar/index', 'Labs'] : page.kind === 'rehber' ? ['rehberler/index', 'Guides'] : null;
  const breadcrumbs = `<nav class="breadcrumbs" aria-label="Breadcrumbs"><a href="${url('index')}">execmap</a><span aria-hidden="true">/</span>${parent ? `<a href="${url(parent[0])}">${parent[1]}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${e(page.title)}</span></nav>`;
  const tocHtml = (open = true) => `<details class="toc-details"${open ? ' open' : ''}><summary>On this page</summary><ol>${toc.map(item => `<li class="toc-depth-${item.depth}"><a href="#${e(item.id)}">${e(item.title)}</a></li>`).join('')}</ol></details>`;
  return documentHtml({ title: page.title, description: page.description, current: page.id, article: true, body: `<div class="reading-layout">${sidebar(page.id)}<main id="main" lang="en" class="reading-main" tabindex="-1">${breadcrumbs}<article lang="en" data-pagefind-body><header class="article-header"><p class="eyebrow">${e(page.section)} / ${page.kind === 'laboratuvar' ? 'practice' : page.kind === 'sayfa' ? 'reference' : 'guide'}</p><h1>${e(page.title)}</h1><p class="article-lead">${e(page.description)}</p><div class="article-meta"><span>${page.minutes} min read</span><span>English · Linux</span><a href="${asset(`raw/${page.id}.md`)}" download>Download Markdown ↓</a></div></header><div class="mobile-toc">${tocHtml(false)}</div><div class="prose">${html}</div></article>${previous || next ? `<nav class="page-neighbors" aria-label="Previous and next page">${previous ? `<a href="${url(previous.id)}"><small>← Previous</small>${e(previous.title)}</a>` : '<span></span>'}${next ? `<a href="${url(next.id)}"><small>Next →</small>${e(next.title)}</a>` : '<span></span>'}</nav>` : ''}</main><aside lang="en" class="reading-toc" aria-label="Sections on this page">${tocHtml()}<a class="toc-top" href="#main">Back to top ↑</a></aside></div>` });
}
function listing(kind) {
  const isLab = kind === 'laboratuvarlar';
  const items = isLab ? labs : guides;
  const title = isLab ? 'Labs' : 'Guides';
  const desc = isLab ? 'Reproduce behavior with small C programs, observe it with tools, and compare results.' : 'From ELF layout to runtime: focused guides backed by technical sources.';
  const body = `<main id="main" lang="en" class="listing-main" tabindex="-1"><nav class="breadcrumbs" aria-label="Breadcrumbs"><a href="${url('index')}">execmap</a><span>/</span><span>${isLab ? 'labs' : 'guides'}</span></nav><div class="listing-intro"><p class="eyebrow">ls ./${isLab ? 'labs' : 'guides'}</p><h1>${title}</h1><p class="lead">${desc}</p>${isLab ? '<p>Use Linux, a C compiler, and GNU tools in your own working directory. Each lab lists its requirements.</p>' : `<a href="${url('okuma-rotalari')}">Follow the reading routes →</a>`}</div>${isLab ? `<div class="labs-list">${labs.map((lab, i) => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(i + 1).padStart(2, '0')} <span>C / Linux</span></span><h2>${e(lab.title)} ↗</h2><p>${e(lab.description)}</p><span class="lab-bottom">Code + commands + expected results</span></a>`).join('')}</div>` : catalog(items, 'All guides')}</main>`;
  return documentHtml({ title, description: desc, current: `${kind}/index`, body });
}
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE.txt'));
await cp(path.join(root, 'NOTICE.md'), path.join(out, 'NOTICE.md'));
async function save(name, html) { const file = path.join(out, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, html); }
await save('index.html', home());
for (const page of pages.filter(page => page.id !== 'index')) {
  await save(`${page.id}.html`, article(page));
  await save(`raw/${page.id}.md`, await readFile(path.join(root, 'content', `${page.id}.md`), 'utf8'));
}
for (const kind of ['rehberler', 'laboratuvarlar']) await save(`${kind}/index.html`, listing(kind));
const searchPages = [...guides, ...labs, ...pages.filter(page => page.kind === 'sayfa' && page.id !== 'index')];
await save('search-index.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, code: page.code, headings: page.headings, url: url(page.id), kind: page.kind, section: page.section })), null, 2));
await save('search.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, url: url(page.id), type: 'execmap/', lang: 'en' })), null, 2));
await save('lisanslar.html', documentHtml({ title: 'Licenses and source notices', description: 'Licenses and source notices for execmap, the shared console theme, and fonts.', current: 'lisanslar', body: `<main id="main" lang="en" class="legal-main" tabindex="-1"><h1>Licenses and source notices</h1><div class="prose"><p>Copyright (C) 2026 Suleyman Poyraz. Unless otherwise stated, project code, technical writing, and laboratory examples are distributed under <code>GPL-3.0-or-later</code> without warranty. <a href="${asset('LICENSE.txt')}">GNU GPL v3 text</a> and <a href="${asset('NOTICE.md')}">source notices</a>.</p><p>The shared console theme comes from Zaryob’s <a href="https://github.com/Zaryob/console-theme">console-theme</a> project. Its CSS and JavaScript files retain their <code>GPL-2.0-or-later</code> notices. <a href="${asset('assets/console/COPYING')}">GNU GPL v2 text</a>.</p><p>IBM Plex Mono and IBM Plex Sans fonts are served locally. <a href="${asset('assets/console/fonts/OFL.txt')}">SIL Open Font License</a>.</p><p>Font Awesome SVG icons retain their attribution and are subject to CC BY 4.0. <a href="${asset('assets/console/ICONS-LICENSE.txt')}">Icon license notice</a>.</p><p>Citations credit the authors of standards, documentation, and research. External text, code, and artwork retain their own licenses.</p><p>Build tools: <a href="https://github.com/markedjs/marked">Marked</a> and <a href="https://github.com/highlightjs/highlight.js">highlight.js</a>. These libraries run at build time and are not bundled for the browser.</p><p><a href="${url('kaynak-kutuphanesi')}">Back to the resource library →</a></p></div></main>` }));
await save('404.html', documentHtml({ title: 'Page not found', description: 'Find the page you need in the guide directory.', current: '404', body: `<main id="main" lang="en" class="legal-main" tabindex="-1"><p class="eyebrow">execmap: No such file or directory</p><h1>404 / This page does not exist.</h1><p>The link may have changed. Continue from the guide directory or search the site.</p><p><a href="${url('rehberler/index')}">Back to the guide directory →</a></p></main>` }));
await save('.nojekyll', '');
const sitemapIds = ['index', ...pages.filter(page => page.id !== 'index').map(page => page.id), 'rehberler/index', 'laboratuvarlar/index'];
await save('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapIds.map(id => `<url><loc>https://zaryob.github.io${e(url(id))}</loc></url>`).join('')}</urlset>`);
console.log(`execmap: ${pages.length} content pages, 2 directories, resources and search index → _site/ (base: ${base || '/'})`);
