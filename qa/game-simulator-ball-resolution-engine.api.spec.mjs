import { expect, test } from "@playwright/test";
import { createGameSimulatorBallResolutionEngine } from "../src/modules/game-simulator/ball-resolution-engine.mjs";

function createResolutionDeps(overrides = {}) {
  let state = overrides.state || {
    time: 0,
    ball: {
      securePossession: { ownerPlayerId: "H8", reason: "controlled-reception" },
      position: { x: 20, y: 34 },
      target: { x: 20, y: 34 },
      startPosition: { x: 18, y: 34 },
      actionType: "pass",
      ownerPlayerId: "H8",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
      controlRadius: 1.5,
      claimRadius: 3,
      executionQuality: 0.8,
      laneClarity: 0.9,
      firstTouchMode: "kill",
      secondBallContext: null,
    },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, bodyAngle: 0, intelligenceProfile: {} },
      { id: "H9", team: "home", role: "ST", shortLabel: "H9", position: { x: 26, y: 34 }, bodyAngle: 0, intelligenceProfile: {} },
      { id: "A4", team: "away", role: "CB", shortLabel: "A4", position: { x: 29, y: 34 }, bodyAngle: Math.PI, intelligenceProfile: {} },
    ],
    draftStep: null,
    restartPhase: null,
    sequence: { steps: [] },
  };
  const pitch = { length: 105, width: 68 };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    angleDifference: (a, b) => Math.abs(a - b),
    applyCommittedSnapshot: () => {},
    applyControlledFirstTouch: () => "kill",
    blendAngles: (a, b, weightA = 0.5, weightB = 0.5) => ((a * weightA) + (b * weightB)) / (weightA + weightB),
    captureSnapshot: () => ({}),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    clearAutoPilotReceiveMomentum: () => {},
    cloneSnapshot: (snapshot) => ({ ...snapshot }),
    cloneVector: (point) => ({ ...point }),
    completeLiveActionPlayersBeforeCommit: () => {},
    computePassLaneClarity: () => 0.9,
    computeShotLaneClarity: () => 0.8,
    computeTimeToCoverDistance: () => 1,
    configureBallTravelProfile: () => {},
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    finalizeCurrentActionStep: () => {},
    formatTime: (time) => `${time}s`,
    getActionInitiator: () => state.players[0],
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAutoPilotRoleStrength: () => 0.7,
    getBallFlightControlFactor: () => 1,
    getBallTravelProgress: () => 0.5,
    getCoverShadowInfluence: () => 0.8,
    getDefensiveAggressionPreset: () => ({ pressure: 0.5 }),
    getDistanceFromOwnGoal: () => 30,
    getFirstTouchModeLabel: () => "Kill",
    getFootUsageScore: () => 0.8,
    getLiveDribbleSpeed: () => 5,
    getNearestOpponentGap: () => 8,
    getOffensiveRoleKey: () => "connector",
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getOpponentPenaltySpot: () => ({ x: 94, y: 34 }),
    getOrientationMovementProfile: () => ({ receiveModifier: 1, coverModifier: 1 }),
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getOwnGoalCenter: () => ({ x: 0, y: 34 }),
    getPitchSurfacePreset: () => ({ groundRollFactor: 1 }),
    getPitchThreatProfile: () => ({ value: 0.4, centrality: 0.5, box: 0.2, cutbackZone: 0.1, behindLine: 0.1, assistZone: 0.1, depth: 45 }),
    getPlannedPossessionTeamId: () => "home",
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerDecisionContext: () => ({
      pressure: 0.2,
      profile: {
        composure: 0.8,
        decisionQuality: 0.8,
        decisionSpeed: 0.8,
        executionUnderPressure: 0.8,
        perception: 0.8,
        pressResistance: 0.8,
        tacticalDiscipline: 0.8,
        technicalSecurity: 0.8,
      },
    }),
    getPlayerFacingAngle: () => 0,
    getPlayerMagnetLabel: (player) => player.role,
    getPlayerPositionForControlPoint: (_player, point) => point,
    getPlayerPressureLoad: () => 0.2,
    getReceiveFootUsageScore: () => 0.8,
    getReceiveOrientationScore: () => 0.8,
    getShotWindowProfile: () => ({ angleQuality: 0.7, goalkeeperOpenness: 0.6, blockRisk: 0.1 }),
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getTeamAttackStyleKey: () => "balanced",
    getWeatherPreset: () => ({ ballSkidFactor: 1, ballRollFactor: 1 }),
    isAerialFlightStyle: () => false,
    isGoalkeeper: (player) => player?.role === "GK",
    isInsideOpponentBox: () => false,
    isInsideOwnBox: () => false,
    isTransitionAttackStyle: () => false,
    lerp: (start, end, weight) => start + (end - start) * weight,
    logEvent: () => {},
    normalize: (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    },
    normalizeAngle: (angle) => angle,
    pitch,
    placePlayerWithControlPoint: () => {},
    playerRadiusMeters: 0.6,
    projectPointOnSegment: (_point, start) => start,
    projectPointOnSegmentWithRatio: (_point, start) => ({ point: start, ratio: 0.5 }),
    queueNextSequenceStep: () => {},
    rotatePlayerBodyToward: () => {},
    scheduleAutoPilotContinuation: () => {},
    setPiecePhaseProfiles: {},
    shouldUseAutoPilotActiveFirstTouch: () => false,
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ui: {},
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator ball resolution engine exposes moved possession and contest helpers", () => {
  const engine = createGameSimulatorBallResolutionEngine(createResolutionDeps());

  expect(typeof engine.applyBallExecutionProfile).toBe("function");
  expect(typeof engine.getAerialPresence).toBe("function");
  expect(typeof engine.getAerialFirstContactContext).toBe("function");
  expect(typeof engine.getAerialControlScore).toBe("function");
  expect(typeof engine.getShotReboundClaimContext).toBe("function");
  expect(typeof engine.getShotReboundClaimAdjustment).toBe("function");
  expect(typeof engine.getLooseBallClaimScore).toBe("function");
  expect(typeof engine.getBallContestControlScore).toBe("function");
  expect(typeof engine.getBallDuelScore).toBe("function");
  expect(typeof engine.getDribbleTackleCandidate).toBe("function");
  expect(typeof engine.resolveDribbleDefensiveChallenge).toBe("function");
  expect(typeof engine.resolveLooseBallClaim).toBe("function");
  expect(typeof engine.createLooseBallSpill).toBe("function");
  expect(typeof engine.keepBallPlayableForNextAction).toBe("function");
  expect(typeof engine.resolvePassTransitInterception).toBe("function");
  expect(typeof engine.shouldTriggerLandingBounce).toBe("function");
  expect(typeof engine.startLandingBounceSkid).toBe("function");
  expect(typeof engine.settleBallForNextAction).toBe("function");
});

test("game simulator ball resolution engine mutates live state through dependency boundary", () => {
  const deps = createResolutionDeps();
  const engine = createGameSimulatorBallResolutionEngine(deps);

  engine.clearSecurePossession();
  expect(deps.getState().ball.securePossession).toBeNull();

  deps.replaceState({
    ...deps.getState(),
    ball: { ...deps.getState().ball, securePossession: { ownerPlayerId: "H9", reason: "tackle" } },
  });
  engine.keepSecurePossessionOnlyForOwner("H8");
  expect(deps.getState().ball.securePossession).toBeNull();
});
