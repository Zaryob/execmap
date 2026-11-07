import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
const theme = await readFile('public/assets/console/theme.js', 'utf8');

test('English pages do not load preference-driven language adapters', async () => {
  const { document } = parseHTML(await readFile('_site/rehberler/elf-dosyadan-bellege.html', 'utf8'));
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.querySelector('main').lang, 'en');
  assert.equal(document.querySelector('article').lang, 'en');
  assert.equal(document.querySelector('[data-console-language]'), null);
  assert.equal(document.querySelector('.console-language-note'), null);
  const scripts = [...document.querySelectorAll('script[src]')].map(node => node.getAttribute('src'));
  assert.ok(!scripts.some(src => /(?:language|i18n)\.js$/.test(src)));
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
    window: { matchMedia, addEventListener() {}, ZaryobI18n: { t: text => ({ Copy: 'Copy', Copied: 'Copied' })[text] || text, apply() {} } },
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
  assert.equal(copy.textContent, 'Copied');
});
