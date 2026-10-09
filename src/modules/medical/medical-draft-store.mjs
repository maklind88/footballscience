import { createLocalDatabaseConnection } from "../../core/local-database-connection.mjs";

export const MEDICAL_DRAFT_DATABASE = "football-science-medical-drafts-v1";
// Rescue copies are not cache. At either limit, preserve existing copies and
// reject the new write; never silently rotate unresolved clinical work.
export function createMedicalDraftStore({ indexedDB, getIndexedDB = () => indexedDB, createId = () => crypto.randomUUID(),
  maxCopies = 128, maxBytes = 32 * 1024 * 1024, timeoutMs = 10000 } = {}) {
  const connection = createLocalDatabaseConnection({ getIndexedDB, databaseName: MEDICAL_DRAFT_DATABASE,
    version: 1, stores: [{ name: "drafts", keyPath: "id" },
      { name: "catalog", keyPath: "id", indexes: [{ name: "scope", keyPath: "scope" }] }] });

  async function bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Medical rescue storage did not respond.")), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }

  async function retain({ scope, value, previousValue = null, baseRevision = null }) {
    if (!scope || typeof value !== "string" || !value) throw new Error("Medical draft ownership is unavailable.");
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Medical draft.");
    const row = { id: createId(), schema: 1, scope, value, previousValue, baseRevision,
      createdAt: new Date().toISOString() };
    row.bytes = JSON.stringify(row).length * 2;
    if (row.bytes > Math.min(maxBytes, 8 * 1024 * 1024)) throw new Error("Medical rescue storage is full.");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([scope, value, previousValue, baseRevision])));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const metadata = { id: row.id, schema: 1, scope, createdAt: row.createdAt, bytes: row.bytes, fingerprint };
    const db = await bounded(connection.open());
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["drafts", "catalog"], "readwrite"), catalog = tx.objectStore("catalog");
      let saved = metadata, failure, count = 0, bytes = 0, duplicate;
      const abort = message => { failure = new Error(message); tx.abort(); };
      const timer = setTimeout(() => abort("Medical rescue copy did not commit in time."), timeoutMs);
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(failure || tx.error || new Error("Medical rescue copy did not commit.")); };
      tx.oncomplete = () => { clearTimeout(timer); resolve(saved); }; // Request success alone is not durability.
      const request = catalog.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const existing = cursor.value;
          if (existing.schema !== 1 || !Number.isFinite(existing.bytes) || existing.bytes < 0) {
            abort("Medical rescue storage needs review."); return;
          }
          count++; bytes += existing.bytes;
          if (count > maxCopies || bytes > maxBytes) { abort("Medical rescue storage is full."); return; }
          if (existing.scope === scope && existing.fingerprint === fingerprint) duplicate = existing;
          cursor.continue(); return;
        }
        if (duplicate) {
          // Verify actual payload too: a catalog entry alone cannot acknowledge a draft.
          const read = tx.objectStore("drafts").get(duplicate.id);
          read.onsuccess = () => {
            const copy = read.result;
            if (copy?.scope !== scope || copy.value !== value || copy.previousValue !== previousValue || copy.baseRevision !== baseRevision) {
              abort("Medical recovery copy could not be verified."); return;
            }
            saved = duplicate;
          };
          return;
        }
        if (count >= maxCopies || bytes + row.bytes > maxBytes) { abort("Medical rescue storage is full."); return; }
        // Payload and small listing metadata commit together. No older generation is replaced.
        tx.objectStore("drafts").add(row); catalog.add(metadata);
      };
    });
  }

  async function list(scope) {
    if (!scope) return [];
    const indexedDB = getIndexedDB();
    if (indexedDB?.databases && !(await bounded(indexedDB.databases())).some(db => db.name === MEDICAL_DRAFT_DATABASE)) return [];
    const db = await bounded(connection.open());
    return new Promise((resolve, reject) => {
      const tx = db.transaction("catalog", "readonly"), rows = [];
      const request = tx.objectStore("catalog").index("scope").openCursor(scope);
      const timer = setTimeout(() => tx.abort(), timeoutMs);
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error("Medical rescue copies could not be listed.")); };
      tx.oncomplete = () => { clearTimeout(timer); resolve(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); };
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.schema !== 1 || row.scope !== scope || typeof row.createdAt !== "string" || rows.length >= maxCopies) { tx.abort(); return; }
        rows.push(row); cursor.continue();
      };
    });
  }

  async function read(scope, id) {
    if (!scope || !id) return null;
    const db = await bounded(connection.open());
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly"), request = tx.objectStore("drafts").get(id);
      const timer = setTimeout(() => tx.abort(), timeoutMs);
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error("Medical rescue copy could not be read.")); };
      tx.oncomplete = () => {
        clearTimeout(timer);
        const row = request.result;
        resolve(row?.schema === 1 && row.scope === scope && typeof row.value === "string" ? row : null);
      };
    });
  }

  return { retain, list, read, close: connection.close };
}
