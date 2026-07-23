const { hashJsonValue } = require("./session-planner-domain-records.js");
const {
  verifySessionPlannerBackfillPlan,
  verifySessionPlannerMigrationSnapshot,
} = require("./session-planner-migration-plan.js");
const {
  verifySessionPlannerMigrationBundle,
} = require("./session-planner-migration-bundle.js");

const SESSION_PLANNER_MIGRATION_RECOVERY_SCHEMA =
  "footballscience-session-planner-migration-recovery-v1";
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  return timestamp && !Number.isNaN(Date.parse(timestamp))
    ? new Date(timestamp).toISOString()
    : "";
}

function sameScope(left = {}, right = {}) {
  return (
    left.organizationId === right.organizationId &&
    left.teamId === right.teamId
  );
}

function sameSource(left = {}, right = {}) {
  return (
    left.storageKey === right.storageKey &&
    left.revision === right.revision &&
    left.hash === right.hash
  );
}

function verifyRecoveryParts({ baselineSnapshot, backfillPlan, initialBundle } = {}) {
  const snapshot = verifySessionPlannerMigrationSnapshot(baselineSnapshot);
  const plan = verifySessionPlannerBackfillPlan(backfillPlan);
  const bundle = verifySessionPlannerMigrationBundle(initialBundle);
  const failures = [];
  if (!snapshot.ok) failures.push("baseline_snapshot:" + snapshot.code);
  if (!plan.ok || !plan.ready) failures.push("backfill_plan:" + (plan.code || "not_ready"));
  if (!bundle.ok) failures.push("initial_bundle:" + bundle.code);
  if (failures.length) return { ok: false, failures };

  if (
    baselineSnapshot.target !== "staging" ||
    backfillPlan.target !== "staging" ||
    initialBundle.target !== "staging"
  ) failures.push("target_not_staging");
  if (
    baselineSnapshot.projectRef !== backfillPlan.projectRef ||
    baselineSnapshot.projectRef !== initialBundle.projectRef
  ) failures.push("project_ref_mismatch");
  if (
    !sameScope(baselineSnapshot.scope, backfillPlan.scope) ||
    !sameScope(baselineSnapshot.scope, initialBundle.scope)
  ) failures.push("tenant_scope_mismatch");
  if (
    !sameSource(baselineSnapshot.source, backfillPlan.source) ||
    !sameSource(baselineSnapshot.source, initialBundle.source)
  ) failures.push("source_checkpoint_mismatch");
  if (
    backfillPlan.baselineSnapshotSha256 !== snapshot.contentSha256 ||
    initialBundle.baselineSnapshotSha256 !== snapshot.contentSha256
  ) failures.push("baseline_snapshot_hash_mismatch");
  if (initialBundle.planSha256 !== plan.planSha256) failures.push("backfill_plan_hash_mismatch");
  if (initialBundle.operation !== "backfill") failures.push("initial_bundle_operation_invalid");
  return failures.length
    ? { ok: false, failures }
    : {
        ok: true,
        snapshotSha256: snapshot.contentSha256,
        planSha256: plan.planSha256,
        bundleSha256: bundle.contentSha256,
      };
}

function createSessionPlannerMigrationRecoveryPackage(input = {}) {
  const parts = verifyRecoveryParts(input);
  const createdAt = normalizeTimestamp(input.createdAt);
  if (!parts.ok || !createdAt) {
    return {
      ok: false,
      schema: SESSION_PLANNER_MIGRATION_RECOVERY_SCHEMA,
      failures: [...(parts.failures || []), ...(!createdAt ? ["created_at_invalid"] : [])],
    };
  }
  const body = {
    ok: true,
    schema: SESSION_PLANNER_MIGRATION_RECOVERY_SCHEMA,
    createdAt,
    target: "staging",
    projectRef: input.baselineSnapshot.projectRef,
    scope: cloneJson(input.baselineSnapshot.scope),
    source: cloneJson(input.baselineSnapshot.source),
    baselineSnapshot: cloneJson(input.baselineSnapshot),
    backfillPlan: cloneJson(input.backfillPlan),
    initialBundle: cloneJson(input.initialBundle),
    containsCoachingContent: true,
  };
  return Object.freeze({
    ...body,
    integrity: Object.freeze({ algorithm: "sha256", contentSha256: hashJsonValue(body) }),
  });
}

function verifySessionPlannerMigrationRecoveryPackage(recoveryPackage = {}) {
  if (
    recoveryPackage.ok !== true ||
    recoveryPackage.schema !== SESSION_PLANNER_MIGRATION_RECOVERY_SCHEMA ||
    recoveryPackage.containsCoachingContent !== true
  ) return { ok: false, code: "recovery_package_schema_invalid" };
  const expectedHash = String(recoveryPackage.integrity?.contentSha256 || "").trim();
  if (recoveryPackage.integrity?.algorithm !== "sha256" || !HASH_PATTERN.test(expectedHash)) {
    return { ok: false, code: "recovery_package_integrity_invalid" };
  }
  const { integrity, ...body } = recoveryPackage;
  const actualHash = hashJsonValue(body);
  if (actualHash !== expectedHash) {
    return { ok: false, code: "recovery_package_hash_mismatch", contentSha256: actualHash };
  }
  if (!normalizeTimestamp(recoveryPackage.createdAt)) {
    return { ok: false, code: "recovery_package_timestamp_invalid", contentSha256: actualHash };
  }
  const parts = verifyRecoveryParts(recoveryPackage);
  if (!parts.ok) {
    return {
      ok: false,
      code: "recovery_package_parts_invalid",
      failures: parts.failures,
      contentSha256: actualHash,
    };
  }
  if (
    recoveryPackage.target !== "staging" ||
    recoveryPackage.projectRef !== recoveryPackage.baselineSnapshot.projectRef ||
    !sameScope(recoveryPackage.scope, recoveryPackage.baselineSnapshot.scope) ||
    !sameSource(recoveryPackage.source, recoveryPackage.baselineSnapshot.source)
  ) {
    return { ok: false, code: "recovery_package_context_invalid", contentSha256: actualHash };
  }
  return { ok: true, contentSha256: actualHash, ...parts };
}

function createSessionPlannerMigrationRecoverySummary(recoveryPackage = {}) {
  const verification = verifySessionPlannerMigrationRecoveryPackage(recoveryPackage);
  return {
    ok: verification.ok,
    schema: recoveryPackage.schema || null,
    target: recoveryPackage.target || null,
    projectRef: recoveryPackage.projectRef || null,
    createdAt: recoveryPackage.createdAt || null,
    contentSha256: verification.contentSha256 || null,
    baselineSnapshotSha256: verification.snapshotSha256 || null,
    backfillPlanSha256: verification.planSha256 || null,
    initialBundleSha256: verification.bundleSha256 || null,
    sourceRevision: Number(recoveryPackage.source?.revision) || 0,
    commandCount: Number(recoveryPackage.initialBundle?.commandCount) || 0,
    containsCoachingContent: false,
  };
}

module.exports = {
  SESSION_PLANNER_MIGRATION_RECOVERY_SCHEMA,
  createSessionPlannerMigrationRecoveryPackage,
  createSessionPlannerMigrationRecoverySummary,
  verifySessionPlannerMigrationRecoveryPackage,
};
