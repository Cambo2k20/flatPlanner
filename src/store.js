/* Everything is kept in this browser, in IndexedDB: your flats, your catalogue and a
   few settings. Pictures (flat thumbnails and floorplan images) are stored under their
   own keys so the flats themselves stay small. Nothing is sent anywhere. */
import { createStore, del, get, set } from 'idb-keyval';
import { normalizeEntry, starterCatalogue } from './core/catalogue.js';
import { normalizeFlat } from './core/flat-model.js';
import { debounce } from './core/util.js';

let kv = null;
let usable = true;

/** localStorage stand-in, for browsers where IndexedDB is switched off. */
const local = {
  get: async (k) => { const v = localStorage.getItem('fp:' + k); return v === null ? undefined : JSON.parse(v); },
  set: async (k, v) => { localStorage.setItem('fp:' + k, JSON.stringify(v)); },
  del: async (k) => { localStorage.removeItem('fp:' + k); },
};
let backend = null;

async function pickBackend() {
  try {
    kv = createStore('flat-planner', 'kv');
    await set('probe', 1, kv);
    backend = { get: (k) => get(k, kv), set: (k, v) => set(k, v, kv), del: (k) => del(k, kv) };
  } catch {
    try { localStorage.setItem('fp:probe', '1'); backend = local; } catch { usable = false; backend = null; }
  }
}

export const db = {
  flats: [],
  catalogue: [],
  prefs: { swing: true, measure: true, snap: true, currency: '£' },
};
export const storageWorks = () => usable;

const listeners = new Set();
export const onSaveError = (fn) => listeners.add(fn);
const failed = (e) => { console.error(e); for (const fn of listeners) fn(e); };

export async function loadAll() {
  await pickBackend();
  if (!backend) { db.catalogue = starterCatalogue(); return; }
  try {
    const [flats, catalogue, prefs] = await Promise.all([backend.get('flats'), backend.get('catalogue'), backend.get('prefs')]);
    db.flats = Array.isArray(flats) ? flats.map(normalizeFlat) : [];
    db.catalogue = Array.isArray(catalogue) ? catalogue.map(normalizeEntry) : starterCatalogue();
    if (prefs && typeof prefs === 'object') db.prefs = { ...db.prefs, ...prefs };
    if (!Array.isArray(catalogue)) await backend.set('catalogue', db.catalogue);
  } catch (e) { failed(e); db.catalogue = db.catalogue.length ? db.catalogue : starterCatalogue(); }
}

const write = (key, val) => (backend ? backend.set(key, val).catch(failed) : Promise.resolve());
export const saveFlats = debounce(() => write('flats', db.flats), 300);
export const saveCatalogue = debounce(() => write('catalogue', db.catalogue), 300);
export const savePrefs = debounce(() => write('prefs', db.prefs), 300);
export function flushAll() { saveFlats.flush(); saveCatalogue.flush(); savePrefs.flush(); }

export const getPicture = async (key) => (backend ? backend.get(key).catch(() => undefined) : undefined);
export const setPicture = (key, dataUrl) => write(key, dataUrl);
export const deletePicture = (key) => (backend ? backend.del(key).catch(() => {}) : Promise.resolve());
export const thumbKey = (flatId) => 'thumb:' + flatId;
export const planKey = (flatId) => 'plan:' + flatId;

let persistAsked = false;
/** Ask the browser not to clear this site's storage when space runs low. */
export function askToPersist() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then((p) => (p ? null : navigator.storage.persist())).catch(() => {});
}

export const findFlat = (id) => db.flats.find((f) => f.id === id) || null;
export const findEntry = (id) => db.catalogue.find((e) => e.id === id) || null;

export function addFlat(flat) { db.flats.push(flat); saveFlats(); askToPersist(); return flat; }
export function removeFlat(id) {
  db.flats = db.flats.filter((f) => f.id !== id);
  saveFlats();
  deletePicture(thumbKey(id));
  deletePicture(planKey(id));
}

/** How often each catalogue item is placed, across all flats. */
export function usageCounts() {
  const m = new Map();
  for (const f of db.flats) for (const it of f.design.items) m.set(it.cat, (m.get(it.cat) || 0) + 1);
  return m;
}
