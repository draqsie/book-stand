// Dijital defter: her dersin kendi defteri; boş / çizgili / kareli sayfalar. Çizimler otomatik kaydedilir.
import * as store from '../store.js';
import { InkLayer, InkController } from '../ink.js';
import { createToolbar } from '../toolbar.js';
import { h, icon, iconButton, toast, modal, confirmDialog } from '../ui.js';
import { flushAll } from '../savestate.js';
import { navigate } from '../router.js';
import { chooseTemplate, TEMPLATES } from './course.js';

const RATIO = 1.414; // A4

export async function renderNotebook(main, { courseId }, query) {
  const course = await store.getCourse(courseId);
  if (!course) { navigate('#/', { replace: true }); return; }
  let pages = await store.listNotebookPages(courseId);

  const root = h('div', { class: 'viewer notebook' });
  const scroller = h('div', { class: 'scroller' });
  const pagesEl = h('div', { class: 'pages' });
  scroller.append(pagesEl);
  const ind = h('span', { class: 'page-ind static' }, '');
  root.append(
    h('header', { class: 'vbar' },
      iconButton('back', 'Derse dön', () => navigate(`#/ders/${courseId}/defter`)),
      h('div', { class: 'vtitle' }, h('strong', {}, `${course.name} defteri`), h('small', {}, 'Otomatik kaydedilir')),
      h('div', { class: 'vbar-actions' }, ind,
        h('button', { type: 'button', class: 'btn soft', onclick: () => addPage() }, icon('plus', 20), h('span', {}, 'Sayfa')))),
    scroller,
  );
  main.append(root);

  const ctrl = new InkController({ scroller, root, onToast: (m) => toast(m, { duration: 4500 }) });
  root.append(createToolbar(ctrl));

  const items = new Map(); // pageId -> {el, layer}
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const it = items.get(e.target.dataset.id);
      if (!it) continue;
      if (e.isIntersecting) it.layer.mount(); else it.layer.unmount();
    }
  }, { root: scroller, rootMargin: '100% 0px' });

  const width = () => Math.max(280, Math.min(scroller.clientWidth - 36, 900));

  function sizePage(el) {
    const w = width();
    el.style.width = `${w}px`;
    el.style.height = `${Math.round(w * RATIO)}px`;
    el.style.setProperty('--ls', `${Math.max(16, Math.round(w * 0.034))}px`); // tam piksel: çizgiler kaybolmasın
  }

  function buildPage(p, idx) {
    const inkEl = h('div', { class: 'ink' });
    const el = h('div', { class: `nb-page paper tpl-${p.template}`, dataset: { id: p.id } }, inkEl);
    sizePage(el);
    const layer = new InkLayer({ el: inkEl, ownerId: p.id, page: 0, controller: ctrl });
    ctrl.bind(layer);
    const tplName = TEMPLATES.find((t) => t.id === p.template)?.name || '';
    const foot = h('div', { class: 'nb-foot' },
      h('span', {}, `Sayfa ${idx + 1} · ${tplName}`),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => changeTemplate(p) }, 'Sayfa tipi'),
      h('button', { type: 'button', class: 'btn ghost small danger-text', onclick: () => removePage(p) }, 'Sil'));
    const wrap = h('div', { class: 'nb-wrap' }, el, foot);
    items.set(p.id, { el, layer, wrap });
    io.observe(el);
    return wrap;
  }

  function renderAll() {
    io.disconnect();
    for (const it of items.values()) it.layer.unmount();
    items.clear();
    pagesEl.replaceChildren(...pages.map(buildPage),
      h('button', { type: 'button', class: 'add-page', onclick: () => addPage() }, icon('plus', 26), 'Yeni sayfa ekle'));
    updateInd();
  }

  function updateInd() {
    if (!pages.length) { ind.textContent = ''; return; }
    const mid = scroller.scrollTop + scroller.clientHeight * 0.3;
    let i = 0;
    pages.forEach((p, k) => { const it = items.get(p.id); if (it && it.wrap.offsetTop <= mid) i = k; });
    ind.textContent = `${i + 1} / ${pages.length}`;
  }
  scroller.addEventListener('scroll', () => requestAnimationFrame(updateInd), { passive: true });

  async function addPage() {
    const last = pages[pages.length - 1];
    const tpl = await chooseTemplate();
    if (!tpl) return;
    await flushAll();
    const p = await store.addNotebookPage(courseId, tpl || last?.template || 'cizgili');
    pages = await store.listNotebookPages(courseId);
    renderAll();
    items.get(p.id)?.wrap.scrollIntoView({ block: 'start' });
  }

  async function changeTemplate(p) {
    const tpl = await chooseTemplate('Sayfa tipini değiştir');
    if (!tpl || tpl === p.template) return;
    p.template = tpl;
    await store.updateNotebookPage(p);
    const it = items.get(p.id);
    TEMPLATES.forEach((t) => it.el.classList.toggle(`tpl-${t.id}`, t.id === tpl));
    it.wrap.querySelector('.nb-foot span').textContent = `Sayfa ${pages.indexOf(p) + 1} · ${TEMPLATES.find((t) => t.id === tpl).name}`;
  }

  async function removePage(p) {
    const ok = await confirmDialog({ title: 'Sayfa silinsin mi?', message: 'Bu defter sayfası ve üzerindeki yazılar kalıcı olarak silinir.', okLabel: 'Sil', danger: true });
    if (!ok) return;
    const it = items.get(p.id);
    await it.layer.saver.flush();
    ctrl.forget(it.layer);
    await store.deleteNotebookPage(p.id);
    pages = await store.listNotebookPages(courseId);
    renderAll();
  }

  if (!pages.length) {
    const p = await store.addNotebookPage(courseId, 'cizgili');
    pages = [p];
  }
  renderAll();
  if (query.p && items.get(query.p)) items.get(query.p).wrap.scrollIntoView({ block: 'start' });

  const onResize = () => { for (const it of items.values()) { sizePage(it.el); it.layer.resize(); } };
  window.addEventListener('resize', onResize);

  return async () => {
    await flushAll();
    window.removeEventListener('resize', onResize);
    io.disconnect();
    for (const it of items.values()) it.layer.unmount();
    ctrl.hideLive();
  };
}
