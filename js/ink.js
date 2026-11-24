// Kalem/vurgulayıcı/silgi motoru. Pointer Events ile Apple Pencil ve parmak girişini işler.
// Koordinatlar "sayfa birimi"nde saklanır: sayfa genişliği = 1000 birim. Böylece yakınlaştırma
// düzeyinden bağımsızdır.
//
// Çizgi türleri (t): 'pen' kalem, 'hl' vurgulayıcı, 'er' piksel silgisi (altındaki mürekkebi siler).
import { getInk, saveInk } from './store.js';
import { debouncedSaver, setBusy } from './savestate.js';
import { getSettings, setSettings, onSettings } from './settings.js';

export const UNITS = 1000;
const MAX_CANVAS_AREA = 16_000_000; // iPad Safari tuval sınırı (~16.7M piksel)
export const ERASER_SIZES = [14, 28, 52]; // piksel silgisi çapı (sayfa birimi)

export function canvasScale(cssW, cssH) {
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (cssW * cssH * dpr * dpr > MAX_CANVAS_AREA && dpr > 0.5) dpr -= 0.25;
  return dpr;
}

const pf = (pr) => 0.6 + 0.8 * pr; // basınç → kalınlık çarpanı

function styleFor(ctx, s) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  if (s.t === 'er') ctx.globalCompositeOperation = 'destination-out';
}

/** Bir çizgiyi verilen bağlama çizer. k = piksel / birim */
export function drawStroke(ctx, s, k) {
  const p = s.p;
  const n = p.length / 3;
  if (!n) return;
  ctx.save();
  styleFor(ctx, s);
  if (s.t === 'hl') {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = s.s * k;
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * k);
    if (n === 1) ctx.lineTo(p[0] * k + 0.1, p[1] * k);
    for (let j = 1; j < n - 1; j++) {
      const mx = (p[j * 3] + p[(j + 1) * 3]) / 2, my = (p[j * 3 + 1] + p[(j + 1) * 3 + 1]) / 2;
      ctx.quadraticCurveTo(p[j * 3] * k, p[j * 3 + 1] * k, mx * k, my * k);
    }
    if (n > 1) ctx.lineTo(p[(n - 1) * 3] * k, p[(n - 1) * 3 + 1] * k);
    ctx.stroke();
  } else if (n === 1) {
    dot(ctx, s, k);
  } else {
    for (let j = 1; j < n; j++) penSegment(ctx, p, j, n, s.s, k);
  }
  ctx.restore();
}

function dot(ctx, s, k) {
  ctx.beginPath();
  ctx.arc(s.p[0] * k, s.p[1] * k, (s.s * pf(s.p[2]) * k) / 2, 0, Math.PI * 2);
  ctx.fill();
}

// j. parçayı çiz (1 ≤ j ≤ n-1). Son parça düz çizgi ile biter.
function penSegment(ctx, p, j, n, size, k) {
  const ax = j === 1 ? p[0] : (p[(j - 1) * 3] + p[j * 3]) / 2;
  const ay = j === 1 ? p[1] : (p[(j - 1) * 3 + 1] + p[j * 3 + 1]) / 2;
  ctx.beginPath();
  ctx.lineWidth = size * pf(p[j * 3 + 2]) * k;
  ctx.moveTo(ax * k, ay * k);
  if (j < n - 1) {
    const bx = (p[j * 3] + p[(j + 1) * 3]) / 2, by = (p[j * 3 + 1] + p[(j + 1) * 3 + 1]) / 2;
    ctx.quadraticCurveTo(p[j * 3] * k, p[j * 3 + 1] * k, bx * k, by * k);
  } else {
    ctx.lineTo(p[j * 3] * k, p[j * 3 + 1] * k);
  }
  ctx.stroke();
}

export function drawStrokes(ctx, strokes, k) {
  for (const s of strokes) drawStroke(ctx, s, k);
}

