import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotCombinationChainDecisions } from "../src/modules/game-simulator/autopilot-combination-chain-decisions.mjs";

function createCombinationChainDeps(overrides = {}) {
  let recentSteps = overrides.recentSteps ?? [
    {
      actionType: "pass",
      beforeSnapshot: { ball: { ownerPlayerId: "H6", position: { x: 42, y: 34 } } },
      afterSnapshot: { ball: { ownerPlayerId: "H8" } },
      receiverPlayerId: "H8",
      target: { x: 52, y: 32 },
      duration: 1.4,
    },
    {
      actionType: "pass",
      beforeSnapshot: { ball: { ownerPlayerId: "H4", position: { x: 35, y: 45 } } },
      afterSnapshot: { ball: { ownerPlayerId: "H6" } },
      receiverPlayerId: "H6",
      target: { x: 42, y: 34 },
      duration: 1.8,
    },
  ];
  const players = overrides.players ?? [
    { id: "H6", team: "home", roleKey: "pivot", position: { x: 42, y: 34 } },
    { id: "H8", team: "home", roleKey: "connector", position: { x: 52, y: 32 } },
    { id: "H10", team: "home", roleKey: "connector", position: { x: 60, y: 20 } },
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getPitchLaneKey = (pointOrLane) => {
    if (typeof pointOrLane === "string") {
      return pointOrLane;
    }
    const y = pointOrLane?.y ?? 34;
    if (y < 13) return "leftWide";
    if (y < 27) return "leftHalf";
    if (y < 41) return "central";
    if (y < 55) return "rightHalf";
    return "rightWide";
  };
  const laneIndexes = new Map([
    ["leftWide", 0],
    ["leftHalf", 1],
    ["central", 2],
    ["rightHalf", 3],
    ["rightWide", 4],
  ]);

  return {
    clamp,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.62,
      targetThreat: {
        value: 0.52,
        betweenLines: 0.32,
        halfSpace: 0.3,
      },
      value: 0.48,
    }),
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingGameSpaceProfile: () => ({ key: "space2" }),
    getAutoPilotCandidateReceiver: (candidate) => players.find((player) => player.id === candidate.receiverPlayerId) ?? null,
    getNearestOpponentGap: () => 12,
    getOffensiveRoleKey: (player) => player?.roleKey ?? "connector",
    getPitchLaneIndex: (pointOrLane) => laneIndexes.get(getPitchLaneKey(pointOrLane)) ?? 2,
    getPitchLaneKey,
    getPitchThreatProfile: () => ({
      value: 0.36,
      betweenLines: 0.3,
      halfSpace: 0.28,
    }),
    getPlayerPressureLoad: () => 0.34,
    getRecentPossessionSteps: () => recentSteps,
    getRecordedStepActorIds: (step) => ({
      carrierId: step?.beforeSnapshot?.ball?.ownerPlayerId ?? step?.carrierPlayerId ?? null,
      receiverId: step?.receiverPlayerId ?? step?.afterSnapshot?.ball?.ownerPlayerId ?? null,
    }),
    getRecordedStepDuration: (step) => step?.duration ?? 1,
    teams: { home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    replaceRecentSteps(nextSteps) {
      recentSteps = nextSteps;
    },
    ...overrides,
  };
}

test("game simulator autopilot combination chain decisions expose moved contracts", () => {
  const decisions = createGameSimulatorAutopilotCombinationChainDecisions(createCombinationChainDeps());

  expect(typeof decisions.getAutoPilotCombinationChainContext).toBe("function");
  expect(typeof decisions.getAutoPilotCombinationChainAdjustment).toBe("function");
});

test("game simulator autopilot combination chain decisions reward third-man releases", () => {
  const decisions = createGameSimulatorAutopilotCombinationChainDecisions(createCombinationChainDeps());

  const result = decisions.getAutoPilotCombinationChainAdjustment(
    {
      actionType: "pass",
      receiverPlayerId: "H10",
      target: { x: 60, y: 20 },
    },
    { id: "H8", team: "home", position: { x: 52, y: 32 } },
    { x: 52, y: 32 },
    { lineBreakBias: 0.62, shortSupport: 0.6, tempo: 0.65 }
  );

  expect(result.score).toBeGreaterThan(0.45);
  expect(result.labels).toContain("Third-man chain");
  expect(result.labels).toContain("Play around the corner");
  expect(result.context.thirdPlayerRelease).toBe(true);
});

test("game simulator autopilot combination chain decisions punish dead bounce passes", () => {
  const decisions = createGameSimulatorAutopilotCombinationChainDecisions(createCombinationChainDeps({
    getActionSpaceValue: () => ({
      lineBreakCount: 0,
      openTarget: 0.2,
      targetThreat: {
        value: 0.37,
        betweenLines: 0.1,
        halfSpace: 0.1,
      },
      value: 0.2,
    }),
    getPlayerPressureLoad: () => 0.22,
  }));

  const result = decisions.getAutoPilotCombinationChainAdjustment(
    {
      actionType: "pass",
      receiverPlayerId: "H6",
      target: { x: 50, y: 34 },
    },
    { id: "H8", team: "home", position: { x: 52, y: 32 } },
    { x: 52, y: 32 },
    { progressionUrgency: 0.5 }
  );

  expect(result.score).toBeLessThan(-0.75);
  expect(result.labels).toContain("Avoid dead bounce");
  expect(result.context.directReturn).toBe(true);
});

test("game simulator autopilot combination chain decisions read recent steps through dependency boundary", () => {
  const deps = createCombinationChainDeps();
  const decisions = createGameSimulatorAutopilotCombinationChainDecisions(deps);
  const carrier = { id: "H8", team: "home", position: { x: 52, y: 32 } };

  expect(decisions.getAutoPilotCombinationChainContext(carrier, { x: 52, y: 32 }).active).toBe(true);

  deps.replaceRecentSteps([{ actionType: "dribble" }]);

  expect(decisions.getAutoPilotCombinationChainContext(carrier, { x: 52, y: 32 }).active).toBe(false);
});
