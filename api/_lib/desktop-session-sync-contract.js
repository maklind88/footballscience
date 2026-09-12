const crypto = require("node:crypto");

const REQUEST_SCHEMA = "fs-desktop-session-sync-request-v1";
const RESPONSE_SCHEMA = "fs-desktop-session-sync-response-v1";
const SNAPSHOT_RESPONSE_SCHEMA = "fs-desktop-session-snapshot-response-v1";
const SYNC_PROTOCOL_VERSION = 1;
const MAX_BODY_BYTES = 32 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OPERATIONS = Object.freeze({
  "session.rename": Object.freeze({ keys: ["title"] }),
  "block.duration.set": Object.freeze({ keys: ["blockId", "durationMinutes"] }),
});

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function uuid(value, label) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError(`${label} is invalid.`);
  return normalized.toLowerCase();
}

function integer(value, label, min, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new TypeError(`${label} is invalid.`);
  return number;
}

function validatePayload(type, payload) {
  const contract = OPERATIONS[type];
  if (!contract || !exactKeys(payload, contract.keys)) throw new TypeError("Operation payload is invalid.");
  if (type === "session.rename") {
    const title = String(payload.title || "").trim();
    if (!title || title.length > 120) throw new TypeError("Session title is invalid.");
    return Object.freeze({ title });
  }
  const durationMinutes = integer(payload.durationMinutes, "Block duration", 1, 240);
  return Object.freeze({ blockId: uuid(payload.blockId, "Block ID"), durationMinutes });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateRequest(body) {
  if (!exactKeys(body, ["schema", "syncProtocolVersion", "clientInstanceId", "authEpoch", "operation"])) {
    throw new TypeError("Desktop sync envelope is invalid.");
  }
  if (body.schema !== REQUEST_SCHEMA || body.syncProtocolVersion !== SYNC_PROTOCOL_VERSION) {
    throw new TypeError("Desktop sync protocol is incompatible.");
  }
  if (!exactKeys(body.operation, [
    "operationId",
    "operationType",
    "operationVersion",
    "sessionId",
    "baseRevision",
    "payload",
  ])) {
    throw new TypeError("Desktop operation envelope is invalid.");
  }
  const operationType = String(body.operation.operationType || "");
  if (!OPERATIONS[operationType] || body.operation.operationVersion !== 1) {
    throw new TypeError("Desktop operation version is unsupported.");
  }
  const payload = validatePayload(operationType, body.operation.payload);
  const canonicalPayload = stableJson(payload);
  return Object.freeze({
    clientInstanceId: uuid(body.clientInstanceId, "Client instance ID"),
    authEpoch: integer(body.authEpoch, "Auth epoch", 1),
    operationId: uuid(body.operation.operationId, "Operation ID"),
    operationType,
    operationVersion: 1,
    sessionId: uuid(body.operation.sessionId, "Session ID"),
    baseRevision: integer(body.operation.baseRevision, "Base revision", 1),
    payload,
    payloadSha256: crypto.createHash("sha256").update(canonicalPayload).digest("hex"),
  });
}

function validateDatabaseResult(value) {
  const row = Array.isArray(value?.rows) ? value.rows[0] : value;
  if (!row || !["accepted", "already-applied", "conflict"].includes(row.acknowledgement)) {
    throw new Error("Desktop synchronization returned an invalid acknowledgement.");
  }
  const revision = integer(row.resulting_revision ?? row.resultingRevision, "Resulting revision", 1);
  const acknowledgementId = row.acknowledgement_id ?? row.acknowledgementId ?? null;
  if (row.acknowledgement !== "conflict" && !UUID_PATTERN.test(String(acknowledgementId || ""))) {
    throw new Error("Desktop synchronization acknowledgement ID is invalid.");
  }
  return Object.freeze({
    acknowledgement: row.acknowledgement,
    acknowledgementId: acknowledgementId ? String(acknowledgementId).toLowerCase() : null,
    resultingRevision: revision,
    result: row.operation_result ?? row.operationResult ?? {},
  });
}

function validateSnapshotQuery(value) {
  if (!exactKeys(value, ["sessionId", "syncProtocolVersion"])) {
    throw new TypeError("Desktop snapshot query is invalid.");
  }
  if (String(value.syncProtocolVersion) !== String(SYNC_PROTOCOL_VERSION)) {
    throw new TypeError("Desktop sync protocol is incompatible.");
  }
  return Object.freeze({ sessionId: uuid(value.sessionId, "Session ID") });
}

function validateSnapshotResult(value) {
  const row = Array.isArray(value?.rows) ? value.rows[0] : value;
  const snapshot = row?.snapshot ?? row?.read_session_planner_desktop_snapshot_v1 ?? row;
  if (!exactKeys(snapshot, ["schema", "session", "blocks"])
    || snapshot.schema !== "fs-desktop-session-snapshot-v1"
    || !Array.isArray(snapshot.blocks)
    || snapshot.blocks.length > 200) {
    throw new Error("Desktop snapshot result is invalid.");
  }
  if (Buffer.byteLength(stableJson(snapshot)) > 256 * 1024) {
    throw new Error("Desktop snapshot result is too large.");
  }
  const session = snapshot.session;
  if (!exactKeys(session, ["id", "title", "sessionDate", "revision", "content"])
    || !session.content || typeof session.content !== "object" || Array.isArray(session.content)) {
    throw new Error("Desktop snapshot session is invalid.");
  }
  const normalizedSession = Object.freeze({
    id: uuid(session.id, "Session ID"),
    title: String(session.title || "").trim(),
    sessionDate: String(session.sessionDate || ""),
    revision: integer(session.revision, "Session revision", 1),
    content: Object.freeze({ ...session.content }),
  });
  if (!normalizedSession.title || normalizedSession.title.length > 300
    || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedSession.sessionDate)) {
    throw new Error("Desktop snapshot session is invalid.");
  }
  const blocks = snapshot.blocks.map((block) => {
    if (!exactKeys(block, ["id", "sortOrder", "revision", "payload"])
      || !block.payload || typeof block.payload !== "object" || Array.isArray(block.payload)) {
      throw new Error("Desktop snapshot block is invalid.");
    }
    return Object.freeze({
      id: uuid(block.id, "Block ID"),
      sortOrder: integer(block.sortOrder, "Block sort order", 0),
      revision: integer(block.revision, "Block revision", 1),
      payload: Object.freeze({ ...block.payload }),
    });
  });
  return Object.freeze({
    schema: snapshot.schema,
    session: normalizedSession,
    blocks: Object.freeze(blocks),
  });
}

module.exports = {
  MAX_BODY_BYTES,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  SNAPSHOT_RESPONSE_SCHEMA,
  SHA256_PATTERN,
  SYNC_PROTOCOL_VERSION,
  stableJson,
  validateDatabaseResult,
  validateRequest,
  validateSnapshotQuery,
  validateSnapshotResult,
};
