import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  deterministicUuid,
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("../api/_lib/session-planner-domain-records.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
  createSessionPlannerMigrationSnapshotSummary,
  verifySessionPlannerBackfillPlan,
  verifySessionPlannerMigrationSnapshot,
} = require("../api/_lib/session-planner-migration-plan.js");
const {
  createSessionPlannerRollbackPlan,
  createSessionPlannerRollbackSummary,
  verifySessionPlannerRollbackPlan,
  verifySessionPlannerRollbackProjection,
} = require("../api/_lib/session-planner-rollback.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const sourceHash = "a".repeat(64);
const baselineAt = "2026-07-22T20:00:00.000Z";
const planAt = "2026-07-22T20:05:00.000Z";
const currentAt = "2026-07-22T20:10:00.000Z";
const rollbackAt = "2026-07-22T20:15:00.000Z";

function createSourceState() {
  return {
    selectedDate: "2026-07-22",
    blockDeletionTombstones: {
      "2026-07-22": { "deleted-block": "2026-07-22T19:55:00.000Z" },
    },
    sessions: {
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Training",
        theme: "Pressing",
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Possession", minutes: 20 },
          { id: "block-2", title: "Finishing", minutes: 15 },
        ],
      },
    },
  };
}

function withRevision(row, rowVersion, extra = {}) {
  return { ...structuredClone(row), rowVersion, archivedAt: null, ...extra };
}

function createFixture() {
  const sourceState = createSourceState();
  const desired = extractSessionPlannerDomainRecords(sourceState, { organizationId, teamId });
  const desiredSession = desired.sessions[0];
  const blockOne = desired.blocks.find((row) => row.legacyBlockId === "block-1");
  const blockTwo = desired.blocks.find((row) => row.legacyBlockId === "block-2");
  const oldContent = { ...structuredClone(desiredSession.content), title: "Old training" };
  const baselineSession = withRevision({
    ...desiredSession,
    title: "Old training",
    content: oldContent,
    contentHash: hashJsonValue(oldContent),
  }, 3);
  const deletedPayload = { id: "deleted-block", title: "Deleted exercise", minutes: 10 };
  const deletedBlock = withRevision({
    id: deterministicUuid("session-planner-block", teamId, desiredSession.id, "deleted-block"),
    organizationId,
    teamId,
    sessionId: desiredSession.id,
    legacyBlockId: "deleted-block",
    sortOrder: 2,
    schemaVersion: 1,
    payload: deletedPayload,
    payloadHash: hashJsonValue(deletedPayload),
  }, 1);
  const baselineSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    createdAt: baselineAt,
    scope: { organizationId, teamId },
    sourceRevision: 300,
    sourceHash,
    rows: {
      sessions: [baselineSession],
      blocks: [withRevision(blockOne, 2), deletedBlock],
    },
  });
  const backfillPlan = createSessionPlannerBackfillPlan({ sourceState, baselineSnapshot, generatedAt: planAt });
  const currentSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    createdAt: currentAt,
    scope: { organizationId, teamId },
    sourceRevision: 300,
    sourceHash,
    rows: {
      sessions: [withRevision(desiredSession, 4)],
      blocks: [
        withRevision(blockOne, 2),
        withRevision(blockTwo, 1),
        withRevision(deletedBlock, 2, {
          archivedAt: "2026-07-22T20:06:00.000Z",
        }),
      ],
    },
  });
  return {
    sourceState,
    desired,
    baselineSnapshot,
    backfillPlan,
    currentSnapshot,
  };
}

test("Session Planner migration snapshot is private, deterministic and integrity checked", () => {
  const fixture = createFixture();
  const verification = verifySessionPlannerMigrationSnapshot(fixture.baselineSnapshot);
  const summary = createSessionPlannerMigrationSnapshotSummary(fixture.baselineSnapshot);

  expect(verification.ok).toBe(true);
  expect(summary).toMatchObject({
    ok: true,
    target: "staging",
    sourceRevision: 300,
    counts: { sessions: 1, blocks: 2 },
    containsCoachingContent: false,
  });
  expect(JSON.stringify(summary)).not.toContain("Old training");

  const tampered = structuredClone(fixture.baselineSnapshot);
  tampered.rows.sessions[0].title = "Tampered";
  expect(verifySessionPlannerMigrationSnapshot(tampered)).toMatchObject({
    ok: false,
    code: "snapshot_hash_mismatch",
  });
});

