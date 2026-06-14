import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotIntentionModelDecisions } from "../src/modules/game-simulator/autopilot-intention-model-decisions.mjs";

function createIntentionModelDecisions(overrides = {}) {
  return createGameSimulatorAutopilotIntentionModelDecisions({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getAttackingDepth: (point) => point.x,
    getAutoPilotFlowContext: () => ({ pressure: 0.7, consecutivePasses: 2, carrierJustReceived: false }),
    getAutoPilotRegainContext: () => ({ active: false }),
    getForwardFacingSpaceTwoContext: () => ({ active: true }),
    getForwardProgressionWindow: () => ({ active: true, goldenAhead: 0.5, openLane: 0.6, depth: 70, urgency: 0.8 }),
    getOffensiveRoleKey: () => "wideForward",
    getPlayerTendency: () => 0.7,
    getPossessionRhythmContext: () => ({ sidewaysPasses: 2, backPasses: 0, forwardPasses: 1, steps: 3 }),
    teams: { home: { formation: "4-3-3" } },
    ...overrides,
  });
}

test("game simulator autopilot intention model decisions merges principle weights", () => {
  const decisions = createIntentionModelDecisions();

  const weights = decisions.mergeIntentionWeights({ secure: 0.2, breakLine: 0.4 }, { secure: 0.8 });

  expect(weights.secure).toBeCloseTo(0.614, 3);
  expect(weights.breakLine).toBeCloseTo(0.4, 3);
  expect(weights.shoot).toBe(0);
});

test("game simulator autopilot intention model decisions boosts pressure and progression intents", () => {
  const decisions = createIntentionModelDecisions();

  const model = decisions.getAutoPilotIntentionModel(
    { id: "H7", team: "home", role: "Wide Forward" },
    { x: 72, y: 18 },
    { phaseKey: "progression", styleKey: "balanced", formation: "4-3-3" }
  );

  expect(model.ballDepth).toBe(72);
  expect(model.carrierRoleKey).toBe("wideForward");
  expect(model.forwardFacingSpaceTwo.active).toBe(true);
  expect(model.progressionWindow.active).toBe(true);
  expect(model.weights.goldenZone).toBeGreaterThan(1);
  expect(model.weights.breakLine).toBeGreaterThan(1);
  expect(model.weights.shoot).toBeGreaterThan(0.5);
  expect(model.weights.switchPlay).toBeGreaterThan(0.8);
});

test("game simulator autopilot intention model decisions reacts to regain triggers", () => {
  const decisions = createIntentionModelDecisions({
    getAutoPilotFlowContext: () => ({ pressure: 0.35, consecutivePasses: 0, carrierJustReceived: true }),
    getAutoPilotRegainContext: () => ({
      active: true,
      counterIntent: 0.8,
      forwardOpenSpace: 0.7,
      freshness: 0.75,
      pressure: 0.3,
      secureIntent: 0.3,
    }),
    getForwardFacingSpaceTwoContext: () => ({ active: false }),
    getForwardProgressionWindow: () => ({ active: false }),
    getOffensiveRoleKey: () => "connector",
    getPossessionRhythmContext: () => ({ sidewaysPasses: 0, backPasses: 0, forwardPasses: 0, steps: 0 }),
  });

  const model = decisions.getAutoPilotIntentionModel(
    { id: "H6", team: "home", role: "Central Midfielder" },
    { x: 48, y: 34 },
    { phaseKey: "buildUp", styleKey: "direct-transition", formation: "4-3-3" }
  );

  expect(model.regain.active).toBe(true);
  expect(model.weights.counterAttack).toBeGreaterThan(0.75);
  expect(model.weights.secure).toBeGreaterThan(0.6);
  expect(model.weights.thirdPlayer).toBeGreaterThan(0.5);
});
