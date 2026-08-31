import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { runLocalTrackingCandidateStage } from "./localTrackingService.js";

export const TRACKING_CANDIDATE_PIPELINE_PROTOCOL = "football-science-tracking-candidate-pipeline-v1";

const requiredCapabilities = Object.freeze({
  detection: ["detect:player", "detect:ball", "detect:referee"],
  association: ["associate:multi-object"],
  reidentification: ["reidentify:player"],
  classification: ["classify:team"],
});
const stageOrder = Object.freeze(["detection", "association", "reidentification", "classification"]);

function invalid(message, code = "TRACKING_CANDIDATE_PIPELINE_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function sha256(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function providerForStage(value = {}, stage = "") {
  const capabilities = Array.isArray(value.capabilities) ? [...new Set(value.capabilities.map(String))] : [];
  if (!value.id || !value.version || value.stage !== stage || value.benchmarkOnly !== true
    || value.executionAvailable !== true
    || requiredCapabilities[stage].some((capability) => !capabilities.includes(capability))) {
    invalid(`The ${stage} benchmark candidate is incomplete or unavailable.`, "TRACKING_CANDIDATE_PIPELINE_PROVIDER_MISSING");
  }
  return deepFreeze({
    id: String(value.id),
    version: String(value.version),
    stage,
    capabilities: capabilities.sort(),
  });
}

function boundedRange(value = {}) {
  const startMs = Number(value.startMs);
  const endMs = Number(value.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) {
    invalid("The candidate pipeline needs one bounded match-time range.");
  }
  return { startMs, endMs };
}

function stageResult(value = {}, provider = {}, sourceFingerprint = "", range = {}) {
  const artifact = value.artifact || {};
  const evidence = value.evidence || {};
  if (value.benchmarkOnly !== true
    || artifact.protocol !== "football-science-tracking-stage-result-v1"
    || artifact.provider?.id !== provider.id
    || artifact.provider?.version !== provider.version
    || artifact.stage !== provider.stage
    || artifact.sourceFingerprint !== sourceFingerprint
    || artifact.range?.startMs !== range.startMs
    || artifact.range?.endMs !== range.endMs
    || evidence.protocol !== "football-science-tracking-candidate-stage-run-v1"
    || evidence.benchmarkOnly !== true
    || evidence.provider?.id !== provider.id
    || evidence.provider?.version !== provider.version
    || evidence.result?.payload?.requestFingerprint !== artifact.requestFingerprint
    || JSON.stringify(evidence.result?.payload) !== JSON.stringify(artifact)) {
    invalid(`The ${provider.stage} candidate result crossed its evidence boundary.`, "TRACKING_CANDIDATE_PIPELINE_EVIDENCE_MISMATCH");
  }
  return {
    stage: provider.stage,
    provider,
    artifact,
    evidence,
    evidenceSha256: sha256(value.evidenceSha256, `${provider.stage} evidence fingerprint`),
    artifactSha256: sha256(evidence.result.artifactSha256, `${provider.stage} artifact fingerprint`),
    sourceArtifactId: String(value.sourceArtifactId || ""),
    execution: evidence.execution,
  };
}

function materializedTrajectories(association = {}, observations = []) {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return (association.trajectories || []).map((trajectory) => ({
    id: trajectory.id,
    entityType: trajectory.entityType,
    observations: trajectory.observationIds.map((id) => {
      const observation = byId.get(id);
      if (!observation) invalid("Association output references a missing detection.");
      return observation;
    }),
    confidence: trajectory.confidence,
    discontinuitiesMs: [...trajectory.discontinuitiesMs],
  }));
}

function splitSegments(trajectory = {}) {
  const breaks = new Set(trajectory.discontinuitiesMs || []);
  const groups = [];
  for (const observation of trajectory.observations || []) {
    if (!groups.length || [...breaks].some((atMs) => (
      observation.atMs >= atMs && groups.at(-1).at(-1).atMs < atMs
    ))) groups.push([]);
    groups.at(-1).push(observation);
  }
  return groups.filter((group) => group.length).map((group, index) => ({
    id: `${trajectory.id}-segment-${index + 1}`,
    startMs: group[0].atMs,
    endMs: group.at(-1).atMs,
    confidence: group.reduce((sum, entry) => sum + entry.confidence, 0) / group.length,
    discontinuityBefore: index > 0,
    points: group.map((observation) => ({
      atMs: observation.atMs,
      frameIndex: observation.frameIndex,
      x: observation.box.left + (observation.box.width / 2),
      y: observation.box.top + (observation.box.height / 2),
      width: observation.box.width,
      height: observation.box.height,
      groundX: observation.box.left + (observation.box.width / 2),
      groundY: observation.box.top + observation.box.height,
      confidence: observation.confidence,
      identityConfidence: trajectory.identityConfidence,
      occluded: false,
      source: "automatic",
    })),
  }));
}

