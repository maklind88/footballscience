import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function reviewTrack(overrides = {}) {
  return {
    id: "track-review-9",
    clipId: "clip-1",
    videoId: "video-1",
    entityType: "player",
    playerLabel: "Opponent 9",
    teamSide: "away",
    shirtNumber: "9",
    status: "review",
    startMs: 0,
    endMs: 2000,
    confidence: 0.8,
    identityConfidence: 0.8,
    segments: [
      {
        id: "segment-1",
        startMs: 0,
        endMs: 1000,
        points: [
          { atMs: 0, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.4, identityConfidence: 0.4 },
          { atMs: 500, x: 0.25, y: 0.4, width: 0.08, height: 0.2, confidence: 0.92, identityConfidence: 0.9 },
          { atMs: 1000, x: 0.3, y: 0.4, width: 0.08, height: 0.2, confidence: 0.43, identityConfidence: 0.42 },
        ],
      },
      {
        id: "segment-2",
        startMs: 1500,
        endMs: 2000,
        discontinuityBefore: true,
        points: [
          { atMs: 1500, x: 0.35, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.88 },
          { atMs: 2000, x: 0.4, y: 0.4, width: 0.08, height: 0.2, confidence: 0.91, identityConfidence: 0.89 },
        ],
      },
    ],
    corrections: [],
    ...overrides,
  };
}

test("tracking review events group confidence samples and expose continuity navigation", async () => {
  const review = await import(moduleUrl("src/modules/video-analysis/services/trackingCorrectionService.js"));
  const events = review.trackingReviewEvents(reviewTrack());
  expect(events.map((entry) => entry.type)).toEqual([
    "detection-confidence",
    "identity-confidence",
    "detection-confidence",
    "identity-confidence",
    "continuity-break",
  ]);
  expect(review.adjacentTrackingReviewEvent(events, 500, "later")).toMatchObject({ atMs: 1000 });
  expect(review.adjacentTrackingReviewEvent(events, 500, "earlier")).toMatchObject({ atMs: 0 });
  expect(review.adjacentTrackingReviewEvent(events, 2000, "later")).toMatchObject({ atMs: 0 });
});

test("identity and visibility corrections affect one reviewed frame and preserve unresolved evidence", async () => {
  const correction = await import(moduleUrl("src/modules/video-analysis/services/trackingCorrectionService.js"));
  const visibility = correction.applyTrackingVisibilityCorrection(reviewTrack(), { atMs: 500, occluded: true });
  const marked = visibility.segments[0].points.find((point) => point.atMs === 500);
  expect(marked).toMatchObject({
    occluded: true,
    source: "manual",
    confidence: 1,
    identityConfidence: 0.9,
  });
  expect(visibility.corrections.at(-1)).toMatchObject({ correctionType: "occlusion", startMs: 500 });

  const identity = correction.applyTrackingIdentityCorrection(reviewTrack({
    playerLabel: "",
    teamSide: "",
    shirtNumber: "",
  }), {
    playerLabel: "Opponent 11",
    teamSide: "away",
    shirtNumber: "11",
  }, { atMs: 500 });
  expect(identity).toMatchObject({ playerLabel: "Opponent 11", teamSide: "away", shirtNumber: "11" });
  expect(identity.segments[0].points.find((point) => point.atMs === 500)).toMatchObject({
    identityConfidence: 1,
    source: "manual",
  });
  expect(identity.segments[0].points.find((point) => point.atMs === 0).identityConfidence).toBe(0.4);
  expect(correction.trackingReviewEvents(identity).map((entry) => entry.type)).toContain("identity-confidence");
});

test("analyst-confirmed continuity joins only short spatially plausible breaks", async () => {
  const correction = await import(moduleUrl("src/modules/video-analysis/services/trackingCorrectionService.js"));
  const merged = correction.applyTrackingContinuityCorrection(reviewTrack(), { atMs: 1500 });
  expect(merged.segments).toHaveLength(1);
  expect(merged.segments[0]).toMatchObject({ startMs: 0, endMs: 2000, discontinuityBefore: false });
  expect(merged.corrections.at(-1)).toMatchObject({ correctionType: "merge", startMs: 1500 });
  expect(correction.trackingReviewEvents(merged).map((entry) => entry.type)).not.toContain("continuity-break");
  expect(() => correction.applyTrackingContinuityCorrection(reviewTrack(), { atMs: 0 })).toThrow(/playhead/i);

  const longGap = reviewTrack();
  longGap.endMs = 3500;
  longGap.segments[1] = {
    ...longGap.segments[1],
    startMs: 3000,
    endMs: 3500,
    points: longGap.segments[1].points.map((point) => ({ ...point, atMs: point.atMs + 1500 })),
  };
  expect(() => correction.applyTrackingContinuityCorrection(longGap, { atMs: 3000 })).toThrow(/too long/i);

  const implausibleJump = reviewTrack();
  implausibleJump.segments[1].points = implausibleJump.segments[1].points
    .map((point) => ({ ...point, x: 0.95, groundX: 0.95 }));
  expect(() => correction.applyTrackingContinuityCorrection(implausibleJump, { atMs: 1500 })).toThrow(/too far/i);
});

