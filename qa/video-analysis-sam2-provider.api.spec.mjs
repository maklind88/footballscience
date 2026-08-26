import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

test("approved SAM 2 provider assets and install plan are immutable", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(
    rootDir,
    "desktop/local-video-app/tracking-providers/sam2/manifest.json",
  ), "utf8"));
  expect(manifest).toMatchObject({
    providerId: "sam2.1-hiera-tiny",
    providerVersion: "1.2.0",
    protocol: "football-science-tracking-v1",
    approval: { status: "approved-local-optional", networkAtInference: false, redistributeUpstreamAssets: false },
    upstream: {
      commit: "2b90b9f5ceec907a1c18123530e92e794ad901a4",
      license: "Apache-2.0",
      sourceSha256: "1f2fbfad3ffa38110368abac76c6ef9df9c282a66d5c2807bc94abf4d2fb30f8",
      runtimeTreeSha256: "ea438009aac8ac297b3ed5e7d902684eb298859aa9c8db0eb49bc3deaf11c6e7",
    },
    model: {
      license: "Apache-2.0",
      checkpointSha256: "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69",
    },
    runtime: {
      maximumObjectsPerJob: 8,
      maximumWorkerStartupMs: 180_000,
      maximumJobWallTimeMs: 7_200_000,
      executionMode: "resident-worker-v1",
      deviceDefaults: { darwin: "cpu", linux: "auto" },
      providerSha256: "8898ab82aed4e9fa6b96f405304f73e94ecfeae9dfecb6ecfede2c2a90c7828e",
    },
  });
  const installer = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/install-provider.mjs"));
  const runtime = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/provider-runtime.mjs"));
  expect(runtime.sam2ProviderRuntimeSha256({
    runtimeDir: path.join(rootDir, "desktop/local-video-app/tracking-providers/sam2/provider"),
  })).toBe(manifest.runtime.providerSha256);
  const args = installer.parseInstallArguments(["--plan", "--python", "python3.12"]);
  const plan = installer.providerInstallPlan(args, { manifest, homeDir: "/tmp/analyst" });
  expect(plan.runtime).toMatchObject({
    isolatedVirtualEnvironment: true,
    networkAtInference: false,
    executionMode: "resident-worker-v1",
    maximumWorkerStartupMs: 180_000,
    maximumJobWallTimeMs: 7_200_000,
    deviceDefaults: { darwin: "cpu", linux: "auto" },
  });
  expect(plan.installDir).toContain(".football-science/tracking-providers/sam2.1-hiera-tiny-1.2.0");
});

