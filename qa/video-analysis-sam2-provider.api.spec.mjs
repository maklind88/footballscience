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
    providerVersion: "1.0.0",
    protocol: "football-science-tracking-v1",
    approval: { status: "approved-local-optional", networkAtInference: false, redistributeUpstreamAssets: false },
    upstream: {
      commit: "2b90b9f5ceec907a1c18123530e92e794ad901a4",
      license: "Apache-2.0",
      sourceSha256: "1f2fbfad3ffa38110368abac76c6ef9df9c282a66d5c2807bc94abf4d2fb30f8",
    },
    model: {
      license: "Apache-2.0",
      checkpointSha256: "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69",
    },
  });
  const installer = await import(moduleUrl("desktop/local-video-app/tracking-providers/sam2/install-provider.mjs"));
  const args = installer.parseInstallArguments(["--plan", "--python", "python3.12"]);
  const plan = installer.providerInstallPlan(args, { manifest, homeDir: "/tmp/analyst" });
  expect(plan.runtime).toMatchObject({ isolatedVirtualEnvironment: true, networkAtInference: false });
  expect(plan.installDir).toContain(".football-science/tracking-providers/sam2.1-hiera-tiny-1.0.0");
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
        checkpointSha256: paths.manifest.model.checkpointSha256,
      })),
    ]);
    expect(runtime.resolveInstalledSam2Provider({ installDir })).toMatchObject({
      command: paths.python,
      engineName: "sam2.1-hiera-tiny",
      engineVersion: "1.0.0",
    });
    await fs.writeFile(paths.marker, JSON.stringify({
      schemaVersion: 1,
      providerId: paths.manifest.providerId,
      providerVersion: paths.manifest.providerVersion,
      sourceCommit: paths.manifest.upstream.commit,
      sourceSha256: "tampered",
      checkpointSha256: paths.manifest.model.checkpointSha256,
    }));
    expect(runtime.resolveInstalledSam2Provider({ installDir })).toBeNull();
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
