import { test, expect } from '@playwright/test';
import { collectStorageHealth } from '../src/core/storage-health-report.mjs';

const storageKey = 'football-data-safety-v1';
function storage(values) {
  const entries = Object.entries(values);
  return { get length() { return entries.length; }, key: index => entries[index]?.[0], getItem: key => values[key] ?? null };
}

test('storage health aggregates native sizes without returning content, ids, keys or changing data', async () => {
  const values = { medical: 'Private clinical text 🏆', 'untrusted-name-person': 'secret-token',
    [`${storageKey}:recovery:private-id`]: 'Private recovery',
    [storageKey]: JSON.stringify({ entries: { medical: { principalScope: 'own-team', pendingCentralSync: true },
      other: { principalScope: 'other-team', pendingCentralSync: true } } }),
  };
  const before = structuredClone(values);
  const report = await collectStorageHealth({ storage: storage(values), storageLabels: { medical: 'Medical' }, storageKey, scope: 'own-team',
    navigatorRef: { storage: { estimate: async () => ({ usage: 100, quota: 1000 }), persisted: async () => false,
      persist: () => { throw new Error('Must not request persistence'); } } },
  });
  expect(report.approximateUtf16Bytes).toBe(Object.entries(values).reduce((sum,[key,value])=>sum+(key.length+value.length)*2,0));
  expect(report).toMatchObject({ partial: false, entries: 4, pendingForCurrentScope: 1, recoveryCopies: 1, originUsageBytes: 100, originQuotaBytes: 1000, persistent: false });
  expect(report.modules.map(row=>row.label)).toContain('Medical');
  for (const secret of ['Private', 'secret-token', 'private-id', 'own-team', 'other-team', 'untrusted-name-person']) expect(JSON.stringify(report)).not.toContain(secret);
  expect(values).toEqual(before);
});

test('denied storage, malformed metadata and failed estimates remain explicitly unknown', async () => {
  const denied = await collectStorageHealth({ storage: { get length() { throw new Error('secret detail'); } },
    navigatorRef: { storage: { estimate: async () => { throw new Error('secret quota'); }, persisted: async () => { throw new Error('denied'); } } } });
  expect(denied).toMatchObject({ partial: true, pendingForCurrentScope: null, originUsageBytes: null, originQuotaBytes: null, persistent: null });
  expect(JSON.stringify(denied)).not.toContain('secret');
  const malformed = await collectStorageHealth({ storage: storage({[storageKey]:'not json'}), scope:'owner' });
  expect(malformed.partial).toBe(true);
  expect(malformed.pendingForCurrentScope).toBe(null);
});

test('changed enumeration cannot be reported as a complete measurement', async () => {
  let count = 0;
  const report = await collectStorageHealth({ storage: { get length() { return ++count; }, key: ()=>'key',getItem: ()=>'value' } });
  expect(report.partial).toBe(true);
});
