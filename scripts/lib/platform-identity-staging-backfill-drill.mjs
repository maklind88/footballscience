import { createRequire } from "node:module";
import {
  APPLY_CONFIRMATION,
  executePlatformIdentityBackfill,
  listAuthUsersForBackfill,
} from "../platform-identity-backfill.mjs";
import { verifyPlatformIdentityBackfillEnvironment } from "../verify-platform-identity-backfill-env.mjs";
import {
  canonicalJson,
  createPlatformIdentityRollbackPlan,
  createPlatformIdentityRollbackSummary,
  platformIdentitySnapshotTables,
} from "./platform-identity-snapshot.mjs";
import {
  buildPlatformIdentitySnapshot,
  storePlatformIdentitySnapshot,
} from "./platform-identity-snapshot-io.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../../api/_lib/supabase-admin.js");

export const PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA = "footballscience-platform-identity-staging-drill-v1";
export const STAGING_APPLY_CONFIRMATION = "APPLY_PLATFORM_IDENTITY_STAGING";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSIONED_TABLES = new Set([
  "platform_organizations",
  "platform_clubs",
  "platform_teams",
  "platform_user_profiles",
  "platform_memberships",
]);
const KEY_COLUMNS = Object.freeze({
  platform_organizations: "id",
  platform_clubs: "id",
  platform_teams: "id",
  platform_user_profiles: "user_id",
  platform_memberships: "id",
  platform_tenant_links: "id",
});
const ARCHIVED_STATUSES = new Set(["archived", "removed"]);
const EPHEMERAL_ROW_FIELDS = new Set(["row_version", "updated_at", "updated_by"]);

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return UUID_PATTERN.test(normalizeText(value, 120));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseExpectedUserCount(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function responseJson(payload, fallback = {}) {
  if (payload === undefined || payload === null || payload === "") return fallback;
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return fallback;
  }
}

async function readResponse(response) {
  const text = response?.status === 204 ? "" : await response?.text?.();
  return responseJson(text, {});
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

function backfillScope(backfill = {}, userIds = []) {
  return {
    organizationId: backfill.organization?.id,
    clubId: backfill.club?.id,
    teamId: backfill.team?.id,
    userIds,
    links: (backfill.links || []).map((link) => ({
      moduleId: link.moduleId || link.module_id,
      moduleTable: link.moduleTable || link.module_table,
      moduleRecordId: link.moduleRecordId || link.module_record_id,
    })),
  };
}

function tableKey(table, row = {}) {
  return normalizeText(row?.[KEY_COLUMNS[table]], 160);
}

function withoutEphemeralFields(row = {}) {
  if (!isPlainObject(row)) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !EPHEMERAL_ROW_FIELDS.has(key)));
}

function isBackfillArchive(row = {}) {
  return (
    row?.metadata?.backfillSchema === "footballscience-platform-identity-backfill-v1" &&
    Boolean(row?.deleted_at) &&
    ARCHIVED_STATUSES.has(normalizeText(row?.status, 40).toLowerCase())
  );
}

function rollbackEquivalent(before = {}, after = {}) {
  for (const table of platformIdentitySnapshotTables) {
    const baseline = Array.isArray(before?.[table]) ? before[table] : [];
    const baselineByKey = new Map(baseline.map((row) => [tableKey(table, row), row]));
    const surviving = (Array.isArray(after?.[table]) ? after[table] : []).filter(
      (row) => baselineByKey.has(tableKey(table, row)) || !isBackfillArchive(row)
    );
    if (baseline.length !== surviving.length) return false;
    const normalizedBaseline = baseline.map(withoutEphemeralFields).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    const normalizedAfter = surviving.map(withoutEphemeralFields).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    if (canonicalJson(normalizedBaseline) !== canonicalJson(normalizedAfter)) return false;
  }
  return true;
}

