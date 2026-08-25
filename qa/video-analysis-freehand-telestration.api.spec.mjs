import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const presentationApi = require("../api/_lib/video-analysis-presentation-database.js");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("freehand geometry stays bounded, movable and normalized", async () => {
  const geometry = await import(moduleUrl("src/modules/video-analysis/services/presentationLayerGeometryService.js"));
  const rawPoints = Array.from({ length: 400 }, (_, index) => ({
    x: index - 20,
    y: 120 - index,
  }));
  const points = geometry.normalizeFreehandPoints(rawPoints);
  expect(points).toHaveLength(256);
  expect(points[0]).toEqual({ x: 0, y: 100 });
  expect(points.at(-1).x).toBe(100);
  expect(points.at(-1).y).toBe(0);

  const moved = geometry.moveGeometry({ points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }, 5, -10);
  expect(moved.points).toEqual([{ x: 15, y: 10 }, { x: 35, y: 30 }]);
});

test("presentation API accepts freehand metadata and bounds point payloads", () => {
  const layer = presentationApi.normalizeDrawingLayer({
    tool: "freehand",
    geometry: {
      points: Array.from({ length: 300 }, (_, index) => ({ x: index / 2, y: index / 3 })),
      localPath: "/private/match.mp4",
    },
  });
  expect(layer.tool).toBe("freehand");
  expect(layer.geometry.points).toHaveLength(256);
  expect(layer.geometry).not.toHaveProperty("localPath");
  expect(layer.geometry.points.every((point) => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100)).toBe(true);
});

test("render export converts freehand drawings into bounded line primitives", async () => {
  const { buildMediaOverlaySpec } = await import(moduleUrl("src/modules/video-analysis/services/mediaOverlayExportService.js"));
  const specification = buildMediaOverlaySpec({
    presentation: {
      selectedItemId: "item-1",
      current: {
        sections: [{
          id: "section-1",
          items: [{
            id: "item-1",
            clipId: "clip-1",
            drawings: [{
              id: "freehand-1",
              tool: "freehand",
              timestampMs: 1_000,
              durationMs: 2_000,
              geometry: { points: [{ x: 10, y: 20 }, { x: 25, y: 35 }, { x: 40, y: 30 }] },
              style: { color: "#f4d06f", lineWidth: 5 },
            }],
          }],
        }],
      },
    },
  }, {
    preset: "analysis-1080p",
    range: { startMs: 0, endMs: 5_000 },
  });
  expect(specification.primitives).toContainEqual(expect.objectContaining({
    id: "freehand-1",
    type: "line",
    startMs: 1_000,
    endMs: 3_000,
    points: [{ x: 0.1, y: 0.2 }, { x: 0.25, y: 0.35 }, { x: 0.4, y: 0.3 }],
  }));
});

test("freehand drawing tool is enabled by an additive migration", () => {
  const migration = fs.readFileSync(path.join(rootDir, "supabase/migrations/20260825043000_video_analysis_freehand_telestration.sql"), "utf8");
  expect(migration).toContain("video_drawing_layers_tool_check");
  expect(migration).toContain("'freehand'");
  expect(migration).not.toMatch(/drop table|truncate|delete from/i);
});
