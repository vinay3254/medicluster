import { test, expect } from '@playwright/test';

async function session(page) {
  const patientId = 'patient-preview';
  const token = `${btoa('{}')}.${btoa(JSON.stringify({ sub: patientId, kind: 'patient', exp: Math.floor(Date.now() / 1000) + 3600 }))}.preview`;
  await page.addInitScript(({patientId, token}) => { localStorage.setItem('medicluster.patientId', JSON.stringify(patientId)); localStorage.setItem('medicluster.patientToken', token); }, { patientId, token });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const appointments = [], documents = [{ _id: 'report-1', original_name: 'Blood test.pdf', mimetype: 'application/pdf', size: 3200, file_type: 'document', createdAt: new Date().toISOString() }];
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const {pathname} = new URL(route.request().url());
    const method = route.request().method(); let json = [];
    if (pathname.endsWith('/profile')) json = { patientId, name: 'Vinay', email: 'vinay@example.com', emergencyContact: { name: 'Family', phone: '9999999999' } };
    if (pathname.includes('/appointments')) {
      if (method === 'POST') appointments.push({ ...route.request().postDataJSON(), _id: 'visit-1', patientId, status: 'REQUESTED' });
      if (method === 'PATCH') Object.assign(appointments[0], route.request().postDataJSON());
      json = method === 'GET' ? appointments : appointments[0];
    }
    if (pathname.endsWith('/documents')) {
      if (method === 'POST') documents.unshift({ _id: 'report-2', original_name: 'scan.png', mimetype: 'image/png', size: 120, file_type: 'image', createdAt: new Date().toISOString() });
      json = method === 'GET' ? documents : documents[0];
    }
    if (pathname.endsWith('/link')) json = { url: 'https://example.org/signed-report.pdf', expiresAt: new Date(Date.now() + 120000).toISOString() };
    if (pathname.endsWith('/emergencies')) json = [{ id: 'sos-1', status: 'EN_ROUTE_TO_SCENE', createdAt: new Date().toISOString(), ambulance: { callSign: 'Alpha-1', latitude: 12.97, longitude: 77.59, lastPing: new Date().toISOString() }, location: { latitude: 12.98, longitude: 77.6 } }];
    if (pathname.endsWith('/emergencies/sos-1')) json = { id: 'sos-1', status: 'ON_SCENE', createdAt: new Date().toISOString(), ambulance: { callSign: 'Alpha-1', latitude: 12.97, longitude: 77.59, lastPing: new Date().toISOString() }, location: { latitude: 12.98, longitude: 77.6 } };
    await route.fulfill({ json });
  });
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Patient navigation' })).toBeVisible();
  return { appointments, documents };
}

