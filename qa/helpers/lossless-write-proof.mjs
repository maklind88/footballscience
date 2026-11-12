// Synthetic data only. Production runtime capture + production read contract,
// QA-only writer. No product database name or remote persistence is writable here.
export async function proofReader(name, keys, scope = 'actor-A') {
  const { createSnapshotCompatibleReader, compactSnapshotDatabaseName } = await import('/src/core/snapshot-compatible-reader.mjs');
  return createSnapshotCompatibleReader({
    indexedDB: {
      databases: async () => (await indexedDB.databases()).map(db => db.name === name ? { ...db, name: compactSnapshotDatabaseName } : db),
      open: requested => indexedDB.open(requested === compactSnapshotDatabaseName ? name : requested),
    },
    databaseName: 'qa-proof-unused-legacy',
    getAccess: () => ({ scope, generation: 1, canReview: true, allowedKeys: new Set(keys) }),
  });
}

export function proofRow(id, count = 2) {
  const storage = {}, entries = {};
  for (let n = 0; n < count; n++) {
    storage['key-' + n] = `Pending work ${id}/${n}`;
    entries['key-' + n] = { principalScope: 'actor-A', pendingCentralSync: true,
      localWritePrepared: true, pendingBaseRevision: 7, serverRevision: 7, writes: 8 };
  }
  return { id, schema: 'football-science-backup-v1', app: 'Football Science',
    createdAt: '2026-11-12T01:00:00Z', reason: 'autosave', storage,
    recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
    saveContext: { scope: 'actor-A', entries } };
}

export async function dumpProofDb(name) {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name); r.onupgradeneeded = () => r.transaction.abort();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['versions', 'blocks']);
      const versions = tx.objectStore('versions').getAll(), blocks = tx.objectStore('blocks').getAll();
      tx.oncomplete = () => resolve({ versions: versions.result, blocks: blocks.result });
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

// Logical persisted bytes, including record keys/metadata and binary payloads.
// This is NOT physical IDB/index overhead or an origin quota estimate.
export function logicalBytes(value) {
  let binary = 0;
  const json = JSON.stringify(value, (_, item) => {
    if (item instanceof Uint8Array) { binary += item.byteLength; return null; }
    return item;
  });
  return new TextEncoder().encode(json).length + binary;
}

export function noise(length, seed = 1) {
  let state = seed >>> 0;
  return Array.from({ length }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[state >>> 0 & 63];
  }).join('');
}
