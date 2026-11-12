import { test, expect } from '@playwright/test';

for (const corpus of ['repetitive', 'stable-noise', 'changing-noise', 'tiny']) test(`whole-chain logical growth: ${corpus}`, async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async corpus => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const { proofReader, dumpProofDb, logicalBytes, noise } = await import('/qa/helpers/lossless-write-proof.mjs');
    const h = await saveSyncGrowthHarness();
    const names = ['qa-lossless-growth-standalone', 'qa-lossless-growth-pooled'];
    const writers = await Promise.all(names.map((name, i) => openLosslessStore(name, i ? 'pooled' : 'standalone')));
    const originals = [], checkpoints = [];
    const stable = corpus === 'repetitive' ? 'same synthetic text '.repeat(3500) : corpus === 'tiny' ? 'tiny' : noise(65536, 123);
    h.edit(stable, h.secondary);
    for (let generation = 1; generation <= 60; generation++) {
      h.offline(true);
      const content = corpus === 'changing-noise' ? noise(65536, generation + 500) :
        corpus === 'repetitive' ? 'repeated note '.repeat(2500) : 'edit ' + generation;
      h.edit(JSON.stringify({ generation, content }));
      if (corpus === 'changing-noise') h.edit(noise(65536, generation + 1000), h.secondary);
      await h.capture();
      const row = (await h.all('snapshots')).find(r => JSON.parse(r.storage[h.key]).generation === generation &&
        r.saveContext.entries[h.key].pendingCentralSync);
      if (!row) throw new Error('Pending generation not captured');
      originals.push(row);
      for (const writer of writers) await writer.append(row);
      const historyBeforeRetry = JSON.stringify(await h.all('snapshots'));
      await h.flush(); await h.capture();
      if (JSON.stringify(await h.all('snapshots')) !== historyBeforeRetry) throw new Error('Offline retry grew history');
      for (const writer of writers) if ((await writer.append(row)).inserted) throw new Error('Compact retry grew history');
      h.offline(false); await h.flush(); await h.capture();
      if (h.safety.readManifest().entries[h.key].pendingCentralSync) throw new Error('Synthetic receipt did not settle');
      if ([1, 10, 30, 60].includes(generation)) {
        const history = await h.all('snapshots'), latest = await h.all('latest');
        const native = Array.from({ length: localStorage.length }, (_, i) => {
          const key = localStorage.key(i); return [key, localStorage.getItem(key)];
        });
        const protectedIds = new Set(originals.map(row => row.id));
        const unconverted = history.filter(row => !protectedIds.has(row.id));
        const commonBytes = logicalBytes(native) + logicalBytes(latest);
        const baselineBytes = commonBytes + logicalBytes(history);
        const compact = [];
        for (let i = 0; i < writers.length; i++) {
          const stats = await writers[i].stats(), stored = await dumpProofDb(names[i]);
          const historyBytes = logicalBytes(stored);
          compact.push({ mode: i ? 'pooled' : 'standalone', ...stats, historyBytes,
            // Counterfactual only: no legacy rows are removed in this test.
            replacementLogicalBytes: commonBytes + logicalBytes(unconverted) + historyBytes,
            shadowLogicalBytes: baselineBytes + historyBytes });
        }
        checkpoints.push({ generation, baselineBytes, commonBytes, legacyHistoryBytes: logicalBytes(history),
          protectedCount: originals.length, compact });
      }
    }
    const history = await h.all('snapshots');
    const preserved = originals.every(row => history.some(r => JSON.stringify(r) === JSON.stringify(row)));
    const recovered = [];
    for (let i = 0; i < names.length; i++) {
      writers[i].close(); // Recovery uses a fresh connection and the actual product decoder.
      const reader = await proofReader(names[i], [h.key, h.secondary]);
      let count = 0;
      for (const original of originals) {
        const result = await reader.read({ source: 'compact', id: original.id });
        if (result.status !== 'ok' || JSON.stringify(result.envelope) !== JSON.stringify(original)) throw new Error('Recovery mismatch');
        count++;
      }
      recovered.push(count);
    }
    h.db.close();
    return { corpus, checkpoints, preserved, recovered, physicalOverheadMeasured: false,
      backend: 'deterministic fake server; real save/sync runtime', productWriterActivated: false };
  }, corpus);
  expect(result.preserved).toBe(true); expect(result.recovered).toEqual([60, 60]);
  for (const checkpoint of result.checkpoints) for (const compact of checkpoint.compact) {
    expect(compact.versions).toBe(checkpoint.generation);
    expect(compact.shadowLogicalBytes).toBeGreaterThan(checkpoint.baselineBytes);
  }
  await testInfo.attach('growth-measurement', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log('[lossless-growth]', JSON.stringify(result));
});