function reviewTracks(trajectories = [], identities = [], classifications = [], lineage = {}) {
  const identityByTrajectory = new Map(identities.map((entry) => [entry.trajectoryId, entry]));
  const classificationByTrajectory = new Map(classifications.map((entry) => [entry.trajectoryId, entry]));
  return trajectories.map((trajectory) => {
    const identity = identityByTrajectory.get(trajectory.id);
    const classification = classificationByTrajectory.get(trajectory.id) || {};
    const identityConfidence = trajectory.entityType === "player"
      ? Number(identity?.confidence) || 0
      : trajectory.confidence;
    const value = {
      ...trajectory,
      identityConfidence,
    };
    return normalizeObjectTrack({
      id: trajectory.id,
      entityType: trajectory.entityType,
      playerId: "",
      playerLabel: "",
      teamSide: classification.teamSide || (trajectory.entityType === "referee" ? "official" : ""),
      shirtNumber: classification.shirtNumber === "unknown" ? "" : classification.shirtNumber || "",
      status: "review",
      startMs: lineage.range.startMs,
      endMs: lineage.range.endMs,
      confidence: trajectory.confidence,
      identityConfidence,
      engine: "tracking-intelligence-v2-pipeline",
      engineVersion: lineage.fingerprintSha256.slice(0, 16),
      segments: splitSegments(value),
      corrections: [],
      metadata: {
        candidatePipelineProtocol: TRACKING_CANDIDATE_PIPELINE_PROTOCOL,
        candidatePipelineFingerprintSha256: lineage.fingerprintSha256,
        localSourceSha256: lineage.sourceFingerprint,
        candidateDetectionEvidenceSha256: lineage.evidenceByStage.detection,
        candidateAssociationEvidenceSha256: lineage.evidenceByStage.association,
        candidateReidentificationEvidenceSha256: lineage.evidenceByStage.reidentification,
        candidateClassificationEvidenceSha256: lineage.evidenceByStage.classification,
      },
    });
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value, cryptoApi) {
  if (!cryptoApi?.subtle) invalid("Secure candidate pipeline hashing is unavailable.");
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await cryptoApi.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function reviewSummary(tracks = [], observations = [], trajectories = []) {
  const assigned = new Set(trajectories.flatMap((trajectory) => trajectory.observations.map((entry) => entry.id)));
  return {
    trackCount: tracks.length,
    playerTrackCount: tracks.filter((track) => track.entityType === "player").length,
    ballTrackCount: tracks.filter((track) => track.entityType === "ball").length,
    refereeTrackCount: tracks.filter((track) => track.entityType === "referee").length,
    unassignedObservationCount: observations.filter((observation) => !assigned.has(observation.id)).length,
    playerIdentityReviewCount: tracks.filter((track) => track.entityType === "player" && !track.playerId).length,
    lowConfidenceTrackCount: tracks.filter((track) => track.confidence < 0.55 || track.identityConfidence < 0.65).length,
  };
}

export async function runTrackingCandidatePipeline(options = {}) {
  const runStage = options.runStage || runLocalTrackingCandidateStage;
  const cryptoApi = options.cryptoApi || options.win?.crypto || globalThis.crypto;
  const sourceFingerprint = sha256(options.sourceFingerprint, "Candidate source fingerprint");
  const range = boundedRange(options.range);
  const providers = Object.fromEntries(stageOrder.map((stage) => [
    stage,
    providerForStage(options.providers?.[stage], stage),
  ]));
  if (!options.file && !options.sourceArtifactId) invalid("Reconnect the exact local match source before running a candidate pipeline.");
  const runs = [];
  const invoke = async (stage, request, sourceArtifactId = "") => {
    options.onProgress?.({ stage, completedStages: runs.length, totalStages: stageOrder.length });
    const run = stageResult(await runStage({
      win: options.win,
      provider: providers[stage],
      request,
      file: stage === "detection" ? options.file : undefined,
      sourceArtifactId,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      onJob: options.onJob,
      onProgress: (progress) => options.onProgress?.({ ...progress, pipelineStage: stage }),
    }), providers[stage], sourceFingerprint, range);
    runs.push(run);
    return run;
  };
  const detection = await invoke("detection", { sourceFingerprint, range }, options.sourceArtifactId);
  const observations = detection.artifact.payload.observations;
  const association = await invoke("association", { sourceFingerprint, range, observations });
  const trajectories = materializedTrajectories(association.artifact.payload, observations);
  const retainedSourceId = detection.sourceArtifactId || options.sourceArtifactId;
  if (!retainedSourceId) invalid("The candidate pipeline did not retain its session-owned match source.");
  const reidentification = await invoke("reidentification", { sourceFingerprint, range, trajectories }, retainedSourceId);
  const classification = await invoke("classification", { sourceFingerprint, range, trajectories }, retainedSourceId);
  const lineageSeed = {
    protocol: TRACKING_CANDIDATE_PIPELINE_PROTOCOL,
    sourceFingerprint,
    range,
    providers: Object.fromEntries(stageOrder.map((stage) => [stage, providers[stage]])),
    evidenceByStage: Object.fromEntries(runs.map((run) => [run.stage, run.evidenceSha256])),
    artifactByStage: Object.fromEntries(runs.map((run) => [run.stage, run.artifactSha256])),
  };
  const lineage = { ...lineageSeed, fingerprintSha256: await digest(lineageSeed, cryptoApi) };
  const tracks = reviewTracks(
    trajectories,
    reidentification.artifact.payload.identities,
    classification.artifact.payload.classifications,
    lineage,
  );
  return Object.freeze({
    benchmarkOnly: true,
    sourceArtifactId: retainedSourceId,
    lineage: deepFreeze(lineage),
    rawStageRuns: deepFreeze(runs),
    tracks: Object.freeze(tracks),
    review: Object.freeze(reviewSummary(tracks, observations, trajectories)),
  });
}
