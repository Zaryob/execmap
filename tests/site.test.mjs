import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { loadPages, normalizeBase, pageUrl, rewriteLink, slugify, plainText, descriptionText } from '../src/content.mjs';
import { searchPages, normalize, excerpt } from '../public/search.mjs';

const root = path.resolve('_site');
const { document: homeDocument } = parseHTML(await readFile(path.join(root, 'index.html'), 'utf8'));
const base = homeDocument.querySelector('meta[name="site-root"]').content.replace(/\/$/, '');
const pages = await loadPages(path.resolve('content'));
const translations = await loadPages(path.resolve('content-tr'), { language: 'tr' });
const index = JSON.parse(await readFile(path.join(root, 'search-index.json'), 'utf8'));
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const htmlFiles = (await walk(root)).filter(file => file.endsWith('.html'));

test('home, catalogues and the error page use the same structure and link to matching editions', async () => {
  const structure = doc => [...doc.querySelectorAll('main, main *')].map(node => [
    node.localName,
    node.id,
    node.getAttribute('class'),
    node.getAttribute('data-filter'),
    node.getAttribute('data-group'),
    node.getAttribute('href')?.replace(`${base}/tr/`, `${base}/`),
  ]);
  for (const route of ['index.html', 'rehberler/index.html', 'laboratuvarlar/index.html', 'kaynaklar/index.html', '404.html']) {
    const { document: en } = parseHTML(await readFile(path.join(root, route), 'utf8'));
    const { document: tr } = parseHTML(await readFile(path.join(root, 'tr', route), 'utf8'));
    assert.deepEqual(structure(tr), structure(en), route);
    for (const link of tr.querySelectorAll('main a[href]')) {
      assert.ok(link.getAttribute('href').startsWith(`${base}/tr/`), `${route}: ${link.href}`);
    }
  }
});

test('all content is published with one title, a main landmark and navigation', async () => {
  assert.equal(pages.length, 44);
  assert.equal(htmlFiles.length, 98);
  for (const file of htmlFiles) {
    const { document } = parseHTML(await readFile(file, 'utf8'));
    assert.equal(document.documentElement.lang, path.relative(root, file).startsWith(`tr${path.sep}`) ? 'tr' : 'en', file);
    assert.equal(document.querySelectorAll('h1').length, 1, file);
    assert.equal(document.querySelectorAll('main').length, 1, file);
    assert.ok(document.querySelector('#main'), file);
    assert.ok(document.querySelector('#console-navigation'), file);
    const localePath = document.documentElement.lang === 'tr' ? `${base}/tr/` : `${base}/`;
    assert.deepEqual(
      [...document.querySelectorAll('.suite-footer nav[aria-label="execmap"] a')].map(link => link.getAttribute('href')),
      [localePath, `${localePath}kaynaklar/index.html`, `${localePath}lisanslar.html`],
      file,
    );
    const languageOptions = document.querySelectorAll('.console-header [data-console-language] option');
    assert.deepEqual([...languageOptions].map(option => option.value), ['tr', 'en'], file);
    assert.equal([...languageOptions].find(option => option.hasAttribute('selected')).value, document.documentElement.lang, file);
    for (const language of ['en', 'tr']) {
      assert.ok(document.querySelector(`link[hreflang="${language}"][data-language-route]`), file);
    }
    assert.ok(document.querySelector('title').textContent.includes('execmap'), file);
    assert.ok(document.querySelector('meta[name="description"]').content.length > 20, file);
    if (path.basename(file) === '404.html') {
      assert.equal(document.querySelector('link[rel="canonical"]'), null, file);
      assert.equal(document.querySelector('meta[property="og:url"]'), null, file);
      assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex', file);
    } else {
      const canonical = document.querySelector('link[rel="canonical"]').href;
      assert.equal(document.querySelector('meta[property="og:url"]').content, canonical, file);
      assert.equal(document.querySelector('meta[name="robots"]'), null, file);
    }
    const shareTitle = document.querySelector('meta[property="og:title"]').content;
    assert.equal(shareTitle, document.querySelector('title').textContent, file);
    assert.equal(document.querySelector('meta[name="twitter:title"]').content, shareTitle, file);
    assert.ok(!shareTitle.includes('execmap · execmap'), file);
    const image = document.querySelector('meta[property="og:image"]').content;
    assert.equal(image, `https://zaryob.github.io${base}/social-card.png`, file);
    assert.equal(document.querySelector('meta[name="twitter:image"]').content, image, file);
    assert.equal(document.querySelector('meta[name="twitter:card"]').content, 'summary_large_image', file);
    await access(path.join(root, 'social-card.png'));
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
  }
});

