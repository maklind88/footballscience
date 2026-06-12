import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotAdvantageDecisions } from "../src/modules/game-simulator/autopilot-advantage-decisions.mjs";

function createAdvantageDecisionDeps(overrides = {}) {
  const recentAdvantageStep = {
    actionType: "pass",
    profileLabel: "line-breaking pass",
    autoPrinciples: ["Line break"],
    beforeSnapshot: { ball: { position: { x: 60, y: 34 } } },
    target: { x: 73, y: 34 },
  };

  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.78,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_start, target) => ({
      value: target.x >= 82 ? 0.72 : 0.38,
      lineBreakCount: target.x >= 72 ? 1 : 0,
      openTarget: target.x >= 82 ? 0.72 : 0.28,
      targetThreat: { value: target.x >= 82 ? 0.68 : 0.42 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAttackingGameSpaceProfile: (point) => ({
      key: point.x >= 76 ? "space3" : "space2",
      index: point.x >= 76 ? 3 : 2,
      label: point.x >= 76 ? "Space 3" : "Space 2",
    }),
    getAutoPilotFlowContext: () => ({
      carrierJustReceived: true,
      lastStep: recentAdvantageStep,
      pressure: 0.22,
    }),
    getNearestOpponentGap: () => 6.4,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 82 ? 0.72 : point.x >= 76 ? 0.56 : 0.42,
      box: point.x >= 90 ? 0.26 : 0.12,
      halfSpace: 0.2,
      betweenLines: point.x >= 74 ? 0.42 : 0.2,
      cutbackZone: point.y >= 44 ? 0.28 : 0.12,
      centralPocket: point.x >= 78 ? 0.34 : 0.16,
      behindLine: point.x >= 84 ? 0.28 : 0.1,
      primaryLabel: "advantage space",
    }),
    getPlayerPressureLoad: () => 0.22,
    getPossessionRhythmContext: () => ({ lineBreaks: 1, backPasses: 0 }),
    getRecentPossessionSteps: () => [recentAdvantageStep],
    getShotWindowProfile: () => ({
      quality: 0.68,
      blockRisk: 0.18,
      laneClarity: 0.78,
      angleQuality: 0.62,
    }),
    isPlayerFacingForward: () => true,
    uniquePrincipleLabels: (labels) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot advantage decisions expose moved advantage contracts", () => {
  const advantageDecisions = createGameSimulatorAutopilotAdvantageDecisions(createAdvantageDecisionDeps());

  expect(typeof advantageDecisions.getAutoPilotLineBreakAdvantageAdjustment).toBe("function");
  expect(typeof advantageDecisions.getAutoPilotAdvantageLifecycleContext).toBe("function");
  expect(typeof advantageDecisions.getAutoPilotAdvantageLifecycleAdjustment).toBe("function");
});

test("game simulator autopilot advantage decisions keep line-break actions alive", () => {
  const advantageDecisions = createGameSimulatorAutopilotAdvantageDecisions(createAdvantageDecisionDeps());
  const carrier = { id: "H8", team: "home", position: { x: 76, y: 34 } };

  const result = advantageDecisions.getAutoPilotLineBreakAdvantageAdjustment(
    {
      actionType: "pass",
      target: { x: 92, y: 46 },
      label: "cutback",
      forwardGain: 16,
      passDistance: 20,
      laneClarity: 0.78,
    },
    carrier,
    { x: 76, y: 34 },
    {}
  );

  expect(result.score).toBeGreaterThan(0.4);
  expect(result.labels).toContain("Line-break advantage: cutback");
  expect(result.context.highValueContinuation).toBe(true);
});

test("game simulator autopilot advantage decisions penalize killing an active advantage", () => {
  const advantageDecisions = createGameSimulatorAutopilotAdvantageDecisions(createAdvantageDecisionDeps());
  const carrier = { id: "H8", team: "home", position: { x: 78, y: 34 } };

  const result = advantageDecisions.getAutoPilotAdvantageLifecycleAdjustment(
    {
      actionType: "pass",
      target: { x: 70, y: 34 },
      forwardGain: -8,
      passDistance: 9,
    },
    carrier,
    { x: 78, y: 34 },
    {}
  );

  expect(result.score).toBeLessThan(0);
  expect(result.labels).toContain("Do not let advantage die");
  expect(result.context.reset).toBe(true);
});
