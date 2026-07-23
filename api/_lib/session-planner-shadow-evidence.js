const SESSION_PLANNER_SHADOW_EVIDENCE_SCHEMA =
  "footballscience-session-planner-shadow-evidence-v1";
const SESSION_PLANNER_SHADOW_CHECK_SCHEMA =
  "footballscience-session-planner-shadow-check-v1";
const HARD_MINIMUM_REPORTS = 3;
const HARD_MINIMUM_SPAN_MS = 5 * 60 * 1000;
const DEFAULT_MINIMUM_SPAN_MS = 10 * 60 * 1000;
const DEFAULT_MAXIMUM_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_FUTURE_SKEW_MS = 30 * 1000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

function normalizeText(value, maxLength = 120) {
  return String(value || "").trim().toLowerCase().slice(0, maxLength);
}

function finiteInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function resolveNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  const date = candidate instanceof Date
    ? new Date(candidate.getTime())
    : candidate
      ? new Date(candidate)
      : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Session Planner shadow evidence requires a valid evaluation time.");
  }
  return date;
}

function createPolicy(options = {}) {
  const configuredMinimumReports = finiteInteger(
    options.minimumReports,
    HARD_MINIMUM_REPORTS
  );
  const configuredMinimumSpanMs = finiteInteger(
    options.minimumSpanMs,
    DEFAULT_MINIMUM_SPAN_MS
  );
  return Object.freeze({
    configuredMinimumReports,
    configuredMinimumSpanMs,
    effective: Object.freeze({
      minimumReports: Math.max(HARD_MINIMUM_REPORTS, configuredMinimumReports),
      minimumSpanMs: Math.max(HARD_MINIMUM_SPAN_MS, configuredMinimumSpanMs),
      maximumAgeMs: finiteInteger(options.maximumAgeMs, DEFAULT_MAXIMUM_AGE_MS),
      futureSkewMs: finiteInteger(options.futureSkewMs, DEFAULT_FUTURE_SKEW_MS),
    }),
  });
}

function addFailure(failures, code) {
  failures.add(code);
}

function validateConfiguration(expected, policyConfiguration, failures) {
  const policy = policyConfiguration.effective;
  if (expected.target !== "staging") addFailure(failures, "target_not_staging");
  if (!PROJECT_REF_PATTERN.test(expected.projectRef)) {
    addFailure(failures, "project_ref_invalid");
  }
  if (!UUID_PATTERN.test(expected.organizationId)) {
    addFailure(failures, "organization_id_invalid");
  }
  if (!UUID_PATTERN.test(expected.teamId)) addFailure(failures, "team_id_invalid");
  if (!Number.isInteger(expected.sourceRevision) || expected.sourceRevision < 1) {
    addFailure(failures, "source_revision_invalid");
  }
  if (!SHA256_PATTERN.test(expected.sourceHash)) {
    addFailure(failures, "source_hash_invalid");
  }
  if (policyConfiguration.configuredMinimumReports < HARD_MINIMUM_REPORTS) {
    addFailure(failures, "minimum_reports_policy_weakened");
  }
  if (policyConfiguration.configuredMinimumSpanMs < HARD_MINIMUM_SPAN_MS) {
    addFailure(failures, "minimum_span_policy_weakened");
  }
  if (policy.maximumAgeMs < policy.minimumSpanMs) {
    addFailure(failures, "maximum_age_policy_invalid");
  }
  if (policy.futureSkewMs < 0 || policy.futureSkewMs > 60 * 1000) {
    addFailure(failures, "future_skew_policy_invalid");
  }
}

function validateReport(report, expected, nowMs, policy, failures, timestamps, snapshotHashes) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    addFailure(failures, "report_invalid");
    return false;
  }

  let valid = true;
  const reject = (code) => {
    valid = false;
    addFailure(failures, code);
  };
  if (report.schema !== SESSION_PLANNER_SHADOW_CHECK_SCHEMA) reject("report_schema_invalid");
  if (report.mode !== "shadow-read-only") reject("report_mode_invalid");
  if (report.target !== expected.target) reject("report_target_mismatch");
  if (normalizeText(report.projectRef, 80) !== expected.projectRef) {
    reject("report_project_ref_mismatch");
  }
  if (normalizeText(report.scope?.organizationId) !== expected.organizationId) {
    reject("report_organization_mismatch");
  }
  if (normalizeText(report.scope?.teamId) !== expected.teamId) {
    reject("report_team_mismatch");
  }
  if (Number(report.source?.revision) !== expected.sourceRevision) {
    reject("report_source_revision_mismatch");
  }
  if (normalizeText(report.source?.hash, 64) !== expected.sourceHash) {
    reject("report_source_hash_mismatch");
  }

  const checkedAtMs = Date.parse(report.checkedAt);
  if (!Number.isFinite(checkedAtMs)) {
    reject("report_timestamp_invalid");
  } else {
    timestamps.push(checkedAtMs);
    if (checkedAtMs > nowMs + policy.futureSkewMs) reject("report_timestamp_future");
    if (nowMs - checkedAtMs > policy.maximumAgeMs) reject("report_timestamp_stale");
  }

  const snapshotHash = normalizeText(report.snapshot?.contentSha256, 64);
  if (!SHA256_PATTERN.test(snapshotHash)) reject("report_snapshot_hash_invalid");
  else snapshotHashes.push(snapshotHash);

  if (
    report.ok !== true ||
    report.reasonCode !== "session_planner_shadow_match" ||
    report.shadowComparisonPassed !== true ||
    report.backfillConverged !== true ||
    report.databaseReadAttempted !== true ||
    report.fallbackRequired !== false
  ) {
    reject("report_shadow_match_unproven");
  }
  if (
    report.primarySource !== "app-state" ||
    report.userFacingSource !== "app-state" ||
    report.candidateSource !== "session-planner-domain"
  ) {
    reject("report_source_ownership_invalid");
  }
  if (
    report.promotionBlocked !== true ||
    report.writeCapability !== false ||
    report.applyEnabled !== false ||
    report.containsCoachingContent !== false
  ) {
    reject("report_safety_flags_invalid");
  }

  const counts = report.counts || {};
  if (
    Number(counts.pendingActions) !== 0 ||
    Number(counts.blockers) !== 0 ||
    Number(counts.sourceSessions) !== Number(counts.candidateSessions) ||
    Number(counts.sourceBlocks) !== Number(counts.candidateBlocks)
  ) {
    reject("report_counts_not_converged");
  }
  const comparison = report.comparison || {};
  const leftHash = normalizeText(comparison.leftHash, 64);
  const rightHash = normalizeText(comparison.rightHash, 64);
  if (
    comparison.equal !== true ||
    !SHA256_PATTERN.test(leftHash) ||
    leftHash !== rightHash ||
    Number(comparison.sessionCount) !== Number(counts.sourceSessions)
  ) {
    reject("report_comparison_invalid");
  }
  return valid;
}

