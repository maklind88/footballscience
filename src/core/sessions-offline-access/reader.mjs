import { sessionAcceptedDateKey, verifySessionAcceptedDate } from "../../modules/session-planner/session-accepted-base.mjs";
import { validateSessionDateChange } from "../../modules/session-planner/session-save-protocol.mjs";
import { parseSessionsOfflineOwner } from "./grant.mjs";
import { openExistingSessionsDatabase } from "./store.mjs";

const journalPrefix = "session-save:";

export async function readSessionsOfflineDate(lease, indexedDB, range = globalThis.IDBKeyRange) {
  const { owner, scope, date } = lease;
  const database = await openExistingSessionsDatabase(indexedDB, "football-science-data-safety-v1");
  let accepted;
  let rows;
  try {
    ({ accepted, rows } = await new Promise((resolve, reject) => {
      // Both requests must share a snapshot. Acknowledging a journal entry can
      // atomically replace its checkpoint and retire the entry in another tab.
      const transaction = database.transaction("latest", "readonly"), store = transaction.objectStore("latest");
      const checkpoint = store.get(sessionAcceptedDateKey(scope, owner, date));
      const journal = store.openCursor(range.bound(journalPrefix, `${journalPrefix}\uffff`));
      const selected = [];
      journal.onsuccess = () => {
        const cursor = journal.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.scope === scope && row.change?.date === date && row.status !== "archived") selected.push(row);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve({ accepted: checkpoint.result, rows: selected });
      transaction.onabort = () => reject(transaction.error || new Error("Offline Sessions could not read this date."));
    }));
  } finally {
    database.close();
  }
  if (!accepted || accepted.owner !== owner || accepted.scope !== scope || accepted.date !== date) {
    throw new Error("This date has no server-acknowledged copy prepared on this device.");
  }
  await verifySessionAcceptedDate(accepted);
  const journal = rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map((row) => {
    if (!Number.isSafeInteger(row.createdAt) || !["pending", "review"].includes(row.status) ||
        row.id !== `${journalPrefix}${row.change.id}`) throw new Error("The local Sessions journal could not be verified.");
    const change = validateSessionDateChange(row.change);
    return { id: change.id, status: row.status, session: change.after.session };
  });
  return { date, teamId: parseSessionsOfflineOwner(owner)[3], issuedAt: lease.issuedAt, expiresAt: lease.expiresAt,
    session: accepted.value.session, revision: accepted.revision, journal };
}
