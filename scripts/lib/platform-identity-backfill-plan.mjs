import crypto from "node:crypto";

export const PLATFORM_IDENTITY_BACKFILL_PLAN_SCHEMA = "footballscience-platform-identity-backfill-plan-v1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableValue(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function countBy(values = []) {
  const counts = new Map();
  for (const value of values) {
    const key = normalizeText(value, 160) || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function normalizeExpectedPlanSha256(value) {
  const hash = normalizeText(value, 80).toLowerCase();
  return SHA256_PATTERN.test(hash) ? hash : "";
}

export function normalizeExpectedUserCount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function resolveBackfillMembershipScope(role, options = {}) {
  if (role === "admin") return "organization";
  if (role === "club-admin" && options.club) return "club";
  if (options.team) return "team";
  return options.club ? "club" : "organization";
}

export function sanitizeBackfillOperations(operations = []) {
  return (Array.isArray(operations) ? operations : []).map((entry) => ({
    type: normalizeText(entry?.type, 80),
    action: normalizeText(entry?.action, 80),
    slug: normalizeText(entry?.slug, 120) || undefined,
    role: normalizeText(entry?.role, 40) || undefined,
    scope: normalizeText(entry?.scope, 40) || undefined,
    moduleId: normalizeText(entry?.moduleId, 80) || undefined,
    moduleTable: normalizeText(entry?.moduleTable, 120) || undefined,
  }));
}

function canonicalPlanEntry(entry = {}) {
  const body = entry.body || {};
  return {
    organization: body.organization || null,
    club: body.club || null,
    team: body.team || null,
    user: body.user || null,
    membership: body.membership || null,
    links: [...(body.links || [])].sort((left, right) =>
      stableStringify(left).localeCompare(stableStringify(right))
    ),
    operations: sanitizeBackfillOperations(entry.result?.operations),
  };
}

export function createPlatformIdentityBackfillPlan({ actorId, entries = [] } = {}) {
  const canonicalEntries = entries
    .map(canonicalPlanEntry)
    .sort((left, right) => normalizeText(left.user?.id, 120).localeCompare(normalizeText(right.user?.id, 120)));
  const canonicalPlan = {
    schema: PLATFORM_IDENTITY_BACKFILL_PLAN_SCHEMA,
    actorId: normalizeText(actorId, 120),
    entries: canonicalEntries,
  };
  const operations = canonicalEntries.flatMap((entry) => entry.operations);

  return {
    schema: PLATFORM_IDENTITY_BACKFILL_PLAN_SCHEMA,
    planSha256: sha256(stableStringify(canonicalPlan)),
    usersPlanned: canonicalEntries.length,
    roleCounts: countBy(canonicalEntries.map((entry) => entry.membership?.role)),
    scopeCounts: countBy(canonicalEntries.map((entry) => entry.membership?.scope)),
    actionCounts: countBy(operations.map((entry) => `${entry.type}:${entry.action}`)),
  };
}

export function createSafeBackfillResult(entry = {}, index = 0) {
  const body = entry.body || {};
  const result = entry.result || {};
  return {
    ok: result.ok === true,
    user: `user-${index + 1}`,
    role: normalizeText(body.membership?.role, 40),
    scope: normalizeText(body.membership?.scope, 40),
    dryRun: body.dryRun === true,
    operations: sanitizeBackfillOperations(result.operations),
    reason: normalizeText(result.reason, 500),
  };
}

export function createPlatformIdentityBackfillSummary({
  ok,
  status,
  dryRun,
  usersFound,
  usersSelected,
  usersSkippedInactive,
  usersSkippedRole,
  results = [],
  plan,
  reason = "",
} = {}) {
  return {
    ok: ok === true,
    status: Number(status) || (ok ? 200 : 500),
    dryRun: dryRun !== false,
    usersFound: Number(usersFound) || 0,
    usersSelected: Number(usersSelected) || 0,
    usersSkippedInactive: Number(usersSkippedInactive) || 0,
    usersSkippedRole: Number(usersSkippedRole) || 0,
    usersProcessed: results.length,
    failed: results.filter((result) => !result.ok).length,
    plan,
    reason: normalizeText(reason, 500) || undefined,
    results,
  };
}