function safeIso(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function requiredOptions(options = {}) {
  return Object.freeze({
    target: normalizeText(options.target || "staging", 40),
    projectRef: normalizeText(options.expectedProjectRef, 80),
    organizationId: normalizeText(options.organizationId),
    teamId: normalizeText(options.teamId),
    sourceRevision: Number(options.expectedSourceRevision),
    sourceHash: normalizeText(options.expectedSourceHash, 64),
  });
}

function evaluateSessionPlannerShadowEvidence(reports = [], options = {}) {
  const now = resolveNow(options.now);
  const expected = requiredOptions(options);
  const policyConfiguration = createPolicy(options);
  const policy = policyConfiguration.effective;
  const failures = new Set();
  const timestamps = [];
  const snapshotHashes = [];
  const list = Array.isArray(reports) ? reports : [];
  validateConfiguration(expected, policyConfiguration, failures);
  if (!Array.isArray(reports)) addFailure(failures, "reports_not_array");
  if (list.length < policy.minimumReports) addFailure(failures, "insufficient_reports");

  let validReportCount = 0;
  list.forEach((report) => {
    if (
      validateReport(
        report,
        expected,
        now.getTime(),
        policy,
        failures,
        timestamps,
        snapshotHashes
      )
    ) {
      validReportCount += 1;
    }
  });
  if (validReportCount !== list.length) addFailure(failures, "invalid_report_present");

  const distinctTimestamps = [...new Set(timestamps)].sort((left, right) => left - right);
  if (distinctTimestamps.length !== timestamps.length) {
    addFailure(failures, "duplicate_report_timestamp");
  }
  const oldest = distinctTimestamps[0];
  const newest = distinctTimestamps[distinctTimestamps.length - 1];
  const observationSpanMs =
    Number.isFinite(oldest) && Number.isFinite(newest) ? newest - oldest : 0;
  if (observationSpanMs < policy.minimumSpanMs) addFailure(failures, "observation_span_too_short");
  const distinctSnapshotHashes = [...new Set(snapshotHashes)];
  if (distinctSnapshotHashes.length !== 1) addFailure(failures, "snapshot_hash_drift");

  const failureCodes = Object.freeze([...failures].sort());
  const passed = failureCodes.length === 0;
  return Object.freeze({
    ok: passed,
    schema: SESSION_PLANNER_SHADOW_EVIDENCE_SCHEMA,
    evaluatedAt: now.toISOString(),
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
    policy,
    evidence: Object.freeze({
      reportCount: list.length,
      validReportCount,
      distinctReportCount: distinctTimestamps.length,
      oldestCheckedAt: safeIso(oldest),
      newestCheckedAt: safeIso(newest),
      observationSpanMs,
      snapshotContentSha256:
        distinctSnapshotHashes.length === 1 ? distinctSnapshotHashes[0] : null,
    }),
    evidencePassed: passed,
    readyForManualReview: passed,
    reasonCode: passed
      ? "session_planner_shadow_evidence_ready"
      : "session_planner_shadow_evidence_blocked",
    failureCodes,
    promotionBlocked: true,
    automaticPromotion: false,
    writeCapability: false,
    containsCoachingContent: false,
    remainingRequirements: Object.freeze([
      "platform_identity_staging_proof",
      "staging_apply_rollback_reapply",
      "authenticated_multi_user_canary",
      "safe_lane_release_review",
    ]),
  });
}

module.exports = {
  DEFAULT_MAXIMUM_AGE_MS,
  DEFAULT_MINIMUM_SPAN_MS,
  HARD_MINIMUM_REPORTS,
  HARD_MINIMUM_SPAN_MS,
  SESSION_PLANNER_SHADOW_CHECK_SCHEMA,
  SESSION_PLANNER_SHADOW_EVIDENCE_SCHEMA,
  evaluateSessionPlannerShadowEvidence,
};
