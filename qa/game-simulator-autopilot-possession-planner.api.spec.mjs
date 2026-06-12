import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotPossessionPlanner } from "../src/modules/game-simulator/autopilot-possession-planner.mjs";

function createPlannerDeps(overrides = {}) {
  const state = overrides.state || {
    autoPilotPlay: {},
    sequence: { steps: [] },
    time: 1,
  };
  return {
    chooseWeightedOption: (options) => options[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getAttackingDepth: (point) => point.x,
    getLaneForSideSign: (sideSign, laneType) => {
      if (laneType === "wide") return sideSign < 0 ? "leftWide" : "rightWide";
      return sideSign < 0 ? "leftHalf" : "rightHalf";
    },
    getPitchLaneKey: () => "central",
    getPossessionRhythmContext: () => ({ steps: 0, forwardPasses: 0 }),
    getWideSideSign: () => 1,
    isTransitionAttackStyle: () => false,
    randomBetween: (min, max) => (min + max) / 2,
    randomSign: () => 1,
    state,
    ...overrides,
  };
}

test("game simulator autopilot possession planner exposes moved possession plan contracts", () => {
  const planner = createGameSimulatorAutopilotPossessionPlanner(createPlannerDeps());

  expect(typeof planner.getAutoPilotPossessionStartIndex).toBe("function");
  expect(typeof planner.createAutoPilotPossessionPlan).toBe("function");
  expect(typeof planner.getAutoPilotPossessionPlan).toBe("function");
  expect(typeof planner.invalidateAutoPilotPossessionPlan).toBe("function");
});

test("game simulator autopilot possession planner reads live sequence state through dependency boundary", () => {
  const state = {
    autoPilotPlay: {},
    sequence: { steps: [{}, {}, {}, {}] },
    time: 1,
  };
  const planner = createGameSimulatorAutopilotPossessionPlanner(createPlannerDeps({
    state,
    getPossessionRhythmContext: () => ({ steps: 2, forwardPasses: 0 }),
  }));

  expect(planner.getAutoPilotPossessionStartIndex("home")).toBe(2);

  state.sequence.steps.push({}, {});

  expect(planner.getAutoPilotPossessionStartIndex("home")).toBe(4);
});

test("game simulator autopilot possession planner creates and invalidates one active plan", () => {
  const state = {
    autoPilotPlay: {},
    sequence: { steps: [] },
    time: 4,
  };
  const planner = createGameSimulatorAutopilotPossessionPlanner(createPlannerDeps({ state }));
  const profile = {
    styleKey: "control-possession",
    formation: "4-3-3",
    shortSupport: 0.8,
    lineBreakBias: 0.5,
    directness: 0.35,
    widthDiscipline: 0.6,
    switchBias: 0.45,
    overlapBias: 0.35,
    crossBias: 0.3,
    progressionUrgency: 0.45,
    routeOneBias: 0.1,
    tempo: 0.5,
  };

  const plan = planner.getAutoPilotPossessionPlan("home", { x: 35, y: 40 }, profile);

  expect(plan).toMatchObject({
    teamId: "home",
    styleKey: "control-possession",
    routeKey: "central-third-man",
    openingKey: "control-settle",
  });
  expect(state.autoPilotPlay.possessionPlan).toBe(plan);

  planner.invalidateAutoPilotPossessionPlan(state);

  expect(state.autoPilotPlay.possessionPlan).toBeNull();
});
