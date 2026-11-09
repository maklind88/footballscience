// Synthetic fixture writer only; excluded from production publication.
export async function seedCompactHistory(rows, mode = 'standalone') {
  const { compactSnapshotDatabaseName } = await import('/src/core/snapshot-compatible-reader.mjs');
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(x => x.toString(16).padStart(2, '0')).join('');
  const pack = async text => {
    const plain = new TextEncoder().encode(text);
    const bytes = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    return { codec: 'gzip', bytes, rawLength: plain.length, plainDigest: await digest(plain), encodedDigest: await digest(bytes) };
  };
  const prepared = [];
  for (const original of rows) {
    const copy = structuredClone(original), refs = [], blocks = [], scope = copy.saveContext.scope;
    if (mode === 'pooled') for (const [key, value] of Object.entries(copy.storage)) {
      const packet = await pack(JSON.stringify(value)), ref = JSON.stringify([scope, key, packet.plainDigest]);
      refs.push([key, ref]); blocks.push({ key: ref, ...packet }); copy.storage[key] = { prototypeRef: ref };
    }
    prepared.push({ blocks, row: { key: JSON.stringify([scope, copy.id]), scope, id: copy.id, format: 1, mode,
      originalDigest: await digest(new TextEncoder().encode(JSON.stringify(original))), packet: await pack(JSON.stringify(copy)), refs } });
  }
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(compactSnapshotDatabaseName, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('versions', { keyPath: 'key' }); r.result.createObjectStore('blocks', { keyPath: 'key' }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['versions', 'blocks'], 'readwrite');
    for (const item of prepared) {
      for (const block of item.blocks) tx.objectStore('blocks').put(block);
      tx.objectStore('versions').put(item.row);
    }
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  db.close();
}
export function historyRow(id, scope, key, value) {
  return { id, schema: 'football-science-backup-v1', app: 'Football Science', createdAt: '2026-11-09T12:00:00.000Z',
    storage: { [key]: value }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
    saveContext: { scope, entries: { [key]: { principalScope: scope, pendingCentralSync: true, writes: 1, serverRevision: 0 } } } };
}
