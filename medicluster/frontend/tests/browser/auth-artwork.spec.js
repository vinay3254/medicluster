import { test, expect } from '@playwright/test';

async function open(page, path) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
}

test('botanical clinician forms switch modes, preserve values and submit through existing auth', async ({ page }) => {
  await open(page, '/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.locator('.mc-auth-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByLabel('Work email', { exact: true }).fill('sample@example.com');
  await page.getByRole('link', { name: 'Request access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request access' })).toBeVisible();
  await expect(page.getByLabel('Work email', { exact: true })).toHaveValue('sample@example.com');
  await page.getByLabel('Full name', { exact: true }).fill('Sample User');
  await page.getByLabel('Password', { exact: true }).fill('sample-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  let sent;
  await page.route('**/api/auth/register', route => { sent = route.request().postDataJSON(); return route.fulfill({ status: 403, json: { error: 'Registration requires clinic approval.' } }); });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Registration requires clinic approval.');
  expect(sent).toEqual({ name: 'Sample User', email: 'sample@example.com', password: 'sample-password' });
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('patient cosmic artwork stays through code entry with correct request', async ({ page }) => {
  await page.route('**/api/patient-auth/config', route => route.fulfill({ json: { email: true, sms: true, google: false } }));
  let sent;
  await page.route('**/api/patient-auth/request-email-code', route => { sent = route.request().postDataJSON(); return route.fulfill({ json: { sent: true, resendAfterSeconds: 30 } }); });
  await open(page, '/app');
  await expect(page.locator('.mc-patient-auth-shell')).toHaveCSS('background-image', /auth-orbits/);
  await page.getByLabel('Email address', { exact: true }).fill('patient@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  await expect(page.getByLabel('6-digit code')).toBeFocused();
  expect(sent).toEqual({ email: 'patient@example.com' });
  await expect(page.locator('.mc-patient-auth-shell')).toHaveCSS('background-image', /auth-orbits/);
});

test('mobile auth remains scrollable and landing keeps clinic island', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await open(page, '/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await open(page, '/download');
  await expect(page.locator('img[src="/images/care-island.webp"]')).toBeVisible();
  await expect(page.locator('.mc-cellular-background')).toHaveCount(0);
});
