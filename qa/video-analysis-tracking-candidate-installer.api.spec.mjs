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
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    await fs.chmod(target, 0o600).catch(() => {});
    return;
  }
  await fs.chmod(target, 0o700).catch(() => {});
  for (const entry of await fs.readdir(target)) await makeTreeWritable(path.join(target, entry));
}

async function candidateFixture(directory) {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const runtime = Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 1]);
  const model = Buffer.from("reviewed-football-detection-model");
  const manifest = contract.normalizeTrackingProviderManifest({
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: "football-detector-candidate",
    providerVersion: "0.1.0",
    displayName: "Football Detector Candidate",
    stage: "detection",
    priority: 50,
    capabilities: ["detect:player", "detect:ball", "detect:referee"],
    approval: {
      status: "candidate",
      reviewedAt: "2026-08-31",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: {
      repository: "https://github.com/footballscience/football-detector",
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: "https://github.com/footballscience/football-detector/blob/main/LICENSE",
    },
    models: [{
      id: "football-detector-weights",
      sha256: sha256(model),
      bytes: model.byteLength,
      license: "Apache-2.0",
      sourceUrl: "https://models.footballscience.test/football-detector.bin",
      provenance: {
        modelCardUrl: "https://models.footballscience.test/football-detector.html",
        trainingDataReviewed: true,
        datasets: [{
          id: "rights-reviewed-football-scenes",
          version: "1.0",
          usage: "finetuning",
          sourceUrl: "https://datasets.footballscience.test/football-scenes",
          terms: "commercial-local-inference",
          termsUrl: "https://datasets.footballscience.test/football-scenes/terms",
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
    benchmark: {
      status: "not-run",
      evaluatorVersion: "not-run",
      profileId: "not-run",
    },
  });
  const manifestPath = path.join(directory, "candidate-manifest.json");
  const runtimePath = path.join(directory, "candidate-runtime");
  const modelPath = path.join(directory, "candidate-model.bin");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await fs.writeFile(runtimePath, runtime);
  await fs.writeFile(modelPath, model);
  return { manifest, manifestPath, model, modelPath, runtime, runtimePath };
}

function installOptions(fixture, registryDir) {
  return {
    acceptLicense: true,
    manifestPath: fixture.manifestPath,
    runtimePath: fixture.runtimePath,
    modelSources: new Map([[fixture.manifest.models[0].id, fixture.modelPath]]),
    registryDir,
    sandbox: { platform: "darwin", sandboxPath: "/usr/bin/true" },
  };
}

test("candidate installer seals exact artifacts atomically and passes registry plus sandbox preflight", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/candidate-install-service.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-candidate-install-"));
  const registryDir = path.join(directory, "registry");
  try {
    const fixture = await candidateFixture(directory);
    const result = await service.installTrackingCandidate(installOptions(fixture, registryDir));
    expect(result).toMatchObject({
      ok: true,
      plan: {
        provider: { id: fixture.manifest.providerId, stage: "detection" },
        activation: "benchmark-only",
      },
      isolation: {
        ready: true,
        isolation: "darwin-sandbox-exec-network-denied-v1",
      },
    });
    const preflight = await service.inspectTrackingCandidateInstallations({
      registryDir,
      sandbox: { platform: "darwin", sandboxPath: "/usr/bin/true" },
    });
    expect(preflight).toMatchObject({
      ok: true,
      providerCount: 1,
      readyCount: 1,
      blockedCount: 0,
      providers: [{
        id: fixture.manifest.providerId,
        status: "candidate-ready",
        benchmarkOnly: true,
        isolation: { ready: true },
      }],
    });
    expect(JSON.stringify(preflight)).not.toContain(directory);
    expect(JSON.stringify(preflight)).not.toMatch(/sourceUrl|modelCardUrl|repository/);

    const installDir = result.plan.installDir;
    expect((await fs.stat(path.join(installDir, "runtime/provider"))).mode & 0o222).toBe(0);
    expect((await fs.stat(path.join(installDir, `models/${fixture.manifest.models[0].id}.bin`))).mode & 0o222).toBe(0);
    await expect(service.installTrackingCandidate(installOptions(fixture, registryDir))).rejects.toMatchObject({
      code: "TRACKING_CANDIDATE_ALREADY_INSTALLED",
    });
  } finally {
    await makeTreeWritable(registryDir);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("candidate installer rejects checksum drift and symbolic-link inputs without partial installation", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/candidate-install-service.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-candidate-invalid-"));
  const registryDir = path.join(directory, "registry");
  try {
    const fixture = await candidateFixture(directory);
    await fs.writeFile(fixture.modelPath, "changed-model");
    await expect(service.installTrackingCandidate(installOptions(fixture, registryDir))).rejects.toMatchObject({
      code: "TRACKING_CANDIDATE_ARTIFACT_SIZE_MISMATCH",
    });
    expect((await fs.readdir(registryDir)).filter((entry) => !entry.startsWith("."))).toEqual([]);

    await fs.writeFile(fixture.modelPath, fixture.model);
    const actualRuntime = `${fixture.runtimePath}.actual`;
    await fs.rename(fixture.runtimePath, actualRuntime);
    await fs.symlink(actualRuntime, fixture.runtimePath);
    await expect(service.installTrackingCandidate(installOptions(fixture, registryDir))).rejects.toMatchObject({
      code: "TRACKING_CANDIDATE_ARTIFACT_UNSAFE",
    });
    expect((await fs.readdir(registryDir)).filter((entry) => !entry.startsWith("."))).toEqual([]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("candidate installer requires explicit licence acceptance and canonical reviewed policy", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/candidate-install-service.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-candidate-policy-"));
  try {
    const fixture = await candidateFixture(directory);
    await expect(service.installTrackingCandidate({
      ...installOptions(fixture, path.join(directory, "registry")),
      acceptLicense: false,
    })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_LICENSE_NOT_ACCEPTED" });

    const hidden = { ...fixture.manifest, hiddenDownloadToken: "must-never-pass" };
    await fs.writeFile(fixture.manifestPath, JSON.stringify(hidden));
    await expect(service.readTrackingCandidateManifest(fixture.manifestPath)).rejects.toMatchObject({
      code: "TRACKING_CANDIDATE_MANIFEST_NON_CANONICAL",
    });

    const blocked = structuredClone(fixture.manifest);
    blocked.models[0].provenance.trainingDataReviewed = false;
    await fs.writeFile(fixture.manifestPath, JSON.stringify(blocked));
    await expect(service.readTrackingCandidateManifest(fixture.manifestPath)).rejects.toMatchObject({
      code: "TRACKING_CANDIDATE_POLICY_BLOCKED",
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("candidate installer and preflight CLIs reject ambiguous arguments", async () => {
  const installer = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/install-candidate.mjs",
  ));
  const preflight = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/preflight.mjs",
  ));
  expect(installer.parseCandidateInstallArguments([
    "--manifest", "/tmp/provider.json",
    "--runtime", "/tmp/provider",
    "--model", "weights=/tmp/model.bin",
    "--accept-license",
  ])).toMatchObject({ acceptLicense: true, manifestPath: "/tmp/provider.json", runtimePath: "/tmp/provider" });
  expect(() => installer.parseCandidateInstallArguments([
    "--manifest", "/tmp/provider.json",
    "--runtime", "/tmp/provider",
    "--model", "weights=/tmp/first.bin",
    "--model", "weights=/tmp/second.bin",
  ])).toThrow(/Duplicate model id/);
  expect(preflight.parseCandidatePreflightArguments(["--json", "--registry-dir", "/tmp/providers"]))
    .toEqual({ json: true, registryDir: "/tmp/providers" });
  expect(() => preflight.parseCandidatePreflightArguments(["--force"])).toThrow(/Unknown/);
});
