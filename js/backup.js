// Yedekleme: tüm verileri tek bir .zip dosyasına aktarır ve geri yükler.
// Zip "sıkıştırmasız" (store) biçimindedir; PDF'ler zaten sıkıştırılmış olduğundan boyut neredeyse aynıdır.
import * as db from './db.js';

const ROOT = 'book-stand/';

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, crc = 0) {
  crc ^= 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function blobCrc(blob) {
  let crc = 0;
  const CHUNK = 8 * 1024 * 1024;
  for (let off = 0; off < blob.size; off += CHUNK) {
    crc = crc32(new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer()), crc);
  }
  return crc;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** entries: [{name, blob}] → zip Blob */
export async function buildZip(entries, onProgress) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());
  for (const [i, e] of entries.entries()) {
    onProgress?.(i, entries.length, e.name);
    const name = enc.encode(e.name);
    const crc = await blobCrc(e.blob);
    const size = e.blob.size;
    if (offset + size > 0xfffffff0) throw new Error('Yedek 4 GB sınırını aşıyor. Bazı PDF’leri silip tekrar deneyin.');
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 dosya adı
    lh.setUint16(8, 0, true); // sıkıştırma yok
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, e.blob);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** Zip dosyasını okur → Map(ad → Blob). Yalnızca sıkıştırmasız girdileri destekler. */
export async function readZip(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Bu dosya geçerli bir yedek (.zip) değil.');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Yedek dosyası bozuk.');
    const method = cd.getUint16(p + 10, true);
    const size = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOff = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (method !== 0) throw new Error('Bu zip sıkıştırılmış. Yalnızca book-stand’in oluşturduğu yedekler geri yüklenebilir.');
    const lh = new DataView(await file.slice(localOff, localOff + 30).arrayBuffer());
    const start = localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    out.set(name, file.slice(start, start + size));
  }
  return out;
}

// ---------- Dışa / içe aktarma ----------
export async function exportBackup(onProgress) {
  const data = {};
  const entries = [];
  for (const name of Object.keys(db.STORES)) {
    if (name === 'files') continue;
    data[name] = await db.all(name);
  }
  data.books = data.books.map((b) => {
    if (b.cover instanceof Blob) {
      const path = `kapaklar/${b.id}.jpg`;
      entries.push({ name: ROOT + path, blob: b.cover });
      return { ...b, cover: path };
    }
    return b;
  });
  data.mistakes = data.mistakes.map((m) => {
    if (m.image instanceof Blob) {
      const path = `yanlislar/${m.id}.jpg`;
      entries.push({ name: ROOT + path, blob: m.image });
      return { ...m, image: path };
    }
    return m;
  });
  const files = await db.all('files');
  const titles = new Map(data.books.map((b) => [b.fileId, b.title]));
  data.files = files.map((f) => {
    const safe = (titles.get(f.id) || 'kitap').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
    const path = `pdf/${f.id}-${safe}.pdf`;
    entries.push({ name: ROOT + path, blob: f.blob });
    return { id: f.id, path };
  });
  const manifest = { app: 'book-stand', format: 1, exportedAt: new Date().toISOString(), data };
  entries.unshift({ name: ROOT + 'veri.json', blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) });
  return buildZip(entries, onProgress);
}

export async function importBackup(file) {
  const zip = await readZip(file);
  const json = zip.get(ROOT + 'veri.json');
  if (!json) throw new Error('Yedek içinde veri.json bulunamadı.');
  const manifest = JSON.parse(await json.text());
  if (manifest.app !== 'book-stand' || !manifest.data) throw new Error('Bu bir book-stand yedeği değil.');
  const d = manifest.data;
  const take = (path, type) => {
    const b = zip.get(ROOT + path);
    return b ? new Blob([b], { type }) : null;
  };
  const ops = [];
  for (const f of d.files || []) {
    const blob = take(f.path, 'application/pdf');
    if (blob) ops.push({ store: 'files', put: { id: f.id, blob } });
  }
  for (const b of d.books || []) ops.push({ store: 'books', put: { ...b, cover: typeof b.cover === 'string' ? take(b.cover, 'image/jpeg') : null } });
  for (const m of d.mistakes || []) ops.push({ store: 'mistakes', put: { ...m, image: typeof m.image === 'string' ? take(m.image, 'image/jpeg') : null } });
  for (const name of ['courses', 'ink', 'progress', 'bookmarks', 'notebookPages', 'solves']) {
    for (const rec of d[name] || []) ops.push({ store: name, put: rec });
  }
  await db.clearAll();
  // Büyük işlemleri parçalara böl.
  for (let i = 0; i < ops.length; i += 200) await db.batch(ops.slice(i, i + 200));
  return { courses: (d.courses || []).length, books: (d.books || []).length };
}
