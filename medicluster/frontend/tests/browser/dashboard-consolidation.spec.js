import { test, expect } from '@playwright/test';

const run = {
  _id: '0123456789abcdef01234567', algorithm: 'kmeans', createdAt: '2026-10-26T10:00:00Z',
  riskDistribution: { Low: 1, Critical: 1 }, metrics: { silhouette: 0.6 },
  patients: [{ patient_id: 'TEST-1', age: 70, risk_tier: 'Critical', cluster_id: 0 }],
};

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('medicluster.token', 'ui-fixture'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/auth/me' ? { user: { id: 'fixture', name: 'Test clinician', onboarded: true } }
      : path === '/api/health/ml' ? { online: true }
      : path === '/api/cluster/results' ? [run]
      : path === `/api/cluster/${run._id}` ? run
      : path === '/api/cluster' ? { algorithm: 'kmeans', patients: run.patients, feature_names: ['age'], risk_distribution: run.riskDistribution, metrics: run.metrics, cluster_profiles: [] }
      : path === '/api/cluster/detect-anomalies' ? { anomaly_flags: [0], anomaly_scores: [0] }
      : {};
    return route.fulfill({ json });
  });
}

test('root and retired tool routes lead to consolidated Dashboard', async ({ page }) => {
  await prepare(page);
  for (const path of ['/', '/predict', '/ml-tools']) {
    await page.goto(path);
    await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Home$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Predict$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^ML Tools$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /CliniQ/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /3D Tumor Explorer/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Deterioration Radar/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Clinical AI/ })).toBeVisible();
  }
});

for (const width of [1440, 390]) test(`Dashboard retains overview and clustering results at width ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  const views = page.getByRole('tablist', { name: 'Dashboard views', exact: true });
  await expect(views.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/1 of 2 patients fall in/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toBeVisible();
  await views.getByRole('tab', { name: 'Clustering', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample dataset' }).click();
  await page.getByRole('button', { name: 'Run clustering', exact: true }).click();
  await expect(page.getByText('Cluster Scatter Plot', { exact: true })).toBeVisible();
  await views.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toBeVisible();
  await views.getByRole('tab', { name: 'Clustering', exact: true }).click();
  await expect(page.getByText('Cluster Scatter Plot', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Dashboard preserves algorithm settings and in-progress runs across views', async ({ page }) => {
  await prepare(page);
  let finishRun;
  const gate = new Promise(resolve => { finishRun = resolve; });
  await page.route(url => url.pathname === '/api/cluster', async route => {
    await gate;
    await route.fulfill({ json: { algorithm: 'dbscan', patients: run.patients, feature_names: ['age'], risk_distribution: run.riskDistribution, metrics: run.metrics, cluster_profiles: [] } });
  });
  try {
    await page.goto('/dashboard');
    await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
    const views = page.getByRole('tablist', { name: 'Dashboard views', exact: true });
    await views.getByRole('tab', { name: 'Clustering', exact: true }).click();
    await page.getByRole('button', { name: 'Use sample dataset' }).click();
    await page.getByRole('radio', { name: 'DBSCAN', exact: true }).click();
    await page.getByRole('slider', { name: /^Epsilon/ }).fill('0.9');
    await views.getByRole('tab', { name: 'Overview', exact: true }).click();
    await views.getByRole('tab', { name: 'Clustering', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'DBSCAN', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('slider', { name: /^Epsilon/ })).toHaveValue('0.9');
    const pending = page.waitForRequest(request => new URL(request.url()).pathname === '/api/cluster');
    await page.getByRole('button', { name: 'Run clustering', exact: true }).click();
    await pending;
    await views.getByRole('tab', { name: 'Overview', exact: true }).click();
    await views.getByRole('tab', { name: 'Clustering', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Clustering…', exact: true })).toBeDisabled();
    finishRun();
    await expect(page.getByText('Cluster Scatter Plot', { exact: true })).toBeVisible();
  } finally { finishRun(); }
});
