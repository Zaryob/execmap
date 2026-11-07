import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { initCatalog, initSearch } from '../public/app.js';

const home = await readFile('_site/index.html', 'utf8');
const { document: homeDocument } = parseHTML(home);
const base = homeDocument.querySelector('meta[name="site-root"]').content;
const index = JSON.parse(await readFile('_site/search-index.json', 'utf8'));

test('catalog combines topic and query, exposes empty state and resets both', () => {
  const { document, window } = parseHTML(home);
  initCatalog(document);
  const rows = [...document.querySelectorAll('[data-catalog-item]')];
  const visible = () => rows.filter(row => !row.hidden);
  assert.equal(visible().length, 15);
  document.querySelector('[data-filter="tracing"]').click();
  assert.equal(visible().length, 4);
  const input = document.getElementById('catalog-query');
  input.value = 'eBPF'; input.dispatchEvent(new window.Event('input'));
  assert.equal(visible().length, 1);
  assert.match(visible()[0].textContent, /eBPF/);
  input.value = 'girdi-yok'; input.dispatchEvent(new window.Event('input'));
  assert.equal(visible().length, 0);
  assert.equal(document.getElementById('catalog-empty').hidden, false);
  document.querySelector('[data-reset-filters]').click();
  assert.equal(input.value, '');
  assert.equal(visible().length, 15);
  assert.equal(document.querySelector('[data-filter="all"]').getAttribute('aria-pressed'), 'true');
});

test('search opens, loads once, renders matching content safely and closes', async () => {
  const { document, window } = parseHTML(home);
  let requests = 0;
  const search = initSearch(document, async url => {
    assert.equal(url, `${base}search-index.json`);
    requests++;
    return { ok: true, json: async () => index };
  });
  search.open(document.querySelector('[data-site-search]'));
  await search.load();
  assert.ok(document.getElementById('site-search').hasAttribute('open'));
  assert.ok(document.querySelectorAll('#search-results a').length > 0);
  assert.ok(document.querySelector('#search-results a').getAttribute('href').endsWith('elf-dosyadan-bellege.html'));
  const input = document.getElementById('search-input');
  input.value = 'mprotect'; input.dispatchEvent(new window.Event('input'));
  assert.ok([...document.querySelectorAll('#search-results a')].some(link => link.getAttribute('href').includes('bellek-izinleri')));
  const lab = [...document.querySelectorAll('#search-results a')].find(link => link.getAttribute('href').includes('bellek-izinleri'));
  assert.equal(new URL(lab.getAttribute('href'), 'https://test.local').searchParams.get('highlight'), 'mprotect');
  assert.match(document.getElementById('search-status').textContent, /results/);
  input.value = 'rastgeleyok123'; input.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('#search-results a').length, 0);
  assert.match(document.getElementById('search-status').textContent, /No results found/);
  search.close();
  assert.equal(document.getElementById('site-search').hasAttribute('open'), false);
  await search.load();
  assert.equal(requests, 1);
});

test('failed search offers a real retry and recovers', async () => {
  const { document } = parseHTML(home);
  let attempts = 0;
  const search = initSearch(document, async () => {
    attempts++;
    if (attempts === 1) throw new Error('offline');
    return { ok: true, json: async () => index };
  });
  await search.load();
  assert.match(document.getElementById('search-status').textContent, /could not be loaded/);
  assert.equal(document.querySelector('#search-results button').textContent, 'Try again');
  await search.load();
  assert.equal(attempts, 2);
  assert.ok(document.querySelector('#search-results a'));
});

test('untrusted index text stays text; external result URLs are excluded', async () => {
  const { document } = parseHTML(home);
  const search = initSearch(document, async () => ({ ok: true, json: async () => [
    { title: '<img src=x onerror=alert(1)>', description: '<b>metin</b>', text: 'örnek', kind: 'rehber', section: 'ELF', url: '/execmap/rehberler/index.html' },
    { title: 'Dış hedef', description: '', text: 'örnek', kind: 'rehber', section: 'ELF', url: 'https://example.com/' },
  ] }));
  await search.load();
  assert.equal(document.querySelectorAll('#search-results a').length, 1);
  assert.equal(document.querySelectorAll('#search-results img').length, 0);
  assert.match(document.getElementById('search-results').textContent, /<img/);
});
