'use strict';
/* ==========================================================
   NOIR STORE — Núcleo: utilidades, almacenamiento, UI base
   ========================================================== */

const APP_VERSION = '1.0.0';

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const sum = (arr, fn = x => x) => arr.reduce((a, x) => a + (+fn(x) || 0), 0);
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n, l = 2) => String(n).padStart(l, '0');
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const clone = o => JSON.parse(JSON.stringify(o));

function money(n, withSymbol = true) {
  const s = DB.data?.settings || {};
  const d = s.decimals ?? 2;
  const v = (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString(s.locale || 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
  return withSymbol ? `${s.currencySymbol || '$'} ${v}` : v;
}
const qtyFmt = n => (+n || 0).toLocaleString(DB.data?.settings?.locale || 'en-US', { maximumFractionDigits: 3 });
const pct = n => `${round2(n)}%`;

/* Fechas: ISO completas para momentos, 'YYYY-MM-DD' para días */
const nowISO = () => new Date().toISOString();
function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  return s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s);
}
function dayKey(d) { d = parseDate(d) || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const today = () => dayKey(new Date());
function addDays(d, n) { const x = new Date(parseDate(d)); x.setDate(x.getDate() + n); return dayKey(x); }
function addMonths(d, n) {
  const x = new Date(parseDate(d)); const day = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last)); return dayKey(x);
}
function daysBetween(a, b) { return Math.round((parseDate(dayKey(b)) - parseDate(dayKey(a))) / 86400000); }
function fmtDate(d) { d = parseDate(d); if (!d || isNaN(d)) return '—'; return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fmtTime(d) { d = parseDate(d); if (!d || isNaN(d)) return ''; return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
const fmtDateTime = d => d ? `${fmtDate(d)} ${fmtTime(d)}` : '—';
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const inRange = (iso, from, to) => { const k = dayKey(iso); return (!from || k >= from) && (!to || k <= to); };

function downloadFile(name, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toCSV(rows, cols) {
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(c.value(r))).join(','))].join('\n');
}
function readFileAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function readFileAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
/* Reduce imágenes para que la base de datos se mantenga ligera */
async function resizeImage(file, max = 360, quality = .82) {
  const src = await readFileAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '';
    i.onchange = () => res(i.files[0] || null); i.click();
  });
}

