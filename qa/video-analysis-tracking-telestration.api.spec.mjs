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
  expect(review.trackingReviewSummary(first)).toMatchObject({
    canVerify: false,
    issues: ["Add at least two tracking points"],
  });
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

test("local tracking exposes cancellation and clears an aborted job without a false error", async () => {
  const { createTrackingController } = await import(moduleUrl("src/modules/video-analysis/controllers/trackingController.js"));
  const { renderTrackingSidebar } = await import(moduleUrl("src/modules/video-analysis/components/TrackingTelestration.js"));
  const item = {
    id: "item-1",
    clipId: "clip-1",
    clip: { id: "clip-1", videoId: "video-1", startMs: 0, endMs: 3000 },
    objectTracks: [],
    dynamicGraphics: [],
  };
  let activeSignal = null;
  let state = {
    video: { id: "video-1" },
    videoRef: { kind: "local-file", localFileKey: "video-1" },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        tool: "highlight",
        selectedTrackIds: [],
        prompt: {
          startMs: 0,
          endMs: 3000,
          promptAtMs: 1000,
          box: { left: 0.2, top: 0.2, width: 0.1, height: 0.25 },
        },
        job: null,
        error: "",
      },
    },
  };
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    trackObject: ({ signal }) => new Promise((resolve, reject) => {
      activeSignal = signal;
      signal.addEventListener("abort", () => {
        const error = new Error("Tracking was cancelled.");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  const actionEvent = (action) => ({
    target: {
      nodeType: 1,
      closest: (selector) => selector === "[data-video-analysis-tracking-action]"
        ? { dataset: { videoAnalysisTrackingAction: action } }
        : null,
    },
  });

  expect(controller.handleClick(actionEvent("run"))).toBe(true);
  expect(activeSignal?.aborted).toBe(false);
  expect(renderTrackingSidebar(state, item)).toContain('data-video-analysis-tracking-action="cancel"');
  expect(controller.handleClick(actionEvent("cancel"))).toBe(true);
  expect(activeSignal.aborted).toBe(true);
  await expect.poll(() => state.presentation.tracking.job).toBeNull();
  expect(state.presentation.tracking.error).toBe("");
});

test("local tracking readiness distinguishes installed, missing and offline providers", async () => {
  const localTracking = await import(moduleUrl("src/modules/video-analysis/services/localTrackingService.js"));
  function providerWindow(port, capabilities = [], offline = false) {
    const baseUrl = `http://127.0.0.1:${port}`;
    return {
      FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: baseUrl,
      fetch: async (url) => {
        if (offline) throw new Error("Companion unavailable");
        const parsed = new URL(url);
        if (parsed.pathname === "/session") {
          return Response.json({ sessionToken: `session-${port}`, expiresAt: "2099-01-01T00:00:00.000Z" }, { status: 201 });
        }
        return Response.json({
          capabilities,
          limits: { maxTrackingDurationMs: 90_000 },
          trackingProvider: {
            available: capabilities.includes("track-object"),
            engineName: "Football Science SAM 2.1 Player Tracker",
            engineVersion: "1.0.0",
            source: capabilities.includes("track-object") ? "approved-packaged" : "none",
          },
        });
      },
    };
  }

  await expect(localTracking.inspectLocalTrackingProvider(providerWindow(47911, ["track-object"]))).resolves.toMatchObject({
    status: "ready",
    available: true,
    source: "approved-packaged",
    maxDurationMs: 90_000,
  });
  await expect(localTracking.inspectLocalTrackingProvider(providerWindow(47912))).resolves.toMatchObject({
    status: "not-installed",
    available: false,
  });
  await expect(localTracking.inspectLocalTrackingProvider(providerWindow(47913, [], true))).resolves.toMatchObject({
    status: "offline",
    available: false,
    error: "Companion unavailable",
  });

  const { renderTrackingSidebar } = await import(moduleUrl("src/modules/video-analysis/components/TrackingTelestration.js"));
  const sidebar = renderTrackingSidebar({
    players: [],
    presentation: {
      tracking: {
        mode: "tracking",
        provider: { status: "not-installed", available: false },
        prompt: { startMs: 0, endMs: 1000, box: { left: 0.2, top: 0.2, width: 0.1, height: 0.2 } },
      },
    },
  }, { id: "item-1", clipId: "clip-1", objectTracks: [], dynamicGraphics: [] });
  expect(sidebar).toContain("Provider not installed");
  expect(sidebar).toMatch(/data-video-analysis-tracking-action="run" disabled/);
  expect(sidebar).toMatch(/data-video-analysis-tracking-action="manual" >Manual keyframe/);
});

test("stale local tracking sources fall back once to the reconnected file", async () => {
  const localVideo = await import(moduleUrl("src/modules/video-analysis/services/localVideoBridgeService.js"));
  const localTracking = await import(moduleUrl("src/modules/video-analysis/services/localTrackingService.js"));
  const sourceArtifactId = "11111111-1111-4111-8111-111111111111";
  const requests = [];
  const win = {
    FOOTBALL_SCIENCE_LOCAL_VIDEO_BRIDGE_URL: "http://127.0.0.1:47924",
    URL: { createObjectURL: () => "blob:tracking-source", revokeObjectURL: () => {} },
    btoa: globalThis.btoa,
    document: { createElement: () => ({ canPlayType: () => "probably" }) },
    setTimeout,
    fetch: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/session") {
        return Response.json({ sessionToken: "tracking-session", expiresAt: "2099-01-01T00:00:00.000Z" }, { status: 201 });
      }
      if (parsed.pathname === "/capabilities") {
        return Response.json({ capabilities: ["track-object"] });
      }
      if (parsed.pathname === "/jobs/track-object") {
        requests.push(options);
        if (options.headers["x-football-science-tracking-source-id"]) {
          return Response.json({ error: "Source expired" }, { status: 404 });
        }
        return Response.json({ statusUrl: "http://127.0.0.1:47924/jobs/fresh" }, { status: 202 });
      }
      if (parsed.pathname === "/jobs/fresh") {
        return Response.json({ job: { status: "succeeded", result: {
          artifactId: "fresh-artifact",
          sourceArtifactId: "fresh-source",
          trackingUrl: "http://127.0.0.1:47924/tracking/fresh/track.json",
        } } });
      }
      if (parsed.pathname === "/tracking/fresh/track.json") {
        return Response.json({
          id: "fresh-track",
          entityType: "player",
          startMs: 0,
          endMs: 1000,
          segments: [{ startMs: 0, endMs: 1000, points: [
            { atMs: 0, x: 0.2, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
            { atMs: 1000, x: 0.3, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
          ] }],
        });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  };
  const file = new File(["local-video"], "match.mp4", { type: "video/mp4", lastModified: 1 });
  const videoRef = await localVideo.createLocalVideoReference(file, win);
  try {
    const track = await localTracking.trackLocalObject({
      win,
      videoRef,
      clipId: "clip-1",
      videoId: "video-1",
      sourceArtifactId,
      prompt: {
        startMs: 0,
        endMs: 1000,
        promptAtMs: 0,
        box: { left: 0.2, top: 0.3, width: 0.1, height: 0.2 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].headers["x-football-science-tracking-source-id"]).toBe(sourceArtifactId);
    expect(requests[0].body).toBeUndefined();
    expect(requests[1].headers).not.toHaveProperty("x-football-science-tracking-source-id");
    expect(requests[1].body).toBe(file);
    expect(track.metadata).toMatchObject({
      localArtifactId: "fresh-artifact",
      localSourceArtifactId: "fresh-source",
    });
  } finally {
    localVideo.revokeLocalVideoReference(videoRef, win);
  }
});

test("tracking progress maps local job snapshots and exposes stable elapsed-time telemetry", async () => {
  const localTracking = await import(moduleUrl("src/modules/video-analysis/services/localTrackingService.js"));
  const progress = await import(moduleUrl("src/modules/video-analysis/services/trackingProgressService.js"));
  const startedAt = "2026-08-25T12:00:00.000Z";
  expect(localTracking.normalizeLocalTrackingJobProgress({
    status: "running",
    stage: "Tracking player",
    startedAt,
    progress: { ratio: 0.64, processedFrames: 16, totalFrames: 25, device: "mps", sampleFps: 12.5 },
  })).toEqual({
    stage: "Tracking player",
    ratio: 0.64,
    startedAt,
    processedFrames: 16,
    totalFrames: 25,
    device: "mps",
    sampleFps: 12.5,
  });
  expect(localTracking.normalizeLocalTrackingJobProgress({ progress: 0.5 })).toMatchObject({ ratio: 0.5 });

  const first = progress.normalizeTrackingJobProgress({
    stage: "Tracking player",
    ratio: 0.64,
    startedAt,
    processedFrames: 16,
    totalFrames: 25,
  }, {}, { nowMs: Date.parse(startedAt) + 64_000 });
  expect(first).toMatchObject({ progress: 0.64, elapsedMs: 64_000, estimatedRemainingMs: 36_000 });
  const stale = progress.normalizeTrackingJobProgress({ ratio: 0.4 }, first, {
    nowMs: Date.parse(startedAt) + 70_000,
  });
  expect(stale.progress).toBe(0.64);
  expect(stale.elapsedMs).toBe(70_000);
  expect(progress.formatTrackingDuration(stale.elapsedMs)).toBe("1m 10s");
});

test("long tracking ranges chunk safely and merge continuations into one player identity", async () => {
  const extension = await import(moduleUrl("src/modules/video-analysis/services/trackingExtensionService.js"));
  const chunk = extension.initialTrackingPromptChunk({
    startMs: 0,
    endMs: 300_000,
    promptAtMs: 150_000,
    playerId: "player-8",
    box: { left: 0.2, top: 0.2, width: 0.1, height: 0.25 },
  });
  expect(chunk).toMatchObject({ startMs: 90_000, endMs: 210_000, promptAtMs: 150_000 });
  expect(chunk.endMs - chunk.startMs).toBe(120_000);

  const base = {
    id: "track-8",
    clipId: "clip-1",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    playerLabel: "Player 8",
    status: "review",
    startMs: 90_000,
    endMs: 210_000,
    engine: "sam2.1-hiera-tiny",
    metadata: { localArtifactId: "artifact-a", localSourceArtifactId: "source-a" },
    segments: [{ startMs: 90_000, endMs: 210_000, points: [
      { atMs: 90_000, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 210_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.88, identityConfidence: 0.86 },
    ] }],
  };
  expect(extension.trackingExtensionAvailability(base, { startMs: 0, endMs: 300_000 })).toMatchObject({
    earlier: true,
    later: true,
    trackedStartMs: 90_000,
    trackedEndMs: 210_000,
  });
  expect(extension.trackingContinuationSteps(base, { startMs: 0, endMs: 300_000 })).toEqual({
    earlier: 1,
    later: 1,
    total: 2,
  });
  expect(extension.trackingContinuationProgress({ stage: "tracking", ratio: 0.5 }, {
    completed: 1,
    total: 2,
    startedAtMs: 1234,
  })).toMatchObject({ stage: "Complete range 2/2: tracking", ratio: 0.75, startedAtMs: 1234 });
  expect(extension.trackingExtensionPrompt(base, { startMs: 0, endMs: 300_000 }, "later")).toMatchObject({
    startMs: 209_000,
    endMs: 300_000,
    promptAtMs: 210_000,
    playerId: "player-8",
  });

  const continued = extension.mergeTrackingExtension(base, {
    id: "provider-part-b",
    clipId: "clip-1",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    playerLabel: "Player 8",
    status: "review",
    startMs: 209_000,
    endMs: 300_000,
    engine: "sam2.1-hiera-tiny",
    metadata: { localArtifactId: "artifact-b", localSourceArtifactId: "source-a" },
    segments: [{ startMs: 209_000, endMs: 300_000, points: [
      { atMs: 210_000, x: 0.405, y: 0.4, width: 0.08, height: 0.2, confidence: 0.91, identityConfidence: 0.9 },
      { atMs: 300_000, x: 0.6, y: 0.42, width: 0.08, height: 0.2, confidence: 0.89, identityConfidence: 0.87 },
    ] }],
  }, "later");
  expect(continued).toMatchObject({
    id: "track-8",
    playerId: "player-8",
    startMs: 90_000,
    endMs: 300_000,
    status: "review",
    metadata: {
      localArtifactId: "artifact-b",
      localArtifactIds: ["artifact-a", "artifact-b"],
      localSourceArtifactId: "source-a",
      extensionCount: 1,
      lastExtensionDirection: "later",
      lastExtensionAtMs: 210_000,
    },
  });
  expect(continued.segments.flatMap((segment) => segment.points).map((point) => point.atMs)).toEqual([
    90_000, 210_000, 300_000,
  ]);
  expect(continued.corrections.at(-1)).toMatchObject({ correctionType: "merge", startMs: 210_000 });
  expect(() => extension.mergeTrackingExtension(base, {
    ...continued,
    id: "wrong-player",
    playerId: "player-9",
  }, "later")).toThrow(/different player identity/i);
  expect(() => extension.mergeTrackingExtension(base, {
    id: "no-progress",
    clipId: "clip-1",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    startMs: 209_000,
    endMs: 210_000,
    segments: [{ startMs: 210_000, endMs: 210_000, points: [
      { atMs: 210_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
    ] }],
  }, "later")).toThrow(/did not extend/i);
});

test("tracking controller extends the selected player without duplicating its identity", async () => {
  const { createTrackingController } = await import(moduleUrl("src/modules/video-analysis/controllers/trackingController.js"));
  const baseTrack = {
    id: "track-8",
    clipId: "clip-1",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    playerLabel: "Player 8",
    status: "review",
    startMs: 90_000,
    endMs: 210_000,
    metadata: {
      localArtifactId: "artifact-a",
      localSourceArtifactId: "source-a",
      targetStartMs: 0,
      targetEndMs: 300_000,
    },
    segments: [{ startMs: 90_000, endMs: 210_000, points: [
      { atMs: 90_000, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 210_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.88, identityConfidence: 0.86 },
    ] }],
  };
  const item = {
    id: "item-1",
    clipId: "clip-1",
    startMs: 0,
    endMs: 300_000,
    clip: { id: "clip-1", videoId: "video-1", startMs: 0, endMs: 300_000 },
    objectTracks: [baseTrack],
    dynamicGraphics: [],
  };
  let request = null;
  let correction = null;
  let state = {
    video: { id: "video-1" },
    videoRef: { kind: "local-file", localFileKey: "video-1" },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        provider: { status: "ready", available: true, maxDurationMs: 120_000 },
        selectedTrackIds: [baseTrack.id],
        prompt: null,
        job: null,
        error: "",
      },
    },
  };
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    trackObject: async (value) => {
      request = value;
      return {
        id: "provider-continuation",
        entityType: "player",
        playerId: "player-8",
        playerLabel: "Player 8",
        status: "review",
        startMs: 209_000,
        endMs: 300_000,
        metadata: { localArtifactId: "artifact-b", localSourceArtifactId: "source-a" },
        segments: [{ startMs: 209_000, endMs: 300_000, points: [
          { atMs: 210_000, x: 0.405, y: 0.4, width: 0.08, height: 0.2, confidence: 0.91, identityConfidence: 0.9 },
          { atMs: 300_000, x: 0.6, y: 0.42, width: 0.08, height: 0.2, confidence: 0.89, identityConfidence: 0.87 },
        ] }],
      };
    },
    persistCorrection: async (value) => { correction = value; },
  });
  const event = {
    target: {
      nodeType: 1,
      closest: (selector) => selector === "[data-video-analysis-tracking-action]"
        ? { dataset: { videoAnalysisTrackingAction: "extend-later" } }
        : null,
    },
  };

  expect(controller.handleClick(event)).toBe(true);
  await expect.poll(() => state.presentation.current.sections[0].items[0].objectTracks[0]?.metadata?.extensionCount).toBe(1);
  const tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks).toHaveLength(1);
  expect(tracks[0]).toMatchObject({
    id: "track-8",
    playerId: "player-8",
    startMs: 90_000,
    endMs: 300_000,
    metadata: { localArtifactIds: ["artifact-a", "artifact-b"], localSourceArtifactId: "source-a" },
  });
  expect(request).toMatchObject({
    sourceArtifactId: "source-a",
    prompt: { startMs: 209_000, endMs: 300_000, promptAtMs: 210_000, playerId: "player-8" },
  });
  expect(correction).toMatchObject({ objectTrackId: "track-8", atMs: 210_000, correctionType: "merge" });
  expect(state.presentation.tracking.prompt).toMatchObject({ startMs: 0, endMs: 300_000, box: null });
});

test("complete range chains bounded tracking jobs with one cancellable player identity", async () => {
  const { createTrackingController } = await import(moduleUrl("src/modules/video-analysis/controllers/trackingController.js"));
  const baseTrack = {
    id: "track-complete",
    clipId: "clip-complete",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    playerLabel: "Player 8",
    status: "review",
    startMs: 120_000,
    endMs: 240_000,
    metadata: {
      localArtifactId: "artifact-base",
      localSourceArtifactId: "source-a",
      targetStartMs: 0,
      targetEndMs: 400_000,
    },
    segments: [{ startMs: 120_000, endMs: 240_000, points: [
      { atMs: 120_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 240_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
    ] }],
  };
  const item = {
    id: "item-complete",
    clipId: "clip-complete",
    startMs: 0,
    endMs: 400_000,
    clip: { id: "clip-complete", videoId: "video-1", startMs: 0, endMs: 400_000 },
    objectTracks: [baseTrack],
    dynamicGraphics: [],
  };
  let state = {
    video: { id: "video-1" },
    videoRef: { kind: "local-file", localFileKey: "video-1" },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        provider: { status: "ready", available: true, maxDurationMs: 120_000 },
        selectedTrackIds: [baseTrack.id],
        job: null,
        error: "",
      },
    },
  };
  const requests = [];
  const corrections = [];
  const stages = [];
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => {
      state = updater(state);
      if (state.presentation.tracking.job?.stage) stages.push(state.presentation.tracking.job.stage);
    },
    trackObject: async (request) => {
      requests.push(request);
      request.onProgress?.({ stage: "tracking", ratio: 0.5 });
      const prompt = request.prompt;
      const earlier = request.continuationDirection === "earlier";
      const boundaryAtMs = earlier ? prompt.startMs : prompt.endMs;
      const points = [boundaryAtMs, prompt.promptAtMs]
        .sort((left, right) => left - right)
        .map((atMs) => ({
          atMs,
          x: 0.4,
          y: 0.4,
          width: 0.08,
          height: 0.2,
          confidence: 0.9,
          identityConfidence: 0.9,
        }));
      return {
        id: `part-${requests.length}`,
        entityType: "player",
        playerId: "player-8",
        playerLabel: "Player 8",
        status: "review",
        startMs: prompt.startMs,
        endMs: prompt.endMs,
        metadata: { localArtifactId: `artifact-${requests.length}`, localSourceArtifactId: "source-a" },
        segments: [{ startMs: prompt.startMs, endMs: prompt.endMs, points }],
      };
    },
    persistCorrection: async (value) => { corrections.push(value); },
  });
  const event = {
    target: {
      nodeType: 1,
      closest: (selector) => selector === "[data-video-analysis-tracking-action]"
        ? { dataset: { videoAnalysisTrackingAction: "complete-range" } }
        : null,
    },
  };

  expect(controller.handleClick(event)).toBe(true);
  await expect.poll(() => state.presentation.current.sections[0].items[0].objectTracks[0]?.metadata?.extensionCount).toBe(4);
  const tracks = state.presentation.current.sections[0].items[0].objectTracks;
  const points = tracks[0].segments.flatMap((segment) => segment.points);
  expect(tracks).toHaveLength(1);
  expect(tracks[0]).toMatchObject({ id: "track-complete", playerId: "player-8", startMs: 0, endMs: 400_000 });
  expect(points[0].atMs).toBe(0);
  expect(points.at(-1).atMs).toBe(400_000);
  expect(requests).toHaveLength(4);
  expect(requests.every((request) => request.sourceArtifactId === "source-a")).toBe(true);
  expect(corrections).toHaveLength(4);
  expect(stages.some((stage) => stage.startsWith("Complete range 1/4:"))).toBe(true);
  expect(stages.some((stage) => stage.startsWith("Complete range 4/4:"))).toBe(true);
  expect(state.presentation.tracking).toMatchObject({ job: null, error: "" });
});

