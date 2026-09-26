const crypto = require("crypto");
const { isAppStateDatabaseEnabled, readAppStateRecord, _private: { databaseRequest, normalizeRecord } } = require("./app-state-records-database.js");

const failure = (reason, status = 503) => ({ ok: false, status, reason });

function operationIdentity(actor, entry, change, canonicalize) {
  if (!actor?.id || !entry?.organizationId || entry.key !== "football-session-planner-v3") {
    throw new Error("Sessions save identity could not be verified.");
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(canonicalize(change))).digest("hex");
  return { organizationId: entry.organizationId, key: entry.key, actorId: actor.id,
    id: change.id, date: change.date, hash: digest };
}

function receiptQuery(identity) {
  return new URLSearchParams({ organization_id: `eq.${identity.organizationId}`, state_key: `eq.${identity.key}`,
    actor_id: `eq.${identity.actorId}`, operation_id: `eq.${identity.id}` });
}

async function findSessionReceipt(identity) {
  if (!isAppStateDatabaseEnabled()) return failure("Durable Sessions receipts require the database source.");
  const query = receiptQuery(identity);
  query.set("select", "operation_hash,session_date,accepted_revision");
  query.set("limit", "1");
  const result = await databaseRequest(`/session_save_receipts?${query}`);
  if (!result.ok) return failure("Sessions receipt storage is unavailable. Local changes were retained.");
  if (!Array.isArray(result.payload)) return failure("Sessions receipt could not be verified.");
  const receipt = result.payload[0];
  if (!receipt) return { ok: true, found: false };
  if (receipt.operation_hash !== identity.hash || receipt.session_date !== identity.date) {
    return failure("This save identity was already used for different content. Local changes were retained.", 422);
  }
  // Read AFTER the receipt. Returning the original payload could roll back a
  // colleague's later edit, even though the replayed operation was accepted.
  const current = await readAppStateRecord(identity.key, identity.organizationId);
  const acceptedRevision = Number(receipt.accepted_revision);
  if (!current.ok || !Number.isSafeInteger(acceptedRevision) || acceptedRevision <= 0 ||
      !current.entry || current.entry.key !== identity.key || current.entry.organizationId !== identity.organizationId ||
      !Number.isSafeInteger(current.entry.revision) || current.entry.removed || current.entry.revision < acceptedRevision) {
    return failure("Sessions receipt and current state need recovery. Local changes were retained.");
  }
  return { ok: true, found: true, entry: current.entry, acceptedRevision };
}

async function commitSessionReceipt(entry, identity, effects) {
  if (!isAppStateDatabaseEnabled()) return failure("Durable Sessions receipts require the database source.");
  const result = await databaseRequest("/rpc/commit_session_save", { method: "POST", body: {
    p_entry: entry, p_base_revision: entry.revision - 1, p_operation_id: identity.id,
    p_operation_hash: identity.hash, p_session_date: identity.date, p_actor_id: identity.actorId, p_effects: effects,
  } });
  if (!result.ok) return failure("Central save was not confirmed. Local changes were retained.");
  const response = result.payload;
  if (response?.status === "identity-mismatch") return failure("This save identity was already used for different content.", 422);
  if (response?.status === "conflict") return { ...failure("Central app-state revision changed before save.", 409), currentRevision: response.currentRevision };
  const persisted = normalizeRecord(response?.entry);
  if (!["committed", "duplicate"].includes(response?.status) || !persisted || persisted.key !== identity.key ||
      persisted.organizationId !== identity.organizationId || persisted.removed ||
      !Number.isSafeInteger(response.acceptedRevision) || response.acceptedRevision <= 0 ||
      !Number.isSafeInteger(persisted.revision) || persisted.revision < response.acceptedRevision ||
      (response.status === "committed" && (response.acceptedRevision !== entry.revision || persisted.revision !== entry.revision ||
        persisted.hash !== entry.hash || persisted.value !== entry.value || persisted.updatedBy !== identity.actorId))) {
    return failure("Sessions commit receipt could not be verified.");
  }
  return { ok: true, entry: persisted, duplicate: response.status === "duplicate", acceptedRevision: response.acceptedRevision };
}

function sessionEventId(identity) {
  return `session-save-${crypto.createHash("sha256").update(JSON.stringify([identity.organizationId, identity.key, identity.actorId, identity.id])).digest("hex")}`;
}

async function readSessionSaveEffects(organizationId, limit) {
  if (!isAppStateDatabaseEnabled()) return [];
  if (!organizationId) throw new Error("Sessions history scope is required.");
  const query = new URLSearchParams({ select: "payload,created_at", organization_id: `eq.${organizationId}`,
    state_key: "eq.football-session-planner-v3", order: "created_at.desc", limit: String(Math.max(1, Math.min(200, Number(limit) || 160))) });
  const result = await databaseRequest(`/session_save_effects?${query}`);
  if (!result.ok || !Array.isArray(result.payload)) throw new Error("Committed Sessions history is unavailable.");
  return result.payload.map((row) => {
    const payload = row.payload || {};
    return Object.fromEntries(["audit", "history", "activity"].map((key) => [key, payload[key]
      ? { ...payload[key], createdAt: row.created_at, updatedAt: row.created_at } : null]));
  });
}

module.exports = { operationIdentity, findSessionReceipt, commitSessionReceipt, sessionEventId, readSessionSaveEffects };
