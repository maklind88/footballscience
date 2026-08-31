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

async function makeTreeWritable(target) {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    await fs.chmod(target, 0o600).catch(() => {});
    return;
  }
  await fs.chmod(target, 0o700).catch(() => {});
  for (const entry of await fs.readdir(target)) await makeTreeWritable(path.join(target, entry));
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
    metrics: { teamAccuracy: 0.98, processingMs: 60_000, realtimeFactor: 0.5 },
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
    suiteId: "approved-team-provider-suite",
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
        runtimeMode: "native-stage-process-v1",
        cpuThreads: 8,
        sampleFps: 12.5,
        modelResident: false,
        runCount: 5,
        workerReusedRunCount: 0,
      },
    },
    cases,
  };
}

async function fixture(directory) {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const runtime = Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 1]);
  const model = Buffer.from("rights-reviewed-team-classification-model");
  const provider = contract.normalizeTrackingProviderManifest({
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: "team-classifier-candidate",
    providerVersion: "0.1.0",
    displayName: "Team Classifier Candidate",
    stage: "classification",
    priority: 50,
    capabilities: ["classify:team"],
    approval: {
      status: "candidate",
      reviewedAt: "2026-08-31",
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
      bytes: model.byteLength,
      license: "Apache-2.0",
      sourceUrl: "https://models.footballscience.test/team-classifier.bin",
      provenance: {
        modelCardUrl: "https://models.footballscience.test/team-classifier.html",
        trainingDataReviewed: true,
        datasets: [{
          id: "rights-reviewed-team-scenes",
          version: "1.0",
          usage: "finetuning",
          sourceUrl: "https://datasets.footballscience.test/team-scenes",
          terms: "commercial-local-inference",
          termsUrl: "https://datasets.footballscience.test/team-scenes/terms",
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: sha256(runtime),
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
    benchmark: { status: "not-run", evaluatorVersion: "not-run", profileId: "not-run" },
  });
  const report = benchmarkReport(provider, evidenceService.trackingProviderExecutionFingerprint(provider));
  const evidence = evidenceService.createTrackingProviderEvidence(provider, report);
  const paths = {
    manifestPath: path.join(directory, "candidate-manifest.json"),
    runtimePath: path.join(directory, "candidate-runtime"),
    modelPath: path.join(directory, "candidate-model.bin"),
    reportPath: path.join(directory, "benchmark-report.json"),
    evidencePath: path.join(directory, "provider-evidence.json"),
  };
  await fs.writeFile(paths.manifestPath, JSON.stringify(provider));
  await fs.writeFile(paths.runtimePath, runtime);
  await fs.writeFile(paths.modelPath, model);
  await fs.writeFile(paths.reportPath, JSON.stringify(report));
  await fs.writeFile(paths.evidencePath, JSON.stringify(evidence));
  return { evidence, model, paths, provider, report, runtime };
}

async function installCandidate(value, candidateRegistryDir) {
  const candidateInstaller = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/candidate-install-service.mjs",
  ));
  return candidateInstaller.installTrackingCandidate({
    acceptLicense: true,
    manifestPath: value.paths.manifestPath,
    runtimePath: value.paths.runtimePath,
    modelSources: new Map([[value.provider.models[0].id, value.paths.modelPath]]),
    registryDir: candidateRegistryDir,
    sandbox: { platform: "darwin", sandboxPath: "/usr/bin/true" },
  });
}

function approvedOptions(value, candidateRegistryDir, providerRegistryDir, overrides = {}) {
  return {
    acceptLicense: true,
    approveActivation: true,
    candidateId: value.provider.providerId,
    candidateVersion: value.provider.providerVersion,
    candidateRegistryDir,
    providerRegistryDir,
    reportPath: value.paths.reportPath,
    evidencePath: value.paths.evidencePath,
    sandbox: { platform: "darwin", sandboxPath: "/usr/bin/true" },
    ...overrides,
  };
}

test("approved provider installer creates a separate atomic activation from exact candidate evidence", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-providers/approved-provider-install-service.mjs",
  ));
  const approvedRegistryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-registry.mjs",
  ));
  const candidateRegistryService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-approved-install-"));
  const candidateRegistryDir = path.join(directory, "candidates");
  const providerRegistryDir = path.join(directory, "providers");
  try {
    const value = await fixture(directory);
    const candidateResult = await installCandidate(value, candidateRegistryDir);
    const candidateMarkerBefore = await fs.readFile(
      path.join(candidateResult.plan.installDir, "installation.json"),
      "utf8",
    );
    const planned = await service.planApprovedTrackingProviderInstallation(
      approvedOptions(value, candidateRegistryDir, providerRegistryDir, {
        acceptLicense: false,
        approveActivation: false,
      }),
    );
    expect(planned).toMatchObject({
      ok: true,
      plan: {
        protocol: "football-science-tracking-provider-installation-v1",
        provider: { id: value.provider.providerId, stage: "classification" },
        benchmark: { caseCount: 5, realMatchDurationMs: 600_000 },
        activation: "approved-local-optional",
      },
    });

    const installed = await service.installApprovedTrackingProvider(
      approvedOptions(value, candidateRegistryDir, providerRegistryDir),
    );
    expect(installed).toMatchObject({
      ok: true,
      plan: { activation: "approved-local-optional" },
      isolation: { ready: true, isolation: "darwin-sandbox-exec-network-denied-v1" },
    });
    const approvedRegistry = approvedRegistryService.createTrackingProviderRegistry({ rootDir: providerRegistryDir });
    expect(await approvedRegistry.inspect()).toMatchObject({
      status: "ready",
      providerCount: 1,
      readyCount: 1,
      blockedCount: 0,
      providers: [{ id: value.provider.providerId, status: "ready", benchmarkStatus: "passed" }],
    });
    const approved = await approvedRegistry.resolve(value.provider.providerId, value.provider.providerVersion);
    expect(approved.provider).toMatchObject({
      approval: { status: "approved-local-optional" },
      benchmark: { status: "passed", caseCount: 5, realMatchDurationMs: 600_000 },
    });
    const candidateRegistry = candidateRegistryService.createTrackingCandidateProviderRegistry({
      rootDir: candidateRegistryDir,
    });
    expect((await candidateRegistry.resolve(value.provider.providerId, value.provider.providerVersion)).provider)
      .toMatchObject({ approval: { status: "candidate" }, benchmark: { status: "not-run" } });
    expect(await fs.readFile(path.join(candidateResult.plan.installDir, "installation.json"), "utf8"))
      .toBe(candidateMarkerBefore);
    expect((await fs.stat(path.join(installed.plan.installDir, "runtime/provider"))).mode & 0o222).toBe(0);
    expect((await fs.stat(path.join(installed.plan.installDir, "provider-evidence.json"))).mode & 0o222).toBe(0);
    await expect(service.installApprovedTrackingProvider(
      approvedOptions(value, candidateRegistryDir, providerRegistryDir),
    )).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_ALREADY_INSTALLED" });
  } finally {
    await makeTreeWritable(directory);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("approved provider installer rejects missing intent, tamper, crossed registries, and unsafe sandbox", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-providers/approved-provider-install-service.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-approved-blocked-"));
  const candidateRegistryDir = path.join(directory, "candidates");
  const providerRegistryDir = path.join(directory, "providers");
  try {
    const value = await fixture(directory);
    await installCandidate(value, candidateRegistryDir);
    await expect(service.installApprovedTrackingProvider(approvedOptions(
      value,
      candidateRegistryDir,
      providerRegistryDir,
      { acceptLicense: false },
    ))).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_LICENSE_NOT_ACCEPTED" });
    await expect(service.installApprovedTrackingProvider(approvedOptions(
      value,
      candidateRegistryDir,
      providerRegistryDir,
      { approveActivation: false },
    ))).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_ACTIVATION_NOT_ACCEPTED" });
    await expect(service.planApprovedTrackingProviderInstallation(approvedOptions(
      value,
      candidateRegistryDir,
      candidateRegistryDir,
    ))).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_REGISTRY_OVERLAP" });
    const providerRegistryAlias = path.join(directory, "provider-registry-alias");
    await fs.symlink(candidateRegistryDir, providerRegistryAlias, "dir");
    await expect(service.planApprovedTrackingProviderInstallation(approvedOptions(
      value,
      candidateRegistryDir,
      path.join(providerRegistryAlias, "approved"),
    ))).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_REGISTRY_OVERLAP" });

    const forged = structuredClone(value.evidence);
    forged.benchmark.caseCount += 1;
    await fs.writeFile(value.paths.evidencePath, JSON.stringify(forged));
    await expect(service.planApprovedTrackingProviderInstallation(
      approvedOptions(value, candidateRegistryDir, providerRegistryDir),
    )).rejects.toThrow(/evidence/i);
    await fs.writeFile(value.paths.evidencePath, JSON.stringify(value.evidence));

    await expect(service.installApprovedTrackingProvider(approvedOptions(
      value,
      candidateRegistryDir,
      providerRegistryDir,
      { sandbox: { platform: "linux", sandboxPath: "/usr/bin/true" } },
    ))).rejects.toMatchObject({ code: "TRACKING_APPROVED_PROVIDER_PREFLIGHT_FAILED" });
    const entries = await fs.readdir(providerRegistryDir);
    expect(entries.filter((entry) => !entry.startsWith("."))).toEqual([]);
  } finally {
    await makeTreeWritable(directory);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("approved provider installer CLI requires exact unambiguous inputs", async () => {
  const cli = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-providers/install-approved-provider.mjs",
  ));
  expect(cli.parseApprovedProviderInstallArguments([
    "--candidate-id", "team-classifier-candidate",
    "--candidate-version", "0.1.0",
    "--report", "/tmp/report.json",
    "--evidence", "/tmp/evidence.json",
    "--accept-license",
    "--approve-local-activation",
  ])).toMatchObject({
    acceptLicense: true,
    approveActivation: true,
    candidateId: "team-classifier-candidate",
    candidateVersion: "0.1.0",
  });
  expect(() => cli.parseApprovedProviderInstallArguments([
    "--candidate-id", "team-classifier-candidate",
    "--candidate-version", "0.1.0",
    "--report", "/tmp/report.json",
  ])).toThrow(/--evidence is required/);
  expect(() => cli.parseApprovedProviderInstallArguments(["--force"]))
    .toThrow(/Unknown approved provider installer option/);
});
