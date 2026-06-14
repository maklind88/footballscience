import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotPossessionLoopDecisions } from "../src/modules/game-simulator/autopilot-possession-loop-decisions.mjs";

function createPossessionLoopDeps(overrides = {}) {
  let recentSteps = overrides.recentSteps || [];
  let rhythm = overrides.rhythm || {
    steps: 0,
    forwardPasses: 0,
    lineBreaks: 0,
    sidewaysPasses: 0,
    backPasses: 0,
    duration: 0,
  };
  const pitch = { length: 105, width: 68 };
  const laneIndexes = { leftWide: 0, leftHalf: 1, central: 2, rightHalf: 3, rightWide: 4 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: (_startPoint, target) => ({
      value: target.x >= 60 ? 0.62 : 0.3,
      lineBreakCount: target.x >= 62 ? 1 : 0,
      openTarget: target.x >= 60 ? 0.64 : 0.34,
      targetPressure: target.x >= 60 ? 0.42 : 0.28,
    }),
    getActionThreatGain: (_from, to, teamId) => (teamId === "home" ? Math.max(0, to.x - 52) / 80 : Math.max(0, 53 - to.x) / 80),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : pitch.length - point.x),
    getAttackingGameSpaceProfile: (point, teamId) => {
      const depth = deps.getAttackingDepth(point, teamId);
      if (depth >= 66) return { key: "space4", index: 4 };
      if (depth >= 58) return { key: "space3", index: 3 };
      return { key: "space2", index: 2 };
    },
    getAttackingThirdKey: (point, teamId) => {
      const depth = deps.getAttackingDepth(point, teamId);
      if (depth >= 70) return "finish";
      if (depth >= 38) return "middle";
      return "build";
    },
    getAutoPilotCandidatePattern: (candidate, _carrier, startPoint) => ({
      family: candidate.patternFamily || (candidate.isSwitch ? "switch" : candidate.actionType),
      laneKey: deps.getPitchLaneKey(candidate.target),
      thirdKey: deps.getAttackingThirdKey(candidate.target, _carrier.team),
      receiverRoleKey: candidate.receiverRoleKey || "connector",
      targetSpaceLabel: "central space",
      forwardGain: candidate.forwardGain ?? (candidate.target.x - startPoint.x),
      passDistance: deps.distance(startPoint, candidate.target),
    }),
    getPitchLaneIndex: (laneOrPoint) => {
      const laneKey = typeof laneOrPoint === "string" ? laneOrPoint : deps.getPitchLaneKey(laneOrPoint);
      return laneIndexes[laneKey] ?? 2;
    },
    getPitchLaneKey: (point) => {
      if (typeof point === "string") return point;
      if (point.y <= 12) return "leftWide";
      if (point.y <= 26) return "leftHalf";
      if (point.y >= 56) return "rightWide";
      if (point.y >= 42) return "rightHalf";
      return "central";
    },
    getPitchThreatProfile: (point) =>
      point.x >= 64
        ? { value: 0.68, box: 0.24, assistZone: 0.2, cutbackZone: 0.18 }
        : { value: 0.32, box: 0.04, assistZone: 0.04, cutbackZone: 0.04 },
    getPlayerPressureLoad: () => 0.24,
    getPossessionRhythmContext: () => rhythm,
    getRecentPossessionSteps: () => recentSteps,
    getRecordedStepActorIds: (step = {}) => ({
      carrierId: step.carrierPlayerId ?? step.beforeSnapshot?.ball?.ownerPlayerId ?? null,
      receiverId: step.receiverPlayerId ?? step.afterSnapshot?.ball?.ownerPlayerId ?? null,
    }),
    getRecordedStepPattern: (step = {}, teamId = "home") =>
      step.pattern || {
        laneKey: deps.getPitchLaneKey(step.target || { x: 52, y: 34 }),
        thirdKey: deps.getAttackingThirdKey(step.target || { x: 52, y: 34 }, teamId),
      },
    isWideChannel: (point) => Math.abs(point.y - pitch.width / 2) >= 16,
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    setRecentSteps(nextRecentSteps) {
      recentSteps = nextRecentSteps;
    },
    setRhythm(nextRhythm) {
      rhythm = nextRhythm;
    },
    ...overrides,
  };
  return deps;
}

