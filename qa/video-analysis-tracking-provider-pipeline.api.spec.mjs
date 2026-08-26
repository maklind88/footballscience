import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function provider(stage, capabilities, overrides = {}) {
  const id = overrides.providerId || `${stage}-provider`;
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: id,
    providerVersion: "1.0.0",
    displayName: `${stage} provider`,
    stage,
    priority: overrides.priority || 10,
    capabilities,
    approval: {
      status: "approved-local-optional",
      reviewedAt: "2026-08-25",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
      ...overrides.approval,
    },
    upstream: {
      repository: `https://github.com/footballscience/${id}`,
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: `https://github.com/footballscience/${id}/blob/main/LICENSE`,
    },
    models: stage === "association" ? [] : [{
      id: `${id}-weights`,
      sha256: "c".repeat(64),
      bytes: 1024,
      license: "Apache-2.0",
      sourceUrl: `https://models.footballscience.test/${id}.bin`,
      provenance: {
        modelCardUrl: `https://models.footballscience.test/${id}.html`,
        trainingDataReviewed: true,
        datasets: [{
          id: `${id}-training-data`,
          version: "1.0",
          usage: "pretraining",
          sourceUrl: `https://datasets.footballscience.test/${id}`,
          terms: "Apache-2.0",
          termsUrl: `https://datasets.footballscience.test/${id}/terms`,
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: "e".repeat(64),
      maxFrames: 30_000,
      maxDurationMs: 1_200_000,
      maxWallTimeMs: 7_200_000,
      maxMemoryMb: 8192,
      maxOutputBytes: 64 * 1024 * 1024,
      maxConcurrentJobs: 1,
    },
    benchmark: {
      status: "not-run",
      evaluatorVersion: "not-run",
      profileId: "not-run",
      ...overrides.benchmark,
    },
  };
}

const referenceMetrics = Object.freeze({ HOTA: 0.9, DetA: 0.94, AssA: 0.9, LocA: 0.92, MOTA: 0.91, IDF1: 0.93 });
const referenceThresholds = Object.freeze({
  minHota: 0.65,
  minDetA: 0.75,
  minAssA: 0.65,
  minLocA: 0.75,
  minMota: 0.8,
  minIdf1: 0.85,
});

function referenceEvidence(index = 0) {
  const hashCharacter = ((index % 6) + 10).toString(16);
  return {
    evaluator: "TrackEval",
    status: "verified",
    reportSha256: hashCharacter.repeat(64),
    metrics: { ...referenceMetrics },
    requiredThresholds: { ...referenceThresholds },
    passed: true,
    crossValidation: { passed: true, tolerance: 1e-9, deltas: { MOTA: 0, IDF1: 0 } },
  };
}

function multiObjectCase(index = 0) {
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "multi-object",
    benchmarkId: `real-match-${index + 1}`,
    sourceFingerprint: `${index + 1}`.repeat(64),
    profile: { id: "football-scene-pilot-v1" },
    range: { startMs: 0, endMs: 120_000, durationMs: 120_000 },
    evidence: {
      kind: "real-match",
      reviewProtocol: "football-ground-truth-review-v1",
      attested: true,
      durationMs: 120_000,
    },
    metrics: {
      playerPrecision: 0.95,
      playerRecall: 0.95,
      ballPrecision: 0.9,
      ballRecall: 0.9,
      refereePrecision: 0.9,
      refereeRecall: 0.9,
      mota: 0.91,
      identitySwitchesPerMinute: 0.5,
      fragmentationsPerMinute: 1,
      identityF1: 0.93,
      playerIdentityAccuracy: 0.94,
      teamAccuracy: 0.98,
      shirtNumberAccuracy: 0.95,
      processingMs: 90_000,
      realtimeFactor: 0.75,
    },
    thresholds: {
      minPlayerPrecision: 0.9,
      minPlayerRecall: 0.9,
      minBallPrecision: 0.8,
      minBallRecall: 0.8,
      minRefereePrecision: 0.8,
      minRefereeRecall: 0.8,
      minMota: 0.8,
      maxIdentitySwitchesPerMinute: 2,
      maxFragmentationsPerMinute: 4,
      minIdentityF1: 0.85,
      minPlayerIdentityAccuracy: 0.9,
      minTeamAccuracy: 0.95,
      minShirtNumberAccuracy: 0.9,
      maxRealtimeFactor: 1,
    },
    referenceValidation: referenceEvidence(index),
    verdict: { passed: true, failureCount: 0, failures: [] },
  };
}

function multiObjectReport() {
  const cases = Array.from({ length: 5 }, (_, index) => multiObjectCase(index));
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "multi-object-suite",
    suiteId: "provider-real-match-suite",
    summary: { passed: true, caseCount: cases.length, realMatchCaseCount: cases.length, realMatchDurationMs: 600_000 },
    referenceValidation: referenceEvidence(20),
    cases,
  };
}

function selectedObjectCase(index = 0) {
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "selected-object",
    benchmarkId: `selected-real-match-${index + 1}`,
    sourceFingerprint: `${index + 1}`.repeat(64),
    profile: { id: "selected-player-pilot-v1" },
    range: { startMs: 0, endMs: 120_000, durationMs: 120_000 },
    evidence: {
      kind: "real-match",
      reviewProtocol: "football-ground-truth-review-v1",
      attested: true,
      durationMs: 120_000,
    },
    metrics: {
      visibleCoverage: 0.98,
      meanIou: 0.8,
      continuityBreaks: 1,
      maxGapMs: 500,
      processingMs: 90_000,
      realtimeFactor: 0.75,
    },
    thresholds: {
      minVisibleCoverage: 0.95,
      minMeanIou: 0.65,
      maxContinuityBreaks: 2,
      maxGapMs: 1000,
      maxRealtimeFactor: 1,
    },
    verdict: { passed: true, failureCount: 0, failures: [] },
  };
}

