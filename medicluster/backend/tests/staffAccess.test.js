const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createTestDatabase } = require('./helpers/supabaseTestDb');
const User = require('../models/User');
const { signToken, signPatientToken, requireAuth, requirePatientOrClinician } = require('../middleware/auth');

test('staff allowlist blocks existing accounts and sessions outside the list', async t => {
  await createTestDatabase(t);
  const previous = Object.fromEntries(['JWT_SECRET', 'ALLOWED_STAFF_EMAILS', 'ALLOWED_EMAIL_DOMAINS'].map(key => [key, process.env[key]]));
  process.env.JWT_SECRET = 'staff-access-test-secret-at-least-32-characters';
  process.env.ALLOWED_STAFF_EMAILS = '  Vinay@clinic.example , KISHORE@clinic.example ';
  process.env.ALLOWED_EMAIL_DOMAINS = 'clinic.example';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const password = 'staff-access-test-password';
  const passwordHash = await bcrypt.hash(password, 4);
  const users = {};
  for (const name of ['vinay', 'kishore', 'demo']) {
    users[name] = await User.create({ name, email: `${name}@clinic.example`, passwordHash });
  }
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/authRoutes'));
  app.get('/clinical', requireAuth, (_req, res) => res.json({ ok: true }));
  app.get('/shared', requirePatientOrClinician, (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = (path, token) => fetch(origin + path, { headers: { Authorization: `Bearer ${token}` } });
  const login = email => fetch(origin + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });

  await t.test('correct password does not admit an unlisted existing account', async () => {
    assert.equal((await login('demo@clinic.example')).status, 403);
  });
  await t.test('old tokens cannot bypass either clinician access check', async () => {
    const token = signToken(users.demo);
    for (const path of ['/auth/me', '/clinical', '/shared']) {
      assert.equal((await call(path, token)).status, 403, path);
    }
  });
  await t.test('both listed accounts can sign in and use their sessions', async () => {
    for (const name of ['vinay', 'kishore']) {
      const response = await login(`${name.toUpperCase()}@clinic.example`);
      assert.equal(response.status, 200);
      const { token } = await response.json();
      for (const path of ['/auth/me', '/clinical', '/shared']) {
        assert.equal((await call(path, token)).status, 200, `${name} ${path}`);
      }
    }
  });
  await t.test('removing an email blocks a previously issued session', async () => {
    const token = signToken(users.kishore);
    process.env.ALLOWED_STAFF_EMAILS = 'vinay@clinic.example';
    try {
      assert.equal((await call('/clinical', token)).status, 403);
      assert.equal((await call('/shared', token)).status, 403);
    } finally { process.env.ALLOWED_STAFF_EMAILS = 'vinay@clinic.example,kishore@clinic.example'; }
  });
  await t.test('patient tokens retain patient access and cannot access clinician routes', async () => {
    const token = signPatientToken('patient-1');
    assert.equal((await call('/shared', token)).status, 200);
    assert.equal((await call('/clinical', token)).status, 403);
  });
});
