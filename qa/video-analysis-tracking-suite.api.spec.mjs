import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function points(startMs, endMs, offset = 0) {
  const values = [];
  for (let atMs = startMs; atMs <= endMs; atMs += 500) {
    const ratio = (atMs - startMs) / Math.max(1, endMs - startMs);
    values.push({
      atMs,
      x: 0.2 + offset + (ratio * 0.1),
      y: 0.45 + offset,
      width: 0.05,
      height: 0.14,
      groundX: 0.2 + offset + (ratio * 0.1),
      groundY: 0.52 + offset,
      confidence: 0.99,
      identityConfidence: 0.99,
      source: "manual",
    });
  }
  return values;
}

function reviewedTrack(entityType, id, startMs, endMs, sourceFingerprint, angleId, offset = 0) {
  return {
    id,
    entityType,
    playerId: entityType === "player" ? id : "",
    playerLabel: entityType === "player" ? "Home 8" : entityType === "ball" ? "Ball" : "Referee",
    teamSide: entityType === "player" ? "home" : "",
    shirtNumber: entityType === "player" ? "8" : "",
    status: "verified",
    startMs,
    endMs,
    confidence: 0.99,
    identityConfidence: 0.99,
    segments: [{ id: `${id}-segment`, startMs, endMs, points: points(startMs, endMs, offset) }],
    metadata: { localSourceSha256: sourceFingerprint, angleId },
    corrections: [],
  };
}

async function groundTruthArtifact(index, scenarios, overrides = {}) {
  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  const startMs = Number(overrides.startMs ?? index * 120_000);
  const endMs = Number(overrides.endMs ?? startMs + 120_000);
  const sourceFingerprint = String(overrides.sourceFingerprint || "a".repeat(64));
  const angleId = String(overrides.angleId || "tactical-main");
  const tracks = [
    reviewedTrack("player", `home-8-${index}`, startMs, endMs, sourceFingerprint, angleId, 0),
    reviewedTrack("ball", `ball-${index}`, startMs, endMs, sourceFingerprint, angleId, 0.2),
    reviewedTrack("referee", `referee-${index}`, startMs, endMs, sourceFingerprint, angleId, 0.4),
  ];
  const benchmarkType = String(overrides.benchmarkType || "multi-object");
  const selectedTracks = benchmarkType === "selected-object"
    ? tracks.filter((track) => track.entityType === "player")
    : tracks;
  return groundTruth.createGroundTruthArtifact({
    benchmarkType,
    tracks,
    selectedTrackIds: selectedTracks.map((track) => track.id),
    benchmarkTargetTrackId: tracks.find((track) => track.entityType === "player")?.id || "",
    sourceFingerprint,
    angleId,
    frame: { width: 1920, height: 1080 },
    range: { startMs, endMs },
    reviewedBy: "analyst-1",
    attested: true,
    exhaustiveSceneAttested: benchmarkType === "multi-object",
    scenarioTags: scenarios,
  }, { now: () => 1_800_000_000_000 + index });
}

function predictions(artifact) {
  return artifact.groundTruth.tracks.map((track) => ({
    ...track,
    status: "review",
    confidence: 0.99,
    identityConfidence: 0.99,
    corrections: [],
    segments: track.segments.map((segment) => ({
      ...segment,
      points: segment.points.map((point) => ({
        ...point,
        confidence: 0.99,
        identityConfidence: 0.99,
      })),
    })),
  }));
}

function automaticProviderTracks(artifact, providerId = "sam2.1-hiera-tiny") {
  return predictions(artifact).map((track) => ({
    ...track,
    engine: providerId,
    engineVersion: "1.1.0",
    metadata: {
      localSourceSha256: artifact.sourceFingerprint,
      angleId: artifact.sourceEvidence.angleId,
      targetStartMs: artifact.range.startMs,
      targetEndMs: artifact.range.endMs,
    },
    segments: track.segments.map((segment) => ({
      ...segment,
      points: segment.points.map((point) => ({ ...point, source: "automatic" })),
    })),
  }));
}

function providerPerformance(processingMs, overrides = {}) {
  return {
    processingMs,
    device: "mps",
    runtimeMode: "football-science-tracking-worker-v1",
    cpuThreads: 0,
    sampleFps: 12.5,
    modelResident: true,
    workerReused: false,
    ...overrides,
  };
}

async function readySuite() {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthSuiteService.js",
  ));
  const scenarioGroups = [
    ["transition"],
    ["crowded-box"],
    ["occlusion"],
    ["camera-motion"],
    ["set-piece", "compact-unit", "difficult-visuals"],
  ];
  let suite = service.trackingGroundTruthSuiteEntry({});
  for (let index = 0; index < scenarioGroups.length; index += 1) {
    suite = service.addGroundTruthSuiteCase(suite, await groundTruthArtifact(index, scenarioGroups[index]));
  }
  return { service, suite };
}

async function readySelectedObjectSuite() {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthSuiteService.js",
  ));
  const scenarioGroups = [
    ["transition"],
    ["crowded-box"],
    ["occlusion"],
    ["camera-motion"],
    ["set-piece", "compact-unit", "difficult-visuals"],
  ];
  let suite = service.trackingGroundTruthSuiteEntry({
    suite: { benchmarkType: "selected-object" },
  });
  for (let index = 0; index < scenarioGroups.length; index += 1) {
    suite = service.addGroundTruthSuiteCase(suite, await groundTruthArtifact(index, scenarioGroups[index], {
      benchmarkType: "selected-object",
    }));
  }
  return { service, suite };
}