function selectedObjectReport() {
  const cases = Array.from({ length: 5 }, (_, index) => selectedObjectCase(index));
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "selected-object-suite",
    suiteId: "selected-provider-real-match-suite",
    summary: { passed: true, caseCount: cases.length, realMatchCaseCount: cases.length, realMatchDurationMs: 600_000 },
    cases,
  };
}

function reportForStage(stage = "") {
  return stage === "segmentation" ? selectedObjectReport() : multiObjectReport();
}

function approveProvider(contract, evidenceService, manifest, report = reportForStage(manifest.stage)) {
  const candidate = contract.normalizeTrackingProviderManifest(manifest);
  const boundReport = bindProviderRunEvidence(evidenceService, candidate, report);
  const evidence = evidenceService.createTrackingProviderEvidence(candidate, boundReport);
  manifest.benchmark = evidenceService.trackingProviderBenchmarkFromEvidence(evidence);
  return { manifest, evidence, report: boundReport };
}

function bindProviderRunEvidence(evidenceService, manifest, report) {
  return {
    ...report,
    providerRunEvidence: {
      protocol: "football-science-tracking-provider-run-evidence-v1",
      provider: {
        providerId: manifest.providerId,
        providerVersion: manifest.providerVersion,
        protocol: manifest.protocol,
        stage: manifest.stage,
        capabilities: [...manifest.capabilities],
        executionFingerprintSha256: evidenceService.trackingProviderExecutionFingerprint(manifest),
      },
      groundTruthSuiteId: "real-match-ground-truth-r1",
      groundTruthSuiteSha256: "1".repeat(64),
      providerRunSuiteId: `${manifest.providerId}-runs`,
      providerRunSuiteSha256: "2".repeat(64),
      runIds: Array.from({ length: 5 }, (_, index) => `${manifest.providerId}-run-${index + 1}`),
    },
  };
}

function stageRequest(overrides = {}) {
  return {
    sourceFingerprint: "f".repeat(64),
    range: { startMs: 0, endMs: 2000 },
    ...overrides,
  };
}

