import { abiArgumentName, abiLocationSummary, argumentCounts, argumentLocations, functionAbis } from '../public/abi-explorer.mjs';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import { loadPages, escapeHtml as e, slugify, normalizeBase, pageUrl, rewriteLink } from '../src/content.mjs';
import { sections, labOrder, routes } from '../src/catalog.mjs';
import { turkishSections } from '../src/translations-tr.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const base = normalizeBase(process.env.SITE_BASEURL ?? '/execmap');
const url = id => id === 'tr' ? `${base}/tr/` : pageUrl(id, base);
const asset = name => `${base}/${name}`;
const pages = await loadPages(path.join(root, 'content'));
const translations = new Map((await loadPages(path.join(root, 'content-tr'), { language: 'tr' }))
  .map(page => [page.id, page]));
const projects = JSON.parse(await readFile(path.join(root, 'public/console-projects.json'), 'utf8'));
const byId = new Map(pages.map(page => [page.id, page]));
const pageIds = new Set(byId.keys());
const readingId = (id, language) => language === 'tr'
  ? (id === 'index' ? 'tr' : `tr/${id}`)
  : id;
const readingUrl = (id, language) => url(readingId(id, language));
const guides = pages.filter(p => p.kind === 'rehber').sort((a, b) => a.order - b.order);
const labs = labOrder.map(slug => byId.get(`laboratuvarlar/${slug}`));
// The route cards open each route's first guide. Feature the next guide to avoid duplicate home links.
const featuredGuides = routes.map(route => byId.get(route.pages[1] ?? route.pages[0]));
const featuredLabs = [1, 5, 8, 11].map(number => labs[number - 1]);
const icon = (name, size = 18) => {
  const paths = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', chevron: '<path d="m6 9 6 6 6-6"/>', terminal: '<path d="m4 6 5 6-5 6m8 0h8"/>' };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
// Code blocks with a file name are also published as downloads.
const codeFiles = [];
const headingIds = new Map();
const numberedLanguages = new Set(['c', 'cpp', 'python', 'x86asm', 'json']);
const foldLines = 30;
function functionAbiExplorer(language) {
  const tr = language === 'tr';
  const count = 10;
  const defaultAbi = functionAbis.sysv;
  const locations = argumentLocations(defaultAbi, count);
  const options = Object.entries(functionAbis).map(([key, { label }]) => `<option value="${key}">${e(label)}</option>`).join('');
  const counts = argumentCounts.map(value => `<option${value === count ? ' selected' : ''}>${value}</option>`).join('');
  return `<div class="abi-explorer" data-abi-explorer>
    <div class="abi-explorer-controls" data-js-only hidden>
      <label for="function-abi">${tr ? 'İşlev ABI’si' : 'Function ABI'} <select id="function-abi">${options}</select></label>
      <label for="abi-arity">${tr ? 'Argüman sayısı' : 'Argument count'} <select id="abi-arity">${counts}</select></label>
    </div>
    <noscript><p>${e(defaultAbi.label)} · ${count} ${tr ? 'argüman' : 'arguments'}</p></noscript>
    <p data-abi-entry>${e(tr ? defaultAbi.entryTr : defaultAbi.entry)}</p>
    <p role="status" data-abi-result>${abiLocationSummary(defaultAbi, count, tr)}</p>
    <ul role="list" aria-label="${tr ? 'Argüman konumları' : 'Argument locations'}">${locations.map((location, index) => `<li>${abiArgumentName(index + 1, tr)} <code>${e(location)}</code></li>`).join('')}</ul>
  </div>`;
}
function renderMarkdown(page, language) {
  const tr = language === 'tr';
  const toc = [];
  const seen = new Map();
  const originalIds = headingIds.get(page.id);
  const anchors = [];
  const md = new Marked({ gfm: true, breaks: false });
  md.use({ renderer: {
    heading({ tokens, depth }) {
      const content = this.parser.parseInline(tokens);
      const raw = tokens.map(t => t.text || '').join('');
      const slug = slugify(raw);
      const count = seen.get(slug) || 0;
      seen.set(slug, count + 1);
      const id = tr ? originalIds?.[anchors.length] : count ? `${slug}-${count + 1}` : slug;
      if (!id) throw new Error(`Extra translated heading in ${page.id}: ${raw}`);
      anchors.push(id);
      if (depth === 2 || depth === 3) toc.push({ title: raw.replace(/[`*]/g, ''), id, depth });
      return `<h${depth} id="${id}" aria-label="${e(raw.replace(/[`*]/g, ''))}">${content}<a class="heading-anchor" href="#${id}" aria-label="${e(raw)} ${tr ? 'bölüm bağlantısı' : 'section link'}">#</a></h${depth}>\n`;
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
        const published = `code/${page.id}/${fileName}`;
        const content = text.endsWith('\n') ? text : `${text}\n`;
        const original = codeFiles.find(file => file.path === published);
        if (tr) {
          if (original?.text !== content) throw new Error(`Translated code differs: ${published}`);
        } else {
          if (original) throw new Error(`Duplicate code file "${fileName}" in ${page.id}`);
          codeFiles.push({ path: published, text: content });
        }
        download = `<a class="code-download" href="${asset(published)}" download="${e(fileName)}" aria-label="${tr ? `${e(fileName)} dosyasını indir` : `Download ${e(fileName)}`}"><span class="code-download-word">${tr ? 'İndir' : 'Download'}&nbsp;</span>↓</a>`;
      }
      const numbered = fileName || numberedLanguages.has(target);
      const gutter = numbered ? `<span class="code-gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</span>` : '';
      const head = fileName
        ? `<div class="code-language code-file"><span class="code-tab" title="${e(fileName)}">${e(fileName)}</span><span class="code-info">${e(language)} · ${lines} ${tr ? 'satır' : 'lines'}</span>${download}</div>`
        : `<div class="code-language">${e(label)}</div>`;
      const foldable = lines > foldLines ? ` data-code-fold="${lines}"` : '';
      return `<div class="code-block${numbered ? ' code-numbered' : ''}"${foldable}>${head}<pre tabindex="0" role="group" aria-label="${e(label)} ${tr ? 'kod örneği' : 'code example'}"${numbered ? ' class="has-lines"' : ''}>${gutter}<code class="language-${e(language)}">${highlighted}</code></pre></div>\n`;
    },
    link({ href, title, tokens }) {
      const address = rewriteLink(href, page.id, base, pageIds, id => readingUrl(id, language));
      let destination = address;
      if (tr && !/^(?:https?:|mailto:|\/|#)/i.test(address)) {
        const original = new URL(address, `https://zaryob.github.io${url(page.id)}`);
        destination = original.pathname + original.search + original.hash;
      }
      if (tr) destination = destination.replace(/^https:\/\/zaryob\.github\.io\/syscall\/(?=$|[?#]|(?:arch|call|errno|signals|ioctl)\/)/, 'https://zaryob.github.io/syscall/tr/');
      return `<a href="${e(destination)}"${title ? ` title="${e(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    blockquote({ text, tokens }) {
      const note = text.match(/^\[!(NOTE|WARNING)\]\s*\n?/);
      if (!note) return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      const label = note[1] === 'WARNING' ? (tr ? 'Uyarı' : 'Warning') : (tr ? 'Not' : 'Note');
      return `<aside class="admonition admonition-${note[1].toLowerCase()}" aria-label="${label}"><p class="admonition-title">${label}</p>${md.parse(text.slice(note[0].length))}</aside>\n`;
    },
    html({ text }) { return e(text); },
  }});
  if (page.id === 'rehberler/abi') md.use({ extensions: [{
    name: 'functionAbiExplorer',
    level: 'block',
    tokenizer(src) {
      const marker = /^\[\[abi-explorer\]\](?:\r?\n|$)/.exec(src);
      if (marker) return { type: 'functionAbiExplorer', raw: marker[0] };
    },
    renderer: () => functionAbiExplorer(language),
  }] });
  const content = page.markdown.replace(/^\s*# .+\r?\n/, '');
  const html = md.parse(content);
  if (tr) {
    if (anchors.length !== originalIds?.length) throw new Error(`Missing translated heading in ${page.id}`);
  } else {
    headingIds.set(page.id, anchors);
  }
  return { html, toc };
}
function projectPath(project, language) {
  if (project.key === 'execmap') return url(language === 'tr' ? 'tr' : 'index');
  return 'https://zaryob.github.io' + ((language === 'tr' ? project.path_tr : project.path_en) ?? project.path);
}
function header(current, language) {
  const tr = language === 'tr';
  const start = tr ? 'tr' : 'index';
  const nav = [
    [start, tr ? 'Başlangıç' : 'Start'],
    [tr ? 'tr/rehberler/index' : 'rehberler/index', tr ? 'Rehberler' : 'Guides'],
    [tr ? 'tr/laboratuvarlar/index' : 'laboratuvarlar/index', tr ? 'Laboratuvarlar' : 'Labs'],
    [readingId('kaynaklar/index', language), tr ? 'Kaynaklar' : 'Resources'],
  ];
  const selected = nav.find(([id]) => current === id || (id.endsWith('/index') && current.startsWith(id.slice(0, -5))))?.[0]
    ?? (['kaynaklar', 'kaynak-kutuphanesi', 'okuma-rotalari'].some(id => current === readingId(id, language)) ? readingId('kaynaklar/index', language) : undefined);
  return `<a class="skip-link" href="#main">${tr ? 'İçeriğe geç' : 'Skip to content'}</a>
  <header class="console-header"><div class="console-header__inner">
    <div class="console-identity"><a class="console-brand" href="https://zaryob.github.io/${tr ? '' : 'en/'}" aria-label="${tr ? 'Zaryob ana sayfası' : 'Zaryob home'}">zaryob</a><span class="console-prompt-separator" aria-hidden="true">:</span>
      <details class="console-projects" data-console-projects><summary role="button" aria-controls="console-project-menu"><span class="console-project-path"><span class="console-prompt-separator">~/</span>execmap</span><span class="console-sr-only"> — ${tr ? 'Proje değiştir' : 'Switch project'}</span><span class="console-prompt-dollar" aria-hidden="true">$</span><span class="console-prompt-cursor" aria-hidden="true"></span>${icon('chevron', 12)}</summary><nav class="console-project-menu" id="console-project-menu" aria-label="${tr ? 'Zaryob projeleri' : 'Zaryob projects'}">
        ${projects.map(project => `<a href="${e(projectPath(project, language))}" data-project-tr="${e(projectPath(project, 'tr'))}" data-project-en="${e(projectPath(project, 'en'))}"${project.key === 'execmap' ? ' aria-current="location"' : ''}><span>${e((!tr && project.title_en) || project.title)}</span><small>${e(project.prompt)}</small></a>`).join('')}
      </nav></details>
    </div>
    <div class="console-header-actions">
      <button type="button" class="console-search-compact" data-site-search aria-label="${tr ? 'Execmap’te ara' : 'Search this site'}" aria-haspopup="dialog">${icon('search')}</button>
      <button type="button" class="console-menu" data-console-menu aria-label="${tr ? 'Menüyü aç' : 'Open menu'}" aria-controls="console-navigation" aria-expanded="false">${icon('menu')}</button>
    </div>
    <nav class="console-nav" id="console-navigation" aria-label="${tr ? 'Ana menü' : 'Main navigation'}">${nav.map(([id, label]) => `<a href="${url(id)}"${selected === id ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}
      <div class="console-tools">
        <button type="button" class="console-search-open" data-site-search aria-label="${tr ? 'Execmap’te ara' : 'Search Execmap'}" aria-haspopup="dialog" aria-keyshortcuts="/ Control+K Meta+K">${icon('search', 16)}<span>${tr ? 'Ara' : 'Search'}<span class="console-sr-only"> — Execmap</span></span><kbd aria-hidden="true">/</kbd></button>
        <label class="console-theme"><span>${tr ? 'Tema' : 'Theme'}</span><select id="console-theme-select" name="theme" data-console-theme aria-label="${tr ? 'Renk teması' : 'Color theme'}"><option value="system">${tr ? 'Sistem' : 'System'}</option><option value="dark">${tr ? 'Koyu' : 'Dark'}</option><option value="light">${tr ? 'Açık' : 'Light'}</option></select></label>
        <label class="console-language"><span>${tr ? 'Dil' : 'Language'}</span><select id="console-language-select" name="language" data-console-language aria-label="Language / Dil"><option value="tr" lang="tr"${tr ? ' selected' : ''}>TR</option><option value="en" lang="en"${tr ? '' : ' selected'}>EN</option></select></label>
      </div>
    </nav>
  </div></header>`;
}
function footer(language) {
  const tr = language === 'tr';
  const column = (title, label, links) => `<nav class="suite-footer__col" aria-label="${e(label)}"><p class="suite-footer__title">${title}</p><ul>${links.map(link => `<li>${link}</li>`).join('')}</ul></nav>`;
  const site = column('~/execmap/', 'execmap', [
    `<a href="${url(tr ? 'tr' : 'index')}">${tr ? 'Başlangıç' : 'Start'}</a>`,
    `<a href="${readingUrl('kaynaklar/index', language)}">${tr ? 'Kaynaklar' : 'Resources'}</a>`,
    `<a href="${readingUrl('lisanslar', language)}">${tr ? 'Lisanslar' : 'Licenses'}</a>`,
  ]);
  const suite = column(tr ? '~/siteler/' : '~/sites/', tr ? 'Zaryob siteleri' : 'Zaryob sites', projects.filter(project => project.key !== 'home').map(project => `<a href="${e(projectPath(project, language))}"${project.key === 'execmap' ? ' aria-current="location"' : ''}>${e(project.prompt)}/<span class="console-sr-only"> — ${e((!tr && project.title_en) || project.title)}</span></a>`)).replace('<ul>', '<ul class="console-suite__list">');
  const contact = column(tr ? '~/iletişim' : '~/contact', tr ? 'Sosyal bağlantılar' : 'Social links', ['<a href="https://github.com/Zaryob" rel="me">GitHub <span aria-hidden="true">↗</span></a>', '<a href="https://linkedin.com/in/suleyman-poyraz" rel="me">LinkedIn <span aria-hidden="true">↗</span></a>', '<a href="https://medium.com/@zaryob" rel="me">Medium <span aria-hidden="true">↗</span></a>', `<a href="mailto:zaryob.dev@gmail.com">${tr ? 'E-posta' : 'Email'}</a>`]);
  return `<footer class="suite-footer" id="site-footer"><div class="suite-footer__inner"><p class="suite-footer__prompt" aria-hidden="true"><span class="suite-footer__host">zaryob</span>:~/execmap $ <span class="suite-footer__cmd">ls -F</span></p><div class="suite-footer__cols">${site}${suite}${contact}</div>
    <div class="suite-footer__legal"><span><span aria-hidden="true"># </span>© Süleyman Poyraz · ${tr ? 'Linux tersine mühendislik rehberleri' : 'A Linux reverse engineering desk.'}</span>
    <span>${tr ? 'Dosyayı okuyun. Çalışan programı gözlemleyin. Bulguyu doğrulayın.' : 'Read the file. Observe runtime. Verify the finding.'}<a class="suite-footer__top" href="#main"><span aria-hidden="true">↑ </span>${tr ? 'Başa dön' : 'Back to top'}</a></span></div></div></footer>`;
}
function searchDialog(language) {
  const tr = language === 'tr';
  return `<dialog class="console-search" id="site-search" aria-labelledby="search-title">
    <div class="console-search__heading"><h2 id="search-title">${tr ? 'Execmap’te ara' : 'execmap / search'}</h2>
    <button type="button" class="search-close" data-search-close aria-label="${tr ? 'Aramayı kapat' : 'Close search'}"><span class="search-close-long"><span class="console-key-hint" aria-hidden="true">Esc / </span>${tr ? 'Kapat' : 'Close'}</span><span class="search-close-short" aria-hidden="true">×</span></button></div>
    <label for="search-input">${tr ? 'Rehberlerde, kod örneklerinde ve kaynaklarda ara' : 'Search guides, code examples, and resources'}</label>
    <input id="search-input" type="search" placeholder="${tr ? 'GOT, sistem çağrısı, mprotect…' : 'GOT, mprotect, stripped ELF…'}" autocomplete="off" spellcheck="false">
    <p id="search-status" class="console-search__status" role="status" aria-live="polite">${tr ? 'Aramak için bir terim yazın.' : 'Type a few letters to search.'}</p>
    <ul id="search-results" class="console-search__results"></ul></dialog>`;
}
const editionPairs = [
  ['index', 'tr'],
  ['rehberler/index', 'tr/rehberler/index'],
  ['laboratuvarlar/index', 'tr/laboratuvarlar/index'],
  ['kaynaklar/index', 'tr/kaynaklar/index'],
  ['lisanslar', 'tr/lisanslar'],
  ['404', 'tr/404'],
  ...[...translations.keys()].map(id => [id, readingId(id, 'tr')]),
];
const editionsFor = id => editionPairs.find(pair => pair.includes(id));
const canonicalUrl = id => 'https://zaryob.github.io' + url(id);
function documentHtml({ title, description, current = 'index', body, article = false, indexable = true, language = 'en' }) {
  const fullTitle = title === 'execmap' ? 'execmap — Linux reverse engineering desk' : `${title} · execmap`;
  const address = canonicalUrl(current);
  const editions = editionsFor(current);
  const localized = Boolean(editions) || language === 'tr';
  const alternateLinks = editions
    ? `<link rel="alternate" hreflang="en" href="${canonicalUrl(editions[0])}" data-language-route="${url(editions[0])}"><link rel="alternate" hreflang="tr" href="${canonicalUrl(editions[1])}" data-language-route="${url(editions[1])}"><link rel="alternate" hreflang="x-default" href="${canonicalUrl(editions[0])}">`
    : '';
  return `<!doctype html>
<html lang="${language}"${localized ? ` data-route-language="${language}"` : ''}${localized && !editions ? ` data-fixed-ui-language="${language}"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><meta name="theme-color" content="#f5f3ed"><script defer src="https://cloud.umami.is/script.js" data-website-id="2ddfb587-71f9-4068-a66b-1f92ad4bf209"></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-M6NQ8DV1XP"></script><script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-M6NQ8DV1XP');</script><meta name="site-root" content="${base}/"><meta name="description" content="${e(description)}"><title>${e(fullTitle)}</title><link rel="icon" type="image/svg+xml" href="${asset('favicon.svg')}">${indexable ? `<link rel="canonical" href="${address}">` : '<meta name="robots" content="noindex">'}${alternateLinks}<meta property="og:title" content="${e(fullTitle)}"><meta property="og:description" content="${e(description)}">${indexable ? `<meta property="og:url" content="${address}">` : ''}<meta property="og:site_name" content="execmap"><meta property="og:locale" content="${language === 'tr' ? 'tr_TR' : 'en_US'}"><meta property="og:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="execmap — Linux reverse engineering desk. Read the file. Observe runtime. Verify the finding."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(fullTitle)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="https://zaryob.github.io${asset('social-card.png')}"><meta name="twitter:image:alt" content="execmap — Linux reverse engineering desk"><meta property="og:type" content="${article ? 'article' : 'website'}">${localized ? `<script src="${asset('assets/console/language.js')}"></script><script src="${asset('assets/console/i18n.js')}"></script>` : ''}<script src="${asset('assets/console/theme.js')}"></script><link rel="stylesheet" href="${asset('assets/console/theme.css')}"><link rel="stylesheet" href="${asset('style.css')}"><script type="module" src="${asset('app.js')}"></script></head><body class="console-site execmap-site">${header(current, language)}${body}${footer(language)}${searchDialog(language)}<div class="console-sr-only" id="site-announcement" role="status" aria-live="polite"></div></body></html>`;
}
function listRow(page, index, language) {
  const tr = language === 'tr';
  const entry = tr ? turkishMetadata(page) : page;
  return `<li class="catalog-row" data-catalog-item data-group="${e(entry.group)}" data-search="${e(`${entry.title} ${entry.description} ${entry.section}`)}"><span class="row-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><a class="row-title" href="${readingUrl(entry.id, language)}">${e(entry.title)}</a><p>${e(entry.description)}</p></div><span class="row-meta">${e(entry.section)}<br>${entry.minutes} ${tr ? 'dk okuma' : 'min read'}</span></li>`;
}
function guideCatalog(language) {
  const tr = language === 'tr';
  return `<section id="catalog" class="catalog-section" aria-labelledby="catalog-title">
    <div class="section-heading"><h2 id="catalog-title">${tr ? 'Tüm rehberler' : 'All guides'}</h2><span class="section-count">${guides.length} ${tr ? 'rehber' : 'guides'}</span></div>
    <div class="catalog-controls" data-js-only hidden>
      <label class="catalog-search">${icon('search')}<span class="console-sr-only">${tr ? 'Rehberleri filtrele' : 'Filter guides'}</span><input id="catalog-query" type="search" placeholder="${tr ? 'Başlığa veya konuya göre ara…' : 'Search by title or topic…'}" autocomplete="off"></label>
      <div class="filter-tabs" role="group" aria-label="${tr ? 'Konu filtresi' : 'Topic filter'}"><button type="button" data-filter="all" aria-pressed="true">${tr ? 'Tümü' : 'All'}</button>${sections.map(section => `<button type="button" data-filter="${section.key}" aria-pressed="false">${e(tr ? turkishSections[section.name] : section.name)}</button>`).join('')}</div>
    </div>
    <p class="filter-status" id="catalog-status" role="status" aria-live="polite" data-js-only hidden></p>
    <ol class="catalog-list">${guides.map((page, index) => listRow(page, index, language)).join('')}</ol>
    <div class="empty-state" id="catalog-empty" hidden><p>${tr ? 'Aramanızla eşleşen rehber bulunamadı.' : 'No guides match this search.'}</p><button type="button" data-reset-filters>${tr ? 'Filtreleri temizle' : 'Clear filters'}</button></div>
  </section>`;
}
function labCard(page, language, heading) {
  const tr = language === 'tr';
  const entry = tr ? turkishMetadata(page) : page;
  const number = String(labs.indexOf(page) + 1).padStart(2, '0');
  return `<a class="lab-card" href="${readingUrl(page.id, language)}"><span class="lab-number">${tr ? 'DENEY' : 'LAB'} ${number} <span>${e(page.language || 'C')} / Linux</span></span><${heading}>${e(entry.title)} ↗</${heading}><p>${e(entry.description)}</p></a>`;
}
function terminalPreview(language) {
  const tr = language === 'tr';
  return `<figure class="terminal-preview console-hero__panel">
        <figcaption class="terminal-title console-hero__panel-head">
          <span>${icon('terminal', 15)} ${tr ? 'ELF dosyasının yolculuğu' : 'the journey of an ELF'}</span><span>x86-64 / Linux</span>
        </figcaption>
        <div class="terminal-body">
          <p><span class="prompt">$</span> readelf -lW ./ornek</p>
          <p class="terminal-muted">${tr ? 'ELF dosyasının türü: DYN' : 'Elf file type is DYN'}</p>
          <div class="segment-line"><span>LOAD</span><span>0x0000</span><span>R--</span><i class="segment-bar seg-a"></i></div>
          <div class="segment-line"><span>LOAD</span><span>0x1000</span><span>R-X</span><i class="segment-bar seg-b"></i></div>
          <div class="segment-line"><span>LOAD</span><span>0x2000</span><span>R--</span><i class="segment-bar seg-c"></i></div>
          <div class="segment-line"><span>LOAD</span><span>0x3000</span><span>RW-</span><i class="segment-bar seg-d"></i></div>
          <div class="trace-line"><span>${tr ? 'dosya' : 'file'}</span><b>→</b><span>${tr ? 'yükleyici' : 'loader'}</span><b>→</b><span>${tr ? 'bellek' : 'memory'}</span><b>→</b><span>${tr ? 'yürütme' : 'execution'}</span></div>
          <p class="terminal-caption">${tr ? 'Temsili segment düzeni.' : 'Illustrative segment layout.'}</p>
          <p class="terminal-final"><span class="prompt">$</span> <span class="cursor" aria-hidden="true">▌</span></p>
        </div>
      </figure>`;
}
function home(language) {
  const tr = language === 'tr';
  const heading = tr ? 'Linux programları nasıl çalışır?' : 'How Linux programs run';
  const lead = tr ? 'Bir ELF dosyasının belleğe nasıl yüklendiğini ve çalışan programı nasıl inceleyebileceğinizi rehberler ve deneylerle öğrenin.' : 'Follow an ELF file into memory and inspect the running process with practical guides and labs.';
  const main = `<main id="main" class="home-main" tabindex="-1"><div class="home-content">
    <section class="home-intro home-intro--with-preview" aria-labelledby="home-title">
      <div>
        <h1 id="home-title">${heading}</h1>
        <p class="lead">${lead}</p>
        <div class="home-actions"><a class="primary-link" href="${readingUrl('rehberler/elf-dosyadan-bellege', language)}">${tr ? 'İlk ELF rehberi' : 'Start with ELF'} ${icon('arrow')}</a></div>
      </div>
      ${terminalPreview(language)}
    </section>
    <section class="routes-section" aria-labelledby="routes-title">
      <div class="section-heading"><h2 id="routes-title">${tr ? 'Okuma rotaları' : 'Reading routes'}</h2><a href="${readingUrl('okuma-rotalari', language)}">${tr ? 'Tüm okuma rotaları' : 'All reading routes'}</a></div>
      <div class="route-grid">${routes.map(route => `<a class="route-card" href="${readingUrl(route.pages[0], language)}"><h3>${e(route[language].title)} <span aria-hidden="true">→</span></h3><p>${e(route[language].text)}</p></a>`).join('')}</div>
    </section>
    <section class="catalog-section" aria-labelledby="featured-title">
      <div class="section-heading"><h2 id="featured-title">${tr ? 'Öne çıkan rehberler' : 'Featured guides'}</h2></div>
      <ol class="catalog-list">${featuredGuides.map(page => listRow(page, guides.indexOf(page), language)).join('')}</ol>
      <p class="section-more"><a href="${readingUrl('rehberler/index', language)}">${tr ? 'Tüm rehberler' : 'All guides'} →</a></p>
    </section>
    <section class="lab-section" aria-labelledby="labs-title">
      <div class="section-heading"><h2 id="labs-title">${tr ? 'Uygulama laboratuvarları' : 'Practical labs'}</h2></div>
      <div class="lab-grid">${featuredLabs.map(page => labCard(page, language, 'h3')).join('')}</div>
      <p class="section-more"><a href="${readingUrl('laboratuvarlar/index', language)}">${tr ? 'Tüm laboratuvarlar' : 'All labs'} →</a></p>
    </section>
    <section class="source-banner">
      <div><h2>${tr ? 'Kaynaklar' : 'Sources'}</h2><p>${tr ? 'ABI standartları, Linux kaynak kodu ve araç geliştiricilerinin belgeleri.' : 'ABI specifications, Linux source, and documentation from tool authors.'}</p></div>
      <a href="${readingUrl('kaynak-kutuphanesi', language)}">${tr ? 'Kaynak kütüphanesini aç' : 'Open the resource library'} ${icon('arrow')}</a>
    </section>
  </div></main>`;
  return documentHtml({ title: tr ? 'Linux ELF ve çalışma zamanı incelemesi' : 'execmap', description: tr ? lead : byId.get('index').description, current: readingId('index', language), language, body: main });
}
function sidebar(current, language) {
  const tr = language === 'tr';
  const active = id => id === current ? ' aria-current="page"' : '';
  const treeIcon = (name, className = 'tree-icon', sheet = 'regular') => `<svg class="${className}" aria-hidden="true"><use href="${asset(`assets/console/${sheet}.svg`)}#${name}"></use></svg>`;
  const file = (page, className = '') => {
    const title = tr ? translations.get(page.id)?.title ?? page.title : page.title;
    return `<a href="${readingUrl(page.id, language)}"${className ? ` class="${className}"` : ''}${active(page.id)}>${treeIcon('file')}<span>${e(title)}</span></a>`;
  };
  const branch = (label, name, items) => {
    const selected = items.some(page => page.id === current);
    return `<details class="sidebar-group tree-group${selected ? ' is-current' : ''}"${selected ? ' open' : ''}><summary>${treeIcon('folder', 'tree-icon tree-folder-closed')}${treeIcon('folder-open', 'tree-icon tree-folder-open')}<span class="tree-group-name">${e(label)} / ${e(slugify(name))}/</span>${treeIcon('chevron-down', 'tree-chevron', 'site')}</summary><div class="tree-children">${items.map(page => file(page)).join('')}</div></details>`;
  };
  const branches = sections.map(section => branch(section.label, tr ? turkishSections[section.name] : section.name, section.pages.map(slug => byId.get(`rehberler/${slug}`))));
  branches.push(branch('04', tr ? 'Laboratuvarlar' : 'Labs', labs), branch('05', tr ? 'Kaynaklar' : 'Reading desk', ['okuma-rotalari', 'kaynak-kutuphanesi', 'kaynaklar'].map(id => byId.get(id))));
  const home = { id: 'index', title: 'README.md' };
  return `<aside class="reading-sidebar" aria-label="${tr ? 'Rehber dizini' : 'Guide directory'}"><details class="sidebar-menu" open><summary>${treeIcon('guides', 'tree-icon tree-root-icon', 'site')}<span>${tr ? 'İçindekiler' : 'Contents'}</span>${treeIcon('chevron-down', 'tree-chevron', 'site')}</summary><nav class="sidebar-links" aria-label="${tr ? 'Okuma dizini' : 'Reading tree'}">${file(home, 'tree-index')}${branches.join('')}</nav></details></aside>`;
}

// The lead repeats the first paragraph when the description was cut from it.
const visibleText = html => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]).replace(/\s+/g, ' ').trim();
function leadRepeatsBody(lead, html) {
  const first = html.match(/^\s*<p>([\s\S]*?)<\/p>/);
  const text = visibleText(lead).replace(/…$/, '').trim();
  return Boolean(first && text && visibleText(first[1]).startsWith(text));
}
function article(page, language = 'en') {
  const tr = language === 'tr';
  const current = readingId(page.id, language);
  const { html, toc } = renderMarkdown(page, language);
  const kindLabel = page.kind === 'laboratuvar' ? (tr ? 'deney' : 'practice') : page.kind === 'sayfa' ? (tr ? 'kaynak' : 'reference') : (tr ? 'rehber' : 'guide');
  const section = page.section;
  const eyebrow = section.toLowerCase() === kindLabel ? section : `${section} / ${kindLabel}`;
  const lead = leadRepeatsBody(e(page.description), html) ? '' : `<p class="article-lead">${e(page.description)}</p>`;
  const ordered = page.kind === 'laboratuvar' ? labs : guides;
  const index = ordered.findIndex(item => item.id === page.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const parent = page.kind === 'laboratuvar' ? ['laboratuvarlar/index', tr ? 'Laboratuvarlar' : 'Labs']
    : page.kind === 'rehber' ? ['rehberler/index', tr ? 'Rehberler' : 'Guides'] : null;
  const breadcrumbs = `<nav class="breadcrumbs" aria-label="${tr ? 'Sayfa yolu' : 'Breadcrumb'}"><a href="${readingUrl('index', language)}">execmap</a><span aria-hidden="true">/</span>${parent ? `<a href="${readingUrl(parent[0], language)}">${parent[1]}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${e(page.title)}</span></nav>`;
  const tocHtml = (open = true) => `<details class="toc-details"${open ? ' open' : ''}><summary>${tr ? 'Bu sayfada' : 'On this page'}</summary><ol>${toc.map(item => `<li class="toc-depth-${item.depth}"><a href="#${e(item.id)}">${e(item.title)}</a></li>`).join('')}</ol></details>`;
  const neighbor = (target, label) => {
    if (!target) return '<span></span>';
    const title = tr ? translations.get(target.id)?.title ?? target.title : target.title;
    return `<a href="${readingUrl(target.id, language)}"><small>${label}</small>${e(title)}</a>`;
  };
  const neighbors = previous || next ? `<nav class="page-neighbors" aria-label="${tr ? 'Önceki ve sonraki sayfa' : 'Previous and next page'}">${neighbor(previous, tr ? '← Önceki' : '← Previous')}${neighbor(next, tr ? 'Sonraki →' : 'Next →')}</nav>` : '';
  const body = `<div class="reading-layout">${sidebar(page.id, language)}
    <main id="main" lang="${language}" class="reading-main" tabindex="-1">${breadcrumbs}
      <article lang="${language}" data-pagefind-body><header class="article-header">
        <p class="eyebrow">${e(eyebrow)}</p><h1>${e(page.title)}</h1>
        <div class="article-meta console-meta"><span>${page.minutes} ${tr ? 'dk okuma' : 'min read'}</span><span>${tr ? 'Türkçe' : 'English'} · Linux</span><a href="${asset(`raw/${current}.md`)}" download>${tr ? 'Markdown kaynağı' : 'Source Markdown'} ↓</a></div>${lead}
      </header><div class="mobile-toc">${tocHtml(false)}</div><div class="prose">${html}</div></article>${neighbors}
    </main><aside class="reading-toc" aria-label="${tr ? 'Bu sayfanın bölümleri' : 'Sections on this page'}">${tocHtml()}<a class="toc-top" href="#main">${tr ? 'Başa dön' : 'Back to top'} ↑</a></aside></div>`;
  return documentHtml({ title: page.title, description: page.description, current, article: true, language, body });
}
const resources = pages.filter(page => page.kind === 'sayfa' && page.id !== 'index');
const readingPages = [...guides, ...labs, ...resources];
function turkishMetadata(page) {
  const translated = translations.get(page.id);
  if (!translated) throw new Error(`Missing Turkish reading page: ${page.id}`);
  return { ...translated, section: turkishSections[page.section] ?? 'Kaynaklar' };
}
function resourceList(language) {
  const tr = language === 'tr';
  const rows = resources.map(page => {
    const entry = tr ? turkishMetadata(page) : page;
    return `<li class="catalog-row"><a class="row-title" href="${readingUrl(page.id, language)}">${e(entry.title)}</a><p>${e(entry.description)}</p></li>`;
  }).join('');
  return `<ul class="catalog-list resource-list">${rows}</ul>`;
}
function listing({ id, title, description, intro = '', content }, language) {
  const tr = language === 'tr';
  const body = `<main id="main" class="listing-main" tabindex="-1">
    <nav class="breadcrumbs" aria-label="${tr ? 'Sayfa yolu' : 'Breadcrumb'}"><a href="${readingUrl('index', language)}">execmap</a><span aria-hidden="true">/</span><span aria-current="page">${e(title)}</span></nav>
    <header class="listing-intro"><h1>${e(title)}</h1><p class="lead">${e(description)}</p>${intro}</header>
    ${content}
  </main>`;
  return documentHtml({ title, description, current: readingId(id, language), language, body });
}
function notFound(language) {
  const tr = language === 'tr';
  const title = tr ? 'Sayfa bulunamadı' : 'Page not found';
  const description = tr ? 'Bağlantı değişmiş olabilir. Rehber dizinine gidin veya sitede arayın.' : 'The link may have changed. Continue from the guide directory or search the site.';
  const body = `<main id="main" class="legal-main" tabindex="-1">
    <h1>404 / ${title}</h1>
    <p>${description}</p>
    <p><a href="${readingUrl('rehberler/index', language)}">${tr ? 'Rehber dizinine dön' : 'Back to the guide directory'} →</a></p>
  </main>`;
  return documentHtml({ title, description, current: readingId('404', language), indexable: false, language, body });
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
for (const language of ['en', 'tr']) {
  const tr = language === 'tr';
  const prefix = tr ? 'tr/' : '';
  await save(`${prefix}index.html`, home(language));
  await save(`${prefix}rehberler/index.html`, listing({
    id: 'rehberler/index',
    title: tr ? 'Rehberler' : 'Guides',
    description: tr ? 'ELF dosya düzeninden çalışma zamanına uzanan, birincil kaynaklara dayalı rehberler.' : 'From ELF layout to runtime: focused guides backed by technical sources.',
    intro: `<a href="${readingUrl('okuma-rotalari', language)}">${tr ? 'Okuma rotalarını izle' : 'Follow the reading routes'} →</a>`,
    content: guideCatalog(language),
  }, language));
  await save(`${prefix}laboratuvarlar/index.html`, listing({
    id: 'laboratuvarlar/index',
    title: tr ? 'Laboratuvarlar' : 'Labs',
    description: tr ? 'Küçük C ve C++ programlarıyla deneyleri tekrarlayın, program davranışını gözlemleyin ve sonuçları karşılaştırın.' : 'Reproduce behavior with small C and C++ programs, observe it with tools, and compare results.',
    intro: tr ? '<p>Kendi çalışma dizininizde Linux, bir C veya C++ derleyicisi ve GNU araçları kullanın. Her laboratuvarda gereksinimleri, kodu, komutları ve beklenen sonuçları bulabilirsiniz.</p>' : '<p>Use Linux, a C or C++ compiler, and GNU tools in your own working directory. Each lab lists its requirements and gives code, commands and expected results.</p>',
    content: `<div class="labs-list">${labs.map(page => labCard(page, language, 'h2')).join('')}</div>`,
  }, language));
  await save(`${prefix}kaynaklar/index.html`, listing({
    id: 'kaynaklar/index',
    title: tr ? 'Kaynaklar' : 'Resources',
    description: tr ? 'Teknik kaynaklar, inceleme yöntemi ve okuma rotaları.' : 'Technical references, research methods, and reading routes.',
    content: resourceList(language),
  }, language));
  await save(`${prefix}404.html`, notFound(language));
}
for (const page of pages.filter(page => page.id !== 'index')) {
  await save(`${page.id}.html`, article(page));
  await save(`raw/${page.id}.md`, await readFile(path.join(root, 'content', `${page.id}.md`), 'utf8'));
  await save(`tr/${page.id}.html`, article(turkishMetadata(page), 'tr'));
  await save(`raw/tr/${page.id}.md`, await readFile(path.join(root, 'content-tr', `${page.id}.md`), 'utf8'));
}
const searchRecord = (page, language) => ({
  title: page.title,
  description: page.description,
  text: page.text,
  headings: page.headings,
  code: page.code,
  url: readingUrl(page.id, language),
  kind: page.kind,
  section: page.section,
  lang: language,
});
await save('search-index.json', JSON.stringify(readingPages.map(page => ({
  ...searchRecord(page, 'en'),
  turkish: searchRecord(turkishMetadata(page), 'tr'),
})), null, 2));
for (const file of codeFiles) await save(file.path, file.text);
await save('search.json', JSON.stringify(readingPages.flatMap(page => [searchRecord(page, 'en'), searchRecord(turkishMetadata(page), 'tr')])
  .map(({ title, description, text, url, lang }) => ({ title, description, text, url, type: 'execmap/', lang })), null, 2));
await save('lisanslar.html', documentHtml({ title: 'Licenses and source notices', description: 'Licenses and source notices for execmap, the shared console theme, and fonts.', current: 'lisanslar', body: `<main id="main" lang="en" class="legal-main" tabindex="-1"><h1>Licenses and source notices</h1><div class="prose"><p>Copyright (C) 2026 Suleyman Poyraz. Unless otherwise stated, project code, technical writing, and laboratory examples are distributed under <code>GPL-3.0-or-later</code> without warranty. <a href="${asset('LICENSE.txt')}">GNU GPL v3 text</a> and <a href="${asset('NOTICE.md')}">source notices</a>.</p><p>The shared console theme comes from Zaryob’s <a href="https://github.com/Zaryob/console-theme">console-theme</a> project. Its CSS and JavaScript files retain their <code>GPL-2.0-or-later</code> notices. <a href="${asset('assets/console/COPYING')}">GNU GPL v2 text</a>.</p><p>IBM Plex Mono and IBM Plex Sans fonts are served locally. <a href="${asset('assets/console/fonts/OFL.txt')}">SIL Open Font License</a>.</p><p>Font Awesome SVG icons retain their attribution and are subject to CC BY 4.0. <a href="${asset('assets/console/ICONS-LICENSE.txt')}">Icon license notice</a>.</p><p>Citations credit the authors of standards, documentation, and research. External text, code, and artwork retain their own licenses.</p><p>Build tools: <a href="https://github.com/markedjs/marked">Marked</a> and <a href="https://github.com/highlightjs/highlight.js">highlight.js</a>. These libraries run at build time and are not bundled for the browser.</p><p><a href="${url('kaynak-kutuphanesi')}">Back to the resource library →</a></p></div></main>` }));
await save('tr/lisanslar.html', documentHtml({
  title: 'Lisanslar ve kaynak bildirimleri',
  description: 'Execmap, ortak konsol teması ve yazı tiplerinin lisansları ve kaynak bildirimleri.',
  current: 'tr/lisanslar',
  language: 'tr',
  body: `<main id="main" class="legal-main" tabindex="-1"><h1>Lisanslar ve kaynak bildirimleri</h1><div class="prose">
    <p>Telif hakkı © 2026 Süleyman Poyraz. Aksi belirtilmedikçe proje kodu, teknik yazılar ve laboratuvar örnekleri garanti olmaksızın <code>GPL-3.0-or-later</code> kapsamında dağıtılır. <a href="${asset('LICENSE.txt')}">GNU GPL v3 metni</a> · <a href="${asset('NOTICE.md')}">Kaynak bildirimleri</a>.</p>
    <p>Ortak konsol teması, Zaryob’un <a href="https://github.com/Zaryob/console-theme">console-theme</a> projesinden gelir. CSS ve JavaScript dosyaları <code>GPL-2.0-or-later</code> bildirimlerini taşır. <a href="${asset('assets/console/COPYING')}">GNU GPL v2 metni</a>.</p>
    <p>IBM Plex Mono ve IBM Plex Sans yazı tipleri yerelden sunulur. <a href="${asset('assets/console/fonts/OFL.txt')}">SIL Açık Yazı Tipi Lisansı</a>.</p>
    <p>Font Awesome SVG simgeleri <code>CC BY 4.0</code> lisansına tabidir. <a href="${asset('assets/console/ICONS-LICENSE.txt')}">Simge lisansı ve atıflar</a>.</p>
    <p>Standartların, belgelerin ve araştırmaların yazarları kaynakçalarda belirtilir. Dışarıdan alınan metinler, kod ve görseller kendi lisanslarına tabidir.</p>
    <p>Derleme araçları <a href="https://github.com/markedjs/marked">Marked</a> ve <a href="https://github.com/highlightjs/highlight.js">highlight.js</a> site oluşturulurken çalışır. Tarayıcıya gönderilen pakete eklenmezler.</p>
    <p><a href="${readingUrl('kaynak-kutuphanesi', 'tr')}">Kaynak kütüphanesine dön →</a></p></div></main>`,
}));
await save('.nojekyll', '');
const sitemapIds = editionPairs.filter(([id]) => id !== '404').flat();
await save('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${sitemapIds.map(id => {
  const editions = editionsFor(id);
  const alternates = editions
    ? [['en', editions[0]], ['tr', editions[1]], ['x-default', editions[0]]].map(([lang, edition]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${canonicalUrl(edition)}" />`).join('')
    : '';
  return `<url><loc>${canonicalUrl(id)}</loc>${alternates}</url>`;
}).join('')}</urlset>`);
console.log(`execmap: ${pages.length} content pages, 2 directories, resources and search index → _site/ (base: ${base || '/'})`);
