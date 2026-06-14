import { expect, test } from "@playwright/test";
import { createGameSimulatorActionSpaceGameSpaceAdjustments } from "../src/modules/game-simulator/action-space-game-space-adjustments.mjs";

function createGameSpaceAdjustmentDeps(overrides = {}) {
  const pitch = { width: 68 };
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const profile = {
    lineBreakBias: 0.7,
    directness: 0.58,
    routeOneBias: 0.2,
    shortSupport: 0.58,
    progressionUrgency: 0.72,
    carryBias: 0.5,
    shootBias: 0.45,
    switchBias: 0.4,
    widthDiscipline: 0.5,
    overlapBias: 0.42,
  };

  return {
    profile,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.76,
    distance,
    getActionSpaceValue: () => ({
      value: 0.5,
      lineBreakCount: 1,
      openTarget: 0.7,
      targetPressure: 0.3,
      targetThreat: {
        value: 0.5,
        box: 0.05,
        behindLine: 0.18,
        betweenLines: 0.46,
        halfSpace: 0.42,
        centralPocket: 0.3,
      },
      startThreat: {
        value: 0.25,
        centralPocket: 0.12,
      },
    }),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingGameSpaceProfile: (point) => point.x >= 74
      ? { key: "space2", index: 2 }
      : { key: "space1", index: 1 },
    getNearestOpponentGap: () => 6,
    getOffensiveRoleKey: () => "connector",
    getPitchLaneIndex: (point) => Math.floor(point.y / (pitch.width / 5)),
    getPitchLaneKey: (point) => Math.abs(point.y - pitch.width / 2) <= 8 ? "central" : "leftHalf",
    getPitchSpaceProfile: (point) => ({
      value: point.x >= 74 ? 0.48 : 0.24,
      depth: point.x,
      gameSpaceIndex: point.x >= 74 ? 2 : 1,
      betweenLines: point.x >= 74 ? 0.46 : 0.2,
      halfSpace: point.y !== 34 ? 0.42 : 0.2,
      centralPocket: point.y === 34 ? 0.32 : 0.18,
      box: 0,
      cutbackZone: 0,
    }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 74 ? 0.5 : 0.25,
      box: 0.05,
      behindLine: 0.18,
      betweenLines: 0.46,
      halfSpace: 0.42,
      centralPocket: 0.3,
    }),
    getPlayerById: () => ({ id: "H9", team: "home", role: "ST", position: { x: 78, y: 34 } }),
    getPlayerPressureLoad: () => 0.24,
    getTeamDensityAtPoint: () => 1,
    getTeamSupportCountAroundPoint: () => 1,
    isPlayerFacingForward: () => true,
    teams: { home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator action space game space adjustments expose moved contracts", () => {
  const metrics = createGameSimulatorActionSpaceGameSpaceAdjustments(createGameSpaceAdjustmentDeps());

  expect(typeof metrics.getAutoPilotGameSpaceAdjustment).toBe("function");
  expect(typeof metrics.getAutoPilotSpatialDecisionAdjustment).toBe("function");
});

test("game simulator action space game space adjustments preserve game-space scoring", () => {
  const deps = createGameSpaceAdjustmentDeps();
  const metrics = createGameSimulatorActionSpaceGameSpaceAdjustments(deps);
  const carrier = { id: "H8", team: "home", position: { x: 60, y: 34 } };
  const candidate = {
    actionType: "pass",
    target: { x: 78, y: 34 },
    receiverPlayerId: "H9",
    forwardGain: 18,
    passDistance: 18,
  };
  const adjustment = metrics.getAutoPilotGameSpaceAdjustment(candidate, carrier, carrier.position, deps.profile);

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Enter space 2");
  expect(adjustment.context.gameSpaceGain).toBe(1);
});

test("game simulator action space game space adjustments preserve spatial decision scoring", () => {
  const deps = createGameSpaceAdjustmentDeps();
  const metrics = createGameSimulatorActionSpaceGameSpaceAdjustments(deps);
  const carrier = { id: "H8", team: "home", position: { x: 60, y: 34 } };
  const candidate = {
    actionType: "pass",
    target: { x: 78, y: 34 },
    receiverPlayerId: "H9",
    forwardGain: 18,
    passDistance: 18,
    isLineBreak: true,
  };
  const adjustment = metrics.getAutoPilotSpatialDecisionAdjustment(candidate, carrier, carrier.position, deps.profile);

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Spelyta decision: enter next space");
  expect(adjustment.context.gameSpaceGain).toBe(1);
});
