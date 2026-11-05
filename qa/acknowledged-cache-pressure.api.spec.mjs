import { test, expect } from '@playwright/test';
import { createAcknowledgedCacheHarness } from './helpers/acknowledged-cache-pressure-harness.mjs';

for (const key of ['football-dashboard-tasks-v1', 'football-schedule-v1', 'football-periodization-v2',
  'football-dashboard-presentation-mode-v1', 'football-medical-team-v1', 'football-session-planner-v3']) {
  test(`verified merged content remains visible with a full native cache: ${key}`, async () => {
    const h = createAcknowledgedCacheHarness(key);
    h.win.localStorage.setItem(key, 'original edit');
    h.fail();
    await h.sync.flushCentralStateWrites();
    expect(h.calls).toHaveLength(1);
    expect(h.views).toEqual([{ key, value: 'server merged content' }]);
    expect(h.safety.rawGetItem(key)).toBe('server merged content');
    expect(h.disk.get(key)).toBe('original edit');
    expect(h.cache.get(key)).toMatchObject({ durable: false, serverBacked: true });
    expect(h.safety.readManifest().entries[key].pendingCentralSync).toBe(false);
    const backup = h.safety.createBackupEnvelope('test');
    expect(backup.storage[key]).toBe('original edit');
    expect(backup.saveContext.entries[key].hash).toBe(h.safety.hashString('original edit'));
    expect(() => h.win.localStorage.setItem(key, 'unconfirmed successor')).toThrow();
    expect(h.safety.rawGetItem(key)).toBe('server merged content');
    await h.sync.flushCentralStateWrites();
    expect(h.calls).toHaveLength(1);
  });
}

for (const status of [403, 409, 503]) {
  test(`an unaccepted response never becomes a server-backed cache (${status})`, async () => {
    const key = 'football-dashboard-tasks-v1';
    const h = createAcknowledgedCacheHarness(key, { send: () => ({ ok: false, status, currentValue: 'other work', revision: 8 }) });
    h.win.localStorage.setItem(key, 'original edit'); h.fail();
    await h.sync.flushCentralStateWrites();
    expect(h.views).toEqual([]);
    expect(h.safety.rawGetItem(key)).toBe('original edit');
    expect(h.safety.readManifest().entries[key].pendingCentralSync).toBe(true);
    expect(h.statuses.some(x => x.state === 'saved')).toBe(false);
  });
}

for (const change of ['newer edit', 'account']) {
  test(`late acknowledgement cannot replace ${change}`, async () => {
    const key = 'football-dashboard-tasks-v1'; let resolve, attempt = 0;
    const h = createAcknowledgedCacheHarness(key, { send: () => ++attempt === 1
      ? new Promise(r => { resolve = r; }) : { ok: false, status: 503 } });
    h.win.localStorage.setItem(key, 'original edit');
    const flushing = h.sync.flushCentralStateWrites();
    await expect.poll(() => typeof resolve).toBe('function');
    if (change === 'newer edit') h.win.localStorage.setItem(key, 'newer edit');
    else h.setScope('qa-other-owner');
    const before = h.safety.readManifest().entries[key]; h.fail();
    resolve({ ok: true, revision: 8, value: 'server merged content' }); await flushing;
    expect(h.views).toEqual([]);
    expect(h.safety.rawGetItem(key)).toBe(change === 'newer edit' ? change : 'original edit');
    expect(h.safety.readManifest().entries[key].hash).toBe(before.hash);
    expect(h.safety.readManifest().entries[key].pendingCentralSync).toBe(true);
    expect(h.statuses.some(x => x.state === 'saved')).toBe(false);
  });
}

for (const failure of ['SecurityError', 'refused memory']) {
  test(`an unavailable acknowledged cache remains an explicit issue: ${failure}`, async () => {
    const key = 'football-dashboard-tasks-v1', options = {};
    const h = createAcknowledgedCacheHarness(key, options);
    h.win.localStorage.setItem(key, 'original edit');
    if (failure === 'refused memory') options.refuseCache = true;
    h.fail(failure === 'SecurityError' ? failure : undefined);
    await h.sync.flushCentralStateWrites();
    expect(h.views).toEqual([]);
    expect(h.disk.get(key)).toBe('original edit');
    expect(h.statuses).toContainEqual({ key, state: 'issue', message: 'Changes saved centrally; browser cache could not be refreshed.' });
  });
}
