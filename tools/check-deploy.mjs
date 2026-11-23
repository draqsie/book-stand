// GitHub Pages dağıtım yapısını denetler. Kullanım: node tools/check-deploy.mjs _site
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const dir = process.argv[2] || '_site';
const errors = [];
const fail = (m) => errors.push(m);
const read = (p) => readFileSync(join(dir, p), 'utf8');

for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', '.nojekyll', 'js/app.js', 'js/version.js', 'css/app.css', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs']) {
  if (!existsSync(join(dir, f))) fail(`Eksik dosya: ${f}`);
}
if (errors.length) { report(); }

const sw = read('sw.js');
if (sw.includes("'__BUILD_ID__'")) fail('sw.js yapı kimliğiyle damgalanmamış');
if (read('js/version.js').includes("'__BUILD_ID__'")) fail('js/version.js yapı kimliğiyle damgalanmamış');
const m = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
const precache = m ? JSON.parse(m[1]) : [];
if (!precache.length) fail('Önbellek listesi boş');
const pre = new Set(precache);
for (const u of precache) {
  if (!u.startsWith('./')) fail(`Önbellek yolu göreli değil: ${u}`);
  if (u !== './' && !existsSync(join(dir, u))) fail(`Önbellekteki dosya yok: ${u}`);
}

function walk(d) {
  return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const all = walk(dir).map((p) => relative(dir, p).split(sep).join('/'));

// Kullanıcı verisi (PDF, yedek) yayına girmemeli.
for (const f of all) if (/\.(pdf|zip)$/i.test(f)) fail(`Yayında olmaması gereken dosya: ${f}`);

// Tüm modüller önbellekte mi ve göreli içe aktarımlar çözülüyor mu?
for (const f of all.filter((x) => x.startsWith('js/') && x.endsWith('.js'))) {
  if (!pre.has(`./${f}`)) fail(`Önbellekte olmayan modül: ${f}`);
  const src = read(f);
  for (const [, spec] of src.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = posix.normalize(posix.join(posix.dirname(f), spec));
    if (!existsSync(join(dir, target))) fail(`${f}: içe aktarılan dosya yok → ${spec}`);
    else if (!pre.has(`./${target}`)) fail(`${f}: içe aktarılan dosya önbellekte değil → ${target}`);
  }
}

// index.html ve manifest: depo alt yolunda çalışması için tüm yollar göreli olmalı.
const html = read('index.html');
for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  if (/^https?:/.test(url)) continue;
  if (url.startsWith('/')) fail(`index.html mutlak yol kullanıyor (alt yolda bozulur): ${url}`);
  else if (!existsSync(join(dir, url))) fail(`index.html bağlantısı bulunamadı: ${url}`);
}
const man = JSON.parse(read('manifest.webmanifest'));
for (const k of ['start_url', 'scope', 'id']) if (!String(man[k] || '').startsWith('./')) fail(`manifest ${k} göreli olmalı ("./")`);
if (man.name !== 'book-stand' || man.short_name !== 'book-stand') fail('manifest adı "book-stand" olmalı');
for (const ic of man.icons || []) if (!existsSync(join(dir, ic.src))) fail(`manifest simgesi yok: ${ic.src}`);
if (!(man.icons || []).some((i) => i.sizes === '512x512')) fail('512x512 simge eksik');
report();

function report() {
  if (errors.length) {
    console.error('Dağıtım denetimi BAŞARISIZ:');
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
  console.log(`Dağıtım denetimi geçti: ${precache.length} önbellek girdisi, ${all.length} dosya.`);
}
