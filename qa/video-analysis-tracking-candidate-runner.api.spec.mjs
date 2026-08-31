import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifestValue(overrides = {}) {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: "candidate-player-detector",
    providerVersion: "0.1.0",
    displayName: "Candidate Player Detector",
    stage: "detection",
    priority: 10,
    capabilities: ["detect:player"],
    approval: {
      status: "candidate",
      reviewedAt: "2026-08-31",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: {
      repository: "https://github.com/footballscience/candidate-player-detector",
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: "https://github.com/footballscience/candidate-player-detector/blob/main/LICENSE",
    },
    models: [{
      id: "candidate-player-weights",
      sha256: "c".repeat(64),
      bytes: 1024,
      license: "Apache-2.0",
      sourceUrl: "https://models.footballscience.test/candidate-player.bin",
      provenance: {
        modelCardUrl: "https://models.footballscience.test/candidate-player.html",
        trainingDataReviewed: true,
        datasets: [{
          id: "reviewed-football-detection-data",
          version: "1.0",
          usage: "finetuning",
          sourceUrl: "https://datasets.footballscience.test/detection",
          terms: "research-approved",
          termsUrl: "https://datasets.footballscience.test/detection/terms",
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: "d".repeat(64),
      device: "cpu",
      runtimeMode: "native-stage-process-v1",
      cpuThreads: 8,
      sampleFps: 12.5,
      modelResident: false,
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
    },
    ...overrides,
  };
}

async function installCandidate(registryRoot, overrides = {}) {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidence = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const registry = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs",
  ));
  const runtime = Buffer.from("candidate-native-runtime-fixture");
  const model = Buffer.from("candidate-model-fixture");
  const candidate = manifestValue(overrides);
  candidate.runtime = { ...candidate.runtime, providerSha256: sha256(runtime) };
  candidate.models = candidate.models.map((entry) => ({
    ...entry,
    sha256: sha256(model),
    bytes: model.byteLength,
  }));
  const manifest = contract.normalizeTrackingProviderManifest(candidate);
  const providerDir = path.join(registryRoot, `${manifest.providerId}-${manifest.providerVersion}`);
  await fs.mkdir(providerDir, { recursive: true });
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await fs.writeFile(path.join(providerDir, "manifest.json"), manifestBytes);
  await fs.writeFile(path.join(providerDir, "runtime.bin"), runtime);
  await fs.writeFile(path.join(providerDir, "model.bin"), model);
  const installation = {
    schemaVersion: 1,
    protocol: registry.TRACKING_CANDIDATE_INSTALLATION_PROTOCOL,
    provider: {
      id: manifest.providerId,
      version: manifest.providerVersion,
      fingerprintSha256: evidence.trackingProviderFingerprint(manifest),
      executionFingerprintSha256: evidence.trackingProviderExecutionFingerprint(manifest),
    },
    files: {
      manifest: { path: "manifest.json", bytes: manifestBytes.byteLength, sha256: sha256(manifestBytes) },
      runtime: { path: "runtime.bin", bytes: runtime.byteLength, sha256: sha256(runtime) },
      models: [{ id: manifest.models[0].id, path: "model.bin", bytes: model.byteLength, sha256: sha256(model) }],
    },
  };
  await fs.writeFile(path.join(providerDir, "installation.json"), JSON.stringify(installation));
  return { providerDir, manifest, installation, runtime, model };
}

function stageRequest() {
  return {
    sourceFingerprint: "f".repeat(64),
    range: { startMs: 0, endMs: 1000 },
  };
}

async function stageOutput(provider, request) {
  const validator = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const evidence = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: {
      id: provider.providerId,
      version: provider.providerVersion,
      fingerprintSha256: evidence.trackingProviderFingerprint(provider),
    },
    stage: "detection",
    capabilities: ["detect:player"],
    sourceFingerprint: request.sourceFingerprint,
    requestFingerprint: validator.trackingStageRequestFingerprint(provider, request),
    range: { ...request.range },
    payload: {
      observations: [{
        id: "observation-1",
        atMs: 0,
        frameIndex: 0,
        entityType: "player",
        box: { left: 0.1, top: 0.2, width: 0.1, height: 0.3 },
        confidence: 0.96,
      }],
    },
  };
}

test("candidate registry exposes bounded benchmark-only metadata and exact private artifacts", async () => {
  const candidateRegistry = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs",
  ));
  const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fs-candidate-registry-"));
  try {
    const installed = await installCandidate(registryRoot);
    const registry = candidateRegistry.createTrackingCandidateProviderRegistry({ rootDir: registryRoot });
    const snapshot = await registry.inspect();
    expect(snapshot).toMatchObject({
      protocol: "football-science-tracking-candidate-registry-v1",
      status: "ready",
      providerCount: 1,
      readyCount: 1,
      blockedCount: 0,
      providers: [{
        id: "candidate-player-detector",
        status: "candidate-ready",
        benchmarkOnly: true,
        executionAvailable: false,
      }],
    });
    expect(JSON.stringify(snapshot)).not.toContain(registryRoot);
    expect(JSON.stringify(snapshot)).not.toContain("model.bin");
    expect(JSON.stringify(snapshot)).not.toContain("sourceUrl");
    await expect(registry.resolve("candidate-player-detector", "0.1.0")).resolves.toMatchObject({
      provider: { approval: { status: "candidate" }, benchmark: { status: "not-run" } },
      providerDir: await fs.realpath(installed.providerDir),
      runtime: { sha256: sha256(installed.runtime) },
      models: [{ sha256: sha256(installed.model) }],
    });
  } finally {
    await fs.rm(registryRoot, { recursive: true, force: true });
  }
});

