import { exerciseMedicalReconnect } from './helpers/medical-reconnect-scenario.mjs';
import { test, expect } from '@playwright/test';
import { createStagingAcceptance, medicalKey, requireProof } from './helpers/save-acceptance-staging.mjs';
import { verifySaveAcceptanceFrontend } from './helpers/save-acceptance-frontend.mjs';
import { createMedicalJourneyGuard } from './helpers/medical-journey-staging-guard.mjs';
import { verifyJourneyCapability, selectJourneyDay, openJourneyBrowser, verifyStagingJourneyViews } from './helpers/medical-journey-staging-browser.mjs';

// Dedicated opt-in config only. No candidate overlays, screenshots, traces, video
// or clinical payload attachments. No production origin is accepted by setup.
for (const mode of ['normal', 'lost-response', 'generic-failed', 'canonical-failed', 'peer-archived']) {
  test(`new authenticated Medical recommendation reaches a cold peer: ${mode}`, async ({ browser }) => {
    requireProof(process.env.SAVE_QA_CLIENT_CANDIDATE !== '1', 'This acceptance requires deployed reviewed assets');
    await verifySaveAcceptanceFrontend({ baseUrl: process.env.STAGING_QA_BASE_URL });
    const qa = await createStagingAcceptance();
    const contexts = [], ledger = [];
    let guard, fixture;
    // This helper is only used for an already guarded run-owned archival event.
    const archive = async (body, account = qa.primary) => {
      await qa.identity();
      let response, payload;
      try {
        response = await fetch(qa.origin + '/api/medical', { method: 'POST', redirect: 'error',
          headers: { Authorization: 'Bearer ' + account.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        payload = await response.json();
      } catch { throw new Error('Synthetic record archival transport failed; content suppressed'); }
      requireProof(response.ok && payload.ok && payload.canonicalStored === true, 'Synthetic record archival was not confirmed: ' + JSON.stringify({ status: response.status, ok: payload.ok === true, stored: payload.stored === true, canonicalStored: payload.canonicalStored === true, enabled: payload.enabled === true }));
    };
    try {
      await verifyJourneyCapability(qa);
      const baseline = await qa.read(qa.primary, medicalKey);
      const sessions = await qa.read(qa.primary, 'football-session-planner-v3');
      const schedule = await qa.read(qa.primary, 'football-schedule-v1');
      const day = selectJourneyDay(sessions.state, schedule.state);
      fixture = { run: qa.run, day, player: { id: qa.run + '-player', name: 'Synthetic Journey ' + qa.run,
        position: 'Midfielder', rosterType: 'squad', countsInSquad: true, status: 'available' } };
      guard = createMedicalJourneyGuard({ ...fixture, actorId: qa.primary.user.id, baseline: baseline.state });
      const author = await openJourneyBrowser({ browser, qa, account: qa.primary, fixture, guard, mode, ledger, contexts, writable: true });
      requireProof(author.errors.length === 0, 'Author prerequisites failed before recommendation: ' + author.errors.join('; '));
      requireProof(!(await qa.read(qa.primary, medicalKey)).state.records?.some(row => row.playerId === fixture.player.id), 'Recommendation must not exist before the click');
      guard.arm();
      await author.page.getByRole('button', { name: fixture.player.name + ' 50% training recommendation', exact: true }).click();
      await expect.poll(() => author.errors.length ? author.errors.join('; ') : ledger.some(e => e.stage === 'canonical-request')).toBe(true);
      await expect.poll(() => author.errors.length ? author.errors.join('; ') : ledger.some(e => e.stage === 'generic-request')).toBe(true);
      const recordId = guard.ids()[0];
      requireProof(guard.ids().length === 1, 'Exactly one UI-generated recommendation required');
      const message = author.page.locator('.medical-message');
      if (mode === 'canonical-failed') {
        await expect(message).toContainText('could not be saved centrally');
        requireProof(ledger.filter(e => e.stage === 'canonical-injected-failure').length === 2, 'Both canonical attempts must fail');
      } else {
        await expect(message).toContainText('50% recommendation saved');
        requireProof(ledger.some(e => e.stage === 'canonical-server-response' && e.accepted), 'No real canonical receipt');
      }
      if (!['generic-failed', 'peer-archived'].includes(mode)) await expect.poll(() => ledger.some(e => e.stage === 'generic-server-response' && e.accepted)).toBe(true);
      if (mode === 'lost-response') {
        const replies = ledger.filter(e => e.stage === 'canonical-server-response' && e.accepted);
        requireProof(ledger.filter(e => e.stage === 'accepted-response-dropped').length === 1
          && replies.length === 2 && replies[1].duplicate && replies[0].eventId && replies[0].eventId === replies[1].eventId,
        'Retry did not return the same real canonical event');
        requireProof(new Set(ledger.filter(e => e.stage === 'canonical-request').map(e => e.idempotencyKey)).size === 1, 'Retry changed idempotency key');
      }
      guard.seal(); // Read proof must not be repaired by a queued write during reload.
      await expect.poll(async () => {
        const state = (await qa.read(qa.peer, medicalKey)).state;
        const rows = (state.records || []).filter(row => row.playerId === fixture.player.id);
        return rows.length === 1 && rows[0].id === recordId && rows[0].date === fixture.day && rows[0].participation === 50;
      }).toBe(true);
      requireProof(guard.unrelatedUnchanged((await qa.read(qa.primary, medicalKey)).state), 'Unrelated Medical content changed');
      if (mode === 'peer-archived') {
        await exerciseMedicalReconnect({ qa, fixture, guard, author, archive, ledger });
        await author.page.reload({ waitUntil: 'domcontentloaded' });
      }
      const peer = await openJourneyBrowser({ browser, qa, account: qa.peer, fixture, guard, mode, ledger, contexts });
      for (const [actor, client] of [['author', author], ['peer', peer]]) {
        await verifyStagingJourneyViews(client.page, fixture, mode === 'peer-archived' ? null : recordId);
        const beforeReads = ledger.filter(e => e.stage === 'read' && e.actor === actor && (mode === 'peer-archived' ? e.archivedOwnIds : e.ownIds)?.includes(recordId)).length;
        await client.page.reload({ waitUntil: 'domcontentloaded' });
        await verifyStagingJourneyViews(client.page, fixture, mode === 'peer-archived' ? null : recordId);
        requireProof(ledger.filter(e => e.stage === 'read' && e.actor === actor && (mode === 'peer-archived' ? e.archivedOwnIds : e.ownIds)?.includes(recordId)).length > beforeReads,
          'Reload did not produce a fresh server read of the recommendation');
        requireProof(client.errors.length === 0, 'Journey guard rejected a relevant request: ' + client.errors.join('; '));
        ledger.push({ stage: 'both-views-and-reload', actor, id: recordId });
      }
      await qa.identity();
    } finally {
      console.log(JSON.stringify({ syntheticJourney: { mode, stages: ledger } }));
      // Close every writer before cleanup. Canonical archival is idempotent;
      // unknown/external edits are preserved and make cleanup fail loudly.
      try {
        await Promise.all(contexts.map(context => context.close()));
        await qa.identity();
        if (guard) {
          for (const id of guard.ids()) {
            const current = await qa.read(qa.primary, medicalKey);
            const row = current.state.records?.find(row => row.id === id);
            if (!row) continue;
            if (!row.archivedAt) await archive(guard.archiveEvent(id, current.state, new Date().toISOString()));
            requireProof((await qa.read(qa.primary, medicalKey)).state.records?.find(row => row.id === id)?.archivedAt, 'Synthetic recommendation still active');
          }
          const current = await qa.read(qa.primary, medicalKey), next = structuredClone(current.state);
          const player = next.players?.find(row => row.id === fixture.player.id);
          if (player) {
            requireProof(player.name === fixture.player.name, 'Test player changed externally; preserved');
            player.archivedAt = new Date().toISOString();
            await qa.saveMedical(qa.primary, current, next);
            requireProof((await qa.read(qa.primary, medicalKey)).state.players?.find(row => row.id === fixture.player.id)?.archivedAt, 'Synthetic player still active');
          }
          ledger.push({ stage: 'own-records-archived', ids: guard.ids() });
        }
      } finally {
        try { await qa.finish(); }
        finally { await test.info().attach('synthetic-journey-ledger', { body: JSON.stringify({ mode, stages: ledger }), contentType: 'application/json' }); }
      }
    }
  });
}