test('every Turkish reading page preserves the source anchors and runnable examples', async () => {
  const original = pages.filter(page => page.id !== 'index');
  assert.deepEqual(translations.map(page => page.id), original.map(page => page.id));
  for (const [position, source] of original.entries()) {
    const { document: en } = parseHTML(await readFile(path.join(root, `${source.id}.html`), 'utf8'));
    const { document: tr } = parseHTML(await readFile(path.join(root, `tr/${source.id}.html`), 'utf8'));
    const headings = doc => [...doc.querySelectorAll('.prose :is(h2, h3, h4, h5, h6)')].map(node => [node.tagName, node.id]);
    const code = doc => [...doc.querySelectorAll('.prose pre code')].map(node => [node.className, node.textContent]);
    assert.deepEqual(headings(tr), headings(en), source.id);
    assert.deepEqual(code(tr), code(en), source.id);
    assert.notEqual(translations[position].title, source.title, source.id);
    assert.equal(tr.querySelector('article').lang, 'tr');
    assert.equal(tr.querySelector('link[hreflang="en"]').href, `https://zaryob.github.io${base}/${source.id}.html`);
  }
});

test('every internal page, fragment, download, script and stylesheet exists', async () => {
  const documents = new Map();
  for (const file of htmlFiles) documents.set(file, parseHTML(await readFile(file, 'utf8')).document);
  for (const [file, document] of documents) {
    for (const element of document.querySelectorAll('a[href], link[href], script[src]')) {
      const href = element.getAttribute('href') || element.getAttribute('src');
      if (/^(https?:|mailto:)/.test(href)) continue;
      const current = `https://test.local${base}/${path.relative(root, file).split(path.sep).join('/')}`;
      const address = new URL(href, current);
      assert.equal(address.origin, 'https://test.local');
      assert.ok(address.pathname.startsWith(`${base}/`), `${file}: ${href}`);
      let local = path.join(root, decodeURIComponent(address.pathname.slice(`${base}/`.length)));
      if (address.pathname.endsWith('/')) local = path.join(local, 'index.html');
      await assert.doesNotReject(access(local), `${file}: ${href}`);
      if (address.hash && local.endsWith('.html')) {
        const target = documents.get(local) || parseHTML(await readFile(local, 'utf8')).document;
        assert.ok(target.getElementById(decodeURIComponent(address.hash.slice(1))), `${file}: missing ${href}`);
      }
    }
  }
});

test('runtime downloads match the tested sources and include no local outputs', async () => {
  const directory = path.join(root, 'labs/runtime-timing');
  const files = ['CMakeLists.txt', 'analyze.py', 'evidence.txt', 'functions-child.bt.in', 'functions.bt.in', 'offcpu.bt', 'timing_lab.cpp', 'validation.txt'];
  assert.deepEqual((await readdir(directory)).sort(), files);
  for (const file of files) {
    assert.deepEqual(await readFile(path.join(directory, file)),
      await readFile(path.resolve('examples/runtime-timing', file)), file);
  }
  const { document } = parseHTML(await readFile(path.join(root, 'laboratuvarlar/index.html'), 'utf8'));
  const card = document.querySelector('a[href$="/zamanlama-ve-bekleme.html"]');
  assert.ok(card.textContent.includes('C++ / Linux'));
  for (const [directory, downloads] of [
    ['event-pipeline', ['analyze.py', 'event_pipeline.cpp', 'validation.txt']],
    ['thread-observation', ['sample_thread.py']],
  ]) {
    const target = path.join(root, 'labs', directory);
    assert.deepEqual((await readdir(target)).sort(), downloads);
    for (const file of downloads) {
      assert.deepEqual(await readFile(path.join(target, file)),
        await readFile(path.resolve('examples', directory, file)), `${directory}/${file}`);
    }
  }
  assert.ok(document.querySelector('a[href$="/thread-sayaclari.html"]').textContent.includes('Bash / Linux'));
});