async function readyWorkflowState(stage = "segmentation") {
  const { suite } = stage === "segmentation"
    ? await readySelectedObjectSuite()
    : await readySuite();
  const runService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingProviderRunService.js",
  ));
  const multiObject = stage !== "segmentation";
  const provider = {
    id: multiObject ? "football-association-v1" : "sam2.1-hiera-tiny",
    version: "1.1.0",
    protocol: "football-science-tracking-stage-v1",
    stage,
    capabilities: [multiObject ? "associate:multi-object" : "segment:selected-object", ...(
      multiObject ? [] : ["propagate:selected-object"]
    )],
    executionFingerprintSha256: "f".repeat(64),
    benchmarkAvailable: true,
    trackEvalAvailable: multiObject,
    referenceEvaluator: multiObject ? "TrackEval" : "",
    referenceEvaluatorVersion: multiObject ? "1.0.0" : "",
    referenceEvaluatorCommit: multiObject ? "b".repeat(40) : "",
    referenceSourceSha256: multiObject ? "c".repeat(64) : "",
  };
  const byItemId = {};
  for (let index = 0; index < suite.cases.length; index += 1) {
    const artifact = suite.cases[index];
    const run = runService.createTrackingProviderRunArtifact({
      id: `workflow-run-${stage}-${index}`,
      provider: {
        providerId: provider.id,
        providerVersion: provider.version,
        protocol: provider.protocol,
        stage: provider.stage,
        capabilities: provider.capabilities,
        executionFingerprintSha256: provider.executionFingerprintSha256,
      },
      sourceFingerprint: artifact.sourceFingerprint,
      angleId: artifact.sourceEvidence.angleId,
      frame: artifact.frame,
      range: artifact.range,
      tracks: automaticProviderTracks(artifact, provider.id),
      performance: providerPerformance(18_000, { workerReused: index > 0 }),
    }, { now: () => 1_800_000_020_000 + index });
    byItemId[`item-${index}`] = [run];
  }
  return {
    presentation: {
      tracking: {
        groundTruth: { suite },
        providerRuns: { byItemId, downloadedAt: "", error: "" },
        provider,
      },
    },
  };
}

function passingTrackEvalReference(report = {}) {
  const metrics = (entry = {}) => ({
    HOTA: 1,
    DetA: 1,
    AssA: 1,
    LocA: 1,
    MOTA: Number(entry.metrics?.mota),
    IDF1: Number(entry.metrics?.identityF1),
  });
  return {
    evaluator: { commit: "b".repeat(40), sourceSha256: "c".repeat(64) },
    threshold: 0.5,
    reportSha256: "d".repeat(64),
    sequences: report.cases.map((entry) => ({
      benchmarkId: entry.benchmarkId,
      metrics: metrics(entry),
      perEntity: {},
    })),
    summary: {
      metrics: metrics(report.cases[0]),
      perEntity: {},
    },
  };
}

test("real-match suite counts unique time, scenarios and produces a benchmark-ready artifact", async () => {
  const { service, suite } = await readySuite();
  const readiness = service.groundTruthSuiteReadiness(suite);
  expect(readiness).toMatchObject({
    ready: true,
    caseCount: 5,
    sourceCount: 1,
    uniqueDurationMs: 600_000,
    overlapDurationMs: 0,
    missingScenarioIds: [],
  });
  const artifact = service.createGroundTruthSuiteArtifact(suite, { now: () => 1_800_000_010_000 });
  expect(Object.isFrozen(artifact.cases[0].groundTruth.tracks)).toBe(true);
  expect(artifact.summary).toMatchObject({ caseCount: 5, uniqueDurationMs: 600_000 });
  expect(service.groundTruthSuiteArtifactJson(artifact)).not.toMatch(/private\/match|https?:|blob:/);

  const runs = Object.fromEntries(artifact.cases.map((entry) => [entry.id, {
    predictionTracks: predictions(entry),
    performance: { processingMs: 60_000 },
  }]));
  const benchmarkSuite = service.buildMultiObjectSuiteFromGroundTruthSuite(artifact, runs);
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js",
  ));
  const report = benchmark.evaluateMultiObjectTrackingBenchmarkSuite(benchmarkSuite);
  expect(report.summary).toMatchObject({
    passed: true,
    caseCount: 5,
    realMatchCaseCount: 5,
    realMatchDurationMs: 600_000,
  });
});

test("selected-object suite keeps a distinct evidence profile and rejects full-scene mixing", async () => {
  const { service, suite } = await readySelectedObjectSuite();
  expect(service.groundTruthSuiteReadiness(suite)).toMatchObject({
    ready: true,
    benchmarkType: "selected-object",
    profileId: "selected-player-pilot-v1",
    caseCount: 5,
    uniqueDurationMs: 600_000,
  });
  const artifact = service.createGroundTruthSuiteArtifact(suite, { now: () => 1_800_000_010_000 });
  expect(artifact).toMatchObject({
    profileId: "selected-player-pilot-v1",
    summary: { benchmarkType: "selected-object", caseCount: 5 },
  });
  expect(artifact.cases.every((entry) => entry.groundTruth.tracks.length === 1)).toBe(true);
  expect(() => service.buildMultiObjectSuiteFromGroundTruthSuite(artifact, {})).toThrow(/full-scene/i);
  const fullScene = await groundTruthArtifact(6, ["transition"]);
  expect(() => service.addGroundTruthSuiteCase(suite, fullScene)).toThrow(/cannot mix/i);

  const mixed = structuredClone(artifact);
  mixed.cases[0] = await groundTruthArtifact(8, ["transition"]);
  expect(() => service.validateGroundTruthSuiteArtifact(mixed)).toThrow(/does not match|mix/i);
});

