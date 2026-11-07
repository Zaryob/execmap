export function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
}
export function searchPages(pages, query, limit = 40) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return pages.map(page => {
    const title = normalize(page.title);
    const summary = normalize(page.description || '');
    const body = normalize(page.text || '');
    if (!terms.every(term => `${title} ${summary} ${body}`.includes(term))) return null;
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 10 : 0) + (summary.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { ...page, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'en')).slice(0, limit);
}
export function excerpt(text, query, length = 155) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const term = normalize(query).trim().split(/\s+/)[0];
  const index = term ? normalize(clean).indexOf(term) : 0;
  const start = Math.max(0, index - 45);
  return `${start ? '…' : ''}${clean.slice(start, start + length)}${clean.length > start + length ? '…' : ''}`;
}
