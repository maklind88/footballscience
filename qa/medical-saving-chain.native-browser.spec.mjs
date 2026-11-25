import { expect, test } from '@playwright/test';
import { id } from './helpers/relations-permissions-postgres.mjs';
import { medicalConfirmationPostgres } from './helpers/medical-confirmation-postgres.mjs';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { medicalKey, sessionsKey } from './helpers/save-acceptance-staging.mjs';
import { guardSavedWorkLoopback } from './helpers/saved-work-loopback-browser.mjs';

const day = '2026-10-05';
const emptyDay = '2026-10-06';
const profileKey = 'football-player-profiles-v1';
const team = 'qa-medical-visibility-team';
const player = { id: 'qa-medical-visibility-player', name: 'Synthetic Visibility Player', position: 'Midfielder',
  rosterType: 'squad', countsInSquad: true, status: 'available', teamId: team };
const record = { id: 'qa-medical-visibility-record', playerId: player.id, date: day, participation: 50,
  actualParticipation: 'not-logged', createdAt: `${day}T08:00:00Z`, updatedAt: `${day}T08:00:00Z`,
  comment: 'Synthetic private marker', shareWithCoach: false };

function actor(number, role, teamId = team) {
  return { id: id(number), email: `medical-chain-${number}@test.invalid`,
    app_metadata: { role, status: 'active' }, user_metadata: { firstName: 'Synthetic', lastName: role, teamId } };
}
const credentials = user => ({ authorization: `Bearer qa-set-pieces-token-${user.id}` });
const medicalButton = (page, percentage = 50) => page.getByRole('button', {
  name: `${player.name} ${percentage}% training recommendation`, exact: true,
});
const availability = page => page.getByRole('region', { name: 'Medical availability for selected session', exact: true });
const bucket = (page, percentage = 50) => availability(page).locator(`.session-medical-bucket.is-availability-${percentage} small`);

function readsMedical(request) {
  const url = new URL(request.url());
  const keys = url.searchParams.get('keys');
  return request.method() === 'GET' && url.pathname === '/api/app-state' && (!keys || keys.split(',').includes(medicalKey));
}

async function inspectMedical(page, date, expected) {
  await page.getByRole('button', { name: 'Medical', exact: true }).click();
  const dateInput = page.getByLabel('Selected medical date', { exact: true });
  await dateInput.fill(date);
  await dateInput.dispatchEvent('change');
  await dateInput.blur();
  await expect(dateInput).toHaveValue(date);
  await expect(medicalButton(page)).toBeVisible();
  if (expected) await expect(medicalButton(page)).toHaveClass(/is-active/);
  else {
    await expect(medicalButton(page)).not.toHaveClass(/is-active/);
    await expect(page.locator(`[data-medical-roster-row="${player.id}"]`)).toHaveClass(/medical-tone-unset/);
  }
}

async function inspectSessions(page, date, expected) {
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.locator(`[data-session-date="${date}"]`).click();
  await expect(bucket(page)).toHaveText(expected ? '1' : '0');
  if (expected) await expect(availability(page)).toContainText('1 limited');
}

