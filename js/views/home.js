// Ana sayfa: dersler ve bugünün kısa özeti.
import * as store from '../store.js';
import { h, icon, iconButton, modal, confirmDialog, toast, emptyState } from '../ui.js';
import { dateKey, greeting } from '../dates.js';
import { navigate } from '../router.js';

const LINES = [
  'Küçük adımlar, büyük yol.',
  'Bugün bir sayfa daha, yarın bir adım önde.',
  'Odaklan, nefes al, devam et.',
  'Her çözülen soru bir tuğla.',
  'Düzenli çalışma, sessiz bir süper güçtür.',
  'Yanlışlar, öğrenmenin haritasıdır.',
];

export async function renderHome(main) {
  const [courses, todaySolves] = await Promise.all([store.listCourses(), store.solvesForDate(dateKey())]);
  const sum = store.summarize(todaySolves, courses)[dateKey()] || { total: 0, byCourse: {} };
  const line = LINES[new Date().getDate() % LINES.length];

  const wrap = h('div', { class: 'container home' });
  wrap.append(
    h('section', { class: 'hero' },
      h('div', {},
        h('p', { class: 'eyebrow' }, new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })),
        h('h1', {}, greeting()),
        h('p', { class: 'hero-line' }, sum.total
          ? `Bugün ${sum.total} soru çözdün. Harika gidiyorsun!`
          : 'Bugün henüz soru işaretlemedin. Küçük bir adımla başla.'),
        h('p', { class: 'muted quote' }, line),
      ),
      h('a', { class: 'today-card', href: '#/rapor' },
        h('span', { class: 'today-num' }, String(sum.total)),
        h('span', { class: 'today-lbl' }, 'bugün çözülen soru'),
        h('span', { class: 'today-link' }, 'Gün sonu raporu ', icon('next', 16))),
    ),
  );

  const head = h('div', { class: 'section-head' }, h('h2', {}, 'Derslerim'),
    h('button', { type: 'button', class: 'btn primary', onclick: () => editCourse() }, icon('plus', 20), 'Ders ekle'));
  wrap.append(head);

  if (!courses.length) {
    wrap.append(emptyState('book', 'Henüz ders yok', 'Başlamak için bir ders ekle; ardından o derse PDF kitaplarını aktarabilirsin.',
      h('button', { type: 'button', class: 'btn primary', onclick: () => editCourse() }, icon('plus', 20), 'İlk dersini ekle')));
  } else {
    const grid = h('div', { class: 'course-grid' });
    for (const c of courses) {
      const books = await store.listBooks(c.id);
      const mistakes = await store.listMistakes(c.id);
      const today = sum.byCourse[c.id]?.count || 0;
      grid.append(h('div', { class: 'course-card', style: { '--cc': c.color } },
        h('a', { class: 'course-main', href: `#/ders/${c.id}/kitaplar` },
          h('span', { class: 'course-band' }),
          h('h3', {}, c.name),
          h('p', { class: 'muted' }, `${books.length} kitap · ${mistakes.length} yanlış`),
          h('p', { class: `course-today ${today ? 'has' : ''}` }, today ? `Bugün ${today} soru` : 'Bugün henüz yok')),
        iconButton('more', `${c.name} seçenekleri`, () => courseMenu(c), { class: 'card-menu' })));
    }
    wrap.append(grid);
  }
  main.append(wrap);
}

async function courseMenu(c) {
  const res = await modal({
    title: c.name,
    body: h('p', { class: 'muted' }, 'Ders üzerinde ne yapmak istersin?'),
    actions: [
      { label: 'Sil', value: 'del', kind: 'danger' },
      { label: 'Düzenle', value: 'edit', kind: 'ghost' },
      { label: 'Kapat', value: null, kind: 'primary' },
    ],
  });
  if (res === 'edit') editCourse(c);
  if (res === 'del') {
    const ok = await confirmDialog({
      title: `“${c.name}” silinsin mi?`,
      message: 'Bu dersin kitapları (PDF’ler), çizimleri, defteri ve yanlış defteri bu cihazdan kalıcı olarak silinir. Geçmiş raporlardaki soru sayıları korunur. Bu işlem geri alınamaz.',
      okLabel: 'Kalıcı olarak sil', danger: true,
    });
    if (!ok) return;
    await store.deleteCourse(c.id);
    toast('Ders silindi');
    navigate('#/', { replace: true });
  }
}

export async function editCourse(c = null) {
  let color = c?.color || store.COURSE_COLORS[Math.floor(Math.random() * 6)];
  const name = h('input', { class: 'field', type: 'text', value: c?.name || '', placeholder: 'Örn. Matematik', 'aria-label': 'Ders adı', enterkeyhint: 'done' });
  const colors = h('div', { class: 'color-row' });
  const paint = () => colors.replaceChildren(...store.COURSE_COLORS.map((col) => h('button', {
    type: 'button', class: `swatch big ${col === color ? 'on' : ''}`, style: { '--c': col }, 'aria-label': 'Renk',
    onclick: () => { color = col; paint(); },
  })));
  paint();
  const res = await modal({
    title: c ? 'Dersi düzenle' : 'Yeni ders',
    body: h('div', { class: 'form' }, h('label', { class: 'field-label' }, h('span', {}, 'Ders adı'), name), h('div', { class: 'field-label' }, h('span', {}, 'Renk'), colors)),
    actions: [{ label: 'Vazgeç', value: null }, { label: c ? 'Kaydet' : 'Ekle', value: true, kind: 'primary', validate: () => name.value.trim().length > 0 }],
    onOpen: () => setTimeout(() => name.focus(), 60),
  });
  if (!res) return;
  if (c) await store.updateCourse({ ...c, name: name.value, color });
  else {
    const nc = await store.createCourse({ name: name.value, color });
    navigate(`#/ders/${nc.id}/kitaplar`);
    return;
  }
  navigate(location.hash || '#/', { replace: true });
}
