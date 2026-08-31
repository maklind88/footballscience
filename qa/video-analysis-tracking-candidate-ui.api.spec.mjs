import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

const fingerprints = Object.freeze({
  detection: "1".repeat(64),
  association: "2".repeat(64),
  reidentification: "3".repeat(64),
  classification: "4".repeat(64),
});

const capabilities = Object.freeze({
  detection: ["detect:player", "detect:ball", "detect:referee"],
  association: ["associate:multi-object"],
  reidentification: ["reidentify:player"],
  classification: ["classify:team"],
});

function candidate(stage) {
  return {
    id: `candidate-${stage}`,
    version: "1.2.3",
    protocol: "football-science-tracking-stage-v1",
    stage,
    capabilities: capabilities[stage],
    providerFingerprintSha256: "9".repeat(64),
    executionFingerprintSha256: fingerprints[stage],
    executionProfile: {
      device: "cpu",
      runtimeMode: "native-stage-process-v1",
      cpuThreads: 8,
      sampleFps: 12.5,
      modelResident: false,
    },
    benchmarkOnly: true,
    status: "candidate-ready",
    available: true,
    executionAvailable: true,
    priority: 100,
  };
}

function trackingState() {
  const providers = Object.fromEntries(Object.keys(capabilities).map((stage) => [stage, candidate(stage)]));
  return {
    presentation: {
      tracking: {
        mode: "tracking",
        provider: {
          status: "ready",
          candidateStageExecutionAvailable: true,
          candidates: Object.values(providers),
        },
        groundTruth: {
          suite: { id: "suite", revision: 1, status: "draft", benchmarkType: "multi-object", cases: [] },
        },
        candidatePipeline: {
          status: "review",
          progress: 1,
          activeRunId: "candidate-run",
          error: "",
          runs: [{
            id: "candidate-run",
            createdAt: "2026-08-31T10:15:00.000Z",
            sourceFingerprint: "a".repeat(64),
            serializedBytes: 2_400_000,
            review: {
              trackCount: 24,
              playerIdentityReviewCount: 20,
              lowConfidenceTrackCount: 3,
              reidentificationMergeCount: 4,
              classificationConflictCount: 2,
              unassignedObservationCount: 1,
            },
          }],
        },
        candidateBenchmarkProviders: providers,
        candidateBenchmarkProvider: providers.association,
        benchmarkEvaluation: { status: "passed", report: { summary: {} } },
      },
    },
  };
}

test("candidate panel exposes exact four-stage readiness, review evidence and stage benchmark selection", async () => {
  const { renderTrackingCandidatePanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingCandidatePanel.js",
  ));
  const html = renderTrackingCandidatePanel(trackingState(), { id: "item-1" });
  expect(html).toContain("Tracking Intelligence v2");
  expect(html).toContain(">4/4<");
  expect(html).toContain("candidate-detection 1.2.3");
  expect(html).toContain("candidate-reidentification 1.2.3");
  expect(html).toContain("Identity review");
  expect(html).toContain("Class conflicts");
  expect(html).toMatch(/data-video-analysis-tracking-candidate-stage="association"[\s\S]*aria-pressed="true"/);
  expect(html).toMatch(/data-video-analysis-tracking-action="candidate-pipeline-run"(?![^>]*disabled)/);
  expect(html).toContain("data-video-analysis-tracking-action=\"candidate-pipeline-restore\"");
  expect(html).toContain("data-video-analysis-tracking-action=\"candidate-pipeline-export\"");
  expect(html).toContain("data-video-analysis-tracking-action=\"candidate-pipeline-remove\"");
});

test("candidate provider is benchmark-only and selected only for full-scene evidence", async () => {
  const { trackingBenchmarkProvider, trackingCandidateBenchmarkProviders } = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkProviderService.js",
  ));
  const tracking = trackingState().presentation.tracking;
  expect(Object.keys(trackingCandidateBenchmarkProviders(tracking))).toEqual([
    "detection", "association", "reidentification", "classification",
  ]);
  expect(trackingBenchmarkProvider(tracking, "multi-object")).toBe(tracking.candidateBenchmarkProvider);
  expect(trackingBenchmarkProvider(tracking, "selected-object")).toBe(tracking.provider);
  expect(trackingBenchmarkProvider({ ...tracking, candidateBenchmarkProvider: null }, "multi-object"))
    .toBe(tracking.provider);
});

test("candidate pipeline prefers the newest natural version when provider priority is equal", async () => {
  const { trackingCandidatePipelineReadiness } = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidateSelectionService.js",
  ));
  const older = { ...candidate("association"), version: "1.9.0" };
  const newer = { ...candidate("association"), version: "1.10.0" };
  const prerelease = { ...candidate("association"), version: "1.10.0-rc.1" };
  const candidates = Object.keys(capabilities)
    .filter((stage) => stage !== "association")
    .map(candidate);
  const readiness = trackingCandidatePipelineReadiness({
    provider: {
      candidateStageExecutionAvailable: true,
      candidates: [...candidates, older, prerelease, newer],
    },
  });
  expect(readiness.providers.association.version).toBe("1.10.0");
  expect(readiness.ready).toBe(true);
});

test("candidate readiness accepts the coherent person detection and role classification path", async () => {
  const { trackingCandidatePipelineReadiness } = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidateSelectionService.js",
  ));
  const roleAwareCandidates = Object.keys(capabilities).map((stage) => ({
    ...candidate(stage),
    capabilities: stage === "detection"
      ? ["detect:person", "detect:ball"]
      : stage === "classification"
        ? ["classify:role", "classify:team"]
        : capabilities[stage],
  }));
  const readiness = trackingCandidatePipelineReadiness({
    provider: { candidateStageExecutionAvailable: true, candidates: roleAwareCandidates },
  });

  expect(readiness).toMatchObject({
    ready: true,
    providers: {
      detection: { capabilities: ["detect:person", "detect:ball"] },
      classification: { capabilities: ["classify:role", "classify:team"] },
    },
  });
  expect(readiness.stages.find((stage) => stage.id === "classification").requiredCapabilities)
    .toEqual(["classify:role", "classify:team"]);

  const incompleteLegacyDetector = candidate("detection");
  const coherent = trackingCandidatePipelineReadiness({
    provider: {
      candidateStageExecutionAvailable: true,
      candidates: [...roleAwareCandidates, incompleteLegacyDetector],
    },
  });
  expect(coherent.ready).toBe(true);
  expect(coherent.providers.detection.capabilities).toEqual(["detect:person", "detect:ball"]);
});

test("candidate benchmark stage switching invalidates stale evaluation evidence", async () => {
  const { createTrackingCandidateController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingCandidateController.js",
  ));
  let state = trackingState();
  let invalidations = 0;
  const controller = createTrackingCandidateController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    onEvidenceChanged: () => { invalidations += 1; },
  });
  expect(controller.handleAction("candidate-benchmark-provider", {
    dataset: { videoAnalysisTrackingCandidateStage: "reidentification" },
  })).toBe(true);
  expect(state.presentation.tracking.candidateBenchmarkProvider.stage).toBe("reidentification");
  expect(state.presentation.tracking.benchmarkEvaluation.status).toBe("idle");
  expect(invalidations).toBe(1);
  expect(controller.handleAction("candidate-benchmark-provider", {
    dataset: { videoAnalysisTrackingCandidateStage: "unknown" },
  })).toBe(false);
});
