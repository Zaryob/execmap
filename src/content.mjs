import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Lexer } from 'marked';
import { summaries, sections, labOrder } from './catalog.mjs';
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function slugify(text) {
  return String(text).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bolum';
}
export function parseContent(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('Frontmatter eksik');
  const metadata = Object.fromEntries(match[1].split(/\r?\n/).filter(Boolean).map(line => {
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error('Geçersiz frontmatter');
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));
  if (!metadata.title) throw new Error('Başlık eksik');
  return { ...metadata, markdown: raw.slice(match[0].length) };
}
export function plainText(markdown) {
  const collect = tokens => tokens.map(token => {
    if (token.type === 'space') return '';
    if (token.type === 'code' || token.type === 'codespan') return token.text;
    if (token.type === 'table') return [...token.header, ...token.rows.flat()].map(cell => collect(cell.tokens)).join(' ');
    if (token.items) return collect(token.items);
    if (token.tokens) return collect(token.tokens);
    return token.text || '';
  }).join(' ');
  return collect(Lexer.lex(markdown)).replace(/\s+/g, ' ').trim();
}

export async function loadPages(root) {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : (entry.name.endsWith('.md') ? [path.join(dir, entry.name)] : [])));
    return files.flat();
  }
  const files = (await walk(root)).sort();
  return Promise.all(files.map(async file => {
    const id = path.relative(root, file).replaceAll(path.sep, '/').replace(/\.md$/, '');
    const slug = id.split('/').at(-1);
    const parsed = parseContent(await readFile(file, 'utf8'));
    const text = plainText(parsed.markdown);
    const group = sections.find(section => section.pages.includes(slug));
    const kind = id.startsWith('laboratuvarlar/') ? 'laboratuvar' : id.startsWith('rehberler/') ? 'rehber' : 'sayfa';
    return { ...parsed, id, slug, text, kind, group: group?.key || kind, section: group?.name || (kind === 'laboratuvar' ? 'Laboratuvarlar' : 'Başvuru'), description: summaries[slug] || parsed.description || text.replace(parsed.title, '').trim().slice(0, 155), minutes: Math.max(2, Math.ceil(text.split(/\s+/).length / 190)), order: group ? sections.indexOf(group) * 100 + group.pages.indexOf(slug) : labOrder.indexOf(slug) };
  }));
}
export function normalizeBase(value = '/execmap') {
  if (value === '' || value === '/') return '';
  if (!/^\/[a-zA-Z0-9_/-]+\/?$/.test(value) || value.includes('..') || value.includes('//')) throw new Error('Geçersiz SITE_BASEURL');
  return value.replace(/\/$/, '');
}
export function pageUrl(id, base = '') { return `${base}/${id === 'index' ? '' : `${id}.html`}`; }
export function rewriteLink(href, pageId, base, pageIds) {
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith('#')) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) throw new Error(`Desteklenmeyen bağlantı: ${href}`);
  const match = href.match(/^([^?#]*)(.*)$/);
  if (!match[1].endsWith('.md')) return href;
  const id = path.posix.normalize(path.posix.join(path.posix.dirname(pageId), match[1])).replace(/\.md$/, '');
  if (!pageIds.has(id)) throw new Error(`Kırık içerik bağlantısı: ${pageId} -> ${href}`);
  return pageUrl(id, base) + match[2];
}
