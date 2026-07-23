const { hashJsonValue } = require("./session-planner-domain-records.js");
const {
  SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_REPORTS,
  SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_SPAN_MS,
  sealSessionPlannerReadPromotion,
} = require("./session-planner-read-promotion.js");
const {
  SHA256_PATTERN,
  addFailure,
  expectedScope,
  normalizeInteger,
  normalizeText,
  validateContentFreeReport,
  validateExpected,
} = require("./session-planner-promotion-evidence-safety.js");

const SESSION_PLANNER_PROMOTION_EVIDENCE_SCHEMA =
  "footballscience-session-planner-promotion-evidence-v1";
const PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA =
  "footballscience-platform-identity-staging-drill-v1";
const SESSION_PLANNER_SHADOW_EVIDENCE_SCHEMA =
  "footballscience-session-planner-shadow-evidence-v1";
const SESSION_PLANNER_STAGING_DRILL_SCHEMA =
  "footballscience-session-planner-staging-drill-v1";
const SESSION_PLANNER_STAGING_CANARY_SCHEMA =
  "footballscience-session-planner-staging-canary-v1";
function validatePlatformIdentity(report, expected, failures) {
  const bundle = report?.bundle || {};
  const rollback = report?.rollback || {};
  addFailure(
    failures,
    report?.schema === PLATFORM_IDENTITY_STAGING_DRILL_SCHEMA,
    "identity_report_schema_invalid"
  );
  addFailure(
    failures,
    report?.ok === true &&
      report?.dryRun === false &&
      report?.applied === true &&
      report?.rolledBack === true &&
      report?.recoveryRequired === false &&
      report?.piiExposed === false,
    "identity_execution_unproven"
  );
  addFailure(
    failures,
    report?.target === "staging" &&
      normalizeText(report?.projectRef, 80) === expected.projectRef &&
      sameTenant(report, expected),
    "identity_scope_mismatch"
  );
  addFailure(
    failures,
    bundle.ok === true &&
      bundle.target === "staging" &&
      normalizeText(bundle.projectRef, 80) === expected.projectRef &&
      normalizeText(bundle.organizationId) === expected.organizationId &&
      normalizeInteger(bundle.expectedUserCount) >= 2 &&
      SHA256_PATTERN.test(bundle.planSha256 || "") &&
      SHA256_PATTERN.test(bundle.snapshotSha256 || "") &&
      SHA256_PATTERN.test(bundle.contentSha256 || "") &&
      bundle.piiExposed === false,
    "identity_bundle_invalid"
  );
  addFailure(
    failures,
    report?.applyReceipt?.ok === true &&
      report.applyReceipt.operation === "backfill" &&
      report.applyReceipt.bundleSha256 === bundle.contentSha256 &&
      normalizeInteger(report.applyReceipt.appliedCount) ===
        normalizeInteger(bundle.commandCount) &&
      report.applyReceipt.piiExposed === false,
    "identity_apply_receipt_invalid"
  );
  addFailure(
    failures,
    rollback.ok === true &&
      normalizeInteger(rollback.blockerCount) === 0 &&
      report?.rollbackReceipt?.ok === true &&
      report.rollbackReceipt.operation === "rollback" &&
      normalizeInteger(report.rollbackReceipt.appliedCount) ===
        normalizeInteger(rollback.actionCount) &&
      report.rollbackReceipt.piiExposed === false,
    "identity_rollback_receipt_invalid"
  );
  addFailure(
    failures,
    report?.rollbackVerification?.ok === true &&
      Array.isArray(report.rollbackVerification.blockers) &&
      report.rollbackVerification.blockers.length === 0 &&
      normalizeInteger(report?.audit?.backfillEvents) ===
        normalizeInteger(bundle.commandCount) &&
      normalizeInteger(report?.audit?.rollbackEvents) ===
        normalizeInteger(rollback.actionCount),
    "identity_rollback_verification_invalid"
  );
}

function sameCheckpoint(report, expected) {
  return (
    normalizeInteger(report?.source?.revision) === expected.sourceRevision &&
    normalizeText(report?.source?.hash, 64) === expected.sourceHash
  );
}

function sameTenant(report, expected) {
  return (
    normalizeText(report?.scope?.organizationId) === expected.organizationId &&
    normalizeText(report?.scope?.teamId) === expected.teamId
  );
}

