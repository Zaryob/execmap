export function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
}
function queryTerms(query) {
  // Quoted phrases are one required match; code punctuation remains literal.
  return [...normalize(query).matchAll(/"([^"]+)"|(\S+)/g)]
    .map(match => (match[1] || match[2]).replace(/\s+/g, ' ').trim()).filter(Boolean);
}
export function searchPages(pages, query, limit = 40) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const phrase = terms.join(' ');
  return pages.map(page => {
    const title = normalize(page.title);
    const summary = normalize(page.description || '');
    const body = normalize(page.text || '');
    const headings = normalize(page.headings || '');
    const code = normalize(page.code || '');
    if (!terms.every(term => [title, summary, body].some(field => field.includes(term)))) return null;
    // Favor the focused explanation and repeated code use over a passing mention.
    const score = terms.reduce((total, term) => total
      + (title.includes(term) ? 10 : 0) + (summary.includes(term) ? 4 : 0)
      + (headings.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0)
      + Math.min(5, code.split(term).length - 1) * 2, 0)
      + (title.includes(phrase) ? 12 : 0) + (summary.includes(phrase) ? 6 : 0)
      + (headings.includes(phrase) ? 4 : 0) + (code.includes(phrase) ? 3 : 0);
    return { ...page, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'en')).slice(0, limit);
}
export function excerpt(text, query, length = 155) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const term = queryTerms(query)[0];
  const index = term ? normalize(clean).indexOf(term) : 0;
  const context = Math.max(0, Math.min(45, Math.floor((length - (term?.length || 0)) / 2)));
  let start = Math.max(0, index - context);
  if (start && /\S/.test(clean[start - 1])) {
    const space = clean.indexOf(' ', start);
    start = space < 0 ? 0 : space + 1;
  }
  let end = Math.min(clean.length, start + length);
  if (end < clean.length && /\S/.test(clean[end])) {
    const space = clean.lastIndexOf(' ', end);
    // A long single code identifier is kept intact.
    end = space > start ? space : (clean.indexOf(' ', end) < 0 ? clean.length : clean.indexOf(' ', end));
  }
  return `${start ? '…' : ''}${clean.slice(start, end).trimEnd()}${end < clean.length ? '…' : ''}`;
}