/* ---------- Contraseñas (SHA-256 en JS puro: funciona también en tablets por red) ---------- */
const SHA = (() => {
  const primes = []; for (let n = 2; primes.length < 64; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) primes.push(n); }
  const frac = x => Math.floor((x - Math.floor(x)) * 2 ** 32) >>> 0;
  return { K: primes.map(p => frac(Math.cbrt(p))), H: primes.slice(0, 8).map(p => frac(Math.sqrt(p))) };
})();
function sha256(str) {
  const bytes = new TextEncoder().encode(String(str));
  const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len * 8 / 2 ** 32));
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  const W = new Uint32Array(64), H = SHA.H.slice(), K = SHA.K;
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const x = W[i - 15], y = W[i - 2]; W[i] = (W[i - 16] + (r(x, 7) ^ r(x, 18) ^ (x >>> 3)) + W[i - 7] + (r(y, 17) ^ r(y, 19) ^ (y >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => H[i] = (H[i] + v) >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}
const randomSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
/* Hash iterado con sal (el mismo algoritmo lo usa el panel de licencias) */
function hashPass(password, salt) { let h = String(password); for (let i = 0; i < 1500; i++) h = sha256(salt + ':' + h); return h; }
function setPassword(user, password) { user.salt = randomSalt(); user.passHash = hashPass(password, user.salt); delete user.pin; }
function checkPassword(user, password) { return !!(user && user.passHash && hashPass(password, user.salt) === user.passHash); }
/* Variantes de lo que escribió la persona: sin espacios alrededor y sin * " ' ` que quedan al copiar de WhatsApp */
function credentialVariants(text) {
  const raw = String(text ?? '');
  const out = [raw, raw.trim()];
  let s = raw.trim();
  for (let i = 0; i < 3; i++) { const t = s.replace(/^[*"'`_~\s]+|[*"'`_~\s.,;]+$/g, ''); if (t === s) break; s = t; out.push(s); }
  return [...new Set(out)].filter(x => x !== '');
}
function checkPasswordLoose(user, password) { return credentialVariants(password).some(p => checkPassword(user, p)); }
function findUserByLogin(name) {
  const keys = credentialVariants(name).map(v => norm(v.replace(/^@/, '')));
  return DB.data.users.find(x => x.active !== false && keys.includes(norm(x.username))) || null;
}
/* PIN de acceso rápido (opcional, 4 a 8 dígitos) */
const validPin = p => /^\d{4,8}$/.test(String(p));
function setPin(user, pin) { user.pinSalt = randomSalt(); user.pinHash = hashPass(pin, user.pinSalt); }
function clearPin(user) { delete user.pinHash; delete user.pinSalt; }
function checkPin(user, pin) { return !!(user && user.pinHash && validPin(pin) && hashPass(pin, user.pinSalt) === user.pinHash); }
const pinTaken = (pin, exceptId) => DB.data.users.some(u => u.id !== exceptId && u.active !== false && checkPin(u, pin));

/* ---------- Separador de miles mientras se escribe ----------
   Convierte los <input type="number"> en campos de texto que muestran
   "100.000" (o "100,000" según el formato), pero su .value sigue
   devolviendo el número normal ("100000") para el resto del código. */
const NumMask = {
  native: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'),
  seps() {
    const s = (1234567.8).toLocaleString(DB.data?.settings?.locale || 'en-US', { useGrouping: 'always', minimumFractionDigits: 1 });
    return { g: s.match(/1(\D)234/)?.[1] || ',', d: s.match(/7(\D)8/)?.[1] || '.' };
  },
  /* texto visible -> número canónico ("1234.5") */
  canonical(text) {
    const { g, d } = this.seps();
    let t = String(text || '').split(g).join('');
    if (d !== '.') t = t.replace(/\./g, '').replace(d, '.');
    const neg = t.trim().startsWith('-');
    t = t.replace(/[^\d.]/g, '');
    const i = t.indexOf('.');
    if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
    return (neg ? '-' : '') + t;
  },
  /* número canónico -> texto con separadores */
  format(canon) {
    const { g, d } = this.seps();
    canon = String(canon ?? '');
    if (canon === '' || canon === '-') return canon;
    const neg = canon.startsWith('-'); if (neg) canon = canon.slice(1);
    const [int, frac] = canon.split('.');
    const grouped = (int.replace(/^0+(?=\d)/, '') || (frac !== undefined ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, g);
    return (neg ? '-' : '') + grouped + (frac !== undefined ? d + frac : '');
  },
  enhance(el) {
    if (el._numMask) return;
    el._numMask = true;
    const N = this.native, raw = N.get.call(el);
    el.type = 'text'; el.inputMode = 'decimal'; el.autocomplete = 'off'; el.dataset.num = '1';
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => NumMask.canonical(N.get.call(el)),
      set: v => N.set.call(el, NumMask.format(String(v ?? ''))),
    });
    N.set.call(el, this.format(String(raw)));
    el.addEventListener('input', () => {
      const shown = N.get.call(el), pos = el.selectionStart ?? shown.length;
      const { d } = this.seps();
      const keep = shown.slice(0, pos).replace(new RegExp(`[^\\d\\${d}-]`, 'g'), '').length;
      const next = this.format(this.canonical(shown));
      if (next === shown) return;
      N.set.call(el, next);
      let c = 0, k = 0;
      while (k < next.length && c < keep) { if (/[\d-]/.test(next[k]) || next[k] === d) c++; k++; }
      try { el.setSelectionRange(k, k); } catch (e) { }
    });
  },
  init() {
    const scan = root => { if (root.querySelectorAll) root.querySelectorAll('input[type=number]').forEach(i => this.enhance(i)); };
    scan(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches && n.matches('input[type=number]')) this.enhance(n); else scan(n);
    }))).observe(document.documentElement, { childList: true, subtree: true });
  },
};

