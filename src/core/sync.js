/* Three-way merging for cloud saving. A browser remembers its last cloud copy, so
   an unchanged old tab cannot put back a flat another device deleted. */
export const DEFAULT_PREFS = { swing: true, measure: true, snap: true, currency: '£' };
export const emptyWorkspace = () => ({ format: 1, flats: [], catalogue: [], prefs: { ...DEFAULT_PREFS } });

export function stableJson(value) {
  return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
}
export const same = (a, b) => stableJson(a) === stableJson(b);

function copyId(record) {
  // Stable across retries, including when two devices discover the same conflict.
  let hash = 14695981039346656037n;
  for (const c of stableJson(record)) hash = BigInt.asUintN(64, (hash ^ BigInt(c.codePointAt(0))) * 1099511628211n);
  return `${record.id.slice(0, 16)}-copy-${hash.toString(36)}`;
}
const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));
const changed = (record, base) => {
  // Starter catalogue timestamps differ on every fresh browser.
  const comparable = (r) => r?.starter ? { ...r, created: 0 } : r;
  return !same(comparable(record), comparable(base));
};

function mergeRows(base, local, remote, remap = new Map(), remoteRemap = new Map()) {
  const b = byId(base), l = byId(local), r = byId(remote), result = new Map(), copies = [];
  for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const before = b.get(id), here = l.get(id), there = r.get(id);
    if (!changed(here, before)) { if (there) result.set(id, there); }
    else if (!changed(there, before) || !changed(here, there)) { if (here) result.set(id, here); }
    else {
      // Both edited, or one deleted while the other edited. Keep the deletion and
      // put the other edit in a copy, rather than silently losing either decision.
      if (here && there) result.set(id, there);
      const keep = here || there, newId = copyId(keep);
      const copy = { ...keep, id: newId, name: `${keep.name.slice(0, 65)} (copy)` };
      copies.push(copy);
      if (here) remap.set(id, newId); else remoteRemap.set(id, newId);
    }
  }
  for (const copy of copies) result.set(copy.id, copy);
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeWorkspaces(base, local, remote) {
  const remap = new Map(), remoteRemap = new Map();
  const catalogue = mergeRows(base.catalogue, local.catalogue, remote.catalogue, remap, remoteRemap);
  const remapItems = (flats, ids) => flats.map((f) => ({ ...f, design: f.design ? { ...f.design,
    items: f.design.items.map((i) => ids.has(i.cat) ? { ...i, cat: ids.get(i.cat) } : i),
  } : undefined }));
  const flatsHere = remapItems(local.flats, remap), flatsThere = remapItems(remote.flats, remoteRemap);
  const prefs = { ...DEFAULT_PREFS, ...remote.prefs };
  for (const key of new Set([...Object.keys(base.prefs), ...Object.keys(local.prefs)])) {
    if (!same(base.prefs[key], local.prefs[key])) {
      if (key in local.prefs) prefs[key] = local.prefs[key]; else delete prefs[key];
    }
  }
  return { format: 1, flats: mergeRows(base.flats, flatsHere, flatsThere), catalogue, prefs };
}

/** Transport and storage are passed in so races and offline recovery can be tested. */
export function createSyncEngine({ readLocal, readBase, writeBase, applyLocal, remote, canApply = () => true, onState = () => {} }) {
  let running = null, stopped = false, again = false;
  async function run() {
    onState('saving');
    try {
      // A compare-and-swap failure means another browser just saved. Read again
      // and merge, rather than overwriting its changes with our old snapshot.
      for (let tries = 0; tries < 8 && !stopped; tries++) {
        const base = await readBase() || emptyWorkspace();
        const local = await readLocal();
        const cloud = await remote.read();
        if (stopped) return;
        const merged = mergeWorkspaces(base, local, cloud?.data || emptyWorkspace());
        if (!canApply()) { onState('pending'); return; }
        if (!same(local, await readLocal())) continue;
        if (!same(merged, cloud?.data) && !await remote.save(merged, cloud?.revision || 0)) continue;
        if (stopped) return;
        // An edit made during the upload belongs on top of the acknowledged copy.
        const latest = await readLocal();
        const next = mergeWorkspaces(local, latest, merged);
        if (!canApply()) { onState('pending'); return; }
        if (!same(latest, next)) await applyLocal(next);
        await writeBase(merged);
        if (!same(merged, await readLocal())) { again = true; continue; }
        onState('saved');
        return;
      }
      if (!stopped) onState('pending');
    } catch (error) { if (!stopped) onState('error', error); }
  }
  return {
    sync() {
      if (stopped) return Promise.resolve();
      if (running) { again = true; return running; }
      running = (async () => {
        do { again = false; await run(); } while (again && !stopped);
      })().finally(() => { running = null; });
      return running;
    },
    async stop() { stopped = true; await running; },
  };
}
