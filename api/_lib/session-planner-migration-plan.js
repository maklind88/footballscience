const {
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("./session-planner-domain-records.js");
const {
  sessionPlannerScopeKey,
  validateSessionPlannerDomainSnapshot,
} = require("./session-planner-database.js");

const SESSION_PLANNER_MIGRATION_SNAPSHOT_SCHEMA = "footballscience-session-planner-migration-snapshot-v1";
const SESSION_PLANNER_BACKFILL_PLAN_SCHEMA = "footballscience-session-planner-backfill-plan-v1";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TARGETS = new Set(["staging", "production"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : "";
}

function normalizeHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  return HASH_PATTERN.test(hash) ? hash : "";
}

function normalizeRows(rows = {}) {
  return {
    sessions: (Array.isArray(rows.sessions) ? cloneJson(rows.sessions) : [])
      .sort((left, right) => String(left.id || "").localeCompare(String(right.id || ""))),
    blocks: (Array.isArray(rows.blocks) ? cloneJson(rows.blocks) : [])
      .sort((left, right) => String(left.id || "").localeCompare(String(right.id || ""))),
  };
}

function recordProjection(recordType, row = {}) {
  if (recordType === "session") {
    return {
      id: row.id,
      organizationId: row.organizationId,
      teamId: row.teamId,
      sessionDate: row.sessionDate,
      sessionSlot: row.sessionSlot,
      legacySessionId: row.legacySessionId,
      title: row.title,
      theme: row.theme,
      selectedBlockLegacyId: row.selectedBlockLegacyId,
      schemaVersion: row.schemaVersion,
      contentHash: row.contentHash,
    };
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    sessionId: row.sessionId,
    legacyBlockId: row.legacyBlockId,
    sortOrder: row.sortOrder,
    schemaVersion: row.schemaVersion,
    payloadHash: row.payloadHash,
  };
}

function recordProjectionHash(recordType, row) {
  return hashJsonValue(recordProjection(recordType, row));
}

function isArchived(row = {}) {
  return Boolean(normalizeTimestamp(row.archivedAt));
}

function createSessionPlannerMigrationSnapshot(input = {}) {
  const target = String(input.target || "").trim().toLowerCase();
  const createdAt = normalizeTimestamp(input.createdAt);
  const sourceRevision = Number(input.sourceRevision);
  const sourceHash = normalizeHash(input.sourceHash);
  const scopeKey = sessionPlannerScopeKey(input.scope);
  const rows = normalizeRows(input.rows);
  const failures = [];
  if (!TARGETS.has(target)) failures.push("snapshot_target_invalid");
  if (!createdAt) failures.push("snapshot_timestamp_invalid");
  if (!Number.isInteger(sourceRevision) || sourceRevision < 1) failures.push("source_revision_invalid");
  if (!sourceHash) failures.push("source_hash_invalid");
  if (!scopeKey) failures.push("tenant_scope_invalid");
  try {
    validateSessionPlannerDomainSnapshot(rows, input.scope);
  } catch (error) {
    failures.push(error.code || "snapshot_rows_invalid");
  }
  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort() };

  const body = {
    ok: true,
    schema: SESSION_PLANNER_MIGRATION_SNAPSHOT_SCHEMA,
    target,
    createdAt,
    scope: {
      organizationId: String(input.scope.organizationId).trim().toLowerCase(),
      teamId: String(input.scope.teamId).trim().toLowerCase(),
    },
    source: {
      storageKey: "football-session-planner-v3",
      revision: sourceRevision,
      hash: sourceHash,
    },
    counts: { sessions: rows.sessions.length, blocks: rows.blocks.length },
    rows,
  };
  return Object.freeze({
    ...body,
    integrity: Object.freeze({ algorithm: "sha256", contentSha256: hashJsonValue(body) }),
  });
}

