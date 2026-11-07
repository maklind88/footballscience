import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createJourneyRequestHandler } from './helpers/medical-journey-staging-browser.mjs';
import { medicalKey } from './helpers/save-acceptance-staging.mjs';

// Real sockets reproduce the ECONNRESET seen by the staging rehearsal. No live
// backend or clinical data is involved; assertions cover bounded reads and writes.
for (const scenario of ['one-read-reset', 'persistent-read-reset', 'http-failure', 'write-reset']) {
  test(`journey transport: ${scenario}`, async ({ page, baseURL }) => {
    let attempts = 0, writes = 0;
    const ledger = [];
    const server = createServer(async (req, res) => {
      for await (const _ of req) { /* Consume the synthetic request before resetting. */ }
      attempts++;
      if (req.method === 'POST') writes++;
      if (scenario === 'persistent-read-reset' || scenario === 'write-reset' || (scenario === 'one-read-reset' && attempts === 1)) {
        req.socket.destroy(); return;
      }
      res.writeHead(scenario === 'http-failure' ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: scenario !== 'http-failure', entries: {
        [medicalKey]: JSON.stringify({ records: [{ id: 'synthetic-record', playerId: 'synthetic-player' }] }),
      }, metadata: { [medicalKey]: { revision: 42 } } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const upstream = 'http://127.0.0.1:' + server.address().port;
    const routing = createJourneyRequestHandler({
      qa: { origin: baseURL, primary: {}, identity: async () => {}, read: async () => ({ state: {} }) },
      fixture: { run: 'synthetic', day: '2026-11-06', player: { id: 'synthetic-player' } },
      guard: { isArmed: () => true, event: () => 'synthetic-record' },
      mode: 'normal', ledger, writable: scenario === 'write-reset',
    });
    try {
      await page.route('**/transport-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Transport rehearsal</title>' }));
      await page.route('**/api/**', route => routing.handler(new Proxy(route, { get(target, property) {
        if (property === 'fetch') return options => route.fetch({ ...options, url: upstream + new URL(route.request().url()).pathname });
        const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
      } })));
      await page.goto('/transport-harness');
      const result = await page.evaluate(async write => {
        try {
          const response = await fetch(write ? '/api/medical' : '/api/app-state', write
            ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'synthetic-write' }) } : {});
          return { status: response.status, body: await response.json() };
        } catch { return { rejected: true }; }
      }, scenario === 'write-reset');
      expect(attempts).toBe(scenario.includes('read-reset') ? 2 : 1);
      expect(writes).toBe(scenario === 'write-reset' ? 1 : 0);
      if (scenario === 'one-read-reset') {
        expect(result.status).toBe(200);
        expect(JSON.parse(result.body.entries[medicalKey]).records[0].id).toBe('synthetic-record');
        expect(ledger).toContainEqual({ stage: 'read', actor: 'peer', revision: 42, ownIds: ['synthetic-record'], archivedOwnIds: [] });
        expect(routing.errors).toEqual([]);
      } else if (scenario === 'http-failure') {
        expect(result.status).toBe(503);
        expect(ledger).toEqual([]);
      } else {
        expect(result).toEqual({ rejected: true });
        expect(routing.errors).toEqual([`${scenario === 'write-reset' ? 'write' : 'read'}-fetch: request rejected; private details suppressed`]);
        expect(ledger.some(e => e.stage.endsWith('server-response'))).toBe(false);
      }
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
  });
}
