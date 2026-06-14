import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceActionValueMetrics } from "../src/modules/game-simulator/action-space-action-value-metrics.mjs";
import { createGameSimulatorActionSpacePitchSpaceProfiles } from "../src/modules/game-simulator/action-space-pitch-space-profiles.mjs";

function createActionValueDeps(overrides = {}) {
  let state = overrides.state ?? {
    ball: { position: { x: 60, y: 34 } },
    players: [
      { id: "H6", team: "home", role: "CM", position: { x: 56, y: 34 } },
      { id: "A9", team: "away", role: "ST", position: { x: 48, y: 34 } },
      { id: "A6", team: "away", role: "CM", position: { x: 66, y: 34 } },
      { id: "A8", team: "away", role: "CM", position: { x: 78, y: 35 } },
      { id: "A4", team: "away", role: "CB", position: { x: 84, y: 34 } },
      { id: "A1", team: "away", role: "GK", position: { x: 101, y: 34 } },
    ],
  };
  const pitch = { length: 105, width: 68 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const stateProxy = new Proxy({}, {
    get(_target, property) {
      return state[property];
    },
  });
  const pitchMetrics = createGameSimulatorActionSpacePitchSpaceProfiles({
    clamp,
    getDefensiveAutopilotLineKey: (player) => {
      if (player.role === "GK") return "gk";
      if (player.role === "ST") return "forward";
      if (player.role === "CM") return "midfield";
      return "back";
    },
    getDefensivePhaseKey: () => "midBlock",
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPitchLaneKey: (point) => {
      if (point.y < pitch.width * 0.2) return "leftWide";
      if (point.y < pitch.width * 0.4) return "leftHalf";
      if (point.y <= pitch.width * 0.6) return "central";
      if (point.y <= pitch.width * 0.8) return "rightHalf";
      return "rightWide";
    },
    pitch,
    state: stateProxy,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    vec: (x, y) => ({ x, y }),
  });

  return {
    clamp,
    distance,
    getAttackDirectionSign: pitchMetrics.getAttackDirectionSign,
    getAttackingDepth: pitchMetrics.getAttackingDepth,
    getPitchSpaceProfile: pitchMetrics.getPitchSpaceProfile,
    getPitchThreatProfile: pitchMetrics.getPitchThreatProfile,
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
    state: stateProxy,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space action value metrics expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpaceActionValueMetrics(createActionValueDeps());

  expect(typeof metrics.getOpponentPressureAtPoint).toBe("function");
  expect(typeof metrics.getNearestOpponentGapToPoint).toBe("function");
  expect(typeof metrics.getOpponentsBypassedByAction).toBe("function");
  expect(typeof metrics.getFootballSpacePriority).toBe("function");
  expect(typeof metrics.getActionSpaceValue).toBe("function");
});

test("game simulator action space action value metrics react to pressure and open space", () => {
  const deps = createActionValueDeps();
  const metrics = createGameSimulatorActionSpaceActionValueMetrics(deps);
  const target = { x: 78, y: 34 };

  const crowdedPressure = metrics.getOpponentPressureAtPoint("home", target);
  const crowdedGap = metrics.getNearestOpponentGapToPoint("home", target);

  deps.replaceState({
    ...deps.state,
    players: deps.state.players.map((player) => player.team === "away"
      ? { ...player, position: { x: player.position.x, y: 58 } }
      : player),
  });

  expect(metrics.getOpponentPressureAtPoint("home", target)).toBeLessThan(crowdedPressure);
  expect(metrics.getNearestOpponentGapToPoint("home", target)).toBeGreaterThan(crowdedGap);
});

test("game simulator action space action value metrics preserve line-break and priority scoring", () => {
  const deps = createActionValueDeps();
  const metrics = createGameSimulatorActionSpaceActionValueMetrics(deps);
  const start = { x: 60, y: 34 };
  const target = { x: 78, y: 34 };
  const profile = {
    shortSupport: 0.58,
    lineBreakBias: 0.68,
    progressionUrgency: 0.7,
    tempo: 0.55,
    directness: 0.6,
    carryBias: 0.5,
    risk: 0.45,
  };

  expect(metrics.getOpponentsBypassedByAction(start, target, "home")).toBeGreaterThan(0);

  const priority = metrics.getFootballSpacePriority(start, target, "home", profile);
  const actionValue = metrics.getActionSpaceValue(start, target, "home", profile);

  expect(priority.forwardGain).toBe(18);
  expect(priority.lineBreakCount).toBeGreaterThan(0);
  expect(Number.isFinite(priority.score)).toBe(true);
  expect(actionValue.forwardGain).toBe(18);
  expect(actionValue.lineBreakCount).toBeGreaterThan(0);
  expect(actionValue.spacePriority).toMatchObject({
    targetGameSpaceKey: priority.targetGameSpaceKey,
    startGameSpaceKey: priority.startGameSpaceKey,
  });
});

test("game simulator action space action value metrics preserve null fallbacks", () => {
  const metrics = createGameSimulatorActionSpaceActionValueMetrics(createActionValueDeps());

  expect(metrics.getOpponentPressureAtPoint(null, { x: 78, y: 34 })).toBe(1);
  expect(metrics.getNearestOpponentGapToPoint(null, { x: 78, y: 34 })).toBe(Infinity);
  expect(metrics.getOpponentsBypassedByAction(null, { x: 78, y: 34 }, "home")).toBe(0);
  expect(metrics.getFootballSpacePriority(null, { x: 78, y: 34 }, "home")).toMatchObject({
    score: 0,
    lineBreakCount: 0,
    targetGameSpaceKey: "outlet",
  });
});