function verifySessionPlannerMigrationSnapshot(snapshot = {}) {
  if (snapshot.ok !== true || snapshot.schema !== SESSION_PLANNER_MIGRATION_SNAPSHOT_SCHEMA) {
    return { ok: false, code: "snapshot_schema_invalid" };
  }
  const expectedHash = normalizeHash(snapshot.integrity?.contentSha256);
  if (snapshot.integrity?.algorithm !== "sha256" || !expectedHash) {
    return { ok: false, code: "snapshot_integrity_metadata_invalid" };
  }
  const { integrity, ...body } = snapshot;
  const actualHash = hashJsonValue(body);
  if (actualHash !== expectedHash) return { ok: false, code: "snapshot_hash_mismatch", contentSha256: actualHash };
  if (!Array.isArray(snapshot.rows?.sessions) || !Array.isArray(snapshot.rows?.blocks)) {
    return { ok: false, code: "snapshot_rows_invalid", contentSha256: actualHash };
  }
  try {
    validateSessionPlannerDomainSnapshot(snapshot.rows, snapshot.scope);
  } catch (error) {
    return { ok: false, code: error.code || "snapshot_rows_invalid", contentSha256: actualHash };
  }
  if (
    snapshot.counts?.sessions !== snapshot.rows.sessions.length ||
    snapshot.counts?.blocks !== snapshot.rows.blocks.length
  ) {
    return { ok: false, code: "snapshot_counts_mismatch", contentSha256: actualHash };
  }
  return { ok: true, contentSha256: actualHash };
}

function normalizeTombstones(state = {}) {
  const source = state.blockDeletionTombstones;
  if (!source || typeof source !== "object" || Array.isArray(source)) return new Map();
  const tombstones = new Map();
  Object.entries(source).forEach(([dateValue, blockMap]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !blockMap || typeof blockMap !== "object" || Array.isArray(blockMap)) return;
    Object.entries(blockMap).forEach(([legacyBlockId, timestamp]) => {
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const blockId = String(legacyBlockId || "").trim();
      if (blockId && normalizedTimestamp) tombstones.set(`${dateValue}:${blockId}`, normalizedTimestamp);
    });
  });
  return tombstones;
}

function createMutationAction(recordType, desired, current) {
  const desiredProjectionHash = recordProjectionHash(recordType, desired);
  const currentProjectionHash = current ? recordProjectionHash(recordType, current) : null;
  const expectedRowVersion = current ? Number(current.rowVersion) : null;
  let action = "create";
  if (current) {
    if (isArchived(current)) action = "restore";
    else if (currentProjectionHash !== desiredProjectionHash) action = "update";
    else return null;
  }
  return {
    recordType,
    id: desired.id,
    action,
    expectedRowVersion,
    expectedAppliedRowVersion: action === "create" ? 1 : expectedRowVersion + 1,
    previousProjectionHash: currentProjectionHash,
    desiredProjectionHash,
    expectedAppliedProjectionHash: desiredProjectionHash,
    expectedAppliedArchived: false,
  };
}

function createArchiveAction(block, tombstoneAt) {
  const projectionHash = recordProjectionHash("block", block);
  return {
    recordType: "block",
    id: block.id,
    action: "archive",
    expectedRowVersion: Number(block.rowVersion),
    expectedAppliedRowVersion: Number(block.rowVersion) + 1,
    previousProjectionHash: projectionHash,
    desiredProjectionHash: null,
    expectedAppliedProjectionHash: projectionHash,
    expectedAppliedArchived: true,
    tombstoneAt,
  };
}

function sortActions(actions) {
  const typeOrder = { session: 0, block: 1 };
  return actions.sort((left, right) =>
    typeOrder[left.recordType] - typeOrder[right.recordType] ||
    left.id.localeCompare(right.id) ||
    left.action.localeCompare(right.action)
  );
}

