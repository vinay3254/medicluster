import { test, expect } from '@playwright/test';

async function session(page, long = false) {
  const acknowledgements = [];
  const alerts = Array.from({ length: 27 }, (_, i) => ({
    id: `alert-${i}`, title: `Alert ${i + 1}: review patient`, patientId: `patient-${i + 1}`,
    severity: i % 3 === 0 ? 'CRITICAL' : 'MODERATE', source: i === 26 ? 'Reminders' : 'Clustering',
    at: new Date(Date.now() - i * 3600000).toISOString(), read: false,
    body: long ? Array.from({ length: 90 }, (_, j) => `Observation ${j + 1} requires follow-up.`).join(' ') : `Details for patient ${i + 1}.`,
    facts: long ? Array.from({ length: 30 }, (_, j) => [`Measurement ${j + 1}`, `Result ${j + 1}`]) : [['Risk', 'High']],
    link: i === 26 ? '/reminders' : `/patients/patient-${i + 1}`,
  }));
  await page.addInitScript(() => localStorage.setItem('medicluster.token', 'alerts-preview'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { user: { id: 'demo', name: 'Demo clinician', email: 'demo@example.com', onboarded: true } };
    if (path === '/api/alerts') json = alerts;
    if (path === '/api/health/ml') json = { online: true };
    if (path === '/api/alerts/ack') { acknowledgements.push(route.request().postDataJSON()); json = { ok: true }; }
    await route.fulfill({ json });
  });
  await page.goto('/alerts');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.locator('.alerts-row').first()).toBeVisible();
  return acknowledgements;
}

async function fits(page) {
  await expect.poll(() => page.locator('.alerts-page').evaluate(root => {
    const visible = [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const ancestors = [];
    for (let el = root.parentElement; el; el = el.parentElement) ancestors.push(el);
    const overflowing = [...visible, ...ancestors].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(el => el.className);
    const controls = visible.filter(el => el.matches('button,a'));
    return {
      overflowing,
      outside: controls.filter(el => { const r = el.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1; }).length,
      documentOverflow: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      rowsOverflow: root.querySelector('.alerts-rows').clientHeight > 0 && root.querySelector('.alerts-rows').scrollHeight > root.querySelector('.alerts-rows').clientHeight + 1,
      textOverflow: [...root.querySelectorAll('.alerts-text-viewport')].some(el => el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1),
    };
  })).toEqual({ overflowing: [], outside: 0, documentOverflow: false, rowsOverflow: false, textOverflow: false });
}

for (const [width, height] of [[1280, 720], [1920, 1080], [390, 844]]) {
  test(`alerts paginate without scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const acknowledgements = await session(page);
    await fits(page);
    const encountered = new Set();
    const next = page.getByRole('button', { name: 'Next inbox pages', exact: true });
    for (let i = 0; i < 27; i++) {
      for (const title of await page.locator('.alerts-row-title').allTextContents()) encountered.add(title);
      if (await next.isDisabled()) break;
      await next.click();
      await fits(page);
    }
    expect(encountered.size).toBe(27);
    await page.getByRole('button', { name: /Alert 27: review patient/ }).click();
    await expect(page.locator('.alerts-text-viewport')).toContainText('Details for patient 27.');
    await expect(page.getByRole('link', { name: 'Open reminders', exact: true })).toHaveAttribute('href', '/reminders');
    await fits(page);
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(page.getByText('✓ Acknowledged', { exact: true })).toBeVisible();
    expect(acknowledgements).toEqual([{ ids: ['alert-26'] }]);
    if (width < 860) await page.getByRole('button', { name: '← Inbox' }).click();
    await page.getByRole('tab', { name: 'Critical 9', exact: true }).click();
    await expect(page.locator('.alerts-card-heading').first()).toContainText('9 alerts');
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Unread 0', exact: true })).toBeVisible();
    expect(acknowledgements[1].ids).toHaveLength(26);
    await fits(page);
  });
}

test('long message and facts remain reachable through detail pagination across resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await session(page, true);
  await page.locator('.alerts-row').first().click();
  await fits(page);
  const next = page.getByRole('button', { name: 'Next detail pages', exact: true });
  let content = '';
  for (let i = 0; i < 100; i++) {
    content += await page.locator('.alerts-text-viewport').textContent();
    if (await next.isDisabled()) break;
    await next.click();
    await fits(page);
  }
  expect(content).toContain('Observation 90 requires follow-up.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Clinical facts', exact: true }).click();
  await fits(page);
  let facts = '';
  for (let i = 0; i < 100; i++) {
    facts += await page.locator('.alerts-text-viewport').textContent();
    if (await next.isDisabled()) break;
    await next.click();
    await fits(page);
  }
  expect(facts).toContain('Measurement 30: Result 30');
  await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toBeInViewport({ ratio: 1 });
});