function stageResult(manifest, evidenceService, artifacts, request, payload, overrides = {}) {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: {
      id: manifest.providerId,
      version: manifest.providerVersion,
      fingerprintSha256: evidenceService.trackingProviderFingerprint(manifest),
    },
    stage: manifest.stage,
    capabilities: [...manifest.capabilities],
    sourceFingerprint: "f".repeat(64),
    requestFingerprint: artifacts.trackingStageRequestFingerprint(manifest, request),
    range: { startMs: 0, endMs: 2000 },
    payload,
    ...overrides,
  };
}

test("tracking provider contract accepts only pinned bounded offline providers", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const approved = approveProvider(
    contract,
    evidenceService,
    provider("segmentation", ["segment:selected-object", "propagate:selected-object"]),
  );
  const normalized = contract.normalizeTrackingProviderManifest(approved.manifest);

  expect(normalized).toMatchObject({
    providerId: "segmentation-provider",
    stage: "segmentation",
    runtime: {
      providerSha256: "e".repeat(64),
      maxWallTimeMs: 7_200_000,
      maxOutputBytes: 64 * 1024 * 1024,
      maxConcurrentJobs: 1,
    },
  });
  expect(contract.trackingProviderReadiness(approved.manifest, {
    evidence: approved.evidence,
    report: approved.report,
  })).toMatchObject({ ready: true, reasons: [] });

  const missingRuntimeIntegrity = provider("detection", ["detect:player"]);
  delete missingRuntimeIntegrity.runtime.providerSha256;
  expect(() => contract.normalizeTrackingProviderManifest(missingRuntimeIntegrity)).toThrow(/runtime checksum/i);
});

test("tracking provider remains blocked without approval, offline inference and real evidence", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const manifest = provider("reidentification", ["reidentify:player"], {
    approval: { status: "candidate", networkAtInference: true, licenseReviewed: false },
    benchmark: {
      status: "failed",
      evaluatorVersion: "tracking-benchmark-v1",
      profileId: "football-scene-pilot-v1",
      reportSha256: "d".repeat(64),
      caseCount: 1,
      realMatchCaseCount: 1,
      capabilities: ["reidentify:player"],
    },
  });
  const readiness = contract.trackingProviderReadiness(manifest);

  expect(readiness.ready).toBe(false);
  expect(readiness.reasons).toEqual(expect.arrayContaining([
    "provider-not-approved",
    "inference-network-enabled",
    "licence-not-reviewed",
    "benchmark-not-passed",
  ]));
});

test("learned providers require reviewed training-data and identity-use provenance", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const manifest = provider("reidentification", ["reidentify:player"]);
  manifest.models[0].provenance.trainingDataReviewed = false;
  manifest.models[0].provenance.datasets[0].rightsReviewed = false;
  manifest.models[0].provenance.datasets[0].identityUseReviewed = false;
  const approved = approveProvider(contract, evidenceService, manifest);
  expect(contract.trackingProviderReadiness(approved.manifest, {
    evidence: approved.evidence,
    report: approved.report,
  }).reasons).toEqual(expect.arrayContaining([
    "model-training-data-not-reviewed",
    "model-data-rights-not-reviewed",
    "model-identity-use-not-reviewed",
  ]));

  const missingDataset = provider("detection", ["detect:player"]);
  missingDataset.models[0].provenance.datasets = [];
  expect(() => contract.normalizeTrackingProviderManifest(missingDataset)).toThrow(/training-data records/i);
});

test("tracking provider rejects capabilities from another pipeline stage", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  expect(() => contract.normalizeTrackingProviderManifest(
    provider("detection", ["reidentify:player"]),
  )).toThrow(/does not belong/i);
});

