import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerStagingDrill,
  STAGING_DRILL_CONFIRMATION,
} from "../scripts/session-planner-staging-drill.mjs";
import {
  loadSessionPlannerMigrationRecoveryPackage,
  storeSessionPlannerMigrationRecoveryPackage,
} from "../scripts/lib/session-planner-migration-recovery-storage.mjs";
import {
  actorId,
  createDrillOptions as options,
  createDrillTimestamps as timestamps,
  createInitialBundleSha256 as initialBundleSha256,
  createMigrationFixture as fixture,
  createPreparedMigration as prepared,
  createRecoveryPackage as buildRecoveryPackage,
  createRecoveryReceipt as recoveryReceipt,
  hashJsonValue,
  organizationId,
  projectRef,
  productionProjectRef,
} from "./helpers/session-planner-migration-fixture.mjs";

const require = createRequire(import.meta.url);
const {
  createSessionPlannerMigrationRecoverySummary,
  verifySessionPlannerMigrationRecoveryPackage,
} = require("../api/_lib/session-planner-migration-recovery.js");

test("Session Planner recovery package binds baseline, plan and bundle without public content", () => {
  const data = fixture();
  const recoveryPackage = buildRecoveryPackage(data, options());
  const summary = createSessionPlannerMigrationRecoverySummary(recoveryPackage);
  expect(verifySessionPlannerMigrationRecoveryPackage(recoveryPackage)).toMatchObject({ ok: true });
  expect(summary).toMatchObject({
    ok: true,
    target: "staging",
    projectRef,
    commandCount: 2,
    containsCoachingContent: false,
  });
  expect(JSON.stringify(summary)).not.toContain("Private first-team training");

  const tampered = structuredClone(recoveryPackage);
  tampered.projectRef = "other-staging-project";
  const { integrity: ignoredIntegrity, ...body } = tampered;
  tampered.integrity = { algorithm: "sha256", contentSha256: hashJsonValue(body) };
  expect(verifySessionPlannerMigrationRecoveryPackage(tampered)).toMatchObject({
    ok: false,
    code: "recovery_package_context_invalid",
  });
});

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
    options({ appStateOrganizationId: organizationId }),
    dependencies
  )).rejects.toThrow("source organization must be global");
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
    storeMigrationRecovery: async ({ recoveryPackage }) => recoveryReceipt(recoveryPackage),
    onCheckpoint: async (value) => { checkpoint = value; },
    nextTimestamp: timestamps(),
    readTargetSnapshot: async () => ({ ok: true, ...snapshots.shift() }),
    executeRpc: async (bundle, confirmation) => {
      expect(checkpoint).toMatchObject({
        stage: "recovery-package-verified",
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
    storeMigrationRecovery: async ({ recoveryPackage }) => recoveryReceipt(recoveryPackage),
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

test("Session Planner staging drill stores an integrity-checked recovery package before writing", async () => {
  const data = fixture();
  const baseOptions = options({ apply: true, confirm: STAGING_DRILL_CONFIRMATION });
  let rpcCalls = 0;
  await expect(executeSessionPlannerStagingDrill({
    ...baseOptions,
    expectedInitialBundleSha256: initialBundleSha256(data, baseOptions),
  }, {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    prepareBackfillReview: async () => prepared(data),
    storeMigrationRecovery: async () => ({ ok: false, readAfterWriteVerified: false }),
    executeRpc: async () => { rpcCalls += 1; },
  })).rejects.toThrow("recovery package was not stored and verified");
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
    if (corruptReadback) payload.baselineSnapshot.rows.sessions[0].title = "Corrupted";
    return jsonResponse(payload);
  };
  return { calls, fetchImpl };
}

test("Session Planner recovery package storage requires a private matching project and rereads integrity", async () => {
  const data = fixture();
  const recoveryPackage = buildRecoveryPackage(data, options());
  const harness = snapshotStorageHarness();
  const stored = await storeSessionPlannerMigrationRecoveryPackage({
    recoveryPackage,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: harness.fetchImpl,
  });
  expect(stored).toMatchObject({ ok: true, readAfterWriteVerified: true, containsCoachingContent: false });
  expect(stored.path).toContain(`backups/session-planner-recovery/staging/${projectRef}/`);
  expect(harness.calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
  const loaded = await loadSessionPlannerMigrationRecoveryPackage({
    path: stored.path,
    expectedContentSha256: stored.contentSha256,
    expectedProjectRef: projectRef,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: harness.fetchImpl,
  });
  expect(loaded).toMatchObject({
    ok: true,
    privateRecoveryPackage: { integrity: { contentSha256: stored.contentSha256 } },
    receipt: { readVerified: true, containsCoachingContent: false },
  });
  expect(JSON.stringify(loaded.receipt)).not.toContain("Private first-team training");

  const publicHarness = snapshotStorageHarness({ publicBucket: true });
  const rejectedPublic = await storeSessionPlannerMigrationRecoveryPackage({
    recoveryPackage,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: publicHarness.fetchImpl,
  });
  expect(rejectedPublic).toMatchObject({ ok: false, reason: "Session Planner recovery bucket must remain private." });
  expect(publicHarness.calls.some((call) => call.method === "POST")).toBe(false);

  const wrongProjectHarness = snapshotStorageHarness();
  const rejectedProject = await storeSessionPlannerMigrationRecoveryPackage({
    recoveryPackage,
    config: { url: "https://wrong-project.supabase.co", serviceRoleKey: "private-test-key" },
    fetchImpl: wrongProjectHarness.fetchImpl,
  });
  expect(rejectedProject).toMatchObject({ ok: false, reason: "Recovery storage does not match the reviewed staging project." });
  expect(wrongProjectHarness.calls).toHaveLength(0);

  const corruptHarness = snapshotStorageHarness({ corruptReadback: true });
  const rejectedCorrupt = await storeSessionPlannerMigrationRecoveryPackage({
    recoveryPackage,
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "private-test-key" },
    fetchImpl: corruptHarness.fetchImpl,
  });
  expect(rejectedCorrupt).toMatchObject({
    ok: false,
    reason: "Stored Session Planner recovery package failed read-after-write verification.",
  });
});
