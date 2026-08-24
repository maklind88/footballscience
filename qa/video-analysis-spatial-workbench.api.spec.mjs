import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function fullPitchPoints() {
  return [
    { id: "a", landmarkId: "corner-home-left", imageX: 0.1, imageY: 0.1, pitchXM: 0, pitchYM: 0 },
    { id: "b", landmarkId: "corner-away-left", imageX: 0.9, imageY: 0.1, pitchXM: 105, pitchYM: 0 },
    { id: "c", landmarkId: "corner-away-right", imageX: 0.9, imageY: 0.9, pitchXM: 105, pitchYM: 68 },
    { id: "d", landmarkId: "corner-home-right", imageX: 0.1, imageY: 0.9, pitchXM: 0, pitchYM: 68 },
  ];
}

test("manual pitch calibration solves metres and produces a perspective overlay", async () => {
  const solve = await import(moduleUrl("src/modules/video-analysis/services/pitchCalibrationSolveService.js"));
  const overlay = await import(moduleUrl("src/modules/video-analysis/services/pitchOverlayGeometryService.js"));
  const calibration = solve.buildPitchCalibration(fullPitchPoints(), {
    videoId: "video-1",
    atMs: 1000,
    durationMs: 10_000,
  });
  expect(calibration).toMatchObject({ status: "calibrated", confidence: 1 });
  expect(calibration.frames[0]).toMatchObject({ controlPointCount: 4, rmsErrorM: 0 });
  const geometry = overlay.pitchOverlayGeometry(calibration, 1000);
  expect(geometry.available).toBe(true);
  expect(geometry.lines.length).toBeGreaterThanOrEqual(6);
  expect(geometry.lines[0][0].x).toBeCloseTo(0.1, 8);
  expect(geometry.lines[0][0].y).toBeCloseTo(0.1, 8);
});

test("missing pitch calibration remains unready without breaking rendering", async () => {
  const model = await import(moduleUrl("src/modules/video-analysis/domain/pitchCalibration.model.js"));
  expect(model.calibrationReadiness(null)).toEqual({
    ready: false,
    frameCount: 0,
    usableFrameCount: 0,
    confidence: 0,
  });
  expect(model.normalizePitchCalibration({ frames: [null] }).frames).toEqual([]);
});

test("pitch calibration stays draft when landmarks cover too little image area", async () => {
  const solve = await import(moduleUrl("src/modules/video-analysis/services/pitchCalibrationSolveService.js"));
  const calibration = solve.buildPitchCalibration(fullPitchPoints().map((point, index) => ({
    ...point,
    imageX: 0.45 + ((index % 2) * 0.03),
    imageY: 0.45 + (Math.floor(index / 2) * 0.03),
  })));
  expect(calibration.status).toBe("draft");
  expect(calibration.confidence).toBeLessThan(0.5);
});

test("spatial metadata API gates verification and remains service-role only", async () => {
  const contracts = require(path.join(rootDir, "api/_lib/video-analysis-spatial-contracts.js"));
  const strong = contracts.normalizeCalibrationPayload({
    videoId: "11111111-1111-4111-8111-111111111111",
    status: "verified",
    frames: [{
      atMs: 0,
      validFromMs: 0,
      validToMs: 1000,
      imageToPitchMatrix: [131.25, 0, -13.125, 0, 85, -8.5, 0, 0, 1],
      controlPoints: fullPitchPoints(),
      confidence: 0,
      rmsErrorM: 100,
    }],
  }, { organizationId: "club-a", teamId: "team-a", id: "analyst-a" });
  expect(strong.status).toBe("verified");
  expect(strong.frames[0]).toMatchObject({ confidence: 1, rmsErrorM: 0 });
  const tampered = contracts.normalizeCalibrationPayload({ ...strong, status: "verified", frames: [{
    ...strong.frames[0], matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], confidence: 1, rmsErrorM: 0,
  }] }, { organizationId: "club-a", teamId: "team-a" });
  expect(tampered.status).toBe("draft");
  expect(tampered.frames[0].confidence).toBe(0);
  expect(() => contracts.normalizeCalibrationPayload({ ...strong, videoBytes: "raw" })).toThrow(/must not be sent/i);

  const migration = await fs.readFile(path.join(rootDir, "supabase/migrations/20260825000500_video_analysis_pitch_calibration.sql"), "utf8");
  for (const table of ["video_pitch_calibrations", "video_pitch_calibration_frames"]) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }
  expect(migration).not.toMatch(/grant\s+.+\s+to\s+(?:anon|authenticated)/i);
  const api = await fs.readFile(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  expect(api).toContain('action === "pitch-calibration"');
  expect(api).toContain('action === "save-pitch-calibration"');
});

test("spatial controller switches panel through the delegated tab event", async () => {
  const { createSpatialController } = await import(moduleUrl("src/modules/video-analysis/controllers/spatialController.js"));
  let state = {
    video: { id: "video-1" },
    presentation: { spatial: { panel: "tracking" } },
  };
  const controller = createSpatialController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    loadCalibration: async () => ({ calibration: null }),
  });
  const button = {
    nodeType: 1,
    dataset: { videoAnalysisSpatialPanel: "spatial" },
    closest: (selector) => selector === "[data-video-analysis-spatial-panel]" ? button : null,
  };
  expect(controller.handleClick({ target: button })).toBe(true);
  await expect.poll(() => state.presentation.spatial.loading).toBe(false);
  expect(state.presentation.spatial.panel).toBe("spatial");
});
