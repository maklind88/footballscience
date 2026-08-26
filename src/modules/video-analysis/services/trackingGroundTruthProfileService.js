export const TRACKING_GROUND_TRUTH_PROFILE = "football-scene-pilot-v1";
export const TRACKING_SELECTED_OBJECT_PROFILE = "selected-player-pilot-v1";
export const TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT = "selected-object";
export const TRACKING_BENCHMARK_TYPE_MULTI_OBJECT = "multi-object";

export function normalizeTrackingGroundTruthBenchmarkType(value = "", profileId = "") {
  return value === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT || profileId === TRACKING_SELECTED_OBJECT_PROFILE
    ? TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
    : TRACKING_BENCHMARK_TYPE_MULTI_OBJECT;
}

export function trackingGroundTruthProfileForType(value = "") {
  return normalizeTrackingGroundTruthBenchmarkType(value) === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
    ? TRACKING_SELECTED_OBJECT_PROFILE
    : TRACKING_GROUND_TRUTH_PROFILE;
}

export function trackingGroundTruthArtifactBenchmarkType(value = {}) {
  return normalizeTrackingGroundTruthBenchmarkType(value.reviewEvidence?.benchmarkType, value.profileId);
}

export function trackingGroundTruthEntry(workspace = {}, itemId = "") {
  const key = String(itemId || "");
  const stored = workspace.byItemId?.[key];
  if (stored && typeof stored === "object") return {
    ...stored,
    benchmarkType: normalizeTrackingGroundTruthBenchmarkType(stored.benchmarkType, stored.lockedArtifact?.profileId),
  };
  if (!workspace.byItemId && workspace.status && (!workspace.itemId || workspace.itemId === key)) return {
    ...workspace,
    benchmarkType: normalizeTrackingGroundTruthBenchmarkType(workspace.benchmarkType, workspace.lockedArtifact?.profileId),
  };
  return {
    itemId: key,
    status: "draft",
    revision: 1,
    benchmarkType: TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
    selectedTrackIds: [],
    benchmarkTargetTrackId: "",
    scenarioTags: [],
    sourceFingerprint: "",
    frame: { width: 0, height: 0 },
    range: { startMs: 0, endMs: 1 },
    attested: false,
    exhaustiveSceneAttested: false,
    lockedArtifact: null,
    lockedAt: "",
    downloadedAt: "",
    error: "",
  };
}
