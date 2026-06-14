import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceShotMetrics } from "../src/modules/game-simulator/action-space-shot-metrics.mjs";

function createShotMetricsDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      startPosition: { x: 82, y: 34 },
      targetKind: "shot",
      profileKey: "driven",
      executionQuality: 0.72,
      shotPlacement: null,
    },
    players: [
      {
        id: "H9",
        team: "home",
        role: "ST",
        position: { x: 82, y: 34 },
        intelligenceProfile: {
          perception: 0.74,
          decisionSpeed: 0.72,
          decisionQuality: 0.74,
          technicalSecurity: 0.76,
          executionUnderPressure: 0.72,
          composure: 0.76,
        },
      },
      {
        id: "A4",
        team: "away",
        role: "CB",
        position: { x: 91, y: 34 },
        intelligenceProfile: {
          perception: 0.78,
          decisionSpeed: 0.76,
          decisionQuality: 0.72,
          technicalSecurity: 0.7,
          executionUnderPressure: 0.7,
          composure: 0.72,
        },
      },
      {
        id: "A1",
        team: "away",
        role: "GK",
        position: { x: 103, y: 34 },
        intelligenceProfile: {
          perception: 0.82,
          decisionSpeed: 0.8,
          decisionQuality: 0.78,
          technicalSecurity: 0.74,
          executionUnderPressure: 0.78,
          composure: 0.8,
        },
      },
    ],
    sequence: { steps: [] },
  };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const getDecisionProfile = (player) => {
    const profile = player?.intelligenceProfile ?? {};
    return {
      pressure: player?.id === "H9" ? 0.24 : 0.18,
      maxSpeed: player?.role === "GK" ? 6.4 : 7.6,
      profile: {
        perception: profile.perception ?? 0.7,
        decisionSpeed: profile.decisionSpeed ?? 0.7,
        decisionQuality: profile.decisionQuality ?? 0.7,
        technicalSecurity: profile.technicalSecurity ?? 0.7,
        executionUnderPressure: profile.executionUnderPressure ?? 0.7,
        composure: profile.composure ?? 0.7,
      },
    };
  };

  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (first, second) => Math.abs(first - second),
    clamp,
    clampToPitch: (point, padding = 0) => ({
      x: clamp(point.x, padding, pitch.length - padding),
      y: clamp(point.y, padding, pitch.width - padding),
    }),
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: (_player, gap) => 0.12 + gap / 5.8,
    distance,
    getAutoPilotRoleStrength: (player, roleKey) => player?.role === "ST" && roleKey === "finisher" ? 0.82 : 0.54,
    getCoverShadowInfluence: () => 0.36,
    getFootUsageScore: () => 0.82,
    getGoalDirectionSign: (side) => side === "right" ? 1 : -1,
    getGoalLineX: (side) => side === "right" ? pitch.length : 0,
    getGoalkeeperForTeam: (teamId) => state.players.find((player) => player.team === teamId && player.role === "GK") ?? null,
    getOpponentGoalCenter: (teamId) => teamId === "home" ? { x: pitch.length, y: pitch.width / 2 } : { x: 0, y: pitch.width / 2 },
    getOpponentGoalSide: (teamId) => teamId === "home" ? "right" : "left",
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerDecisionContext: getDecisionProfile,
    getPlayerPressureLoad: () => 0.24,
    isGoalkeeper: (player) => player?.role === "GK",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    projectPointOnSegmentWithRatio: (point, start, end) => {
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const lengthSquared = segmentX ** 2 + segmentY ** 2;
      const ratio = lengthSquared <= 0.001
        ? 0
        : ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;
      const clampedRatio = clamp(ratio, 0, 1);
      return {
        point: {
          x: start.x + segmentX * clampedRatio,
          y: start.y + segmentY * clampedRatio,
        },
        ratio,
      };
    },
    resolveAutoBallProfile: () => ({ averageSpeed: 20 }),
    state: stateProxy,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space shot metrics expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpaceShotMetrics(createShotMetricsDeps());

  expect(typeof metrics.getGoalMouthTarget).toBe("function");
  expect(typeof metrics.getShotAngleQuality).toBe("function");
  expect(typeof metrics.getShotBlockRisk).toBe("function");
  expect(typeof metrics.getGoalkeeperTargetOpenness).toBe("function");
  expect(typeof metrics.computeShotLaneClarity).toBe("function");
  expect(typeof metrics.getShotWindowProfile).toBe("function");
  expect(typeof metrics.getDeterministicShotNoise).toBe("function");
  expect(typeof metrics.resolveExecutedShotTarget).toBe("function");
});