test("provider run snapshots raw automatic output before analyst correction", async () => {
  const artifact = await groundTruthArtifact(0, ["transition"]);
  const runs = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingProviderRunService.js",
  ));
  const provider = {
    providerId: "sam2.1-hiera-tiny",
    providerVersion: "1.1.0",
    protocol: "football-science-tracking-stage-v1",
    stage: "segmentation",
    capabilities: ["segment:selected-object", "propagate:selected-object"],
    executionFingerprintSha256: "f".repeat(64),
  };
  const rawTracks = automaticProviderTracks(artifact);
  const run = runs.createTrackingProviderRunArtifact({
    id: "sam2-real-match-run-1",
    provider,
    sourceFingerprint: artifact.sourceFingerprint,
    angleId: artifact.sourceEvidence.angleId,
    frame: artifact.frame,
    range: artifact.range,
    tracks: rawTracks,
    performance: providerPerformance(18_000),
  }, { now: () => 1_800_000_000_000 });
  expect(run).toMatchObject({
    protocol: "football-science-tracking-provider-run-v1",
    benchmarkType: "selected-object",
    performance: providerPerformance(18_000),
  });
  expect(Object.isFrozen(run.prediction.tracks[0].segments[0].points)).toBe(true);
  expect(runs.trackingProviderRunArtifactJson(run)).not.toMatch(/metadata|localSource|private|https?:|blob:/);
  const runSuite = runs.createTrackingProviderRunSuiteArtifact({
    id: "sam2-real-match-runs",
    runs: [run],
  }, { now: () => 1_800_000_001_000 });
  expect(runSuite.summary).toMatchObject({
    runCount: 1,
    sourceCount: 1,
    rangeCount: 1,
    predictionTrackCount: 3,
    processingMs: 18_000,
    workerReusedRunCount: 0,
  });
  expect(runSuite.executionProfile).toEqual({
    device: "mps",
    runtimeMode: "football-science-tracking-worker-v1",
    cpuThreads: 0,
    sampleFps: 12.5,
    modelResident: true,
  });

  const legacyRun = structuredClone(run);
  for (const field of [
    "runtimeMode", "cpuThreads", "sampleFps", "modelResident", "workerReused",
    "executionProfileComplete",
  ]) delete legacyRun.performance[field];
  expect(runs.validateTrackingProviderRunArtifact(legacyRun).performance.executionProfileComplete).toBe(false);
  expect(() => runs.createTrackingProviderRunSuiteArtifact({
    id: "legacy-incomplete-runs",
    runs: [legacyRun],
  })).toThrow(/incomplete execution profile/i);

  const mixedProfileRun = structuredClone(run);
  mixedProfileRun.id = "sam2-cpu-run";
  mixedProfileRun.performance.device = "cpu";
  mixedProfileRun.performance.cpuThreads = 8;
  expect(() => runs.createTrackingProviderRunSuiteArtifact({
    id: "mixed-execution-profile-runs",
    runs: [run, mixedProfileRun],
  })).toThrow(/one exact execution profile/i);
  const secondProvider = { ...provider, executionFingerprintSha256: "e".repeat(64) };
  const secondRun = runs.createTrackingProviderRunArtifact({
    id: "sam2-other-build-run",
    provider: secondProvider,
    sourceFingerprint: artifact.sourceFingerprint,
    angleId: artifact.sourceEvidence.angleId,
    frame: artifact.frame,
    range: artifact.range,
    tracks: rawTracks,
    performance: providerPerformance(19_000),
  });
  const workspace = runs.addTrackingProviderRun(
    runs.addTrackingProviderRun({}, "item-1", run),
    "item-2",
    secondRun,
  );
  expect(runs.trackingProviderRunsForProvider(workspace, provider).map((entry) => entry.id)).toEqual([
    run.id,
  ]);
  expect(runs.trackingProviderRunsForProvider(workspace, secondProvider).map((entry) => entry.id)).toEqual([
    secondRun.id,
  ]);
  let boundedWorkspace = {};
  for (let index = 0; index < runs.MAX_TRACKING_PROVIDER_RUNS_PER_ITEM; index += 1) {
    boundedWorkspace = runs.addTrackingProviderRun(boundedWorkspace, "bounded-item", {
      ...structuredClone(run),
      id: `bounded-run-${index}`,
    });
  }
  expect(() => runs.addTrackingProviderRun(boundedWorkspace, "bounded-item", {
    ...structuredClone(run),
    id: "bounded-run-overflow",
  })).toThrow(/cannot retain more than 32 raw provider runs/i);
  const wrongSummary = structuredClone(runSuite);
  wrongSummary.summary.processingMs += 1;
  expect(() => runs.validateTrackingProviderRunSuiteArtifact(wrongSummary)).toThrow(/does not match/i);

  const corrected = structuredClone(rawTracks);
  corrected[0].segments[0].points[0].source = "manual";
  expect(() => runs.createTrackingProviderRunArtifact({
    provider,
    sourceFingerprint: artifact.sourceFingerprint,
    angleId: artifact.sourceEvidence.angleId,
    frame: artifact.frame,
    range: artifact.range,
    tracks: corrected,
    performance: { processingMs: 18_000 },
  })).toThrow(/before analyst corrections/i);

  const unidentified = structuredClone(rawTracks);
  delete unidentified[0].engine;
  expect(() => runs.createTrackingProviderRunArtifact({
    provider,
    sourceFingerprint: artifact.sourceFingerprint,
    angleId: artifact.sourceEvidence.angleId,
    frame: artifact.frame,
    range: artifact.range,
    tracks: unidentified,
    performance: { processingMs: 18_000 },
  })).toThrow(/exact provider engine and version/i);

  const tampered = structuredClone(run);
  tampered.prediction.sourcePath = "/private/match.mp4";
  expect(() => runs.validateTrackingProviderRunArtifact(tampered)).toThrow(/unsupported field/i);
});

