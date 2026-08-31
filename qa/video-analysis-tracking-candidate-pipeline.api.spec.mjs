import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

const sourceFingerprint = "f".repeat(64);
const range = { startMs: 0, endMs: 2000 };
const stageCapabilities = {
  detection: ["detect:player", "detect:ball", "detect:referee"],
  association: ["associate:multi-object"],
  reidentification: ["reidentify:player"],
  classification: ["classify:team", "classify:shirt-number"],
};
const stageHashCharacters = { detection: "d", association: "a", reidentification: "e", classification: "c" };

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function providers() {
  return Object.fromEntries(Object.entries(stageCapabilities).map(([stage, capabilities]) => [stage, {
    id: `candidate-${stage}`,
    version: "0.1.0",
    protocol: "football-science-tracking-stage-v1",
    stage,
    capabilities,
    benchmarkOnly: true,
    executionAvailable: true,
    providerFingerprintSha256: "2".repeat(64),
    executionFingerprintSha256: "3".repeat(64),
    executionProfile: {
      device: "cpu",
      runtimeMode: "native-stage-process-v1",
      cpuThreads: 8,
      sampleFps: 12.5,
      modelResident: false,
    },
  }]));
}

function observation(id, atMs, frameIndex, entityType, left, confidence = 0.9) {
  return {
    id,
    atMs,
    frameIndex,
    entityType,
    box: { left, top: 0.2, width: entityType === "ball" ? 0.02 : 0.08, height: entityType === "ball" ? 0.02 : 0.3 },
    confidence,
  };
}

function stagePayload(stage) {
  if (stage === "detection") return { observations: [
    observation("player-a", 0, 0, "player", 0.1, 0.96),
    observation("player-b", 1000, 25, "player", 0.2, 0.94),
    observation("ball-a", 1000, 25, "ball", 0.5, 0.88),
    observation("referee-a", 1000, 25, "referee", 0.7, 0.91),
    observation("unassigned-a", 2000, 50, "player", 0.8, 0.4),
  ] };
  if (stage === "association") return { trajectories: [
    { id: "trajectory-player", entityType: "player", observationIds: ["player-a", "player-b"], confidence: 0.93, discontinuitiesMs: [1000] },
    { id: "trajectory-ball", entityType: "ball", observationIds: ["ball-a"], confidence: 0.82, discontinuitiesMs: [] },
    { id: "trajectory-referee", entityType: "referee", observationIds: ["referee-a"], confidence: 0.91, discontinuitiesMs: [] },
  ] };
  if (stage === "reidentification") return { identities: [
    { trajectoryId: "trajectory-player", identityKey: "local-cluster-8", confidence: 0.91 },
  ] };
  return { classifications: [
    { trajectoryId: "trajectory-player", teamSide: "home", teamConfidence: 0.97, shirtNumber: "8", shirtNumberConfidence: 0.9 },
  ] };
}

function runResult(stage, provider, request, overrides = {}) {
  const fingerprint = stageHashCharacters[stage];
  const requestFingerprint = fingerprint.repeat(64);
  const artifact = {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: { id: provider.id, version: provider.version, fingerprintSha256: provider.providerFingerprintSha256 },
    stage,
    capabilities: [...provider.capabilities],
    sourceFingerprint,
    requestFingerprint,
    range: { ...range },
    payload: stagePayload(stage),
  };
  return {
    benchmarkOnly: true,
    artifact,
    sourceSha256: sourceFingerprint,
    sourceArtifactId: stage === "detection" ? "ca11da7e-0000-0000-0000-000000000001" : "",
    evidenceSha256: fingerprint.repeat(64),
    evidence: {
      protocol: "football-science-tracking-candidate-stage-run-v1",
      benchmarkOnly: true,
      provider: {
        id: provider.id,
        version: provider.version,
        protocol: provider.protocol,
        stage,
        capabilities: [...provider.capabilities],
        manifestFingerprintSha256: provider.providerFingerprintSha256,
        executionFingerprintSha256: provider.executionFingerprintSha256,
      },
      result: { artifactSha256: fingerprint.repeat(64), payload: artifact },
      execution: {
        wallTimeMs: 100,
        realTimeFactor: 0.05,
        exitCode: 0,
        ...provider.executionProfile,
      },
    },
    ...overrides,
  };
}