function createProfile(overrides = {}) {
  return {
    progressionUrgency: 0.7,
    shortSupport: 0.56,
    tempo: 0.62,
    carryBias: 0.54,
    switchBias: 0.66,
    lineBreakBias: 0.68,
    shootBias: 0.42,
    deliveryBias: 0.4,
    crossBias: 0.36,
    styleKey: "control-possession",
    ...overrides,
  };
}

test("game simulator autopilot possession loop decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotPossessionLoopDecisions(createPossessionLoopDeps());

  expect(typeof decisions.getAutoPilotPossessionLoopAdjustment).toBe("function");
  expect(typeof decisions.getAutoPilotCorridorTempoReleaseAdjustment).toBe("function");
});

test("game simulator autopilot possession loop decisions stay neutral without a candidate", () => {
  const decisions = createGameSimulatorAutopilotPossessionLoopDecisions(createPossessionLoopDeps());

  const result = decisions.getAutoPilotPossessionLoopAdjustment(null, { id: "H1", team: "home" }, { x: 42, y: 34 }, createProfile());

  expect(result.score).toBe(0);
  expect(result.labels).toEqual([]);
  expect(result.context).toBeNull();
});

test("game simulator autopilot possession loop decisions punish sterile two-player returns", () => {
  const decisions = createGameSimulatorAutopilotPossessionLoopDecisions(createPossessionLoopDeps({
    recentSteps: [
      { carrierPlayerId: "H2", receiverPlayerId: "H1", target: { x: 42, y: 34 }, pattern: { laneKey: "central", thirdKey: "middle" } },
      { carrierPlayerId: "H1", receiverPlayerId: "H2", target: { x: 44, y: 34 }, pattern: { laneKey: "central", thirdKey: "middle" } },
      { carrierPlayerId: "H3", receiverPlayerId: "H1", target: { x: 43, y: 34 }, pattern: { laneKey: "central", thirdKey: "middle" } },
    ],
    rhythm: {
      steps: 4,
      forwardPasses: 0,
      lineBreaks: 0,
      sidewaysPasses: 3,
      backPasses: 0,
      duration: 7,
    },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotPossessionLoopAdjustment(
    {
      actionType: "pass",
      target: { x: 44, y: 34 },
      receiverPlayerId: "H2",
      forwardGain: 2,
      laneClarity: 0.72,
    },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result.score).toBeLessThan(-0.9);
  expect(result.labels).toContain("Avoid two-player loop");
  expect(result.labels).toContain("Break sterile circulation");
  expect(result.context.directReturn).toBe(true);
});

test("game simulator autopilot possession loop decisions reward releasing a loaded corridor", () => {
  const decisions = createGameSimulatorAutopilotPossessionLoopDecisions(createPossessionLoopDeps({
    recentSteps: [
      {
        carrierPlayerId: "H1",
        receiverPlayerId: "H2",
        target: { x: 57, y: 34 },
        beforeSnapshot: { ball: { position: { x: 55, y: 34 } } },
        pattern: { laneKey: "central", thirdKey: "middle" },
      },
      {
        carrierPlayerId: "H2",
        receiverPlayerId: "H3",
        target: { x: 58, y: 35 },
        beforeSnapshot: { ball: { position: { x: 56, y: 35 } } },
        pattern: { laneKey: "central", thirdKey: "middle" },
      },
      {
        carrierPlayerId: "H3",
        receiverPlayerId: "H1",
        target: { x: 58, y: 33 },
        beforeSnapshot: { ball: { position: { x: 57, y: 33 } } },
        pattern: { laneKey: "central", thirdKey: "middle" },
      },
    ],
    rhythm: {
      steps: 4,
      forwardPasses: 0,
      lineBreaks: 0,
      sidewaysPasses: 2,
      backPasses: 1,
      duration: 8,
    },
  }));
  const carrier = { id: "H1", team: "home", position: { x: 58, y: 34 } };

  const result = decisions.getAutoPilotCorridorTempoReleaseAdjustment(
    {
      actionType: "pass",
      target: { x: 66, y: 48 },
      receiverPlayerId: "H7",
      forwardGain: 8,
      laneClarity: 0.72,
      isSwitch: true,
    },
    carrier,
    carrier.position,
    createProfile({ switchBias: 0.72, lineBreakBias: 0.74 })
  );

  expect(result.score).toBeGreaterThan(0.35);
  expect(result.labels).toContain("Corridor: diagonal release");
  expect(result.labels).toContain("Corridor: change point of attack");
  expect(result.context.switchRelease).toBe(true);
  expect(result.context.corridorLoad).toBeGreaterThan(0.58);
});
