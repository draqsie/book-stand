// Gün sonu raporu: kullanıcının "çözüldü" olarak işaretlediği sorulara göre derslere göre sayılar.
import * as store from '../store.js';
import { h, icon, iconButton, confirmDialog, toast, emptyState } from '../ui.js';
import { dateKey, addDays, formatDay, formatTime, parseKey } from '../dates.js';
import { navigate } from '../router.js';

const SOURCE = { isaret: 'PDF’de işaretlendi', toplu: 'Sayı girildi', yanlis: 'Yanlış defterine eklendi' };

export async function renderReport(main, { date }) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateKey();
  const today = dateKey();
  const [courses, solves] = await Promise.all([store.listCourses(), store.allSolves()]);
  const sum = store.summarize(solves, courses);
  const d = sum[day] || { total: 0, byCourse: {} };
  const rows = Object.entries(d.byCourse).sort((a, b) => b[1].count - a[1].count);
  const max = Math.max(1, ...rows.map(([, r]) => r.count));

  const wrap = h('div', { class: 'container report' });
  wrap.append(h('div', { class: 'report-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Gün sonu raporu'), h('h1', {}, formatDay(day, { full: true, weekday: true }))),
    h('div', { class: 'day-nav' },
      iconButton('back', 'Önceki gün', () => navigate(`#/rapor/${addDays(day, -1)}`)),
      day !== today ? h('a', { class: 'btn soft', href: '#/rapor' }, 'Bugün') : null,
      iconButton('next', 'Sonraki gün', () => navigate(`#/rapor/${addDays(day, 1)}`), { attrs: { disabled: day >= today } }))));

  const card = h('section', { class: 'card report-card' });
  card.append(h('div', { class: 'total' }, h('span', { class: 'big' }, String(d.total)), h('span', {}, d.total === 1 ? 'soru çözüldü' : 'soru çözüldü')));
  if (rows.length) {
    card.append(h('p', { class: 'summary-line' }, rows.map(([, r]) => `${r.name}: ${r.count} soru`).join(', ') + '.'));
    card.append(h('div', { class: 'bars' }, rows.map(([, r]) => h('div', { class: 'bar-row' },
      h('span', { class: 'bar-name' }, h('i', { class: 'dot', style: { background: r.color } }), r.name, r.deleted ? h('small', { class: 'muted' }, ' (silinmiş ders)') : null),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(r.count / max) * 100}%`, background: r.color } })),
      h('strong', { class: 'bar-num' }, String(r.count))))));
  } else {
    card.append(h('p', { class: 'muted' }, day === today
      ? 'Bugün henüz çözülmüş soru işaretlenmedi. Bir kitap açıp “Soru çözdüm” düğmesini veya “Soru seç → Çözüldü” aracını kullanabilirsin.'
      : 'Bu gün için kayıt yok.'));
  }
  wrap.append(card);

  // Son 14 gün
  const days = [...Array(14)].map((_, i) => addDays(today, i - 13));
  const m14 = Math.max(1, ...days.map((k) => sum[k]?.total || 0));
  wrap.append(h('section', { class: 'card' }, h('h2', {}, 'Son 14 gün'),
    h('div', { class: 'spark' }, days.map((k) => {
      const t = sum[k]?.total || 0;
      return h('a', { class: `spark-col ${k === day ? 'on' : ''}`, href: `#/rapor/${k}`, title: `${formatDay(k)}: ${t} soru` },
        h('span', { class: 'spark-num' }, t ? String(t) : ''),
        h('span', { class: 'spark-bar', style: { height: `${Math.max(3, (t / m14) * 90)}px` } }),
        h('span', { class: 'spark-day' }, String(parseKey(k).getDate())));
    }))));

  // Bu günün kayıtları (yanlış girilenler düzeltilebilir)
  const entries = solves.filter((s) => s.date === day).sort((a, b) => b.ts - a.ts);
  if (entries.length) {
    const list = h('div', { class: 'entry-list' });
    for (const s of entries) {
      list.append(h('div', { class: 'entry' },
        h('span', { class: 'time' }, formatTime(s.ts)),
        h('span', { class: 'what' }, h('strong', {}, `${s.count} soru · ${courses.find((c) => c.id === s.courseId)?.name || s.courseName}`),
          h('small', { class: 'muted' }, [s.bookTitle ? `${s.bookTitle}${s.page ? `, s. ${s.page}` : ''}` : null, SOURCE[s.source]].filter(Boolean).join(' · '))),
        iconButton('trash', 'Kaydı sil', async () => {
          const ok = await confirmDialog({ title: 'Kayıt silinsin mi?', message: `${s.count} soru bu günün raporundan çıkarılacak.`, okLabel: 'Sil', danger: true });
          if (!ok) return;
          await store.deleteSolve(s.id);
          toast('Kayıt silindi');
          navigate(location.hash, { replace: true });
        })));
    }
    wrap.append(h('section', { class: 'card' }, h('h2', {}, 'Bu günün kayıtları'), list));
  }

  // Geçmiş günler
  const past = Object.keys(sum).sort().reverse();
  const hist = h('section', { class: 'card' }, h('h2', {}, 'Geçmiş raporlar'));
  if (!past.length) hist.append(emptyState('chart', 'Henüz rapor yok', 'Soru çözdükçe her gün için rapor burada birikecek.'));
  else {
    hist.append(h('div', { class: 'history' }, past.slice(0, 120).map((k) => {
      const t = sum[k];
      const top = Object.values(t.byCourse).sort((a, b) => b.count - a.count).map((r) => `${r.name}: ${r.count}`).join(', ');
      return h('a', { class: `hist-row ${k === day ? 'on' : ''}`, href: `#/rapor/${k}` },
        h('span', { class: 'hist-day' }, formatDay(k, { weekday: false })), h('span', { class: 'muted hist-top' }, top), h('strong', {}, `${t.total} soru`));
    })));
  }
  wrap.append(hist);
  main.append(wrap);
}