test("structural split preserves every sample and makes the continuation explicitly unassigned", async () => {
  const structural = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingStructuralCorrectionService.js",
  ));
  const source = reviewTrack({
    metadata: {
      localArtifactId: "provider-artifact-1",
      localArtifactHash: "a".repeat(64),
      localWorkspaceTrackKey: "workspace-track-review-9",
    },
  });
  expect(structural.trackingSplitReadiness(source, 0)).toMatchObject({ ready: false });
  expect(structural.trackingSplitReadiness(source, 1000)).toMatchObject({
    ready: true,
    beforePointCount: 2,
    afterPointCount: 3,
  });
  let sequence = 0;
  const split = structural.splitTrackingTrack(source, {
    atMs: 1000,
    operationId: "split-operation-1",
    trackId: "track-split-continuation",
    createId: (prefix) => `${prefix}-${++sequence}`,
    correctedAt: "2026-08-26T12:00:00.000Z",
  });
  expect(split.prefix).toMatchObject({
    id: source.id,
    endMs: 500,
    playerLabel: source.playerLabel,
    status: "review",
    metadata: {
      localWorkspaceTrackKey: "workspace-track-review-9",
      structuralCorrection: "split-prefix",
    },
  });
  expect(split.suffix).toMatchObject({
    id: "track-split-continuation",
    startMs: 1000,
    playerId: "",
    playerLabel: "",
    teamSide: "",
    shirtNumber: "",
    identityConfidence: 0,
    status: "review",
    metadata: {
      localWorkspaceTrackKey: "track-split-continuation",
      splitFromTrackId: source.id,
      structuralCorrection: "split-suffix",
    },
  });
  expect(split.prefix.metadata).not.toHaveProperty("localArtifactId");
  expect(split.suffix.metadata).not.toHaveProperty("localArtifactHash");
  expect(split.suffix.segments.flatMap((segment) => segment.points)
    .every((point) => point.identityConfidence === 0)).toBe(true);
  expect([
    ...split.prefix.segments.flatMap((segment) => segment.points),
    ...split.suffix.segments.flatMap((segment) => segment.points),
  ].map((point) => point.atMs)).toEqual([0, 500, 1000, 1500, 2000]);
  expect(split.prefix.corrections.at(-1)).toMatchObject({ correctionType: "split", startMs: 1000 });
  expect(split.suffix.corrections.at(-1)).toMatchObject({ correctionType: "split", startMs: 1000 });
});

test("identity swap exchanges only crossed continuations and confirms both boundaries", async () => {
  const structural = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingStructuralCorrectionService.js",
  ));
  const trackA = reviewTrack({
    id: "track-player-a",
    playerId: "player-a",
    playerLabel: "Player A",
    shirtNumber: "8",
    segments: [{ id: "segment-a", startMs: 0, endMs: 1500, points: [
      { atMs: 0, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 500, x: 0.3, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 1000, x: 0.7, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
      { atMs: 1500, x: 0.8, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
    ] }],
    metadata: { localArtifactId: "raw-a", localWorkspaceTrackKey: "workspace-a" },
  });
  const trackB = reviewTrack({
    id: "track-player-b",
    playerId: "player-b",
    playerLabel: "Player B",
    shirtNumber: "10",
    segments: [{ id: "segment-b", startMs: 0, endMs: 1500, points: [
      { atMs: 0, x: 0.8, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 500, x: 0.7, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 1000, x: 0.3, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
      { atMs: 1500, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
    ] }],
    metadata: { localArtifactId: "raw-b", localWorkspaceTrackKey: "workspace-b" },
  });
  expect(structural.trackingIdentitySwapReadiness(trackA, trackB, 1000)).toMatchObject({ ready: true });
  const swapped = structural.swapTrackingTrackContinuations(trackA, trackB, {
    atMs: 1000,
    operationId: "identity-swap-operation-1",
    correctedAt: "2026-08-26T12:00:00.000Z",
  });
  const [correctedA, correctedB] = swapped.tracks;
  expect(correctedA).toMatchObject({
    id: trackA.id,
    playerId: "player-a",
    playerLabel: "Player A",
    metadata: {
      localWorkspaceTrackKey: "workspace-a",
      structuralCorrection: "identity-swap",
      structuralCorrectionPartnerTrackId: trackB.id,
    },
  });
  expect(correctedB).toMatchObject({
    id: trackB.id,
    playerId: "player-b",
    playerLabel: "Player B",
    metadata: { structuralCorrectionPartnerTrackId: trackA.id },
  });
  expect(correctedA.segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.2, 0.3, 0.3, 0.2]);
  expect(correctedB.segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.8, 0.7, 0.7, 0.8]);
  expect(correctedA.segments.flatMap((segment) => segment.points).find((point) => point.atMs === 1000))
    .toMatchObject({ identityConfidence: 1, source: "manual" });
  expect(correctedB.segments.flatMap((segment) => segment.points).find((point) => point.atMs === 1000))
    .toMatchObject({ identityConfidence: 1, source: "manual" });
  expect(correctedA.corrections.at(-1)).toMatchObject({ correctionType: "identity-swap" });
  expect(correctedB.corrections.at(-1)).toMatchObject({ correctionType: "identity-swap" });
  expect(correctedA.metadata).not.toHaveProperty("localArtifactId");
  expect(structural.trackingIdentitySwapReadiness(
    trackA,
    { ...trackB, playerId: trackA.playerId, playerLabel: trackA.playerLabel },
    1000,
  )).toMatchObject({ ready: false });
});

