import { expect, test } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';

const day = '2026-10-05';
const medicalKey = 'football-medical-team-v1', profileKey = 'football-player-profiles-v1';
for (const workspace of ['medical-team', 'session-planner']) {
for (const cacheFailure of [false, true]) {
  test(`Centrally saved Medical recommendation survives cold ${workspace} startup and reload (cacheFailure=${cacheFailure})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date((cacheFailure ? '2026-10-07' : day) + 'T16:00:00Z'));
    await installSetPiecesCentralFixture(page);
    if (cacheFailure) await page.addInitScript(key => {
      const setItem = Storage.prototype.setItem;
      window.__qaMedicalCacheFailures = 0;
      Storage.prototype.setItem = function(name, value) {
        if (name === key && JSON.parse(String(value)).records?.some(record =>
          record.id === 'qa-visible-record' && typeof record.actualParticipation === 'number')) {
          window.__qaMedicalCacheFailures++;
          throw new DOMException('Synthetic Medical cache quota', 'QuotaExceededError');
        }
        return setItem.call(this, name, value);
      };
    }, medicalKey);
    const player = { id: 'qa-visible-player', name: 'Synthetic Visibility Player', position: 'Midfielder',
      rosterType: 'squad', countsInSquad: true, status: 'available' };
    const medical = { rosterVersion: 'qa-visibility', selectedDate: day, selectedPlayerId: player.id,
      players: [player], records: [{ id: 'qa-visible-record', playerId: player.id, date: day,
        participation: 50, actualParticipation: 'not-logged', createdAt: day + 'T08:00:00Z' }], injuryPlans: [] };
    const entries = {
      [medicalKey]: JSON.stringify(medical),
      [profileKey]: JSON.stringify({ rosterVersion: 'qa-visibility', players: [player], removedPlayerIds: [] }),
      'football-schedule-v1': JSON.stringify({ events: [{ id: 'qa-training', date: day, type: 'training', title: 'QA training' }] }),
      'football-session-planner-v3': JSON.stringify({ selectedDate: day, sessions: {
        [day]: { date: day, title: 'QA training', blocks: [] },
      } }),
    };
    await page.route('**/api/app-state**', route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 503, json: { ok: false } });
      const keys = new URL(route.request().url()).searchParams.get('keys')?.split(',') || Object.keys(entries);
      return route.fulfill({ json: { ok: true,
        entries: Object.fromEntries(keys.filter(key => key in entries).map(key => [key, entries[key]])),
        metadata: Object.fromEntries(keys.filter(key => key in entries).map(key => [key, { revision: 10 }])),
        absentKeys: keys.filter(key => !(key in entries)),
      } });
    });
    const ready = async () => {
      await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
      await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
    };
    const medicalVisible = async () => {
      await page.getByRole('button', { name: 'Medical', exact: true }).click();
      const dateInput = page.getByLabel('Selected medical date', { exact: true });
      await dateInput.fill(day);
      await dateInput.dispatchEvent('change');
      await dateInput.blur();
      await expect(dateInput).toHaveValue(day);
      // A late verified read must preserve the in-memory date when the cache could not save it.
      await page.evaluate(key => window.dispatchEvent(new CustomEvent('footballscience:central-state-partial', {
        detail: { readKeys: [key] },
      })), medicalKey);
      await expect(dateInput).toHaveValue(day);
      await expect(page.getByRole('button', { name: 'Synthetic Visibility Player 50% training recommendation', exact: true }))
        .toHaveClass(/is-active/);
    };
    const sessionVisible = async () => {
      await page.getByRole('button', { name: 'Sessions', exact: true }).click();
      await page.locator(`[data-session-date="${day}"]`).click();
      await expect(page.getByRole('region', { name: 'Medical availability for selected session', exact: true }))
        .toContainText('1 limited');
    };
    await page.goto('/?workspace=' + workspace);
    await ready();
    await medicalVisible();
    await sessionVisible();
    await page.reload();
    await ready();
    await sessionVisible();
    await medicalVisible();
    if (cacheFailure) expect(await page.evaluate(() => window.__qaMedicalCacheFailures)).toBeGreaterThan(0);
    // Display initialization must not erase the centrally supplied record from the cache.
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).records.some(record => record.id === 'qa-visible-record'), medicalKey)).toBe(true);
  });
}
}
