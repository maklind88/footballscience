import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotSpacingBonusDecisions } from "../src/modules/game-simulator/autopilot-spacing-bonus-decisions.mjs";

const laneIndexes = {
  leftWide: 0,
  leftHalf: 1,
  central: 2,
  rightHalf: 3,
  rightWide: 4,
};

function createSpacingBonusDecisions(overrides = {}) {
  return createGameSimulatorAutopilotSpacingBonusDecisions({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingThirdKey: () => "middle",
    getPitchLaneIndex: (laneOrPoint) => laneIndexes[typeof laneOrPoint === "string" ? laneOrPoint : laneOrPoint.laneKey] ?? 2,
    getPitchLaneKey: (pointOrKey) => (typeof pointOrKey === "string" ? pointOrKey : pointOrKey.laneKey),
    getRecentLaneRepeatCount: () => 2,
    ...overrides,
  });
}

const profile = {
  carryBias: 0.75,
  crossBias: 0.4,
  shortSupport: 0.5,
  sidewaysTolerance: 0.2,
  switchBias: 0.5,
  widthDiscipline: 0.7,
};

test("game simulator autopilot spacing bonus decisions rewards wide corridor switches", () => {
  const decisions = createSpacingBonusDecisions();

  const bonus = decisions.getAutoPilotSpacingBonus(
    {
      actionType: "pass",
      target: { x: 55, y: 62, laneKey: "rightWide" },
    },
    { team: "home" },
    { x: 35, y: 34, laneKey: "central" },
    profile
  );

  expect(bonus).toBeCloseTo(1.062, 3);
});

test("game simulator autopilot spacing bonus decisions dampens non-progressive lateral support", () => {
  const decisions = createSpacingBonusDecisions({ getRecentLaneRepeatCount: () => 0 });

  const bonus = decisions.getAutoPilotSpacingBonus(
    {
      actionType: "pass",
      forwardGain: 3,
      target: { x: 38, y: 24, laneKey: "leftHalf" },
    },
    { team: "home" },
    { x: 35, y: 34, laneKey: "central" },
    profile
  );

  expect(bonus).toBeCloseTo(0.0713, 4);
});

test("game simulator autopilot spacing bonus decisions rewards dribbles into a new lane", () => {
  const decisions = createSpacingBonusDecisions();

  const bonus = decisions.getAutoPilotSpacingBonus(
    {
      actionType: "dribble",
      target: { x: 38, y: 45, laneKey: "rightHalf" },
    },
    { team: "home" },
    { x: 35, y: 34, laneKey: "central" },
    profile
  );

  expect(bonus).toBeCloseTo(0.24, 3);
});