/* ---------- Iconos ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  pos: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  quote: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  credit: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  truck: '<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  pause: '<path d="M10 4H6v16h4zM18 4h-4v16h4z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  barcode: '<path d="M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14"/>',
  down: '<path d="M22 17 13.5 8.5l-5 5L2 7"/><path d="M16 17h6v-6"/>',
  up: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-7 10 7z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  spark: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};
function icon(name, size = 18, extra = '') {
  const fill = name === 'spark' ? 'currentColor' : 'none';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name] || ''}</svg>`;
}

/* ---------- Almacenamiento (servidor local o IndexedDB) ---------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('noir-store', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    try {
      await this.open();
      return await new Promise((res, rej) => { const q = this.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    } catch (e) { return null; }
  },
  async set(k, v) {
    await this.open();
    return new Promise((res, rej) => { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
};

const COLLECTIONS = ['users', 'categories', 'brands', 'products', 'movements', 'customers', 'suppliers', 'purchases',
  'supplierPayments', 'quotes', 'invoices', 'payments', 'returns', 'cashSessions', 'cashMoves', 'expenses', 'held', 'audit', 'notifications', 'layaways', 'promos'];

const DB = {
  data: null,
  mode: 'local',          // 'server' cuando se abre con server.js
  rev: 0,                 // cambia en cada guardado, sirve para cachés
  _timer: null, _saving: false, _pending: false,

  async load() {
    try {
      if (location.protocol.startsWith('http')) {
        const r = await fetch('api/db', { cache: 'no-store' });
        if (r.ok) { this.mode = 'server'; const j = await r.json(); if (j && j.meta) this.data = j; }
      }
    } catch (e) { /* sin servidor */ }
    if (this.mode !== 'server') {
      this.data = await IDB.get('state');
      if (!this.data) { try { const ls = localStorage.getItem('noir-db'); if (ls) this.data = JSON.parse(ls); } catch (e) { } }
    }
    const fresh = !this.data;
    if (fresh) this.data = seedData();
    migrate(this.data);
    if (fresh) await this.persist();
    if (this.mode === 'server') this.startSync();
    return fresh;
  },
  commit() {
    this.rev++;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.persist(), 120);
  },
  async persist() {
    if (this._saving) { this._pending = true; return; }
    this._saving = true;
    try {
      if (this.mode === 'server') {
        const base = this.data.meta.rev || 0;
        this.data.meta.rev = base + 1;
        this.data.meta.savedAt = nowISO();
        const r = await fetch('api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Base-Rev': String(base) }, body: JSON.stringify(this.data) });
        if (r.status === 409) {
          this.data.meta.rev = base;
          toast('Los datos se modificaron en otra terminal. Recargando…', 'warn');
          setTimeout(() => location.reload(), 1600);
        } else if (!r.ok) throw new Error('HTTP ' + r.status);
      } else {
        this.data.meta.savedAt = nowISO();
        await IDB.set('state', this.data);
      }
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar: ' + e.message, 'err');
    } finally {
      this._saving = false;
      if (this._pending) { this._pending = false; this.persist(); }
    }
  },
  /* Sincroniza con otras terminales cuando se usa el servidor */
  startSync() {
    setInterval(async () => {
      if (this._saving || this._pending) return;
      try {
        const r = await fetch('api/rev', { cache: 'no-store' });
        if (!r.ok) return;
        const { rev } = await r.json();
        if (rev > (this.data.meta.rev || 0) && !document.querySelector('.modal-back')) {
          const j = await (await fetch('api/db', { cache: 'no-store' })).json();
          this.data = j; migrate(this.data); this.rev++;
          App.refresh();
        }
      } catch (e) { }
    }, 15000);
  },
  replaceAll(data) { this.data = data; migrate(this.data); this.commit(); },
};

