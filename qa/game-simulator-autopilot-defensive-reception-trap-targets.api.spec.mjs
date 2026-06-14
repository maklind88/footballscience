import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveReceptionTrapTargets } from "../src/modules/game-simulator/autopilot-defensive-reception-trap-targets.mjs";

function createReceptionTrapDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 57, y: 18 }, shortLabel: "8" },
    { id: "H7", team: "home", lineKey: "forward", position: { x: 65, y: 12 }, shortLabel: "W" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 82, y: 28 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 39 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 73, y: 23 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 70, y: 36 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 63, y: 26 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H7",
      initiatorPlayerId: "H8",
      ownerPlayerId: "H8",
      startPosition: { x: 57, y: 18 },
      position: { x: 65, y: 12 },
      target: { x: 65, y: 12 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H7",
      target: { x: 65, y: 12 },
      beforeSnapshot: {
        ball: {
          position: { x: 57, y: 18 },
          ownerPlayerId: "H8",
        },
      },
    },
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
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getOffensiveRoleKey: (player) => (player?.shortLabel === "W" ? "wideForward" : "connector"),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchLaneKey: (point) => (point.y <= 14 ? "leftWide" : Math.abs(point.y - 34) <= 8 ? "central" : "leftHalf"),
    getPitchThreatProfile: () => ({
      value: 0.36,
      behindLine: 0.12,
      betweenLines: 0.22,
      centralPocket: 0.12,
      halfSpace: 0.18,
      assistZone: 0.18,
      box: 0.08,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getWideSideSign: (point) => {
      const y = point?.position?.y ?? point?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
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

function createGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive reception trap targets expose moved trap contracts", () => {
  const receptionTrapTargets = createGameSimulatorAutopilotDefensiveReceptionTrapTargets(createReceptionTrapDeps());

  expect(typeof receptionTrapTargets.getDefensiveReceptionTrapContext).toBe("function");
  expect(typeof receptionTrapTargets.getDefensiveReceptionTrapTarget).toBe("function");
  expect(typeof receptionTrapTargets.applyDefensiveReceptionTrapTargets).toBe("function");
});

test("game simulator autopilot defensive reception trap targets detect wide trap", () => {
  const receptionTrapTargets = createGameSimulatorAutopilotDefensiveReceptionTrapTargets(createReceptionTrapDeps());

  const context = receptionTrapTargets.getDefensiveReceptionTrapContext(
    "away",
    { x: 65, y: 12 },
    { styleKey: "press-trap-wide", pressingIntensity: 0.72 }
  );

  expect(context?.mode).toBe("wideTrap");
  expect(context?.receiver?.id).toBe("H7");
  expect(context?.targetIsWide).toBe(true);
});

test("game simulator autopilot defensive reception trap targets apply touchline trap coverage", () => {
  const deps = createReceptionTrapDeps();
  const receptionTrapTargets = createGameSimulatorAutopilotDefensiveReceptionTrapTargets(deps);
  const targets = new Map();

  const result = receptionTrapTargets.applyDefensiveReceptionTrapTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 65, y: 12 },
    { styleKey: "press-trap-wide", pressingIntensity: 0.72 }
  );

  expect(result.labels).toContain("Press first touch");
  expect(result.labels).toContain("Trap touchline side");
  expect(result.labels).toContain("Far side tucks in");
  expect(result.focusPoint).toEqual({ x: 65, y: 12 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
