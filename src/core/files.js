/* Saving and opening files: a single flat, your catalogue, a full backup, and layout
   files saved by the original 3D planner. */
import { entryLook, normalizeEntry, starterCatalogue, STARTER_PREFIX } from './catalogue.js';
import { normalizeFlat, normalizeItem } from './flat-model.js';
import { FLOORS } from './palette.js';
import { sampleFlat } from './sample-flat.js';
import { SHAPES, isShape } from './shapes.js';
import { clamp, hexOr, numOr, str, uid } from './util.js';

export const APP_ID = 'flat-planner';
export const FILE_FORMAT = 1;

/* A flat's floorplan image (if you added one) travels inside the flat as underlayImage. */
const withImage = (flat, image) => (image ? { ...flat, underlayImage: image } : flat);

export function flatFile(flat, catalogue, image) {
  const used = new Set(flat.design.items.map((i) => i.cat));
  return { app: APP_ID, kind: 'flat', format: FILE_FORMAT, saved: new Date().toISOString(), flat: withImage(flat, image), catalogue: catalogue.filter((e) => used.has(e.id)) };
}
export const catalogueFile = (catalogue) => ({ app: APP_ID, kind: 'catalogue', format: FILE_FORMAT, saved: new Date().toISOString(), catalogue });
export const backupFile = (flats, catalogue, images = new Map()) => ({
  app: APP_ID, kind: 'backup', format: FILE_FORMAT, saved: new Date().toISOString(), flats: flats.map((f) => withImage(f, images.get(f.id))), catalogue,
});

export function isLegacyLayout(obj) {
  const s = obj && (obj.state || obj);
  return !!(s && s.room && typeof s.room === 'object' && 'W' in s.room && Array.isArray(s.items));
}

/**
 * Read any file this app understands. Returns the flats and catalogue entries in it,
 * with flat ids made unique against `existingFlatIds`, and any floorplan images keyed
 * by the (new) flat id. Throws if it isn't ours.
 */
export function readFile(obj, catalogue, existingFlatIds = new Set()) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a file this planner can read.');
  const images = new Map();
  const fresh = (raw) => {
    let f = normalizeFlat(raw);
    if (existingFlatIds.has(f.id)) f = normalizeFlat({ ...f, id: uid() });
    if (raw && typeof raw.underlayImage === 'string' && raw.underlayImage.startsWith('data:image/')) images.set(f.id, raw.underlayImage);
    return f;
  };
  if (obj.app === APP_ID) {
    const entries = (Array.isArray(obj.catalogue) ? obj.catalogue : []).map(normalizeEntry);
    if (obj.kind === 'flat' && obj.flat) return { kind: 'flat', flats: [fresh(obj.flat)], entries, images };
    if (obj.kind === 'catalogue') return { kind: 'catalogue', flats: [], entries, images };
    if (obj.kind === 'backup') return { kind: 'backup', flats: (Array.isArray(obj.flats) ? obj.flats : []).map(fresh), entries, images };
  }
  if (isLegacyLayout(obj)) {
    const { flat, added } = importLegacyLayout(obj, catalogue);
    return { kind: 'legacy', flats: [flat], entries: added, images };
  }
  throw new Error('Not a file this planner can read.');
}

/** Add entries to the catalogue, keeping the version you already have when ids match. */
export function mergeEntries(catalogue, entries) {
  const have = new Set(catalogue.map((e) => e.id));
  const added = entries.filter((e) => !have.has(e.id));
  return { catalogue: [...catalogue, ...added], added };
}

/* A layout saved by the original single-flat planner: the sample flat at the sizes
   you typed, your paint and floors, and your furniture matched to catalogue items. */
