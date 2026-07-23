const crypto = require("node:crypto");
const { hashJsonValue } = require("./session-planner-domain-records.js");

const SESSION_PLANNER_CANARY_RECOVERY_SCHEMA =
  "footballscience-session-planner-canary-recovery-v1";
const SESSION_PLANNER_CANARY_MARKER_KEY = "__footballScienceQaCanary";
const SESSION_PLANNER_STORAGE_KEY = "football-session-planner-v3";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value, maxLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLower(value, maxLength = 240) {
  return normalizeText(value, maxLength).toLowerCase();
}

function normalizeTimestamp(value) {
  const timestamp = normalizeText(value, 80);
  return timestamp && !Number.isNaN(Date.parse(timestamp))
    ? new Date(timestamp).toISOString()
    : "";
}

function normalizeOrigin(value) {
  try {
    const url = new URL(normalizeText(value, 500));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.origin.toLowerCase();
  } catch {
    return "";
  }
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function parseState(value) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateContext(input = {}) {
  const failures = [];
  const projectRef = normalizeLower(input.projectRef, 80);
  const productionProjectRef = normalizeLower(input.canonicalProductionProjectRef, 80);
  const appOrigin = normalizeOrigin(input.appOrigin);
  const productionAppOrigin = normalizeOrigin(input.canonicalProductionAppOrigin);
  const primaryUserId = normalizeLower(input.primaryUserId, 120);
  const peerUserId = normalizeLower(input.peerUserId, 120);
  const requestId = normalizeText(input.requestId, 180);
  const createdAt = normalizeTimestamp(input.createdAt);

  if (normalizeLower(input.target, 40) !== "staging") failures.push("target_not_staging");
  if (!PROJECT_REF_PATTERN.test(projectRef)) failures.push("project_ref_invalid");
  if (!PROJECT_REF_PATTERN.test(productionProjectRef)) {
    failures.push("production_project_ref_invalid");
  } else if (projectRef === productionProjectRef) {
    failures.push("project_matches_production");
  }
  if (!appOrigin) failures.push("app_origin_invalid");
  if (!productionAppOrigin) failures.push("production_app_origin_invalid");
  else if (appOrigin === productionAppOrigin) failures.push("app_origin_matches_production");
  if (!UUID_PATTERN.test(primaryUserId)) failures.push("primary_user_invalid");
  if (!UUID_PATTERN.test(peerUserId)) failures.push("peer_user_invalid");
  if (primaryUserId && primaryUserId === peerUserId) failures.push("users_not_distinct");
  if (!requestId) failures.push("request_id_invalid");
  if (!createdAt) failures.push("created_at_invalid");

  return {
    ok: failures.length === 0,
    failures,
    projectRef,
    productionProjectRef,
    appOrigin,
    productionAppOrigin,
    primaryUserId,
    peerUserId,
    requestId,
    createdAt,
  };
}

function validateCheckpoint(input = {}) {
  const failures = [];
  const baselineValue = String(input.baselineValue ?? "");
  const canaryValue = String(input.canaryValue ?? "");
  const baselineState = parseState(baselineValue);
  const canaryState = parseState(canaryValue);
  const baselineRevision = Number(input.baselineRevision);
  const baselineHash = normalizeLower(input.baselineHash, 64);
  const canaryHash = normalizeLower(input.canaryHash || hashText(canaryValue), 64);
  const marker = canaryState?.[SESSION_PLANNER_CANARY_MARKER_KEY];
  const markerHash = marker ? hashJsonValue(marker) : "";

  if (!baselineState || !baselineState.sessions || typeof baselineState.sessions !== "object") {
    failures.push("baseline_state_invalid");
  }
  if (baselineState && Object.hasOwn(baselineState, SESSION_PLANNER_CANARY_MARKER_KEY)) {
    failures.push("baseline_contains_canary_marker");
  }
  if (!canaryState || !canaryState.sessions || typeof canaryState.sessions !== "object") {
    failures.push("canary_state_invalid");
  }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    failures.push("canary_marker_missing");
  }
  if (!Number.isInteger(baselineRevision) || baselineRevision < 1) {
    failures.push("baseline_revision_invalid");
  }
  if (!HASH_PATTERN.test(baselineHash) || hashText(baselineValue) !== baselineHash) {
    failures.push("baseline_hash_mismatch");
  }
  if (!HASH_PATTERN.test(canaryHash) || hashText(canaryValue) !== canaryHash) {
    failures.push("canary_hash_mismatch");
  }
  if (!HASH_PATTERN.test(markerHash)) failures.push("canary_marker_hash_invalid");

  return {
    ok: failures.length === 0,
    failures,
    baselineValue,
    baselineRevision,
    baselineHash,
    canaryValue,
    canaryHash,
    markerHash,
  };
}

