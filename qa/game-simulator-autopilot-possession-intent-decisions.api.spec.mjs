import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotPossessionIntentDecisions } from "../src/modules/game-simulator/autopilot-possession-intent-decisions.mjs";

function createPossessionIntentDeps(overrides = {}) {
  let flow = overrides.flow || {
    pressure: 0.22,
    carrierJustReceived: false,
  };
  let laneRepeats = overrides.laneRepeats ?? 0;
  const pitch = { length: 105, width: 68 };
  const players = [
    { id: "H1", team: "home", position: { x: 42, y: 34 }, role: "Central Midfielder" },
    { id: "H2", team: "home", position: { x: 56, y: 34 }, role: "Striker" },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.62,
      lineBreakCount: 1,
      targetThreat: { value: 0.58, box: 0.12, centralPocket: 0.42, betweenLines: 0.46, cutbackZone: 0, primaryLabel: "central space" },
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingThirdKey: () => "middle",
    getAutoPilotFlowContext: () => flow,
    getAutoPilotPossessionPlan: () => ({
      preferredLane: "central",
      secondaryLane: "rightHalf",
      routeLanes: ["central", "rightHalf"],
      routeIntents: ["progress", "accelerate"],
      routeLabel: "central third-man route",
      intentSequence: ["secure", "progress", "accelerate", "finish"],
      switchAfter: 2,
      lanePatience: 0.82,
      escalateAfter: 4,
      tempoNudge: 0.04,
    }),
    getAutoPilotPossessionRouteStage: () => 1,
    getForwardProgressionWindow: () => ({ active: true, openLane: 0.72, urgency: 0.64 }),
    getOffensiveRoleKey: (player) => (player.role === "Striker" ? "striker" : "connector"),
    getPitchLaneIndex: (laneOrPoint) => {
      const laneKey = typeof laneOrPoint === "string" ? laneOrPoint : deps.getPitchLaneKey(laneOrPoint);
      return { leftWide: 0, leftHalf: 1, central: 2, rightHalf: 3, rightWide: 4 }[laneKey] ?? 2;
    },
    getPitchLaneKey: (point) => {
      if (typeof point === "string") return point;
      if (point.y >= 44) return "rightHalf";
      if (point.y <= 24) return "leftHalf";
      return "central";
    },
    getPitchThreatProfile: (point) => ({
      value: point.x >= 54 ? 0.6 : 0.34,
      box: 0.12,
      centralPocket: point.x >= 54 ? 0.44 : 0.2,
      betweenLines: point.x >= 54 ? 0.48 : 0.18,
      cutbackZone: 0,
      primaryLabel: "central space",
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.24,
    getPossessionRhythmContext: () => ({ steps: 1, sidewaysPasses: 0, duration: 3 }),
    getRecentLaneRepeatCount: () => laneRepeats,
    isSupportRole: (roleKey) => roleKey === "connector" || roleKey === "pivot" || roleKey === "wideBack",
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    setFlow(nextFlow) {
      flow = nextFlow;
    },
    setLaneRepeats(nextLaneRepeats) {
      laneRepeats = nextLaneRepeats;
    },
    ...overrides,
  };
  return deps;
}

function createProfile(overrides = {}) {
  return {
    shortSupport: 0.56,
    directness: 0.54,
    lineBreakBias: 0.74,
    progressionUrgency: 0.72,
    switchBias: 0.42,
    widthDiscipline: 0.52,
    crossBias: 0.28,
    overlapBias: 0.36,
    tempo: 0.62,
    shootBias: 0.28,
    risk: 0.48,
    ...overrides,
  };
}

test("game simulator autopilot possession intent decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotPossessionIntentDecisions(createPossessionIntentDeps());

  expect(typeof decisions.getAutoPilotPossessionIntentContext).toBe("function");
  expect(typeof decisions.getAutoPilotPossessionIntentFit).toBe("function");
  expect(typeof decisions.getAutoPilotPossessionIntentAdjustment).toBe("function");
});

test("game simulator autopilot possession intent decisions score progressive possession choices", () => {
  const decisions = createGameSimulatorAutopilotPossessionIntentDecisions(createPossessionIntentDeps());
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 }, role: "Central Midfielder" };
  const candidate = {
    actionType: "pass",
    target: { x: 56, y: 34 },
    receiverPlayerId: "H2",
    isLineBreak: true,
    passDistance: 14,
    forwardGain: 14,
    laneClarity: 0.82,
  };

  const result = decisions.getAutoPilotPossessionIntentAdjustment(candidate, carrier, carrier.position, createProfile());

  expect(result.score).toBeGreaterThan(0);
  expect(result.intentLabel).toBe("Progress through pressure");
  expect(result.labels).toContain("Progress through pressure");
});

test("game simulator autopilot possession intent decisions read live tactical dependencies", () => {
  const deps = createPossessionIntentDeps();
  const decisions = createGameSimulatorAutopilotPossessionIntentDecisions(deps);
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 }, role: "Central Midfielder" };

  const calmContext = decisions.getAutoPilotPossessionIntentContext(carrier, carrier.position, createProfile());

  deps.setFlow({ pressure: 0.84, carrierJustReceived: false });
  deps.setLaneRepeats(3);
  const pressedContext = decisions.getAutoPilotPossessionIntentContext(carrier, carrier.position, createProfile());

  expect(calmContext.pressure).toBeLessThan(pressedContext.pressure);
  expect(pressedContext.laneRepeats).toBe(3);
  expect(pressedContext.weights.secure).toBeGreaterThan(calmContext.weights.secure);
});