function sealedRunResult(stage, selectedProvider, request) {
  const normalizedRequest = { sourceFingerprint, ...request };
  const stageArtifact = {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: {
      id: selectedProvider.id,
      version: selectedProvider.version,
      fingerprintSha256: selectedProvider.providerFingerprintSha256,
    },
    stage,
    capabilities: [...selectedProvider.capabilities],
    sourceFingerprint,
    requestFingerprint: digest(canonicalJson({ stage, request: normalizedRequest })),
    range: { ...range },
    payload: stagePayload(stage),
  };
  const artifactSha256 = digest(canonicalJson(stageArtifact));
  const evidence = {
    schemaVersion: 1,
    protocol: "football-science-tracking-candidate-stage-run-v1",
    id: `candidate-${stage}-evidence`,
    benchmarkOnly: true,
    provider: {
      id: selectedProvider.id,
      version: selectedProvider.version,
      protocol: "football-science-tracking-stage-v1",
      stage,
      capabilities: [...selectedProvider.capabilities],
      manifestFingerprintSha256: selectedProvider.providerFingerprintSha256,
      executionFingerprintSha256: selectedProvider.executionFingerprintSha256,
    },
    source: { algorithm: "sha256", kind: "exact-local-file-bytes", fingerprintSha256: sourceFingerprint },
    range: { ...range },
    request: { fingerprintSha256: stageArtifact.requestFingerprint, payload: normalizedRequest },
    result: { artifactSha256, payload: stageArtifact },
    execution: {
      protocol: "football-science-tracking-stage-execution-v1",
      isolation: "test-network-denied-v1",
      wallTimeMs: 100,
      realTimeFactor: 0.05,
      outputBytes: 1024,
      stdoutBytes: 0,
      stderrBytes: 0,
      exitCode: 0,
      ...selectedProvider.executionProfile,
      workerReused: false,
    },
    createdAt: "2026-08-31T12:00:00.000Z",
  };
  return {
    benchmarkOnly: true,
    artifact: stageArtifact,
    sourceArtifactId: stage === "detection" ? "ca11da7e-0000-0000-0000-000000000001" : "",
    sourceSha256: sourceFingerprint,
    evidence,
    evidenceSha256: digest(`${JSON.stringify(evidence)}\n`),
  };
}

test("candidate pipeline chains exact stage inputs and creates review tracks without mutating raw evidence", async () => {
  const pipeline = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const review = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewService.js",
  ));
  const configuredProviders = providers();
  const calls = [];
  const result = await pipeline.runTrackingCandidatePipeline({
    providers: configuredProviders,
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
    teamAnchors: [{ teamSide: "home", trajectoryId: "trajectory-player" }],
    cryptoApi: globalThis.crypto,
    runStage: async (options) => {
      calls.push(options);
      return runResult(options.provider.stage, options.provider, options.request);
    },
  });

  expect(calls.map((call) => call.provider.stage)).toEqual([
    "detection", "association", "reidentification", "classification",
  ]);
  expect(calls[1].request.observations).toHaveLength(5);
  expect(calls[2].request.trajectories[0].observations.map((entry) => entry.id)).toEqual(["player-a", "player-b"]);
  expect(calls.slice(1).every((call) => (
    call.sourceArtifactId === "ca11da7e-0000-0000-0000-000000000001"
  ))).toBe(true);
  expect(calls[3].request.trajectories).toEqual(calls[2].request.trajectories);
  expect(calls[3].request.teamAnchors).toEqual([
    { teamSide: "home", trajectoryId: "trajectory-player" },
  ]);

  expect(result).toMatchObject({
    benchmarkOnly: true,
    review: {
      trackCount: 3,
      playerTrackCount: 1,
      ballTrackCount: 1,
      refereeTrackCount: 1,
      unassignedObservationCount: 1,
      playerIdentityReviewCount: 1,
    },
  });
  expect(result.lineage.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.lineage).toMatchObject({ sourceRange: range, matchRange: range, sync: { angleId: "primary" } });
  const player = result.tracks.find((track) => track.entityType === "player");
  expect(player).toMatchObject({
    status: "review",
    playerId: "",
    teamSide: "home",
    shirtNumber: "8",
    identityConfidence: 0.91,
  });
  expect(player.segments).toHaveLength(2);
  expect(player.metadata.candidateDetectionEvidenceSha256).toBe("d".repeat(64));
  expect(Object.isFrozen(result.rawStageRuns[0].evidence.result.payload)).toBe(true);

  const corrected = review.applyManualTrackingCorrection(player, {
    atMs: 1000,
    box: { left: 0.22, top: 0.2, width: 0.08, height: 0.3 },
  });
  expect(corrected.corrections).toHaveLength(1);
  expect(result.rawStageRuns[0].artifact.payload.observations[1].box.left).toBe(0.2);
  expect(JSON.stringify(result.rawStageRuns)).not.toMatch(/corrections|source.*manual/i);
});

