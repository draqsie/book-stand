// Bağımlılıksız yerel sunucu. GitHub Pages'i taklit etmek için siteyi /book-stand/ alt yolunda sunar.
// Kullanım: node tools/serve.mjs [klasör]   (varsayılan: proje kökü)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve(process.argv[2] || '.');
const PORT = Number(process.env.PORT || 5173);
const BASE = '/book-stand/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.map': 'application/json',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/book-stand') { res.writeHead(302, { Location: BASE }); res.end(); return; }
  if (!url.pathname.startsWith(BASE)) { res.writeHead(404); res.end('Bulunamadı'); return; }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if (/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(rel)) { res.writeHead(404); res.end(); return; }
  const file = resolve(join(root, rel));
  if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('dosya değil');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bulunamadı');
  }
}).listen(PORT, () => {
  console.log(`book-stand: http://localhost:${PORT}${BASE}  (klasör: ${root})`);
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  aynı ağdaki cihazlar için: http://${n.address}:${PORT}${BASE}`);
  }
});
