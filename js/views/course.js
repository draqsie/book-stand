// Ders sayfası: Kitaplar, Defter ve Yanlış Defteri sekmeleri. Yalnızca seçilen derse ait içerik gösterilir.
import * as store from '../store.js';
import { h, icon, iconButton, modal, confirmDialog, toast, promptText, emptyState, formatBytes } from '../ui.js';
import { analyzePdf } from '../pdf.js';
import { drawStrokes, UNITS } from '../ink.js';
import { formatShort, formatTime } from '../dates.js';
import { navigate } from '../router.js';
import { editCourse } from './home.js';
import { debouncedSaver } from '../savestate.js';

export const TEMPLATES = [
  { id: 'bos', name: 'Boş' },
  { id: 'cizgili', name: 'Çizgili' },
  { id: 'kareli', name: 'Kareli' },
];

export async function renderCourse(main, { id, tab = 'kitaplar' }) {
  const course = await store.getCourse(id);
  if (!course) { navigate('#/', { replace: true }); return; }
  const tabs = [['kitaplar', 'Kitaplar', 'book'], ['defter', 'Defter', 'notebook'], ['yanlis', 'Yanlış Defteri', 'mistake']];
  const wrap = h('div', { class: 'container course', style: { '--cc': course.color } });
  wrap.append(
    h('div', { class: 'course-head' },
      iconButton('back', 'Derslere dön', () => navigate('#/')),
      h('h1', {}, h('span', { class: 'dot' }), course.name),
      iconButton('edit', 'Dersi düzenle', () => editCourse(course))),
    h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([t, label, ico]) =>
      h('a', { href: `#/ders/${id}/${t}`, role: 'tab', class: `tab ${t === tab ? 'on' : ''}`, 'aria-selected': String(t === tab) }, icon(ico, 20), label))),
  );
  const body = h('div', { class: 'tab-body' });
  wrap.append(body);
  main.append(wrap);
  if (tab === 'defter') return renderNotebookTab(body, course);
  if (tab === 'yanlis') return renderMistakesTab(body, course);
  return renderBooksTab(body, course);
}

