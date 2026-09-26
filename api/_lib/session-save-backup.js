const { createHash } = require("node:crypto");
const { _private: { databaseRequest, normalizeRecord } } = require("./app-state-records-database.js");
const KEY = "football-session-planner-v3";
const fail = () => { throw new Error("Sessions backup is incomplete or inconsistent; backup was not accepted."); };
const hash = (value) => createHash("sha256").update(value).digest("hex");

function validateSessionSaveBackup(snapshot, organizationId = "global") {
  if (snapshot?.schema !== "session-save-backup-v1" || snapshot.organizationId !== organizationId ||
      !Array.isArray(snapshot.receipts) || !Array.isArray(snapshot.effects) ||
      snapshot.receipts.length > 100000 || snapshot.effects.length !== snapshot.receipts.length ||
      Buffer.byteLength(JSON.stringify(snapshot)) > 32 * 1024 * 1024) fail();
  const entry = normalizeRecord(snapshot.entry);
  if (snapshot.entry !== null && (!entry || entry.key !== KEY || entry.organizationId !== organizationId ||
      !Number.isSafeInteger(entry.revision) || entry.revision < 1 || entry.hash !== hash(entry.value))) fail();
  if (!entry && snapshot.receipts.length) fail();
  const identities = new Set();
  const id = (row) => JSON.stringify([row.actor_id, row.operation_id]);
  const validScope = (row) => row?.organization_id === organizationId && row.state_key === KEY &&
    typeof row.actor_id === "string" && row.actor_id.length > 0 && /^[A-Za-z0-9_-]{1,100}$/.test(row.operation_id);
  for (const receipt of snapshot.receipts) {
    if (!validScope(receipt) || identities.has(id(receipt)) || !/^[a-f0-9]{64}$/.test(receipt.operation_hash) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(receipt.session_date) ||
        !Number.isSafeInteger(receipt.accepted_revision) || receipt.accepted_revision < 1 ||
        receipt.accepted_revision > entry.revision) fail();
    identities.add(id(receipt));
  }
  for (const effect of snapshot.effects) {
    if (!validScope(effect) || !identities.delete(id(effect)) || !effect.payload ||
        typeof effect.payload !== "object" || Array.isArray(effect.payload)) fail();
  }
  return entry;
}

async function readSessionSaveBackup(organizationId = "global") {
  const result = await databaseRequest("/rpc/snapshot_session_saves", { method: "POST", body: { p_organization_id: organizationId } });
  if (!result.ok) fail();
  validateSessionSaveBackup(result.payload, organizationId);
  return result.payload;
}

module.exports = { readSessionSaveBackup, validateSessionSaveBackup };