test("packaged provider activates only for an exact verified install marker", async () => {
  const runtime = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/provider-runtime.mjs"));
  const installDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-runtime-"));
  const paths = runtime.sam2ProviderPaths({ installDir });
  try {
    await Promise.all([
      fs.mkdir(path.dirname(paths.python), { recursive: true }),
      fs.mkdir(path.dirname(paths.providerEntry), { recursive: true }),
      fs.mkdir(path.dirname(paths.checkpoint), { recursive: true }),
      fs.mkdir(paths.sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(paths.python, "python"),
      fs.writeFile(paths.providerEntry, "provider"),
      fs.writeFile(paths.checkpoint, "checkpoint"),
      fs.writeFile(paths.marker, JSON.stringify({
        schemaVersion: 1,
        providerId: paths.manifest.providerId,
        providerVersion: paths.manifest.providerVersion,
        sourceCommit: paths.manifest.upstream.commit,
        sourceSha256: paths.manifest.upstream.sourceSha256,
        sourceRuntimeSha256: paths.manifest.upstream.runtimeTreeSha256,
        checkpointSha256: paths.manifest.model.checkpointSha256,
        providerSha256: paths.manifest.runtime.providerSha256,
        manifestSha256: runtime.sam2ProviderManifestSha256(paths.manifest),
      })),
    ]);
    expect(runtime.resolveInstalledSam2Provider({
      installDir,
      runtimeSha256: () => paths.manifest.runtime.providerSha256,
      checkpointSha256: () => paths.manifest.model.checkpointSha256,
      sourceRuntimeSha256: () => paths.manifest.upstream.runtimeTreeSha256,
    })).toMatchObject({
      command: paths.python,
      engineName: "sam2.1-hiera-tiny",
      displayName: "Football Science SAM 2.1 Object Tracker",
      engineVersion: "1.2.0",
      providerExecutionFingerprintSha256: runtime.sam2ProviderExecutionFingerprintSha256(paths.manifest),
    });
    expect(runtime.sam2ProviderExecutionFingerprintSha256(paths.manifest)).toMatch(/^[a-f0-9]{64}$/);
    await fs.writeFile(paths.marker, JSON.stringify({
      schemaVersion: 1,
      providerId: paths.manifest.providerId,
      providerVersion: paths.manifest.providerVersion,
      sourceCommit: paths.manifest.upstream.commit,
      sourceSha256: "tampered",
      sourceRuntimeSha256: paths.manifest.upstream.runtimeTreeSha256,
      checkpointSha256: paths.manifest.model.checkpointSha256,
      providerSha256: paths.manifest.runtime.providerSha256,
      manifestSha256: runtime.sam2ProviderManifestSha256(paths.manifest),
    }));
    expect(runtime.resolveInstalledSam2Provider({
      installDir,
      runtimeSha256: () => paths.manifest.runtime.providerSha256,
      checkpointSha256: () => paths.manifest.model.checkpointSha256,
      sourceRuntimeSha256: () => paths.manifest.upstream.runtimeTreeSha256,
    })).toBeNull();
  } finally {
    await fs.rm(installDir, { recursive: true, force: true });
  }
});

test("packaged provider device policy is explicit and still allows a reviewed override", async () => {
  const runtime = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/provider-runtime.mjs"));
  const manifest = runtime.readSam2ProviderManifest();
  expect(runtime.sam2ProviderPreferredDevice(manifest, { env: {}, platform: "darwin" })).toBe("cpu");
  expect(runtime.sam2ProviderPreferredDevice(manifest, { env: {}, platform: "linux" })).toBe("auto");
  expect(runtime.sam2ProviderPreferredDevice(manifest, {
    env: { FS_SAM2_DEVICE: "mps" },
    platform: "darwin",
  })).toBe("mps");
  expect(runtime.sam2ProviderManifestSha256(manifest)).toMatch(/^[a-f0-9]{64}$/);
});

test("packaged provider runtime hash changes when any approved source file changes", async () => {
  const runtime = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/provider-runtime.mjs"));
  const installDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-runtime-hash-"));
  const runtimeDir = path.join(installDir, "runtime");
  try {
    await Promise.all(runtime.SAM2_PROVIDER_RUNTIME_FILES.map(async (relativePath, index) => {
      const filePath = path.join(runtimeDir, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `approved-${index}`);
    }));
    const first = runtime.sam2ProviderRuntimeSha256({ runtimeDir });
    await fs.appendFile(path.join(runtimeDir, runtime.SAM2_PROVIDER_RUNTIME_FILES[2]), "-tampered");
    expect(runtime.sam2ProviderRuntimeSha256({ runtimeDir })).not.toBe(first);
  } finally {
    await fs.rm(installDir, { recursive: true, force: true });
  }
});

test("packaged provider rehashes the checkpoint and exact upstream execution tree", async () => {
  const runtime = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/provider-runtime.mjs"));
  const installDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-upstream-hash-"));
  const sourceDir = path.join(installDir, "source");
  const checkpoint = path.join(installDir, "checkpoint.pt");
  try {
    await fs.mkdir(path.join(sourceDir, "sam2", "configs"), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(sourceDir, "LICENSE"), "approved-license"),
      fs.writeFile(path.join(sourceDir, "pyproject.toml"), "approved-build"),
      fs.writeFile(path.join(sourceDir, "setup.py"), "approved-setup"),
      fs.writeFile(path.join(sourceDir, "sam2", "__init__.py"), "approved-runtime"),
      fs.writeFile(path.join(sourceDir, "sam2", "configs", "model.yaml"), "approved-config"),
      fs.writeFile(checkpoint, "approved-checkpoint"),
    ]);
    const treeHash = runtime.sam2ProviderSourceRuntimeSha256({ sourceDir });
    const checkpointHash = runtime.sam2ProviderFileSha256(checkpoint);
    await fs.appendFile(path.join(sourceDir, "sam2", "__init__.py"), "-tampered");
    await fs.appendFile(checkpoint, "-tampered");
    expect(runtime.sam2ProviderSourceRuntimeSha256({ sourceDir })).not.toBe(treeHash);
    expect(runtime.sam2ProviderFileSha256(checkpoint)).not.toBe(checkpointHash);
    await fs.writeFile(path.join(sourceDir, "unapproved.py"), "unapproved-runtime");
    await fs.symlink("../unapproved.py", path.join(sourceDir, "sam2", "linked-runtime.py"));
    expect(() => runtime.sam2ProviderSourceRuntimeSha256({ sourceDir })).toThrow(/approved runtime tree/i);
  } finally {
    await fs.rm(installDir, { recursive: true, force: true });
  }
});

