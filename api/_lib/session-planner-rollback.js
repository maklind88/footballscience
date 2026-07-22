const { hashJsonValue } = require("./session-planner-domain-records.js");
const {
  createSessionPlannerMigrationSnapshot,
  isArchived,
  recordProjectionHash,
  verifySessionPlannerBackfillPlan,
  verifySessionPlannerMigrationSnapshot,
} = require("./session-planner-migration-plan.js");

const SESSION_PLANNER_ROLLBACK_PLAN_SCHEMA = "footballscience-session-planner-rollback-plan-v1";
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : "";
}

function rowsByType(snapshot) {
  return {
    session: new Map(snapshot.rows.sessions.map((row) => [row.id, row])),
    block: new Map(snapshot.rows.blocks.map((row) => [row.id, row])),
  };
}

function sameScope(left = {}, right = {}) {
  return left.organizationId === right.organizationId && left.teamId === right.teamId;
}

function appliedRowMatches(action, row) {
  return Boolean(
    row &&
    Number(row.rowVersion) === action.expectedAppliedRowVersion &&
    recordProjectionHash(action.recordType, row) === action.expectedAppliedProjectionHash &&
    isArchived(row) === action.expectedAppliedArchived
  );
}

function createSessionPlannerRollbackPlan({ baselineSnapshot, currentSnapshot, backfillPlan, generatedAt } = {}) {
  const baselineCheck = verifySessionPlannerMigrationSnapshot(baselineSnapshot);
  const currentCheck = verifySessionPlannerMigrationSnapshot(currentSnapshot);
  const backfillCheck = verifySessionPlannerBackfillPlan(backfillPlan);
  const timestamp = normalizeTimestamp(generatedAt);
  const initialBlockers = [];
  if (!baselineCheck.ok) initialBlockers.push(`baseline:${baselineCheck.code}`);
  if (!currentCheck.ok) initialBlockers.push(`current:${currentCheck.code}`);
  if (!backfillCheck.ok) initialBlockers.push(`backfill:${backfillCheck.code}`);
  else if (!backfillCheck.ready) initialBlockers.push("backfill:backfill_plan_not_ready");
  if (!timestamp) initialBlockers.push("rollback_timestamp_invalid");
  if (initialBlockers.length) {
    return { ok: false, schema: SESSION_PLANNER_ROLLBACK_PLAN_SCHEMA, blockers: initialBlockers, actions: [] };
  }

  const blockers = [];
  if (!sameScope(baselineSnapshot.scope, currentSnapshot.scope) || !sameScope(baselineSnapshot.scope, backfillPlan.scope)) {
    blockers.push("tenant_scope_mismatch");
  }
  if (baselineCheck.contentSha256 !== backfillPlan.baselineSnapshotSha256) {
    blockers.push("backfill_baseline_snapshot_mismatch");
  }
  if (baselineSnapshot.target !== currentSnapshot.target) blockers.push("snapshot_target_mismatch");
  if (
    baselineSnapshot.source.revision !== currentSnapshot.source.revision ||
    baselineSnapshot.source.hash !== currentSnapshot.source.hash
  ) {
    blockers.push("source_checkpoint_mismatch");
  }

  const baselineRows = rowsByType(baselineSnapshot);
  const currentRows = rowsByType(currentSnapshot);
  const backfillCreated = { session: new Set(), block: new Set() };
  const actions = [];

  backfillPlan.actions.forEach((action) => {
    if (!baselineRows[action.recordType] || !currentRows[action.recordType]) {
      blockers.push(`${action.recordType}:${action.id}:record_type_invalid`);
      return;
    }
    const before = baselineRows[action.recordType].get(action.id);
    const current = currentRows[action.recordType].get(action.id);
    if (!appliedRowMatches(action, current)) {
      blockers.push(`${action.recordType}:${action.id}:post_backfill_drift`);
      return;
    }
    if (action.action === "create") {
      if (before) {
        blockers.push(`${action.recordType}:${action.id}:create_row_existed_in_baseline`);
        return;
      }
      backfillCreated[action.recordType].add(action.id);
      actions.push({
        recordType: action.recordType,
        id: action.id,
        action: "archive-created",
        expectedRowVersion: Number(current.rowVersion),
        expectedProjectionHash: action.expectedAppliedProjectionHash,
      });
      return;
    }
    if (!before) {
      blockers.push(`${action.recordType}:${action.id}:baseline_row_missing`);
      return;
    }
    actions.push({
      recordType: action.recordType,
      id: action.id,
      action: "restore-existing",
      expectedRowVersion: Number(current.rowVersion),
      expectedProjectionHash: action.expectedAppliedProjectionHash,
      baselineProjectionHash: recordProjectionHash(action.recordType, before),
      baselineArchived: isArchived(before),
    });
  });

  for (const recordType of ["session", "block"]) {
    baselineRows[recordType].forEach((row, id) => {
      if (!currentRows[recordType].has(id)) blockers.push(`${recordType}:${id}:current_row_missing`);
    });
    currentRows[recordType].forEach((row, id) => {
      if (!baselineRows[recordType].has(id) && !backfillCreated[recordType].has(id)) {
        blockers.push(`${recordType}:${id}:unknown_post_snapshot_row`);
      }
    });
  }

  actions.sort((left, right) =>
    (left.recordType === right.recordType ? 0 : left.recordType === "block" ? -1 : 1) || left.id.localeCompare(right.id)
  );
  const body = {
    schema: SESSION_PLANNER_ROLLBACK_PLAN_SCHEMA,
    generatedAt: timestamp,
    writeCapability: false,
    applyEnabled: false,
    baselineSnapshotSha256: baselineCheck.contentSha256,
    currentSnapshotSha256: currentCheck.contentSha256,
    backfillPlanSha256: backfillCheck.planSha256,
    scope: cloneJson(baselineSnapshot.scope),
    source: cloneJson(baselineSnapshot.source),
    counts: { actions: actions.length, blockers: blockers.length },
    actions,
    blockers: [...new Set(blockers)].sort(),
  };
  return Object.freeze({
    ok: body.blockers.length === 0,
    ...body,
    planSha256: hashJsonValue(body),
  });
}

