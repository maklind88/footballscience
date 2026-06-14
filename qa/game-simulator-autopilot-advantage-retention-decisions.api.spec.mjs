import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotAdvantageRetentionDecisions } from "../src/modules/game-simulator/autopilot-advantage-retention-decisions.mjs";

function createAdvantageRetentionDeps(overrides = {}) {
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.76,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_start, target) => ({
      value: target.x >= 86 ? 0.76 : target.x >= 76 ? 0.5 : 0.24,
      lineBreakCount: target.x >= 84 ? 1 : 0,
      openTarget: target.x >= 84 ? 0.72 : 0.36,
      targetPressure: target.x >= 84 ? 0.28 : 0.36,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAttackingGameSpaceProfile: (point) => ({
      key: point.x >= 78 ? "space3" : point.x >= 70 ? "space2" : "space1",
      index: point.x >= 78 ? 3 : point.x >= 70 ? 2 : 1,
      label: point.x >= 78 ? "Space 3" : point.x >= 70 ? "Space 2" : "Space 1",
    }),
    getNearestOpponentGap: () => 6.8,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 86 ? 0.74 : point.x >= 78 ? 0.56 : 0.28,
      box: point.x >= 90 ? 0.28 : point.x >= 78 ? 0.2 : 0.08,
      halfSpace: 0.42,
      betweenLines: point.x >= 74 ? 0.42 : 0.18,
      cutbackZone: point.y >= 44 ? 0.32 : point.x >= 88 ? 0.24 : 0.12,
      assistZone: point.x >= 88 ? 0.38 : 0.12,
      centralPocket: point.x >= 76 ? 0.3 : 0.12,
      behindLine: point.x >= 88 ? 0.36 : 0.12,
    }),
    getPlayerPressureLoad: () => 0.24,
    getPossessionRhythmContext: () => ({ sidewaysPasses: 0, backPasses: 0, forwardPasses: 1 }),
    getShotWindowProfile: () => ({ quality: 0.72, blockRisk: 0.16 }),
    getTeamSupportCountAroundPoint: (_teamId, target) => (target.x >= 76 ? 1 : 0),
    isPlayerFacingForward: () => true,
    uniquePrincipleLabels: (labels) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot advantage retention decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotAdvantageRetentionDecisions(createAdvantageRetentionDeps());

  expect(typeof decisions.getAutoPilotAdvantageRetentionContext).toBe("function");
  expect(typeof decisions.getAutoPilotAdvantageRetentionAdjustment).toBe("function");
});

test("game simulator autopilot advantage retention decisions read active valuable space", () => {
  const decisions = createGameSimulatorAutopilotAdvantageRetentionDecisions(createAdvantageRetentionDeps());
  const carrier = { id: "H10", team: "home", position: { x: 79, y: 34 } };

  const context = decisions.getAutoPilotAdvantageRetentionContext(carrier, { x: 79, y: 34 }, {});

  expect(context.active).toBe(true);
  expect(context.pressureMode).toBe("free");
  expect(context.mustConvert).toBe(true);
  expect(context.advantageStrength).toBeGreaterThan(0.4);
});

test("game simulator autopilot advantage retention decisions reward converting the advantage", () => {
  const decisions = createGameSimulatorAutopilotAdvantageRetentionDecisions(createAdvantageRetentionDeps());
  const carrier = { id: "H10", team: "home", position: { x: 79, y: 34 } };

  const result = decisions.getAutoPilotAdvantageRetentionAdjustment(
    {
      actionType: "shot",
      target: { x: 105, y: 34 },
      forwardGain: 26,
    },
    carrier,
    { x: 79, y: 34 },
    { shootBias: 0.7 }
  );

  expect(result.score).toBeGreaterThan(0.5);
  expect(result.labels).toContain("Convert advantage");
  expect(result.context.finalAction).toBe(true);
});

test("game simulator autopilot advantage retention decisions penalize low value resets", () => {
  const decisions = createGameSimulatorAutopilotAdvantageRetentionDecisions(createAdvantageRetentionDeps());
  const carrier = { id: "H10", team: "home", position: { x: 79, y: 34 } };

  const result = decisions.getAutoPilotAdvantageRetentionAdjustment(
    {
      actionType: "pass",
      target: { x: 68, y: 34 },
      forwardGain: -11,
      passDistance: 11,
      laneClarity: 0.72,
    },
    carrier,
    { x: 79, y: 34 },
    { progressionUrgency: 0.7 }
  );

  expect(result.score).toBeLessThan(0);
  expect(result.labels).toContain("Do not reset the advantage");
  expect(result.context.lowValueReset).toBe(true);
});
