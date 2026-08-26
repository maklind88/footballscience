export const TRACKING_BENCHMARK_SCENARIOS = Object.freeze([
  Object.freeze({ id: "transition", label: "Fast transition", required: true }),
  Object.freeze({ id: "crowded-box", label: "Crowded box", required: true }),
  Object.freeze({ id: "occlusion", label: "Occlusion", required: true }),
  Object.freeze({ id: "camera-motion", label: "Camera motion/cut", required: true }),
  Object.freeze({ id: "set-piece", label: "Set piece", required: true }),
  Object.freeze({ id: "compact-unit", label: "Compact units", required: true }),
  Object.freeze({ id: "difficult-visuals", label: "Difficult visuals", required: false }),
]);

const knownScenarioIds = new Set(TRACKING_BENCHMARK_SCENARIOS.map((entry) => entry.id));

export function normalizeTrackingBenchmarkScenarios(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).filter((value) => knownScenarioIds.has(value)))].slice(0, 12);
}