test("provider asset staging fails closed on any checksum mismatch", async () => {
  const support = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/install-support.mjs"));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-asset-"));
  const source = path.join(temporaryDir, "source.bin");
  const destination = path.join(temporaryDir, "verified", "asset.bin");
  const bytes = Buffer.from("approved-provider-asset");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await fs.writeFile(source, bytes);
    await expect(support.stageVerifiedAsset({
      destination,
      localPath: source,
      expected: { bytes: bytes.length, sha256 },
    })).resolves.toMatchObject({ bytes: bytes.length, sha256 });
    await expect(support.stageVerifiedAsset({
      destination: path.join(temporaryDir, "rejected.bin"),
      localPath: source,
      expected: { bytes: bytes.length, sha256: "0".repeat(64) },
    })).rejects.toThrow(/checksum/i);
    await expect(fs.access(path.join(temporaryDir, "rejected.bin"))).rejects.toThrow();
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("tracking prompt anchors at the drawn match frame and maps to the active angle", async () => {
  const review = await import(moduleUrl("src/modules/video-analysis/services/trackingReviewService.js"));
  const runtime = await import(moduleUrl("src/modules/video-analysis/video-analysis.tracking-runtime.js"));
  const { createTrackingController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingController.js",
  ));
  const manual = review.createManualPromptTrack({
    startMs: 1000,
    endMs: 3000,
    promptAtMs: 2000,
    box: { left: 0.2, top: 0.2, width: 0.1, height: 0.3 },
  });
  expect(manual.segments[0].points[0].atMs).toBe(2000);

  const request = runtime.localTrackingRequest({
    prompt: review.trackingPrompt({ startMs: 1000, endMs: 2000, promptAtMs: 1500 }),
    videoRef: { localVideoIdentifier: "primary" },
    videoId: "primary-video",
  }, {
    video: { id: "primary-video" },
    videoRef: { localVideoIdentifier: "primary", objectUrl: "blob:primary" },
    mediaProduction: {
      activeAngleId: "angle-two",
      angles: [{
        id: "angle-two",
        videoId: "angle-two-video",
        localVideoIdentifier: "angle-two-file",
        syncOffsetMs: 500,
        driftPpm: 1000,
      }],
      angleRefs: {
        "angle-two": { localVideoIdentifier: "angle-two-file", objectUrl: "blob:angle-two" },
      },
    },
  });
  expect(request).toMatchObject({
    videoId: "angle-two-video",
    videoRef: { localVideoIdentifier: "angle-two-file" },
    prompt: { angleId: "angle-two", sourceStartMs: 1501, sourcePromptAtMs: 2001, sourceEndMs: 2502 },
  });
  const batchRequest = runtime.localTrackingRequest({
    prompts: [
      review.trackingPrompt({ id: "target-a", startMs: 1000, endMs: 2000, promptAtMs: 1500 }),
      review.trackingPrompt({ id: "target-b", startMs: 1000, endMs: 2000, promptAtMs: 1500 }),
    ],
  }, {
    mediaProduction: {
      activeAngleId: "angle-two",
      angles: [{ id: "angle-two", videoId: "angle-two-video", syncOffsetMs: 500, driftPpm: 1000 }],
    },
  });
  expect(batchRequest.prompts).toHaveLength(2);
  expect(batchRequest.prompts.every((prompt) => (
    prompt.angleId === "angle-two"
      && prompt.sourceStartMs === 1501
      && prompt.sourcePromptAtMs === 2001
      && prompt.sourceEndMs === 2502
  ))).toBe(true);

  let state = {
    presentation: {
      current: { sections: [{ id: "section", title: "Review", items: [{ id: "item", clipId: "clip", startMs: 1000, endMs: 3000 }] }] },
      selectedItemId: "item",
      selectedClipId: "clip",
      tracking: {
        captureMode: "prompt",
        prompt: review.trackingPrompt({ startMs: 1000, endMs: 3000 }),
      },
    },
  };
  const surface = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: () => {},
  };
  const controller = createTrackingController({
    getState: () => state,
    getCurrentMatchMs: () => 1800,
    updateState: (updater) => { state = updater(state); },
  });
  controller.startInteraction({ clientX: 20, clientY: 20, pointerId: 1, preventDefault: () => {} }, surface);
  controller.finishInteraction({ clientX: 40, clientY: 60, preventDefault: () => {} });
  expect(state.presentation.tracking.prompt).toMatchObject({
    promptAtMs: 1800,
    box: { left: 0.2, top: 0.2 },
  });
  expect(state.presentation.tracking.prompt.box.width).toBeCloseTo(0.2, 8);
  expect(state.presentation.tracking.prompt.box.height).toBeCloseTo(0.4, 8);
});

