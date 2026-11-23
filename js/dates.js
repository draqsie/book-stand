// Tarih yardımcıları — günler cihazın yerel saatine göre hesaplanır.
const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function formatDay(key, opts = {}) {
  const today = dateKey();
  if (!opts.full) {
    if (key === today) return 'Bugün';
    if (key === addDays(today, -1)) return 'Dün';
  }
  return parseKey(key).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: opts.year === false ? undefined : 'numeric', weekday: opts.weekday ? 'long' : undefined,
  });
}

export function formatShort(ts) {
  return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi çalışmalar';
  return 'İyi akşamlar';
}
