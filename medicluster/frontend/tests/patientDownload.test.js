import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import express from 'express';
import { createPatientDownloader } from '../src/patient-app/patientDownload.js';

const bytes = await readFile(new URL('../public/downloads/medicluster-patient.apk', import.meta.url));
const release = JSON.parse(await readFile(new URL('../public/downloads/patient-app.json', import.meta.url)));
const apkResponse = () => new Response(bytes, { headers: { 'Content-Type': 'application/vnd.android.package-archive' } });

test('Vite serves Patient and Crew APKs with Android content type and verified bytes', async t => {
  const { createServer } = await import('vite');
  const { fileURLToPath } = await import('node:url');
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const id of ['patient', 'crew']) {
    const response = await fetch(`${origin}/downloads/medicluster-${id}.apk`, {
      headers: { 'X-MediCluster-Installer': '1' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),
      await readFile(new URL(`../public/downloads/medicluster-${id}.apk`, import.meta.url)));
  }
});

test('rapid clicks save one APK without navigating browser', async () => {
  let resolveResponse;
  let requests = 0;
  const saved = [];
  const download = createPatientDownloader({
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, '/downloads/medicluster-patient.apk');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['X-MediCluster-Installer'], '1');
      return new Promise((resolve) => { resolveResponse = resolve; });
    },
    saveBlob: (blob) => saved.push(blob),
  });
  const first = download(release);
  assert.equal(await download(release), false);
  resolveResponse(apkResponse());
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].size, release.sizeBytes);
});

test('cold-start HTML never becomes APK and user can retry', async () => {
  let cold = true;
  let saves = 0;
  const download = createPatientDownloader({
    fetchImpl: async () => cold ? new Response('<html>Waking up</html>', { headers: { 'Content-Type': 'text/html' } }) : apkResponse(),
    saveBlob: () => { saves++; },
  });
  await assert.rejects(download(release), /not ready/i);
  assert.equal(saves, 0);
  cold = false;
  assert.equal(await download(release), true);
  assert.equal(saves, 1);
});

test('corrupt APK never downloads', async () => {
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  const download = createPatientDownloader({
    fetchImpl: async () => new Response(corrupt, { headers: { 'Content-Type': 'application/vnd.android.package-archive' } }),
    saveBlob: () => assert.fail('corrupt APK saved'),
  });
  await assert.rejects(download(release), /verification/i);
});

// Separate/static frontend deployments must not need backend APK files or API routes.
test('Patient and Crew downloads work from frontend assets without any backend', async t => {
  const publicDir = new URL('../public', import.meta.url).pathname;
  const { createFrontendApp } = await import('../server.js');
  const staticApp = express();
  staticApp.use(express.static(publicDir));
  const { createAndroidDownloader } = await import('../src/patient-app/patientDownload.js');
  for (const app of [staticApp, createFrontendApp({ backendUrl: 'http://127.0.0.1:1', distDir: publicDir })]) {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['patient', 'crew']) {
      const metadata = JSON.parse(await readFile(new URL(`../public/downloads/${id}-app.json`, import.meta.url)));
      let saved;
      const download = createAndroidDownloader(id, {
        fetchImpl: (url, options) => fetch(`${origin}${url}`, options),
        saveBlob: blob => { saved = blob; },
      });
      assert.equal(await download(metadata), true);
      const expected = await readFile(new URL(`../public/downloads/medicluster-${id}.apk`, import.meta.url));
      assert.deepEqual(Buffer.from(await saved.arrayBuffer()), expected);
    }
  }
});
