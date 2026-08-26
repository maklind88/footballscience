import { createHash } from "node:crypto";
import { normalizeBenchmarkProviderRunEvidence } from "../../../src/modules/video-analysis/services/trackingBenchmarkContract.js";
import { trackingBenchmarkSuiteEvidence } from "../../../src/modules/video-analysis/services/trackingBenchmarkEvidence.js";
import { trackingProviderExecutionFingerprintSha256 } from "../tracking-providers/provider-execution-fingerprint.mjs";

export const TRACKING_PROVIDER_EVIDENCE_PROTOCOL = "football-science-tracking-provider-evidence-v1";
export const TRACKING_PROVIDER_MINIMUM_REAL_MATCH_DURATION_MS = 10 * 60 * 1000;

const requiredEvaluatorVersion = "tracking-benchmark-v1";
const referenceCapabilities = /^(?:detect:|associate:|reidentify:)/;
const requiredReferenceMetrics = Object.freeze(["HOTA", "DetA", "AssA", "LocA", "MOTA", "IDF1"]);
const maximumReportBytes = 16 * 1024 * 1024;

const capabilityRules = Object.freeze({
  "detect:player": Object.freeze([
    ["metrics.playerPrecision", "thresholds.minPlayerPrecision", "minimum", 0.9],
    ["metrics.playerRecall", "thresholds.minPlayerRecall", "minimum", 0.9],
    ["referenceValidation.metrics.DetA", "referenceValidation.requiredThresholds.minDetA", "minimum", 0.75],
    ["referenceValidation.metrics.LocA", "referenceValidation.requiredThresholds.minLocA", "minimum", 0.75],
  ]),
  "detect:ball": Object.freeze([
    ["metrics.ballPrecision", "thresholds.minBallPrecision", "minimum", 0.8],
    ["metrics.ballRecall", "thresholds.minBallRecall", "minimum", 0.8],
    ["referenceValidation.metrics.DetA", "referenceValidation.requiredThresholds.minDetA", "minimum", 0.75],
  ]),
  "detect:referee": Object.freeze([
    ["metrics.refereePrecision", "thresholds.minRefereePrecision", "minimum", 0.8],
    ["metrics.refereeRecall", "thresholds.minRefereeRecall", "minimum", 0.8],
    ["referenceValidation.metrics.DetA", "referenceValidation.requiredThresholds.minDetA", "minimum", 0.75],
  ]),
  "segment:selected-object": Object.freeze([
    ["metrics.visibleCoverage", "thresholds.minVisibleCoverage", "minimum", 0.95],
    ["metrics.meanIou", "thresholds.minMeanIou", "minimum", 0.65],
  ]),
  "propagate:selected-object": Object.freeze([
    ["metrics.visibleCoverage", "thresholds.minVisibleCoverage", "minimum", 0.95],
    ["metrics.meanIou", "thresholds.minMeanIou", "minimum", 0.65],
    ["metrics.continuityBreaks", "thresholds.maxContinuityBreaks", "maximum", 2],
    ["metrics.maxGapMs", "thresholds.maxGapMs", "maximum", 1000],
  ]),
  "associate:multi-object": Object.freeze([
    ["metrics.mota", "thresholds.minMota", "minimum", 0.8],
    ["metrics.identitySwitchesPerMinute", "thresholds.maxIdentitySwitchesPerMinute", "maximum", 2],
    ["metrics.fragmentationsPerMinute", "thresholds.maxFragmentationsPerMinute", "maximum", 4],
    ["referenceValidation.metrics.HOTA", "referenceValidation.requiredThresholds.minHota", "minimum", 0.65],
    ["referenceValidation.metrics.AssA", "referenceValidation.requiredThresholds.minAssA", "minimum", 0.65],
  ]),
  "reidentify:player": Object.freeze([
    ["metrics.identityF1", "thresholds.minIdentityF1", "minimum", 0.85],
    ["metrics.playerIdentityAccuracy", "thresholds.minPlayerIdentityAccuracy", "minimum", 0.9],
    ["referenceValidation.metrics.IDF1", "referenceValidation.requiredThresholds.minIdf1", "minimum", 0.85],
  ]),
  "classify:team": Object.freeze([
    ["metrics.teamAccuracy", "thresholds.minTeamAccuracy", "minimum", 0.95],
  ]),
  "classify:shirt-number": Object.freeze([
    ["metrics.shirtNumberAccuracy", "thresholds.minShirtNumberAccuracy", "minimum", 0.9],
  ]),
});

