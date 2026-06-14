import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveSwitchRecoveryTargets } from "../src/modules/game-simulator/autopilot-defensive-switch-recovery-targets.mjs";

function createSwitchRecoveryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const players = overrides.players || [
    { id: "H8", team: "home", lineKey: "midfield", position: { x: 50, y: 12 }, shortLabel: "8" },
    { id: "H7", team: "home", lineKey: "forward", position: { x: 72, y: 56 }, shortLabel: "W" },
    { id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } },
    { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 84, y: 50 } },
    { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 86, y: 30 } },
    { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 40 } },
    { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 77, y: 35 } },
    { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 74, y: 47 } },
    { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 66, y: 34 } },
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
      startPosition: { x: 50, y: 12 },
      position: { x: 72, y: 56 },
      target: { x: 72, y: 56 },
      speed: 16,
    },
    draftStep: {
      actionType: "pass",
      carrierPlayerId: "H8",
      receiverPlayerId: "H7",
      target: { x: 72, y: 56 },
      speed: 16,
      autoPrinciples: ["switch to weak-side winger"],
      beforeSnapshot: {
        ball: {
          position: { x: 50, y: 12 },
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
    getPitchLaneIndex: (laneOrPoint) => {
      if (typeof laneOrPoint === "string") {
        return laneOrPoint === "leftWide" ? 0 : laneOrPoint === "rightWide" ? 4 : 2;
      }
      return laneOrPoint.y < 18 ? 0 : laneOrPoint.y > 50 ? 4 : 2;
    },
    getPitchLaneKey: (point) => (point.y < 18 ? "leftWide" : point.y > 50 ? "rightWide" : "central"),
    getPitchThreatProfile: () => ({
      value: 0.52,
      assistZone: 0.36,
      box: 0.14,
      cutbackZone: 0.22,
      centralPocket: 0.28,
      betweenLines: 0.3,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getWideSideSign: (point) => {
      const y = point?.position?.y ?? point?.y;
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

test("game simulator autopilot defensive switch recovery targets expose moved switch contracts", () => {
  const switchRecoveryTargets = createGameSimulatorAutopilotDefensiveSwitchRecoveryTargets(createSwitchRecoveryDeps());

  expect(typeof switchRecoveryTargets.getDefensiveSwitchRecoveryContext).toBe("function");
  expect(typeof switchRecoveryTargets.getDefensiveSwitchRecoveryTarget).toBe("function");
  expect(typeof switchRecoveryTargets.applyDefensiveSwitchRecoveryTargets).toBe("function");
});

test("game simulator autopilot defensive switch recovery targets detect weak-side switch", () => {
  const switchRecoveryTargets = createGameSimulatorAutopilotDefensiveSwitchRecoveryTargets(createSwitchRecoveryDeps());

  const context = switchRecoveryTargets.getDefensiveSwitchRecoveryContext(
    "away",
    { x: 72, y: 56 },
    { phaseKey: "midBlock" }
  );

  expect(context?.receiver?.id).toBe("H7");
  expect(context?.targetIsWide).toBe(true);
  expect(context?.finalThirdSwitch).toBe(true);
});

test("game simulator autopilot defensive switch recovery targets apply switch slide coverage", () => {
  const deps = createSwitchRecoveryDeps();
  const switchRecoveryTargets = createGameSimulatorAutopilotDefensiveSwitchRecoveryTargets(deps);
  const targets = new Map();

  const result = switchRecoveryTargets.applyDefensiveSwitchRecoveryTargets(
    "away",
    targets,
    createGroups(deps.state.players),
    null,
    { x: 72, y: 56 },
    { phaseKey: "midBlock" }
  );

  expect(result.labels).toContain("Recover after switch");
  expect(result.labels).toContain("Switch recovery: arrive to new ball side");
  expect(result.labels).toContain("Switch recovery: close central gate");
  expect(result.labels).toContain("Switch recovery: back line shifts");
  expect(result.focusPoint).toEqual({ x: 72, y: 56 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
