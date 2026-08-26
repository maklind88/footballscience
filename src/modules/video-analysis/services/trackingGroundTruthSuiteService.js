import {
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
} from "./trackingBenchmarkContract.js";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
  TRACKING_GROUND_TRUTH_MAX_RANGE_MS,
  TrackingGroundTruthError,
  buildMultiObjectCaseFromGroundTruth,
  normalizeTrackingGroundTruthBenchmarkType,
  trackingGroundTruthArtifactBenchmarkType,
  trackingGroundTruthProfileForType,
  validateGroundTruthArtifact,
} from "./trackingGroundTruthService.js";
import {
  TRACKING_BENCHMARK_SCENARIOS,
  normalizeTrackingBenchmarkScenarios,
} from "./trackingBenchmarkScenarioService.js";

export {
  TRACKING_BENCHMARK_SCENARIOS,
  normalizeTrackingBenchmarkScenarios,
} from "./trackingBenchmarkScenarioService.js";

export const TRACKING_GROUND_TRUTH_SUITE_PROTOCOL = "football-science-ground-truth-suite-v1";
export const TRACKING_GROUND_TRUTH_SUITE_MIN_DURATION_MS = 10 * 60 * 1000;
export const TRACKING_GROUND_TRUTH_SUITE_RECOMMENDED_MAX_DURATION_MS = 20 * 60 * 1000;
export const TRACKING_GROUND_TRUTH_SUITE_MIN_CASES = 5;

const requiredScenarioIds = TRACKING_BENCHMARK_SCENARIOS.filter((entry) => entry.required).map((entry) => entry.id);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function issue(code, message, caseId = "") {
  return { code, message, ...(caseId ? { caseId } : {}) };
}

export function trackingGroundTruthSuiteEntry(workspace = {}) {
  const suite = workspace.suite && typeof workspace.suite === "object" ? workspace.suite : {};
  const cases = Array.isArray(suite.cases) ? suite.cases.slice(0, 100) : [];
  const benchmarkType = normalizeTrackingGroundTruthBenchmarkType(
    suite.benchmarkType,
    suite.profileId || cases[0]?.profileId,
  );
  return {
    id: String(suite.id || "real-match-pilot"),
    revision: Math.max(1, Math.round(Number(suite.revision) || 1)),
    status: String(suite.status || "draft"),
    benchmarkType,
    cases,
    downloadedAt: String(suite.downloadedAt || ""),
    error: String(suite.error || ""),
  };
}

function artifactKey(artifact = {}) {
  return [
    artifact.sourceFingerprint,
    artifact.sourceEvidence?.angleId || "primary",
    artifact.range?.startMs,
    artifact.range?.endMs,
  ].join(":");
}

function validateSuiteCase(artifact = {}, expectedBenchmarkType = "") {
  if (!artifact.id) {
    throw new TrackingGroundTruthError("Benchmark suite contains an invalid ground-truth case.");
  }
  validateGroundTruthArtifact(artifact);
  const benchmarkType = trackingGroundTruthArtifactBenchmarkType(artifact);
  if (expectedBenchmarkType && benchmarkType !== expectedBenchmarkType) {
    throw new TrackingGroundTruthError("Benchmark suite cannot mix selected-object and full-scene references.");
  }
  const durationMs = Number(artifact.range?.endMs) - Number(artifact.range?.startMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > TRACKING_GROUND_TRUTH_MAX_RANGE_MS) {
    throw new TrackingGroundTruthError("Benchmark suite case range is invalid.");
  }
  if (artifact.reviewEvidence?.kind !== "real-match"
    || artifact.reviewEvidence?.attested !== true
    || !artifact.groundTruth?.tracks?.length) {
    throw new TrackingGroundTruthError("Benchmark suite requires attested real-match ground truth.");
  }
  assertBenchmarkMetadataOnly(artifact);
  return artifact;
}

export function addGroundTruthSuiteCase(suiteValue = {}, artifactValue = {}) {
  const suite = trackingGroundTruthSuiteEntry({ suite: suiteValue });
  const artifact = validateSuiteCase(artifactValue, suite.benchmarkType);
  const key = artifactKey(artifact);
  const cases = suite.cases.filter((entry) => artifactKey(entry) !== key);
  if (cases.length >= 100) throw new TrackingGroundTruthError("Benchmark suite cannot exceed 100 cases.");
  return { ...suite, status: "draft", cases: [...cases, artifact], downloadedAt: "", error: "" };
}

export function removeGroundTruthSuiteCase(suiteValue = {}, caseId = "") {
  const suite = trackingGroundTruthSuiteEntry({ suite: suiteValue });
  return {
    ...suite,
    status: "draft",
    cases: suite.cases.filter((entry) => entry.id !== String(caseId || "")),
    downloadedAt: "",
    error: "",
  };
}

