import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorActionSpaceBallProfileBasics } from "../src/modules/game-simulator/action-space-ball-profile-basics.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createBallProfileTemplate(overrides = {}) {
  return {
    key: "firm-feet",
    label: "Firm To Feet",
    minDistance: 0,
    maxDistance: 40,
    averageSpeedRange: [8, 12],
    launchMultiplierRange: [1, 1.2],
    rollFloorRange: [1, 2],
    flightStyle: "ground",
    peakHeightRange: [0, 0],
    controlHeightRange: [0.12, 0.18],
    landingPhaseRange: [0.58, 0.68],
    curveRange: [0, 0.8],
    spinRateRange: [0, 2],
    ...overrides,
  };
}

function createBasics(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      curveAmount: 2,
      curveDirection: 1,
      manualSpeed: 11,
      position: { x: 20, y: 34 },
      startPosition: { x: 10, y: 34 },
      target: { x: 30, y: 34 },
      trackDistanceCovered: 5,
      trackDistanceTotal: 20,
    },
    defensiveAggressionPreset: "balanced",
    dribbleSpeed: 5.2,
    surfacePreset: "hybrid-grass",
    weatherPreset: "damp",
  };
  const deps = {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    autoBallProfiles: {
      "firm-feet": createBallProfileTemplate(),
      clipped: createBallProfileTemplate({ key: "clipped", label: "Clipped", flightStyle: "clipped", peakHeightRange: [1, 3] }),
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    defensiveAggressionPresets: {
      balanced: { label: "Balanced" },
      aggressive: { label: "Aggressive" },
    },
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getCompetitionPhysicalProfile: () => ({ ballPowerMultiplier: 1.1 }),
    getPlayerFacingAngle: (player) => player?.bodyAngle ?? 0,
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalize: (from, to) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    },
    normalizeAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
    pitch,
    pitchSurfacePresets: { "hybrid-grass": { label: "Hybrid grass" } },
    state,
    weatherPresets: { damp: { label: "Damp" } },
    ...overrides,
  };

  return {
    engine: createGameSimulatorActionSpaceBallProfileBasics(deps),
    state,
  };
}

test("game simulator action space ball profile basics exposes profile and travel helpers", () => {
  const { engine } = createBasics();

  expect(typeof engine.getBallProfileDistanceRatio).toBe("function");
  expect(typeof engine.getPitchSurfacePreset).toBe("function");
  expect(typeof engine.getWeatherPreset).toBe("function");
  expect(typeof engine.getDefensiveAggressionPreset).toBe("function");
  expect(typeof engine.isAerialFlightStyle).toBe("function");
  expect(typeof engine.getFlightStyleLabel).toBe("function");
  expect(typeof engine.resolveBallCurveDirection).toBe("function");
  expect(typeof engine.getBallTravelProgress).toBe("function");
  expect(typeof engine.getBallTravelPoint).toBe("function");
  expect(typeof engine.materializeBallProfile).toBe("function");
  expect(typeof engine.getManualBallProfile).toBe("function");
});

test("game simulator action space ball profile basics materializes auto and manual profiles", () => {
  const { engine, state } = createBasics();

  const autoProfile = engine.materializeBallProfile("firm-feet", 20, "to-feet");
  const manualProfile = engine.getManualBallProfile("pass", autoProfile);

  expect(autoProfile.averageSpeed).toBeCloseTo(11);
  expect(autoProfile.rollFloor).toBeCloseTo(1.65);
  expect(autoProfile.targetKind).toBe("to-feet");
  expect(manualProfile.source).toBe("manual");
  expect(manualProfile.averageSpeed).toBe(state.ball.manualSpeed);
});

test("game simulator action space ball profile basics reads live travel state", () => {
  const { engine, state } = createBasics();

  expect(engine.getBallTravelProgress()).toBeCloseTo(0.25);
  const curvedPoint = engine.getBallTravelPoint(0.5);

  expect(curvedPoint.x).toBeCloseTo(20);
  expect(curvedPoint.y).toBeGreaterThan(34);

  state.ball.trackDistanceCovered = 10;
  expect(engine.getBallTravelProgress()).toBeCloseTo(0.5);
});

test("game simulator action space ball profile basics is split out of the ball profiles module", () => {
  const profilesSource = readProjectFile("src/modules/game-simulator/action-space-ball-profiles.mjs");
  const basicsSource = readProjectFile("src/modules/game-simulator/action-space-ball-profile-basics.mjs");

  expect(profilesSource).toContain('from "./action-space-ball-profile-basics.mjs"');
  expect(profilesSource).toContain("createGameSimulatorActionSpaceBallProfileBasics({");
  expect(profilesSource).not.toContain("function materializeBallProfile(");
  expect(profilesSource).not.toContain("function getManualBallProfile(");
  expect(basicsSource).toContain("createGameSimulatorActionSpaceBallProfileBasics");
  expect(basicsSource).toContain("function materializeBallProfile(");
  expect(basicsSource).toContain("function getManualBallProfile(");
});