async function fits(page) {
  await expect.poll(() => page.locator('.mc-patient-app').evaluate(root => {
    const r = root.getBoundingClientRect();
    const visible = [...root.querySelectorAll('button,input,select,textarea,a')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    return visible.filter(el => { const b = el.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1 || b.bottom > r.bottom + 1 || b.top < r.top - 1; }).map(el => el.textContent || el.getAttribute('aria-label')).slice(0, 8);
  })).toEqual([]);
}

for (const [width,height] of [[390,844],[1440,1000]]) test(`patient care, reports and tracking at ${width}x${height}`, async ({page}) => {
  await page.setViewportSize({width,height}); const { appointments } = await session(page);
  await expect(page.getByText('YOUR EVERYDAY CARE', { exact: true })).toHaveCount(0);
  await fits(page);
  await page.getByRole('navigation', { name: 'Patient navigation' }).getByRole('link', { name: 'Care', exact: true }).click();
  await page.getByRole('button', { name: 'Book a visit', exact: true }).click();
  await page.getByLabel('Date and time', {exact:true}).fill('2027-01-10T10:30');
  await page.getByLabel('Doctor or care team', {exact:true}).fill('Dr Rao');
  await page.getByRole('button', { name: 'Request visit', exact: true }).click();
  await expect(page.getByText('Awaiting clinic confirmation', {exact:true})).toBeVisible();
  expect(appointments).toHaveLength(1);
  await fits(page);
  await page.getByRole('button', {name:'Reschedule',exact:true}).click();
  await page.getByLabel('Date and time',{exact:true}).fill('2027-01-12T11:00');
  await page.getByRole('button', {name:'Request new time',exact:true}).click();
  await fits(page);
  await page.getByRole('navigation', {name:'Patient navigation'}).getByRole('link',{name:'Reports',exact:true}).click();
  await expect(page.getByText('Blood test.pdf',{exact:true})).toBeVisible();
  await fits(page);
  await page.goto('/app/emergency');
  await page.getByRole('tab',{name:'Tracking',exact:true}).click();
  await expect(page.getByText('Alpha-1',{exact:true})).toBeVisible();
  await fits(page);
  await page.getByRole('navigation', {name:'Patient navigation'}).getByRole('link',{name:'Care',exact:true}).click();
  await page.getByRole('button', {name:'Reschedule',exact:true}).click();
  await page.getByRole('button', {name:'Cancel',exact:true}).click();
  await page.getByRole('button', {name:/Dr Rao/}).click();
  await page.getByRole('button', {name:'Cancel visit',exact:true}).click();
  await expect(page.getByText('Cancelled', {exact:true})).toBeVisible();
  expect(appointments[0].status).toBe('CANCELLED');
  await fits(page);
});

for (const [width, height] of [[390, 844], [1280, 800]]) test(`clinic staff can review and confirm patient appointments at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  const clinicianToken = `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'clinician-1', kind: 'clinician', exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  await page.addInitScript(({ token }) => {
    localStorage.setItem('medicluster.token', token);
  }, { token: clinicianToken });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const appt = {
    _id: 'visit-clinic-1',
    patientId: 'patient-101',
    at: '2027-02-15T09:30:00.000Z',
    doctor: 'Dr Sharma',
    department: 'General',
    location: 'Clinic 1A',
    reason: 'Annual health check',
    status: 'REQUESTED',
  };

  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname.endsWith('/auth/me')) {
      return route.fulfill({ json: { user: { _id: 'clinician-1', email: 'clinician@medicluster.com', onboarded: true } } });
    }
    if (pathname.includes('/cluster/runs') || pathname.endsWith('/runs')) {
      return route.fulfill({ json: { latest: { patients: [{ patient_id: 'patient-101', risk_tier: 'Low', age: 38, gender: 'F', cluster_id: 1 }] } } });
    }
    if (pathname.endsWith('/patient-app/appointments')) {
      return route.fulfill({ json: [appt] });
    }
    if (pathname.includes('/patient-app/patient-101/appointments/visit-clinic-1')) {
      if (method === 'PATCH') {
        const patch = route.request().postDataJSON();
        Object.assign(appt, patch);
        return route.fulfill({ json: appt });
      }
    }
    if (pathname.includes('/patient-app/patient-101/appointments')) {
      return route.fulfill({ json: [appt] });
    }
    if (pathname.includes('/patient-app/patient-101/profile')) {
      return route.fulfill({ json: { patientId: 'patient-101', mobile: '9876543210' } });
    }
    if (pathname.includes('/patient-app/patient-101/readings')) return route.fulfill({ json: [] });
    if (pathname.includes('/reminders/patient-101') || pathname.endsWith('/reminders')) return route.fulfill({ json: [] });
    if (pathname.includes('/media/patient/patient-101') || pathname.endsWith('/media')) return route.fulfill({ json: [] });
    if (pathname.includes('/clusters/patient/patient-101/history')) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });

  await page.goto('/patient');
  await page.locator('.mc-splash').click().catch(() => {});
  await page.getByRole('button', { name: 'Clinic appointment inbox', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Clinic appointment queue/ })).toBeVisible();
  await expect(page.getByText('patient-101')).toBeVisible();
  await expect(page.getByText('Annual health check')).toBeVisible();
  await expect(page.getByText('Requested', { exact: true })).toBeVisible();

  // Clinician confirms the appointment from the clinic inbox
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.record-row').getByText('Confirmed', { exact: true })).toBeVisible();
  expect(appt.status).toBe('CONFIRMED');

  // Open the patient record and inspect the appointments tab
  await page.getByRole('button', { name: 'Open patient ›', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'patient-101' })).toBeVisible();
  if (width < 860) await page.getByRole('combobox', { name: 'Patient record sections', exact: true }).selectOption('appointments');
  else await page.getByRole('tab', { name: 'Appointments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Appointments & care requests' })).toBeVisible();
  await expect(page.getByText('Annual health check')).toBeVisible();

  // Complete the appointment from patient appointments tab
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  expect(appt.status).toBe('COMPLETED');
});

test('holding SOS requests dispatch without opening phone dialer', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.98, longitude: 77.6 });
  await session(page);
  const calls = [];
  const emergency = { id: 'sos-new', status: 'PENDING', createdAt: new Date().toISOString(), location: { latitude: 12.98, longitude: 77.6 } };
  await page.route('**/api/patient-app/*/emergencies**', async route => {
    const request = route.request();
    if (request.method() === 'POST') calls.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
    const detail = new URL(request.url()).pathname.endsWith('/sos-new');
    await route.fulfill({ json: request.method() === 'POST' || detail ? emergency : [] });
  });
  const navigationRequests = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.frameRequestedNavigation', event => navigationRequests.push(event.url));
  await page.goto('/app/emergency');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Call 108 now', exact: true })).toHaveAttribute('href', 'tel:108');
  await page.getByRole('button', { name: /^SOS\./ }).press('Space', { delay: 3300 });
  await expect(page.getByText('Waiting for dispatch', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toMatchObject({ latitude: 12.98, longitude: 77.6 });
  expect(calls[0].key).toBeTruthy();
  expect(navigationRequests.filter(url => url.startsWith('tel:'))).toEqual([]);
});