const DEFAULT_SETTINGS = () => ({
  company: { name: 'NOIR STORE', legalName: '', taxId: '', address: '', phone: '', email: '', website: '', slogan: 'Moda & estilo' },
  country: '',
  currencySymbol: '$', decimals: 2, locale: 'en-US',
  taxName: 'IVA', taxRate: 0, pricesIncludeTax: true,
  ticketWidth: 80, defaultPrint: 'ticket', autoPrint: false,
  ticketFooter: '¡Gracias por su compra!\nCambios dentro de 30 días presentando su factura.',
  invoiceTerms: 'Toda mercancía viaja por cuenta y riesgo del comprador. Cambios dentro de 30 días con factura y etiqueta.',
  quoteTerms: 'Precios sujetos a cambio sin previo aviso. Cotización válida hasta la fecha indicada.',
  quoteValidityDays: 15, creditDefaultDays: 30, lowStockDefault: 3,
  allowNegativeStock: false, requireCashSession: true, sellerCanEditPrice: false, maxDiscountNonAdmin: 15,
  prefixes: { invoice: 'FAC', quote: 'COT', purchase: 'OC', return: 'DEV', receipt: 'REC', supplierPayment: 'PP', session: 'CJ', layaway: 'APA' },
  seq: { invoice: 1, quote: 1, purchase: 1, return: 1, receipt: 1, supplierPayment: 1, session: 1, sku: 1, barcode: 1, layaway: 1 },
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  colors: ['Negro', 'Blanco', 'Gris', 'Azul', 'Beige', 'Rojo'],
  units: ['und', 'par', 'docena', 'caja', 'kg', 'm'],
  denominations: [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1],
  expenseCategories: ['Alquiler', 'Servicios (luz, agua, internet)', 'Nómina', 'Transporte', 'Publicidad', 'Mantenimiento', 'Empaques', 'Impuestos', 'Otros'],
  customLogo: null,
  pinLogin: { enabled: true, defaultMode: 'password' },
  loyalty: { enabled: true, earnEvery: 1000, pointValue: 10, minRedeem: 100 },
  layaway: { minDepositPct: 20, days: 30 },
  creditInterest: { rate: 0, type: 'mensual' },
  ownerPhone: '', ownerAutoClose: true,
  whatsapp: WA_DEFAULTS(),
  setupDone: false,
});

function seedData() {
  return {
    meta: { version: 1, rev: 0, createdAt: nowISO() },
    settings: DEFAULT_SETTINGS(),
    users: [{ id: 'u-admin', name: 'Administrador', username: 'admin', pin: '1234', role: 'admin', active: true }],
    customers: [{ id: 'walkin', name: 'Consumidor final', docId: '', phone: '', email: '', address: '', creditLimit: 0, creditDays: 0, storeCredit: 0, notes: '', createdAt: nowISO(), system: true }],
    categories: ['Camisas', 'Camisetas', 'Pantalones', 'Jeans', 'Vestidos', 'Faldas', 'Abrigos', 'Calzado', 'Accesorios', 'Ropa interior'].map(n => ({ id: uid(), name: n })),
    brands: [{ id: uid(), name: 'NOIR' }],
  };
}
function migrate(d) {
  d.meta = d.meta || { version: 1, rev: 0, createdAt: nowISO() };
  const hadWa = !!(d.settings && d.settings.whatsapp);
  const def = DEFAULT_SETTINGS();
  d.settings = Object.assign(def, d.settings || {});
  d.settings.company = Object.assign(def.company, d.settings.company);
  d.settings.prefixes = Object.assign(DEFAULT_SETTINGS().prefixes, d.settings.prefixes);
  d.settings.seq = Object.assign(DEFAULT_SETTINGS().seq, d.settings.seq);
  d.settings.pinLogin = Object.assign({ enabled: true, defaultMode: 'password' }, d.settings.pinLogin);
  d.settings.loyalty = Object.assign(DEFAULT_SETTINGS().loyalty, d.settings.loyalty);
  d.settings.layaway = Object.assign(DEFAULT_SETTINGS().layaway, d.settings.layaway);
  d.settings.creditInterest = Object.assign(DEFAULT_SETTINGS().creditInterest, d.settings.creditInterest);
  d.settings.whatsapp = Object.assign(WA_DEFAULTS(), hadWa ? d.settings.whatsapp : {});
  if (!hadWa && typeof COUNTRY_PRESETS !== 'undefined' && COUNTRY_PRESETS[d.settings.country]) d.settings.whatsapp.countryCode = COUNTRY_PRESETS[d.settings.country].dial;
  COLLECTIONS.forEach(c => { if (!Array.isArray(d[c])) d[c] = []; });
  if (!d.customers.find(c => c.id === 'walkin')) d.customers.unshift({ id: 'walkin', name: 'Consumidor final', storeCredit: 0, creditLimit: 0, system: true, createdAt: nowISO() });
  if (!d.users.length) d.users.push({ id: 'u-admin', name: 'Administrador', username: 'admin', pin: '1234', role: 'admin', active: true });
  // PIN antiguo -> contraseña; usuario obligatorio y único
  d.users.forEach((u, i) => {
    if (!u.passHash) setPassword(u, u.pin || '1234');
    if (!u.username) u.username = norm(u.name).replace(/[^a-z0-9]/g, '').slice(0, 12) || 'usuario' + (i + 1);
  });
  // identificación de esta instalación (para licencias)
  if (!d.meta.installId) d.meta.installId = [0, 0, 0].map(() => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')).join('-');
  if (!d.meta.trialStart) d.meta.trialStart = today();
  if (!('license' in d)) d.license = null;
}

/* ---------- Roles y permisos ---------- */
const ROLES = {
  admin: { label: 'Administrador', perms: '*' },
  cajero: { label: 'Cajero', perms: ['dashboard', 'pos', 'invoices', 'quotes', 'customers', 'customers.edit', 'credits', 'cash', 'expenses', 'products', 'inventory', 'returns', 'layaway'] },
  vendedor: { label: 'Vendedor', perms: ['dashboard', 'pos', 'quotes', 'customers', 'customers.edit', 'products', 'layaway'] },
  almacen: { label: 'Almacén', perms: ['dashboard', 'products', 'products.edit', 'inventory', 'inventory.adjust', 'purchases'] },
};
function can(perm) {
  const u = App.user; if (!u) return false;
  // funciones que dependen del plan de suscripción
  if (typeof LIC !== 'undefined' && PLAN_FEATURES[perm] && !LIC.has(perm)) return false;
  const r = ROLES[u.role]; if (!r) return false;
  return r.perms === '*' || r.perms.includes(perm);
}
const isAdmin = () => App.user?.role === 'admin';

/* ---------- UI: toast, modal, confirm ---------- */
function toast(msg, type = 'ok', ms = 3200) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const ic = { ok: 'check', err: 'alert', warn: 'alert', info: 'spark' }[type] || 'check';
  t.innerHTML = `${icon(ic, 17)}<div>${esc(msg)}</div>`;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
}