test("cancelling complete range aborts the active part and starts no continuation", async () => {
  const { createTrackingController } = await import(moduleUrl("src/modules/video-analysis/controllers/trackingController.js"));
  const baseTrack = {
    id: "track-cancel-range",
    clipId: "clip-cancel-range",
    videoId: "video-1",
    entityType: "player",
    playerId: "player-8",
    playerLabel: "Player 8",
    status: "review",
    startMs: 90_000,
    endMs: 210_000,
    metadata: { localSourceArtifactId: "source-a", targetStartMs: 0, targetEndMs: 300_000 },
    segments: [{ startMs: 90_000, endMs: 210_000, points: [
      { atMs: 90_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 210_000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
    ] }],
  };
  const item = {
    id: "item-cancel-range",
    clipId: "clip-cancel-range",
    startMs: 0,
    endMs: 300_000,
    clip: { id: "clip-cancel-range", videoId: "video-1", startMs: 0, endMs: 300_000 },
    objectTracks: [baseTrack],
    dynamicGraphics: [],
  };
  let state = {
    video: { id: "video-1" },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        mode: "tracking",
        provider: { status: "ready", available: true, maxDurationMs: 120_000 },
        selectedTrackIds: [baseTrack.id],
        job: null,
        error: "",
      },
    },
  };
  let requestCount = 0;
  let activeSignal = null;
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    trackObject: ({ signal }) => new Promise((resolve, reject) => {
      requestCount += 1;
      activeSignal = signal;
      signal.addEventListener("abort", () => {
        const error = new Error("Tracking was cancelled.");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  const actionEvent = (action) => ({
    target: {
      nodeType: 1,
      closest: (selector) => selector === "[data-video-analysis-tracking-action]"
        ? { dataset: { videoAnalysisTrackingAction: action } }
        : null,
    },
  });

  expect(controller.handleClick(actionEvent("complete-range"))).toBe(true);
  expect(activeSignal?.aborted).toBe(false);
  expect(controller.handleClick(actionEvent("cancel"))).toBe(true);
  await expect.poll(() => state.presentation.tracking.job).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(activeSignal.aborted).toBe(true);
  expect(requestCount).toBe(1);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].metadata.extensionCount).toBeUndefined();
  expect(state.presentation.tracking.error).toBe("");
});

test("tracking sidebar shows real job telemetry and completed provider provenance", async () => {
  const { renderTrackingSidebar } = await import(moduleUrl("src/modules/video-analysis/components/TrackingTelestration.js"));
  const track = {
    id: "track-local",
    entityType: "player",
    playerLabel: "Player 8",
    status: "review",
    startMs: 0,
    endMs: 1000,
    confidence: 0.91,
    identityConfidence: 0.88,
    metadata: { model: "SAM 2.1 Hiera Tiny", device: "mps", sampleFps: 12.5 },
    segments: [{ startMs: 0, endMs: 1000, points: [
      { atMs: 0, x: 0.2, y: 0.4, width: 0.1, height: 0.2, confidence: 0.91, identityConfidence: 0.88 },
      { atMs: 1000, x: 0.3, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, identityConfidence: 0.87 },
    ] }],
  };
  const sidebar = renderTrackingSidebar({
    players: [],
    presentation: { tracking: {
      mode: "tracking",
      provider: { status: "ready", available: true },
      selectedTrackIds: [track.id],
      job: {
        stage: "Tracking player",
        progress: 0.64,
        elapsedMs: 64_000,
        estimatedRemainingMs: 36_000,
        processedFrames: 16,
        totalFrames: 25,
      },
    } },
  }, { id: "item-1", clipId: "clip-1", objectTracks: [track], dynamicGraphics: [] });
  expect(sidebar).toContain('role="progressbar"');
  expect(sidebar).toContain('aria-valuenow="64"');
  expect(sidebar).toContain("64% | 1m 4s elapsed | ~36s left | 16/25 frames");
  expect(sidebar).toContain("SAM 2.1 Hiera Tiny | MPS | 12.5 fps");
  const idleSidebar = renderTrackingSidebar({
    players: [],
    presentation: { tracking: {
      mode: "tracking",
      provider: { status: "ready", available: true },
      selectedTrackIds: [track.id],
      job: null,
    } },
  }, {
    id: "item-1",
    clipId: "clip-1",
    startMs: 0,
    endMs: 3000,
    objectTracks: [track],
    dynamicGraphics: [],
  });
  expect(idleSidebar).toContain("1s of 3s | Partial");
  expect(idleSidebar).toMatch(/data-video-analysis-tracking-action="extend-earlier" disabled/);
  expect(idleSidebar).toMatch(/data-video-analysis-tracking-action="extend-later" >Extend later/);
  expect(idleSidebar).toMatch(/data-video-analysis-tracking-action="complete-range" >Complete range/);
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
  let receivedPrompt = null;
  const receivedInputs = [];
  const trackingEngine = engineModule.createTrackingEngineAdapter({
    engineName: "qa-prompt-tracker",
    runner: async ({ inputPath, prompt, onProgress }) => {
      receivedPrompt = prompt;
      receivedInputs.push(await fs.readFile(inputPath, "utf8"));
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
            { atMs: prompt.startMs, x: 0.2, y: 0.4, width: 0.08, height: 0.2, groundX: 0.2, groundY: 0.5, confidence: 0.94, identityConfidence: 0.9 },
            { atMs: prompt.endMs, x: 0.3, y: 0.4, width: 0.08, height: 0.2, groundX: 0.3, groundY: 0.5, confidence: 0.92, identityConfidence: 0.88 },
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
      promptAtMs: 500,
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
    expect(completed.job.result.sourceArtifactId).toBe(completed.job.id);
    expect(receivedPrompt).toMatchObject({
      startMs: 0,
      endMs: 1000,
      promptAtMs: 500,
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourcePromptAtMs: 500,
    });

    const continuationPrompt = Buffer.from(JSON.stringify({
      startMs: 900,
      endMs: 2000,
      promptAtMs: 1000,
      box: { left: 0.25, top: 0.3, width: 0.08, height: 0.2 },
    })).toString("base64url");
    const continuationResponse = await fetch(`${baseUrl}/jobs/track-object`, {
      method: "POST",
      headers: {
        ...headers,
        "x-football-science-file-name": "match.mp4",
        "x-football-science-tracking-prompt": continuationPrompt,
        "x-football-science-tracking-source-id": completed.job.id,
      },
    });
    const continuation = await continuationResponse.json();
    expect(continuationResponse.status).toBe(202);
    await expect.poll(async () => (await (await fetch(continuation.statusUrl, { headers })).json()).job?.status).toBe("succeeded");
    const continued = await (await fetch(continuation.statusUrl, { headers })).json();
    expect(continued.job.result.sourceArtifactId).toBe(completed.job.id);
    expect(receivedInputs).toEqual(["local-video", "local-video"]);
    expect(await fs.readdir(path.join(cacheDir, continued.job.id))).toEqual(["track.json"]);

    const secondSession = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const retainedBeforeForeignReuse = localServer.jobs.stats().retained;
    const foreignReuse = await fetch(`${baseUrl}/jobs/track-object`, {
      method: "POST",
      headers: {
        origin,
        "x-football-science-session": secondSession.sessionToken,
        "x-football-science-file-name": "match.mp4",
        "x-football-science-tracking-prompt": continuationPrompt,
        "x-football-science-tracking-source-id": completed.job.id,
      },
    });
    expect(foreignReuse.status).toBe(404);
    expect(localServer.jobs.stats().retained).toBe(retainedBeforeForeignReuse);

    const retainedBeforeRejectedUpload = localServer.jobs.stats().retained;
    const rejectedUpload = await fetch(`${baseUrl}/jobs/track-object`, {
      method: "POST",
      headers: { ...headers, "x-football-science-file-name": "too-large.mp4", "x-football-science-tracking-prompt": prompt },
      body: Buffer.alloc(config.maxInputBytes + 1),
    });
    expect(rejectedUpload.status).toBe(413);
    expect(localServer.jobs.stats().retained).toBe(retainedBeforeRejectedUpload);
    expect((await fs.readdir(cacheDir)).sort()).toEqual([completed.job.id, continued.job.id].sort());
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
