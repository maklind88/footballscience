import { recoveryEnvelope, recoveryKey } from './history-recovery-draft-fixture.mjs';
import { createCompactSnapshotArchive } from '/src/core/snapshot-compact-archive.mjs';
import { createSnapshotCompatibleReader, compactSnapshotDatabaseName } from '/src/core/snapshot-compatible-reader.mjs';
export const dbName = compactSnapshotDatabaseName;
export function candidateRow(id = 'one', generation = 0) {
  const row = recoveryEnvelope('actor-A', id), state = JSON.parse(row.storage[recoveryKey]);
  state.sessions['2026-11-12'].blocks[0].objective = 'Retain exact pending content åäö '.repeat(1200) + generation;
  row.storage[recoveryKey] = JSON.stringify(state); return row;
}
export function writerFixture(options = {}) {
  const state = { enabled: true, scope: 'actor-A', generation: 1, canWrite: true, allowedKeys: new Set([recoveryKey]) };
  const writer = createCompactSnapshotArchive({ indexedDB, enabled: () => state.enabled, getAccess: () => state, ...options });
  const reader = createSnapshotCompatibleReader({ indexedDB, databaseName: 'qa-unused-legacy', getAccess: () => ({ ...state, canReview: state.canWrite }) });
  return { state, writer, reader };
}
export async function writerDump() {
  if (!(await indexedDB.databases()).some(d => d.name === dbName && d.version)) return null;
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName); r.onupgradeneeded = () => r.transaction.abort();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try { return await new Promise((resolve, reject) => {
    const result = {}, tx = db.transaction([...db.objectStoreNames]);
    for (const name of db.objectStoreNames) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { result[name] = r.result; }; }
    tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