test("local benchmark workspace is versioned, bounded and tenant scoped", async () => {
  const artifact = await groundTruthArtifact(0, ["transition"]);
  const runService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingProviderRunService.js",
  ));
  const workspaceService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkWorkspaceService.js",
  ));
  const provider = {
    providerId: "sam2.1-hiera-tiny",
    providerVersion: "1.1.0",
    protocol: "football-science-tracking-stage-v1",
    stage: "segmentation",
    capabilities: ["segment:selected-object", "propagate:selected-object"],
    executionFingerprintSha256: "f".repeat(64),
  };
  const run = runService.createTrackingProviderRunArtifact({
    id: "workspace-run-1",
    provider,
    sourceFingerprint: artifact.sourceFingerprint,
    angleId: artifact.sourceEvidence.angleId,
    frame: artifact.frame,
    range: artifact.range,
    tracks: automaticProviderTracks(artifact),
    performance: providerPerformance(18_000),
  });
  const scope = workspaceService.createTrackingBenchmarkWorkspaceScope({
    organizationId: "org-1",
    teamId: "team-1",
    userId: "analyst-1",
    matchId: "match-1",
    videoId: "video-1",
    localVideoIdentifier: "local-source-1",
  });
  const workspace = workspaceService.createTrackingBenchmarkWorkspaceArtifact({
    scope,
    groundTruth: {
      byItemId: {
        "item-1": {
          itemId: "item-1",
          status: "locked",
          revision: 1,
          selectedTrackIds: artifact.groundTruth.tracks.map((track) => track.id),
          benchmarkTargetTrackId: artifact.reviewEvidence.selectedObjectTargetTrackId,
          scenarioTags: artifact.reviewEvidence.scenarioTags,
          sourceFingerprint: artifact.sourceFingerprint,
          angleId: artifact.sourceEvidence.angleId,
          frame: artifact.frame,
          range: artifact.range,
          attested: true,
          exhaustiveSceneAttested: true,
          lockedArtifact: artifact,
          lockedAt: artifact.reviewEvidence.reviewedAt,
          downloadedAt: "",
          error: "transient error must not persist",
        },
      },
      suite: {
        id: "real-match-pilot",
        revision: 1,
        status: "draft",
        cases: [artifact],
        downloadedAt: "",
        error: "transient suite error",
      },
    },
    providerRuns: {
      byItemId: { "item-1": [run] },
      downloadedAt: "",
      error: "transient run error",
    },
  }, { now: () => 1_800_000_040_000 });
  expect(workspace).toMatchObject({
    protocol: "football-science-tracking-benchmark-workspace-v1",
    scope: { organizationId: "org-1", teamId: "team-1", userId: "analyst-1", sourceType: "match" },
    groundTruth: {
      byItemId: { "item-1": { benchmarkType: "multi-object" } },
      suite: { benchmarkType: "multi-object", error: "", cases: [expect.objectContaining({ id: artifact.id })] },
    },
    providerRuns: { error: "", byItemId: { "item-1": [expect.objectContaining({ id: run.id })] } },
  });
  expect(Object.isFrozen(workspace.groundTruth.byItemId["item-1"].lockedArtifact)).toBe(true);
  expect(workspaceService.validateTrackingBenchmarkWorkspaceArtifact(workspace)).toEqual(workspace);
  expect(workspaceService.emptyTrackingBenchmarkWorkspaceContent()).toMatchObject({
    groundTruth: { suite: { benchmarkType: "selected-object", cases: [] } },
  });
  const forgedWorkspace = structuredClone(workspace);
  forgedWorkspace.groundTruth.suite.benchmarkType = "selected-object";
  expect(() => workspaceService.validateTrackingBenchmarkWorkspaceArtifact(forgedWorkspace)).toThrow(/cannot mix/i);
  const forgedDraftType = structuredClone(workspace);
  forgedDraftType.groundTruth.byItemId["item-1"].benchmarkType = "selected-object";
  expect(workspaceService.validateTrackingBenchmarkWorkspaceArtifact(forgedDraftType)
    .groundTruth.byItemId["item-1"].benchmarkType).toBe("multi-object");
  expect(await workspaceService.trackingBenchmarkWorkspaceContentFingerprint({
    ...workspace,
    benchmarkStorage: { status: "saving", error: "ignored" },
  })).toBe(await workspaceService.trackingBenchmarkWorkspaceContentFingerprint(workspace));
  expect(workspaceService.createTrackingBenchmarkWorkspaceScope({
    organizationId: "org-1",
    teamId: "team-1",
    userId: "analyst-2",
    matchId: "match-1",
  }).id).not.toBe(scope.id);
  expect(() => workspaceService.createTrackingBenchmarkWorkspaceScope({
    organizationId: "org-1",
    teamId: "team-1",
    matchId: "match-1",
  })).toThrow(/user id/i);
  expect(() => workspaceService.createTrackingBenchmarkWorkspaceScope({
    organizationId: "org-1",
    teamId: "team-1",
    userId: "analyst-1",
    matchId: "/private/match.mp4",
  })).toThrow(/match id/i);
  const tampered = structuredClone(workspace);
  tampered.videoUrl = "https://example.com/match.mp4";
  expect(() => workspaceService.validateTrackingBenchmarkWorkspaceArtifact(tampered)).toThrow(/unsupported field/i);
});

