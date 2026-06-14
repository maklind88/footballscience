import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorActionSpaceCarryRunwayTargets } from "../src/modules/game-simulator/action-space-carry-runway-targets.mjs";
import { createGameSimulatorActionSpaceDribbleCarryPaths } from "../src/modules/game-simulator/action-space-dribble-carry-paths.mjs";
import { createGameSimulatorActionSpaceDribbleCarryProfiles } from "../src/modules/game-simulator/action-space-dribble-carry-profiles.mjs";

const pitch = { length: 105, width: 68 };
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createDribbleProfileTemplate(key, label) {
  return {
    key,
    label,
    pressurePenalty: 0.18,
    lanePressurePenalty: 0.16,
    tightSpeed: 4.2,
    openSpeed: 6.4,
    distanceBoost: [0.1, 0.75],
    minSpeed: 3.4,
    maxSpeed: 7.2,
  };
}

function createState() {
  return {
    ball: {
      speed: 5.8,
      startPosition: { x: 40, y: 34 },
      target: { x: 58, y: 40 },
      trackDistanceCovered: 4,
      trackDistanceTotal: 18,
    },
    dribbleSpeed: 5.2,
    draftStep: null,
    players: [
      {
        id: "H8",
        team: "home",
        role: "Central Midfielder",
        roleKey: "connector",
        shortLabel: "8",
        position: { x: 40, y: 34 },
        bodyAngle: 0,
      },
      {
        id: "A4",
        team: "away",
        role: "Centre Back",
        roleKey: "back",
        shortLabel: "CB",
        position: { x: 60, y: 54 },
        bodyAngle: Math.PI,
      },
    ],
  };
}

function createCommonDeps(overrides = {}) {
  const state = overrides.state ?? createState();
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))),
    autoDribbleProfiles: {
      "eight-carry": createDribbleProfileTemplate("eight-carry", "8 Carry"),
      "winger-carry": createDribbleProfileTemplate("winger-carry", "Winger Carry"),
    },
    clamp,
    clampToPitch: (point, inset = 0) => ({
      x: clamp(point.x, inset, pitch.length - inset),
      y: clamp(point.y, inset, pitch.width - inset),
    }),
    cloneVector: (point) => ({ ...point }),
    distance,
    getActionSpaceValue: (_startPoint, targetPoint) => ({
      openTarget: 0.86,
      value: targetPoint.x >= 58 ? 0.74 : 0.52,
      targetThreat: {
        value: targetPoint.x >= 58 ? 0.74 : 0.52,
        behindLine: targetPoint.x >= 62 ? 0.42 : 0.24,
        centralPocket: 0.38,
        betweenLines: 0.42,
      },
      startThreat: { value: 0.28 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotRoleStrength: () => 0.72,
    getFootUsageScore: () => 0.86,
    getManualBallProfile: () => ({ key: "manual", label: "Manual Speed", averageSpeed: 5.2 }),
    getOffensiveAutopilotProfile: () => ({ carryBias: 0.68, dribbleBias: 0.62 }),
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPressureAtPoint: () => 0.12,
    getOrientationMovementProfile: () => ({ speedMultiplier: 0.96 }),
    getPitchSurfacePreset: () => ({ dribbleCarryFactor: 1 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 58 ? 0.74 : 0.28,
      behindLine: point.x >= 62 ? 0.42 : 0.18,
      centralPocket: 0.38,
      betweenLines: 0.42,
    }),
    getPlayerDecisionContext: () => ({
      pressure: 0.14,
      maxSpeed: 8.2,
      profile: {
        composure: 0.78,
        decisionQuality: 0.8,
        decisionSpeed: 0.78,
        pressResistance: 0.76,
        technicalSecurity: 0.82,
      },
    }),
    getPlayerFacingAngle: (player) => player?.bodyAngle ?? 0,
    getPlayerMagnetLabel: (player) => player?.shortLabel ?? player?.id ?? "",
    getPlayerPressureLoad: () => 0.14,
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    getWeatherPreset: () => ({ dribbleTractionFactor: 0.98, dribbleControlFactor: 0.96 }),
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isWideChannel: (point) => point.y <= 14 || point.y >= pitch.width - 14,
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from, to, step) => {
      const length = distance(from, to);
      if (length <= step || length <= 0.001) {
        return { ...to };
      }
      return {
        x: from.x + ((to.x - from.x) / length) * step,
        y: from.y + ((to.y - from.y) / length) * step,
      };
    },
    normalize: (from, to) => {
      const length = distance(from, to);
      return length <= 0.001 ? { x: 0, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    },
    normalizeAngle: (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)),
    pitch,
    state,
    subtract: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ...overrides,
  };
}

