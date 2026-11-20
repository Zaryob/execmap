import { initAbiExplorer } from './abi-explorer.mjs';
import { normalize, searchPages, excerpt } from './search.mjs';

export function initCatalog(doc = document) {
  const input = doc.getElementById('catalog-query');
  if (!input) return;
  const tr = doc.documentElement.lang === 'tr';
  const items = [...doc.querySelectorAll('[data-catalog-item]')];
  const buttons = [...doc.querySelectorAll('[data-filter]')];
  const status = doc.getElementById('catalog-status');
  const empty = doc.getElementById('catalog-empty');
  let filter = 'all';
  let started = false;
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
    // The count is visible only while a topic or query narrows the list;
    // after a reset screen readers still hear that every guide is back.
    const active = filter !== 'all' || terms.length > 0;
    if (active) status.textContent = tr ? `${count} / ${items.length} rehber gösteriliyor.` : `${count} / ${items.length} guides shown.`;
    else if (started) status.textContent = tr ? `${items.length} rehberin tümü gösteriliyor.` : `All ${items.length} guides shown.`;
    status.classList.toggle('console-sr-only', !active);
    started = true;
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
  const turkish = doc.documentElement.lang === 'tr';
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
    const contentLanguage = page.lang === 'tr' ? 'tr' : 'en';
    link.hreflang = contentLanguage;
    label.textContent = turkish
      ? (contentLanguage === 'tr' ? page.section : `${page.turkish?.section ?? 'Kaynak'} · İngilizce içerik`)
      : `${page.kind === 'laboratuvar' ? 'lab' : page.kind === 'rehber' ? 'guide' : 'reference'} / ${page.section}`;
    const title = doc.createElement('span');
    title.textContent = page.title;
    title.lang = contentLanguage;
    const detail = doc.createElement('p');
    detail.className = 'result-excerpt';
    detail.textContent = query ? excerpt(page.text, query) : page.description;
    detail.lang = contentLanguage;
    link.append(label, title, detail); item.append(link); list.append(item);
  }
  function render() {
    list.replaceChildren();
    if (loadError) {
      status.textContent = turkish ? 'Arama dizini yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.' : 'The search index could not be loaded. Check your connection and try again.';
      status.classList.add('search-error');
      const button = doc.createElement('button');
      button.type = 'button'; button.textContent = turkish ? 'Yeniden dene' : 'Try again';
      button.addEventListener('click', () => { void load(); });
      const item = doc.createElement('li'); item.append(button); list.append(item);
      return;
    }
    status.classList.remove('search-error');
    if (!pages) { status.textContent = turkish ? 'Arama hazırlanıyor…' : 'Preparing search…'; return; }
    const query = input.value.trim();
    const results = query ? searchPages(pages, query) : pages.filter(page => page.kind === 'rehber').slice(0, 6);
    if (!query) {
      status.textContent = turkish ? 'Başlangıç rehberleri. Aramak için bir terim yazın.' : 'Guides to get started. Type to search the full text.';
    } else if (!results.length) {
      status.textContent = turkish ? 'Sonuç bulunamadı. Daha kısa bir terim deneyin.' : 'No results found. Try a shorter term.';
    } else {
      status.textContent = turkish
        ? (results.length === 40 ? 'İlk 40 sonuç gösteriliyor.' : `${results.length} sonuç bulundu.`)
        : `${results.length} result${results.length === 1 ? '' : 's'}${results.length === 40 ? ' (first 40)' : ''}. Select a title to open it.`;
    }
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
        pages = turkish ? data.map(page => page.turkish?.lang === 'tr' ? page.turkish : page) : data;
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

// Long code blocks start folded to their first lines; without JavaScript,
// in search highlights and in print they stay complete.
export function initCodeBlocks(doc = document, search = doc.defaultView?.location?.search || '') {
  const tr = doc.documentElement.lang === 'tr';
  const terms = (new URLSearchParams(search).get('highlight') || '').toLowerCase().split(/\s+/).filter(Boolean);
  doc.querySelectorAll('.code-block[data-code-fold]').forEach((block, index) => {
    const pre = block.querySelector('pre');
    if (!pre || block.querySelector('.code-fold-toggle')) return;
    const lines = Number(block.dataset.codeFold);
    pre.id ||= `code-block-${index + 1}`;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'code-fold-toggle';
    button.setAttribute('aria-controls', pre.id);
    const render = folded => {
      block.classList.toggle('is-folded', folded);
      button.setAttribute('aria-expanded', String(!folded));
      button.textContent = folded ? (tr ? `${lines} satırın tamamını göster ↓` : `Show all ${lines} lines ↓`) : (tr ? 'Daralt ↑' : 'Collapse ↑');
    };
    button.addEventListener('click', () => {
      const folding = !block.classList.contains('is-folded');
      render(folding);
      if (folding) block.scrollIntoView({ block: 'nearest' });
    });
    block.append(button);
    // Keep a block open when the reader arrives through a search highlight inside it.
    const code = (pre.querySelector('code')?.textContent || '').toLowerCase();
    render(!terms.some(term => code.includes(term)));
  });
}

// On the shared theme a file header sticks under the page header while a block taller than the
// screen scrolls past. While it floats it folds into one compact row (see style.css). A sentinel
// spans each block and the observer watches a one-pixel band at the sticking line, so crossing
// it, even in one jump, is seen. When the header is not sticky nothing is observed or changed.
export function initStuckCodeHeads(doc = document) {
  const win = doc.defaultView;
  if (!win || !('IntersectionObserver' in win) || !('MutationObserver' in win)) return;
  const heads = [...doc.querySelectorAll('.code-block > .code-file')];
  if (!heads.length) return;
  const sentinels = new Map();
  let observer = null;
  let margin = '';
  const sticky = head => win.getComputedStyle(head).position === 'sticky';
  // The compact row must show the whole file name, or at least ten characters of a longer one;
  // when it cannot (narrow screen, large text), the name takes its own row above the buttons.
  const nameFits = head => {
    const tab = head.querySelector(':scope > .code-tab');
    const name = tab?.textContent.trim() || '';
    // The compact row exists only on narrow screens (the same breakpoint as style.css).
    if (!name || !win.matchMedia?.('(max-width: 700px)').matches) return true;
    const style = win.getComputedStyle(tab);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const full = tab.scrollWidth - padding;
    const room = tab.clientWidth - padding;
    // A cut name also gives one character's room to the ellipsis.
    return full <= room + 1 || room >= (full / name.length) * 11;
  };
  const copyWidths = new WeakMap();
  const unfit = head => {
    head.classList.remove('code-file--stuck', 'code-file--stuck-two-rows', 'code-file--stuck-word');
    head.style.removeProperty('--copy-room');
    ['--code-head-stuck', '--code-head-gap', '--code-copy-lift', '--code-copy-width'].forEach(name => head.parentElement.style.removeProperty(name));
  };
  const fit = head => {
    const block = head.parentElement;
    const copy = block.querySelector('.console-copy');
    unfit(head);
    const rest = head.offsetHeight;
    head.classList.add('code-file--stuck');
    // Copy keeps its word while the row still has room for the file name as nameFits asks;
    // otherwise it shows an icon, and when even that leaves too little room the name takes its own row.
    if (copy && win.matchMedia?.('(max-width: 700px)').matches) {
      head.classList.add('code-file--stuck-word');
      // The word's width, kept from a moment when the button showed it rather than a tick or an error.
      if (!copy.dataset.copyState) copyWidths.set(copy, copy.getBoundingClientRect().width);
      const width = copyWidths.get(copy) ?? copy.getBoundingClientRect().width;
      block.style.setProperty('--code-copy-width', `${width}px`);
      head.style.setProperty('--copy-room', `${width + 14}px`);
      if (!nameFits(head)) {
        head.classList.remove('code-file--stuck-word');
        head.style.removeProperty('--copy-room');
      }
    }
    if (!nameFits(head)) head.classList.add('code-file--stuck-two-rows');
    // The code under the header keeps its place; the header itself may still ride to the block's end.
    const gap = Math.max(0, rest - head.offsetHeight);
    if (head.nextElementSibling) head.nextElementSibling.style.marginTop = `${gap}px`;
    const height = head.getBoundingClientRect().height;
    block.style.setProperty('--code-head-stuck', `${height}px`);
    // Copy rides on a rail just under the header, and that gap lets it rise to the header at once.
    block.style.setProperty('--code-head-gap', `${gap}px`);
    // Lift Copy so its middle lines up with the header's other buttons.
    const button = head.querySelector(':scope > :is(.code-download, .console-code-toggle)');
    if (copy && button) {
      const row = button.getBoundingClientRect();
      const lift = head.getBoundingClientRect().top + height - (row.top + row.bottom) / 2 - copy.getBoundingClientRect().height / 2;
      block.style.setProperty('--code-copy-lift', `${lift}px`);
    }
  };
  const setStuck = (head, stuck) => {
    if (head.classList.contains('code-file--stuck') === stuck) return;
    if (stuck) fit(head);
    else {
      unfit(head);
      head.nextElementSibling?.style.removeProperty('margin-top');
    }
  };
  // While the header floats Copy may show an icon (style.css); its text still changes, and the
  // icon follows it briefly: a tick after copying, the text itself when copying failed.
  const label = text => win.ZaryobI18n?.t ? win.ZaryobI18n.t(text) : text;
  const copyState = new win.MutationObserver(records => records.forEach(record => {
    const button = record.target.closest?.('.console-copy');
    if (!button) return;
    const text = button.textContent.trim();
    if (text === label('Copy')) button.removeAttribute('data-copy-state');
    else button.dataset.copyState = text === label('Copied') ? 'copied' : 'failed';
  }));
  const check = head => {
    const line = parseFloat(win.getComputedStyle(head).top);
    setStuck(head, sticky(head) && Number.isFinite(line) && head.parentElement.getBoundingClientRect().top < line - 0.5);
  };
  const ensure = head => {
    let sentinel = sentinels.get(head);
    if (!sticky(head)) {
      if (sentinel && observer) observer.unobserve(sentinel);
      setStuck(head, false);
      return;
    }
    if (!sentinel) {
      sentinel = doc.createElement('span');
      sentinel.className = 'code-stick-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      head.parentElement.append(sentinel);
      sentinels.set(head, sentinel);
    }
    const line = Math.round(parseFloat(win.getComputedStyle(head).top) || 0);
    const wanted = `-${line}px 0px -${Math.max(0, doc.documentElement.clientHeight - line - 1)}px 0px`;
    if (!observer || wanted !== margin) {
      observer?.disconnect();
      margin = wanted;
      observer = new win.IntersectionObserver(entries => entries.forEach(entry => {
        const owner = heads.find(item => sentinels.get(item) === entry.target);
        if (owner) check(owner);
      }), { rootMargin: margin });
      heads.forEach(item => { if (sentinels.has(item) && sticky(item)) observer.observe(sentinels.get(item)); });
    } else observer.observe(sentinel);
    check(head);
  };
  // The theme marks a tall block with a class; folding and unfolding change it too.
  const mutations = new win.MutationObserver(records => records.forEach(record => {
    const head = record.target.querySelector(':scope > .code-file');
    if (head) ensure(head);
  }));
  heads.forEach(head => {
    mutations.observe(head.parentElement, { attributes: true, attributeFilter: ['class'] });
    copyState.observe(head.parentElement, { childList: true, subtree: true });
    ensure(head);
  });
  win.addEventListener('resize', () => heads.forEach(head => {
    ensure(head);
    if (head.classList.contains('code-file--stuck')) fit(head);
  }), { passive: true });
}

export function boot(doc = document) {
  doc.querySelectorAll('[data-js-only]').forEach(element => { element.hidden = false; });
  initCatalog(doc); initSearch(doc); initReading(doc); initCodeBlocks(doc); initStuckCodeHeads(doc); initAbiExplorer(doc);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  else boot();
}