const modalStack = [];
function openModal({ title = '', body = '', footer = '', size = 'md', onOpen, onClose, backdropClose = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close title="Cerrar (Esc)">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('input[type=number]').forEach(i => NumMask.enhance(i));
  let closed = false;
  const m = {
    el: wrap,
    $: s => wrap.querySelector(s),
    $$: s => [...wrap.querySelectorAll(s)],
    close(result) {
      if (closed) return; closed = true;
      wrap.remove(); modalStack.splice(modalStack.indexOf(m), 1);
      onClose && onClose(result);
    },
    setBody(html) { wrap.querySelector('.modal-body').innerHTML = html; },
  };
  modalStack.push(m);
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) m.close();
    else if (backdropClose && e.target === wrap) m.close();
  });
  onOpen && onOpen(m);
  const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-body input:not([type=checkbox]):not([readonly]), .modal-body select, .modal-body textarea');
  if (f) setTimeout(() => { f.focus(); f.select && f.type !== 'date' && f.select(); }, 30);
  return m;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalStack.length) { e.preventDefault(); modalStack[modalStack.length - 1].close(); }
});

function confirmBox(message, { title = 'Confirmar', ok = 'Aceptar', danger = false } = {}) {
  return new Promise(res => {
    let answered = false;
    const m = openModal({
      title, size: 'sm', body: `<div style="color:var(--text-2)">${message}</div>`,
      footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>`,
      onClose: () => { if (!answered) res(false); },
      onOpen: m => { m.$('[data-ok]').onclick = () => { answered = true; res(true); m.close(); }; setTimeout(() => m.$('[data-ok]').focus(), 40); },
    });
  });
}
function promptBox(message, { title = 'Ingresar dato', value = '', placeholder = '', type = 'text', ok = 'Aceptar', required = false } = {}) {
  return new Promise(res => {
    let answered = false;
    openModal({
      title, size: 'sm',
      body: `<div class="field"><label>${message}</label>${type === 'textarea' ? `<textarea id="pb-in" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input id="pb-in" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</div>`,
      footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>${ok}</button>`,
      onClose: () => { if (!answered) res(null); },
      onOpen: m => {
        const go = () => { const v = m.$('#pb-in').value; if (required && !v.trim()) { m.$('#pb-in').focus(); return; } answered = true; res(v); m.close(); };
        m.$('[data-ok]').onclick = go;
        m.$('#pb-in').addEventListener('keydown', e => { if (e.key === 'Enter' && type !== 'textarea') go(); });
      },
    });
  });
}
/* Pide autorización de un administrador (contraseña) */
function adminAuth(reason = 'Esta acción requiere autorización de un administrador.') {
  if (isAdmin()) return Promise.resolve(true);
  return new Promise(res => {
    let ok = false;
    openModal({
      title: 'Autorización requerida', size: 'sm',
      body: `<p class="muted" style="margin-top:0">${esc(reason)}</p><div class="field"><label>Contraseña o PIN de un administrador</label><input id="aa-pin" type="password" autocomplete="off"></div>`,
      footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Autorizar</button>`,
      onClose: () => res(ok),
      onOpen: m => {
        const go = () => {
          const pin = m.$('#aa-pin').value;
          if (DB.data.users.some(u => u.active && u.role === 'admin' && (checkPasswordLoose(u, pin) || (DB.data.settings.pinLogin.enabled && checkPin(u, String(pin).trim()))))) { ok = true; m.close(); }
          else { toast('Contraseña incorrecta', 'err'); m.$('#aa-pin').value = ''; m.$('#aa-pin').focus(); }
        };
        m.$('[data-ok]').onclick = go;
        m.$('#aa-pin').addEventListener('keydown', e => e.key === 'Enter' && go());
      },
    });
  });
}

/* Lee los campos [name] de un contenedor */
function readForm(root) {
  const o = {};
  $$('[name]', root).forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number' || el.dataset.num) o[el.name] = el.value === '' ? '' : num(el.value);
    else o[el.name] = el.value.trim();
  });
  return o;
}
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;

