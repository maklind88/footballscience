import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeTrackingCandidateScreeningPack } from "./tracking-candidate-screening.mjs";

export const TRACKING_CANDIDATE_ASSOCIATION_SCREENING_PROTOCOL =
  "football-science-tracking-association-candidate-screening-v1";
const candidateEvidenceProtocol = "football-science-tracking-candidate-stage-run-v1";
const detectionScreeningProtocol = "football-science-tracking-candidate-screening-v1";
const supportedEntities = Object.freeze(["person", "player", "ball", "referee"]);

export class TrackingCandidateAssociationScreeningError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_ASSOCIATION_SCREENING_INVALID") {
    super(message);
    this.name = "TrackingCandidateAssociationScreeningError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateAssociationScreeningError(message, code);
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
  if (text !== expected || path.posix.normalize(text) !== text) invalid("Association evidence path is invalid.");
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

function evidenceBoundary(detection = {}, association = {}) {
  if (detection.protocol !== candidateEvidenceProtocol || association.protocol !== candidateEvidenceProtocol
    || detection.benchmarkOnly !== true || association.benchmarkOnly !== true) {
    invalid("Candidate association evidence protocol is invalid.");
  }
  if (detection.provider?.stage !== "detection" || association.provider?.stage !== "association") {
    invalid("Candidate evidence stages do not form a detection-to-association boundary.");
  }
  if (detection.source?.fingerprintSha256 !== association.source?.fingerprintSha256
    || !sameRange(detection.range, association.range)) {
    invalid("Association evidence does not match its detection source and range.");
  }
}

export function summarizeTrackingCandidateAssociationCase(value = {}) {
  const packCase = value.packCase || {};
  const detection = value.detectionEvidence || {};
  const association = value.associationEvidence || {};
  evidenceBoundary(detection, association);
  const observations = detection.result?.payload?.payload?.observations;
  const requested = association.request?.payload?.observations;
  const trajectories = association.result?.payload?.payload?.trajectories;
  if (!Array.isArray(observations) || !Array.isArray(requested) || !Array.isArray(trajectories)) {
    invalid("Association screening requires observations and trajectories.");
  }
  if (hashValue(observations) !== hashValue(requested)) {
    invalid("Association request does not reproduce the detection observations.");
  }
  const inputEntities = Object.fromEntries(supportedEntities.map((entity) => [entity, 0]));
  const trajectoryEntities = Object.fromEntries(supportedEntities.map((entity) => [entity, 0]));
  const observationIds = new Map();
  for (const observation of observations) {
    const id = identifier(observation.id, "detection observation id");
    const entityType = identifier(observation.entityType, "detection entity type");
    if (!supportedEntities.includes(entityType) || observationIds.has(id)) invalid("Detection observations are invalid or duplicated.");
    observationIds.set(id, entityType);
    inputEntities[entityType] += 1;
  }
  const assigned = new Set();
  let singletonTrajectories = 0;
  let discontinuityCount = 0;
  let confidenceSum = 0;
  for (const trajectory of trajectories) {
    const entityType = identifier(trajectory.entityType, "trajectory entity type");
    if (!supportedEntities.includes(entityType) || !Array.isArray(trajectory.observationIds)
      || !trajectory.observationIds.length || !Array.isArray(trajectory.discontinuitiesMs)) {
      invalid("Association trajectory is invalid.");
    }
    trajectoryEntities[entityType] += 1;
    if (trajectory.observationIds.length === 1) singletonTrajectories += 1;
    discontinuityCount += trajectory.discontinuitiesMs.length;
    confidenceSum += finiteNumber(trajectory.confidence, "trajectory confidence", 0, 1);
    for (const observationId of trajectory.observationIds) {
      const id = identifier(observationId, "trajectory observation id");
      if (observationIds.get(id) !== entityType || assigned.has(id)) {
        invalid("Association lineage is unknown, cross-entity, or duplicated.");
      }
      assigned.add(id);
    }
  }
  const realTimeFactor = finiteNumber(association.execution?.realTimeFactor, "association real-time factor", 0.000001, 10_000);
  const assignedCount = assigned.size;
  return deepFreeze({
    id: identifier(packCase.id, "association screening case id"),
    scenarioTags: [...packCase.scenarioTags],
    sampleDurationMs: boundedInteger(association.range.endMs - association.range.startMs, "sample duration", 1000, packCase.durationMs),
    input: {
      detectionEvidence: normalizeEvidenceDescriptor(value.detectionDescriptor, packCase.id, "Detection evidence"),
      observationsSha256: hashValue(observations),
      observations: { total: observations.length, entities: inputEntities },
    },
    evidence: {
      file: safeRelativeFile(value.evidenceFile, packCase.id),
      bytes: boundedInteger(value.evidenceBytes, "association evidence bytes", 1, 160 * 1024 * 1024),
      sha256: sha256(value.evidenceSha256, "association evidence checksum"),
      artifactSha256: sha256(association.result?.artifactSha256, "association artifact checksum"),
    },
    association: {
      trajectoryCount: trajectories.length,
      trajectoryEntities,
      assignedObservationCount: assignedCount,
      unassignedObservationCount: observations.length - assignedCount,
      assignmentCoverage: observations.length ? Number((assignedCount / observations.length).toFixed(6)) : 1,
      singletonTrajectories,
      meanObservationsPerTrajectory: trajectories.length
        ? Number((assignedCount / trajectories.length).toFixed(6))
        : 0,
      meanConfidence: trajectories.length ? Number((confidenceSum / trajectories.length).toFixed(6)) : 0,
      discontinuityCount,
    },
    execution: {
      wallTimeMs: boundedInteger(association.execution?.wallTimeMs, "association wall time", 1, 24 * 60 * 60 * 1000),
      realTimeFactor,
      withinRealtimePolicy: realTimeFactor <= 1,
      isolation: identifier(association.execution?.isolation, "association isolation"),
      runtimeMode: identifier(association.execution?.runtimeMode, "association runtime mode"),
    },
  });
}

