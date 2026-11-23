// Hash tabanlı yönlendirici: GitHub Pages alt yolunda sunucu ayarı gerektirmez.
const routes = [];
let cleanup = null;
let main = null;
let token = 0;

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler });
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', hash);
  if (location.hash === hash && !replace) render();
  else if (replace) render();
  else location.hash = hash;
}

export function currentPath() {
  return (location.hash || '#/').slice(1).split('?')[0] || '/';
}

export function query() {
  const q = (location.hash.split('?')[1] || '');
  return Object.fromEntries(new URLSearchParams(q));
}

export async function render() {
  const my = ++token;
  if (cleanup) {
    const c = cleanup; cleanup = null;
    try { await c(); } catch (err) { console.error(err); }
  }
  if (my !== token) return;
  const path = currentPath();
  main.replaceChildren();
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    document.body.dataset.route = r.re.source;
    try {
      const c = await r.handler(main, params, query());
      if (my !== token) { if (typeof c === 'function') await c(); return; }
      cleanup = typeof c === 'function' ? c : null;
    } catch (err) {
      console.error(err);
      main.replaceChildren(errorBox(err));
    }
    return;
  }
  location.hash = '#/';
}

function errorBox(err) {
  const d = document.createElement('div');
  d.className = 'container';
  d.innerText = `Bir hata oluştu: ${err?.message || err}`;
  return d;
}

export function startRouter(mainEl) {
  main = mainEl;
  window.addEventListener('hashchange', render);
  render();
}
