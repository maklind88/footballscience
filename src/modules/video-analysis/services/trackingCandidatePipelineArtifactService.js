import { normalizeObjectTrack, trackingPoints } from "../domain/tracking.model.js";
import { createTrackingBenchmarkWorkspaceScope } from "./trackingBenchmarkWorkspaceService.js";
import {
  trackingCandidateEvidenceResponseSha256,
  validateTrackingCandidateStageEvidence,
} from "./trackingCandidateEvidenceService.js";

export const TRACKING_CANDIDATE_PIPELINE_RUN_PROTOCOL = "football-science-tracking-candidate-pipeline-run-v1";
export const MAX_TRACKING_CANDIDATE_PIPELINE_RUN_BYTES = 256 * 1024 * 1024;

const pipelineProtocol = "football-science-tracking-candidate-pipeline-v1";
const stageOrder = Object.freeze(["detection", "association", "reidentification", "classification"]);
const metadataFields = Object.freeze([
  "candidatePipelineProtocol", "candidatePipelineFingerprintSha256", "localSourceSha256", "angleId",
  "candidateDetectionEvidenceSha256", "candidateAssociationEvidenceSha256", "candidateAssociationArtifactSha256",
  "candidateReidentificationEvidenceSha256", "candidateClassificationEvidenceSha256",
  "candidateRole", "candidateRoleConfidence", "candidateTrajectoryIds",
]);

export class TrackingCandidatePipelineArtifactError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_INVALID") {
    super(message);
    this.name = "TrackingCandidatePipelineArtifactError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidatePipelineArtifactError(message, code);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

function text(value, label, maximum = 160) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum || /[\r\n]/.test(result)) invalid(`Invalid ${label}.`);
  return result;
}

function identifier(value, label) {
  const result = text(value, label, 200);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) invalid(`Invalid ${label}.`);
  return result;
}

function sha256(value, label) {
  const result = text(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) invalid(`${label} must be a SHA-256 hash.`);
  return result;
}

function range(value = {}, label = "candidate range") {
  exactKeys(value, ["startMs", "endMs"], label);
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) {
    invalid(`Invalid ${label}.`);
  }
  return { startMs, endMs };
}

function frame(value = {}) {
  exactKeys(value, ["width", "height"], "Candidate frame");
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16_384 || height > 16_384) invalid("Invalid candidate frame.");
  return { width, height };
}

