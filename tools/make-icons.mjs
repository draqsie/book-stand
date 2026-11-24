// Uygulama simgelerini icons/icon-full.svg kaynağından üretir.
// Çizim için bilgisayardaki Edge veya Chrome'u başsız (headless) kullanır; ek paket gerekmez.
// Kullanım: node tools/make-icons.mjs   (tarayıcı yolu farklıysa: BROWSER="C:\...\chrome.exe")
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ICONS = resolve('icons');
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) { console.error('Edge veya Chrome bulunamadı. BROWSER ortam değişkeniyle yolunu verin.'); process.exit(1); }

// Köşeleri yuvarlatılmış sürüm (sekme simgesi ve "any" amaçlı simgeler için).
const full = readFileSync(join(ICONS, 'icon-full.svg'), 'utf8');
const rounded = full
  .replace(/<svg([^>]*)>/, '<svg$1>\n  <clipPath id="corner"><rect width="512" height="512" rx="114"/></clipPath>\n  <g clip-path="url(#corner)">')
  .replace(/<\/svg>\s*$/, '  </g>\n</svg>\n');
writeFileSync(join(ICONS, 'icon.svg'), rounded);

const jobs = [
  // [boyut, dosya, kaynak]
  [192, 'icon-192.png', 'icon.svg'],
  [512, 'icon-512.png', 'icon.svg'],
  [512, 'icon-maskable-512.png', 'icon-full.svg'], // Android maskeli: tam dolgu, içerik güvenli alanda
  [180, 'apple-touch-icon.png', 'icon-full.svg'], // iOS köşeleri kendisi yuvarlar
  [32, 'favicon-32.png', 'icon.svg'],
];

const tmp = mkdtempSync(join(tmpdir(), 'book-stand-icons-'));
try {
  for (const [size, out, src] of jobs) {
    const html = join(tmp, `${out}.html`);
    writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<img src="${pathToFileURL(join(ICONS, src)).href}" width="${size}" height="${size}" style="display:block"></body></html>`);
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${join(tmp, 'profile')}`,
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${join(ICONS, out)}`,
      pathToFileURL(html).href,
    ], { stdio: 'ignore' });
    console.log(`oluşturuldu: icons/${out} (${size}px)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
