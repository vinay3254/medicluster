import { test, expect } from '@playwright/test';
test.use({ launchOptions: { executablePath: '/home/vinay/.local/bin/chromium' } });
const findings = Array.from({ length: 14 }, (_, i) => ({ label: `Finding ${i + 1}`, confidence: .9 - i * .03 }));
const analysis = { model: 'vindr-cxr-yolov8s', findings, localization: { threshold: .25, boxes: [], width: 100, height: 100 } };
async function setup(page) {
  await page.addInitScript(() => localStorage.setItem('medicluster.token', 'viewport-test'));
  let uploaded = 0;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { user: { id: 'test', name: 'Demo clinician', onboarded: true } };
    if (path === '/api/media/models') json = { default: analysis.model, models: [{id: analysis.model, label: 'Chest detector', modality: 'chest-xray'}, {id: 'densenet121-res224-all', label: 'Chest classifier', modality: 'chest-xray'}, {id: 'brain-mri-tflite', label: 'Brain MRI', modality: 'brain-mri'}] };
    if (path === '/api/media/upload') json = { gridfs_id: `upload-${++uploaded}`, original_name: 'demo.png', file_type: 'image', size: 1234 };
    if (path.startsWith('/api/media/analyze/')) json = analysis;
    if (path.startsWith('/api/media/file/') && route.request().method() === 'GET') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#666"/></svg>' });
    if (path === '/api/media/demo') json = Array.from({ length: 8 }, (_, i) => ({ gridfs_id: `demo-${i}`, original_name: `demo-${i}.png`, file_type: 'image', patient_id: 'demo', analysis }));
    if (path.startsWith('/api/media/record/')) json = { recordedAt: '2026-10-24', patient_id: 'demo' };
    if (path.startsWith('/api/media/review/')) json = { reviewRequestedAt: '2026-10-24' };
    if (path.startsWith('/api/media/explain/')) json = { explanation: 'Review every candidate finding with clinical context. '.repeat(30) };
    await route.fulfill({ json });
  });
}
async function geometry(page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const failures = await page.evaluate(() => [...document.querySelectorAll('.imaging-page, .imaging-page *')].filter(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.matches('input[type=file],svg *')) return false;
    return r.bottom > innerHeight + 2 || (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2 && ['auto','scroll'].includes(getComputedStyle(el).overflowY));
  }).map(el => `${el.tagName}.${el.className}`));
  expect(failures).toEqual([]);
}
for (const [width, height] of [[1280,720], [1920,1080], [390,844]]) {
  test(`imaging controls and findings fit without scrolling ${width}`, async ({ page }) => {
    await page.setViewportSize({width, height}); await setup(page); await page.goto('/imaging');
    await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden(); await geometry(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: Buffer.from('mock image') });
    if (width < 701) await page.getByRole('tab', {name: 'Analysis & record'}).click();
    await expect(page.getByText('Finding 1', {exact:true})).toBeVisible(); await geometry(page);
    await page.getByRole('tab', {name:'Findings',exact:true}).click();
    await page.getByRole('button', {name:'Next findings'}).click(); await page.getByRole('button', {name:'Next findings'}).click();
    await expect(page.getByText('Finding 14', {exact:true})).toBeVisible(); await geometry(page);
    await page.getByRole('tab', {name:'Summary',exact:true}).click(); await page.getByRole('button', {name:'Explain findings'}).click();
    await expect(page.getByRole('button', {name:'Next text'})).toBeVisible(); await geometry(page);
    if(width < 701) await page.getByRole('tab', {name:'Patient & files'}).click();
    await page.getByLabel('Patient ID', {exact:true}).fill('demo'); await page.getByRole('button', {name:'Load',exact:true}).click();
    if(width < 701) await page.getByRole('tab', {name:'Image viewer'}).click();
    await expect(page.getByRole('button', {name:'Next images'})).toBeVisible(); await page.getByRole('button', {name:'Next images'}).click(); await geometry(page);
    if(width < 701) await page.getByRole('tab', {name:'Scan & model'}).click();
    await expect(page.getByLabel('Imaging model')).toBeInViewport(); await page.getByLabel('Imaging model').selectOption('densenet121-res224-all');
    await expect(page.getByLabel('Imaging model')).toHaveValue('densenet121-res224-all');
  });
}

test('record decisions and complete PDF work from mobile result tabs', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await setup(page); await page.goto('/imaging');
  await expect(page.getByRole('dialog', {name:'Starting MediCluster'})).toBeHidden();
  await page.getByLabel('Patient ID',{exact:true}).fill('demo'); await page.getByRole('button',{name:'Load',exact:true}).click();
  await page.getByRole('tab',{name:'Analysis & record'}).click();
  await page.getByRole('tab',{name:'Record',exact:true}).click();
  await page.getByRole('button',{name:'Add to patient record'}).click();
  await expect(page.getByRole('status')).toContainText('Added to patient record');
  await page.getByRole('button',{name:'Flag for review'}).click();
  await expect(page.getByRole('status')).toContainText('Flagged for clinician review'); await geometry(page);
  // Capture export contents while html2canvas runs: every finding must be present,
  // even though neither the findings tab nor image viewer is visible on screen.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const report = document.getElementById('imaging-complete-report');
      if(report) window.exportedReportText = report.textContent;
    }); observer.observe(document.body,{childList:true});
  });
  const saved = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export PDF',exact:true}).click();
  expect(await (await saved).failure()).toBeNull();
  const report = await page.evaluate(() => window.exportedReportText);
  expect(report).toContain('Finding 14'); expect(report).toContain('Finding 1');
  await expect(page.locator('#imaging-complete-report')).toHaveCount(0); await geometry(page);
});
