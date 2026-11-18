import { compactSnapshotDatabaseName } from './snapshot-compatible-reader.mjs';
import { bytesEqual } from './snapshot-compact-write-codec.mjs';

const failure = () => new Error('Compact history unavailable; existing work is unchanged');
export const compactRowBytes = row => new TextEncoder().encode(JSON.stringify({ ...row,
  packet: { ...row.packet, bytes: null } })).length + row.packet.bytes.byteLength;
const equalRow = (a, b) => a && b && bytesEqual(a.packet?.bytes, b.packet?.bytes) &&
  JSON.stringify({ ...a, packet: { ...a.packet, bytes: null } }) === JSON.stringify({ ...b, packet: { ...b.packet, bytes: null } });

// Independent append-only versions. Heads are small deduplication hints, never
// recovery data. No legacy database, migration, deletion, rotation or sync.
export function createCompactWriteStore({ indexedDB, maxVersions = 256, maxBytes = 32 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxVersions) || maxVersions < 1 || maxVersions > 256 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32 * 1024 * 1024) throw failure();
  async function open({ current, signal }) {
    if (!current() || signal.aborted) throw failure();
    return new Promise((resolve, reject) => {
      let ended = false;
      const r = indexedDB.open(compactSnapshotDatabaseName, 1);
      const stop = () => {
        if (ended) return; ended = true; signal.removeEventListener('abort', stop);
        try { r.transaction?.abort(); } catch {} reject(failure());
      };
      signal.addEventListener('abort', stop, { once: true });
      r.onblocked = r.onerror = stop;
      r.onupgradeneeded = event => {
        if (ended || !current() || signal.aborted || event.oldVersion !== 0) { r.transaction.abort(); stop(); return; }
        for (const name of ['versions', 'blocks', 'heads']) r.result.createObjectStore(name, { keyPath: 'key' });
      };
      r.onsuccess = () => {
        const db = r.result;
        if (ended || !current() || signal.aborted) { db.close(); stop(); return; }
        ended = true; signal.removeEventListener('abort', stop); db.onversionchange = () => db.close();
        try {
          if (db.version !== 1 || [...db.objectStoreNames].sort().join() !== 'blocks,heads,versions' ||
              [...db.objectStoreNames].some(n => db.transaction(n).objectStore(n).keyPath !== 'key')) throw failure();
          resolve(db);
        } catch { db.close(); reject(failure()); }
      };
    });
  }
  async function transaction(guard, write, operation) {
    const db = await open(guard);
    return new Promise((resolve, reject) => {
      let tx, result, error;
      const { current, signal } = guard;
      const abort = () => { error = failure(); try { tx?.abort(); } catch {} };
      const finish = ok => {
        signal.removeEventListener('abort', abort); db.close();
        if (ok && current() && !signal.aborted) resolve(result); else reject(error || failure());
      };
      try {
        if (!current() || signal.aborted) throw failure();
        tx = db.transaction(['versions', 'heads', 'blocks'], write ? 'readwrite' : 'readonly');
        tx.oncomplete = () => finish(true); tx.onabort = tx.onerror = () => finish(false);
        signal.addEventListener('abort', abort, { once: true });
        const safe = fn => () => {
          try { if (!current() || signal.aborted) throw failure(); fn(); }
          catch (e) { error = e; tx.abort(); }
        };
        operation(tx, value => { result = value; }, safe);
      } catch (e) { error = e; if (tx) tx.abort(); else finish(false); }
    });
  }
  const readHead = (scope, guard) => transaction(guard, false, (tx, done, safe) => {
    const r = tx.objectStore('heads').get(scope);
    r.onsuccess = safe(() => {
      const head = r.result;
      if (!head) { done({ head: null, row: null }); return; }
      if (head.key !== scope || typeof head.id !== 'string' || Object.keys(head).sort().join() !== 'id,key') throw failure();
      const version = tx.objectStore('versions').get(JSON.stringify([scope, head.id]));
      version.onsuccess = safe(() => {
        if (!version.result) throw failure();
        done({ head, row: version.result });
      });
    });
  });
  const retain = (row, observed, reuse, guard) => transaction(guard, true, (tx, done, safe) => {
    const versions = tx.objectStore('versions'), heads = tx.objectStore('heads');
    const scope = row.scope, head = heads.get(scope), blocks = tx.objectStore('blocks').count();
    blocks.onsuccess = safe(() => {
      if (blocks.result !== 0) throw failure(); // Never mix writer modes or adopt a foreign store.
      if (JSON.stringify(head.result || null) !== JSON.stringify(observed.head)) { done({ retry: true }); return; }
      const current = versions.get(row.key);
      current.onsuccess = safe(() => {
        if (current.result && !equalRow(current.result, row)) throw failure();
        if (reuse && !current.result) throw failure();
        if (current.result) { done({ inserted: false }); return; }
        let count = 0, bytes = 0;
        const cursor = versions.openCursor();
        cursor.onsuccess = safe(() => {
          const item = cursor.result;
          if (item) {
            const value = item.value;
            if (value.format !== 1 || value.mode !== 'standalone' || !(value.packet?.bytes instanceof Uint8Array) ||
                item.primaryKey !== JSON.stringify([value.scope, value.id])) throw failure();
            count++; bytes += compactRowBytes(value);
            if (count > maxVersions || bytes > maxBytes) throw failure();
            item.continue(); return;
          }
          // Include a conservative per-version allowance for the bounded heads.
          if (count >= maxVersions || bytes + compactRowBytes(row) + (count + 1) * 2048 > maxBytes) throw failure();
          versions.add(row).onsuccess = safe(() => {});
          heads.put({ key: scope, id: row.id }).onsuccess = safe(() => {});
          done({ inserted: true });
        });
      });
    });
  });
  return { readHead, retain };
}
