import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotTempoRhythm } from "../src/modules/game-simulator/autopilot-tempo-rhythm.mjs";

function createTempoRhythmDeps(overrides = {}) {
  let rhythm = overrides.rhythm || {
    backPasses: 0,
    duration: 1,
    forwardPasses: 0,
    lineBreaks: 0,
    sidewaysPasses: 0,
    steps: 0,
  };
  const recentSteps = overrides.recentSteps || [];
  const players = [
    { id: "H1", team: "home", position: { x: 42, y: 34 }, role: "Central Midfielder" },
    { id: "H2", team: "home", position: { x: 52, y: 34 }, role: "Striker" },
  ];
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({ lineBreakCount: 1, openTarget: 0.7, value: 0.55 }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackStyleRhythmProfile: () => ({ targetSeconds: 6 }),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2" }),
    getAttackingThirdKey: () => "middle",
    getAutoPilotCandidatePattern: (candidate, _carrier, startPoint) => ({
      family: candidate.family ?? "line-break",
      forwardGain: candidate.forwardGain ?? candidate.target.x - startPoint.x,
      laneKey: "central",
      passDistance: 14,
      receiverRoleKey: candidate.receiverRoleKey ?? "connector",
    }),
    getAutoPilotFlowContext: () => ({ carrierJustReceived: false, pressure: 0.2 }),
    getAutoPilotPossessionPlan: () => ({
      openingFamilies: ["line-break"],
      openingKey: "half-space-probe",
      openingLabel: "find the half-space connector",
      openingLanes: ["central"],
      openingLongPassPenalty: 0.34,
      openingReceiverRoles: ["connector"],
      openingStepLimit: 4,
    }),
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getOffensiveRoleKey: () => "connector",
    getPitchLaneIndex: () => 2,
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: () => ({
      betweenLines: 0.36,
      box: 0.1,
      centralPocket: 0.22,
      cutbackZone: 0.08,
      halfSpace: 0.38,
      value: 0.46,
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) || null,
    getPlayerPressureLoad: () => 0.2,
    getPossessionRhythmContext: () => rhythm,
    getRecentLaneRepeatCount: () => 0,
    getRecentPossessionSteps: () => recentSteps,
    getRecordedStepPattern: () => ({ family: "support-link", forwardGain: 1 }),
    isSupportRole: (roleKey) => roleKey === "connector" || roleKey === "pivot" || roleKey === "wideBack",
    isTransitionAttackStyle: () => false,
    possessionRhythmDefaults: { targetSeconds: 6 },
    replaceRhythm(nextRhythm) {
      rhythm = nextRhythm;
    },
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    ...overrides,
  };
}

test("game simulator autopilot tempo rhythm exposes moved tempo and rhythm contracts", () => {
  const tempoRhythm = createGameSimulatorAutopilotTempoRhythm(createTempoRhythmDeps());

  expect(typeof tempoRhythm.getAutoPilotTempoPhaseContext).toBe("function");
  expect(typeof tempoRhythm.getAutoPilotTempoPhaseAdjustment).toBe("function");
  expect(typeof tempoRhythm.getAutoPilotRhythmGovernorAdjustment).toBe("function");
  expect(typeof tempoRhythm.getAutoPilotOpeningVariationAdjustment).toBe("function");
});

test("game simulator autopilot tempo rhythm reads live rhythm through dependency boundary", () => {
  const deps = createTempoRhythmDeps();
  const tempoRhythm = createGameSimulatorAutopilotTempoRhythm(deps);
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  expect(tempoRhythm.getAutoPilotTempoPhaseContext(carrier, carrier.position, { directness: 0.3 }).phaseKey)
    .toBe("settle");

  deps.replaceRhythm({
    backPasses: 1,
    duration: 6,
    forwardPasses: 0,
    lineBreaks: 0,
    sidewaysPasses: 2,
    steps: 4,
  });

  expect(tempoRhythm.getAutoPilotTempoPhaseContext(carrier, carrier.position, { directness: 0.3 }).phaseKey)
    .toBe("moveBlock");
});

test("game simulator autopilot tempo rhythm scores opening variation without owning state", () => {
  const tempoRhythm = createGameSimulatorAutopilotTempoRhythm(createTempoRhythmDeps());
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };
  const candidate = {
    actionType: "pass",
    receiverPlayerId: "H2",
    target: { x: 54, y: 34 },
  };

  const adjustment = tempoRhythm.getAutoPilotOpeningVariationAdjustment(candidate, carrier, carrier.position, {
    directness: 0.45,
    lineBreakBias: 0.5,
    overlapBias: 0.4,
    progressionUrgency: 0.5,
    switchBias: 0.4,
  });

  expect(adjustment.labels).toContain("Opening variation: find the half-space connector");
  expect(adjustment.openingKey).toBe("half-space-probe");
});
