import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
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

async function waitForJob(baseUrl, id, headers) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/jobs/${id}`, { headers });
    const payload = await response.json();
    if (["succeeded", "failed", "cancelled"].includes(payload.job?.status)) return payload.job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Tracking stage job did not complete.");
}

function candidateManifest() {
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    displayName: "Verified Team Classifier",
    stage: "classification",
    priority: 50,
    capabilities: ["classify:team"],
    approval: {
      status: "approved-local-optional",
      reviewedAt: "2026-08-30",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: {
      repository: "https://github.com/footballscience/verified-team-classifier",
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: "https://github.com/footballscience/verified-team-classifier/blob/main/LICENSE",
    },
    models: [{
      id: "verified-team-weights",
      sha256: "c".repeat(64),
      bytes: 1024,
      license: "Apache-2.0",
      sourceUrl: "https://models.footballscience.test/verified-team.bin",
      provenance: {
        modelCardUrl: "https://models.footballscience.test/verified-team.html",
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
      providerSha256: "d".repeat(64),
      maxFrames: 30_000,
      maxDurationMs: 1_200_000,
      maxWallTimeMs: 7_200_000,
      maxMemoryMb: 8192,
      maxOutputBytes: 64 * 1024 * 1024,
      maxConcurrentJobs: 1,
    },
    benchmark: { status: "not-run", evaluatorVersion: "not-run", profileId: "not-run" },
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

async function approvedInstallation() {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  const candidate = contract.normalizeTrackingProviderManifest(candidateManifest());
  const report = benchmarkReport(
    candidate,
    evidenceService.trackingProviderExecutionFingerprint(candidate),
  );
  const evidence = evidenceService.createTrackingProviderEvidence(candidate, report);
  const provider = contract.normalizeTrackingProviderManifest({
    ...candidate,
    benchmark: evidenceService.trackingProviderBenchmarkFromEvidence(evidence),
  });
  return {
    provider,
    report,
    evidence,
    providerDir: "/private/provider",
    runtime: { filePath: "/private/provider/runtime.bin", bytes: 1024, sha256: "d".repeat(64) },
    models: [{
      id: "verified-team-weights",
      filePath: "/private/provider/model.bin",
      bytes: 1024,
      sha256: "c".repeat(64),
    }],
  };
}

function request(overrides = {}) {
  return {
    sourceFingerprint: "f".repeat(64),
    range: { startMs: 0, endMs: 2000 },
    trajectories: [{
      id: "track-1",
      entityType: "player",
      observations: [{
        id: "observation-1",
        atMs: 0,
        frameIndex: 0,
        entityType: "player",
        box: { left: 0.1, top: 0.2, width: 0.08, height: 0.3 },
        confidence: 0.96,
      }],
      confidence: 0.93,
      discontinuitiesMs: [],
    }],
    ...overrides,
  };
}

async function resultArtifact(installation, stageRequest, overrides = {}) {
  const artifactService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-artifact-validator.mjs",
  ));
  const evidenceService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs",
  ));
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-result-v1",
    provider: {
      id: installation.provider.providerId,
      version: installation.provider.providerVersion,
      fingerprintSha256: evidenceService.trackingProviderFingerprint(installation.provider),
    },
    stage: "classification",
    capabilities: ["classify:team"],
    sourceFingerprint: stageRequest.sourceFingerprint,
    requestFingerprint: artifactService.trackingStageRequestFingerprint(
      installation.provider,
      stageRequest,
    ),
    range: { ...stageRequest.range },
    payload: {
      classifications: [{ trajectoryId: "track-1", teamSide: "home", teamConfidence: 0.97 }],
    },
    ...overrides,
  };
}

function readyExecutor(output, overrides = {}) {
  return {
    info: () => ({ protocol: "football-science-tracking-stage-execution-v1", platform: "test", sandbox: "test" }),
    inspect: async () => ({
      ready: true,
      status: "sandboxed-local",
      protocol: "football-science-tracking-stage-execution-v1",
      isolation: "test-network-denied-v1",
      reasons: [],
    }),
    execute: async () => ({
      output: Buffer.from(JSON.stringify(output)),
      telemetry: {
        protocol: "football-science-tracking-stage-execution-v1",
        isolation: "test-network-denied-v1",
        wallTimeMs: 120,
        outputBytes: 512,
        stdoutBytes: 0,
        stderrBytes: 0,
        exitCode: 0,
      },
    }),
    ...overrides,
  };
}

test("tracking stage runner activates only an exact verified provider and validates its output", async () => {
  const runnerService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-runner.mjs",
  ));
  const installation = await approvedInstallation();
  const stageRequest = request();
  stageRequest.trajectories[0].observations[0].confidence = "0.96";
  const output = await resultArtifact(installation, stageRequest);
  let executionRequest;
  const registry = {
    resolve: async (id, version) => {
      expect({ id, version }).toEqual({ id: "verified-team-classifier", version: "1.0.0" });
      return installation;
    },
  };
  const runner = runnerService.createTrackingStageRunner({
    registry,
    executor: readyExecutor(output, {
      execute: async (_installation, normalizedRequest) => {
        executionRequest = normalizedRequest;
        return readyExecutor(output).execute();
      },
    }),
  });
  const snapshot = await runner.decorateRegistry({
    protocol: "football-science-tracking-provider-registry-v1",
    status: "ready",
    providers: [{
      id: "verified-team-classifier",
      version: "1.0.0",
      status: "ready",
      available: true,
    }],
  });
  expect(snapshot).toMatchObject({
    executableCount: 1,
    activationBlockedCount: 0,
    providers: [{
      executionAvailable: true,
      activationStatus: "sandboxed-local",
      activationIsolation: "test-network-denied-v1",
      activationReasons: [],
    }],
  });
  expect(JSON.stringify(snapshot)).not.toMatch(/\/private\/provider|model\.bin|runtime\.bin/);

  const result = await runner.run({
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    request: stageRequest,
    source: { filePath: "/private/match.mp4", sha256: "f".repeat(64) },
  });
  expect(result.artifact.payload.classifications).toEqual([
    { trajectoryId: "track-1", teamSide: "home", teamConfidence: 0.97 },
  ]);
  expect(executionRequest.trajectories[0].observations[0].confidence).toBe(0.96);
  expect(Object.isFrozen(executionRequest.trajectories[0].observations[0])).toBe(true);
  expect(result.telemetry).toMatchObject({
    isolation: "test-network-denied-v1",
    wallTimeMs: 120,
    exitCode: 0,
  });
});

test("tracking stage runner enforces source identity and provider concurrency", async () => {
  const runnerService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-runner.mjs",
  ));
  const installation = await approvedInstallation();
  const stageRequest = request();
  const output = await resultArtifact(installation, stageRequest);
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const blockedExecutor = readyExecutor(output, {
    execute: async () => {
      started();
      await new Promise((resolve) => { release = resolve; });
      return readyExecutor(output).execute();
    },
  });
  const runner = runnerService.createTrackingStageRunner({
    registry: { resolve: async () => installation },
    executor: blockedExecutor,
  });
  const source = { filePath: "/private/match.mp4", sha256: "f".repeat(64) };
  const first = runner.run({
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    request: stageRequest,
    source,
  });
  await startedPromise;
  await expect(runner.run({
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    request: stageRequest,
    source,
  })).rejects.toMatchObject({ code: "TRACKING_STAGE_CONCURRENCY_LIMIT" });
  release();
  await expect(first).resolves.toMatchObject({ artifact: { stage: "classification" } });

  await expect(runner.run({
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    request: stageRequest,
    source: { filePath: "/private/other.mp4", sha256: "e".repeat(64) },
  })).rejects.toMatchObject({ code: "TRACKING_STAGE_SOURCE_MISMATCH" });
});

test("tracking stage runner rejects output bound to another request", async () => {
  const runnerService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-runner.mjs",
  ));
  const installation = await approvedInstallation();
  const stageRequest = request();
  const changedRequest = structuredClone(stageRequest);
  changedRequest.trajectories[0].observations[0].confidence = 0.95;
  const mismatchedOutput = await resultArtifact(installation, changedRequest);
  const runner = runnerService.createTrackingStageRunner({
    registry: { resolve: async () => installation },
    executor: readyExecutor(mismatchedOutput),
  });
  await expect(runner.run({
    providerId: "verified-team-classifier",
    providerVersion: "1.0.0",
    request: stageRequest,
    source: { filePath: "/private/match.mp4", sha256: "f".repeat(64) },
  })).rejects.toThrow(/different stage inputs/i);
});

test("darwin tracking sandbox is network-denied and blocks an unsealed runtime", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-sandbox-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const modelPath = path.join(directory, "model.bin");
    await fs.writeFile(runtimePath, "not-a-native-runtime", { mode: 0o555 });
    await fs.writeFile(modelPath, "model", { mode: 0o444 });
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
    });
    await expect(executor.inspect({
      runtime: { filePath: runtimePath },
      models: [{ filePath: modelPath }],
    })).resolves.toMatchObject({
      ready: false,
      status: "blocked",
      reasons: ["tracking-stage-runtime-format-unsupported"],
    });

    const profile = sandboxService._private.darwinSandboxProfile({
      providerDir: directory,
      runtimePath,
      sourcePath: path.join(directory, "match.mp4"),
      workDir: path.join(directory, "work"),
    });
    expect(profile).toContain("(deny default)");
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain('(literal "/")');
    expect(profile).toContain('(subpath "/System/Cryptexes/OS")');
    expect(profile).toContain('(allow file-read-metadata ');
    expect(profile).toContain(`(literal ${JSON.stringify(path.dirname(directory))})`);
    expect(profile).not.toContain('(subpath "/Users")');
    expect(profile).not.toContain('(subpath "/private")');
    expect(profile).toContain(`(allow process-exec (literal ${JSON.stringify(runtimePath)}))`);
    expect(profile).not.toContain("(allow network");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("sandbox executor launches only the sealed runtime with a scrubbed environment", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-executor-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const runtime = Buffer.alloc(64);
    runtime.writeUInt32BE(0xfeedfacf, 0);
    await fs.writeFile(runtimePath, runtime, { mode: 0o555 });
    let invocation = null;
    let profile = "";
    let rssSamples = 0;
    const spawnProcess = (command, args, options) => {
      invocation = { command, args, options };
      const child = new EventEmitter();
      child.pid = 99_999_991;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;
      setTimeout(async () => {
        const outputIndex = args.indexOf("--fs-tracking-stage-output");
        const profileIndex = args.indexOf("-f");
        profile = await fs.readFile(args[profileIndex + 1], "utf8");
        await fs.writeFile(args[outputIndex + 1], '{"ok":true}\n', { mode: 0o600 });
        child.emit("close", 0, null);
      }, 60);
      return child;
    };
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
      temporaryRoot: directory,
      spawnProcess,
      rssSampler: async () => {
        rssSamples += 1;
        return 8 * 1024 * 1024;
      },
    });
    const result = await executor.execute({
      providerDir: directory,
      provider: {
        providerId: "sealed-runtime",
        providerVersion: "1.0.0",
        stage: "association",
        runtime: {
          maxOutputBytes: 4096,
          maxWallTimeMs: 5000,
          maxMemoryMb: 64,
        },
      },
      runtime: {
        filePath: runtimePath,
        bytes: runtime.byteLength,
        sha256: sha256(runtime),
      },
      models: [],
    }, request({ observations: [] }), null);
    expect(JSON.parse(result.output.toString("utf8"))).toEqual({ ok: true });
    expect(rssSamples).toBeGreaterThan(0);
    expect(invocation.command).toBe("/bin/sh");
    expect(invocation.args).toContain(runtimePath);
    expect(invocation.options).toMatchObject({
      detached: true,
      env: {
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
        FS_TRACKING_NETWORK_DISABLED: "1",
      },
    });
    expect(invocation.options.cwd.startsWith(`${await fs.realpath(directory)}${path.sep}`)).toBe(true);
    expect(invocation.options.env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain(`(allow process-exec (literal ${JSON.stringify(runtimePath)}))`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("sandbox executor terminates the provider process group above its memory budget", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-memory-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const runtime = Buffer.alloc(64);
    runtime.writeUInt32BE(0xfeedfacf, 0);
    await fs.writeFile(runtimePath, runtime, { mode: 0o555 });
    const spawnProcess = () => {
      const child = new EventEmitter();
      child.pid = 99_999_992;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {
        setTimeout(() => child.emit("close", null, "SIGKILL"), 0);
        return true;
      };
      return child;
    };
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
      temporaryRoot: directory,
      spawnProcess,
      rssSampler: async () => 65 * 1024 * 1024,
    });
    await expect(executor.execute({
      providerDir: directory,
      provider: {
        providerId: "memory-bound-runtime",
        providerVersion: "1.0.0",
        stage: "association",
        runtime: {
          maxOutputBytes: 4096,
          maxWallTimeMs: 5000,
          maxMemoryMb: 64,
        },
      },
      runtime: {
        filePath: runtimePath,
        bytes: runtime.byteLength,
        sha256: sha256(runtime),
      },
      models: [],
    }, request({ observations: [] }), null)).rejects.toMatchObject({
      code: "TRACKING_STAGE_MEMORY_LIMIT",
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("sandbox blocks an owner-writable provider runtime", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-writable-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const runtime = Buffer.alloc(64);
    runtime.writeUInt32BE(0xfeedfacf, 0);
    await fs.writeFile(runtimePath, runtime, { mode: 0o755 });
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
    });
    await expect(executor.inspect({
      runtime: { filePath: runtimePath },
      models: [],
    })).resolves.toMatchObject({
      ready: false,
      reasons: ["tracking-stage-artifact-permissions-unsafe"],
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("source sealing does not mutate an already read-only match file", async () => {
  const integrityService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-file-integrity.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-already-sealed-"));
  try {
    const sourcePath = path.join(directory, "match.mp4");
    const source = Buffer.from("already-sealed-real-match-source");
    await fs.writeFile(sourcePath, source, { mode: 0o400 });
    const before = await fs.stat(sourcePath, { bigint: true });
    const seal = await integrityService.sealTrackingSourceFile(sourcePath, {
      expectedSha256: sha256(source),
      expectedBytes: source.byteLength,
    });
    const after = await fs.stat(sourcePath, { bigint: true });
    expect(seal).toMatchObject({ bytes: source.byteLength, sha256: sha256(source) });
    expect(after.ctimeNs).toBe(before.ctimeNs);
    expect(Number(after.mode) & 0o222).toBe(0);
  } finally {
    await fs.chmod(path.join(directory, "match.mp4"), 0o600).catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("sandbox rejects output when a sealed runtime changes during execution", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-mutated-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const runtime = Buffer.alloc(64);
    runtime.writeUInt32BE(0xfeedfacf, 0);
    await fs.writeFile(runtimePath, runtime, { mode: 0o555 });
    const spawnProcess = (_command, args) => {
      const child = new EventEmitter();
      child.pid = 99_999_993;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;
      setTimeout(async () => {
        const outputIndex = args.indexOf("--fs-tracking-stage-output");
        await fs.chmod(runtimePath, 0o755);
        await fs.writeFile(runtimePath, Buffer.concat([runtime, Buffer.from("changed")]));
        await fs.chmod(runtimePath, 0o555);
        await fs.writeFile(args[outputIndex + 1], '{"ok":true}\n', { mode: 0o600 });
        child.emit("close", 0, null);
      }, 10);
      return child;
    };
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
      temporaryRoot: directory,
      spawnProcess,
      rssSampler: async () => 8 * 1024 * 1024,
    });
    await expect(executor.execute({
      providerDir: directory,
      provider: {
        providerId: "mutated-runtime",
        providerVersion: "1.0.0",
        stage: "association",
        runtime: {
          maxOutputBytes: 4096,
          maxWallTimeMs: 5000,
          maxMemoryMb: 64,
        },
      },
      runtime: {
        filePath: runtimePath,
        bytes: runtime.byteLength,
        sha256: sha256(runtime),
      },
      models: [],
    }, request({ observations: [] }), null)).rejects.toMatchObject({
      code: "TRACKING_FILE_SIZE_MISMATCH",
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("sandbox rejects output when a sealed match source changes during execution", async () => {
  const sandboxService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ));
  const integrityService = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-file-integrity.mjs",
  ));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-source-mutated-"));
  try {
    const runtimePath = path.join(directory, "runtime.bin");
    const sourcePath = path.join(directory, "match.mp4");
    const runtime = Buffer.alloc(64);
    const source = Buffer.from("sealed-real-match-source");
    runtime.writeUInt32BE(0xfeedfacf, 0);
    await fs.writeFile(runtimePath, runtime, { mode: 0o555 });
    await fs.writeFile(sourcePath, source, { mode: 0o600 });
    const sourceSeal = await integrityService.sealTrackingSourceFile(sourcePath, {
      expectedSha256: sha256(source),
      expectedBytes: source.byteLength,
    });
    const spawnProcess = (_command, args) => {
      const child = new EventEmitter();
      child.pid = 99_999_994;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;
      setTimeout(async () => {
        const outputIndex = args.indexOf("--fs-tracking-stage-output");
        await fs.chmod(sourcePath, 0o600);
        await fs.writeFile(sourcePath, Buffer.alloc(source.byteLength, 0x42));
        await fs.chmod(sourcePath, 0o400);
        await fs.writeFile(args[outputIndex + 1], '{"ok":true}\n', { mode: 0o600 });
        child.emit("close", 0, null);
      }, 10);
      return child;
    };
    const executor = sandboxService.createTrackingStageSandboxExecutor({
      platform: "darwin",
      sandboxPath: runtimePath,
      temporaryRoot: directory,
      spawnProcess,
      rssSampler: async () => 8 * 1024 * 1024,
    });
    await expect(executor.execute({
      providerDir: directory,
      provider: {
        providerId: "source-bound-runtime",
        providerVersion: "1.0.0",
        stage: "detection",
        runtime: {
          maxOutputBytes: 4096,
          maxWallTimeMs: 5000,
          maxMemoryMb: 64,
        },
      },
      runtime: {
        filePath: runtimePath,
        bytes: runtime.byteLength,
        sha256: sha256(runtime),
      },
      models: [],
    }, request(), {
      filePath: sourcePath,
      sha256: sha256(source),
      seal: sourceSeal,
    })).rejects.toMatchObject({ code: "TRACKING_FILE_CHANGED" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("browser tracking client submits metadata through JSON when reusing a private source", async () => {
  const localTracking = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingService.js",
  ));
  const requests = [];
  const stageRequest = request();
  const sourceArtifactId = "11111111-1111-4111-8111-111111111111";
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47924",
    btoa: globalThis.btoa,
    setTimeout,
    fetch: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/session") {
        return Response.json({ sessionToken: "stage-session", expiresAt: "2099-01-01T00:00:00.000Z" }, { status: 201 });
      }
      if (parsed.pathname === "/jobs/run-tracking-stage") {
        requests.push(options);
        return Response.json({
          job: { id: "stage-job" },
          statusUrl: "http://127.0.0.1:47924/jobs/stage-job",
        }, { status: 202 });
      }
      if (parsed.pathname === "/jobs/stage-job") {
        return Response.json({ job: {
          status: "succeeded",
          startedAt: "2026-08-31T12:00:00.000Z",
          completedAt: "2026-08-31T12:00:00.120Z",
          result: {
            sourceArtifactId,
            sourceSha256: "f".repeat(64),
            resultUrl: "http://127.0.0.1:47924/tracking-stage/stage-job/result.json?access=token",
            execution: { isolation: "darwin-sandbox-exec-network-denied-v1", wallTimeMs: 100 },
          },
        } });
      }
      if (parsed.pathname === "/tracking-stage/stage-job/result.json") {
        return Response.json({
          schemaVersion: 1,
          protocol: "football-science-tracking-stage-result-v1",
          provider: { id: "verified-team-classifier", version: "1.0.0" },
          stage: "classification",
          capabilities: ["classify:team"],
          requestFingerprint: "a".repeat(64),
          payload: { classifications: [] },
        });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  };
  const result = await localTracking.runLocalTrackingStage({
    win,
    provider: { id: "verified-team-classifier", version: "1.0.0" },
    request: stageRequest,
    sourceArtifactId,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].headers).toMatchObject({
    "content-type": "application/json",
    "x-football-science-tracking-source-id": sourceArtifactId,
    "x-football-science-tracking-provider-id": "verified-team-classifier",
    "x-football-science-tracking-provider-version": "1.0.0",
  });
  expect(JSON.parse(requests[0].body)).toEqual(stageRequest);
  expect(result).toMatchObject({
    sourceArtifactId,
    sourceSha256: "f".repeat(64),
    processingMs: 120,
    artifact: { stage: "classification" },
  });
});

test("local companion runs a session-owned stage job and reuses its source without leaking paths", async () => {
  const configModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/config.mjs",
  ));
  const serverModule = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/server.mjs",
  ));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stage-server-"));
  const origin = "http://localhost:4173";
  const video = Buffer.from("private-real-match-video-fixture");
  const fingerprint = sha256(video);
  const seenSources = [];
  const trackingStageRunner = {
    info: () => ({ protocol: "football-science-tracking-stage-execution-v1" }),
    decorateRegistry: async (snapshot) => ({
      ...snapshot,
      executableCount: 1,
      activationBlockedCount: 0,
      providers: snapshot.providers.map((provider) => ({
        ...provider,
        executionAvailable: true,
        activationStatus: "sandboxed-local",
        activationProtocol: "football-science-tracking-stage-execution-v1",
        activationIsolation: "test-network-denied-v1",
        activationReasons: [],
      })),
    }),
    run: async (value, options = {}) => {
      options.onProgress?.({ stage: "provider inference", ratio: 0.6 });
      expect(value.source.sha256).toBe(fingerprint);
      expect(await fs.readFile(value.source.filePath)).toEqual(video);
      seenSources.push(value.source.filePath);
      return {
        artifact: {
          schemaVersion: 1,
          protocol: "football-science-tracking-stage-result-v1",
          provider: { id: value.providerId, version: value.providerVersion, fingerprintSha256: "a".repeat(64) },
          stage: "classification",
          capabilities: ["classify:team"],
          sourceFingerprint: fingerprint,
          requestFingerprint: "b".repeat(64),
          range: { ...value.request.range },
          payload: { classifications: [{ trajectoryId: "track-1", teamSide: "home", teamConfidence: 0.97 }] },
        },
        telemetry: {
          protocol: "football-science-tracking-stage-execution-v1",
          isolation: "test-network-denied-v1",
          wallTimeMs: 50,
          outputBytes: 512,
          stdoutBytes: 0,
          stderrBytes: 0,
          exitCode: 0,
        },
      };
    },
  };
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    cacheDir,
    port: 0,
    maxInputBytes: 1024 * 1024,
    maxCacheBytes: 16 * 1024 * 1024,
  };
  const localServer = serverModule.createLocalVideoServer({
    config,
    engine: {},
    trackingEngine: { available: () => false, info: () => ({ available: false }), close: async () => {} },
    trackingProviderRegistry: {
      inspect: async () => ({
        protocol: "football-science-tracking-provider-registry-v1",
        status: "ready",
        providerCount: 1,
        readyCount: 1,
        blockedCount: 0,
        providers: [{
          id: "verified-team-classifier",
          version: "1.0.0",
          stage: "classification",
          status: "ready",
          available: true,
          capabilities: ["classify:team"],
          reasons: [],
        }],
        reasons: [],
      }),
    },
    trackingStageRunner,
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const sessionResponse = await fetch(`${baseUrl}/session`, { method: "POST", headers: { Origin: origin } });
    const session = await sessionResponse.json();
    const headers = {
      Origin: origin,
      "x-football-science-session": session.sessionToken,
    };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toContain("run-tracking-stage");
    expect(capabilities.trackingProviderRegistry.providers[0]).toMatchObject({
      executionAvailable: true,
      activationStatus: "sandboxed-local",
    });
    expect(JSON.stringify(capabilities)).not.toContain(cacheDir);

    const stageRequest = request({ sourceFingerprint: fingerprint });
    const createResponse = await fetch(`${baseUrl}/jobs/run-tracking-stage`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/octet-stream",
        "x-football-science-file-name": "match.mp4",
        "x-football-science-tracking-provider-id": "verified-team-classifier",
        "x-football-science-tracking-provider-version": "1.0.0",
        "x-football-science-tracking-stage-request": Buffer.from(JSON.stringify(stageRequest)).toString("base64url"),
      },
      body: video,
    });
    expect(createResponse.status).toBe(202);
    const created = await createResponse.json();
    const firstJob = await waitForJob(baseUrl, created.job.id, headers);
    expect(firstJob).toMatchObject({
      status: "succeeded",
      result: {
        sourceSha256: fingerprint,
        sourceArtifactId: created.job.id,
        stage: "classification",
      },
    });
    expect(JSON.stringify(firstJob)).not.toContain(cacheDir);
    const artifact = await (await fetch(firstJob.result.resultUrl, { headers: { Origin: origin } })).json();
    expect(artifact.payload.classifications[0]).toMatchObject({ teamSide: "home" });

    const reuseResponse = await fetch(`${baseUrl}/jobs/run-tracking-stage`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-football-science-tracking-provider-id": "verified-team-classifier",
        "x-football-science-tracking-provider-version": "1.0.0",
        "x-football-science-tracking-source-id": firstJob.result.sourceArtifactId,
      },
      body: JSON.stringify(stageRequest),
    });
    expect(reuseResponse.status).toBe(202);
    const reused = await reuseResponse.json();
    await expect(waitForJob(baseUrl, reused.job.id, headers)).resolves.toMatchObject({
      status: "succeeded",
      result: { sourceArtifactId: firstJob.result.sourceArtifactId },
    });
    expect(seenSources).toHaveLength(2);

    const retainedSourcePath = path.join(cacheDir, created.job.id, "input-match.mp4");
    const retainedSourceStat = await fs.stat(retainedSourcePath);
    expect(retainedSourceStat.mode & 0o222).toBe(0);
    await fs.chmod(retainedSourcePath, 0o600);
    await fs.writeFile(retainedSourcePath, Buffer.alloc(video.byteLength, 0x41));
    await fs.chmod(retainedSourcePath, 0o400);
    const tamperedResponse = await fetch(`${baseUrl}/jobs/run-tracking-stage`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-football-science-tracking-provider-id": "verified-team-classifier",
        "x-football-science-tracking-provider-version": "1.0.0",
        "x-football-science-tracking-source-id": firstJob.result.sourceArtifactId,
      },
      body: JSON.stringify(stageRequest),
    });
    expect(tamperedResponse.status).toBe(409);
    expect(await tamperedResponse.json()).toMatchObject({
      ok: false,
      error: "Tracking file checksum does not match its sealed identity.",
    });

    const secondSession = await (await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { Origin: origin },
    })).json();
    const crossSessionResponse = await fetch(`${baseUrl}/jobs/run-tracking-stage`, {
      method: "POST",
      headers: {
        Origin: origin,
        "content-type": "application/json",
        "x-football-science-session": secondSession.sessionToken,
        "x-football-science-tracking-provider-id": "verified-team-classifier",
        "x-football-science-tracking-provider-version": "1.0.0",
        "x-football-science-tracking-source-id": firstJob.result.sourceArtifactId,
      },
      body: JSON.stringify(stageRequest),
    });
    expect(crossSessionResponse.status).toBe(404);
    expect(JSON.stringify(await crossSessionResponse.json())).not.toContain(cacheDir);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
