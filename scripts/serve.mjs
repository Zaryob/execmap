import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeBase } from '../src/content.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const site = path.join(root, '_site');
const base = normalizeBase(process.env.SITE_BASEURL ?? '/execmap');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' && base) { res.writeHead(302, { Location: `${base}/` }); return res.end(); }
    if (base && !(pathname === base || pathname.startsWith(`${base}/`))) { res.writeHead(404); return res.end('Not found'); }
    pathname = pathname.slice(base.length);
    let file = path.resolve(site, `.${pathname}`);
    if (file !== site && !file.startsWith(site + path.sep)) { res.writeHead(403); return res.end(); }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await readFile(path.join(site, '404.html'))); }
}).listen(port, '0.0.0.0', () => console.log(`Local: http://localhost:${port}${base}/`));