test('patient confirms exact map pin before correcting a pending SOS location', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await session(page);
  const calls = [];
  const emergency = { id: 'sos-location', status: 'PENDING', createdAt: new Date().toISOString(), location: { latitude: 12.9466, longitude: 77.6208 }, ambulance: null };
  await page.route('**/api/patient-app/*/emergencies**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON(); calls.push({ path, body });
      emergency.location = { latitude: body.latitude, longitude: body.longitude };
    }
    await route.fulfill({ json: path.endsWith('/emergencies') ? [emergency] : emergency });
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [{ lat: '13.1691299', lon: '77.5599986', display_name: 'Rajanukunte, Bengaluru' }] }));
  await page.goto('/app/emergency');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await page.getByRole('tab', { name: 'Tracking', exact: true }).click();
  await page.getByRole('button', { name: 'Correct location', exact: true }).click();
  await page.getByRole('textbox', { name: 'Area or landmark', exact: true }).fill('Rajanukunte');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByText('13.169130, 77.559999', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm location', exact: true })).toBeDisabled();
  expect(calls).toHaveLength(0);
  await page.getByLabel('Choose exact SOS pickup location on map', { exact: true }).click({ position: { x: 80, y: 80 } });
  await page.getByRole('button', { name: 'Confirm location', exact: true }).click();
  await expect(page.getByText('Waiting for dispatch', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toContain('/sos-location/location');
  expect(calls[0].body.latitude).toBeGreaterThan(13.16);
  expect(calls[0].body.latitude).toBeLessThan(13.18);
  expect(calls[0].body.longitude).toBeGreaterThan(77.55);
  expect(calls[0].body.longitude).toBeLessThan(77.57);
  expect(calls[0].body.locationAddress).toContain('Rajanukunte');
  await fits(page);
});

test('new SOS uses confirmed map pin when browser location is unavailable', async ({ page }) => {
  await session(page);
  await page.addInitScript(() => {
    window.gpsCalls = 0;
    navigator.geolocation.getCurrentPosition = (_success, failure) => { window.gpsCalls++; failure({ code: 1 }); };
  });
  const calls = [];
  let emergency;
  await page.route('**/api/patient-app/*/emergencies**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); calls.push(body);
      emergency = { id: 'sos-manual', status: 'PENDING', createdAt: new Date().toISOString(), location: { latitude: body.latitude, longitude: body.longitude }, ambulance: null };
    }
    await route.fulfill({ json: path.endsWith('/emergencies') && request.method() === 'GET' ? [] : emergency });
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [{ lat: '13.1691299', lon: '77.5599986', display_name: 'Rajanukunte, Bengaluru' }] }));
  await page.goto('/app/emergency');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await page.getByRole('tab', { name: 'Location', exact: true }).click();
  await page.getByRole('textbox', { name: 'Area or landmark', exact: true }).fill('Rajanukunte');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByText('13.169130, 77.559999', { exact: true })).toBeVisible();
  await page.getByLabel('Choose exact SOS pickup location on map', { exact: true }).click({ position: { x: 80, y: 80 } });
  await page.getByRole('button', { name: 'Confirm location', exact: true }).click();
  await expect(page.getByText('SOS will use your confirmed map pin.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^SOS\./ }).press('Space', { delay: 3300 });
  await expect(page.getByText('Waiting for dispatch', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].latitude).toBeGreaterThan(13.16);
  expect(calls[0].longitude).toBeLessThan(77.57);
  expect(await page.evaluate(() => window.gpsCalls)).toBe(0);
});

test('correcting location recovers a lost SOS response with the original retry key', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.98, longitude: 77.6 });
  await session(page);
  const posts = [], corrections = [];
  let emergency;
  await page.route('**/api/patient-app/*/emergencies**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      posts.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      emergency ||= { id: 'sos-recovered', status: 'PENDING', createdAt: new Date().toISOString(), location: { latitude: 12.98, longitude: 77.6 }, ambulance: null };
      if (posts.length === 1) return route.abort('failed');
    }
    if (request.method() === 'PATCH') {
      corrections.push(request.postDataJSON());
      emergency.location = { latitude: corrections[0].latitude, longitude: corrections[0].longitude };
    }
    return route.fulfill({ json: path.endsWith('/emergencies') && request.method() === 'GET' ? [] : emergency });
  });
  await page.goto('/app/emergency');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await page.getByRole('button', { name: /^SOS\./ }).press('Space', { delay: 3300 });
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('tab', { name: 'Location', exact: true }).click();
  await page.getByLabel('Choose exact SOS pickup location on map', { exact: true }).click({ position: { x: 80, y: 80 } });
  await page.getByRole('button', { name: 'Confirm location', exact: true }).click();
  await expect(page.getByText('Waiting for dispatch', { exact: true })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(corrections).toHaveLength(1);
});
