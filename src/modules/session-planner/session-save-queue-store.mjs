import { validateSessionDateChange } from "./session-save-protocol.mjs";
import { canCompactSessionText } from "./session-save-text-compaction.mjs";

const DATABASE = "football-science-session-outbox-v2";
const PROTOCOL = "sessions-queue-v2";
const copy = (value) => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
const serialize = (value) => JSON.stringify(canonical(value));
const same = (a, b) => serialize(a) === serialize(b);
function normalize(record) {
  const row = copy(record), id = `session-queue-v2:${row?.change?.id}`;
  if (!row || typeof row.scope !== "string" || !row.scope.trim() || !Number.isFinite(row.createdAt)
    || !["pending", "review", "archived"].includes(row.status) || (row.id && row.id !== id)
    || (row.schema && row.schema !== PROTOCOL) || (row.writer !== undefined && typeof row.writer !== "string")) throw new Error("Invalid local queue identity.");
  validateSessionDateChange(row.change);
  return { ...row, id, schema: PROTOCOL };
}
function stored(record) {
  const row = normalize(record);
  if (record.schema !== PROTOCOL || !Number.isSafeInteger(row.ordinal) || row.ordinal <= 0 || typeof row.attempted !== "boolean") throw new Error("Local queue metadata needs recovery.");
  return row;
}
async function fingerprint(row) {
  const bytes = new TextEncoder().encode(serialize(row));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Separate database/protocol: older clients cannot send an unclaimed copy.
// Existing v1 pending rows are neither read, rekeyed nor removed here.
export function createSessionSaveQueueStore({ indexedDB = globalThis.indexedDB, locks = globalThis.navigator?.locks } = {}) {
  let opening;
  const owners = new Set();
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new Error("Durable save storage is unavailable.")); return; }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("operations", { keyPath: "id" });
        store.createIndex("scope", "scope");
        request.result.createObjectStore("identities", { keyPath: "id" });
        request.result.createObjectStore("meta");
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
      const tx = db.transaction(["operations", "identities", "meta"], mode, { durability: "strict" });
      let result, failure;
      const abort = (error) => { failure = error; tx.abort(); };
      const read = (request, callback) => { request.onsuccess = () => { try { callback(request.result); } catch (error) { abort(error); } }; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => { failure ||= tx.error; };
      tx.onabort = () => reject(failure || tx.error || new Error("Durable queue transaction was cancelled."));
      try { action(tx.objectStore("operations"), tx.objectStore("identities"), tx.objectStore("meta"), read, (value) => { result = value; }); }
      catch (error) { abort(error); }
    });
  }
  const order = (a, b) => a.ordinal - b.ordinal;
  async function putMany(records) {
    const rows = records.map(normalize);
    if (!rows.length) return true;
    if (new Set(rows.map((row) => row.scope)).size !== 1 || new Set(rows.map((row) => row.id)).size !== rows.length
      || rows.some((row) => row.status !== "pending" || row.attempted || row.ordinal !== undefined)) throw new Error("Only new scoped operations can enter the queue.");
    const hashes = [];
    for (const row of rows) hashes.push(await fingerprint(row));
    return transact("readwrite", (store, identities, meta, read, done) => read(meta.get("ordinal"), (counter = 0) => {
      read(store.index("scope").getAll(rows[0].scope), (records) => {
        const existing = records.map(stored);
        for (const [index, row] of rows.entries()) read(identities.get(row.id), (seen) => {
          if (seen) { if (seen.hash !== hashes[index]) throw new Error("An immutable operation already uses this ID."); return; }
          if (!Number.isSafeInteger(counter) || counter >= Number.MAX_SAFE_INTEGER) throw new Error("Local queue sequence exhausted.");
          let next = { ...row, attempted: false, ordinal: ++counter };
          const tail = existing.filter((item) => item.status !== "archived").sort(order).at(-1);
          if (rows.length === 1 && tail && canCompactSessionText(tail, next)) {
            next = { ...next, ordinal: tail.ordinal, change: { ...next.change, before: tail.change.before } };
            store.delete(tail.id); existing.splice(existing.indexOf(tail), 1);
          }
          store.add(next); existing.push(next);
          // Small immutable ID evidence survives compaction/ack; no old payload
          // can be reintroduced by a delayed duplicate stage call.
          identities.add({ id: row.id, scope: row.scope, hash: hashes[index] });
          meta.put(counter, "ordinal");
        });
        done(true);
      });
    }));
  }
  async function compareAndChange(expected, apply) {
    const row = normalize(expected);
    return transact("readwrite", (store, identities, meta, read, done) => read(store.get(row.id), (existing) => {
      if (!same(existing, row)) { done(false); return; }
      apply(store, identities, meta, read, row); done(true);
    }));
  }
  async function withReplay(scope, work) {
    if (!scope || !locks?.request) throw new Error("Cross-tab save coordination is unavailable. Local changes remain pending.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      return await locks.request(`${PROTOCOL}:${scope}`, { mode: "exclusive", signal: controller.signal }, async () => {
        clearTimeout(timer); owners.add(scope);
        try { return await work(); } finally { owners.delete(scope); }
      });
    } finally { clearTimeout(timer); }
  }
  return {
    protocol: PROTOCOL, putMany, withReplay,
    async *replayRows(scope) {
      const visited = new Set();
      while (true) {
        if (!owners.has(scope)) throw new Error("Replay ownership is required before claiming a save.");
        const next = await transact("readwrite", (store, _ids, _meta, read, done) => read(store.index("scope").getAll(scope), (rows) => {
          const row = rows.map(stored).filter((item) => item.status !== "archived" && !visited.has(item.id)).sort(order)[0];
          if (!row) { done(null); return; }
          const claimed = normalize(row.status === "pending" ? { ...row, attempted: true } : row);
          if (!same(claimed, row)) store.put(claimed);
          done(claimed);
        }));
        if (!next) return;
        visited.add(next.id); yield next;
      }
    },
    async list(scope) {
      if (!scope) return [];
      return transact("readonly", (store, _ids, _meta, read, done) => read(store.index("scope").getAll(scope), (rows) => done(rows.map(stored).sort(order))));
    },
    confirmedRevision(scope) {
      return transact("readonly", (_store, _ids, meta, read, done) => read(meta.get(`confirmed:${scope}`), (revision = 0) => {
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Local acknowledgement needs recovery.");
        done(revision);
      }));
    },
    update(expected, replacement) {
      const previous = normalize(expected), next = normalize(replacement);
      if (previous.status !== "pending" || next.status !== "review"
        || !same({ ...next, status: previous.status, conflicts: previous.conflicts }, previous)) throw new Error("Only an unchanged pending operation may move to review.");
      return compareAndChange(previous, (store) => store.put(next));
    },
    remove(expected, metadata) {
      if (!owners.has(expected.scope) || expected.attempted !== true) throw new Error("Only a claimed save may be acknowledged.");
      if (!Number.isSafeInteger(metadata?.revision) || metadata.revision <= 0) throw new Error("A verified server revision is required.");
      return compareAndChange(expected, (store, _ids, meta, read, row) => {
        store.delete(row.id);
        read(meta.get(`confirmed:${row.scope}`), (revision = 0) => {
          if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Local acknowledgement needs recovery.");
          meta.put(Math.max(revision, metadata.revision), `confirmed:${row.scope}`);
        });
      });
    },
    async resolveReview(expected, replacement = null) {
      const previous = normalize(expected), next = replacement ? normalize(replacement) : null;
      if (!owners.has(previous.scope) || previous.status !== "review"
        || (next && (next.scope !== previous.scope || next.status !== "pending" || next.attempted || next.ordinal !== undefined
          || next.id === previous.id || next.change.date !== previous.change.date))) throw new Error("Invalid review owner or replacement.");
      const hash = next ? await fingerprint(next) : null;
      return compareAndChange(previous, (store, identities, meta, read, row) => {
        const archive = () => store.put({ ...row, status: "archived", resolvedAt: new Date().toISOString() });
        if (!next) { archive(); return; }
        read(identities.get(next.id), (seen) => {
          if (seen) throw new Error("Replacement operation ID was already used.");
          read(meta.get("ordinal"), (counter = 0) => {
            if (!Number.isSafeInteger(counter) || counter >= Number.MAX_SAFE_INTEGER) throw new Error("Local queue sequence exhausted.");
            store.add({ ...next, attempted: false, ordinal: counter + 1 });
            identities.add({ id: next.id, scope: next.scope, hash }); meta.put(counter + 1, "ordinal"); archive();
          });
        });
      });
    },
    archiveLocal() { throw new Error("Legacy pending data requires reviewed recovery before this queue can be used."); },
  };
}