// ---------------- Kitaplar ----------------
async function renderBooksTab(body, course) {
  const books = await store.listBooks(course.id);
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true, onchange: () => importFiles(fileInput.files) });
  const addBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, icon('plus', 20), 'PDF kitap ekle');
  body.append(fileInput, h('div', { class: 'section-head' }, h('h2', {}, 'Kitaplar'), addBtn));

  if (!books.length) {
    body.append(emptyState('book', 'Bu derste henüz kitap yok', 'iPad’deki Dosyalar uygulamasından bir veya daha fazla PDF seç. Dosyalar yalnızca bu cihazda saklanır.',
      h('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, icon('plus', 20), 'PDF seç')));
    return;
  }
  const grid = h('div', { class: 'book-grid' });
  const urls = [];
  for (const b of books) {
    const prog = await store.getProgress(b.id);
    const coverUrl = b.cover ? URL.createObjectURL(b.cover) : null;
    if (coverUrl) urls.push(coverUrl);
    const pct = prog && b.pageCount ? Math.round((prog.page / b.pageCount) * 100) : 0;
    grid.append(h('div', { class: 'book-card' },
      h('a', { class: 'book-main', href: `#/kitap/${b.id}` },
        h('div', { class: 'cover' }, coverUrl ? h('img', { src: coverUrl, alt: '' }) : icon('book', 40),
          prog ? h('span', { class: 'cover-ribbon', title: 'Kaldığın yer' }, icon('bookmark', 16), `s. ${prog.page}`) : null),
        h('h3', {}, b.title),
        h('p', { class: 'muted small' }, prog ? `Kaldığın yer: sayfa ${prog.page} / ${b.pageCount || '?'}` : `${b.pageCount || '?'} sayfa · henüz açılmadı`),
        h('div', { class: 'progress' }, h('span', { style: { width: `${pct}%` } }))),
      iconButton('more', `${b.title} seçenekleri`, () => bookMenu(b), { class: 'card-menu' })));
  }
  body.append(grid);

  async function importFiles(files) {
    const list = [...files];
    fileInput.value = '';
    if (!list.length) return;
    const overlay = h('div', { class: 'busy-overlay' }, h('div', { class: 'spinner' }), h('p', {}, 'PDF içe aktarılıyor…'));
    document.body.append(overlay);
    let ok = 0;
    try {
      for (const f of list) {
        overlay.querySelector('p').textContent = `İçe aktarılıyor: ${f.name}`;
        if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast(`${f.name} bir PDF değil`); continue; }
        try {
          const { pageCount, cover } = await analyzePdf(f);
          await store.addBook({ courseId: course.id, title: f.name.replace(/\.pdf$/i, ''), blob: f, pageCount, cover });
          ok++;
        } catch (err) {
          console.error(err);
          toast(err?.name === 'QuotaExceededError' ? 'Depolama alanı yetersiz.' : `${f.name} açılamadı (bozuk veya parolalı olabilir).`, { duration: 4000 });
        }
      }
    } finally { overlay.remove(); }
    if (ok) {
      // Tarayıcıdan verilerin kendiliğinden silinmemesini iste (Safari karar verir).
      navigator.storage?.persist?.().catch(() => {});
      toast(`${ok} kitap eklendi`);
      navigate(location.hash, { replace: true });
    }
  }

  async function bookMenu(b) {
    const res = await modal({
      title: b.title,
      body: h('p', { class: 'muted' }, `${b.pageCount || '?'} sayfa · ${formatBytes(b.size)}`),
      actions: [{ label: 'Sil', value: 'del', kind: 'danger' }, { label: 'Yeniden adlandır', value: 'rename' }, { label: 'Kapat', value: null, kind: 'primary' }],
    });
    if (res === 'rename') {
      const t = await promptText({ title: 'Kitabı yeniden adlandır', value: b.title });
      if (t) { await store.updateBook({ ...b, title: t }); navigate(location.hash, { replace: true }); }
    } else if (res === 'del') {
      const sure = await confirmDialog({ title: 'Kitap silinsin mi?', message: 'PDF, üzerindeki çizimler ve ayraçlar bu cihazdan kalıcı olarak silinir. Yanlış defterindeki kesitler korunur. Geri alınamaz.', okLabel: 'Kalıcı olarak sil', danger: true });
      if (!sure) return;
      await store.deleteBook(b.id);
      toast('Kitap silindi');
      navigate(location.hash, { replace: true });
    }
  }
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}

// ---------------- Defter ----------------
export async function chooseTemplate(title = 'Yeni defter sayfası') {
  return modal({
    title,
    body: h('div', { class: 'tpl-row' }, TEMPLATES.map((t) => h('button', {
      type: 'button', class: 'tpl-card', onclick: (e) => e.currentTarget.closest('.modal')._close(t.id),
    }, h('span', { class: `paper tpl-${t.id}` }), h('span', {}, t.name)))),
    actions: [{ label: 'Vazgeç', value: null }],
  });
}

async function renderNotebookTab(body, course) {
  const pages = await store.listNotebookPages(course.id);
  const add = async () => {
    const tpl = await chooseTemplate();
    if (!tpl) return;
    const p = await store.addNotebookPage(course.id, tpl);
    navigate(`#/defter/${course.id}?p=${p.id}`);
  };
  body.append(h('div', { class: 'section-head' }, h('h2', {}, `${course.name} defteri`),
    h('div', { class: 'row-gap' },
      pages.length ? h('a', { class: 'btn soft', href: `#/defter/${course.id}` }, icon('notebook', 20), 'Defteri aç') : null,
      h('button', { type: 'button', class: 'btn primary', onclick: add }, icon('plus', 20), 'Yeni sayfa'))));
  if (!pages.length) {
    body.append(emptyState('notebook', 'Defter boş', 'Boş, çizgili veya kareli bir sayfa ekleyip Apple Pencil ya da parmağınla yazmaya başla. Her şey otomatik kaydedilir.',
      h('button', { type: 'button', class: 'btn primary', onclick: add }, icon('plus', 20), 'İlk sayfayı ekle')));
    return;
  }
  const grid = h('div', { class: 'nb-grid' });
  for (const [i, p] of pages.entries()) {
    const thumb = h('canvas', { class: 'nb-thumb-ink', width: 200, height: 283 });
    const strokes = await store.getInk(p.id, 0);
    drawStrokes(thumb.getContext('2d'), strokes, 200 / UNITS);
    grid.append(h('a', { class: 'nb-thumb', href: `#/defter/${course.id}?p=${p.id}` },
      h('div', { class: `paper tpl-${p.template}` }, thumb),
      h('span', {}, `Sayfa ${i + 1}`)));
  }
  body.append(grid);
}

// ---------------- Yanlış defteri ----------------
async function renderMistakesTab(body, course) {
  let filter = 'hepsi';
  const all = await store.listMistakes(course.id);
  const urls = [];
  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'mistake-grid' });
  body.append(h('div', { class: 'section-head' }, h('h2', {}, 'Yanlış Defteri'), chips),
    h('p', { class: 'muted small hint' }, 'Eklemek için: kitabı aç → alttaki “Soru seç” aracıyla soruyu çevrele → “Yanlış Defterine Ekle”.'),
    grid);

  const draw = () => {
    const counts = { hepsi: all.length, tekrar: all.filter((m) => m.status === 'tekrar').length, ogrenildi: all.filter((m) => m.status === 'ogrenildi').length };
    chips.replaceChildren(...[['hepsi', 'Tümü'], ['tekrar', 'Tekrar edilecek'], ['ogrenildi', 'Öğrenildi']].map(([k, l]) =>
      h('button', { type: 'button', class: `chip ${filter === k ? 'on' : ''}`, onclick: () => { filter = k; draw(); } }, `${l} (${counts[k]})`)));
    const list = all.filter((m) => filter === 'hepsi' || m.status === filter);
    if (!all.length) {
      grid.replaceChildren(emptyState('mistake', 'Yanlış defteri boş', 'Yanlış yaptığın soruları PDF’den seçip buraya ekleyebilirsin. Hangi kitap ve sayfadan geldiği saklanır.'));
      return;
    }
    grid.replaceChildren(...list.map((m) => {
      let url = null;
      if (m.image) { url = URL.createObjectURL(m.image); urls.push(url); }
      return h('button', { type: 'button', class: `mistake-card ${m.status}`, onclick: () => openMistake(m) },
        url ? h('img', { src: url, alt: 'Soru görüntüsü' }) : h('div', { class: 'noimg' }, icon('mistake', 30)),
        h('div', { class: 'mc-meta' },
          h('strong', {}, `${m.bookTitle} · s. ${m.page}`),
          h('small', {}, formatShort(m.createdAt)),
          m.note ? h('p', {}, m.note.length > 90 ? `${m.note.slice(0, 90)}…` : m.note) : h('p', { class: 'muted' }, 'Not eklenmedi'),
          h('span', { class: `status ${m.status}` }, m.status === 'ogrenildi' ? 'Öğrenildi' : 'Tekrar edilecek')));
    }));
  };

  async function openMistake(m) {
    const url = m.image ? URL.createObjectURL(m.image) : null;
    const book = await store.getBook(m.bookId);
    const note = h('textarea', { class: 'field', rows: 6, placeholder: 'Kendi notun veya çözümün… (otomatik kaydedilir)' }, m.note || '');
    const saved = h('small', { class: 'muted save-state' }, '');
    const saver = debouncedSaver(`mistake:${m.id}`, async () => {
      m.note = note.value;
      await store.updateMistake(m);
      saved.textContent = 'Kaydedildi';
    }, 500);
    note.addEventListener('input', () => { saved.textContent = 'Kaydediliyor…'; saver.schedule(); });
    const statusBtn = h('button', { type: 'button', class: 'btn soft', onclick: async () => {
      m.status = m.status === 'ogrenildi' ? 'tekrar' : 'ogrenildi';
      await store.updateMistake(m);
      statusBtn.textContent = m.status === 'ogrenildi' ? '✓ Öğrenildi' : 'Öğrenildi olarak işaretle';
    } }, m.status === 'ogrenildi' ? '✓ Öğrenildi' : 'Öğrenildi olarak işaretle');
    const res = await modal({
      title: `${m.bookTitle} · Sayfa ${m.page}`,
      wide: true,
      body: h('div', { class: 'mistake-detail' },
        url ? h('img', { src: url, alt: 'Soru görüntüsü' }) : null,
        h('p', { class: 'muted small' }, `Eklenme: ${formatShort(m.createdAt)} ${formatTime(m.createdAt)}`),
        h('label', { class: 'field-label' }, h('span', {}, 'Notun / çözümün'), note), saved,
        h('div', { class: 'row-gap' }, statusBtn)),
      actions: [
        { label: 'Sil', value: 'del', kind: 'danger' },
        book ? { label: 'Kaynak sayfayı aç', value: 'open', kind: 'soft' } : null,
        { label: 'Kapat', value: 'close', kind: 'primary' },
      ].filter(Boolean),
    });
    await saver.flush();
    if (url) URL.revokeObjectURL(url);
    if (res === 'open') {
      const r = m.rect ? `&r=${[m.rect.x, m.rect.y, m.rect.w, m.rect.h].join(',')}` : '';
      navigate(`#/kitap/${m.bookId}?s=${m.page}${r}`);
      return;
    }
    if (res === 'del') {
      const sure = await confirmDialog({ title: 'Soru silinsin mi?', message: 'Bu kayıt yanlış defterinden kalıcı olarak silinir. Rapordaki soru sayısı değişmez.', okLabel: 'Sil', danger: true });
      if (sure) {
        await store.deleteMistake(m.id);
        all.splice(all.indexOf(m), 1);
        toast('Silindi');
      }
    }
    draw();
  }

  draw();
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