test("Session Planner backfill plan is idempotent, content-free and revision guarded", () => {
  const fixture = createFixture();
  const plan = fixture.backfillPlan;

  expect(plan.ok).toBe(true);
  expect(plan).toMatchObject({
    writeCapability: false,
    applyEnabled: false,
    counts: { desiredSessions: 1, desiredBlocks: 2, actions: 3, unchanged: 1, blockers: 0 },
  });
  expect(plan.actions.map((action) => `${action.recordType}:${action.action}`)).toEqual([
    "session:update",
    "block:create",
    "block:archive",
  ]);
  expect(plan.actions.find((action) => action.action === "update")).toMatchObject({
    expectedRowVersion: 3,
    expectedAppliedRowVersion: 4,
  });
  expect(plan.actions.find((action) => action.action === "archive")).toMatchObject({
    expectedRowVersion: 1,
    expectedAppliedRowVersion: 2,
    expectedAppliedArchived: true,
  });
  expect(verifySessionPlannerBackfillPlan(plan)).toMatchObject({ ok: true, ready: true });
  expect(JSON.stringify(plan)).not.toContain("Training");
  expect(JSON.stringify(plan)).not.toContain("Deleted exercise");

  const repeated = createSessionPlannerBackfillPlan({
    sourceState: fixture.sourceState,
    baselineSnapshot: fixture.currentSnapshot,
    generatedAt: "2026-07-22T20:11:00.000Z",
  });
  expect(repeated).toMatchObject({
    ok: true,
    counts: { actions: 0, unchanged: 3, blockers: 0 },
  });
});

test("Session Planner backfill refuses unexplained records and active tombstones", () => {
  const fixture = createFixture();
  const unexplainedState = createSourceState();
  delete unexplainedState.blockDeletionTombstones;
  const unexplained = createSessionPlannerBackfillPlan({
    sourceState: unexplainedState,
    baselineSnapshot: fixture.baselineSnapshot,
    generatedAt: planAt,
  });
  expect(unexplained.ok).toBe(false);
  expect(unexplained.blockers.some((value) => value.includes("unexplained_active_record"))).toBe(true);

  const conflictingState = createSourceState();
  conflictingState.blockDeletionTombstones["2026-07-22"]["block-1"] = "2026-07-22T19:56:00.000Z";
  const conflicting = createSessionPlannerBackfillPlan({
    sourceState: conflictingState,
    baselineSnapshot: fixture.baselineSnapshot,
    generatedAt: planAt,
  });
  expect(conflicting.ok).toBe(false);
  expect(conflicting.blockers.some((value) => value.includes("active_source_has_tombstone"))).toBe(true);
});

test("Session Planner rollback plan restores the baseline projection without exposing content", () => {
  const fixture = createFixture();
  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: fixture.currentSnapshot,
    backfillPlan: fixture.backfillPlan,
    generatedAt: rollbackAt,
  });
  const projection = verifySessionPlannerRollbackProjection({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: fixture.currentSnapshot,
    rollbackPlan,
  });
  const summary = createSessionPlannerRollbackSummary(rollbackPlan);

  expect(rollbackPlan.ok).toBe(true);
  expect(rollbackPlan.actions.map((action) => action.action).sort()).toEqual([
    "archive-created",
    "restore-existing",
    "restore-existing",
  ]);
  expect(verifySessionPlannerRollbackPlan(rollbackPlan)).toMatchObject({ ok: true, ready: true });
  expect(projection).toMatchObject({ ok: true, failures: [], actionCount: 3, containsCoachingContent: false });
  expect(summary).toMatchObject({ ok: true, actionCount: 3, blockerCount: 0, containsCoachingContent: false });
  expect(JSON.stringify(rollbackPlan)).not.toContain("Old training");
  expect(JSON.stringify(rollbackPlan)).not.toContain("Finishing");
});

