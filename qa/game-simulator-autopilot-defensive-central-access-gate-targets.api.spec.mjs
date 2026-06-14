import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveCentralAccessGateTargets } from "../src/modules/game-simulator/autopilot-defensive-central-access-gate-targets.mjs";

function createCentralAccessGateDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 50, y: 34 },
      position: { x: 50, y: 34 },
      target: { x: 64, y: 32 },
      receiverPlayerId: "H10",
      initiatorPlayerId: "H8",
      ownerPlayerId: null,
      profileKey: "line-break",
      profileLabel: "Line-break pass",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 64, y: 32 },
      receiverPlayerId: "H10",
      profileKey: "line-break",
      profileLabel: "Line-break pass",
      autoPrinciples: ["space 2"],
      beforeSnapshot: {
        ball: {
          position: { x: 50, y: 34 },
          ownerPlayerId: "H8",
        },
      },
    },
    players: [
      { id: "H8", team: "home", shortLabel: "8", position: { x: 50, y: 34 } },
      { id: "H10", team: "home", shortLabel: "10", position: { x: 64, y: 32 } },
    ],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: () => 0.74,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.46,
      lineBreakCount: 1,
      openTarget: 0.68,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingGameSpaceProfile: (point) => (
      point.x >= 60 ? { key: "space2", index: 2 } : { key: "space1", index: 1 }
    ),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDepthX: (teamId, depth) => (teamId === "away" ? pitch.length - depth : depth),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getOffensiveAutopilotProfile: () => ({ phaseKey: "chanceCreation" }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getOwnGoalCenter: (teamId) => ({ x: teamId === "away" ? pitch.length : 0, y: pitch.width / 2 }),
    getPitchThreatProfile: () => ({
      value: 0.58,
      box: 0.12,
      centralPocket: 0.32,
      halfSpace: 0.3,
      betweenLines: 0.36,
      behindLine: 0.2,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.28,
    getWideSideSign: (pointOrPlayer) => {
      const y = pointOrPlayer?.position?.y ?? pointOrPlayer?.y;
      return y < pitch.width / 2 ? -1 : y > pitch.width / 2 ? 1 : 0;
    },
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
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

function createGroups() {
  return {
    gk: [{ id: "A1", team: "away", lineKey: "gk", role: "Goalkeeper", position: { x: 102, y: 34 } }],
    back: [
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 82, y: 34 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 82, y: 49 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 72, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 70, y: 41 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 62, y: 34 } },
      { id: "A10", team: "away", lineKey: "forward", shortLabel: "10", position: { x: 64, y: 38 } },
    ],
  };
}

test("game simulator autopilot defensive central access gate targets expose moved contracts", () => {
  const centralGateTargets = createGameSimulatorAutopilotDefensiveCentralAccessGateTargets(createCentralAccessGateDeps());

  expect(typeof centralGateTargets.getDefensiveCentralAccessGateContext).toBe("function");
  expect(typeof centralGateTargets.getDefensiveCentralAccessGateTarget).toBe("function");
  expect(typeof centralGateTargets.applyDefensiveCentralAccessGateTargets).toBe("function");
});

test("game simulator autopilot defensive central access gate targets detect space two reception", () => {
  const centralGateTargets = createGameSimulatorAutopilotDefensiveCentralAccessGateTargets(createCentralAccessGateDeps());

  const context = centralGateTargets.getDefensiveCentralAccessGateContext(
    "away",
    { x: 64, y: 32 },
    { phaseKey: "midBlock" }
  );

  expect(context).toMatchObject({
    actionType: "pass",
    attackingTeamId: "home",
    mode: "receiveGate",
    receiveToTurnCue: true,
    isSpaceTwoEntry: true,
  });
  expect(context.dangerScore).toBeGreaterThan(0.5);
});

test("game simulator autopilot defensive central access gate targets apply connected cover", () => {
  const centralGateTargets = createGameSimulatorAutopilotDefensiveCentralAccessGateTargets(createCentralAccessGateDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = centralGateTargets.applyDefensiveCentralAccessGateTargets(
    "away",
    targets,
    groups,
    groups.forward[0],
    { x: 64, y: 32 },
    { phaseKey: "midBlock" }
  );

  expect(result.labels).toContain("Protect space 2 receiving gate");
  expect(result.labels).toContain("Central gate: screen space 2");
  expect(result.labels).toContain("Central gate: block bounce pass");
  expect(result.focusPoint).toEqual({ x: 64, y: 32 });
  expect(targets.size).toBeGreaterThanOrEqual(4);
});
