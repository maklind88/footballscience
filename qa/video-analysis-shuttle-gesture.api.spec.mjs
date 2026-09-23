import { expect, test } from "@playwright/test";
import { VIDEO_SHUTTLE_IDLE_MS, videoShuttleHorizontalDelta, videoShuttleHasHorizontalIntent,
  videoShuttleSpeedFromDelta } from "../src/modules/video-analysis/services/videoShuttleGesture.js";

test("shared shuttle gesture preserves FS Player direction, threshold and speed", () => {
  expect(videoShuttleHorizontalDelta({ deltaX: 24, deltaY: 2 })).toBe(24);
  expect(videoShuttleHorizontalDelta({ deltaX: -24, deltaY: 2 })).toBe(-24);
  expect(videoShuttleHorizontalDelta({ deltaX: 5 })).toBe(0);
  expect(videoShuttleHasHorizontalIntent({ deltaX: 2 })).toBe(true);
  expect(videoShuttleHasHorizontalIntent({ deltaX: 1 })).toBe(false);
  expect(videoShuttleHorizontalDelta({ deltaX: 8, deltaY: 40 })).toBe(0);
  expect(videoShuttleHasHorizontalIntent({ deltaX: 8, deltaY: 40 })).toBe(false);
  expect(videoShuttleSpeedFromDelta(0)).toBe(4);
  expect(videoShuttleSpeedFromDelta(30)).toBe(5.5);
  expect(videoShuttleSpeedFromDelta(-60)).toBe(7);
  expect(videoShuttleSpeedFromDelta(1000)).toBe(7);
  expect(VIDEO_SHUTTLE_IDLE_MS).toBe(520);
});

test("shared shuttle accepts line/page units, legacy wheel events and Shift scrolling", () => {
  expect(videoShuttleHorizontalDelta({ deltaX: 1, deltaMode: 1 })).toBe(16);
  expect(videoShuttleHorizontalDelta({ deltaX: -1, deltaMode: 2 })).toBe(-800);
  expect(videoShuttleHorizontalDelta({ wheelDeltaX: 60 })).toBe(-60);
  expect(videoShuttleHorizontalDelta({ deltaY: 24, shiftKey: true })).toBe(24);
  expect(videoShuttleHasHorizontalIntent({ deltaY: 3, shiftKey: true })).toBe(true);
});
