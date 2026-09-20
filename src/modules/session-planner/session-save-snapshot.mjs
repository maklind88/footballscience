import { canonicalSessionValue, sameSessionValue, sessionDateValue, validateSessionDateChange } from "./session-save-protocol.mjs";
import { decodeSessionTransport } from "./session-state-transport.mjs";

const KEY = "football-session-planner-v3";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Validate raw server bytes before parsing/observing. A hash from a newer
// revision must never be attached to an older or partial calendar snapshot.
export async function verifySessionSaveSnapshot(snapshot, { context, change, receipt, current }) {
  if (!current() || snapshot?.schema !== "session-save-snapshot-v1" || snapshot.key !== KEY
    || snapshot.actorId !== context.actorId || snapshot.organizationId !== context.organizationId
    || snapshot.clubId !== context.clubId || snapshot.teamId !== context.teamId
    || snapshot.operationId !== change.id || snapshot.date !== change.date
    || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < receipt.revision
    || typeof snapshot.hash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.hash)) throw new Error("Unverified Sessions snapshot.");
  const result = await verifyCalendar(snapshot, context, current);
  const state = JSON.parse(result.value);
  if (snapshot.revision === receipt.revision && (snapshot.hash !== receipt.hash
    || !sameSessionValue(sessionDateValue(state, change.date), receipt.value))) throw new Error("Sessions receipt/snapshot mismatch.");
  return result;
}

export async function verifySessionInitialSnapshot(snapshot, { context, current }) {
  if (!current() || snapshot?.schema !== "session-save-initial-snapshot-v1" || snapshot.key !== KEY
    || snapshot.actorId !== context.actorId || snapshot.organizationId !== context.organizationId
    || snapshot.clubId !== context.clubId || snapshot.teamId !== context.teamId
    || snapshot.operationId !== undefined || snapshot.date !== undefined
    || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1
    || typeof snapshot.hash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.hash)) throw new Error("Unverified Sessions initial snapshot.");
  return verifyCalendar(snapshot, context, current);
}

async function verifyCalendar(snapshot, context, current) {
  const value = await decodeSessionTransport(KEY, snapshot.value);
  if (!current() || typeof value !== "string") throw new Error("Sessions identity changed.");
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Sessions snapshot exceeds the transfer limit.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!current() || hash !== snapshot.hash) throw new Error("Sessions snapshot hash mismatch.");
  const state = JSON.parse(value);
  if (!object(state) || !object(state.sessions)) throw new Error("Invalid Sessions calendar.");
  canonicalSessionValue(state);
  for (const date of Object.keys(state.sessions)) {
    validateSessionDateChange({ schema: "session-date-change-v1", id: "snapshot-validation", date,
      before: { session: null, tombstones: {} }, after: sessionDateValue(state, date) });
  }
  return { value, metadata: { key: KEY, organizationId: context.organizationId, teamId: context.teamId,
    revision: snapshot.revision, hash: snapshot.hash } };
}
