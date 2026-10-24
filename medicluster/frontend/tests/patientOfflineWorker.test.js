import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function worker() {
  const events = {};
  const stored = new Map();
  const origin = 'https://medicluster.example';
  let offline = false;
  const context = { URL, Response, self: { location: { origin }, addEventListener: (name, handler) => { events[name] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ put: async (key, value) => stored.set(typeof key === 'string' ? key : key.url, value) }), match: async key => stored.get(typeof key === 'string' ? key : key.url), keys: async () => [], delete: async () => true },
    fetch: async request => {
      if (offline) throw new TypeError('offline');
      const url = typeof request === 'string' ? request : request.url || request.href;
      return url.endsWith('/app') ? new Response('<script src="/assets/patient-123.js"></script>', { headers: { 'content-type': 'text/html' } }) : new Response('public asset');
    },
  };
  vm.runInNewContext(await fs.readFile(new URL('../public/patient-sw.js', import.meta.url), 'utf8'), context);
  return { events, stored, setOffline: value => { offline = value; }, request(path, extra = {}) {
    let response;
    events.fetch({ request: { url: origin + path, method: 'GET', headers: new Headers(), ...extra }, respondWith: value => { response = value; } });
    return response;
  } };
}

test('public shell and its assets reload offline without caching authenticated endpoints or callbacks', async () => {
  const sw = await worker();
  let installed;
  sw.events.install({ waitUntil: promise => { installed = promise; } });
  await installed;
  assert.ok(sw.stored.has('/app'));
  assert.ok(sw.stored.has('https://medicluster.example/assets/patient-123.js'));
  assert.equal(sw.request('/api/patient-app/alice/documents'), undefined);
  assert.equal(sw.request('/assets/secret.js', { headers: new Headers({ authorization: 'Bearer secret' }) }), undefined);
  const size = sw.stored.size;
  await sw.request('/app?patient_auth_code=secret', { mode: 'navigate' });
  assert.equal(sw.stored.size, size);
  sw.setOffline(true);
  assert.match(await (await sw.request('/app/health', { mode: 'navigate' })).text(), /patient-123.js/);
  assert.equal(await (await sw.request('/assets/patient-123.js')).text(), 'public asset');
});

test('loaded lazy patient assets are warmed but API, foreign, and callback URLs are rejected', async () => {
  const sw = await worker();
  let warmed;
  sw.events.message({ data: { type: 'PATIENT_CACHE_ASSETS', urls: ['https://medicluster.example/assets/PatientApp-lazy.js', 'https://medicluster.example/assets/PatientApp-lazy.css', 'https://medicluster.example/api/patient-app/alice/documents', 'https://foreign.example/assets/private.js', 'https://medicluster.example/assets/private.js?token=secret'] }, waitUntil: promise => { warmed = promise; } });
  await warmed;
  assert.equal(sw.stored.size, 2);
  sw.setOffline(true);
  assert.equal(await (await sw.request('/assets/PatientApp-lazy.js')).text(), 'public asset');
});
