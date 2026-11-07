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
      return `<h${depth} id="${id}">${content}<a class="heading-anchor" href="#${id}" aria-label="${e(raw)} bölümüne bağlantı">#</a></h${depth}>\n`;
    },
    code({ text, lang }) {
      const language = (lang || 'text').split(/\s/)[0];
      const target = language === 'sh' ? 'bash' : language;
      const highlighted = hljs.getLanguage(target) ? hljs.highlight(text, { language: target }).value : e(text);
      return `<div class="code-language">${e(language)}</div><pre tabindex="0" aria-label="${e(language)} kod örneği"><code class="language-${e(language)}">${highlighted}</code></pre>\n`;
    },
    link({ href, title, tokens }) {
      const address = rewriteLink(href, page.id, base, pageIds);
      return `<a href="${e(address)}"${title ? ` title="${e(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    html({ text }) { return e(text); },
  }});
  const content = page.markdown.replace(/^\s*# .+\r?\n/, '');
  return { html: md.parse(content), toc };
}
function header(current) {
  const selected = current.startsWith('rehberler') ? 'rehberler' : current.startsWith('laboratuvarlar') ? 'laboratuvarlar' : current.includes('kaynak') ? 'kaynak-kutuphanesi' : current === 'index' ? 'index' : '';
  const nav = [['index', 'Başlangıç', 'Start'], ['rehberler/index', 'Rehberler', 'Tutorials'], ['laboratuvarlar/index', 'Laboratuvarlar', 'Labs'], ['kaynak-kutuphanesi', 'Kaynaklar', 'Resources']];
  return `<a class="skip-link" href="#main" data-i18n="Skip to content">İçeriğe geç</a>
  <header class="console-header"><div class="console-header__inner">
    <div class="console-identity"><a class="console-brand" href="https://zaryob.github.io/">zaryob</a><span class="console-prompt-separator">:</span>
      <details class="console-projects" data-console-projects><summary aria-label="Diğer projeler" data-i18n-aria-label="Switch project"><span class="console-project-path">~/execmap</span><span class="console-prompt-dollar">$</span>${icon('chevron', 12)}</summary><div class="console-project-menu">
        ${projects.map(project => `<a href="${e(project.key === 'execmap' ? `https://zaryob.github.io${base}/` : `https://zaryob.github.io${project.path}`)}"${project.key === 'execmap' ? ' aria-current="location"' : ''}><span${project.title_en ? ` data-i18n="${e(project.title_en)}"` : ''}>${e(project.title)}</span><small>${e(project.prompt)}</small></a>`).join('')}
      </div></details>
    </div>
    <div class="console-header-actions"><button type="button" class="console-search-compact" data-site-search aria-label="Sitede ara" data-i18n-aria-label="Search this site">${icon('search')}</button><button type="button" class="console-menu" data-console-menu aria-label="Menüyü aç" data-i18n-aria-label="Open menu" aria-controls="console-navigation" aria-expanded="false">${icon('menu')}</button></div>
    <nav class="console-nav" id="console-navigation" aria-label="Ana menü" data-i18n-aria-label="Main navigation">${nav.map(([id, label, translation]) => `<a href="${url(id)}" data-i18n="${translation}"${(selected === id.split('/')[0] || selected === id) ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}
      <div class="console-tools"><button type="button" class="search-button" data-site-search>${icon('search', 16)}<span data-i18n="Search">Ara</span><kbd>/</kbd></button><label class="console-theme"><span class="console-sr-only" data-i18n="Theme">Görünüm</span><select data-console-theme aria-label="Renk teması" data-i18n-aria-label="Color theme"><option value="system" data-i18n="System">Sistem</option><option value="light" data-i18n="Light">Açık</option><option value="dark" data-i18n="Dark">Koyu</option></select></label><label class="console-language"><span data-i18n="Language">Dil</span><select data-console-language aria-label="Language / Dil"><option value="tr" lang="tr">TR</option><option value="en" lang="en">EN</option></select></label></div>
    </nav>
  </div></header>`;
}
function footer() {
  return `<footer class="console-footer" lang="tr"><div><a href="${url('index')}">execmap</a><span class="footer-sep"> / </span>Linux tersine mühendislik masası.<br><span class="footer-note">Dosyayı oku. Çalışma anını izle. Bulguyu doğrula.</span></div><div class="footer-links"><a href="${url('kaynaklar')}">Kaynaklar</a><a href="https://github.com/Zaryob/execmap">GitHub ↗</a><a href="${asset('lisanslar.html')}">Lisanslar</a><a href="#main">Yukarı ↑</a></div></footer>`;
}
function searchDialog() {
  return `<dialog lang="tr" class="console-search" id="site-search" aria-labelledby="search-title"><div class="console-search__heading"><h2 id="search-title">execmap / ara</h2><button type="button" data-search-close aria-label="Aramayı kapat">Esc / Kapat</button></div><label for="search-input">Rehberler, kod örnekleri ve kaynaklarda ara</label><input id="search-input" type="search" placeholder="GOT, mprotect, stripped ELF…" autocomplete="off" spellcheck="false"><p id="search-status" class="console-search__status" role="status" aria-live="polite">Aramak için birkaç harf yaz.</p><ul id="search-results" class="console-search__results"></ul></dialog>`;
}
function documentHtml({ title, description, current = 'index', body, article = false }) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f3ed"><meta name="site-root" content="${base}/"><meta name="description" content="${e(description)}"><title>${e(title)}${title === 'execmap' ? ' — Linux tersine mühendislik masası' : ' · execmap'}</title><link rel="icon" type="image/svg+xml" href="${asset('favicon.svg')}"><link rel="canonical" href="https://zaryob.github.io${url(current)}"><meta property="og:title" content="${e(title)} · execmap"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${article ? 'article' : 'website'}"><script src="${asset('assets/console/language.js')}"></script><script src="${asset('assets/console/i18n.js')}"></script><script src="${asset('assets/console/theme.js')}"></script><link rel="stylesheet" href="${asset('assets/console/theme.css')}"><link rel="stylesheet" href="${asset('style.css')}"><script type="module" src="${asset('app.js')}"></script></head><body class="console-site execmap-site">${header(current)}<p class="console-language-note" lang="tr"><span data-i18n="Turkish content and local search; shared controls follow your language preference.">İçerik ve yerel arama Türkçedir; ortak kontroller dil tercihinizi izler.</span></p>${body}${footer()}${searchDialog()}<div class="console-sr-only" id="site-announcement" role="status" aria-live="polite"></div></body></html>`;
}
function listRow(page, index) {
  return `<li class="catalog-row" data-catalog-item data-group="${e(page.group)}" data-search="${e(`${page.title} ${page.description} ${page.section}`)}"><span class="row-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><a class="row-title" href="${url(page.id)}">${e(page.title)}</a><p>${e(page.description)}</p></div><span class="row-meta">${e(page.section)}<br>${page.minutes} dk okuma</span><a class="row-arrow" href="${url(page.id)}" aria-label="${e(page.title)} rehberini aç">↗</a></li>`;
}
function catalog(items, title, filter = true) {
  return `<section id="catalog" class="catalog-section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">find ./rehberler -type f</p><h2 id="catalog-title">${title}</h2></div><span class="section-count">${items.length} rehber</span></div>
  <div class="catalog-controls" data-js-only hidden><label class="catalog-search">${icon('search')}<span class="console-sr-only">Rehberlerde filtrele</span><input id="catalog-query" type="search" placeholder="Başlık veya konu ara…" autocomplete="off"></label>${filter ? `<div class="filter-tabs" role="group" aria-label="Konu filtresi"><button type="button" data-filter="all" aria-pressed="true">Tümü</button>${sections.map(section => `<button type="button" data-filter="${section.key}" aria-pressed="false">${section.name}</button>`).join('')}</div>` : ''}</div>
  <p class="filter-status" id="catalog-status" role="status" aria-live="polite" data-js-only hidden>${items.length} rehber gösteriliyor.</p><ol class="catalog-list">${items.map(listRow).join('')}</ol><div class="empty-state" id="catalog-empty" hidden><p>Bu aramayla eşleşen rehber yok.</p><button type="button" data-reset-filters>Filtreleri temizle</button></div></section>`;
}
function home() {
  const main = `<main id="main" lang="tr" class="home-main" tabindex="-1"><section class="home-intro"><div class="intro-copy"><p class="eyebrow">~/execmap · GNU/Linux inceleme masası</p><h1>Linux programlarını<br>dosyadan belleğe izle.</h1><p class="lead">ELF dosyasını, yükleyiciyi ve çalışma anını<br class="desktop-break"> aynı hikâyenin parçaları olarak oku.</p><p class="intro-detail">Tersine mühendislik için kaynaklı rehberler ve küçük, uygulanabilir laboratuvarlar. <code>readelf</code> ile başla; GDB, perf ve eBPF ile bulgularını doğrula.</p><div class="intro-actions"><a class="primary-link" href="${url('rehberler/elf-dosyadan-bellege')}">İlk rehberi aç ${icon('arrow')}</a><a href="${url('okuma-rotalari')}">Okuma rotaları ↗</a></div></div>
    <div class="terminal-preview" aria-label="ELF dosyasından çalışma anına inceleme adımları"><div class="terminal-title"><span>${icon('terminal', 15)} bir ELF’in yolculuğu</span><span>x86-64 / Linux</span></div><div class="terminal-body"><p><span class="prompt">$</span> readelf -lW ./ornek</p><p class="terminal-muted">Elf file type is DYN</p><div class="segment-line"><span>LOAD</span><span>0x0000</span><span>R--</span><i class="segment-bar seg-a"></i></div><div class="segment-line"><span>LOAD</span><span>0x1000</span><span>R-X</span><i class="segment-bar seg-b"></i></div><div class="segment-line"><span>LOAD</span><span>0x2000</span><span>R--</span><i class="segment-bar seg-c"></i></div><div class="segment-line"><span>LOAD</span><span>0x3000</span><span>RW-</span><i class="segment-bar seg-d"></i></div><div class="trace-line"><span>dosya</span><b>→</b><span>yükleyici</span><b>→</b><span>bellek</span><b>→</b><span>yürütme</span></div><p class="terminal-caption">Örnek düzen · gerçek dosya analizi değildir.</p><p class="terminal-final"><span class="prompt">$</span> <span class="cursor" aria-hidden="true">▌</span></p></div></div></section>
    <div class="stats-strip" aria-label="İçerik özeti"><span><strong>${guides.length}</strong> rehber</span><span><strong>${labs.length}</strong> laboratuvar</span><span>ELF · GDB · perf · eBPF</span><a href="${url('kaynak-kutuphanesi')}">Kaynağına kadar takip et ↗</a></div>
    <section class="routes-section" aria-labelledby="routes-title"><div class="section-heading"><div><p class="eyebrow">cd ./nereden-baslamali</p><h2 id="routes-title">Bir inceleme sorusu seç.</h2></div><a href="${url('okuma-rotalari')}">Bütün rotalar →</a></div><div class="route-grid">${routes.map(route => `<a class="route-card" href="${url(route.pages[0])}"><span class="route-number">/${route.n}</span><h3>${route.title} <span>↗</span></h3><p>${route.text}</p><code>${e(route.code)}</code></a>`).join('')}</div></section>
    ${catalog(guides, 'Rehber dizini')}
    <section class="lab-section" aria-labelledby="labs-title"><div class="section-heading"><div><p class="eyebrow">mkdir deney &amp;&amp; cd deney</p><h2 id="labs-title">Oku. Derle. Karşılaştır.</h2></div><a href="${url('laboratuvarlar/index')}">Laboratuvarlara git →</a></div><div class="lab-grid">${labs.map((lab, i) => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(i + 1).padStart(2, '0')} <span>C / Linux</span></span><h3>${e(lab.title)} ↗</h3><p>${e(lab.description)}</p><span class="lab-bottom">Kod + komutlar + beklenen sonuç</span></a>`).join('')}</div></section>
    <section class="source-banner"><div><p class="eyebrow">man elf · kaynak masası</p><h2>Bir bulgu, kaynağı kadar güçlüdür.</h2><p>ABI şartnameleri, Linux kaynak kodu ve araç yazarlarının belgeleri;<br class="desktop-break"> neyi açıkladıkları ve nerede sınırlı kaldıklarıyla birlikte.</p></div><a href="${url('kaynak-kutuphanesi')}">Kaynak kütüphanesini aç ${icon('arrow')}</a></section>
  </main>`;
  return documentHtml({ title: 'execmap', description: byId.get('index').description, body: main });
}
function sidebar(current) {
  const active = id => id === current ? ' aria-current="page"' : '';
  return `<aside lang="tr" class="reading-sidebar" aria-label="Rehber dizini"><details class="sidebar-menu" open><summary>İçerik dizini ${icon('chevron', 14)}</summary><div class="sidebar-links"><a class="sidebar-home" href="${url('index')}">← İnceleme masası</a>${sections.map(section => `<div class="sidebar-group"><p>${section.label} / ${section.name}</p>${section.pages.map(slug => byId.get(`rehberler/${slug}`)).map(page => `<a href="${url(page.id)}"${active(page.id)}>${e(page.title)}</a>`).join('')}</div>`).join('')}<div class="sidebar-group"><p>04 / Laboratuvarlar</p>${labs.map(page => `<a href="${url(page.id)}"${active(page.id)}>${e(page.title)}</a>`).join('')}</div><div class="sidebar-group"><p>05 / Okuma masası</p>${['okuma-rotalari', 'kaynak-kutuphanesi', 'kaynaklar'].map(id => `<a href="${url(id)}"${active(id)}>${e(byId.get(id).title)}</a>`).join('')}</div></div></details></aside>`;
}
function article(page) {
  const { html, toc } = renderMarkdown(page);
  const ordered = page.kind === 'laboratuvar' ? labs : guides;
  const index = ordered.findIndex(item => item.id === page.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const breadcrumbs = `<nav class="breadcrumbs" aria-label="Konum"><a href="${url('index')}">execmap</a><span>/</span><a href="${url(page.kind === 'laboratuvar' ? 'laboratuvarlar/index' : page.kind === 'rehber' ? 'rehberler/index' : 'kaynak-kutuphanesi')}">${e(page.kind === 'sayfa' ? 'okuma masası' : page.kind === 'laboratuvar' ? 'laboratuvarlar' : 'rehberler')}</a><span>/</span><span>${e(page.slug)}</span></nav>`;
  const tocHtml = `<details class="toc-details" open><summary>Bu sayfada</summary><ol>${toc.map(item => `<li class="toc-depth-${item.depth}"><a href="#${e(item.id)}">${e(item.title)}</a></li>`).join('')}</ol></details>`;
  return documentHtml({ title: page.title, description: page.description, current: page.id, article: true, body: `<div class="reading-layout">${sidebar(page.id)}<main id="main" lang="tr" class="reading-main" tabindex="-1">${breadcrumbs}<article lang="tr" data-pagefind-body><header class="article-header"><p class="eyebrow">${e(page.section)} / ${page.kind === 'laboratuvar' ? 'uygulama' : page.kind === 'sayfa' ? 'başvuru' : 'rehber'}</p><h1>${e(page.title)}</h1><p class="article-lead">${e(page.description)}</p><div class="article-meta"><span>${page.minutes} dk okuma</span><span>Türkçe · Linux</span><a href="${asset(`raw/${page.id}.md`)}" download>Markdown indir ↓</a></div></header><div class="mobile-toc">${tocHtml}</div><div class="prose">${html}</div></article>${previous || next ? `<nav class="page-neighbors" aria-label="Önceki ve sonraki sayfa">${previous ? `<a href="${url(previous.id)}"><small>← Önceki</small>${e(previous.title)}</a>` : '<span></span>'}${next ? `<a href="${url(next.id)}"><small>Sonraki →</small>${e(next.title)}</a>` : '<span></span>'}</nav>` : ''}</main><aside lang="tr" class="reading-toc" aria-label="Bu sayfanın bölümleri">${tocHtml}<a class="toc-top" href="#main">Sayfa başına ↑</a></aside></div>` });
}
function listing(kind) {
  const isLab = kind === 'laboratuvarlar';
  const items = isLab ? labs : guides;
  const title = isLab ? 'Laboratuvarlar' : 'Rehberler';
  const desc = isLab ? 'Küçük C programlarıyla bir davranışı üret, araçlarla gözle ve sonucu karşılaştır.' : 'ELF yapısından çalışma anına: bir soruya odaklanan, kaynaklarla desteklenen rehberler.';
  const body = `<main id="main" lang="tr" class="listing-main" tabindex="-1"><nav class="breadcrumbs" aria-label="Konum"><a href="${url('index')}">execmap</a><span>/</span><span>${kind}</span></nav><div class="listing-intro"><p class="eyebrow">ls ./${kind}</p><h1>${title}</h1><p class="lead">${desc}</p>${isLab ? '<p>Linux, C derleyicisi ve GNU araçlarıyla kendi çalışma dizininde uygula. Her laboratuvarın gereksinimleri kendi sayfasında belirtilir.</p>' : `<a href="${url('okuma-rotalari')}">Sırayla ilerlemek için okuma rotalarını aç →</a>`}</div>${isLab ? `<div class="labs-list">${labs.map((lab, i) => `<a class="lab-card" href="${url(lab.id)}"><span class="lab-number">LAB ${String(i + 1).padStart(2, '0')} <span>C / Linux</span></span><h2>${e(lab.title)} ↗</h2><p>${e(lab.description)}</p><span class="lab-bottom">Kod + komutlar + beklenen sonuç</span></a>`).join('')}</div>` : catalog(items, 'Bütün rehberler')}</main>`;
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
await save('search-index.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, url: url(page.id), kind: page.kind, section: page.section })), null, 2));
await save('search.json', JSON.stringify(searchPages.map(page => ({ title: page.title, description: page.description, text: page.text, url: url(page.id), type: 'execmap/', lang: 'tr' })), null, 2));
await save('lisanslar.html', documentHtml({ title: 'Lisanslar ve kaynak bildirimleri', description: 'execmap projesinin lisansı, ortak console teması, fontları ve kaynak bildirimleri.', current: 'lisanslar', body: `<main id="main" lang="tr" class="legal-main" tabindex="-1"><h1>Lisanslar ve kaynak bildirimleri</h1><div class="prose"><p>Copyright (C) 2026 Suleyman Poyraz. Aksi belirtilmedikçe proje kodu, teknik metinler ve laboratuvar örnekleri <code>GPL-3.0-or-later</code> lisansıyla sunulur; garanti verilmez. <a href="${asset('LICENSE.txt')}">GNU GPL v3 metni</a> ve <a href="${asset('NOTICE.md')}">kaynak bildirimleri</a>.</p><p>Ortak console teması, Zaryob’un <a href="https://github.com/Zaryob/console-theme">console-theme</a> projesinden alınmıştır. CSS ve JavaScript dosyaları kendi <code>GPL-2.0-or-later</code> bildirimlerini korur. <a href="${asset('assets/console/COPYING')}">GNU GPL v2 metni</a>.</p><p>IBM Plex Mono ve IBM Plex Sans fontları yerel olarak sunulur. <a href="${asset('assets/console/fonts/OFL.txt')}">SIL Open Font License</a>.</p><p>Font Awesome SVG simgeleri kendi atıflarını korur ve CC BY 4.0 koşullarına tabidir. <a href="${asset('assets/console/ICONS-LICENSE.txt')}">Simge lisans bildirimi</a>.</p><p>Standartlara, belgelere ve araştırmalara yapılan atıflar ilgili yazarların çalışmalarını belirtir. Dış kaynakların metin, kod ve görselleri kendi lisanslarına tabidir.</p><p>Derleme araçları: <a href="https://github.com/markedjs/marked">Marked</a> ve <a href="https://github.com/highlightjs/highlight.js">highlight.js</a>. Bu kütüphaneler derleme sırasında çalışır, tarayıcıya paketlenmez.</p><p><a href="${url('kaynak-kutuphanesi')}">Kaynak kütüphanesine dön →</a></p></div></main>` }));
await save('404.html', documentHtml({ title: 'Sayfa bulunamadı', description: 'Aradığın sayfayı rehber dizininde bul.', current: '404', body: `<main id="main" lang="tr" class="legal-main" tabindex="-1"><p class="eyebrow">execmap: No such file or directory</p><h1>404 / Bu sayfa yok.</h1><p>Bağlantı değişmiş olabilir. Rehber dizininden devam edebilir veya sitede arayabilirsin.</p><p><a href="${url('rehberler/index')}">Rehber dizinine dön →</a></p></main>` }));
await save('.nojekyll', '');
const sitemapIds = ['index', ...pages.filter(page => page.id !== 'index').map(page => page.id), 'rehberler/index', 'laboratuvarlar/index'];
await save('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapIds.map(id => `<url><loc>https://zaryob.github.io${e(url(id))}</loc></url>`).join('')}</urlset>`);
console.log(`execmap: ${pages.length} içerik sayfası, 2 dizin, kaynaklar ve arama indeksi → _site/ (base: ${base || '/'})`);
