import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets } from "../src/modules/game-simulator/autopilot-defensive-box-delivery-chain-targets.mjs";

function createBoxDeliveryDeps(overrides = {}) {
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    restartPhase: null,
    ball: {
      actionType: "pass",
      startPosition: { x: 84, y: 10 },
      position: { x: 84, y: 10 },
      target: { x: 91, y: 34 },
      receiverPlayerId: "H9",
      carrierPlayerId: "H7",
      initiatorPlayerId: "H7",
      ownerPlayerId: "H7",
      profileKey: "cross",
      profileLabel: "Wide box delivery",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 91, y: 34 },
      receiverPlayerId: "H9",
      carrierPlayerId: "H7",
      profileKey: "cross",
      profileLabel: "Wide box delivery",
      autoPrinciples: ["cross"],
      beforeSnapshot: {
        ball: {
          position: { x: 84, y: 10 },
          ownerPlayerId: "H7",
        },
      },
    },
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
      value: 0.68,
      lineBreakCount: 1,
      targetThreat: {
        value: 0.72,
        box: 0.32,
        cutbackZone: 0.18,
        centralPocket: 0.34,
        assistZone: 0.28,
      },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getDefendingDirectionSign: (teamId) => (teamId === "away" ? -1 : 1),
    getDistanceFromOwnGoal: (teamId, point) => (teamId === "away" ? pitch.length - point.x : point.x),
    getDribblePressureReference: () => ({
      startPoint: state.draftStep.beforeSnapshot.ball.position,
      targetPoint: state.draftStep.target,
    }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: pitch.width / 2 }),
    getOtherTeamId: (teamId) => (teamId === "away" ? "home" : "away"),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 88 ? 0.72 : 0.5,
      box: point.x >= 88 && Math.abs(point.y - pitch.width / 2) <= 18 ? 0.32 : 0.08,
      cutbackZone: point.x >= 80 && point.x < 88 && Math.abs(point.y - pitch.width / 2) <= 20 ? 0.22 : 0.1,
      centralPocket: Math.abs(point.y - pitch.width / 2) <= 16 ? 0.34 : 0.1,
      assistZone: Math.abs(point.y - pitch.width / 2) >= 17 ? 0.34 : 0.16,
    }),
    getWideSideSign: (point) => (point.y < pitch.width / 2 ? -1 : point.y > pitch.width / 2 ? 1 : 0),
    isGoalkeeper: (player) => player?.lineKey === "gk" || player?.role === "Goalkeeper",
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 17,
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
      { id: "A4", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 31 } },
      { id: "A5", team: "away", lineKey: "back", shortLabel: "CB", position: { x: 88, y: 37 } },
      { id: "A2", team: "away", lineKey: "back", shortLabel: "RB", position: { x: 86, y: 50 } },
      { id: "A3", team: "away", lineKey: "back", shortLabel: "LB", position: { x: 86, y: 18 } },
    ],
    midfield: [
      { id: "A6", team: "away", lineKey: "midfield", shortLabel: "6", position: { x: 78, y: 34 } },
      { id: "A8", team: "away", lineKey: "midfield", shortLabel: "8", position: { x: 78, y: 40 } },
    ],
    forward: [
      { id: "A9", team: "away", lineKey: "forward", shortLabel: "9", position: { x: 70, y: 34 } },
      { id: "A10", team: "away", lineKey: "forward", shortLabel: "10", position: { x: 72, y: 39 } },
    ],
  };
}

test("game simulator autopilot defensive box delivery chain targets expose moved contracts", () => {
  const boxDelivery = createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets(createBoxDeliveryDeps());

  expect(typeof boxDelivery.getDefensiveBoxDeliveryChainContext).toBe("function");
  expect(typeof boxDelivery.getDefensiveBoxDeliveryChainTarget).toBe("function");
  expect(typeof boxDelivery.applyDefensiveBoxDeliveryChainTargets).toBe("function");
});

test("game simulator autopilot defensive box delivery chain targets detect cross and cutback cues", () => {
  const boxDelivery = createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets(createBoxDeliveryDeps());

  const crossContext = boxDelivery.getDefensiveBoxDeliveryChainContext(
    "away",
    { x: 91, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(crossContext).toMatchObject({
    actionType: "pass",
    attackingTeamId: "home",
    deliveryKind: "cross",
    phaseKey: "lowBlock",
  });
  expect(crossContext.dangerScore).toBeGreaterThan(0.5);

  const cutbackState = {
    ...createBoxDeliveryDeps().state,
    ball: {
      actionType: "pass",
      startPosition: { x: 90, y: 10 },
      position: { x: 90, y: 10 },
      target: { x: 82, y: 34 },
      profileKey: "cutback",
      profileLabel: "Cutback",
    },
    draftStep: {
      actionType: "pass",
      target: { x: 82, y: 34 },
      profileKey: "cutback",
      profileLabel: "Cutback",
      autoPrinciples: ["cutback"],
      beforeSnapshot: {
        ball: {
          position: { x: 90, y: 10 },
          ownerPlayerId: "H7",
        },
      },
    },
  };
  const cutbackDelivery = createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets(
    createBoxDeliveryDeps({ state: cutbackState })
  );
  const cutbackContext = cutbackDelivery.getDefensiveBoxDeliveryChainContext(
    "away",
    { x: 82, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(cutbackContext.deliveryKind).toBe("cutback");
});

test("game simulator autopilot defensive box delivery chain targets apply connected box cover", () => {
  const boxDelivery = createGameSimulatorAutopilotDefensiveBoxDeliveryChainTargets(createBoxDeliveryDeps());
  const groups = createGroups();
  const targets = new Map();

  const result = boxDelivery.applyDefensiveBoxDeliveryChainTargets(
    "away",
    targets,
    groups,
    groups.forward[0],
    { x: 91, y: 34 },
    { phaseKey: "lowBlock" }
  );

  expect(result.labels).toContain("Defend box delivery chain");
  expect(result.labels).toContain("Box delivery chain: block delivery lane");
  expect(result.labels).toContain("Box delivery chain: near-post cover");
  expect(result.labels).toContain("Box delivery chain: penalty-spot guard");
  expect(result.focusPoint).toEqual({ x: 91, y: 34 });
  expect(targets.size).toBeGreaterThanOrEqual(5);
});
