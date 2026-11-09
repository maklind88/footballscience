// Key-only bounded discovery. Payloads are read/verified by the compatibility
// adapter, never trusted just because an id is present in this store.
export async function listCompactKeys({ indexedDB, databaseName, scope, beforeKey, maxRows = 100, timeoutMs = 3000 }) {
  const empty = status => ({ status, keys: [], nextKey: null });
  if (!scope || !indexedDB?.databases) return empty('unavailable');
  let timer, db, tx, done = false;
  return new Promise(resolve => {
    const report = empty('complete');
    const finish = status => {
      if (done) return; done = true; clearTimeout(timer);
      if (status !== 'complete') { try { tx?.abort(); } catch {} }
      db?.close(); report.status = status; resolve(report);
    };
    timer = setTimeout(() => finish('partial'), timeoutMs);
    Promise.resolve().then(() => indexedDB.databases()).then(databases => {
      if (done) return;
      if (!Array.isArray(databases)) { finish('unavailable'); return; }
      if (!databases.some(row => row.name === databaseName)) { finish('absent'); return; }
      const request = indexedDB.open(databaseName);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = request.onblocked = () => finish('unavailable');
      request.onsuccess = () => {
        db = request.result;
        if (done) { db.close(); return; }
        db.onversionchange = () => finish('unavailable');
        try {
          if (!db.objectStoreNames.contains('versions') || !db.objectStoreNames.contains('blocks')) { finish('unavailable'); return; }
          tx = db.transaction(['versions'], 'readonly');
          tx.oncomplete = () => finish(report.status);
          tx.onerror = tx.onabort = () => finish('unavailable');
          const store = tx.objectStore('versions');
          if (store.keyPath !== 'key') { finish('unavailable'); return; }
          const prefix = JSON.stringify([scope]).slice(0, -1) + ',';
          if (beforeKey !== undefined && (typeof beforeKey !== 'string' || !beforeKey.startsWith(prefix))) { finish('unavailable'); return; }
          const range = IDBKeyRange.bound(prefix, beforeKey ?? prefix + '\uffff', false, beforeKey !== undefined);
          const read = store.openKeyCursor(range, 'prev');
          read.onsuccess = () => {
            if (done) return;
            const cursor = read.result;
            if (!cursor) return;
            if (report.keys.length >= maxRows) { report.status = 'partial'; return; }
            report.keys.push(cursor.key); report.nextKey = cursor.key; cursor.continue();
          };
        } catch { finish('unavailable'); }
      };
    }).catch(() => finish('unavailable'));
  });
}
