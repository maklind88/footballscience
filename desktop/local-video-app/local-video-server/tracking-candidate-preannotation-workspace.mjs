import { createHash } from "node:crypto";
import path from "node:path";

export const TRACKING_CANDIDATE_PREANNOTATION_WORKSPACE_PROTOCOL =
  "football-science-tracking-candidate-preannotation-workspace-v1";
export const TRACKING_CANDIDATE_PREANNOTATION_TRACK_MAP_PROTOCOL =
  "football-science-tracking-candidate-preannotation-track-map-v1";

const candidateEvidenceProtocol = "football-science-tracking-candidate-stage-run-v1";
const entityTypes = Object.freeze(["player", "ball", "referee"]);
const entityOrder = new Map(entityTypes.map((entityType, index) => [entityType, index]));

export class TrackingCandidatePreannotationError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_PREANNOTATION_INVALID") {
    super(message);
    this.name = "TrackingCandidatePreannotationError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidatePreannotationError(message, code);
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 120 || !/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) {
    invalid(`Invalid ${label}.`);
  }
  return text;
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    invalid(`Invalid ${label}.`);
  }
  return number;
}

function finite(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
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

function relativeFile(value, caseId, suffix, label) {
  const text = String(value || "");
  const expected = `cases/${caseId}.${suffix}`;
  if (text !== expected || path.posix.normalize(text) !== text) invalid(`Invalid ${label}.`);
  return text;
}

function fileDescriptor(value = {}, caseId, suffix, label) {
  return {
    file: relativeFile(value.file, caseId, suffix, `${label} file`),
    bytes: integer(value.bytes, `${label} bytes`, 1, 512 * 1024 * 1024),
    sha256: sha256(value.sha256, `${label} checksum`),
  };
}

function stageEvidence(value = {}, stage = "") {
  if (value.protocol !== candidateEvidenceProtocol
    || value.benchmarkOnly !== true
    || value.provider?.stage !== stage
    || value.result?.payload?.stage !== stage) {
    invalid(`Invalid ${stage} candidate evidence.`);
  }
  return value;
}

function decimal(value) {
  return Number(Number(value).toFixed(6)).toString();
}

function motRow(observation = {}, trackId = 0, frame = {}) {
  const frameIndex = integer(observation.frameIndex, "suggestion frame index", 0, frame.expectedFrames - 1);
  const box = observation.box || {};
  const left = finite(box.left, "suggestion box left", 0, 1);
  const top = finite(box.top, "suggestion box top", 0, 1);
  const width = finite(box.width, "suggestion box width", Number.EPSILON, 1);
  const height = finite(box.height, "suggestion box height", Number.EPSILON, 1);
  if (left + width > 1 + 1e-9 || top + height > 1 + 1e-9) invalid("Suggestion box leaves the video frame.");
  const confidence = finite(observation.confidence, "suggestion confidence", Number.EPSILON, 1);
  return {
    frameNumber: frameIndex + 1,
    trackId,
    text: [
      frameIndex + 1,
      trackId,
      decimal(left * frame.width),
      decimal(top * frame.height),
      decimal(width * frame.width),
      decimal(height * frame.height),
      decimal(confidence),
      -1,
      -1,
      -1,
    ].join(","),
  };
}

function trajectoryEntries(trajectories = [], observations = []) {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  const assigned = new Set();
  const entries = [...trajectories].sort((first, second) => (
    (entityOrder.get(first.entityType) ?? 99) - (entityOrder.get(second.entityType) ?? 99)
    || String(first.id).localeCompare(String(second.id))
  )).map((trajectory) => {
    if (!entityTypes.includes(trajectory.entityType)) invalid("Suggestion trajectory has an invalid entity type.");
    const values = trajectory.observationIds.map((observationId) => {
      const observation = byId.get(observationId);
      if (!observation || observation.entityType !== trajectory.entityType || assigned.has(observationId)) {
        invalid("Suggestion association lineage is incomplete or duplicated.");
      }
      assigned.add(observationId);
      return observation;
    });
    return {
      suggestionId: identifier(trajectory.id, "suggestion trajectory id"),
      sourceTrajectoryId: trajectory.id,
      entityType: trajectory.entityType,
      associationStatus: "associated",
      observations: values,
    };
  });
  observations.filter((observation) => !assigned.has(observation.id))
    .sort((first, second) => first.frameIndex - second.frameIndex || first.id.localeCompare(second.id))
    .forEach((observation) => entries.push({
      suggestionId: `unassociated:${identifier(observation.id, "suggestion observation id")}`,
      sourceTrajectoryId: "",
      entityType: observation.entityType,
      associationStatus: "unassociated",
      observations: [observation],
    }));
  return entries;
}

export function createTrackingCandidatePreannotationCase(value = {}) {
  const packCase = value.packCase || {};
  const extraction = value.extraction || {};
  const detection = stageEvidence(value.detectionEvidence, "detection");
  const association = value.associationEvidence
    ? stageEvidence(value.associationEvidence, "association")
    : null;
  const caseId = identifier(packCase.id, "preannotation case id");
  const durationMs = integer(packCase.durationMs, "preannotation case duration", 1000, 4 * 60 * 1000);
  const sourceSha256 = sha256(packCase.clip?.sha256, "preannotation source checksum");
  for (const evidence of [detection, ...(association ? [association] : [])]) {
    if (evidence.source?.fingerprintSha256 !== sourceSha256
      || Number(evidence.range?.startMs) !== 0
      || Number(evidence.range?.endMs) !== durationMs) {
      invalid(
        `Case ${caseId} needs complete full-range candidate evidence before preannotation.`,
        "TRACKING_CANDIDATE_PREANNOTATION_PARTIAL",
      );
    }
  }
  const observations = detection.result.payload.payload.observations;
  const requestedObservations = association?.request?.payload?.observations || observations;
  const trajectories = association?.result?.payload?.payload?.trajectories || [];
  if (!Array.isArray(observations) || !Array.isArray(requestedObservations) || !Array.isArray(trajectories)
    || canonicalJson(observations) !== canonicalJson(requestedObservations)) {
    invalid("Association evidence is not bound to the exact detection observations.");
  }
  const frame = {
    width: integer(extraction.width, "preannotation width", 1, 16_384),
    height: integer(extraction.height, "preannotation height", 1, 16_384),
    expectedFrames: integer(packCase.expectedFrames, "preannotation frame count", 1, 1_000_000),
  };
  const entries = trajectoryEntries(trajectories, observations).map((entry, index) => ({
    ...entry,
    motTrackId: index + 1,
  }));
  const rows = entries.flatMap((entry) => entry.observations.map(
    (observation) => motRow(observation, entry.motTrackId, frame),
  )).sort((first, second) => first.frameNumber - second.frameNumber || first.trackId - second.trackId);
  const entityObservationCounts = Object.fromEntries(entityTypes.map((entityType) => [
    entityType,
    observations.filter((observation) => observation.entityType === entityType).length,
  ]));
  const entityTrackCounts = Object.fromEntries(entityTypes.map((entityType) => [
    entityType,
    entries.filter((entry) => entry.entityType === entityType).length,
  ]));
  const sampledFrames = new Set(observations.map((observation) => observation.frameIndex)).size;
  const summary = {
    observationCount: observations.length,
    trackCount: entries.length,
    associatedTrackCount: entries.filter((entry) => entry.associationStatus === "associated").length,
    unassociatedObservationCount: entries.filter((entry) => entry.associationStatus === "unassociated").length,
    sampledFrames,
    sampledFrameCoverage: Number((sampledFrames / frame.expectedFrames).toFixed(6)),
    entityObservationCounts,
    entityTrackCounts,
    missingSuggestedEntityTypes: entityTypes.filter((entityType) => entityObservationCounts[entityType] === 0),
  };
  const trackMap = deepFreeze({
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_PREANNOTATION_TRACK_MAP_PROTOCOL,
    caseId,
    benchmarkOnly: true,
    suggestionOnly: true,
    approvalReady: false,
    sourceSha256,
    detectionArtifactSha256: sha256(detection.result.artifactSha256, "detection artifact checksum"),
    associationArtifactSha256: association
      ? sha256(association.result.artifactSha256, "association artifact checksum")
      : "",
    associationEvaluated: Boolean(association),
    tracks: entries.map((entry) => ({
      motTrackId: entry.motTrackId,
      suggestionId: entry.suggestionId,
      sourceTrajectoryId: entry.sourceTrajectoryId,
      entityType: entry.entityType,
      associationStatus: entry.associationStatus,
      observationCount: entry.observations.length,
      reviewState: "unreviewed",
    })),
  });
  return deepFreeze({
    id: caseId,
    motText: `${rows.map((row) => row.text).join("\n")}\n`,
    trackMap,
    summary,
  });
}

export function createTrackingCandidatePreannotationWorkspace(pack = {}, associationManifest = {}, cases = [], options = {}) {
  if (!Array.isArray(cases) || cases.length !== pack.cases?.length
    || cases.some((entry, index) => entry.id !== pack.cases[index].id)) {
    invalid("Preannotation cases do not match their annotation pack.");
  }
  const createdAt = new Date(options.now?.() ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) invalid("Invalid preannotation creation date.");
  const normalizedCases = cases.map((entry) => ({
    id: entry.id,
    suggestion: fileDescriptor(entry.suggestion, entry.id, "suggestions.mot.txt", "suggestion"),
    trackMap: fileDescriptor(entry.trackMap, entry.id, "track-map.json", "track map"),
    summary: entry.summary,
  }));
  const missingSuggestedEntityTypes = entityTypes.filter((entityType) => normalizedCases.some(
    (entry) => entry.summary.entityObservationCounts[entityType] === 0,
  ));
  const associationEvaluated = Boolean(associationManifest.screeningSha256);
  const payload = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_PREANNOTATION_WORKSPACE_PROTOCOL,
    id: identifier(options.id || `${pack.id}-preannotation-v1`, "preannotation workspace id"),
    benchmarkOnly: true,
    suggestionOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    createdAt: createdAt.toISOString(),
    pack: {
      id: pack.id,
      sourceSha256: pack.source.sha256,
      caseCount: pack.summary.caseCount,
      reviewStatus: pack.summary.reviewStatus,
    },
    input: {
      detectionScreeningSha256: sha256(
        associationManifest.input?.screeningSha256 || options.detectionScreeningSha256,
        "detection screening checksum",
      ),
      associationScreeningSha256: associationEvaluated
        ? sha256(associationManifest.screeningSha256, "association screening checksum")
        : "",
      associationEvaluated,
    },
    reviewGate: {
      originalAnnotationMutationAllowed: false,
      suggestionPromotionAllowed: false,
      exhaustiveHumanReviewRequired: true,
      independentRightsAttestationRequired: true,
      identityAndTeamAssignmentRequired: true,
      missingEntitySearchRequired: missingSuggestedEntityTypes.length > 0,
      associationReviewRequired: !associationEvaluated
        || normalizedCases.some((entry) => entry.summary.unassociatedObservationCount > 0),
    },
    summary: {
      caseCount: normalizedCases.length,
      durationMs: pack.summary.uniqueDurationMs,
      observationCount: normalizedCases.reduce((sum, entry) => sum + entry.summary.observationCount, 0),
      trackCount: normalizedCases.reduce((sum, entry) => sum + entry.summary.trackCount, 0),
      unassociatedObservationCount: normalizedCases.reduce(
        (sum, entry) => sum + entry.summary.unassociatedObservationCount,
        0,
      ),
      associationEvaluated,
      missingSuggestedEntityTypes,
    },
    limitations: [
      "candidate-output-is-not-ground-truth",
      "every-frame-and-missing-entity-review-required",
      "identity-team-and-shirt-assignments-not-reviewed",
      "dataset-rights-attestation-not-completed",
      "precision-recall-hota-idf1-not-measured",
    ],
    cases: normalizedCases,
  };
  return deepFreeze({ ...payload, workspaceSha256: hashValue(payload) });
}

export const _private = Object.freeze({ canonicalJson, hashValue });
