import { test, expect } from '@playwright/test';
import { createLiveMedicalTestAccount } from './helpers/medical-live-test-account.mjs';
import { medicalKey, digest, requireProof } from './helpers/save-acceptance-staging.mjs';
import { createMedicalJourneyGuard } from './helpers/medical-journey-staging-guard.mjs';
import { verifyJourneyCapability, selectJourneyDay, openJourneyBrowser, openJourneyMedical, verifyStagingJourneyViews } from './helpers/medical-journey-staging-browser.mjs';

test('live medical role sees server training and saves only a synthetic recommendation', async ({ browser }) => {
  const qa = await createLiveMedicalTestAccount();
  const contexts = [], ledger = [];
  let guard, fixture;
  try {
    await verifyJourneyCapability(qa);
    const schedule = await qa.read(qa.primary, 'football-schedule-v1');
    const adminSchedule = await qa.read(qa.peer, 'football-schedule-v1');
    requireProof(schedule.revision === adminSchedule.revision && digest(schedule.state) === digest(adminSchedule.state), 'Medical/admin server schedules differ');
    const dates = ['2026-11-05', '2026-11-06', '2026-11-09'];
    for (const day of dates) requireProof(schedule.state.events?.some(e => e.date === day && e.type === 'training'), 'Expected server training missing: ' + day);
    ledger.push({ stage: 'real-medical-auth-and-server-schedule', role: 'medical', sameAsAdmin: true, dates });
    const baseline = await qa.read(qa.primary, medicalKey), sessions = await qa.read(qa.primary, 'football-session-planner-v3');
    fixture = { run: qa.run, day: selectJourneyDay(sessions.state, schedule.state), player: {
      id: qa.run + '-player', name: 'Synthetic Medical QA ' + qa.run, position: 'Midfielder', rosterType: 'squad', countsInSquad: true, status: 'available',
    } };
    guard = createMedicalJourneyGuard({ ...fixture, actorId: qa.primary.user.id, baseline: baseline.state });
    // Reuse the proven guard: generic-failed blocks ALL aggregate Medical writes.
    // Only the exact new synthetic canonical recommendation reaches production.
    const args = { browser, qa, fixture, guard, mode: 'generic-failed', ledger, contexts };
    const author = await openJourneyBrowser({ ...args, account: qa.primary, writable: true });
    for (const day of dates) {
      await openJourneyMedical(author.page, { ...fixture, day });
      await expect(author.page.getByRole('button', { name: fixture.player.name + ' 50% training recommendation', exact: true })).toBeEnabled();
      ledger.push({ stage: 'server-training-enabled-readonly', date: day });
    }
    await openJourneyMedical(author.page, fixture);
    requireProof(author.errors.length === 0, 'Live request guard rejected prerequisites');
    guard.arm();
    await author.page.getByRole('button', { name: fixture.player.name + ' 50% training recommendation', exact: true }).click();
    await expect(author.page.locator('.medical-message')).toContainText('50% recommendation saved');
    requireProof(ledger.some(e => e.stage === 'canonical-server-response' && e.accepted), 'No real canonical save receipt');
    requireProof(guard.ids().length === 1, 'Exactly one synthetic recommendation required');
    guard.seal();
    const recordId = guard.ids()[0];
    const peer = await openJourneyBrowser({ ...args, account: qa.peer });
    for (const [actor, client] of [['author', author], ['peer', peer]]) {
      await verifyStagingJourneyViews(client.page, fixture, recordId);
      const reads = ledger.filter(e => e.stage === 'read' && e.actor === actor && e.ownIds?.includes(recordId)).length;
      await client.page.reload({ waitUntil: 'domcontentloaded' });
      await verifyStagingJourneyViews(client.page, fixture, recordId);
      requireProof(ledger.filter(e => e.stage === 'read' && e.actor === actor && e.ownIds?.includes(recordId)).length > reads, 'Missing fresh server read after reload');
      requireProof(client.errors.length === 0, 'Live request guard rejected a request');
      ledger.push({ stage: 'medical-and-sessions-reload-passed', actor });
    }
    requireProof(guard.unrelatedUnchanged((await qa.read(qa.primary, medicalKey)).state), 'Other Medical data changed during verification; investigate without restoring');
  } finally {
    try {
      await Promise.all(contexts.map(c => c.close()));
      if (guard) {
        for (const id of guard.ids()) {
          const current = await qa.read(qa.primary, medicalKey);
          const row = current.state.records?.find(r => r.id === id);
          if (!row) continue;
          if (!row.archivedAt) {
            await qa.identity();
            const body = guard.archiveEvent(id, current.state, new Date().toISOString());
            const response = await fetch(qa.origin + '/api/medical', { method: 'POST', headers: { Authorization: 'Bearer ' + qa.primary.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000) });
            const payload = await response.json();
            requireProof(response.ok && payload.ok && payload.canonicalStored === true, 'Synthetic archival receipt missing');
          }
          requireProof((await qa.read(qa.primary, medicalKey)).state.records?.find(r => r.id === id)?.archivedAt, 'Synthetic recommendation remains active');
        }
        requireProof(!(await qa.read(qa.primary, medicalKey)).state.players?.some(p => p.id === fixture.player.id), 'Unexpected persisted synthetic roster player');
        ledger.push({ stage: 'synthetic-record-archived-no-roster-write', ids: guard.ids() });
      }
    } finally {
      try { await qa.finish(); ledger.push({ stage: 'test-account-deleted-sessions-revoked' }); }
      finally { console.log(JSON.stringify({ medicalLiveVerification: ledger })); }
    }
  }
});
