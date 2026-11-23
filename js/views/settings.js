// Ayarlar: tema, kalem, depolama alanı, yedekleme ve sınırlar hakkında bilgi.
import { h, icon, toast, confirmDialog, formatBytes } from '../ui.js';
import { THEMES, setThemePref, isDark } from '../theme.js';
import { getSettings, setSettings } from '../settings.js';
import { exportBackup, importBackup } from '../backup.js';
import { checkForUpdate, swSupported } from '../update.js';
import { BUILD, IS_DEV_BUILD } from '../version.js';
import * as db from '../db.js';
import { dateKey } from '../dates.js';
import { navigate } from '../router.js';

export async function renderSettings(main) {
  const wrap = h('div', { class: 'container settings' }, h('h1', {}, 'Ayarlar'));
  main.append(wrap);

  // ---------- Tema ----------
  const themeCard = h('section', { class: 'card' });
  const drawTheme = () => {
    const s = getSettings();
    const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Görünüm' },
      [['light', 'Açık', 'sun'], ['dark', 'Koyu', 'moon'], ['system', 'Cihazı izle', 'settings']].map(([v, l, ic]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(s.mode === v), class: s.mode === v ? 'on' : '', onclick: () => { setThemePref({ mode: v }); drawTheme(); } }, icon(ic, 18), l)));
    const grid = (list, key) => h('div', { class: 'theme-grid' }, list.map((t) =>
      h('button', { type: 'button', class: `theme-card ${s[key] === t.id ? 'on' : ''}`, onclick: () => { setThemePref({ [key]: t.id }); drawTheme(); } },
        h('span', { class: 'theme-swatch' }, t.swatch.map((c) => h('i', { style: { background: c } }))),
        h('strong', {}, t.name), h('small', {}, t.desc))));
    themeCard.replaceChildren(
      h('h2', {}, 'Tema'),
      h('p', { class: 'muted' }, 'Sabah için açık, akşam için koyu bir tema seç. “Cihazı izle” seçiliyse iPad’in açık/koyu ayarına göre otomatik değişir.'),
      seg,
      h('h3', {}, icon('sun', 18), ' Sabah (açık) teması'), grid(THEMES.light, 'lightTheme'),
      h('h3', {}, icon('moon', 18), ' Akşam (koyu) teması'), grid(THEMES.dark, 'darkTheme'),
      toggleRow('Koyu temada PDF sayfalarını hafifçe karart', 'Gözü yormamak için sayfa parlaklığını azaltır.', s.dimPdf, (v) => setThemePref({ dimPdf: v })),
      h('p', { class: 'muted small' }, `Şu an: ${isDark() ? 'koyu' : 'açık'} görünüm.`),
    );
  };
  drawTheme();
  wrap.append(themeCard);

  // ---------- Kalem ----------
  wrap.append(h('section', { class: 'card' },
    h('h2', {}, 'Apple Pencil ve kalem'),
    toggleRow('Parmakla çizim', 'Kapalıyken parmak sayfayı kaydırır, yalnızca Apple Pencil yazar (avuç içi yanlışlıkla çizmez). Apple Pencil ilk kez kullanıldığında otomatik kapanır.', getSettings().fingerDraws, (v) => setSettings({ fingerDraws: v })),
    h('div', { class: 'note' }, icon('info', 18), h('p', {},
      'Apple’ın yerel PencilKit araç paleti web uygulamalarında (PWA) kullanılamaz. book-stand, tarayıcının sunduğu Pointer Events ile kendi sade araç çubuğunu kullanır: kalem, vurgulayıcı, silgi, renk, kalınlık ve geri al. Safari kalem basıncını bildirirse çizgi kalınlığı basınca göre değişir. Kalemin çift dokunma/sıkma hareketleri ve PencilKit’in şekil tanıma gibi özellikleri desteklenmez.')),
  ));

  // ---------- Depolama ----------
  const storageCard = h('section', { class: 'card' }, h('h2', {}, 'Depolama'));
  wrap.append(storageCard);
  await drawStorage(storageCard);

  // ---------- Yedek ----------
  const importInput = h('input', { type: 'file', hidden: true, onchange: () => doImport(importInput) });
  wrap.append(h('section', { class: 'card' },
    h('h2', {}, 'Yedekleme'),
    h('p', { class: 'muted' }, 'Tüm dersler, PDF’ler, çizimler, defterler, yanlış defteri, ayraçlar ve raporlar tek bir .zip dosyasına aktarılır. Yedeği Dosyalar uygulamasına kaydedip istediğin yerde saklayabilirsin. book-stand hiçbir şeyi buluta yüklemez.'),
    h('div', { class: 'row-gap' },
      h('button', { type: 'button', class: 'btn primary', onclick: (e) => doExport(e.currentTarget) }, icon('download', 20), 'Yedeği dışa aktar'),
      h('button', { type: 'button', class: 'btn soft', onclick: () => importInput.click() }, icon('upload', 20), 'Yedekten geri yükle')),
    importInput,
    h('p', { class: 'muted small' }, 'Geri yükleme, bu cihazdaki mevcut verilerin yerine geçer.'),
  ));

  // ---------- Bilgi ----------
  wrap.append(h('section', { class: 'card info' },
    h('h2', {}, 'Bilmen gerekenler'),
    h('ul', { class: 'facts' },
      h('li', {}, h('strong', {}, 'Veriler yalnızca bu iPad’de. '), 'iCloud, CloudKit veya başka bir bulut hizmetiyle eşitleme yapılmaz; PDF’lerin GitHub’a veya bir sunucuya gönderilmez.'),
      h('li', {}, h('strong', {}, 'Tarayıcı verileri silinirse kayıtlar kaybolur. '), 'Ayarlar › Safari › Geçmişi ve Web Sitesi Verilerini Sil, uygulamayı Ana Ekran’dan silmek veya Safari’nin depolama temizliği verileri silebilir. Düzenli yedek al.'),
      h('li', {}, h('strong', {}, 'Ana Ekran uygulaması ile Safari sekmesi ayrı depolama kullanır. '), 'Ana Ekran’a ekledikten sonra hep oradan aç; Safari sekmesinde eklediğin kitaplar Ana Ekran uygulamasında görünmez.'),
      h('li', {}, h('strong', {}, 'Çevrimdışı çalışır. '), 'İlk açılıştan sonra uygulama dosyaları önbelleğe alınır; PDF okuma, yazma ve rapor internetsiz çalışır. Yalnızca güncellemeler için internet gerekir. PDF’lerin önbelleğe değil, uygulama veritabanına kaydedilir.'),
      h('li', {}, h('strong', {}, 'iPad Safari sınırları: '), 'arka planda eşitleme ve bildirim yok; çok büyük PDF’ler bellek sınırına takılabilir; dosyaları doğrudan Dosyalar uygulamasındaki bir klasöre otomatik kaydetme yok (yedek elle kaydedilir).'),
    )));

  // ---------- Sürüm ----------
  wrap.append(h('section', { class: 'card' },
    h('h2', {}, 'Sürüm'),
    h('p', { class: 'muted' }, `book-stand · ${IS_DEV_BUILD ? 'yerel geliştirme sürümü' : `yapı ${BUILD}`}`),
    swSupported() ? h('button', { type: 'button', class: 'btn soft', onclick: () => checkForUpdate({ manual: true }) }, icon('refresh', 20), 'Güncellemeleri denetle') : h('p', { class: 'muted small' }, 'Bu tarayıcı service worker desteklemiyor; çevrimdışı kullanım ve otomatik güncelleme çalışmaz.'),
  ));
}

