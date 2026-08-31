import { expect, test } from "@playwright/test";
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

function providers() {
  return Object.fromEntries(Object.entries(stageCapabilities).map(([stage, capabilities]) => [stage, {
    id: `candidate-${stage}`,
    version: "0.1.0",
    stage,
    capabilities,
    benchmarkOnly: true,
    executionAvailable: true,
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
    provider: { id: provider.id, version: provider.version, fingerprintSha256: "a".repeat(64) },
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
    sourceArtifactId: stage === "detection" ? "ca11da7e-0000-0000-0000-000000000001" : "",
    evidenceSha256: fingerprint.repeat(64),
    evidence: {
      protocol: "football-science-tracking-candidate-stage-run-v1",
      benchmarkOnly: true,
      provider: { id: provider.id, version: provider.version },
      result: { artifactSha256: fingerprint.repeat(64), payload: artifact },
      execution: { wallTimeMs: 100, realTimeFactor: 0.05, exitCode: 0 },
    },
    ...overrides,
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
  expect(calls[2].sourceArtifactId).toBe("ca11da7e-0000-0000-0000-000000000001");
  expect(calls[3].request.trajectories).toEqual(calls[2].request.trajectories);

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
});