function validateShadow(report, expected, failures) {
  const evidence = report?.evidence || {};
  addFailure(
    failures,
    report?.schema === SESSION_PLANNER_SHADOW_EVIDENCE_SCHEMA,
    "shadow_report_schema_invalid"
  );
  addFailure(
    failures,
    report?.ok === true &&
      report?.evidencePassed === true &&
      report?.readyForManualReview === true &&
      report?.promotionBlocked === true &&
      report?.automaticPromotion === false &&
      report?.writeCapability === false &&
      report?.containsCoachingContent === false &&
      Array.isArray(report?.failureCodes) &&
      report.failureCodes.length === 0,
    "shadow_evidence_unproven"
  );
  addFailure(
    failures,
    report?.target === "staging" &&
      normalizeText(report?.projectRef, 80) === expected.projectRef &&
      sameTenant(report, expected) &&
      sameCheckpoint(report, expected),
    "shadow_scope_mismatch"
  );
  addFailure(
    failures,
    normalizeInteger(evidence.reportCount) >=
      SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_REPORTS &&
      normalizeInteger(evidence.validReportCount) ===
        normalizeInteger(evidence.reportCount) &&
      normalizeInteger(evidence.distinctReportCount) ===
        normalizeInteger(evidence.reportCount) &&
      normalizeInteger(evidence.observationSpanMs) >=
        SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_SPAN_MS &&
      SHA256_PATTERN.test(evidence.snapshotContentSha256 || ""),
    "shadow_evidence_counts_invalid"
  );
}

function validExecution(execution, operation, bundle, expected) {
  return (
    execution?.ok === true &&
    execution.operation === operation &&
    execution.projectRef === expected.projectRef &&
    execution.bundleSha256 === bundle?.contentSha256 &&
    execution.containsCoachingContent === false
  );
}

function validateMigrationDrill(report, expected, failures) {
  addFailure(
    failures,
    report?.schema === SESSION_PLANNER_STAGING_DRILL_SCHEMA,
    "migration_drill_schema_invalid"
  );
  addFailure(
    failures,
    report?.ok === true &&
      report?.ready === true &&
      report?.mode === "drill" &&
      report?.target === "staging" &&
      normalizeText(report?.projectRef, 80) === expected.projectRef &&
      sameTenant(report, expected) &&
      sameCheckpoint(report, expected) &&
      report?.containsCoachingContent === false,
    "migration_drill_scope_invalid"
  );
  addFailure(
    failures,
    report?.recoveryPackageReceipt?.readAfterWriteVerified === true &&
      report.recoveryPackageReceipt.containsCoachingContent === false,
    "migration_drill_recovery_invalid"
  );
  addFailure(
    failures,
    validExecution(
      report?.firstApply?.execution,
      "backfill",
      report?.firstApply?.bundle,
      expected
    ) &&
      validExecution(
        report?.rollback?.execution,
        "rollback",
        report?.rollback?.bundle,
        expected
      ) &&
      validExecution(
        report?.reapply?.execution,
        "backfill",
        report?.reapply?.bundle,
        expected
      ),
    "migration_drill_execution_invalid"
  );
  addFailure(
    failures,
    SHA256_PATTERN.test(report?.firstApply?.projectionSha256 || "") &&
      report.firstApply.projectionSha256 ===
        report?.reapply?.projectionSha256 &&
      SHA256_PATTERN.test(report?.rollback?.projectionSha256 || ""),
    "migration_drill_projection_invalid"
  );
}

function validateCanary(report, expected, failures) {
  addFailure(
    failures,
    report?.schema === SESSION_PLANNER_STAGING_CANARY_SCHEMA,
    "canary_report_schema_invalid"
  );
  addFailure(
    failures,
    report?.ok === true &&
      report?.ready === true &&
      report?.mode === "canary" &&
      report?.target === "staging" &&
      normalizeText(report?.projectRef, 80) === expected.projectRef &&
      normalizeText(report?.canonicalProductionProjectRef, 80) ===
        expected.canonicalProductionProjectRef &&
      String(report?.appOrigin || "").replace(/\/$/, "") ===
        expected.stagingAppOrigin &&
      String(report?.canonicalProductionAppOrigin || "").replace(/\/$/, "") ===
        expected.canonicalProductionAppOrigin &&
      sameCheckpoint(report, expected) &&
      report?.containsCoachingContent === false,
    "canary_scope_invalid"
  );
  addFailure(
    failures,
    normalizeInteger(report?.users?.authenticated) >= 2 &&
      report?.users?.distinct === true &&
      report?.peerFreshReadVerified === true &&
      report?.staleWriteRejected === true,
    "canary_multi_user_unproven"
  );
  addFailure(
    failures,
    report?.recoveryPackageReceipt?.readAfterWriteVerified === true &&
      report.recoveryPackageReceipt.containsCoachingContent === false &&
      report?.rollback?.verified === true &&
      report.rollback.hash === expected.sourceHash &&
      normalizeInteger(report.rollback.revision) >
        normalizeInteger(report?.canaryWrite?.revision),
    "canary_recovery_unproven"
  );
}

function compatibilityEvidence(input, canarySha256) {
  const body = {
    appStatePrimary: true,
    fallbackEnabled: true,
    snapshotVerified: true,
    restoreVerified: true,
    appStateSourceSha256: hashJsonValue(String(input.appStateSource || "")),
    gatewaySourceSha256: hashJsonValue(String(input.gatewaySource || "")),
    gatewayContractSha256: hashJsonValue(String(input.gatewayContract || "")),
    canaryReportSha256: canarySha256,
  };
  return { ...body, evidenceSha256: hashJsonValue(body) };
}

