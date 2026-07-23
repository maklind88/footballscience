import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerStagingDrill,
  STAGING_DRILL_CONFIRMATION,
} from "../scripts/session-planner-staging-drill.mjs";
import {
  storeSessionPlannerMigrationSnapshot,
} from "../scripts/lib/session-planner-migration-snapshot-storage.mjs";

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
  createSessionPlannerBackfillBundle,
} = require("../api/_lib/session-planner-migration-bundle.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const projectRef = "staging-project";
const productionProjectRef = "production-project";
const sourceHash = "a".repeat(64);
const createdAt = "2026-07-23T01:00:00.000Z";

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

function fixture() {
  const state = sourceState();
  const desired = extractSessionPlannerDomainRecords(state, { organizationId, teamId });
  const desiredSession = desired.sessions[0];
  const desiredBlock = desired.blocks[0];
  const oldContent = { ...structuredClone(desiredSession.content), title: "Private previous training" };
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
  const firstAppliedRows = {
    sessions: [{ ...structuredClone(desiredSession), rowVersion: 3, archivedAt: null }],
    blocks: [{ ...structuredClone(desiredBlock), rowVersion: 1, archivedAt: null }],
  };
  const rolledBackRows = {
    sessions: [{ ...structuredClone(baselineSession), rowVersion: 4, archivedAt: null }],
    blocks: [{
      ...structuredClone(desiredBlock),
      rowVersion: 2,
      archivedAt: "2026-07-23T01:05:00.000Z",
    }],
  };
  const finalRows = {
    sessions: [{ ...structuredClone(desiredSession), rowVersion: 5, archivedAt: null }],
    blocks: [{ ...structuredClone(desiredBlock), rowVersion: 3, archivedAt: null }],
  };
  return {
    state,
    baselineSnapshot,
    backfillPlan,
    firstAppliedRows,
    rolledBackRows,
    finalRows,
  };
}

function options(overrides = {}) {
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

function prepared(data = fixture()) {
  return {
    privateSourceState: data.state,
    privateSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
  };
}

function scopedRequestId(requestId, suffix) {
  return requestId.slice(0, 180 - suffix.length) + suffix;
}

function initialBundleSha256(data, drillOptions) {
  return createSessionPlannerBackfillBundle({
    sourceState: data.state,
    baselineSnapshot: data.baselineSnapshot,
    backfillPlan: data.backfillPlan,
    actorId,
    requestId: scopedRequestId(drillOptions.requestId, ":backfill-1"),
    createdAt,
  }).integrity.contentSha256;
}

function timestamps() {
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

function recoverySnapshot(data) {
  return {
    ok: true,
    bucket: "footballscience-app-state",
    path: "backups/session-planner/staging/recovery.json",
    contentSha256: data.baselineSnapshot.integrity.contentSha256,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  };
}

test("Session Planner staging drill defaults to a content-free no-write dry-run", async () => {
  const data = fixture();
  let rpcCalls = 0;
  const report = await executeSessionPlannerStagingDrill(options(), {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    executeRpc: async () => { rpcCalls += 1; },
  });

  expect(rpcCalls).toBe(0);
  expect(report).toMatchObject({ ok: true, ready: true, mode: "dry-run", containsCoachingContent: false });
  expect(report.initialBundle).toMatchObject({ ok: true, operation: "backfill", commandCount: 2 });
  expect(JSON.stringify(report)).not.toContain("Private first-team training");
  expect(JSON.stringify(report)).not.toContain("Private exercise");
});

test("Session Planner staging drill blocks production identity and unreviewed writes before reads", async () => {
  let prepares = 0;
  const dependencies = {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => { prepares += 1; return prepared(); },
  };

  await expect(executeSessionPlannerStagingDrill(
    options({ target: "production" }),
    dependencies
  )).rejects.toThrow("target must be staging");
  await expect(executeSessionPlannerStagingDrill(
    options({ expectedProjectRef: productionProjectRef }),
    dependencies
  )).rejects.toThrow("must differ from canonical production");
  await expect(executeSessionPlannerStagingDrill(
    options({ apply: true }),
    dependencies
  )).rejects.toThrow("confirmation is invalid");
  expect(prepares).toBe(0);
});

test("Session Planner staging drill proves apply, rollback and reapply with exact revisions", async () => {
  const data = fixture();
  const baseOptions = options({
    apply: true,
    confirm: STAGING_DRILL_CONFIRMATION,
    requestId: "x".repeat(180),
  });
  const drillOptions = {
    ...baseOptions,
    expectedInitialBundleSha256: initialBundleSha256(data, baseOptions),
  };
  const snapshots = [data.firstAppliedRows, data.rolledBackRows, data.finalRows];
  const calls = [];
  let checkpoint = null;
  const report = await executeSessionPlannerStagingDrill(drillOptions, {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    storeMigrationSnapshot: async () => recoverySnapshot(data),
    onCheckpoint: async (value) => { checkpoint = value; },
    nextTimestamp: timestamps(),
    readTargetSnapshot: async () => ({ ok: true, ...snapshots.shift() }),
    executeRpc: async (bundle, confirmation) => {
      expect(checkpoint).toMatchObject({
        stage: "recovery-snapshot-verified",
        readAfterWriteVerified: true,
        containsCoachingContent: false,
      });
      calls.push({ operation: bundle.operation, confirmation, bundle });
      return {
        ok: true,
        schema: "footballscience-session-planner-migration-execution-v1",
        operation: bundle.operation,
        runId: `run-${calls.length}`,
        planSha256: bundle.planSha256,
        bundleSha256: bundle.integrity.contentSha256,
        projectRef,
        appliedSessions: bundle.commands.filter((item) => item.recordType === "session").length,
        appliedBlocks: bundle.commands.filter((item) => item.recordType === "block").length,
      };
    },
  });

  expect(calls.map(({ operation, confirmation }) => [operation, confirmation])).toEqual([
    ["backfill", "APPLY_SESSION_PLANNER_BACKFILL"],
    ["rollback", "APPLY_SESSION_PLANNER_ROLLBACK"],
    ["backfill", "APPLY_SESSION_PLANNER_BACKFILL"],
  ]);
  expect(calls.map(({ bundle }) => Object.fromEntries(
    bundle.commands.map((command) => [command.recordType, command.expectedRowVersion])
  ))).toEqual([
    { session: 2, block: null },
    { block: 1, session: 3 },
    { session: 4, block: 2 },
  ]);
  expect(new Set(calls.map(({ bundle }) => bundle.requestId)).size).toBe(3);
  expect(calls.every(({ bundle }) => bundle.requestId.length <= 180)).toBe(true);
  expect(calls.map(({ bundle }) => bundle.requestId.slice(bundle.requestId.lastIndexOf(":")))).toEqual([
    ":backfill-1",
    ":rollback",
    ":backfill-2",
  ]);
  expect(report).toMatchObject({ ok: true, ready: true, mode: "drill", containsCoachingContent: false });
  expect(report.firstApply.projectionSha256).toBe(report.reapply.projectionSha256);
  expect(JSON.stringify(report)).not.toContain("Private first-team training");
  expect(JSON.stringify(report)).not.toContain("Private previous training");
});

test("Session Planner staging drill fails closed before rollback when the applied projection drifts", async () => {
  const data = fixture();
  const baseOptions = options({ apply: true, confirm: STAGING_DRILL_CONFIRMATION });
  const drillOptions = {
    ...baseOptions,
    expectedInitialBundleSha256: initialBundleSha256(data, baseOptions),
  };
  let rpcCalls = 0;

  await expect(executeSessionPlannerStagingDrill(drillOptions, {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    storeMigrationSnapshot: async () => recoverySnapshot(data),
    nextTimestamp: timestamps(),
    readTargetSnapshot: async () => ({ ok: true, ...data.baselineSnapshot.rows }),
    executeRpc: async () => {
      rpcCalls += 1;
      return { ok: true, operation: "backfill", projectRef };
    },
  })).rejects.toThrow("applied projection does not match the source");
  expect(rpcCalls).toBe(1);
});

test("Session Planner staging drill binds apply to the reviewed initial bundle hash", async () => {
  const data = fixture();
  let rpcCalls = 0;
  await expect(executeSessionPlannerStagingDrill(options({
    apply: true,
    confirm: STAGING_DRILL_CONFIRMATION,
    expectedInitialBundleSha256: "f".repeat(64),
  }), {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    executeRpc: async () => { rpcCalls += 1; },
  })).rejects.toThrow("initial bundle changed after review");
  expect(rpcCalls).toBe(0);
});

test("Session Planner staging drill stores an integrity-checked recovery snapshot before writing", async () => {
  const data = fixture();
  const baseOptions = options({ apply: true, confirm: STAGING_DRILL_CONFIRMATION });
  let rpcCalls = 0;
  await expect(executeSessionPlannerStagingDrill({
    ...baseOptions,
    expectedInitialBundleSha256: initialBundleSha256(data, baseOptions),
  }, {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    storeMigrationSnapshot: async () => ({ ok: false, readAfterWriteVerified: false }),
    executeRpc: async () => { rpcCalls += 1; },
  })).rejects.toThrow("recovery snapshot was not stored and verified");
  expect(rpcCalls).toBe(0);
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function snapshotStorageHarness({ publicBucket = false, corruptReadback = false } = {}) {
  const calls = [];
  let stored = null;
  const fetchImpl = async (url, request = {}) => {
    const method = request.method || "GET";
    calls.push({ url: String(url), method, headers: request.headers });
    if (String(url).includes("/storage/v1/bucket/")) {
      return jsonResponse({ public: publicBucket });
    }
    if (method === "POST") {
      stored = JSON.parse(request.body);
      return jsonResponse({ Key: "stored" });
    }
    const payload = structuredClone(stored);
    if (corruptReadback) payload.rows.sessions[0].title = "Corrupted";
    return jsonResponse(payload);
  };
  return { calls, fetchImpl };
}

test("Session Planner recovery snapshot storage requires a private matching project and rereads integrity", async () => {
  const data = fixture();
  const harness = snapshotStorageHarness();
  const stored = await storeSessionPlannerMigrationSnapshot({
    snapshot: data.baselineSnapshot,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: harness.fetchImpl,
  });
  expect(stored).toMatchObject({ ok: true, readAfterWriteVerified: true, containsCoachingContent: false });
  expect(stored.path).toContain(`backups/session-planner/staging/${projectRef}/`);
  expect(harness.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);

  const publicHarness = snapshotStorageHarness({ publicBucket: true });
  const rejectedPublic = await storeSessionPlannerMigrationSnapshot({
    snapshot: data.baselineSnapshot,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: publicHarness.fetchImpl,
  });
  expect(rejectedPublic).toMatchObject({ ok: false, reason: "Session Planner snapshot bucket must remain private." });
  expect(publicHarness.calls.some((call) => call.method === "POST")).toBe(false);

  const wrongProjectHarness = snapshotStorageHarness();
  const rejectedProject = await storeSessionPlannerMigrationSnapshot({
    snapshot: data.baselineSnapshot,
    config: { url: "https://wrong-project.supabase.co", serviceRoleKey: "private-test-key" },
    fetchImpl: wrongProjectHarness.fetchImpl,
  });
  expect(rejectedProject).toMatchObject({ ok: false, reason: "Snapshot storage does not match the reviewed staging project." });
  expect(wrongProjectHarness.calls).toHaveLength(0);

  const corruptHarness = snapshotStorageHarness({ corruptReadback: true });
  const rejectedCorrupt = await storeSessionPlannerMigrationSnapshot({
    snapshot: data.baselineSnapshot,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: corruptHarness.fetchImpl,
  });
  expect(rejectedCorrupt).toMatchObject({
    ok: false,
    reason: "Stored Session Planner snapshot failed read-after-write verification.",
  });
});