test("review controller navigation and undo stay correct when persistence resolves out of order", async () => {
  const { createTrackingReviewController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingReviewController.js",
  ));
  const track = reviewTrack();
  const item = { id: "item-1", clipId: "clip-1", objectTracks: [track], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 500 },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        selectedTrackIds: [track.id],
        prompt: { entityType: "player", playerLabel: "Opponent 9", teamSide: "away", shirtNumber: "9" },
        groundTruth: { byItemId: { [item.id]: { itemId: item.id, status: "draft", attested: true } } },
      },
    },
  };
  const pendingSaves = [];
  const audits = [];
  const seeks = [];
  const controller = createTrackingReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
    seekToMatchMs: (atMs) => seeks.push(atMs),
    persistTrack: (value) => new Promise((resolve) => pendingSaves.push({ value, resolve })),
    persistCorrection: async (value) => { audits.push(value); },
    invalidateGroundTruth: (itemId) => {
      state.presentation.tracking.groundTruth.byItemId[itemId].attested = false;
    },
  });

  expect(controller.handleAction("review-next")).toBe(true);
  expect(seeks).toEqual([1000]);
  expect(controller.handleAction("review-visibility")).toBe(true);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments[0].points
    .find((point) => point.atMs === 500)).toMatchObject({ occluded: true, source: "manual" });
  expect(state.presentation.tracking.reviewHistory).toMatchObject({ undoCount: 1, redoCount: 0 });
  expect(state.presentation.tracking.groundTruth.byItemId[item.id].attested).toBe(false);

  expect(controller.handleAction("review-undo")).toBe(true);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments[0].points
    .find((point) => point.atMs === 500)).toMatchObject({ occluded: false });
  expect(state.presentation.tracking.reviewHistory).toMatchObject({ undoCount: 0, redoCount: 1 });

  pendingSaves[0].resolve(pendingSaves[0].value);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments[0].points
    .find((point) => point.atMs === 500)).toMatchObject({ occluded: false });
  pendingSaves[1].resolve(pendingSaves[1].value);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(audits.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
    "Marked occluded",
    "Undid local tracking correction",
  ]));

  expect(controller.handleAction("review-redo")).toBe(true);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments[0].points
    .find((point) => point.atMs === 500)).toMatchObject({ occluded: true });
  pendingSaves[2].resolve(pendingSaves[2].value);
});

test("tracking review panel exposes professional correction controls without enabling invalid identity", async () => {
  const { renderTrackingReviewPanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingReviewPanel.js",
  ));
  const track = reviewTrack();
  const html = renderTrackingReviewPanel({
    timeline: { playheadMs: 500 },
    presentation: {
      tracking: {
        prompt: { entityType: "player", playerLabel: "Opponent 9" },
        reviewHistory: { trackId: track.id, undoCount: 1, redoCount: 0 },
      },
    },
  }, track);
  expect(html).toContain("review events");
  expect(html).toMatch(/data-video-analysis-tracking-action="review-identity"(?! disabled)/);
  expect(html).toMatch(/data-video-analysis-tracking-action="review-undo"(?! disabled)/);
  expect(html).toMatch(/data-video-analysis-tracking-action="review-redo" disabled/);
  expect(html).toMatch(/data-video-analysis-tracking-action="review-continuity" disabled/);
  expect(html).toMatch(/data-video-analysis-tracking-action="review-split"(?![^>]*disabled)[^>]*>Split at playhead/);
  expect(html).toMatch(/data-video-analysis-tracking-action="review-identity-swap"[^>]+disabled/);
  expect(html).toContain("Mark occluded");

  const continuityHtml = renderTrackingReviewPanel({
    timeline: { playheadMs: 1500 },
    presentation: { tracking: { prompt: {}, reviewHistory: {} } },
  }, track);
  expect(continuityHtml).toMatch(/data-video-analysis-tracking-action="review-continuity"(?! disabled)/);

  const second = reviewTrack({ id: "track-review-10", playerLabel: "Opponent 10", shirtNumber: "10" });
  const swapHtml = renderTrackingReviewPanel({
    timeline: { playheadMs: 500 },
    presentation: {
      tracking: {
        selectedTrackIds: [track.id, second.id],
        prompt: { entityType: "player", playerLabel: track.playerLabel },
        reviewHistory: {},
      },
    },
  }, track, [track, second]);
  expect(swapHtml).toMatch(/data-video-analysis-tracking-action="review-identity-swap"(?![^>]*disabled)[^>]*>Swap after playhead/);
});