test("benchmark persistence retries the exact failed scope before restoring another match", async () => {
  const workspaceService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkWorkspaceService.js",
  ));
  const { createTrackingBenchmarkPersistenceController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingBenchmarkPersistenceController.js",
  ));
  const draft = (trackId) => ({
    itemId: "item-retry",
    status: "draft",
    revision: 1,
    selectedTrackIds: [trackId],
    benchmarkTargetTrackId: "",
    scenarioTags: [],
    sourceFingerprint: "",
    angleId: "",
    frame: { width: 1920, height: 1080 },
    range: { startMs: 0, endMs: 60_000 },
    attested: false,
    exhaustiveSceneAttested: false,
    lockedArtifact: null,
    lockedAt: "",
    downloadedAt: "",
  });
  const baseTracking = workspaceService.emptyTrackingBenchmarkWorkspaceContent();
  let state = {
    match: { id: "match-before-failure" },
    video: { id: "video-before-failure", match_id: "match-before-failure" },
    videoRef: { localVideoIdentifier: "source-before-failure" },
    presentation: {
      tracking: {
        ...baseTracking,
        benchmarkStorage: { status: "waiting-source", lastSavedAt: "", error: "" },
      },
    },
  };
  const listeners = new Set();
  const store = {
    getState: () => state,
    update(updater) {
      state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
      listeners.forEach((listener) => listener(state));
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const attemptedArtifacts = [];
  const loadedScopes = [];
  let rejectWrites = true;
  let nowMs = 1_800_000_050_000;
  const persistence = createTrackingBenchmarkPersistenceController({
    getState: store.getState,
    updateState: store.update,
    getStore: () => store,
    getContext: () => ({
      currentUser: {
        id: "analyst-retry",
        organizationId: "org-retry",
        teamId: "team-retry",
      },
    }),
    loadWorkspace: async (scope) => {
      loadedScopes.push(scope);
      return null;
    },
    saveWorkspace: async (artifact) => {
      attemptedArtifacts.push(artifact);
      if (rejectWrites) throw new Error("Local benchmark disk is unavailable.");
      return artifact;
    },
    now: () => nowMs++,
    saveDelayMs: 0,
  });

  await persistence.restore();
  persistence.start();
  store.update((current) => ({
    ...current,
    presentation: {
      ...current.presentation,
      tracking: {
        ...current.presentation.tracking,
        groundTruth: {
          ...current.presentation.tracking.groundTruth,
          byItemId: { "item-retry": draft("track-before-failure") },
        },
      },
    },
  }));
  await expect.poll(() => state.presentation.tracking.benchmarkStorage.status).toBe("error");

  const nextTracking = workspaceService.emptyTrackingBenchmarkWorkspaceContent();
  nextTracking.groundTruth.byItemId["item-retry"] = draft("track-from-next-match");
  state = {
    ...state,
    match: { id: "match-after-failure" },
    video: { id: "video-after-failure", match_id: "match-after-failure" },
    videoRef: { localVideoIdentifier: "source-after-failure" },
    presentation: {
      ...state.presentation,
      tracking: {
        ...state.presentation.tracking,
        ...nextTracking,
      },
    },
  };
  rejectWrites = false;
  await persistence.retry();

  expect(attemptedArtifacts).toHaveLength(2);
  expect(attemptedArtifacts.map((entry) => entry.scope.matchId)).toEqual([
    "match-before-failure",
    "match-before-failure",
  ]);
  expect(attemptedArtifacts[1].groundTruth.byItemId["item-retry"].selectedTrackIds).toEqual([
    "track-before-failure",
  ]);
  expect(JSON.stringify(attemptedArtifacts[1])).not.toContain("track-from-next-match");
  expect(loadedScopes.map((scope) => scope.matchId)).toEqual([
    "match-before-failure",
    "match-after-failure",
  ]);
  expect(state.presentation.tracking.benchmarkStorage.status).toBe("ready");
  expect(state.presentation.tracking.groundTruth.byItemId).toEqual({});
  await persistence.dispose();
});

