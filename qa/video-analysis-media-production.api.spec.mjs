import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
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

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test("multi-angle playback preserves match time while source clocks differ", async () => {
  const media = await import(moduleUrl("src/modules/video-analysis/services/mediaProductionService.js"));
  const state = {
    match: { id: "match-1" },
    video: { id: "video-primary", duration_ms: 600_000 },
    source: { id: "source-primary", local_video_identifier: "local-primary" },
    videoRef: { objectUrl: "blob:primary", localVideoIdentifier: "local-primary", durationMs: 600_000 },
    mediaProduction: {
      ...media.createInitialMediaProductionState(),
      activeAngleId: "angle-tactical",
      angles: [{
        id: "angle-tactical",
        label: "Tactical",
        role: "tactical",
        localVideoIdentifier: "local-tactical",
        syncOffsetMs: 2400,
        driftPpm: 100,
        durationMs: 610_000,
      }],
      angleRefs: {
        "angle-tactical": { objectUrl: "blob:tactical", localVideoIdentifier: "local-tactical" },
      },
    },
  };
  const tacticalMs = media.activeVideoTimeFromMatchMs(state, 120_000);
  expect(tacticalMs).toBe(122412);
  expect(media.matchTimeFromActiveVideoMs(state, tacticalMs)).toBe(120_000);
  expect(media.activeMediaReference(state).objectUrl).toBe("blob:tactical");
  expect(media.mediaAnglesForState(state)).toHaveLength(2);
  expect(media.mediaAnglesForState(state).filter((angle) => angle.primary)).toHaveLength(1);
});

test("primary metadata revisions survive local reference refreshes", async () => {
  const media = await import(moduleUrl("src/modules/video-analysis/services/mediaProductionService.js"));
  const state = {
    match: { id: "match-1" },
    video: { id: "video-primary" },
    source: { id: "source-primary", local_video_identifier: "local-primary" },
    videoRef: {
      objectUrl: "blob:primary",
      displayName: "device-file.mp4",
      localVideoIdentifier: "local-primary",
      durationMs: 600_000,
    },
    mediaProduction: {
      ...media.createInitialMediaProductionState(),
      angles: [{
        id: "persisted-primary",
        matchId: "match-1",
        videoId: "video-primary",
        sourceId: "source-primary",
        label: "Broadcast wide",
        role: "broadcast",
        localVideoIdentifier: "local-primary",
        syncOffsetMs: 125,
        revision: 4,
        primary: true,
      }],
    },
  };
  expect(media.mediaAnglesForState(state)[0]).toMatchObject({
    id: "persisted-primary",
    label: "Broadcast wide",
    role: "broadcast",
    revision: 4,
    durationMs: 600_000,
    status: "available",
    primary: true,
  });
});

test("active secondary duration updates stay isolated from the primary source", async () => {
  const playbackState = await import(moduleUrl("src/modules/video-analysis/services/mediaPlaybackStateService.js"));
  const state = {
    videoRef: { objectUrl: "blob:primary", localVideoIdentifier: "primary", durationMs: 60_000 },
    mediaProduction: {
      activeAngleId: "angle-tactical",
      angles: [{ id: "angle-tactical", label: "Tactical", role: "tactical", durationMs: 10_000 }],
      angleRefs: { "angle-tactical": { objectUrl: "blob:tactical", durationMs: 10_000 } },
    },
  };
  const next = playbackState.updateActiveMediaDurationState(state, 48_000);
  expect(next.videoRef.durationMs).toBe(60_000);
  expect(next.mediaProduction.angles.find((angle) => angle.id === "angle-tactical")?.durationMs).toBe(48_000);
  expect(next.mediaProduction.angleRefs["angle-tactical"].durationMs).toBe(48_000);
});

test("timeline seeks use camera time while committed state remains match time", async () => {
  const timeline = await import(moduleUrl("src/modules/video-analysis/timeline/timeline.interaction.js"));
  let state = { videoRef: { durationMs: 60_000 }, timeline: { playheadMs: 0 } };
  let stateUpdates = 0;
  const video = { currentTime: 0 };
  const controller = timeline.createTimelineScrubController({
    getRoot: () => ({ querySelectorAll: () => [] }),
    getState: () => state,
    getVideoElement: () => video,
    timelineToVideoMs: (matchMs) => matchMs + 2400,
    videoToTimelineMs: (videoMs) => videoMs - 2400,
    updateState: (updater) => {
      stateUpdates += 1;
      state = updater(state);
    },
  });
  expect(controller.seekToMs(0, { commit: true })).toBe(0);
  expect(stateUpdates).toBe(0);
  expect(controller.seekToMs(12_000, { commit: true })).toBe(12_000);
  expect(video.currentTime).toBe(14.4);
  expect(state.timeline.playheadMs).toBe(12_000);
  expect(stateUpdates).toBe(1);
});

