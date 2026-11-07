import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { loadPages, normalizeBase, pageUrl, rewriteLink, slugify, plainText } from '../src/content.mjs';
import { searchPages, normalize } from '../public/search.mjs';

const root = path.resolve('_site');
const { document: homeDocument } = parseHTML(await readFile(path.join(root, 'index.html'), 'utf8'));
const base = homeDocument.querySelector('meta[name="site-root"]').content.replace(/\/$/, '');
const pages = await loadPages(path.resolve('content'));
const index = JSON.parse(await readFile(path.join(root, 'search-index.json'), 'utf8'));
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const htmlFiles = (await walk(root)).filter(file => file.endsWith('.html'));

test('all content is published with one title, a main landmark and navigation', async () => {
  assert.equal(pages.length, 22);
  assert.equal(htmlFiles.length, 26);
  for (const file of htmlFiles) {
    const { document } = parseHTML(await readFile(file, 'utf8'));
    assert.equal(document.documentElement.lang, 'tr', file);
    assert.equal(document.querySelectorAll('h1').length, 1, file);
    assert.equal(document.querySelectorAll('main').length, 1, file);
    assert.ok(document.querySelector('#main'), file);
    assert.ok(document.querySelector('#console-navigation'), file);
    assert.ok(document.querySelector('title').textContent.includes('execmap'), file);
    assert.ok(document.querySelector('meta[name="description"]').content.length > 20, file);
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
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

test('all 21 reading pages are searchable, including code and cited resources', () => {
  assert.equal(index.length, 21);
  for (const page of pages.filter(page => page.id !== 'index')) {
    const hit = index.find(entry => entry.title === page.title);
    assert.ok(hit, page.id);
    assert.ok(hit.url.startsWith(`${base}/`));
    assert.ok(hit.text.length > 100);
  }
  assert.ok(searchPages(index, 'mprotect').some(page => page.url.includes('bellek-izinleri')));
  assert.ok(searchPages(index, 'pyelftools').some(page => page.url.includes('kaynak-kutuphanesi')));
  assert.ok(searchPages(index, 'GOT PLT').some(page => page.url.includes('dinamik-baglama')));
  assert.equal(searchPages(index, 'birbiriyleeslesmeyenhayaliterim').length, 0);
});

test('the suite search adapter exposes full text, content language and baseurl links', async () => {
  const shared = JSON.parse(await readFile(path.join(root, 'search.json'), 'utf8'));
  assert.equal(shared.length, index.length);
  for (const record of shared) {
    assert.equal(record.type, 'execmap/');
    assert.equal(record.lang, 'tr');
    assert.ok(record.url.startsWith(`${base}/`));
    assert.equal(record.text, index.find(page => page.url === record.url).text);
  }
  assert.ok(shared.some(record => record.text.includes('pyelftools')));
});

test('search handles Turkish characters, multiple terms and ranks titles first', () => {
  assert.equal(normalize('ÇALIŞMA İZİ'), 'calisma izi');
  const fixture = [
    { title: 'Bir başka konu', text: 'Çalışma izi açıklaması', description: '' },
    { title: 'Çalışma izi', text: 'örnek', description: '' },
    { title: 'Çalışma', text: 'farklı bir konu', description: '' },
  ];
  assert.deepEqual(searchPages(fixture, 'calisma izi').map(page => page.title), ['Çalışma izi', 'Bir başka konu']);
  assert.equal(searchPages(fixture, '').length, 0);
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
  assert.ok(document.querySelector('pre code').textContent.includes('#include <stdio.h>'));
  assert.ok(document.querySelector('a[download]').getAttribute('href').endsWith('sembol-secimi.md'));
  assert.ok(document.querySelector('.sidebar-group a[aria-current="page"]').getAttribute('href').endsWith('sembol-secimi.html'));
  assert.ok(document.querySelectorAll('.toc-details a').length > 0);
  assert.ok(document.querySelector('.prose').textContent.includes('LD_PRELOAD'));
  assert.ok(document.querySelector('.prose').textContent.includes('22'));
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
