import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerPromotionReview,
  parseSessionPlannerPromotionReviewArgs,
  validateSessionPlannerPromotionReviewOptions,
} from "../scripts/session-planner-promotion-review.mjs";

const require = createRequire(import.meta.url);
const {
  assembleSessionPlannerPromotionEvidence,
} = require("../api/_lib/session-planner-promotion-evidence.js");
const {
  SESSION_PLANNER_READ_PROMOTION_SCHEMA,
} = require("../api/_lib/session-planner-read-promotion.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const reviewerId = "33333333-3333-4333-8333-333333333333";
const projectRef = "stageproject123";
const productionProjectRef = "prodproject456";
const sourceRevision = 301;
const sourceHash = "a".repeat(64);
const stagingAppOrigin = "https://stage.footballscience.xyz";
const productionAppOrigin = "https://footballscience.xyz";
const now = new Date("2026-07-23T12:00:00.000Z");

function identityReport() {
  return {
    ok: true,
    schema: "footballscience-platform-identity-staging-drill-v1",
    dryRun: false,
    applied: true,
    rolledBack: true,
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    recoveryRequired: false,
    failures: [],
    bundle: {
      ok: true,
      target: "staging",
      projectRef,
      organizationId,
      operation: "backfill",
      planSha256: "b".repeat(64),
      snapshotSha256: "c".repeat(64),
      contentSha256: "d".repeat(64),
      expectedUserCount: 2,
      commandCount: 4,
      piiExposed: false,
    },
    rollback: {
      ok: true,
      actionCount: 4,
      blockerCount: 0,
      piiExposed: false,
    },
    applyReceipt: {
      ok: true,
      operation: "backfill",
      bundleSha256: "d".repeat(64),
      appliedCount: 4,
      piiExposed: false,
    },
    rollbackReceipt: {
      ok: true,
      operation: "rollback",
      appliedCount: 4,
      piiExposed: false,
    },
    audit: { backfillEvents: 4, rollbackEvents: 4 },
    rollbackVerification: { ok: true, blockers: [] },
    piiExposed: false,
  };
}

function shadowReport() {
  return {
    ok: true,
    schema: "footballscience-session-planner-shadow-evidence-v1",
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    source: { revision: sourceRevision, hash: sourceHash },
    evidence: {
      reportCount: 3,
      validReportCount: 3,
      distinctReportCount: 3,
      observationSpanMs: 10 * 60 * 1000,
      snapshotContentSha256: "e".repeat(64),
    },
    evidencePassed: true,
    readyForManualReview: true,
    failureCodes: [],
    promotionBlocked: true,
    automaticPromotion: false,
    writeCapability: false,
    containsCoachingContent: false,
  };
}

function execution(operation, bundleHash) {
  return {
    ok: true,
    operation,
    projectRef,
    bundleSha256: bundleHash,
    containsCoachingContent: false,
  };
}

function migrationDrillReport() {
  const firstHash = "f".repeat(64);
  const rollbackHash = "1".repeat(64);
  const reapplyHash = "2".repeat(64);
  const projectionHash = "3".repeat(64);
  return {
    ok: true,
    ready: true,
    schema: "footballscience-session-planner-staging-drill-v1",
    target: "staging",
    projectRef,
    mode: "drill",
    scope: { organizationId, teamId },
    source: { revision: sourceRevision, hash: sourceHash },
    recoveryPackageReceipt: {
      readAfterWriteVerified: true,
      containsCoachingContent: false,
    },
    firstApply: {
      bundle: { contentSha256: firstHash },
      execution: execution("backfill", firstHash),
      projectionSha256: projectionHash,
    },
    rollback: {
      bundle: { contentSha256: rollbackHash },
      execution: execution("rollback", rollbackHash),
      projectionSha256: "4".repeat(64),
    },
    reapply: {
      bundle: { contentSha256: reapplyHash },
      execution: execution("backfill", reapplyHash),
      projectionSha256: projectionHash,
    },
    containsCoachingContent: false,
  };
}

function canaryReport() {
  return {
    ok: true,
    ready: true,
    schema: "footballscience-session-planner-staging-canary-v1",
    target: "staging",
    projectRef,
    canonicalProductionProjectRef: productionProjectRef,
    appOrigin: stagingAppOrigin,
    canonicalProductionAppOrigin: productionAppOrigin,
    mode: "canary",
    source: { revision: sourceRevision, hash: sourceHash },
    users: { authenticated: 2, distinct: true },
    recoveryPackageReceipt: {
      readAfterWriteVerified: true,
      containsCoachingContent: false,
    },
    canaryWrite: { revision: sourceRevision + 1, hash: "5".repeat(64) },
    peerFreshReadVerified: true,
    staleWriteRejected: true,
    rollback: {
      verified: true,
      revision: sourceRevision + 2,
      hash: sourceHash,
    },
    containsCoachingContent: false,
  };
}

function reviewInput(overrides = {}) {
  return {
    expected: {
      target: "staging",
      projectRef,
      canonicalProductionProjectRef: productionProjectRef,
      organizationId,
      teamId,
      sourceRevision,
      sourceHash,
      stagingAppOrigin,
      canonicalProductionAppOrigin: productionAppOrigin,
    },
    review: {
      reviewerId,
      reviewedAt: "2026-07-23T11:30:00.000Z",
      expiresAt: "2026-07-23T15:30:00.000Z",
    },
    platformIdentityReport: identityReport(),
    shadowEvidenceReport: shadowReport(),
    migrationDrillReport: migrationDrillReport(),
    multiUserCanaryReport: canaryReport(),
    appStateSource: "const source = 'app-state-primary';",
    gatewaySource:
      'const fallback = { userFacingSource: "app-state", fallbackRequired: true };',
    gatewayContract:
      "falls back to the exact app-state bytes\n" +
      "remains inert until staging evidence is approved",
    ...overrides,
  };
}

test("Session Planner promotion evidence binds exact content-free staging reports", () => {
  const result = assembleSessionPlannerPromotionEvidence(reviewInput(), { now });

  expect(result).toMatchObject({
    ok: true,
    target: "staging",
    projectRef,
    scope: { organizationId, teamId },
    source: { revision: sourceRevision, hash: sourceHash },
    readyForManualReleaseReview: true,
    promotionActivated: false,
    automaticPromotion: false,
    networkCapability: false,
    writeCapability: false,
    containsCoachingContent: false,
    receipt: {
      schema: SESSION_PLANNER_READ_PROMOTION_SCHEMA,
      review: { reviewerId },
      evidence: {
        platformIdentity: { distinctUserCount: 2 },
        multiUserCanary: { distinctUserCount: 2 },
      },
    },
  });
  expect(JSON.stringify(result)).not.toContain("Training");
  expect(JSON.stringify(result)).not.toContain("coach@example.com");
});

test("Session Planner promotion evidence rejects cross-tenant and source drift", () => {
  const changedShadow = shadowReport();
  changedShadow.scope.teamId = "44444444-4444-4444-8444-444444444444";
  changedShadow.source.revision += 1;

  expect(() =>
    assembleSessionPlannerPromotionEvidence(
      reviewInput({ shadowEvidenceReport: changedShadow }),
      { now }
    )
  ).toThrow("Session Planner promotion evidence is incomplete.");
  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({ shadowEvidenceReport: changedShadow }),
      { now }
    );
  } catch (error) {
    expect(error.failureCodes).toEqual(expect.arrayContaining([
      "shadow_scope_mismatch",
    ]));
  }
});

