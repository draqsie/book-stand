// Kalem/vurgulayıcı/silgi motoru. Pointer Events ile Apple Pencil ve parmak girişini işler.
// Koordinatlar "sayfa birimi"nde saklanır: sayfa genişliği = 1000 birim. Böylece yakınlaştırma
// düzeyinden bağımsızdır.
import { getInk, saveInk } from './store.js';
import { debouncedSaver, setBusy } from './savestate.js';
import { getSettings, setSettings } from './settings.js';

export const UNITS = 1000;
const MAX_CANVAS_AREA = 16_000_000; // iPad Safari tuval sınırı (~16.7M piksel)

export function canvasScale(cssW, cssH) {
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (cssW * cssH * dpr * dpr > MAX_CANVAS_AREA && dpr > 0.5) dpr -= 0.25;
  return dpr;
}

const pf = (pr) => 0.6 + 0.8 * pr; // basınç → kalınlık çarpanı

/** Bir çizgiyi verilen bağlama çizer. k = piksel / birim */
export function drawStroke(ctx, s, k) {
  const p = s.p;
  const n = p.length / 3;
  if (!n) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
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
  } else {
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(p[0] * k, p[1] * k, (s.s * pf(p[2]) * k) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let j = 1; j < n; j++) penSegment(ctx, p, j, n, s.s, k);
    }
  }
  ctx.restore();
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
    this.saver = debouncedSaver(`ink:${ownerId}:${page}`, () => saveInk(ownerId, page, this.strokes || []));
    el._layer = this;
  }

  async load() {
    if (!this.strokes) this.strokes = await getInk(this.ownerId, this.page);
    return this.strokes;
  }

  async mount() {
    await this.load();
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'ink-canvas';
      this.el.append(this.canvas);
    }
    this.resize();
  }

  unmount() {
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
    const r = this.el.getBoundingClientRect();
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
    this.history = [];
    this.active = null; // devam eden işlem
    this.penActive = false;
    this.lastPenUp = 0;
    this.live = null;
    this.listeners = new Set();
    this.applyToolClass();
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

  applyToolClass() {
    this.root.classList.remove('tool-hand', 'tool-pen', 'tool-hl', 'tool-eraser', 'tool-select');
    this.root.classList.add(`tool-${this.tool}`);
  }

  /** Bir .ink öğesine işaretçi dinleyicilerini bağlar. */
  bind(layer) {
    const el = layer.el;
    el.addEventListener('pointerdown', (e) => this.down(layer, e));
    el.addEventListener('pointermove', (e) => this.move(layer, e));
    el.addEventListener('pointerup', (e) => this.up(layer, e));
    el.addEventListener('pointercancel', (e) => this.up(layer, e, true));
    // iPadOS'ta kalemle yazarken sayfanın kaymasını / büyüteç açılmasını engelle.
    const stop = (e) => { if (this.tool !== 'hand') e.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
  }

  down(layer, e) {
    if (this.tool === 'hand') return;
    const st = getSettings();
    if (e.pointerType === 'pen' && !st.penSeen) {
      setSettings({ penSeen: true, fingerDraws: false });
      this.onToast?.('Apple Pencil algılandı: kalemle yazın, parmakla kaydırın. (Araç çubuğundan değiştirilebilir)');
      this.emit();
    }
    if (this.active) {
      // Kalemle yazarken avuç içi dokunuşlarını yok say.
      return;
    }
    const isTouch = e.pointerType === 'touch';
    if (isTouch && (this.penActive || Date.now() - this.lastPenUp < 400)) return;
    if (isTouch && !getSettings().fingerDraws) {
      this.active = { type: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sl: this.scroller.scrollLeft, st: this.scroller.scrollTop };
      layer.el.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!layer.strokes) return; // henüz yüklenmedi
    e.preventDefault();
    layer.el.setPointerCapture?.(e.pointerId);
    if (e.pointerType === 'pen') this.penActive = true;
    const [x, y] = layer.toUnits(e.clientX, e.clientY);

    if (this.tool === 'pen' || this.tool === 'hl') {
      setBusy(true);
      const isHl = this.tool === 'hl';
      const pr = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      const stroke = { t: isHl ? 'hl' : 'pen', c: isHl ? this.hlColor : this.penColor, s: isHl ? 22 : this.penSize * 1.4, p: [r1(x), r1(y), Math.round(pr * 100) / 100] };
      this.active = { type: 'draw', id: e.pointerId, layer, stroke, pen: e.pointerType === 'pen' };
      if (isHl) this.showLive(layer);
      this.paintActive();
    } else if (this.tool === 'eraser') {
      setBusy(true);
      this.active = { type: 'erase', id: e.pointerId, layer, removed: [], lx: x, ly: y };
      this.eraseAt(layer, x, y);
    } else if (this.tool === 'select') {
      const box = document.createElement('div');
      box.className = 'select-box';
      layer.el.append(box);
      this.active = { type: 'select', id: e.pointerId, layer, x0: x, y0: y, x1: x, y1: y, box };
      this.updateSelectBox();
    }
  }

  move(layer, e) {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    if (a.type === 'pan') {
      this.scroller.scrollLeft = a.sl - (e.clientX - a.x);
      this.scroller.scrollTop = a.st - (e.clientY - a.y);
      return;
    }
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const list = events.length ? events : [e];
    if (a.type === 'draw') {
      for (const ev of list) {
        const [x, y] = a.layer.toUnits(ev.clientX, ev.clientY);
        const p = a.stroke.p;
        const lx = p[p.length - 3], ly = p[p.length - 2];
        if (Math.hypot(x - lx, y - ly) < 0.8) continue;
        const pr = a.pen && ev.pressure > 0 ? ev.pressure : 0.5;
        p.push(r1(x), r1(y), Math.round(pr * 100) / 100);
      }
      this.paintActive();
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
      this.updateSelectBox();
    }
  }

  up(layer, e, cancelled = false) {
    const a = this.active;
    if (e.pointerType === 'pen') { this.penActive = false; this.lastPenUp = Date.now(); }
    if (!a || a.id !== e.pointerId) return;
    this.active = null;
    if (a.type === 'pan') return;
    if (a.type === 'draw') {
      setBusy(false);
      this.hideLive();
      const L = a.layer;
      L.strokes.push(a.stroke);
      // Son parçayı da içeren tam çizgiyi ana tuvale çiz.
      if (a.stroke.t === 'hl' || a.stroke.p.length <= 6) {
        if (L.canvas) drawStroke(L.canvas.getContext('2d'), a.stroke, L.k);
      } else if (L.canvas) {
        const n = a.stroke.p.length / 3;
        const ctx = L.canvas.getContext('2d');
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = a.stroke.c;
        penSegment(ctx, a.stroke.p, n - 1, n, a.stroke.s, L.k);
        ctx.restore();
      }
      this.history.push({ type: 'add', layer: L, stroke: a.stroke });
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
    const k = a.layer.el.clientWidth / UNITS;
    Object.assign(a.box.style, {
      left: `${Math.min(a.x0, a.x1) * k}px`, top: `${Math.min(a.y0, a.y1) * k}px`,
      width: `${Math.abs(a.x1 - a.x0) * k}px`, height: `${Math.abs(a.y1 - a.y0) * k}px`,
    });
  }

  // Kalem: ana tuvale parça parça çiz. Vurgulayıcı: geçici tuvalde tüm çizgiyi yeniden çiz.
  paintActive() {
    const a = this.active;
    const L = a.layer;
    if (a.stroke.t === 'hl') {
      if (!this.live) return;
      const ctx = this.live.getContext('2d');
      ctx.clearRect(0, 0, this.live.width, this.live.height);
      drawStroke(ctx, a.stroke, this.live.width / UNITS);
      return;
    }
    if (!L.canvas) return;
    const ctx = L.canvas.getContext('2d');
    const p = a.stroke.p;
    const n = p.length / 3;
    a.drawn ||= 0;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = a.stroke.c; ctx.fillStyle = a.stroke.c;
    if (n === 1 && !a.drawn) {
      ctx.beginPath(); ctx.arc(p[0] * L.k, p[1] * L.k, (a.stroke.s * pf(p[2]) * L.k) / 2, 0, Math.PI * 2); ctx.fill();
    }
    // n-2'ye kadar olan parçalar kesinleşmiştir (bir sonraki noktayı bilir).
    for (let j = a.drawn + 1; j <= n - 2; j++) penSegment(ctx, p, j, n, a.stroke.s, L.k);
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

  eraseAt(layer, x, y) {
    const a = this.active;
    const r = 10;
    let changed = false;
    for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const s = layer.strokes[i];
      if (hits(s, x, y, r)) {
        layer.strokes.splice(i, 1);
        a.removed.push({ stroke: s, index: i });
        changed = true;
      }
    }
    if (changed) layer.redraw();
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
    L.redraw();
    L.changed();
    this.emit();
  }

  /** Katmanı geri alma geçmişinden çıkar (ör. sayfa silindiğinde). */
  forget(layer) { this.history = this.history.filter((h) => h.layer !== layer); this.emit(); }
}