export function createTrackingCandidateAssociationManifest(packValue = {}, detectionManifest = {}, cases = [], options = {}) {
  const pack = normalizeTrackingCandidateScreeningPack(packValue);
  if (detectionManifest.protocol !== detectionScreeningProtocol || detectionManifest.benchmarkOnly !== true
    || detectionManifest.pack?.id !== pack.id) {
    invalid("Detection screening does not match the annotation pack.");
  }
  if (cases.length !== pack.cases.length || cases.some((entry, index) => entry.summary?.id !== pack.cases[index].id)) {
    invalid("Association cases do not match the annotation pack.");
  }
  const detectionProvider = normalizeProviderIdentity(detectionManifest.provider, "detection");
  const providers = cases.map((entry) => normalizeProviderIdentity(entry.provider, "association"));
  const provider = providers[0];
  if (!provider || providers.some((entry) => canonicalJson(entry) !== canonicalJson(provider))) {
    invalid("Association cases do not use one exact provider.");
  }
  if (!provider.capabilities.includes("associate:multi-object")) invalid("Association capability is missing.");
  const inputObservationCount = cases.reduce((sum, entry) => sum + entry.summary.input.observations.total, 0);
  const assignedObservationCount = cases.reduce((sum, entry) => sum + entry.summary.association.assignedObservationCount, 0);
  const realTimePassed = cases.every((entry) => entry.summary.execution.withinRealtimePolicy);
  const completeLineagePassed = assignedObservationCount === inputObservationCount;
  const screeningPassed = realTimePassed && completeLineagePassed;
  const entityInputTotals = Object.fromEntries(supportedEntities.map((entity) => [entity,
    cases.reduce((sum, entry) => sum + entry.summary.input.observations.entities[entity], 0),
  ]));
  const entityTrajectoryTotals = Object.fromEntries(supportedEntities.map((entity) => [entity,
    cases.reduce((sum, entry) => sum + entry.summary.association.trajectoryEntities[entity], 0),
  ]));
  const createdAt = new Date(options.now?.() ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) invalid("Invalid association screening creation date.");
  const payload = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_ASSOCIATION_SCREENING_PROTOCOL,
    id: identifier(options.id || `${pack.id}-${provider.id}-${provider.version}`, "association screening id"),
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: screeningPassed ? "screening-pass-awaiting-ground-truth" : "failed-screening",
    createdAt: createdAt.toISOString(),
    pack: { id: pack.id, sourceSha256: pack.source.sha256, caseCount: pack.summary.caseCount, scenarioIds: [...pack.summary.scenarioIds] },
    input: {
      protocol: detectionManifest.protocol,
      id: identifier(detectionManifest.id, "detection screening id"),
      screeningSha256: sha256(detectionManifest.screeningSha256, "detection screening checksum"),
      provider: detectionProvider,
    },
    provider,
    policy: { maxRealtimeFactor: 1, realTimePassed, completeLineagePassed },
    reviewGate: {
      suggestionLayerAllowed: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      providerApprovalBlocked: !screeningPassed,
      nextStep: screeningPassed ? "independent-identity-ground-truth-review" : "replace-or-optimize-candidate-before-approval",
    },
    summary: {
      sampleDurationMs: cases.reduce((sum, entry) => sum + entry.summary.sampleDurationMs, 0),
      wallTimeMs: cases.reduce((sum, entry) => sum + entry.summary.execution.wallTimeMs, 0),
      worstRealtimeFactor: Math.max(...cases.map((entry) => entry.summary.execution.realTimeFactor)),
      inputObservationCount,
      assignedObservationCount,
      assignmentCoverage: inputObservationCount ? Number((assignedObservationCount / inputObservationCount).toFixed(6)) : 1,
      trajectoryCount: cases.reduce((sum, entry) => sum + entry.summary.association.trajectoryCount, 0),
      singletonTrajectoryCount: cases.reduce((sum, entry) => sum + entry.summary.association.singletonTrajectories, 0),
      discontinuityCount: cases.reduce((sum, entry) => sum + entry.summary.association.discontinuityCount, 0),
      entityInputTotals,
      entityTrajectoryTotals,
      caseCount: cases.length,
    },
    limitations: [
      "ground-truth-not-reviewed",
      "identity-continuity-not-measured",
      "id-switches-not-measured",
      "association-accuracy-not-approved",
      "team-classification-not-measured",
    ],
    cases: cases.map((entry) => entry.summary),
  };
  return deepFreeze({ ...payload, screeningSha256: hashValue(payload) });
}

export const _private = Object.freeze({ canonicalJson, hashValue, normalizeProviderIdentity });