const bboxCache = new WeakMap();
function bbox(s) {
  let b = bboxCache.get(s);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < s.p.length; i += 3) {
      b[0] = Math.min(b[0], s.p[i]); b[1] = Math.min(b[1], s.p[i + 1]);
      b[2] = Math.max(b[2], s.p[i]); b[3] = Math.max(b[3], s.p[i + 1]);
    }
    bboxCache.set(s, b);
  }
  return b;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y);
}

function hits(s, x, y, r) {
  const rr = r + s.s / 2;
  const b = bbox(s);
  if (x < b[0] - rr || x > b[2] + rr || y < b[1] - rr || y > b[3] + rr) return false;
  const p = s.p;
  if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= rr;
  for (let i = 3; i < p.length; i += 3) {
    if (distToSeg(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= rr) return true;
  }
  return false;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Bir sayfanın (PDF sayfası veya defter sayfası) çizim katmanı. */
export class InkLayer {
  constructor({ el, ownerId, page, controller }) {
    this.el = el; // sayfayı kaplayan .ink öğesi
    this.ownerId = ownerId;
    this.page = page;
    this.controller = controller;
    this.strokes = null;
    this.canvas = null;
    this.mounted = false;
    this.rect = null; // çizim sırasında önbelleğe alınan konum
    this.saver = debouncedSaver(`ink:${ownerId}:${page}`, () => saveInk(ownerId, page, this.strokes || []));
    el._layer = this;
  }

  async load() {
    if (!this.strokes) this.strokes = await getInk(this.ownerId, this.page);
    return this.strokes;
  }

  /** Sayfa görünür oldu. Tuval yalnızca sayfada mürekkep varsa oluşturulur (bellek ve kaydırma akıcılığı için). */
  async mount() {
    await this.load();
    this.mounted = true;
    if (this.strokes.length) this.ensureCanvas();
    else this.resize();
  }

  ensureCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'ink-canvas';
      this.el.prepend(this.canvas);
      this.resize();
    }
    return this.canvas;
  }

  unmount() {
    this.mounted = false;
    if (!this.canvas) return;
    this.canvas.width = this.canvas.height = 0; // Safari'de belleği hemen bırak
    this.canvas.remove();
    this.canvas = null;
  }

  get k() { return this.canvas ? this.canvas.width / UNITS : 1; }

  resize() {
    if (!this.canvas) return;
    const w = this.el.clientWidth, hgt = this.el.clientHeight;
    if (!w || !hgt) return;
    const dpr = canvasScale(w, hgt);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    this.redraw();
  }

  redraw() {
    if (!this.canvas || !this.strokes) return;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    drawStrokes(ctx, this.strokes, this.k);
  }

  changed() { this.saver.schedule(); }

  toUnits(clientX, clientY) {
    const r = this.rect || this.el.getBoundingClientRect();
    const s = UNITS / r.width;
    return [(clientX - r.left) * s, (clientY - r.top) * s];
  }
}

/**
 * Bir görünümdeki tüm katmanlar için ortak araç durumu, geri alma geçmişi
 * ve işaretçi (pointer) olaylarını yönetir.
 */
export class InkController {
  constructor({ scroller, root, onSelect, onToast }) {
    this.scroller = scroller;
    this.root = root;
    this.onSelect = onSelect;
    this.onToast = onToast;
    const st = getSettings();
    this.tool = st.tool === 'select' ? 'hand' : st.tool;
    this.penColor = st.penColor;
    this.penSize = st.penSize;
    this.hlColor = st.hlColor;
    this.eraserMode = st.eraserMode === 'pixel' ? 'pixel' : 'object';
    this.eraserSize = ERASER_SIZES.includes(st.eraserSize) ? st.eraserSize : ERASER_SIZES[1];
    this.history = [];
    this.active = null; // devam eden işlem
    this.penActive = false;
    this.lastPenUp = 0;
    this.live = null;
    this.frame = 0;
    this.listeners = new Set();
    this.offSettings = onSettings(() => this.applyToolClass());
    this.applyToolClass();
  }

