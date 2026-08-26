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
  expect(html).toContain("Mark occluded");

  const continuityHtml = renderTrackingReviewPanel({
    timeline: { playheadMs: 1500 },
    presentation: { tracking: { prompt: {}, reviewHistory: {} } },
  }, track);
  expect(continuityHtml).toMatch(/data-video-analysis-tracking-action="review-continuity"(?! disabled)/);
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
