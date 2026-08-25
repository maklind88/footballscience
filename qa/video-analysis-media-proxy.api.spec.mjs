import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function completedJob(statusUrl, headers) {
  await expect.poll(async () => (await (await fetch(statusUrl, { headers })).json()).job?.status).toBe("succeeded");
  return (await (await fetch(statusUrl, { headers })).json()).job;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(Buffer.concat(stdout))
      : reject(new Error(stderr || `${command} exited with ${code}`)));
  });
}

test("local proxy cache supports range scrub and exact replay without a second source upload", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-media-proxy-test-"));
  const sourceBytes = Buffer.from("device-local-full-match-source");
  const proxyBytes = Buffer.from("scrub-optimized-proxy-video");
  const replayBytes = Buffer.from("exact-local-replay-buffer");
  let proxyRuns = 0;
  let replaySpecification = null;
  const engine = {
    async createProxy(inputPath, outputPath, specification, options = {}) {
      proxyRuns += 1;
      expect(await fs.readFile(inputPath)).toEqual(sourceBytes);
      options.onProgress?.({ processedMs: 1000, ratio: 0.5 });
      await fs.writeFile(outputPath, proxyBytes);
      return { preset: specification.preset, height: 540, fps: 25, keyframeSeconds: 1, codec: "h264", container: "mp4" };
    },
    async createReplayBuffer(inputPath, outputPath, specification, options = {}) {
      expect(await fs.readFile(inputPath)).toEqual(proxyBytes);
      replaySpecification = specification;
      options.onProgress?.({ processedMs: 3000, ratio: 0.9 });
      await fs.writeFile(outputPath, replayBytes);
      return { startMs: specification.startMs, endMs: specification.endMs, durationMs: specification.endMs - specification.startMs, codec: "h264", container: "mp4" };
    },
    async preparePlaybackCopy() { return { mode: "remux" }; },
    async renderExport() { return {}; },
  };
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 4096,
    maxCacheBytes: 1024 * 1024,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 4,
    maxReplayDurationMs: 10_000,
  };
  const localServer = serverModule.createLocalVideoServer({ config, engine });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const headers = { origin, "x-football-science-session": session.sessionToken };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toEqual(expect.arrayContaining(["create-proxy", "replay-buffer"]));
    expect(capabilities.limits.maxReplayDurationMs).toBe(10_000);

    const proxySpecification = { preset: "scrub-540p", sourceIdentifier: "local-source-1", angleId: "angle-primary" };
    const createProxy = () => fetch(`${baseUrl}/jobs/create-proxy`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "video/mp4",
        "x-football-science-file-name": "match.mp4",
        "x-football-science-proxy-spec": encoded(proxySpecification),
      },
      body: sourceBytes,
    });
    const queuedResponse = await createProxy();
    const queued = await queuedResponse.json();
    expect(queuedResponse.status).toBe(202);
    const proxyJob = await completedJob(queued.statusUrl, headers);
    expect(proxyJob.result).toMatchObject({ cacheHit: false, preset: "scrub-540p", height: 540, fps: 25 });
    expect(proxyJob.result.artifactId).toMatch(/^proxy-[a-f0-9]{40}$/);
    expect(proxyRuns).toBe(1);

    const rangeResponse = await fetch(proxyJob.result.proxyUrl, { headers: { origin, range: "bytes=6-14" } });
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers.get("content-range")).toBe(`bytes 6-14/${proxyBytes.length}`);
    expect(Buffer.from(await rangeResponse.arrayBuffer())).toEqual(proxyBytes.subarray(6, 15));

    const replayResponse = await fetch(`${baseUrl}/jobs/create-replay-buffer`, {
      method: "POST",
      headers: {
        ...headers,
        "x-football-science-replay-spec": encoded({
          proxyId: proxyJob.result.artifactId,
          proxyAccessToken: proxyJob.result.artifactAccessToken,
          startMs: 1250,
          endMs: 4750,
          matchStartMs: 5000,
          matchEndMs: 8500,
          angleId: "angle-primary",
        }),
      },
    });
    const replayQueued = await replayResponse.json();
    expect(replayResponse.status).toBe(202);
    const replayJob = await completedJob(replayQueued.statusUrl, headers);
    expect(replaySpecification).toMatchObject({ startMs: 1250, endMs: 4750, matchStartMs: 5000, matchEndMs: 8500 });
    expect(Buffer.from(await (await fetch(replayJob.result.replayUrl, { headers: { origin } })).arrayBuffer())).toEqual(replayBytes);
    const replayManifest = await (await fetch(replayJob.result.manifestUrl, { headers: { origin } })).json();
    expect(replayManifest).toMatchObject({ matchStartMs: 5000, matchEndMs: 8500, output: { durationMs: 3500 } });
    expect(JSON.stringify(replayManifest)).not.toContain(proxyJob.result.artifactAccessToken);

    const cachedQueued = await (await createProxy()).json();
    const cachedJob = await completedJob(cachedQueued.statusUrl, headers);
    expect(cachedJob.result).toMatchObject({ artifactId: proxyJob.result.artifactId, cacheHit: true });
    expect(proxyRuns).toBe(1);

    await fs.writeFile(path.join(cacheDir, proxyJob.result.artifactId, "proxy.mp4"), Buffer.alloc(proxyBytes.length, 7));
    const repairedQueued = await (await createProxy()).json();
    const repairedJob = await completedJob(repairedQueued.statusUrl, headers);
    expect(repairedJob.result).toMatchObject({ artifactId: proxyJob.result.artifactId, cacheHit: false });
    expect(proxyRuns).toBe(2);
    expect(await fs.readFile(path.join(cacheDir, proxyJob.result.artifactId, "proxy.mp4"))).toEqual(proxyBytes);
    expect((await fetch(proxyJob.result.proxyUrl, { headers: { origin: "https://attacker.invalid" } })).status).toBe(403);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("local replay buffer rejects expired proxy access and unbounded ranges", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-media-replay-limit-test-"));
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 4,
    maxReplayDurationMs: 5000,
  };
  const localServer = serverModule.createLocalVideoServer({
    config,
    engine: {
      async createProxy() { return {}; },
      async createReplayBuffer() { return {}; },
      async preparePlaybackCopy() { return { mode: "remux" }; },
      async renderExport() { return {}; },
    },
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const headers = { origin, "x-football-science-session": session.sessionToken };
    const response = await fetch(`${baseUrl}/jobs/create-replay-buffer`, {
      method: "POST",
      headers: {
        ...headers,
        "x-football-science-replay-spec": encoded({
          proxyId: `proxy-${"a".repeat(40)}`,
          proxyAccessToken: "expired-token",
          startMs: 0,
          endMs: 5001,
        }),
      },
    });
    expect(response.status).toBe(400);
    expect(localServer.jobs.stats()).toMatchObject({ active: 0, queued: 0, retained: 0 });

    const oversized = await fetch(`${baseUrl}/jobs/create-proxy`, {
      method: "POST",
      headers: {
        ...headers,
        "x-football-science-file-name": "oversized.mp4",
        "x-football-science-proxy-spec": encoded({ preset: "scrub-540p", sourceIdentifier: "local-oversized" }),
      },
      body: Buffer.from("video"),
    });
    expect(oversized.status).toBe(413);
    expect(localServer.jobs.stats()).toMatchObject({ active: 0, queued: 0, retained: 0 });
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("proxy controller preserves match time while proxy and replay layers change", async () => {
  const media = await import(moduleUrl("src/modules/video-analysis/services/mediaProductionService.js"));
  const controllerModule = await import(moduleUrl("src/modules/video-analysis/controllers/mediaProxyController.js"));
  let state = {
    match: { id: "match-1" },
    video: { id: "video-1", match_id: "match-1", duration_ms: 120_000 },
    source: { id: "source-1", video_id: "video-1", match_id: "match-1" },
    videoRef: {
      objectUrl: "blob:original",
      localVideoIdentifier: "local-source-1",
      durationMs: 120_000,
      mimeType: "video/mp4",
    },
    timeline: { playheadMs: 5000 },
    mediaProduction: {
      ...media.createInitialMediaProductionState(),
      activeAngleId: "angle-1",
      primaryAngleId: "angle-1",
      angles: [{
        id: "angle-1",
        matchId: "match-1",
        videoId: "video-1",
        sourceId: "source-1",
        localVideoIdentifier: "local-source-1",
        label: "Broadcast",
        role: "primary",
        primary: true,
        syncOffsetMs: 2000,
        durationMs: 120_000,
      }],
      replay: {
        inMs: 5000,
        outMs: 8500,
        loop: false,
        buffer: { status: "idle", active: false, progress: 0, result: null, error: "" },
      },
    },
  };
  const proxyResult = {
    artifactId: `proxy-${"b".repeat(40)}`,
    artifactAccessToken: "local-token",
    proxyUrl: "http://127.0.0.1/proxy.mp4",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    preset: "scrub-540p",
  };
  const replayResult = {
    artifactId: "replay-1",
    replayUrl: "http://127.0.0.1/replay.mp4",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    durationMs: 3500,
  };
  let replayInput = null;
  const refreshes = [];
  const updateState = (updater) => { state = updater(state); };
  const controller = controllerModule.createMediaProxyController({
    getState: () => state,
    updateState,
    getCurrentMatchMs: () => state.timeline.playheadMs,
    getWindow: () => ({ requestAnimationFrame: (callback) => callback() }),
    refreshPlayback: (matchMs, play) => refreshes.push({ matchMs, play }),
    createProxy: async () => proxyResult,
    createReplayBuffer: async (input) => { replayInput = input; return replayResult; },
  });

  expect(await controller.generateProxy()).toBe(true);
  expect(state.mediaProduction.proxy.byAngleId["angle-1"]).toMatchObject({ status: "ready", enabled: true });
  expect(media.activeMediaReference(state).objectUrl).toBe(proxyResult.proxyUrl);
  expect(refreshes.at(-1)).toEqual({ matchMs: 5000, play: false });

  expect(await controller.prepareReplayBuffer()).toBe(true);
  expect(replayInput).toMatchObject({ startMs: 7000, endMs: 10_500, matchStartMs: 5000, matchEndMs: 8500 });
  expect(state.mediaProduction.replay.buffer).toMatchObject({ status: "ready", active: false, angleId: "angle-1" });
  expect(controller.playReplayBuffer()).toBe(true);
  expect(media.activeMediaReference(state).objectUrl).toBe(replayResult.replayUrl);
  expect(media.matchTimeFromActiveVideoMs(state, 1250)).toBe(6250);
  expect(media.activeVideoTimeFromMatchMs(state, 7000)).toBe(2000);
  expect(media.matchTimeFromActiveVideoMs(state, 99_000)).toBe(8500);
  expect(media.activeVideoTimeFromMatchMs(state, 99_000)).toBe(3500);

  state = {
    ...state,
    mediaProduction: {
      ...state.mediaProduction,
      replay: media.normalizedReplayRange(state, { outMs: 9000 }),
    },
  };
  expect(state.mediaProduction.replay.buffer).toMatchObject({ status: "stale", active: false });
});

test("bundled FFmpeg creates a decodable scrub proxy and frame-accurate replay file", async () => {
  const engineModule = await import(moduleUrl("desktop/local-video-app/local-video-server/ffmpeg-engine.mjs"));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-proxy-engine-test-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const proxyPath = path.join(tempDir, "proxy.mp4");
  const replayPath = path.join(tempDir, "replay.mp4");
  try {
    await run(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=s=640x360:d=2:r=30",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", inputPath,
    ]);
    const engine = engineModule.createFfmpegEngine({ ffmpegPath });
    const proxy = await engine.createProxy(inputPath, proxyPath, { preset: "scrub-540p" });
    expect(proxy).toMatchObject({ fps: 25, keyframeSeconds: 1, codec: "h264", container: "mp4" });
    await expect(fs.stat(proxyPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", proxyPath, "-f", "null", "-"]);

    const replay = await engine.createReplayBuffer(proxyPath, replayPath, { startMs: 500, endMs: 1500 });
    expect(replay).toMatchObject({ startMs: 500, endMs: 1500, durationMs: 1000, codec: "h264" });
    const frame = await run(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", replayPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]);
    expect(frame.length).toBeGreaterThan(100_000);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