test("multi-object providers require an official TrackEval reference report", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const approved = approveProvider(
    contract,
    evidenceService,
    provider("association", ["associate:multi-object"]),
  );
  approved.manifest.benchmark.referenceEvaluator = "";
  approved.manifest.benchmark.referenceReportSha256 = "";
  approved.manifest.benchmark.referenceMetrics = [];
  const readiness = contract.trackingProviderReadiness(approved.manifest, {
    evidence: approved.evidence,
    report: approved.report,
  });

  expect(readiness.ready).toBe(false);
  expect(readiness.reasons).toContain("trackeval-reference-missing");

  approved.manifest.benchmark.referenceEvaluator = "trackeval";
  approved.manifest.benchmark.referenceReportSha256 = approved.evidence.benchmark.referenceReportSha256;
  approved.manifest.benchmark.referenceMetrics = ["HOTA", "MOTA", "IDF1"];
  expect(contract.trackingProviderReadiness(approved.manifest, {
    evidence: approved.evidence,
    report: approved.report,
  }).reasons).toContain("trackeval-reference-missing");
});

test("tracking pipeline plans all required stages and fails closed on missing evidence", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const requiredCapabilities = [
    "detect:player",
    "detect:ball",
    "detect:referee",
    "segment:selected-object",
    "associate:multi-object",
    "reidentify:player",
    "classify:team",
  ];
  const candidates = [
    provider("detection", ["detect:player", "detect:ball", "detect:referee"]),
    provider("segmentation", ["segment:selected-object"]),
    provider("association", ["associate:multi-object"]),
    provider("reidentification", ["reidentify:player"]),
    provider("classification", ["classify:team"]),
  ];
  const approved = candidates.map((manifest) => approveProvider(contract, evidenceService, manifest));
  const providers = approved.map((entry) => entry.manifest);
  const evidenceByProviderId = Object.fromEntries(approved.map((entry) => [entry.manifest.providerId, entry.evidence]));
  const reportByProviderId = Object.fromEntries(approved.map((entry) => [entry.manifest.providerId, entry.report]));
  providers[4].benchmark.capabilities = [];
  const blocked = contract.buildTrackingPipelinePlan(providers, {
    requiredCapabilities,
    evidenceByProviderId,
    reportByProviderId,
  });

  expect(blocked.ready).toBe(false);
  expect(blocked.missingCapabilities).toEqual(["classify:team"]);
  expect(blocked.blockedProviders).toEqual([expect.objectContaining({
    providerId: "classification-provider",
    reasons: expect.arrayContaining(["benchmark-evidence-invalid", "capability-evidence-missing"]),
  })]);

  providers[4].benchmark = evidenceService.trackingProviderBenchmarkFromEvidence(approved[4].evidence);
  const ready = contract.buildTrackingPipelinePlan(providers, {
    requiredCapabilities,
    evidenceByProviderId,
    reportByProviderId,
  });
  expect(ready).toMatchObject({ ready: true, missingCapabilities: [] });
  expect(ready.providers).toHaveLength(5);
  expect(JSON.stringify(ready)).not.toMatch(/repository|sourceUrl|licenseUrl|models/i);
});

