import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveNegativeTransitionTargets } from "../src/modules/game-simulator/autopilot-defensive-negative-transition-targets.mjs";

function createNegativeTransitionDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H9", team: "home", lineKey: "forward", roleKey: "striker", position: { x: 63, y: 31 } },
    { id: "H10", team: "home", lineKey: "midfield", roleKey: "connector", position: { x: 70, y: 34 } },
    { id: "HW", team: "home", lineKey: "forward", roleKey: "wideForward", position: { x: 68, y: 18 } },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 59, y: 29 } },
    { id: "A10", team: "away", lineKey: "forward", label: "10", position: { x: 57, y: 35 } },
    { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 61, y: 31 } },
    { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 65, y: 37 } },
    { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 79, y: 32 } },
    { id: "A5", team: "away", lineKey: "back", label: "CB", position: { x: 82, y: 39 } },
    { id: "A2", team: "away", lineKey: "back", label: "RB", position: { x: 78, y: 22 } },
  ];
  const state = overrides.state || {
    ball: {
      position: { x: 63, y: 31 },
      target: { x: 63, y: 31 },
      securePossession: {
        ownerPlayerId: "H9",
        opponentPlayerId: "A8",
        point: { x: 62, y: 31 },
        createdAt: 9.4,
        reason: "interception",
      },
    },
    draftStep: null,
    players,
    restartPhase: null,
    time: 10,
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefensiveAutopilotProfile: () => ({ pressingIntensity: 0.82, tackleIntent: 0.7 }),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOffensiveRoleKey: (player) => player?.roleKey || "connector",
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      behindLine: point.x > 68 ? 0.25 : 0.08,
      betweenLines: 0.2,
      centralPocket: 1 - Math.abs(point.y - pitch.width / 2) / (pitch.width / 2),
      value: 0.42,
    }),
    getPlannedPossessionTeamId: () => null,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getTeamDefenseStyleKey: () => "gegenpress",
    getTeamDefenseStyleProfile: () => ({ label: "Gegenpress" }),
    getWideSideSign: (point) => {
      if (!point || !Number.isFinite(point.y)) {
        return 0;
      }
      return point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => !!point && Math.abs(point.y - pitch.width / 2) >= 15,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pickDefensiveAutopilotPlayer: (groups, lineKeys, excludedIds) => lineKeys
      .flatMap((lineKey) => groups[lineKey] || [])
      .find((player) => !excludedIds.has(player.id)) || null,
    pitch,
    state,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createNegativeTransitionGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive negative transition targets expose moved transition contracts", () => {
  const negativeTransitionTargets = createGameSimulatorAutopilotDefensiveNegativeTransitionTargets(createNegativeTransitionDeps());

  expect(typeof negativeTransitionTargets.getNegativeTransitionContext).toBe("function");
  expect(typeof negativeTransitionTargets.getNegativeTransitionTarget).toBe("function");
  expect(typeof negativeTransitionTargets.getNegativeTransitionOutletOptions).toBe("function");
  expect(typeof negativeTransitionTargets.applyNegativeTransitionDefensiveTargets).toBe("function");
});

test("game simulator autopilot defensive negative transition targets detect counter press mode", () => {
  const negativeTransitionTargets = createGameSimulatorAutopilotDefensiveNegativeTransitionTargets(createNegativeTransitionDeps());
  const context = negativeTransitionTargets.getNegativeTransitionContext("away", { x: 63, y: 31 });

  expect(context.active).toBe(true);
  expect(context.mode).toBe("counterPress");
  expect(context.winningTeamId).toBe("home");
  expect(context.playerWhoLostIt?.id).toBe("A8");
});

test("game simulator autopilot defensive negative transition targets apply counter press cage", () => {
  const deps = createNegativeTransitionDeps();
  const negativeTransitionTargets = createGameSimulatorAutopilotDefensiveNegativeTransitionTargets(deps);
  const targets = new Map();

  const result = negativeTransitionTargets.applyNegativeTransitionDefensiveTargets(
    "away",
    targets,
    createNegativeTransitionGroups(deps.state.players),
    { x: 63, y: 31 },
    { pressingIntensity: 0.82, tackleIntent: 0.7 }
  );

  expect(result.active).toBe(true);
  expect(result.mode).toBe("counterPress");
  expect(result.labels).toContain("Counter-press first touch");
  expect(result.labels).toContain("Rest-defence behind counter-press");
  expect(result.presser?.team).toBe("away");
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
