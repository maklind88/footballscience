import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameSimulatorAutopilotPrincipleScoringDecisions } from "../src/modules/game-simulator/autopilot-principle-scoring-decisions.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createPrincipleScoringDeps(overrides = {}) {
  const carrier = { id: "H6", team: "home", position: { x: 52, y: 34 }, role: "Central Midfielder" };
  const receiver = { id: "H8", team: "home", position: { x: 64, y: 32 }, role: "Attacking Midfielder" };
  const players = [carrier, receiver];

  return {
    carrier,
    receiver,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    computePassLaneClarity: () => 0.84,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.72,
      targetPressure: 0.22,
      targetThreat: { box: 0.08, centralPocket: 0.42, value: 0.62 },
      value: 0.68,
    }),
    getAttackDirectionSign: () => 1,
    getAttackingDepth: (point) => point.x,
    getAutoPilotCandidatePrincipleMetrics: () => ({
      breakLine: 0.76,
      driveSpace: 0.48,
      goldenZone: 0.42,
      secure: 0.18,
      shoot: 0.12,
      thirdPlayer: 0.44,
    }),
    getAutoPilotFlowContext: () => ({
      carrierJustReceived: true,
      consecutivePasses: 1,
      pressure: 0.28,
    }),
    getAutoPilotIntentionModel: () => ({
      flow: { pressure: 0.28 },
      forwardFacingSpaceTwo: { active: false },
      progressionWindow: { active: false },
      regain: { active: false },
      rhythm: { sidewaysPasses: 0 },
      weights: {
        breakLine: 0.9,
        driveSpace: 0.28,
        goldenZone: 0.3,
        secure: 0.16,
        shoot: 0.12,
        thirdPlayer: 0.44,
      },
    }),
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getOffensiveRoleKey: (player) => (player.id === "H8" ? "connector" : "pivot"),
    getPitchLaneIndex: () => 2,
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: (point) => ({
      betweenLines: point.x >= 60 ? 0.5 : 0.2,
      box: point.x >= 78 ? 0.32 : 0.08,
      centralPocket: point.x >= 60 ? 0.44 : 0.18,
      primaryLabel: "central pocket",
      value: point.x >= 60 ? 0.66 : 0.38,
    }),
    getPlayerById: (playerId) => players.find((player) => player.id === playerId) ?? null,
    getPlayerPressureLoad: () => 0.28,
    getPlayerTendency: () => 0.62,
    getPossessionRhythmContext: () => ({ sidewaysPasses: 0 }),
    getRecentLaneRepeatCount: () => 0,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))].slice(0, 3),
    ...overrides,
  };
}

test("game simulator autopilot principle scoring decisions expose scoring contracts", () => {
  const decisions = createGameSimulatorAutopilotPrincipleScoringDecisions(createPrincipleScoringDeps());

  expect(typeof decisions.getUniversalFootballDecisionAdjustment).toBe("function");
  expect(typeof decisions.scoreAutoPilotCandidateByIntentions).toBe("function");
  expect(typeof decisions.getAutoPilotStylePrincipleWeights).toBe("function");
  expect(typeof decisions.getAutoPilotPrincipleAdjustment).toBe("function");
  expect(typeof decisions.getAutoPilotLaneRealityAdjustment).toBe("function");
});

test("game simulator autopilot principle scoring decisions reward clean valuable passing lanes", () => {
  const deps = createPrincipleScoringDeps();
  const decisions = createGameSimulatorAutopilotPrincipleScoringDecisions(deps);

  const adjustment = decisions.getAutoPilotLaneRealityAdjustment(
    {
      actionType: "pass",
      forwardGain: 12,
      isLineBreak: true,
      laneClarity: 0.84,
      receiverPlayerId: "H8",
      target: { x: 64, y: 32 },
    },
    deps.carrier,
    deps.carrier.position,
    { lineBreakBias: 0.7 }
  );

  expect(adjustment.score).toBeGreaterThan(0);
  expect(adjustment.labels).toContain("Clean passing lane");
});

test("game simulator autopilot decision engine delegates principle scoring to a focused module", () => {
  const decisionEngine = readProjectFile("src/modules/game-simulator/autopilot-decision-engine.mjs");
  const principleScoring = readProjectFile("src/modules/game-simulator/autopilot-principle-scoring-decisions.mjs");

  expect(decisionEngine).toContain('from "./autopilot-principle-scoring-decisions.mjs"');
  expect(decisionEngine).toContain("createGameSimulatorAutopilotPrincipleScoringDecisions({");
  expect(decisionEngine).not.toContain("function getUniversalFootballDecisionAdjustment(");
  expect(decisionEngine).not.toContain("function scoreAutoPilotCandidateByIntentions(");
  expect(decisionEngine).not.toContain("function getAutoPilotPrincipleAdjustment(");
  expect(decisionEngine).not.toContain("function getAutoPilotLaneRealityAdjustment(");
  expect(principleScoring).toContain("function getUniversalFootballDecisionAdjustment(");
  expect(principleScoring).toContain("function scoreAutoPilotCandidateByIntentions(");
  expect(principleScoring).toContain("function getAutoPilotPrincipleAdjustment(");
  expect(principleScoring).toContain("function getAutoPilotLaneRealityAdjustment(");
});
