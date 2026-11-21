import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validPairCalibration, estimatedPairDistance, loadPairCalibration, pairDistanceLabel } from "../src/modules/video-analysis/services/playerPairCalibrationService.js";

const bytes = readFileSync(new URL("../src/modules/video-analysis/calibration/seattle-177515-192515.json", import.meta.url));
const profile = JSON.parse(bytes);
const identity = { sourceSha256: profile.sourceSha256, width: 1920, height: 1080, sourceAtMs: 177515 };

function imagePoint(matrix, x, y) {
  const a = matrix[0] - x * matrix[6], b = matrix[1] - x * matrix[7], c = x * matrix[8] - matrix[2];
  const d = matrix[3] - y * matrix[6], e = matrix[4] - y * matrix[7], f = y * matrix[8] - matrix[5];
  return { groundPoint: { x: (c * e - b * f) / (a * e - b * d) / 1920, y: (a * f - c * d) / (a * e - b * d) / 1080 } };
}
const pair = frame => [imagePoint(frame.matrix, 0, 0), imagePoint(frame.matrix, 5, 0)];

test("the Seattle profile contains every original frame, with explicit estimated status and image checks", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("5f256667aaf75a7eaa6f7c77a1e295f7a5e0b0ddd40d96a9175fef6b43ddb27c");
  expect(validPairCalibration(profile, profile.sourceSha256)).toBe(true);
  expect(profile.frames).toHaveLength(451);
  expect(profile.independentMetricValidation).toBe(false);
  expect(profile.provenance.sourceFirstPts).toBe(2726395);
  expect(profile.validation).toEqual({ frames: 451, failed: 0, negativeControlsAccepted: 0 });
});

test("source-time projection is available for every frame including both clip boundaries", () => {
  for (const frame of profile.frames) {
    const sourceAtMs = Math.max(profile.validFromMs, Math.min(profile.validToMs, frame.atMs + 1));
    expect(estimatedPairDistance(pair(frame), profile, { ...identity, sourceAtMs })).toBeCloseTo(5, 5);
  }
  expect(estimatedPairDistance(pair(profile.frames[0]), profile, identity)).toBeCloseTo(5, 5);
  expect(estimatedPairDistance(pair(profile.frames.at(-1)), profile, { ...identity, sourceAtMs: 192515 })).toBeCloseTo(5, 5);
});

test("wrong source, resolution, time, unsupported feet and missing calibration withhold distances", () => {
  const points = pair(profile.frames[0]);
  for (const patch of [{ sourceSha256: "b".repeat(64) }, { width: 1280 }, { height: 720 },
    { sourceAtMs: 177514 }, { sourceAtMs: 192516 }, { sourceAtMs: NaN }]) {
    expect(estimatedPairDistance(points, profile, { ...identity, ...patch })).toBeNull();
  }
  expect(estimatedPairDistance(points, null, identity)).toBeNull();
  expect(estimatedPairDistance([{ groundPoint: { x: 0, y: 0 } }, points[1]], profile, identity)).toBeNull();
  expect(estimatedPairDistance([{ groundPoint: { x: NaN, y: .5 } }, points[1]], profile, identity)).toBeNull();
});

test("a rejected frame or sparse camera sequence cannot pass the profile contract", () => {
  for (const mutate of [
    value => { value.status = "verified"; },
    value => { value.validation.failed = 1; },
    value => { value.validation.negativeControlsAccepted = 1; },
    value => { value.frames[10].atMs += 80; },
    value => { value.frames[10].accepted = false; },
    value => { value.frames[10].paintChecks[0][1] = .7; },
    value => { value.frames[10].support = []; },
    value => { value.frames[10].matrix[2] = null; },
  ]) {
    const changed = structuredClone(profile); mutate(changed);
    expect(validPairCalibration(changed, profile.sourceSha256)).toBe(false);
  }
});

test("only exact source bytes load prepared geometry; a failed load can retry", async () => {
  let calls = 0;
  const win = { AbortSignal, fetch: async () => { calls++; return { ok: calls > 1, json: async () => profile }; } };
  expect(await loadPairCalibration("wrong-file", win)).toBeNull();
  expect(calls).toBe(0);
  expect(await loadPairCalibration(profile.sourceSha256, win)).toBeNull();
  expect(await loadPairCalibration(profile.sourceSha256, win)).toBe(profile);
  expect(await loadPairCalibration(profile.sourceSha256, win)).toBe(profile);
  expect(calls).toBe(2);
});

test("an estimate is visibly approximate and never advertises decimal precision", () => {
  expect(pairDistanceLabel(9.329, true)).toBe("\u22489 m");
  expect(pairDistanceLabel(9.329)).toBe("9.3 m");
  expect(pairDistanceLabel(null, true)).toBe("");
  expect(pairDistanceLabel(Infinity, true)).toBe("");
});
