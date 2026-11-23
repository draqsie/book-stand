// Küçük tercihler localStorage'da tutulur (tema, kalem ayarları).
const KEY = 'book-stand:settings';
const DEFAULTS = {
  mode: 'system', // 'light' | 'dark' | 'system'
  lightTheme: 'latte',
  darkTheme: 'kutuphane',
  fingerDraws: true, // Apple Pencil algılanınca otomatik kapanır
  penSeen: false,
  penColor: '#2b2b2b',
  penSize: 2,
  hlColor: '#ffd54a',
  tool: 'hand',
  zoom: 1,
  dimPdf: false,
};

let cache = null;
const listeners = new Set();

export function getSettings() {
  if (!cache) {
    try { cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { cache = { ...DEFAULTS }; }
  }
  return cache;
}

export function setSettings(patch) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* kota dolu olabilir */ }
  for (const l of listeners) l(cache);
  return cache;
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