/* ---------- Tabla de datos reutilizable ---------- */
function DataTable(container, cfg) {
  const st = { q: '', page: 0, sortKey: cfg.sortKey || null, sortDir: cfg.sortDir || 'desc' };
  const size = cfg.pageSize || 25;
  container.innerHTML = `
    <div class="card">
      ${cfg.search === false && !cfg.toolbar ? '' : `<div class="dt-toolbar">
        ${cfg.search === false ? '' : `<div class="search-box">${icon('search', 16)}<input type="search" placeholder="${esc(cfg.placeholder || 'Buscar…')}" data-dt-q></div>`}
        ${cfg.toolbar || ''}
      </div>`}
      <div class="table-wrap"><table class="tbl ${cfg.compact ? 'compact' : ''}"><thead><tr>${cfg.columns.map((c, i) =>
        `<th class="${c.cls || ''} ${c.sort ? 'sortable' : ''}" data-col="${i}" ${c.width ? `style="width:${c.width}"` : ''}>${c.label}${c.sort ? ' <span data-arrow></span>' : ''}</th>`).join('')}</tr></thead><tbody></tbody>${cfg.footer ? '<tfoot></tfoot>' : ''}</table></div>
      <div class="dt-pager"></div>
    </div>`;
  const tbody = $('tbody', container), pager = $('.dt-pager', container), tfoot = $('tfoot', container);
  const qIn = $('[data-dt-q]', container);
  if (qIn) qIn.addEventListener('input', () => { st.q = qIn.value; st.page = 0; draw(); });
  $$('th.sortable', container).forEach(th => th.addEventListener('click', () => {
    const c = cfg.columns[+th.dataset.col];
    if (st.sortKey === c.sort) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc'; else { st.sortKey = c.sort; st.sortDir = 'asc'; }
    draw();
  }));
  function rows() {
    let r = cfg.rows();
    if (st.q && cfg.searchText) { const q = norm(st.q).split(/\s+/).filter(Boolean); r = r.filter(x => { const t = norm(cfg.searchText(x)); return q.every(w => t.includes(w)); }); }
    if (st.sortKey) {
      const col = cfg.columns.find(c => c.sort === st.sortKey);
      const val = col.sortValue || (x => x[st.sortKey]);
      r = [...r].sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true }); return st.sortDir === 'asc' ? c : -c; });
    }
    return r;
  }
  function draw() {
    const all = rows();
    const pages = Math.max(1, Math.ceil(all.length / size));
    if (st.page >= pages) st.page = pages - 1;
    const slice = all.slice(st.page * size, st.page * size + size);
    tbody.innerHTML = slice.length ? slice.map(r => `<tr ${cfg.rowAttrs ? cfg.rowAttrs(r) : ''}>${cfg.columns.map(c => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cfg.columns.length}"><div class="empty">${icon(cfg.emptyIcon || 'box', 34)}<div>${cfg.empty || 'Sin registros'}</div></div></td></tr>`;
    if (tfoot) tfoot.innerHTML = cfg.footer(all);
    $$('th.sortable', container).forEach(th => { const c = cfg.columns[+th.dataset.col]; $('[data-arrow]', th).textContent = st.sortKey === c.sort ? (st.sortDir === 'asc' ? '↑' : '↓') : ''; });
    pager.innerHTML = `<span>${all.length} registro${all.length === 1 ? '' : 's'}</span><span class="spacer"></span>
      ${pages > 1 ? `<button class="btn sm" data-pg="-1" ${st.page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${st.page + 1} de ${pages}</span><button class="btn sm" data-pg="1" ${st.page >= pages - 1 ? 'disabled' : ''}>Siguiente</button>` : ''}`;
    $$('[data-pg]', pager).forEach(b => b.onclick = () => { st.page += +b.dataset.pg; draw(); });
    cfg.onDraw && cfg.onDraw(all);
  }
  draw();
  return { refresh: draw, state: st, rows };
}

/* Delegación de clicks por data-act */
/* Un solo listener por contenedor; volver a llamar reemplaza los handlers */
function onActions(root, handlers) {
  root._act = handlers;
  if (root._actBound) return;
  root._actBound = true;
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const h = root._act && root._act[b.dataset.act];
    if (h) { e.stopPropagation(); h(b.dataset.id, b, e); }
  });
}

