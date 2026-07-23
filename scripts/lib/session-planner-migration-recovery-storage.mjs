import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  verifySessionPlannerMigrationRecoveryPackage,
} = require("../../api/_lib/session-planner-migration-recovery.js");

export const SESSION_PLANNER_MIGRATION_RECOVERY_BUCKET = "footballscience-app-state";
const REQUEST_TIMEOUT_MS = 15_000;

function normalizeText(value, maxLength = 1000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function requestSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: "Bearer " + serviceRoleKey,
    Accept: "application/json",
    ...extra,
  };
}

async function parseResponse(response) {
  const text = response?.status === 204 ? "" : await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson(url, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: requestSignal() });
  } catch {
    return { ok: false, status: 503, reason: "Session Planner recovery package request failed." };
  }
  const payload = await parseResponse(response);
  return response.ok
    ? { ok: true, status: response.status, payload }
    : {
        ok: false,
        status: response.status,
        payload,
        reason: "Session Planner recovery package request failed.",
      };
}

function projectBaseUrl(value) {
  return normalizeText(value, 500).replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

function projectRefFromUrl(value) {
  try {
    const hostname = new URL(projectBaseUrl(value)).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

function objectPath(path) {
  return normalizeText(path, 900)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function storagePath(recoveryPackage) {
  const timestamp = recoveryPackage.createdAt.replace(/[:.]/g, "-");
  return [
    "backups/session-planner-recovery",
    recoveryPackage.target,
    recoveryPackage.projectRef,
    timestamp + "-" + recoveryPackage.integrity.contentSha256.slice(0, 16) + ".json",
  ].join("/");
}

async function verifyPrivateBucket(config, bucket, fetchImpl) {
  const result = await requestJson(
    projectBaseUrl(config.url) + "/storage/v1/bucket/" + encodeURIComponent(bucket),
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!result.ok) return result;
  if (result.payload?.public !== false) {
    return { ok: false, status: 409, reason: "Session Planner recovery bucket must remain private." };
  }
  return { ok: true };
}

function validateStorageContext(recoveryPackage, config) {
  const verification = verifySessionPlannerMigrationRecoveryPackage(recoveryPackage);
  const baseUrl = projectBaseUrl(config?.url);
  const serviceRoleKey = normalizeText(config?.serviceRoleKey, 2000);
  if (!verification.ok || recoveryPackage.target !== "staging") {
    return { ok: false, status: 400, reason: "A verified staging recovery package is required." };
  }
  if (!baseUrl || !serviceRoleKey || projectRefFromUrl(baseUrl) !== recoveryPackage.projectRef) {
    return { ok: false, status: 400, reason: "Recovery storage does not match the reviewed staging project." };
  }
  return { ok: true, verification, baseUrl, serviceRoleKey };
}

function validRecoveryPath(path, projectRef) {
  const normalized = normalizeText(path, 900);
  return normalized.startsWith("backups/session-planner-recovery/staging/" + projectRef + "/")
    ? normalized
    : "";
}

export async function storeSessionPlannerMigrationRecoveryPackage({
  recoveryPackage,
  config,
  fetchImpl = fetch,
  bucket = SESSION_PLANNER_MIGRATION_RECOVERY_BUCKET,
} = {}) {
  const context = validateStorageContext(recoveryPackage, config);
  if (!context.ok) return context;
  const { verification, baseUrl, serviceRoleKey } = context;
  const bucketResult = await verifyPrivateBucket({ url: baseUrl, serviceRoleKey }, bucket, fetchImpl);
  if (!bucketResult.ok) return bucketResult;

  const path = storagePath(recoveryPackage);
  const objectUrl = baseUrl + "/storage/v1/object/" +
    encodeURIComponent(bucket) + "/" + objectPath(path);
  const upload = await requestJson(objectUrl, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "x-upsert": "false",
    }),
    body: JSON.stringify(recoveryPackage),
  }, fetchImpl);
  if (!upload.ok && upload.status !== 409) return upload;

  const reread = await requestJson(
    objectUrl,
    { method: "GET", headers: serviceHeaders(serviceRoleKey) },
    fetchImpl
  );
  if (!reread.ok) return reread;
  const storedVerification = verifySessionPlannerMigrationRecoveryPackage(reread.payload);
  if (
    !storedVerification.ok ||
    storedVerification.contentSha256 !== verification.contentSha256
  ) {
    return {
      ok: false,
      status: 409,
      reason: "Stored Session Planner recovery package failed read-after-write verification.",
    };
  }
  return Object.freeze({
    ok: true,
    bucket,
    path,
    contentSha256: verification.contentSha256,
    reusedExisting: upload.status === 409,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
}

export async function loadSessionPlannerMigrationRecoveryPackage({
  path,
  expectedContentSha256,
  expectedProjectRef,
  config,
  fetchImpl = fetch,
  bucket = SESSION_PLANNER_MIGRATION_RECOVERY_BUCKET,
} = {}) {
  const projectRef = normalizeText(expectedProjectRef, 80).toLowerCase();
  const expectedHash = normalizeText(expectedContentSha256, 64).toLowerCase();
  const safePath = validRecoveryPath(path, projectRef);
  const baseUrl = projectBaseUrl(config?.url);
  const serviceRoleKey = normalizeText(config?.serviceRoleKey, 2000);
  if (
    !safePath ||
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    !baseUrl ||
    !serviceRoleKey ||
    projectRefFromUrl(baseUrl) !== projectRef
  ) {
    return { ok: false, status: 400, reason: "Recovery package lookup is not bound to staging." };
  }
  const bucketResult = await verifyPrivateBucket({ url: baseUrl, serviceRoleKey }, bucket, fetchImpl);
  if (!bucketResult.ok) return bucketResult;
  const objectUrl = baseUrl + "/storage/v1/object/" +
    encodeURIComponent(bucket) + "/" + objectPath(safePath);
  const read = await requestJson(
    objectUrl,
    { method: "GET", headers: serviceHeaders(serviceRoleKey) },
    fetchImpl
  );
  if (!read.ok) return read;
  const verification = verifySessionPlannerMigrationRecoveryPackage(read.payload);
  if (
    !verification.ok ||
    verification.contentSha256 !== expectedHash ||
    read.payload.projectRef !== projectRef
  ) {
    return { ok: false, status: 409, reason: "Recovery package integrity or project binding failed." };
  }
  return Object.freeze({
    ok: true,
    privateRecoveryPackage: read.payload,
    receipt: Object.freeze({
      bucket,
      path: safePath,
      contentSha256: verification.contentSha256,
      readVerified: true,
      containsCoachingContent: false,
    }),
  });
}
