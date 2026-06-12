import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotChanceDecisions } from "../src/modules/game-simulator/autopilot-chance-decisions.mjs";

function createChanceDecisionDeps(overrides = {}) {
  const players = [
    { id: "H9", team: "home", position: { x: 78, y: 34 }, role: "Striker", shortLabel: "ST" },
    { id: "H8", team: "home", position: { x: 72, y: 31 }, role: "Central Midfielder", shortLabel: "CM" },
    { id: "A4", team: "away", position: { x: 88, y: 33 }, role: "Defender", shortLabel: "CB" },
  ];

  const deps = {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.82,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.64,
      lineBreakCount: 0,
      openTarget: 0.72,
      targetPressure: 0.24,
      targetThreat: { value: 0.58 },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAttackingGameSpaceProfile: (point) => ({
      key: point.x >= 76 ? "space3" : "space2",
      index: point.x >= 76 ? 3 : 2,
      label: point.x >= 76 ? "Space 3" : "Space 2",
    }),
    getAutoPilotFlowContext: () => ({
      recent: [
        { actionType: "pass", target: { x: 73, y: 32 } },
        { actionType: "pass", target: { x: 76, y: 35 } },
      ],
      pressure: 0.18,
    }),
    getAutoPilotShotTarget: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getNearestOpponentGap: () => 7.5,
    getOffensiveRoleKey: (player) => (player?.id === "H8" ? "connector" : "striker"),
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getPitchThreatProfile: (point) => ({
      value: point.x >= 78 ? 0.74 : 0.48,
      box: point.x >= 90 ? 0.28 : 0.18,
      halfSpace: 0.22,
      betweenLines: point.x >= 74 ? 0.46 : 0.26,
      cutbackZone: point.y >= 45 ? 0.32 : 0.12,
      assistZone: 0.18,
      centralPocket: point.x >= 76 ? 0.38 : 0.18,
      behindLine: point.x >= 82 ? 0.28 : 0.12,
      depth: point.x,
      primaryLabel: "chance zone",
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.18,
    getRecentPossessionSteps: () => [
      { actionType: "pass", target: { x: 72, y: 34 } },
      { actionType: "pass", target: { x: 76, y: 32 } },
    ],
    getShotWindowProfile: () => ({
      laneClarity: 0.84,
      quality: 0.68,
      blockRisk: 0.18,
      angleQuality: 0.62,
    }),
    isPlayerFacingForward: () => true,
    isSupportRole: (roleKey) => ["connector", "pivot", "rest"].includes(roleKey),
    isWideChannel: (point) => Math.abs(point.y - 34) > 18,
    pitch: { length: 105, width: 68 },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };

  return deps;
}

test("game simulator autopilot chance decisions expose moved final-action contracts", () => {
  const chanceDecisions = createGameSimulatorAutopilotChanceDecisions(createChanceDecisionDeps());

  expect(typeof chanceDecisions.getAutoPilotEndProductUrgencyContext).toBe("function");
  expect(typeof chanceDecisions.getAutoPilotEndProductUrgencyAdjustment).toBe("function");
  expect(typeof chanceDecisions.getAutoPilotChanceHierarchyContext).toBe("function");
  expect(typeof chanceDecisions.getAutoPilotChanceHierarchyAdjustment).toBe("function");
});

test("game simulator autopilot chance decisions reward urgent shots", () => {
  const chanceDecisions = createGameSimulatorAutopilotChanceDecisions(createChanceDecisionDeps());
  const carrier = { id: "H9", team: "home", position: { x: 78, y: 34 } };
  const result = chanceDecisions.getAutoPilotEndProductUrgencyAdjustment(
    {
      actionType: "shot",
      target: { x: 105, y: 34 },
      mustShoot: true,
      laneClarity: 0.84,
      insideBox: true,
    },
    carrier,
    { x: 78, y: 34 },
    { shootBias: 0.72 }
  );

  expect(result.score).toBeGreaterThan(0.8);
  expect(result.labels).toContain("End product: shoot");
  expect(result.context.highValueTarget).toBe(true);
});

test("game simulator autopilot chance decisions penalize low-value chance resets", () => {
  const chanceDecisions = createGameSimulatorAutopilotChanceDecisions(createChanceDecisionDeps());
  const carrier = { id: "H9", team: "home", position: { x: 80, y: 34 } };
  const result = chanceDecisions.getAutoPilotChanceHierarchyAdjustment(
    {
      actionType: "pass",
      target: { x: 70, y: 34 },
      receiverPlayerId: "H8",
      receiverRoleKey: "connector",
      forwardGain: -10,
      passDistance: 10,
    },
    carrier,
    { x: 80, y: 34 },
    { shootBias: 0.72 }
  );

  expect(result.score).toBeLessThan(0);
  expect(result.labels).toContain("Avoid resetting a chance");
  expect(result.context.supportReset).toBe(true);
});
