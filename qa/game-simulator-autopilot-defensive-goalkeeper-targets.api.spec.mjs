import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveGoalkeeperTargets } from "../src/modules/game-simulator/autopilot-defensive-goalkeeper-targets.mjs";

function createGoalkeeperDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    ball: {
      actionType: "pass",
      currentSpeed: 11,
      flightStyle: "driven",
      ownerPlayerId: "H8",
      position: { x: 52, y: 34 },
      startPosition: { x: 52, y: 34 },
      target: { x: 90, y: 34 },
    },
    draftStep: null,
    restartPhase: null,
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveAutopilotProfile: () => ({ phaseKey: "midBlock" }),
    getDefensiveLineDistanceFromOwnGoal: () => 16,
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: 34 }),
    getPitchThreatProfile: () => ({
      assistZone: 0.2,
      behindLine: 0.35,
      box: 0.24,
      centralPocket: 0.25,
      cutbackZone: 0.18,
      value: 0.52,
    }),
    getWideSideSign: (point) => (point?.y < pitch.width / 2 ? -1 : 1),
    isAerialFlightStyle: (flightStyle) => flightStyle === "lofted",
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch,
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot defensive goalkeeper targets expose moved goalkeeper contracts", () => {
  const goalkeeperTargets = createGameSimulatorAutopilotDefensiveGoalkeeperTargets(createGoalkeeperDeps());

  expect(typeof goalkeeperTargets.getDefensiveGoalkeeperTarget).toBe("function");
  expect(typeof goalkeeperTargets.getDefensiveGoalkeeperSweeperContext).toBe("function");
  expect(typeof goalkeeperTargets.applyDefensiveGoalkeeperSweeperTarget).toBe("function");
  expect(typeof goalkeeperTargets.getDefensiveGoalkeeperShotSetTarget).toBe("function");
  expect(typeof goalkeeperTargets.applyDefensiveGoalkeeperShotSetTarget).toBe("function");
});

test("game simulator autopilot defensive goalkeeper targets read live ball state through dependency boundary", () => {
  const state = {
    ball: {
      actionType: "pass",
      currentSpeed: 12,
      flightStyle: "driven",
      ownerPlayerId: "H8",
      position: { x: 52, y: 34 },
      startPosition: { x: 52, y: 34 },
      target: { x: 92, y: 34 },
    },
    draftStep: null,
    restartPhase: null,
  };
  const goalkeeperTargets = createGameSimulatorAutopilotDefensiveGoalkeeperTargets(createGoalkeeperDeps({ state }));
  const goalkeeper = { id: "A1", team: "away", position: { x: 100, y: 34 }, role: "Goalkeeper" };
  const profile = { phaseKey: "midBlock" };

  expect(goalkeeperTargets.getDefensiveGoalkeeperSweeperContext("away", goalkeeper, state.ball.target, profile)?.label)
    .toBe("GK sweeps behind back line");

  state.restartPhase = { type: "corner" };

  expect(goalkeeperTargets.getDefensiveGoalkeeperSweeperContext("away", goalkeeper, state.ball.target, profile)).toBeNull();
});

test("game simulator autopilot defensive goalkeeper targets apply shot set targets to goalkeeper group", () => {
  const state = {
    ball: {
      actionType: "shot",
      currentSpeed: 22,
      flightStyle: "driven",
      ownerPlayerId: "H9",
      position: { x: 89, y: 30 },
      startPosition: { x: 89, y: 30 },
      target: { x: 105, y: 34 },
    },
    draftStep: null,
    restartPhase: null,
  };
  const goalkeeperTargets = createGameSimulatorAutopilotDefensiveGoalkeeperTargets(createGoalkeeperDeps({ state }));
  const goalkeeper = { id: "A1", team: "away", position: { x: 101, y: 34 }, role: "Goalkeeper" };
  const targets = new Map();

  const labels = goalkeeperTargets.applyDefensiveGoalkeeperShotSetTarget(
    "away",
    targets,
    { gk: [goalkeeper] },
    state.ball.position,
    { phaseKey: "midBlock" }
  );

  expect(labels).toContain("GK sets for shot");
  expect(targets.has("A1")).toBe(true);
});