function sync(value = {}) {
  exactKeys(value, ["angleId", "syncOffsetMs", "driftPpm"], "Candidate synchronization");
  const syncOffsetMs = Number(value.syncOffsetMs);
  const driftPpm = Number(value.driftPpm);
  if (!Number.isSafeInteger(syncOffsetMs) || Math.abs(syncOffsetMs) > 21_600_000
    || !Number.isFinite(driftPpm) || Math.abs(driftPpm) > 10_000) invalid("Invalid candidate synchronization.");
  return { angleId: identifier(value.angleId, "candidate angle id"), syncOffsetMs, driftPpm };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value, cryptoApi) {
  if (!cryptoApi?.subtle) invalid("Secure candidate evidence hashing is unavailable.");
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await cryptoApi.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function provider(value = {}, stage = "") {
  exactKeys(value, [
    "id", "version", "protocol", "stage", "capabilities", "providerFingerprintSha256",
    "executionFingerprintSha256", "executionProfile",
  ], `${stage} candidate provider`);
  const capabilities = Array.isArray(value.capabilities)
    ? [...new Set(value.capabilities.map((entry) => text(entry, "candidate capability", 80)))].sort()
    : invalid(`${stage} candidate capabilities are required.`);
  exactKeys(value.executionProfile, [
    "device", "runtimeMode", "cpuThreads", "sampleFps", "modelResident",
  ], `${stage} candidate execution profile`);
  const cpuThreads = Number(value.executionProfile.cpuThreads);
  const sampleFps = Number(value.executionProfile.sampleFps);
  if (value.stage !== stage || value.protocol !== "football-science-tracking-stage-v1"
    || !capabilities.length || !Number.isSafeInteger(cpuThreads) || cpuThreads < 1 || cpuThreads > 256
    || !(sampleFps > 0) || sampleFps > 240 || typeof value.executionProfile.modelResident !== "boolean") {
    invalid(`Invalid ${stage} candidate provider.`);
  }
  return {
    id: identifier(value.id, `${stage} provider id`),
    version: identifier(value.version, `${stage} provider version`),
    protocol: value.protocol,
    stage,
    capabilities,
    providerFingerprintSha256: sha256(value.providerFingerprintSha256, `${stage} provider fingerprint`),
    executionFingerprintSha256: sha256(value.executionFingerprintSha256, `${stage} execution fingerprint`),
    executionProfile: {
      device: text(value.executionProfile.device, `${stage} candidate device`, 80),
      runtimeMode: text(value.executionProfile.runtimeMode, `${stage} candidate runtime mode`, 100),
      cpuThreads,
      sampleFps,
      modelResident: value.executionProfile.modelResident,
    },
  };
}

async function lineage(value = {}, cryptoApi) {
  exactKeys(value, [
    "protocol", "sourceFingerprint", "sourceRange", "matchRange", "sync", "providers",
    "evidenceByStage", "artifactByStage", "fingerprintSha256",
  ], "Candidate pipeline lineage");
  if (value.protocol !== pipelineProtocol) invalid("Candidate pipeline protocol is invalid.");
  exactKeys(value.providers, stageOrder, "Candidate pipeline providers");
  exactKeys(value.evidenceByStage, stageOrder, "Candidate evidence fingerprints");
  exactKeys(value.artifactByStage, stageOrder, "Candidate artifact fingerprints");
  const seed = {
    protocol: pipelineProtocol,
    sourceFingerprint: sha256(value.sourceFingerprint, "candidate source fingerprint"),
    sourceRange: range(value.sourceRange, "candidate source range"),
    matchRange: range(value.matchRange, "candidate match range"),
    sync: sync(value.sync),
    providers: Object.fromEntries(stageOrder.map((stage) => [stage, provider(value.providers[stage], stage)])),
    evidenceByStage: Object.fromEntries(stageOrder.map((stage) => [stage, sha256(value.evidenceByStage[stage], `${stage} evidence fingerprint`)])),
    artifactByStage: Object.fromEntries(stageOrder.map((stage) => [stage, sha256(value.artifactByStage[stage], `${stage} artifact fingerprint`)])),
  };
  if (await digest(seed, cryptoApi) !== sha256(value.fingerprintSha256, "candidate pipeline fingerprint")) {
    invalid("Candidate pipeline lineage fingerprint does not match.", "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED");
  }
  return { ...seed, fingerprintSha256: value.fingerprintSha256 };
}

async function stageRun(value = {}, stage = "", pipeline = {}, cryptoApi) {
  exactKeys(value, ["stage", "provider", "artifact", "evidence", "evidenceSha256", "artifactSha256", "execution"], `${stage} stage evidence`);
  const selectedProvider = provider(value.provider, stage);
  if (JSON.stringify(selectedProvider) !== JSON.stringify(pipeline.providers[stage])) {
    invalid(`${stage} stage provider does not match pipeline lineage.`);
  }
  const artifactSha256 = sha256(value.artifactSha256, `${stage} artifact fingerprint`);
  const evidenceSha256 = sha256(value.evidenceSha256, `${stage} evidence response fingerprint`);
  const artifact = value.artifact || {};
  if (artifact.protocol !== "football-science-tracking-stage-result-v1"
    || artifact.stage !== stage
    || artifact.sourceFingerprint !== pipeline.sourceFingerprint
    || JSON.stringify(artifact.range) !== JSON.stringify(pipeline.sourceRange)
    || await digest(artifact, cryptoApi) !== artifactSha256
    || artifactSha256 !== pipeline.artifactByStage[stage]
    || evidenceSha256 !== pipeline.evidenceByStage[stage]) {
    invalid(`${stage} stage artifact does not match pipeline lineage.`, "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED");
  }
  const evidence = validateTrackingCandidateStageEvidence(value.evidence, {
    provider: selectedProvider,
    sourceSha256: pipeline.sourceFingerprint,
    artifactSha256,
    artifact,
  });
  if (await trackingCandidateEvidenceResponseSha256(evidence, cryptoApi) !== evidenceSha256
    || JSON.stringify(value.execution) !== JSON.stringify(evidence.execution)) {
    invalid(`${stage} raw evidence checksum does not match.`, "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED");
  }
  return { stage, provider: selectedProvider, artifact, evidence, evidenceSha256, artifactSha256, execution: evidence.execution };
}

function rawTrack(value = {}, pipeline = {}) {
  const track = normalizeObjectTrack(value);
  exactKeys(track.metadata || {}, metadataFields, "Candidate review-track metadata");
  if (track.status !== "review" || track.corrections.length
    || track.engine !== "tracking-intelligence-v2-pipeline"
    || track.metadata.candidatePipelineProtocol !== pipelineProtocol
    || track.metadata.candidatePipelineFingerprintSha256 !== pipeline.fingerprintSha256
    || track.metadata.localSourceSha256 !== pipeline.sourceFingerprint
    || track.metadata.angleId !== pipeline.sync.angleId
    || trackingPoints(track).some((point) => point.source !== "automatic")) {
    invalid("Candidate review tracks must remain unchanged automatic predictions.");
  }
  return track;
}

function reviewSummary(value = {}, tracks = [], stages = []) {
  exactKeys(value, [
    "trackCount", "playerTrackCount", "ballTrackCount", "refereeTrackCount",
    "unassignedObservationCount", "playerIdentityReviewCount", "lowConfidenceTrackCount",
    "classificationConflictCount", "reidentificationMergeCount",
  ], "Candidate review summary");
  const detectionIds = new Set(stages[0].artifact.payload.observations.map((entry) => entry.id));
  const assignedIds = new Set(stages[1].artifact.payload.trajectories.flatMap((entry) => entry.observationIds));
  const expected = {
    trackCount: tracks.length,
    playerTrackCount: tracks.filter((track) => track.entityType === "player").length,
    ballTrackCount: tracks.filter((track) => track.entityType === "ball").length,
    refereeTrackCount: tracks.filter((track) => track.entityType === "referee").length,
    unassignedObservationCount: [...detectionIds].filter((id) => !assignedIds.has(id)).length,
    playerIdentityReviewCount: tracks.filter((track) => track.entityType === "player" && !track.playerId).length,
    lowConfidenceTrackCount: tracks.filter((track) => track.confidence < 0.55 || track.identityConfidence < 0.65).length,
    classificationConflictCount: Number(value.classificationConflictCount) || 0,
    reidentificationMergeCount: Number(value.reidentificationMergeCount) || 0,
  };
  if (Object.keys(expected).some((key) => Number(value[key]) !== expected[key])) {
    invalid("Candidate review summary does not match its raw predictions.");
  }
  return expected;
}

async function normalizedArtifact(value = {}, options = {}) {
  const cryptoApi = options.cryptoApi || globalThis.crypto;
  const scope = createTrackingBenchmarkWorkspaceScope(value.scope);
  const pipeline = await lineage(value.pipeline || value.lineage, cryptoApi);
  const persistedStages = Array.isArray(value.stages);
  const rawStages = persistedStages ? value.stages : value.rawStageRuns;
  if (!Array.isArray(rawStages) || rawStages.length !== stageOrder.length) invalid("Candidate pipeline needs exactly four raw stage runs.");
  const stages = [];
  for (const stage of stageOrder) {
    const sourceValue = rawStages.find((entry) => entry?.stage === stage);
    const source = persistedStages || !sourceValue ? sourceValue : {
      stage: sourceValue.stage,
      provider: sourceValue.provider,
      artifact: sourceValue.artifact,
      evidence: sourceValue.evidence,
      evidenceSha256: sourceValue.evidenceSha256,
      artifactSha256: sourceValue.artifactSha256,
      execution: sourceValue.execution,
    };
    if (!source) invalid(`Candidate pipeline is missing ${stage} evidence.`);
    stages.push(await stageRun(source, stage, pipeline, cryptoApi));
  }
  const rawTracks = (value.rawTracks || value.tracks || []).map((entry) => rawTrack(entry, pipeline));
  if (!rawTracks.length || rawTracks.length > 1000) invalid("Candidate pipeline raw-track count is invalid.");
  const createdAt = new Date(options.now?.() ?? value.createdAt ?? Date.now()).toISOString();
  const artifact = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_PIPELINE_RUN_PROTOCOL,
    id: identifier(value.id || `candidate-${pipeline.fingerprintSha256}`, "candidate pipeline run id"),
    benchmarkOnly: true,
    scope,
    itemId: identifier(value.itemId, "candidate presentation item id"),
    frame: frame(value.frame),
    pipeline,
    stages,
    rawTracks,
    review: reviewSummary(value.review, rawTracks, stages),
    createdAt,
  };
  const contentSha256 = await digest(artifact, cryptoApi);
  if (value.contentSha256 && contentSha256 !== sha256(value.contentSha256, "candidate pipeline content fingerprint")) {
    invalid("Candidate pipeline content fingerprint does not match.", "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED");
  }
  let serializedBytes = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const measured = new TextEncoder().encode(JSON.stringify({ ...artifact, contentSha256, serializedBytes })).byteLength;
    if (measured === serializedBytes) break;
    serializedBytes = measured;
  }
  if (serializedBytes > MAX_TRACKING_CANDIDATE_PIPELINE_RUN_BYTES) {
    invalid("Candidate pipeline evidence is too large for the device workspace.", "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_LIMIT");
  }
  return deepFreeze({ ...artifact, contentSha256, serializedBytes });
}

