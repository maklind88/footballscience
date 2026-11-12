import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installStorageHealthAppFixture, waitForStorageHealthApp } from './helpers/storage-health-app-fixture.mjs';
import { installSessionStorageFixture, ready, edit, readJournal } from './helpers/session-full-app-storage-fixture.mjs';
const dialog = page => page.getByRole('dialog', { name: 'Saved browser copies', exact: true });
const panel = page => page.locator('[data-snapshot-recovery-drafts]');

async function seed(page, source = 'legacy') {
  return page.evaluate(async source => {
    const { recoveryEnvelope, seedLegacyRecovery } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const row = recoveryEnvelope(window.footballScienceCentralState.getReadScope(), 'zz-explicit-recovery-fixture');
    if (source === 'legacy') await seedLegacyRecovery(row, 'football-science-data-safety-v1');
    else await (await import('/qa/helpers/compact-history-fixture.mjs')).seedCompactHistory([row], source);
    return row;
  }, source);
}
async function open(page, source = 'legacy') {
  await page.locator('#profileMenuButton').click(); await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  await page.getByRole('button', { name: 'Review saved browser copies' }).click();
  if (source !== 'legacy') await dialog(page).getByLabel('Saved-copy collection').selectOption('compact');
}
async function prepare(page) {
  await dialog(page).getByRole('button', { name: 'Create separate Sessions draft', exact: true }).last().click();
  await expect(dialog(page).getByRole('status')).toHaveText('Recovery draft saved on this device. Current work remains unchanged.');
  await expect(panel(page)).toContainText('Prepared for review');
}
async function download(page) {
  const event = page.waitForEvent('download'); await panel(page).getByRole('button', { name: 'Download recovery draft', exact: true }).click();
  return JSON.parse(await readFile(await (await event).path(), 'utf8'));
}

for (const source of ['legacy', 'standalone', 'pooled']) test(`real admin prepares and reopens ${source} recovery without current-state or server writes`, async ({ page }, info) => {
  const { server } = await installStorageHealthAppFixture(page);
  await page.goto('/?workspace=session-planner'); await waitForStorageHealthApp(page);
  await expect.poll(() => server.writes.some(w => w.key === 'football-transfer-room-v1')).toBe(true);
  const row = await seed(page, source), writes = server.writes.length;
  const before = await page.evaluate(() => ({ value: localStorage.getItem('football-session-planner-v3'),
    entries: JSON.parse(localStorage.getItem('football-data-safety-v1')).entries }));
  await open(page, source); await prepare(page);
  const copied = await download(page);
  expect(copied.content.value).toBe(row.storage['football-session-planner-v3']);
  expect(copied.content.entry).toEqual(row.saveContext.entries['football-session-planner-v3']);
  expect(server.writes.length).toBe(writes);
  expect(await page.evaluate(() => ({ value: localStorage.getItem('football-session-planner-v3'),
    entries: JSON.parse(localStorage.getItem('football-data-safety-v1')).entries }))).toEqual(before);
  await dialog(page).getByRole('button', { name: 'Create separate Sessions draft', exact: true }).last().click();
  await expect(dialog(page).getByRole('status')).toContainText('already exists');
  await dialog(page).getByRole('button', { name: 'Close saved copies' }).click();
  await page.reload(); await waitForStorageHealthApp(page); await open(page);
  await dialog(page).getByRole('button', { name: 'Review recovery drafts', exact: true }).click();
  await panel(page).getByRole('button', { name: /Open Sessions draft/ }).click();
  expect(await download(page)).toEqual(copied);
  await panel(page).locator('summary').first().click(); await expect(panel(page)).toContainText('Historical pending objective');
  if (source === 'legacy') await page.screenshot({ path: info.outputPath('sessions-recovery-draft.png') });
});

for (const workState of ['memory', 'pending']) test(`real Sessions ${workState} work and journal survive recovery draft creation`, async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto('/?workspace=session-planner'); await ready(page);
  await seed(page); // Historical copy predates the simulated full journal.
  await page.evaluate(workState => { window.__storageFault.journal = workState === 'memory'; }, workState);
  await edit(page, 'Current unsaved objective must survive');
  if (workState === 'memory') await expect(page.locator('[data-platform-autosave-status]')).toContainText('Not saved on this device');
  else await expect.poll(() => readJournal(page)).toHaveLength(1);
  const working = await page.evaluate(() => window.footballScienceCentralState.getSessionWorkingCopy());
  const journal = await readJournal(page); await open(page); await prepare(page);
  expect(await page.evaluate(() => window.footballScienceCentralState.getSessionWorkingCopy())).toEqual(working);
  expect(await readJournal(page)).toEqual(journal); expect(server.effects).toBe(0);
  await dialog(page).getByRole('button', { name: 'Close saved copies' }).click();
  await expect(page.locator('[data-session-field="objective"]').first()).toHaveValue('Current unsaved objective must survive');
});