function toggleRow(title, desc, value, onChange) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: value, onchange: () => onChange(input.checked) });
  return h('label', { class: 'toggle-row' }, h('span', {}, h('strong', {}, title), desc ? h('small', { class: 'muted' }, desc) : null), h('span', { class: 'switch' }, input, h('i')));
}

async function drawStorage(card) {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const files = await db.all('files');
  const pdfBytes = files.reduce((a, f) => a + (f.blob?.size || 0), 0);
  const used = est?.usage ?? null;
  const quota = est?.quota ?? null;
  const pct = used != null && quota ? Math.min(100, (used / quota) * 100) : 0;
  const persistBtn = h('button', { type: 'button', class: 'btn soft small', onclick: async () => {
    const ok = await navigator.storage?.persist?.().catch(() => false);
    toast(ok ? 'Kalıcı depolama izni verildi.' : 'Safari şimdilik izin vermedi. Uygulamayı Ana Ekran’dan kullanmak bu olasılığı artırır.', { duration: 4500 });
    card.replaceChildren(h('h2', {}, 'Depolama'));
    drawStorage(card);
  } }, 'Kalıcı depolama iste');
  card.append(
    h('p', { class: 'muted' }, 'Kayıtların iPad’in kendi depolama alanında, bu uygulamanın tarayıcı veritabanında (IndexedDB) tutulur.'),
    used != null
      ? h('div', { class: 'meter-wrap' },
        h('div', { class: 'meter' }, h('span', { style: { width: `${Math.max(1, pct)}%` } })),
        h('p', {}, h('strong', {}, `Kullanılan: ${formatBytes(used)}`), quota ? ` · Safari’nin izin verdiği üst sınır: yaklaşık ${formatBytes(quota)}` : ''),
        h('p', { class: 'muted small' }, `PDF dosyaları: ${files.length} adet, ${formatBytes(pdfBytes)}. Değerler tarayıcının tahminidir.`))
      : h('p', { class: 'muted' }, `Bu tarayıcı kullanılan alanı bildirmiyor. PDF dosyaları: ${files.length} adet, ${formatBytes(pdfBytes)}.`),
    h('div', { class: 'toggle-row static' }, h('span', {}, h('strong', {}, 'Kalıcı depolama'),
      h('small', { class: 'muted' }, persisted ? 'Verildi: tarayıcı yer açmak için verilerini kendiliğinden silmemeli.' : 'Verilmedi: Safari yer darlığında verileri silebilir. Yedek almayı unutma.')),
      persisted ? h('span', { class: 'pill ok' }, 'Açık') : persistBtn),
  );
}