function validateFinalIdentity(snapshot, backfill = {}) {
  const organization = snapshot?.tables?.platform_organizations?.[0];
  const team = snapshot?.tables?.platform_teams?.[0];
  const profiles = snapshot?.tables?.platform_user_profiles || [];
  const organizationId = normalizeText(backfill.organization?.id, 120);
  const teamId = normalizeText(backfill.team?.id, 120);
  const failures = [];

  if (!organization || organization.id !== organizationId || organization.status !== "active" || organization.deleted_at) {
    failures.push("Canonical organization was not active after the drill.");
  }
  if (!team || team.id !== teamId || team.organization_id !== organizationId || team.status !== "active" || team.deleted_at) {
    failures.push("Canonical team was not active after the drill.");
  }
  if (!profiles.some((profile) => profile.primary_organization_id === organizationId && profile.primary_team_id === teamId && profile.status === "active" && !profile.deleted_at)) {
    failures.push("No active profile was bound to the canonical organization and team.");
  }
  return failures;
}

function validateRollbackAction(action = {}) {
  const table = normalizeText(action.table, 120);
  if (!platformIdentitySnapshotTables.includes(table) || KEY_COLUMNS[table] !== action.keyColumn) {
    return "Rollback action references an unsupported table or key.";
  }
  if (!VERSIONED_TABLES.has(table)) {
    return "Rollback action targets a row without an optimistic version contract.";
  }
  if (!isUuid(action.key) || !Number.isInteger(action.expectedRowVersion) || action.expectedRowVersion < 1) {
    return "Rollback action is missing an exact optimistic row version.";
  }
  if (!["restore-existing", "archive-created"].includes(action.action) || !isPlainObject(action.patch)) {
    return "Rollback action is invalid.";
  }
  return "";
}

function patchMatches(row = {}, patch = {}) {
  return Object.entries(patch).every(([key, value]) => canonicalJson(row?.[key] ?? null) === canonicalJson(value ?? null));
}

export async function executePlatformIdentityRollback(plan = {}, options = {}) {
  if (plan?.ok !== true || !Array.isArray(plan.actions)) {
    return { ok: false, status: 400, reason: "A verified Platform Identity rollback plan is required.", actionsApplied: 0 };
  }
  const config = options.config || readConfig();
  if (!normalizeText(config?.url, 500) || !normalizeText(config?.serviceRoleKey, 2000)) {
    return { ok: false, status: 500, reason: "Supabase server configuration is required for rollback.", actionsApplied: 0 };
  }
  const fetchImpl = options.fetchImpl || fetch;
  let actionsApplied = 0;

  for (const action of plan.actions) {
    const validationError = validateRollbackAction(action);
    if (validationError) return { ok: false, status: 400, reason: validationError, actionsApplied };
    const rollbackPatch = {
      ...action.patch,
      row_version: action.expectedRowVersion + 1,
    };
    const url = new URL(`${config.url}/rest/v1/${action.table}`);
    url.searchParams.set(action.keyColumn, `eq.${action.key}`);
    url.searchParams.set("row_version", `eq.${action.expectedRowVersion}`);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "PATCH",
        headers: serviceHeaders(config.serviceRoleKey, { Prefer: "return=representation" }),
        body: JSON.stringify(rollbackPatch),
      });
    } catch {
      return { ok: false, status: 503, reason: "Platform Identity rollback request could not be completed.", actionsApplied };
    }
    const payload = await readResponse(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (!response?.ok || rows.length !== 1 || !patchMatches(rows[0], rollbackPatch) || Number(rows[0]?.row_version) < rollbackPatch.row_version) {
      return { ok: false, status: response?.status || 409, reason: "Platform Identity rollback stopped because a row changed or did not acknowledge the exact patch.", actionsApplied };
    }
    actionsApplied += 1;
  }
  return { ok: true, status: 200, actionsApplied };
}