test("assembler binds raw provider runs to one selected target per unique real-match case", async () => {
  const { service, suite } = await readySuite();
  const groundTruthSuite = service.createGroundTruthSuiteArtifact(suite, {
    now: () => 1_800_000_010_000,
  });
  const runService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingProviderRunService.js",
  ));
  const assembly = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkAssemblyService.js",
  ));
  const provider = {
    providerId: "sam2.1-hiera-tiny",
    providerVersion: "1.1.0",
    protocol: "football-science-tracking-stage-v1",
    stage: "segmentation",
    capabilities: ["segment:selected-object", "propagate:selected-object"],
    executionFingerprintSha256: "f".repeat(64),
  };
  const providerRuns = groundTruthSuite.cases.map((artifact, index) => (
    runService.createTrackingProviderRunArtifact({
      id: `sam2-case-${index + 1}`,
      provider,
      sourceFingerprint: artifact.sourceFingerprint,
      angleId: artifact.sourceEvidence.angleId,
      frame: artifact.frame,
      range: artifact.range,
      tracks: automaticProviderTracks(artifact).map((track) => (
        index === 0 && track.id === artifact.reviewEvidence.selectedObjectTargetTrackId
          ? { ...track, id: "provider-continuation-id" }
          : track
      )),
      performance: providerPerformance(60_000, { workerReused: index > 0 }),
    }, { now: () => 1_800_000_020_000 + index })
  ));
  const runSuite = runService.createTrackingProviderRunSuiteArtifact({
    id: "sam2-real-match-runs",
    runs: providerRuns,
  }, { now: () => 1_800_000_030_000 });
  const benchmarkSuite = assembly.assembleTrackingBenchmarkSuite(groundTruthSuite, runSuite, {
    groundTruthSuiteSha256: "1".repeat(64),
    providerRunSuiteSha256: "2".repeat(64),
  });
  expect(benchmarkSuite).toMatchObject({
    providerRunEvidence: {
      provider: { providerId: "sam2.1-hiera-tiny", executionFingerprintSha256: "f".repeat(64) },
      runIds: providerRuns.map((run) => run.id).sort(),
    },
  });
  expect(benchmarkSuite.cases).toHaveLength(5);
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkService.js",
  ));
  const report = benchmark.evaluateTrackingBenchmarkSuite(benchmarkSuite);
  expect(report.providerRunEvidence).toMatchObject({
    provider: { providerId: "sam2.1-hiera-tiny" },
    groundTruthSuiteSha256: "1".repeat(64),
    providerRunSuiteSha256: "2".repeat(64),
  });
  expect(report.summary).toMatchObject({
    passed: true,
    caseCount: 5,
    realMatchCaseCount: 5,
    realMatchDurationMs: 600_000,
  });

  const cli = await import(moduleUrl("scripts/fs-player-tracking-benchmark-assemble.mjs"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-assembly-"));
  const groundTruthPath = path.join(directory, "ground-truth.json");
  const runsPath = path.join(directory, "provider-runs.json");
  const outputPath = path.join(directory, "benchmark.json");
  let stdout = "";
  let stderr = "";
  try {
    await Promise.all([
      fs.writeFile(groundTruthPath, JSON.stringify(groundTruthSuite)),
      fs.writeFile(runsPath, JSON.stringify(runSuite)),
    ]);
    const exitCode = await cli.runTrackingBenchmarkAssembly([
      "--ground-truth", groundTruthPath,
      "--runs", runsPath,
      "--output", outputPath,
    ], {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    });
    const assembledFromDisk = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("ASSEMBLED | real-match-pilot-r1-sam2.1-hiera-tiny");
    expect(assembledFromDisk.providerRunEvidence).toMatchObject({
      groundTruthSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerRunSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      runIds: providerRuns.map((run) => run.id).sort(),
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }

  const missingRunSuite = runService.createTrackingProviderRunSuiteArtifact({
    id: "sam2-incomplete-runs",
    runs: providerRuns.slice(1),
  });
  expect(() => assembly.assembleTrackingBenchmarkSuite(groundTruthSuite, missingRunSuite, {
    groundTruthSuiteSha256: "1".repeat(64),
    providerRunSuiteSha256: "2".repeat(64),
  })).toThrow(/prediction is missing/i);

  const duplicateTargetId = groundTruthSuite.cases[0].reviewEvidence.selectedObjectTargetTrackId;
  const duplicateTargetPlayerId = groundTruthSuite.cases[0].groundTruth.tracks
    .find((track) => track.id === duplicateTargetId)?.playerId;
  const duplicateTargetRun = {
    ...structuredClone(providerRuns[0]),
    id: "sam2-case-1-duplicate-target",
    prediction: {
      tracks: structuredClone(providerRuns[0].prediction.tracks).map((track) => (
        track.playerId === duplicateTargetPlayerId ? { ...track, id: duplicateTargetId } : track
      )),
    },
  };
  const ambiguousRunSuite = runService.createTrackingProviderRunSuiteArtifact({
    id: "sam2-ambiguous-runs",
    runs: [...providerRuns, duplicateTargetRun],
  });
  expect(() => assembly.assembleTrackingBenchmarkSuite(groundTruthSuite, ambiguousRunSuite, {
    groundTruthSuiteSha256: "1".repeat(64),
    providerRunSuiteSha256: "2".repeat(64),
  })).toThrow(/duplicate provider runs/i);
});

test("suite replaces the same source range and excludes overlap from approval time", async () => {
  const { service, suite } = await readySuite();
  const replacement = await groundTruthArtifact(9, ["transition"], { startMs: 0, endMs: 120_000 });
  const replaced = service.addGroundTruthSuiteCase(suite, replacement);
  expect(replaced.cases).toHaveLength(5);
  expect(replaced.cases.some((entry) => entry.id === replacement.id)).toBe(true);

  const overlapping = await groundTruthArtifact(10, ["transition"], { startMs: 540_000, endMs: 660_000 });
  const extended = service.addGroundTruthSuiteCase(replaced, overlapping);
  expect(service.groundTruthSuiteReadiness(extended)).toMatchObject({
    ready: true,
    rawDurationMs: 720_000,
    uniqueDurationMs: 660_000,
    overlapDurationMs: 60_000,
  });
});

test("suite rejects forged sparse references and reports missing scenario coverage", async () => {
  const { service, suite } = await readySuite();
  const sparse = structuredClone(suite.cases[0]);
  sparse.id = "forged-sparse-case";
  sparse.range.endMs = sparse.range.startMs + 120_000;
  sparse.groundTruth.tracks.forEach((track) => {
    track.segments[0].points = [track.segments[0].points[0], track.segments[0].points.at(-1)];
  });
  expect(() => service.addGroundTruthSuiteCase(suite, sparse)).toThrow(/500 ms/i);

  const reduced = service.removeGroundTruthSuiteCase(suite, suite.cases.at(-1).id);
  expect(service.groundTruthSuiteReadiness(reduced)).toMatchObject({
    ready: false,
    caseCount: 4,
    missingScenarioIds: expect.arrayContaining(["set-piece", "compact-unit"]),
  });
});

test("imported suite evidence is revalidated before export or provider execution", async () => {
  const { service, suite } = await readySuite();
  const artifact = service.createGroundTruthSuiteArtifact(suite, { now: () => 1_800_000_010_000 });
  const mismatchedSummary = structuredClone(artifact);
  mismatchedSummary.summary.uniqueDurationMs += 500;
  expect(() => service.groundTruthSuiteArtifactJson(mismatchedSummary)).toThrow(/does not match/i);
  expect(() => service.buildMultiObjectSuiteFromGroundTruthSuite(mismatchedSummary, {})).toThrow(/does not match/i);

  const missingScenarioEvidence = structuredClone(artifact);
  missingScenarioEvidence.cases.at(-1).reviewEvidence.scenarioTags = [];
  expect(() => service.groundTruthSuiteArtifactJson(missingScenarioEvidence)).toThrow(/does not match/i);
});

test("benchmark workflow binds exact suites and rejects a modified selected-object report", async () => {
  const state = await readyWorkflowState();
  const workflow = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkWorkflowService.js",
  ));
  const readiness = workflow.trackingBenchmarkWorkflowReadiness(state.presentation.tracking);
  expect(readiness).toMatchObject({
    ready: true,
    runCount: 5,
    matchedCaseCount: 5,
    benchmarkType: "selected-object",
    referenceRequired: false,
  });
  const prepared = await workflow.prepareTrackingBenchmarkWorkflow(state.presentation.tracking, {
    now: () => 1_800_000_100_000,
  });
  expect(prepared).toMatchObject({
    groundTruthSuite: {
      profileId: "selected-player-pilot-v1",
      summary: { benchmarkType: "selected-object" },
    },
    groundTruthSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    providerRunSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    sourceSignature: expect.stringMatching(/^[a-f0-9]{64}$/),
    assembledBenchmark: {
      providerRunEvidence: {
        groundTruthSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        providerRunSuiteSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    },
  });
  const finalized = await workflow.finalizeTrackingBenchmarkWorkflow(
    prepared,
    prepared.internalReport,
    { now: () => 1_800_000_100_100 },
  );
  expect(finalized.evidenceSet).toMatchObject({
    protocol: "football-science-tracking-benchmark-evidence-set-v1",
    sourceSignature: prepared.sourceSignature,
    checksums: {
      groundTruthSuiteSha256: prepared.groundTruthSuiteSha256,
      providerRunSuiteSha256: prepared.providerRunSuiteSha256,
      reportSha256: finalized.reportSha256,
    },
  });
  expect(workflow.trackingBenchmarkEvidenceSetJson(finalized.evidenceSet)).not.toMatch(
    /sourcePath|videoUrl|blob:|https?:\/\//i,
  );

  const modified = structuredClone(prepared.internalReport);
  modified.summary.weightedMeanIou = 0.01;
  await expect(workflow.finalizeTrackingBenchmarkWorkflow(prepared, modified)).rejects.toThrow(
    /does not match/i,
  );
});

test("multi-object workflow requires the pinned TrackEval identity and cross-validation", async () => {
  const state = await readyWorkflowState("association");
  const workflow = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkWorkflowService.js",
  ));
  const { attachTrackEvalReference } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-trackeval-adapter.mjs",
  ));
  const prepared = await workflow.prepareTrackingBenchmarkWorkflow(state.presentation.tracking, {
    now: () => 1_800_000_110_000,
  });
  expect(prepared).toMatchObject({
    benchmarkType: "multi-object",
    referenceRequired: true,
    reference: {
      evaluator: "TrackEval",
      evaluatorCommit: "b".repeat(40),
      sourceSha256: "c".repeat(64),
    },
  });
  const report = await attachTrackEvalReference(
    prepared.assembledBenchmark,
    prepared.internalReport,
    { reference: passingTrackEvalReference(prepared.internalReport) },
  );
  const finalized = await workflow.finalizeTrackingBenchmarkWorkflow(prepared, report, {
    now: () => 1_800_000_110_100,
  });
  expect(finalized.report).toMatchObject({
    summary: { passed: true, providerApprovalReady: true },
    referenceValidation: { evaluator: "TrackEval", status: "verified", passed: true },
  });

  const wrongReference = structuredClone(report);
  wrongReference.cases[0].referenceValidation.sourceSha256 = "e".repeat(64);
  await expect(workflow.finalizeTrackingBenchmarkWorkflow(prepared, wrongReference)).rejects.toThrow(
    /checksum changed/i,
  );
  const inconsistentThreshold = structuredClone(report);
  inconsistentThreshold.cases[0].referenceValidation.metrics.HOTA = 0;
  await expect(workflow.finalizeTrackingBenchmarkWorkflow(prepared, inconsistentThreshold)).rejects.toThrow(
    /threshold evidence is inconsistent/i,
  );
});