test('committed Medical recommendation is visible in either cold-open order under cache pressure', async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const database = await medicalConfirmationPostgres({ seedMedical: false });
  const contexts = [];
  const clinician = actor(1, 'medical');
  const medicalFirst = actor(2, 'coach');
  const sessionsFirst = actor(3, 'coach');
  const otherTeam = actor(4, 'scout', 'qa-medical-visibility-other-team');
  const actors = new Map([clinician, medicalFirst, sessionsFirst, otherTeam].map(user => [credentials(user).authorization, user]));
  const request = (user, url, body) => database.request({ method: body ? 'POST' : 'GET', url, headers: credentials(user), body }, actors);
  const read = user => request(user, `/api/app-state?keys=${medicalKey}&fresh=1`);
  const measurements = [];
  let unexpectedMedicalWrites = 0;
  let blockedUnrelatedWrites = 0;

  async function open(user, workspace, { quota = false, pause = false } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    contexts.push(context);
    await guardSavedWorkLoopback(context, baseURL);
    const page = await context.newPage();
    const auth = await installSetPiecesCentralFixture(page);
    auth.actor = user;
    await page.clock.setFixedTime(new Date(`${emptyDay}T16:00:00Z`));
    if (quota) await page.addInitScript(({ key, target }) => {
      const setItem = Storage.prototype.setItem;
      window.__qaVisibilityQuotaDenials = 0;
      Storage.prototype.setItem = function (name, value) {
        if (name === key && JSON.parse(String(value)).records?.some(row => row.id === target)) {
          window.__qaVisibilityQuotaDenials++;
          throw new DOMException('Synthetic Medical cache pressure', 'QuotaExceededError');
        }
        return setItem.call(this, name, value);
      };
    }, { key: medicalKey, target: record.id });
    const unblock = Promise.withResolvers();
    await page.route('**/api/medical', async route => {
      const request = route.request();
      if (request.method() !== 'GET') {
        unexpectedMedicalWrites++;
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      const { status, json } = await database.request({ method: 'GET', url: '/api/medical',
        headers: await request.allHeaders() }, actors);
      return route.fulfill({ status, json });
    });
    await page.route('**/api/app-state**', async route => {
      const request = route.request();
      if (request.method() !== 'GET') {
        const body = request.postDataJSON();
        if (body?.key === medicalKey || Object.hasOwn(body?.entries || {}, medicalKey)) unexpectedMedicalWrites++;
        else blockedUnrelatedWrites++;
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      const url = new URL(request.url());
      const { status, json } = await database.request({ method: 'GET', url: url.pathname + url.search,
        headers: await request.allHeaders() }, actors);
      // Hold delivery only, so observing the loading UI cannot stall the database work.
      if (pause && readsMedical(request)) await unblock.promise;
      return route.fulfill({ status, json });
    });
    const requested = pause ? page.waitForRequest(readsMedical) : null;
    const delivered = pause ? page.waitForResponse(response => readsMedical(response.request())) : null;
    requested?.catch(() => {});
    delivered?.catch(() => {});
    await page.goto(`/?workspace=${workspace}`, { waitUntil: 'domcontentloaded' });
    if (pause) {
      try {
        await requested;
        const confirmedBeforeDelivery = await page.evaluate(playerId => {
          const count = document.querySelector('.session-medical-bucket.is-availability-50 small')?.textContent;
          const selected = document.querySelector(`[data-medical-quick-recommend="${playerId}"][data-medical-quick-participation="50"].is-active`);
          return Number(count) > 0 || Boolean(selected);
        }, player.id);
        expect(confirmedBeforeDelivery).toBe(false);
      } finally { unblock.resolve(); }
      const response = await delivered;
      expect(response.ok()).toBe(true);
      const payload = await response.json();
      expect(JSON.parse(payload.entries[medicalKey]).records).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: record.id, date: day, participation: 50 }),
      ]));
    }
    await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
    await expect.poll(() => page.evaluate(() => JSON.parse(window.footballScienceCentralState.getReadScope() || '[]').slice(3)))
      .toEqual([user.user_metadata.teamId, user.app_metadata.role]);
    const closeDashboard = page.locator('#dashboardModalRoot button[data-dashboard-modal-close]');
    if (await closeDashboard.isVisible()) await closeDashboard.click();
    return page;
  }

  try {
    await database.seedState(profileKey, 'player-profiles', { rosterVersion: 'qa-medical-visibility', players: [player], removedPlayerIds: [] });
    await database.seedState('football-schedule-v1', 'schedule', { events: [day, emptyDay].map(date => ({
      id: `qa-training-${date}`, title: 'Synthetic training', date, type: 'training',
    })) });
    await database.seedState(sessionsKey, 'session-planner', { selectedDate: day, sessions: Object.fromEntries([day, emptyDay].map(date =>
      [date, { date, title: 'Synthetic training', blocks: [] }])) });

    const missing = await read(medicalFirst);
    expect(missing.status).toBe(200);
    expect(missing.json.absentKeys).toContain(medicalKey);
    expect(Object.hasOwn(missing.json.entries, medicalKey)).toBe(false);
    await database.seedState(medicalKey, 'medical-team', { selectedDate: day, selectedPlayerId: player.id, rosterVersion: 'qa-medical-visibility',
      players: [player], records: [], injuryPlans: [] }, 'medical-records');
    const accepted = await request(clinician, '/api/medical', { eventType: 'recommendation-saved', playerId: player.id,
      idempotencyKey: 'qa-medical-visibility-save', payload: { record } });
    expect(accepted.status).toBe(200);
    expect(accepted.json.canonicalStored).toBe(true);
    const acceptedAt = performance.now();
    const canonical = await database.state();
    expect(canonical.records.filter(row => row.id === record.id)).toEqual([record]);

    const permitted = await read(medicalFirst);
    expect(permitted.status).toBe(200);
    expect(permitted.json.metadata[medicalKey].revision).toBe(accepted.json.revision);
    expect(permitted.json.medicalRecoveryRead.private).toBe(false);
    expect(JSON.parse(permitted.json.entries[medicalKey])).toMatchObject({ securityView: 'coach-safe', records: [
      { id: record.id, date: day, participation: 50, comment: '', shareWithCoach: false },
    ] });
    expect((await read(clinician)).json.medicalRecoveryRead.private).toBe(true);
    const denied = await read(otherTeam);
    expect(denied.status).toBe(200);
    expect(Object.hasOwn(denied.json.entries, medicalKey)).toBe(false);
    expect(denied.json.absentKeys).not.toContain(medicalKey);

    const medical = await open(medicalFirst, 'medical-team');
    await inspectMedical(medical, day, true);
    measurements.push({ firstView: 'medical', receiptToVisibleMs: Math.round(performance.now() - acceptedAt) });
    await inspectSessions(medical, day, true);

    const sessions = await open(sessionsFirst, 'session-planner', { quota: true, pause: true });
    await inspectSessions(sessions, day, true);
    measurements.push({ firstView: 'sessions', receiptToVisibleMs: Math.round(performance.now() - acceptedAt) });
    await inspectMedical(sessions, day, true);
    await expect.poll(() => sessions.evaluate(() => window.__qaVisibilityQuotaDenials)).toBeGreaterThan(0);
    await inspectSessions(sessions, emptyDay, false);
    // The app may include its bundled roster in addition to the fixture player.
    await expect(availability(sessions)).toContainText(/\b[1-9]\d* not set\b/);
    await inspectMedical(sessions, emptyDay, false);

    const restricted = await open(otherTeam, 'session-planner');
    await inspectSessions(restricted, day, false);
    await expect(restricted.getByRole('button', { name: 'Medical', exact: true })).toHaveCount(0);
    expect(unexpectedMedicalWrites).toBe(0);
    expect((await database.state()).records).toEqual(canonical.records);
    await info.attach('medical-visibility-measurements', { body: JSON.stringify({ measurements, blockedUnrelatedWrites, backend: 'native-postgresql',
      browserAuth: 'synthetic', httpBoundary: 'real API handlers with synthetic Auth and PostgREST transport' }), contentType: 'application/json' });
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await database.db.close();
  }
});
