import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotCarryEndProductDecisions } from "../src/modules/game-simulator/autopilot-carry-end-product-decisions.mjs";

const pitch = { length: 105, width: 68 };

function createCarryEndProductDeps(overrides = {}) {
  const carryStep = {
    actionType: "dribble",
    afterSnapshot: {
      ball: {
        ownerPlayerId: "H7",
        position: { x: 78, y: 12 },
      },
    },
    beforeSnapshot: {
      ball: {
        position: { x: 60, y: 18 },
      },
    },
    carrierPlayerId: "H7",
    target: { x: 78, y: 12 },
  };
  const state = overrides.state ?? {
    ball: {
      ownerPlayerId: "H7",
    },
    sequence: {
      steps: [carryStep],
    },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

  return {
    clamp,
    distance,
    getActionSpaceValue: (_startPoint, target) => ({
      openTarget: target.x >= 82 ? 0.72 : 0.42,
      targetThreat: getPitchThreatProfile(target),
      value: target.x >= 82 ? 0.68 : 0.36,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAutoPilotFlowContext: () => ({
      lastStep: carryStep,
      pressure: 0.28,
    }),
    getAutoPilotRoleStrength: (_player, role) => (role === "finisher" ? 0.76 : 0.5),
    getAutoPilotShotTarget: (teamId) => ({
      x: teamId === "home" ? pitch.length : 0,
      y: pitch.width / 2,
    }),
    getLastAutoPrincipleSet: () => ["Open-grass runway"],
    getOpponentGoalCenter: (teamId) => ({
      x: teamId === "home" ? pitch.length : 0,
      y: pitch.width / 2,
    }),
    getPitchLaneKey: (point) => {
      if (point.y < 14) return "leftWide";
      if (point.y > 54) return "rightWide";
      return "central";
    },
    getPitchThreatProfile,
    getPlayerPressureLoad: () => 0.28,
    getShotWindowProfile: () => ({
      angleQuality: 0.58,
      blockRisk: 0.24,
      laneClarity: 0.72,
      quality: 0.62,
    }),
    principleSetIncludes: (principles, text) =>
      principles.some((principle) => principle.toLowerCase().includes(text.toLowerCase())),
    state,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

function getPitchThreatProfile(point) {
  const isBoxEntry = point.x >= 82 && point.y >= 24 && point.y <= 44;
  return {
    assistZone: isBoxEntry ? 0.42 : 0.08,
    behindLine: point.x >= 84 ? 0.36 : 0.12,
    betweenLines: isBoxEntry ? 0.5 : 0.12,
    box: isBoxEntry ? 0.36 : 0.08,
    centralPocket: isBoxEntry ? 0.42 : 0.14,
    cutbackZone: isBoxEntry ? 0.38 : 0.04,
    halfSpace: isBoxEntry ? 0.44 : 0.16,
    value: isBoxEntry ? 0.72 : 0.36,
  };
}

test("game simulator autopilot carry end product decisions expose moved carry contracts", () => {
  const decisions = createGameSimulatorAutopilotCarryEndProductDecisions(createCarryEndProductDeps());

  expect(typeof decisions.getAutoPilotCarryEndProductContext).toBe("function");
  expect(typeof decisions.getAutoPilotCarryEndProductAdjustment).toBe("function");
});

test("game simulator autopilot carry end product decisions activate after a meaningful runway carry", () => {
  const decisions = createGameSimulatorAutopilotCarryEndProductDecisions(createCarryEndProductDeps());
  const carrier = { id: "H7", team: "home", position: { x: 78, y: 12 }, roleKey: "wideForward" };

  const context = decisions.getAutoPilotCarryEndProductContext(
    carrier,
    carrier.position,
    { shootBias: 0.72 }
  );

  expect(context.active).toBe(true);
  expect(context.wasRunwayCarry).toBe(true);
  expect(context.finishWindow).toBe(true);
  expect(context.endProductUrgency).toBeGreaterThan(0.6);
});

test("game simulator autopilot carry end product decisions reward end product and punish sterile recycle", () => {
  const decisions = createGameSimulatorAutopilotCarryEndProductDecisions(createCarryEndProductDeps());
  const carrier = { id: "H7", team: "home", position: { x: 78, y: 12 }, roleKey: "wideForward" };

  const shotResult = decisions.getAutoPilotCarryEndProductAdjustment(
    {
      actionType: "shot",
      laneClarity: 0.72,
      target: { x: 105, y: 34 },
    },
    carrier,
    carrier.position,
    { carryBias: 0.66, progressionUrgency: 0.72, shootBias: 0.72 }
  );
  const recycleResult = decisions.getAutoPilotCarryEndProductAdjustment(
    {
      actionType: "pass",
      forwardGain: -2,
      isSwitch: false,
      passDistance: 9,
      target: { x: 76, y: 16 },
    },
    carrier,
    carrier.position,
    { carryBias: 0.66, progressionUrgency: 0.72, shootBias: 0.72 }
  );

  expect(shotResult.score).toBeGreaterThan(0);
  expect(shotResult.labels).toContain("Runway end product: shoot");
  expect(recycleResult.score).toBeLessThan(0);
  expect(recycleResult.labels).toContain("Do not waste runway");
});
