import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

function verifiedCalibration() {
  return {
    status: "verified",
    confidence: 0.96,
    frames: [{
      atMs: 0,
      validFromMs: 0,
      validToMs: 5000,
      inputSpace: "normalized-image",
      imageToPitchMatrix: [105, 0, 0, 0, 68, 0, 0, 0, 1],
      confidence: 0.96,
      rmsErrorM: 0.3,
      controlPointCount: 8,
    }],
  };
}

test("manual tracking corrections preserve identity and enforce review before verification", async () => {
  const review = await import(moduleUrl("src/modules/video-analysis/services/trackingReviewService.js"));
  const first = review.createManualPromptTrack({
    id: "track-8",
    clipId: "clip-1",
    playerId: "player-8",
    playerLabel: "Player 8",
    startMs: 1000,
    endMs: 3000,
    box: { left: 0.2, top: 0.3, width: 0.08, height: 0.18 },
  });
  expect(review.trackingReviewSummary(first).canVerify).toBe(false);
  const corrected = review.applyManualTrackingCorrection(first, {
    atMs: 3000,
    box: { left: 0.4, top: 0.32, width: 0.08, height: 0.18 },
  });
  expect(corrected.corrections).toHaveLength(1);
  expect(review.trackingReviewSummary(corrected)).toMatchObject({ canVerify: true, lowIdentityCount: 0 });
  expect(review.verifyObjectTrack(corrected).status).toBe("verified");
  const metadata = review.trackingMetadataPayload(corrected);
  expect(metadata).toMatchObject({ pointCount: 2, segmentCount: 1, playerId: "player-8" });
  expect(metadata).not.toHaveProperty("segments");
});

test("dynamic highlights follow tracks and metres remain gated by verified calibration", async () => {
  const graphics = await import(moduleUrl("src/modules/video-analysis/services/dynamicGraphicRenderService.js"));
  const tracks = [
    {
      id: "track-a",
      entityType: "player",
      status: "verified",
      startMs: 0,
      endMs: 1000,
      segments: [{ startMs: 0, endMs: 1000, points: [
        { atMs: 0, x: 0.1, y: 0.5, groundX: 0.1, groundY: 0.5, confidence: 0.95, identityConfidence: 0.95 },
        { atMs: 1000, x: 0.3, y: 0.5, groundX: 0.3, groundY: 0.5, confidence: 0.95, identityConfidence: 0.95 },
      ] }],
    },
    {
      id: "track-b",
      entityType: "player",
      status: "verified",
      startMs: 0,
      endMs: 1000,
      segments: [{ startMs: 0, endMs: 1000, points: [
        { atMs: 0, x: 0.4, y: 0.5, groundX: 0.4, groundY: 0.5, confidence: 0.95, identityConfidence: 0.95 },
        { atMs: 1000, x: 0.5, y: 0.5, groundX: 0.5, groundY: 0.5, confidence: 0.95, identityConfidence: 0.95 },
      ] }],
    },
  ];
  const highlight = graphics.resolveDynamicGraphic({
    id: "highlight",
    type: "circle",
    source: "tracking",
    startMs: 0,
    endMs: 1000,
    bindings: [{ trackId: "track-a", anchor: "ground" }],
  }, tracks, 500);
  expect(highlight.anchor.x).toBeCloseTo(0.2, 5);

  const distanceGraphic = {
    id: "distance",
    type: "distance",
    source: "spatial",
    startMs: 0,
    endMs: 1000,
    bindings: [{ trackId: "track-a" }, { trackId: "track-b" }],
  };
  expect(graphics.resolveDynamicGraphic(distanceGraphic, tracks, 0, {
    calibration: { ...verifiedCalibration(), status: "draft" },
  })).toMatchObject({ distanceM: null, requiresCalibration: true });
  expect(graphics.resolveDynamicGraphic(distanceGraphic, tracks, 0, {
    calibration: verifiedCalibration(),
  }).distanceM).toBeCloseTo(31.5, 1);
});