test("Session Planner promotion evidence rejects unverified rollback and user count", () => {
  const identity = identityReport();
  identity.bundle.expectedUserCount = 1;
  identity.rollbackVerification.ok = false;
  const canary = canaryReport();
  canary.rollback.verified = false;

  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({
        platformIdentityReport: identity,
        multiUserCanaryReport: canary,
      }),
      { now }
    );
    throw new Error("Expected evidence validation to fail.");
  } catch (error) {
    expect(error.failureCodes).toEqual(expect.arrayContaining([
      "canary_recovery_unproven",
      "identity_bundle_invalid",
      "identity_rollback_verification_invalid",
    ]));
  }
});

test("Session Planner promotion evidence rejects cross-team identity proof", () => {
  const identity = identityReport();
  identity.scope.teamId = "44444444-4444-4444-8444-444444444444";
  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({ platformIdentityReport: identity }),
      { now }
    );
    throw new Error("Expected identity scope validation to fail.");
  } catch (error) {
    expect(error.failureCodes).toContain("identity_scope_mismatch");
  }
});

test("Session Planner promotion evidence rejects missing exact fallback contracts", () => {
  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({
        appStateSource: "require('session-planner-read-gateway');",
        gatewaySource: "database only",
        gatewayContract: "weak contract",
      }),
      { now }
    );
    throw new Error("Expected compatibility validation to fail.");
  } catch (error) {
    expect(error.failureCodes).toEqual(expect.arrayContaining([
      "compatibility_app_state_not_primary",
      "compatibility_contract_missing",
      "compatibility_gateway_fallback_missing",
    ]));
  }
});