test("detection result boundary separates player, ball and referee capabilities", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const artifacts = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const manifest = contract.normalizeTrackingProviderManifest(provider(
    "detection",
    ["detect:player", "detect:ball", "detect:referee"],
  ));
  const request = stageRequest();
  const result = stageResult(manifest, evidenceService, artifacts, request, { observations: [
    { id: "player-1", atMs: 0, frameIndex: 0, entityType: "player", box: { left: 0.1, top: 0.2, width: 0.08, height: 0.3 }, confidence: 0.96 },
    { id: "ball-1", atMs: 0, frameIndex: 0, entityType: "ball", box: { left: 0.5, top: 0.6, width: 0.02, height: 0.02 }, confidence: 0.88 },
    { id: "referee-1", atMs: 0, frameIndex: 0, entityType: "referee", box: { left: 0.7, top: 0.2, width: 0.08, height: 0.3 }, confidence: 0.91 },
  ] });
  const validated = artifacts.validateTrackingStageArtifact(result, manifest, request);
  expect(validated.payload.observations.map((entry) => entry.entityType)).toEqual(["player", "ball", "referee"]);
  expect(Object.isFrozen(validated.payload.observations)).toBe(true);
  expect(artifacts.parseTrackingStageArtifact(
    JSON.stringify(result),
    manifest,
    request,
  ).payload.observations).toHaveLength(3);
  expect(() => artifacts.parseTrackingStageArtifact(
    JSON.stringify(result).padEnd(4096, " "),
    manifest,
    request,
    { maxBytes: 1024 },
  )).toThrow(/output limit/i);

  const identityLeak = structuredClone(result);
  identityLeak.payload.observations[0].playerId = "player-8";
  expect(() => artifacts.validateTrackingStageArtifact(identityLeak, manifest, request)).toThrow(/unsupported field/i);

  const playerOnly = contract.normalizeTrackingProviderManifest(provider("detection", ["detect:player"]));
  const unauthorizedBall = stageResult(playerOnly, evidenceService, artifacts, request, {
    observations: [result.payload.observations[1]],
  });
  expect(() => artifacts.validateTrackingStageArtifact(unauthorizedBall, playerOnly, request)).toThrow(/not approved to detect ball/i);

  const wrongSource = structuredClone(result);
  wrongSource.sourceFingerprint = "a".repeat(64);
  expect(() => artifacts.validateTrackingStageArtifact(wrongSource, manifest, request)).toThrow(/another video source/i);
});

test("association result boundary rejects unknown and multiply assigned observations", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const artifacts = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const manifest = contract.normalizeTrackingProviderManifest(provider("association", ["associate:multi-object"]));
  const request = stageRequest({ observations: [
    { id: "p-1-a", entityType: "player" },
    { id: "p-1-b", entityType: "player" },
    { id: "ball-a", entityType: "ball" },
  ] });
  const result = stageResult(manifest, evidenceService, artifacts, request, { trajectories: [
    { id: "trajectory-player", entityType: "player", observationIds: ["p-1-a", "p-1-b"], confidence: 0.93, discontinuitiesMs: [] },
    { id: "trajectory-ball", entityType: "ball", observationIds: ["ball-a"], confidence: 0.82, discontinuitiesMs: [1000] },
  ] });
  expect(artifacts.validateTrackingStageArtifact(result, manifest, request).payload.trajectories).toHaveLength(2);

  const duplicated = structuredClone(result);
  duplicated.payload.trajectories[1].observationIds = ["p-1-b"];
  duplicated.payload.trajectories[1].entityType = "player";
  expect(() => artifacts.validateTrackingStageArtifact(duplicated, manifest, request)).toThrow(/assigned twice/i);

  const unknown = structuredClone(result);
  unknown.payload.trajectories[0].observationIds = ["missing-observation"];
  expect(() => artifacts.validateTrackingStageArtifact(unknown, manifest, request)).toThrow(/unknown/i);

  const changedInputs = structuredClone(request);
  changedInputs.observations.reverse();
  expect(() => artifacts.validateTrackingStageArtifact(result, manifest, changedInputs)).toThrow(
    /different stage inputs/i,
  );

  const forgedFingerprint = structuredClone(result);
  forgedFingerprint.requestFingerprint = "0".repeat(64);
  expect(() => artifacts.validateTrackingStageArtifact(forgedFingerprint, manifest, request)).toThrow(
    /different stage inputs/i,
  );

  expect(() => artifacts.trackingStageRequestFingerprint(manifest, {
    ...request,
    sourcePath: "/private/match.mp4",
  })).toThrow(/unsupported field/i);
});

