import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotFlowDecisions } from "../src/modules/game-simulator/autopilot-flow-decisions.mjs";

function createFlowDeps(overrides = {}) {
  let flow = overrides.flow || {
    pressure: 0.24,
    carrierJustReceived: false,
    consecutivePasses: 0,
    carrierRoleKey: "connector",
    recentFrontLineTargets: 0,
    recentWideTargets: 0,
    lastCarrierId: null,
    lastReceiverId: null,
    receiverRoleCounts: new Map(),
  };
  let rhythm = overrides.rhythm || {
    duration: 3,
    sidewaysPasses: 0,
    backPasses: 0,
    forwardPasses: 0,
    steps: 1,
  };
  let regain = overrides.regain || {
    active: false,
    freshness: 0,
    counterIntent: 0,
    secureIntent: 0,
    pressure: 0,
    forwardOpenSpace: 0,
  };
  let progression = overrides.progression || {
    active: false,
    openLane: 0,
    urgency: 0,
  };
  let lastPrinciples = overrides.lastPrinciples || [];
  const players = overrides.players || [
    { id: "H2", team: "home", position: { x: 56, y: 34 }, roleKey: "striker", role: "Striker" },
    { id: "H3", team: "home", position: { x: 48, y: 22 }, roleKey: "wideBack", role: "Fullback" },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_startPoint, target) => ({
      value: target.x >= 52 ? 0.58 : 0.2,
      lineBreakCount: target.x >= 52 ? 1 : 0,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAutoPilotFlowContext: () => flow,
    getAutoPilotRegainContext: () => regain,
    getForwardProgressionWindow: () => progression,
    getLastAutoPrincipleSet: () => lastPrinciples,
    getOffensiveRoleKey: (player) => player.roleKey || "connector",
    getPitchLaneKey: (point) => {
      if (point.y <= 12) return "leftWide";
      if (point.y <= 26) return "leftHalf";
      if (point.y >= 56) return "rightWide";
      if (point.y >= 42) return "rightHalf";
      return "central";
    },
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) || null,
    getPossessionRhythmContext: () => rhythm,
    isFrontLineRole: (roleKey) => ["striker", "wideForward", "secondStriker"].includes(roleKey),
    isSupportRole: (roleKey) => ["pivot", "connector", "wideBack"].includes(roleKey),
    principleSetIncludes: (principles, text) => (principles || []).some((entry) => String(entry).includes(text)),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    setFlow(nextFlow) {
      flow = nextFlow;
    },
    setRhythm(nextRhythm) {
      rhythm = nextRhythm;
    },
    setRegain(nextRegain) {
      regain = nextRegain;
    },
    setProgression(nextProgression) {
      progression = nextProgression;
    },
    setLastPrinciples(nextPrinciples) {
      lastPrinciples = nextPrinciples;
    },
    ...overrides,
  };
  return deps;
}

function createProfile(overrides = {}) {
  return {
    carryBias: 0.62,
    dribbleBias: 0.56,
    progressionUrgency: 0.7,
    directness: 0.54,
    sidewaysTolerance: 0.4,
    overlapBias: 0.6,
    widthDiscipline: 0.64,
    deliveryBias: 0.52,
    lineBreakBias: 0.72,
    shortSupport: 0.68,
    phaseKey: "progression",
    targetPossessionSeconds: 8,
    ...overrides,
  };
}

test("game simulator autopilot flow decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotFlowDecisions(createFlowDeps());

  expect(typeof decisions.getAutoPilotFlowAdjustment).toBe("function");
});

test("game simulator autopilot flow decisions reward carry after receive and progression window", () => {
  const decisions = createGameSimulatorAutopilotFlowDecisions(createFlowDeps({
    flow: {
      pressure: 0.32,
      carrierJustReceived: true,
      consecutivePasses: 2,
      carrierRoleKey: "wideForward",
      recentFrontLineTargets: 2,
      recentWideTargets: 1,
      lastCarrierId: null,
      lastReceiverId: null,
      receiverRoleCounts: new Map(),
    },
    progression: { active: true, openLane: 0.7, urgency: 0.62 },
    lastPrinciples: ["Ask question wide", "valuable space"],
    rhythm: { duration: 5, sidewaysPasses: 2, backPasses: 0, forwardPasses: 1, steps: 3 },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 20 } };

  const result = decisions.getAutoPilotFlowAdjustment(
    { actionType: "dribble", target: { x: 52, y: 22 }, forwardGain: 10 },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result).toBeGreaterThan(1.6);
});

test("game simulator autopilot flow decisions punish sterile sideways circulation", () => {
  const decisions = createGameSimulatorAutopilotFlowDecisions(createFlowDeps({
    flow: {
      pressure: 0.32,
      carrierJustReceived: false,
      consecutivePasses: 3,
      carrierRoleKey: "connector",
      recentFrontLineTargets: 0,
      recentWideTargets: 1,
      lastCarrierId: null,
      lastReceiverId: null,
      receiverRoleCounts: new Map([["connector", 1]]),
    },
    progression: { active: true, openLane: 0.28, urgency: 0.68 },
    rhythm: { duration: 7, sidewaysPasses: 2, backPasses: 0, forwardPasses: 0, steps: 4 },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotFlowAdjustment(
    {
      actionType: "pass",
      target: { x: 43, y: 35 },
      receiverPlayerId: "H3",
      receiverRoleKey: "connector",
      passDistance: 8,
      forwardGain: 1,
      isSidewaysPass: true,
    },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result).toBeLessThan(-1.1);
});

test("game simulator autopilot flow decisions reward line-breaking continuation", () => {
  const decisions = createGameSimulatorAutopilotFlowDecisions(createFlowDeps({
    progression: { active: true, openLane: 0.66, urgency: 0.64 },
    rhythm: { duration: 5, sidewaysPasses: 0, backPasses: 0, forwardPasses: 1, steps: 3 },
    lastPrinciples: ["Find the Third"],
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotFlowAdjustment(
    {
      actionType: "pass",
      target: { x: 58, y: 34 },
      receiverPlayerId: "H2",
      receiverRoleKey: "striker",
      passDistance: 16,
      forwardGain: 16,
      isLineBreak: true,
    },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result).toBeGreaterThan(0.95);
});
