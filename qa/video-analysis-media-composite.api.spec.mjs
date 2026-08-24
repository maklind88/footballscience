import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(Buffer.concat(stdout))
      : reject(new Error(stderr || `${command} exited with ${code}`)));
  });
}

test("media overlay samples reviewed tracking and keeps confidence gaps visible", async () => {
  const overlay = await import(moduleUrl("src/modules/video-analysis/services/mediaOverlayExportService.js"));
  const state = {
    presentation: {
      selectedItemId: "item-1",
      current: {
        sections: [{ id: "section-1", items: [{
          id: "item-1",
          clipId: "clip-1",
          drawings: [{
            id: "drawing-1",
            tool: "arrow",
            timestampMs: 1000,
            durationMs: 1000,
            geometry: { x1: 10, y1: 80, x2: 40, y2: 50 },
          }],
          objectTracks: [{
            id: "track-1",
            status: "verified",
            startMs: 1000,
            endMs: 2000,
            segments: [
              {
                startMs: 1000,
                endMs: 1240,
                points: [
                  { atMs: 1000, x: 0.2, y: 0.5, width: 0.04, height: 0.12, confidence: 0.95, identityConfidence: 0.95 },
                  { atMs: 1240, x: 0.28, y: 0.5, width: 0.04, height: 0.12, confidence: 0.92, identityConfidence: 0.92 },
                ],
              },
              {
                startMs: 1760,
                endMs: 2000,
                discontinuityBefore: true,
                points: [
                  { atMs: 1760, x: 0.62, y: 0.5, width: 0.04, height: 0.12, confidence: 0.9, identityConfidence: 0.9 },
                  { atMs: 2000, x: 0.7, y: 0.5, width: 0.04, height: 0.12, confidence: 0.95, identityConfidence: 0.95 },
                ],
              },
            ],
          }],
          dynamicGraphics: [{
            id: "graphic-1",
            type: "circle",
            source: "tracking",
            startMs: 1000,
            endMs: 2000,
            confidenceThreshold: 0.55,
            bindings: [{ id: "binding-1", trackId: "track-1", anchor: "center" }],
          }],
        }] }],
      },
    },
  };
  const specification = overlay.buildMediaOverlaySpec(state, {
    range: { startMs: 1000, endMs: 2000 },
    preset: "analysis-1080p",
  });
  const trackingPrimitives = specification.primitives.filter((entry) => entry.id === "graphic-1");
  expect(specification.primitives.some((entry) => entry.id === "drawing-1" && entry.arrow)).toBeTruthy();
  expect(trackingPrimitives.length).toBeGreaterThan(1);
  expect(trackingPrimitives.some((entry) => entry.center.x < 0.3)).toBeTruthy();
  expect(trackingPrimitives.some((entry) => entry.center.x > 0.6)).toBeTruthy();
  expect(trackingPrimitives.every((entry) => Math.abs(entry.center.x - 0.45) > 0.08)).toBeTruthy();
});

test("drawing layers use match time instead of the active camera clock", async () => {
  const drawingModule = await import(moduleUrl("src/modules/video-analysis/controllers/drawingController.js"));
  let state = {
    timeline: { playheadMs: 12_000 },
    presentation: {
      selectedItemId: "item-1",
      drawingTool: "circle",
      current: { sections: [{ id: "section-1", items: [{ id: "item-1", clipId: "clip-1", drawings: [] }] }] },
    },
  };
  const controller = drawingModule.createDrawingController({
    getState: () => state,
    getVideoElement: () => ({ currentTime: 14.4, readyState: 4 }),
    getCurrentMatchMs: () => 12_000,
    updateState: (updater) => { state = updater(state); },
  });
  controller.addLayerAtPoint({ cx: 50, cy: 50, rx: 10, ry: 10 });
  expect(state.presentation.current.sections[0].items[0].drawings[0].timestampMs).toBe(12_000);
});

test("bundled FFmpeg burns an ASS primitive into exported video pixels", async () => {
  const engineModule = await import(moduleUrl("desktop/local-video-app/local-video-server/ffmpeg-engine.mjs"));
  const overlayModule = await import(moduleUrl("desktop/local-video-app/local-video-server/media-overlay-store.mjs"));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-composite-test-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "output.mp4");
  const overlayPath = path.join(tempDir, "overlay.ass");
  try {
    await run(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=320x180:d=0.6:r=25",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", inputPath,
    ]);
    const specification = {
      playRes: { width: 320, height: 180 },
      primitives: [{
        id: "ellipse-1",
        type: "ellipse",
        startMs: 0,
        endMs: 500,
        points: [],
        center: { x: 0.5, y: 0.5 },
        radiusX: 0.18,
        radiusY: 0.25,
        arrow: false,
        text: "",
        style: { color: "#ff0000", secondaryColor: "#ffffff", lineWidth: 3, opacity: 1, fillOpacity: 1, fontSize: 24 },
      }],
    };
    await fs.writeFile(overlayPath, overlayModule.buildAssOverlay(specification));
    const rendered = await engineModule.createFfmpegEngine({ ffmpegPath }).renderExport(inputPath, outputPath, {
      startMs: 0,
      endMs: 500,
      height: 720,
      crf: 18,
      overlayPath,
    });
    expect(rendered.composited).toBe(true);
    const frame = await run(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", outputPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]);
    const centerOffset = ((90 * 320) + 160) * 3;
    expect(frame.length).toBe(320 * 180 * 3);
    expect(frame[centerOffset]).toBeGreaterThan(80);
    expect(frame[centerOffset]).toBeGreaterThan(frame[centerOffset + 1] + 40);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
