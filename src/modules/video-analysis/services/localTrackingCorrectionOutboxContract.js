import {
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
} from "./trackingBenchmarkContract.js";
import {
  LocalTrackingWorkspaceError,
  createLocalTrackingWorkspaceScope,
} from "./localTrackingWorkspaceContract.js";

export const LOCAL_TRACKING_CORRECTION_VERSION = 1;
export const LOCAL_TRACKING_CORRECTION_PROTOCOL = "football-science-local-tracking-correction-v1";
export const MAX_LOCAL_TRACKING_CORRECTIONS_PER_SCOPE = 1_000;
export const MAX_LOCAL_TRACKING_CORRECTION_BYTES = 64 * 1024;
export const MAX_LOCAL_TRACKING_CORRECTION_SCOPE_BYTES = 8 * 1024 * 1024;

const correctionTypes = new Set([
  "position", "identity", "occlusion", "split", "merge", "identity-swap",
]);
const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);

function invalid(message, code = "LOCAL_TRACKING_CORRECTION_INVALID") {
  throw new LocalTrackingWorkspaceError(message, code);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) invalid(`${label} contains unsupported field ${unexpected}.`);
}

function text(value, label, maximum = 200, optional = false) {
  const normalized = String(value || "").trim();
  if ((!normalized && !optional) || normalized.length > maximum || /[\r\n]/.test(normalized)) {
    invalid(`Invalid ${label}.`);
  }
  return normalized;
}

function identifier(value, label, optional = false) {
  const normalized = text(value, label, 220, optional);
  if (normalized && (unsafeKeys.has(normalized) || /[\\/]/.test(normalized)
    || /^(?:file|blob|data|https?):/i.test(normalized))) {
    invalid(`Invalid ${label}.`);
  }
  return normalized;
}

function operationIdentifier(value) {
  const normalized = text(value, "tracking correction operation id", 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(normalized)) {
    invalid("Invalid tracking correction operation id.");
  }
  return normalized;
}

function timestamp(value, label, fallback = Date.now()) {
  const requested = value == null || value === "" ? fallback : value;
  const date = new Date(requested);
  if (!Number.isFinite(date.getTime())) invalid(`Invalid ${label}.`);
  return date.toISOString();
}

function safeObject(value, label, allowedKeys = null) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (allowedKeys) exactKeys(object, allowedKeys, label);
  assertBenchmarkMetadataOnly(object);
  let clone;
  try { clone = JSON.parse(JSON.stringify(object)); } catch { invalid(`Invalid ${label}.`); }
  return clone;
}

function normalizedBox(value = {}) {
  const box = safeObject(value, "tracking correction box", ["left", "top", "width", "height"]);
  return Object.fromEntries(Object.entries(box).map(([key, entry]) => {
    const number = Number(entry);
    if (!Number.isFinite(number) || number < 0 || number > 1) invalid("Invalid tracking correction box.");
    return [key, number];
  }));
}

function normalizedGroundPoint(value = {}) {
  const point = safeObject(value, "tracking correction ground point", ["x", "y"]);
  return Object.fromEntries(Object.entries(point).map(([key, entry]) => {
    const number = Number(entry);
    if (!Number.isFinite(number) || number < 0 || number > 1) invalid("Invalid tracking correction ground point.");
    return [key, number];
  }));
}

function serializedRecordSize(record) {
  let size = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    record.serializedSize = size;
    const next = benchmarkSerializedBytes(record, "Local tracking correction");
    if (next === size) return size;
    size = next;
  }
  record.serializedSize = size;
  return benchmarkSerializedBytes(record, "Local tracking correction");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function localTrackingCorrectionRecordId(scopeValue = {}, operationId = "") {
  const scope = createLocalTrackingWorkspaceScope(scopeValue);
  return `${scope.id}::correction::${encodeURIComponent(operationIdentifier(operationId))}`;
}

