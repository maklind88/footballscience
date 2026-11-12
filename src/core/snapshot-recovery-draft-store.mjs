export const recoveryDraftDatabaseName = 'football-science-history-drafts-v1';
const failure = () => new Error('Recovery draft storage unavailable; the original copy is unchanged');
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;

// Explicit user-created, immutable drafts only. No put, delete, rotation,
// current-module writes, compact writes or central sync. Limits reject new work.
export function createRecoveryDraftStore({ indexedDB, maxCopies = 32, maxBytes = 16 * 1024 * 1024,
  timeoutMs = 5000 } = {}) {
  async function open(write, current, signal) {
    if (!current() || signal?.aborted || !indexedDB) throw failure();
    if (!write) {
      if (!indexedDB.databases) throw failure();
      let timer;
      const rows = await Promise.race([indexedDB.databases(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(failure()), timeoutMs);
      })]).finally(() => clearTimeout(timer));
      if (!current() || signal?.aborted) throw failure();
      if (!rows.some(db => db.name === recoveryDraftDatabaseName)) return null;
    }
    return new Promise((resolve, reject) => {
      let ended = false;
      const request = write ? indexedDB.open(recoveryDraftDatabaseName, 1) : indexedDB.open(recoveryDraftDatabaseName);
      const stop = () => {
        if (ended) return; ended = true; clearTimeout(timer); signal?.removeEventListener('abort', stop);
        try { request.transaction?.abort(); } catch {} reject(failure());
      };
      const timer = setTimeout(stop, timeoutMs);
      signal?.addEventListener('abort', stop, { once: true });
      request.onblocked = request.onerror = stop;
      request.onupgradeneeded = () => {
        if (ended || !write || !current() || signal?.aborted) { request.transaction.abort(); stop(); return; }
        request.result.createObjectStore('drafts', { keyPath: 'id' });
        request.result.createObjectStore('catalog', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        if (ended || !current() || signal?.aborted) { db.close(); stop(); return; }
        ended = true; clearTimeout(timer); signal?.removeEventListener('abort', stop);
        db.onversionchange = () => db.close();
        try {
          if (db.version !== 1 || [...db.objectStoreNames].sort().join() !== 'catalog,drafts' ||
              ['catalog', 'drafts'].some(name => db.transaction(name).objectStore(name).keyPath !== 'id')) throw failure();
          resolve(db);
        } catch { db.close(); reject(failure()); }
      };
    });
  }

  async function transact(write, guard, operation) {
    const { current, signal } = guard;
    const db = await open(write, current, signal);
    if (!db) return null;
    if (!current() || signal?.aborted) { db.close(); throw failure(); }
    return new Promise((resolve, reject) => {
      let tx, result, error;
      const abort = () => { error = failure(); try { tx.abort(); } catch {} };
      const check = () => {
        if (!current() || signal?.aborted) throw failure();
      };
      const finish = ok => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); db.close();
        if (ok && current() && !signal?.aborted) resolve(result); else reject(error || failure());
      };
      const timer = setTimeout(abort, timeoutMs);
      try {
        tx = db.transaction(['drafts', 'catalog'], write ? 'readwrite' : 'readonly');
        tx.oncomplete = () => finish(true); tx.onabort = tx.onerror = () => finish(false);
        signal?.addEventListener('abort', abort, { once: true });
        const safe = fn => (...args) => { try { check(); fn(...args); } catch (e) { error = e; tx.abort(); } };
        check(); operation(tx, value => { result = value; }, safe);
      } catch (e) { error = e; if (tx) tx.abort(); else finish(false); }
    });
  }

  function retain(row, guard) {
    const bytes = size(row);
    if (bytes > 8 * 1024 * 1024) return Promise.reject(failure());
    return transact(true, guard, (tx, done, safe) => {
      const drafts = tx.objectStore('drafts'), catalog = tx.objectStore('catalog');
      const count = drafts.count(), cursor = catalog.openCursor();
      let copies = 0, total = 0, duplicate;
      cursor.onsuccess = safe(() => {
        const item = cursor.result;
        if (item) {
          const meta = item.value;
          if (typeof meta.scope !== 'string' || !/^[a-f0-9]{64}$/.test(meta.id) ||
              !Number.isSafeInteger(meta.bytes) || meta.bytes < 0 || !Number.isFinite(Date.parse(meta.createdAt))) throw failure();
          copies++; total += meta.bytes + size(meta);
          if (copies > maxCopies || total > maxBytes) throw failure();
          if (meta.id === row.id) duplicate = meta;
          item.continue(); return;
        }
        if (count.result !== copies) throw failure();
        if (duplicate) {
          const read = drafts.get(row.id);
          read.onsuccess = safe(() => {
            const prior = read.result;
            if (duplicate.scope !== row.content.scope || !prior || size(prior) !== duplicate.bytes ||
                JSON.stringify(prior.content) !== JSON.stringify(row.content) || prior.id !== row.id ||
                prior.createdAt !== duplicate.createdAt) throw failure();
            done({ row: prior, inserted: false });
          });
          return;
        }
        const meta = { id: row.id, scope: row.content.scope, createdAt: row.createdAt, bytes };
        if (copies >= maxCopies || total + bytes + size(meta) > maxBytes) throw failure();
        drafts.add(row).onsuccess = safe(() => {}); catalog.add(meta).onsuccess = safe(() => {});
        done({ row, inserted: true });
      });
    });
  }

  const list = (scope, guard) => transact(false, guard, (tx, done, safe) => {
    const result = [], request = tx.objectStore('catalog').openCursor(); let scanned = 0;
    request.onsuccess = safe(() => {
      const cursor = request.result;
      if (!cursor) { done(result); return; }
      const row = cursor.value;
      if (++scanned > maxCopies || !/^[a-f0-9]{64}$/.test(row.id) || typeof row.scope !== 'string' ||
          !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !Number.isFinite(Date.parse(row.createdAt))) throw failure();
      if (row.scope === scope) result.push(row); cursor.continue();
    });
  });
  const read = (id, scope, guard) => transact(false, guard, (tx, done, safe) => {
    const request = tx.objectStore('drafts').get(id), meta = tx.objectStore('catalog').get(id);
    meta.onsuccess = safe(() => {
      const row = request.result, catalog = meta.result;
      if (!row && !catalog) { done(null); return; }
      if (!row || !catalog || size(row) !== catalog.bytes || row.id !== id || catalog.id !== id ||
          row.createdAt !== catalog.createdAt || row.content?.scope !== catalog.scope) throw failure();
      done(row.content.scope === scope ? row : null);
    });
  });
  return { retain, list, read };
}
