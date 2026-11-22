import { beforeEach, describe, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({ createStore: () => ({}),
  get: async (k) => structuredClone(memory.get(k)),
  set: async (k, v) => { memory.set(k, structuredClone(v)); },
  del: async (k) => { memory.delete(k); },
}));
let store;
beforeEach(async () => { vi.resetModules(); memory.clear(); store = await import('../src/store.js'); await store.loadAll(); });
describe('account copies', () => {
  it('migrates existing flats and floorplans to the first account', async () => {
    store.db.flats.push({ id: 'guest', name: 'Existing flat', rooms: [] });
    await store.setPicture(store.planKey('guest'), 'data:image/png;base64,plan');
    await store.setAccount('alice');
    expect(store.db.flats[0].name).toBe('Existing flat');
    expect((await store.workspaceSnapshot()).flats[0].underlayImage).toBe('data:image/png;base64,plan');
    expect(memory.get('account:alice:flats')[0].id).toBe('guest');
  });
  it('isolates accounts and never migrates the guest flats to a second account', async () => {
    store.db.flats.push({ id: 'guest', rooms: [] }); await store.setAccount('alice');
    store.db.flats[0].name = 'Alice private';
    await store.setAccount('bob'); expect(store.db.flats).toEqual([]);
    await store.setAccount(''); expect(store.db.flats[0].name).not.toBe('Alice private');
    await store.setAccount('bob'); expect(store.db.flats).toEqual([]);
    await store.setAccount('alice'); expect(store.db.flats[0].name).toBe('Alice private');
  });
  it('persists pending edits and merge baselines across sessions', async () => {
    await store.setAccount('alice');
    store.db.flats.push({ id: 'a', name: 'Offline edit', rooms: [] });
    await store.writeSyncBase({ format: 1, flats: [], catalogue: [], prefs: {} });
    await store.flushAll();
    vi.resetModules(); store = await import('../src/store.js'); await store.loadAll();
    await store.setAccount('alice');
    expect(store.db.flats[0].name).toBe('Offline edit');
    expect((await store.readSyncBase()).flats).toEqual([]);
  });
  it('keeps each live tab’s merge baseline independent', async () => {
    await store.setAccount('alice');
    const before = await store.readSyncBase();
    vi.resetModules();
    const another = await import('../src/store.js');
    await another.loadAll(); await another.setAccount('alice');
    await another.writeSyncBase({ ...before, flats: [{ id: 'remote' }] });
    expect(await store.readSyncBase()).toEqual(before);
  });
  it('starts saving edits without waiting for a timer', async () => {
    store.db.flats.push({ id: 'quick', rooms: [] });
    const saved = store.saveFlats();
    expect(memory.get('flats')[0].id).toBe('quick');
    await saved;
  });
  it('updates images from the cloud without echoing local change events', async () => {
    const change = vi.fn(); store.onLocalChange(change);
    await store.replaceWorkspace({ format: 1, flats: [{ id: 'a', rooms: [], underlayImage: 'data:image/png;base64,cloud' }], catalogue: [], prefs: {} });
    expect(await store.getPicture('plan:a')).toBe('data:image/png;base64,cloud');
    expect(change).not.toHaveBeenCalled();
    await store.replaceWorkspace({ format: 1, flats: [], catalogue: [], prefs: {} });
    expect(memory.has('plan:a')).toBe(false);
  });
});
