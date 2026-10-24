import { test, expect } from '@playwright/test';

const patients = Array.from({ length: 100 }, (_, i) => ({ patient_id: `P${String(i + 1).padStart(3, '0')}`, age: 30 + i % 50, bmi: 24, systolic_bp: 120, glucose: 90, cluster_id: i % 4, risk_tier: ['Low', 'Moderate', 'High', 'Critical'][i % 4], pca_x: i % 10, pca_y: Math.floor(i / 10) }));
const result = { warnings: ['Preprocessing removed 13 row(s) as outliers.', 'Preprocessing ignored non-numeric column(s): gender.'], patients, algorithm: 'kmeans', feature_names: ['age', 'bmi', 'systolic_bp', 'glucose', 'cholesterol', 'hba1c', 'heart_rate', 'spo2'], metrics: { silhouette: .6, davies_bouldin: .8, calinski_harabasz: 210 }, risk_distribution: { Low: 25, Moderate: 25, High: 25, Critical: 25 }, cluster_profiles: Array.from({ length: 8 }, (_, i) => ({ cluster_id: i, size: 25, risk_tier: ['Low', 'Moderate', 'High', 'Critical'][i % 4], centroid_features: { age: 45, bmi: 24, systolic_bp: 120, glucose: 90 } })), linkage_matrix: [[0, 1, 1, 2], [2, 3, 2, 2], [4, 5, 3, 4]] };