test("game simulator action space dribble carry profiles preserve auto-dribble contracts", () => {
  const deps = createCommonDeps();
  const profiles = createGameSimulatorActionSpaceDribbleCarryProfiles(deps);
  const carrier = deps.state.players[0];

  expect(typeof profiles.getDribbleRoleFamily).toBe("function");
  expect(typeof profiles.resolveAutoDribbleProfile).toBe("function");
  expect(typeof profiles.getNearestOpponentGapInCarryLane).toBe("function");
  expect(typeof profiles.getCarryLaneOpenSpaceScore).toBe("function");
  expect(profiles.getDribbleRoleFamily({ shortLabel: "W", role: "Winger" })).toBe("winger-carry");

  const profile = profiles.resolveAutoDribbleProfile(carrier.position, { x: 54, y: 34 }, carrier);
  expect(profile.key).toBe("eight-carry");
  expect(profile.source).toBe("auto");
  expect(profile.targetKind).toBe("carry");
  expect(profile.averageSpeed).toBeGreaterThan(4);
  expect(profiles.getCarryLaneOpenSpaceScore(profiles.getNearestOpponentGapInCarryLane(carrier, { x: 54, y: 34 }))).toBe(1);
});

test("game simulator action space carry runway targets preserve open-grass target decisions", () => {
  const deps = createCommonDeps({
    getNearestOpponentGapInCarryLane: () => Infinity,
    getCarryLaneOpenSpaceScore: () => 1,
  });
  const runwayTargets = createGameSimulatorActionSpaceCarryRunwayTargets(deps);
  const carrier = deps.state.players[0];
  const startPoint = { x: 48, y: 34 };
  const targetPoint = { x: 70, y: 34 };

  expect(typeof runwayTargets.getCarryRunwayProfile).toBe("function");
  expect(typeof runwayTargets.getRunwayCarryTarget).toBe("function");
  expect(typeof runwayTargets.getOpenGrassCarryContext).toBe("function");

  const runway = runwayTargets.getCarryRunwayProfile(carrier, startPoint, targetPoint, { carryBias: 0.68, dribbleBias: 0.62 });
  expect(runway.shouldExtend).toBe(true);
  expect(runway.forwardGain).toBeGreaterThan(6);

  const carryTarget = runwayTargets.getRunwayCarryTarget(carrier, startPoint, { carryBias: 0.68, dribbleBias: 0.62 });
  expect(carryTarget?.target.x).toBeGreaterThan(startPoint.x);
  expect(runwayTargets.getOpenGrassCarryContext(carrier, startPoint, { carryBias: 0.68, dribbleBias: 0.62 })?.active).toBe(true);
});

test("game simulator action space dribble carry paths preserve curved path and live speed contracts", () => {
  const deps = createCommonDeps({
    getNearestOpponentGapInCarryLane: () => Infinity,
    getCarryLaneOpenSpaceScore: () => 1,
    getCarryRunwayProfile: () => ({
      shouldExtend: true,
      runwayKind: "progressive-runway",
    }),
  });
  const paths = createGameSimulatorActionSpaceDribbleCarryPaths(deps);
  const carrier = deps.state.players[0];
  const startPoint = { x: 40, y: 34 };
  const targetPoint = { x: 58, y: 40 };

  expect(typeof paths.buildSampledCurvePath).toBe("function");
  expect(typeof paths.setDribbleCarryPathForBall).toBe("function");
  expect(typeof paths.getLiveDribbleSpeed).toBe("function");

  const path = paths.setDribbleCarryPathForBall(carrier, startPoint, targetPoint);
  expect(path.kind).toBe("curve");
  expect(deps.state.ball.dribblePath).toBe(path);
  expect(deps.state.ball.trackDistanceTotal).toBeGreaterThan(0);
  expect(paths.getDribbleCarryPathPoint(path, path.totalDistance / 2).x).toBeGreaterThan(startPoint.x);
  expect(paths.getLiveDribbleSpeed(carrier, targetPoint)).toBeGreaterThan(1.95);
});

test("game simulator action space dribble carry profiles keep moved code out of ball profiles", () => {
  const ballProfilesSource = readProjectFile("src/modules/game-simulator/action-space-ball-profiles.mjs");
  const dribbleProfilesSource = readProjectFile("src/modules/game-simulator/action-space-dribble-carry-profiles.mjs");
  const runwayTargetsSource = readProjectFile("src/modules/game-simulator/action-space-carry-runway-targets.mjs");
  const pathsSource = readProjectFile("src/modules/game-simulator/action-space-dribble-carry-paths.mjs");

  expect(ballProfilesSource).toContain('from "./action-space-dribble-carry-profiles.mjs"');
  expect(ballProfilesSource).toContain('from "./action-space-dribble-carry-paths.mjs"');
  expect(ballProfilesSource).not.toContain("function getDribbleRoleFamily(");
  expect(ballProfilesSource).not.toContain("function buildDribbleCarryPath(");
  expect(ballProfilesSource).not.toContain("function getLiveDribbleSpeed(");
  expect(dribbleProfilesSource).toContain('from "./action-space-carry-runway-targets.mjs"');
  expect(dribbleProfilesSource).not.toContain("function getRunwayCarryTarget(");
  expect(runwayTargetsSource).toContain("createGameSimulatorActionSpaceCarryRunwayTargets");
  expect(pathsSource).toContain("createGameSimulatorActionSpaceDribbleCarryPaths");
});