test("provider artifact contract rejects unsafe samples and strips unknown metadata", async () => {
  const { validateTrackingArtifact } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-artifact-validator.mjs",
  ));
  const prompt = {
    startMs: 1000,
    endMs: 2000,
    sourceStartMs: 1500,
    sourceEndMs: 2500,
    sourcePromptAtMs: 2000,
    angleId: "angle-two",
  };
  const artifact = validateTrackingArtifact({
    id: "track-one",
    entityType: "player",
    segments: [{ points: [
      { atMs: 1000, frameIndex: 0, x: 0.3, y: 0.4, width: 0.1, height: 0.2, groundX: 0.3, groundY: 0.5, confidence: 0.9, identityConfidence: 0.8 },
      { atMs: 2000, frameIndex: 1, x: 0.4, y: 0.4, width: 0.1, height: 0.2, groundX: 0.4, groundY: 0.5, confidence: 0.88, identityConfidence: 0.78 },
    ] }],
    metadata: { model: "SAM 2.1", device: "mps", unexpectedPath: "/private/video.mp4" },
  }, prompt);
  expect(artifact).toMatchObject({ pointCount: 2, segmentCount: 1 });
  expect(artifact.artifact.metadata).toMatchObject({ angleId: "angle-two", sourceStartMs: 1500 });
  expect(artifact.artifact.metadata).not.toHaveProperty("unexpectedPath");
  expect(() => validateTrackingArtifact({
    segments: [{ points: [{
      atMs: 999,
      x: 0.3,
      y: 0.4,
      width: 0.1,
      height: 0.2,
      confidence: 0.9,
    }] }],
  }, prompt)).toThrow(/outside the requested range/i);
});