  destroy() {
    this.offSettings?.();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.hideLive();
    this.listeners.clear();
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const l of this.listeners) l(this); }

  setTool(tool) {
    this.tool = tool;
    if (tool !== 'select') setSettings({ tool });
    this.applyToolClass();
    this.emit();
  }
  setPen(color, size) {
    if (color) this.penColor = color;
    if (size) this.penSize = size;
    setSettings({ penColor: this.penColor, penSize: this.penSize });
    this.emit();
  }
  setHl(color) { this.hlColor = color; setSettings({ hlColor: color }); this.emit(); }
  setEraser(mode, size) {
    if (mode) this.eraserMode = mode;
    if (size) this.eraserSize = size;
    setSettings({ eraserMode: this.eraserMode, eraserSize: this.eraserSize });
    this.emit();
  }

  /** Parmak yalnızca kaydırıyorsa sayfa tarayıcının kendi (akıcı, ataletli) kaydırmasını kullanır. */
  fingerScrolls() { return !getSettings().fingerDraws; }

  applyToolClass() {
    this.root.classList.remove('tool-hand', 'tool-pen', 'tool-hl', 'tool-eraser', 'tool-select');
    this.root.classList.add(`tool-${this.tool}`);
    this.root.classList.toggle('finger-scrolls', this.fingerScrolls());
  }

  /** Bir .ink öğesine işaretçi dinleyicilerini bağlar. */
  bind(layer) {
    const el = layer.el;
    el.addEventListener('pointerdown', (e) => this.down(layer, e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    // iPadOS: kalem dokunuşlarında (ve parmakla çizimde) kaydırmayı/büyüteci engelle.
    // Parmak yalnızca kaydırıyorsa dokunuşu tarayıcıya bırak: kaydırma yerel ve akıcı olur.
    const onTouch = (e) => {
      if (this.tool === 'hand') return;
      const stylus = [...e.touches, ...e.changedTouches].some((t) => t.touchType === 'stylus');
      const palm = this.penActive || Date.now() - this.lastPenUp < 350 || (this.active && this.active.pen);
      if (stylus || palm || !this.fingerScrolls()) e.preventDefault();
    };
    el.addEventListener('touchstart', onTouch, { passive: false });
    el.addEventListener('touchmove', onTouch, { passive: false });
  }

  down(layer, e) {
    if (this.tool === 'hand') return;
    const isPen = e.pointerType === 'pen';
    const isTouch = e.pointerType === 'touch';
    if (isPen && !getSettings().penSeen) {
      setSettings({ penSeen: true, fingerDraws: false });
      this.onToast?.('Apple Pencil algılandı: kalemle yazın, parmakla kaydırın. (Araç çubuğundan değiştirilebilir)');
      this.emit();
    }
    if (this.active) return; // yazarken ikinci dokunuşu (avuç içi) yok say
    if (isTouch && (this.penActive || Date.now() - this.lastPenUp < 350)) return;
    if (isTouch && this.fingerScrolls()) return; // kaydırmayı tarayıcı yapar
    if (!layer.strokes) return; // henüz yüklenmedi
    e.preventDefault();
    layer.el.setPointerCapture?.(e.pointerId);
    if (isPen) this.penActive = true;
    layer.rect = layer.el.getBoundingClientRect();
    const [x, y] = layer.toUnits(e.clientX, e.clientY);
    const pr = isPen && e.pressure > 0 ? e.pressure : 0.5;

    const pixelEraser = this.tool === 'eraser' && this.eraserMode === 'pixel';
    if (this.tool === 'pen' || this.tool === 'hl' || pixelEraser) {
      setBusy(true);
      let stroke;
      if (pixelEraser) stroke = { t: 'er', c: '#000', s: this.eraserSize, p: [r1(x), r1(y), 0.5] };
      else if (this.tool === 'hl') stroke = { t: 'hl', c: this.hlColor, s: 22, p: [r1(x), r1(y), 0.5] };
      else stroke = { t: 'pen', c: this.penColor, s: this.penSize * 1.4, p: [r1(x), r1(y), Math.round(pr * 100) / 100] };
      this.active = { type: 'draw', id: e.pointerId, layer, stroke, pen: isPen, drawn: 0 };
      if (stroke.t === 'hl') this.showLive(layer);
      else layer.ensureCanvas();
      this.paintActive();
    } else if (this.tool === 'eraser') {
      setBusy(true);
      this.active = { type: 'erase', id: e.pointerId, layer, removed: [], lx: x, ly: y, pen: isPen };
      this.eraseAt(layer, x, y);
    } else if (this.tool === 'select') {
      const box = document.createElement('div');
      box.className = 'select-box';
      layer.el.append(box);
      this.active = { type: 'select', id: e.pointerId, layer, x0: x, y0: y, x1: x, y1: y, box, pen: isPen };
      this.updateSelectBox();
    }
  }

  move(e) {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    if (a.type === 'draw') {
      const p = a.stroke.p;
      const usePressure = a.pen && a.stroke.t === 'pen';
      for (const ev of list) {
        const [x, y] = a.layer.toUnits(ev.clientX, ev.clientY);
        if (Math.hypot(x - p[p.length - 3], y - p[p.length - 2]) < 0.8) continue;
        const pr = usePressure && ev.pressure > 0 ? ev.pressure : 0.5;
        p.push(r1(x), r1(y), Math.round(pr * 100) / 100);
      }
    } else if (a.type === 'erase') {
      for (const ev of list) {
        const [x, y] = a.layer.toUnits(ev.clientX, ev.clientY);
        // Hızlı harekette aradaki noktaları da tara.
        const steps = Math.max(1, Math.ceil(Math.hypot(x - a.lx, y - a.ly) / 5));
        for (let s = 1; s <= steps; s++) this.eraseAt(a.layer, a.lx + ((x - a.lx) * s) / steps, a.ly + ((y - a.ly) * s) / steps);
        a.lx = x; a.ly = y;
      }
    } else if (a.type === 'select') {
      const [x, y] = a.layer.toUnits(e.clientX, e.clientY);
      a.x1 = x; a.y1 = y;
    }
    // Ekranı her olayda değil, karede bir kez güncelle (Apple Pencil saniyede 240 olay üretebilir).
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flushFrame());
  }

  flushFrame() {
    this.frame = 0;
    const a = this.active;
    if (!a) return;
    if (a.type === 'draw') this.paintActive();
    else if (a.type === 'erase' && a.dirty) { a.dirty = false; a.layer.redraw(); }
    else if (a.type === 'select') this.updateSelectBox();
  }

  up(e, cancelled = false) {
    const a = this.active;
    if (e.pointerType === 'pen') { this.penActive = false; this.lastPenUp = Date.now(); }
    if (!a || a.id !== e.pointerId) return;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.flushFrame();
    this.active = null;
    a.layer.rect = null;
    if (a.type === 'draw') {
      setBusy(false);
      this.hideLive();
      const L = a.layer;
      const s = a.stroke;
      L.strokes.push(s);
      const canvas = L.ensureCanvas();
      const ctx = canvas.getContext('2d');
      if (s.t === 'hl' || s.p.length <= 6) {
        drawStroke(ctx, s, L.k);
      } else {
        // Kalem/piksel silgisi: son parçayı da çiz (öncekiler çizim sırasında çizildi).
        const n = s.p.length / 3;
        ctx.save(); styleFor(ctx, s);
        penSegment(ctx, s.p, n - 1, n, s.s, L.k);
        ctx.restore();
      }
      this.history.push({ type: 'add', layer: L, stroke: s });
      L.changed();
      this.emit();
    } else if (a.type === 'erase') {
      setBusy(false);
      if (a.removed.length) {
        this.history.push({ type: 'erase', layer: a.layer, removed: a.removed });
        a.layer.changed();
        this.emit();
      }
    } else if (a.type === 'select') {
      a.box.remove();
      const x = Math.min(a.x0, a.x1), y = Math.min(a.y0, a.y1);
      const w = Math.abs(a.x1 - a.x0), hh = Math.abs(a.y1 - a.y0);
      if (!cancelled && w > 15 && hh > 15) this.onSelect?.(a.layer, { x: r1(x), y: r1(y), w: r1(w), h: r1(hh) });
    }
  }

  updateSelectBox() {
    const a = this.active;
    if (!a || a.type !== 'select') return;
    const k = a.layer.el.clientWidth / UNITS;
    Object.assign(a.box.style, {
      left: `${Math.min(a.x0, a.x1) * k}px`, top: `${Math.min(a.y0, a.y1) * k}px`,
      width: `${Math.abs(a.x1 - a.x0) * k}px`, height: `${Math.abs(a.y1 - a.y0) * k}px`,
    });
  }

  // Kalem ve piksel silgisi: ana tuvale yalnızca yeni parçaları çiz.
  // Vurgulayıcı: saydamlık üst üste binmesin diye geçici tuvalde tüm çizgiyi yeniden çiz.
  paintActive() {
    const a = this.active;
    const s = a.stroke;
    if (s.t === 'hl') {
      if (!this.live) return;
      const ctx = this.live.getContext('2d');
      ctx.clearRect(0, 0, this.live.width, this.live.height);
      drawStroke(ctx, s, this.live.width / UNITS);
      return;
    }
    const L = a.layer;
    if (!L.canvas) return;
    const ctx = L.canvas.getContext('2d');
    const p = s.p;
    const n = p.length / 3;
    ctx.save(); styleFor(ctx, s);
    if (n === 1 && !a.dotted) { dot(ctx, s, L.k); a.dotted = true; }
    // n-2'ye kadar olan parçalar kesinleşmiştir (bir sonraki noktayı bilir).
    for (let j = a.drawn + 1; j <= n - 2; j++) penSegment(ctx, p, j, n, s.s, L.k);
    a.drawn = Math.max(a.drawn, n - 2);
    ctx.restore();
  }

  showLive(layer) {
    if (!this.live) { this.live = document.createElement('canvas'); this.live.className = 'ink-live'; }
    const w = layer.el.clientWidth, hh = layer.el.clientHeight;
    const dpr = canvasScale(w, hh);
    const W = Math.round(w * dpr), H = Math.round(hh * dpr);
    if (this.live.width !== W || this.live.height !== H) { this.live.width = W; this.live.height = H; }
    else this.live.getContext('2d').clearRect(0, 0, W, H);
    layer.el.append(this.live);
  }

  hideLive() {
    if (this.live?.parentNode) this.live.remove();
  }

  // Nesne silgisi: dokunduğu çizginin tamamını siler.
  eraseAt(layer, x, y) {
    const a = this.active;
    const r = 10;
    for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const s = layer.strokes[i];
      if (s.t === 'er') continue; // piksel silgisi izleri nesne değildir
      if (hits(s, x, y, r)) {
        layer.strokes.splice(i, 1);
        a.removed.push({ stroke: s, index: i });
        a.dirty = true;
      }
    }
  }

  canUndo() { return this.history.length > 0; }

  undo() {
    const op = this.history.pop();
    if (!op) return;
    const L = op.layer;
    if (op.type === 'add') {
      const i = L.strokes.lastIndexOf(op.stroke);
      if (i >= 0) L.strokes.splice(i, 1);
    } else if (op.type === 'erase') {
      for (const { stroke, index } of [...op.removed].reverse()) L.strokes.splice(Math.min(index, L.strokes.length), 0, stroke);
    }
    if (L.mounted && L.strokes.length) L.ensureCanvas();
    L.redraw();
    L.changed();
    this.emit();
  }

  /** Katmanı geri alma geçmişinden çıkar (ör. sayfa silindiğinde). */
  forget(layer) { this.history = this.history.filter((h) => h.layer !== layer); this.emit(); }
}