async function doExport(btn) {
  const label = btn.lastChild.textContent;
  btn.disabled = true;
  try {
    const blob = await exportBackup((i, n) => { btn.lastChild.textContent = `Hazırlanıyor ${i + 1}/${n}`; });
    const name = `book-stand-yedek-${dateKey()}.zip`;
    const file = new File([blob], name, { type: 'application/zip' });
    // iPad'de paylaşım sayfası "Dosyalara Kaydet" seçeneğini sunar.
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); toast('Yedek hazır.'); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Yedek indirildi.');
  } catch (err) {
    console.error(err);
    toast(`Yedek oluşturulamadı: ${err.message}`, { duration: 5000 });
  } finally {
    btn.disabled = false;
    btn.lastChild.textContent = label;
  }
}

async function doImport(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const ok = await confirmDialog({
    title: 'Yedekten geri yüklensin mi?',
    message: `“${file.name}” geri yüklenecek. Bu cihazdaki mevcut tüm book-stand verileri silinip yedektekilerle değiştirilecek.`,
    okLabel: 'Geri yükle', danger: true,
  });
  if (!ok) return;
  const overlay = h('div', { class: 'busy-overlay' }, h('div', { class: 'spinner' }), h('p', {}, 'Yedek geri yükleniyor…'));
  document.body.append(overlay);
  try {
    const r = await importBackup(file);
    toast(`Geri yüklendi: ${r.courses} ders, ${r.books} kitap.`, { duration: 4000 });
    navigate('#/');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Geri yükleme başarısız.', { duration: 5000 });
  } finally {
    overlay.remove();
  }
}