test('all reading pages are searchable, including code and cited resources', () => {
  assert.equal(index.length, 43);
  for (const page of pages.filter(page => page.id !== 'index')) {
    const hit = index.find(entry => entry.title === page.title);
    assert.ok(hit, page.id);
    assert.ok(hit.url.startsWith(`${base}/`));
    assert.ok(hit.text.length > 100);
  }
  assert.ok(searchPages(index, 'mprotect').some(page => page.url.includes('bellek-izinleri')));
  assert.ok(searchPages(index, 'pyelftools').some(page => page.url.includes('kaynak-kutuphanesi')));
  assert.ok(searchPages(index, 'GOT PLT').some(page => page.url.includes('dinamik-baglama')));
  assert.ok(searchPages(index, 'thread CPU').some(page => page.url.includes('zamanlama-ve-bekleme')));
  assert.ok(searchPages(index, 'scheduler delay').some(page => page.url.includes('calisma-zamani-gecikmesi')));
  assert.ok(searchPages(index, 'TraceBuffer').some(page => page.url.includes('olay-akisini-eslestirme')));
  assert.ok(searchPages(index, 'schedstat').some(page => page.url.includes('thread-sayaclari')));
  assert.ok(searchPages(index, 'Worker::process').some(page => page.url.includes('cpp-cagri-zinciri')));
  assert.ok(searchPages(index, 'shadow space').some(page => page.url === `${base}/rehberler/abi.html`));
  assert.ok(searchPages(index, 'pread64').some(page => page.url === `${base}/rehberler/syscall-boundary.html`));
  assert.equal(searchPages(index, 'birbiriyleeslesmeyenhayaliterim').length, 0);
});

test('the suite search adapter exposes full text, content language and baseurl links', async () => {
  const shared = JSON.parse(await readFile(path.join(root, 'search.json'), 'utf8'));
  assert.equal(shared.length, index.length * 2);
  for (const record of shared) {
    assert.equal(record.type, 'execmap/');
    assert.ok(record.url.startsWith(`${base}/`));
    const match = record.lang === 'tr'
      ? index.find(page => page.turkish.url === record.url)?.turkish
      : index.find(page => page.url === record.url);
    assert.equal(record.lang, match?.lang);
    assert.equal(record.text, match?.text);
  }
  assert.ok(shared.some(record => record.text.includes('pyelftools')));
});

test('search handles English case, diacritics, multiple terms and title ranking', () => {
  assert.equal(normalize('INLINE POINTER'), 'inline pointer');
  assert.equal(normalize('ÇALIŞMA İZİ'), 'calisma izi');
  const fixture = [
    { title: 'Another topic', text: 'Runtime trace description', description: '' },
    { title: 'Runtime trace', text: 'example', description: '' },
    { title: 'Runtime', text: 'another topic', description: '' },
    { title: 'Inlining pointers', text: '', description: '' },
  ];
  assert.deepEqual(searchPages(fixture, 'RUNTIME TRACE').map(page => page.title), ['Runtime trace', 'Another topic']);
  assert.equal(searchPages(fixture, '').length, 0);
  assert.equal(searchPages(fixture, 'INLINING')[0].title, 'Inlining pointers');
});

