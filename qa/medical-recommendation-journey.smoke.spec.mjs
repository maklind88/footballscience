import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { journeyDay as day, journeyPlayer as player, journeyKey as key, openMedicalJourney,
  recommendationButton, recommendationMessage, verifyJourneyViews } from './helpers/medical-recommendation-journey.mjs';

// Real UI, auth bridge, local persistence, queues, read selectors and rendering.
// Remote authentication, canonical projection and app-state storage are synthetic.
async function createJourney(browser, mode) {
  const contexts = [], ledger = [], records = new Map();
  let revision = 10, release, releaseReceipt;
  const receiptGate = new Promise(resolve => { releaseReceipt = resolve; });
  const canonicalGate = new Promise(resolve => { release = resolve; });
  const server = { medical: { rosterVersion: 'qa-journey', players: [player], records: [], injuryPlans: [] }, effects: 0 };
  const entries = () => ({
    [key]: JSON.stringify(server.medical),
    'football-player-profiles-v1': JSON.stringify({ rosterVersion: 'qa-journey', players: [player], removedPlayerIds: [] }),
    'football-schedule-v1': JSON.stringify({ events: [{ id: 'qa-journey-training', date: day, type: 'training', title: 'Synthetic training' }] }),
    'football-session-planner-v3': JSON.stringify({ selectedDate: day, sessions: { [day]: { date: day, title: 'Synthetic training', blocks: [] } } }),
  });
  async function open(actor) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage();
    const auth = await installSetPiecesCentralFixture(page); auth.actor.id = actor;
    await page.clock.setFixedTime(new Date(day + 'T12:00:00Z'));
    if (mode === 'cache-full' && actor === 'author') await page.addInitScript(key => {
      const set = Storage.prototype.setItem; window.__journeyQuotaFailures = 0;
      Storage.prototype.setItem = function(name, value) {
        if (name === key && JSON.parse(String(value)).records?.some(row => row.participation === 50)) {
          window.__journeyQuotaFailures++;
          throw new DOMException('Synthetic cache quota', 'QuotaExceededError');
        }
        return set.call(this, name, value);
      };
    }, key);
    await page.route('**/api/app-state**', async route => {
      if (route.request().method() === 'GET') {
        const all = entries(), keys = new URL(route.request().url()).searchParams.get('keys')?.split(',') || Object.keys(all);
        if (keys.includes(key)) ledger.push({ stage: 'read', actor, revision, recordIds: server.medical.records.map(r => r.id) });
        return route.fulfill({ json: { ok: true, entries: Object.fromEntries(keys.filter(k => k in all).map(k => [k, all[k]])),
          metadata: Object.fromEntries(keys.filter(k => k in all).map(k => [k, { revision, organizationId: 'set-pieces-org' }])),
          absentKeys: keys.filter(k => !(k in all)) } });
      }
      const body = route.request().postDataJSON();
      if (body.key !== key) return route.fulfill({ status: 403, json: { ok: false } });
      ledger.push({ stage: 'generic-write', actor });
      if (['generic-failed', 'both-failed', 'newer-failed'].includes(mode)) return route.fulfill({ status: 503, json: { ok: false } });
      if (mode === 'lost-response-late-generic') {
        await receiptGate;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      server.medical = JSON.parse(body.value); revision++;
      if (mode === 'lost-response-late-generic') server.medical.updatedAt = new Date(Date.parse(day + 'T12:00:00Z') + revision).toISOString();
      ledger.push({ stage: 'generic-receipt', actor });
      return route.fulfill({ json: { ok: true, metadata: { revision }, value: JSON.stringify(server.medical) } });
    });
    await page.route('**/api/medical', async route => {
      const body = route.request().postDataJSON(), row = body.payload?.record;
      expect(body.eventType).toBe('recommendation-saved');
      expect(row).toMatchObject({ playerId: player.id, date: day, participation: mode === 'newer-failed' ? row.participation : 50 });
      ledger.push({ stage: 'canonical-request', actor, recordId: row.id, idempotencyKey: body.idempotencyKey, participation: row.participation });
      if (mode === 'newer-failed' && row.participation === 75) return route.fulfill({ status: 503, json: { ok: false, stored: false } });
      await canonicalGate;
      if (mode === 'canonical-failed' || mode === 'both-failed') return route.fulfill({ status: 503, json: { ok: false, stored: false } });
      const duplicate = records.has(body.idempotencyKey);
      if (duplicate) expect(records.get(body.idempotencyKey)).toEqual(row);
      else {
        records.set(body.idempotencyKey, row); server.effects++; revision++;
        server.medical.records = [...server.medical.records.filter(r => r.id !== row.id), row];
        ledger.push({ stage: 'canonical-commit', actor, recordId: row.id, revision });
        if (mode.startsWith('lost-response')) return route.abort('failed');
      }
      releaseReceipt();
      ledger.push({ stage: 'canonical-receipt', actor, recordId: row.id, revision, duplicate });
      return route.fulfill({ json: { ok: true, stored: true, canonicalStored: true, processingStatus: 'processed',
        eventId: 'qa-event', revision, duplicate } });
    });
    await page.goto('/?workspace=medical-team'); await openMedicalJourney(page);
    return page;
  }
  return { open, server, ledger, release, close: async () => { release(); releaseReceipt(); await Promise.all(contexts.map(c => c.close())); } };
}