test("candidate registry rejects production-approved, networked and changed candidates", async () => {
  const candidateRegistry = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs",
  ));
  const roots = await Promise.all([0, 1, 2].map(() => fs.mkdtemp(path.join(os.tmpdir(), "fs-candidate-policy-"))));
  try {
    await installCandidate(roots[0], {
      approval: { ...manifestValue().approval, status: "approved-local-optional" },
    });
    await installCandidate(roots[1], {
      approval: { ...manifestValue().approval, networkAtInference: true },
    });
    const changed = await installCandidate(roots[2]);
    await fs.writeFile(path.join(changed.providerDir, changed.installation.files.runtime.path), "changed-runtime");
    const snapshots = await Promise.all(roots.map((root) => (
      candidateRegistry.createTrackingCandidateProviderRegistry({ rootDir: root }).inspect()
    )));
    expect(snapshots[0].providers[0]).toMatchObject({
      status: "blocked",
      reasons: ["candidate-status-required"],
    });
    expect(snapshots[1].providers[0]).toMatchObject({
      status: "blocked",
      reasons: ["inference-network-enabled"],
    });
    expect(snapshots[2].providers[0]).toMatchObject({
      status: "blocked",
      reasons: ["candidate-artifact-size-mismatch"],
    });
  } finally {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  }
});

test("candidate runner accepts sandboxed benchmark output but activated mode rejects it", async () => {
  const runnerService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-runner.mjs",
  ));
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const provider = contract.normalizeTrackingProviderManifest(manifestValue());
  const request = stageRequest();
  const output = await stageOutput(provider, request);
  const installation = {
    provider,
    providerDir: "/private/candidate",
    runtime: { filePath: "/private/candidate/runtime.bin", bytes: 1, sha256: provider.runtime.providerSha256 },
    models: [],
  };
  const executor = {
    info: () => ({ protocol: "football-science-tracking-stage-execution-v1" }),
    inspect: async () => ({
      ready: true,
      protocol: "football-science-tracking-stage-execution-v1",
      isolation: "test-network-denied-v1",
      reasons: [],
    }),
    execute: async () => ({
      output: Buffer.from(JSON.stringify(output)),
      telemetry: {
        protocol: "football-science-tracking-stage-execution-v1",
        isolation: "test-network-denied-v1",
        wallTimeMs: 50,
        outputBytes: 512,
        stdoutBytes: 0,
        stderrBytes: 0,
        exitCode: 0,
      },
    }),
  };
  const registry = { resolve: async () => installation };
  const candidateRunner = runnerService.createTrackingStageRunner({
    registry,
    executor,
    executionMode: "benchmark-candidate",
  });
  const snapshot = await candidateRunner.decorateRegistry({
    providers: [{ id: provider.providerId, version: provider.providerVersion, status: "candidate-ready", available: true }],
  });
  expect(snapshot.providers[0]).toMatchObject({
    executionAvailable: true,
    benchmarkOnly: true,
    activationStatus: "benchmark-only",
  });
  const input = {
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    request,
    source: { filePath: "/private/match.mp4", sha256: request.sourceFingerprint },
  };
  const candidateResult = await candidateRunner.run(input, { evidenceId: "candidate-evidence-1" });
  expect(candidateResult).toMatchObject({
    benchmarkOnly: true,
    artifact: { stage: "detection", payload: { observations: [{ entityType: "player" }] } },
    evidence: {
      protocol: "football-science-tracking-candidate-stage-run-v1",
      id: "candidate-evidence-1",
      benchmarkOnly: true,
      source: { fingerprintSha256: request.sourceFingerprint },
      execution: { wallTimeMs: 50, realTimeFactor: 0.05 },
    },
  });
  const candidateEvidence = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-stage-run-artifact.mjs",
  ));
  expect(candidateEvidence.validateTrackingCandidateStageRunArtifact(
    candidateResult.evidence,
    provider,
  )).toEqual(candidateResult.evidence);
  expect(JSON.stringify(candidateResult.evidence)).not.toMatch(/\/private\/|sourceUrl|repository|embedding/i);

  const tamperedEvidence = structuredClone(candidateResult.evidence);
  tamperedEvidence.result.payload.payload.observations[0].confidence = 0.2;
  expect(() => candidateEvidence.validateTrackingCandidateStageRunArtifact(
    tamperedEvidence,
    provider,
  )).toThrow(/does not match|fingerprint/i);
  const activatedRunner = runnerService.createTrackingStageRunner({ registry, executor });
  await expect(activatedRunner.run(input)).rejects.toMatchObject({
    code: "TRACKING_STAGE_PROVIDER_NOT_READY",
  });
});