test("trajectory split is one reversible operation and archives only its derived branch", async () => {
  const { createTrackingReviewController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingReviewController.js",
  ));
  const track = reviewTrack();
  const item = { id: "item-split", clipId: track.clipId, objectTracks: [track], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 1000 },
    presentation: {
      current: { sections: [{ id: "section-split", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        selectedTrackIds: [track.id],
        prompt: { entityType: "player", playerLabel: track.playerLabel },
      },
    },
  };
  const trackWrites = [];
  const audits = [];
  const controller = createTrackingReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
    persistTrack: async (value) => { trackWrites.push(value); return value; },
    persistCorrection: async (value) => { audits.push(value); },
  });

  expect(controller.handleAction("review-split")).toBe(true);
  let tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks).toHaveLength(2);
  const suffixId = tracks[1].id;
  expect(tracks[0].segments.flatMap((segment) => segment.points).map((point) => point.atMs)).toEqual([0, 500]);
  expect(tracks[1]).toMatchObject({ id: suffixId, playerLabel: "", status: "review" });
  expect(state.presentation.tracking).toMatchObject({
    selectedTrackIds: [suffixId],
    reviewHistory: { undoCount: 1, redoCount: 0 },
  });
  await expect.poll(() => audits.length).toBe(2);
  expect(new Set(audits.map((entry) => entry.operationId)).size).toBe(2);

  state.presentation.current.sections[0].items[0].dynamicGraphics = [{
    id: "graphic-split-branch",
    type: "circle",
    source: "tracking",
    bindings: [{ trackId: suffixId, role: "primary", anchor: "ground" }],
  }];
  expect(controller.handleAction("review-undo")).toBe(true);
  tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks).toHaveLength(1);
  expect(tracks[0].segments.flatMap((segment) => segment.points)).toHaveLength(5);
  expect(state.presentation.current.sections[0].items[0].dynamicGraphics[0].bindings[0].trackId).toBe(track.id);
  expect(state.presentation.tracking).toMatchObject({
    selectedTrackIds: [track.id],
    reviewHistory: { undoCount: 0, redoCount: 1 },
  });
  await expect.poll(() => trackWrites.filter((entry) => entry.status === "archived").length).toBe(1);
  await expect.poll(() => audits.length).toBe(3);
  expect(audits.at(-1)).toMatchObject({ correctionType: "merge", metadata: { historyAction: "undo" } });

  expect(controller.handleAction("review-redo")).toBe(true);
  tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks).toHaveLength(2);
  expect(state.presentation.current.sections[0].items[0].dynamicGraphics[0].bindings[0].trackId).toBe(suffixId);
  await expect.poll(() => audits.length).toBe(5);
  expect(audits.slice(-2).every((entry) => entry.correctionType === "split")).toBe(true);
});

test("identity swap persists and reverses both trajectories as one audit group", async () => {
  const { createTrackingReviewController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingReviewController.js",
  ));
  const trackA = reviewTrack({
    id: "track-swap-a",
    playerId: "player-a",
    playerLabel: "Player A",
    segments: [{ id: "segment-swap-a", startMs: 0, endMs: 1500, points: [
      { atMs: 0, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 500, x: 0.3, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 1000, x: 0.7, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
      { atMs: 1500, x: 0.8, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
    ] }],
  });
  const trackB = reviewTrack({
    id: "track-swap-b",
    playerId: "player-b",
    playerLabel: "Player B",
    segments: [{ id: "segment-swap-b", startMs: 0, endMs: 1500, points: [
      { atMs: 0, x: 0.8, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 500, x: 0.7, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.9 },
      { atMs: 1000, x: 0.3, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
      { atMs: 1500, x: 0.2, y: 0.4, width: 0.08, height: 0.2, confidence: 0.9, identityConfidence: 0.5 },
    ] }],
  });
  const item = { id: "item-swap", clipId: trackA.clipId, objectTracks: [trackA, trackB], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 1000 },
    presentation: {
      current: { sections: [{ id: "section-swap", items: [item] }] },
      selectedItemId: item.id,
      tracking: { selectedTrackIds: [trackA.id, trackB.id], prompt: {} },
    },
  };
  const audits = [];
  const trackWrites = [];
  const controller = createTrackingReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
    persistTrack: async (value) => { trackWrites.push(value); return value; },
    persistCorrection: async (value) => { audits.push(value); },
  });

  expect(controller.handleAction("review-identity-swap")).toBe(true);
  let tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks[0].segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.2, 0.3, 0.3, 0.2]);
  expect(tracks[1].segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.8, 0.7, 0.7, 0.8]);
  await expect.poll(() => audits.length).toBe(2);
  expect(audits.every((entry) => entry.correctionType === "identity-swap")).toBe(true);
  expect(new Set(audits.map((entry) => entry.metadata.operationGroupId)).size).toBe(1);

  expect(controller.handleAction("review-undo")).toBe(true);
  tracks = state.presentation.current.sections[0].items[0].objectTracks;
  expect(tracks[0].segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.2, 0.3, 0.7, 0.8]);
  expect(tracks[1].segments.flatMap((segment) => segment.points).map((point) => point.x))
    .toEqual([0.8, 0.7, 0.3, 0.2]);
  await expect.poll(() => audits.length).toBe(4);
  expect(audits.slice(-2).every((entry) => entry.metadata.historyAction === "undo")).toBe(true);
  expect(trackWrites).toHaveLength(4);
});

test("continuity confirmation is audited, invalidates ground truth and remains undoable", async () => {
  const { createTrackingReviewController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingReviewController.js",
  ));
  const track = reviewTrack();
  const item = { id: "item-continuity", clipId: "clip-1", objectTracks: [track], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 1500 },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        selectedTrackIds: [track.id],
        prompt: {},
        groundTruth: { byItemId: { [item.id]: { itemId: item.id, status: "draft", attested: true } } },
      },
    },
  };
  const audits = [];
  const controller = createTrackingReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
    persistTrack: async (value) => value,
    persistCorrection: async (value) => { audits.push(value); },
    invalidateGroundTruth: (itemId) => {
      state.presentation.tracking.groundTruth.byItemId[itemId].attested = false;
    },
  });

  expect(controller.handleAction("review-continuity")).toBe(true);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments).toHaveLength(1);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id].attested).toBe(false);
  await expect.poll(() => audits.length).toBe(1);
  expect(audits[0]).toMatchObject({ correctionType: "merge", atMs: 1500 });

  expect(controller.handleAction("review-undo")).toBe(true);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments).toHaveLength(2);
});