test("candidate pipeline maps synchronized source timestamps back to match time", async () => {
  const pipeline = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const result = await pipeline.runTrackingCandidatePipeline({
    providers: providers(),
    sourceFingerprint,
    range,
    matchRange: { startMs: 1000, endMs: 3000 },
    sync: { angleId: "tactical", syncOffsetMs: -1000, driftPpm: 0 },
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => runResult(options.provider.stage, options.provider, options.request),
  });
  const player = result.tracks.find((track) => track.entityType === "player");
  expect(player.startMs).toBe(1000);
  expect(player.endMs).toBe(3000);
  expect(player.segments.flatMap((segment) => segment.points.map((point) => point.atMs))).toEqual([1000, 2000]);
  expect(player.metadata.angleId).toBe("tactical");
});

test("candidate pipeline artifact preserves exact raw evidence and rejects changed review predictions", async () => {
  const pipeline = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const artifacts = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineArtifactService.js",
  ));
  const providerRuns = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidateProviderRunService.js",
  ));
  const result = await pipeline.runTrackingCandidatePipeline({
    providers: providers(),
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => sealedRunResult(options.provider.stage, options.provider, options.request),
  });
  const artifact = await artifacts.createTrackingCandidatePipelineArtifact({
    scope: { organizationId: "org-1", teamId: "team-1", userId: "analyst-1", matchId: "match-1" },
    itemId: "presentation-item-1",
    frame: { width: 1920, height: 1080 },
    ...result,
  }, { cryptoApi: globalThis.crypto, now: () => "2026-08-31T12:05:00.000Z" });
  const benchmarkRuns = providerRuns.createTrackingCandidateProviderRuns(result, {
    frame: { width: 1920, height: 1080 },
    now: () => "2026-08-31T12:05:00.000Z",
  });
  expect(Object.keys(benchmarkRuns)).toEqual(["detection", "association", "reidentification", "classification"]);
  expect(benchmarkRuns.detection).toMatchObject({
    protocol: "football-science-tracking-provider-run-v1",
    benchmarkType: "multi-object",
    provider: { providerId: "candidate-detection", stage: "detection" },
    performance: { device: "cpu", runtimeMode: "native-stage-process-v1", executionProfileComplete: true },
  });
  expect(benchmarkRuns.classification.prediction.tracks[0].engine).toBeUndefined();
  expect(artifact).toMatchObject({
    protocol: "football-science-tracking-candidate-pipeline-run-v1",
    benchmarkOnly: true,
    stages: [{ stage: "detection" }, { stage: "association" }, { stage: "reidentification" }, { stage: "classification" }],
    review: { trackCount: 3, unassignedObservationCount: 1 },
  });
  expect(await artifacts.validateTrackingCandidatePipelineArtifact(structuredClone(artifact), {
    cryptoApi: globalThis.crypto,
  })).toEqual(artifact);

  const changed = structuredClone(artifact);
  changed.rawTracks[0].segments[0].points[0].x = 0.99;
  await expect(artifacts.validateTrackingCandidatePipelineArtifact(changed, {
    cryptoApi: globalThis.crypto,
  })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_PIPELINE_ARTIFACT_TAMPERED" });
});