test("re-identification boundary returns opaque links and activation remains fail-closed", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const artifacts = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const candidate = provider("reidentification", ["reidentify:player"]);
  const manifest = contract.normalizeTrackingProviderManifest(candidate);
  const request = stageRequest({ trajectories: [
    { id: "trajectory-player", entityType: "player" },
    { id: "trajectory-ball", entityType: "ball" },
  ] });
  const result = stageResult(manifest, evidenceService, artifacts, request, { identities: [
    { trajectoryId: "trajectory-player", identityKey: "local-cluster-8", confidence: 0.91 },
  ] });
  expect(artifacts.validateTrackingStageArtifact(result, manifest, request).payload.identities[0]).toEqual({
    trajectoryId: "trajectory-player",
    identityKey: "local-cluster-8",
    confidence: 0.91,
  });
  expect(() => artifacts.validateActivatedTrackingStageArtifact(result, candidate, request)).toThrow(/not activated/i);

  const embeddingLeak = structuredClone(result);
  embeddingLeak.payload.identities[0].embedding = [0.1, 0.2];
  expect(() => artifacts.validateTrackingStageArtifact(embeddingLeak, manifest, request)).toThrow(/unsupported field/i);
  const ballIdentity = structuredClone(result);
  ballIdentity.payload.identities[0].trajectoryId = "trajectory-ball";
  expect(() => artifacts.validateTrackingStageArtifact(ballIdentity, manifest, request)).toThrow(/player trajectory/i);

  const approved = approveProvider(contract, evidenceService, candidate);
  const activatedResult = stageResult(
    approved.manifest,
    evidenceService,
    artifacts,
    request,
    result.payload,
  );
  expect(artifacts.validateActivatedTrackingStageArtifact(
    activatedResult,
    approved.manifest,
    request,
    { evidence: approved.evidence, report: approved.report },
  ).payload.identities).toHaveLength(1);
});

test("team and shirt classification boundary cannot assign players or classify non-players", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const artifacts = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const manifest = contract.normalizeTrackingProviderManifest(provider(
    "classification",
    ["classify:team", "classify:shirt-number"],
  ));
  const request = stageRequest({ trajectories: [
    { id: "trajectory-player", entityType: "player" },
    { id: "trajectory-referee", entityType: "referee" },
  ] });
  const result = stageResult(manifest, evidenceService, artifacts, request, { classifications: [{
    trajectoryId: "trajectory-player",
    teamSide: "home",
    teamConfidence: 0.97,
    shirtNumber: "8",
    shirtNumberConfidence: 0.9,
  }] });
  expect(artifacts.validateTrackingStageArtifact(result, manifest, request).payload.classifications[0]).toMatchObject({
    teamSide: "home",
    shirtNumber: "8",
  });

  const identityLeak = structuredClone(result);
  identityLeak.payload.classifications[0].playerId = "player-8";
  expect(() => artifacts.validateTrackingStageArtifact(identityLeak, manifest, request)).toThrow(/unsupported field/i);
  const refereeClassification = structuredClone(result);
  refereeClassification.payload.classifications[0].trajectoryId = "trajectory-referee";
  expect(() => artifacts.validateTrackingStageArtifact(refereeClassification, manifest, request)).toThrow(/player trajectory/i);
});

test("segmentation stage result reuses the strict selected-object track boundary", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const artifacts = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const manifest = contract.normalizeTrackingProviderManifest(provider(
    "segmentation",
    ["segment:selected-object", "propagate:selected-object"],
  ));
  const prompt = {
    id: "prompt-player-8",
    startMs: 0,
    endMs: 2000,
    promptAtMs: 0,
    entityType: "player",
    box: { left: 0.1, top: 0.2, width: 0.08, height: 0.3 },
  };
  const request = stageRequest({ prompts: [prompt] });
  const result = stageResult(manifest, evidenceService, artifacts, request, { tracks: [{
    id: "track-player-8",
    promptId: prompt.id,
    entityType: "player",
    status: "review",
    startMs: 0,
    endMs: 2000,
    confidence: 0.9,
    segments: [{ id: "segment-1", startMs: 0, endMs: 2000, points: [
      { atMs: 0, x: 0.2, y: 0.4, width: 0.08, height: 0.3, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 2000, x: 0.3, y: 0.4, width: 0.08, height: 0.3, confidence: 0.9, identityConfidence: 0.9 },
    ] }],
  }] });
  const validated = artifacts.validateTrackingStageArtifact(
    result,
    manifest,
    request,
  );
  expect(validated.payload.tracks).toHaveLength(1);
  expect(validated.payload.tracks[0].metadata.promptId).toBe(prompt.id);
});