test("Session Planner rollback blocks post-backfill drift and unknown rows", () => {
  const fixture = createFixture();
  const driftedRows = structuredClone(fixture.currentSnapshot.rows);
  driftedRows.sessions[0].title = "Changed after backfill";
  driftedRows.sessions[0].content.title = "Changed after backfill";
  driftedRows.sessions[0].contentHash = hashJsonValue(driftedRows.sessions[0].content);
  driftedRows.sessions[0].rowVersion = 5;
  const unknownPayload = { id: "unknown-block", title: "Concurrent exercise" };
  driftedRows.blocks.push(withRevision({
    id: deterministicUuid("session-planner-block", teamId, driftedRows.sessions[0].id, "unknown-block"),
    organizationId,
    teamId,
    sessionId: driftedRows.sessions[0].id,
    legacyBlockId: "unknown-block",
    sortOrder: 3,
    schemaVersion: 1,
    payload: unknownPayload,
    payloadHash: hashJsonValue(unknownPayload),
  }, 1));
  const driftedSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    createdAt: currentAt,
    scope: { organizationId, teamId },
    sourceRevision: 300,
    sourceHash,
    rows: driftedRows,
  });
  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: driftedSnapshot,
    backfillPlan: fixture.backfillPlan,
    generatedAt: rollbackAt,
  });

  expect(rollbackPlan.ok).toBe(false);
  expect(rollbackPlan.blockers.some((value) => value.includes("post_backfill_drift"))).toBe(true);
  expect(rollbackPlan.blockers.some((value) => value.includes("unknown_post_snapshot_row"))).toBe(true);
});

test("Session Planner rollback rejects a blocked backfill plan", () => {
  const fixture = createFixture();
  const blockedSourceState = createSourceState();
  delete blockedSourceState.blockDeletionTombstones;
  const blockedBackfillPlan = createSessionPlannerBackfillPlan({
    sourceState: blockedSourceState,
    baselineSnapshot: fixture.baselineSnapshot,
    generatedAt: planAt,
  });
  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: fixture.currentSnapshot,
    backfillPlan: blockedBackfillPlan,
    generatedAt: rollbackAt,
  });

  expect(verifySessionPlannerBackfillPlan(blockedBackfillPlan)).toMatchObject({ ok: true, ready: false });
  expect(rollbackPlan).toMatchObject({
    ok: false,
    actions: [],
    blockers: ["backfill:backfill_plan_not_ready"],
  });
});

test("Session Planner rollback projection is bound to the exact verified snapshots", () => {
  const fixture = createFixture();
  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: fixture.currentSnapshot,
    backfillPlan: fixture.backfillPlan,
    generatedAt: rollbackAt,
  });
  const alternateBaseline = createSessionPlannerMigrationSnapshot({
    target: "staging",
    createdAt: "2026-07-22T20:00:01.000Z",
    scope: { organizationId, teamId },
    sourceRevision: 300,
    sourceHash,
    rows: fixture.baselineSnapshot.rows,
  });
  const alternateCurrent = createSessionPlannerMigrationSnapshot({
    target: "staging",
    createdAt: "2026-07-22T20:10:01.000Z",
    scope: { organizationId, teamId },
    sourceRevision: 300,
    sourceHash,
    rows: fixture.currentSnapshot.rows,
  });

  expect(verifySessionPlannerRollbackProjection({
    baselineSnapshot: alternateBaseline,
    currentSnapshot: fixture.currentSnapshot,
    rollbackPlan,
  })).toMatchObject({ ok: false, code: "rollback_projection_baseline_snapshot_mismatch" });
  expect(verifySessionPlannerRollbackProjection({
    baselineSnapshot: fixture.baselineSnapshot,
    currentSnapshot: alternateCurrent,
    rollbackPlan,
  })).toMatchObject({ ok: false, code: "rollback_projection_current_snapshot_mismatch" });
});

test("Session Planner migration contracts expose no apply or write path", () => {
  const migration = require("../api/_lib/session-planner-migration-plan.js");
  const rollback = require("../api/_lib/session-planner-rollback.js");
  expect(migration.applySessionPlannerBackfill).toBeUndefined();
  expect(migration.writeSessionPlannerMigrationSnapshot).toBeUndefined();
  expect(rollback.applySessionPlannerRollback).toBeUndefined();
  expect(rollback.restoreSessionPlannerRows).toBeUndefined();
});
