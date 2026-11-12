import { test, expect } from '@playwright/test';

for (const scenario of ['references', 'aggregate-bytes']) test(`QA pooled writer rejects unreadable ${scenario} before mutation`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async scenario => {
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const { proofRow, dumpProofDb } = await import('/qa/helpers/lossless-write-proof.mjs');
    const name = 'qa-lossless-admission-' + scenario, writer = await openLosslessStore(name, 'pooled');
    const original = proofRow('original'); await writer.append(original);
    const before = JSON.stringify(await dumpProofDb(name));
    const candidate = proofRow('unreadable', scenario === 'references' ? 257 : 1);
    if (scenario === 'aggregate-bytes') {
      // Original envelope is <= 8 MiB, but pooled references add decoded overhead.
      const budget = 8 * 1024 * 1024;
      const emptyBytes = new TextEncoder().encode(JSON.stringify(candidate)).length;
      candidate.storage['key-0'] += 'x'.repeat(budget - emptyBytes);
    }
    let error = '';
    try { await writer.append(candidate); } catch (e) { error = e.message; }
    const unchanged = JSON.stringify(await dumpProofDb(name)) === before;
    const originalExact = await writer.read('actor-A', 'original') === JSON.stringify(original);
    writer.close(); return { error, unchanged, originalExact };
  }, scenario);
  expect(result.error).toBe('Product reader admission limit');
  expect(result.unchanged).toBe(true); expect(result.originalExact).toBe(true);
});

for (const scenario of ['recovery', 'foreign-owner', 'unknown-field', 'extra-entry']) test(`QA writer preserves legacy fallback for ${scenario}`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async scenario => {
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const { proofRow, dumpProofDb } = await import('/qa/helpers/lossless-write-proof.mjs');
    const writer = await openLosslessStore('qa-lossless-format');
    const row = proofRow('not-admitted');
    if (scenario === 'recovery') row.recoveryCopies = { savedDraft: 'must remain intact' };
    if (scenario === 'foreign-owner') row.saveContext.entries['key-0'].principalScope = 'actor-B';
    if (scenario === 'unknown-field') row.futureRecovery = { pending: true };
    if (scenario === 'extra-entry') row.saveContext.entries['other'] = { principalScope: 'actor-A', pendingCentralSync: true };
    // Simulate an already preserved legacy envelope. Admission must not rewrite
    // it or strip unknown fields in order to make the compact format acceptable.
    localStorage.setItem('qa-legacy-fallback', JSON.stringify(row));
    const before = localStorage.getItem('qa-legacy-fallback');
    let error = '';
    try { await writer.append(row); } catch (e) { error = e.message; }
    const db = await dumpProofDb('qa-lossless-format'); writer.close();
    return { error, unchanged: before === localStorage.getItem('qa-legacy-fallback') && before === JSON.stringify(row),
      versions: db.versions.length, blocks: db.blocks.length };
  }, scenario);
  expect(result).toEqual({ error: 'Product reader format not admitted', unchanged: true, versions: 0, blocks: 0 });
});

for (const mode of ['standalone', 'pooled']) test(`${mode}: near-limit admitted envelope round trips through actual product reader`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async mode => {
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const { proofRow, proofReader } = await import('/qa/helpers/lossless-write-proof.mjs');
    const name = 'qa-lossless-near-limit', row = proofRow('large', 1);
    row.storage['key-0'] = 'x'.repeat(8 * 1024 * 1024 - 4096);
    const writer = await openLosslessStore(name, mode); await writer.append(row); writer.close();
    const reader = await proofReader(name, Object.keys(row.storage));
    const recovered = await reader.read({ source: 'compact', id: row.id });
    return { status: recovered.status, exact: JSON.stringify(recovered.envelope) === JSON.stringify(row) };
  }, mode);
  expect(result).toEqual({ status: 'ok', exact: true });
});
