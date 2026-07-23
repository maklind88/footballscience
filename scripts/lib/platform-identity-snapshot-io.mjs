import { createPlatformIdentitySnapshot, verifyPlatformIdentitySnapshot } from "./platform-identity-snapshot.mjs";

export const PLATFORM_IDENTITY_SNAPSHOT_BUCKET = "footballscience-app-state";
const MAX_SCOPE_USERS = 4000;
const QUERY_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function serviceHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    Accept: "application/json",
    ...extra,
  };
}

function requestSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

async function parseResponse(response) {
  const text = response?.status === 204 ? "" : await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(url, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: requestSignal() });
  } catch {
    return { ok: false, status: 503, reason: "Supabase snapshot request could not be completed." };
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    return { ok: false, status: response.status, reason: `Supabase snapshot request failed (${response.status}).` };
  }
  return { ok: true, status: response.status, payload };
}

function restUrl(config, table, params = {}) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.searchParams.set("select", "*");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readRows(config, table, params, fetchImpl) {
  const result = await requestJson(
    restUrl(config, table, params),
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.payload)) {
    return { ok: false, status: 502, reason: `Supabase returned an invalid ${table} snapshot payload.` };
  }
  return { ok: true, rows: result.payload };
}

function chunks(values, size = QUERY_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
}

async function readRowsByValues(config, table, column, values, fetchImpl) {
  const unique = [...new Set(values.map((value) => normalizeText(value, 120)).filter(Boolean))];
  const rows = [];
  for (const batch of chunks(unique)) {
    const result = await readRows(config, table, { [column]: inFilter(batch) }, fetchImpl);
    if (!result.ok) return result;
    rows.push(...result.rows);
  }
  return { ok: true, rows };
}

function linkFilter(link = {}) {
  return {
    module_id: `eq.${normalizeText(link.moduleId || link.module_id, 80)}`,
    module_table: `eq.${normalizeText(link.moduleTable || link.module_table, 80)}`,
    module_record_id: `eq.${normalizeText(link.moduleRecordId || link.module_record_id, 120)}`,
  };
}

async function readTenantLinks(config, links, fetchImpl) {
  const rows = [];
  for (const link of links || []) {
    const result = await readRows(config, "platform_tenant_links", linkFilter(link), fetchImpl);
    if (!result.ok) return result;
    rows.push(...result.rows);
  }
  return { ok: true, rows };
}

function validateCollectionInput(input = {}) {
  const failures = [];
  if (!normalizeText(input.config?.url, 500) || !normalizeText(input.config?.serviceRoleKey, 2000)) {
    failures.push("Supabase server configuration is required.");
  }
  if (!normalizeText(input.organizationId, 120)) failures.push("Organization id is required.");
  if (!Array.isArray(input.userIds) || !input.userIds.length) failures.push("At least one scoped user id is required.");
  if ((input.userIds || []).length > MAX_SCOPE_USERS) failures.push(`Snapshot scope exceeds ${MAX_SCOPE_USERS} users; split the operation.`);
  return failures;
}

export async function collectPlatformIdentitySnapshotRows(input = {}) {
  const failures = validateCollectionInput(input);
  if (failures.length) return { ok: false, status: 400, failures };
  const fetchImpl = input.fetchImpl || fetch;
  const { config } = input;

  const organization = await readRows(config, "platform_organizations", { id: `eq.${input.organizationId}` }, fetchImpl);
  if (!organization.ok) return organization;
  const clubs = input.clubId
    ? await readRows(config, "platform_clubs", { id: `eq.${input.clubId}` }, fetchImpl)
    : { ok: true, rows: [] };
  if (!clubs.ok) return clubs;
  const teams = input.teamId
    ? await readRows(config, "platform_teams", { id: `eq.${input.teamId}` }, fetchImpl)
    : { ok: true, rows: [] };
  if (!teams.ok) return teams;
  const profiles = await readRowsByValues(config, "platform_user_profiles", "user_id", input.userIds, fetchImpl);
  if (!profiles.ok) return profiles;
  const memberships = await readRowsByValues(config, "platform_memberships", "user_id", input.userIds, fetchImpl);
  if (!memberships.ok) return memberships;
  const tenantLinks = await readTenantLinks(config, input.links, fetchImpl);
  if (!tenantLinks.ok) return tenantLinks;

  return {
    ok: true,
    rowsByTable: {
      platform_organizations: organization.rows,
      platform_clubs: clubs.rows,
      platform_teams: teams.rows,
      platform_user_profiles: profiles.rows,
      platform_memberships: memberships.rows,
      platform_tenant_links: tenantLinks.rows,
    },
  };
}