test("provider evidence binds the exact report, source, model and capability set", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const approved = approveProvider(
    contract,
    evidenceService,
    provider("detection", ["detect:player", "detect:ball", "detect:referee"]),
  );
  const normalized = contract.normalizeTrackingProviderManifest(approved.manifest);
  expect(evidenceService.verifyTrackingProviderEvidence(
    normalized,
    approved.evidence,
    approved.report,
  )).toMatchObject({ verified: true, evidenceSha256: approved.evidence.evidenceSha256 });
  expect(approved.evidence.benchmark).toMatchObject({
    providerExecutionFingerprintSha256: evidenceService.trackingProviderExecutionFingerprint(normalized),
    groundTruthSuiteSha256: "1".repeat(64),
    providerRunSuiteSha256: "2".repeat(64),
    providerRunCount: 5,
  });

  const changedReport = structuredClone(approved.report);
  changedReport.cases[0].metrics.playerRecall = 0.94;
  expect(() => evidenceService.verifyTrackingProviderEvidence(
    normalized,
    approved.evidence,
    changedReport,
  )).toThrow(/report does not match/i);

  const changedRawRun = structuredClone(approved.report);
  changedRawRun.providerRunEvidence.provider.executionFingerprintSha256 = "0".repeat(64);
  expect(() => evidenceService.createTrackingProviderEvidence(
    normalized,
    changedRawRun,
  )).toThrow(/raw-run evidence/i);

  const selfConsistentForgery = structuredClone(approved.evidence);
  selfConsistentForgery.benchmark.capabilityEvidence[0].metrics[0].worst = 1;
  selfConsistentForgery.evidenceSha256 = evidenceService.trackingProviderEvidenceHash(selfConsistentForgery);
  expect(() => evidenceService.verifyTrackingProviderEvidence(
    normalized,
    selfConsistentForgery,
    approved.report,
  )).toThrow(/cannot be reproduced/i);

  const changedProvider = structuredClone(approved.manifest);
  changedProvider.models[0].sha256 = "f".repeat(64);
  expect(() => evidenceService.verifyTrackingProviderEvidence(
    contract.normalizeTrackingProviderManifest(changedProvider),
    approved.evidence,
    approved.report,
  )).toThrow(/installed provider artifacts/i);

  const changedRuntime = structuredClone(approved.manifest);
  changedRuntime.runtime.providerSha256 = "d".repeat(64);
  expect(() => evidenceService.verifyTrackingProviderEvidence(
    contract.normalizeTrackingProviderManifest(changedRuntime),
    approved.evidence,
    approved.report,
  )).toThrow(/installed provider artifacts/i);
});

test("provider evidence requires ten attested real-match minutes and remains metadata-only", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const candidate = contract.normalizeTrackingProviderManifest(
    provider("classification", ["classify:team"]),
  );
  const shortReport = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  shortReport.cases.pop();
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, shortReport)).toThrow(/10 minutes/i);

  const overlappingReport = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  overlappingReport.cases.forEach((entry) => {
    entry.sourceFingerprint = "a".repeat(64);
    entry.range = { startMs: 0, endMs: 120_000, durationMs: 120_000 };
  });
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, overlappingReport)).toThrow(/10 minutes/i);

  const forgedDurationReport = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  forgedDurationReport.cases[0].evidence.durationMs = 240_000;
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, forgedDurationReport)).toThrow(/real-match evidence/i);

  const syntheticReport = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  syntheticReport.cases[0].evidence = {
    kind: "synthetic-or-unattested",
    reviewProtocol: "",
    attested: false,
    durationMs: 120_000,
  };
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, syntheticReport)).toThrow(/real-match evidence/i);

  const unsafeReport = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  unsafeReport.sourcePath = "/private/match.mp4";
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, unsafeReport)).toThrow(/metadata-only/i);
});

