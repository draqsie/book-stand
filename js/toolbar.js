// Sade kalem araç çubuğu. (Apple'ın yerel PencilKit paleti web uygulamalarında kullanılamaz;
// bu çubuk web standartlarıyla yapılmış kendi araç çubuğumuzdur.)
import { h, icon } from './ui.js';
import { getSettings, setSettings } from './settings.js';
import { ERASER_SIZES } from './ink.js';

export const PEN_COLORS = [
  ['#2b2b2b', 'Siyah'], ['#2f5fb3', 'Mavi'], ['#c0392b', 'Kırmızı'], ['#2e8b57', 'Yeşil'], ['#8e44ad', 'Mor'], ['#e67e22', 'Turuncu'],
];
export const HL_COLORS = [['#ffd54a', 'Sarı'], ['#7ee0a1', 'Yeşil'], ['#8fd3ff', 'Mavi'], ['#ff9ec7', 'Pembe']];
const SIZES = [[1, 'İnce'], [2, 'Orta'], [3.5, 'Kalın']];

export function createToolbar(ctrl, { select = false, extra = [] } = {}) {
  const bar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Kalem araçları' });

  const toolBtn = (tool, ico, label) => h('button', {
    type: 'button', class: 'tool', 'aria-label': label, title: label, dataset: { tool },
    onclick: () => ctrl.setTool(tool),
  }, icon(ico), h('span', { class: 'tool-label' }, label));

  const tools = h('div', { class: 'tb-group' },
    toolBtn('hand', 'hand', 'Gezin'),
    toolBtn('pen', 'pen', 'Kalem'),
    toolBtn('hl', 'highlighter', 'Vurgula'),
    toolBtn('eraser', 'eraser', 'Silgi'),
    select ? toolBtn('select', 'select', 'Soru seç') : null,
  );

  const swatches = h('div', { class: 'tb-group swatches' });
  const sizes = h('div', { class: 'tb-group sizes' }, SIZES.map(([s, label]) =>
    h('button', { type: 'button', class: 'size', 'aria-label': `${label} uç`, title: `${label} uç`, dataset: { size: s }, onclick: () => ctrl.setPen(null, s) },
      h('span', { class: 'dot', style: { width: `${4 + s * 3}px`, height: `${4 + s * 3}px` } }))));

  // Silgi seçenekleri: nesne silgisi (çizginin tamamını siler) / piksel silgisi (yalnızca dokunduğu yeri siler)
  const eraserModes = h('div', { class: 'tb-group seg', role: 'radiogroup', 'aria-label': 'Silgi türü' },
    [['object', 'Nesne', 'Dokunduğun çizginin tamamını siler'], ['pixel', 'Piksel', 'Yalnızca üzerinden geçtiğin yeri siler']].map(([m, label, tip]) =>
      h('button', { type: 'button', class: 'seg-btn', role: 'radio', title: tip, dataset: { mode: m }, onclick: () => ctrl.setEraser(m) }, label)));
  const eraserSizes = h('div', { class: 'tb-group sizes' }, ERASER_SIZES.map((s, i) =>
    h('button', { type: 'button', class: 'size', 'aria-label': `Silgi boyu ${i + 1}`, title: ['Küçük', 'Orta', 'Büyük'][i] + ' silgi', dataset: { esize: s }, onclick: () => ctrl.setEraser(null, s) },
      h('span', { class: 'dot ring', style: { width: `${8 + i * 7}px`, height: `${8 + i * 7}px` } }))));

  const undoBtn = h('button', { type: 'button', class: 'tool', 'aria-label': 'Geri al', title: 'Geri al', onclick: () => ctrl.undo() }, icon('undo'), h('span', { class: 'tool-label' }, 'Geri al'));
  const fingerBtn = h('button', {
    type: 'button', class: 'tool finger', title: 'Parmakla çizim',
    onclick: () => { setSettings({ fingerDraws: !getSettings().fingerDraws }); ctrl.emit(); },
  }, icon('finger'), h('span', { class: 'tool-label' }));

  bar.append(tools, h('div', { class: 'tb-sep' }), swatches, sizes, eraserModes, eraserSizes, h('div', { class: 'tb-sep' }), undoBtn, fingerBtn, ...extra);

  const render = () => {
    bar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === ctrl.tool));
    const isPen = ctrl.tool === 'pen', isHl = ctrl.tool === 'hl';
    swatches.hidden = !(isPen || isHl);
    sizes.hidden = !isPen;
    if (isPen || isHl) {
      const list = isPen ? PEN_COLORS : HL_COLORS;
      const cur = isPen ? ctrl.penColor : ctrl.hlColor;
      swatches.replaceChildren(...list.map(([c, name]) => h('button', {
        type: 'button', class: `swatch ${c === cur ? 'on' : ''}`, 'aria-label': name, title: name, style: { '--c': c },
        onclick: () => (isPen ? ctrl.setPen(c) : ctrl.setHl(c)),
      })));
    }
    const isEr = ctrl.tool === 'eraser';
    eraserModes.hidden = !isEr;
    eraserSizes.hidden = !(isEr && ctrl.eraserMode === 'pixel');
    eraserModes.querySelectorAll('.seg-btn').forEach((b) => { const on = b.dataset.mode === ctrl.eraserMode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    eraserSizes.querySelectorAll('.size').forEach((b) => b.classList.toggle('on', Number(b.dataset.esize) === ctrl.eraserSize));
    sizes.querySelectorAll('.size').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === ctrl.penSize));
    undoBtn.disabled = !ctrl.canUndo();
    const fd = getSettings().fingerDraws;
    fingerBtn.classList.toggle('on', fd);
    fingerBtn.setAttribute('aria-pressed', String(fd));
    fingerBtn.setAttribute('aria-label', fd ? 'Parmakla çizim açık' : 'Parmakla çizim kapalı (parmak kaydırır)');
    fingerBtn.querySelector('.tool-label').textContent = fd ? 'Parmak: çizer' : 'Parmak: kaydırır';
  };
  ctrl.onChange(render);
  render();
  return bar;
}
