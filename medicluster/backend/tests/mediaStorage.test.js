const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');

const fileId = '1234567890abcdef12345678';
const key = `files/${fileId}`;
const bytes = Buffer.from([0, 255, 13, 10, 128, 80, 75]);

function provider(t, handler) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://storage-fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-secret';
  global.fetch = async (url, options) => handler(new URL(url), options);
  t.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
}

test('private media transport preserves bytes and authenticates upload, stream, buffer and deletion', async (t) => {
  const requests = [];
  provider(t, (url, options) => {
    requests.push({ url, ...options });
    const headers = new Headers(options.headers);
    assert.equal(headers.get('authorization'), 'Bearer server-only-secret');
    assert.equal(headers.get('apikey'), 'server-only-secret');
    assert.equal(options.redirect, 'error');
    if (options.method === 'GET') return new Response(bytes);
    return Response.json({ message: 'success' });
  });
  const storage = require('../services/mediaStorage');
  assert.equal(storage.storageKeyFor(fileId), key);
  await storage.uploadObject(key, bytes, 'application/pdf');
  assert.equal(requests[0].url.href, `https://storage-fixture.supabase.co/storage/v1/object/medicluster-media/${key}`);
  assert.equal(requests[0].method, 'POST');
  assert.equal(new Headers(requests[0].headers).get('content-type'), 'application/pdf');
  assert.equal(new Headers(requests[0].headers).get('x-upsert'), 'false');
  assert.deepEqual(requests[0].body, bytes);
  const chunks = [];
  for await (const chunk of await storage.downloadObject({ gridfs_id: fileId, storageKey: key })) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), bytes);
  assert.equal(requests[1].url.pathname, `/storage/v1/object/authenticated/medicluster-media/${key}`);
  assert.deepEqual(await storage.readObject({ gridfs_id: fileId }), bytes);
  await storage.deleteObject({ gridfs_id: fileId, storageKey: key });
  assert.equal(requests[3].url.pathname, `/storage/v1/object/medicluster-media/${key}`);
  assert.equal(requests[3].method, 'DELETE');
});

test('media failures expose safe 404/503 errors and never a provider payload or credential', async (t) => {
  let reply = () => Response.json({ statusCode: '404', error: 'not_found', message: 'secret provider internals' }, { status: 400 });
  provider(t, () => reply());
  const storage = require('../services/mediaStorage');
  await assert.rejects(storage.readObject({ gridfs_id: fileId }), { status: 404, message: 'File not found' });
  reply = () => Response.json({ code: 'NoSuchKey', message: 'secret provider internals' }, { status: 404 });
  await assert.rejects(storage.deleteObject({ gridfs_id: fileId }), { status: 404, message: 'File not found' });
  reply = () => Response.json({ message: 'server-only-secret database password' }, { status: 403 });
  await assert.rejects(storage.uploadObject(key, bytes, 'image/png'), { status: 503, message: 'Media storage unavailable' });
  reply = () => { throw new Error('fetch failed with server-only-secret'); };
  await assert.rejects(storage.readObject({ gridfs_id: fileId }), { status: 503, message: 'Media storage unavailable' });
});

test('object paths reject filenames and traversal before any provider request', async (t) => {
  provider(t, () => { assert.fail('unsafe object path reached provider'); });
  const storage = require('../services/mediaStorage');
  assert.throws(() => storage.storageKeyFor('../patient-name.pdf'));
  await assert.rejects(storage.readObject({ gridfs_id: fileId, storageKey: 'files/../patient-name.pdf' }), { status: 503 });
  await assert.rejects(storage.uploadObject('files/patient-name.pdf', bytes, 'image/png'), { status: 503 });
});

test('missing backend credentials and broken download streams fail safely', async (t) => {
  let calls = 0;
  provider(t, () => {
    calls++;
    return new Response(new ReadableStream({
      start(controller) { controller.error(new Error('server-only-secret internal endpoint')); },
    }));
  });
  const storage = require('../services/mediaStorage');
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(storage.readObject({ gridfs_id: fileId }), { status: 503, message: 'Media storage unavailable' });
  assert.equal(calls, 0);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-secret';
  await assert.rejects(storage.readObject({ gridfs_id: fileId }), { status: 503, message: 'Media storage unavailable' });
});

