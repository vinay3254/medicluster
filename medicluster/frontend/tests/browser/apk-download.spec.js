import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('Patient and Crew buttons save their published, verified Android installers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/download');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();

  for (const [id, label, filename] of [
    ['patient', 'Patient app', 'MediCluster-Patient.apk'],
    ['crew', 'Crew app', 'MediCluster-Crew.apk'],
  ]) {
    const response = await page.request.get(`/downloads/${id}-app.json`);
    expect(response.ok()).toBe(true);
    const release = await response.json();
    await page.getByRole('tab', { name: label, exact: true }).click();
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${label} for Android`, exact: true }).click();
    const download = await saved;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe(filename);
    const bytes = await readFile(await download.path());
    expect(bytes.byteLength).toBe(release.sizeBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(release.sha256);
    expect([...bytes.subarray(0, 4)]).toEqual([80, 75, 3, 4]);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});
