/* Local copies live in IndexedDB, separately for each signed-in account. Cloud
   saving builds on these copies, so editing and backups also work offline. */
import { createStore, del, get, set } from 'idb-keyval';
import { normalizeEntry, starterCatalogue } from './core/catalogue.js';
import { normalizeFlat } from './core/flat-model.js';
import { DEFAULT_PREFS, emptyWorkspace, mergeWorkspaces } from './core/sync.js';

let backend, scope = '', usable = true;
let pictures = new Map(), syncBase = null;
const local = {
  get: async (k) => { const v = localStorage.getItem('fp:' + k); return v === null ? undefined : JSON.parse(v); },
  set: async (k, v) => { localStorage.setItem('fp:' + k, JSON.stringify(v)); },
  del: async (k) => { localStorage.removeItem('fp:' + k); },
};
async function pickBackend() {
  try {
    const kv = createStore('flat-planner', 'kv');
    await set('probe', 1, kv);
    backend = { get: (k) => get(k, kv), set: (k, v) => set(k, v, kv), del: (k) => del(k, kv) };
  } catch {
    try { localStorage.setItem('fp:probe', '1'); backend = local; }
    catch {
      usable = false;
      const memory = new Map();
      backend = { get: async (k) => memory.get(k), set: async (k, v) => { memory.set(k, structuredClone(v)); }, del: async (k) => { memory.delete(k); } };
    }
  }
}
const key = (k) => scope ? `account:${scope}:${k}` : k;
export const db = { flats: [], catalogue: [], prefs: { ...DEFAULT_PREFS } };
export const storageWorks = () => usable;
const errors = new Set(), changes = new Set(), replacements = new Set();
export const onSaveError = (fn) => errors.add(fn);
export const onLocalChange = (fn) => { changes.add(fn); return () => changes.delete(fn); };
export const onWorkspaceChange = (fn) => replacements.add(fn);
const failed = (error) => { console.error(error); for (const fn of errors) fn(error); };
const changed = () => { for (const fn of changes) fn(); };

async function loadScope() {
  const [flats, catalogue, prefs, base] = await Promise.all(['flats', 'catalogue', 'prefs', 'sync-base'].map((k) => backend.get(key(k))));
  syncBase = base || null;
  db.flats = Array.isArray(flats) ? flats.map(normalizeFlat) : [];
  db.catalogue = Array.isArray(catalogue) ? catalogue.map(normalizeEntry) : scope ? [] : starterCatalogue();
  db.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
  pictures = new Map();
  await Promise.all(db.flats.flatMap((f) => [planKey(f.id), thumbKey(f.id)]).map(async (k) => {
    const image = await backend.get(key(k)); if (image) pictures.set(k, image);
  }));
}
export async function loadAll() {
  await pickBackend();
  try { await loadScope(); } catch (e) { failed(e); db.catalogue = starterCatalogue(); }
}

function saved(keyName, value) {
  const promise = backend.set(key(keyName), structuredClone(value));
  changed();
  return promise.catch(failed);
}
// Start the local transaction at the edit, not during pagehide: Safari may
// close a page before a delayed save has a chance to open IndexedDB.
const save = (name) => {
  const fn = () => saved(name, db[name]);
  fn.flush = fn;
  return fn;
};
export const saveFlats = save('flats');
export const saveCatalogue = save('catalogue');
export const savePrefs = save('prefs');
export async function flushAll() { await Promise.all([saveFlats.flush(), saveCatalogue.flush(), savePrefs.flush()]); }
export const getPicture = async (k) => pictures.get(k);
export function setPicture(k, image) {
  pictures.set(k, image);
  return k.startsWith('plan:') ? saved(k, image) : backend.set(key(k), image).catch(failed);
}
export function deletePicture(k) {
  pictures.delete(k);
  const promise = backend.del(key(k)).catch(failed);
  if (k.startsWith('plan:')) changed();
  return promise;
}
export const thumbKey = (flatId) => 'thumb:' + flatId;
export const planKey = (flatId) => 'plan:' + flatId;

export async function workspaceSnapshot() {
  return { format: 1,
    flats: db.flats.map((f) => ({ ...structuredClone(f), ...(pictures.has(planKey(f.id)) ? { underlayImage: pictures.get(planKey(f.id)) } : {}) })),
    catalogue: structuredClone(db.catalogue), prefs: structuredClone(db.prefs),
  };
}
// Keep this tab's baseline in memory. Another tab updating its cache must not
// turn an unseen remote addition into an apparent local deletion here.
export const readSyncBase = async () => structuredClone(syncBase);
export const writeSyncBase = (data) => {
  syncBase = structuredClone(data);
  return backend.set(key('sync-base'), syncBase);
};

/** Apply cloud data without emitting local-edit events or losing floorplan images. */
export async function replaceWorkspace(data) {
  const oldIds = db.flats.map((f) => f.id);
  db.flats = data.flats.map(normalizeFlat);
  db.catalogue = data.catalogue.map(normalizeEntry);
  db.prefs = { ...DEFAULT_PREFS, ...data.prefs };
  const writes = [];
  for (const id of new Set([...oldIds, ...db.flats.map((f) => f.id)])) {
    const image = data.flats.find((f) => f.id === id)?.underlayImage, k = planKey(id);
    if (image) { pictures.set(k, image); writes.push(backend.set(key(k), image)); }
    else { pictures.delete(k); writes.push(backend.del(key(k))); }
    if (!db.flats.some((f) => f.id === id)) { pictures.delete(thumbKey(id)); writes.push(backend.del(key(thumbKey(id)))); }
  }
  writes.push(...Object.entries(db).map(([k, v]) => backend.set(key(k), structuredClone(v))));
  for (const fn of replacements) fn();
  await Promise.all(writes);
}

/** Guest data is claimed once, by the first account to sign in on this browser. */
export async function setAccount(userId = '') {
  if (scope === userId) return;
  await flushAll();
  const guest = !scope && userId && !await backend.get('guest-claimed') ? await workspaceSnapshot() : null;
  scope = userId;
  await loadScope();
  if (userId && !await readSyncBase()) await writeSyncBase({ ...emptyWorkspace(), prefs: { ...DEFAULT_PREFS } });
  if (guest) {
    await replaceWorkspace(mergeWorkspaces(emptyWorkspace(), guest, await workspaceSnapshot()));
    await backend.set('guest-claimed', userId);
  } else for (const fn of replacements) fn();
}

let persistAsked = false;
export function askToPersist() {
  if (persistAsked || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then((p) => p ? null : navigator.storage.persist()).catch(() => {});
}
export const findFlat = (id) => db.flats.find((f) => f.id === id) || null;
export const findEntry = (id) => db.catalogue.find((e) => e.id === id) || null;
export function addFlat(flat) { db.flats.push(flat); saveFlats(); askToPersist(); return flat; }
export function removeFlat(id) {
  db.flats = db.flats.filter((f) => f.id !== id);
  saveFlats(); deletePicture(thumbKey(id)); deletePicture(planKey(id));
}
export function usageCounts() {
  const counts = new Map();
  for (const f of db.flats) for (const it of f.design.items) counts.set(it.cat, (counts.get(it.cat) || 0) + 1);
  return counts;
}
