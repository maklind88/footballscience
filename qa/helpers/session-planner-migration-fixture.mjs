import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const domainRecords = require("../../api/_lib/session-planner-domain-records.js");
const {
  createSessionPlannerBackfillPlan,
  createSessionPlannerMigrationSnapshot,
} = require("../../api/_lib/session-planner-migration-plan.js");
const {
  createSessionPlannerBackfillBundle,
} = require("../../api/_lib/session-planner-migration-bundle.js");
const {
  createSessionPlannerMigrationRecoveryPackage,
} = require("../../api/_lib/session-planner-migration-recovery.js");

export const organizationId = "11111111-1111-4111-8111-111111111111";
export const teamId = "22222222-2222-4222-8222-222222222222";
export const actorId = "33333333-3333-4333-8333-333333333333";
export const projectRef = "staging-project";
export const productionProjectRef = "production-project";
export const sourceHash = "a".repeat(64);
export const createdAt = "2026-07-23T01:00:00.000Z";
export const hashJsonValue = domainRecords.hashJsonValue;

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
        blocks: [{ id: "block-1", title: "Private exercise", minutes: 20 }],
      },
    },
  };
}

function snapshot(rows, timestamp) {
  return createSessionPlannerMigrationSnapshot({
    target: "staging",
    projectRef,
    createdAt: timestamp,
    scope: { organizationId, teamId },
    sourceRevision: 42,
    sourceHash,
    rows,
  });
}

export function createMigrationFixture() {
  const state = sourceState();
  const desired = domainRecords.extractSessionPlannerDomainRecords(
    state,
    { organizationId, teamId }
  );
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
  const baselineSnapshot = snapshot(
    { sessions: [baselineSession], blocks: [] },
    createdAt
  );
  const backfillPlan = createSessionPlannerBackfillPlan({
    sourceState: state,
    baselineSnapshot,
    generatedAt: createdAt,
  });
  return {
    state,
    baselineSnapshot,
    backfillPlan,
    firstAppliedRows: {
      sessions: [{ ...structuredClone(desiredSession), rowVersion: 3, archivedAt: null }],
      blocks: [{ ...structuredClone(desiredBlock), rowVersion: 1, archivedAt: null }],
    },
    rolledBackRows: {
      sessions: [{ ...structuredClone(baselineSession), rowVersion: 4, archivedAt: null }],
      blocks: [{
        ...structuredClone(desiredBlock),
        rowVersion: 2,
        archivedAt: "2026-07-23T01:05:00.000Z",
      }],
    },
    finalRows: {
      sessions: [{ ...structuredClone(desiredSession), rowVersion: 5, archivedAt: null }],
      blocks: [{ ...structuredClone(desiredBlock), rowVersion: 3, archivedAt: null }],
    },
  };
}

export function createDrillOptions(overrides = {}) {
  return {
    apply: false,
    target: "staging",
    expectedProjectRef: projectRef,
    canonicalProductionProjectRef: productionProjectRef,
    organizationId,
    teamId,
    actorId,
    appStateOrganizationId: "global",
    expectedSourceRevision: 42,
    expectedSourceHash: sourceHash,
    expectedInitialBundleSha256: "",
    bundleCreatedAt: createdAt,
    requestId: "session-planner-staging-drill-test",
    confirm: "",
    ...overrides,
  };
}

export function createPreparedMigration(data = createMigrationFixture()) {
  return {
    privateSourceState: data.state,
    privateSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
  };
}

export function scopedRequestId(requestId, suffix) {
  return requestId.slice(0, 180 - suffix.length) + suffix;
}

export function createInitialBundle(data, drillOptions) {
  return createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    actorId,
    requestId: scopedRequestId(drillOptions.requestId, ":backfill-1"),
    createdAt,
  });
}

export function createInitialBundleSha256(data, drillOptions) {
  return createInitialBundle(data, drillOptions).integrity.contentSha256;
}

export function createRecoveryPackage(data, drillOptions) {
  return createSessionPlannerMigrationRecoveryPackage({
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    initialBundle: createInitialBundle(data, drillOptions),
    createdAt,
  });
}

export function createDrillTimestamps() {
  const values = new Map([
    ["after-backfill", "2026-07-23T01:02:00.000Z"],
    ["verify-backfill", "2026-07-23T01:03:00.000Z"],
    ["rollback-plan", "2026-07-23T01:04:00.000Z"],
    ["rollback-bundle", "2026-07-23T01:05:00.000Z"],
    ["after-rollback", "2026-07-23T01:06:00.000Z"],
    ["reapply-plan", "2026-07-23T01:07:00.000Z"],
    ["reapply-bundle", "2026-07-23T01:08:00.000Z"],
    ["after-reapply", "2026-07-23T01:09:00.000Z"],
    ["verify-reapply", "2026-07-23T01:10:00.000Z"],
  ]);
  return (label) => values.get(label);
}

export function createRecoveryReceipt(recoveryPackage) {
  return {
    ok: true,
    bucket: "footballscience-app-state",
    path: "backups/session-planner-recovery/staging/staging-project/recovery.json",
    contentSha256: recoveryPackage.integrity.contentSha256,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  };
}
