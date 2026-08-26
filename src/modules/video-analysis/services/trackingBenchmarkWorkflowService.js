import {
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
} from "./trackingBenchmarkContract.js";
import { assembleTrackingBenchmarkSuite } from "./trackingBenchmarkAssemblyService.js";
import { evaluateTrackingBenchmarkSuite } from "./trackingBenchmarkService.js";
import { evaluateMultiObjectTrackingBenchmarkSuite } from "./trackingMultiObjectBenchmarkService.js";
import {
  createGroundTruthSuiteArtifact,
  groundTruthSuiteArtifactJson,
  groundTruthSuiteReadiness,
  trackingGroundTruthSuiteEntry,
} from "./trackingGroundTruthSuiteService.js";
import {
  createTrackingProviderRunSuiteArtifact,
  trackingProviderRunSuiteArtifactJson,
  trackingProviderRunWorkspaceEntry,
  trackingProviderRunsForProvider,
} from "./trackingProviderRunService.js";

export const TRACKING_BENCHMARK_EVIDENCE_SET_PROTOCOL = "football-science-tracking-benchmark-evidence-set-v1";
const maximumReportBytes = 16 * 1024 * 1024;
const maximumEvidenceSetBytes = (2 * MAX_TRACKING_BENCHMARK_SUITE_BYTES) + maximumReportBytes + (1024 * 1024);

export class TrackingBenchmarkWorkflowError extends Error {
  constructor(message, code = "TRACKING_BENCHMARK_WORKFLOW_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingBenchmarkWorkflowError";
    this.code = code;
  }
}

