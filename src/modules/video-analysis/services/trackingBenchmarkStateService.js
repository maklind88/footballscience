export function emptyTrackingBenchmarkEvaluation(overrides = {}) {
  return {
    status: "idle",
    stage: "",
    progress: 0,
    benchmarkType: "",
    referenceRequired: false,
    sourceSignature: "",
    report: null,
    evidenceSet: null,
    reportSha256: "",
    startedAt: "",
    completedAt: "",
    job: null,
    error: "",
    ...overrides,
  };
}
