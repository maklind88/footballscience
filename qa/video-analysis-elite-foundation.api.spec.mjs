import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function playerTrack(id, x, y = 0.5) {
  return {
    id,
    entityType: "player",
    status: "verified",
    confidence: 0.95,
    segments: [{
      id: `${id}-segment`,
      startMs: 0,
      endMs: 1000,
      points: [
        { atMs: 0, x, y, groundX: x, groundY: y, confidence: 0.95, identityConfidence: 0.95 },
        { atMs: 1000, x: x + 0.1, y, groundX: x + 0.1, groundY: y, confidence: 0.9, identityConfidence: 0.9 },
      ],
    }],
  };
}

function pitchCalibration() {
  return {
    id: "calibration-1",
    status: "verified",
    source: "manual",
    confidence: 0.96,
    pitchLengthM: 105,
    pitchWidthM: 68,
    frames: [{
      id: "frame-1",
      atMs: 0,
      validFromMs: 0,
      validToMs: 2000,
      inputSpace: "normalized-image",
      imageToPitchMatrix: [105, 0, 0, 0, 68, 0, 0, 0, 1],
      confidence: 0.96,
      rmsErrorM: 0.4,
      controlPointCount: 8,
    }],
  };
}

test("elite tracking foundation preserves continuity, confidence and manual ground anchors", async () => {
  const tracking = await import(moduleUrl("src/modules/video-analysis/domain/tracking.model.js"));
  const geometry = await import(moduleUrl("src/modules/video-analysis/services/trackingGeometryService.js"));
  const track = tracking.normalizeObjectTrack(playerTrack("player-8", 0.1));
  const midpoint = geometry.trackingPointAt(track, 500);

  expect(midpoint).toMatchObject({
    atMs: 500,
    source: "interpolated",
    groundPoint: { y: 0.5 },
  });
  expect(midpoint.x).toBeCloseTo(0.15, 8);
  expect(midpoint.groundPoint.x).toBeCloseTo(0.15, 8);
  expect(midpoint.confidence).toBeCloseTo(0.864, 3);
  expect(tracking.trackingCoverage(track)).toMatchObject({
    coveredMs: 1000,
    durationMs: 1000,
    ratio: 1,
    pointCount: 2,
    segmentCount: 1,
  });
  expect(geometry.trackingPointAt(track, 1500)).toBeNull();
});

test("elite spatial foundation projects tracks to true metres and builds unit metrics", async () => {
  const calibrationModel = await import(moduleUrl("src/modules/video-analysis/domain/pitchCalibration.model.js"));
  const spatial = await import(moduleUrl("src/modules/video-analysis/services/spatialAnalysisService.js"));
  const calibration = pitchCalibration();
  const first = playerTrack("player-8", 0.1);
  const second = playerTrack("player-9", 0.2);

  expect(calibrationModel.calibrationReadiness(calibration)).toMatchObject({
    ready: true,
    frameCount: 1,
    usableFrameCount: 1,
  });
  const firstPoint = spatial.projectTrackToPitch(first, calibration, 0);
  const secondPoint = spatial.projectTrackToPitch(second, calibration, 0);
  expect(firstPoint).toMatchObject({ xM: 10.5, yM: 34, inPitchBounds: true });
  expect(spatial.pitchDistance(firstPoint, secondPoint)).toBeCloseTo(10.5, 5);

  const unit = spatial.unitMetricsAt([first, second], calibration, 0);
  expect(unit).toMatchObject({
    available: true,
    playerCount: 2,
    centroid: { xM: 15.75, yM: 34 },
    lengthM: 10.5,
    widthM: 0,
    meanPairDistanceM: 10.5,
  });
  expect(spatial.buildDistanceSeries(first, second, calibration, {
    startMs: 0,
    endMs: 1000,
    stepMs: 500,
  }).map((entry) => entry.distanceM)).toEqual([10.5, 10.5, 10.5]);
  expect(spatial.movementCurve(first, calibration, {
    startMs: 0,
    endMs: 1000,
    stepMs: 500,
  })).toMatchObject({
    distanceM: 10.5,
    sampleCount: 3,
  });
});