test("export manifest is deterministic, bounded metadata and never embeds local URLs", async () => {
  const media = await import(moduleUrl("src/modules/video-analysis/services/mediaProductionService.js"));
  const state = {
    match: { id: "match-1" },
    video: { id: "video-1" },
    source: { id: "source-1" },
    videoRef: {
      objectUrl: "blob:https://footballscience.xyz/device-secret",
      localVideoIdentifier: "local-video-fingerprint",
      durationMs: 90_000,
    },
    timeline: { playheadMs: 3000 },
    mediaProduction: {
      ...media.createInitialMediaProductionState(),
      replay: { inMs: 3000, outMs: 18_000, loop: true },
    },
    presentation: {
      current: {
        id: "presentation-1",
        sections: [{ id: "section-1", items: [{
          id: "item-1",
          clipId: "clip-1",
          drawings: [{ id: "drawing-1" }],
          dynamicGraphics: [{ id: "graphic-1" }],
          objectTracks: [{ id: "track-1" }],
        }] }],
      },
      selectedItemId: "item-1",
      spatial: { calibration: { id: "calibration-1" } },
    },
  };
  const manifest = media.buildMediaExportManifest(state, {
    exportId: "export-1",
    title: "Unit distances",
    preset: "master-2160p",
  });
  expect(manifest).toMatchObject({
    exportId: "export-1",
    range: { startMs: 3000, endMs: 18_000 },
    preset: "master-2160p",
    analysis: { drawingLayerCount: 1, dynamicGraphicCount: 1, objectTrackCount: 1 },
  });
  expect(JSON.stringify(manifest)).not.toContain("blob:");
  expect(JSON.stringify(manifest)).not.toContain("device-secret");
  expect(media.stableManifestJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  expect(await media.manifestSha256(manifest)).toMatch(/^[a-f0-9]{64}$/);
});

test("media metadata contracts reject artifact locators and migration is service-role only", async () => {
  const contracts = require(path.join(rootDir, "api/_lib/video-analysis-media-contracts.js"));
  const actor = { id: "analyst-1", clubId: "club-1", teamId: "team-1" };
  const angle = contracts.normalizeMediaAnglePayload({
    matchId: "11111111-1111-4111-8111-111111111111",
    videoId: "22222222-2222-4222-8222-222222222222",
    sourceId: "33333333-3333-4333-8333-333333333333",
    label: "Tactical wide",
    role: "tactical",
    syncOffsetMs: 2250,
    driftPpm: 80,
    primary: false,
  }, actor);
  expect(angle).toMatchObject({
    organizationId: "club-1",
    teamId: "team-1",
    role: "tactical",
    syncOffsetMs: 2250,
    driftPpm: 80,
  });
  expect(() => contracts.normalizeExportManifestPayload({
    matchId: angle.matchId,
    videoId: angle.videoId,
    sourceId: angle.sourceId,
    startMs: 0,
    endMs: 5000,
    manifestSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    downloadUrl: "http://127.0.0.1:47831/exports/device-file.mp4",
  }, actor)).toThrow(/device-local export URLs/i);
  const migration = await fs.readFile(path.join(rootDir, "supabase/migrations/20260825013000_video_analysis_media_production.sql"), "utf8");
  for (const table of ["video_media_angles", "video_export_manifests"]) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }
  expect(migration).not.toMatch(/grant\s+.+\s+to\s+(?:anon|authenticated)/i);
  expect(migration).not.toMatch(/(?:artifact_url|download_url|manifest_url|video_blob|video_bytes|local_video_path|file_path)/i);
  const api = await fs.readFile(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  expect(api).toContain('action === "media-workspace"');
  expect(api).toContain('action === "save-media-angle"');
  expect(api).toContain('action === "save-export-manifest"');
});

test("secure local media export renders a checksummed MP4 behind expiring access", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-media-export-test-"));
  const sourceBytes = Buffer.from("device-local-match-video");
  const renderedBytes = Buffer.from("rendered-football-science-mp4");
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 4096,
    maxCacheBytes: 16384,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 2,
    maxExportDurationMs: 60_000,
  };
  let receivedSpecification = null;
  let receivedOverlayAss = "";
  const engine = {
    async renderExport(inputPath, outputPath, specification, options = {}) {
      expect(await fs.readFile(inputPath)).toEqual(sourceBytes);
      receivedSpecification = specification;
      if (specification.overlayPath) receivedOverlayAss = await fs.readFile(specification.overlayPath, "utf8");
      options.onProgress?.({ stage: "rendering", processedMs: 2500, ratio: 0.5 });
      await fs.writeFile(outputPath, renderedBytes);
      return {
        startMs: specification.startMs,
        endMs: specification.endMs,
        durationMs: specification.endMs - specification.startMs,
        height: specification.height,
        codec: "h264",
        container: "mp4",
      };
    },
    async preparePlaybackCopy() {
      return { mode: "remux" };
    },
  };
  const localServer = serverModule.createLocalVideoServer({ config, engine });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const sessionResponse = await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } });
    const session = await sessionResponse.json();
    const headers = { origin, "x-football-science-session": session.sessionToken };
    const capabilities = await (await fetch(`${baseUrl}/capabilities`, { headers })).json();
    expect(capabilities.capabilities).toContain("render-export");
    expect(capabilities.capabilities).toContain("render-overlay");

    const overlaySpec = {
      schema: "football-science-render-overlay-v1",
      playRes: { width: 1920, height: 1080 },
      range: { startMs: 1000, endMs: 6000 },
      primitives: [{
        id: "drawing-1",
        type: "ellipse",
        startMs: 0,
        endMs: 5000,
        center: { x: 0.5, y: 0.5 },
        radiusX: 0.05,
        radiusY: 0.08,
        style: { color: "#f7d154", lineWidth: 4, opacity: 0.95, fillOpacity: 0.15 },
      }],
    };
    const overlayResponse = await fetch(`${baseUrl}/assets/render-overlay`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(overlaySpec),
    });
    const overlay = (await overlayResponse.json()).overlay;
    expect(overlayResponse.status).toBe(201);
    expect(overlay).toMatchObject({ primitiveCount: 1 });

    const specification = {
      exportId: "export-local-1",
      title: "Pressing review",
      startMs: 1000,
      endMs: 6000,
      preset: "analysis-1080p",
      sourceIdentifier: "local-video-fingerprint",
      angleId: "angle-primary",
      overlayAssetId: overlay.id,
      overlaySha256: overlay.sha256,
      manifestSha256: "a".repeat(64),
      analysis: { drawingLayerCount: 1, compositePrimitiveCount: 1, compositeMode: "burn-in", overlaySha256: overlay.sha256 },
    };
    const queuedResponse = await fetch(`${baseUrl}/jobs/render-export`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "video/mp4",
        "x-football-science-file-name": "match.mp4",
        "x-football-science-export-spec": encoded(specification),
      },
      body: sourceBytes,
    });
    const queued = await queuedResponse.json();
    expect(queuedResponse.status).toBe(202);
    await expect.poll(async () => (await (await fetch(queued.statusUrl, { headers })).json()).job?.status).toBe("succeeded");
    const completed = await (await fetch(queued.statusUrl, { headers })).json();
    expect(receivedSpecification).toMatchObject({ startMs: 1000, endMs: 6000, height: 1080 });
    expect(receivedSpecification).not.toHaveProperty("path");
    expect(receivedSpecification.overlayPath).toMatch(/overlay\.ass$/);
    expect(receivedOverlayAss).toContain("[Events]");
    expect(receivedOverlayAss).toContain("Dialogue:");
    expect(completed.job.result).toMatchObject({
      fileName: "Pressing review.mp4",
      sizeBytes: renderedBytes.length,
      sha256: createHash("sha256").update(renderedBytes).digest("hex"),
    });

    const renderedResponse = await fetch(completed.job.result.downloadUrl, { headers: { origin } });
    expect(renderedResponse.status).toBe(200);
    expect(Buffer.from(await renderedResponse.arrayBuffer())).toEqual(renderedBytes);
    expect(renderedResponse.headers.get("content-disposition")).toContain("attachment");
    const manifestResponse = await fetch(completed.job.result.manifestUrl, { headers: { origin } });
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      schema: "football-science-local-export-v1",
      sourceIdentifier: "local-video-fingerprint",
      analysis: { angleLabel: "", drawingLayerCount: 1, compositePrimitiveCount: 1, compositeMode: "burn-in" },
      composite: { mode: "burn-in", primitiveCount: 1, overlaySha256: overlay.sha256 },
      output: { sizeBytes: renderedBytes.length, codec: "h264", container: "mp4" },
    });
    expect(JSON.stringify(manifest)).not.toContain(cacheDir);
    expect((await fetch(completed.job.result.downloadUrl, { headers: { origin: "https://attacker.invalid" } })).status).toBe(403);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("local media export rejects unbounded ranges before creating a job", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-media-export-limit-test-"));
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxExportDurationMs: 5000,
  };
  const localServer = serverModule.createLocalVideoServer({
    config,
    engine: { renderExport: async () => ({}), preparePlaybackCopy: async () => ({ mode: "remux" }) },
  });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const response = await fetch(`${baseUrl}/jobs/render-export`, {
      method: "POST",
      headers: {
        origin,
        "x-football-science-session": session.sessionToken,
        "x-football-science-file-name": "match.mp4",
        "x-football-science-export-spec": encoded({ startMs: 0, endMs: 5001 }),
      },
      body: Buffer.from("video"),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(localServer.jobs.stats()).toMatchObject({ active: 0, queued: 0, retained: 0 });
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
