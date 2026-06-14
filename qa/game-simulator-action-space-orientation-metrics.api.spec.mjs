import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceOrientationMetrics } from "../src/modules/game-simulator/action-space-orientation-metrics.mjs";

function normalizeAngle(angle) {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
}

function createOrientationDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      position: { x: 35, y: 34 },
      startPosition: { x: 28, y: 24 },
      target: { x: 58, y: 34 },
    },
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (first, second) => Math.abs(normalizeAngle(first - second)),
    blendAngles: (first, second, firstWeight = 0.5, secondWeight = 0.5) =>
      normalizeAngle(((first * firstWeight) + (second * secondWeight)) / (firstWeight + secondWeight)),
    buildPlayerIntelligenceProfile: () => ({
      perception: 0.72,
      tacticalDiscipline: 0.7,
    }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getFootUsageScore: () => 0.77,
    getPlayerFacingAngle: (player) => player.bodyAngle ?? 0,
    getTeamAttackAngle: (teamId) => (teamId === "home" ? 0 : Math.PI),
    normalizeAngle,
    state: stateProxy,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space orientation metrics expose moved contracts", () => {
  const orientation = createGameSimulatorActionSpaceOrientationMetrics(createOrientationDeps());

  expect(typeof orientation.getOrientationTurnDelay).toBe("function");
  expect(typeof orientation.getOrientationMovementProfile).toBe("function");
  expect(typeof orientation.getCoverShadowInfluence).toBe("function");
  expect(typeof orientation.getReceiveOrientationScore).toBe("function");
  expect(typeof orientation.getBestReceiveBodyAngle).toBe("function");
  expect(typeof orientation.getReceiveFootUsageScore).toBe("function");
  expect(typeof orientation.applyBestReceiveBodyAngle).toBe("function");
});

test("game simulator action space orientation metrics preserve body-angle movement penalties", () => {
  const orientation = createGameSimulatorActionSpaceOrientationMetrics(createOrientationDeps());
  const player = {
    id: "H6",
    team: "home",
    position: { x: 35, y: 34 },
    bodyAngle: Math.PI,
    intelligenceProfile: { perception: 0.7, tacticalDiscipline: 0.68 },
  };

  const profile = orientation.getOrientationMovementProfile(player, { x: 58, y: 34 });
  const delay = orientation.getOrientationTurnDelay(player, { x: 58, y: 34 });

  expect(profile.speedMultiplier).toBeLessThan(0.9);
  expect(profile.coverModifier).toBeLessThan(0.7);
  expect(delay).toBeGreaterThan(0.05);
});

test("game simulator action space orientation metrics preserve receive orientation and foot usage", () => {
  const orientation = createGameSimulatorActionSpaceOrientationMetrics(createOrientationDeps());
  const player = {
    id: "H8",
    team: "home",
    position: { x: 42, y: 32 },
    bodyAngle: 0,
  };

  const bestAngle = orientation.getBestReceiveBodyAngle(player, { x: 28, y: 22 });
  const receiveScore = orientation.getReceiveOrientationScore(player, { x: 28, y: 22 });

  expect(Math.abs(bestAngle)).toBeGreaterThan(0.05);
  expect(receiveScore).toBeGreaterThan(0.5);
  expect(orientation.getReceiveFootUsageScore(player, { x: 28, y: 22 })).toBe(0.77);
});

test("game simulator action space orientation metrics read live state defaults through dependency boundary", () => {
  const deps = createOrientationDeps();
  const orientation = createGameSimulatorActionSpaceOrientationMetrics(deps);
  const player = {
    id: "H6",
    team: "home",
    position: { x: 35, y: 34 },
    bodyAngle: 0,
  };

  expect(orientation.getOrientationTurnDelay(player)).toBe(0);

  deps.replaceState({
    ball: {
      position: { x: 35, y: 34 },
      startPosition: { x: 28, y: 24 },
      target: { x: 35, y: 58 },
    },
  });

  expect(orientation.getOrientationTurnDelay(player)).toBeGreaterThan(0);
});