/* ---------- Gráfico de barras SVG ---------- */
function barChart(data, { height = 220, fmt = v => money(v), highlightLast = true } = {}) {
  if (!data.length) return '<div class="empty">Sin datos</div>';
  const W = 760, H = height, pl = 54, pb = 26, pt = 12, pr = 8;
  const max = Math.max(1, ...data.map(d => d.value));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const cw = (W - pl - pr) / data.length, bw = Math.max(4, Math.min(38, cw * .62));
  const y = v => pt + (H - pt - pb) * (1 - v / nice);
  const ticks = [0, .25, .5, .75, 1].map(f => nice * f);
  const short = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : Math.round(v);
  const every = Math.ceil(data.length / 16);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${height}px">
    ${ticks.map(t => `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 8}" y="${y(t) + 3.5}" text-anchor="end">${short(t)}</text>`).join('')}
    ${data.map((d, i) => { const x = pl + i * cw + (cw - bw) / 2; const h = Math.max(d.value > 0 ? 2 : 0, H - pb - y(d.value)); return `<rect class="bar ${highlightLast && i === data.length - 1 ? 'hi' : ''}" x="${x}" y="${H - pb - h}" width="${bw}" height="${h}" rx="3"><title>${esc(d.label)}: ${esc(fmt(d.value))}</title></rect>${i % every === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : ''}`; }).join('')}
  </svg>`;
}
function hBars(items, fmt = v => money(v)) {
  if (!items.length) return '<div class="empty" style="padding:24px">Sin datos</div>';
  const max = Math.max(...items.map(i => i.value), 1);
  return items.map(i => `<div class="hbar"><div class="hb-label">${esc(i.label)}</div><div class="hb-val">${esc(fmt(i.value))}</div><div class="hb-track"><div class="hb-fill" style="width:${Math.max(2, i.value / max * 100)}%"></div></div></div>`).join('');
}

/* ---------- Registro de auditoría ---------- */
function audit(action, detail) {
  DB.data.audit.push({ id: uid(), date: nowISO(), userId: App.user?.id, userName: App.user?.name, action, detail });
  if (DB.data.audit.length > 3000) DB.data.audit.splice(0, DB.data.audit.length - 3000);
}

/* Registro de páginas */
const Pages = {};
