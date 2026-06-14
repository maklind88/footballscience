import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotSpaceLadderDecisions } from "../src/modules/game-simulator/autopilot-space-ladder-decisions.mjs";

function createSpaceLadderDeps(overrides = {}) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pitch = { length: 105, width: 68 };

  return {
    clamp,
    computePassLaneClarity: () => 0.72,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_startPoint, target) => ({
      value: target.x >= 64 ? 0.58 : 0.22,
      lineBreakCount: target.x >= 64 ? 1 : 0,
      openTarget: target.x >= 64 ? 0.62 : 0.28,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: (point) =>
      point.x >= 64
        ? { key: "space3", index: 3 }
        : { key: "space2", index: 2 },
    getForwardProgressionWindow: () => ({ active: true, openLane: 0.6 }),
    getNearestOpponentGap: () => 8,
    getPitchThreatProfile: (point) =>
      point.x >= 64
        ? {
            value: 0.68,
            box: 0.22,
            centralPocket: 0.42,
            betweenLines: 0.38,
            behindLine: 0.24,
            halfSpace: 0.24,
            cutbackZone: 0.12,
            assistZone: 0.18,
            depth: point.x,
            primaryLabel: "central pocket",
          }
        : {
            value: 0.46,
            box: 0.08,
            centralPocket: 0.3,
            betweenLines: 0.36,
            behindLine: 0.08,
            halfSpace: 0.28,
            cutbackZone: 0.04,
            assistZone: 0.06,
            depth: point.x,
            primaryLabel: "between lines",
          },
    getPlayerPressureLoad: () => 0.24,
    isPlayerFacingForward: () => true,
    isWidePrincipleZone: (point) => Math.abs(point.y - pitch.width / 2) >= 12,
    pitch,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot space ladder decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotSpaceLadderDecisions(createSpaceLadderDeps());

  expect(typeof decisions.getAutoPilotSpaceLadderContext).toBe("function");
  expect(typeof decisions.getAutoPilotSpaceLadderAdjustment).toBe("function");
});

test("game simulator autopilot space ladder decisions detect progress context", () => {
  const decisions = createGameSimulatorAutopilotSpaceLadderDecisions(createSpaceLadderDeps());
  const carrier = { id: "H8", team: "home", position: { x: 54, y: 34 } };

  const context = decisions.getAutoPilotSpaceLadderContext(carrier, carrier.position, {
    progressionUrgency: 0.64,
  });

  expect(context.active).toBe(true);
  expect(context.pressureType).toBe("free");
  expect(context.currentSpace.key).toBe("space2");
  expect(context.canProgress).toBe(true);
  expect(context.dangerAvailable).toBe(true);
});

test("game simulator autopilot space ladder decisions reward climbing the next space", () => {
  const decisions = createGameSimulatorAutopilotSpaceLadderDecisions(createSpaceLadderDeps());
  const carrier = { id: "H8", team: "home", position: { x: 54, y: 34 } };

  const result = decisions.getAutoPilotSpaceLadderAdjustment(
    {
      actionType: "pass",
      target: { x: 70, y: 32 },
      forwardGain: 16,
      passDistance: 17,
      isLineBreak: true,
      laneClarity: 0.72,
    },
    carrier,
    carrier.position,
    { shootBias: 0.62 }
  );

  expect(result.score).toBeGreaterThan(0.7);
  expect(result.labels).toContain("Attack central pocket");
  expect(result.labels).toContain("Do not waste space 2");
  expect(result.context.actionOpensDanger).toBe(true);
  expect(result.context.targetSpaceKey).toBe("space3");
});

test("game simulator autopilot space ladder decisions punish low value recycle", () => {
  const decisions = createGameSimulatorAutopilotSpaceLadderDecisions(createSpaceLadderDeps({
    getActionSpaceValue: () => ({
      value: 0.18,
      lineBreakCount: 0,
      openTarget: 0.2,
    }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 54 ? 0.46 : 0.44,
      box: 0.06,
      centralPocket: point.x >= 54 ? 0.3 : 0.08,
      betweenLines: point.x >= 54 ? 0.35 : 0.12,
      behindLine: 0.06,
      halfSpace: point.x >= 54 ? 0.24 : 0.08,
      cutbackZone: 0.03,
      assistZone: 0.04,
      depth: point.x,
      primaryLabel: "between lines",
    }),
  }));
  const carrier = { id: "H8", team: "home", position: { x: 54, y: 34 } };

  const result = decisions.getAutoPilotSpaceLadderAdjustment(
    {
      actionType: "pass",
      target: { x: 51, y: 34 },
      forwardGain: -3,
      passDistance: 3,
      laneClarity: 0.72,
    },
    carrier,
    carrier.position,
    { progressionUrgency: 0.72 }
  );

  expect(result.score).toBeLessThan(0);
  expect(result.labels).toContain("Avoid low-value recycle");
  expect(result.context.lowValueRecycle).toBe(true);
  expect(result.context.actionOpensDanger).toBeFalsy();
});