test('real auth ABA during recovery hashing cancels write and clears draft preview', async ({ page }) => {
  await installStorageHealthAppFixture(page); await page.goto('/?workspace=session-planner'); await waitForStorageHealthApp(page);
  await seed(page); await open(page);
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest;
      const auth = window.platformAuthStore, user = auth.getCurrentUser();
      auth.clearCurrentUser(); auth.writeUsers([user]); auth.setCurrentUser(user.id);
      return digest(...args);
    };
  });
  await dialog(page).getByRole('button', { name: 'Create separate Sessions draft', exact: true }).last().click();
  await expect(dialog(page)).toContainText('Account or access changed');
  await expect(dialog(page)).not.toContainText('Historical pending objective');
  expect(await page.evaluate(async () => (await (await import('/qa/helpers/history-recovery-draft-fixture.mjs')).recoveryDump())?.drafts.length || 0)).toBe(0);
});

test('quota failure in real history UI never claims a draft was saved', async ({ page }) => {
  await installStorageHealthAppFixture(page); await page.goto('/?workspace=session-planner'); await waitForStorageHealthApp(page);
  await seed(page); await open(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.transaction.db.name === 'football-science-history-drafts-v1') throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });
  await dialog(page).getByRole('button', { name: 'Create separate Sessions draft', exact: true }).last().click();
  await expect(dialog(page).getByRole('status')).toContainText('could not be saved or verified');
  await expect(panel(page)).not.toContainText('Prepared for review');
});

for (const role of ['coach', 'medical', 'team-admin']) test(`${role} cannot enter admin recovery history`, async ({ page }) => {
  const { server } = await installStorageHealthAppFixture(page); server.actor.app_metadata.role = role;
  await page.goto('/?workspace=medical-team'); await waitForStorageHealthApp(page);
  await page.locator('#profileMenuButton').click(); await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Storage health', exact: true }).getByRole('status')).not.toContainText('Checking storage');
  await expect(page.getByRole('button', { name: 'Review saved browser copies' })).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'football-science-history-drafts-v1'))).toBe(false);
});

test('opened recovery dialog fits mobile, prepares offline and clears revoked export access', async ({ page, context }, info) => {
  await installStorageHealthAppFixture(page); await page.goto('/?workspace=session-planner'); await waitForStorageHealthApp(page);
  await seed(page); await open(page);
  await expect(dialog(page).getByRole('button', { name: 'Create separate Sessions draft', exact: true }).last()).toBeVisible();
  // Isolate the new dialog's layout from the existing mobile launcher/profile
  // overlap, recorded in HISTORY_RECOVERY_DRAFT_2026-11-12.md. No forced click.
  await page.setViewportSize({ width: 390, height: 844 }); await context.setOffline(true);
  await prepare(page); await panel(page).locator('summary').first().click();
  await expect(panel(page)).toContainText('Historical pending objective');
  await page.screenshot({ path: info.outputPath('recovery-mobile-offline.png') });
  const bounds = await dialog(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await context.setOffline(false);
  await page.evaluate(() => {
    window.recoveryDownloads = 0; HTMLAnchorElement.prototype.click = function() { recoveryDownloads++; };
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest;
      const auth = window.platformAuthStore, user = auth.getCurrentUser();
      auth.writeUsers([{ ...user, role: 'coach' }]); auth.setCurrentUser(user.id);
      return digest(...args);
    };
  });
  await panel(page).getByRole('button', { name: 'Download recovery draft', exact: true }).click();
  await expect(dialog(page)).toContainText('Account or access changed');
  await expect(dialog(page)).not.toContainText('Historical pending objective');
  expect(await page.evaluate(() => recoveryDownloads)).toBe(0);
  expect(await page.evaluate(async () => (await (await import('/qa/helpers/history-recovery-draft-fixture.mjs')).recoveryDump()).drafts.length)).toBe(1);
});

test('live recovery probe rehearses with real app permissions', async ({ page }) => {
  await installStorageHealthAppFixture(page); await page.goto('/?workspace=session-planner'); await waitForStorageHealthApp(page);
  await (await import('./helpers/recovery-draft-live-probe.mjs')).verifyRecoveryDraftLive(page);
});
