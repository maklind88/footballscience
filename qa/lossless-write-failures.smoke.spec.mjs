import { test, expect } from '@playwright/test';

for (const mode of ['standalone', 'pooled']) {
  for (const fault of ['quota-before', 'quota-version', 'abort-after-add', 'retry-after-commit']) {
    test(`${mode}: ${fault} preserves committed work and never reports aborted work saved`, async ({ page }) => {
      await page.goto('/medical-merge.js');
      const result = await page.evaluate(async ({ mode, fault }) => {
        const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
        const { proofRow, dumpProofDb, proofReader } = await import('/qa/helpers/lossless-write-proof.mjs');
        const name = 'qa-lossless-fault-' + mode, writer = await openLosslessStore(name, mode);
        const original = proofRow('original'), next = proofRow('next');
        await writer.append(original);
        const before = JSON.stringify(await dumpProofDb(name));
        const add = IDBObjectStore.prototype.add;
        let saved = false, rejected = false, successfulRequests = 0;
        IDBObjectStore.prototype.add = function(...args) {
          if (this.transaction.db.name !== name) return add.apply(this, args);
          if (fault === 'quota-before' || (fault === 'quota-version' && this.name === 'versions'))
            throw new DOMException('Injected quota', 'QuotaExceededError');
          const request = add.apply(this, args);
          request.addEventListener('success', () => {
            successfulRequests++;
            // Request success is NOT transaction commit; saved must await commit.
            if (fault === 'abort-after-add' && this.name === 'versions') this.transaction.abort();
          });
          return request;
        };
        try { await writer.append(next); saved = true; } catch { rejected = true; }
        finally { IDBObjectStore.prototype.add = add; }
        const unchanged = before === JSON.stringify(await dumpProofDb(name));
        writer.close();
        const reopened = await openLosslessStore(name, mode);
        const retry = await reopened.append(fault === 'retry-after-commit' ? next : original);
        const reader = await proofReader(name, Object.keys(original.storage));
        const recovered = await reader.read({ source: 'compact', id: original.id });
        const nextResult = await reader.read({ source: 'compact', id: next.id });
        const stats = await reopened.stats(); reopened.close();
        return { saved, rejected, unchanged, successfulRequests, retry, versions: stats.versions,
          originalExact: recovered.status === 'ok' && JSON.stringify(recovered.envelope) === JSON.stringify(original),
          nextStatus: nextResult.status };
      }, { mode, fault });
      expect(result.originalExact).toBe(true); expect(result.retry).toEqual({ inserted: false });
      if (fault === 'retry-after-commit') {
        expect(result.saved).toBe(true); expect(result.versions).toBe(2); expect(result.nextStatus).toBe('ok');
      } else {
        expect(result.saved).toBe(false); expect(result.rejected).toBe(true); expect(result.unchanged).toBe(true);
        expect(result.versions).toBe(1); expect(result.nextStatus).toBe('absent');
        if (fault === 'abort-after-add') expect(result.successfulRequests).toBeGreaterThan(0);
      }
    });
  }

  test(`${mode}: restored isolated draft retains every pending field without replacing source`, async ({ page }) => {
    await page.goto('/medical-merge.js');
    const result = await page.evaluate(async mode => {
      const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
      const { proofRow, proofReader, dumpProofDb } = await import('/qa/helpers/lossless-write-proof.mjs');
      const source = 'qa-lossless-draft-source', target = 'qa-lossless-draft-target';
      const row = proofRow('unsynced');
      const writer = await openLosslessStore(source, mode); await writer.append(row); writer.close();
      const before = JSON.stringify(await dumpProofDb(source));
      const reader = await proofReader(source, Object.keys(row.storage));
      const decoded = await reader.read({ source: 'compact', id: row.id });
      if (decoded.status !== 'ok') throw new Error('Cannot restore unreadable version');
      // Independent QA draft only. Never pass a review export to the product
      // importer or strip pending/owner/revision metadata to make it acceptable.
      const draft = await openLosslessStore(target, 'standalone');
      await draft.append(decoded.envelope); draft.close();
      const restoredReader = await proofReader(target, Object.keys(row.storage));
      const restored = await restoredReader.read({ source: 'compact', id: row.id });
      const wrongOwner = await proofReader(target, Object.keys(row.storage), 'actor-B');
      return { exact: restored.status === 'ok' && JSON.stringify(restored.envelope) === JSON.stringify(row),
        originalUnchanged: before === JSON.stringify(await dumpProofDb(source)),
        wrongOwner: (await wrongOwner.read({ source: 'compact', id: row.id })).status };
    }, mode);
    expect(result).toEqual({ exact: true, originalUnchanged: true, wrongOwner: 'absent' });
  });
}
