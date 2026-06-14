import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpacePassLaneMetrics } from "../src/modules/game-simulator/action-space-pass-lane-metrics.mjs";

function createPassLaneDeps(overrides = {}) {
  let state = overrides.state ?? {
    players: [
      {
        id: "H8",
        team: "home",
        position: { x: 20, y: 34 },
        intelligenceProfile: {
          perception: 0.72,
          decisionSpeed: 0.7,
          tacticalDiscipline: 0.68,
          technicalSecurity: 0.72,
        },
      },
      {
        id: "H9",
        team: "home",
        position: { x: 35, y: 34 },
        intelligenceProfile: {
          perception: 0.7,
          decisionSpeed: 0.7,
          tacticalDiscipline: 0.7,
          technicalSecurity: 0.7,
        },
      },
      {
        id: "A6",
        team: "away",
        position: { x: 27.5, y: 34 },
        intelligenceProfile: {
          perception: 0.86,
          decisionSpeed: 0.82,
          tacticalDiscipline: 0.8,
          technicalSecurity: 0.76,
        },
      },
    ],
  };
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  return {
    ballRadiusMeters: 0.11,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computeTimeToCoverDistance: () => 0.18,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getCoverShadowInfluence: () => 0.42,
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerDecisionContext: () => ({
      pressure: 0.22,
      profile: {
        perception: 0.76,
        decisionQuality: 0.72,
        technicalSecurity: 0.74,
      },
    }),
    isAerialFlightStyle: (flightStyle) => flightStyle === "lofted",
    lerp: (start, end, weight) => start + (end - start) * weight,
    playerRadiusMeters: 0.6,
    projectPointOnSegmentWithRatio: (point, start, end) => {
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const lengthSquared = segmentX ** 2 + segmentY ** 2;
      const ratio = lengthSquared <= 0.001
        ? 0
        : ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      return {
        point: {
          x: start.x + segmentX * clampedRatio,
          y: start.y + segmentY * clampedRatio,
        },
        ratio,
      };
    },
    resolveAutoBallProfile: () => ({
      averageSpeed: 10,
      flightStyle: "driven",
      landingPhaseStart: 0.58,
    }),
    state: stateProxy,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space pass lane metrics expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpacePassLaneMetrics(createPassLaneDeps());

  expect(typeof metrics.getPotentialPassReceiverAtTarget).toBe("function");
  expect(typeof metrics.getPassLaneRiskProfile).toBe("function");
  expect(typeof metrics.computePassLaneClarity).toBe("function");
});

test("game simulator action space pass lane metrics resolve receiver at target", () => {
  const deps = createPassLaneDeps();
  const metrics = createGameSimulatorActionSpacePassLaneMetrics(deps);
  const initiator = deps.state.players[0];

  expect(metrics.getPotentialPassReceiverAtTarget(initiator, { x: 35.4, y: 34 })).toMatchObject({ id: "H9" });
  expect(metrics.getPotentialPassReceiverAtTarget(initiator, { x: 60, y: 34 })).toBeNull();
  expect(metrics.getPotentialPassReceiverAtTarget(initiator, { x: 60, y: 34 }, "H9")).toMatchObject({ id: "H9" });
});

test("game simulator action space pass lane metrics lower clarity when a defender controls the lane", () => {
  const deps = createPassLaneDeps();
  const metrics = createGameSimulatorActionSpacePassLaneMetrics(deps);
  const initiator = deps.state.players[0];

  const blockedProfile = metrics.getPassLaneRiskProfile(initiator, { x: 35, y: 34 }, { receiverPlayerId: "H9" });

  expect(blockedProfile.interceptors).toBeGreaterThan(0);
  expect(blockedProfile.obstruction).toBeGreaterThan(0);
  expect(blockedProfile.timingRisk).toBeGreaterThan(0);
  expect(blockedProfile.clarity).toBeLessThan(0.72);

  const openState = {
    players: [
      deps.state.players[0],
      deps.state.players[1],
      {
        ...deps.state.players[2],
        position: { x: 27.5, y: 52 },
      },
    ],
  };
  deps.replaceState(openState);

  const openProfile = metrics.getPassLaneRiskProfile(openState.players[0], { x: 35, y: 34 }, { receiverPlayerId: "H9" });

  expect(openProfile.interceptors).toBe(0);
  expect(openProfile.clarity).toBeGreaterThan(blockedProfile.clarity);
});

test("game simulator action space pass lane metrics preserve null initiator fallback", () => {
  const metrics = createGameSimulatorActionSpacePassLaneMetrics(createPassLaneDeps());

  expect(metrics.getPassLaneRiskProfile(null, { x: 35, y: 34 })).toEqual({
    clarity: 0.72,
    obstruction: 0,
    timingRisk: 0,
    coverShadow: 0,
    interceptors: 0,
    averageSpeed: 11.5,
  });
  expect(metrics.computePassLaneClarity(null, { x: 35, y: 34 })).toBe(0.72);
});