function objectPath(path) {
  return normalizeText(path, 900)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function verifyPrivateBucket(config, bucket, fetchImpl) {
  const result = await requestJson(
    `${config.url}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!result.ok) return result;
  if (result.payload?.public !== false) {
    return { ok: false, status: 409, reason: "Snapshot bucket must exist and remain private." };
  }
  return { ok: true };
}

function snapshotStoragePath(snapshot) {
  const timestamp = snapshot.createdAt.replace(/[:.]/g, "-");
  return `backups/platform-identity/${snapshot.target}/${timestamp}-${snapshot.integrity.contentSha256.slice(0, 16)}.json`;
}

export async function storePlatformIdentitySnapshot({ snapshot, config, fetchImpl = fetch, bucket = PLATFORM_IDENTITY_SNAPSHOT_BUCKET } = {}) {
  const verification = verifyPlatformIdentitySnapshot(snapshot);
  if (!verification.ok) return { ok: false, status: 400, reason: verification.reason };
  if (!normalizeText(config?.url, 500) || !normalizeText(config?.serviceRoleKey, 2000)) {
    return { ok: false, status: 400, reason: "Supabase server configuration is required." };
  }
  const bucketResult = await verifyPrivateBucket(config, bucket, fetchImpl);
  if (!bucketResult.ok) return bucketResult;

  const path = snapshotStoragePath(snapshot);
  const upload = await requestJson(
    `${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`,
    {
      method: "POST",
      headers: serviceHeaders(config.serviceRoleKey, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "x-upsert": "false",
      }),
      body: JSON.stringify(snapshot),
    },
    fetchImpl
  );
  if (!upload.ok) return upload;

  const reread = await requestJson(
    `${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`,
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!reread.ok) return reread;
  const storedVerification = verifyPlatformIdentitySnapshot(reread.payload);
  if (!storedVerification.ok || storedVerification.contentSha256 !== verification.contentSha256) {
    return { ok: false, status: 409, reason: "Stored snapshot failed read-after-write integrity verification." };
  }
  return {
    ok: true,
    bucket,
    path,
    contentSha256: verification.contentSha256,
    readAfterWriteVerified: true,
  };
}

export async function loadPlatformIdentitySnapshot({
  path,
  expectedContentSha256,
  config,
  fetchImpl = fetch,
  bucket = PLATFORM_IDENTITY_SNAPSHOT_BUCKET,
} = {}) {
  if (!normalizeText(path, 900) || !normalizeText(expectedContentSha256, 64)) {
    return {
      ok: false,
      status: 400,
      reason: "Snapshot path and expected content hash are required.",
    };
  }
  if (
    !normalizeText(config?.url, 500) ||
    !normalizeText(config?.serviceRoleKey, 2000)
  ) {
    return {
      ok: false,
      status: 400,
      reason: "Supabase server configuration is required.",
    };
  }
  const bucketResult = await verifyPrivateBucket(config, bucket, fetchImpl);
  if (!bucketResult.ok) return bucketResult;
  const result = await requestJson(
    `${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`,
    { method: "GET", headers: serviceHeaders(config.serviceRoleKey) },
    fetchImpl
  );
  if (!result.ok) return result;
  const verification = verifyPlatformIdentitySnapshot(result.payload);
  if (
    !verification.ok ||
    verification.contentSha256 !== normalizeText(expectedContentSha256, 64)
  ) {
    return {
      ok: false,
      status: 409,
      reason: "Loaded snapshot failed the expected integrity check.",
    };
  }
  return {
    ok: true,
    snapshot: result.payload,
    bucket,
    path,
    contentSha256: verification.contentSha256,
    readVerified: true,
  };
}

export async function buildPlatformIdentitySnapshot(input = {}) {
  const collected = await collectPlatformIdentitySnapshotRows(input);
  if (!collected.ok) return collected;
  return createPlatformIdentitySnapshot({ ...input, rowsByTable: collected.rowsByTable });
}
