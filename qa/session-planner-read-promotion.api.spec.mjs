import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const { hashJsonValue } = require("../api/_lib/session-planner-domain-records.js");
const {
  SESSION_PLANNER_READ_PROMOTION_SCHEMA,
  evaluateSessionPlannerReadPromotion,
  sealSessionPlannerReadPromotion,
} = require("../api/_lib/session-planner-read-promotion.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const sourceHash = "a".repeat(64);
const snapshotHash = "b".repeat(64);
const identityReportHash = "c".repeat(64);
const shadowReportHash = "d".repeat(64);
const drillReportHash = "e".repeat(64);
const canaryReportHash = "f".repeat(64);
const reviewerId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-23T12:00:00.000Z");

function promotionEvidence() {
  const compatibilityBody = {
    appStatePrimary: true,
    fallbackEnabled: true,
    snapshotVerified: true,
    restoreVerified: true,
    appStateSourceSha256: "1".repeat(64),
    gatewaySourceSha256: "2".repeat(64),
    gatewayContractSha256: "3".repeat(64),
    canaryReportSha256: canaryReportHash,
  };
  const compatibility = {
    ...compatibilityBody,
    evidenceSha256: hashJsonValue(compatibilityBody),
  };
  const manifest = {
    platformIdentityReportSha256: identityReportHash,
    shadowReportSha256: shadowReportHash,
    migrationDrillReportSha256: drillReportHash,
    multiUserCanaryReportSha256: canaryReportHash,
    compatibilityEvidenceSha256: compatibility.evidenceSha256,
  };
  return {
    platformIdentity: {
      passed: true,
      rollbackVerified: true,
      distinctUserCount: 2,
      reportSha256: identityReportHash,
    },
    shadow: {
      passed: true,
      reportCount: 3,
      observationSpanMs: 10 * 60 * 1000,
      snapshotContentSha256: snapshotHash,
      reportSha256: shadowReportHash,
    },
    migrationDrill: {
      passed: true,
      applyVerified: true,
      rollbackVerified: true,
      reapplyVerified: true,
      recoveryPackageVerified: true,
      reportSha256: drillReportHash,
    },
    multiUserCanary: {
      passed: true,
      distinctUserCount: 2,
      immediateReloadVerified: true,
      staleWriteRejected: true,
      cleanupVerified: true,
      recoveryPackageVerified: true,
      reportSha256: canaryReportHash,
    },
    compatibility,
    manifestSha256: hashJsonValue(manifest),
  };
}

function promotionInput(overrides = {}) {
  return {
    target: "staging",
    projectRef: "stageproject123",
    canonicalProductionProjectRef: "prodproject456",
    scope: { organizationId, teamId },
    source: {
      storageKey: "football-session-planner-v3",
      revision: 301,
      hash: sourceHash,
    },
    evidence: promotionEvidence(),
    review: {
      reviewerId,
      reviewedAt: "2026-07-23T11:30:00.000Z",
      expiresAt: "2026-07-23T15:30:00.000Z",
    },
    ...overrides,
  };
}

function expectedFor(receipt, overrides = {}) {
  return {
    target: "staging",
    projectRef: "stageproject123",
    canonicalProductionProjectRef: "prodproject456",
    organizationId,
    teamId,
    sourceRevision: 301,
    sourceHash,
    receiptSha256: receipt.integrity.contentSha256,
    ...overrides,
  };
}

function rehash(receipt) {
  const body = structuredClone(receipt);
  delete body.integrity;
  return {
    ...body,
    integrity: {
      algorithm: "sha256",
      contentSha256: hashJsonValue(body),
    },
  };
}

test("Session Planner promotion receipt binds every required staging proof", () => {
  const receipt = sealSessionPlannerReadPromotion(promotionInput(), { now });
  const result = evaluateSessionPlannerReadPromotion(
    receipt,
    expectedFor(receipt),
    { now }
  );

  expect(receipt).toMatchObject({
    schema: SESSION_PLANNER_READ_PROMOTION_SCHEMA,
    target: "staging",
    projectRef: "stageproject123",
    scope: { organizationId, teamId },
    source: {
      storageKey: "football-session-planner-v3",
      revision: 301,
      hash: sourceHash,
    },
    integrity: {
      algorithm: "sha256",
    },
    review: { reviewerId },
  });
  expect(result).toMatchObject({
    ok: true,
    evidencePassed: true,
    promotionAllowed: true,
    promotionBlocked: false,
    automaticPromotion: false,
    containsCoachingContent: false,
    failureCodes: [],
  });
  expect(JSON.stringify(result)).not.toContain("Training");
});

test("Session Planner promotion rejects tampering even when the outer shape remains valid", () => {
  const receipt = sealSessionPlannerReadPromotion(promotionInput(), { now });
  const tampered = structuredClone(receipt);
  tampered.schema = "footballscience-session-planner-read-promotion-v0";
  tampered.source.revision = 302;
  const result = evaluateSessionPlannerReadPromotion(
    tampered,
    expectedFor(receipt),
    { now }
  );

  expect(result.ok).toBe(false);
  expect(result.failureCodes).toContain("promotion_integrity_invalid");
  expect(result.failureCodes).toContain("promotion_schema_invalid");
  expect(result.failureCodes).toContain("promotion_source_revision_mismatch");
});

test("Session Planner promotion cannot weaken shadow or multi-user evidence and rehash it", () => {
  const receipt = sealSessionPlannerReadPromotion(promotionInput(), { now });
  const weakened = structuredClone(receipt);
  weakened.evidence.shadow.reportCount = 2;
  weakened.evidence.multiUserCanary.staleWriteRejected = false;
  const rehashed = rehash(weakened);
  const result = evaluateSessionPlannerReadPromotion(
    rehashed,
    expectedFor(rehashed),
    { now }
  );

  expect(result.ok).toBe(false);
  expect(result.failureCodes).toContain("promotion_shadow_evidence_unproven");
  expect(result.failureCodes).toContain("promotion_multi_user_canary_unproven");
});

test("Session Planner promotion stays bound to the exact source checkpoint and project", () => {
  const receipt = sealSessionPlannerReadPromotion(promotionInput(), { now });
  const result = evaluateSessionPlannerReadPromotion(
    receipt,
    expectedFor(receipt, {
      projectRef: "anotherstage123",
      sourceRevision: 302,
      sourceHash: "c".repeat(64),
    }),
    { now }
  );

  expect(result.ok).toBe(false);
  expect(result.failureCodes).toEqual(expect.arrayContaining([
    "promotion_project_mismatch",
    "promotion_source_hash_mismatch",
    "promotion_source_revision_mismatch",
  ]));
});

test("Session Planner promotion expires quickly and cannot target production", () => {
  const receipt = sealSessionPlannerReadPromotion(promotionInput(), { now });
  const expired = evaluateSessionPlannerReadPromotion(
    receipt,
    expectedFor(receipt),
    { now: new Date("2026-07-23T16:00:00.000Z") }
  );

  expect(expired.ok).toBe(false);
  expect(expired.failureCodes).toContain("promotion_review_window_invalid");
  expect(() =>
    sealSessionPlannerReadPromotion(
      promotionInput({
        target: "production",
        projectRef: "prodproject456",
        canonicalProductionProjectRef: "prodproject456",
      }),
      { now }
    )
  ).toThrow("Session Planner read promotion evidence is incomplete.");
});
