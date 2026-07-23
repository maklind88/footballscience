import { createHash } from "node:crypto";

export const PLATFORM_IDENTITY_SNAPSHOT_SCHEMA = "footballscience-platform-identity-snapshot-v1";
export const PLATFORM_IDENTITY_ROLLBACK_SCHEMA = "footballscience-platform-identity-rollback-v1";
export const PLATFORM_IDENTITY_BACKFILL_MARKER = "footballscience-platform-identity-backfill-v1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TARGETS = new Set(["staging", "production"]);
const TABLES = Object.freeze([
  "platform_organizations",
  "platform_clubs",
  "platform_teams",
  "platform_user_profiles",
  "platform_memberships",
  "platform_tenant_links",
]);
const TABLE_CONFIG = Object.freeze({
  platform_organizations: {
    key: "id",
    scope: [],
    mutable: ["slug", "name", "status", "metadata", "deleted_by", "deleted_at", "delete_reason"],
    archive: "archived",
  },
  platform_clubs: {
    key: "id",
    scope: ["organization_id"],
    mutable: ["slug", "name", "country_code", "status", "metadata", "deleted_by", "deleted_at", "delete_reason"],
    archive: "archived",
  },
  platform_teams: {
    key: "id",
    scope: ["organization_id", "club_id"],
    mutable: ["slug", "name", "sport", "age_group", "gender", "status", "metadata", "deleted_by", "deleted_at", "delete_reason"],
    archive: "archived",
  },
  platform_user_profiles: {
    key: "user_id",
    scope: [],
    mutable: [
      "primary_organization_id",
      "primary_club_id",
      "primary_team_id",
      "display_name",
      "first_name",
      "last_name",
      "email",
      "title",
      "department",
      "avatar_url",
      "status",
      "metadata",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
    archive: "removed",
  },
  platform_memberships: {
    key: "id",
    scope: ["organization_id", "club_id", "team_id", "user_id"],
    mutable: [
      "role",
      "scope",
      "status",
      "relationship",
      "invited_by",
      "accepted_at",
      "metadata",
      "deleted_by",
      "deleted_at",
      "delete_reason",
    ],
    archive: "removed",
  },
  platform_tenant_links: {
    key: "id",
    scope: ["organization_id", "club_id", "team_id", "module_id", "module_table", "module_record_id", "scope"],
    mutable: ["status", "metadata"],
    archive: "archived",
  },
});

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])])
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value), "utf8").digest("hex");
}

function normalizeRows(table, rows) {
  const config = TABLE_CONFIG[table];
  return (Array.isArray(rows) ? rows : [])
    .filter(isPlainObject)
    .map((row) => canonicalValue(row))
    .sort((left, right) => normalizeText(left[config.key], 160).localeCompare(normalizeText(right[config.key], 160)));
}

function normalizeTables(rowsByTable = {}) {
  return Object.fromEntries(TABLES.map((table) => [table, normalizeRows(table, rowsByTable[table])]));
}

function tableCounts(tables) {
  return Object.fromEntries(TABLES.map((table) => [table, tables[table].length]));
}

