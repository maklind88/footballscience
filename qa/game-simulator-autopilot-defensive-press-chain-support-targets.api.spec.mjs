import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensivePressChainSupportTargets } from "../src/modules/game-simulator/autopilot-defensive-press-chain-support-targets.mjs";

function createPressChainDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 60, y: 34 }, shortLabel: "8" },
    { id: "H10", team: "home", lineKey: "midfield", position: { x: 77, y: 32 }, shortLabel: "10" },
    { id: "H7", team: "home", lineKey: "forward", position: { x: 76, y: 46 }, shortLabel: "W" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 84, y: 35 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 43 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 73, y: 33 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 72, y: 40 } },
    { id: "A10", team: "away", lineKey: "midfield", shortLabel: "10", position: { x: 68, y: 28 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } },
  ];
  const state = overrides.state || {
    restartPhase: null,
    players,
    ball: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      startPosition: { x: 60, y: 34 },
      position: { x: 72, y: 36 },
      target: { x: 72, y: 36 },
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H10",
      target: { x: 72, y: 36 },
      beforeSnapshot: {
        ball: {
          position: { x: 60, y: 34 },
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
    getActionSpaceValue: () => ({ lineBreakCount: 1 }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 72 ? 0.52 : 0.36,
      box: 0.14,
      centralPocket: Math.abs(point.y - pitch.width / 2) <= 5 ? 0.34 : 0.18,
      betweenLines: 0.32,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getWideSideSign: (pointOrPlayer) => {
      const y = pointOrPlayer?.position?.y ?? pointOrPlayer?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
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

function createGroups(players) {
  return {
    gk: players.filter((player) => player.team === "away" && player.lineKey === "gk"),
    back: players.filter((player) => player.team === "away" && player.lineKey === "back"),
    midfield: players.filter((player) => player.team === "away" && player.lineKey === "midfield"),
    forward: players.filter((player) => player.team === "away" && player.lineKey === "forward"),
  };
}

test("game simulator autopilot defensive press chain support targets expose moved chain contracts", () => {
  const pressChainTargets = createGameSimulatorAutopilotDefensivePressChainSupportTargets(createPressChainDeps());

  expect(typeof pressChainTargets.getDefensivePressChainSupportContext).toBe("function");
  expect(typeof pressChainTargets.getDefensivePressChainSupportTarget).toBe("function");
  expect(typeof pressChainTargets.applyDefensivePressChainSupportTargets).toBe("function");
});

test("game simulator autopilot defensive press chain support targets detect central press chain", () => {
  const deps = createPressChainDeps();
  const pressChainTargets = createGameSimulatorAutopilotDefensivePressChainSupportTargets(deps);

  const context = pressChainTargets.getDefensivePressChainSupportContext(
    "away",
    { x: 72, y: 36 },
    deps.state.players.find((player) => player.id === "A9"),
    { phaseKey: "midBlock", pressingIntensity: 0.72 }
  );

  expect(context?.centralRisk).toBe(true);
  expect(context?.outlets.length).toBeGreaterThanOrEqual(2);
  expect(context?.receiver.id).toBe("H10");
});

test("game simulator autopilot defensive press chain support targets apply outlet locks", () => {
  const deps = createPressChainDeps();
  const pressChainTargets = createGameSimulatorAutopilotDefensivePressChainSupportTargets(deps);
  const targets = new Map();

  const result = pressChainTargets.applyDefensivePressChainSupportTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    deps.state.players.find((player) => player.id === "A9"),
    { x: 72, y: 36 },
    { phaseKey: "midBlock", pressingIntensity: 0.72 }
  );

  expect(result.labels).toContain("Defensive press chain support");
  expect(result.labels).toContain("Press chain: second wave covers");
  expect(result.labels).toContain("Press chain: close inside gate");
  expect(result.labels).toContain("Press chain: lock first outlet");
  expect(result.labels).toContain("Press chain: far side balances");
  expect(result.focusPoint).toEqual({ x: 72, y: 36 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