test('bucket migration is idempotent and rejects broad browser policies without affecting other buckets', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint);
    CREATE TABLE storage.objects (id text PRIMARY KEY, bucket_id text, name text);
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
    CREATE POLICY existing_wide_buckets ON storage.buckets TO anon, authenticated USING (true) WITH CHECK (true);
    CREATE POLICY existing_wide_objects ON storage.objects TO anon, authenticated USING (true) WITH CHECK (true);
    INSERT INTO storage.buckets VALUES ('existing-dispatch', 'existing-dispatch', true, 1000);
  `);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261018_medicluster_media.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  const { rows } = await db.query('SELECT id, public, file_size_limit::text FROM storage.buckets ORDER BY id');
  assert.deepEqual(rows, [
    { id: 'existing-dispatch', public: true, file_size_limit: '1000' },
    { id: 'medicluster-media', public: false, file_size_limit: '52428800' },
  ]);
  await db.exec("INSERT INTO storage.objects VALUES ('private-file', 'medicluster-media', 'files/1234567890abcdef12345678'), ('dispatch-file', 'existing-dispatch', 'crew.png')");
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    assert.deepEqual((await db.query('SELECT id FROM storage.objects')).rows, [{ id: 'dispatch-file' }]);
    assert.deepEqual((await db.query('SELECT id FROM storage.buckets')).rows, [{ id: 'existing-dispatch' }]);
    await assert.rejects(db.exec("INSERT INTO storage.objects VALUES ('denied', 'medicluster-media', 'file')"), /row-level security/);
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query("SELECT id FROM storage.objects WHERE bucket_id = 'medicluster-media'")).rows.length, 1);
  await db.exec('RESET ROLE');
});

test('media routes retain API IDs, stream bytes and keep metadata when storage deletion fails', async (t) => {
  const { createTestDatabase } = require('./helpers/supabaseTestDb');
  const db = await createTestDatabase(t);
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/media', require('../routes/mediaRoutes'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.status < 500 ? error.message : 'Service unavailable' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchApp = global.fetch;
  const storageRequests = [];
  let deleteFails = true;
  let deleteMissing = false;
  let downloadStatus = 200;
  global.fetch = async (url, options) => {
    if (!new URL(url).pathname.startsWith('/storage/v1/')) return fetchApp(url, options);
    storageRequests.push({ url: new URL(url), ...options });
    if (options.method === 'GET') return downloadStatus === 200 ? new Response(bytes) : Response.json({ statusCode: String(downloadStatus), message: 'secret' }, { status: downloadStatus });
    if (options.method === 'DELETE' && deleteFails) return Response.json({ message: 'secret' }, { status: 500 });
    if (options.method === 'DELETE' && deleteMissing) return Response.json({ statusCode: '404', message: 'secret' }, { status: 404 });
    return Response.json({ message: 'success' });
  };
  t.after(() => { global.fetch = fetchApp; });
  const form = new FormData();
  form.set('patient_id', 'patient-123');
  form.set('file', new Blob([bytes], { type: 'application/pdf' }), 'Patient Name report.pdf');
  const uploaded = await fetchApp(`${origin}/api/media/upload`, { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const media = await uploaded.json();
  assert.match(media.gridfs_id, /^[a-f\d]{24}$/);
  assert.match(media._id, /^[a-f\d]{24}$/);
  assert.equal(media.storageKey, `files/${media.gridfs_id}`);
  assert.equal(media.original_name, 'Patient Name report.pdf');
  assert.equal(media.patient_id, 'patient-123');
  assert.equal(media.file_type, 'document');
  assert.deepEqual(storageRequests[0].body, bytes);
  assert.match(storageRequests[0].url.pathname, /^\/storage\/v1\/object\/medicluster-media\/files\/[a-f\d]{24}$/);
  const downloaded = await fetchApp(`${origin}/api/media/file/${media.gridfs_id}`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
  assert.match(downloaded.headers.get('content-disposition'), /inline; filename="Patient%20Name%20report.pdf"/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  assert.equal((await fetchApp(`${origin}/api/media/file/${media.gridfs_id.toUpperCase()}`)).status, 200);
  for (const status of [404, 503]) {
    downloadStatus = status;
    const missingObject = await fetchApp(`${origin}/api/media/file/${media.gridfs_id}`);
    assert.equal(missingObject.status, status);
    assert.equal(missingObject.headers.get('content-disposition'), null);
    assert.doesNotMatch(await missingObject.text(), /secret/);
  }
  downloadStatus = 200;
  assert.equal((await fetchApp(`${origin}/api/media/file/${media.gridfs_id}`, { method: 'DELETE' })).status, 503);
  const retained = await (await fetchApp(`${origin}/api/media/patient-123`)).json();
  assert.equal(retained.length, 1);
  assert.equal(retained[0].gridfs_id, media.gridfs_id);
  deleteFails = false;
  assert.deepEqual(await (await fetchApp(`${origin}/api/media/file/${media.gridfs_id}`, { method: 'DELETE' })).json(), { deleted: true });
  assert.deepEqual(await (await fetchApp(`${origin}/api/media/patient-123`)).json(), []);
  assert.equal((await fetchApp(`${origin}/api/media/file/${media.gridfs_id}`)).status, 404);
  assert.equal((await fetchApp(`${origin}/api/media/file/bad-id`)).status, 400);
  const imageForm = new FormData();
  imageForm.set('patient_id', 'patient-123');
  imageForm.set('file', new Blob([bytes], { type: 'image/png' }), 'scan.png');
  const image = await (await fetchApp(`${origin}/api/media/upload`, { method: 'POST', body: imageForm })).json();
  downloadStatus = 503;
  const beforeAnalysis = storageRequests.length;
  for (const endpoint of ['analyze', 'ai-assistant', 'gradcam']) {
    const response = await fetchApp(`${origin}/api/media/${endpoint}/${image.gridfs_id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /secret/);
  }
  assert.equal(storageRequests.slice(beforeAnalysis).filter(request => request.method === 'GET').length, 3);
  downloadStatus = 200;
  assert.equal((await fetchApp(`${origin}/api/media/file/${image.gridfs_id}`, { method: 'DELETE' })).status, 200);
  await db.sql.exec(`
    CREATE FUNCTION reject_media_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.collection = 'patientmedias' THEN RAISE EXCEPTION 'test metadata insert unavailable'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER reject_media_metadata BEFORE INSERT ON public.medicluster_records
      FOR EACH ROW EXECUTE FUNCTION reject_media_metadata();
  `);
  const beforeFailure = storageRequests.length;
  const failedMetadata = await fetchApp(`${origin}/api/media/upload`, { method: 'POST', body: form });
  assert.equal(failedMetadata.status, 503);
  const cleanup = storageRequests.slice(beforeFailure);
  assert.equal(cleanup.length, 2);
  assert.equal(cleanup[0].method, 'POST');
  assert.equal(cleanup[1].method, 'DELETE');
  assert.equal(cleanup[0].url.pathname, cleanup[1].url.pathname);
  assert.equal(await db.collection('patientmedias').countDocuments({ patient_id: 'patient-123' }), 0);
  deleteMissing = true;
  assert.equal((await fetchApp(`${origin}/api/media/upload`, { method: 'POST', body: form })).status, 503);
});

test('signed private links use a 120-second lifetime and reject unexpected provider URLs', async t => {
  let signedURL = `/object/sign/medicluster-media/${key}?token=fixture-short-token`;
  provider(t, (url, options) => {
    assert.equal(url.pathname, `/storage/v1/object/sign/medicluster-media/${key}`);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { expiresIn: 120 });
    return Response.json({ signedURL });
  });
  const storage = require('../services/mediaStorage');
  const before = Date.now();
  const result = await storage.signedObjectLink({ gridfs_id: fileId, original_name: 'report name.pdf' }, true);
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://storage-fixture.supabase.co');
  assert.equal(url.searchParams.get('download'), 'report name.pdf');
  assert.equal(url.searchParams.get('token'), 'fixture-short-token');
  assert.ok(Date.parse(result.expiresAt) >= before + 120000 && Date.parse(result.expiresAt) <= Date.now() + 120000);
  signedURL = 'https://evil.example/document';
  await assert.rejects(storage.signedObjectLink({ gridfs_id: fileId }), { status: 503 });
});
