// PDF okuyucu: sayfalar arasında kaydırma, kalemle yazma, ayraçlar, kaldığın yer,
// soru seçip yanlış defterine ekleme ve çözüldü olarak işaretleme.
import * as store from '../store.js';
import { openPdf, renderRegion } from '../pdf.js';
import { InkLayer, InkController, UNITS, canvasScale } from '../ink.js';
import { createToolbar } from '../toolbar.js';
import { h, icon, iconButton, toast, modal, confirmDialog, promptText, sheet } from '../ui.js';
import { getSettings, setSettings } from '../settings.js';
import { debouncedSaver, flushAll } from '../savestate.js';
import { formatShort, formatTime, dateKey } from '../dates.js';
import { navigate } from '../router.js';

const GAP = 18;
const clampZoom = (z) => Math.max(0.5, Math.min(3, z));

export async function renderViewer(main, { bookId, page: targetPage, rect: targetRect }) {
  const book = await store.getBook(bookId);
  if (!book) {
    main.append(h('div', { class: 'container' }, h('p', {}, 'Kitap bulunamadı. Silinmiş olabilir.'), h('a', { class: 'btn primary', href: '#/' }, 'Ana sayfaya dön')));
    return;
  }
  const course = await store.getCourse(book.courseId);
  const blob = await store.getBookBlob(book);

  const root = h('div', { class: 'viewer' });
  const scroller = h('div', { class: 'scroller' });
  const pagesEl = h('div', { class: 'pages' });
  scroller.append(pagesEl);
  const pageLabel = h('button', { type: 'button', class: 'page-ind', title: 'Sayfaya git', onclick: () => gotoPrompt() }, '…');
  const titleEl = h('div', { class: 'vtitle' }, h('strong', {}, book.title), h('small', {}, course?.name || ''));

  const header = h('header', { class: 'vbar' },
    iconButton('back', 'Derse dön', () => navigate(`#/ders/${book.courseId}/kitaplar`)),
    titleEl,
    h('div', { class: 'vbar-actions' },
      pageLabel,
      iconButton('zoomOut', 'Uzaklaştır', () => zoomBy(1 / 1.2)),
      iconButton('zoomIn', 'Yakınlaştır', () => zoomBy(1.2)),
      iconButton('bookmarkPlus', 'Bu sayfaya ayraç koy', () => addBookmarkHere()),
      iconButton('list', 'Ayraçlar ve kaldığın yer', () => openBookmarks()),
      h('button', { type: 'button', class: 'btn soft solve-btn', onclick: () => bulkSolve() }, icon('checkCircle', 20), h('span', {}, 'Soru çözdüm')),
    ),
  );
  root.append(header, scroller);
  main.append(root);

  if (!blob) {
    scroller.append(h('div', { class: 'container' }, h('p', {}, 'Bu kitabın PDF dosyası bu cihazda bulunamadı.')));
    return;
  }

  const loading = h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('p', {}, 'Kitap hazırlanıyor…'));
  scroller.append(loading);

  let doc;
  try {
    doc = await openPdf(blob);
  } catch (err) {
    console.error(err);
    loading.replaceChildren(h('p', {}, 'PDF açılamadı. Dosya bozuk veya parola korumalı olabilir.'));
    return;
  }

  // Tüm sayfa boyutlarını önceden al (kaydırma konumunun kesin olması için).
  const n = doc.numPages;
  const sizes = new Array(n + 1);
  for (let i = 1; i <= n; i += 24) {
    const batch = [];
    for (let j = i; j < Math.min(n + 1, i + 24); j++) {
      batch.push(doc.getPage(j).then((p) => { const v = p.getViewport({ scale: 1 }); sizes[j] = { w: v.width, h: v.height }; }));
    }
    await Promise.all(batch);
    if (!root.isConnected) { doc.destroy(); return; }
  }
  loading.remove();
  if (book.pageCount !== n) { book.pageCount = n; }
  book.lastOpenedAt = Date.now();
  store.updateBook(book);

  const maxW = Math.max(...sizes.slice(1).map((s) => s.w));
  let zoom = clampZoom(getSettings().zoom || 1);
  let zoomVersion = 0;
  let tops = [];
  let current = 1;
  let destroyed = false;

  // Kalem denetleyicisi
  const ctrl = new InkController({
    scroller, root,
    onSelect: (layer, rect) => onRegionSelected(layer, rect),
    onToast: (m) => toast(m, { duration: 4500 }),
  });
  const toolbar = createToolbar(ctrl, { select: true });
  root.append(toolbar);

  // Sayfa öğeleri
  const P = [null];
  for (let i = 1; i <= n; i++) {
    const el = h('div', { class: 'page', dataset: { page: i } });
    const marks = h('div', { class: 'marks' });
    const inkEl = h('div', { class: 'ink' });
    el.append(marks, inkEl, h('span', { class: 'page-no' }, i));
    const layer = new InkLayer({ el: inkEl, ownerId: book.id, page: i, controller: ctrl });
    ctrl.bind(layer);
    P.push({ n: i, el, marks, layer, canvas: null, rendered: -1, task: null, want: false });
    pagesEl.append(el);
  }

  function baseWidth() {
    return Math.max(280, Math.min(scroller.clientWidth - 2 * GAP, 1100));
  }

  function layout() {
    for (let pass = 0; pass < 2; pass++) {
      const cw = scroller.clientWidth;
      const f = (baseWidth() * zoom) / maxW;
      for (let i = 1; i <= n; i++) {
        const s = sizes[i];
        P[i].el.style.width = `${Math.round(s.w * f)}px`;
        P[i].el.style.height = `${Math.round(s.h * f)}px`;
      }
      // Kaydırma çubuğu belirip genişlik değiştiyse bir kez daha hesapla.
      if (scroller.clientWidth === cw) break;
    }
    tops = P.map((p) => (p ? p.el.offsetTop : 0));
  }

  function pageAtY(y) {
    let lo = 1, hi = n;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tops[mid] <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Sayfadaki bir noktayı sabit tutarak yeniden yerleşim
  function anchorAt(cx, cy) {
    const y = scroller.scrollTop + cy;
    const i = pageAtY(y);
    const el = P[i].el;
    return { i, fy: (y - tops[i]) / el.offsetHeight, fx: (scroller.scrollLeft + cx - el.offsetLeft) / el.offsetWidth, cx, cy };
  }
  function restoreAnchor(a) {
    const el = P[a.i].el;
    scroller.scrollTop = tops[a.i] + a.fy * el.offsetHeight - a.cy;
    scroller.scrollLeft = el.offsetLeft + a.fx * el.offsetWidth - a.cx;
  }

  function scrollToPage(i, offset = 0, center = false) {
    i = Math.max(1, Math.min(n, i));
    const el = P[i].el;
    let top = tops[i] + offset * el.offsetHeight;
    if (center) top -= scroller.clientHeight * 0.3;
    scroller.scrollTop = Math.max(0, top - (offset === 0 && !center ? GAP / 2 : 0));
    const left = el.offsetLeft + el.offsetWidth / 2 - scroller.clientWidth / 2;
    scroller.scrollLeft = Math.max(0, left);
  }

  // ---------- Sayfa çizimi (yalnızca görünen sayfalar, bellek dostu) ----------
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = P[Number(e.target.dataset.page)];
      p.want = e.isIntersecting;
      if (!p.want) release(p);
    }
    pump();
  }, { root: scroller, rootMargin: '120% 0px 120% 0px' });
  for (let i = 1; i <= n; i++) io.observe(P[i].el);

  let pumping = false;
  async function pump() {
    if (pumping || destroyed) return;
    pumping = true;
    try {
      while (!destroyed) {
        const next = P.filter((p) => p && p.want && p.rendered !== zoomVersion).sort((a, b) => Math.abs(a.n - current) - Math.abs(b.n - current))[0];
        if (!next) break;
        await renderPage(next);
      }
    } finally { pumping = false; }
  }

  async function renderPage(p) {
    const version = zoomVersion;
    try {
      const page = await doc.getPage(p.n);
      if (destroyed || !p.want) return;
      const cssW = p.el.clientWidth, cssH = p.el.clientHeight;
      const dpr = canvasScale(cssW, cssH);
      const vp = page.getViewport({ scale: (cssW / sizes[p.n].w) * dpr });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      p.task = page.render({ canvasContext: ctx, viewport: vp });
      await p.task.promise;
      p.task = null;
      if (destroyed || !p.want || version !== zoomVersion) { canvas.width = canvas.height = 0; return; }
      if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); }
      p.canvas = canvas;
      p.el.prepend(canvas);
      p.rendered = version;
      await p.layer.mount();
      if (!p.want) p.layer.unmount();
      renderMarks(p.n);
    } catch (err) {
      p.task = null;
      if (err?.name !== 'RenderingCancelledException') console.warn('Sayfa çizilemedi', p.n, err);
      p.rendered = version; // sonsuz döngüyü önle
    }
  }

  function release(p) {
    if (p.task) { try { p.task.cancel(); } catch { /* yok say */ } p.task = null; }
    if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); p.canvas = null; }
    p.layer.unmount();
    p.rendered = -1;
  }

  function rerenderAll() {
    zoomVersion++;
    for (let i = 1; i <= n; i++) {
      const p = P[i];
      if (p.canvas) p.layer.resize();
      renderMarks(i);
    }
    pump();
  }

  function setZoom(z, anchor) {
    z = clampZoom(z);
    if (Math.abs(z - zoom) < 0.001) return;
    const a = anchor || anchorAt(scroller.clientWidth / 2, scroller.clientHeight / 3);
    zoom = z;
    setSettings({ zoom });
    layout();
    restoreAnchor(a);
    rerenderAll();
  }
  const zoomBy = (f) => setZoom(zoom * f);

  // iPad Safari kıstırma (pinch) hareketi
  let gesture = null;
  const onGestureStart = (e) => {
    e.preventDefault();
    const r = scroller.getBoundingClientRect();
    const cx = (e.clientX ?? r.width / 2 + r.left) - r.left, cy = (e.clientY ?? r.height / 2 + r.top) - r.top;
    gesture = { anchor: anchorAt(cx, cy), ox: scroller.scrollLeft + cx, oy: scroller.scrollTop + cy };
    pagesEl.style.transformOrigin = `${gesture.ox}px ${gesture.oy}px`;
  };
  const onGestureChange = (e) => {
    if (!gesture) return;
    e.preventDefault();
    const s = clampZoom(zoom * e.scale) / zoom;
    pagesEl.style.transform = `scale(${s})`;
    gesture.scale = s;
  };
  const onGestureEnd = (e) => {
    if (!gesture) return;
    e.preventDefault();
    pagesEl.style.transform = '';
    const g = gesture; gesture = null;
    if (g.scale && Math.abs(g.scale - 1) > 0.03) setZoom(zoom * g.scale, g.anchor);
  };
  scroller.addEventListener('gesturestart', onGestureStart);
  scroller.addEventListener('gesturechange', onGestureChange);
  scroller.addEventListener('gestureend', onGestureEnd);

  // ---------- Kaldığın yer ----------
  const progressSaver = debouncedSaver(`progress:${book.id}`, () => {
    const y = scroller.scrollTop + 1;
    const i = pageAtY(y);
    const offset = (scroller.scrollTop - tops[i]) / P[i].el.offsetHeight;
    return store.saveProgress(book.id, i, offset);
  }, 800);

  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const i = pageAtY(scroller.scrollTop + scroller.clientHeight * 0.3);
      if (i !== current) { current = i; }
      pageLabel.textContent = `${current} / ${n}`;
      progressSaver.schedule();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  // ---------- İşaretler: ayraçlar, kaldığın yer şeridi, çözülen sorular ----------
  let bookmarks = await store.listBookmarks(book.id);
  let solves = await store.solvesForBook(book.id);
  const saved = await store.getProgress(book.id);
  const lastSpot = saved ? { page: saved.page, offset: saved.offset, at: saved.updatedAt } : null;

  function renderMarks(i) {
    const p = P[i];
    if (!p) return;
    const w = p.el.clientWidth;
    const k = w / UNITS;
    const H = p.el.clientHeight;
    const items = [];
    if (lastSpot && lastSpot.page === i) {
      items.push(h('div', { class: 'last-spot', style: { top: `${Math.max(0, lastSpot.offset * H)}px` }, title: 'Son kaldığın yer' },
        h('span', { class: 'ribbon' }, icon('bookmark', 16), `Kaldığın yer · ${formatShort(lastSpot.at)} ${formatTime(lastSpot.at)}`)));
    }
    for (const bm of bookmarks.filter((b) => b.page === i)) {
      items.push(h('button', {
        type: 'button', class: 'bm-tab', style: { top: `${Math.max(0, bm.offset * H)}px` }, title: bm.name,
        onclick: () => editBookmark(bm),
      }, icon('bookmark', 16), h('span', {}, bm.name)));
    }
    const pageSolves = solves.filter((s) => s.page === i);
    let bulkCount = 0;
    for (const s of pageSolves) {
      if (s.rect) {
        items.push(h('button', {
          type: 'button', class: `solve-mark ${s.source === 'yanlis' ? 'is-mistake' : ''}`,
          style: { left: `${s.rect.x * k}px`, top: `${s.rect.y * k}px`, width: `${s.rect.w * k}px`, height: `${s.rect.h * k}px` },
          title: s.source === 'yanlis' ? 'Yanlış defterine eklendi' : 'Çözüldü',
          onclick: () => editSolve(s),
        }, h('span', { class: 'badge' }, icon(s.source === 'yanlis' ? 'mistake' : 'check', 14))));
      } else bulkCount += s.count;
    }
    if (bulkCount) {
      items.push(h('button', { type: 'button', class: 'bulk-chip', onclick: () => editBulk(i) }, icon('check', 14), `${bulkCount} soru çözüldü`));
    }
    p.marks.replaceChildren(...items);
  }

  async function refreshSolves() { solves = await store.solvesForBook(book.id); }

  function currentSpot() {
    const y = scroller.scrollTop + 1;
    const i = pageAtY(y);
    return { page: i, offset: Math.max(0, (scroller.scrollTop - tops[i]) / P[i].el.offsetHeight) };
  }

  async function addBookmarkHere() {
    const spot = currentSpot();
    const name = await promptText({ title: 'Ayraç ekle', label: 'Ayraç adı', value: `Sayfa ${spot.page}`, okLabel: 'Ekle' });
    if (!name) return;
    await store.addBookmark({ bookId: book.id, page: spot.page, offset: spot.offset, name });
    bookmarks = await store.listBookmarks(book.id);
    renderMarks(spot.page);
    toast(`Ayraç eklendi: ${name}`);
  }

  async function editBookmark(bm) {
    const res = await modal({
      title: bm.name,
      body: h('p', {}, `Sayfa ${bm.page}`),
      actions: [
        { label: 'Sil', value: 'del', kind: 'danger' },
        { label: 'Yeniden adlandır', value: 'rename', kind: 'ghost' },
        { label: 'Kapat', value: null, kind: 'primary' },
      ],
    });
    if (res === 'rename') {
      const name = await promptText({ title: 'Ayracı yeniden adlandır', value: bm.name });
      if (name) await store.updateBookmark({ ...bm, name });
    } else if (res === 'del') {
      await store.deleteBookmark(bm.id);
    } else return;
    bookmarks = await store.listBookmarks(book.id);
    renderMarks(bm.page);
  }

  function openBookmarks() {
    const go = (page, offset) => { s.close(); scrollToPage(page, offset); };
    const body = h('div', { class: 'bm-list' });
    if (lastSpot) {
      body.append(h('button', { type: 'button', class: 'bm-row last', onclick: () => go(lastSpot.page, lastSpot.offset) },
        icon('pin'), h('div', {}, h('strong', {}, 'Kaldığın yer'), h('small', {}, `Sayfa ${lastSpot.page} · ${formatShort(lastSpot.at)} ${formatTime(lastSpot.at)}`))));
    }
    body.append(h('h3', { class: 'sheet-sub' }, 'Ayraçlar'));
    if (!bookmarks.length) body.append(h('p', { class: 'muted' }, 'Henüz ayraç yok. Üstteki ayraç düğmesiyle bulunduğun sayfaya ayraç koyabilirsin.'));
    for (const bm of bookmarks) {
      body.append(h('div', { class: 'bm-row' },
        h('button', { type: 'button', class: 'bm-go', onclick: () => go(bm.page, bm.offset) }, icon('bookmark'), h('div', {}, h('strong', {}, bm.name), h('small', {}, `Sayfa ${bm.page}`))),
        iconButton('edit', 'Düzenle', async () => { s.close(); await editBookmark(bm); })));
    }
    const s = sheet({ title: 'Ayraçlar', body });
  }

  async function gotoPrompt() {
    const v = await promptText({ title: 'Sayfaya git', label: `1–${n} arası sayfa numarası`, value: String(current), okLabel: 'Git', inputmode: 'numeric' });
    const num = parseInt(v, 10);
    if (num >= 1 && num <= n) scrollToPage(num);
  }

  // ---------- Çözülen sorular ----------
  async function bulkSolve() {
    const page = current;
    let count = 1;
    const out = h('output', { class: 'stepper-val' }, '1');
    const set = (v) => { count = Math.max(1, Math.min(200, v)); out.textContent = String(count); };
    const body = h('div', { class: 'stepper-wrap' },
      h('p', {}, `Sayfa ${page} için kaç soru çözdün? Bu sayı bugünün raporuna eklenir.`),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'btn soft', onclick: () => set(count - 1), 'aria-label': 'Azalt' }, '−'),
        out,
        h('button', { type: 'button', class: 'btn soft', onclick: () => set(count + 1), 'aria-label': 'Arttır' }, '+'),
      ),
      h('div', { class: 'quick-row' }, [5, 10, 20].map((v) => h('button', { type: 'button', class: 'chip', onclick: () => set(v) }, String(v)))),
      h('p', { class: 'muted small' }, 'İpucu: Tek tek işaretlemek için alttaki “Soru seç” aracıyla soruyu çevreleyip “Çözüldü” deyebilirsin.'),
    );
    const ok = await modal({ title: 'Soru çözdüm', body, actions: [{ label: 'Vazgeç', value: false }, { label: 'Kaydet', value: true, kind: 'primary' }] });
    if (!ok) return;
    await store.logSolve({ course, book, page, count, source: 'toplu' });
    await refreshSolves();
    renderMarks(page);
    toast(`${count} soru kaydedildi (${course.name})`);
  }

  async function editBulk(page) {
    const list = solves.filter((s) => s.page === page && !s.rect);
    const body = h('div', { class: 'solve-list' }, list.map((s) => h('div', { class: 'row' },
      h('span', {}, `${s.count} soru · ${formatShort(s.ts)} ${formatTime(s.ts)}`),
      h('button', { type: 'button', class: 'btn danger small', onclick: async (e) => {
        await store.deleteSolve(s.id);
        e.target.closest('.row').remove();
        await refreshSolves(); renderMarks(page);
      } }, 'Kaldır'))));
    await modal({ title: `Sayfa ${page} — toplu kayıtlar`, body, actions: [{ label: 'Kapat', value: true, kind: 'primary' }] });
  }

  async function editSolve(s) {
    const isM = s.source === 'yanlis';
    const res = await modal({
      title: isM ? 'Yanlış defterine eklenen soru' : 'Çözülen soru',
      body: h('p', {}, `${formatShort(s.ts)} ${formatTime(s.ts)} tarihinde kaydedildi.${isM ? ' İşareti kaldırırsan sayımdan düşer; yanlış defteri kaydı kalır.' : ''}`),
      actions: [
        { label: 'İşareti kaldır', value: 'del', kind: 'danger' },
        isM ? { label: 'Yanlış defterine git', value: 'go', kind: 'ghost' } : null,
        { label: 'Kapat', value: null, kind: 'primary' },
      ].filter(Boolean),
    });
    if (res === 'del') {
      await store.deleteSolve(s.id);
      if (s.mistakeId) {
        const m = await store.getMistake(s.mistakeId);
        if (m) await store.updateMistake({ ...m, solveId: null });
      }
      await refreshSolves();
      renderMarks(s.page);
      toast('İşaret kaldırıldı');
    } else if (res === 'go') {
      navigate(`#/ders/${book.courseId}/yanlis`);
    }
  }

  // Soru seçme aracıyla bir alan seçildi
  function onRegionSelected(layer, rect) {
    const p = P[layer.page];
    const k = p.el.clientWidth / UNITS;
    const box = h('div', { class: 'select-box keep', style: { left: `${rect.x * k}px`, top: `${rect.y * k}px`, width: `${rect.w * k}px`, height: `${rect.h * k}px` } });
    const close = () => { box.remove(); pop.remove(); document.removeEventListener('pointerdown', outside, true); };
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    const pop = h('div', { class: 'select-pop', style: { left: `${Math.min(rect.x * k, p.el.clientWidth - 300)}px`, top: `${(rect.y + rect.h) * k + 8}px` } },
      h('button', { type: 'button', class: 'btn primary', onclick: () => { close(); addToMistakes(layer, rect); } }, icon('mistake', 18), 'Yanlış Defterine Ekle'),
      h('button', { type: 'button', class: 'btn soft', onclick: () => { close(); markSolved(layer.page, rect); } }, icon('check', 18), 'Çözüldü'),
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Vazgeç'));
    p.el.append(box, pop);
    // Menü alttaki araç çubuğunun arkasında kalacaksa seçimin üstüne al.
    const limit = scroller.getBoundingClientRect().bottom - toolbar.offsetHeight - 30;
    if (pop.getBoundingClientRect().bottom > limit) {
      pop.style.top = `${Math.max(0, rect.y * k - pop.offsetHeight - 8)}px`;
      const r = pop.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (r.top < sr.top) scroller.scrollTop -= sr.top - r.top + 10;
    }
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  async function markSolved(page, rect) {
    const s = await store.logSolve({ course, book, page, count: 1, source: 'isaret', rect });
    await refreshSolves();
    renderMarks(page);
    const today = (await store.solvesForDate(dateKey())).filter((x) => x.courseId === course.id).reduce((a, b) => a + b.count, 0);
    toast(`Çözüldü olarak kaydedildi · Bugün ${course.name}: ${today} soru`, {
      action: { label: 'Geri al', run: async () => { await store.deleteSolve(s.id); await refreshSolves(); renderMarks(page); } },
    });
  }

  async function addToMistakes(layer, rect) {
    let image;
    try {
      await layer.load();
      image = await renderRegion(doc, layer.page, rect, layer.strokes);
    } catch (err) {
      console.error(err);
      toast('Görüntü alınamadı; kayıt görüntüsüz eklenecek.');
    }
    const url = image ? URL.createObjectURL(image) : null;
    const note = h('textarea', { class: 'field', rows: 3, placeholder: 'Neden yanlış yaptın? Kendi notun veya çözümün (isteğe bağlı)' });
    const count = h('input', { type: 'checkbox', checked: true });
    const body = h('div', { class: 'add-mistake' },
      url ? h('img', { class: 'crop-preview', src: url, alt: 'Seçilen soru' }) : null,
      h('p', { class: 'muted small' }, `${book.title} · Sayfa ${layer.page}`),
      note,
      h('label', { class: 'check-row' }, count, h('span', {}, 'Bunu çözülen soru olarak da say (bugünün raporuna eklenir)')),
    );
    const ok = await modal({ title: 'Yanlış Defterine Ekle', body, wide: true, actions: [{ label: 'Vazgeç', value: false }, { label: 'Ekle', value: true, kind: 'primary' }] });
    if (url) URL.revokeObjectURL(url);
    if (!ok) return;
    await store.addMistake({ course, book, page: layer.page, rect, image, note: note.value.trim(), countAsSolved: count.checked });
    await refreshSolves();
    renderMarks(layer.page);
    toast(`${course.name} yanlış defterine eklendi`, { action: { label: 'Görüntüle', run: () => navigate(`#/ders/${book.courseId}/yanlis`) } });
  }

  // ---------- Başlangıç konumu ----------
  layout();
  if (targetPage) {
    if (targetRect) {
      scrollToPage(targetPage, targetRect.y / (UNITS * (sizes[targetPage].h / sizes[targetPage].w)), true);
      const p = P[targetPage];
      const k = p.el.clientWidth / UNITS;
      const flash = h('div', { class: 'flash-box', style: { left: `${targetRect.x * k}px`, top: `${targetRect.y * k}px`, width: `${targetRect.w * k}px`, height: `${targetRect.h * k}px` } });
      p.el.append(flash);
      setTimeout(() => flash.remove(), 4000);
    } else scrollToPage(targetPage);
  } else if (lastSpot) {
    scrollToPage(lastSpot.page, lastSpot.offset);
    scroller.scrollTop = Math.max(0, scroller.scrollTop - 44); // "Kaldığın yer" şeridi tam görünsün
    toast(`Kaldığın yerden devam: Sayfa ${lastSpot.page}`, { duration: 3500 });
  }
  current = pageAtY(scroller.scrollTop + scroller.clientHeight * 0.3);
  pageLabel.textContent = `${current} / ${n}`;
  for (let i = 1; i <= n; i++) if (Math.abs(i - current) < 3) renderMarks(i);
  pump();

  const onResize = debounce(() => {
    const a = anchorAt(scroller.clientWidth / 2, scroller.clientHeight / 3);
    layout(); restoreAnchor(a); rerenderAll();
  }, 200);
  window.addEventListener('resize', onResize);

  return async () => {
    destroyed = true;
    // Son konumu hemen kaydet.
    progressSaver.schedule();
    await progressSaver.flush();
    await flushAll();
    window.removeEventListener('resize', onResize);
    io.disconnect();
    for (let i = 1; i <= n; i++) release(P[i]);
    ctrl.hideLive();
    doc.destroy();
  };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