test('real phrase and code queries rank their focused explanation first', () => {
  for (const [query, slug] of [
    ['mprotect', 'bellek-izinleri'], ['p_offset', 'elf-parser-ve-adresler'],
    ['Build-ID', 'debug-bilgisi'], ['symbol selection', 'sembol-secimi'],
    ['"memory permission"', 'bellek-izinleri'], ['PROT_READ | PROT_EXEC', 'bellek-izinleri'],
    ['GOT PLT', 'dinamik-baglama'],
  ]) assert.ok(searchPages(index, query)[0]?.url.endsWith(`/${slug}.html`), query);
  assert.equal(searchPages(index, '"nonexistent exact phrase"').length, 0);
  const scattered = [{ title: 'memory', text: 'permission' }];
  assert.equal(searchPages(scattered, '"memory permission"').length, 0);
});

test('summaries and search excerpts preserve complete words and code identifiers', () => {
  assert.equal(descriptionText('One complete word boundary', 15), 'One complete…');
  assert.equal(descriptionText('p_offset', 4), 'p_offset');
  const text = 'Earlier context before a long identifier PROT_EXEC followed by several complete words after it.';
  const fragment = excerpt(text, '"PROT_EXEC"', 35);
  assert.ok(fragment.includes('PROT_EXEC'));
  assert.ok(!fragment.includes('PROT_EX…'));
  assert.ok(!fragment.includes('identifi…'));
});

test('notices render as labelled content and breadcrumbs describe the current page', async () => {
  for (const id of ['laboratuvarlar/bellek-izinleri', 'rehberler/stripped-elf', 'rehberler/elf-dosyadan-bellege', 'kaynak-kutuphanesi', 'okuma-rotalari']) {
    const { document } = parseHTML(await readFile(path.join(root, `${id}.html`), 'utf8'));
    const page = pages.find(page => page.id === id);
    assert.equal(document.querySelector('.breadcrumbs [aria-current="page"]').textContent, page.title);
    const links = [...document.querySelectorAll('.breadcrumbs a')].map(link => link.getAttribute('href'));
    assert.ok(!links.includes(`${base}/${id}.html`), id);
    if (id.includes('/')) {
      assert.ok(document.querySelector('.admonition[aria-label]'), id);
      assert.ok(!document.querySelector('.prose').textContent.match(/\[!(NOTE|WARNING)\]/), id);
    }
    assert.ok(!document.querySelector('.mobile-toc details').hasAttribute('open'), id);
    assert.ok(document.querySelector('.reading-toc details').hasAttribute('open'), id);
  }
});

test('code blocks use highlight.js languages, labelled groups and prompt-free GDB commands', async () => {
  const { default: hljs } = await import('highlight.js');
  let gdbBlocks = 0;
  for (const file of htmlFiles) {
    const { document } = parseHTML(await readFile(file, 'utf8'));
    const label = document.documentElement.lang === 'tr' ? 'kod örneği' : 'code example';
    for (const pre of document.querySelectorAll('.prose pre')) {
      const code = pre.querySelector('code');
      const language = code.className.replace('language-', '');
      assert.ok(hljs.getLanguage(language), `${file}: ${language}`);
      assert.equal(pre.getAttribute('role'), 'group', file);
      assert.ok(pre.getAttribute('aria-label').endsWith(` ${label}`), file);
      assert.ok(!/^\s*\(gdb\)/m.test(code.textContent), `${file}: copyable block contains a (gdb) prompt`);
      if (pre.getAttribute('aria-label') === `gdb ${label}`) gdbBlocks += 1;
    }
    for (const trail of document.querySelectorAll('.breadcrumbs')) {
      assert.equal(trail.querySelectorAll('[aria-current="page"]').length, 1, file);
      for (const separator of [...trail.children].filter(node => node.textContent === '/')) assert.equal(separator.getAttribute('aria-hidden'), 'true', file);
    }
  }
  assert.ok(gdbBlocks >= 9);
});

test('home routes follow the published reading routes', async () => {
  const { routes } = await import('../src/catalog.mjs');
  const published = (await readFile(path.resolve('content/okuma-rotalari.md'), 'utf8')).split(/^## Route /m).slice(1);
  assert.equal(published.length, routes.length);
  routes.forEach((route, index) => {
    const linked = [...published[index].split(/^> \*\*Practice/m)[0].matchAll(/\]\((rehberler\/[a-z-]+)\.md\)/g)].map(match => match[1]);
    assert.deepEqual(route.pages, linked, `Route ${route.n}`);
  });
});

