import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveLooseBallTargets } from "../src/modules/game-simulator/autopilot-defensive-loose-ball-targets.mjs";

function createLooseBallDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 62, y: 30 } },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A9", team: "away", lineKey: "forward", label: "9", position: { x: 60, y: 31 } },
    { id: "A10", team: "away", lineKey: "forward", label: "10", position: { x: 58, y: 34 } },
    { id: "A8", team: "away", lineKey: "midfield", label: "8", position: { x: 61, y: 33 } },
    { id: "A6", team: "away", lineKey: "midfield", label: "6", position: { x: 66, y: 38 } },
    { id: "A4", team: "away", lineKey: "back", label: "CB", position: { x: 78, y: 33 } },
    { id: "A5", team: "away", lineKey: "back", label: "CB", position: { x: 82, y: 40 } },
    { id: "A2", team: "away", lineKey: "back", label: "RB", position: { x: 77, y: 21 } },
  ];
  const state = overrides.state || {
    ball: {
      actionType: "recovery",
      carrierPlayerId: "H8",
      position: { x: 62, y: 30 },
      profileKey: "loose-ball-recovery",
      recoveryDuration: 1.1,
      startPosition: { x: 58, y: 32 },
      target: { x: 62, y: 30 },
    },
    draftStep: null,
    players,
    restartPhase: null,
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
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "home" ? point.x : pitch.length - point.x),
    getOffensiveAutopilotProfile: () => ({ directness: 0.68, widthDiscipline: 0.66 }),
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : pitch.length, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({ behindLine: 0.2, centralPocket: 0.3, value: 0.38 }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
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
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function createLooseBallGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive loose ball targets expose moved recovery trap contracts", () => {
  const looseBallTargets = createGameSimulatorAutopilotDefensiveLooseBallTargets(createLooseBallDeps());

  expect(typeof looseBallTargets.getDefensiveLooseBallRecoveryTrapContext).toBe("function");
  expect(typeof looseBallTargets.getDefensiveLooseBallRecoveryTrapTarget).toBe("function");
  expect(typeof looseBallTargets.applyDefensiveLooseBallRecoveryTrapTargets).toBe("function");
});

test("game simulator autopilot defensive loose ball targets detect counter press recovery trap", () => {
  const looseBallTargets = createGameSimulatorAutopilotDefensiveLooseBallTargets(createLooseBallDeps());
  const context = looseBallTargets.getDefensiveLooseBallRecoveryTrapContext(
    "away",
    { x: 62, y: 30 },
    { pressingIntensity: 0.82, styleKey: "gegenpress", tackleIntent: 0.72 }
  );

  expect(context?.mode).toBe("counterPressRecovery");
  expect(context?.attackingTeamId).toBe("home");
  expect(context?.collector?.id).toBe("H8");
});

test("game simulator autopilot defensive loose ball targets apply trap coverage", () => {
  const deps = createLooseBallDeps();
  const looseBallTargets = createGameSimulatorAutopilotDefensiveLooseBallTargets(deps);
  const targets = new Map();

  const result = looseBallTargets.applyDefensiveLooseBallRecoveryTrapTargets(
    "away",
    targets,
    createLooseBallGroups(deps.state.players),
    null,
    { x: 62, y: 30 },
    { pressingIntensity: 0.82, styleKey: "gegenpress", tackleIntent: 0.72 }
  );

  expect(result.labels).toContain("Defensive loose-ball recovery trap");
  expect(result.labels).toContain("Recovery trap: press collector");
  expect(result.labels).toContain("Recovery trap: rest cover");
  expect(result.presser?.team).toBe("away");
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
