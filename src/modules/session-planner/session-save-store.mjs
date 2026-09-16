import { validateSessionDateChange } from "./session-save-protocol.mjs";

const prefix = "session-save:";
const copy = (value) => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function normalize(record) {
  const row = copy(record);
  if (!row || typeof row.scope !== "string" || !row.scope.trim() ||
      !["pending", "review", "archived"].includes(row.status) || !Number.isFinite(row.createdAt)) {
    throw new Error("Local save identity is missing or invalid.");
  }
  validateSessionDateChange(row.change);
  const id = `${prefix}${row.change.id}`;
  if (row.id && row.id !== id) throw new Error("Local save identity changed.");
  return { ...row, id };
}

export function createSessionSaveStore({ indexedDB = globalThis.indexedDB } = {}) {
  let opening;
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new Error("Local save storage is unavailable.")); return; }
      const request = indexedDB.open("football-science-data-safety-v1", 1);
      request.onupgradeneeded = () => {
        for (const name of ["snapshots", "latest"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => { opening = null; throw error; });
    return opening;
  }
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("latest", mode, { durability: "strict" });
      let result, failure;
      const abort = (error) => { failure = error; transaction.abort(); };
      const read = (request, callback) => {
        request.onsuccess = () => { try { callback(request.result); } catch (error) { abort(error); } };
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => { failure ||= transaction.error; };
      transaction.onabort = () => reject(failure || transaction.error || new Error("Local save was cancelled."));
      try { action(transaction.objectStore("latest"), read, (value) => { result = value; }); }
      catch (error) { abort(error); }
    });
  }

  function putMany(records) {
    const rows = records.map(normalize);
    if (new Set(rows.map((row) => row.scope)).size > 1 || new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new Error("A local save batch must have one owner and distinct operation IDs.");
    }
    return transact("readwrite", (store, read, done) => {
      for (const row of rows) read(store.get(row.id), (existing) => {
        if (existing && !same(existing, row)) throw new Error("An immutable local save already uses this ID.");
        if (!existing) store.add(row);
      });
      done(true);
    });
  }

  function compareAndChange(expected, apply) {
    const row = normalize(expected);
    return transact("readwrite", (store, read, done) => read(store.get(row.id), (existing) => {
      if (!same(existing, row)) { done(false); return; }
      apply(store, read, row);
      done(true);
    }));
  }

  return {
    async archiveLocal(value, context) {
      if (!context?.scope || typeof value !== "string") return;
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const id = `football-session-planner-v3-quota-fallback:${encodeURIComponent(context.scope)}:review:cache:${hash}`;
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite"), snapshots = tx.objectStore("snapshots");
        const request = snapshots.get(id);
        request.onsuccess = () => {
          if (!request.result) snapshots.put({ id, reason: "session-planner-recovery-review", createdAt: new Date().toISOString(), recovery: { scope: context.scope, baseRevision: context.revision }, storage: { "football-session-planner-v3": value } });
        };
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Local archive failed."));
      });
    },
    // Pending/review rows deliberately live outside the rotating snapshot store.
    put: (record) => putMany([record]),
    putMany,
    update(expected, replacement) {
      const next = normalize(replacement), previous = normalize(expected);
      if (previous.status !== "pending" || next.status !== "review" ||
          !same({ ...next, status: previous.status, conflicts: previous.conflicts }, previous)) {
        throw new Error("Only a pending save can move to review without changing its identity or payload.");
      }
      return compareAndChange(previous, (store) => store.put(next));
    },
    remove: (expected) => compareAndChange(expected, (store, _read, row) => store.delete(row.id)),
    resolveReview(expected, replacement = null) {
      const previous = normalize(expected), next = replacement ? normalize(replacement) : null;
      if (previous.status !== "review" || (next && (next.scope !== previous.scope || next.status !== "pending" ||
          next.change.date !== previous.change.date || next.id === previous.id))) throw new Error("Local review identity changed.");
      return compareAndChange(previous, (store, read, row) => {
        const archive = () => store.put({ ...row, status: "archived", resolvedAt: new Date().toISOString() });
        if (!next) { archive(); return; }
        read(store.get(next.id), (existing) => {
          if (existing) throw new Error("The replacement operation ID is already in use.");
          store.add(next);
          archive();
        });
      });
    },
    async list(scope) {
      if (typeof scope !== "string" || !scope.trim()) return [];
      const rows = await transact("readonly", (store, read, done) => read(store.getAll(), done));
      return (rows || []).filter((row) => row.id?.startsWith(prefix) && row.scope === scope)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    },
  };
}
