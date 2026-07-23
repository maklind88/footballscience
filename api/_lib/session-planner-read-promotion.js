const { hashJsonValue } = require("./session-planner-domain-records.js");

const SESSION_PLANNER_READ_PROMOTION_SCHEMA =
  "footballscience-session-planner-read-promotion-v1";
const SESSION_PLANNER_READ_PROMOTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_REPORTS = 3;
const SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_SPAN_MS = 10 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

function normalizeText(value, maxLength = 120) {
  return String(value || "").trim().toLowerCase().slice(0, maxLength);
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : 0;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createPromotionBody(input = {}) {
  return {
    schema: Object.prototype.hasOwnProperty.call(input, "schema")
      ? String(input.schema)
      : SESSION_PLANNER_READ_PROMOTION_SCHEMA,
    target: normalizeText(input.target, 40),
    projectRef: normalizeText(input.projectRef, 80),
    canonicalProductionProjectRef: normalizeText(
      input.canonicalProductionProjectRef,
      80
    ),
    scope: {
      organizationId: normalizeText(input.scope?.organizationId),
      teamId: normalizeText(input.scope?.teamId),
    },
    source: {
      storageKey: normalizeText(input.source?.storageKey, 180),
      revision: normalizeInteger(input.source?.revision),
      hash: normalizeText(input.source?.hash, 64),
    },
    evidence: {
      platformIdentity: {
        passed: normalizeBoolean(input.evidence?.platformIdentity?.passed),
        rollbackVerified: normalizeBoolean(
          input.evidence?.platformIdentity?.rollbackVerified
        ),
        distinctUserCount: normalizeInteger(
          input.evidence?.platformIdentity?.distinctUserCount
        ),
      },
      shadow: {
        passed: normalizeBoolean(input.evidence?.shadow?.passed),
        reportCount: normalizeInteger(input.evidence?.shadow?.reportCount),
        observationSpanMs: normalizeInteger(
          input.evidence?.shadow?.observationSpanMs
        ),
        snapshotContentSha256: normalizeText(
          input.evidence?.shadow?.snapshotContentSha256,
          64
        ),
      },
      migrationDrill: {
        passed: normalizeBoolean(input.evidence?.migrationDrill?.passed),
        applyVerified: normalizeBoolean(
          input.evidence?.migrationDrill?.applyVerified
        ),
        rollbackVerified: normalizeBoolean(
          input.evidence?.migrationDrill?.rollbackVerified
        ),
        reapplyVerified: normalizeBoolean(
          input.evidence?.migrationDrill?.reapplyVerified
        ),
        recoveryPackageVerified: normalizeBoolean(
          input.evidence?.migrationDrill?.recoveryPackageVerified
        ),
      },
      multiUserCanary: {
        passed: normalizeBoolean(input.evidence?.multiUserCanary?.passed),
        distinctUserCount: normalizeInteger(
          input.evidence?.multiUserCanary?.distinctUserCount
        ),
        immediateReloadVerified: normalizeBoolean(
          input.evidence?.multiUserCanary?.immediateReloadVerified
        ),
        staleWriteRejected: normalizeBoolean(
          input.evidence?.multiUserCanary?.staleWriteRejected
        ),
        cleanupVerified: normalizeBoolean(
          input.evidence?.multiUserCanary?.cleanupVerified
        ),
        recoveryPackageVerified: normalizeBoolean(
          input.evidence?.multiUserCanary?.recoveryPackageVerified
        ),
      },
      compatibility: {
        appStatePrimary: normalizeBoolean(
          input.evidence?.compatibility?.appStatePrimary
        ),
        fallbackEnabled: normalizeBoolean(
          input.evidence?.compatibility?.fallbackEnabled
        ),
        snapshotVerified: normalizeBoolean(
          input.evidence?.compatibility?.snapshotVerified
        ),
        restoreVerified: normalizeBoolean(
          input.evidence?.compatibility?.restoreVerified
        ),
      },
    },
    review: {
      reviewedAt: String(input.review?.reviewedAt || ""),
      expiresAt: String(input.review?.expiresAt || ""),
    },
  };
}

function validatePromotionBody(body, options = {}) {
  const failures = new Set();
  const now = normalizeDate(options.now || new Date());
  const reviewedAt = normalizeDate(body.review?.reviewedAt);
  const expiresAt = normalizeDate(body.review?.expiresAt);

  if (body.schema !== SESSION_PLANNER_READ_PROMOTION_SCHEMA) {
    failures.add("promotion_schema_invalid");
  }
  if (body.target !== "staging") failures.add("promotion_target_not_staging");
  if (!PROJECT_REF_PATTERN.test(body.projectRef)) {
    failures.add("promotion_project_ref_invalid");
  }
  if (
    !PROJECT_REF_PATTERN.test(body.canonicalProductionProjectRef) ||
    body.canonicalProductionProjectRef === body.projectRef
  ) {
    failures.add("promotion_production_separation_invalid");
  }
  if (!UUID_PATTERN.test(body.scope?.organizationId)) {
    failures.add("promotion_organization_invalid");
  }
  if (!UUID_PATTERN.test(body.scope?.teamId)) {
    failures.add("promotion_team_invalid");
  }
  if (body.source?.storageKey !== "football-session-planner-v3") {
    failures.add("promotion_source_key_invalid");
  }
  if (normalizeInteger(body.source?.revision) < 1) {
    failures.add("promotion_source_revision_invalid");
  }
  if (!SHA256_PATTERN.test(body.source?.hash || "")) {
    failures.add("promotion_source_hash_invalid");
  }

  const identity = body.evidence?.platformIdentity || {};
  if (
    identity.passed !== true ||
    identity.rollbackVerified !== true ||
    normalizeInteger(identity.distinctUserCount) < 2
  ) {
    failures.add("promotion_platform_identity_unproven");
  }

  const shadow = body.evidence?.shadow || {};
  if (
    shadow.passed !== true ||
    normalizeInteger(shadow.reportCount) < SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_REPORTS ||
    normalizeInteger(shadow.observationSpanMs) <
      SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_SPAN_MS ||
    !SHA256_PATTERN.test(shadow.snapshotContentSha256 || "")
  ) {
    failures.add("promotion_shadow_evidence_unproven");
  }

  const drill = body.evidence?.migrationDrill || {};
  if (
    drill.passed !== true ||
    drill.applyVerified !== true ||
    drill.rollbackVerified !== true ||
    drill.reapplyVerified !== true ||
    drill.recoveryPackageVerified !== true
  ) {
    failures.add("promotion_migration_drill_unproven");
  }

  const canary = body.evidence?.multiUserCanary || {};
  if (
    canary.passed !== true ||
    normalizeInteger(canary.distinctUserCount) < 2 ||
    canary.immediateReloadVerified !== true ||
    canary.staleWriteRejected !== true ||
    canary.cleanupVerified !== true ||
    canary.recoveryPackageVerified !== true
  ) {
    failures.add("promotion_multi_user_canary_unproven");
  }

  const compatibility = body.evidence?.compatibility || {};
  if (
    compatibility.appStatePrimary !== true ||
    compatibility.fallbackEnabled !== true ||
    compatibility.snapshotVerified !== true ||
    compatibility.restoreVerified !== true
  ) {
    failures.add("promotion_compatibility_fallback_unproven");
  }

  if (!now || !reviewedAt || !expiresAt) {
    failures.add("promotion_review_window_invalid");
  } else {
    const ageMs = now.getTime() - reviewedAt.getTime();
    const lifetimeMs = expiresAt.getTime() - reviewedAt.getTime();
    if (
      ageMs < 0 ||
      lifetimeMs <= 0 ||
      lifetimeMs > SESSION_PLANNER_READ_PROMOTION_MAX_AGE_MS ||
      now.getTime() >= expiresAt.getTime()
    ) {
      failures.add("promotion_review_window_invalid");
    }
  }

  return [...failures].sort();
}

function sealSessionPlannerReadPromotion(input = {}, options = {}) {
  const body = createPromotionBody(input);
  const failureCodes = validatePromotionBody(body, options);
  if (failureCodes.length) {
    const error = new Error("Session Planner read promotion evidence is incomplete.");
    error.code = failureCodes[0];
    error.failureCodes = failureCodes;
    throw error;
  }
  return Object.freeze({
    ...body,
    integrity: Object.freeze({
      algorithm: "sha256",
      contentSha256: hashJsonValue(body),
    }),
  });
}

function evaluateSessionPlannerReadPromotion(receipt = {}, expected = {}, options = {}) {
  const body = createPromotionBody(receipt);
  const failures = new Set(validatePromotionBody(body, options));
  const actualHash = hashJsonValue(body);
  const receiptHash = normalizeText(receipt.integrity?.contentSha256, 64);
  const expectedHash = normalizeText(expected.receiptSha256, 64);

  if (
    receipt.integrity?.algorithm !== "sha256" ||
    !SHA256_PATTERN.test(receiptHash) ||
    receiptHash !== actualHash
  ) {
    failures.add("promotion_integrity_invalid");
  }
  if (!SHA256_PATTERN.test(expectedHash) || expectedHash !== receiptHash) {
    failures.add("promotion_receipt_not_reviewed");
  }
  if (normalizeText(expected.target, 40) !== body.target) {
    failures.add("promotion_target_mismatch");
  }
  if (normalizeText(expected.projectRef, 80) !== body.projectRef) {
    failures.add("promotion_project_mismatch");
  }
  if (
    normalizeText(expected.canonicalProductionProjectRef, 80) !==
    body.canonicalProductionProjectRef
  ) {
    failures.add("promotion_production_project_mismatch");
  }
  if (normalizeText(expected.organizationId) !== body.scope.organizationId) {
    failures.add("promotion_organization_mismatch");
  }
  if (normalizeText(expected.teamId) !== body.scope.teamId) {
    failures.add("promotion_team_mismatch");
  }
  if (normalizeInteger(expected.sourceRevision) !== body.source.revision) {
    failures.add("promotion_source_revision_mismatch");
  }
  if (normalizeText(expected.sourceHash, 64) !== body.source.hash) {
    failures.add("promotion_source_hash_mismatch");
  }

  const failureCodes = Object.freeze([...failures].sort());
  const ok = failureCodes.length === 0;
  return Object.freeze({
    ok,
    schema: SESSION_PLANNER_READ_PROMOTION_SCHEMA,
    target: body.target,
    projectRef: body.projectRef,
    scope: Object.freeze({ ...body.scope }),
    source: Object.freeze({ ...body.source }),
    receiptSha256: receiptHash || null,
    reviewedAt: body.review.reviewedAt || null,
    expiresAt: body.review.expiresAt || null,
    evidencePassed: ok,
    promotionAllowed: ok,
    promotionBlocked: !ok,
    automaticPromotion: false,
    failureCodes,
    containsCoachingContent: false,
  });
}

module.exports = {
  SESSION_PLANNER_READ_PROMOTION_MAX_AGE_MS,
  SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_REPORTS,
  SESSION_PLANNER_READ_PROMOTION_MIN_SHADOW_SPAN_MS,
  SESSION_PLANNER_READ_PROMOTION_SCHEMA,
  evaluateSessionPlannerReadPromotion,
  sealSessionPlannerReadPromotion,
};
