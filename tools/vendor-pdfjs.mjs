// PDF.js dosyalarını node_modules'tan vendor/pdfjs klasörüne kopyalar.
// Kullanım: npm install && npm run vendor
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join('node_modules', 'pdfjs-dist');
const dst = join('vendor', 'pdfjs');
if (!existsSync(src)) {
  console.error('pdfjs-dist bulunamadı. Önce "npm install" çalıştırın.');
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
// Eski Safari sürümleriyle uyum için "legacy" derlemesi kullanılır.
cpSync(join(src, 'legacy', 'build', 'pdf.min.mjs'), join(dst, 'pdf.min.mjs'));
cpSync(join(src, 'legacy', 'build', 'pdf.worker.min.mjs'), join(dst, 'pdf.worker.min.mjs'));
cpSync(join(src, 'cmaps'), join(dst, 'cmaps'), { recursive: true });
cpSync(join(src, 'standard_fonts'), join(dst, 'standard_fonts'), { recursive: true });
cpSync(join(src, 'LICENSE'), join(dst, 'LICENSE'));
console.log('PDF.js vendor/pdfjs klasörüne kopyalandı.');
