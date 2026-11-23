// book-stand giriş noktası.
import { route, startRouter } from './router.js';
import { applyTheme } from './theme.js';
import { initServiceWorker } from './update.js';
import { setSaveErrorHandler } from './savestate.js';
import { toast, icon, h } from './ui.js';
import { openDB } from './db.js';
import { renderHome } from './views/home.js';
import { renderCourse } from './views/course.js';
import { renderViewer } from './views/viewer.js';
import { renderNotebook } from './views/notebook.js';
import { renderReport } from './views/report.js';
import { renderSettings } from './views/settings.js';

applyTheme();
setSaveErrorHandler((err) => {
  console.error(err);
  toast(err?.name === 'QuotaExceededError' ? 'Depolama alanı dolu: son değişiklik kaydedilemedi.' : 'Kaydedilemedi. Lütfen tekrar dene.', { duration: 5000 });
});

const immersive = (fn) => async (main, params, q) => {
  document.body.classList.add('immersive');
  const cleanup = await fn(main, params, q);
  return async () => { document.body.classList.remove('immersive'); if (cleanup) await cleanup(); };
};

route('/', (m) => renderHome(m));
route('/ders/:id', (m, p) => renderCourse(m, { id: p.id }));
route('/ders/:id/:tab', (m, p) => renderCourse(m, p));
route('/kitap/:id', immersive((m, p, q) => {
  const rect = q.r ? q.r.split(',').map(Number) : null;
  return renderViewer(m, {
    bookId: p.id,
    page: q.s ? parseInt(q.s, 10) : null,
    rect: rect && rect.length === 4 && rect.every(Number.isFinite) ? { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } : null,
  });
}));
route('/defter/:courseId', immersive((m, p, q) => renderNotebook(m, p, q)));
route('/rapor', (m) => renderReport(m, {}));
route('/rapor/:date', (m, p) => renderReport(m, p));
route('/ayarlar', (m) => renderSettings(m));

// Üst gezinme çubuğundaki etkin bağlantıyı işaretle.
function markNav() {
  const path = (location.hash || '#/').slice(1);
  document.querySelectorAll('.appnav a').forEach((a) => {
    const key = a.dataset.nav;
    const on = key === 'home' ? (path === '/' || path.startsWith('/ders')) : path.startsWith(`/${key}`);
    a.classList.toggle('on', on);
  });
}
window.addEventListener('hashchange', markNav);

async function boot() {
  document.querySelectorAll('[data-icon]').forEach((el) => el.prepend(icon(el.dataset.icon, 20)));
  try {
    await openDB();
  } catch (err) {
    document.getElementById('main').replaceChildren(h('div', { class: 'container' },
      h('h2', {}, 'Yerel veritabanı açılamadı'),
      h('p', {}, 'Safari özel tarama modunda veya depolama kapalıyken book-stand verileri saklayamaz. Normal modda açmayı dene.'),
      h('p', { class: 'muted small' }, String(err?.message || err))));
    return;
  }
  startRouter(document.getElementById('main'));
  markNav();
  initServiceWorker();
}
boot();
