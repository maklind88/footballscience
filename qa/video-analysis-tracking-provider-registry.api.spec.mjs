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

function providerManifest(runtime, model) {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: "team-classifier",
    providerVersion: "1.0.0",
    displayName: "Verified Team Classifier",
    stage: "classification",
    priority: 50,
    capabilities: ["classify:team"],
    approval: {
      status: "approved-local-optional",
      reviewedAt: "2026-08-26",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: {
      repository: "https://github.com/footballscience/team-classifier",
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: "https://github.com/footballscience/team-classifier/blob/main/LICENSE",
    },
    models: [{
      id: "team-classifier-weights",
      sha256: sha256(model),
      bytes: model.length,
      license: "Apache-2.0",
      sourceUrl: "https://models.footballscience.test/team-classifier.bin",
      provenance: {
        modelCardUrl: "https://models.footballscience.test/team-classifier.html",
        trainingDataReviewed: true,
        datasets: [{
          id: "reviewed-football-team-data",
          version: "1.0",
          usage: "finetuning",
          sourceUrl: "https://datasets.footballscience.test/reviewed-team-data",
          terms: "research-approved",
          termsUrl: "https://datasets.footballscience.test/reviewed-team-data/terms",
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: sha256(runtime),
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
  };
}

function benchmarkCase(index) {
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "multi-object",
    benchmarkId: `team-classification-${index + 1}`,
    sourceFingerprint: `${index + 1}`.repeat(64),
    profile: { id: "football-scene-pilot-v1" },
    range: { startMs: 0, endMs: 120_000, durationMs: 120_000 },
    evidence: {
      kind: "real-match",
      reviewProtocol: "football-ground-truth-review-v1",
      attested: true,
      durationMs: 120_000,
    },
    metrics: { teamAccuracy: 0.98, processingMs: 90_000, realtimeFactor: 0.75 },
    thresholds: { minTeamAccuracy: 0.95, maxRealtimeFactor: 1 },
    verdict: { passed: true, failureCount: 0, failures: [] },
  };
}

function benchmarkReport(provider, executionFingerprintSha256) {
  const cases = Array.from({ length: 5 }, (_, index) => benchmarkCase(index));
  return {
    schemaVersion: 1,
    evaluatorVersion: "tracking-benchmark-v1",
    benchmarkType: "multi-object-suite",
    suiteId: "verified-team-provider-suite",
    summary: {
      passed: true,
      caseCount: cases.length,
      realMatchCaseCount: cases.length,
      realMatchDurationMs: 600_000,
    },
    providerRunEvidence: {
      protocol: "football-science-tracking-provider-run-evidence-v1",
      provider: {
        providerId: provider.providerId,
        providerVersion: provider.providerVersion,
        protocol: provider.protocol,
        stage: provider.stage,
        capabilities: [...provider.capabilities],
        executionFingerprintSha256,
      },
      groundTruthSuiteId: "team-ground-truth-r1",
      groundTruthSuiteSha256: "1".repeat(64),
      providerRunSuiteId: "team-provider-runs-r1",
      providerRunSuiteSha256: "2".repeat(64),
      runIds: Array.from({ length: 5 }, (_, index) => `team-provider-run-${index + 1}`),
      executionProfile: {
        device: "cpu",
        runtimeMode: "football-science-tracking-worker-v1",
        cpuThreads: 8,
        sampleFps: 6.25,
        modelResident: true,
        runCount: 5,
        workerReusedRunCount: 4,
      },
    },
    cases,
  };
}

async function writeArtifact(providerDir, relativePath, value) {
  const target = path.join(providerDir, ...relativePath.split("/"));
  const content = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return { path: relativePath, bytes: content.length, sha256: sha256(content) };
}

async function installApprovedProvider(registryRoot, directoryName = "team-classifier") {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const runtime = Buffer.from("verified-team-classifier-runtime-v1");
  const model = Buffer.from("verified-team-classifier-model-v1");
  const candidate = contract.normalizeTrackingProviderManifest(providerManifest(runtime, model));
  const executionFingerprintSha256 = evidenceService.trackingProviderExecutionFingerprint(candidate);
  const report = benchmarkReport(candidate, executionFingerprintSha256);
  const evidence = evidenceService.createTrackingProviderEvidence(candidate, report);
  const manifest = contract.normalizeTrackingProviderManifest({
    ...candidate,
    benchmark: evidenceService.trackingProviderBenchmarkFromEvidence(evidence),
  });
  const providerDir = path.join(registryRoot, directoryName);
  await fs.mkdir(providerDir, { recursive: true });
  const files = {
    manifest: await writeArtifact(providerDir, "manifest.json", manifest),
    report: await writeArtifact(providerDir, "report.json", report),
    evidence: await writeArtifact(providerDir, "evidence.json", evidence),
    runtime: await writeArtifact(providerDir, "runtime/provider.bin", runtime),
    models: [{
      id: manifest.models[0].id,
      ...await writeArtifact(providerDir, "models/team-classifier.bin", model),
    }],
  };
  const installation = {
    schemaVersion: 1,
    protocol: "football-science-tracking-provider-installation-v1",
    provider: {
      id: manifest.providerId,
      version: manifest.providerVersion,
      fingerprintSha256: evidenceService.trackingProviderFingerprint(manifest),
      executionFingerprintSha256,
    },
    files,
  };
  await fs.writeFile(path.join(providerDir, "installation.json"), JSON.stringify(installation));
  return { providerDir, runtime, model, manifest, report, evidence, installation };
}

test("local provider registry verifies actual runtime, model and evidence without leaking paths", async () => {
  const registryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-registry.mjs",
  ));
  const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-registry-"));
  try {
    const installed = await installApprovedProvider(registryRoot);
    const registry = registryService.createTrackingProviderRegistry({ rootDir: registryRoot });
    const snapshot = await registry.inspect();
    expect(snapshot).toMatchObject({
      protocol: "football-science-tracking-provider-registry-v1",
      status: "ready",
      providerCount: 1,
      readyCount: 1,
      blockedCount: 0,
      providers: [{
        id: "team-classifier",
        version: "1.0.0",
        stage: "classification",
        status: "ready",
        available: true,
        executionAvailable: false,
        activationStatus: "not-configured",
        benchmarkStatus: "passed",
        capabilities: ["classify:team"],
      }],
    });
    expect(JSON.stringify(snapshot)).not.toContain(registryRoot);
    expect(JSON.stringify(snapshot)).not.toMatch(/sourceUrl|repository|models\/|runtime\//);

    const changedRuntime = Buffer.from(installed.runtime);
    changedRuntime[0] ^= 1;
    const runtimePath = path.join(installed.providerDir, installed.installation.files.runtime.path);
    await fs.writeFile(runtimePath, changedRuntime);
    const changedAt = new Date(Date.now() + 1000);
    await fs.utimes(runtimePath, changedAt, changedAt);
    const blocked = await registry.inspect();
    expect(blocked).toMatchObject({ status: "blocked", readyCount: 0, blockedCount: 1 });
    expect(blocked.providers[0]).toMatchObject({
      id: "team-classifier",
      status: "blocked",
      available: false,
      reasons: ["provider-runtime-checksum-mismatch"],
    });
  } finally {
    await fs.rm(registryRoot, { recursive: true, force: true });
  }
});

test("local provider registry rejects path escape, symbolic links and duplicate provider ids", async () => {
  const registryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-registry.mjs",
  ));
  const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-registry-boundary-"));
  try {
    const installed = await installApprovedProvider(registryRoot);
    const markerPath = path.join(installed.providerDir, "installation.json");
    const escaped = structuredClone(installed.installation);
    escaped.files.runtime.path = "../provider.bin";
    await fs.writeFile(markerPath, JSON.stringify(escaped));
    const registry = registryService.createTrackingProviderRegistry({ rootDir: registryRoot });
    expect((await registry.inspect()).providers[0]).toMatchObject({
      status: "blocked",
      reasons: ["provider-artifact-path-invalid"],
    });

    await fs.writeFile(markerPath, JSON.stringify(installed.installation));
    const modelPath = path.join(installed.providerDir, installed.installation.files.models[0].path);
    const modelTarget = `${modelPath}.real`;
    await fs.rename(modelPath, modelTarget);
    await fs.symlink(modelTarget, modelPath);
    expect((await registry.inspect()).providers[0]).toMatchObject({
      id: "team-classifier",
      status: "blocked",
      reasons: ["provider-artifact-link-blocked"],
    });

    await fs.rm(modelPath);
    await fs.rename(modelTarget, modelPath);
    await installApprovedProvider(registryRoot, "team-classifier-copy");
    const duplicate = await registry.inspect();
    expect(duplicate.readyCount).toBe(0);
    expect(duplicate.blockedCount).toBe(2);
    expect(duplicate.providers.every((provider) => provider.reasons.includes("duplicate-provider-id"))).toBe(true);
  } finally {
    await fs.rm(registryRoot, { recursive: true, force: true });
  }
});

test("local provider registry rejects a self-consistently rehashed but unbound benchmark report", async () => {
  const registryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-registry.mjs",
  ));
  const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-registry-evidence-"));
  try {
    const installed = await installApprovedProvider(registryRoot);
    const changedReport = structuredClone(installed.report);
    changedReport.cases[0].metrics.teamAccuracy = 0.97;
    const reportDescriptor = await writeArtifact(installed.providerDir, "report.json", changedReport);
    const marker = structuredClone(installed.installation);
    marker.files.report = reportDescriptor;
    await fs.writeFile(path.join(installed.providerDir, "installation.json"), JSON.stringify(marker));

    const registry = registryService.createTrackingProviderRegistry({ rootDir: registryRoot });
    const blocked = await registry.inspect();
    expect(blocked).toMatchObject({ status: "blocked", readyCount: 0, blockedCount: 1 });
    expect(blocked.providers[0]).toMatchObject({
      id: "team-classifier",
      status: "blocked",
      benchmarkStatus: "passed",
      reasons: ["benchmark-evidence-invalid"],
    });
  } finally {
    await fs.rm(registryRoot, { recursive: true, force: true });
  }
});

test("local provider registry fails closed when its configured root is not a directory", async () => {
  const registryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-registry.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-registry-root-"));
  const rootFile = path.join(directory, "not-a-registry");
  try {
    await fs.writeFile(rootFile, "not a provider registry");
    await expect(registryService.createTrackingProviderRegistry({ rootDir: rootFile }).inspect()).resolves.toEqual({
      protocol: "football-science-tracking-provider-registry-v1",
      status: "blocked",
      providerCount: 0,
      readyCount: 0,
      blockedCount: 0,
      providers: [],
      reasons: ["provider-registry-boundary-invalid"],
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
