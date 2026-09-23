import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeTrackingCandidateScreeningPack } from "./tracking-candidate-screening.mjs";

export const TRACKING_CANDIDATE_REIDENTIFICATION_SCREENING_PROTOCOL =
  "football-science-tracking-reidentification-candidate-screening-v1";
const candidateEvidenceProtocol = "football-science-tracking-candidate-stage-run-v1";
const associationScreeningProtocol = "football-science-tracking-association-candidate-screening-v1";

export class TrackingCandidateReidentificationScreeningError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_REIDENTIFICATION_SCREENING_INVALID") {
    super(message);
    this.name = "TrackingCandidateReidentificationScreeningError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateReidentificationScreeningError(message, code);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    invalid(`${label} contains unsupported or missing fields.`);
  }
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 120 || !/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function finiteNumber(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function safeRelativeFile(value, caseId) {
  const text = String(value || "");
  const expected = `cases/${caseId}.candidate-stage.json`;
  if (text !== expected || path.posix.normalize(text) !== text) invalid("Re-identification evidence path is invalid.");
  return text;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizeProviderIdentity(value = {}, expectedStage = "") {
  exactKeys(value, [
    "id", "version", "protocol", "stage", "capabilities", "manifestFingerprintSha256",
    "executionFingerprintSha256",
  ], "Screening provider");
  if (!Array.isArray(value.capabilities) || !value.capabilities.length || value.capabilities.length > 20) {
    invalid("Screening provider capabilities are invalid.");
  }
  const capabilities = [...new Set(value.capabilities.map((entry) => identifier(entry, "provider capability")))].sort();
  if (capabilities.length !== value.capabilities.length) invalid("Screening provider capabilities are duplicated.");
  const provider = {
    id: identifier(value.id, "provider id"),
    version: identifier(value.version, "provider version"),
    protocol: identifier(value.protocol, "provider protocol"),
    stage: identifier(value.stage, "provider stage"),
    capabilities,
    manifestFingerprintSha256: sha256(value.manifestFingerprintSha256, "provider manifest fingerprint"),
    executionFingerprintSha256: sha256(value.executionFingerprintSha256, "provider execution fingerprint"),
  };
  if (expectedStage && provider.stage !== expectedStage) invalid(`Screening provider must own the ${expectedStage} stage.`);
  return provider;
}

function normalizeEvidenceDescriptor(value = {}, caseId, label) {
  exactKeys(value, ["file", "bytes", "sha256", "artifactSha256"], label);
  return {
    file: safeRelativeFile(value.file, caseId),
    bytes: boundedInteger(value.bytes, `${label} bytes`, 1, 160 * 1024 * 1024),
    sha256: sha256(value.sha256, `${label} checksum`),
    artifactSha256: sha256(value.artifactSha256, `${label} artifact checksum`),
  };
}

function sameRange(first = {}, second = {}) {
  return Number(first.startMs) === Number(second.startMs) && Number(first.endMs) === Number(second.endMs);
}

function materializeTrajectories(association = {}) {
  const observations = association.request?.payload?.observations;
  const trajectories = association.result?.payload?.payload?.trajectories;
  if (!Array.isArray(observations) || !Array.isArray(trajectories)) {
    invalid("Re-identification screening needs association observations and trajectories.");
  }
  const observationById = new Map(observations.map((entry) => [identifier(entry.id, "observation id"), entry]));
  if (observationById.size !== observations.length) invalid("Association observations are duplicated.");
  return trajectories.map((trajectory) => ({
    id: identifier(trajectory.id, "trajectory id"),
    entityType: identifier(trajectory.entityType, "trajectory entity type"),
    observations: trajectory.observationIds.map((id) => {
      const observation = observationById.get(identifier(id, "trajectory observation id"));
      if (!observation) invalid("Association trajectory references a missing observation.");
      return observation;
    }),
    confidence: trajectory.confidence,
    discontinuitiesMs: [...trajectory.discontinuitiesMs],
  }));
}

function evidenceBoundary(association = {}, reidentification = {}) {
  if (association.protocol !== candidateEvidenceProtocol || reidentification.protocol !== candidateEvidenceProtocol
    || association.benchmarkOnly !== true || reidentification.benchmarkOnly !== true) {
    invalid("Candidate re-identification evidence protocol is invalid.");
  }
  if (association.provider?.stage !== "association" || reidentification.provider?.stage !== "reidentification") {
    invalid("Candidate evidence stages do not form an association-to-re-identification boundary.");
  }
  if (association.source?.fingerprintSha256 !== reidentification.source?.fingerprintSha256
    || !sameRange(association.range, reidentification.range)) {
    invalid("Re-identification evidence does not match its association source and range.");
  }
}

function trajectoryWindow(trajectory = {}) {
  const observations = trajectory.observations || [];
  if (!observations.length) invalid("Re-identification trajectory has no observations.");
  return {
    startMs: boundedInteger(observations[0].atMs, "trajectory start", 0, Number.MAX_SAFE_INTEGER),
    endMs: boundedInteger(observations.at(-1).atMs, "trajectory end", 0, Number.MAX_SAFE_INTEGER),
  };
}

function identityMetrics(trajectories = [], identities = []) {
  const playerTrajectories = trajectories.filter((entry) => entry.entityType === "player");
  const playersById = new Map(playerTrajectories.map((entry) => [entry.id, entry]));
  const assigned = new Set();
  const clusters = new Map();
  let confidenceSum = 0;
  for (const identity of identities) {
    const trajectoryId = identifier(identity.trajectoryId, "re-identification trajectory id");
    const identityKey = identifier(identity.identityKey, "opaque identity key");
    if (!playersById.has(trajectoryId) || assigned.has(trajectoryId)) {
      invalid("Re-identification references an unknown or repeated player trajectory.");
    }
    assigned.add(trajectoryId);
    confidenceSum += finiteNumber(identity.confidence, "re-identification confidence", 0, 1);
    if (!clusters.has(identityKey)) clusters.set(identityKey, []);
    clusters.get(identityKey).push(playersById.get(trajectoryId));
  }
  let overlapCollisionCount = 0;
  for (const trajectoriesInCluster of clusters.values()) {
    const windows = trajectoriesInCluster.map(trajectoryWindow).sort((left, right) => left.startMs - right.startMs);
    for (let index = 1; index < windows.length; index += 1) {
      if (windows[index].startMs <= windows[index - 1].endMs) overlapCollisionCount += 1;
    }
  }
  const singletonIdentityClusterCount = [...clusters.values()].filter((entries) => entries.length === 1).length;
  return {
    playerTrajectoryCount: playerTrajectories.length,
    assignedPlayerTrajectoryCount: assigned.size,
    unassignedPlayerTrajectoryCount: playerTrajectories.length - assigned.size,
    assignmentCoverage: playerTrajectories.length ? Number((assigned.size / playerTrajectories.length).toFixed(6)) : 1,
    identityClusterCount: clusters.size,
    singletonIdentityClusterCount,
    mergedTrajectoryCount: [...clusters.values()].reduce((sum, entries) => sum + Math.max(0, entries.length - 1), 0),
    overlapCollisionCount,
    meanConfidence: identities.length ? Number((confidenceSum / identities.length).toFixed(6)) : 0,
  };
}

export function summarizeTrackingCandidateReidentificationCase(value = {}) {
  const packCase = value.packCase || {};
  const association = value.associationEvidence || {};
  const reidentification = value.reidentificationEvidence || {};
  evidenceBoundary(association, reidentification);
  const trajectories = materializeTrajectories(association);
  const requested = reidentification.request?.payload?.trajectories;
  const identities = reidentification.result?.payload?.payload?.identities;
  if (!Array.isArray(requested) || !Array.isArray(identities)) {
    invalid("Re-identification screening requires requested trajectories and identities.");
  }
  if (hashValue(trajectories) !== hashValue(requested)) {
    invalid("Re-identification request does not reproduce the association trajectories.");
  }
  const metrics = identityMetrics(trajectories, identities);
  const realTimeFactor = finiteNumber(
    reidentification.execution?.realTimeFactor,
    "re-identification real-time factor",
    0.000001,
    10_000,
  );
  return deepFreeze({
    id: identifier(packCase.id, "re-identification screening case id"),
    scenarioTags: [...packCase.scenarioTags],
    sampleDurationMs: boundedInteger(
      reidentification.range.endMs - reidentification.range.startMs,
      "sample duration",
      1000,
      packCase.durationMs,
    ),
    input: {
      associationEvidence: normalizeEvidenceDescriptor(value.associationDescriptor, packCase.id, "Association evidence"),
      trajectoriesSha256: hashValue(trajectories),
      trajectoryCount: trajectories.length,
      playerTrajectoryCount: metrics.playerTrajectoryCount,
    },
    evidence: {
      file: safeRelativeFile(value.evidenceFile, packCase.id),
      bytes: boundedInteger(value.evidenceBytes, "re-identification evidence bytes", 1, 160 * 1024 * 1024),
      sha256: sha256(value.evidenceSha256, "re-identification evidence checksum"),
      artifactSha256: sha256(reidentification.result?.artifactSha256, "re-identification artifact checksum"),
    },
    reidentification: metrics,
    execution: {
      wallTimeMs: boundedInteger(reidentification.execution?.wallTimeMs, "re-identification wall time", 1, 24 * 60 * 60 * 1000),
      realTimeFactor,
      withinRealtimePolicy: realTimeFactor <= 1,
      isolation: identifier(reidentification.execution?.isolation, "re-identification isolation"),
      runtimeMode: identifier(reidentification.execution?.runtimeMode, "re-identification runtime mode"),
    },
  });
}

export function createTrackingCandidateReidentificationManifest(packValue = {}, associationManifest = {}, cases = [], options = {}) {
  const pack = normalizeTrackingCandidateScreeningPack(packValue);
  if (associationManifest.protocol !== associationScreeningProtocol || associationManifest.benchmarkOnly !== true
    || associationManifest.pack?.id !== pack.id) {
    invalid("Association screening does not match the annotation pack.");
  }
  if (cases.length !== pack.cases.length || cases.some((entry, index) => entry.summary?.id !== pack.cases[index].id)) {
    invalid("Re-identification cases do not match the annotation pack.");
  }
  const associationProvider = normalizeProviderIdentity(associationManifest.provider, "association");
  const providers = cases.map((entry) => normalizeProviderIdentity(entry.provider, "reidentification"));
  const provider = providers[0];
  if (!provider || providers.some((entry) => canonicalJson(entry) !== canonicalJson(provider))) {
    invalid("Re-identification cases do not use one exact provider.");
  }
  if (!provider.capabilities.includes("reidentify:player")) invalid("Re-identification capability is missing.");
  const realTimePassed = cases.every((entry) => entry.summary.execution.withinRealtimePolicy);
  const collisionFreePassed = cases.every((entry) => entry.summary.reidentification.overlapCollisionCount === 0);
  const playerTrajectoryCount = cases.reduce((sum, entry) => sum + entry.summary.reidentification.playerTrajectoryCount, 0);
  const assignedPlayerTrajectoryCount = cases.reduce(
    (sum, entry) => sum + entry.summary.reidentification.assignedPlayerTrajectoryCount,
    0,
  );
  const outputProducedPassed = playerTrajectoryCount > 0 && assignedPlayerTrajectoryCount > 0;
  const screeningPassed = realTimePassed && collisionFreePassed && outputProducedPassed;
  const createdAt = new Date(options.now?.() ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) invalid("Invalid re-identification screening creation date.");
  const payload = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_REIDENTIFICATION_SCREENING_PROTOCOL,
    id: identifier(options.id || `${pack.id}-${provider.id}-${provider.version}`, "re-identification screening id"),
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: screeningPassed ? "screening-pass-awaiting-ground-truth" : "failed-screening",
    createdAt: createdAt.toISOString(),
    pack: { id: pack.id, sourceSha256: pack.source.sha256, caseCount: pack.summary.caseCount, scenarioIds: [...pack.summary.scenarioIds] },
    input: {
      protocol: associationManifest.protocol,
      id: identifier(associationManifest.id, "association screening id"),
      screeningSha256: sha256(associationManifest.screeningSha256, "association screening checksum"),
      provider: associationProvider,
    },
    provider,
    policy: { maxRealtimeFactor: 1, realTimePassed, collisionFreePassed, outputProducedPassed },
    reviewGate: {
      suggestionLayerAllowed: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      providerApprovalBlocked: true,
      nextStep: screeningPassed ? "reviewed-identity-ground-truth-and-trackeval" : "replace-or-optimize-candidate-before-ground-truth",
    },
    summary: {
      sampleDurationMs: cases.reduce((sum, entry) => sum + entry.summary.sampleDurationMs, 0),
      wallTimeMs: cases.reduce((sum, entry) => sum + entry.summary.execution.wallTimeMs, 0),
      worstRealtimeFactor: Math.max(...cases.map((entry) => entry.summary.execution.realTimeFactor)),
      playerTrajectoryCount,
      assignedPlayerTrajectoryCount,
      assignmentCoverage: playerTrajectoryCount ? Number((assignedPlayerTrajectoryCount / playerTrajectoryCount).toFixed(6)) : 1,
      identityClusterCount: cases.reduce((sum, entry) => sum + entry.summary.reidentification.identityClusterCount, 0),
      singletonIdentityClusterCount: cases.reduce(
        (sum, entry) => sum + entry.summary.reidentification.singletonIdentityClusterCount,
        0,
      ),
      mergedTrajectoryCount: cases.reduce((sum, entry) => sum + entry.summary.reidentification.mergedTrajectoryCount, 0),
      overlapCollisionCount: cases.reduce((sum, entry) => sum + entry.summary.reidentification.overlapCollisionCount, 0),
      caseCount: cases.length,
    },
    limitations: [
      "ground-truth-not-reviewed",
      "hota-not-measured",
      "idf1-not-measured",
      "id-switches-not-measured",
      "identity-cluster-accuracy-not-approved",
      "provider-weight-rights-require-independent-review",
    ],
    cases: cases.map((entry) => entry.summary),
  };
  return deepFreeze({ ...payload, screeningSha256: hashValue(payload) });
}

export const _private = Object.freeze({ canonicalJson, hashValue, materializeTrajectories, normalizeProviderIdentity });
