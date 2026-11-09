import { readSnapshotHistory } from './snapshot-history-reader.mjs';
import { isReviewableSnapshot } from './snapshot-history-format.mjs';
import { readExistingVersion } from './snapshot-existing-read.mjs';
import { decodeLosslessVersion } from './snapshot-compact-decode.mjs';
import { listCompactKeys } from './snapshot-compact-history.mjs';

// Reserved read contract only. No product writer creates this database.
export const compactSnapshotDatabaseName = 'football-science-snapshots-compact-v1';
export function createSnapshotCompatibleReader({ indexedDB, databaseName, storeName = 'snapshots', getAccess }) {
  const access = () => {
    try {
      const value = getAccess();
      if (!value?.scope || !value.generation || value.canReview !== true || !(value.allowedKeys instanceof Set)) return null;
      const keys = [...value.allowedKeys].sort();
      return { ...value, allowedKeys: new Set(keys), token: JSON.stringify([value.scope, value.generation, keys]) };
    } catch { return null; }
  };
  const current = prior => prior && access()?.token === prior.token;
  async function read({ source, id }) {
    const prior = access();
    if (!prior) return { status: 'denied' };
    if (!['legacy', 'compact'].includes(source) || typeof id !== 'string' || !id) return { status: 'unsupported' };
    if (source === 'legacy') {
      const report = await readSnapshotHistory({ indexedDB, databaseName, storeName, scope: prior.scope, allowedKeys: prior.allowedKeys, id });
      if (!current(prior)) return { status: 'denied' };
      if (report.status !== 'complete') return { status: report.status === 'partial' ? 'limited' : report.status };
      return report.rows.length ? { status: 'ok', envelope: report.rows[0], source }
        : { status: report.skipped ? 'review-required' : 'absent' };
    }
    const controller = new AbortController(); let timer;
    const operation = (async () => {
      const result = await readExistingVersion({ factory: indexedDB, source: { name: compactSnapshotDatabaseName, format: 'lossless-v1' },
        scope: prior.scope, id, signal: controller.signal, maxBytes: 8 * 1024 * 1024, maxBlocks: 256 });
      if (!result.row) return { status: 'absent' };
      const text = await decodeLosslessVersion(result.row, result.blocks, prior.scope, id), envelope = JSON.parse(text);
      if (envelope.schema !== 'football-science-backup-v1' || envelope.app !== 'Football Science') return { status: 'unsupported' };
      if (!isReviewableSnapshot(envelope, prior.scope, prior.allowedKeys) ||
          Object.keys(envelope.saveContext.entries).some(key => !prior.allowedKeys.has(key))) return { status: 'review-required' };
      return { status: 'ok', envelope, source, bytes: result.decodedBytes };
    })().catch(error => ({ status: error.status || 'corrupt' }));
    try {
      const result = await Promise.race([operation, new Promise(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve({ status: 'limited' }); }, 3000);
      })]);
      return current(prior) ? result : { status: 'denied' };
    } finally { clearTimeout(timer); }
  }
  async function list({ source = 'legacy', beforeKey } = {}) {
    const prior = access();
    const empty = status => ({ status, rows: [], skipped: 0, nextKey: null });
    if (!prior) return empty('denied');
    if (source === 'legacy') {
      const result = await readSnapshotHistory({ indexedDB, databaseName, storeName, scope: prior.scope, allowedKeys: prior.allowedKeys, beforeKey });
      return current(prior) ? result : empty('denied');
    }
    if (source !== 'compact') return empty('unavailable');
    const started = performance.now();
    const keys = await listCompactKeys({ indexedDB, databaseName: compactSnapshotDatabaseName, scope: prior.scope, beforeKey });
    if (!current(prior)) return empty('denied');
    if (!['complete', 'partial'].includes(keys.status)) return empty(keys.status);
    const result = empty(keys.status); let bytes = 0;
    for (const key of keys.keys) {
      if (performance.now() - started > 3000) { result.status = 'partial'; break; }
      let identity;
      try { identity = JSON.parse(key); } catch { result.skipped++; result.nextKey = key; continue; }
      if (!Array.isArray(identity) || identity.length !== 2 || identity[0] !== prior.scope || typeof identity[1] !== 'string') {
        result.skipped++; result.nextKey = key; continue;
      }
      const value = await read({ source, id: identity[1] });
      if (!current(prior)) return empty('denied');
      if (value.status === 'ok') {
        if (bytes + value.bytes > 20 * 1024 * 1024) { result.status = 'partial'; break; }
        bytes += value.bytes; result.rows.push(value.envelope);
      } else {
        result.skipped++;
        if (['limited', 'unavailable'].includes(value.status)) result.status = 'partial';
      }
      result.nextKey = key;
    }
    return result;
  }
  // Keep unknown/absent additional storage distinct from an empty legacy page.
  async function discover() {
    const prior = access();
    if (!prior) return { status: 'denied', compact: false };
    let timer;
    try {
      const rows = await Promise.race([Promise.resolve().then(() => indexedDB.databases()), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 3000);
      })]);
      if (!current(prior)) return { status: 'denied', compact: false };
      return { status: 'complete', compact: rows.some(row => row.name === compactSnapshotDatabaseName) };
    } catch { return { status: 'unavailable', compact: false }; }
    finally { clearTimeout(timer); }
  }
  return Object.freeze({ read, list, discover });
}
