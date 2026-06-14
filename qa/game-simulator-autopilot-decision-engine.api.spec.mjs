import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDecisionEngine } from "../src/modules/game-simulator/autopilot-decision-engine.mjs";

function createDecisionEngineDeps(overrides = {}) {
  let state = overrides.state || {
    autoPilotPlay: {},
    ball: { ownerPlayerId: "H1", position: { x: 35, y: 34 } },
    players: [
      { id: "H1", team: "home", position: { x: 35, y: 34 }, role: "Central Midfielder", shortLabel: "CM" },
      { id: "H2", team: "home", position: { x: 43, y: 30 }, role: "Striker", shortLabel: "ST" },
      { id: "A1", team: "away", position: { x: 48, y: 34 }, role: "Defender", shortLabel: "CB" },
    ],
    sequence: { steps: [] },
  };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (first, second) => Math.abs(first - second),
    ballRadiusMeters: 0.3,
    buildPlayerIntelligenceProfile: () => ({ scanning: 0.7, decisions: 0.7, awareness: 0.7 }),
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    chooseWeightedOption: (options) => options[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: () => 0.8,
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      value: 0.5,
      lineBreakCount: 1,
      openTarget: 0.7,
      targetPressure: 0.2,
      targetThreat: { value: 0.5, box: 0.1, centralPocket: 0.2, betweenLines: 0.2, primaryLabel: "space" },
      spacePriority: { score: 0.4 },
    }),
    getActionThreatGain: () => 0.2,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackStyleRhythmProfile: () => ({ targetActionSeconds: 4 }),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAttackingGameSpaceProfile: () => ({ key: "space2", label: "Space 2" }),
    getAttackingThirdKey: () => "middle",
    getAutoPilotRoleStrength: () => 0.7,
    getAutoPilotShotTarget: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getCarryLaneOpenSpaceScore: () => 0.7,
    getCoverShadowInfluence: () => 0,
    getForwardFacingSpaceTwoContext: () => ({ active: false }),
    getForwardProgressionWindow: () => ({ active: false, openLane: 0, urgency: 0 }),
    getLaneForSideSign: () => "central",
    getNearestOpponentGap: () => 10,
    getNearestOpponentGapInCarryLane: () => 10,
    getNearestOpponentGapToPoint: () => 10,
    getOffensiveRoleKey: (player) => (player.id === "H2" ? "striker" : "connector"),
    getOpponentDensityAtPoint: () => 0,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getOpponentLineDepthsForAttackingTeam: () => ({ defensive: 52, midfield: 42, forward: 32 }),
    getOpponentPressureAtPoint: () => 0.2,
    getOtherTeamId: (teamId) => (teamId === "home" ? "away" : "home"),
    getPassLaneRiskProfile: () => ({ risk: 0.2, interceptors: [] }),
    getPitchLaneIndex: () => 2,
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: () => ({
      value: 0.4,
      box: 0.1,
      halfSpace: 0.2,
      betweenLines: 0.2,
      cutbackZone: 0,
      assistZone: 0,
      centralPocket: 0.2,
      behindLine: 0.1,
      primaryLabel: "central space",
    }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ profile: { scanning: 0.7, decisions: 0.7, awareness: 0.7 } }),
    getPlayerFacingAngle: () => 0,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.5,
    getPossessionRhythmContext: () => ({ duration: 1, steps: 0, sidewaysPasses: 0, backPasses: 0, forwardPasses: 0 }),
    getPotentialPassReceiverAtTarget: () => null,
    getReceiveFootUsageScore: () => 0.7,
    getReceiveOrientationScore: () => 0.7,
    getRecentPossessionSteps: () => [],
    getReceptionSupportTarget: (player) => player.position,
    getRecordedStepDuration: () => 1,
    getRecordedStepPossessionTeamId: () => "home",
    getShotWindowProfile: () => ({ laneClarity: 0.8, quality: 0.6, blockRisk: 0.2, angleQuality: 0.7 }),
    getState: () => state,
    getTeamDensityAtPoint: () => 1,
    isGoalkeeper: () => false,
    isPassReceiverOffside: () => false,
    isPlayerFacingForward: () => true,
    isWideChannel: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    pitch: { length: 105, width: 68 },
    playerRadiusMeters: 0.8,
    possessionRhythmDefaults: { targetActionSeconds: 4 },
    projectPointOnSegmentWithRatio: () => ({ distance: 10, ratio: 0.5 }),
    randomBetween: (min, max) => (min + max) / 2,
    randomSign: () => 1,
    resolveBallActionProfile: () => ({ averageSpeed: 10 }),
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot decision engine exposes moved scoring contracts", () => {
  const engine = createGameSimulatorAutopilotDecisionEngine(createDecisionEngineDeps());

  expect(typeof engine.getAutoPilotFlowContext).toBe("function");
  expect(typeof engine.getAutoPilotCandidatePattern).toBe("function");
  expect(typeof engine.getRecordedStepPattern).toBe("function");
  expect(typeof engine.getAutoPilotRegainContext).toBe("function");
  expect(typeof engine.getAutoPilotFlowAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotPossessionIntentContext).toBe("function");
  expect(typeof engine.getAutoPilotPossessionIntentAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotPossessionLoopAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotCorridorTempoReleaseAdjustment).toBe("function");
  expect(typeof engine.getOpponentBlockReadProfile).toBe("function");
  expect(typeof engine.getAutoPilotOpponentBlockReadAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotCombinationChainContext).toBe("function");
  expect(typeof engine.getAutoPilotCombinationChainAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotPassLaneDenialAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotCounterPressEscapeAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotPrincipleAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotChanceHierarchyAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotAdvantageRetentionContext).toBe("function");
  expect(typeof engine.getAutoPilotAdvantageRetentionAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotLineBreakAdvantageAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotAdvantageLifecycleAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotPressureEscapeContext).toBe("function");
  expect(typeof engine.getAutoPilotPressureEscapeAdjustment).toBe("function");
  expect(typeof engine.buildAutoPilotPressureTrapEscapeCandidate).toBe("function");
  expect(typeof engine.getAutoPilotPatternDiversityAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotRepetitionPenalty).toBe("function");
  expect(typeof engine.isLastStepKickoffResetForTeam).toBe("function");
  expect(typeof engine.getRecentLaneRepeatCount).toBe("function");
  expect(typeof engine.getAutoPilotFlowContext).toBe("function");
  expect(typeof engine.getAutoPilotRegainContext).toBe("function");
  expect(typeof engine.getAutoPilotCandidatePattern).toBe("function");
  expect(typeof engine.getRecordedStepPattern).toBe("function");
  expect(typeof engine.getRecordedStepActorIds).toBe("function");
  expect(typeof engine.getAutoPilotCarryEndProductContext).toBe("function");
  expect(typeof engine.getAutoPilotCarryEndProductAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotSpacingBonus).toBe("function");
  expect(typeof engine.mergeIntentionWeights).toBe("function");
  expect(typeof engine.getAutoPilotIntentionModel).toBe("function");
  expect(typeof engine.getAutoPilotCandidatePrincipleMetrics).toBe("function");
  expect(typeof engine.getAutoPilotLocalSuperiorityProfile).toBe("function");
  expect(typeof engine.getAutoPilotLocalSuperiorityAdjustment).toBe("function");
  expect(typeof engine.getReceiverAvailabilityProfile).toBe("function");
  expect(typeof engine.getAutoPilotReceiverAvailabilityAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotReceivePressureTrapAdjustment).toBe("function");
  expect(typeof engine.estimateAutoPilotCandidateDuration).toBe("function");
  expect(typeof engine.getAutoPilotNextSupportNetworkProfile).toBe("function");
  expect(typeof engine.getAutoPilotNextSupportNetworkAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotVisionScanAdjustment).toBe("function");
  expect(typeof engine.getAutoPilotSpaceLadderContext).toBe("function");
  expect(typeof engine.getAutoPilotSpaceLadderAdjustment).toBe("function");
});

