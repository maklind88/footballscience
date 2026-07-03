import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTacticalBoardSvgElementGeometry,
  getTacticalBoardElementEndpointCoordinates,
  getTacticalBoardSvgElementGeometryAttributes,
  getTacticalBoardSvgElementTagName,
  renderTacticalBoardSvgElement,
} from "../src/modules/tactical-board/index.mjs";
import {
  createSessionPlannerTacticalHelpers,
  sessionPlannerTacticalPitchModeOptions,
} from "../src/modules/session-planner/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("Session Planner tactical SVG rendering uses the shared Tactical Board core", () => {
  const visualRendererSource = fs.readFileSync(
    path.join(rootDir, "src/modules/session-planner/session-planner-visual-renderer.mjs"),
    "utf8",
  );

  expect(visualRendererSource).toContain("renderTacticalBoardSvgElement");
  expect(visualRendererSource).toContain("getTacticalBoardElementEndpointCoordinates");

  const coordinates = getTacticalBoardElementEndpointCoordinates({
    id: "curve-1",
    type: "curve",
    x: 10,
    y: 20,
    x2: 30,
    y2: 40,
    controlX: 18,
    controlY: 28,
  });
  expect(coordinates).toEqual({ x: 10, y: 20, x2: 30, y2: 40, controlX: 18, controlY: 28 });

  const pass = renderTacticalBoardSvgElement({
    id: "pass-1",
    type: "pass",
    x: 12,
    y: 24,
    x2: 44,
    y2: 52,
    color: "#2563eb",
    lineStyle: "dashed",
  }, "shared-arrow", {
    isSelected: () => true,
    classPrefix: "session-tactical",
    dataAttributeName: "data-session-tactical-element-id",
    hitTargetClassName: "session-tactical-hit-target",
    shapeHitTargetClassName: "session-tactical-shape-hit-target",
    getStrokeDasharray: () => "3 2",
    getRenderStrokeWidth: () => 1.04,
  });

  expect(pass).toContain('data-session-tactical-element-id="pass-1"');
  expect(pass).toContain('class="session-tactical-pass is-selected"');
  expect(pass).toContain('marker-end="url(#shared-arrow)"');
  expect(pass).toContain('class="session-tactical-hit-target"');

  const customZone = renderTacticalBoardSvgElement({
    id: "zone-1",
    type: "zone",
    x: 20,
    y: 20,
    x2: 40,
    y2: 35,
  }, "shared-arrow", {
    classPrefix: "shared-board",
    getClassName: (baseClassName, _element, slot) => `${baseClassName} qa-${slot}`,
    getAttributes: (_element, slot) => `data-qa-slot="${slot}"`,
  });

  expect(customZone).toContain('class="shared-board-zone qa-element"');
  expect(customZone).toContain('data-qa-slot="element"');
  expect(customZone).toContain('data-qa-slot="hit-target"');
});

test("shared Tactical Board core applies SVG geometry to live board elements", () => {
  const runElement = {
    id: "run-1",
    type: "run",
    x: 10,
    y: 70,
    x2: 40,
    y2: 35,
    color: "#38bdf8",
    lineStyle: "dashed",
    lineWidth: 2.5,
  };
  const runGeometry = getTacticalBoardSvgElementGeometryAttributes(runElement, "shared-arrow", {
    getDefaultCurveControlPoint: () => ({ x: 28, y: 46 }),
    getStrokeDasharray: () => "6 4",
    getRenderStrokeWidth: () => 1.3,
  });

  expect(getTacticalBoardSvgElementTagName(runElement)).toBe("path");
  expect(runGeometry.tagName).toBe("path");
  expect(runGeometry.attributes.d).toBe("M 10 70 Q 28 46 40 35");
  expect(runGeometry.attributes["marker-end"]).toBe("url(#shared-arrow)");

  const attributes = new Map([
    ["marker-end", "url(#old-arrow)"],
    ["stroke-dasharray", "1 1"],
  ]);
  const fakePath = {
    tagName: "path",
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };

  expect(applyTacticalBoardSvgElementGeometry(fakePath, runElement, "shared-arrow", {
    getDefaultCurveControlPoint: () => ({ x: 28, y: 46 }),
    getStrokeDasharray: () => "6 4",
    getRenderStrokeWidth: () => 1.3,
  })).toBe(true);
  expect(attributes.get("d")).toBe("M 10 70 Q 28 46 40 35");
  expect(attributes.get("stroke")).toBe("#38bdf8");
  expect(attributes.get("stroke-width")).toBe("1.3");
  expect(attributes.get("stroke-dasharray")).toBe("6 4");

  const lineElement = { ...runElement, type: "line" };
  expect(getTacticalBoardSvgElementTagName(lineElement)).toBe("line");
  expect(applyTacticalBoardSvgElementGeometry(fakePath, lineElement, "shared-arrow")).toBe(false);
});
