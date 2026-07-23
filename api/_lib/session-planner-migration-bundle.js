const {
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("./session-planner-domain-records.js");
const {
  isArchived,
  recordProjectionHash,
  verifySessionPlannerBackfillPlan,
  verifySessionPlannerMigrationSnapshot,
} = require("./session-planner-migration-plan.js");
const { verifySessionPlannerRollbackPlan } = require("./session-planner-rollback.js");
const { sessionPlannerScopeKey } = require("./session-planner-database.js");

const SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA =
  "footballscience-session-planner-migration-bundle-v1";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGETS = new Set(["staging", "production"]);
const OPERATIONS = new Set(["backfill", "rollback"]);
const BACKFILL_ACTIONS = new Set(["create", "update", "restore", "archive"]);
const ROLLBACK_ACTIONS = new Set(["restore-existing", "archive-created"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function normalizeTimestamp(value) {
  const timestamp = normalizeText(value, 80);
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

function rowsByType(snapshot = {}) {
  return {
    session: new Map((snapshot.rows?.sessions || []).map((row) => [row.id, row])),
    block: new Map((snapshot.rows?.blocks || []).map((row) => [row.id, row])),
  };
}

function extractedRowsByType(sourceState, scope) {
  const records = extractSessionPlannerDomainRecords(sourceState, scope);
  return {
    session: new Map(records.sessions.map((row) => [row.id, row])),
    block: new Map(records.blocks.map((row) => [row.id, row])),
  };
}

function validateCommonInput({ snapshot, plan, actorId, requestId, createdAt }) {
  const snapshotCheck = verifySessionPlannerMigrationSnapshot(snapshot);
  const failures = [];
  if (!snapshotCheck.ok) failures.push("snapshot:" + snapshotCheck.code);
  if (!plan?.planSha256 || !HASH_PATTERN.test(plan.planSha256)) {
    failures.push("plan_hash_invalid");
  }
  if (!UUID_PATTERN.test(normalizeText(actorId, 120))) failures.push("actor_id_invalid");
  if (!normalizeText(requestId, 180)) failures.push("request_id_invalid");
  if (!normalizeTimestamp(createdAt)) failures.push("bundle_timestamp_invalid");
  return { failures, snapshotCheck };
}

function createBundle(body) {
  return Object.freeze({
    ok: true,
    ...body,
    integrity: Object.freeze({
      algorithm: "sha256",
      contentSha256: hashJsonValue({ ok: true, ...body }),
    }),
  });
}

function invalidBundle(operation, failures) {
  return {
    ok: false,
    schema: SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA,
    operation,
    executionEnabled: false,
    failures: [...new Set(failures)].sort(),
  };
}

function backfillCommand(action, desiredRows, baselineRows, scope) {
  const current = baselineRows[action.recordType]?.get(action.id);
  if (action.action === "archive") {
    if (
      !current ||
      recordProjectionHash(action.recordType, current) !== action.previousProjectionHash
    ) {
      return { failure: action.recordType + ":" + action.id + ":archive_baseline_mismatch" };
    }
    return {
      command: {
        recordType: action.recordType,
        id: action.id,
        action: action.action,
        expectedRowVersion: action.expectedRowVersion,
        expectedAppliedRowVersion: action.expectedAppliedRowVersion,
        expectedCurrentProjectionHash: action.previousProjectionHash,
        expectedAppliedProjectionHash: action.expectedAppliedProjectionHash,
        expectedAppliedArchived: true,
        tombstoneAt: normalizeTimestamp(action.tombstoneAt),
        record: null,
      },
    };
  }

  const desired = desiredRows[action.recordType]?.get(action.id);
  if (!desired || !sameScope(desired, scope)) {
    return { failure: action.recordType + ":" + action.id + ":desired_record_missing" };
  }
  if (recordProjectionHash(action.recordType, desired) !== action.expectedAppliedProjectionHash) {
    return { failure: action.recordType + ":" + action.id + ":desired_projection_mismatch" };
  }
  return {
    command: {
      recordType: action.recordType,
      id: action.id,
      action: action.action,
      expectedRowVersion: action.expectedRowVersion,
      expectedAppliedRowVersion: action.expectedAppliedRowVersion,
      expectedCurrentProjectionHash: action.previousProjectionHash,
      expectedAppliedProjectionHash: action.expectedAppliedProjectionHash,
      expectedAppliedArchived: false,
      tombstoneAt: null,
      record: cloneJson(desired),
    },
  };
}

function createSessionPlannerBackfillBundle(input = {}) {
  const { sourceState, baselineSnapshot, backfillPlan } = input;
  const common = validateCommonInput({
    snapshot: baselineSnapshot,
    plan: backfillPlan,
    actorId: input.actorId,
    requestId: input.requestId,
    createdAt: input.createdAt,
  });
  const planCheck = verifySessionPlannerBackfillPlan(backfillPlan);
  const failures = [...common.failures];
  if (!planCheck.ok) failures.push("plan:" + planCheck.code);
  else if (!planCheck.ready) failures.push("plan:not_ready");
  if (
    common.snapshotCheck.ok &&
    backfillPlan?.baselineSnapshotSha256 !== common.snapshotCheck.contentSha256
  ) {
    failures.push("plan_snapshot_mismatch");
  }
  if (failures.length) return invalidBundle("backfill", failures);

  let desiredRows;
  try {
    desiredRows = extractedRowsByType(sourceState, baselineSnapshot.scope);
  } catch {
    return invalidBundle("backfill", ["source_state_invalid"]);
  }
  const baselineRows = rowsByType(baselineSnapshot);
  const commands = [];
  for (const action of backfillPlan.actions || []) {
    const result = backfillCommand(action, desiredRows, baselineRows, baselineSnapshot.scope);
    if (result.failure) failures.push(result.failure);
    else commands.push(result.command);
  }
  if (commands.length !== backfillPlan.counts.actions) {
    failures.push("backfill_action_count_mismatch");
  }
  if (failures.length) return invalidBundle("backfill", failures);

  return createBundle({
    schema: SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA,
    operation: "backfill",
    createdAt: normalizeTimestamp(input.createdAt),
    executionEnabled: false,
    transactionRequired: true,
    target: baselineSnapshot.target,
    projectRef: baselineSnapshot.projectRef,
    scope: cloneJson(baselineSnapshot.scope),
    source: cloneJson(baselineSnapshot.source),
    actorId: normalizeText(input.actorId, 120).toLowerCase(),
    requestId: normalizeText(input.requestId, 180),
    baselineSnapshotSha256: common.snapshotCheck.contentSha256,
    currentSnapshotSha256: null,
    planSha256: planCheck.planSha256,
    commandCount: commands.length,
    commands,
    containsCoachingContent: true,
  });
}

function rollbackCommand(action, baselineRows, currentRows, scope) {
  const baseline = baselineRows[action.recordType]?.get(action.id);
  const current = currentRows[action.recordType]?.get(action.id);
  if (
    !current ||
    !sameScope(current, scope) ||
    Number(current.rowVersion) !== action.expectedRowVersion ||
    recordProjectionHash(action.recordType, current) !== action.expectedProjectionHash
  ) {
    return { failure: action.recordType + ":" + action.id + ":rollback_current_mismatch" };
  }
  if (action.action === "archive-created") {
    if (baseline) {
      return { failure: action.recordType + ":" + action.id + ":rollback_created_row_in_baseline" };
    }
    return {
      command: {
        recordType: action.recordType,
        id: action.id,
        action: action.action,
        expectedRowVersion: action.expectedRowVersion,
        expectedAppliedRowVersion: action.expectedRowVersion + 1,
        expectedCurrentProjectionHash: action.expectedProjectionHash,
        expectedAppliedProjectionHash: action.expectedProjectionHash,
        expectedAppliedArchived: true,
        record: null,
      },
    };
  }
  if (!baseline || !sameScope(baseline, scope)) {
    return { failure: action.recordType + ":" + action.id + ":rollback_baseline_missing" };
  }
  return {
    command: {
      recordType: action.recordType,
      id: action.id,
      action: action.action,
      expectedRowVersion: action.expectedRowVersion,
      expectedAppliedRowVersion: action.expectedRowVersion + 1,
      expectedCurrentProjectionHash: action.expectedProjectionHash,
      expectedAppliedProjectionHash: recordProjectionHash(action.recordType, baseline),
      expectedAppliedArchived: isArchived(baseline),
      record: cloneJson(baseline),
    },
  };
}

function createSessionPlannerRollbackBundle(input = {}) {
  const { baselineSnapshot, currentSnapshot, rollbackPlan } = input;
  const common = validateCommonInput({
    snapshot: baselineSnapshot,
    plan: rollbackPlan,
    actorId: input.actorId,
    requestId: input.requestId,
    createdAt: input.createdAt,
  });
  const currentCheck = verifySessionPlannerMigrationSnapshot(currentSnapshot);
  const planCheck = verifySessionPlannerRollbackPlan(rollbackPlan);
  const failures = [...common.failures];
  if (!currentCheck.ok) failures.push("current_snapshot:" + currentCheck.code);
  if (!planCheck.ok) failures.push("plan:" + planCheck.code);
  else if (!planCheck.ready) failures.push("plan:not_ready");
  if (
    common.snapshotCheck.ok &&
    rollbackPlan?.baselineSnapshotSha256 !== common.snapshotCheck.contentSha256
  ) {
    failures.push("rollback_baseline_snapshot_mismatch");
  }
  if (
    currentCheck.ok &&
    rollbackPlan?.currentSnapshotSha256 !== currentCheck.contentSha256
  ) {
    failures.push("rollback_current_snapshot_mismatch");
  }
  if (
    common.snapshotCheck.ok &&
    currentCheck.ok &&
    (
      baselineSnapshot.target !== currentSnapshot.target ||
      baselineSnapshot.projectRef !== currentSnapshot.projectRef ||
      !sameScope(baselineSnapshot.scope, currentSnapshot.scope)
    )
  ) {
    failures.push("rollback_environment_mismatch");
  }
  if (failures.length) return invalidBundle("rollback", failures);

  const baselineRows = rowsByType(baselineSnapshot);
  const currentRows = rowsByType(currentSnapshot);
  const commands = [];
  for (const action of rollbackPlan.actions || []) {
    const result = rollbackCommand(action, baselineRows, currentRows, baselineSnapshot.scope);
    if (result.failure) failures.push(result.failure);
    else commands.push(result.command);
  }
  if (commands.length !== rollbackPlan.counts.actions) {
    failures.push("rollback_action_count_mismatch");
  }
  if (failures.length) return invalidBundle("rollback", failures);

  return createBundle({
    schema: SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA,
    operation: "rollback",
    createdAt: normalizeTimestamp(input.createdAt),
    executionEnabled: false,
    transactionRequired: true,
    target: baselineSnapshot.target,
    projectRef: baselineSnapshot.projectRef,
    scope: cloneJson(baselineSnapshot.scope),
    source: cloneJson(baselineSnapshot.source),
    actorId: normalizeText(input.actorId, 120).toLowerCase(),
    requestId: normalizeText(input.requestId, 180),
    baselineSnapshotSha256: common.snapshotCheck.contentSha256,
    currentSnapshotSha256: currentCheck.contentSha256,
    planSha256: planCheck.planSha256,
    commandCount: commands.length,
    commands,
    containsCoachingContent: true,
  });
}

function verifySessionPlannerMigrationBundle(bundle = {}) {
  if (
    bundle.ok !== true ||
    bundle.schema !== SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA ||
    !OPERATIONS.has(bundle.operation)
  ) {
    return { ok: false, code: "migration_bundle_schema_invalid" };
  }
  const expectedHash = normalizeText(bundle.integrity?.contentSha256, 64);
  if (bundle.integrity?.algorithm !== "sha256" || !HASH_PATTERN.test(expectedHash)) {
    return { ok: false, code: "migration_bundle_integrity_invalid" };
  }
  const { integrity, ...body } = bundle;
  const actualHash = hashJsonValue(body);
  if (actualHash !== expectedHash) {
    return { ok: false, code: "migration_bundle_hash_mismatch", contentSha256: actualHash };
  }
  if (
    bundle.executionEnabled !== false ||
    bundle.transactionRequired !== true ||
    bundle.containsCoachingContent !== true
  ) {
    return { ok: false, code: "migration_bundle_execution_contract_invalid", contentSha256: actualHash };
  }
  if (
    !TARGETS.has(bundle.target) ||
    !PROJECT_REF_PATTERN.test(String(bundle.projectRef || "")) ||
    !sessionPlannerScopeKey(bundle.scope) ||
    !UUID_PATTERN.test(String(bundle.actorId || "")) ||
    !normalizeText(bundle.requestId, 180) ||
    !normalizeTimestamp(bundle.createdAt)
  ) {
    return { ok: false, code: "migration_bundle_context_invalid", contentSha256: actualHash };
  }
  if (
    !Array.isArray(bundle.commands) ||
    bundle.commandCount !== bundle.commands.length ||
    !HASH_PATTERN.test(String(bundle.planSha256 || "")) ||
    !HASH_PATTERN.test(String(bundle.baselineSnapshotSha256 || "")) ||
    bundle.source?.storageKey !== "football-session-planner-v3" ||
    !Number.isInteger(bundle.source?.revision) ||
    bundle.source.revision < 1 ||
    !HASH_PATTERN.test(String(bundle.source?.hash || "")) ||
    (
      bundle.operation === "backfill" &&
      bundle.currentSnapshotSha256 !== null
    ) ||
    (
      bundle.operation === "rollback" &&
      !HASH_PATTERN.test(String(bundle.currentSnapshotSha256 || ""))
    )
  ) {
    return { ok: false, code: "migration_bundle_commands_invalid", contentSha256: actualHash };
  }
  const allowedActions = bundle.operation === "backfill"
    ? BACKFILL_ACTIONS
    : ROLLBACK_ACTIONS;
  const seenCommands = new Set();
  for (const command of bundle.commands) {
    const commandKey = command.recordType + ":" + command.id;
    const isCreate = bundle.operation === "backfill" && command.action === "create";
    const requiresRecord = (
      (bundle.operation === "backfill" && command.action !== "archive") ||
      (bundle.operation === "rollback" && command.action === "restore-existing")
    );
    const expectedArchived = (
      command.action === "archive" ||
      command.action === "archive-created" ||
      (
        command.action === "restore-existing" &&
        isArchived(command.record)
      )
    );
    if (
      !["session", "block"].includes(command.recordType) ||
      !UUID_PATTERN.test(String(command.id || "")) ||
      !allowedActions.has(command.action) ||
      seenCommands.has(commandKey) ||
      !Number.isInteger(command.expectedAppliedRowVersion) ||
      command.expectedAppliedRowVersion < 1 ||
      (
        isCreate
          ? (
              command.expectedRowVersion !== null ||
              command.expectedAppliedRowVersion !== 1 ||
              command.expectedCurrentProjectionHash !== null
            )
          : (
              !Number.isInteger(command.expectedRowVersion) ||
              command.expectedRowVersion < 1 ||
              command.expectedAppliedRowVersion !== command.expectedRowVersion + 1 ||
              !HASH_PATTERN.test(String(command.expectedCurrentProjectionHash || ""))
            )
      ) ||
      command.expectedAppliedArchived !== expectedArchived ||
      !HASH_PATTERN.test(String(command.expectedAppliedProjectionHash || ""))
    ) {
      return { ok: false, code: "migration_bundle_command_invalid", contentSha256: actualHash };
    }
    seenCommands.add(commandKey);
    if (requiresRecord !== Boolean(command.record)) {
      return { ok: false, code: "migration_bundle_record_invalid", contentSha256: actualHash };
    }
    if (
      command.action === "archive" &&
      !normalizeTimestamp(command.tombstoneAt)
    ) {
      return { ok: false, code: "migration_bundle_archive_invalid", contentSha256: actualHash };
    }
    if (
      command.record &&
      (
        command.record.id !== command.id ||
        !sameScope(command.record, bundle.scope) ||
        recordProjectionHash(command.recordType, command.record) !==
          command.expectedAppliedProjectionHash
      )
    ) {
      return { ok: false, code: "migration_bundle_record_invalid", contentSha256: actualHash };
    }
  }
  return { ok: true, contentSha256: actualHash };
}

function createSessionPlannerMigrationBundleSummary(bundle = {}) {
  const verification = verifySessionPlannerMigrationBundle(bundle);
  const actionCounts = {};
  for (const command of bundle.commands || []) {
    const key = command.recordType + ":" + command.action;
    actionCounts[key] = (actionCounts[key] || 0) + 1;
  }
  return {
    ok: verification.ok,
    schema: bundle.schema || null,
    operation: bundle.operation || null,
    target: bundle.target || null,
    projectRef: bundle.projectRef || null,
    createdAt: bundle.createdAt || null,
    baselineSnapshotSha256: bundle.baselineSnapshotSha256 || null,
    currentSnapshotSha256: bundle.currentSnapshotSha256 || null,
    planSha256: bundle.planSha256 || null,
    contentSha256: verification.contentSha256 || null,
    commandCount: Number(bundle.commandCount) || 0,
    actionCounts,
    containsCoachingContent: false,
  };
}

module.exports = {
  SESSION_PLANNER_MIGRATION_BUNDLE_SCHEMA,
  createSessionPlannerBackfillBundle,
  createSessionPlannerMigrationBundleSummary,
  createSessionPlannerRollbackBundle,
  verifySessionPlannerMigrationBundle,
};