test("game simulator autopilot decision engine reads live state after simulator reset", () => {
  const deps = createDecisionEngineDeps();
  const engine = createGameSimulatorAutopilotDecisionEngine(deps);

  deps.replaceState({
    autoPilotPlay: {},
    ball: { ownerPlayerId: "H9", position: { x: 50, y: 20 } },
    players: [{ id: "H9", team: "home", position: { x: 50, y: 20 }, role: "Striker" }],
    sequence: { steps: [{}, {}, {}, {}] },
  });

  expect(engine.getAutoPilotPossessionStartIndex("home")).toBe(4);
});

test("game simulator autopilot decision engine delegates chance hierarchy with injected shot target", () => {
  const engine = createGameSimulatorAutopilotDecisionEngine(createDecisionEngineDeps());
  const carrier = { id: "H1", team: "home", position: { x: 78, y: 34 }, role: "Striker" };

  const result = engine.getAutoPilotChanceHierarchyAdjustment(
    {
      actionType: "shot",
      target: { x: 105, y: 34 },
      mustShoot: true,
      laneClarity: 0.84,
    },
    carrier,
    { x: 78, y: 34 },
    { shootBias: 0.72 }
  );

  expect(result.score).toBeGreaterThan(0);
  expect(result.labels).toContain("Chance hierarchy: shoot");
});