test("main tracking controller syncs selected identity and invalidates draft attestation on correction", async () => {
  const { createTrackingController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingController.js",
  ));
  const track = reviewTrack();
  const item = { id: "item-main", clipId: "clip-1", objectTracks: [track], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 500 },
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        selectedTrackIds: [],
        prompt: { entityType: "ball", playerLabel: "Ball", startMs: 0, endMs: 2000 },
        groundTruth: { byItemId: { [item.id]: { itemId: item.id, status: "draft", attested: true } } },
      },
    },
  };
  const controller = createTrackingController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
  });
  const trackTarget = {
    nodeType: 1,
    closest(selector) {
      return selector === "[data-video-analysis-track-select]"
        ? { dataset: { videoAnalysisTrackSelect: track.id } }
        : null;
    },
  };
  expect(controller.handleClick({ target: trackTarget })).toBe(true);
  expect(state.presentation.tracking).toMatchObject({
    selectedTrackIds: [track.id],
    prompt: {
      entityType: "player",
      playerLabel: "Opponent 9",
      teamSide: "away",
      shirtNumber: "9",
    },
  });

  const correctionTarget = {
    nodeType: 1,
    closest(selector) {
      return selector === "[data-video-analysis-tracking-action]"
        ? { dataset: { videoAnalysisTrackingAction: "review-visibility" } }
        : null;
    },
  };
  expect(controller.handleClick({ target: correctionTarget })).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id].attested).toBe(false);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].segments[0].points
    .find((point) => point.atMs === 500)).toMatchObject({ occluded: true, source: "manual" });
});

test("local tracking workspace chunks samples, isolates scope and reconciles a central track id", async () => {
  const workspace = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingWorkspaceContract.js",
  ));
  const scope = workspace.createLocalTrackingWorkspaceScope({
    organizationId: "org-tracking",
    teamId: "team-tracking",
    userId: "analyst-tracking",
    matchId: "match-tracking",
    videoId: "video-tracking",
    clipId: "clip-1",
  });
  const localTrack = reviewTrack({
    id: "local-track-before-sync",
    metadata: { localWorkspaceTrackKey: "workspace-track-key-1" },
  });
  const bundle = workspace.createLocalTrackingTrackBundle({
    scope,
    track: localTrack,
    syncStatus: "pending",
  }, { now: () => 1_800_000_100_000 });
  expect(bundle.record).toMatchObject({
    protocol: "football-science-local-tracking-workspace-v1",
    pointCount: 5,
    chunkCount: 2,
    syncStatus: "pending",
  });
  expect(bundle.chunks.every((chunk) => chunk.points.length <= 1000)).toBe(true);
  const hydrated = workspace.hydrateLocalTrackingTrack(bundle.record, bundle.chunks);
  expect(hydrated.track.segments.flatMap((segment) => segment.points)).toHaveLength(5);
  expect(Object.isFrozen(hydrated.track.segments[0].points)).toBe(true);
  expect(workspace.createLocalTrackingWorkspaceScope({
    ...scope,
    userId: "another-analyst",
  }).id).not.toBe(scope.id);

  const remoteTrack = {
    ...hydrated.track,
    id: "remote-track-after-sync",
    playerLabel: "Central Opponent 9",
    segments: [],
    metadata: { localWorkspaceTrackKey: "workspace-track-key-1" },
  };
  const merged = workspace.mergeTrackingWorkspaceTracks([remoteTrack], [hydrated], []);
  expect(merged).toMatchObject({
    localOnlyCount: 0,
    missingSampleCount: 0,
    migrations: [{ previousTrackId: "local-track-before-sync", trackId: "remote-track-after-sync" }],
  });
  expect(merged.tracks[0]).toMatchObject({
    id: "remote-track-after-sync",
    playerLabel: "Central Opponent 9",
    metadata: { localWorkspaceStatus: "ready" },
  });
  expect(merged.tracks[0].segments.flatMap((segment) => segment.points)).toHaveLength(5);

  const archivedBundle = workspace.createLocalTrackingTrackBundle({
    scope,
    track: reviewTrack({ id: "track-archived-pending", status: "archived" }),
    syncStatus: "pending",
  });
  const archivedWorkspace = workspace.mergeTrackingWorkspaceTracks([], [
    workspace.hydrateLocalTrackingTrack(archivedBundle.record, archivedBundle.chunks),
  ], []);
  expect(archivedWorkspace).toMatchObject({ tracks: [], localOnlyCount: 1 });

  const duplicateBundle = workspace.createLocalTrackingTrackBundle({
    scope,
    track: reviewTrack({
      id: "local-track-duplicate-key",
      metadata: { localWorkspaceTrackKey: "workspace-track-key-1" },
    }),
    syncStatus: "pending",
  });
  const duplicateEntry = workspace.hydrateLocalTrackingTrack(
    duplicateBundle.record,
    duplicateBundle.chunks,
  );
  expect(() => workspace.mergeTrackingWorkspaceTracks(
    [remoteTrack],
    [hydrated, duplicateEntry],
    [],
  )).toThrow(/identity key is ambiguous/i);

  const tamperedChunk = structuredClone(bundle.chunks[0]);
  tamperedChunk.scopeId = "another-scope";
  expect(() => workspace.hydrateLocalTrackingTrack(
    bundle.record,
    [tamperedChunk, ...bundle.chunks.slice(1)],
  )).toThrow(/chunk.*invalid/i);
  expect(() => workspace.createLocalTrackingTrackBundle({
    scope,
    track: reviewTrack({ metadata: { sourceUrl: "https://example.com/match.mp4" } }),
  })).toThrow(/media field|forbidden/i);
});