test("benchmark controller completes locally and never accepts evidence after inputs change", async () => {
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingBenchmarkController.js",
  ));
  const evaluator = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkService.js",
  ));
  let state = await readyWorkflowState();
  const updateState = (updater) => { state = updater(state); };
  const controller = benchmark.createTrackingBenchmarkController({
    getState: () => state,
    updateState,
    getWindow: () => ({ crypto: globalThis.crypto }),
    evaluateBenchmark: async (suite, options) => {
      options.onQueued({ jobId: "benchmark-job-1", statusUrl: "http://127.0.0.1/jobs/1", sessionToken: "secret" });
      options.onProgress({ stage: "evaluating benchmark", ratio: 0.7 });
      return evaluator.evaluateTrackingBenchmarkSuite(suite);
    },
    now: () => 1_800_000_120_000,
  });
  expect(await controller.run()).toBe(true);
  expect(state.presentation.tracking.benchmarkEvaluation).toMatchObject({
    status: "passed",
    progress: 1,
    benchmarkType: "selected-object",
    reportSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    job: null,
  });
  expect(JSON.stringify(state.presentation.tracking.benchmarkEvaluation)).not.toContain("secret");

  state = await readyWorkflowState();
  const staleController = benchmark.createTrackingBenchmarkController({
    getState: () => state,
    updateState,
    getWindow: () => ({ crypto: globalThis.crypto }),
    evaluateBenchmark: async (suite) => {
      const providerRuns = structuredClone(state.presentation.tracking.providerRuns);
      providerRuns.byItemId["item-0"][0].performance.processingMs += 1;
      state = {
        ...state,
        presentation: {
          ...state.presentation,
          tracking: { ...state.presentation.tracking, providerRuns },
        },
      };
      return evaluator.evaluateTrackingBenchmarkSuite(suite);
    },
    now: () => 1_800_000_120_000,
  });
  expect(await staleController.run()).toBe(false);
  expect(state.presentation.tracking.benchmarkEvaluation).toMatchObject({
    status: "error",
    evidenceSet: null,
    error: "Benchmark inputs changed during evaluation. Run the benchmark again.",
  });
});

