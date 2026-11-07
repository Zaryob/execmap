import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
const theme = await readFile('public/assets/console/theme.js', 'utf8');

test('shared language adapters keep a Turkish document visible without translation notes', async () => {
  const { document, window: dom } = parseHTML('<html lang="tr"><body><main lang="tr"><h1>ELF rehberi</h1></main></body></html>');
  const callbacks = [];
  const context = {
    document, URL, URLSearchParams, Intl, CustomEvent: dom.CustomEvent,
    navigator: { language: 'en-US' },
    location: { href: 'https://zaryob.github.io/execmap/?lang=en' },
    localStorage: { getItem() {}, setItem() {} },
    window: { addEventListener() {}, dispatchEvent() {} },
  };
  document.addEventListener = (_type, callback) => callbacks.push(callback);
  for (const asset of ['language.js', 'i18n.js']) {
    vm.runInNewContext(await readFile(`public/assets/console/${asset}`, 'utf8'), context);
  }
  assert.doesNotThrow(() => callbacks.forEach(callback => callback()));
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.querySelector('main').lang, 'tr');
  assert.equal(document.documentElement.hidden, false);
});

test('shared console theme persists choice, toggles compact menu and copies code', async () => {
  const { document, window: dom } = parseHTML(await readFile('_site/rehberler/elf-dosyadan-bellege.html', 'utf8'));
  let stored = 'dark';
  let copied = null;
  const system = { matches: false, addEventListener() {} };
  const compact = { matches: true, addEventListener() {} };
  const matchMedia = query => query.includes('prefers-color') ? system : compact;
  const select = document.querySelector('[data-console-theme]');
  Object.defineProperty(select, 'value', { configurable: true, writable: true, value: 'system' });
  const context = {
    document,
    URLSearchParams,
    window: { matchMedia, addEventListener() {}, ZaryobI18n: { t: text => ({ Copy: 'Kopyala', Copied: 'Kopyalandı' })[text] || text, apply() {} } },
    matchMedia,
    localStorage: { getItem: () => stored, setItem: (key, value) => { assert.equal(key, 'zaryob-theme'); stored = value; } },
    location: { search: '' },
    navigator: { clipboard: { writeText: async text => { copied = text; } } },
    setTimeout() {},
  };
  vm.runInNewContext(theme, context);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  document.dispatchEvent(new dom.Event('DOMContentLoaded'));
  assert.equal(select.value, 'dark');
  select.value = 'light'; select.dispatchEvent(new dom.Event('change'));
  assert.equal(stored, 'light');
  assert.equal(document.documentElement.dataset.theme, 'light');
  const menu = document.querySelector('[data-console-menu]');
  menu.click();
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  assert.equal(document.getElementById('console-navigation').classList.contains('is-open'), true);
  menu.click();
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  const code = document.querySelector('pre > code');
  const copy = document.querySelector('.console-copy');
  assert.ok(copy);
  copy.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(copied, code.textContent);
  assert.equal(copy.textContent, 'Kopyalandı');
});
