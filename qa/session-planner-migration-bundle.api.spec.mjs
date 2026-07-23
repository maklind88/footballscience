import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("../api/_lib/session-planner-domain-records.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
} = require("../api/_lib/session-planner-migration-plan.js");
const {
  createSessionPlannerRollbackPlan,
} = require("../api/_lib/session-planner-rollback.js");
const {
  createSessionPlannerBackfillBundle,
  createSessionPlannerMigrationBundleSummary,
  createSessionPlannerRollbackBundle,
  verifySessionPlannerMigrationBundle,
} = require("../api/_lib/session-planner-migration-bundle.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const projectRef = "staging-project";
const sourceHash = "a".repeat(64);
const baselineAt = "2026-07-23T00:00:00.000Z";
const planAt = "2026-07-23T00:01:00.000Z";
const currentAt = "2026-07-23T00:02:00.000Z";
const rollbackAt = "2026-07-23T00:03:00.000Z";

function sourceState() {
  return {
    selectedDate: "2026-07-23",
    sessions: {
      "2026-07-23": {
        id: "session-2026-07-23",
        date: "2026-07-23",
        title: "Private first-team training",
        theme: "Private tactical theme",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Private positional exercise", minutes: 20 }],
      },
    },
  };
}

function fixture() {
  const state = sourceState();
  const desired = extractSessionPlannerDomainRecords(state, { organizationId, teamId });
  const desiredSession = desired.sessions[0];
  const desiredBlock = desired.blocks[0];
  const oldContent = {
    ...structuredClone(desiredSession.content),
    title: "Private previous training",
  };
  const baselineSession = {
    ...structuredClone(desiredSession),
    title: oldContent.title,
    content: oldContent,
    contentHash: hashJsonValue(oldContent),
    rowVersion: 2,
    archivedAt: null,
  };
  const baselineSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef,
    createdAt: baselineAt,
    scope: { organizationId, teamId },
    sourceRevision: 42,
    sourceHash,
    rows: { sessions: [baselineSession], blocks: [] },
  });
  const backfillPlan = createSessionPlannerBackfillPlan({
    sourceState: state,
    baselineSnapshot,
    generatedAt: planAt,
  });
  const currentSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef,
    createdAt: currentAt,
    scope: { organizationId, teamId },
    sourceRevision: 42,
    sourceHash,
    rows: {
      sessions: [{ ...structuredClone(desiredSession), rowVersion: 3, archivedAt: null }],
      blocks: [{ ...structuredClone(desiredBlock), rowVersion: 1, archivedAt: null }],
    },
  });
  const rollbackPlan = createSessionPlannerRollbackPlan({
    baselineSnapshot,
    currentSnapshot,
    backfillPlan,
    generatedAt: rollbackAt,
  });
  return { state, baselineSnapshot, backfillPlan, currentSnapshot, rollbackPlan };
}

test("Session Planner backfill bundle is private, integrity-bound and execution-disabled", () => {
  const data = fixture();
  const bundle = createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    actorId,
    requestId: "session-planner-staging-backfill-1",
    createdAt: "2026-07-23T00:01:30.000Z",
  });
  const summary = createSessionPlannerMigrationBundleSummary(bundle);

  expect(bundle).toMatchObject({
    ok: true,
    operation: "backfill",
    executionEnabled: false,
    transactionRequired: true,
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    source: { revision: 42, hash: sourceHash },
    commandCount: 2,
    containsCoachingContent: true,
  });
  expect(bundle.commands.map((command) => command.action).sort()).toEqual(["create", "update"]);
  expect(JSON.stringify(bundle)).toContain("Private first-team training");
  expect(verifySessionPlannerMigrationBundle(bundle)).toMatchObject({ ok: true });
  expect(summary).toMatchObject({
    ok: true,
    operation: "backfill",
    commandCount: 2,
    containsCoachingContent: false,
  });
  expect(JSON.stringify(summary)).not.toContain("Private first-team training");
  expect(JSON.stringify(summary)).not.toContain("Private positional exercise");
});

test("Session Planner bundle verification rejects payload tampering even with a recomputed envelope hash", () => {
  const data = fixture();
  const bundle = structuredClone(createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    actorId,
    requestId: "session-planner-staging-backfill-2",
    createdAt: "2026-07-23T00:01:30.000Z",
  }));
  const sessionCommand = bundle.commands.find((command) => command.recordType === "session");
  sessionCommand.record.title = "Tampered title";
  const { integrity: ignoredIntegrity, ...body } = bundle;
  bundle.integrity = {
    algorithm: "sha256",
    contentSha256: hashJsonValue(body),
  };

  expect(verifySessionPlannerMigrationBundle(bundle)).toMatchObject({
    ok: false,
    code: "migration_bundle_record_invalid",
  });
});

test("Session Planner rollback bundle restores existing rows and archives only backfill-created rows", () => {
  const data = fixture();
  const bundle = createSessionPlannerRollbackBundle({
    baselineSnapshot: data.baselineSnapshot,
    currentSnapshot: data.currentSnapshot,
    rollbackPlan: data.rollbackPlan,
    actorId,
    requestId: "session-planner-staging-rollback-1",
    createdAt: "2026-07-23T00:03:30.000Z",
  });
  const summary = createSessionPlannerMigrationBundleSummary(bundle);

  expect(bundle).toMatchObject({
    ok: true,
    operation: "rollback",
    executionEnabled: false,
    transactionRequired: true,
    commandCount: 2,
  });
  expect(bundle.commands.map((command) => command.action).sort()).toEqual([
    "archive-created",
    "restore-existing",
  ]);
  expect(bundle.commands.find((command) => command.action === "restore-existing").record.title)
    .toBe("Private previous training");
  expect(verifySessionPlannerMigrationBundle(bundle)).toMatchObject({ ok: true });
  expect(summary).toMatchObject({
    ok: true,
    operation: "rollback",
    commandCount: 2,
    containsCoachingContent: false,
  });
  expect(JSON.stringify(summary)).not.toContain("Private previous training");
});

test("Session Planner bundle creation fails closed on actor and snapshot-plan drift", () => {
  const data = fixture();
  const invalidActor = createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    actorId: "not-a-user",
    requestId: "session-planner-staging-backfill-3",
    createdAt: "2026-07-23T00:01:30.000Z",
  });
  const changedSnapshot = createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef,
    createdAt: "2026-07-23T00:00:01.000Z",
    scope: { organizationId, teamId },
    sourceRevision: 42,
    sourceHash,
    rows: data.baselineSnapshot.rows,
  });
  const drifted = createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: changedSnapshot,
    backfillPlan: data.backfillPlan,
    actorId,
    requestId: "session-planner-staging-backfill-4",
    createdAt: "2026-07-23T00:01:30.000Z",
  });

  expect(invalidActor).toMatchObject({ ok: false, executionEnabled: false });
  expect(invalidActor.failures).toContain("actor_id_invalid");
  expect(drifted).toMatchObject({ ok: false, executionEnabled: false });
  expect(drifted.failures).toContain("plan_snapshot_mismatch");
});

test("Session Planner migration bundle module exposes no executor or write path", () => {
  const bundleModule = require("../api/_lib/session-planner-migration-bundle.js");
  expect(bundleModule.applySessionPlannerMigrationBundle).toBeUndefined();
  expect(bundleModule.executeSessionPlannerBackfill).toBeUndefined();
  expect(bundleModule.writeSessionPlannerDomainRecords).toBeUndefined();
});
