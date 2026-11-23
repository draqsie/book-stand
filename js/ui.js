// Küçük arayüz yardımcıları: DOM oluşturma, simgeler, bildirim, pencereler.
import { setBusy } from './savestate.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const P = {
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  notebook: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M10 8h6M10 12h6M3 7h3M3 12h3M3 17h3',
  mistake: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 9l6 6M15 9l-6 6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 8-7 8-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 15',
  pen: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4zM14 6l3 3',
  highlighter: 'M9 11l-5 5v3h6l5-5M9 11l6-6 4 4-6 6zM14 19h7',
  eraser: 'M7 21h13M5.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8l-2.5-2.5a1.4 1.4 0 0 1 0-1z',
  select: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  bookmarkPlus: 'M6 3h12v18l-6-4.5L6 21zM12 7v6M9 10h6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5M8 11h6',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  x: 'M6 6l12 12M18 6L6 18',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  finger: 'M9 11V5a2 2 0 0 1 4 0v6M13 10a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8 6 6 0 0 1-5-3l-1.5-3a1.6 1.6 0 0 1 2.8-1.6L7 15V9a2 2 0 0 1 2-2',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  goto: 'M4 12h12M12 6l6 6-6 6M20 4v16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
};

export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', P[name] || P.info);
  svg.append(path);
  return svg;
}

/** Simgeli düğme. label erişilebilirlik ve ipucu metni olarak kullanılır. */
export function iconButton(name, label, onClick, extra = {}) {
  return h('button', { type: 'button', class: `icon-btn ${extra.class || ''}`, 'aria-label': label, title: label, onclick: onClick, ...extra.attrs }, icon(name), extra.text ? h('span', {}, extra.text) : null);
}

let toastTimer = null;
export function toast(message, { duration = 2600, action } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.replaceChildren(h('span', {}, message));
  if (action) el.append(h('button', { type: 'button', class: 'toast-action', onclick: () => { el.classList.remove('show'); action.run(); } }, action.label));
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/**
 * Basit modal pencere. actions: [{label, value, kind:'primary'|'danger'|'ghost'}]
 * Kapatılınca seçilen eylemin value değeriyle çözülür (dışarı dokunma → null).
 */
export function modal({ title, body, actions = [{ label: 'Tamam', value: true, kind: 'primary' }], wide = false, onOpen, dismissable = true }) {
  return new Promise((resolve) => {
    setBusy(true);
    const close = (val) => {
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 180);
      document.removeEventListener('keydown', onKey);
      setBusy(false);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(null); };
    const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      title ? h('h2', { class: 'modal-title' }, title) : null,
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) =>
        h('button', { type: 'button', class: `btn ${a.kind || 'ghost'}`, onclick: async () => {
          if (a.validate && !(await a.validate())) return;
          close(typeof a.value === 'function' ? a.value() : a.value);
        } }, a.label))) : null,
    );
    const backdrop = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop && dismissable) close(null); } }, box);
    box._close = close;
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => backdrop.classList.add('show'));
    onOpen?.(box, close);
  });
}

export async function confirmDialog({ title, message, okLabel = 'Evet', danger = false }) {
  const res = await modal({
    title,
    body: h('p', {}, message),
    actions: [
      { label: 'Vazgeç', value: false, kind: 'ghost' },
      { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return res === true;
}

export async function promptText({ title, label, value = '', placeholder = '', okLabel = 'Kaydet', inputmode }) {
  const input = h('input', { type: 'text', class: 'field', value, placeholder, 'aria-label': label || title, inputmode, enterkeyhint: 'done' });
  const res = await modal({
    title,
    body: h('label', { class: 'field-label' }, label ? h('span', {}, label) : null, input),
    actions: [
      { label: 'Vazgeç', value: null, kind: 'ghost' },
      { label: okLabel, value: () => input.value.trim(), kind: 'primary', validate: () => input.value.trim().length > 0 },
    ],
    onOpen: (box, close) => {
      setTimeout(() => { input.focus(); input.select(); }, 60);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) close(input.value.trim()); });
    },
  });
  return res || null;
}

/** Sağdan açılan panel (ayraç listesi vb.) */
export function sheet({ title, body, onClose }) {
  setBusy(true);
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 200);
    setBusy(false);
    onClose?.();
  };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('aside', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('header', { class: 'sheet-head' }, h('h2', {}, title), iconButton('x', 'Kapat', () => close())),
      h('div', { class: 'sheet-body' }, body)));
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return { close };
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: i >= 2 ? 1 : 0 })} ${u[i]}`;
}

export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, icon(iconName, 34)), h('h3', {}, title), text ? h('p', {}, text) : null, action || null);
}
