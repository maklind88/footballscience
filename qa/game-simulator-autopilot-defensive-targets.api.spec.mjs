import { expect, test } from "@playwright/test";
import { createGameSimulatorAutopilotDefensiveTargets } from "../src/modules/game-simulator/autopilot-defensive-targets.mjs";

function createDefensiveDeps(overrides = {}) {
  let state = overrides.state || {
    players: [
      { id: "A9", team: "away", position: { x: 64, y: 31 }, role: "Striker" },
      { id: "A6", team: "away", position: { x: 55, y: 35 }, role: "Defensive Midfielder" },
      { id: "A4", team: "away", position: { x: 46, y: 34 }, role: "Centre Back" },
    ],
    ball: { position: { x: 48, y: 30 }, target: { x: 48, y: 30 } },
    sequence: { steps: [] },
  };
  const pitch = { length: 105, width: 68 };
  return {
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    cloneRestartPhase: (restartPhase) => restartPhase ? { ...restartPhase } : null,
    cloneVector: (point) => ({ ...point }),
    computePassLaneClarity: () => 1,
    computeTimeToCoverDistance: () => 1,
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpaceValue: () => ({
      lineBreakCount: 1,
      openTarget: 0.7,
      targetPressure: 0.2,
      targetThreat: { value: 0.5, box: 0.1, centralPocket: 0.2, behindLine: 0.1, cutbackZone: 0.1 },
    }),
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: (point, teamId) => teamId === "home" ? point.x : pitch.length - point.x,
    getAttackingGameSpaceProfile: () => ({ key: "space2", index: 2 }),
    getAutoPilotPossessionRouteStage: () => 1,
    getAutoPilotShotTarget: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getBallTravelProgress: () => 0,
    getCornerKickSpot: () => ({ x: 0, y: 0 }),
    getDefendingDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getDefensiveAutopilotLineKey: (player) => player.id === "A9" ? "forward" : player.id === "A6" ? "midfield" : "back",
    getDefensiveAutopilotProfile: () => ({ phaseKey: "midBlock", pressingIntensity: 0.6, threatResponse: { protectCenter: 0.4 } }),
    getDefensiveLineDistanceFromOwnGoal: () => 20,
    getDefensiveUnitGap: () => 8,
    getDepthX: (teamId, depth) => teamId === "home" ? depth : pitch.length - depth,
    getDistanceFromOwnGoal: (teamId, point) => teamId === "home" ? point.x : pitch.length - point.x,
    getLaneCenterY: () => 34,
    getOffensiveAutopilotProfile: () => ({ phaseKey: "buildUp", styleKey: "balanced" }),
    getOffensiveRoleKey: () => "connector",
    getOpponentGoalCenter: (teamId) => ({ x: teamId === "home" ? 105 : 0, y: 34 }),
    getOpponentPenaltySpot: (teamId) => ({ x: teamId === "home" ? 94 : 11, y: 34 }),
    getOpponentPressureAtPoint: () => 0.2,
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getOwnGoalCenter: (teamId) => ({ x: teamId === "home" ? 0 : 105, y: 34 }),
    getPitchLaneIndex: () => 2,
    getPitchLaneKey: () => "central",
    getPitchThreatProfile: () => ({ value: 0.5, box: 0.1, centralPocket: 0.2, behindLine: 0.1, cutbackZone: 0.1, betweenLines: 0.1 }),
    getPlannedPossessionTeamId: () => "home",
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({ pressure: 0.2 }),
    getPlayerMagnetLabel: (player) => player.id,
    getPlayerPressureLoad: () => 0.2,
    getPossessionRhythmContext: () => ({ steps: 0, duration: 1 }),
    getRecentPossessionSteps: () => [],
    getRecordedStepDuration: () => 1,
    getRecordedStepPattern: () => ({ family: "secure" }),
    getRecordedStepPossessionTeamId: () => "home",
    getSecondBallAnticipationContext: () => null,
    getShotAngleQuality: () => 0.4,
    getShotWindowProfile: () => ({ quality: 0.4 }),
    getSnapshotPlayerMap: () => new Map(),
    getTeamDefenseStyleKey: () => "balanced",
    getTeamDefenseStyleProfile: () => ({ key: "balanced" }),
    getTeamSupportCountAroundPoint: () => 1,
    getWideSideSign: (pointOrPlayer) => {
      const y = Number.isFinite(pointOrPlayer?.y) ? pointOrPlayer.y : pointOrPlayer?.position?.y;
      return y < pitch.width / 2 ? -1 : 1;
    },
    isAerialFlightStyle: () => false,
    isGoalkeeper: (player) => player?.id === "A1",
    isTransitionAttackStyle: () => false,
    isWideChannel: () => false,
    isWidePrincipleZone: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    moveTowards: (from) => from,
    normalize: () => ({ x: 1, y: 0 }),
    pitch,
    playerRadiusMeters: 0.6,
    projectPointOnSegmentWithRatio: () => ({ point: { x: 50, y: 34 }, ratio: 0.5 }),
    teams: { away: { formation: "4-3-3" }, home: { formation: "4-3-3" } },
    uniquePrincipleLabels: (labels = []) => [...new Set(labels.filter(Boolean))],
    vec: (x, y) => ({ x, y }),
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator autopilot defensive targets expose moved defensive helpers", () => {
  const defensive = createGameSimulatorAutopilotDefensiveTargets(createDefensiveDeps());

  expect(typeof defensive.getDefensiveBackLineHandoverContext).toBe("function");
  expect(typeof defensive.applyDefensiveBackLineHandoverTargets).toBe("function");
  expect(typeof defensive.getDefensiveThreatResponse).toBe("function");
  expect(typeof defensive.getDefensivePrioritySpacePoint).toBe("function");
  expect(typeof defensive.pickDefensiveProtectionPlayer).toBe("function");
  expect(typeof defensive.applyDefensivePrioritySpaceProtectionTargets).toBe("function");
  expect(typeof defensive.getDefensiveGoalkeeperTarget).toBe("function");
  expect(typeof defensive.getDefensiveLocalOverloadContext).toBe("function");
  expect(typeof defensive.applyDefensiveLocalOverloadResponseTargets).toBe("function");
  expect(typeof defensive.getDefensivePassLaneDenialContext).toBe("function");
  expect(typeof defensive.getDefensivePassLaneDenialTarget).toBe("function");
  expect(typeof defensive.applyDefensivePassLaneDenialTargets).toBe("function");
  expect(typeof defensive.getDefensivePostRecoveryResponseContext).toBe("function");
  expect(typeof defensive.getDefensivePostRecoveryResponseTarget).toBe("function");
  expect(typeof defensive.getDefensivePostRecoveryOutletOptions).toBe("function");
  expect(typeof defensive.applyDefensivePostRecoveryResponseTargets).toBe("function");
  expect(typeof defensive.getDefensiveCentralAccessGateContext).toBe("function");
  expect(typeof defensive.getDefensiveCentralAccessGateTarget).toBe("function");
  expect(typeof defensive.applyDefensiveCentralAccessGateTargets).toBe("function");
  expect(typeof defensive.getDefensiveChanceDenialContext).toBe("function");
  expect(typeof defensive.getDefensiveChanceDenialTarget).toBe("function");
  expect(typeof defensive.applyDefensiveChanceDenialTargets).toBe("function");
  expect(typeof defensive.getDefensiveBoxDeliveryChainContext).toBe("function");
  expect(typeof defensive.getDefensiveBoxDeliveryChainTarget).toBe("function");
  expect(typeof defensive.applyDefensiveBoxDeliveryChainTargets).toBe("function");
  expect(typeof defensive.getDefensiveLineBreakAdvantageContext).toBe("function");
  expect(typeof defensive.getDefensiveLineBreakAdvantageTarget).toBe("function");
  expect(typeof defensive.applyDefensiveLineBreakAdvantageCollapseTargets).toBe("function");
  expect(typeof defensive.getDefensiveEmergencyCoverContext).toBe("function");
  expect(typeof defensive.getDefensiveEmergencyCoverTarget).toBe("function");
  expect(typeof defensive.applyDefensiveEmergencyCoverTargets).toBe("function");
  expect(typeof defensive.getDefensiveSecondBallAnticipationTarget).toBe("function");
  expect(typeof defensive.applyDefensiveSecondBallAnticipationTargets).toBe("function");
});

test("game simulator autopilot defensive targets read live state through dependency boundary", () => {
  const deps = createDefensiveDeps();
  const defensive = createGameSimulatorAutopilotDefensiveTargets(deps);
  const profile = { phaseKey: "midBlock", pressingIntensity: 0.6, threatResponse: { protectCenter: 0.4 } };

  expect(defensive.chooseDefensiveAutopilotPresser("away", { x: 48, y: 30 }, new Map(), profile)?.id).toBe("A6");

  deps.replaceState({
    players: [{ id: "A8", team: "away", position: { x: 49, y: 31 }, role: "Midfielder" }],
    ball: { position: { x: 48, y: 30 }, target: { x: 48, y: 30 } },
    sequence: { steps: [] },
  });

  expect(defensive.chooseDefensiveAutopilotPresser("away", { x: 48, y: 30 }, new Map(), profile)?.id).toBe("A8");
});
