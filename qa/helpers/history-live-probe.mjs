import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { historyRow, seedCompactHistory } from './compact-history-fixture.mjs';

async function storedProbe(page, id) {
  return page.evaluate(async id => {
    const read = async (name, store, key) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onupgradeneeded = () => r.transaction.abort();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const r = db.transaction(store, 'readonly').objectStore(store).get(key);
          r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
      } finally { db.close(); }
    };
    const scope = window.__historyProbeScope;
    return JSON.stringify([
      await read('football-science-data-safety-v1', 'snapshots', id),
      await read('football-science-snapshots-compact-v1', 'versions', JSON.stringify([scope, id])),
      await read('football-science-snapshots-compact-v1', 'versions', JSON.stringify([scope + '-foreign', id + '-foreign'])),
    ]);
  }, id);
}

// Run only in Playwright's disposable profile, after the normal app sign-in.
// Synthetic IDB rows never enter native module storage or the central write queue.
export async function verifyAuthenticatedHistory(page) {
  const scope = await page.evaluate(() => window.footballScienceCentralState.getReadScope());
  expect(scope).toBeTruthy();
  expect(await page.evaluate(() => {
    const auth = window.platformAuthStore, user = auth.getCurrentUser();
    return { role: user.role, status: user.status, dev: auth.isDevMode() };
  })).toEqual({ role: 'admin', status: 'active', dev: false });
  const id = 'zz-live-review-' + crypto.randomUUID();
  const key = 'football-session-planner-v3';
  const row = historyRow(id, scope, key, 'Synthetic pending history probe');
  row.createdAt = '2099-01-01T00:00:00.000Z'; // Keep the synthetic row first; never expand real history.
  const foreign = historyRow(id + '-foreign', scope + '-foreign', key, 'Forbidden foreign history probe');
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'football-science-snapshots-compact-v1'))).toBe(false);
  await page.evaluate(scope => { window.__historyProbeScope = scope; }, scope);
  await page.evaluate(seedCompactHistory, [row, foreign]);
  await page.evaluate(async row => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('football-science-data-safety-v1');
      r.onupgradeneeded = () => r.transaction.abort();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').add(row); // Never overwrite an existing copy.
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, row);
  const preserved = await storedProbe(page, id);
  await page.locator('#profileMenuButton').click();
  await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  await page.getByRole('button', { name: 'Review saved browser copies', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies', exact: true });
  for (const source of ['legacy', 'compact']) {
    await dialog.getByLabel('Saved-copy collection').selectOption(source);
    await expect(dialog.getByRole('status')).toContainText('verified browser copies');
    // The synthetic timestamp sorts first; do not expand or export real history.
    const section = dialog.locator('section').filter({ has: page.locator('summary') }).first();
    await section.locator('summary').first().click();
    // Select the synthetic row by payload after expansion, never export user content.
    const target = dialog.locator('section').filter({ hasText: row.storage[key] });
    await expect(target).toHaveCount(1);
    await expect(dialog).not.toContainText(foreign.storage[key]);
    if (source === 'compact') await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await target.getByRole('button', { name: 'Download review file' }).click();
    const download = await downloadPromise;
    const result = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(result.purpose).toBe('review-only');
    expect(result.versions).toEqual([row]);
    expect(result).not.toHaveProperty('storage');
  }
  const downloads = [];
  page.on('download', download => downloads.push(download));
  // Actual authstore event during fresh decoding, with no backend role mutation.
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest;
      window.platformAuthStore.clearCurrentUser();
      return digest(...args);
    };
  });
  await dialog.getByRole('button', { name: 'Download review file' }).click();
  await expect(dialog).toContainText('Account or access changed');
  await expect(dialog).not.toContainText(row.storage[key]);
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  expect(await storedProbe(page, id)).toBe(preserved);
}
