import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNearbyHospitals } from '../src/api/nearbyHospitals.js';

const centre = { lat: 12.97, lng: 77.59 };
const hospitalData = { elements: [
  { id: 2, center: { lat: 12.99, lon: 77.59 }, tags: { name: 'Far hospital', amenity: 'hospital' } },
  { id: 1, lat: 12.971, lon: 77.59, tags: { name: 'Near clinic', amenity: 'clinic', 'addr:street': 'Care Road', 'contact:phone': '123', emergency: 'yes' } },
] };

test('failed primary provider falls back and parses real OSM hospital fields in distance order', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, ...options });
    return requests.length === 1 ? new Response('', { status: 406 }) : Response.json(hospitalData);
  });
  const hospitals = await fetchNearbyHospitals(centre, 5);
  assert.deepEqual(hospitals.map(h => h.name), ['Near clinic', 'Far hospital']);
  assert.deepEqual(hospitals.map(h => h.place_id), ['1', '2']);
  assert.equal(hospitals[0].address, 'Care Road');
  assert.equal(hospitals[0].phone, '123');
  assert.equal(hospitals[0].emergency, true);
  assert.equal(hospitals[0].isHospital, false);
  assert.equal(hospitals[1].isHospital, true);
  assert.equal(hospitals[0].rating, null);
  assert.ok(hospitals[0].distKm > 0 && hospitals[0].distKm < 0.12);
  assert.notEqual(requests[0].url, requests[1].url);
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.ok(request.body.includes('around:5000,12.97,77.59'));
  }
});

test('all providers failing rejects instead of showing fabricated or empty results', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response('', { status: 503 });
  });
  await assert.rejects(fetchNearbyHospitals(centre, 5));
  assert.ok(urls.length >= 2 && urls.length <= 3);
  assert.equal(new Set(urls).size, urls.length);
});

test('a stalled provider is aborted within the lookup budget and the next provider can succeed', async (t) => {
  const budgets = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    budgets.push(ms);
    const controller = new AbortController();
    queueMicrotask(() => controller.abort(new DOMException('Timed out', 'TimeoutError')));
    return controller.signal;
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    if (++calls > 1) return Response.json(hospitalData);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const hospitals = await fetchNearbyHospitals(centre, 5);
  assert.equal(hospitals[0].name, 'Near clinic');
  assert.ok(budgets.every(ms => ms > 0 && ms <= 10000));
  assert.ok(budgets.reduce((sum, ms) => sum + ms, 0) <= 20000);
});

test('an invalid successful response fails over but a valid empty result does not', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json(++calls === 1 ? { remark: 'runtime error' } : hospitalData));
  assert.equal((await fetchNearbyHospitals(centre, 5)).length, 2);
  calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ elements: [] }); });
  assert.deepEqual(await fetchNearbyHospitals(centre, 5), []);
  assert.equal(calls, 1);
});