function createSessionPlannerCanaryRecoveryPackage(input = {}) {
  const context = validateContext(input);
  const checkpoint = validateCheckpoint(input);
  const failures = [...context.failures, ...checkpoint.failures];
  if (failures.length) {
    return {
      ok: false,
      schema: SESSION_PLANNER_CANARY_RECOVERY_SCHEMA,
      failures,
    };
  }

  const body = {
    ok: true,
    schema: SESSION_PLANNER_CANARY_RECOVERY_SCHEMA,
    target: "staging",
    projectRef: context.projectRef,
    canonicalProductionProjectRef: context.productionProjectRef,
    appOrigin: context.appOrigin,
    canonicalProductionAppOrigin: context.productionAppOrigin,
    storageKey: SESSION_PLANNER_STORAGE_KEY,
    createdAt: context.createdAt,
    requestId: context.requestId,
    actors: {
      primaryUserId: context.primaryUserId,
      peerUserId: context.peerUserId,
    },
    baseline: {
      revision: checkpoint.baselineRevision,
      hash: checkpoint.baselineHash,
      value: checkpoint.baselineValue,
    },
    canary: {
      value: checkpoint.canaryValue,
      valueHash: checkpoint.canaryHash,
      markerHash: checkpoint.markerHash,
    },
    containsCoachingContent: true,
  };
  return Object.freeze({
    ...body,
    integrity: Object.freeze({
      algorithm: "sha256",
      contentSha256: hashJsonValue(body),
    }),
  });
}

function verifySessionPlannerCanaryRecoveryPackage(recoveryPackage = {}) {
  if (
    recoveryPackage.ok !== true ||
    recoveryPackage.schema !== SESSION_PLANNER_CANARY_RECOVERY_SCHEMA ||
    recoveryPackage.storageKey !== SESSION_PLANNER_STORAGE_KEY ||
    recoveryPackage.containsCoachingContent !== true
  ) {
    return { ok: false, code: "canary_recovery_schema_invalid" };
  }
  const expectedHash = normalizeLower(recoveryPackage.integrity?.contentSha256, 64);
  if (
    recoveryPackage.integrity?.algorithm !== "sha256" ||
    !HASH_PATTERN.test(expectedHash)
  ) {
    return { ok: false, code: "canary_recovery_integrity_invalid" };
  }
  const { integrity, ...body } = recoveryPackage;
  const actualHash = hashJsonValue(body);
  if (actualHash !== expectedHash) {
    return {
      ok: false,
      code: "canary_recovery_hash_mismatch",
      contentSha256: actualHash,
    };
  }

  const context = validateContext({
    ...recoveryPackage,
    primaryUserId: recoveryPackage.actors?.primaryUserId,
    peerUserId: recoveryPackage.actors?.peerUserId,
  });
  const checkpoint = validateCheckpoint({
    baselineValue: recoveryPackage.baseline?.value,
    baselineRevision: recoveryPackage.baseline?.revision,
    baselineHash: recoveryPackage.baseline?.hash,
    canaryValue: recoveryPackage.canary?.value,
    canaryHash: recoveryPackage.canary?.valueHash,
  });
  const failures = [...context.failures];
  if (
    !HASH_PATTERN.test(normalizeLower(recoveryPackage.canary?.valueHash, 64)) ||
    !HASH_PATTERN.test(normalizeLower(recoveryPackage.canary?.markerHash, 64)) ||
    checkpoint.markerHash !== recoveryPackage.canary?.markerHash
  ) {
    failures.push("canary_checkpoint_invalid");
  }
  failures.push(...checkpoint.failures);
  if (failures.length) {
    return {
      ok: false,
      code: "canary_recovery_context_invalid",
      failures,
      contentSha256: actualHash,
    };
  }
  return {
    ok: true,
    contentSha256: actualHash,
    baselineRevision: checkpoint.baselineRevision,
    baselineHash: checkpoint.baselineHash,
    canaryHash: recoveryPackage.canary.valueHash,
  };
}

function createSessionPlannerCanaryRecoverySummary(recoveryPackage = {}) {
  const verification = verifySessionPlannerCanaryRecoveryPackage(recoveryPackage);
  return Object.freeze({
    ok: verification.ok,
    schema: recoveryPackage.schema || null,
    target: recoveryPackage.target || null,
    projectRef: recoveryPackage.projectRef || null,
    appOrigin: recoveryPackage.appOrigin || null,
    createdAt: recoveryPackage.createdAt || null,
    contentSha256: verification.contentSha256 || null,
    baselineRevision: verification.baselineRevision || 0,
    baselineHash: verification.baselineHash || null,
    canaryHash: verification.canaryHash || null,
    markerHash: recoveryPackage.canary?.markerHash || null,
    distinctUsers:
      recoveryPackage.actors?.primaryUserId !== recoveryPackage.actors?.peerUserId,
    privateRecoveryRequired: true,
    containsCoachingContent: false,
  });
}

module.exports = {
  SESSION_PLANNER_CANARY_MARKER_KEY,
  SESSION_PLANNER_CANARY_RECOVERY_SCHEMA,
  SESSION_PLANNER_STORAGE_KEY,
  createSessionPlannerCanaryRecoveryPackage,
  createSessionPlannerCanaryRecoverySummary,
  hashText,
  verifySessionPlannerCanaryRecoveryPackage,
};
