import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { recoveryEnvelope } from './history-recovery-draft-fixture.mjs';

// Disposable authenticated QA profile only. Synthetic history is add-only and
// never enters module storage or central writes. No QA imports run on Live.
async function preservedState(page, ids) {
  return page.evaluate(async ids => {
    const read = async (name, store) => {
      if (!(await indexedDB.databases()).some(d => d.name === name && d.version)) return [];
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name); r.onupgradeneeded = () => r.transaction.abort();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      try { return await new Promise((resolve, reject) => {
        const tx = db.transaction(store), r = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error);
      }); } finally { db.close(); }
    };
    const key = 'football-session-planner-v3';
    return {
      native: localStorage.getItem(key), entry: JSON.parse(localStorage.getItem('football-data-safety-v1') || '{}').entries?.[key],
      working: window.footballScienceCentralState.getSessionWorkingCopy(),
      journal: (await read('football-science-data-safety-v1', 'latest')).filter(r => r.id?.startsWith('session-save:')),
      sources: (await read('football-science-data-safety-v1', 'snapshots')).filter(r => ids.includes(r.id)),
      drafts: await read('football-science-history-drafts-v1', 'drafts'),
      catalog: await read('football-science-history-drafts-v1', 'catalog'),
      compactAbsent: !(await indexedDB.databases()).some(d => d.name === 'football-science-snapshots-compact-v1'),
    };
  }, ids);
}
export async function verifyRecoveryDraftLive(page) {
  expect(await page.evaluate(() => {
    const auth = window.platformAuthStore, user = auth.getCurrentUser();
    return { role: user.role, status: user.status, dev: auth.isDevMode() };
  })).toEqual({ role: 'admin', status: 'active', dev: false });
  await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  const scope = await page.evaluate(() => window.footballScienceCentralState.getReadScope());
  expect(scope).toBeTruthy();
  const rows = [0, 1].map(i => {
    const row = recoveryEnvelope(scope, 'zz-live-recovery-' + crypto.randomUUID());
    row.createdAt = `2099-01-0${2 - i}T00:00:00.000Z`;
    return row;
  });
  await page.evaluate(async rows => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('football-science-data-safety-v1');
      r.onupgradeneeded = () => r.transaction.abort();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      for (const row of rows) tx.objectStore('snapshots').add(row);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }, rows);
  const ids = rows.map(r => r.id), before = await preservedState(page, ids);
  expect(before.compactAbsent).toBe(true); expect(before.drafts).toEqual([]);
  const open = async () => {
    await page.locator('#profileMenuButton').click();
    await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
    await page.getByRole('button', { name: 'Review saved browser copies', exact: true }).click();
  };
  await open();
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies', exact: true });
  const panel = dialog.locator('[data-snapshot-recovery-drafts]');
  const create = dialog.getByRole('button', { name: 'Create separate Sessions draft', exact: true });
  // Future timestamps place only our synthetic rows first. Never expand real copies.
  await expect(create.first()).toBeVisible();
  await create.first().click();
  await expect(dialog.getByRole('status')).toContainText('Recovery draft saved on this device');
  await expect(panel).toContainText('Prepared for review');
  const event = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download recovery draft', exact: true }).click();
  const result = JSON.parse(await readFile(await (await event).path(), 'utf8'));
  expect(result.content.value).toBe(rows[0].storage['football-session-planner-v3']);
  expect(result.content.entry).toEqual(rows[0].saveContext.entries['football-session-planner-v3']);
  expect(result.content.source.id).toBe(rows[0].id);
  await create.first().click(); await expect(dialog.getByRole('status')).toContainText('already exists');
  const retained = await preservedState(page, ids);
  expect(retained.drafts).toHaveLength(1);
  expect(retained.catalog).toHaveLength(1);
  expect({ ...retained, drafts: [], catalog: [] }).toEqual(before);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    window.__restoreRecoveryAdd = () => { IDBObjectStore.prototype.add = add; };
    IDBObjectStore.prototype.add = function(...args) {
      if (this.transaction.db.name === 'football-science-history-drafts-v1') throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });
  try {
    await create.nth(1).click();
    await expect(dialog.getByRole('status')).toContainText('could not be saved or verified');
    expect(await preservedState(page, ids)).toEqual(retained);
  } finally { await page.evaluate(() => window.__restoreRecoveryAdd()); }
  await dialog.getByRole('button', { name: 'Close saved copies' }).click();
  await open(); await dialog.getByRole('button', { name: 'Review recovery drafts', exact: true }).click();
  await panel.getByRole('button', { name: /Open Sessions draft/ }).click();
  await panel.locator('summary').first().click(); await expect(panel).toContainText('Historical pending objective');
  const downloads = []; page.on('download', d => downloads.push(d));
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest; window.platformAuthStore.clearCurrentUser();
      return digest(...args);
    };
  });
  await panel.getByRole('button', { name: 'Download recovery draft', exact: true }).click();
  await expect(dialog).toContainText('Account or access changed');
  await expect(panel.getByRole('button', { name: 'Download recovery draft', exact: true })).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  const afterRevocation = await preservedState(page, ids);
  expect(afterRevocation.sources).toEqual(retained.sources);
  expect(afterRevocation.drafts).toEqual(retained.drafts);
  expect(afterRevocation.catalog).toEqual(retained.catalog);
  expect(afterRevocation.compactAbsent).toBe(true);
}