test("game simulator action space shot metrics preserve goal mouth, angle, and deterministic noise", () => {
  const metrics = createGameSimulatorActionSpaceShotMetrics(createShotMetricsDeps());

  expect(metrics.getGoalMouthTarget("home", 34)).toEqual({ x: 107.6, y: 34 });
  expect(metrics.getGoalMouthTarget("home", 12).y).toBeCloseTo(30.52, 2);
  expect(metrics.getShotAngleQuality({ x: 82, y: 34 }, "home")).toBeGreaterThan(
    metrics.getShotAngleQuality({ x: 82, y: 6 }, "home")
  );
  expect(metrics.getDeterministicShotNoise("H9|shot", 1)).toBe(metrics.getDeterministicShotNoise("H9|shot", 1));
  expect(metrics.getDeterministicShotNoise("H9|shot", 1)).not.toBe(metrics.getDeterministicShotNoise("H9|shot", 2));
});

test("game simulator action space shot metrics lower clarity when a defender controls the lane", () => {
  const deps = createShotMetricsDeps();
  const metrics = createGameSimulatorActionSpaceShotMetrics(deps);
  const shooter = deps.state.players[0];
  const target = metrics.getGoalMouthTarget("home", 34);

  const blockedRisk = metrics.getShotBlockRisk(shooter, target);
  const blockedClarity = metrics.computeShotLaneClarity(shooter, target);

  deps.replaceState({
    ...deps.state,
    ball: { ...deps.state.ball },
    sequence: { steps: [] },
    players: [
      deps.state.players[0],
      { ...deps.state.players[1], position: { x: 91, y: 49 } },
      deps.state.players[2],
    ],
  });

  const openShooter = deps.state.players[0];
  const openRisk = metrics.getShotBlockRisk(openShooter, target);
  const openClarity = metrics.computeShotLaneClarity(openShooter, target);

  expect(blockedRisk).toBeGreaterThan(0);
  expect(openRisk).toBeLessThan(blockedRisk);
  expect(openClarity).toBeGreaterThan(blockedClarity);
});

test("game simulator action space shot metrics resolve deterministic executed shot placement", () => {
  const deps = createShotMetricsDeps();
  const metrics = createGameSimulatorActionSpaceShotMetrics(deps);
  const shooter = deps.state.players[0];
  const intendedTarget = metrics.getGoalMouthTarget("home", 34);
  const executedTarget = metrics.resolveExecutedShotTarget(shooter, intendedTarget, { targetKind: "shot" });

  expect(executedTarget.x).toBe(107.6);
  expect(executedTarget.y).toBeGreaterThanOrEqual(0.4);
  expect(executedTarget.y).toBeLessThanOrEqual(67.6);
  expect(deps.state.ball.shotPlacement.intendedTarget).toEqual(intendedTarget);
  expect(deps.state.ball.shotPlacement.executedTarget).toEqual(executedTarget);
  expect(Number.isFinite(deps.state.ball.shotPlacement.errorMeters)).toBe(true);
});

test("game simulator action space shot metrics preserve null shooter fallback", () => {
  const deps = createShotMetricsDeps();
  const metrics = createGameSimulatorActionSpaceShotMetrics(deps);
  const intendedTarget = { x: 107.6, y: 34 };

  expect(metrics.resolveExecutedShotTarget(null, intendedTarget)).toEqual(intendedTarget);
  expect(deps.state.ball.shotPlacement).toBeNull();
});
