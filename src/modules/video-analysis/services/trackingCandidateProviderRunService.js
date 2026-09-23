import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { createTrackingProviderRunArtifact } from "./trackingProviderRunService.js";
import { candidateStageTracks } from "./trackingCandidateTrackService.js";

const stageOrder = Object.freeze(["detection", "association", "reidentification", "classification"]);

function invalid(message) {
  throw new Error(message);
}

function stageRun(result = {}, stage = "") {
  const run = (result.rawStageRuns || result.stages || []).find((entry) => entry.stage === stage);
  if (!run || run.evidence?.provider?.stage !== stage || run.evidence?.execution?.exitCode !== 0) {
    invalid(`The ${stage} candidate evidence is unavailable.`);
  }
  return run;
}

function providerIdentity(run = {}) {
  const provider = run.evidence.provider;
  return {
    providerId: provider.id,
    providerVersion: provider.version,
    protocol: provider.protocol,
    stage: provider.stage,
    capabilities: [...provider.capabilities],
    executionFingerprintSha256: provider.executionFingerprintSha256,
  };
}

function providerTrack(trackValue = {}, provider = {}, lineage = {}) {
  const track = normalizeObjectTrack(trackValue);
  return normalizeObjectTrack({
    ...track,
    engine: provider.providerId,
    engineVersion: provider.providerVersion,
    corrections: [],
    metadata: {
      localSourceSha256: lineage.sourceFingerprint,
      angleId: lineage.sync.angleId,
      candidatePipelineFingerprintSha256: lineage.fingerprintSha256,
    },
  });
}

function performance(run = {}) {
  const execution = run.evidence.execution;
  return {
    processingMs: execution.wallTimeMs,
    device: execution.device,
    runtimeMode: execution.runtimeMode,
    cpuThreads: execution.cpuThreads,
    sampleFps: execution.sampleFps,
    modelResident: execution.modelResident,
    workerReused: execution.workerReused,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createTrackingCandidateProviderRuns(result = {}, options = {}) {
  const lineage = result.lineage || result.pipeline || {};
  const frame = options.frame || {};
  if (result.benchmarkOnly !== true || !lineage.sourceFingerprint || !lineage.fingerprintSha256) {
    invalid("A verified benchmark-only candidate pipeline is required.");
  }
  const artifactsByStage = Object.fromEntries(stageOrder.map((stage) => [
    stage,
    stageRun(result, stage).artifact,
  ]));
  const tracksByStage = result.benchmarkTracksByStage || candidateStageTracks({
    lineage,
    ...artifactsByStage,
  });
  const runs = Object.fromEntries(stageOrder.map((stage) => {
    const rawRun = stageRun(result, stage);
    const provider = providerIdentity(rawRun);
    const tracks = Array.isArray(tracksByStage[stage])
      ? tracksByStage[stage].map((track) => providerTrack(track, provider, lineage))
      : [];
    if (!tracks.length) invalid(`The ${stage} candidate produced no benchmark prediction tracks.`);
    return [stage, createTrackingProviderRunArtifact({
      id: `candidate-run-${stage}-${lineage.fingerprintSha256.slice(0, 24)}`,
      provider,
      sourceFingerprint: lineage.sourceFingerprint,
      angleId: lineage.sync.angleId,
      frame,
      range: lineage.matchRange,
      tracks,
      performance: performance(rawRun),
    }, { now: options.now })];
  }));
  return deepFreeze(runs);
}

export function trackingCandidateBenchmarkProvider(value = {}) {
  const provider = value.provider || value;
  return deepFreeze({
    id: String(provider.providerId || provider.id || ""),
    version: String(provider.providerVersion || provider.version || ""),
    protocol: String(provider.protocol || ""),
    stage: String(provider.stage || ""),
    capabilities: Array.isArray(provider.capabilities) ? [...provider.capabilities] : [],
    executionFingerprintSha256: String(provider.executionFingerprintSha256 || ""),
    status: "candidate-evidence",
    available: false,
    executionAvailable: false,
    benchmarkOnly: true,
  });
}