test('project and root URL generation preserves links and rejects unsafe schemes', () => {
  const ids = new Set(['rehberler/ornek', 'kaynaklar']);
  for (const base of ['', '/execmap']) {
    assert.equal(rewriteLink('../kaynaklar.md#elf', 'rehberler/ornek', base, ids), `${base}/kaynaklar.html#elf`);
    assert.equal(pageUrl('index', base), `${base}/`);
  }
  assert.equal(normalizeBase('/'), '');
  assert.equal(normalizeBase('/execmap/'), '/execmap');
  assert.throws(() => normalizeBase('/../outside'));
  assert.throws(() => rewriteLink('javascript:alert(1)', 'index', '', ids));
  assert.throws(() => rewriteLink('eksik.md', 'index', '', ids));
  assert.equal(slugify('İzin değişimi: RW → RX'), 'izin-degisimi-rw-rx');
});

test('reading pages include complete code, source downloads, TOC and active navigation', async () => {
  const file = path.join(root, 'laboratuvarlar/sembol-secimi.html');
  const { document } = parseHTML(await readFile(file, 'utf8'));
  assert.ok(document.querySelector('pre code.language-c').textContent.includes('#include <stdio.h>'));
  assert.ok(document.querySelector('a[download]').getAttribute('href').endsWith('sembol-secimi.md'));
  assert.ok(document.querySelector('.sidebar-group a[aria-current="page"]').getAttribute('href').endsWith('sembol-secimi.html'));
  assert.ok(document.querySelectorAll('.toc-details a').length > 0);
  assert.ok(document.querySelector('.prose').textContent.includes('LD_PRELOAD'));
  assert.ok(document.querySelector('.prose').textContent.includes('22'));
});


test('file code blocks render an editor tab, clean line numbers, folding and a matching download', async () => {
  const { document } = parseHTML(await readFile(path.join(root, 'laboratuvarlar/cpu-profili.html'), 'utf8'));
  const block = [...document.querySelectorAll('.code-block')].find(item => item.querySelector('.code-tab')?.textContent === 'hotspot.c');
  assert.ok(block, 'hotspot.c tab');
  const code = block.querySelector('pre > code');
  const lines = code.textContent.split('\n').length;
  assert.ok(code.textContent.startsWith('#define _POSIX_C_SOURCE'), 'line numbers must stay outside the copied code');
  assert.equal(block.querySelector('.code-gutter').getAttribute('aria-hidden'), 'true');
  assert.equal(block.querySelector('.code-gutter').textContent.split('\n').length, lines);
  assert.equal(Number(block.dataset.codeFold), lines);
  const href = block.querySelector('a.code-download').getAttribute('href');
  assert.ok(href.endsWith('/code/laboratuvarlar/cpu-profili/hotspot.c'), href);
  const published = await readFile(path.join(root, href.slice(`${base}/`.length)), 'utf8');
  assert.equal(published, `${code.textContent}\n`);
  const shell = [...document.querySelectorAll('.code-block')].find(item => item.querySelector('code.language-bash'));
  assert.equal(shell.querySelector('.code-gutter'), null, 'shell commands stay unnumbered');
});

test('search text preserves code identifiers, operators and links without Markdown', () => {
  const source = '# Başlık\n\nBir **örnek**, `p_offset` ve [kaynak](https://example.com).\n\n```c\nif (x > 0) *ptr = PROT_READ;\n```';
  const text = plainText(source);
  assert.ok(text.includes('p_offset'));
  assert.ok(text.includes('if (x > 0) *ptr = PROT_READ;'));
  assert.ok(text.includes('kaynak'));
  assert.ok(!text.includes('https://example.com'));
  assert.ok(searchPages(index, 'p_offset').some(page => page.url.includes('elf-parser-ve-adresler')));
});
