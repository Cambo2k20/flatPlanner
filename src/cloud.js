/* Optional account saving. Only the project's public browser key belongs here;
   access to each workspace is enforced by the database's row policies. */
import { createClient } from '@supabase/supabase-js';
import { createSyncEngine } from './core/sync.js';
import { onLocalChange, readSyncBase, replaceWorkspace, setAccount, workspaceSnapshot, writeSyncBase } from './store.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const client = url && publicKey ? createClient(url, publicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'flat-planner-auth' },
}) : null;

export function workspaceRemote(client, userId) {
  return {
    async read() {
      const { data, error } = await client.from('planner_workspaces').select('data, revision').eq('user_id', userId).abortSignal(AbortSignal.timeout(12000)).retry(false).maybeSingle();
      if (error) throw error;
      if (data && (data.data?.format !== 1 || !Array.isArray(data.data.flats) || !Array.isArray(data.data.catalogue) || !data.data.prefs)) throw new Error('Unknown cloud file format');
      return data;
    },
    async save(data, revision) {
      const table = client.from('planner_workspaces');
      const query = revision
        ? table.update({ data, revision: revision + 1, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('revision', revision)
        : table.insert({ user_id: userId, data, revision: 1 });
      const result = await query.select('revision').abortSignal(AbortSignal.timeout(12000)).maybeSingle();
      if (result.error?.code === '23505') return false;
      if (result.error) throw result.error;
      return !!result.data;
    },
  };
}

const listeners = new Set();
let state = { configured: !!client, user: null, phase: client ? 'loading' : 'unconfigured' };
let engine, timer, transitions = Promise.resolve();
const update = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };
const canApply = () => !document.querySelector('#dlg[open]') && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') && !document.querySelector('canvas:active');

function transition(user) {
  transitions = transitions.catch(() => {}).then(async () => {
    if (state.phase !== 'loading' && (user?.id || '') === (state.user?.id || '')) return;
    update({ phase: 'loading' });
    clearTimeout(timer);
    await engine?.stop(); engine = null;
    await setAccount(user?.id || '');
    update({ user, phase: user ? 'pending' : 'signed-out' });
    if (user) {
      engine = createSyncEngine({ readLocal: workspaceSnapshot, readBase: readSyncBase, writeBase: writeSyncBase,
        applyLocal: replaceWorkspace, remote: workspaceRemote(client, user.id), canApply,
        onState: (phase) => update({ phase }),
      });
      engine.sync();
    }
  }).catch((error) => { console.error('Account could not open', error); update({ phase: 'error' }); });
  return transitions;
}

export const cloud = {
  get state() { return state; },
  subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
  async init() {
    if (!client) return;
    // Supabase callbacks must return before making further auth/database calls.
    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => transition(session?.user || null), 0); });
    const { data, error } = await client.auth.getSession();
    if (error) { update({ phase: 'error' }); return; }
    await transition(data.session?.user || null);
    onLocalChange(() => {
      if (!engine) return;
      update({ phase: 'pending' }); clearTimeout(timer);
      timer = setTimeout(() => engine?.sync(), 750);
    });
    const refresh = () => { if (!document.hidden) engine?.sync(); };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    setInterval(refresh, 20000);
  },
  async sendCode(email) {
    if (!client) throw new Error('Cloud saving is not available');
    const { error } = await client.auth.signInWithOtp({ email });
    if (error) throw error;
  },
  async verifyCode(email, token) {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  },
  async syncNow() { clearTimeout(timer); return engine?.sync(); },
  async signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await transition(null);
  },
};
