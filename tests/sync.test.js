import { describe, expect, it } from 'vitest';
import { createSyncEngine, emptyWorkspace, mergeWorkspaces, same } from '../src/core/sync.js';

const flat = (id, name = id) => ({ id, name, design: { items: [] }, underlayImage: 'data:image/png;base64,plan' });
const workspace = (...flats) => ({ ...emptyWorkspace(), flats });
const merge = (base, local, remote) => mergeWorkspaces(base, local, remote);

describe('cloud merge', () => {
  it('keeps independent additions and edits from both browsers, including pictures', () => {
    const base = workspace(flat('a'), flat('b'));
    const result = merge(base, workspace(flat('a', 'My edit'), flat('b')), workspace(flat('a'), flat('b', 'Their edit'), flat('c')));
    expect(result.flats.map((f) => f.name)).toEqual(['My edit', 'Their edit', 'c']);
    expect(result.flats.every((f) => f.underlayImage)).toBe(true);
  });
  it('does not resurrect deleted flats from an unchanged offline browser', () => {
    const base = workspace(flat('a'));
    expect(merge(base, base, workspace()).flats).toEqual([]);
    expect(merge(base, workspace(), base).flats).toEqual([]);
  });
  it('keeps a copy when two browsers edit the same flat', () => {
    const base = workspace(flat('a'));
    const result = merge(base, workspace(flat('a', 'Here')), workspace(flat('a', 'There')));
    expect(result.flats.map((f) => f.name).sort()).toEqual(['Here (copy)', 'There']);
    expect(merge(base, workspace(flat('a', 'Here')), result)).toEqual(result);
  });
  it('keeps an edited copy when the other browser deletes a flat', () => {
    const result = merge(workspace(flat('a')), workspace(flat('a', 'Edited')), workspace());
    expect(result.flats).toHaveLength(1);
    expect(result.flats[0]).toMatchObject({ name: 'Edited (copy)', underlayImage: 'data:image/png;base64,plan' });
    expect(result.flats[0].id).not.toBe('a');
  });
  it('preserves conflicting catalogue entries and the local furniture references', () => {
    const base = { ...workspace(flat('a')), catalogue: [{ id: 'sofa', name: 'Sofa' }] };
    const local = structuredClone(base), remote = structuredClone(base);
    local.catalogue[0].name = 'My sofa'; remote.catalogue[0].name = 'Other sofa';
    local.flats[0].design.items.push({ cat: 'sofa' });
    const result = merge(base, local, remote);
    const copy = result.catalogue.find((e) => e.name === 'My sofa (copy)');
    expect(result.flats[0].design.items[0].cat).toBe(copy.id);
  });
  it('remaps remote furniture when a catalogue deletion conflicts with an edit', () => {
    const base = { ...workspace(flat('a')), catalogue: [{ id: 'sofa', name: 'Sofa' }] };
    const remote = structuredClone(base);
    remote.catalogue[0].name = 'Edited sofa';
    remote.flats[0].design.items.push({ cat: 'sofa' });
    const result = merge(base, { ...base, catalogue: [] }, remote);
    expect(result.flats[0].design.items[0].cat).toBe(result.catalogue[0].id);
  });
  it('merges preferences independently and ignores JSON object key order', () => {
    expect(same({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    const base = { ...workspace(), prefs: { snap: true, swing: true } };
    expect(merge(base, { ...base, prefs: { snap: false, swing: true } }, { ...base, prefs: { snap: true, swing: false } }).prefs)
      .toMatchObject({ snap: false, swing: false });
  });
  it('does not copy the starter catalogue just because creation dates differ', () => {
    const a = { ...workspace(), catalogue: [{ id: 's', name: 'Starter', starter: true, created: 1 }] };
    const b = { ...workspace(), catalogue: [{ ...a.catalogue[0], created: 2 }] };
    expect(merge(emptyWorkspace(), a, b).catalogue).toHaveLength(1);
  });
});

function harness(initial = workspace()) {
  let local = initial, base = emptyWorkspace(), cloud = null;
  const states = [];
  const remote = {
    async read() { return cloud; },
    async save(data, revision) {
      if ((cloud?.revision || 0) !== revision) return false;
      cloud = { data: structuredClone(data), revision: revision + 1 }; return true;
    },
  };
  const engine = createSyncEngine({ readLocal: async () => structuredClone(local), readBase: async () => base,
    writeBase: async (v) => { base = structuredClone(v); }, applyLocal: async (v) => { local = structuredClone(v); }, remote,
    onState: (state) => states.push(state) });
  return { engine, remote, states, get local() { return local; }, set local(v) { local = v; }, get cloud() { return cloud; } };
}

describe('cloud saving', () => {
  it('uploads once and restores the workspace in a second browser', async () => {
    const first = harness(workspace(flat('a'))); await first.engine.sync();
    const second = harness(); second.remote.read = first.remote.read; second.remote.save = first.remote.save;
    await second.engine.sync();
    expect(second.local.flats[0]).toEqual(flat('a'));
    await first.engine.sync(); expect(first.cloud.revision).toBe(1);
    expect(second.states.at(-1)).toBe('saved');
  });
  it('keeps offline edits and retries after reconnecting', async () => {
    const h = harness(workspace(flat('offline'))), save = h.remote.save;
    h.remote.save = async () => { throw new Error('offline'); };
    await h.engine.sync(); expect(h.states.at(-1)).toBe('error');
    expect(h.local.flats[0].id).toBe('offline');
    h.remote.save = save; await h.engine.sync(); expect(h.cloud.data.flats[0].id).toBe('offline');
  });
  it('retries an optimistic lock failure with the new cloud data', async () => {
    const h = harness(workspace(flat('here'))), save = h.remote.save;
    let first = true;
    h.remote.save = async (data, version) => {
      if (first) { first = false; await save(workspace(flat('there')), 0); return false; }
      return save(data, version);
    };
    await h.engine.sync();
    expect(h.cloud.data.flats.map((f) => f.id)).toEqual(['here', 'there']);
  });
  it('keeps edits made while a cloud upload is in flight', async () => {
    const h = harness(workspace(flat('a'))), save = h.remote.save;
    let first = true;
    h.remote.save = async (data, version) => {
      if (first) { first = false; h.local = workspace(flat('a', 'Typed during upload')); }
      return save(data, version);
    };
    await h.engine.sync();
    expect(h.cloud.data.flats[0].name).toBe('Typed during upload');
    expect(h.local.flats).toHaveLength(1);
  });
  it('does not apply an in-flight response after sign-out', async () => {
    const h = harness(workspace(flat('a')));
    let resolve;
    h.remote.read = () => new Promise((r) => { resolve = r; });
    const running = h.engine.sync();
    while (!resolve) await Promise.resolve();
    const stopping = h.engine.stop();
    resolve({ revision: 1, data: workspace(flat('private')) });
    await Promise.all([running, stopping]);
    expect(h.local.flats[0].id).toBe('a');
    expect(h.cloud).toBe(null);
  });
});