test("track persistence protects samples before central sync and retains a failed upload", async () => {
  const { persistTrackingTrack } = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingTrackPersistenceService.js",
  ));
  const { trackingMetadataPayload } = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewService.js",
  ));
  const localCalls = [];
  const failed = await persistTrackingTrack(reviewTrack(), {
    persistLocalTrack: async (track, options) => {
      localCalls.push({ track, options });
      return { track, syncStatus: options.syncStatus };
    },
    persistMetadata: async () => { throw new Error("Central tracking metadata is offline."); },
  });
  expect(localCalls).toHaveLength(1);
  expect(localCalls[0].options).toMatchObject({
    previousTrackId: "track-review-9",
    syncStatus: "pending",
  });
  expect(failed.metadata).toMatchObject({
    localWorkspaceStatus: "pending-central",
    centralSyncPending: true,
    localWorkspaceTrackKey: "track-review-9",
  });
  expect(failed.segments.flatMap((segment) => segment.points)).toHaveLength(5);

  localCalls.length = 0;
  const synced = await persistTrackingTrack(reviewTrack(), {
    persistLocalTrack: async (track, options) => {
      localCalls.push({ track, options });
      return { track, syncStatus: options.syncStatus };
    },
    persistMetadata: async (metadata) => ({
      objectTrack: { ...metadata, id: "remote-track-9", revision: 2 },
    }),
  });
  expect(localCalls.map((entry) => entry.options.syncStatus)).toEqual(["pending", "synced"]);
  expect(localCalls[1].options.previousTrackId).toBe("track-review-9");
  expect(synced).toMatchObject({
    id: "remote-track-9",
    metadata: { localWorkspaceStatus: "ready", centralSyncPending: false },
  });
  expect(synced.segments.flatMap((segment) => segment.points)).toHaveLength(5);
  expect(trackingMetadataPayload(synced).metadata).not.toHaveProperty("localWorkspaceStatus");
  expect(trackingMetadataPayload(synced).metadata).toMatchObject({
    localWorkspaceTrackKey: "track-review-9",
  });

  const archiveCalls = [];
  const archived = await persistTrackingTrack(reviewTrack({ status: "archived" }), {
    persistLocalTrack: async (track, options) => {
      archiveCalls.push({ type: "local", id: track.id, status: options.syncStatus });
      return { track, syncStatus: options.syncStatus };
    },
    persistMetadata: async (metadata) => ({ objectTrack: { ...metadata, status: "archived" } }),
    removeLocalTrack: async (trackId, options) => {
      archiveCalls.push({ type: "remove", id: trackId, previousTrackId: options.previousTrackId });
    },
  });
  expect(archiveCalls).toEqual([
    { type: "local", id: "track-review-9", status: "pending" },
    { type: "remove", id: "track-review-9", previousTrackId: "track-review-9" },
  ]);
  expect(archived).toMatchObject({
    status: "archived",
    metadata: { localWorkspaceStatus: "removed", centralSyncPending: false },
  });

  let removedAfterFailure = false;
  const pendingArchive = await persistTrackingTrack(reviewTrack({ status: "archived" }), {
    persistLocalTrack: async (track, options) => ({ track, syncStatus: options.syncStatus }),
    persistMetadata: async () => { throw new Error("Archive sync offline."); },
    removeLocalTrack: async () => { removedAfterFailure = true; },
  });
  expect(removedAfterFailure).toBe(false);
  expect(pendingArchive).toMatchObject({
    status: "archived",
    metadata: { localWorkspaceStatus: "pending-central", centralSyncPending: true },
  });
});

