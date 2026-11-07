import { normalize, searchPages, excerpt } from './search.mjs';

export function initCatalog(doc = document) {
  const input = doc.getElementById('catalog-query');
  if (!input) return;
  const items = [...doc.querySelectorAll('[data-catalog-item]')];
  const buttons = [...doc.querySelectorAll('[data-filter]')];
  const status = doc.getElementById('catalog-status');
  const empty = doc.getElementById('catalog-empty');
  let filter = 'all';
  function update() {
    const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const item of items) {
      const text = normalize(item.dataset.search);
      const visible = (filter === 'all' || item.dataset.group === filter) && terms.every(term => text.includes(term));
      item.hidden = !visible;
      if (visible) count++;
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    status.textContent = `${count} / ${items.length} guides shown.`;
    empty.hidden = count !== 0;
  }
  input.addEventListener('input', update);
  for (const button of buttons) button.addEventListener('click', () => { filter = button.dataset.filter; update(); });
  doc.querySelector('[data-reset-filters]')?.addEventListener('click', () => {
    input.value = ''; filter = 'all'; update(); input.focus();
  });
  update();
  return { update };
}

export function initSearch(doc = document, request = (...args) => fetch(...args)) {
  const dialog = doc.getElementById('site-search');
  if (!dialog) return;
  const input = doc.getElementById('search-input');
  const list = doc.getElementById('search-results');
  const status = doc.getElementById('search-status');
  const base = doc.querySelector('meta[name="site-root"]').content;
  let pages = null;
  let pending = null;
  let opener;
  let loadError = false;
  function addResult(page, query) {
    const item = doc.createElement('li');
    const link = doc.createElement('a');
    const address = new URL(page.url, globalThis.location?.origin || 'https://zaryob.github.io');
    const origin = globalThis.location?.origin || 'https://zaryob.github.io';
    if (address.origin !== origin || !['http:', 'https:'].includes(address.protocol)) return;
    if (query) address.searchParams.set('highlight', query.replace(/"([^"]+)"/g, '$1'));
    link.href = `${address.pathname}${address.search}${address.hash}`;
    const label = doc.createElement('small');
    label.className = 'result-kind';
    label.textContent = `${page.kind === 'laboratuvar' ? 'lab' : page.kind === 'rehber' ? 'guide' : 'reference'} / ${page.section}`;
    const title = doc.createElement('span');
    title.textContent = page.title;
    const detail = doc.createElement('p');
    detail.className = 'result-excerpt';
    detail.textContent = query ? excerpt(page.text, query) : page.description;
    link.append(label, title, detail); item.append(link); list.append(item);
  }
  function render() {
    list.replaceChildren();
    if (loadError) {
      status.textContent = 'The search index could not be loaded. Check your connection and try again.';
      status.classList.add('search-error');
      const button = doc.createElement('button');
      button.type = 'button'; button.textContent = 'Try again';
      button.addEventListener('click', () => { void load(); });
      const item = doc.createElement('li'); item.append(button); list.append(item);
      return;
    }
    status.classList.remove('search-error');
    if (!pages) { status.textContent = 'Preparing search…'; return; }
    const query = input.value.trim();
    const results = query ? searchPages(pages, query) : pages.filter(page => page.kind === 'rehber').slice(0, 6);
    status.textContent = !query ? 'Guides to get started. Type to search the full text.' : !results.length ? 'No results found. Try a shorter term.' : `${results.length} result${results.length === 1 ? '' : 's'}${results.length === 40 ? ' (first 40)' : ''}. Select a title to open it.`;
    for (const page of results) addResult(page, query);
  }
  async function load() {
    if (pages) { render(); return; }
    if (pending) return pending;
    loadError = false; render();
    pending = (async () => {
      try {
        const response = await request(`${base}search-index.json`);
        if (!response.ok) throw new Error('Search index unavailable');
        const data = await response.json();
        if (!Array.isArray(data) || data.some(page => typeof page.title !== 'string' || typeof page.url !== 'string' || typeof page.text !== 'string')) throw new Error('Invalid search index');
        pages = data;
      } catch { loadError = true; }
      finally { pending = null; render(); }
    })();
    return pending;
  }
  function open(trigger) {
    if (!dialog.open) {
      opener = trigger || doc.activeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    input.focus();
    void load();
  }
  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    opener?.focus();
  }
  for (const trigger of doc.querySelectorAll('[data-site-search]')) trigger.addEventListener('click', () => open(trigger));
  dialog.querySelector('[data-search-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || typeof dialog.getBoundingClientRect !== 'function') return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  input.addEventListener('input', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      const first = list.querySelector('a');
      if (first) { event.preventDefault(); if (event.key === 'Enter') first.click(); else first.focus(); }
    }
  });
  list.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...list.querySelectorAll('a')];
    const index = links.indexOf(doc.activeElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && index === 0) input.focus();
    else links[Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  });
  doc.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const shortcut = (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
    if (shortcut) { event.preventDefault(); open(); }
    if (event.key === 'Escape' && dialog.hasAttribute('open')) { event.preventDefault(); close(); }
  });
  return { open, close, load, render };
}

export function initReading(doc = document) {
  const sidebar = doc.querySelector('.sidebar-menu');
  if (sidebar && typeof matchMedia === 'function') {
    const media = matchMedia('(min-width: 981px)');
    const update = () => { sidebar.open = media.matches; };
    update(); media.addEventListener('change', update);
  }
  if (typeof IntersectionObserver !== 'undefined') {
    const headings = [...doc.querySelectorAll('.prose h2[id], .prose h3[id]')];
    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.isIntersecting);
      if (!entry) return;
      for (const link of doc.querySelectorAll('.toc-details a')) {
        if (link.getAttribute('href') === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }, { rootMargin: '-100px 0px -60% 0px' });
    headings.forEach(heading => observer.observe(heading));
  }
}

export function boot(doc = document) {
  doc.querySelectorAll('[data-js-only]').forEach(element => { element.hidden = false; });
  initCatalog(doc); initSearch(doc); initReading(doc);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  else boot();
}
