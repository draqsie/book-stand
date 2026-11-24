// PDF.js yükleyicisi ve PDF yardımcıları. Kütüphane depoya gömülüdür (vendor/pdfjs),
// internet olmadan da çalışır.
import { drawStrokes, UNITS, canvasScale } from './ink.js';

let libPromise = null;
const base = new URL('../vendor/pdfjs/', import.meta.url);

export function pdfjs() {
  if (!libPromise) {
    libPromise = import('../vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      return lib;
    });
  }
  return libPromise;
}

export async function openPdf(blob) {
  const lib = await pdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return lib.getDocument({
    data,
    cMapUrl: new URL('cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', base).href,
    isEvalSupported: false,
    enableXfa: false,
  }).promise;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görüntü oluşturulamadı'))), type, quality));
}

/** İçe aktarma sırasında sayfa sayısı ve kapak görüntüsü üretir. */
export async function analyzePdf(blob) {
  const doc = await openPdf(blob);
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 320 / vp1.width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const cover = await canvasToBlob(c, 'image/jpeg', 0.8);
    c.width = c.height = 0;
    return { pageCount: doc.numPages, cover };
  } finally {
    doc.destroy();
  }
}

/**
 * Sayfadaki bir alanı (sayfa birimiyle) çizimlerle birlikte görüntü olarak keser.
 * rect: {x,y,w,h} — sayfa genişliği 1000 birim.
 */
export async function renderRegion(doc, pageNum, rect, strokes = []) {
  const page = await doc.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 });
  const rectPt = (rect.w / UNITS) * vp1.width;
  let s = Math.min(3, Math.max(1.5, 1400 / rectPt));
  const dpr = canvasScale(vp1.width * s, vp1.height * s);
  if (dpr < 1) s *= dpr;
  const vp = page.getViewport({ scale: s });
  const full = document.createElement('canvas');
  full.width = Math.floor(vp.width);
  full.height = Math.floor(vp.height);
  const ctx = full.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, full.width, full.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const k = full.width / UNITS;
  if (strokes.length) {
    // Mürekkebi ayrı tuvalde çiz: piksel silgisi yalnızca mürekkebi silsin, PDF'i değil.
    const ink = document.createElement('canvas');
    ink.width = full.width;
    ink.height = full.height;
    drawStrokes(ink.getContext('2d'), strokes, k);
    ctx.drawImage(ink, 0, 0);
    ink.width = ink.height = 0;
  }
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(rect.w * k));
  crop.height = Math.max(1, Math.round(rect.h * k));
  crop.getContext('2d').drawImage(full, rect.x * k, rect.y * k, rect.w * k, rect.h * k, 0, 0, crop.width, crop.height);
  full.width = full.height = 0;
  const blob = await canvasToBlob(crop, 'image/jpeg', 0.9);
  crop.width = crop.height = 0;
  return blob;
}