function createSessionPlannerBackfillPlan({ sourceState, baselineSnapshot, generatedAt } = {}) {
  const snapshotCheck = verifySessionPlannerMigrationSnapshot(baselineSnapshot);
  const timestamp = normalizeTimestamp(generatedAt);
  if (!snapshotCheck.ok || !timestamp) {
    return {
      ok: false,
      schema: SESSION_PLANNER_BACKFILL_PLAN_SCHEMA,
      blockers: [snapshotCheck.ok ? "plan_timestamp_invalid" : snapshotCheck.code],
      actions: [],
    };
  }

  let desired;
  try {
    desired = extractSessionPlannerDomainRecords(sourceState, baselineSnapshot.scope);
  } catch {
    return { ok: false, schema: SESSION_PLANNER_BACKFILL_PLAN_SCHEMA, blockers: ["source_state_invalid"], actions: [] };
  }
  const currentSessions = new Map(baselineSnapshot.rows.sessions.map((row) => [row.id, row]));
  const currentBlocks = new Map(baselineSnapshot.rows.blocks.map((row) => [row.id, row]));
  const desiredSessions = new Map(desired.sessions.map((row) => [row.id, row]));
  const desiredBlocks = new Map(desired.blocks.map((row) => [row.id, row]));
  const sessionDates = new Map([
    ...baselineSnapshot.rows.sessions.map((row) => [row.id, row.sessionDate]),
    ...desired.sessions.map((row) => [row.id, row.sessionDate]),
  ]);
  const tombstones = normalizeTombstones(sourceState);
  const actions = [];
  const blockers = [];
  let unchanged = 0;

  desired.sessions.forEach((row) => {
    const action = createMutationAction("session", row, currentSessions.get(row.id));
    if (action) actions.push(action);
    else unchanged += 1;
  });
  desired.blocks.forEach((row) => {
    const dateValue = sessionDates.get(row.sessionId);
    if (tombstones.has(`${dateValue}:${row.legacyBlockId}`)) {
      blockers.push(`block:${row.id}:active_source_has_tombstone`);
    }
    const action = createMutationAction("block", row, currentBlocks.get(row.id));
    if (action) actions.push(action);
    else unchanged += 1;
  });

  currentSessions.forEach((row, id) => {
    if (!desiredSessions.has(id) && !isArchived(row)) blockers.push(`session:${id}:unexplained_active_record`);
  });
  currentBlocks.forEach((row, id) => {
    if (desiredBlocks.has(id) || isArchived(row)) return;
    const dateValue = sessionDates.get(row.sessionId);
    const tombstoneAt = tombstones.get(`${dateValue}:${row.legacyBlockId}`);
    if (tombstoneAt) actions.push(createArchiveAction(row, tombstoneAt));
    else blockers.push(`block:${id}:unexplained_active_record`);
  });

  const body = {
    schema: SESSION_PLANNER_BACKFILL_PLAN_SCHEMA,
    generatedAt: timestamp,
    writeCapability: false,
    applyEnabled: false,
    baselineSnapshotSha256: snapshotCheck.contentSha256,
    scope: cloneJson(baselineSnapshot.scope),
    source: cloneJson(baselineSnapshot.source),
    counts: {
      desiredSessions: desired.sessions.length,
      desiredBlocks: desired.blocks.length,
      actions: actions.length,
      unchanged,
      blockers: blockers.length,
    },
    actions: sortActions(actions),
    blockers: blockers.sort(),
  };
  return Object.freeze({
    ok: blockers.length === 0,
    ...body,
    planSha256: hashJsonValue(body),
  });
}

function verifySessionPlannerBackfillPlan(plan = {}) {
  if (plan.schema !== SESSION_PLANNER_BACKFILL_PLAN_SCHEMA || !normalizeHash(plan.planSha256)) {
    return { ok: false, code: "backfill_plan_schema_invalid" };
  }
  const { ok, planSha256, ...body } = plan;
  const actualHash = hashJsonValue(body);
  if (actualHash !== planSha256) return { ok: false, code: "backfill_plan_hash_mismatch", planSha256: actualHash };
  if (plan.writeCapability !== false || plan.applyEnabled !== false) {
    return { ok: false, code: "backfill_plan_write_capability_invalid", planSha256: actualHash };
  }
  return { ok: true, ready: ok === true, planSha256: actualHash };
}

function createSessionPlannerMigrationSnapshotSummary(snapshot = {}) {
  const verification = verifySessionPlannerMigrationSnapshot(snapshot);
  return {
    ok: verification.ok,
    schema: snapshot.schema || null,
    target: snapshot.target || null,
    createdAt: snapshot.createdAt || null,
    sourceRevision: Number(snapshot.source?.revision) || 0,
    sourceHash: normalizeHash(snapshot.source?.hash) || null,
    counts: snapshot.counts || { sessions: 0, blocks: 0 },
    contentSha256: verification.contentSha256 || null,
    containsCoachingContent: false,
  };
}

module.exports = {
  SESSION_PLANNER_BACKFILL_PLAN_SCHEMA,
  SESSION_PLANNER_MIGRATION_SNAPSHOT_SCHEMA,
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
  createSessionPlannerMigrationSnapshotSummary,
  isArchived,
  recordProjectionHash,
  verifySessionPlannerBackfillPlan,
  verifySessionPlannerMigrationSnapshot,
};