function validateCompatibilitySources(input, failures) {
  addFailure(
    failures,
    !String(input.appStateSource || "").includes("session-planner-read-gateway"),
    "compatibility_app_state_not_primary"
  );
  addFailure(
    failures,
    String(input.gatewaySource || "").includes("userFacingSource: \"app-state\"") &&
      String(input.gatewaySource || "").includes("fallbackRequired: true"),
    "compatibility_gateway_fallback_missing"
  );
  addFailure(
    failures,
    String(input.gatewayContract || "").includes(
      "falls back to the exact app-state bytes"
    ) &&
      String(input.gatewayContract || "").includes(
        "remains inert until staging evidence is approved"
      ),
    "compatibility_contract_missing"
  );
}

function throwEvidenceError(failures) {
  const failureCodes = [...failures].sort();
  const error = new Error("Session Planner promotion evidence is incomplete.");
  error.code = failureCodes[0] || "promotion_evidence_invalid";
  error.failureCodes = failureCodes;
  throw error;
}

function assembleSessionPlannerPromotionEvidence(input = {}, options = {}) {
  const expected = expectedScope(input.expected);
  const failures = new Set();
  validateExpected(expected, failures);
  [
    input.platformIdentityReport,
    input.shadowEvidenceReport,
    input.migrationDrillReport,
    input.multiUserCanaryReport,
  ].forEach((report) => validateContentFreeReport(report, failures));
  validatePlatformIdentity(input.platformIdentityReport, expected, failures);
  validateShadow(input.shadowEvidenceReport, expected, failures);
  validateMigrationDrill(input.migrationDrillReport, expected, failures);
  validateCanary(input.multiUserCanaryReport, expected, failures);
  validateCompatibilitySources(input, failures);
  if (failures.size) throwEvidenceError(failures);

  const reportHashes = {
    platformIdentity: hashJsonValue(input.platformIdentityReport),
    shadow: hashJsonValue(input.shadowEvidenceReport),
    migrationDrill: hashJsonValue(input.migrationDrillReport),
    multiUserCanary: hashJsonValue(input.multiUserCanaryReport),
  };
  const compatibility = compatibilityEvidence(
    input,
    reportHashes.multiUserCanary
  );
  const evidenceManifest = {
    platformIdentityReportSha256: reportHashes.platformIdentity,
    shadowReportSha256: reportHashes.shadow,
    migrationDrillReportSha256: reportHashes.migrationDrill,
    multiUserCanaryReportSha256: reportHashes.multiUserCanary,
    compatibilityEvidenceSha256: compatibility.evidenceSha256,
  };
  const receipt = sealSessionPlannerReadPromotion({
    target: expected.target,
    projectRef: expected.projectRef,
    canonicalProductionProjectRef: expected.canonicalProductionProjectRef,
    scope: {
      organizationId: expected.organizationId,
      teamId: expected.teamId,
    },
    source: {
      storageKey: "football-session-planner-v3",
      revision: expected.sourceRevision,
      hash: expected.sourceHash,
    },
    evidence: {
      platformIdentity: {
        passed: true,
        rollbackVerified: true,
        distinctUserCount:
          input.platformIdentityReport.bundle.expectedUserCount,
        reportSha256: reportHashes.platformIdentity,
      },
      shadow: {
        passed: true,
        reportCount:
          input.shadowEvidenceReport.evidence.reportCount,
        observationSpanMs:
          input.shadowEvidenceReport.evidence.observationSpanMs,
        snapshotContentSha256:
          input.shadowEvidenceReport.evidence.snapshotContentSha256,
        reportSha256: reportHashes.shadow,
      },
      migrationDrill: {
        passed: true,
        applyVerified: true,
        rollbackVerified: true,
        reapplyVerified: true,
        recoveryPackageVerified: true,
        reportSha256: reportHashes.migrationDrill,
      },
      multiUserCanary: {
        passed: true,
        distinctUserCount:
          input.multiUserCanaryReport.users.authenticated,
        immediateReloadVerified: true,
        staleWriteRejected: true,
        cleanupVerified: true,
        recoveryPackageVerified: true,
        reportSha256: reportHashes.multiUserCanary,
      },
      compatibility,
      manifestSha256: hashJsonValue(evidenceManifest),
    },
    review: {
      reviewerId: input.review?.reviewerId,
      reviewedAt: input.review?.reviewedAt,
      expiresAt: input.review?.expiresAt,
    },
  }, options);

  return Object.freeze({
    ok: true,
    schema: SESSION_PLANNER_PROMOTION_EVIDENCE_SCHEMA,
    target: expected.target,
    projectRef: expected.projectRef,
    scope: Object.freeze({
      organizationId: expected.organizationId,
      teamId: expected.teamId,
    }),
    source: Object.freeze({
      revision: expected.sourceRevision,
      hash: expected.sourceHash,
    }),
    receipt,
    readyForManualReleaseReview: true,
    promotionActivated: false,
    automaticPromotion: false,
    networkCapability: false,
    writeCapability: false,
    containsCoachingContent: false,
  });
}

module.exports = {
  SESSION_PLANNER_PROMOTION_EVIDENCE_SCHEMA,
  assembleSessionPlannerPromotionEvidence,
};