test("dynamic graphics declare whether tracking bindings are complete", async () => {
  const graphics = await import(moduleUrl("src/modules/video-analysis/domain/dynamicGraphic.model.js"));
  expect(graphics.dynamicGraphicReadiness({
    type: "distance",
    source: "spatial",
    bindings: [{ trackId: "track-a" }, { trackId: "track-b" }],
  })).toMatchObject({ valid: true, trackingRequired: true, bindingCount: 2, minimumBindings: 2 });
  expect(graphics.dynamicGraphicReadiness({
    type: "distance",
    source: "spatial",
    bindings: [{ trackId: "track-a" }],
  }).valid).toBe(false);
});

test("multi-angle sync round-trips match time with offset and clock drift", async () => {
  const sync = await import(moduleUrl("src/modules/video-analysis/services/multiAngleSyncService.js"));
  const angle = {
    id: "tactical-angle",
    syncOffsetMs: 1250,
    driftPpm: 100,
    durationMs: 120000,
    status: "available",
  };
  const angleTime = sync.matchTimeToAngleTime(60000, angle);
  expect(angleTime).toBe(61256);
  expect(sync.angleTimeToMatchTime(angleTime, angle)).toBe(60000);
  expect(sync.correctedAngleSync(angle, 10000, 11200)).toMatchObject({
    syncOffsetMs: 1200,
    syncConfidence: 0.8,
  });
});

test("timeline workspaces support multiple timelines and batch row operations", async () => {
  const timelineService = await import(moduleUrl("src/modules/video-analysis/services/timelineWorkspaceService.js"));
  const timeline = {
    id: "analysis",
    title: "Team analysis",
    rows: [
      { id: "press", label: "High press", kind: "coding", clipIds: ["clip-1", "clip-2"] },
      { id: "build", label: "Build up", kind: "coding", clipIds: [] },
    ],
  };
  const duplicated = timelineService.duplicateTimelineRows(timeline, ["press"]);
  expect(duplicated.rows.map((row) => row.id)).toEqual(["press", "press-copy", "build"]);

  const moved = timelineService.moveClipsBetweenTimelineRows(timeline, ["clip-1"], "press", "build");
  expect(moved.rows.find((row) => row.id === "press").clipIds).toEqual(["clip-2"]);
  expect(moved.rows.find((row) => row.id === "build").clipIds).toEqual(["clip-1"]);

  const workspace = timelineService.addAnalysisTimeline({ timelines: [timeline] }, {
    id: "opponent",
    title: "Opponent analysis",
  });
  expect(workspace.timelines).toHaveLength(2);
  expect(workspace.activeTimelineId).toBe("opponent");
});

test("local processing security rejects wildcard origins and scopes sessions", async () => {
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const security = await import(moduleUrl("desktop/local-video-app/local-video-server/security.mjs"));
  const config = configModule.createLocalVideoServerConfig({}, { homeDir: "/tmp" });
  const sessions = security.createBridgeSessionStore({ ttlMs: 60_000 });
  const session = sessions.issue("https://footballscience.xyz");

  expect(config.allowedOrigins).toContain("https://footballscience.xyz");
  expect(config.allowedOrigins).not.toContain("*");
  expect(configModule.isAllowedOrigin("https://evil.example", config)).toBe(false);
  expect(configModule.isAllowedOrigin("http://localhost:4175", config)).toBe(true);
  expect(sessions.validate(session.token, "https://footballscience.xyz")).toBe(true);
  expect(sessions.validate(session.token, "https://evil.example")).toBe(false);
});