test("provider evidence enforces the workstation real-time policy", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const candidate = contract.normalizeTrackingProviderManifest(
    provider("segmentation", ["segment:selected-object", "propagate:selected-object"]),
  );

  const missingMetric = bindProviderRunEvidence(evidenceService, candidate, selectedObjectReport());
  delete missingMetric.cases[0].metrics.realtimeFactor;
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, missingMetric)).toThrow(
    /metrics\.realtimeFactor/i,
  );

  const weakenedGate = bindProviderRunEvidence(evidenceService, candidate, selectedObjectReport());
  weakenedGate.cases.forEach((entry) => { entry.thresholds.maxRealtimeFactor = 10; });
  weakenedGate.cases[0].metrics.realtimeFactor = 7.4;
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, weakenedGate)).toThrow(
    /real-time policy/i,
  );

  const evidence = evidenceService.createTrackingProviderEvidence(
    candidate,
    bindProviderRunEvidence(evidenceService, candidate, selectedObjectReport()),
  );
  expect(evidence.benchmark.performanceEvidence).toEqual({
    metric: "realtimeFactor",
    direction: "maximum",
    required: 1,
    worst: 0.75,
  });
});

test("shirt-number providers need their own measured threshold", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const candidate = contract.normalizeTrackingProviderManifest(
    provider("classification", ["classify:shirt-number"]),
  );
  const missingGate = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  missingGate.cases.forEach((entry) => { entry.thresholds.minShirtNumberAccuracy = null; });
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, missingGate)).toThrow(/minShirtNumberAccuracy/);

  const failedGate = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  failedGate.cases[0].metrics.shirtNumberAccuracy = 0.8;
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, failedGate)).toThrow(/does not pass/i);

  const weakenedGate = bindProviderRunEvidence(evidenceService, candidate, multiObjectReport());
  weakenedGate.cases.forEach((entry) => { entry.thresholds.minShirtNumberAccuracy = 0.1; });
  weakenedGate.cases[0].metrics.shirtNumberAccuracy = 0.8;
  expect(() => evidenceService.createTrackingProviderEvidence(candidate, weakenedGate)).toThrow(/does not pass/i);

  const evidence = evidenceService.createTrackingProviderEvidence(
    candidate,
    bindProviderRunEvidence(evidenceService, candidate, multiObjectReport()),
  );
  expect(Object.isFrozen(evidence.benchmark.capabilityEvidence[0].metrics)).toBe(true);
  expect(evidence.benchmark.capabilityEvidence).toEqual([
    expect.objectContaining({ capability: "classify:shirt-number" }),
  ]);
});

test("provider evidence CLI creates and verifies a private immutable artifact", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-provider-evidence-test-"));
  const manifestPath = path.join(directory, "manifest.json");
  const reportPath = path.join(directory, "report.json");
  const evidencePath = path.join(directory, "evidence.json");
  const command = path.join(rootDir, "scripts/fs-player-tracking-provider-evidence.mjs");
  const manifest = provider("classification", ["classify:team"]);
  const report = bindProviderRunEvidence(
    evidenceService,
    contract.normalizeTrackingProviderManifest(manifest),
    multiObjectReport(),
  );
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await fs.writeFile(reportPath, JSON.stringify(report));
    const created = await execFileAsync(process.execPath, [
      command,
      "--manifest", manifestPath,
      "--report", reportPath,
      "--output", evidencePath,
    ], { cwd: rootDir });
    expect(created.stdout).toContain("CREATED | classification-provider@1.0.0 | 5 real-match cases | 10.0 min");
    const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
    manifest.benchmark = evidenceService.trackingProviderBenchmarkFromEvidence(evidence);
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const verified = await execFileAsync(process.execPath, [
      command,
      "--manifest", manifestPath,
      "--report", reportPath,
      "--evidence", evidencePath,
    ], { cwd: rootDir });
    expect(verified.stdout).toContain("VERIFIED | classification-provider@1.0.0");
    expect(JSON.stringify(evidence)).not.toMatch(/private\/match|sourcePath|tracks|segments|points/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
