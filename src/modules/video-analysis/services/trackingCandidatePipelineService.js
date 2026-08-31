import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { runLocalTrackingCandidateStage } from "./localTrackingService.js";
import {
  candidateReviewSummary,
  candidateStageTracks,
  materializeCandidateTrajectories,
} from "./trackingCandidateTrackService.js";

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

function executionProfile(value = {}) {
  const device = String(value.device || "");
  const runtimeMode = String(value.runtimeMode || "");
  const cpuThreads = Number(value.cpuThreads);
  const sampleFps = Number(value.sampleFps);
  if (!device || !runtimeMode || !Number.isSafeInteger(cpuThreads) || cpuThreads < 1
    || cpuThreads > 256 || !(sampleFps > 0) || sampleFps > 240
    || typeof value.modelResident !== "boolean") {
    invalid("The benchmark candidate execution profile is incomplete.", "TRACKING_CANDIDATE_PIPELINE_PROVIDER_MISSING");
  }
  return { device, runtimeMode, cpuThreads, sampleFps, modelResident: value.modelResident };
}

function providerForStage(value = {}, stage = "") {
  const capabilities = Array.isArray(value.capabilities) ? [...new Set(value.capabilities.map(String))] : [];
  if (!value.id || !value.version || value.protocol !== "football-science-tracking-stage-v1"
    || value.stage !== stage || value.benchmarkOnly !== true
    || value.executionAvailable !== true
    || requiredCapabilities[stage].some((capability) => !capabilities.includes(capability))) {
    invalid(`The ${stage} benchmark candidate is incomplete or unavailable.`, "TRACKING_CANDIDATE_PIPELINE_PROVIDER_MISSING");
  }
  return deepFreeze({
    id: String(value.id),
    version: String(value.version),
    protocol: String(value.protocol || ""),
    stage,
    capabilities: capabilities.sort(),
    providerFingerprintSha256: sha256(value.providerFingerprintSha256, `${stage} provider fingerprint`),
    executionFingerprintSha256: sha256(value.executionFingerprintSha256, `${stage} execution fingerprint`),
    executionProfile: executionProfile(value.executionProfile),
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

function boundedSync(value = {}) {
  const syncOffsetMs = Number(value.syncOffsetMs) || 0;
  const driftPpm = Number(value.driftPpm) || 0;
  if (!Number.isSafeInteger(syncOffsetMs)
    || syncOffsetMs < -21_600_000
    || syncOffsetMs > 21_600_000
    || !Number.isFinite(driftPpm)
    || driftPpm < -10_000
    || driftPpm > 10_000) {
    invalid("The candidate pipeline camera synchronization is invalid.");
  }
  return {
    angleId: String(value.angleId || "primary").trim().slice(0, 160) || "primary",
    syncOffsetMs,
    driftPpm,
  };
}

function stageResult(value = {}, provider = {}, sourceFingerprint = "", range = {}) {
  const artifact = value.artifact || {};
  const evidence = value.evidence || {};
  if (value.benchmarkOnly !== true
    || artifact.protocol !== "football-science-tracking-stage-result-v1"
    || artifact.provider?.id !== provider.id
    || artifact.provider?.version !== provider.version
    || artifact.provider?.fingerprintSha256 !== provider.providerFingerprintSha256
    || artifact.stage !== provider.stage
    || artifact.sourceFingerprint !== sourceFingerprint
    || artifact.range?.startMs !== range.startMs
    || artifact.range?.endMs !== range.endMs
    || evidence.protocol !== "football-science-tracking-candidate-stage-run-v1"
    || evidence.benchmarkOnly !== true
    || evidence.provider?.id !== provider.id
    || evidence.provider?.version !== provider.version
    || evidence.provider?.protocol !== provider.protocol
    || evidence.provider?.stage !== provider.stage
    || JSON.stringify([...(evidence.provider?.capabilities || [])].sort()) !== JSON.stringify(provider.capabilities)
    || evidence.provider?.manifestFingerprintSha256 !== provider.providerFingerprintSha256
    || evidence.provider?.executionFingerprintSha256 !== provider.executionFingerprintSha256
    || evidence.execution?.device !== provider.executionProfile.device
    || evidence.execution?.runtimeMode !== provider.executionProfile.runtimeMode
    || evidence.execution?.cpuThreads !== provider.executionProfile.cpuThreads
    || evidence.execution?.sampleFps !== provider.executionProfile.sampleFps
    || evidence.execution?.modelResident !== provider.executionProfile.modelResident
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

export async function runTrackingCandidatePipeline(options = {}) {
  const runStage = options.runStage || runLocalTrackingCandidateStage;
  const cryptoApi = options.cryptoApi || options.win?.crypto || globalThis.crypto;
  let sourceFingerprint = options.sourceFingerprint
    ? sha256(options.sourceFingerprint, "Candidate source fingerprint")
    : "";
  const range = boundedRange(options.range);
  const matchRange = boundedRange(options.matchRange || options.range);
  const sync = boundedSync(options.sync);
  const providers = Object.fromEntries(stageOrder.map((stage) => [
    stage,
    providerForStage(options.providers?.[stage], stage),
  ]));
  if (!options.file && !options.sourceArtifactId) invalid("Reconnect the exact local match source before running a candidate pipeline.");
  if (!sourceFingerprint && !options.file) {
    invalid("A reused candidate source needs its exact SHA-256 fingerprint.");
  }
  const runs = [];
  const invoke = async (stage, request, sourceArtifactId = "") => {
    options.onProgress?.({ stage, completedStages: runs.length, totalStages: stageOrder.length });
    const result = await runStage({
      win: options.win,
      provider: providers[stage],
      request,
      file: stage === "detection" ? options.file : undefined,
      sourceArtifactId,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      onJob: options.onJob,
      onProgress: (progress) => options.onProgress?.({ ...progress, pipelineStage: stage }),
    });
    const resultSourceFingerprint = sha256(
      result.sourceSha256 || result.artifact?.sourceFingerprint,
      `${stage} source fingerprint`,
    );
    if (sourceFingerprint && resultSourceFingerprint !== sourceFingerprint) {
      invalid(`The ${stage} candidate changed the match source.`, "TRACKING_CANDIDATE_PIPELINE_EVIDENCE_MISMATCH");
    }
    sourceFingerprint ||= resultSourceFingerprint;
    const run = stageResult(result, providers[stage], sourceFingerprint, range);
    runs.push(run);
    return run;
  };
  const detection = await invoke("detection", {
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
    range,
  }, options.sourceArtifactId);
  const retainedSourceId = detection.sourceArtifactId || options.sourceArtifactId;
  if (!retainedSourceId) invalid("The candidate pipeline did not retain its session-owned match source.");
  const observations = detection.artifact.payload.observations;
  const association = await invoke(
    "association",
    { sourceFingerprint, range, observations },
    retainedSourceId,
  );
  const trajectories = materializeCandidateTrajectories(association.artifact.payload, observations);
  const reidentification = await invoke("reidentification", { sourceFingerprint, range, trajectories }, retainedSourceId);
  const classification = await invoke("classification", { sourceFingerprint, range, trajectories }, retainedSourceId);
  const lineageSeed = {
    protocol: TRACKING_CANDIDATE_PIPELINE_PROTOCOL,
    sourceFingerprint,
    sourceRange: range,
    matchRange,
    sync,
    providers: Object.fromEntries(stageOrder.map((stage) => [stage, providers[stage]])),
    evidenceByStage: Object.fromEntries(runs.map((run) => [run.stage, run.evidenceSha256])),
    artifactByStage: Object.fromEntries(runs.map((run) => [run.stage, run.artifactSha256])),
  };
  const lineage = { ...lineageSeed, fingerprintSha256: await digest(lineageSeed, cryptoApi) };
  const stageTracks = candidateStageTracks({
    lineage,
    detection: detection.artifact,
    association: association.artifact,
    reidentification: reidentification.artifact,
    classification: classification.artifact,
  });
  const tracks = stageTracks.review.map(normalizeObjectTrack);
  return Object.freeze({
    benchmarkOnly: true,
    sourceArtifactId: retainedSourceId,
    lineage: deepFreeze(lineage),
    rawStageRuns: deepFreeze(runs),
    tracks: Object.freeze(tracks),
    benchmarkTracksByStage: deepFreeze(Object.fromEntries(stageOrder.map((stage) => [stage, stageTracks[stage]]))),
    review: Object.freeze(candidateReviewSummary(stageTracks)),
  });
}
