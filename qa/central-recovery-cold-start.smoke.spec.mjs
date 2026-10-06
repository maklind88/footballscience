import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import transport from '../api/_lib/session-state-transport.js';
import { applySessionDateChange, sessionDateValue } from '../src/modules/session-planner/session-save-protocol.mjs';

const medicalKey = 'football-medical-team-v1', sessionsKey = 'football-session-planner-v3';
const day = '2026-10-06';

for (const offline of [false, true]) {
test(`Sessions saves and reviews its verified date despite unrelated recovery failure (offline=${offline})`, async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  const medical = { players: [{ id: 'qa-player', name: 'Synthetic Player' }], records: [
    { id: 'qa-record', playerId: 'qa-player', date: day, participation: 100, comment: 'Central', createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z' }], injuryPlans: [] };
  let sessions = { selectedDate: day, sessions: { [day]: { date: day, title: 'Synthetic session', selectedBlockId: 'qa-block',
    blocks: [{ id: 'qa-block', title: 'Original exercise', objective: 'Original objective', minutes: 20 }] } } };
  let revision = 10, medicalDenied = 0, sessionWrites = 0, denySession = offline, failSessionRead = false;
  await page.addInitScript(({ medical, medicalKey }) => {
    const draft = structuredClone(medical);
    draft.records[0].comment = 'Retained Medical draft';
    draft.records[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem(medicalKey, JSON.stringify(draft));
    localStorage.setItem('football-data-safety-v1', JSON.stringify({ entries: { [medicalKey]: {
      pendingCentralSync: true, pendingBaseRevision: 10, serverRevision: 10, writes: 1,
      principalScope: JSON.stringify(['set-pieces-coach', 'set-pieces-org', 'club-ncc', 'team-ncc-first', 'admin']),
    } } }));
  }, { medical, medicalKey });
  await page.route('**/api/app-state**', async route => {
    if (route.request().method() === 'GET' && failSessionRead) return route.fulfill({ status: 503, json: { ok: false } });
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true,
      entries: { [medicalKey]: JSON.stringify(medical), [sessionsKey]: JSON.stringify(sessions) },
      metadata: { [medicalKey]: { revision: 10 }, [sessionsKey]: { revision } }, absentKeys: [] } });
    const body = route.request().postDataJSON();
    if (body.key === medicalKey) {
      medicalDenied++;
      return route.fulfill({ status: 503, json: { ok: false, reason: 'Synthetic Medical recovery unavailable' } });
    }
    if (body.key !== sessionsKey) return route.fulfill({ json: { ok: true } });
    sessionWrites++;
    if (denySession) return route.abort('failed');
    const change = JSON.parse(await transport.decodeSessionStateValue(body.key, body.sessionChange));
    const applied = applySessionDateChange(sessions, change);
    if (!applied.ok) return route.fulfill({ status: 409, json: { ok: false, currentRevision: revision, conflicts: applied.conflicts } });
    sessions = applied.state; revision++;
    return route.fulfill({ json: { ok: true, metadata: { revision }, sessionChange: JSON.stringify({
      id: change.id, date: change.date, value: sessionDateValue(sessions, change.date),
    }) } });
  });
  await page.goto('/?workspace=session-planner', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__footballScienceAppReady && Boolean(window.footballScienceCentralState?.getStatus().lastError));
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.locator(`[data-session-date="${day}"]`).click();
  const field = page.locator('[data-session-field="objective"]').first();
  await expect(field).toHaveValue('Original objective');
  expect(medicalDenied).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.footballScienceCentralState.isHydrated())).toBe(false);
  if (offline) await page.context().setOffline(true);
  await field.fill('Independent training edit'); await field.dispatchEvent('change'); await field.blur();
  await expect.poll(() => sessionWrites, { timeout: 5000 }).toBeGreaterThan(0);
  if (offline) {
    await expect(page.locator('[data-platform-autosave-status]')).not.toHaveClass(/is-saved/);
    sessions.sessions[day].blocks[0].title = 'Accepted colleague title'; revision++;
    denySession = false;
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  }
  await expect.poll(() => sessions.sessions[day].blocks[0].objective, { timeout: 10000 }).toBe('Independent training edit');
  if (offline) expect(sessions.sessions[day].blocks[0].title).toBe('Accepted colleague title');
  await expect(page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
  const deniedBefore = medicalDenied;
  expect(await page.evaluate(() => window.footballScienceCentralState.hydrateSessionState())).toBe(true);
  expect(medicalDenied).toBe(deniedBefore);
  expect(await page.evaluate(() => window.footballScienceCentralState.isHydrated())).toBe(false);
  expect(await page.evaluate(() => Boolean(window.footballScienceCentralState.getStatus().lastError))).toBe(true);
  // An accepted same-field edit must remain central while the local version is reviewed.
  sessions.sessions[day].blocks[0].objective = 'Accepted colleague change'; revision++;
  await field.fill('Conflicting local change'); await field.dispatchEvent('change'); await field.blur();
  await expect.poll(() => page.evaluate(async () => (await window.footballScienceCentralState.getSessionSaveReviews()).length)).toBe(1);
  failSessionRead = true;
  await page.getByRole('button', { name: 'Review local saves', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review local saves' }).getByRole('status')).toHaveText('Central training could not be refreshed. Local copies are retained.');
  expect(await page.evaluate(async () => (await window.footballScienceCentralState.getSessionSaveReviews()).length)).toBe(1);
  await page.getByRole('dialog', { name: 'Review local saves' }).getByRole('button', { name: 'Close', exact: true }).click();
  failSessionRead = false;
  await page.getByRole('button', { name: 'Review local saves', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review local saves' });
  await expect(dialog.getByRole('status')).toHaveText('1 local version to review');
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Keep central version', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('No unresolved local versions.');
  expect(sessions.sessions[day].blocks[0].objective).toBe('Accepted colleague change');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem('football-data-safety-v1')).entries[key].pendingCentralSync, medicalKey)).toBe(true);
});

}