function verifySessionPlannerRollbackPlan(plan = {}) {
  if (plan.schema !== SESSION_PLANNER_ROLLBACK_PLAN_SCHEMA || !HASH_PATTERN.test(String(plan.planSha256 || ""))) {
    return { ok: false, code: "rollback_plan_schema_invalid" };
  }
  const { ok, planSha256, ...body } = plan;
  const actualHash = hashJsonValue(body);
  if (actualHash !== planSha256) return { ok: false, code: "rollback_plan_hash_mismatch", planSha256: actualHash };
  if (plan.writeCapability !== false || plan.applyEnabled !== false) {
    return { ok: false, code: "rollback_plan_write_capability_invalid", planSha256: actualHash };
  }
  return { ok: true, ready: ok === true, planSha256: actualHash };
}

function verifySessionPlannerRollbackProjection({ baselineSnapshot, currentSnapshot, rollbackPlan } = {}) {
  const baselineCheck = verifySessionPlannerMigrationSnapshot(baselineSnapshot);
  const currentCheck = verifySessionPlannerMigrationSnapshot(currentSnapshot);
  const rollbackCheck = verifySessionPlannerRollbackPlan(rollbackPlan);
  if (!baselineCheck.ok || !currentCheck.ok || !rollbackCheck.ok || rollbackPlan.ok !== true) {
    return { ok: false, code: "rollback_projection_inputs_invalid" };
  }
  if (rollbackPlan.baselineSnapshotSha256 !== baselineCheck.contentSha256) {
    return { ok: false, code: "rollback_projection_baseline_snapshot_mismatch" };
  }
  if (rollbackPlan.currentSnapshotSha256 !== currentCheck.contentSha256) {
    return { ok: false, code: "rollback_projection_current_snapshot_mismatch" };
  }

  const baselineRows = rowsByType(baselineSnapshot);
  const projectedRows = rowsByType({ rows: cloneJson(currentSnapshot.rows) });
  const failures = [];
  rollbackPlan.actions.forEach((action) => {
    const current = projectedRows[action.recordType].get(action.id);
    if (!current || Number(current.rowVersion) !== action.expectedRowVersion) {
      failures.push(`${action.recordType}:${action.id}:rollback_revision_mismatch`);
      return;
    }
    if (action.action === "archive-created") {
      current.archivedAt = rollbackPlan.generatedAt;
      current.rowVersion += 1;
      return;
    }
    const baseline = baselineRows[action.recordType].get(action.id);
    if (!baseline) {
      failures.push(`${action.recordType}:${action.id}:rollback_baseline_missing`);
      return;
    }
    projectedRows[action.recordType].set(action.id, {
      ...cloneJson(baseline),
      rowVersion: current.rowVersion + 1,
    });
  });

  for (const recordType of ["session", "block"]) {
    rollbackPlan.actions
      .filter((action) => action.recordType === recordType)
      .forEach((action) => {
        const projected = projectedRows[recordType].get(action.id);
        if (action.action === "archive-created") {
          if (!isArchived(projected)) failures.push(`${recordType}:${action.id}:created_row_not_archived`);
          return;
        }
        const baseline = baselineRows[recordType].get(action.id);
        if (
          recordProjectionHash(recordType, projected) !== recordProjectionHash(recordType, baseline) ||
          isArchived(projected) !== isArchived(baseline)
        ) {
          failures.push(`${recordType}:${action.id}:baseline_not_restored`);
        }
      });
  }

  const projectedSnapshot = createSessionPlannerMigrationSnapshot({
    target: currentSnapshot.target,
    createdAt: rollbackPlan.generatedAt,
    scope: currentSnapshot.scope,
    sourceRevision: currentSnapshot.source.revision,
    sourceHash: currentSnapshot.source.hash,
    rows: {
      sessions: [...projectedRows.session.values()],
      blocks: [...projectedRows.block.values()],
    },
  });
  if (!projectedSnapshot.ok) failures.push("projected_snapshot_invalid");
  return Object.freeze({
    ok: failures.length === 0,
    failures: failures.sort(),
    actionCount: rollbackPlan.actions.length,
    projectedSnapshotSha256: projectedSnapshot.integrity?.contentSha256 || null,
    containsCoachingContent: false,
  });
}

function createSessionPlannerRollbackSummary(plan = {}) {
  const verification = verifySessionPlannerRollbackPlan(plan);
  return {
    ok: verification.ok && plan.ok === true,
    schema: plan.schema || null,
    generatedAt: plan.generatedAt || null,
    planSha256: verification.planSha256 || null,
    actionCount: Array.isArray(plan.actions) ? plan.actions.length : 0,
    blockerCount: Array.isArray(plan.blockers) ? plan.blockers.length : 0,
    containsCoachingContent: false,
  };
}

module.exports = {
  SESSION_PLANNER_ROLLBACK_PLAN_SCHEMA,
  createSessionPlannerRollbackPlan,
  createSessionPlannerRollbackSummary,
  verifySessionPlannerRollbackPlan,
  verifySessionPlannerRollbackProjection,
};