test("tracking workspace restores central metadata with local samples and graphics", async () => {
  const contract = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingWorkspaceContract.js",
  ));
  const { createTrackingWorkspaceController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingWorkspaceController.js",
  ));
  const track = reviewTrack({
    metadata: { localWorkspaceTrackKey: "workspace-track-restore" },
  });
  const scope = contract.createLocalTrackingWorkspaceScope({
    organizationId: "org-restore",
    teamId: "team-restore",
    userId: "analyst-restore",
    matchId: "match-restore",
    videoId: "video-restore",
    clipId: track.clipId,
  });
  const bundle = contract.createLocalTrackingTrackBundle({ scope, track, syncStatus: "synced" });
  const localEntry = contract.hydrateLocalTrackingTrack(bundle.record, bundle.chunks);
  const item = {
    id: "item-restore",
    clipId: track.clipId,
    clip: { id: track.clipId, match_id: "match-restore", video_id: "video-restore" },
    objectTracks: [],
    dynamicGraphics: [],
  };
  let state = {
    match: { id: "match-restore" },
    video: { id: "video-restore", match_id: "match-restore" },
    presentation: {
      current: { sections: [{ id: "section-restore", items: [item] }] },
      selectedItemId: item.id,
      selectedClipId: item.clipId,
      tracking: {
        selectedTrackIds: [track.id],
        workspace: { status: "waiting-item" },
      },
    },
  };
  let loadedScope = null;
  const controller = createTrackingWorkspaceController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getContext: () => ({
      currentUser: {
        id: "analyst-restore",
        organizationId: "org-restore",
        teamId: "team-restore",
      },
    }),
    loadRemoteWorkspace: async () => ({
      objectTracks: [{ ...track, playerLabel: "Central identity", segments: [] }],
      dynamicGraphics: [{
        id: "graphic-restore",
        clipId: track.clipId,
        type: "circle",
        source: "tracking",
        startMs: 0,
        endMs: 2000,
        bindings: [{ trackId: track.id, role: "primary", anchor: "ground" }],
      }],
    }),
    loadLocalTracks: async (value) => {
      loadedScope = value;
      return [localEntry];
    },
    now: () => 1_800_000_110_000,
  });
  expect(await controller.restore()).toBe(true);
  expect(loadedScope).toMatchObject({
    id: scope.id,
    organizationId: "org-restore",
    teamId: "team-restore",
    userId: "analyst-restore",
    clipId: track.clipId,
  });
  const restoredItem = state.presentation.current.sections[0].items[0];
  expect(restoredItem.objectTracks[0]).toMatchObject({
    id: track.id,
    playerLabel: "Central identity",
    metadata: { localWorkspaceStatus: "ready" },
  });
  expect(restoredItem.objectTracks[0].segments.flatMap((segment) => segment.points)).toHaveLength(5);
  expect(restoredItem.dynamicGraphics).toHaveLength(1);
  expect(state.presentation.tracking.workspace).toMatchObject({
    status: "restored",
    localOnlyCount: 0,
    missingSampleCount: 0,
  });
});

test("tracking workspace retries a device-only track and migrates every live binding", async () => {
  const contract = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingWorkspaceContract.js",
  ));
  const { createTrackingWorkspaceController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingWorkspaceController.js",
  ));
  const localTrack = reviewTrack({
    id: "track-device-only",
    metadata: { localWorkspaceTrackKey: "workspace-retry-key" },
  });
  const scopeValues = {
    organizationId: "org-retry-track",
    teamId: "team-retry-track",
    userId: "analyst-retry-track",
    matchId: "match-retry-track",
    videoId: "video-retry-track",
    clipId: localTrack.clipId,
  };
  const scope = contract.createLocalTrackingWorkspaceScope(scopeValues);
  let bundle = contract.createLocalTrackingTrackBundle({
    scope,
    track: localTrack,
    syncStatus: "pending",
  });
  let localEntries = [contract.hydrateLocalTrackingTrack(bundle.record, bundle.chunks)];
  let remoteTracks = [];
  const localSaves = [];
  const item = {
    id: "item-retry-track",
    clipId: localTrack.clipId,
    clip: { match_id: scopeValues.matchId, video_id: scopeValues.videoId },
    objectTracks: [localTrack],
    dynamicGraphics: [{
      id: "graphic-retry-track",
      clipId: localTrack.clipId,
      type: "circle",
      source: "tracking",
      startMs: 0,
      endMs: 2000,
      bindings: [{ trackId: localTrack.id, role: "primary", anchor: "ground" }],
    }],
  };
  let state = {
    match: { id: scopeValues.matchId },
    video: { id: scopeValues.videoId },
    presentation: {
      current: { sections: [{ id: "section-retry-track", items: [item] }] },
      selectedItemId: item.id,
      selectedClipId: item.clipId,
      tracking: {
        selectedTrackIds: [localTrack.id],
        workspace: { status: "pending-sync", localOnlyCount: 1 },
      },
    },
  };
  const controller = createTrackingWorkspaceController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getContext: () => ({ currentUser: {
      id: scopeValues.userId,
      organizationId: scopeValues.organizationId,
      teamId: scopeValues.teamId,
    } }),
    loadRemoteWorkspace: async () => ({ objectTracks: remoteTracks, dynamicGraphics: [] }),
    loadLocalTracks: async () => localEntries,
    saveRemoteTrack: async (metadata) => {
      const remoteTrack = { ...metadata, id: "track-central-after-retry", revision: 1 };
      remoteTracks = [remoteTrack];
      return { objectTrack: remoteTrack };
    },
    saveLocalTrack: async (valueScope, track, options) => {
      localSaves.push({ scope: valueScope, track, options });
      bundle = contract.createLocalTrackingTrackBundle({
        scope: valueScope,
        track,
        syncStatus: options.syncStatus,
      });
      const entry = contract.hydrateLocalTrackingTrack(bundle.record, bundle.chunks);
      localEntries = [entry];
      return entry;
    },
  });

  expect(await controller.retrySync()).toBe(true);
  const restored = state.presentation.current.sections[0].items[0];
  expect(localSaves).toHaveLength(1);
  expect(localSaves[0].options).toMatchObject({
    previousTrackId: "track-device-only",
    syncStatus: "synced",
  });
  expect(restored.objectTracks).toHaveLength(1);
  expect(restored.objectTracks[0].id).toBe("track-central-after-retry");
  expect(restored.objectTracks[0].segments.flatMap((segment) => segment.points)).toHaveLength(5);
  expect(restored.dynamicGraphics[0].bindings[0].trackId).toBe("track-central-after-retry");
  expect(state.presentation.tracking.selectedTrackIds).toEqual(["track-central-after-retry"]);
  expect(state.presentation.tracking.workspace).toMatchObject({
    localOnlyCount: 0,
    missingSampleCount: 0,
  });
});