test("benchmark controller cancels the local evaluation cleanly", async () => {
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingBenchmarkController.js",
  ));
  let state = await readyWorkflowState();
  let cancelRequests = 0;
  const controller = benchmark.createTrackingBenchmarkController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    evaluateBenchmark: async (_suite, options) => new Promise((_resolve, reject) => {
      options.onQueued({ jobId: "benchmark-job-cancel", statusUrl: "http://127.0.0.1/jobs/cancel", sessionToken: "secret" });
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }),
    cancelBenchmark: async () => { cancelRequests += 1; return true; },
    now: () => 1_800_000_130_000,
  });
  const running = controller.run();
  await expect.poll(() => state.presentation.tracking.benchmarkEvaluation?.status).toBe("running");
  expect(controller.cancel()).toBe(true);
  expect(await running).toBe(false);
  expect(cancelRequests).toBe(1);
  expect(state.presentation.tracking.benchmarkEvaluation).toMatchObject({
    status: "cancelled",
    report: null,
    evidenceSet: null,
    error: "",
  });

  state = await readyWorkflowState();
  const invalidated = benchmark.createTrackingBenchmarkController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    evaluateBenchmark: async (_suite, options) => new Promise((_resolve, reject) => {
      options.onQueued({ jobId: "benchmark-job-invalidated", statusUrl: "http://127.0.0.1/jobs/invalidated" });
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }),
    cancelBenchmark: async () => true,
    now: () => 1_800_000_130_100,
  });
  const invalidatedRun = invalidated.run();
  await expect.poll(() => state.presentation.tracking.benchmarkEvaluation?.status).toBe("running");
  expect(invalidated.invalidate()).toBe(true);
  expect(await invalidatedRun).toBe(false);
  expect(state.presentation.tracking.benchmarkEvaluation).toMatchObject({
    status: "error",
    evidenceSet: null,
    error: "Benchmark inputs changed during evaluation. Run the benchmark again.",
  });
});

test("benchmark cancellation during checksum verification cannot publish stale evidence", async () => {
  const benchmark = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingBenchmarkController.js",
  ));
  const evaluator = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingBenchmarkService.js",
  ));
  let state = await readyWorkflowState();
  let digestCount = 0;
  let releaseVerification;
  const verificationBlocked = new Promise((resolve) => { releaseVerification = resolve; });
  const cryptoApi = {
    subtle: {
      digest: async (...args) => {
        digestCount += 1;
        if (digestCount === 4) await verificationBlocked;
        return globalThis.crypto.subtle.digest(...args);
      },
    },
  };
  const controller = benchmark.createTrackingBenchmarkController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: cryptoApi }),
    cryptoApi,
    evaluateBenchmark: async (suite) => evaluator.evaluateTrackingBenchmarkSuite(suite),
    now: () => 1_800_000_140_000,
  });
  const running = controller.run();
  await expect.poll(() => state.presentation.tracking.benchmarkEvaluation?.status).toBe("verifying");
  expect(controller.cancel()).toBe(true);
  releaseVerification();
  expect(await running).toBe(false);
  expect(state.presentation.tracking.benchmarkEvaluation).toMatchObject({
    status: "cancelled",
    report: null,
    evidenceSet: null,
    error: "",
  });
});

test("suite panel exposes progress, scenario state and reversible case removal", async () => {
  const { suite } = await readySuite();
  const { renderTrackingBenchmarkSuitePanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingBenchmarkSuitePanel.js",
  ));
  const html = renderTrackingBenchmarkSuitePanel({
    presentation: { tracking: { groundTruth: { suite } } },
  });
  expect(html).toContain("Ready for provider benchmark");
  expect(html).toContain("10.0 min unique / 10.0 min");
  expect(html).toMatch(/ground-truth-suite-download"(?! disabled)/);
  expect(html).toContain("data-video-analysis-ground-truth-case-id");
  expect(html).toContain("is-covered");
  expect(html).toMatch(/data-video-analysis-ground-truth-benchmark-type="multi-object"[^>]*aria-pressed="true"[^>]*disabled/);
});