test("Session Planner promotion evidence rejects coaching content and credentials", () => {
  const shadow = shadowReport();
  shadow.debug = {
    sessions: [{ title: "Private training" }],
    accessToken: "private-token",
  };
  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({ shadowEvidenceReport: shadow }),
      { now }
    );
    throw new Error("Expected content-free validation to fail.");
  } catch (error) {
    expect(error.failureCodes).toContain(
      "evidence_report_contains_sensitive_field"
    );
  }
});

test("Session Planner promotion evidence fails closed on a missing report", () => {
  try {
    assembleSessionPlannerPromotionEvidence(
      reviewInput({ platformIdentityReport: null }),
      { now }
    );
    throw new Error("Expected missing evidence to fail.");
  } catch (error) {
    expect(error.failureCodes).toContain("evidence_report_invalid");
    expect(error.failureCodes).toContain("identity_report_schema_invalid");
  }
});

function commandOptions(overrides = {}) {
  return {
    target: "staging",
    projectRef,
    canonicalProductionProjectRef: productionProjectRef,
    organizationId,
    teamId,
    sourceRevision,
    sourceHash,
    stagingAppOrigin,
    canonicalProductionAppOrigin: productionAppOrigin,
    reviewerId,
    reviewedAt: "2026-07-23T11:30:00.000Z",
    expiresAt: "2026-07-23T15:30:00.000Z",
    identityReportPath: "identity.json",
    shadowReportPath: "shadow.json",
    drillReportPath: "drill.json",
    canaryReportPath: "canary.json",
    forbiddenCapability: "",
    ...overrides,
  };
}

test("Session Planner promotion review CLI is local, read-only, and deterministic", async () => {
  const reports = new Map([
    ["identity.json", identityReport()],
    ["shadow.json", shadowReport()],
    ["drill.json", migrationDrillReport()],
    ["canary.json", canaryReport()],
  ]);
  const jsonReads = [];
  const sourceReads = [];
  const result = await executeSessionPlannerPromotionReview(
    commandOptions(),
    {
      now: () => now,
      readJson: async (filePath) => {
        jsonReads.push(filePath);
        return structuredClone(reports.get(filePath));
      },
      readText: async (filePath) => {
        sourceReads.push(filePath);
        if (filePath.endsWith("api/app-state.js")) {
          return "const source = 'app-state-primary';";
        }
        if (filePath.endsWith("session-planner-read-gateway.js")) {
          return 'userFacingSource: "app-state"; fallbackRequired: true;';
        }
        return "falls back to the exact app-state bytes\n" +
          "remains inert until staging evidence is approved";
      },
    }
  );

  expect(result).toMatchObject({
    ok: true,
    mode: "review-only",
    reportFilesRead: 4,
    fixedCompatibilitySourcesRead: 3,
    promotionActivated: false,
    networkCapability: false,
    writeCapability: false,
  });
  expect(jsonReads).toEqual([
    "identity.json",
    "shadow.json",
    "drill.json",
    "canary.json",
  ]);
  expect(sourceReads).toHaveLength(3);
});

test("Session Planner promotion review CLI refuses mutating capabilities", () => {
  const parsed = parseSessionPlannerPromotionReviewArgs(
    ["--apply", "--identity-report", "identity.json"],
    {}
  );
  expect(parsed.forbiddenCapability).toBe("--apply");
  expect(validateSessionPlannerPromotionReviewOptions(parsed)).toContain(
    "promotion review has no apply, activate, write, or deploy capability"
  );

  const source = readFileSync(
    new URL("../scripts/session-planner-promotion-review.mjs", import.meta.url),
    "utf8"
  );
  expect(source).not.toContain("writeFile");
  expect(source).not.toContain("serviceRoleKey");
  expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(source).not.toContain("fetch(");
});