test("batch artifact boundary preserves prompt identity and rejects partial results", async () => {
  const { validateTrackingArtifacts } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-artifact-validator.mjs",
  ));
  const prompts = ["target-a", "target-b"].map((id, index) => ({
    id,
    clipId: "clip-batch",
    videoId: "video-batch",
    startMs: 0,
    endMs: 1000,
    promptAtMs: 0,
    sourceStartMs: 0,
    sourceEndMs: 1000,
    sourcePromptAtMs: 0,
    box: { left: 0.2 + index * 0.3, top: 0.2, width: 0.1, height: 0.3 },
  }));
  const rawTrack = (prompt, index) => ({
    id: `track-${index}`,
    promptId: prompt.id,
    segments: [{ points: [
      { atMs: 0, frameIndex: 0, x: 0.25 + index * 0.3, y: 0.4, width: 0.1, height: 0.3, confidence: 0.9 },
      { atMs: 1000, frameIndex: 1, x: 0.27 + index * 0.3, y: 0.4, width: 0.1, height: 0.3, confidence: 0.88 },
    ] }],
  });
  const validated = validateTrackingArtifacts({
    tracks: [rawTrack(prompts[1], 1), rawTrack(prompts[0], 0)],
  }, prompts);
  expect(validated).toMatchObject({ trackCount: 2, pointCount: 4, segmentCount: 2 });
  expect(validated.artifacts.map((track) => track.metadata.promptId)).toEqual(["target-a", "target-b"]);
  expect(validated.artifacts[1].metadata).toMatchObject({ batchIndex: 1, batchSize: 2 });
  expect(() => validateTrackingArtifacts({ tracks: [rawTrack(prompts[0], 0)] }, prompts)).toThrow(/incomplete/i);
  expect(() => validateTrackingArtifacts({
    tracks: [rawTrack(prompts[0], 0), rawTrack(prompts[0], 1)],
  }, prompts)).toThrow(/unknown or duplicate/i);
});

