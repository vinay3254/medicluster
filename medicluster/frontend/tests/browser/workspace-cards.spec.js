import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function previewSession(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('medicluster.token', 'preview-staff');
    localStorage.setItem('medicluster.patientToken', `${btoa('{}')}.${btoa(JSON.stringify({sub:'preview-patient',kind:'patient',exp:Math.floor(Date.now()/1000)+3600}))}.preview`);
    localStorage.setItem('medicluster.patientId', JSON.stringify('preview-patient'));
  });
  const reminder = { _id: 'preview-reminder', patientId: 'preview-patient', medicationName: 'Demo medicine', dosage: 'As prescribed', active: true, frequency: 'daily', times: ['23:59'], doseLog: [] };
  const doseRequests = [];
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { user: { id: 'preview-staff', name: 'Demo clinician', email: 'demo@example.com', onboarded: true, department: 'Care team' } };
    if (path === '/api/health/ml') json = { online: true };
    if (path === '/api/data/upload') json = { datasetId: 'preview-dataset', name: 'Demo vitals', rowCount: 2, featureNames: ['age', 'glucose'], preview: [{ age: 40, glucose: 100 }, { age: 50, glucose: 110 }] };
    if (path.endsWith('/profile')) json = { patientId: 'preview-patient', name: 'Demo patient' };
    if (path === '/api/reminders/preview-patient') json = [reminder];
    if (path.endsWith('/doses')) {
      const body = route.request().postDataJSON();
      doseRequests.push(body);
      reminder.doseLog.push(body);
      json = reminder;
    }
    await route.fulfill({ json });
  });
  return { doseRequests };
}

test('clinician overview excludes promotions and mobile navigation closes after selection', async ({ page }) => {
  await previewSession(page);
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.locator('.mc-clinical-hero')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Clinical workspaces' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Imaging', exact: true }).click();
  await expect(page).toHaveURL(/\/imaging$/);
  await expect(page.locator('.mc-workspace')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('desktop dashboard fits the viewport and keeps Run visible across result tabs', async ({ page }) => {
  await previewSession(page);
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/dashboard');
    await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.getByRole('tablist', { name: 'Dashboard views', exact: true }).getByRole('tab', { name: 'Clustering', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search patient ID or page' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Use sample dataset', exact: true }).click();
    const run = page.getByRole('button', { name: 'Run clustering', exact: true });
    await expect(run).toBeEnabled();
    await expect(page.getByRole('tablist', { name: 'Result views' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Result views', exact: true })).toHaveCount(0);
    await expect(run).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('patient care cards navigate and taking a medicine still updates the dose', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { doseRequests } = await previewSession(page);
  await page.goto('/app');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await page.getByRole('navigation', { name: 'Your care shortcuts' }).getByRole('link', { name: /My health/ }).click();
  await expect(page.getByRole('heading', { name: 'My health', exact: true })).toBeVisible();
  for (const name of ['Blood sugar', 'Blood pressure', 'Weight']) {
    await expect(page.getByRole('region', { name: 'Latest readings', exact: true }).getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByRole('navigation', { name: 'Patient navigation' }).getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'I’ve taken it', exact: true }).click();
  await expect(page.getByText('All done for today', { exact: true })).toBeVisible();
  expect(doseRequests).toHaveLength(1);
  expect(doseRequests[0]).toMatchObject({ time: '23:59' });
  await page.getByRole('link', { name: 'Profile and settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('dashboard PDF includes content beyond the visible results panel', async ({ page }) => {
  await previewSession(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route(url => url.pathname === '/api/cluster', route => route.fulfill({ json: { all: {} } }));
  await page.goto('/dashboard');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await page.getByRole('tablist', { name: 'Dashboard views', exact: true }).getByRole('tab', { name: 'Clustering', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample dataset', exact: true }).click();
  await page.getByRole('radio', { name: 'Compare all', exact: true }).click();
  await page.getByRole('button', { name: 'Run clustering', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeVisible();
  await page.locator('#dashboard-results').evaluate(element => {
    element.replaceChildren();
    for (let index = 0; index < 80; index++) {
      const line = document.createElement('p');
      line.textContent = `Result row ${index}`;
      line.style.minHeight = '30px';
      element.append(line);
    }
  });
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const download = await saved;
  expect(await download.failure()).toBeNull();
  const pdf = await readFile(await download.path());
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
});

test('long patient reports escape viewport clipping when printed', async ({ page }) => {
  await previewSession(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route(url => url.pathname === '/api/cluster/results', route => route.fulfill({ json: [{ _id: 'print-preview', datasetId: 'demo' }] }));
  await page.route(url => url.pathname === '/api/cluster/print-preview', route => route.fulfill({ json: { patients: [{ patient_id: 'preview-patient', risk_tier: 'Low', cluster_id: 0 }] } }));
  await page.route(url => url.pathname === '/api/reminders/preview-patient', route => route.fulfill({ json: Array.from({ length: 35 }, (_, index) => ({ _id: `print-${index}`, medicationName: `Medication ${index}`, active: true, frequency: 'daily', times: ['23:59'], doseLog: [] })) }));
  await page.goto('/reports');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.locator('#report').getByText(/Medication 34/)).toHaveCount(1);
  await page.evaluate(() => document.body.classList.add('printing-report'));
  await page.emulateMedia({ media: 'print' });
  const layout = await page.locator('#report').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const ancestors = [];
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (node.matches('.mc-workspace,.mc-workspace-body,.mc-workspace-main,.mc-workspace-page,.mc-workspace-page-content')) {
        ancestors.push(getComputedStyle(node).overflow);
      }
    }
    return { x: rect.x, y: rect.y, height: rect.height, ancestors };
  });
  expect(layout).toMatchObject({ x: 0, y: 0 });
  expect(layout.height).toBeGreaterThan(720);
  expect(layout.ancestors.every(overflow => overflow === 'visible')).toBe(true);
});

test('CliniQ fills its workspace and keeps the composer visible through a long conversation', async ({ page }) => {
  await previewSession(page);
  const requests = [];
  await page.route(url => url.pathname === '/api/media/ai-chat', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: Array.from({ length: 50 }, (_, index) => `Demo response paragraph ${index}.`).join('\n\n') } });
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/ask-ai');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.locator('.mc-cliniq-category')).toHaveCount(4);
  const widths = await page.locator('.mc-cliniq-shell').evaluate(element => ({ panel: element.getBoundingClientRect().width, available: element.parentElement.clientWidth }));
  expect(Math.abs(widths.panel - widths.available)).toBeLessThan(2);
  await page.getByRole('combobox', { name: 'Reply language', exact: true }).selectOption('kn');
  await page.getByRole('button', { name: /Skin & rashes/ }).click();
  await expect(page.locator('.mc-cliniq-assistant-bubble')).toContainText('Demo response paragraph 49.');
  expect(requests[0]).toMatchObject({ question: 'I have an itchy red rash on my forearm', language: 'kn' });
  await expect(page.locator('.mc-cliniq-composer')).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('.mc-cliniq-category')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open prompt input', exact: true }).click();
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Demo follow-up question');
  await expect(page.getByRole('button', { name: 'Send prompt', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].question).toBe('Demo follow-up question');
  await expect(page.locator('.mc-cliniq-composer')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});