export async function createTrackingCandidatePipelineArtifact(value = {}, options = {}) {
  return normalizedArtifact(value, options);
}

export async function validateTrackingCandidatePipelineArtifact(value = {}, options = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "id", "benchmarkOnly", "scope", "itemId", "frame",
    "pipeline", "stages", "rawTracks", "review", "createdAt", "contentSha256", "serializedBytes",
  ], "Candidate pipeline artifact");
  if (value.schemaVersion !== 1 || value.protocol !== TRACKING_CANDIDATE_PIPELINE_RUN_PROTOCOL || value.benchmarkOnly !== true) {
    invalid("Candidate pipeline artifact protocol is invalid.");
  }
  const normalized = await normalizedArtifact(value, { ...options, now: () => value.createdAt });
  if (normalized.serializedBytes !== Number(value.serializedBytes)) {
    invalid("Candidate pipeline byte count does not match.", "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED");
  }
  return normalized;
}

export function trackingCandidatePipelineSummary(value = {}) {
  return deepFreeze({
    id: String(value.id || ""),
    itemId: String(value.itemId || ""),
    createdAt: String(value.createdAt || ""),
    sourceFingerprint: String(value.pipeline?.sourceFingerprint || ""),
    sourceRange: { ...(value.pipeline?.sourceRange || {}) },
    matchRange: { ...(value.pipeline?.matchRange || {}) },
    angleId: String(value.pipeline?.sync?.angleId || ""),
    pipelineFingerprintSha256: String(value.pipeline?.fingerprintSha256 || ""),
    contentSha256: String(value.contentSha256 || ""),
    serializedBytes: Number(value.serializedBytes) || 0,
    providers: Object.fromEntries(stageOrder.map((stage) => [stage, { ...(value.pipeline?.providers?.[stage] || {}) }])),
    review: { ...(value.review || {}) },
  });
}
