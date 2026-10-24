import { test, expect } from '@playwright/test';
async function openFinder(page) {
  await page.addInitScript(() => localStorage.setItem('medicluster.token', 'preview'));
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/auth/me' ? { user: { id: 'preview', name: 'Demo clinician', onboarded: true } } : {} }));
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [{ lat: '12.97', lon: '77.59', display_name: 'Bengaluru, Karnataka, India' }] }));
  await page.route('https://overpass-api.de/**', route => route.fulfill({ json: { elements: Array.from({ length: 12 }, (_, i) => ({ type: 'node', id: i + 1, lat: 12.97 + .001 * i, lon: 77.59 + .001 * i, tags: { name: `Care hospital ${String(i + 1).padStart(2, '0')}`, amenity: 'hospital', 'addr:street': 'Care Road' } })) } }));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8ecdf"/><path d="M0 70H256M75 0V256M0 190H256M190 0V256" stroke="#fbfaf7" stroke-width="8"/></svg>' }));
  await page.goto('/hospitals');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Nearby hospitals', exact: true })).toBeVisible();
}
async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await page.locator('.mc-hospital-workspace').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
  expect(await page.locator('.mc-hospital-workspace').evaluate(el => [...el.querySelectorAll('section, .mc-hospital-list, .mc-hospital-list ul, .mc-hospital-list li')].filter(n => n.getClientRects().length && n.scrollHeight > n.clientHeight + 2).map(n => n.className))).toEqual([]);
}
for (const [width, height] of [[1280, 720], [390, 844]]) {
  test(`finder fits ${width}x${height} and every result is accessible`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openFinder(page);
    await fits(page);
    await page.getByRole('textbox', { name: 'City, area, or address' }).fill('Bengaluru');
    await page.locator('.mc-hospital-search-form').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: '12 places nearby' })).toBeVisible();
    const seen = new Set();
    const next = page.getByRole('navigation', { name: 'Hospital result pages' }).getByRole('button', { name: 'Next', exact: true });
    for (let i = 0; i < 20; i++) {
      await fits(page);
      for (const name of await page.locator('.mc-hospital-name').allTextContents()) seen.add(name);
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(seen.size).toBe(12);
    await page.getByRole('list', { name: 'Nearby hospitals' }).getByRole('button', { name: /Care hospital 12/ }).click();
    if (width < 860) await page.getByRole('navigation', { name: 'Hospital finder views' }).getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.leaflet-popup')).toContainText('Care hospital 12');
    await expect(page.locator('.leaflet-popup').getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', /destination=/);
    await fits(page);
    await page.screenshot({ path: `/tmp/medicluster-hospitals-${width}.png` });
    expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
  });
}
test('GPS, radius, map clicks and failed location search', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.97, longitude: 77.59 });
  await openFinder(page);
  let request = page.waitForRequest(req => req.url().includes('overpass-api.de'));
  await page.getByRole('button', { name: 'Use my location' }).click();
  expect((await request).postData()).toContain('around:5000,12.97,77.59');
  await expect(page.getByRole('heading', { name: '12 places nearby' })).toBeVisible();
  request = page.waitForRequest(req => req.url().includes('overpass-api.de'));
  await page.getByRole('button', { name: '10 km', exact: true }).click();
  expect((await request).postData()).toContain('around:10000,12.97,77.59');
  await expect(page.getByRole('heading', { name: '12 places nearby' })).toBeVisible();
  request = page.waitForRequest(req => req.url().includes('overpass-api.de'));
  await page.locator('.mc-hospital-map').click({ position: { x: 40, y: 40 } });
  expect((await request).postData()).toContain('around:10000,');
  await expect(page.getByRole('heading', { name: '12 places nearby' })).toBeVisible();
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [] }));
  await page.getByRole('textbox', { name: 'City, area, or address' }).fill('Unknown');
  await page.locator('.mc-hospital-search-form').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Location not found');
  await expect(page.locator('.mc-hospital-search-form').getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
});
