import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotPatternDiversityDecisions } from "../src/modules/game-simulator/autopilot-pattern-diversity-decisions.mjs";

function createPatternDiversityDeps(overrides = {}) {
  let recentSteps = overrides.recentSteps || [];
  let laneRepeats = overrides.laneRepeats ?? 0;
  const laneIndexes = { leftWide: 0, leftHalf: 1, central: 2, rightHalf: 3, rightWide: 4 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const deps = {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getAttackingThirdKey: (point, teamId) => {
      const depth = teamId === "home" ? point.x : 105 - point.x;
      if (depth >= 72) return "finish";
      if (depth >= 38) return "middle";
      return "build";
    },
    getAutoPilotCandidatePattern: (candidate, carrier, startPoint) => ({
      family: candidate.patternFamily || (candidate.isSwitch ? "switch" : candidate.actionType === "dribble" ? "carry-forward" : "support-link"),
      laneKey: deps.getPitchLaneKey(candidate.target),
      thirdKey: deps.getAttackingThirdKey(candidate.target, carrier.team),
      receiverRoleKey: candidate.receiverRoleKey || "connector",
      targetSpaceLabel: candidate.targetSpaceLabel || "central space",
      forwardGain: candidate.forwardGain ?? candidate.target.x - startPoint.x,
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
    getPitchThreatProfile: (point) => ({
      value: point.x >= 68 ? 0.7 : 0.34,
    }),
    getPlayerPressureLoad: () => 0.24,
    getPlayerTendency: () => 0.42,
    getRecentLaneRepeatCount: () => laneRepeats,
    getRecentPossessionSteps: () => recentSteps,
    getRecordedStepDuration: (step) => step.duration ?? 1,
    getRecordedStepPattern: (step = {}, teamId = "home") =>
      step.pattern || {
        family: step.actionType || "support-link",
        laneKey: deps.getPitchLaneKey(step.target || { x: 52, y: 34 }),
        thirdKey: deps.getAttackingThirdKey(step.target || { x: 52, y: 34 }, teamId),
        receiverRoleKey: step.receiverRoleKey || "connector",
        targetSpaceLabel: step.targetSpaceLabel || "central space",
        forwardGain: step.forwardGain ?? 0,
      },
    isTransitionAttackStyle: (styleKey) => styleKey === "fast-break" || styleKey === "direct-transition",
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    setRecentSteps(nextRecentSteps) {
      recentSteps = nextRecentSteps;
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
    styleKey: "control-possession",
    switchBias: 0.68,
    tempo: 0.62,
    progressionUrgency: 0.7,
    ...overrides,
  };
}

test("game simulator autopilot pattern diversity decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotPatternDiversityDecisions(createPatternDiversityDeps());

  expect(typeof decisions.getAutoPilotPatternDiversityAdjustment).toBe("function");
  expect(typeof decisions.getAutoPilotRepetitionPenalty).toBe("function");
});

test("game simulator autopilot pattern diversity decisions stay neutral without possession history", () => {
  const decisions = createGameSimulatorAutopilotPatternDiversityDecisions(createPatternDiversityDeps());
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const diversity = decisions.getAutoPilotPatternDiversityAdjustment(
    { actionType: "pass", target: { x: 48, y: 34 } },
    carrier,
    carrier.position,
    createProfile()
  );
  const repetition = decisions.getAutoPilotRepetitionPenalty(
    { actionType: "pass", target: { x: 48, y: 34 } },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(diversity.score).toBe(0);
  expect(diversity.labels).toEqual([]);
  expect(repetition).toBe(0);
});

test("game simulator autopilot pattern diversity decisions penalize stale same-lane patterns", () => {
  const decisions = createGameSimulatorAutopilotPatternDiversityDecisions(createPatternDiversityDeps({
    recentSteps: [
      { pattern: { family: "support-link", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
      { pattern: { family: "support-link", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
      { pattern: { family: "support-link", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
    ],
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotPatternDiversityAdjustment(
    {
      actionType: "pass",
      target: { x: 46, y: 34 },
      receiverRoleKey: "connector",
      targetSpaceLabel: "central space",
      forwardGain: 4,
    },
    carrier,
    carrier.position,
    createProfile()
  );

  expect(result.score).toBeLessThan(-0.35);
  expect(result.pattern.family).toBe("support-link");
});

test("game simulator autopilot pattern diversity decisions reward rhythm changes across lanes", () => {
  const decisions = createGameSimulatorAutopilotPatternDiversityDecisions(createPatternDiversityDeps({
    recentSteps: [
      { pattern: { family: "recycle", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
      { pattern: { family: "recycle", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
      { pattern: { family: "recycle", laneKey: "central", thirdKey: "middle", receiverRoleKey: "connector", targetSpaceLabel: "central space" } },
    ],
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotPatternDiversityAdjustment(
    {
      actionType: "pass",
      target: { x: 56, y: 58 },
      receiverRoleKey: "wideForward",
      targetSpaceLabel: "weak-side lane",
      forwardGain: 14,
      isSwitch: true,
    },
    carrier,
    carrier.position,
    createProfile({ switchBias: 0.74, tempo: 0.7 })
  );

  expect(result.score).toBeGreaterThan(0.2);
  expect(result.labels).toContain("Change rhythm");
});

test("game simulator autopilot pattern diversity decisions punish direct return repetition", () => {
  const decisions = createGameSimulatorAutopilotPatternDiversityDecisions(createPatternDiversityDeps({
    laneRepeats: 2,
    recentSteps: [
      { carrierPlayerId: "H2", receiverPlayerId: "H1", target: { x: 43, y: 34 }, duration: 1.1 },
      { carrierPlayerId: "H1", receiverPlayerId: "H2", target: { x: 44, y: 34 }, duration: 1.2 },
    ],
  }));
  const carrier = { id: "H1", team: "home", position: { x: 42, y: 34 } };

  const result = decisions.getAutoPilotRepetitionPenalty(
    {
      actionType: "pass",
      target: { x: 44, y: 34 },
      receiverPlayerId: "H2",
      forwardGain: 2,
    },
    carrier,
    carrier.position,
    createProfile({ tempo: 0.52 })
  );

  expect(result).toBeGreaterThan(1.5);
});
