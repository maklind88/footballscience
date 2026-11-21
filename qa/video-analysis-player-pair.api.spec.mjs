import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { containedVideoRect, pairPointerPoint, pairPromptBox, playerPairAt, verifiedPairDistance } from "../src/modules/video-analysis/timeline/timeline.player-pair.geometry.js";
import { createPlayerPairCache, playerPairContext } from "../src/modules/video-analysis/timeline/timeline.player-pair.controller.js";
import { createLocalVideoReference, revokeLocalVideoReference } from "../src/modules/video-analysis/services/localVideoBridgeService.js";
import { renderClipEditor } from "../src/modules/video-analysis/timeline/timeline.clip-editor.renderer.js";
import { normalizePitchCalibration } from "../src/modules/video-analysis/domain/pitchCalibration.model.js";

const point = (atMs, x, extra = {}) => ({ atMs, x, y: .4, groundX: x, groundY: .5, width: .02, height: .1, confidence: .95, ...extra });
const track = (x, extra = {}) => ({ id: String(x), segments: [{ startMs: 0, endMs: 320, points: [point(0, x), point(160, x + .1), point(320, x + .2)] }], ...extra });

test("two-player selection uses the contained image, not letterboxing", () => {
  const rect = containedVideoRect(1200, 500, 1920, 1080);
  expect(rect.height).toBe(500);
  expect(pairPointerPoint(10, 250, rect)).toBeNull();
  expect(pairPointerPoint(600, 250, rect)).toEqual({ x: .5, y: .5 });
  expect(containedVideoRect(0, 500, 1920, 1080)).toBeNull();
  const portrait = containedVideoRect(390, 600, 1920, 1080);
  expect(portrait.width).toBe(390);
  expect(pairPointerPoint(195, 10, portrait)).toBeNull();
});

test("a click creates a bounded player prompt and a drag preserves the chosen box", () => {
  const box = pairPromptBox({ x: .5, y: .6 }, { x: .5, y: .6 }, 1920, 1080);
  expect(box.width * 1920).toBe(40);
  expect(box.height * 1080).toBe(80);
  const corner = pairPromptBox({ x: 1, y: 1 }, { x: 1, y: 1 }, 1920, 1080);
  expect(corner.left + corner.width).toBeLessThanOrEqual(1);
  expect(corner.top + corner.height).toBeLessThanOrEqual(1);
  expect(pairPromptBox({ x: .6, y: .6 }, { x: .5, y: .4 }, 1920, 1080)).toEqual({ left: .5, top: .4, width: .6 - .5, height: .6 - .4 });
  expect(pairPromptBox({ x: .5, y: .4 }, null, 1920, 1080)).toBeNull();
});

test("pair playback interpolates both ground points but never extrapolates or bridges occlusion", () => {
  const tracks = [track(.2), track(.6)];
  const points = playerPairAt(tracks, 80);
  expect(points[0].groundPoint.x).toBeCloseTo(.25);
  expect(points[1].groundPoint.x).toBeCloseTo(.65);
  expect(playerPairAt(tracks, 321)).toBeNull();
  expect(playerPairAt(tracks.slice(0, 1), 80)).toBeNull();
  tracks[0].segments[0].points[1].occluded = true;
  expect(playerPairAt(tracks, 80)).toBeNull();
});

test("weak observations and long gaps suppress the pair line", () => {
  const weak = track(.2);
  weak.segments[0].points[1].confidence = .4;
  expect(playerPairAt([weak, track(.6)], 80)).toBeNull();
  const gap = { segments: [{ startMs: 0, endMs: 1000, points: [point(0, .2), point(1000, .3)] }] };
  expect(playerPairAt([gap, gap], 500)).toBeNull();
});

const sourceSha256 = "a".repeat(64);
const identity = { sourceSha256, videoId: "video-1", angleId: "angle-1", atMs: 1000 };
const calibration = () => ({
  status: "verified", verifiedBy: "reviewer", verifiedAt: "2026-11-19T12:00:00Z", videoId: "video-1",
  pitchLengthM: 105, pitchWidthM: 68, metadata: { sourceSha256, angleId: "angle-1" },
  frames: [{ atMs: 1000, validFromMs: 900, validToMs: 1100, confidence: .9, rmsErrorM: .4,
    inputSpace: "normalized-image", imageToPitchMatrix: [100, 0, 0, 0, 60, 0, 0, 0, 1],
    controlPoints: [{ imageX: .1, imageY: .1 }, { imageX: .9, imageY: .1 },
      { imageX: .9, imageY: .9 }, { imageX: .1, imageY: .9 }],
  }],
});
const pair = [{ groundPoint: { x: .2, y: .5 } }, { groundPoint: { x: .3, y: .5 } }];

