import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotCandidates } from "../src/modules/game-simulator/autopilot-candidates.mjs";

function createCandidateDeps(overrides = {}) {
  const state = overrides.state || {
    restartPhase: null,
    sequence: { steps: [] },
    ball: { target: { x: 12, y: 34 } },
    players: [
      { id: "H1", team: "home", position: { x: 12, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
      { id: "H2", team: "home", position: { x: 22, y: 22 }, role: "Left Back", shortLabel: "LB" },
      { id: "A1", team: "away", position: { x: 80, y: 34 }, role: "Goalkeeper", shortLabel: "GK" },
    ],
  };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    chooseScoredCandidateWithVariation: (candidates) => candidates[0] ?? null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    computePassLaneClarity: () => 0.9,
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({ value: 0.5, lineBreakCount: 1, openTarget: 0.7, targetPressure: 0.2, targetThreat: { value: 0.5, box: 0.1, centralPocket: 0.2, betweenLines: 0.2, primaryLabel: "space" }, spacePriority: { score: 0.4 } }),
    getActionThreatGain: () => 0.2,
    getAttackDirectionSign: (teamId) => (teamId === "home" ? 1 : -1),
    getAttackingDepth: (point, teamId) => (teamId === "home" ? point.x : 105 - point.x),
    getAutoPilotCarryEndProductContext: () => ({ active: false }),
    getAutoPilotFlowContext: () => ({ carrierJustReceived: false, consecutivePasses: 0 }),
    getAutoPilotRegainContext: () => ({ active: false }),
    getAutoPilotRoleStrength: () => 0.7,
    getBreakawayCarryTarget: () => null,
    getCarryLaneOpenSpaceScore: () => 0.7,
    getCarryRunwayProfile: () => ({ shouldExtend: false, openSpaceScore: 0, forwardGain: 0, runwayScore: 0 }),
    getDepthPoint: (teamId, depth, options = {}) => ({ x: depth, y: options.y ?? 34 }),
    getDepthX: (teamId, depth) => depth,
    getFootUsageScore: () => 0.8,
    getForwardFacingSpaceTwoContext: () => ({ active: false }),
    getForwardProgressionWindow: () => ({ active: false, openLane: 0, urgency: 0 }),
    getGoalMouthTarget: (teamId, y) => ({ x: teamId === "home" ? 105 : 0, y }),
    getNearestOpponentGapInCarryLane: () => 12,
    getOffensiveAutopilotProfile: () => ({ phaseKey: "buildUp", styleLabel: "Balanced", shortSupport: 0.8, routeOneBias: 0.1, directness: 0.4, dribbleBias: 0.5, carryBias: 0.5, lineBreakBias: 0.5, switchBias: 0.4, passBias: 0.5, crossBias: 0.4, overlapBias: 0.4, shootBias: 0.4, tempo: 0.5, progressionUrgency: 0.5, recycleWindow: 0.5, sidewaysTolerance: 1, firstTouchForwardBias: 0.5, runnerPreferences: {} }),
    getOffensiveRoleKey: (player) => (player.id === "H1" ? "gk" : "wideBack"),
    getOpenGrassCarryContext: () => null,
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: 34 }),
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: () => ({ value: 0.4, box: 0.1, halfSpace: 0.2, betweenLines: 0.2, cutbackZone: 0, assistZone: 0, centralPocket: 0.2 }),
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerMagnetLabel: (player) => player.shortLabel || player.id,
    getPlayerPressureLoad: () => 0.2,
    getPlayerTendency: () => 0.5,
    getPossessionRhythmContext: () => ({ duration: 1, steps: 0, sidewaysPasses: 0, backPasses: 0, forwardPasses: 0 }),
    getRecentPossessionSteps: () => [],
    getRunwayCarryTarget: () => null,
    getShotWindowProfile: () => ({ laneClarity: 0.8, goalkeeperOpenness: 0.7, angleQuality: 0.7, blockRisk: 0.2, quality: 0.6 }),
    getState: () => state,
    getWideSideSign: () => 1,
    isGoalkeeper: (player) => player.role === "Goalkeeper",
    isInsideOpponentBox: () => false,
    isLastStepKickoffResetForTeam: () => false,
    isPassReceiverOffside: () => false,
    isWideChannel: () => false,
    kickoffOpeningProfiles: [],
    lerp: (start, end, weight) => start + (end - start) * weight,
    normalize: (from, to) => ({ x: to.x - from.x, y: to.y - from.y }),
    pitch: { length: 105, width: 68 },
    resolveBallActionProfile: () => ({ averageSpeed: 10 }),
    resolveShotTarget: (goal) => goal,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    win: { laneClarity: 0.8, goalkeeperOpenness: 0.7, angleQuality: 0.7, blockRisk: 0.2 },
    ...overrides,
  };
}

test("game simulator autopilot candidates expose moved candidate builders", () => {
  const candidates = createGameSimulatorAutopilotCandidates(createCandidateDeps());

  expect(typeof candidates.buildAutoPilotGoalkeeperDistributionCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotShotCandidate).toBe("function");
  expect(typeof candidates.buildAutoPilotPassCandidates).toBe("function");
  expect(typeof candidates.buildAutoPilotDribbleCandidate).toBe("function");
});

test("game simulator goalkeeper distribution candidate reads current state through dependency boundary", () => {
  const candidates = createGameSimulatorAutopilotCandidates(createCandidateDeps());
  const carrier = { id: "H1", team: "home", position: { x: 12, y: 34 }, role: "Goalkeeper", shortLabel: "GK" };

  const candidate = candidates.buildAutoPilotGoalkeeperDistributionCandidate(carrier, carrier.position, {
    shortSupport: 0.9,
    routeOneBias: 0.1,
    directness: 0.2,
  });

  expect(candidate).toMatchObject({
    actionType: "pass",
    receiverPlayerId: "H2",
    label: "gk build-out",
  });
});
