// Temalar: açık temalar sabah, koyu temalar akşam çalışması için.
import { getSettings, setSettings } from './settings.js';

export const THEMES = {
  light: [
    { id: 'latte', name: 'Sabah Kahvesi', desc: 'Kremsi, sıcak ve sakin', swatch: ['#f6efe6', '#c07a4a', '#3b2f27'] },
    { id: 'sakura', name: 'Sakura', desc: 'Yumuşak pembe tonlar', swatch: ['#fbf1f1', '#cf7088', '#43333a'] },
    { id: 'adacayi', name: 'Adaçayı', desc: 'Ferah yeşil, dingin', swatch: ['#eef2ea', '#5f8f5b', '#2f3a2f'] },
  ],
  dark: [
    { id: 'kutuphane', name: 'Gece Kütüphanesi', desc: 'Sıcak kehribar ışığı', swatch: ['#1f1a17', '#e0a15e', '#efe4d6'] },
    { id: 'gece-mavisi', name: 'Gece Mavisi', desc: 'Derin ve odaklı', swatch: ['#161c26', '#8fb3e8', '#e3e9f2'] },
    { id: 'lavanta', name: 'Lavanta Akşamı', desc: 'Huzurlu mor tonlar', swatch: ['#1d1a24', '#b99be0', '#ebe5f3'] },
  ],
};

const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function isDark() {
  const { mode } = getSettings();
  return mode === 'dark' || (mode === 'system' && mq.matches);
}

export function applyTheme() {
  const s = getSettings();
  const dark = isDark();
  const id = dark ? s.darkTheme : s.lightTheme;
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.classList.toggle('dark', dark);
  root.classList.toggle('dim-pdf', dark && s.dimPdf);
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg || '#f6efe6'));
}

export function setThemePref(patch) {
  setSettings(patch);
  applyTheme();
}

mq.addEventListener?.('change', () => { if (getSettings().mode === 'system') applyTheme(); });
