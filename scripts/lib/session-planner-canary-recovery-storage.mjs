import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  verifySessionPlannerCanaryRecoveryPackage,
} = require("../../api/_lib/session-planner-canary-recovery.js");

export const SESSION_PLANNER_CANARY_RECOVERY_BUCKET = "footballscience-app-state";
const REQUEST_TIMEOUT_MS = 15_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function normalizeText(value, maxLength = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function requestSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
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
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: requestSignal(),
    });
    const payload = await parseResponse(response);
    return response.ok
      ? { ok: true, status: response.status, payload }
      : {
          ok: false,
          status: response.status,
          payload,
          reason: "Session Planner canary recovery storage request failed.",
        };
  } catch {
    return {
      ok: false,
      status: 503,
      reason: "Session Planner canary recovery storage request failed.",
    };
  }
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

function recoveryStoragePath(recoveryPackage) {
  const timestamp = recoveryPackage.createdAt.replace(/[:.]/g, "-");
  return [
    "backups/session-planner-canary",
    "staging",
    recoveryPackage.projectRef,
    `${timestamp}-${recoveryPackage.integrity.contentSha256.slice(0, 16)}.json`,
  ].join("/");
}

function validRecoveryPath(path, projectRef) {
  const normalized = normalizeText(path, 900);
  return normalized.startsWith(
    `backups/session-planner-canary/staging/${projectRef}/`
  )
    ? normalized
    : "";
}

function isAlreadyExistingObject(result = {}) {
  if (result.ok || ![400, 409].includes(result.status)) return false;
  const code = normalizeText(
    result.payload?.code ||
      result.payload?.error ||
      result.payload?.errorCode,
    120
  ).toLowerCase();
  const message = normalizeText(
    result.payload?.message ||
      result.payload?.error_description,
    240
  ).toLowerCase();
  return (
    [
      "already_exists",
      "assetalreadyexists",
      "keyalreadyexists",
      "resourcealreadyexists",
    ].includes(code.replace(/[^a-z_]/g, "")) ||
    message.includes("already exists")
  );
}

async function verifyPrivateBucket(config, bucket, fetchImpl) {
  const result = await requestJson(
    `${projectBaseUrl(config.url)}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!result.ok) return result;
  if (result.payload?.public !== false) {
    return {
      ok: false,
      status: 409,
      reason: "Session Planner canary recovery bucket must remain private.",
    };
  }
  return { ok: true };
}

function validateStorageContext(recoveryPackage, config) {
  const verification = verifySessionPlannerCanaryRecoveryPackage(recoveryPackage);
  const baseUrl = projectBaseUrl(config?.url);
  const serviceRoleKey = normalizeText(config?.serviceRoleKey, 2000);
  if (!verification.ok || recoveryPackage.target !== "staging") {
    return {
      ok: false,
      status: 400,
      reason: "A verified staging canary recovery package is required.",
    };
  }
  if (
    !baseUrl ||
    !serviceRoleKey ||
    projectRefFromUrl(baseUrl) !== recoveryPackage.projectRef
  ) {
    return {
      ok: false,
      status: 400,
      reason: "Canary recovery storage does not match the reviewed staging project.",
    };
  }
  return { ok: true, verification, baseUrl, serviceRoleKey };
}

export async function storeSessionPlannerCanaryRecoveryPackage({
  recoveryPackage,
  config,
  fetchImpl = fetch,
  bucket = SESSION_PLANNER_CANARY_RECOVERY_BUCKET,
} = {}) {
  const context = validateStorageContext(recoveryPackage, config);
  if (!context.ok) return context;
  const { verification, baseUrl, serviceRoleKey } = context;
  const bucketResult = await verifyPrivateBucket(
    { url: baseUrl, serviceRoleKey },
    bucket,
    fetchImpl
  );
  if (!bucketResult.ok) return bucketResult;

  const path = recoveryStoragePath(recoveryPackage);
  const objectUrl =
    `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`;
  const upload = await requestJson(
    objectUrl,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "x-upsert": "false",
      }),
      body: JSON.stringify(recoveryPackage),
    },
    fetchImpl
  );
  const reusedExisting = isAlreadyExistingObject(upload);
  if (!upload.ok && !reusedExisting) return upload;

  const reread = await requestJson(
    objectUrl,
    { method: "GET", headers: serviceHeaders(serviceRoleKey) },
    fetchImpl
  );
  if (!reread.ok) return reread;
  const storedVerification = verifySessionPlannerCanaryRecoveryPackage(reread.payload);
  if (
    !storedVerification.ok ||
    storedVerification.contentSha256 !== verification.contentSha256
  ) {
    return {
      ok: false,
      status: 409,
      reason: "Stored Session Planner canary recovery package failed verification.",
    };
  }
  return Object.freeze({
    ok: true,
    bucket,
    path,
    contentSha256: verification.contentSha256,
    reusedExisting,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
}

export async function loadSessionPlannerCanaryRecoveryPackage({
  path,
  expectedContentSha256,
  expectedProjectRef,
  config,
  fetchImpl = fetch,
  bucket = SESSION_PLANNER_CANARY_RECOVERY_BUCKET,
} = {}) {
  const projectRef = normalizeText(expectedProjectRef, 80).toLowerCase();
  const expectedHash = normalizeText(expectedContentSha256, 64).toLowerCase();
  const safePath = validRecoveryPath(path, projectRef);
  const baseUrl = projectBaseUrl(config?.url);
  const serviceRoleKey = normalizeText(config?.serviceRoleKey, 2000);
  if (
    !safePath ||
    !HASH_PATTERN.test(expectedHash) ||
    !baseUrl ||
    !serviceRoleKey ||
    projectRefFromUrl(baseUrl) !== projectRef
  ) {
    return {
      ok: false,
      status: 400,
      reason: "Canary recovery package lookup is not bound to staging.",
    };
  }
  const bucketResult = await verifyPrivateBucket(
    { url: baseUrl, serviceRoleKey },
    bucket,
    fetchImpl
  );
  if (!bucketResult.ok) return bucketResult;

  const objectUrl =
    `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(safePath)}`;
  const read = await requestJson(
    objectUrl,
    { method: "GET", headers: serviceHeaders(serviceRoleKey) },
    fetchImpl
  );
  if (!read.ok) return read;
  const verification = verifySessionPlannerCanaryRecoveryPackage(read.payload);
  if (
    !verification.ok ||
    verification.contentSha256 !== expectedHash ||
    read.payload.projectRef !== projectRef
  ) {
    return {
      ok: false,
      status: 409,
      reason: "Canary recovery package integrity or project binding failed.",
    };
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
