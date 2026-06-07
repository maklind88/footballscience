import { expect, test } from "@playwright/test";
import {
  createSessionPlannerTacticalHelpers,
  sessionPlannerTacticalPitchModeOptions,
} from "../src/modules/session-planner/index.mjs";

function createHelpers(overrides = {}) {
  return createSessionPlannerTacticalHelpers({
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    tacticalPitchModeOptions: sessionPlannerTacticalPitchModeOptions,
    tacticalPitchModeKeys: new Set(sessionPlannerTacticalPitchModeOptions.map((option) => option.key)),
    tacticalMaxFrames: 2,
    getLineState: () => ({
      color: "#2563eb",
      lineWidth: 2,
      lineStyle: "",
    }),
    getSelectedBlock: () => ({ tacticalPitchMode: "attacking-half" }),
    ...overrides,
  });
}

test("Session Planner tactical helpers normalize colors, badges, lines, and rotation", () => {
  const helpers = createHelpers();

  expect(helpers.getDefaultTacticalColor("pass")).toBe("#2563eb");
  expect(helpers.normalizeTacticalColor("not-a-color", "#111827")).toBe("#111827");
  expect(helpers.normalizeTacticalLineWidth(99)).toBe(6);
  expect(helpers.normalizeTacticalRotation(-45)).toBe(315);
  expect(helpers.normalizeTacticalPlayerBadge("  a-9  ")).toBe("A9");
  expect(helpers.getTacticalStrokeDasharray("dotted")).toBe("0.7 1.6");
  expect(helpers.getTacticalRenderStrokeWidth(4)).toBeCloseTo(2.08);
  expect(helpers.isTacticalPlayerType("neutral-player")).toBe(true);
  expect(helpers.isTacticalGoalType("mini-goal")).toBe(true);
});

test("Session Planner tactical helpers clone elements and frame data deterministically", () => {
  const helpers = createHelpers();
  const cloned = helpers.cloneTacticalElement({
    id: "el-1",
    type: "blue-player",
    x: -10,
    y: 123,
    color: "bad",
    playerNumber: "  11  ",
    points: [{ x: 12, y: 22 }, { x: "bad", y: 4 }],
    rotation: 725,
  });

  expect(cloned).toMatchObject({
    id: "el-1",
    type: "blue-player",
    x: 0,
    y: 100,
    color: "#1d8bff",
    playerNumber: "11",
    rotation: 5,
  });
  expect(cloned.points).toEqual([{ x: 12, y: 22 }]);

  const frames = helpers.normalizeTacticalFrames([
    { id: "frame-1", label: "  First   frame ", elements: [{ id: "el-a", x: 10, y: 20 }] },
    { id: "frame-1", label: "", elements: [] },
    { id: "frame-3", label: "Ignored by max", elements: [] },
  ]);

  expect(frames).toHaveLength(2);
  expect(frames[0].label).toBe("First frame");
  expect(frames[1].id).not.toBe("frame-1");
  expect(frames[1].label).toBe("Frame 2");
  expect(helpers.normalizeTacticalActiveFrameId("missing", frames)).toBe(frames[0].id);
});

test("Session Planner tactical helpers preserve pitch mode and line element behavior", () => {
  const helpers = createHelpers();

  expect(helpers.normalizeTacticalPitchMode("full-wide")).toBe("full-wide");
  expect(helpers.normalizeTacticalPitchMode("unknown")).toBe("full");
  expect(helpers.getTacticalPitchModeOption("goalkeeper")).toMatchObject({ key: "goalkeeper" });
  expect(helpers.getTacticalPitchDimensionsForBlock()).toEqual({ x: 65, y: 52.5 });

  const curveControl = helpers.getTacticalDefaultCurveControlPoint({ x: 10, y: 20 }, { x: 50, y: 20 });
  expect(curveControl).toMatchObject({ x: 30 });
  expect(curveControl.y).toBeGreaterThan(20);

  const line = helpers.createLineElement("pass", { x: 10, y: 20 }, { x: 30, y: 40 });
  expect(line).toEqual({
    type: "pass",
    x: 10,
    y: 20,
    x2: 30,
    y2: 40,
    color: "#2563eb",
    lineWidth: 2,
    lineStyle: "dashed",
  });

  const curve = helpers.createLineElement("curve", { x: 10, y: 20 }, { x: 30, y: 40 }, {
    controlPoint: { x: 18, y: 28 },
  });
  expect(curve).toMatchObject({ controlX: 18, controlY: 28 });
});
