import { createLocalDatabaseConnection } from "../../core/local-database-connection.mjs";
import { librarySaveKeys } from "./library-save-protocol.mjs";

export const libraryDatabaseName = "football-science-library-v1";
const cacheBudget = 16 * 1024 * 1024;
const recordId = (scope, key) => JSON.stringify([scope, key]);

export function createLibrarySaveStore({ indexedDB = globalThis.indexedDB, databaseName = libraryDatabaseName } = {}) {
  const { open, close } = createLocalDatabaseConnection({ indexedDB, databaseName, version: 1,
    stores: ["baselines", "pending", "recovery", "access"].map(name => ({ name, keyPath: "id",
      indexes: name === "pending" ? [{ name: "scopeKey", keyPath: ["scope", "key"] }] : [] })) });
  const validContext = (scope, key) => {
    if (typeof scope !== "string" || !scope || !librarySaveKeys.includes(key)) throw new Error("Library storage requires an account and key.");
  };
  async function transaction(names, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Library storage did not commit."));
      try { action(tx, value => { result = value; }); } catch (error) { tx.abort(); reject(error); }
    });
  }
  const read = (store, id) => transaction([store], "readonly", (tx, done) => {
    const request = tx.objectStore(store).get(id); request.onsuccess = () => done(request.result ?? null);
  });
  async function list(scope, storeName = "pending") {
    if (!scope || !["pending", "recovery"].includes(storeName)) return [];
    return transaction([storeName], "readonly", (tx, done) => {
      const prefix = JSON.stringify([scope]).slice(0, -1) + ",";
      const request = tx.objectStore(storeName).getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      request.onsuccess = () => done(request.result.filter(row => row.scope === scope).sort((a,b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.id.localeCompare(b.id)));
    });
  }
  async function putPending(row) {
    validContext(row.scope, row.key);
    if (!row.change?.id || row.change.key !== row.key || !Number.isFinite(row.createdAt)) throw new Error("Invalid pending library change.");
    const next = { ...structuredClone(row), id: recordId(row.scope, row.change.id) };
    return transaction(["pending"], "readwrite", (tx, done) => {
      const store = tx.objectStore("pending"), request = store.get(next.id);
      request.onsuccess = () => {
        const withoutOrder = row => { const { order, ...immutable } = row; return immutable; };
        if (request.result && JSON.stringify(withoutOrder(request.result)) !== JSON.stringify(withoutOrder(next))) { tx.abort(); return; }
        if (request.result) { done(request.result); return; }
        let bytes = JSON.stringify(next).length * 2 + 64, count = 1, order = 0;
        const prefix = JSON.stringify([row.scope]).slice(0, -1) + ",";
        const cursor = store.openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
        cursor.onsuccess = () => {
          if (bytes > 64 * 1024 * 1024 || count > 1000) { tx.abort(); return; }
          if (cursor.result) {
            bytes += JSON.stringify(cursor.result.value).length * 2; count++;
            order = Math.max(order, cursor.result.value.order || 0); cursor.result.continue();
          } else { next.order = order + 1; store.add(next); done(next); }
        };
      };
    });
  }
  async function cache(scope, key, value, revision, acknowledged = null) {
    validContext(scope, key);
    if (typeof value !== "string" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid central library receipt.");
    const bytes = value.length * 2;
    // Index keys identify pinned baselines without loading every pending payload.
    return transaction(["baselines", "pending", "access"], "readwrite", (tx, done) => {
      tx.objectStore("access").put({ id: recordId(scope, key), scope, key, allowed: true });
      const pinned = new Set(), pending = tx.objectStore("pending");
      const cursor = pending.index("scopeKey").openKeyCursor();
      cursor.onsuccess = () => {
        if (cursor.result) {
          if (cursor.result.primaryKey !== acknowledged?.id) pinned.add(recordId(...cursor.result.key));
          cursor.result.continue(); return;
        }
        const store = tx.objectStore("baselines"), request = store.getAll();
        request.onsuccess = () => {
          const id = recordId(scope, key), rows = request.result, existing = rows.find(row => row.id === id);
          let cached = Boolean(existing && existing.revision >= revision);
          if (!existing || revision >= existing.revision) {
            let total = rows.filter(row => row.id !== id).reduce((sum, row) => sum + row.bytes, 0);
            const candidates = rows.filter(row => row.id !== id && !pinned.has(row.id)).sort((a,b) => a.cachedAt - b.cachedAt);
            const available = cacheBudget - total + candidates.reduce((sum, row) => sum + row.bytes, 0);
            if (bytes <= available) {
              for (const row of candidates) {
                if (total + bytes <= cacheBudget) break;
                store.delete(row.id); total -= row.bytes;
              }
              store.put({ id, scope, key, value, revision, bytes, cachedAt: Date.now() }); cached = true;
            } else cached = false;
          }
          // Retain the acknowledged edit until its complete baseline is durable.
          // Otherwise an offline reopen could fall back to an older library.
          if (acknowledged && cached) {
            const found = pending.get(acknowledged.id);
            found.onsuccess = () => {
              if (!found.result) return;
              if (found.result.scope !== scope || found.result.key !== key ||
                  JSON.stringify(found.result.change) !== JSON.stringify(acknowledged.change)) { tx.abort(); return; }
              pending.delete(acknowledged.id);
            };
          }
          done({ cached });
        };
      };
    });
  }
  async function archive(scope, key, value, metadata = {}, identity = metadata) {
    validContext(scope, key);
    if (typeof value !== "string") throw new Error("Recovery requires original bytes.");
    const bytes = new TextEncoder().encode(JSON.stringify([scope, key, value, identity]));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const row = { id: recordId(scope, hash), scope, key, value, metadata: structuredClone(metadata), recoveryIdentity: structuredClone(identity), createdAt: Date.now() };
    await transaction(["recovery"], "readwrite", tx => {
      const store = tx.objectStore("recovery"), request = store.get(row.id);
      request.onsuccess = () => { if (!request.result) store.add(row); };
    });
    const persisted = await read("recovery", row.id);
    if (!persisted || persisted.scope !== scope || persisted.key !== key || persisted.value !== value ||
        JSON.stringify(persisted.recoveryIdentity) !== JSON.stringify(identity)) throw new Error("Recovery copy could not be verified.");
    return persisted;
  }
  async function archivePending(original) {
    validContext(original.scope, original.key);
    await transaction(["pending", "recovery"], "readwrite", tx => {
      const pending = tx.objectStore("pending"), request = pending.get(original.id);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || row.scope !== original.scope || JSON.stringify(row.change) !== JSON.stringify(original.change)) { tx.abort(); return; }
        tx.objectStore("recovery").put({ ...row, resolvedAt: Date.now(), reason: "explicit-library-review" });
        pending.delete(row.id);
      };
    });
  }
  return { open, close, list, putPending, cache, archive, archivePending,
    async denyRead(scope, key) {
      validContext(scope, key);
      // Preserve baselines, pending edits and recovery exports byte-for-byte.
      await transaction(["access"], "readwrite", tx => {
        tx.objectStore("access").put({ id: recordId(scope, key), scope, key, allowed: false });
      });
    },
    async mayReadOffline(scope, key) { return (await read("access", recordId(scope, key)))?.allowed !== false; },
    async baseline(scope, key) { validContext(scope, key); return read("baselines", recordId(scope, key)); },
    async exportScope(scope) {
      if (typeof scope !== "string" || !scope) throw new Error("Recovery export requires an account.");
      // One snapshot: acknowledgement/review transactions cannot move a row
      // between stores halfway through the export.
      return transaction(["pending", "recovery", "baselines"], "readonly", (tx, done) => {
        const result = { schema: "football-library-recovery-v1", createdAt: new Date().toISOString(), pending: [], recovery: [], baselines: [] };
        const prefix = JSON.stringify([scope]).slice(0, -1) + ",";
        for (const name of ["pending", "recovery", "baselines"]) {
          const request = tx.objectStore(name).getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
          request.onsuccess = () => { result[name] = request.result.filter(row => row.scope === scope); };
        }
        done(result);
      });
    },
  };
}