test("local processing CORS permits every FS Player bridge request header", async () => {
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const security = await import(moduleUrl("desktop/local-video-app/local-video-server/security.mjs"));
  const servicesDir = path.join(rootDir, "src/modules/video-analysis/services");
  const serviceFiles = (await fs.readdir(servicesDir))
    .filter((fileName) => /^local.*Service\.js$/.test(fileName));
  const requestedHeaders = new Set();
  for (const fileName of serviceFiles) {
    const source = await fs.readFile(path.join(servicesDir, fileName), "utf8");
    for (const header of source.match(/x-football-science-[a-z-]+/g) || []) requestedHeaders.add(header);
  }
  const config = configModule.createLocalVideoServerConfig({}, { homeDir: "/tmp" });
  const headers = security.corsHeaders({ headers: { origin: "https://footballscience.xyz" } }, config);
  const allowedHeaders = new Set(headers["access-control-allow-headers"].split(","));

  expect([...requestedHeaders].filter((header) => !allowedHeaders.has(header))).toEqual([]);
});

test("local processing job manager enforces concurrency, progress and cancellation", async () => {
  const jobsModule = await import(moduleUrl("desktop/local-video-app/local-video-server/processing-job-manager.mjs"));
  const manager = jobsModule.createProcessingJobManager({ concurrency: 1 });
  const releases = [];
  const first = manager.create("tracking");
  const second = manager.create("export");
  manager.enqueue(first.id, ({ reportProgress }) => new Promise((resolve) => {
    reportProgress({ stage: "tracking", ratio: 0.4 });
    releases.push(() => resolve({ trackCount: 2 }));
  }));
  manager.enqueue(second.id, async () => ({ exportPath: "local" }));

  await expect.poll(() => manager.stats()).toMatchObject({ active: 1, queued: 1 });
  expect(manager.get(first.id)).toMatchObject({ status: "running", stage: "tracking" });
  expect(manager.cancel(second.id)).toBe(true);
  expect((await manager.wait(second.id)).status).toBe("cancelled");
  releases[0]();
  expect(await manager.wait(first.id)).toMatchObject({
    status: "succeeded",
    result: { trackCount: 2 },
  });
});

test("secure local video server issues sessions, processes a job and serves byte ranges", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-local-video-test-"));
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 1024,
    maxCacheBytes: 4096,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 2,
  };
  const engine = {
    async preparePlaybackCopy(inputPath, outputPath, requestedMode, options) {
      options.onProgress?.({ stage: "processing", processedMs: 100 });
      await fs.copyFile(inputPath, outputPath);
      return { mode: requestedMode === "transcode" ? "transcode" : "remux" };
    },
  };
  const localServer = serverModule.createLocalVideoServer({ config, engine });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const trustedHeaders = { origin: "https://footballscience.xyz" };

    const rejected = await fetch(`${baseUrl}/health`, { headers: { origin: "https://evil.example" } });
    expect(rejected.status).toBe(403);

    const sessionResponse = await fetch(`${baseUrl}/session`, { method: "POST", headers: trustedHeaders });
    const session = await sessionResponse.json();
    expect(sessionResponse.status).toBe(201);
    expect(session.sessionToken).toBeTruthy();

    const unauthorized = await fetch(`${baseUrl}/transcode`, {
      method: "POST",
      headers: trustedHeaders,
      body: Buffer.from("video"),
    });
    expect(unauthorized.status).toBe(401);

    const preparedResponse = await fetch(`${baseUrl}/transcode`, {
      method: "POST",
      headers: {
        ...trustedHeaders,
        "x-football-science-session": session.sessionToken,
        "x-football-science-file-name": "match.mov",
        "x-football-science-prepare-mode": "auto",
      },
      body: Buffer.from("0123456789"),
    });
    const prepared = await preparedResponse.json();
    expect(preparedResponse.status).toBe(200);
    expect(prepared).toMatchObject({ ok: true, mode: "remux" });
    expect(prepared.playbackUrl).toContain("access=");

    const rangeResponse = await fetch(prepared.playbackUrl, {
      headers: { ...trustedHeaders, range: "bytes=2-5" },
    });
    expect(rangeResponse.status).toBe(206);
    expect(await rangeResponse.text()).toBe("2345");
    expect(rangeResponse.headers.get("access-control-allow-origin")).toBe("https://footballscience.xyz");
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
