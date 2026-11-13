import { readExistingVersion } from './snapshot-existing-read.mjs';
import { compactSnapshotDatabaseName } from './snapshot-compatible-reader.mjs';
import { decodeLosslessVersion } from './snapshot-compact-decode.mjs';
import { sameSnapshotContents } from './distinct-snapshot-store.mjs';
import { isReviewableSnapshot } from './snapshot-history-format.mjs';
import { listCompactKeys } from './snapshot-compact-history.mjs';

async function readHead(factory, scope, signal) {
  if (!factory?.databases) throw new Error('History inventory unavailable');
  if (!(await factory.databases()).some(d => d.name === compactSnapshotDatabaseName)) return false;
  if (signal.aborted) throw new Error('History read cancelled');
  return new Promise((resolve, reject) => {
    let db, tx, head, ended = false;
    const finish = error => {
      if (ended) return; ended = true; signal.removeEventListener('abort', cancel);
      db?.close(); error ? reject(error) : resolve(head);
    };
    const cancel = () => { try { tx?.abort(); } catch {} finish(new Error('History read cancelled')); };
    signal.addEventListener('abort', cancel, { once: true });
    const request = factory.open(compactSnapshotDatabaseName);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = request.onblocked = () => finish(new Error('History read unavailable'));
    request.onsuccess = () => {
      db = request.result; if (ended || signal.aborted) { db.close(); cancel(); return; }
      try {
        if (!db.objectStoreNames.contains('heads')) { finish(); return; }
        tx = db.transaction('heads'); const store = tx.objectStore('heads');
        if (store.keyPath !== 'key') throw new Error('Invalid history head store');
        const get = store.get(scope); get.onsuccess = () => { head = get.result; };
        tx.oncomplete = () => finish(); tx.onerror = tx.onabort = () => finish(new Error('History read failed'));
      } catch (error) { finish(error); }
    };
  });
}

// Read-only: disabling NEW compact writes must not disable knowledge of copies
// already retained. Never create a database or trust a head without its payload.
export async function reuseCompactSnapshot({ indexedDB, snapshot, access, signal, scan = false }) {
  const read = async (format, storeName, id) => {
    try {
      return await readExistingVersion({ factory: indexedDB,
        source: { name: compactSnapshotDatabaseName, format, storeName },
        scope: access.scope, id, signal, maxBytes: 8 * 1024 * 1024, maxBlocks: 256 });
    } catch (error) { if (error.status === 'absent') return null; throw error; }
  };
  const head = await readHead(indexedDB, access.scope, signal);
  if (head === false) return null; // Absent database: keep the ordinary path cheap.
  if (head && (head.key !== access.scope || typeof head.id !== 'string' || Object.keys(head).sort().join() !== 'id,key'))
    throw new Error('Invalid compact history head');
  let bytes = 0;
  const compare = async id => {
    if (signal.aborted) throw new Error('History read cancelled');
    const stored = await read('lossless-v1', 'versions', id);
    if (!stored?.row) throw new Error('Missing compact history payload');
    bytes += stored.decodedBytes;
    if (bytes > 32 * 1024 * 1024) throw new Error('History compatibility byte limit reached');
    const old = JSON.parse(await decodeLosslessVersion(stored.row, stored.blocks, access.scope, id));
    if (signal.aborted) throw new Error('History read cancelled');
    // Other module formats are not substitutes for this captured envelope.
    if (!isReviewableSnapshot(old, access.scope, access.allowedKeys)) {
      if (!scan) throw new Error('Compact history access unavailable');
      return null;
    }
    if (!sameSnapshotContents(old, snapshot)) return null;
    return { status: 'stored', written: false, createdAt: old.createdAt, id: old.id, source: 'compact' };
  };
  if (head) { const reused = await compare(head.id); if (reused) return reused; }
  if (!scan) return null;
  const inventory = await listCompactKeys({ indexedDB, databaseName: compactSnapshotDatabaseName, scope: access.scope, maxRows: 256 });
  if (signal.aborted) throw new Error('History read cancelled');
  if (inventory.status === 'absent') return null;
  if (!['complete', 'partial'].includes(inventory.status)) throw new Error('History compatibility inventory unavailable');
  for (const key of inventory.keys) {
    const identity = JSON.parse(key);
    if (!Array.isArray(identity) || identity.length !== 2 || identity[0] !== access.scope || typeof identity[1] !== 'string')
      throw new Error('Invalid compact history identity');
    if (identity[1] === head?.id) continue;
    const reused = await compare(identity[1]); if (reused) return reused;
  }
  if (inventory.status !== 'complete') throw new Error('History compatibility record limit reached');
  return null;
}
