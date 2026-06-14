import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceSpatialDominanceMetrics } from "../src/modules/game-simulator/action-space-spatial-dominance-metrics.mjs";

function createSpatialDominanceDeps(overrides = {}) {
  let state = overrides.state ?? {
    players: [
      { id: "H6", team: "home", role: "CM", position: { x: 62, y: 34 } },
      { id: "H8", team: "home", role: "CM", position: { x: 72, y: 35 } },
      { id: "A6", team: "away", role: "CM", position: { x: 74, y: 35 } },
      { id: "A1", team: "away", role: "GK", position: { x: 73, y: 34 } },
    ],
  };
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance,
    getActionSpaceValue: () => ({
      value: 0.48,
      lineBreakCount: 1,
      forwardGain: 10,
      threatGain: 0.24,
      targetPressure: 0.28,
      nearestOpponentGap: 8.8,
      spacePriority: { score: 0.42, gameSpaceGain: 1 },
      targetThreat: {
        value: 0.52,
        depth: 70,
        betweenLines: 0.48,
        halfSpace: 0.2,
        centralPocket: 0.32,
        box: 0,
        cutbackZone: 0,
        behindLine: 0.18,
        primaryLabel: "between-lines space",
      },
      startThreat: { value: 0.28 },
    }),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getNearestOpponentGapToPoint: () => 8.8,
    isGoalkeeper: (player) => player.role === "GK",
    state: new Proxy({}, {
      get(_target, property) {
        return state[property];
      },
    }),
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator action space spatial dominance metrics expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpaceSpatialDominanceMetrics(createSpatialDominanceDeps());

  expect(typeof metrics.getTeamDensityAtPoint).toBe("function");
  expect(typeof metrics.getOpponentDensityAtPoint).toBe("function");
  expect(typeof metrics.getSpaceDominanceProfile).toBe("function");
  expect(typeof metrics.getAutoPilotSpaceDominanceAdjustment).toBe("function");
});

test("game simulator action space spatial dominance metrics count density while excluding goalkeepers", () => {
  const deps = createSpatialDominanceDeps();
  const metrics = createGameSimulatorActionSpaceSpatialDominanceMetrics(deps);
  const point = { x: 72, y: 34 };

  expect(metrics.getTeamDensityAtPoint("home", point, 4)).toBe(1);
  expect(metrics.getTeamDensityAtPoint("home", point, 12, new Set(["H8"]))).toBe(1);
  expect(metrics.getOpponentDensityAtPoint("home", point, 4)).toBe(1);
});

test("game simulator action space spatial dominance metrics preserve dominance adjustment labels", () => {
  const metrics = createGameSimulatorActionSpaceSpatialDominanceMetrics(createSpatialDominanceDeps());
  const candidate = { actionType: "pass", target: { x: 72, y: 34 }, passDistance: 14, forwardGain: 10 };
  const carrier = { id: "H6", team: "home", position: { x: 62, y: 34 } };
  const adjustment = metrics.getAutoPilotSpaceDominanceAdjustment(candidate, carrier, carrier.position, {
    shortSupport: 0.58,
    routeOneBias: 0.2,
    progressionUrgency: 0.64,
  });

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Play into turn window");
  expect(adjustment.dominance.turnWindow).toBeGreaterThan(0.5);
});
