import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerStagingRecovery,
  STAGING_RECOVERY_CONFIRMATION,
} from "../scripts/session-planner-staging-recovery.mjs";
import {
  actorId,
  createDrillOptions,
  createMigrationFixture,
  createRecoveryPackage,
  createRecoveryReceipt,
  organizationId,
  productionProjectRef,
  projectRef,
  teamId,
} from "./helpers/session-planner-migration-fixture.mjs";

const recoveryAt = "2026-07-23T01:12:00.000Z";

function recoveryOptions(recoveryPackage, overrides = {}) {
  const receipt = createRecoveryReceipt(recoveryPackage);
  return {
    apply: false,
    target: "staging",
    expectedProjectRef: projectRef,
    canonicalProductionProjectRef: productionProjectRef,
    organizationId,
    teamId,
    actorId,
    appStateOrganizationId: "global",
    recoveryPath: receipt.path,
    expectedRecoverySha256: recoveryPackage.integrity.contentSha256,
    expectedRollbackBundleSha256: "",
    bundleCreatedAt: recoveryAt,
    requestId: "session-planner-staging-recovery-test",
    confirm: "",
    ...overrides,
  };
}

function recoveryHarness(recoveryPackage, rows) {
  let rpcCalls = 0;
  let checkpoint = null;
  return {
    dependencies: {
      config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
      loadMigrationRecovery: async () => ({
        ok: true,
        privateRecoveryPackage: recoveryPackage,
        receipt: {
          ...createRecoveryReceipt(recoveryPackage),
          readVerified: true,
        },
      }),
      readTargetSnapshot: async () => ({ ok: true, ...rows.shift() }),
      nextTimestamp: () => recoveryAt,
      onCheckpoint: async (value) => { checkpoint = value; },
      executeRpc: async (bundle, confirmation) => {
        rpcCalls += 1;
        expect(checkpoint).toMatchObject({
          stage: "rollback-bundle-verified",
          containsCoachingContent: false,
        });
        expect(confirmation).toBe("APPLY_SESSION_PLANNER_ROLLBACK");
        return {
          ok: true,
          schema: "footballscience-session-planner-migration-execution-v1",
          operation: bundle.operation,
          runId: "recovery-run-1",
          planSha256: bundle.planSha256,
          bundleSha256: bundle.integrity.contentSha256,
          projectRef,
          appliedSessions: 1,
          appliedBlocks: 1,
        };
      },
    },
    rpcCalls: () => rpcCalls,
  };
}

function fixture() {
  const data = createMigrationFixture();
  const recoveryPackage = createRecoveryPackage(data, createDrillOptions());
  return { data, recoveryPackage };
}

test("Session Planner staging recovery dry-run creates an exact content-free rollback bundle", async () => {
  const { data, recoveryPackage } = fixture();
  const harness = recoveryHarness(recoveryPackage, [data.firstAppliedRows]);
  const report = await executeSessionPlannerStagingRecovery(
    recoveryOptions(recoveryPackage),
    harness.dependencies
  );

  expect(harness.rpcCalls()).toBe(0);
  expect(report).toMatchObject({
    ok: true,
    ready: true,
    alreadyRestored: false,
    wroteData: false,
    mode: "dry-run",
    rollbackBundle: { ok: true, operation: "rollback", commandCount: 2 },
    containsCoachingContent: false,
  });
  expect(JSON.stringify(report)).not.toContain("Private first-team training");
  expect(JSON.stringify(report)).not.toContain("Private previous training");
});

