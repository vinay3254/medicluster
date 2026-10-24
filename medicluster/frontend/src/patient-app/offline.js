/** Patient-owned data stays in IndexedDB, never in the service worker cache. */
const DATABASE = 'medicluster-patient-offline-v1';
const STORE = 'accounts';
const listeners = new Set();
const generations = new Map();
const flushing = new Map();
let database;

function session(patientId) {
  try {
    const raw = localStorage.getItem('medicluster.patientId');
    let currentId;
    try { currentId = JSON.parse(raw); } catch { currentId = raw; }
    const token = localStorage.getItem('medicluster.patientToken');
    if (!patientId || String(currentId) !== String(patientId) || !token) return null;
    const parts = token.split('.');
    if (parts.length === 3) {
      let claims;
      try { claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
      if (claims.exp != null && Number(claims.exp) * 1000 <= Date.now()) return null;
      if (claims.kind === 'patient' && String(claims.sub) !== String(patientId)) return null;
    }
    return token;
  } catch { return null; }
}

function notify() { for (const listener of listeners) listener(); }
export function subscribePatientOffline(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Offline storage is unavailable in this browser.'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'patientId' });
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

async function accountTransaction(patientId, mode, update) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = store.get(String(patientId));
    let result;
    request.onsuccess = () => {
      const account = request.result || { patientId: String(patientId), snapshot: null, mutations: [] };
      try { result = update(account, store); } catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Could not save offline data.'));
    tx.onabort = () => reject(tx.error || new Error('Offline data update was cancelled.'));
  });
}

function requireSession(patientId) {
  const token = session(patientId);
  if (!token) throw new Error('Sign in to this patient account before saving offline data.');
  return token;
}

export async function readPatientSnapshot(patientId) {
  const token = session(patientId);
  if (!token) return null;
  const snapshot = await accountTransaction(patientId, 'readonly', account => account.snapshot);
  return session(patientId) === token ? snapshot : null;
}

/** Partial snapshot updates merge sections; each section can expose its own savedAt if needed. */
export async function savePatientSnapshot(patientId, patch) {
  const token = requireSession(patientId);
  const generation = generations.get(String(patientId));
  const result = await accountTransaction(patientId, 'readwrite', (account, store) => {
    if (session(patientId) !== token || generations.get(String(patientId)) !== generation) return null;
    const previous = account.snapshot || {};
    const allowed = Object.fromEntries(['profile', 'reminders', 'readings'].filter(key => key in patch).map(key => [key, patch[key]]));
    account.snapshot = { ...previous, ...allowed, patientId: String(patientId), savedAt: Date.now(), sections: { ...previous.sections, ...patch.sections } };
    store.put(account);
    return account.snapshot;
  });
  notify();
  return result;
}

/** May run after credentials have been removed; invalidates already-started writes too. */
export async function clearPatientOffline(patientId) {
  const id = String(patientId);
  generations.set(id, (generations.get(id) || 0) + 1);
  await accountTransaction(id, 'readwrite', (_, store) => store.delete(id));
  notify();
}

export async function enqueuePatientMutation(patientId, type, payload) {
  if (!['reading', 'dose'].includes(type)) throw new Error('This action is not available offline.');
  const token = requireSession(patientId);
  const generation = generations.get(String(patientId));
  const mutation = { id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), patientId: String(patientId), type, payload, createdAt: Date.now(), state: 'pending' };
  await accountTransaction(patientId, 'readwrite', (account, store) => {
    if (session(patientId) !== token || generations.get(String(patientId)) !== generation) throw new Error('Patient account changed. Please try again.');
    account.mutations.push(mutation);
    store.put(account);
  });
  notify();
  return mutation;
}

