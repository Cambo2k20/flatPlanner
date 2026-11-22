/* Small helpers shared by every part of the app. Nothing here touches three.js. */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const cm = (m) => Math.round(m * 100);
export const rad = (deg) => (deg * Math.PI) / 180;
export const ftin = (m) => { const i = Math.round(m / 0.0254); return `${Math.floor(i / 12)}′ ${i % 12}″`; };
export const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
export const hexOr = (c, fallback) => (isHex(c) ? c.toLowerCase() : fallback);
export const numOr = (v, fallback) => (v !== '' && v !== null && v !== undefined && Number.isFinite(+v) ? +v : fallback);
export const snapTo = (v, step) => Math.round(v / step) * step;
export const str = (v, max = 200) => (v === null || v === undefined ? '' : String(v)).slice(0, max);

/** Seeded random numbers, so generated textures and book spines look the same every time. */
export function rng(seed) {
  let s = 2166136261;
  for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function money(v, currency = '£') {
  if (v === null || v === undefined || v === '' || !Number.isFinite(+v)) return '';
  const n = +v, frac = Math.abs(n % 1) > 1e-9;
  return currency + n.toLocaleString('en-GB', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: frac ? 2 : 0 });
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

/** Only http(s) links are ever turned into clickable anchors. */
export function safeUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; }
}

/* ---------------------------------------------------------------- DOM */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/**
 * Tiny element builder: el('button', { class: 'btn', onclick: fn }, 'Label').
 * Strings become text nodes, so user-entered text is never parsed as HTML.
 */
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : String(c));
  }
  return e;
}

/** A <select> with options [[value, label], …] and a current value. */
export function selectEl(options, value, attrs = {}) {
  const s = el('select', attrs, options.map(([v, l]) => el('option', { value: v }, l)));
  s.value = value;
  return s;
}

export function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function slug(s) {
  return String(s || 'flat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'flat';
}

/** Read an image file and shrink it to fit maxPx, returning a data URL. */
export function fileToImageDataUrl(file, maxPx = 512, type = 'image/jpeg', quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const g = c.getContext('2d');
      if (type === 'image/jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: c.toDataURL(type, quality), width: c.width, height: c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    img.src = url;
  });
}

let toastTimer = 0;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
