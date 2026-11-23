// book-stand service worker.
// - Uygulama dosyalarını önbelleğe alır (çevrimdışı çalışma).
// - Kullanıcının PDF'lerini ASLA önbelleğe koymaz: PDF'ler IndexedDB'de durur ve ağdan geçmez.
// - Yayımlamada BUILD değeri commit kimliğiyle değişir; dosya değiştiği için tarayıcı yeni sürümü fark eder.
const BUILD = '__BUILD_ID__';
const DEV = BUILD.startsWith('__');
const PRECACHE = [/*__PRECACHE__*/];
const APP_CACHE = `book-stand-app-${BUILD}`;
const DATA_CACHE = 'book-stand-pdfjs-data-4.10.38'; // PDF.js yazı tipi/cmap dosyaları (isteğe bağlı yüklenir)
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  if (DEV) return;
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((u) => new Request(new URL(u, SCOPE), { cache: 'reload' })))),
  );
  // Yeni sürüm, uygulama "SKIP_WAITING" diyene kadar bekler (kaydedilmemiş çalışma korunur).
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => (k.startsWith('book-stand-app-') && k !== APP_CACHE) || (k.startsWith('book-stand-pdfjs-data-') && k !== DATA_CACHE))
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (/\/vendor\/pdfjs\/(cmaps|standard_fonts)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(req, DATA_CACHE));
    return;
  }
  if (DEV) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(new URL('./index.html', SCOPE), { cacheName: APP_CACHE });
      if (cached) return cached;
      try { return await fetch(req); } catch { return offlineResponse(); }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: APP_CACHE, ignoreSearch: true });
    if (cached) return cached;
    return fetch(req);
  })());
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(req.mode === 'navigate' ? new URL('./index.html', SCOPE) : req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req.mode === 'navigate' ? new URL('./index.html', SCOPE) : req, { ignoreSearch: true });
    return hit || offlineResponse();
  }
}

function offlineResponse() {
  return new Response('<!doctype html><meta charset="utf-8"><title>book-stand</title><p style="font-family:system-ui;padding:2rem">book-stand çevrimdışı ve bu dosya henüz önbellekte değil. İnternete bağlanıp tekrar açın.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