const selectedObjectCapabilities = new Set(["segment:selected-object", "propagate:selected-object"]);

export class TrackingProviderEvidenceError extends Error {
  constructor(message, code = "TRACKING_PROVIDER_EVIDENCE_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingProviderEvidenceError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingProviderEvidenceError(message, code);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function exactKeys(value = [], expected = []) {
  return JSON.stringify([...new Set(value)].sort()) === JSON.stringify([...new Set(expected)].sort());
}

function valueAtPath(value = {}, path = "") {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function finiteMetric(value, label) {
  if (value === null || value === undefined || value === "") {
    invalid(`Provider evidence is missing ${label}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) invalid(`Provider evidence is missing ${label}.`);
  return number;
}

function reportCases(report = {}) {
  if (Array.isArray(report.cases)) return report.cases;
  return report.benchmarkId ? [report] : [];
}

function reportPassed(report = {}) {
  return report.summary?.passed === true || report.verdict?.passed === true;
}

function expectedBenchmarkType(capabilities = []) {
  const selectedObject = capabilities.every((capability) => selectedObjectCapabilities.has(capability));
  const multiObject = capabilities.every((capability) => !selectedObjectCapabilities.has(capability));
  if (!selectedObject && !multiObject) invalid("One provider evidence artifact cannot mix selected-object and multi-object stages.");
  return selectedObject ? "selected-object" : "multi-object";
}

function assertReportBoundary(report = {}) {
  const serialized = JSON.stringify(report);
  if (!serialized || Buffer.byteLength(serialized) > maximumReportBytes) {
    invalid("Provider benchmark report is empty or outside the evidence size limit.");
  }
  if (/"(?:tracks|segments|points|groundTruth|prediction|reviewedBy|sourcePath|filePath|videoUrl|blobUrl)"\s*:/i.test(serialized)) {
    invalid("Provider benchmark evidence must remain metadata-only.");
  }
  if (Number(report.schemaVersion) !== 1 || report.evaluatorVersion !== requiredEvaluatorVersion) {
    invalid("Provider benchmark evaluator version is unsupported.");
  }
}

function assertReference(caseReport = {}, capability = "") {
  if (!referenceCapabilities.test(capability)) return;
  const reference = caseReport.referenceValidation || {};
  if (String(reference.evaluator || "").toLowerCase() !== "trackeval"
    || reference.status !== "verified"
    || reference.passed !== true
    || !reference.reportSha256
    || reference.crossValidation?.passed !== true) {
    invalid(`Capability ${capability} requires verified TrackEval evidence and cross-validation.`);
  }
  if (!requiredReferenceMetrics.every((metric) => Number.isFinite(Number(reference.metrics?.[metric])))) {
    invalid(`Capability ${capability} is missing a required TrackEval metric.`);
  }
}

function metricEvidence(cases = [], capability = "") {
  const rules = capabilityRules[capability];
  if (!rules) invalid(`Unknown provider capability evidence rule: ${capability}.`);
  cases.forEach((entry) => assertReference(entry, capability));
  return rules.map(([metricPath, thresholdPath, direction, policyThreshold]) => {
    const actuals = cases.map((entry) => finiteMetric(valueAtPath(entry, metricPath), metricPath));
    const reportThresholds = cases.map((entry) => finiteMetric(valueAtPath(entry, thresholdPath), thresholdPath));
    const thresholds = reportThresholds.map((threshold) => (
      direction === "minimum"
        ? Math.max(threshold, policyThreshold)
        : Math.min(threshold, policyThreshold)
    ));
    const passed = actuals.every((actual, index) => (
      direction === "minimum" ? actual >= thresholds[index] : actual <= thresholds[index]
    ));
    if (!passed) invalid(`Capability ${capability} does not pass ${metricPath}.`, "TRACKING_PROVIDER_EVIDENCE_FAILED");
    return {
      metric: metricPath.split(".").at(-1),
      direction,
      required: direction === "minimum" ? Math.max(...thresholds) : Math.min(...thresholds),
      worst: direction === "minimum" ? Math.min(...actuals) : Math.max(...actuals),
    };
  });
}

function providerFingerprintPayload(provider = {}) {
  return {
    schemaVersion: provider.schemaVersion,
    protocol: provider.protocol,
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    displayName: provider.displayName,
    stage: provider.stage,
    priority: provider.priority,
    capabilities: [...provider.capabilities].sort(),
    upstream: provider.upstream,
    models: provider.models,
    runtime: provider.runtime,
  };
}

export function trackingProviderFingerprint(provider = {}) {
  return sha256(providerFingerprintPayload(provider));
}

export function trackingProviderExecutionFingerprint(provider = {}) {
  return trackingProviderExecutionFingerprintSha256({
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    protocol: provider.protocol,
    stage: provider.stage,
    capabilities: provider.capabilities,
    sourceCommit: provider.upstream?.commit,
    sourceSha256: provider.upstream?.sourceSha256,
    modelSha256s: (provider.models || []).map((model) => model.sha256),
    runtimeSha256: provider.runtime?.providerSha256,
  });
}

export function trackingProviderEvidenceHash(value = {}) {
  const { evidenceSha256, ...payload } = value;
  return sha256(payload);
}

function reportReference(report = {}, cases = []) {
  const reference = report.referenceValidation?.status === "verified"
    ? report.referenceValidation
    : cases.find((entry) => entry.referenceValidation?.status === "verified")?.referenceValidation;
  if (!reference) return { evaluator: "", reportSha256: "", metrics: [] };
  return {
    evaluator: String(reference.evaluator || "").toLowerCase(),
    reportSha256: String(reference.reportSha256 || ""),
    metrics: requiredReferenceMetrics.filter((metric) => Number.isFinite(Number(reference.metrics?.[metric]))),
  };
}

function benchmarkProfile(cases = []) {
  const profiles = [...new Set(cases.map((entry) => String(entry.profile?.id || "")))];
  if (profiles.length !== 1 || !profiles[0]) invalid("Provider benchmark cases must use one explicit profile.");
  return profiles[0];
}

function providerRunReference(provider = {}, report = {}) {
  let evidence;
  try {
    evidence = normalizeBenchmarkProviderRunEvidence(report.providerRunEvidence);
  } catch {
    invalid("Provider benchmark report is missing valid raw-run evidence.");
  }
  if (evidence.provider.providerId !== provider.providerId
    || evidence.provider.providerVersion !== provider.providerVersion
    || evidence.provider.protocol !== provider.protocol
    || evidence.provider.stage !== provider.stage
    || evidence.provider.executionFingerprintSha256 !== trackingProviderExecutionFingerprint(provider)
    || !exactKeys(evidence.provider.capabilities, provider.capabilities)) {
    invalid("Provider benchmark raw-run evidence does not match the provider artifacts.");
  }
  return evidence;
}

export function createTrackingProviderEvidence(provider = {}, report = {}, options = {}) {
  assertReportBoundary(report);
  if (!reportPassed(report)) invalid("A failed benchmark cannot approve a tracking provider.", "TRACKING_PROVIDER_EVIDENCE_FAILED");
  const capabilities = [...new Set(provider.capabilities || [])].sort();
  if (!capabilities.length) invalid("Provider capabilities are missing from the evidence request.");
  const expectedType = expectedBenchmarkType(capabilities);
  const reportType = String(report.benchmarkType || "").replace(/-suite$/, "");
  if (reportType !== expectedType) invalid(`Provider capabilities require a ${expectedType} benchmark report.`);
  const cases = reportCases(report);
  if (!cases.length || cases.length > 100 || cases.some((entry) => entry.verdict?.passed !== true)) {
    invalid("Every provider benchmark case must pass.", "TRACKING_PROVIDER_EVIDENCE_FAILED");
  }
  const realMatchCases = cases.filter((entry) => entry.evidence?.kind === "real-match"
    && entry.evidence?.attested === true
    && entry.evidence?.reviewProtocol === "football-ground-truth-review-v1");
  const realMatchEvidence = trackingBenchmarkSuiteEvidence(cases);
  const realMatchDurationMs = realMatchEvidence.realMatchDurationMs;
  const requestedMinimumDurationMs = Number(options.minimumRealMatchDurationMs);
  const minimumDurationMs = Number.isFinite(requestedMinimumDurationMs)
    ? Math.max(TRACKING_PROVIDER_MINIMUM_REAL_MATCH_DURATION_MS, requestedMinimumDurationMs)
    : TRACKING_PROVIDER_MINIMUM_REAL_MATCH_DURATION_MS;
  if (realMatchCases.length !== cases.length
    || realMatchEvidence.invalidRealMatchCaseIds.length
    || realMatchDurationMs < minimumDurationMs) {
    invalid(
      `Provider approval requires at least ${Math.ceil(minimumDurationMs / 60_000)} minutes of attested real-match evidence.`,
      "TRACKING_PROVIDER_REAL_MATCH_EVIDENCE_MISSING",
    );
  }
  const capabilityEvidence = capabilities.map((capability) => ({
    capability,
    metrics: metricEvidence(cases, capability),
  }));
  const reference = reportReference(report, cases);
  const rawRun = providerRunReference(provider, report);
  const sourceFingerprints = [...new Set(cases.map((entry) => String(entry.sourceFingerprint || "")))].sort();
  if (sourceFingerprints.some((fingerprint) => !/^[a-f0-9]{64}$/i.test(fingerprint))) {
    invalid("Provider benchmark source evidence is invalid.");
  }
  const payload = {
    schemaVersion: 1,
    protocol: TRACKING_PROVIDER_EVIDENCE_PROTOCOL,
    provider: {
      providerId: provider.providerId,
      providerVersion: provider.providerVersion,
      stage: provider.stage,
      capabilities,
      fingerprintSha256: trackingProviderFingerprint(provider),
    },
    benchmark: {
      evaluatorVersion: report.evaluatorVersion,
      profileId: benchmarkProfile(cases),
      reportSha256: sha256(report),
      caseCount: cases.length,
      realMatchCaseCount: realMatchCases.length,
      realMatchDurationMs,
      sourceCount: sourceFingerprints.length,
      sourceSetSha256: sha256(sourceFingerprints),
      providerExecutionFingerprintSha256: rawRun.provider.executionFingerprintSha256,
      groundTruthSuiteSha256: rawRun.groundTruthSuiteSha256,
      providerRunSuiteSha256: rawRun.providerRunSuiteSha256,
      providerRunCount: rawRun.runIds.length,
      providerRunSetSha256: sha256(rawRun.runIds),
      capabilities,
      referenceEvaluator: reference.evaluator,
      referenceReportSha256: reference.reportSha256,
      referenceMetrics: reference.metrics,
      capabilityEvidence,
    },
    reviewedOn: String(options.reviewedOn || provider.approval?.reviewedAt || ""),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.reviewedOn)) invalid("Provider evidence review date must use YYYY-MM-DD.");
  return deepFreeze({ ...payload, evidenceSha256: trackingProviderEvidenceHash(payload) });
}

export function trackingProviderBenchmarkFromEvidence(evidence = {}) {
  const benchmark = evidence.benchmark || {};
  return {
    status: "passed",
    evaluatorVersion: benchmark.evaluatorVersion,
    profileId: benchmark.profileId,
    reportSha256: benchmark.reportSha256,
    evidenceSha256: evidence.evidenceSha256,
    caseCount: benchmark.caseCount,
    realMatchCaseCount: benchmark.realMatchCaseCount,
    realMatchDurationMs: benchmark.realMatchDurationMs,
    providerExecutionFingerprintSha256: benchmark.providerExecutionFingerprintSha256,
    groundTruthSuiteSha256: benchmark.groundTruthSuiteSha256,
    providerRunSuiteSha256: benchmark.providerRunSuiteSha256,
    providerRunCount: benchmark.providerRunCount,
    providerRunSetSha256: benchmark.providerRunSetSha256,
    capabilities: benchmark.capabilities,
    referenceEvaluator: benchmark.referenceEvaluator,
    referenceReportSha256: benchmark.referenceReportSha256,
    referenceMetrics: benchmark.referenceMetrics,
  };
}

export function verifyTrackingProviderEvidence(provider = {}, evidence = {}, report = {}) {
  if (evidence.protocol !== TRACKING_PROVIDER_EVIDENCE_PROTOCOL || Number(evidence.schemaVersion) !== 1) {
    invalid("Tracking provider evidence protocol is invalid.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(evidence.evidenceSha256 || ""))
    || trackingProviderEvidenceHash(evidence) !== String(evidence.evidenceSha256).toLowerCase()) {
    invalid("Tracking provider evidence checksum is invalid.");
  }
  if (evidence.provider?.providerId !== provider.providerId
    || evidence.provider?.providerVersion !== provider.providerVersion
    || evidence.provider?.stage !== provider.stage
    || !exactKeys(evidence.provider?.capabilities, provider.capabilities)
    || evidence.provider?.fingerprintSha256 !== trackingProviderFingerprint(provider)) {
    invalid("Tracking provider evidence does not match the installed provider artifacts.");
  }
  if (evidence.reviewedOn !== provider.approval?.reviewedAt) {
    invalid("Tracking provider evidence review date does not match the provider manifest.");
  }
  assertReportBoundary(report);
  if (evidence.benchmark?.reportSha256 !== sha256(report)) {
    invalid("Tracking provider benchmark report does not match its evidence hash.");
  }
  const recreated = createTrackingProviderEvidence(provider, report, { reviewedOn: evidence.reviewedOn });
  if (recreated.evidenceSha256 !== evidence.evidenceSha256) {
    invalid("Tracking provider evidence cannot be reproduced from the benchmark report.");
  }
  const expectedBenchmark = trackingProviderBenchmarkFromEvidence(evidence);
  const actual = provider.benchmark || {};
  const scalarFields = [
    "status", "evaluatorVersion", "profileId", "reportSha256", "evidenceSha256",
    "caseCount", "realMatchCaseCount", "realMatchDurationMs", "referenceEvaluator",
    "referenceReportSha256", "providerExecutionFingerprintSha256", "groundTruthSuiteSha256",
    "providerRunSuiteSha256", "providerRunCount", "providerRunSetSha256",
  ];
  if (scalarFields.some((field) => actual[field] !== expectedBenchmark[field])
    || !exactKeys(actual.capabilities, expectedBenchmark.capabilities)
    || !exactKeys(actual.referenceMetrics, expectedBenchmark.referenceMetrics)) {
    invalid("Tracking provider manifest benchmark does not match the verified evidence artifact.");
  }
  return {
    verified: true,
    evidenceSha256: evidence.evidenceSha256,
    reportSha256: expectedBenchmark.reportSha256,
    providerFingerprintSha256: evidence.provider.fingerprintSha256,
  };
}