test("candidate controller stores immutable evidence before publishing review tracks", async () => {
  const pipelineService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const artifactService = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineArtifactService.js",
  ));
  const { createTrackingCandidateController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingCandidateController.js",
  ));
  const selectedProviders = providers();
  const result = await pipelineService.runTrackingCandidatePipeline({
    providers: selectedProviders,
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => sealedRunResult(options.provider.stage, options.provider, options.request),
  });
  const scope = { organizationId: "org-1", teamId: "team-1", userId: "analyst-1", matchId: "match-1" };
  const artifact = await artifactService.createTrackingCandidatePipelineArtifact({
    scope,
    itemId: "presentation-item-1",
    frame: { width: 1920, height: 1080 },
    ...result,
  }, { cryptoApi: globalThis.crypto, now: () => "2026-08-31T12:05:00.000Z" });
  const item = {
    id: "presentation-item-1",
    clipId: "clip-1",
    startMs: 0,
    endMs: 2000,
    objectTracks: [],
    dynamicGraphics: [],
  };
  let state = {
    source: { organizationId: "org-1", teamId: "team-1", matchId: "match-1" },
    presentation: {
      selectedItemId: item.id,
      current: { sections: [{ id: "section-1", items: [item] }] },
      tracking: {
        provider: {
          candidateStageExecutionAvailable: true,
          candidates: Object.values(selectedProviders).map((provider) => ({
            ...provider,
            status: "candidate-ready",
            available: true,
            executionAvailable: true,
            priority: 100,
          })),
        },
        groundTruth: { suite: { id: "suite-1", revision: 1, status: "draft", benchmarkType: "multi-object", cases: [] } },
        providerRuns: { byItemId: {}, downloadedAt: "", error: "" },
        candidatePipeline: { status: "ready", stage: "", progress: 0, activeRunId: "", runs: [], error: "" },
        benchmarkEvaluation: { status: "passed", report: { summary: {} } },
      },
    },
  };
  const events = [];
  const videoElement = { videoWidth: 1920, videoHeight: 1080 };
  const controller = createTrackingCandidateController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getContext: () => ({ currentUser: { id: "analyst-1" } }),
    getVideoElement: () => videoElement,
    runPipeline: async () => result,
    createArtifact: async () => { events.push("artifact"); return artifact; },
    saveArtifact: async () => { events.push("save"); return artifactService.trackingCandidatePipelineSummary(artifact); },
    persistTrack: async (track) => { events.push("track"); return track; },
    now: () => "2026-08-31T12:05:00.000Z",
  });
  expect(await controller.run()).toBe(true);
  expect(events.slice(0, 2)).toEqual(["artifact", "save"]);
  expect(events.filter((event) => event === "track")).toHaveLength(result.tracks.length);
  expect(state.presentation.tracking.candidatePipeline.status).toBe("review");
  expect(state.presentation.tracking.candidateBenchmarkProvider.stage).toBe("detection");
  expect(Object.keys(state.presentation.tracking.candidateBenchmarkProviders)).toEqual([
    "detection", "association", "reidentification", "classification",
  ]);
  expect(state.presentation.tracking.providerRuns.byItemId[item.id]).toHaveLength(4);
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(result.tracks.length);
  expect(state.presentation.tracking.benchmarkEvaluation.status).toBe("idle");
  videoElement.videoWidth = 0;
  expect(await controller.run()).toBe(false);
  expect(state.presentation.tracking.candidatePipeline.error).toMatch(/video dimensions/i);
});

test("candidate pipeline derives the first source fingerprint from exact uploaded bytes", async () => {
  const pipeline = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const calls = [];
  const result = await pipeline.runTrackingCandidatePipeline({
    providers: providers(),
    range,
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => {
      calls.push(options);
      return runResult(options.provider.stage, options.provider, {
        sourceFingerprint,
        ...options.request,
      });
    },
  });
  expect(calls[0].request).toEqual({ range });
  expect(calls.slice(1).every((call) => call.request.sourceFingerprint === sourceFingerprint)).toBe(true);
  expect(result.lineage.sourceFingerprint).toBe(sourceFingerprint);
});

test("candidate pipeline fails closed on missing capabilities and crossed evidence", async () => {
  const pipeline = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingCandidatePipelineService.js",
  ));
  const incomplete = providers();
  incomplete.detection.capabilities = ["detect:player"];
  await expect(pipeline.runTrackingCandidatePipeline({
    providers: incomplete,
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
  })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_PIPELINE_PROVIDER_MISSING" });

  const configuredProviders = providers();
  await expect(pipeline.runTrackingCandidatePipeline({
    providers: configuredProviders,
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => runResult(
      options.provider.stage,
      options.provider,
      options.request,
      options.provider.stage === "association"
        ? { evidenceSha256: "f".repeat(64), evidence: { protocol: "forged" } }
        : {},
    ),
  })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_PIPELINE_EVIDENCE_MISMATCH" });

  await expect(pipeline.runTrackingCandidatePipeline({
    providers: configuredProviders,
    sourceFingerprint,
    range,
    file: new Blob(["match"]),
    cryptoApi: globalThis.crypto,
    runStage: async (options) => {
      const result = runResult(options.provider.stage, options.provider, options.request);
      if (options.provider.stage === "association") {
        result.evidence.provider.executionFingerprintSha256 = "0".repeat(64);
      }
      return result;
    },
  })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_PIPELINE_EVIDENCE_MISMATCH" });
});
