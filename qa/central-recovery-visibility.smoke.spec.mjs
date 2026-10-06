import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
const medicalKey = 'football-medical-team-v1', sessionKey = 'football-session-planner-v3', manifestKey = 'football-data-safety-v1';
const day = '2026-10-06';

for (const failure of [503, 403, 'network']) {
test(`failed Medical recovery keeps verified Sessions visible without acknowledging the draft (${failure})`, async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  const medical = { players: [{ id: 'qa-player', name: 'Synthetic Player' }], records: [
    { id: 'qa-record', playerId: 'qa-player', date: day, participation: 100, comment: 'Central', createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z' }], injuryPlans: [] };
  const sessions = { selectedDate: day, sessions: { [day]: { id: 'qa-session', date: day, title: 'Synthetic session', selectedBlockId: 'qa-block',
    blocks: [{ id: 'qa-block', title: 'Original exercise', objective: 'Original objective', minutes: 20 }] } } };
  const entries = { [medicalKey]: JSON.stringify(medical), [sessionKey]: JSON.stringify(sessions) };
  const revisions = { [medicalKey]: 10, [sessionKey]: 10 };
  let denyMedical = false;
  const deniedWrites = [];
  await page.route('**/api/app-state**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, entries,
      metadata: Object.fromEntries(Object.keys(entries).map(key => [key, { revision: revisions[key], organizationId: 'set-pieces-org' }])), absentKeys: [] } });
    const body = route.request().postDataJSON();
    if (body.key === medicalKey && denyMedical) {
      deniedWrites.push(body);
      if (failure === 'network') return route.abort('failed');
      return route.fulfill({ status: failure, json: { ok: false, reason: 'Synthetic Medical write unavailable' } });
    }
    if (body.key === medicalKey) { entries[medicalKey] = body.value; revisions[medicalKey]++; }
    return route.fulfill({ json: { ok: true, key: body.key, value: body.value, metadata: { revision: revisions[body.key] || 1 } } });
  });
  await page.goto('/?workspace=session-planner', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated?.());
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.locator(`[data-session-date="${day}"]`).click();
  await expect(page.locator('[data-session-field="title"]').first()).toHaveValue('Original exercise');
  denyMedical = true;
  await page.evaluate(({ medicalKey, manifestKey }) => {
    const current = JSON.parse(localStorage.getItem(medicalKey));
    const record = current.records.find(r => r.id === 'qa-record');
    record.comment = 'Unsaved local Medical work'; record.updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem(medicalKey, JSON.stringify(current));
    window.__qaPartial = 0; window.__qaReady = 0;
    window.addEventListener('footballscience:central-state-partial', () => window.__qaPartial++);
    window.addEventListener('footballscience:central-state-ready', () => window.__qaReady++);
  }, { medicalKey, manifestKey });
  await expect.poll(() => deniedWrites.length).toBeGreaterThan(0);
  sessions.sessions[day].blocks[0].title = 'Accepted colleague exercise';
  entries[sessionKey] = JSON.stringify(sessions); revisions[sessionKey]++;
  expect(await page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }))).toBe(false);
  expect(deniedWrites.length).toBeGreaterThan(0);
  // A valid read must become visible even when another module's write fails.
  await expect(page.locator('[data-session-field="title"]').first()).toHaveValue('Accepted colleague exercise');
  const result = await page.evaluate(({ medicalKey, manifestKey }) => ({
    error: Boolean(window.footballScienceCentralState.getStatus().lastError), partial: window.__qaPartial, ready: window.__qaReady,
    pending: JSON.parse(localStorage.getItem(manifestKey)).entries[medicalKey].pendingCentralSync,
    canAutoSync: window.footballScienceCentralState.canAutoSyncKey(medicalKey),
    rawComment: JSON.parse(window.__setPiecesNativeGet.call(localStorage, medicalKey)).records.find(r => r.id === 'qa-record').comment,
    comment: JSON.parse(localStorage.getItem(medicalKey)).records.find(r => r.id === 'qa-record').comment,
  }), { medicalKey, manifestKey });
  expect(result).toMatchObject({ rawComment: 'Unsaved local Medical work', error: true, partial: 1, ready: 0, pending: true, comment: 'Unsaved local Medical work' });
  denyMedical = false;
  expect(await page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }))).toBe(true);
  expect(JSON.parse(entries[medicalKey]).records.find(r => r.id === 'qa-record').comment).toBe('Unsaved local Medical work');
  expect(await page.evaluate(() => window.footballScienceCentralState.getStatus().lastError)).toBe('');
});
}