async function collectUserIds(backfill = {}, options = {}) {
  const result = await listAuthUsersForBackfill({
    config: options.config,
    fetchImpl: options.fetchImpl,
    limit: backfill.limit,
    maxPages: backfill.maxPages,
  });
  if (!result.ok) return result;
  return { ok: true, userIds: result.users.map((user) => normalizeText(user.id, 120)).filter(isUuid) };
}

async function buildScopedSnapshot({ backfill, plan, userIds, target, projectRef, config, fetchImpl, now }) {
  return buildPlatformIdentitySnapshot({
    config,
    fetchImpl,
    target,
    projectRef,
    planSha256: plan.planSha256,
    userCount: plan.usersPlanned,
    createdAt: now().toISOString(),
    ...backfillScope(backfill, userIds),
  });
}

function validateDrillInput(backfill = {}, env = {}) {
  const environment = verifyPlatformIdentityBackfillEnvironment(env);
  const failures = [...environment.failures];
  if (environment.target !== "staging") failures.push("Platform Identity drill is staging-only.");
  if (backfill.apply !== true || backfill.confirm !== STAGING_APPLY_CONFIRMATION) {
    failures.push(`Staging drill requires --apply --confirm=${STAGING_APPLY_CONFIRMATION}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(normalizeText(backfill.expectedPlanSha256, 64))) {
    failures.push("Staging drill requires a reviewed expected plan SHA-256.");
  }
  if (parseExpectedUserCount(backfill.expectedUserCount) === null) {
    failures.push("Staging drill requires a reviewed expected user count.");
  }
  if ((backfill.links || []).length) {
    failures.push("Staging drill does not support tenant links until their rollback has an optimistic version contract.");
  }
  return failures;
}

function toSafeSummary({ preSnapshot, postSnapshot, rollbackPlan, rollbackResult, finalSnapshot, initialPlan, reapplyPlan }) {
  return {
    ok: true,
    schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
    target: "staging",
    initialPlanSha256: initialPlan.planSha256,
    reapplyPlanSha256: reapplyPlan.planSha256,
    userCount: initialPlan.usersPlanned,
    pre: { counts: preSnapshot.counts, contentSha256: preSnapshot.integrity.contentSha256 },
    post: { counts: postSnapshot.counts, contentSha256: postSnapshot.integrity.contentSha256 },
    rollback: { ...createPlatformIdentityRollbackSummary(rollbackPlan), actionsApplied: rollbackResult.actionsApplied },
    final: { counts: finalSnapshot.counts, contentSha256: finalSnapshot.integrity.contentSha256 },
    piiExposed: false,
  };
}

export async function executePlatformIdentityStagingDrill(options = {}) {
  const backfill = options.backfill || {};
  const env = options.env || process.env;
  const failures = validateDrillInput(backfill, env);
  if (failures.length) return { ok: false, status: 400, schema: PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA, failures, piiExposed: false };
  const config = options.config || readConfig();
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => new Date());

  const initial = await executePlatformIdentityBackfill({ ...backfill, apply: false, config, fetchImpl });
  if (!initial.ok) return { ok: false, status: initial.status || 500, reason: "Identity dry-run could not be reproduced.", piiExposed: false };
  if (initial.plan.planSha256 !== backfill.expectedPlanSha256 || initial.plan.usersPlanned !== backfill.expectedUserCount) {
    return { ok: false, status: 409, reason: "Reviewed identity plan changed before staging apply.", piiExposed: false };
  }

  const users = await collectUserIds(backfill, { config, fetchImpl });
  if (!users.ok || users.userIds.length !== initial.plan.usersPlanned) {
    return { ok: false, status: users.status || 409, reason: "Identity user scope changed before staging snapshot.", piiExposed: false };
  }
  const preSnapshot = await buildScopedSnapshot({
    backfill, plan: initial.plan, userIds: users.userIds, target: "staging", projectRef: env.SUPABASE_PROJECT_REF, config, fetchImpl, now,
  });
  if (!preSnapshot.ok) return { ok: false, status: preSnapshot.status || 500, reason: "Pre-apply identity snapshot failed.", piiExposed: false };
  const stored = await storePlatformIdentitySnapshot({ snapshot: preSnapshot, config, fetchImpl });
  if (!stored.ok) return { ok: false, status: stored.status || 500, reason: "Pre-apply identity snapshot was not durably verified.", piiExposed: false };

  const applied = await executePlatformIdentityBackfill({
    ...backfill,
    apply: true,
    confirm: APPLY_CONFIRMATION,
    config,
    fetchImpl,
  });
  if (!applied.ok) return { ok: false, status: applied.status || 500, reason: "Identity apply failed after the verified pre-snapshot.", piiExposed: false };

  const postSnapshot = await buildScopedSnapshot({
    backfill, plan: initial.plan, userIds: users.userIds, target: "staging", projectRef: env.SUPABASE_PROJECT_REF, config, fetchImpl, now,
  });
  if (!postSnapshot.ok) return { ok: false, status: postSnapshot.status || 500, reason: "Post-apply identity snapshot failed.", piiExposed: false };
  const postFailures = validateFinalIdentity(postSnapshot, backfill);
  if (postFailures.length) return { ok: false, status: 409, failures: postFailures, piiExposed: false };

  const rollbackPlan = createPlatformIdentityRollbackPlan({
    snapshot: preSnapshot,
    currentRowsByTable: postSnapshot.tables,
    actorId: backfill.actorId,
    createdAt: now().toISOString(),
  });
  if (!rollbackPlan.ok) return { ok: false, status: 409, reason: "Identity rollback plan was blocked.", rollback: createPlatformIdentityRollbackSummary(rollbackPlan), piiExposed: false };
  const rollbackResult = await executePlatformIdentityRollback(rollbackPlan, { config, fetchImpl });
  if (!rollbackResult.ok) return { ok: false, status: rollbackResult.status || 500, reason: rollbackResult.reason, piiExposed: false };

  const rollbackSnapshot = await buildScopedSnapshot({
    backfill, plan: initial.plan, userIds: users.userIds, target: "staging", projectRef: env.SUPABASE_PROJECT_REF, config, fetchImpl, now,
  });
  if (!rollbackSnapshot.ok || !rollbackEquivalent(preSnapshot.tables, rollbackSnapshot.tables)) {
    return { ok: false, status: 409, reason: "Identity rollback did not restore the verified baseline.", piiExposed: false };
  }

  const reapplyPlan = await executePlatformIdentityBackfill({ ...backfill, apply: false, config, fetchImpl });
  if (!reapplyPlan.ok || reapplyPlan.plan.usersPlanned !== initial.plan.usersPlanned) {
    return { ok: false, status: 409, reason: "Identity reapply plan was not safe after rollback.", piiExposed: false };
  }
  const reapplied = await executePlatformIdentityBackfill({
    ...backfill,
    apply: true,
    confirm: APPLY_CONFIRMATION,
    expectedPlanSha256: reapplyPlan.plan.planSha256,
    expectedUserCount: reapplyPlan.plan.usersPlanned,
    config,
    fetchImpl,
  });
  if (!reapplied.ok) return { ok: false, status: reapplied.status || 500, reason: "Identity reapply failed after verified rollback.", piiExposed: false };

  const finalSnapshot = await buildScopedSnapshot({
    backfill, plan: reapplyPlan.plan, userIds: users.userIds, target: "staging", projectRef: env.SUPABASE_PROJECT_REF, config, fetchImpl, now,
  });
  const finalFailures = finalSnapshot.ok ? validateFinalIdentity(finalSnapshot, backfill) : ["Final identity snapshot failed."];
  if (finalFailures.length) return { ok: false, status: 409, failures: finalFailures, piiExposed: false };

  return toSafeSummary({ preSnapshot, postSnapshot, rollbackPlan, rollbackResult, finalSnapshot, initialPlan: initial.plan, reapplyPlan: reapplyPlan.plan });
}
