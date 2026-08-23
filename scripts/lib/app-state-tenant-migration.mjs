import { createHash } from "node:crypto";

export const APP_STATE_TENANT_MIGRATION_SCHEMA = "footballscience-app-state-tenant-migration-v1";
export const APP_STATE_TENANT_MIGRATION_CONFIRMATION = "MIGRATE_LEGACY_APP_STATE";
export const APP_STATE_TENANT_ROLLBACK_CONFIRMATION = "ROLLBACK_LEGACY_APP_STATE";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function normalizeRow(row = {}) {
  return {
    stateKey: String(row.state_key || row.key || ""),
    moduleId: String(row.module_id || row.moduleId || ""),
    mergePolicy: String(row.merge_policy || row.mergePolicy || ""),
    revision: Number(row.revision) || 0,
    value: String(row.value ?? ""),
    removed: Boolean(row.removed),
    updatedBy: String(row.updated_by || row.updatedBy || ""),
    updatedAt: String(row.updated_at || row.updatedAt || ""),
    valueHash: String(row.value_hash || row.hash || ""),
    metadata: row.metadata && typeof row.metadata === "object" ? stableValue(row.metadata) : {},
  };
}

export function summarizeAppStateRows(rows = []) {
  const normalizedRows = rows.map(normalizeRow).filter((row) => row.stateKey).sort((a, b) => (
    a.stateKey.localeCompare(b.stateKey)
  ));
  const contentProjection = normalizedRows.map(({ revision, updatedBy, updatedAt, ...row }) => row);
  const revisionProjection = normalizedRows.map((row) => ({
    stateKey: row.stateKey,
    revision: row.revision,
    valueHash: row.valueHash,
  }));
  return {
    recordCount: normalizedRows.length,
    contentSha256: sha256(stableJson(contentProjection)),
    revisionSha256: sha256(stableJson(revisionProjection)),
    rows: normalizedRows,
  };
}

export function createAppStateTenantMigrationPlan({ targetOrganizationId, sourceRows, targetRows }) {
  const source = summarizeAppStateRows(sourceRows);
  const targetBefore = summarizeAppStateRows(targetRows);
  const core = {
    schema: APP_STATE_TENANT_MIGRATION_SCHEMA,
    sourceOrganizationId: "global",
    targetOrganizationId: String(targetOrganizationId || ""),
    source: {
      recordCount: source.recordCount,
      contentSha256: source.contentSha256,
      revisionSha256: source.revisionSha256,
    },
    targetBefore: {
      recordCount: targetBefore.recordCount,
      contentSha256: targetBefore.contentSha256,
      revisionSha256: targetBefore.revisionSha256,
    },
  };
  return { ...core, planSha256: sha256(stableJson(core)), source, targetBefore };
}

export function verifyMigratedAppStateRows(sourceRows = [], targetRows = []) {
  const source = summarizeAppStateRows(sourceRows);
  const target = summarizeAppStateRows(targetRows);
  return {
    ok:
      source.recordCount === target.recordCount &&
      source.contentSha256 === target.contentSha256 &&
      source.revisionSha256 === target.revisionSha256,
    source,
    target,
  };
}

export function createMigrationSnapshot(plan) {
  const core = {
    schema: `${APP_STATE_TENANT_MIGRATION_SCHEMA}-snapshot`,
    createdAt: new Date().toISOString(),
    sourceOrganizationId: plan.sourceOrganizationId,
    targetOrganizationId: plan.targetOrganizationId,
    planSha256: plan.planSha256,
    source: {
      recordCount: plan.source.recordCount,
      contentSha256: plan.source.contentSha256,
      revisionSha256: plan.source.revisionSha256,
      rows: plan.source.rows,
    },
    targetBefore: {
      recordCount: plan.targetBefore.recordCount,
      contentSha256: plan.targetBefore.contentSha256,
      revisionSha256: plan.targetBefore.revisionSha256,
      rows: plan.targetBefore.rows,
    },
  };
  return { ...core, snapshotSha256: sha256(stableJson(core)) };
}

export function verifyMigrationSnapshot(snapshot = {}) {
  const { snapshotSha256, ...core } = snapshot || {};
  const actual = sha256(stableJson(core));
  return {
    ok:
      snapshot?.schema === `${APP_STATE_TENANT_MIGRATION_SCHEMA}-snapshot` &&
      /^[a-f0-9]{64}$/.test(String(snapshotSha256 || "")) &&
      actual === snapshotSha256,
    actual,
  };
}
