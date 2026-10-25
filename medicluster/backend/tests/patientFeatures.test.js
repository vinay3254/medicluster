const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTestDatabase } = require('./helpers/supabaseTestDb');
const { signPatientToken, signToken } = require('../middleware/auth');
const storage = require('../services/mediaStorage');

test('patient features preserve ownership and request lifecycles', async t => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'patient-feature-fixture-secret-long-enough';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  await createTestDatabase(t);
  const app = express(); app.use(express.json());
  app.use('/api/patient-app', require('../routes/patientFeatureRoutes'));
  app.use('/api/patient-app', require('../routes/patientAppRoutes'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}/api/patient-app`;
  const token = signPatientToken('P1');
  async function call(path, method = 'GET', body, auth = token, headers = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(origin + path, { method, headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(!multipart && body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
    return { status: response.status, body: (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text(), headers: response.headers };
  }
  await t.test('authentication and patient ownership apply before any collection access', async () => {
    for (const route of ['appointments', 'documents', 'emergencies']) {
      assert.equal((await call(`/P1/${route}`, 'GET', undefined, null)).status, 401);
      assert.equal((await call(`/P2/${route}`)).status, 403);
    }
  });
  let appointment;
  await t.test('requests validate future time and clinician-only confirmation', async () => {
    const input = { at: new Date(Date.now() + 86400000).toISOString(), doctor: 'Clinic doctor', department: 'General', location: 'Clinic', reason: 'Review' };
    assert.equal((await call('/P1/appointments', 'POST', { ...input, at: '2000-01-01' })).status, 400);
    const created = await call('/P1/appointments', 'POST', input);
    assert.equal(created.status, 201); assert.equal(created.body.status, 'REQUESTED'); appointment = created.body;
    assert.equal((await call(`/P1/appointments/${appointment._id}`, 'PATCH', { status: 'CONFIRMED' })).status, 403);
    assert.equal((await call(`/P1/appointments/${appointment._id}`, 'PATCH', { status: 'CONFIRMED' }, signToken({ _id: 'clinician' }))).body.status, 'CONFIRMED');
    assert.equal((await call(`/P1/appointments/${appointment._id}`, 'PATCH', { at: new Date(Date.now() + 172800000).toISOString() })).body.status, 'REQUESTED');
    assert.equal((await call(`/P2/appointments/${appointment._id}`, 'PATCH', { status: 'CANCELLED' }, signPatientToken('P2'))).status, 404);
    assert.equal((await call(`/P1/appointments/${appointment._id}`, 'PATCH', { status: 'CANCELLED' })).body.status, 'CANCELLED');
    assert.equal((await call(`/P1/appointments/${appointment._id}`, 'PATCH', { at: input.at })).status, 409);
    assert.equal((await call('/P1/appointments')).body.length, 1);
  });
  await t.test('the clinic inbox lists request ownership while patients cannot read the global queue', async () => {
    assert.equal((await call('/appointments')).status, 403);
    assert.equal((await call('/appointments', 'GET', undefined, null)).status, 401);
    const other = await call('/P2/appointments', 'POST', { at: new Date(Date.now() + 86400000).toISOString(), doctor: 'Another doctor', location: 'Clinic' }, signPatientToken('P2'));
    assert.equal(other.status, 201);
    const queue = await call('/appointments', 'GET', undefined, signToken({ _id: 'clinician' }));
    assert.equal(queue.status, 200);
    assert.deepEqual(new Set(queue.body.map(row => row.patientId)), new Set(['P1', 'P2']));
    assert.equal(queue.body.find(row => row.patientId === 'P2').status, 'REQUESTED');
    assert.equal(queue.body.some(row => Object.hasOwn(row, 'email')), false);
    assert.equal(queue.headers.get('cache-control'), 'private, no-store');
  });
  await t.test('private uploads validate signatures and never expose storage identifiers', async () => {
    const objects = new Map();
    let signed = 0;
    t.mock.method(storage, 'signedObjectLink', async (media, download) => { signed++; assert.equal(download, true); return { url: 'https://fixture.supabase.co/signed', expiresAt: new Date(Date.now() + 120000).toISOString() }; });
    t.mock.method(storage, 'uploadObject', async (key, bytes) => objects.set(key, bytes));
    t.mock.method(storage, 'readObject', async media => objects.get(media.storageKey));
    const upload = (bytes, mime, name) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: mime }), name); return form; };
    assert.equal((await call('/P1/documents', 'POST', upload('fake PDF', 'application/pdf', 'fake.pdf'))).status, 400);
    const created = await call('/P1/documents', 'POST', upload('%PDF-1.4\nfixture', 'application/pdf', 'report.pdf'));
    assert.equal(created.status, 201); assert.equal(created.body.storageKey, undefined); assert.equal(created.body.gridfs_id, undefined);
    assert.equal((await call(`/P2/documents/${created.body._id}/content`, 'GET', undefined, signPatientToken('P2'))).status, 404);
    const content = await call(`/P1/documents/${created.body._id}/content`);
    assert.equal(content.body, '%PDF-1.4\nfixture'); assert.equal(content.headers.get('cache-control'), 'private, no-store');
    assert.equal((await call('/P1/documents')).body.length, 1);
    assert.equal((await call(`/P2/documents/${created.body._id}/link?download=1`, 'GET', undefined, signPatientToken('P2'))).status, 404);
    assert.equal(signed, 0);
    const linked = await call(`/P1/documents/${created.body._id}/link?download=1`);
    assert.equal(linked.status, 200); assert.equal(linked.body.url, 'https://fixture.supabase.co/signed');
    assert.equal(linked.headers.get('cache-control'), 'private, no-store'); assert.equal(signed, 1);
  });
  await t.test('queued readings are patient-scoped and retries do not duplicate measurements', async () => {
    const input = { type: 'weight', value: 70, takenAt: new Date(Date.now() - 86400000).toISOString() };
    const headers = { 'Idempotency-Key': 'offline-reading-1' };
    const responses = await Promise.all([call('/P1/readings', 'POST', input, token, headers), call('/P1/readings', 'POST', input, token, headers)]);
    assert.deepEqual(responses.map(r => r.status), [201, 201]);
    assert.equal(responses[0].body._id, responses[1].body._id);
    assert.equal(responses[0].body.takenAt, input.takenAt);
    assert.equal((await call('/P1/readings')).body.length, 1);
    assert.equal((await call('/P1/readings', 'POST', { ...input, value: 90 }, token, headers)).status, 409);
    assert.equal((await call('/P1/readings', 'POST', { ...input, takenAt: '2026-01-01T10:00:00Z' }, token, headers)).status, 409);
  });
  await t.test('reading timestamps reject invalid inputs and legacy retries keep their original server time', async () => {
    for (const takenAt of ['bad-date', '', null, 123, {}, '2026-02-30T10:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01', '123']) {
      assert.equal((await call('/P1/readings', 'POST', { type: 'weight', value: 71, takenAt })).status, 400);
    }
    const headers = { 'Idempotency-Key': 'legacy-reading-1' };
    const input = { type: 'weight', value: 72 };
    const first = await call('/P1/readings', 'POST', input, token, headers);
    const retry = await call('/P1/readings', 'POST', input, token, headers);
    assert.equal(first.status, 201);
    assert.equal(retry.status, 201);
    assert.equal(retry.body._id, first.body._id);
    assert.equal(retry.body.takenAt, first.body.takenAt);
    assert.ok(Number.isFinite(Date.parse(first.body.takenAt)));
    const offsetHeaders = { 'Idempotency-Key': 'offset-reading-1' };
    const offset = await call('/P1/readings', 'POST', { ...input, takenAt: '2026-01-15T10:00:00+05:30' }, token, offsetHeaders);
    assert.equal(offset.status, 201);
    assert.equal(offset.body.takenAt, '2026-01-15T04:30:00.000Z');
    const sameInstant = await call('/P1/readings', 'POST', { ...input, takenAt: '2026-01-15T04:30:00.000Z' }, token, offsetHeaders);
    assert.equal(sameInstant.status, 201);
    assert.equal(sameInstant.body._id, offset.body._id);
  });
  await t.test('CAD requests stay PENDING, concurrent retries create one incident, and tracking reads actual telemetry', async () => {
    const realFetch = global.fetch;
    const incidents = new Map(); const writes = [];
    let unavailable = false;
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const mocked = t.mock.method(global, 'fetch', async (url, options = {}) => {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith('/rest/v1/') || parsed.pathname.startsWith('/rest/v1/rpc/')) return realFetch(url, options);
      assert.equal(new Headers(options.headers).get('apikey'), 'test-service-role');
      if (unavailable) return json({ message: 'private provider error' }, 503);
      if (parsed.pathname === '/rest/v1/incidents' && options.method === 'POST') {
        const body = JSON.parse(options.body); writes.push(body);
        assert.equal(body.status, 'PENDING'); assert.equal(body.is_sos, true);
        assert.equal(body.assigned_ambulance_id, undefined);
        assert.equal(new Headers(options.headers).get('prefer'), 'resolution=ignore-duplicates,return=representation');
        if (!incidents.has(body.id)) incidents.set(body.id, { ...body, created_at: '2026-10-24T12:00:00Z', updated_at: '2026-10-24T12:00:00Z' });
        return json([incidents.get(body.id)]);
      }
      if (parsed.pathname === '/rest/v1/incidents') return json([incidents.get(parsed.searchParams.get('id').slice(3))].filter(Boolean));
      if (parsed.pathname === '/rest/v1/ambulances') return json([{ call_sign: 'FIXTURE-1', latitude: 12.9, longitude: 77.4, last_ping: '2026-10-24T12:01:00Z' }]);
      if (parsed.pathname === '/rest/v1/hospitals') return json([{ name: 'Fixture hospital', latitude: 12.8, longitude: 77.5 }]);
      throw new Error('Unexpected fixture request');
    });
    try {
      const input = { latitude: 12, longitude: 77, description: 'Fixture only' };
      const headers = { 'Idempotency-Key': 'sos-fixture-001' };
      const responses = await Promise.all([call('/P1/emergencies', 'POST', input, token, headers), call('/P1/emergencies', 'POST', input, token, headers)]);
      assert.deepEqual(responses.map(r => r.status), [201, 201]);
      assert.equal(incidents.size, 1); assert.equal(responses[0].body.id, responses[1].body.id);
      assert.equal(responses[0].body.status, 'PENDING'); assert.equal(responses[0].body.ambulance, null);
      const id = responses[0].body.id;
      assert.equal((await call(`/P2/emergencies/${id}`, 'GET', undefined, signPatientToken('P2'))).status, 404);
      assert.equal((await call('/P1/emergencies', 'POST', { ...input, latitude: 13 }, token, headers)).status, 409);
      Object.assign(incidents.get(id), { status: 'EN_ROUTE_TO_SCENE', assigned_ambulance_id: 'A1', assigned_hospital_id: 'H1' });
      const tracked = (await call(`/P1/emergencies/${id}`)).body;
      assert.equal(tracked.status, 'EN_ROUTE_TO_SCENE');
      assert.deepEqual(tracked.ambulance, { callSign: 'FIXTURE-1', latitude: 12.9, longitude: 77.4, lastPing: '2026-10-24T12:01:00Z' });
      assert.equal(tracked.hospital.name, 'Fixture hospital'); assert.equal(tracked.eta, undefined);
      assert.equal((await call('/P1/emergencies')).body.length, 1);
      await call('/P1/emergencies', 'POST', input, token, headers);
      assert.equal(incidents.get(id).status, 'EN_ROUTE_TO_SCENE');
      unavailable = true;
      const failed = await call('/P1/emergencies', 'POST', input, token, { 'Idempotency-Key': 'retry-fixture-001' });
      assert.equal(failed.status, 503); assert.equal(failed.body.error.includes('private provider'), false);
      unavailable = false;
      assert.equal((await call('/P1/emergencies', 'POST', input, token, { 'Idempotency-Key': 'retry-fixture-001' })).status, 201);
      assert.equal(incidents.size, 2);
    } finally { mocked.mock.restore(); }
  });
  await t.test('SOS validates coordinates and retry identity before touching CAD', async () => {
    assert.equal((await call('/P1/emergencies', 'POST', { latitude: 91, longitude: 10 }, token, { 'Idempotency-Key': 'request-1' })).status, 400);
    assert.equal((await call('/P1/emergencies', 'POST', { latitude: 12, longitude: 77 })).status, 400);
  });
});