test("Session Planner staging recovery applies only the reviewed rollback and verifies baseline", async () => {
  const { data, recoveryPackage } = fixture();
  const reviewHarness = recoveryHarness(recoveryPackage, [data.firstAppliedRows]);
  const review = await executeSessionPlannerStagingRecovery(
    recoveryOptions(recoveryPackage),
    reviewHarness.dependencies
  );
  const applyHarness = recoveryHarness(recoveryPackage, [
    data.firstAppliedRows,
    data.rolledBackRows,
  ]);
  const report = await executeSessionPlannerStagingRecovery(recoveryOptions(recoveryPackage, {
    apply: true,
    confirm: STAGING_RECOVERY_CONFIRMATION,
    expectedRollbackBundleSha256: review.rollbackBundle.contentSha256,
  }), applyHarness.dependencies);

  expect(applyHarness.rpcCalls()).toBe(1);
  expect(report).toMatchObject({
    ok: true,
    alreadyRestored: false,
    wroteData: true,
    execution: { ok: true, operation: "rollback" },
    containsCoachingContent: false,
  });
  expect(report.restoredProjectionSha256).toBe(report.baselineProjectionSha256);
});

test("Session Planner staging recovery is a no-write success when baseline is already restored", async () => {
  const { data, recoveryPackage } = fixture();
  const harness = recoveryHarness(recoveryPackage, [data.rolledBackRows]);
  const report = await executeSessionPlannerStagingRecovery(recoveryOptions(recoveryPackage, {
    apply: true,
    confirm: STAGING_RECOVERY_CONFIRMATION,
  }), harness.dependencies);

  expect(harness.rpcCalls()).toBe(0);
  expect(report).toMatchObject({
    ok: true,
    alreadyRestored: true,
    wroteData: false,
  });
});

test("Session Planner staging recovery blocks production and bad confirmation before reads", async () => {
  const { recoveryPackage } = fixture();
  let loads = 0;
  const dependencies = {
    config: { url: `https://${projectRef}.supabase.co`, serviceRoleKey: "test-service-key" },
    loadMigrationRecovery: async () => { loads += 1; },
  };
  await expect(executeSessionPlannerStagingRecovery(
    recoveryOptions(recoveryPackage, { target: "production" }),
    dependencies
  )).rejects.toThrow("target must be staging");
  await expect(executeSessionPlannerStagingRecovery(
    recoveryOptions(recoveryPackage, { appStateOrganizationId: organizationId }),
    dependencies
  )).rejects.toThrow("source organization must be global");
  await expect(executeSessionPlannerStagingRecovery(recoveryOptions(recoveryPackage, {
    apply: true,
    confirm: "WRONG",
  }), dependencies)).rejects.toThrow("confirmation is invalid");
  expect(loads).toBe(0);
});

test("Session Planner staging recovery fails closed on drift or stale rollback hash", async () => {
  const { data, recoveryPackage } = fixture();
  const driftedRows = structuredClone(data.firstAppliedRows);
  driftedRows.sessions[0].rowVersion = 4;
  const driftHarness = recoveryHarness(recoveryPackage, [driftedRows]);
  await expect(executeSessionPlannerStagingRecovery(
    recoveryOptions(recoveryPackage),
    driftHarness.dependencies
  )).rejects.toThrow("rollback bundle is invalid");
  expect(driftHarness.rpcCalls()).toBe(0);

  const staleHarness = recoveryHarness(recoveryPackage, [data.firstAppliedRows]);
  await expect(executeSessionPlannerStagingRecovery(recoveryOptions(recoveryPackage, {
    apply: true,
    confirm: STAGING_RECOVERY_CONFIRMATION,
    expectedRollbackBundleSha256: "f".repeat(64),
  }), staleHarness.dependencies)).rejects.toThrow("rollback bundle changed after review");
  expect(staleHarness.rpcCalls()).toBe(0);
});

test("Session Planner staging recovery refuses a package with the wrong tenant", async () => {
  const { data, recoveryPackage } = fixture();
  const harness = recoveryHarness(recoveryPackage, [data.firstAppliedRows]);
  await expect(executeSessionPlannerStagingRecovery(recoveryOptions(recoveryPackage, {
    teamId: "99999999-9999-4999-8999-999999999999",
  }), harness.dependencies)).rejects.toThrow("scope or integrity is invalid");
  expect(harness.rpcCalls()).toBe(0);
});
