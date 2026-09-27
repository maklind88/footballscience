const { createHash } = require("node:crypto");
const { _private: { databaseRequest, normalizeRecord } } = require("./app-state-records-database.js");
const { MAX_BYTES, encodeBackupChunk, decodeBackupChunk } = require("./session-save-backup-chunks.js");
const KEY = "football-session-planner-v3";
const fail = () => { throw new Error("Sessions backup is incomplete or inconsistent; backup was not accepted."); };
const hash = (value) => createHash("sha256").update(value).digest("hex");

function validateSessionSaveBackup(snapshot, organizationId = "global") {
  if (snapshot?.schema === "session-save-backup-v2") return validatePagedBackup(snapshot, organizationId);
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
  const body = { p_organization_id: organizationId };
  let snapshot;
  let seen = 0;
  const identities = new Set();
  for (let pageNumber = 0; pageNumber <= 10000; pageNumber++) {
    const result = await databaseRequest("/rpc/snapshot_session_save_page", { method: "POST", body });
    if (!result.ok) throw new Error("Sessions backup page unavailable or changed; previous backup retained.");
    const page = result.payload;
    if (page?.schema !== "session-save-page-v1" || page.organizationId !== organizationId ||
      !Array.isArray(page.rows) || page.rows.length > 10 || !Number.isSafeInteger(page.receiptCount) ||
      page.receiptCount < 0 || page.receiptCount > 100000) fail();
    if (!snapshot) {
      snapshot = { schema: "session-save-backup-v2", organizationId, entry: page.entry,
        receiptCount: page.receiptCount, chunks: [] };
      const entry = validateSessionSaveBackup({ schema: "session-save-backup-v1", organizationId,
        entry: page.entry, receipts: [], effects: [] }, organizationId);
      body.p_revision = entry?.revision || 0;
      body.p_hash = entry?.hash || "";
    }
    if (page.revision !== body.p_revision || page.hash !== body.p_hash ||
      page.receiptCount !== snapshot.receiptCount) fail();
    validatePageRows(page.rows, snapshot, identities);
    seen += page.rows.length;
    if (seen > snapshot.receiptCount) fail();
    // Require an empty final page, still bound to the same revision/hash/count.
    if (!page.rows.length) {
      if (seen !== snapshot.receiptCount) fail();
      validatePagedBackup(snapshot, organizationId);
      return snapshot;
    }
    snapshot.chunks.push(encodeBackupChunk(page.rows));
    if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) fail();
    const last = page.rows.at(-1).receipt;
    body.p_after_actor = last.actor_id;
    body.p_after_operation = last.operation_id;
  }
  fail();
}

function validatePageRows(rows, snapshot, identities) {
  validateSessionSaveBackup({ schema: "session-save-backup-v1", organizationId: snapshot.organizationId,
    entry: snapshot.entry, receipts: rows.map((row) => row.receipt), effects: rows.map((row) => row.effect) }, snapshot.organizationId);
  for (const row of rows) {
    const id = JSON.stringify([row.receipt.actor_id, row.receipt.operation_id]);
    if (identities.has(id)) fail();
    identities.add(id);
  }
}

function validatePagedBackup(snapshot, organizationId) {
  if (snapshot.organizationId !== organizationId || !Number.isSafeInteger(snapshot.receiptCount) ||
    snapshot.receiptCount < 0 || snapshot.receiptCount > 100000 || !Array.isArray(snapshot.chunks) ||
    snapshot.chunks.length > 10000 || Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) fail();
  const entry = validateSessionSaveBackup({ schema: "session-save-backup-v1", organizationId,
    entry: snapshot.entry, receipts: [], effects: [] }, organizationId);
  const identities = new Set();
  for (const chunk of snapshot.chunks) validatePageRows(decodeBackupChunk(chunk), snapshot, identities);
  if (identities.size !== snapshot.receiptCount) fail();
  return entry;
}

module.exports = { readSessionSaveBackup, validateSessionSaveBackup };