function invalid(message, code, options) {
  throw new TrackingBenchmarkWorkflowError(message, code, options);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function sha256Text(value = "", cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle?.digest) {
    invalid("Secure SHA-256 is unavailable for the benchmark evidence set.", "TRACKING_BENCHMARK_CRYPTO_UNAVAILABLE");
  }
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function issue(code, message) {
  return { code, message };
}

function referenceIdentity(tracking = {}, benchmarkType = "") {
  if (benchmarkType !== "multi-object") return null;
  const provider = tracking.provider || {};
  const evaluator = String(provider.referenceEvaluator || "");
  return {
    evaluator: evaluator.toLowerCase() === "trackeval" ? "TrackEval" : evaluator,
    evaluatorVersion: String(provider.referenceEvaluatorVersion || ""),
    evaluatorCommit: String(provider.referenceEvaluatorCommit || ""),
    sourceSha256: String(provider.referenceSourceSha256 || "").toLowerCase(),
  };
}

function sourcePayload(inputs = {}, reference = null) {
  return {
    cases: inputs.groundTruthSuite.cases,
    provider: inputs.providerRunSuite.provider,
    runs: inputs.providerRunSuite.runs,
    ...(reference ? { reference } : {}),
  };
}

function workflowInputs(tracking = {}, options = {}) {
  const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
  const groundTruthSuite = createGroundTruthSuiteArtifact(suite, { now: options.now });
  const runs = trackingProviderRunsForProvider(
    trackingProviderRunWorkspaceEntry(tracking.providerRuns),
    tracking.provider,
  );
  const providerRunSuite = createTrackingProviderRunSuiteArtifact({
    id: `${suite.id}-${runs[0]?.provider.providerId || "provider"}-runs`,
    runs,
  }, { now: options.now });
  return { groundTruthSuite, providerRunSuite, runs, suite };
}

function assembleInputs(inputs = {}, checksums = {}) {
  return assembleTrackingBenchmarkSuite(inputs.groundTruthSuite, inputs.providerRunSuite, {
    id: `${inputs.groundTruthSuite.id}-${inputs.providerRunSuite.provider.providerId}`,
    groundTruthSuiteSha256: checksums.groundTruthSuiteSha256 || "0".repeat(64),
    providerRunSuiteSha256: checksums.providerRunSuiteSha256 || "0".repeat(64),
  });
}

export function trackingBenchmarkWorkflowReadiness(tracking = {}, options = {}) {
  const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
  const suiteReadiness = groundTruthSuiteReadiness(suite);
  const issues = suiteReadiness.issues.map((entry) => issue(entry.code, entry.message));
  let runCount = 0;
  let matchedCaseCount = 0;
  let benchmarkType = "";
  let referenceRequired = false;
  try {
    const runs = trackingProviderRunsForProvider(
      trackingProviderRunWorkspaceEntry(tracking.providerRuns),
      tracking.provider,
    );
    runCount = runs.length;
    if (!runs.length) issues.push(issue("provider-runs-missing", "Capture raw provider runs for the locked cases."));
    if (suiteReadiness.ready && runs.length) {
      const inputs = workflowInputs(tracking, options);
      const assembled = assembleInputs(inputs);
      matchedCaseCount = assembled.cases.length;
      benchmarkType = assembled.cases[0]?.benchmarkType === "multi-object" ? "multi-object" : "selected-object";
      referenceRequired = benchmarkType === "multi-object";
    }
  } catch (error) {
    issues.push(issue(error?.code || "benchmark-assembly", error?.message || "Benchmark inputs do not match."));
  }
  if (tracking.provider?.benchmarkAvailable !== true) {
    issues.push(issue("benchmark-companion-unavailable", "Update the local video app before evaluating provider evidence."));
  }
  if (referenceRequired && tracking.provider?.trackEvalAvailable !== true) {
    issues.push(issue("trackeval-unavailable", "Install the pinned TrackEval reference before evaluating this provider."));
  }
  if (referenceRequired && tracking.provider?.trackEvalAvailable === true) {
    const reference = referenceIdentity(tracking, benchmarkType);
    if (reference.evaluator !== "TrackEval"
      || !reference.evaluatorVersion
      || !/^[a-f0-9]{40}$/i.test(reference.evaluatorCommit)
      || !/^[a-f0-9]{64}$/i.test(reference.sourceSha256)) {
      issues.push(issue("trackeval-identity-invalid", "The pinned TrackEval identity is incomplete or invalid."));
    }
  }
  return {
    ready: issues.length === 0,
    issues,
    suiteReadiness,
    runCount,
    matchedCaseCount,
    benchmarkType,
    referenceRequired,
  };
}

export async function trackingBenchmarkWorkflowSourceSignature(tracking = {}, options = {}) {
  const inputs = workflowInputs(tracking, options);
  const benchmarkType = inputs.providerRunSuite.runs[0]?.benchmarkType === "multi-object"
    ? "multi-object"
    : "selected-object";
  return sha256Text(
    canonicalJson(sourcePayload(inputs, referenceIdentity(tracking, benchmarkType))),
    options.cryptoApi,
  );
}

export async function prepareTrackingBenchmarkWorkflow(tracking = {}, options = {}) {
  const readiness = trackingBenchmarkWorkflowReadiness(tracking, options);
  if (!readiness.ready) {
    invalid(readiness.issues.map((entry) => entry.message).join(" "), "TRACKING_BENCHMARK_WORKFLOW_NOT_READY");
  }
  const inputs = workflowInputs(tracking, options);
  const groundTruthJson = groundTruthSuiteArtifactJson(inputs.groundTruthSuite);
  const providerRunJson = trackingProviderRunSuiteArtifactJson(inputs.providerRunSuite);
  const checksums = {
    groundTruthSuiteSha256: await sha256Text(groundTruthJson, options.cryptoApi),
    providerRunSuiteSha256: await sha256Text(providerRunJson, options.cryptoApi),
  };
  const assembledBenchmark = assembleInputs(inputs, checksums);
  const internalReport = readiness.benchmarkType === "multi-object"
    ? evaluateMultiObjectTrackingBenchmarkSuite(assembledBenchmark)
    : evaluateTrackingBenchmarkSuite(assembledBenchmark);
  const reference = referenceIdentity(tracking, readiness.benchmarkType);
  const sourceSignature = await sha256Text(
    canonicalJson(sourcePayload(inputs, reference)),
    options.cryptoApi,
  );
  return {
    ...inputs,
    ...checksums,
    assembledBenchmark,
    benchmarkType: readiness.benchmarkType,
    referenceRequired: readiness.referenceRequired,
    reference,
    internalReport,
    sourceSignature,
  };
}

function exact(value, expected, label) {
  if (canonicalJson(value) !== canonicalJson(expected)) invalid(`${label} does not match the assembled benchmark.`);
}

function verifyReferenceIdentity(reference = {}, expected = {}) {
  if (reference.evaluator !== "TrackEval") invalid("TrackEval evaluator identity is missing.");
  if (expected.evaluator && reference.evaluator !== expected.evaluator) {
    invalid("TrackEval evaluator identity changed during evaluation.");
  }
  if (expected.evaluatorCommit && reference.evaluatorCommit !== expected.evaluatorCommit) {
    invalid("TrackEval evaluator commit changed during evaluation.");
  }
  if (expected.sourceSha256 && reference.sourceSha256 !== expected.sourceSha256) {
    invalid("TrackEval source checksum changed during evaluation.");
  }
}

function referenceThresholdFailures(reference = {}) {
  const rules = [
    ["minHota", "HOTA"],
    ["minDetA", "DetA"],
    ["minAssA", "AssA"],
    ["minLocA", "LocA"],
    ["minMota", "MOTA"],
    ["minIdf1", "IDF1"],
  ];
  return rules.flatMap(([threshold, metric]) => (
    Number(reference.metrics?.[metric]) >= Number(reference.requiredThresholds?.[threshold])
      ? []
      : [{
        metric,
        threshold,
        expected: reference.requiredThresholds?.[threshold],
        actual: reference.metrics?.[metric],
        reason: "minimum",
      }]
  ));
}

function verifyReferenceThresholds(reference = {}, expectedReportSha256 = "") {
  const failures = referenceThresholdFailures(reference);
  if (!/^[a-f0-9]{64}$/i.test(String(reference.reportSha256 || ""))
    || (expectedReportSha256 && reference.reportSha256 !== expectedReportSha256)
    || reference.passed !== (failures.length === 0)
    || Number(reference.failureCount) !== failures.length
    || canonicalJson(reference.failures) !== canonicalJson(failures)) {
    invalid("TrackEval threshold evidence is inconsistent.");
  }
}

function verifyMultiObjectReport(prepared = {}, report = {}) {
  const internal = prepared.internalReport;
  if (report.benchmarkType !== "multi-object-suite"
    || report.suiteId !== internal.suiteId
    || !Array.isArray(report.cases)
    || report.cases.length !== internal.cases.length) {
    invalid("The TrackEval report does not match the assembled benchmark.");
  }
  exact(report.providerRunEvidence, internal.providerRunEvidence, "Provider-run evidence");
  const immutableSummaryKeys = Object.keys(internal.summary).filter((key) => ![
    "passed", "providerApprovalReady", "passedCaseCount", "failedCaseIds",
  ].includes(key));
  immutableSummaryKeys.forEach((key) => exact(report.summary?.[key], internal.summary[key], `Summary ${key}`));
  const byId = new Map(report.cases.map((entry) => [entry.benchmarkId, entry]));
  const referenceReportSha256 = String(report.referenceValidation?.reportSha256 || "");
  internal.cases.forEach((expected) => {
    const actual = byId.get(expected.benchmarkId);
    if (!actual) invalid(`TrackEval report is missing ${expected.benchmarkId}.`);
    [
      "schemaVersion", "evaluatorVersion", "benchmarkType", "benchmarkId", "sourceFingerprint",
      "frame", "range", "profile", "evidence", "metrics", "thresholds", "worstFrames",
    ].forEach((key) => exact(actual[key], expected[key], `Case ${expected.benchmarkId} ${key}`));
    const reference = actual.referenceValidation || {};
    const expectedPassed = expected.verdict?.passed === true && reference.passed === true;
    verifyReferenceIdentity(reference, prepared.reference || {});
    verifyReferenceThresholds(reference, referenceReportSha256);
    if (reference.status !== "verified"
      || reference.crossValidation?.passed !== true
      || actual.verdict?.passed !== expectedPassed
      || actual.verdict?.referencePassed !== reference.passed
      || actual.verdict?.providerApprovalReady !== expectedPassed
      || Number(actual.verdict?.failureCount) !== (
        Number(expected.verdict?.failureCount) + Number(reference.failureCount)
      )) {
      invalid(`TrackEval evidence is incomplete for ${expected.benchmarkId}.`);
    }
  });
  const expectedPassedCaseCount = report.cases.filter((entry) => entry.verdict?.passed === true).length;
  const expectedFailedCaseIds = report.cases
    .filter((entry) => entry.verdict?.passed !== true)
    .map((entry) => entry.benchmarkId);
  verifyReferenceIdentity(report.referenceValidation || {}, prepared.reference || {});
  verifyReferenceThresholds(report.referenceValidation || {}, referenceReportSha256);
  if (report.referenceValidation?.status !== "verified"
    || report.summary?.passed !== (expectedFailedCaseIds.length === 0)
    || Number(report.summary?.passedCaseCount) !== expectedPassedCaseCount
    || canonicalJson(report.summary?.failedCaseIds) !== canonicalJson(expectedFailedCaseIds)
    || report.summary?.providerApprovalReady !== (
      report.summary?.passed === true
      && report.referenceValidation?.passed === true
      && report.cases.every((entry) => entry.verdict?.providerApprovalReady === true)
    )) {
    invalid("The suite-level TrackEval evidence is incomplete.");
  }
  return report;
}

export function verifyTrackingBenchmarkWorkflowReport(prepared = {}, reportValue = {}) {
  assertBenchmarkMetadataOnly(reportValue);
  if (benchmarkSerializedBytes(reportValue, "Tracking benchmark report") > maximumReportBytes) {
    invalid("Tracking benchmark report is too large.");
  }
  if (prepared.referenceRequired) return verifyMultiObjectReport(prepared, reportValue);
  exact(reportValue, prepared.internalReport, "Selected-object report");
  return reportValue;
}

export async function finalizeTrackingBenchmarkWorkflow(prepared = {}, reportValue = {}, options = {}) {
  const report = verifyTrackingBenchmarkWorkflowReport(prepared, reportValue);
  const reportSha256 = await sha256Text(canonicalJson(report), options.cryptoApi);
  const evidenceSet = {
    schemaVersion: 1,
    protocol: TRACKING_BENCHMARK_EVIDENCE_SET_PROTOCOL,
    createdAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    benchmarkType: prepared.benchmarkType,
    sourceSignature: prepared.sourceSignature,
    evaluation: {
      referenceRequired: prepared.referenceRequired === true,
      ...(prepared.reference ? { reference: prepared.reference } : {}),
    },
    checksums: {
      algorithm: "sha256",
      groundTruthSerialization: "pretty-json-lf-v1",
      providerRunSerialization: "pretty-json-lf-v1",
      reportSerialization: "canonical-json-v1",
      groundTruthSuiteSha256: prepared.groundTruthSuiteSha256,
      providerRunSuiteSha256: prepared.providerRunSuiteSha256,
      reportSha256,
    },
    inputs: {
      groundTruthSuite: prepared.groundTruthSuite,
      providerRunSuite: prepared.providerRunSuite,
    },
    report,
  };
  assertBenchmarkMetadataOnly(evidenceSet);
  if (benchmarkSerializedBytes(evidenceSet, "Tracking benchmark evidence set") > maximumEvidenceSetBytes) {
    invalid("Tracking benchmark evidence set is too large.");
  }
  return { evidenceSet, report, reportSha256 };
}

export function trackingBenchmarkEvidenceSetJson(value = {}) {
  if (value.protocol !== TRACKING_BENCHMARK_EVIDENCE_SET_PROTOCOL) {
    invalid("Tracking benchmark evidence set protocol is invalid.");
  }
  assertBenchmarkMetadataOnly(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}
