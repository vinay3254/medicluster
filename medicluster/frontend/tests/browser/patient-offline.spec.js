import { test, expect } from '@playwright/test';

async function openOffline(page) {
  await page.route('**/offline-test-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/offline-test-fixture');
  await page.evaluate(async () => {
    window.offline = await import('/src/patient-app/offline.js');
    window.signIn = (id, token = 'test-token') => {
      localStorage.setItem('medicluster.patientId', JSON.stringify(id));
      localStorage.setItem('medicluster.patientToken', token);
    };
    window.signIn('alice');
  });
}

test('snapshots and durable offline writes remain scoped to their signed-in account', async ({ page, context }) => {
  await openOffline(page);
  await page.evaluate(async () => {
    await offline.savePatientSnapshot('alice', { profile: { name: 'Alice' }, readings: [{ value: 98 }] });
    await offline.enqueuePatientMutation('alice', 'reading', { type: 'spo2', value: 97 });
    signIn('bob');
  });
  const isolation = await page.evaluate(async () => ({ alice: await offline.readPatientSnapshot('alice'), bob: await offline.readPatientSnapshot('bob'), status: await offline.readPatientOfflineStatus('bob') }));
  expect(isolation.alice).toBeNull();
  expect(isolation.bob).toBeNull();
  expect(isolation.status.pending).toBe(0);
  await context.setOffline(true);
  await page.evaluate(async () => {
    await offline.savePatientSnapshot('bob', { profile: { name: 'Bob' } });
    await offline.enqueuePatientMutation('bob', 'dose', { reminderId: 'r1', date: '2026-10-24', time: '09:00' });
  });
  expect(await page.evaluate(async () => (await offline.readPatientOfflineStatus('bob')).pending)).toBe(1);
  await context.setOffline(false);
  await page.evaluate(() => signIn('alice'));
  const replay = await page.evaluate(async () => offline.flushPatientMutations('alice', { reading: async (payload, options) => ({ _id: 'server-reading', payload, key: options.idempotencyKey }) }));
  expect(replay.completed).toHaveLength(1);
  expect(replay.completed[0].result.payload.value).toBe(97);
  expect(replay.completed[0].result.key).toBeTruthy();
  await page.evaluate(async () => offline.clearPatientOffline('alice'));
  expect(await page.evaluate(() => offline.readPatientSnapshot('alice'))).toBeNull();
  expect(await page.evaluate(async () => (await offline.readPatientOfflineStatus('alice')).pending)).toBe(0);
});

test('retry preserves idempotency, rejects stale sessions, and surfaces terminal errors', async ({ page }) => {
  await openOffline(page);
  const result = await page.evaluate(async () => {
    await offline.enqueuePatientMutation('alice', 'reading', { value: 110 });
    const keys = [];
    const failed = await offline.flushPatientMutations('alice', { reading: async (_, options) => { keys.push(options.idempotencyKey); throw new TypeError('Failed to fetch'); } });
    const forbidden = await offline.flushPatientMutations('alice', { reading: async (_, options) => { keys.push(options.idempotencyKey); throw Object.assign(new Error('Not allowed'), { response: { status: 403 } }); } });
    const status = await offline.readPatientOfflineStatus('alice');
    await offline.enqueuePatientMutation('alice', 'dose', { reminderId: 'r1', date: '2026-10-24', time: '08:00' });
    const expiredToken = `x.${btoa(JSON.stringify({ exp: 1 }))}.x`;
    signIn('alice', expiredToken);
    const expired = await offline.flushPatientMutations('alice', { dose: async () => { throw new Error('must not run'); } });
    return { failed, forbidden, status, keys, expired };
  });
  expect(result.failed.pending).toBe(1);
  expect(result.keys[0]).toBe(result.keys[1]);
  expect(result.forbidden.error).toContain('Not allowed');
  expect(result.status.failed).toBe(1);
  expect(result.expired.blocked).toBe('auth');
  const paused = await page.evaluate(async () => {
    signIn('alice', 'new-session');
    return offline.flushPatientMutations('alice', { dose: async () => { throw Object.assign(new Error('Sign in again'), { response: { status: 401 } }); } });
  });
  expect(paused.blocked).toBe('auth');
});

test('logout during replay prevents following writes and late response exposure', async ({ page }) => {
  await openOffline(page);
  const result = await page.evaluate(async () => {
    await offline.enqueuePatientMutation('alice', 'reading', { value: 100 });
    await offline.enqueuePatientMutation('alice', 'reading', { value: 101 });
    let calls = 0;
    const flush = await offline.flushPatientMutations('alice', { reading: async () => {
      calls++;
      await offline.clearPatientOffline('alice');
      signIn('bob');
      return { _id: 'late-alice-reading' };
    } });
    signIn('alice');
    return { calls, flush, status: await offline.readPatientOfflineStatus('alice') };
  });
  expect(result.calls).toBe(1);
  expect(result.flush.completed).toEqual([]);
  expect(result.flush.blocked).toBe('auth');
  expect(result.status.pending).toBe(0);
});

test('snapshots and queued doses survive a page reload without credentials in IndexedDB', async ({ page }) => {
  await openOffline(page);
  await page.evaluate(async () => {
    await offline.savePatientSnapshot('alice', { profile: { name: 'Alice' }, sections: { documents: [{ _id: 'd1', original_name: 'report.pdf' }] } });
    await offline.enqueuePatientMutation('alice', 'dose', { reminderId: 'r2', date: '2026-10-24', time: '09:00' });
  });
  await page.reload();
  const restored = await page.evaluate(async () => {
    const api = await import('/src/patient-app/offline.js');
    const snapshot = await api.readPatientSnapshot('alice');
    const status = await api.readPatientOfflineStatus('alice');
    const stored = await new Promise((resolve, reject) => {
      const request = indexedDB.open('medicluster-patient-offline-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('accounts').objectStore('accounts').get('alice');
        read.onsuccess = () => { resolve(JSON.stringify(read.result)); db.close(); };
      };
    });
    return { snapshot, status, stored };
  });
  expect(restored.snapshot.profile.name).toBe('Alice');
  expect(restored.snapshot.sections.documents[0].original_name).toBe('report.pdf');
  expect(restored.status.pending).toBe(1);
  expect(restored.status.savedAt).toBeGreaterThan(0);
  expect(restored.stored).not.toContain('test-token');
});