test("metres require reviewed source-bound frame-local geometry", () => {
  expect(verifiedPairDistance(pair, calibration(), identity)).toBeCloseTo(10);
  expect(verifiedPairDistance(pair, normalizePitchCalibration(calibration()), identity)).toBeCloseTo(10);
  for (const patch of [{ sourceSha256: "b".repeat(64) }, { videoId: "other" }, { angleId: "other" }, { atMs: 1200 }]) {
    expect(verifiedPairDistance(pair, calibration(), { ...identity, ...patch })).toBeNull();
  }
  expect(verifiedPairDistance(pair, null, identity)).toBeNull();
  expect(verifiedPairDistance(pair, { ...calibration(), status: "calibrated" }, identity)).toBeNull();
  expect(verifiedPairDistance(pair, { ...calibration(), verifiedBy: "" }, identity)).toBeNull();
});

test("a static whole-video homography, unsupported region or poor fit cannot display metres", () => {
  for (const patch of [
    { validFromMs: 0, validToMs: 7200000 }, { rmsErrorM: 4 }, { confidence: .3 },
    { controlPoints: [] }, { imageToPitchMatrix: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { controlPoints: [{ imageX: 0, imageY: 0 }, { imageX: .15, imageY: 0 },
      { imageX: .15, imageY: .15 }, { imageX: 0, imageY: .15 }] },
    { controlPoints: Array.from({ length: 4 }, () => ({ imageX: .2, imageY: .2 })) },
  ]) {
    const value = calibration(); Object.assign(value.frames[0], patch);
    expect(verifiedPairDistance(pair, value, identity)).toBeNull();
  }
});

test("session reuse is bounded and requires the exact attached file and context", () => {
  const cache = createPlayerPairCache(), file = {}, tracks = [track(.2), track(.6)];
  const context = { key: "user:team:video:angle:clip:range", file };
  cache.set(context, tracks);
  expect(cache.get(context)).toBe(tracks);
  expect(cache.get({ ...context, file: {} })).toBeNull();
  expect(cache.get({ ...context, key: "another-user" })).toBeNull();
  for (let index = 0; index < 10; index++) cache.set({ key: String(index), file }, tracks);
  expect(cache.get(context)).toBeNull();
});

test("tracking binds to the active camera and rejects prepared playback windows", async () => {
  const win = { URL, document: { createElement: () => ({ canPlayType: () => "probably" }) } };
  const reference = await createLocalVideoReference(new File(["avc1"], "pair.mp4", { type: "video/mp4" }), win);
  const state = { match: { id: "match" }, video: { id: "video" }, videoRef: { ...reference, durationMs: 60000 },
    mediaProduction: { activeAngleId: "side", angleRefs: { side: { ...reference, durationMs: 60000 } },
      angles: [{ id: "side", primary: true, syncOffsetMs: -10000, driftPpm: 1000 }] } };
  const range = { startMs: 20000, endMs: 30000 };
  expect(playerPairContext({}, "clip", range)).toBeNull();
  const context = playerPairContext(state, "clip", range, { currentUser: { id: "user" } });
  expect(context.sourceRange).toEqual({ start: 10020, end: 20030, duration: 10000 });
  expect(playerPairContext(state, "clip", { startMs: 5000, endMs: 15000 })).toBeNull();
  const portable = { ...state, mediaProduction: { portable: { playback: { active: true, url: "blob:review", startMs: 20000, endMs: 30000 } } } };
  expect(playerPairContext(portable, "clip", range)).toBeNull();
  revokeLocalVideoReference(reference, win);
});

test("the shared popup adds one tool and overlay without a second transport or data writes", () => {
  const markup = renderClipEditor({ id: "clip", startMs: 0, endMs: 15000 });
  expect(markup.match(/data-player-pair-toggle/g)).toHaveLength(1);
  expect(markup.match(/data-player-pair-canvas/g)).toHaveLength(1);
  expect(markup.match(/data-clip-preview-play /g)).toHaveLength(1);
  const source = readFileSync(new URL("../src/modules/video-analysis/timeline/timeline.player-pair.controller.js", import.meta.url), "utf8");
  expect(source).not.toMatch(/savePlaylist|saveClip|localStorage|indexedDB|saveCalibration/);
});
