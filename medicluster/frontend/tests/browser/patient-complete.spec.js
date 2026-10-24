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
});