export function createLocalTrackingCorrectionRecord(value = {}, options = {}) {
  const scope = createLocalTrackingWorkspaceScope(value.scope || options.scope);
  const operationId = operationIdentifier(value.operationId || value.operation_id);
  const objectTrackId = identifier(value.objectTrackId || value.object_track_id, "tracking correction track id");
  const correctionType = text(value.correctionType || value.correction_type || "position", "tracking correction type", 40);
  if (!correctionTypes.has(correctionType)) invalid("Unsupported tracking correction type.");
  const createdAt = timestamp(value.createdAt, "tracking correction creation time", options.now?.() ?? Date.now());
  const updatedAt = timestamp(value.updatedAt, "tracking correction update time", options.now?.() ?? createdAt);
  const attempts = Math.max(0, Math.round(Number(value.attempts) || 0));
  if (attempts > 100) invalid("Tracking correction retry limit exceeded.", "LOCAL_TRACKING_CORRECTION_LIMIT");
  const record = {
    version: LOCAL_TRACKING_CORRECTION_VERSION,
    protocol: LOCAL_TRACKING_CORRECTION_PROTOCOL,
    id: localTrackingCorrectionRecordId(scope, operationId),
    scopeId: scope.id,
    scope,
    operationId,
    objectTrackId,
    localWorkspaceTrackKey: identifier(value.localWorkspaceTrackKey, "local tracking workspace key", true),
    atMs: Math.max(0, Math.round(Number(value.atMs ?? value.at_ms) || 0)),
    correctionType,
    box: normalizedBox(value.box || value.box_json),
    groundPoint: normalizedGroundPoint(value.groundPoint || value.ground_point_json),
    playerId: identifier(value.playerId || value.player_id, "tracking correction player id", true),
    playerLabel: text(value.playerLabel || value.player_label, "tracking correction player label", 180, true),
    reason: text(value.reason, "tracking correction reason", 1_000, true),
    metadata: safeObject(value.metadata, "tracking correction metadata"),
    attempts,
    createdAt,
    updatedAt,
    lastAttemptAt: value.lastAttemptAt ? timestamp(value.lastAttemptAt, "tracking correction attempt time") : "",
    lastError: text(value.lastError, "tracking correction error", 1_000, true),
    serializedSize: 0,
  };
  const serializedSize = serializedRecordSize(record);
  if (serializedSize > MAX_LOCAL_TRACKING_CORRECTION_BYTES) {
    invalid("The local tracking correction is too large.", "LOCAL_TRACKING_CORRECTION_LIMIT");
  }
  record.serializedSize = serializedSize;
  assertBenchmarkMetadataOnly(record);
  return deepFreeze(record);
}

export function hydrateLocalTrackingCorrectionRecord(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "scopeId", "scope", "operationId", "objectTrackId",
    "localWorkspaceTrackKey", "atMs", "correctionType", "box", "groundPoint", "playerId",
    "playerLabel", "reason", "metadata", "attempts", "createdAt", "updatedAt", "lastAttemptAt",
    "lastError", "serializedSize",
  ], "Local tracking correction");
  if (Number(value.version) !== LOCAL_TRACKING_CORRECTION_VERSION
    || value.protocol !== LOCAL_TRACKING_CORRECTION_PROTOCOL) invalid("Invalid local tracking correction protocol.");
  const record = createLocalTrackingCorrectionRecord(value, { scope: value.scope });
  if (record.id !== value.id || record.scopeId !== value.scopeId
    || record.serializedSize !== Number(value.serializedSize)) {
    invalid("Local tracking correction integrity check failed.");
  }
  return record;
}

export function trackingCorrectionApiPayload(recordValue = {}) {
  const record = hydrateLocalTrackingCorrectionRecord(recordValue);
  return deepFreeze({
    operationId: record.operationId,
    objectTrackId: record.objectTrackId,
    atMs: record.atMs,
    correctionType: record.correctionType,
    box: record.box,
    groundPoint: record.groundPoint,
    playerId: record.playerId,
    playerLabel: record.playerLabel,
    reason: record.reason,
    metadata: record.metadata,
  });
}
