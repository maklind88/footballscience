import { expect } from '@playwright/test';

export const journeyDay = '2026-10-29';
export const journeyPlayer = { id: 'qa-journey-player', name: 'Synthetic Journey Player', position: 'Midfielder',
  rosterType: 'squad', countsInSquad: true, status: 'available' };
export const journeyKey = 'football-medical-team-v1';
export const recommendationButton = page => page.getByRole('button', { name: 'Synthetic Journey Player 50% training recommendation', exact: true });
export const recommendationMessage = page => page.locator('.medical-message');

export async function openMedicalJourney(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden && Number(window.footballScienceCentralState?.getStatus?.().metadata?.["football-medical-team-v1"]?.revision) > 0);
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.getByRole('button', { name: 'Medical', exact: true }).click();
  const date = page.getByLabel('Selected medical date', { exact: true });
  await date.fill(journeyDay); await date.dispatchEvent('change'); await date.blur();
  await expect(recommendationButton(page)).toBeVisible();
}

export async function verifyJourneyViews(page, recordId) {
  await openMedicalJourney(page);
  await expect(recommendationButton(page)).toHaveClass(/is-active/);
  // Match the submitted identity/date/value, not merely a count of limited players.
  const observed = await page.evaluate(async ({ playerId, day, key }) => {
    const medical = await import('/src/modules/medical/medical-runtime-accessors.mjs');
    const record = medical.getLatestMedicalRecord(playerId, day);
    return { recordId: record?.id, date: record?.date, participation: record?.participation,
      revision: window.footballScienceCentralState.getStatus().metadata?.[key]?.revision,
      scope: window.footballScienceCentralState.getReadScope() };
  }, { playerId: journeyPlayer.id, day: journeyDay, key: journeyKey });
  expect(observed).toMatchObject({ recordId, date: journeyDay, participation: 50 });
  expect(observed.scope).toBeTruthy(); expect(observed.revision).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.locator(`[data-session-date="${journeyDay}"]`).click();
  const panel = page.getByRole('region', { name: 'Medical availability for selected session', exact: true });
  await expect(panel).toContainText('1 limited');
  await expect(panel.locator('.is-availability-50 small')).toHaveText('1');
  return observed;
}
