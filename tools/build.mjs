// Yayımlanacak siteyi _site klasöründe hazırlar:
// - yalnızca uygulama dosyalarını kopyalar (araçlar, node_modules vb. hariç),
// - service worker ve sürüm dosyasına yapı kimliğini yazar,
// - service worker'ın önbelleğe alacağı dosya listesini üretir.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = '_site';
const INCLUDE = ['index.html', 'manifest.webmanifest', 'sw.js', '.nojekyll', 'css', 'js', 'icons', 'vendor'];
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const BUILD_ID = process.env.BUILD_ID || (sha ? `${sha}-${process.env.GITHUB_RUN_NUMBER || '0'}` : `yerel-${Date.now().toString(36)}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of INCLUDE) {
  if (!existsSync(item)) { console.error(`Eksik: ${item}`); process.exit(1); }
  cpSync(item, join(OUT, item), { recursive: true });
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(OUT).map((p) => relative(OUT, p).split(sep).join('/'));
const precache = ['./', ...files
  .filter((f) => f !== 'sw.js' && f !== '.nojekyll' && !f.endsWith('.map') && !f.endsWith('LICENSE'))
  .filter((f) => !f.startsWith('vendor/pdfjs/cmaps/') && !f.startsWith('vendor/pdfjs/standard_fonts/'))
  .sort()
  .map((f) => `./${f}`)];

const swPath = join(OUT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
if (!sw.includes('[/*__PRECACHE__*/]')) { console.error('sw.js içinde önbellek listesi yer tutucusu yok'); process.exit(1); }
sw = sw.replace('[/*__PRECACHE__*/]', JSON.stringify(precache, null, 2)).replace("'__BUILD_ID__'", `'${BUILD_ID}'`);
writeFileSync(swPath, sw);
const verPath = join(OUT, 'js', 'version.js');
writeFileSync(verPath, readFileSync(verPath, 'utf8').replace("'__BUILD_ID__'", `'${BUILD_ID}'`));

console.log(`Site hazır: ${OUT}/  (yapı: ${BUILD_ID}, önbellek: ${precache.length} dosya)`);