for (const mode of ['normal', 'cache-full', 'generic-failed', 'lost-response', 'lost-response-late-generic', 'canonical-failed', 'both-failed']) {
  test(`new Medical recommendation traced through both write paths and a cold peer: ${mode}`, async ({ browser }) => {
    const journey = await createJourney(browser, mode);
    try {
      const author = await journey.open('author');
      expect(journey.server.medical.records).toEqual([]);
      expect(journey.ledger.some(e => e.stage.endsWith('write') || e.stage === 'canonical-request')).toBe(false);
      await recommendationButton(author).click();
      await expect.poll(() => journey.ledger.filter(e => e.stage === 'canonical-request').length).toBe(1);
      const recordId = journey.ledger.find(e => e.stage === 'canonical-request').recordId;
      await expect(recommendationMessage(author)).toContainText('confirming');
      expect(journey.ledger.some(e => e.stage === 'canonical-receipt')).toBe(false);
      await expect.poll(() => journey.ledger.filter(e => e.stage === 'generic-write').length).toBeGreaterThan(0);
      if (mode !== 'cache-full') {
        const local = await author.evaluate(key => JSON.parse(window.__setPiecesNativeGet.call(localStorage, key)), key);
        expect(local.records.some(row => row.id === recordId && row.participation === 50)).toBe(true);
      }
      journey.release();
      if (mode === 'canonical-failed' || mode === 'both-failed') {
        await expect(recommendationMessage(author)).toContainText('could not be saved centrally');
        expect(journey.server.effects).toBe(0);
        expect(journey.ledger.filter(e => e.stage === 'canonical-request')).toHaveLength(2);
        if (mode === 'both-failed') expect(journey.server.medical.records).toEqual([]);
        if (mode === 'canonical-failed') {
          // Generic acceptance can make a record readable even while the Medical
          // event lacks its own canonical confirmation. Keep both outcomes explicit.
          expect(journey.server.medical.records.some(row => row.id === recordId)).toBe(true);
          await verifyJourneyViews(await journey.open('peer'), recordId);
        }
        return;
      }
      if (mode === 'lost-response-late-generic') {
        await expect.poll(() => journey.ledger.some(e => e.stage === 'generic-receipt')).toBe(true);
        await author.waitForLoadState('networkidle');
      }
      await expect(recommendationMessage(author)).toContainText('50% recommendation saved');
      expect(journey.server.effects).toBe(1);
      expect(journey.ledger.some(e => e.stage === 'canonical-receipt' && e.recordId === recordId)).toBe(true);
      const peer = await journey.open('peer');
      const peerView = await verifyJourneyViews(peer, recordId);
      journey.ledger.push({ stage: 'visible-in-both-modules', actor: 'peer', ...peerView });
      expect(journey.ledger.some(e => e.stage === 'read' && e.actor === 'peer' && e.recordIds.includes(recordId))).toBe(true);
      const authorView = await verifyJourneyViews(author, recordId);
      journey.ledger.push({ stage: 'visible-in-both-modules', actor: 'author', ...authorView });
      expect(authorView.scope).not.toBe(peerView.scope);
      await peer.reload(); await verifyJourneyViews(peer, recordId);
      const previousReads = journey.ledger.filter(e => e.stage === 'read' && e.actor === 'author').length;
      await author.reload(); await verifyJourneyViews(author, recordId);
      expect(journey.ledger.filter(e => e.stage === 'read' && e.actor === 'author').length).toBeGreaterThan(previousReads);
      if (mode === 'lost-response') expect(journey.ledger.filter(e => e.stage === 'canonical-receipt')[0].duplicate).toBe(true);
      if (mode === 'cache-full') expect(await author.evaluate(() => window.__journeyQuotaFailures)).toBeGreaterThan(0);
    } finally {
      await test.info().attach('synthetic-medical-journey', { body: JSON.stringify({ effects: journey.server.effects, stages: journey.ledger }), contentType: 'application/json' });
      await journey.close();
    }
  });
}


test('late success for an older recommendation cannot erase the newer failure', async ({ browser }) => {
  const journey = await createJourney(browser, 'newer-failed');
  try {
    const author = await journey.open('author');
    await recommendationButton(author).click();
    await expect.poll(() => journey.ledger.filter(e => e.stage === 'canonical-request').length).toBe(1);
    await author.getByRole('button', { name: 'Synthetic Journey Player 75% training recommendation', exact: true }).click();
    await expect(recommendationMessage(author)).toContainText('could not be saved centrally');
    const failure = await recommendationMessage(author).textContent();
    journey.release();
    await expect.poll(() => journey.ledger.filter(e => e.stage === 'canonical-receipt').length).toBe(1);
    // Wait for the actual receipt handler to render, without retrying another write.
    await author.waitForLoadState('networkidle');
    await expect(recommendationMessage(author)).toHaveText(failure);
    await expect(author.getByRole('button', { name: 'Synthetic Journey Player 75% training recommendation', exact: true })).toHaveClass(/is-active/);
  } finally {
      await test.info().attach('synthetic-medical-journey', { body: JSON.stringify({ effects: journey.server.effects, stages: journey.ledger }), contentType: 'application/json' });
      await journey.close();
    }
});