test("external provider process streams progress through the strict v1 boundary", async () => {
  const { createTrackingEngineAdapter } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-process-"));
  const provider = path.join(temporaryDir, "fake-provider.mjs");
  const inputPath = path.join(temporaryDir, "input.mp4");
  const outputPath = path.join(temporaryDir, "track.json");
  const providerSource = `
    import { readFileSync, writeFileSync } from "node:fs";
    const values = new Map();
    for (let index = 2; index < process.argv.length; index += 2) values.set(process.argv[index], process.argv[index + 1]);
    const request = JSON.parse(readFileSync(values.get("--request"), "utf8"));
    const prompt = request.prompt;
    console.log(JSON.stringify({ stage: "provider-process", ratio: 0.75 }));
    writeFileSync(values.get("--output"), JSON.stringify({
      id: "process-track",
      entityType: "player",
      segments: [{ points: [
        { atMs: prompt.startMs, frameIndex: 0, x: 0.3, y: 0.4, width: 0.1, height: 0.2, groundX: 0.3, groundY: 0.5, confidence: 0.9, identityConfidence: 0.8 },
        { atMs: prompt.endMs, frameIndex: 1, x: 0.4, y: 0.4, width: 0.1, height: 0.2, groundX: 0.4, groundY: 0.5, confidence: 0.88, identityConfidence: 0.78 }
      ] }]
    }));
  `;
  try {
    await Promise.all([fs.writeFile(provider, providerSource), fs.writeFile(inputPath, "video")]);
    const progress = [];
    const adapter = createTrackingEngineAdapter({
      command: process.execPath,
      commandArgs: [provider],
      engineName: "qa-process-provider",
    });
    const result = await adapter.trackObject(inputPath, outputPath, {
      startMs: 1000,
      endMs: 2000,
      promptAtMs: 1500,
      sourceStartMs: 1000,
      sourceEndMs: 2000,
      sourcePromptAtMs: 1500,
    }, { onProgress: (value) => progress.push(value) });
    expect(result).toMatchObject({ engine: "qa-process-provider", pointCount: 2, segmentCount: 1 });
    expect(progress).toContainEqual({ stage: "provider-process", ratio: 0.75 });
    expect(JSON.parse(await fs.readFile(outputPath, "utf8"))).toMatchObject({ status: "review" });
    await expect(fs.access(path.join(temporaryDir, "tracking-request.json"))).rejects.toThrow();
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

function residentProviderSource() {
  return `
    import { readFileSync, writeFileSync } from "node:fs";
    import readline from "node:readline";
    const protocol = "football-science-tracking-worker-v1";
    const send = (value) => process.stdout.write(JSON.stringify({ protocol, ...value }) + "\\n");
    send({
      type: "ready",
      provider: "qa-resident-provider",
      providerVersion: "9.0.0",
      device: "test",
      modelResident: true,
      modelLoadMs: 7,
      startupMs: 11,
    });
    let sequence = 0;
    const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const job = JSON.parse(line);
      const request = JSON.parse(readFileSync(job.requestPath, "utf8"));
      const prompt = request.prompt;
      sequence += 1;
      send({ type: "progress", jobId: job.jobId, stage: prompt.id === "hang" ? "fake-hanging" : "fake-resident", ratio: 0.7 });
      if (prompt.id === "hang") return;
      writeFileSync(job.outputPath, JSON.stringify({
        id: "resident-track-" + sequence,
        promptId: prompt.id,
        entityType: "player",
        segments: [{ points: [
          { atMs: prompt.startMs, frameIndex: 0, x: 0.3, y: 0.4, width: 0.1, height: 0.2, groundX: 0.3, groundY: 0.5, confidence: 0.9, identityConfidence: 0.8 },
          { atMs: prompt.endMs, frameIndex: 1, x: 0.4, y: 0.4, width: 0.1, height: 0.2, groundX: 0.4, groundY: 0.5, confidence: 0.88, identityConfidence: 0.78 }
        ] }]
      }));
      send({
        type: "result",
        jobId: job.jobId,
        ok: true,
        device: "test",
        modelResident: true,
        modelLoadMs: 7,
        jobProcessingMs: 5,
        workerJobSequence: sequence,
      });
    });
  `;
}

function residentPrompt(id = "target") {
  return {
    id,
    startMs: 1000,
    endMs: 2000,
    promptAtMs: 1500,
    sourceStartMs: 1000,
    sourceEndMs: 2000,
    sourcePromptAtMs: 1500,
    box: { left: 0.2, top: 0.2, width: 0.1, height: 0.3 },
  };
}

test("resident tracking worker reuses one model process across sequential jobs", async () => {
  const { createTrackingEngineAdapter } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-resident-"));
  const provider = path.join(temporaryDir, "fake-resident-provider.mjs");
  const inputPath = path.join(temporaryDir, "input.mp4");
  let adapter;
  try {
    await Promise.all([
      fs.writeFile(provider, residentProviderSource()),
      fs.writeFile(inputPath, "video"),
    ]);
    adapter = createTrackingEngineAdapter({
      command: process.execPath,
      commandArgs: [provider],
      engineName: "qa-resident-provider",
      engineVersion: "9.0.0",
      resident: true,
    });
    const first = await adapter.trackObject(
      inputPath,
      path.join(temporaryDir, "first.json"),
      residentPrompt("first"),
    );
    const second = await adapter.trackObject(
      inputPath,
      path.join(temporaryDir, "second.json"),
      residentPrompt("second"),
    );
    expect(first.runtime).toMatchObject({
      mode: "football-science-tracking-worker-v1",
      generation: 1,
      workerJobSequence: 1,
      workerReused: false,
      modelResident: true,
    });
    expect(second.runtime).toMatchObject({
      generation: 1,
      workerJobSequence: 2,
      workerReused: true,
      modelResident: true,
    });
    expect(adapter.info().runtime).toMatchObject({
      status: "ready",
      generation: 1,
      completedJobs: 2,
      reusedJobs: 1,
      modelResident: true,
    });
  } finally {
    await adapter?.close?.();
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("resident tracking cancellation waits for exit and restarts a clean worker generation", async () => {
  const { createTrackingEngineAdapter } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-resident-cancel-"));
  const provider = path.join(temporaryDir, "fake-resident-provider.mjs");
  const inputPath = path.join(temporaryDir, "input.mp4");
  const controller = new AbortController();
  let adapter;
  try {
    await Promise.all([
      fs.writeFile(provider, residentProviderSource()),
      fs.writeFile(inputPath, "video"),
    ]);
    adapter = createTrackingEngineAdapter({
      command: process.execPath,
      commandArgs: [provider],
      engineName: "qa-resident-provider",
      engineVersion: "9.0.0",
      resident: true,
    });
    await expect(adapter.trackObject(
      inputPath,
      path.join(temporaryDir, "cancelled.json"),
      residentPrompt("hang"),
      {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.stage === "fake-hanging") controller.abort();
        },
      },
    )).rejects.toMatchObject({ name: "AbortError", code: "ABORT_ERR" });
    await expect(fs.access(path.join(temporaryDir, "tracking-request.json"))).rejects.toThrow();
    const recovered = await adapter.trackObject(
      inputPath,
      path.join(temporaryDir, "recovered.json"),
      residentPrompt("recovered"),
    );
    expect(recovered.runtime).toMatchObject({
      generation: 2,
      workerJobSequence: 1,
      workerReused: false,
      modelResident: true,
    });
  } finally {
    await adapter?.close?.();
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("closing a resident tracking adapter prevents queued worker restart", async () => {
  const { createTrackingEngineAdapter } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-resident-close-"));
  const provider = path.join(temporaryDir, "fake-resident-provider.mjs");
  const inputPath = path.join(temporaryDir, "input.mp4");
  const adapter = createTrackingEngineAdapter({
    command: process.execPath,
    commandArgs: [provider],
    engineName: "qa-resident-provider",
    engineVersion: "9.0.0",
    resident: true,
  });
  try {
    await Promise.all([
      fs.writeFile(provider, residentProviderSource()),
      fs.writeFile(inputPath, "video"),
    ]);
    await adapter.close();
    await expect(adapter.trackObject(
      inputPath,
      path.join(temporaryDir, "closed.json"),
      residentPrompt("closed"),
    )).rejects.toMatchObject({ code: "TRACKING_RESIDENT_WORKER_CLOSED" });
    expect(adapter.info().runtime).toMatchObject({ status: "closed", modelResident: false });
  } finally {
    await adapter.close();
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("tracking adapter validates several objects from one provider invocation", async () => {
  const { createTrackingEngineAdapter } = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs",
  ));
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-batch-"));
  const inputPath = path.join(temporaryDir, "input.mp4");
  const outputPath = path.join(temporaryDir, "tracks.json");
  const prompts = ["target-a", "target-b"].map((id, index) => ({
    id,
    startMs: 0,
    endMs: 1000,
    promptAtMs: 0,
    sourceStartMs: 0,
    sourceEndMs: 1000,
    sourcePromptAtMs: 0,
    box: { left: 0.1 + index * 0.4, top: 0.2, width: 0.1, height: 0.3 },
  }));
  try {
    await fs.writeFile(inputPath, "video");
    let invocations = 0;
    const adapter = createTrackingEngineAdapter({
      runner: async ({ prompts: requested }) => {
        invocations += 1;
        return { tracks: requested.map((prompt, index) => ({
          promptId: prompt.id,
          segments: [{ points: [
            { atMs: 0, x: 0.2 + index * 0.4, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9 },
            { atMs: 1000, x: 0.22 + index * 0.4, y: 0.4, width: 0.1, height: 0.2, confidence: 0.88 },
          ] }],
        })) };
      },
    });
    const result = await adapter.trackObjects(inputPath, outputPath, prompts);
    expect(invocations).toBe(1);
    expect(result).toMatchObject({ trackCount: 2, pointCount: 4, segmentCount: 2 });
    expect(JSON.parse(await fs.readFile(outputPath, "utf8")).tracks).toHaveLength(2);
    await expect(fs.access(path.join(temporaryDir, "tracking-request.json"))).rejects.toThrow();
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});

test("pure provider protocol and identity tests run without model weights", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-sam2-pycache-"));
  try {
    const result = await execFileAsync("python3", ["-m", "unittest", "qa/fs_sam2_provider_test.py"], {
      cwd: rootDir,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONPYCACHEPREFIX: cacheDir },
    });
    expect(result.stderr).toContain("OK");
  } finally {
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
