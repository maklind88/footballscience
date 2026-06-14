import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveChanceDenialTargets } from "../src/modules/game-simulator/autopilot-defensive-chance-denial-targets.mjs";

function createChanceDenialDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "shot",
      startPosition: { x: 82, y: 34 },
      position: { x: 82, y: 34 },
      target: { x: 105, y: 34 },
      carrierPlayerId: "H9",
      initiatorPlayerId: "H9",
      ownerPlayerId: "H9",
      profileKey: "finish",
      profileLabel: "Finish from central pocket",
    },
    draftStep: {
      actionType: "shot",
      target: { x: 105, y: 34 },
      carrierPlayerId: "H9",
      profileKey: "finish",
      profileLabel: "Finish from central pocket",
      autoPrinciples: ["shoot"],
      beforeSnapshot: {
        ball: {
          position: { x: 82, y: 34 },
          ownerPlayerId: "H9",
        },
      },
    },
    players: [
      { id: "H9", team: "home", shortLabel: "9", position: { x: 82, y: 34 } },
    ],
  };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point, margin = 0) => ({
      x: Math.max(margin, Math.min(pitch.length - margin, point.x)),
      y: Math.max(margin, Math.min(pitch.width - margin, point.y)),
    }),
    cloneVector: (point) => ({ ...point }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      targetThreat: {
        value: 0.72,
        box: 0.28,
        centralPocket: 0.38,
        cutbackZone: 0.2,
        assistZone: 0.22,
        behindLine: 0.18,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotShotTarget: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getDribblePressureReference: () => ({
      startPoint: { x: 82, y: 34 },
      targetPoint: { x: 105, y: 34 },
    }),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? pitch.length : 0, y: pitch.width / 2 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getOpponentPressureAtPoint: () => 0.18,
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getPitchThreatProfile: () => ({
      value: 0.72,
      box: 0.28,
      centralPocket: 0.38,
      cutbackZone: 0.2,
      assistZone: 0.22,
      behindLine: 0.18,
    }),
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.16,
    getShotWindowProfile: () => ({ quality: 0.72 }),
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
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 87, y: 33 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 88, y: 44 } },
      { id: "A3", team: "away", lineKey: "back", shortLabel: "LB", position: { x: 88, y: 24 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 80, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 79, y: 40 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 73, y: 34 } },
      { id: "A10", team: "away", lineKey: "forward", shortLabel: "10", position: { x: 74, y: 38 } },
    ],
  };
}

test("game simulator autopilot defensive chance denial targets expose moved contracts", () => {
  const chanceDenial = createGameSimulatorAutopilotDefensiveChanceDenialTargets(createChanceDenialDeps());

  expect(typeof chanceDenial.getDefensiveChanceDenialContext).toBe("function");
  expect(typeof chanceDenial.getDefensiveChanceDenialTarget).toBe("function");
  expect(typeof chanceDenial.applyDefensiveChanceDenialTargets).toBe("function");
});

test("game simulator autopilot defensive chance denial targets detect shot risk", () => {
  const chanceDenial = createGameSimulatorAutopilotDefensiveChanceDenialTargets(createChanceDenialDeps());

  const context = chanceDenial.getDefensiveChanceDenialContext(
    "away",
    { x: 82, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(context).toMatchObject({
    actionType: "shot",
    attackingTeamId: "home",
    isShotCue: true,
    phaseKey: "lowBlock",
  });
  expect(context.dangerScore).toBeGreaterThan(0.8);
});

test("game simulator autopilot defensive chance denial targets apply first chance cover", () => {
  const chanceDenial = createGameSimulatorAutopilotDefensiveChanceDenialTargets(createChanceDenialDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = chanceDenial.applyDefensiveChanceDenialTargets(
    "away",
    targets,
    groups,
    groups.midfield[0],
    { x: 82, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(result.labels).toContain("Defend the chance first");
  expect(result.labels).toContain("Chance denial: close shooter");
  expect(result.labels).toContain("Chance denial: block shot lane");
  expect(result.labels).toContain("Chance denial: protect penalty spot");
  expect(result.focusPoint).toEqual({ x: 82, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(4);
});