test('Sessions readiness is revoked on organization change until that organization is read', async ({ page }) => {
  const fixture = await installSetPiecesCentralFixture(page);
  let hold = false, held = false, release;
  const barrier = new Promise(resolve => { release = resolve; });
  await page.route('**/api/app-state**', async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ json: { ok: true } });
    if (hold && new URL(route.request().url()).searchParams.get('keys')?.split(',').includes(sessionsKey)) {
      held = true; await barrier;
    }
    return route.fulfill({ json: { ok: true, entries: { [sessionsKey]: '{"sessions":{}}' },
      metadata: { [sessionsKey]: { revision: 10, organizationId: fixture.actor.app_metadata.organizationId } }, absentKeys: [] } });
  });
  await page.goto('/?workspace=session-planner');
  await page.waitForFunction(key => window.footballScienceCentralState?.isKeyHydrated(key), sessionsKey);
  fixture.actor.app_metadata.organizationId = 'other-synthetic-organization';
  hold = true;
  try {
    await page.evaluate(user => {
      window.__qaSetPiecesSession = { access_token: 'qa-other-org-token', user };
      void window.__qaSetPiecesAuth('SIGNED_IN', window.__qaSetPiecesSession);
    }, fixture.actor);
    await expect.poll(() => held).toBe(true);
    expect(await page.evaluate(key => window.footballScienceCentralState.isKeyHydrated(key), sessionsKey)).toBe(false);
    hold = false; release();
    await page.waitForFunction(key => window.footballScienceCentralState?.isKeyHydrated(key), sessionsKey);
    expect(await page.evaluate(() => window.footballScienceCentralState.getReadScope())).toContain('other-synthetic-organization');
  } finally { hold = false; release(); }
});

test('failed workspace and notification writes do not strand a real Sessions editor save', async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  let state = { selectedDate: day, sessions: { [day]: { date: day, title: 'Synthetic session', selectedBlockId: 'qa-block',
    blocks: [{ id: 'qa-block', title: 'Synthetic exercise', objective: 'Original objective', minutes: 20 }] } } };
  const otherDay = '2026-10-05';
  const otherDate = { date: otherDay, title: 'Existing older session', blocks: [] };
  state.sessions[otherDay] = structuredClone(otherDate);
  let revision = 10, blocked = 0;
  const failedKeys = ['football-workspace-hub-v3', 'football-dashboard-notification-seen-v1'];
  await page.route('**/api/app-state**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true,
      entries: { [sessionsKey]: JSON.stringify(state) }, metadata: { [sessionsKey]: { revision } }, absentKeys: [] } });
    const body = route.request().postDataJSON();
    if (failedKeys.includes(body.key)) { blocked++; return route.abort('blockedbyclient'); }
    if (body.key !== sessionsKey) return route.fulfill({ json: { ok: true } });
    const change = JSON.parse(await transport.decodeSessionStateValue(body.key, body.sessionChange));
    if (change.date !== day) return route.abort('blockedbyclient');
    const result = applySessionDateChange(state, change);
    expect(result.ok).toBe(true); state = result.state; revision++;
    return route.fulfill({ json: { ok: true, metadata: { revision }, sessionChange: JSON.stringify({
      id: change.id, date: change.date, value: sessionDateValue(state, change.date),
    }) } });
  });
  await page.goto('/?workspace=session-planner');
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState.isHydrated());
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.locator(`[data-session-date="${day}"]`).click();
  const field = page.locator('[data-session-field="objective"]').first();
  await expect(field).toHaveValue('Original objective');
  await expect.poll(() => blocked).toBeGreaterThan(0);
  await field.fill('Saved despite unrelated failure'); await field.dispatchEvent('change'); await field.blur();
  await expect.poll(() => state.sessions[day].blocks[0].objective).toBe('Saved despite unrelated failure');
  expect(state.sessions[otherDay]).toEqual(otherDate);
  await expect(page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
  expect(await page.evaluate(keys => keys.some(key => JSON.parse(localStorage.getItem('football-data-safety-v1')).entries[key]?.pendingCentralSync), failedKeys)).toBe(true);
});