test("idle tracking leaves pointer completion to drawing and timeline controllers", async () => {
  const { createTrackingController } = await import(moduleUrl("src/modules/video-analysis/controllers/trackingController.js"));
  const controller = createTrackingController();
  const result = controller.finishInteraction({});
  expect(result).toBe(false);
  expect(result).not.toBeInstanceOf(Promise);
});

test("tracking metadata API rejects dense samples and migration remains service-role scoped", async () => {
  const database = require(path.join(rootDir, "api/_lib/video-analysis-tracking-database.js"));
  expect(() => database.normalizeTrackPayload({
    clipId: "11111111-1111-4111-8111-111111111111",
    startMs: 0,
    endMs: 1000,
    segments: [{ points: [{ x: 0.2, y: 0.3 }] }],
  }, { organizationId: "club-a", teamId: "team-a", id: "analyst-a" })).toThrow(/device/i);
  const migration = await read("supabase/migrations/20260824233000_video_analysis_tracking_telestration.sql");
  for (const table of ["video_object_tracks", "video_track_corrections", "video_dynamic_graphics"]) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }
  expect(migration).not.toMatch(/grant\s+.+\s+to\s+(?:anon|authenticated)/i);
  expect(migration).not.toMatch(/(?:video_blob|video_bytes|local_video_path|file_path)/i);
  const api = await read("api/_lib/video-analysis-database.js");
  expect(api).toContain('action === "tracking-workspace"');
  expect(api).toContain('action === "save-object-track"');
  expect(api).toContain('action === "save-dynamic-graphic"');
});

test("secure local tracking jobs expose provider capability and expiring artifacts", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const engineModule = await import(moduleUrl("desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tracking-test-"));
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 4096,
    maxCacheBytes: 16384,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 2,
  };
  const trackingEngine = engineModule.createTrackingEngineAdapter({
    engineName: "qa-prompt-tracker",
    runner: async ({ prompt, onProgress }) => {
      onProgress?.({ stage: "tracking", ratio: 0.7 });
      return {
        id: "track-local",
        entityType: "player",
        status: "review",
        startMs: prompt.startMs,
        endMs: prompt.endMs,
        confidence: 0.94,
        identityConfidence: 0.9,
        segments: [{
          startMs: prompt.startMs,
          endMs: prompt.endMs,
          points: [
            { atMs: prompt.startMs, x: 0.2, y: 0.4, groundX: 0.2, groundY: 0.5, confidence: 0.94, identityConfidence: 0.9 },
            { atMs: prompt.endMs, x: 0.3, y: 0.4, groundX: 0.3, groundY: 0.5, confidence: 0.92, identityConfidence: 0.88 },
          ],
        }],
      };
    },
  });
  const localServer = serverModule.createLocalVideoServer({
    config,
    trackingEngine,
    engine: { preparePlaybackCopy: async () => ({ mode: "remux" }) },
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const headers = { origin, "x-football-science-session": session.sessionToken };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toContain("track-object");
    const prompt = Buffer.from(JSON.stringify({
      startMs: 0,
      endMs: 1000,
      box: { left: 0.2, top: 0.3, width: 0.08, height: 0.2 },
    })).toString("base64url");
    const queuedResponse = await fetch(`${baseUrl}/jobs/track-object`, {
      method: "POST",
      headers: { ...headers, "x-football-science-file-name": "match.mp4", "x-football-science-tracking-prompt": prompt },
      body: Buffer.from("local-video"),
    });
    const queued = await queuedResponse.json();
    expect(queuedResponse.status).toBe(202);
    await expect.poll(async () => (await (await fetch(queued.statusUrl, { headers })).json()).job?.status).toBe("succeeded");
    const completed = await (await fetch(queued.statusUrl, { headers })).json();
    const artifact = await (await fetch(completed.job.result.trackingUrl, { headers: { origin } })).json();
    expect(artifact.segments[0].points).toHaveLength(2);
    expect(completed.job.result).toMatchObject({ engine: "qa-prompt-tracker", pointCount: 2, segmentCount: 1 });
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