test("correction outbox retains one metadata-only operation and retries its exact id", async () => {
  const contract = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingCorrectionOutboxContract.js",
  ));
  const { createTrackingCorrectionOutboxController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingCorrectionOutboxController.js",
  ));
  const scopeValues = {
    organizationId: "org-correction",
    teamId: "team-correction",
    userId: "analyst-correction",
    matchId: "match-correction",
    videoId: "video-correction",
    clipId: "clip-1",
  };
  const track = reviewTrack({
    metadata: {
      localWorkspaceStatus: "ready",
      localWorkspaceTrackKey: "workspace-correction-key",
    },
  });
  const item = {
    id: "item-correction-outbox",
    clipId: track.clipId,
    clip: { match_id: scopeValues.matchId, video_id: scopeValues.videoId },
    objectTracks: [track],
    dynamicGraphics: [],
  };
  let state = {
    match: { id: scopeValues.matchId },
    video: { id: scopeValues.videoId },
    presentation: {
      current: { sections: [{ id: "section-correction", items: [item] }] },
      selectedItemId: item.id,
      tracking: { selectedTrackIds: [track.id], workspace: { status: "restored" } },
    },
  };
  const records = new Map();
  const remoteCalls = [];
  let remoteOnline = false;
  const controller = createTrackingCorrectionOutboxController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getContext: () => ({ currentUser: {
      id: scopeValues.userId,
      organizationId: scopeValues.organizationId,
      teamId: scopeValues.teamId,
    } }),
    saveRecord: async (scope, value) => {
      const record = contract.createLocalTrackingCorrectionRecord({ ...value, scope });
      records.set(record.id, record);
      return record;
    },
    loadRecords: async () => [...records.values()],
    removeRecord: async (scope, operationId) => {
      records.delete(contract.localTrackingCorrectionRecordId(scope, operationId));
      return true;
    },
    persistRemote: async (payload) => {
      remoteCalls.push(payload);
      if (!remoteOnline) throw new Error("Central audit offline.");
      return { correction: payload };
    },
  });
  const correction = {
    operationId: "correction-operation-1",
    objectTrackId: track.id,
    atMs: 500,
    correctionType: "occlusion",
    reason: "Marked occluded",
    metadata: { occluded: true },
  };
  await expect(controller.persist(correction)).rejects.toThrow(/offline/i);
  expect(records).toHaveProperty("size", 1);
  expect(state.presentation.tracking.workspace).toMatchObject({
    status: "attention",
    pendingCorrectionCount: 1,
  });
  const retained = [...records.values()][0];
  expect(retained).toMatchObject({
    operationId: correction.operationId,
    attempts: 1,
    localWorkspaceTrackKey: "workspace-correction-key",
  });
  expect(() => contract.createLocalTrackingCorrectionRecord({
    ...correction,
    scope: scopeValues,
    metadata: { videoPath: "/Users/analyst/match.mp4" },
  })).toThrow(/media field|forbidden/i);
  expect(() => contract.createLocalTrackingCorrectionRecord({
    ...correction,
    scope: scopeValues,
    operationId: "correction,or(status.eq.active)",
  })).toThrow(/operation id/i);
  expect(() => contract.createLocalTrackingCorrectionRecord({
    ...correction,
    scope: scopeValues,
    createdAt: "not-a-date",
  })).toThrow(/creation time/i);

  remoteOnline = true;
  expect(await controller.retry()).toBe(true);
  expect(records).toHaveProperty("size", 0);
  expect(remoteCalls).toHaveLength(2);
  expect(remoteCalls[0].operationId).toBe(remoteCalls[1].operationId);
  expect(state.presentation.tracking.workspace).toMatchObject({
    status: "restored",
    pendingCorrectionCount: 0,
    error: "",
  });
});

test("review persistence saves the central track id before its correction audit", async () => {
  const { createTrackingReviewController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingReviewController.js",
  ));
  const track = reviewTrack({
    id: "track-before-central-save",
    metadata: { localWorkspaceTrackKey: "workspace-sequencing-key" },
  });
  const item = { id: "item-sequencing", clipId: track.clipId, objectTracks: [track], dynamicGraphics: [] };
  let state = {
    timeline: { playheadMs: 500 },
    presentation: {
      current: { sections: [{ id: "section-sequencing", items: [item] }] },
      selectedItemId: item.id,
      tracking: { selectedTrackIds: [track.id], prompt: {} },
    },
  };
  const order = [];
  const audits = [];
  const controller = createTrackingReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getCurrentMatchMs: () => state.timeline.playheadMs,
    persistTrack: async (value) => {
      order.push("track");
      return { ...value, id: "11111111-1111-4111-8111-111111111111" };
    },
    persistCorrection: async (value) => {
      order.push("correction");
      audits.push(value);
    },
  });
  expect(controller.handleAction("review-visibility")).toBe(true);
  await expect.poll(() => audits.length).toBe(1);
  expect(order).toEqual(["track", "correction"]);
  expect(audits[0]).toMatchObject({
    objectTrackId: "11111111-1111-4111-8111-111111111111",
    localWorkspaceTrackKey: "workspace-sequencing-key",
    correctionType: "occlusion",
  });
  expect(audits[0].operationId).toBeTruthy();
});
