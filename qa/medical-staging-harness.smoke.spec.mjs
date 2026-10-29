import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { createMedicalJourneyGuard } from './helpers/medical-journey-staging-guard.mjs';
import { createJourneyRequestHandler, openJourneyMedical, verifyStagingJourneyViews } from './helpers/medical-journey-staging-browser.mjs';
import { medicalKey } from './helpers/save-acceptance-staging.mjs';

// Rehearse the exact staging route guards and selectors with actual browser
// requests and local synthetic HTTP. This is not authenticated staging evidence.
for (const mode of ['normal', 'lost-response', 'generic-failed', 'canonical-failed']) {
  test(`staging journey harness rehearsal with real browser requests: ${mode}`, async ({ browser, baseURL }) => {
    const fixture = { run: 'qa-save-rehearsal', day: '2026-10-30', player: { id: 'qa-save-rehearsal-player',
      name: 'Synthetic Journey Rehearsal', rosterType: 'squad', countsInSquad: true, status: 'available', position: 'Midfielder' } };
    let medical = { rosterVersion: 'qa-staging', players: [], records: [], injuryPlans: [] }, revision = 10;
    const effects = new Map(), contexts = [], ledger = [], errors = [];
    const guard = { isArmed: () => false, ids: () => [] };
    const server = createServer(async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const url = new URL(req.url, 'http://localhost');
        let response;
        if (req.method === 'GET') {
          const keys = url.searchParams.get('keys')?.split(',') || [medicalKey, 'football-player-profiles-v1', 'football-schedule-v1', 'football-session-planner-v3'];
          const entries = { [medicalKey]: JSON.stringify(medical), 'football-player-profiles-v1': JSON.stringify({ rosterVersion: 'qa-staging', players: [] }) };
          response = { ok: true, entries: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, entries[k]])),
            metadata: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, { revision, organizationId: 'set-pieces-org' }])),
            absentKeys: keys.filter(k => !(k in entries)) };
        } else {
          const body = JSON.parse(raw);
          if (url.pathname === '/api/medical') {
            const duplicate = effects.has(body.idempotencyKey);
            if (!duplicate) {
              effects.set(body.idempotencyKey, body.payload.record); revision++;
              medical.records = [...medical.records.filter(r => r.id !== body.payload.record.id), body.payload.record];
              if (!medical.players.some(p => p.id === fixture.player.id)) medical.players.push({ ...fixture.player, ...body.payload.player });
            }
            response = { ok: true, stored: true, canonicalStored: true, eventId: 'synthetic-event', duplicate, revision };
          } else {
            medical = JSON.parse(body.value); revision++;
            response = { ok: true, value: JSON.stringify(medical), metadata: { revision } };
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response));
      } catch { res.writeHead(500); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const upstream = 'http://127.0.0.1:' + server.address().port;
    const qa = { origin: baseURL, primary: {}, identity: async () => {}, read: async () => ({ state: structuredClone(medical), revision }) };
    async function open(actor, writable) {
      const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
      const page = await context.newPage();
      const auth = await installSetPiecesCentralFixture(page); auth.actor.id = actor;
      await page.clock.setFixedTime(new Date('2026-10-29T12:00:00Z'));
      const routing = createJourneyRequestHandler({ qa, fixture, guard, mode, ledger, writable }); errors.push(routing.errors);
      const routeToHarness = route => routing.handler(new Proxy(route, { get(target, property) {
        if (property === 'fetch') return options => route.fetch({ ...options, url: upstream + new URL(route.request().url()).pathname + new URL(route.request().url()).search });
        const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
      } }));
      await page.route('**/api/app-state**', routeToHarness);
      await page.route('**/api/medical', routeToHarness);
      await page.goto('/?workspace=medical-team'); await openJourneyMedical(page, fixture);
      return page;
    }
    try {
      const author = await open('synthetic-author', true);
      // A realistic normalized empty server baseline, created only inside this
      // synthetic harness; the staging test never rewrites its initial state.
      medical = await author.evaluate(async playerId => {
        const state = (await import('/src/modules/medical/medical-runtime-accessors.mjs')).ensureMedicalState();
        return { ...state, players: state.players.filter(p => p.id !== playerId), records: [] };
      }, fixture.player.id);
      Object.assign(guard, createMedicalJourneyGuard({ ...fixture, actorId: 'synthetic-author', baseline: medical })); guard.arm();
      await author.getByRole('button', { name: fixture.player.name + ' 50% training recommendation', exact: true }).click();
      await expect.poll(() => ledger.some(e => e.stage === 'generic-request')).toBe(true);
      await expect(author.locator('.medical-message')).toContainText(mode === 'canonical-failed' ? 'could not be saved centrally' : '50% recommendation saved');
      if (mode !== 'generic-failed') await expect.poll(() => ledger.some(e => e.stage === 'generic-server-response' && e.accepted)).toBe(true);
      expect(errors.flat()).toEqual([]);
      expect(medical.records).toHaveLength(1);
      const id = guard.ids()[0];
      expect(medical.records[0].id).toBe(id);
      if (mode === 'lost-response') {
        expect(effects.size).toBe(1);
        expect(ledger.filter(e => e.stage === 'canonical-server-response' && e.accepted)).toHaveLength(2);
      }
      guard.seal();
      const peer = await open('synthetic-peer', false);
      for (const page of [author, peer]) {
        await verifyStagingJourneyViews(page, fixture, id);
        await page.reload(); await verifyStagingJourneyViews(page, fixture, id);
      }
      expect(errors.flat()).toEqual([]);
    } finally {
      await Promise.all(contexts.map(c => c.close()));
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
  });
}
