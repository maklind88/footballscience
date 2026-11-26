import { canonicalSessionValue, replaceSessionDate, sameSessionValue } from "./session-save-protocol.mjs";

const schema = "sessions-accepted-date-v1";
const prefix = "session-accepted-date:";
const ownerPrefix = (scope, owner) => `${prefix}${encodeURIComponent(JSON.stringify([scope, owner]))}:`;
export const sessionAcceptedDateKey = (scope, owner, date) => `${ownerPrefix(scope, owner)}${date}`;
const digest = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(value)))), (byte) => byte.toString(16).padStart(2, "0")).join("");

function payload(record) {
  const { scope, owner, date, revision, operationId, value } = record || {};
  if (record?.schema !== schema || typeof scope !== "string" || !scope || typeof owner !== "string" || !owner ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
      !Number.isSafeInteger(revision) || revision < 1 || !/^[\w-]{1,100}$/.test(operationId || "") ||
      !value?.session || typeof value.session !== "object" || Array.isArray(value.session) ||
      (value.session.date !== undefined && value.session.date !== date) ||
      !value.tombstones || typeof value.tombstones !== "object" || Array.isArray(value.tombstones) ||
      record.id !== sessionAcceptedDateKey(scope, owner, date)) throw new Error("Accepted Sessions base is invalid.");
  return canonicalSessionValue({ schema, scope, owner, date, revision, operationId, value });
}

export async function verifySessionAcceptedDate(record) {
  const content = payload(record);
  if (record.hash !== await digest(content)) throw new Error("Accepted Sessions base failed integrity verification.");
  return record;
}

function samePending(current, original) {
  return current.scope === original.scope && current.writer === original.writer &&
    current.createdAt === original.createdAt && current.status === original.status &&
    JSON.stringify(current.change) === JSON.stringify(original.change);
}

// Stored beside (not inside) journal rows. No IDB version upgrade, cache pruning,
// snapshot rotation, compact encoding, or automatic authentication/bootstrap.
export function createSessionAcceptedBase({ open }) {
  async function readStored(key, many = false) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("latest"), store = tx.objectStore("latest");
      const request = many ? store.getAll(IDBKeyRange.bound(key, `${key}\uffff`)) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Base read aborted."));
    });
  }

  async function acknowledge(original, receipt, metadata, { owner, isCurrent = () => true } = {}) {
    if (!original?.scope || original.status !== "pending" || receipt?.id !== original.change?.id ||
        receipt?.date !== original.change?.date) throw new Error("Sessions receipt identity mismatch.");
    const id = sessionAcceptedDateKey(original.scope, owner, receipt.date);
    const record = { id, schema, scope: original.scope, owner, date: receipt.date,
      revision: Number(metadata?.revision), operationId: receipt.id, value: canonicalSessionValue(receipt.value) };
    record.hash = await digest(payload(record));
    // Verify outside the write transaction; inside it CAS checks the exact bytes.
    const previous = await readStored(id);
    if (previous) await verifySessionAcceptedDate(previous);
    if (!isCurrent()) throw new Error("Account or team changed before checkpoint.");
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("latest", "readwrite", { durability: "strict" });
      let failure;
      const abort = (message) => { failure = new Error(message); tx.abort(); };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error("Accepted base was not committed."));
      if (tx.durability !== "strict") { abort("Strict local durability is unavailable."); return; }
      const store = tx.objectStore("latest"), journalId = `session-save:${original.change.id}`;
      const pending = store.get(journalId), accepted = store.get(id);
      accepted.onsuccess = () => {
        if (!isCurrent()) { abort("Account or team changed during checkpoint."); return; }
        const identical = sameSessionValue(accepted.result, record);
        if ((JSON.stringify(accepted.result) !== JSON.stringify(previous) && !identical) ||
            (pending.result && !samePending(pending.result, original))) {
          abort("Local Sessions generation changed; retained for retry."); return;
        }
        const stored = identical ? accepted.result : previous;
        if (stored?.revision === record.revision && !sameSessionValue(stored.value, record.value)) {
          abort("Accepted revision has different content; originals retained."); return;
        }
        if (!stored || stored.revision < record.revision) store.put(record);
        // Atomic with the checkpoint: a quota failure/crash rolls BOTH back.
        // Only the exact server-acknowledged operation can be retired here.
        if (pending.result) store.delete(journalId);
      };
    });
    return { localCheckpointReady: true };
  }

  async function readAcceptedBase(scope, owner) {
    if (typeof scope !== "string" || !scope || typeof owner !== "string" || !owner) return null;
    const records = await readStored(ownerPrefix(scope, owner), true);
    if (records.some((row) => row.scope !== scope || row.owner !== owner)) throw new Error("Accepted base scope mismatch.");
    if (!records.length) return null;
    let state = { sessions: {}, blockDeletionTombstones: {} };
    const revisions = {};
    for (const record of records.sort((a, b) => a.date.localeCompare(b.date))) {
      await verifySessionAcceptedDate(record);
      state = replaceSessionDate(state, record.date, record.value);
      revisions[record.date] = record.revision;
    }
    // Per-date receipts are not a fresh snapshot of the entire calendar.
    return { scope, owner, value: JSON.stringify(state), revisions, dates: Object.keys(revisions),
      complete: false, source: "server-receipts", readOnly: true };
  }
  return { acknowledge, readAcceptedBase };
}
