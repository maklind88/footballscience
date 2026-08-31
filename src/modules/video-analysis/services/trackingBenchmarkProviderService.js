import { TRACKING_BENCHMARK_TYPE_MULTI_OBJECT } from "./trackingGroundTruthService.js";

const candidateStages = Object.freeze([
  "detection",
  "association",
  "reidentification",
  "classification",
]);

function candidateProvider(value = {}) {
  const id = String(value.id || value.providerId || "");
  const version = String(value.version || value.providerVersion || "");
  const stage = String(value.stage || "");
  const fingerprint = String(value.executionFingerprintSha256 || "").toLowerCase();
  if (!id || !version || !candidateStages.includes(stage)
    || !/^[a-f0-9]{64}$/.test(fingerprint)
    || value.benchmarkOnly !== true) return null;
  return value;
}

export function trackingCandidateBenchmarkProviders(tracking = {}) {
  const values = tracking.candidateBenchmarkProviders || {};
  return Object.fromEntries(candidateStages.flatMap((stage) => {
    const provider = candidateProvider(values[stage]);
    return provider ? [[stage, provider]] : [];
  }));
}

export function trackingBenchmarkProvider(tracking = {}, benchmarkType = "") {
  const selected = candidateProvider(tracking.candidateBenchmarkProvider);
  if (benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT && selected) return selected;
  return tracking.provider || {};
}

export const TRACKING_CANDIDATE_BENCHMARK_STAGES = candidateStages;
