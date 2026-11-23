// Service worker kaydı ve güvenli güncelleme.
// Yeni sürüm bulunduğunda: kaydedilmemiş çalışma yoksa bekleyen kayıtlar yazılır ve uygulama
// sessizce yenilenir; varsa kullanıcıya bildirim gösterilir.
import { hasUnsavedWork, flushAll } from './savestate.js';
import { h, toast } from './ui.js';

let registration = null;
let waiting = null;
let banner = null;

export function swSupported() { return 'serviceWorker' in navigator; }

export async function initServiceWorker() {
  if (!swSupported()) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  } catch (err) {
    console.warn('Service worker kaydedilemedi', err);
    return;
  }
  if (sessionStorage.getItem('book-stand:updated')) {
    sessionStorage.removeItem('book-stand:updated');
    setTimeout(() => toast('book-stand güncellendi.'), 600);
  }
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // ilk kurulumda yenileme yapma
    reloading = true;
    sessionStorage.setItem('book-stand:updated', '1');
    location.reload();
  });

  const track = (worker) => {
    if (!worker) return;
    if (worker.state === 'installed') onWaiting(worker);
    else worker.addEventListener('statechange', () => { if (worker.state === 'installed') onWaiting(worker); });
  };
  if (registration.waiting && navigator.serviceWorker.controller) onWaiting(registration.waiting);
  registration.addEventListener('updatefound', () => track(registration.installing));

  // İnternete bağlanınca, uygulama öne gelince ve düzenli aralıklarla güncellemeyi denetle.
  window.addEventListener('online', () => checkForUpdate());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  setInterval(() => checkForUpdate(), 30 * 60 * 1000);
  // Uygulama arka plana geçince bekleyen güncellemeyi sessizce uygula (çalışma önce kaydedilir).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && waiting) tryApply(); });
}

export async function checkForUpdate({ manual = false } = {}) {
  if (!registration) { if (manual) toast('Güncelleme denetimi bu tarayıcıda kullanılamıyor.'); return; }
  if (!navigator.onLine) { if (manual) toast('İnternet bağlantısı yok.'); return; }
  try {
    await registration.update();
    if (manual && !registration.installing && !registration.waiting) toast('En güncel sürümü kullanıyorsun.');
  } catch {
    if (manual) toast('Güncelleme denetlenemedi.');
  }
}

const startedAt = Date.now();
// Kalemle yazılan ekranlar (PDF okuyucu, defter) açıkken kullanıcıyı kesintiye uğratma.
const inEditor = () => /^#\/(kitap|defter)\//.test(location.hash);

function onWaiting(worker) {
  if (!navigator.serviceWorker.controller) return;
  waiting = worker;
  const justOpened = Date.now() - startedAt < 15000;
  if (!hasUnsavedWork() && (justOpened || !inEditor() || document.visibilityState === 'hidden')) tryApply();
  else showBanner();
}

async function tryApply(force = false) {
  if (!waiting) return;
  if (!force && hasUnsavedWork()) { showBanner(); return; }
  await flushAll();
  if (!force && hasUnsavedWork()) { showBanner(); return; }
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

function showBanner() {
  if (banner) return;
  banner = h('div', { class: 'update-banner', role: 'status' },
    h('span', {}, 'book-stand’in yeni sürümü hazır. Güncellemeden önce çalışman kaydedilir.'),
    h('button', { type: 'button', class: 'btn primary small', onclick: async () => {
      banner.querySelector('span').textContent = 'Kaydediliyor ve güncelleniyor…';
      await flushAll();
      tryApply(true);
    } }, 'Kaydet ve güncelle'),
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => { banner.remove(); banner = null; } }, 'Sonra'));
  document.body.append(banner);
}