export async function readPatientOfflineStatus(patientId) {
  const token = session(patientId);
  const empty = { offline: globalThis.navigator?.onLine === false, pending: 0, failed: 0, savedAt: null, ageMs: null, error: '', blocked: token ? null : 'auth' };
  if (!token) return empty;
  const account = await accountTransaction(patientId, 'readonly', value => value);
  if (session(patientId) !== token) return { ...empty, blocked: 'auth' };
  const savedAt = account.snapshot?.savedAt || null;
  return { ...empty, savedAt, ageMs: savedAt ? Date.now() - savedAt : null,
    pending: account.mutations.filter(item => item.state !== 'failed').length,
    failed: account.mutations.filter(item => item.state === 'failed').length,
    error: account.mutations.find(item => item.error)?.error || '',
    blocked: account.mutations.some(item => item.state === 'auth') ? 'auth' : null };
}

async function fingerprint(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Callbacks must forward idempotencyKey to the server. Results are actual server responses. */
export async function flushPatientMutations(patientId, callbacks) {
  const id = String(patientId);
  if (flushing.has(id)) return flushing.get(id);
  const run = async () => {
    const completed = [];
    const token = session(id);
    let blocked = token ? null : 'auth';
    let error = '';
    const generation = generations.get(id);
    const current = () => session(id) === token && generations.get(id) === generation;
    if (token && globalThis.navigator?.onLine !== false) {
      const authFingerprint = await fingerprint(token);
      const mutations = await accountTransaction(id, 'readonly', account => account.mutations);
      for (const mutation of mutations) {
        if (!current()) { blocked = 'auth'; break; }
        if (mutation.state === 'failed') continue;
        if (mutation.state === 'auth' && mutation.authFingerprint === authFingerprint) { blocked = 'auth'; error = mutation.error; break; }
        if (typeof callbacks[mutation.type] !== 'function') continue;
        let outcome;
        try {
          const result = await callbacks[mutation.type](mutation.payload, { idempotencyKey: mutation.idempotencyKey });
          if (!current()) { blocked = 'auth'; break; }
          outcome = { success: true, result };
        } catch (failure) {
          if (!current()) { blocked = 'auth'; break; }
          const status = Number(failure?.response?.status || failure?.status || 0);
          error = failure?.response?.data?.error || failure?.message || 'Could not sync this change.';
          const state = status === 401 ? 'auth' : status >= 400 && status < 500 && status !== 408 && status !== 429 ? 'failed' : 'pending';
          outcome = { state, error, authFingerprint: state === 'auth' ? authFingerprint : null };
          if (state === 'auth') blocked = 'auth';
        }
        await accountTransaction(id, 'readwrite', (account, store) => {
          if (!current()) return;
          account.mutations = outcome.success ? account.mutations.filter(item => item.id !== mutation.id) : account.mutations.map(item => item.id === mutation.id ? { ...item, ...outcome } : item);
          store.put(account);
        });
        if (!current()) { blocked = 'auth'; break; }
        if (outcome.success) completed.push({ mutation, result: outcome.result });
        notify();
        if (!outcome.success && outcome.state !== 'failed') break;
      }
    }
    const status = await readPatientOfflineStatus(id);
    return { completed: current() ? completed : [], pending: status.pending, failed: status.failed, blocked, error };
  };
  const work = (globalThis.navigator?.locks ? navigator.locks.request(`patient-offline:${id}`, run) : run()).finally(() => flushing.delete(id));
  flushing.set(id, work);
  return work;
}

/** Development must retain Vite's live module updates. Cache contains public shell/assets only. */
export async function registerPatientServiceWorker() {
  if (!import.meta.env?.PROD || !globalThis.navigator?.serviceWorker) return null;
  const registration = await navigator.serviceWorker.register('/patient-sw.js', { scope: '/app' });
  const ready = await navigator.serviceWorker.ready;
  const urls = globalThis.performance?.getEntriesByType('resource').map(entry => entry.name).filter(value => {
    try { const url = new URL(value); return url.origin === location.origin && url.pathname.startsWith('/assets/') && !url.search && !url.hash; } catch { return false; }
  }) || [];
  ready.active?.postMessage({ type: 'PATIENT_CACHE_ASSETS', urls });
  return registration;
}