function normalizeScope(scope = {}) {
  return canonicalValue({
    organizationId: normalizeText(scope.organizationId, 120) || null,
    clubId: normalizeText(scope.clubId, 120) || null,
    teamId: normalizeText(scope.teamId, 120) || null,
    userIds: [...new Set((scope.userIds || []).map((value) => normalizeText(value, 120)).filter(Boolean))].sort(),
    links: (scope.links || [])
      .filter(isPlainObject)
      .map((link) => ({
        moduleId: normalizeText(link.moduleId || link.module_id, 80),
        moduleTable: normalizeText(link.moduleTable || link.module_table, 80),
        moduleRecordId: normalizeText(link.moduleRecordId || link.module_record_id, 120),
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  });
}

function validateSnapshotInput(input = {}) {
  const failures = [];
  if (!TARGETS.has(input.target)) failures.push("Snapshot target must be staging or production.");
  if (!normalizeText(input.projectRef, 80)) failures.push("Snapshot project ref is required.");
  if (!SHA256_PATTERN.test(normalizeText(input.planSha256, 64))) failures.push("A reviewed plan SHA-256 is required.");
  if (!Number.isInteger(input.userCount) || input.userCount < 0) failures.push("A reviewed non-negative user count is required.");
  if (!normalizeText(input.createdAt, 80) || Number.isNaN(Date.parse(input.createdAt))) failures.push("A valid snapshot timestamp is required.");
  return failures;
}

export function createPlatformIdentitySnapshot(input = {}) {
  const failures = validateSnapshotInput(input);
  if (failures.length) return { ok: false, failures };

  const tables = normalizeTables(input.rowsByTable);
  const body = canonicalValue({
    ok: true,
    schema: PLATFORM_IDENTITY_SNAPSHOT_SCHEMA,
    target: input.target,
    projectRef: normalizeText(input.projectRef, 80),
    createdAt: new Date(input.createdAt).toISOString(),
    plan: {
      planSha256: normalizeText(input.planSha256, 64),
      userCount: input.userCount,
    },
    scope: normalizeScope(input.scope),
    counts: tableCounts(tables),
    tables,
  });
  return {
    ...body,
    integrity: {
      algorithm: "sha256",
      contentSha256: sha256(body),
    },
  };
}

export function verifyPlatformIdentitySnapshot(snapshot = {}) {
  if (!isPlainObject(snapshot) || snapshot.ok !== true || snapshot.schema !== PLATFORM_IDENTITY_SNAPSHOT_SCHEMA) {
    return { ok: false, reason: "Snapshot schema is invalid." };
  }
  const { integrity, ...body } = snapshot;
  const expected = normalizeText(integrity?.contentSha256, 64);
  if (integrity?.algorithm !== "sha256" || !SHA256_PATTERN.test(expected)) {
    return { ok: false, reason: "Snapshot integrity metadata is invalid." };
  }
  const actual = sha256(body);
  return actual === expected
    ? { ok: true, contentSha256: actual }
    : { ok: false, reason: "Snapshot content hash does not match.", contentSha256: actual };
}

function rowKey(table, row) {
  return normalizeText(row?.[TABLE_CONFIG[table].key], 160);
}

function selectFields(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row?.[field] ?? null]));
}

function valuesDiffer(left, right) {
  return canonicalJson(left) !== canonicalJson(right);
}

function isBackfillOwned(row) {
  return row?.metadata?.backfillSchema === PLATFORM_IDENTITY_BACKFILL_MARKER;
}

function archivePatch(table, actorId, createdAt) {
  const patch = { status: TABLE_CONFIG[table].archive };
  if (table !== "platform_tenant_links") {
    patch.deleted_by = actorId;
    patch.deleted_at = createdAt;
    patch.delete_reason = "Rollback of Platform Identity backfill.";
    patch.updated_by = actorId;
  }
  return patch;
}

export function createPlatformIdentityRollbackPlan({ snapshot, currentRowsByTable = {}, actorId, createdAt } = {}) {
  const snapshotCheck = verifyPlatformIdentitySnapshot(snapshot);
  const timestamp = normalizeText(createdAt, 80);
  if (!snapshotCheck.ok) return { ok: false, blockers: [snapshotCheck.reason], actions: [] };
  if (!normalizeText(actorId, 120)) return { ok: false, blockers: ["Rollback actor id is required."], actions: [] };
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return { ok: false, blockers: ["Rollback timestamp is invalid."], actions: [] };

  const currentTables = normalizeTables(currentRowsByTable);
  const actions = [];
  const blockers = [];
  for (const table of [...TABLES].reverse()) {
    const config = TABLE_CONFIG[table];
    const beforeRows = snapshot.tables[table] || [];
    const beforeByKey = new Map(beforeRows.map((row) => [rowKey(table, row), row]));
    const currentByKey = new Map(currentTables[table].map((row) => [rowKey(table, row), row]));

    for (const [key, before] of beforeByKey) {
      const current = currentByKey.get(key);
      if (!current) {
        blockers.push(`${table}:${key}:baseline-row-missing`);
        continue;
      }
      if (valuesDiffer(selectFields(before, config.scope), selectFields(current, config.scope))) {
        blockers.push(`${table}:${key}:tenant-scope-changed`);
        continue;
      }
      const patch = selectFields(before, config.mutable);
      if (valuesDiffer(patch, selectFields(current, config.mutable))) {
        actions.push({
          table,
          keyColumn: config.key,
          key,
          action: "restore-existing",
          expectedRowVersion: Number.isInteger(current.row_version) ? current.row_version : null,
          patch: { ...patch, ...(table === "platform_tenant_links" ? {} : { updated_by: actorId }) },
        });
      }
    }

    for (const [key, current] of currentByKey) {
      if (beforeByKey.has(key)) continue;
      if (!isBackfillOwned(current)) {
        blockers.push(`${table}:${key}:new-row-not-owned-by-backfill`);
        continue;
      }
      actions.push({
        table,
        keyColumn: config.key,
        key,
        action: "archive-created",
        expectedRowVersion: Number.isInteger(current.row_version) ? current.row_version : null,
        patch: archivePatch(table, actorId, new Date(timestamp).toISOString()),
      });
    }
  }

  const body = canonicalValue({
    schema: PLATFORM_IDENTITY_ROLLBACK_SCHEMA,
    snapshotSha256: snapshotCheck.contentSha256,
    createdAt: new Date(timestamp).toISOString(),
    actions,
    blockers: blockers.sort(),
  });
  return {
    ok: blockers.length === 0,
    ...body,
    planSha256: sha256(body),
  };
}