async function openDashboard(page) {
  await page.addInitScript(() => localStorage.setItem('medicluster.token', 'layout-preview'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    let json = {};
    if (path === '/api/auth/me') json = { user: { id: 'demo', name: 'Demo clinician', onboarded: true } };
    if (path === '/api/health/ml') json = { online: true };
    if (path === '/api/data/upload') json = { datasetId: 'preview', name: 'sample_patients.csv', rowCount: 100, featureNames: result.feature_names };
    if (path === '/api/cluster') json = route.request().postDataJSON().algorithm === 'all' ? { all: Object.fromEntries(['kmeans', 'dbscan', 'hierarchical', 'gmm'].map(a => [a, result])) } : result;
    if (path === '/api/cluster/detect-anomalies') json = { anomaly_flags: patients.map(() => -1), anomaly_scores: patients.map(() => .8) };
    if (path === '/api/ai/cluster-insights') json = { headline: 'Cohort review', cohort_summary: Array.from({ length: 100 }, (_, i) => `Observation ${i + 1} requires review.`).join(' '), risk_drivers: [{ feature: 'age', signal: 'Higher age', rationale: 'Review older patients.' }], cluster_actions: [{ cluster_id: 0, priority: 'High', action: 'Review vitals.' }], patient_watchlist: [{ patient_id: 'P001', risk_tier: 'High', reason: 'Review measurements.' }], safety_note: 'Final safety note' };
    if (path === '/api/cluster/explain') json = { feature_importances: { age: .8, glucose: .5, bmi: .4, systolic_bp: .3, cholesterol: .2, hba1c: .1, heart_rate: .05, spo2: .02 } };
    await route.fulfill({ json });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

async function fits(page) {
  await expect.poll(() => page.locator('.mc-dashboard-page').evaluate(root => {
    const visible = [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    return visible.filter(el => {
      const rect = el.getBoundingClientRect();
      return (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2 && el.children.length > 0 && !el.closest('svg') && !el.matches('svg')) || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2;
    }).map(el => `${el.tagName}.${el.className}`).slice(0, 8);
  })).toEqual([]);
}

async function choose(page, name, value) {
  const list = page.getByRole('tablist', { name, exact: true });
  if (await list.isVisible()) {
    const tab = list.getByRole('tab', { name: value, exact: true });
    if (await tab.count()) await tab.click();
    else await page.getByRole('combobox', { name: 'More result views', exact: true }).selectOption({ label: value });
  } else await page.getByRole('combobox', { name, exact: true }).selectOption({ label: value });
}

for (const [width, height] of [[1676, 966], [1280, 720], [1024, 768], [390, 844]]) {
  test(`dashboard tabs stay within ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    await fits(page);
    await page.getByRole('button', { name: 'Use sample dataset' }).click();
    await expect(page.getByRole('button', { name: 'Run clustering', exact: true })).toBeEnabled();
    await fits(page);
    await page.getByRole('button', { name: 'Run clustering', exact: true }).click();
    await expect(page.getByText('Cluster Scatter Plot', { exact: true })).toBeVisible();
    await page.getByText('Data notes (2)', { exact: true }).click();
    await expect(page.getByRole('status')).toContainText('ignored non-numeric');
    await fits(page);
    await page.getByText('Data notes (2)', { exact: true }).click();
    if (width >= 860) {
      await expect(page.getByRole('tablist', { name: 'Result views' }).getByRole('tab')).toHaveCount(3);
      await expect(page.getByRole('combobox', { name: 'More result views', exact: true })).toBeVisible();
    }
    for (const tab of ['Scatter', 'Dendrogram', 'Anomalies', 'Risk & quality', 'Clusters', 'Patients', 'AI insights', 'Drivers', 'SHAP']) {
      await choose(page, 'Result views', tab);
      await fits(page);
    }
    await choose(page, 'Result views', 'SHAP');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.mc-feature-scores').filter({ hasText: 'SHAP explainability' })).toContainText('0.800');
    await fits(page);
    await choose(page, 'Result views', 'AI insights');
    await page.getByRole('button', { name: 'Generate insights', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Insight section' })).toBeVisible();
    const insightNext = page.getByRole('navigation', { name: 'Insight pages' }).getByRole('button', { name: 'Next', exact: true });
    let copy = '';
    for (let i = 0; i < 100; i++) {
      copy += await page.locator('.mc-insight-viewport').textContent();
      await fits(page);
      if (await insightNext.isDisabled()) break;
      await insightNext.click();
    }
    expect(copy).toContain('Observation 100 requires review.');
    expect(copy).toContain('Final safety note');
    for (const section of ['Risk drivers', 'Care actions', 'Watchlist']) {
      await page.getByRole('combobox', { name: 'Insight section' }).selectOption(section);
      await fits(page);
    }
    await choose(page, 'Result views', 'Patients');
    for (const label of ['Patient ID', 'Risk Tier', 'Files']) await expect(page.getByRole('columnheader', { name: new RegExp(label) })).toBeVisible();
    const seen = new Set();
    const next = page.getByRole('button', { name: 'Next →', exact: true });
    for (let i = 0; i < 100; i++) {
      for (const id of await page.locator('.mc-patient-table tbody tr td:first-child').allTextContents()) seen.add(id);
      if (await next.isDisabled()) break;
      await next.click();
      await fits(page);
    }
    expect(seen.size).toBe(100);
    if (width < 860) await page.getByRole('button', { name: 'Setup', exact: true }).click();
    await page.getByRole('radio', { name: 'Compare all', exact: true }).click();
    await page.getByRole('button', { name: 'Run clustering', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Comparison view', exact: true })).toBeVisible();
    await choose(page, 'Result views', 'Drivers');
    await expect(page.locator('.mc-feature-scores').filter({ hasText: 'Feature drivers' })).not.toContainText('Run clustering');
    await expect(page.locator('.mc-feature-score').first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Active algorithm', exact: true }).selectOption('gmm');
    await expect(page.getByRole('combobox', { name: 'Active algorithm', exact: true })).toHaveValue('gmm');
    await choose(page, 'Result views', 'Comparison');
    for (const view of ['Quality metrics', 'K-Means', 'DBSCAN', 'Hierarchical', 'GMM']) {
      await page.getByRole('combobox', { name: 'Comparison view', exact: true }).selectOption({ label: view });
      await fits(page);
    }
    await page.screenshot({ path: `/tmp/dashboard-${width}.png` });
    await choose(page, 'Result views', 'AI insights');
    await page.getByRole('button', { name: 'Generate insights', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Insight section' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Active algorithm', exact: true }).selectOption('kmeans');
    await expect(page.getByRole('button', { name: 'Generate insights', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Insight section' })).toHaveCount(0);
    await fits(page);
  });
}