function mergedDuration(intervals = []) {
  const sorted = intervals.slice().sort((first, second) => first.startMs - second.startMs || first.endMs - second.endMs);
  let durationMs = 0;
  let current = null;
  for (const interval of sorted) {
    if (!current || interval.startMs > current.endMs) {
      if (current) durationMs += current.endMs - current.startMs;
      current = { ...interval };
    } else {
      current.endMs = Math.max(current.endMs, interval.endMs);
    }
  }
  if (current) durationMs += current.endMs - current.startMs;
  return durationMs;
}

function suiteDurations(cases = []) {
  const groups = new Map();
  let rawDurationMs = 0;
  for (const artifact of cases) {
    const startMs = Number(artifact.range?.startMs) || 0;
    const endMs = Number(artifact.range?.endMs) || startMs;
    rawDurationMs += Math.max(0, endMs - startMs);
    const key = `${artifact.sourceFingerprint}:${artifact.sourceEvidence?.angleId || "primary"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ startMs, endMs });
  }
  const uniqueDurationMs = [...groups.values()].reduce((total, intervals) => total + mergedDuration(intervals), 0);
  return { rawDurationMs, uniqueDurationMs, overlapDurationMs: Math.max(0, rawDurationMs - uniqueDurationMs) };
}

export function groundTruthSuiteReadiness(suiteValue = {}) {
  const suite = trackingGroundTruthSuiteEntry({ suite: suiteValue });
  const issues = [];
  const validCases = [];
  const ids = new Set();
  for (const artifact of suite.cases) {
    try {
      validateSuiteCase(artifact, suite.benchmarkType);
      if (ids.has(artifact.id)) issues.push(issue("duplicate-case", "Benchmark case ids must be unique.", artifact.id));
      else validCases.push(artifact);
      ids.add(artifact.id);
    } catch (error) {
      issues.push(issue("invalid-case", error?.message || "Benchmark suite case is invalid.", artifact?.id));
    }
  }
  const durations = suiteDurations(validCases);
  const scenarioIds = new Set(validCases.flatMap((artifact) => (
    normalizeTrackingBenchmarkScenarios(artifact.reviewEvidence?.scenarioTags)
  )));
  const missingScenarioIds = requiredScenarioIds.filter((scenarioId) => !scenarioIds.has(scenarioId));
  if (validCases.length < TRACKING_GROUND_TRUTH_SUITE_MIN_CASES) {
    issues.push(issue("case-count", `Add at least ${TRACKING_GROUND_TRUTH_SUITE_MIN_CASES} unique reviewed cases.`));
  }
  if (durations.uniqueDurationMs < TRACKING_GROUND_TRUTH_SUITE_MIN_DURATION_MS) {
    issues.push(issue("duration", "Reach at least 10 minutes of unique reviewed match time."));
  }
  if (missingScenarioIds.length) issues.push(issue("scenario-coverage", "Cover every required football scenario."));
  const sourceCount = new Set(validCases.map((artifact) => artifact.sourceFingerprint)).size;
  return {
    ready: issues.length === 0,
    issues,
    benchmarkType: suite.benchmarkType,
    profileId: trackingGroundTruthProfileForType(suite.benchmarkType),
    caseCount: validCases.length,
    sourceCount,
    scenarioIds: [...scenarioIds],
    missingScenarioIds,
    ...durations,
    recommendedMaximumExceeded: durations.uniqueDurationMs > TRACKING_GROUND_TRUTH_SUITE_RECOMMENDED_MAX_DURATION_MS,
  };
}

export function createGroundTruthSuiteArtifact(suiteValue = {}, options = {}) {
  const suite = trackingGroundTruthSuiteEntry({ suite: suiteValue });
  const readiness = groundTruthSuiteReadiness(suite);
  if (!readiness.ready) {
    throw new TrackingGroundTruthError(
      readiness.issues.map((entry) => entry.message).join(" "),
      "TRACKING_GROUND_TRUTH_SUITE_NOT_READY",
    );
  }
  const artifact = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    protocol: TRACKING_GROUND_TRUTH_SUITE_PROTOCOL,
    id: `${suite.id}-r${suite.revision}`,
    profileId: readiness.profileId,
    createdAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    summary: {
      benchmarkType: readiness.benchmarkType,
      caseCount: readiness.caseCount,
      sourceCount: readiness.sourceCount,
      uniqueDurationMs: readiness.uniqueDurationMs,
      overlapDurationMs: readiness.overlapDurationMs,
      scenarioIds: readiness.scenarioIds,
    },
    cases: suite.cases.slice().sort((first, second) => (
      String(first.sourceFingerprint).localeCompare(String(second.sourceFingerprint))
      || Number(first.range?.startMs) - Number(second.range?.startMs)
      || String(first.id).localeCompare(String(second.id))
    )),
  };
  if (benchmarkSerializedBytes(artifact, "Ground-truth suite") > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    throw new TrackingGroundTruthError("The ground-truth suite is too large.", "TRACKING_GROUND_TRUTH_SUITE_LIMIT");
  }
  assertBenchmarkMetadataOnly(artifact);
  return deepFreeze(artifact);
}

function sameScenarioSet(values = [], expected = []) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return false;
  const normalized = normalizeTrackingBenchmarkScenarios(values);
  if (normalized.length !== values.length) return false;
  return normalized.slice().sort().join("|") === expected.slice().sort().join("|");
}

export function validateGroundTruthSuiteArtifact(artifact = {}) {
  const summaryBenchmarkType = artifact.summary?.benchmarkType;
  if (summaryBenchmarkType && ![
    TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
    TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  ].includes(summaryBenchmarkType)) {
    throw new TrackingGroundTruthError("The ground-truth suite benchmark type is invalid.");
  }
  const benchmarkType = normalizeTrackingGroundTruthBenchmarkType(summaryBenchmarkType, artifact.profileId);
  if (artifact.protocol !== TRACKING_GROUND_TRUTH_SUITE_PROTOCOL
    || Number(artifact.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION
    || artifact.profileId !== trackingGroundTruthProfileForType(benchmarkType)
    || (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
      && summaryBenchmarkType !== TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT)
    || typeof artifact.id !== "string"
    || !artifact.id.trim()
    || artifact.id.length > 160
    || /[\r\n]/.test(artifact.id)
    || !Number.isFinite(Date.parse(artifact.createdAt))
    || !Array.isArray(artifact.cases)
    || artifact.cases.length > 100) {
    throw new TrackingGroundTruthError("The ground-truth suite artifact is invalid.");
  }
  if (benchmarkSerializedBytes(artifact, "Ground-truth suite") > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    throw new TrackingGroundTruthError("The ground-truth suite is too large.", "TRACKING_GROUND_TRUTH_SUITE_LIMIT");
  }
  assertBenchmarkMetadataOnly(artifact);
  const readiness = groundTruthSuiteReadiness({ benchmarkType, cases: artifact.cases });
  const summary = artifact.summary || {};
  if (!readiness.ready
    || (summary.benchmarkType && summary.benchmarkType !== readiness.benchmarkType)
    || summary.caseCount !== readiness.caseCount
    || summary.sourceCount !== readiness.sourceCount
    || summary.uniqueDurationMs !== readiness.uniqueDurationMs
    || summary.overlapDurationMs !== readiness.overlapDurationMs
    || !sameScenarioSet(summary.scenarioIds, readiness.scenarioIds)) {
    throw new TrackingGroundTruthError(
      "The ground-truth suite evidence does not match its reviewed cases.",
      "TRACKING_GROUND_TRUTH_SUITE_EVIDENCE_MISMATCH",
    );
  }
  return artifact;
}

export function groundTruthSuiteArtifactJson(artifactValue = {}) {
  const artifact = validateGroundTruthSuiteArtifact(artifactValue);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function buildMultiObjectSuiteFromGroundTruthSuite(artifactValue = {}, runsByCaseId = {}, options = {}) {
  const artifact = validateGroundTruthSuiteArtifact(artifactValue);
  if (normalizeTrackingGroundTruthBenchmarkType(artifact.summary?.benchmarkType, artifact.profileId)
    !== TRACKING_BENCHMARK_TYPE_MULTI_OBJECT) {
    throw new TrackingGroundTruthError("TrackEval requires a full-scene ground-truth suite.");
  }
  const runFor = (caseId) => runsByCaseId instanceof Map ? runsByCaseId.get(caseId) : runsByCaseId[caseId];
  const cases = artifact.cases.map((groundTruth) => {
    const run = runFor(groundTruth.id);
    if (!run) throw new TrackingGroundTruthError(`Provider prediction is missing for ${groundTruth.id}.`);
    return buildMultiObjectCaseFromGroundTruth(groundTruth, {
      ...run,
      id: String(run.id || `${groundTruth.id}-provider-run`),
    });
  });
  const suite = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    id: String(options.id || `${artifact.id}-provider-suite`).slice(0, 120),
    cases,
  };
  if (benchmarkSerializedBytes(suite, "Provider benchmark suite") > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    throw new TrackingGroundTruthError("The provider benchmark suite is too large.");
  }
  assertBenchmarkMetadataOnly(suite);
  return suite;
}
