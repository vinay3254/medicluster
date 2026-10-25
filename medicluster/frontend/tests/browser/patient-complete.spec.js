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
