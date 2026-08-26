import {
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL,
  assertBenchmarkEnvelope,
  benchmarkBoundedString,
} from "./trackingBenchmarkContract.js";
import {
  buildMultiObjectCaseFromGroundTruth,
  buildSelectedObjectCaseFromGroundTruth,
} from "./trackingGroundTruthService.js";
import { validateGroundTruthSuiteArtifact } from "./trackingGroundTruthSuiteService.js";
import { validateTrackingProviderRunSuiteArtifact } from "./trackingProviderRunService.js";

export { TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL } from "./trackingBenchmarkContract.js";

export class TrackingBenchmarkAssemblyError extends Error {
  constructor(message, code = "TRACKING_BENCHMARK_ASSEMBLY_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingBenchmarkAssemblyError";
    this.code = code;
  }
}

function invalid(message, code, options) {
  throw new TrackingBenchmarkAssemblyError(message, code, options);
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function rangeKey(value = {}) {
  return [
    value.sourceFingerprint,
    value.sourceEvidence?.angleId || "primary",
    value.range?.startMs,
    value.range?.endMs,
  ].join(":");
}

function matchingRuns(groundTruth = {}, runs = []) {
  const key = rangeKey(groundTruth);
  return runs.filter((run) => rangeKey(run) === key);
}

function assertFrameMatch(groundTruth = {}, runs = []) {
  if (runs.some((run) => (
    run.frame.width !== groundTruth.frame.width || run.frame.height !== groundTruth.frame.height
  ))) {
    invalid(`Provider run frame does not match ${groundTruth.id}.`, "TRACKING_BENCHMARK_ASSEMBLY_FRAME_MISMATCH");
  }
}

function selectedPlayerIdentity(track = {}) {
  return String(track.playerId || "").trim()
    || [track.playerLabel, track.teamSide, track.shirtNumber]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .join(":");
}

function selectedObjectCase(groundTruth = {}, runs = []) {
  const targetId = String(groundTruth.reviewEvidence?.selectedObjectTargetTrackId || "");
  const target = groundTruth.groundTruth?.tracks?.find((track) => track.id === targetId);
  const candidates = runs.flatMap((run) => run.prediction.tracks.map((track) => ({ run, track })));
  const exact = candidates.filter(({ track }) => track.id === targetId);
  const targetIdentity = selectedPlayerIdentity(target);
  const identityMatches = targetIdentity
    ? candidates.filter(({ track }) => selectedPlayerIdentity(track) === targetIdentity)
    : [];
  const exactWithIdentityDuplicates = exact.length === 1
    ? identityMatches.filter((candidate) => candidate !== exact[0])
    : [];
  const matches = exact.length
    ? [...exact, ...exactWithIdentityDuplicates]
    : identityMatches.length
      ? identityMatches
      : candidates.length === 1 ? candidates : [];
  if (matches.length !== 1) {
    invalid(
      matches.length
        ? `Selected-object target ${targetId} has duplicate provider runs.`
        : `Provider prediction is missing selected-object target ${targetId}.`,
      "TRACKING_BENCHMARK_ASSEMBLY_TARGET_MISMATCH",
    );
  }
  const match = matches[0];
  return {
    reportCase: buildSelectedObjectCaseFromGroundTruth(groundTruth, {
      id: `${groundTruth.id}-${match.run.provider.providerId}`,
      predictionTrack: match.track,
      performance: match.run.performance,
    }),
    usedRunIds: [match.run.id],
  };
}

function multiObjectCase(groundTruth = {}, runs = []) {
  const tracks = runs.flatMap((run) => run.prediction.tracks);
  const ids = tracks.map((track) => track.id);
  if (new Set(ids).size !== ids.length) {
    invalid(`Provider runs contain duplicate track ids for ${groundTruth.id}.`);
  }
  const devices = [...new Set(runs.map((run) => run.performance.device).filter(Boolean))];
  return {
    reportCase: buildMultiObjectCaseFromGroundTruth(groundTruth, {
      id: `${groundTruth.id}-${runs[0].provider.providerId}`,
      predictionTracks: tracks,
      performance: {
        processingMs: runs.reduce((total, run) => total + run.performance.processingMs, 0),
        ...(devices.length ? { device: devices.length === 1 ? devices[0] : "mixed" } : {}),
      },
    }),
    usedRunIds: runs.map((run) => run.id),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function assembleTrackingBenchmarkSuite(groundTruthValue = {}, runSuiteValue = {}, options = {}) {
  const groundTruth = validateGroundTruthSuiteArtifact(groundTruthValue);
  const runSuite = validateTrackingProviderRunSuiteArtifact(runSuiteValue);
  const selectedObject = runSuite.provider.stage === "segmentation";
  const cases = [];
  const usedRunIds = new Set();
  for (const reference of groundTruth.cases) {
    const runs = matchingRuns(reference, runSuite.runs);
    if (!runs.length) invalid(`Provider prediction is missing for ${reference.id}.`);
    assertFrameMatch(reference, runs);
    const built = selectedObject
      ? selectedObjectCase(reference, runs)
      : multiObjectCase(reference, runs);
    built.usedRunIds.forEach((runId) => usedRunIds.add(runId));
    cases.push(built.reportCase);
  }
  const providerRunEvidence = {
    protocol: TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL,
    provider: {
      ...runSuite.provider,
      capabilities: [...runSuite.provider.capabilities],
    },
    groundTruthSuiteId: groundTruth.id,
    groundTruthSuiteSha256: sha256(options.groundTruthSuiteSha256, "Ground-truth suite checksum"),
    providerRunSuiteId: runSuite.id,
    providerRunSuiteSha256: sha256(options.providerRunSuiteSha256, "Provider run suite checksum"),
    runIds: [...usedRunIds].sort(),
  };
  const suite = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    id: benchmarkBoundedString(
      options.id || `${groundTruth.id}-${runSuite.provider.providerId}`,
      "assembled benchmark suite id",
      120,
    ),
    providerRunEvidence,
    cases,
  };
  assertBenchmarkEnvelope(suite, {
    label: "Assembled tracking benchmark suite",
    maxBytes: MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  });
  return deepFreeze(suite);
}