export function importLegacyLayout(obj, catalogue) {
  const s = obj.state || obj, room = s.room || {};
  const W = clamp(numOr(room.W, 3.45), 3.2, 3.8), D = clamp(numOr(room.D, 4.09), 3.55, 4.95), H = clamp(numOr(room.H, 2.4), 2.2, 3.0);
  const flat = sampleFlat({ W, D, H }, { name: 'My flat from the 3D planner' });
  const des = flat.design, p = room.paint || {};
  const north = hexOr(p.north, des.paint.lounge);
  des.paint.lounge = north;
  const lw = {};
  const wall = (edge, c) => { if (c && c !== north) lw[edge] = c; };
  wall(1, hexOr(p.east, '#22566a'));
  for (const e of [2, 3, 4]) wall(e, hexOr(p.south, north));
  wall(5, hexOr(p.west, north));
  des.wallPaint = Object.keys(lw).length ? { lounge: lw } : {};
  for (const k of ['kitchen', 'hall', 'bedMain', 'bedSmall', 'shower']) des.paint[k] = hexOr(p[k], des.paint[k]);
  des.ceiling = hexOr(p.ceiling, des.ceiling);
  des.trim = hexOr(room.trim, des.trim);
  if (FLOORS[room.floor]) { des.floor.lounge = room.floor; des.floor.hall = room.floor; }
  if (FLOORS[room.floorBed]) { des.floor.bedMain = room.floorBed; des.floor.bedSmall = room.floorBed; }

  const starters = Object.fromEntries(starterCatalogue().map((e) => [e.id, e]));
  const pool = [...catalogue], added = [];
  const close = (a, b) => Math.abs(a - b) < 0.0015;
  for (const i of s.items) {
    if (!i || !isShape(i.type) || SHAPES[i.type].fitting) continue;
    const w = clamp(numOr(i.w, 0.5), 0.02, 6), d = clamp(numOr(i.d, 0.5), 0.01, 6), h = clamp(numOr(i.h, 0.5), 0.005, 3);
    const color = hexOr(i.color, '#9aa5ab'), given = str(i.name, 60).trim();
    const base = starters[STARTER_PREFIX + i.kind];
    const plain = base ? base.name : SHAPES[i.type].label;
    const resized = base && !(close(base.w, w) && close(base.d, d) && close(base.h, h));
    const name = given || (resized ? `${plain}, ${Math.round(w * 100)} × ${Math.round(d * 100)}` : plain);
    const same = (e) => e.shape === i.type && close(e.w, w) && close(e.d, d) && close(e.h, h) && e.color === color && e.name === name;
    let entry = pool.find((e) => e.id === STARTER_PREFIX + i.kind && same(e)) || pool.find(same);
    if (!entry) {
      entry = normalizeEntry({
        name, category: base ? base.category : SHAPES[i.type].group, shape: i.type, w, d, h, color,
        elev: numOr(i.elev, 0), wall: !!SHAPES[i.type].wall, status: 'owned', notes: 'Brought over from the original 3D planner.',
      });
      pool.push(entry); added.push(entry);
    }
    const it = normalizeItem({ id: str(i.id, 40) || uid(), cat: entry.id, ...entryLook(entry), x: i.x, z: i.z, rot: i.rot, elev: i.elev, mirror: i.mirror, room: i.room });
    if (it) des.items.push(it);
  }
  return { flat, added };
}

/* ------------------------------------------------------------------ CSV */
/** Parse CSV text (quoted fields, commas or semicolons) into rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const CSV_COLUMNS = ['name', 'category', 'shape', 'width_cm', 'depth_cm', 'height_cm', 'off_floor_cm', 'colour', 'status', 'quantity', 'price', 'link', 'notes'];
export const CSV_HEADER = CSV_COLUMNS.join(',');

const SHAPE_WORDS = Object.fromEntries(Object.entries(SHAPES).filter(([, s]) => !s.fitting).flatMap(([k, s]) => [[k.toLowerCase(), k], [s.label.toLowerCase(), k]]));

/** Catalogue entries from CSV rows with a header like CSV_HEADER (any order, extra columns ignored). */
export function entriesFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\(cm\)|cm\b|_cm/g, '').replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').replace(/^color$/, 'colour'));
  const col = (row, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0 && row[i] !== undefined && row[i].trim() !== '') return row[i].trim(); } return ''; };
  const cmv = (v) => { const n = numOr(String(v).replace(',', '.'), null); return n === null ? undefined : n / 100; };
  return rows.slice(1).map((r) => {
    const shapeWord = col(r, 'shape', 'type').toLowerCase();
    const shape = SHAPE_WORDS[shapeWord] || 'box';
    const status = /buy|want|wish/i.test(col(r, 'status')) ? 'buy' : 'owned';
    const price = col(r, 'price', 'cost').replace(/[^0-9.,]/g, '').replace(',', '.');
    let color = col(r, 'colour', 'color');
    if (color && !color.startsWith('#')) color = '#' + color;
    return normalizeEntry({
      name: col(r, 'name', 'item'), category: col(r, 'category', 'group'), shape,
      w: cmv(col(r, 'width', 'w')), d: cmv(col(r, 'depth', 'd')), h: cmv(col(r, 'height', 'h')),
      elev: cmv(col(r, 'off_floor', 'elevation')), color, status, qty: col(r, 'quantity', 'qty') || 1,
      price: price === '' ? null : price, url: col(r, 'link', 'url'), notes: col(r, 'notes'),
    });
  }).filter((e) => e.name);
}

export function entriesToCsv(catalogue) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [CSV_HEADER];
  for (const e of catalogue) {
    lines.push([e.name, e.category, e.shape, Math.round(e.w * 100), Math.round(e.d * 100), Math.round(e.h * 100), Math.round(e.elev * 100), e.color,
      e.status === 'buy' ? 'want to buy' : 'own', e.qty, e.price ?? '', e.url, e.notes].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}