export function createPlatformIdentitySnapshotSummary(snapshot = {}) {
  const verification = verifyPlatformIdentitySnapshot(snapshot);
  return {
    ok: verification.ok,
    schema: snapshot.schema || null,
    target: snapshot.target || null,
    createdAt: snapshot.createdAt || null,
    planSha256: snapshot.plan?.planSha256 || null,
    userCount: Number.isInteger(snapshot.plan?.userCount) ? snapshot.plan.userCount : 0,
    counts: snapshot.counts || {},
    contentSha256: verification.contentSha256 || null,
    piiExposed: false,
  };
}

export function createPlatformIdentityRollbackSummary(plan = {}) {
  const actionCounts = {};
  for (const action of plan.actions || []) {
    const key = `${action.table}:${action.action}`;
    actionCounts[key] = (actionCounts[key] || 0) + 1;
  }
  return {
    ok: plan.ok === true,
    schema: plan.schema || PLATFORM_IDENTITY_ROLLBACK_SCHEMA,
    planSha256: plan.planSha256 || null,
    snapshotSha256: plan.snapshotSha256 || null,
    actionCount: (plan.actions || []).length,
    blockerCount: (plan.blockers || []).length,
    actionCounts,
    piiExposed: false,
  };
}

export function verifyPlatformIdentityRollbackState({
  snapshot,
  currentRowsByTable = {},
} = {}) {
  const snapshotCheck = verifyPlatformIdentitySnapshot(snapshot);
  if (!snapshotCheck.ok) {
    return { ok: false, blockers: [snapshotCheck.reason] };
  }
  const currentTables = normalizeTables(currentRowsByTable);
  const blockers = [];
  for (const table of TABLES) {
    const config = TABLE_CONFIG[table];
    const baseline = new Map(
      (snapshot.tables[table] || []).map((row) => [rowKey(table, row), row])
    );
    const current = new Map(
      currentTables[table].map((row) => [rowKey(table, row), row])
    );
    for (const [key, before] of baseline) {
      const after = current.get(key);
      if (!after) {
        blockers.push(`${table}:${key}:baseline-row-missing`);
        continue;
      }
      if (
        valuesDiffer(
          selectFields(before, [...config.scope, ...config.mutable]),
          selectFields(after, [...config.scope, ...config.mutable])
        )
      ) {
        blockers.push(`${table}:${key}:baseline-content-not-restored`);
      }
    }
    for (const [key, after] of current) {
      if (baseline.has(key)) continue;
      if (!isBackfillOwned(after)) {
        blockers.push(`${table}:${key}:unknown-row-after-rollback`);
        continue;
      }
      const archived = after.status === config.archive;
      const deletionMarked =
        table === "platform_tenant_links" || Boolean(after.deleted_at);
      if (!archived || !deletionMarked) {
        blockers.push(`${table}:${key}:created-row-not-archived`);
      }
    }
  }
  return {
    ok: blockers.length === 0,
    snapshotSha256: snapshotCheck.contentSha256,
    blockers: blockers.sort(),
  };
}

export const platformIdentitySnapshotTables = TABLES;
