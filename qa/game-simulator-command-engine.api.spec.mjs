import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandEngine } from "../src/modules/game-simulator/command-engine.mjs";

function createCommandDeps(overrides = {}) {
  let state = overrides.state || {
    time: 0,
    ball: {
      actionType: "pass",
      ownerPlayerId: "H8",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
      position: { x: 20, y: 34 },
      target: { x: 30, y: 34 },
      startPosition: { x: 20, y: 34 },
      inTransit: true,
      securePossession: { ownerPlayerId: "H8" },
    },
    players: [
      { id: "H8", team: "home", role: "CM", shortLabel: "H8", position: { x: 20, y: 34 }, targetPosition: { x: 20, y: 34 } },
      { id: "H9", team: "home", role: "ST", shortLabel: "H9", position: { x: 30, y: 34 }, targetPosition: { x: 30, y: 34 } },
    ],
    sequence: { steps: [], dirty: false },
    draftStep: null,
    autoPilotContinuation: null,
  };
  return {
    angleBetween: (from, to) => Math.atan2(to.y - from.y, to.x - from.x),
    applyAutopilotsForCurrentAction: () => {},
    applyBallExecutionProfile: () => {},
    applyBestReceiveBodyAngle: () => {},
    applyCommittedSnapshot: () => {},
    applyCornerSetup: () => {},
    applyFreeKickSetup: () => {},
    applyGoalKickSetup: () => {},
    applyKickoffSetup: () => {},
    applyPenaltySetup: () => {},
    applyResolvedBallProfile: () => {},
    applySnapshot: () => {},
    applyThrowInSetup: () => {},
    ballRadiusMeters: 0.11,
    buildMovementPath: () => [],
    canEditScenario: () => true,
    captureSnapshot: () => ({}),
    chooseAutoPilotNextAction: () => null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => point,
    clearAutoPilotReceiveMomentum: () => {},
    clearKeyboardActionGrace: () => {},
    clearSecurePossession: () => { state.ball.securePossession = null; },
    cloneAutoV2DecisionTriggers: (triggers) => triggers ? { ...triggers } : null,
    cloneDefensiveAutopilotIntents: (intents) => intents ? { ...intents } : null,
    cloneGoalEvent: (event) => ({ ...event }),
    cloneOffensiveAutopilotIntents: (intents) => intents ? { ...intents } : null,
    cloneRestartPhase: (phase) => phase ? { ...phase } : null,
    cloneShotPlacement: (placement) => placement ? { ...placement } : null,
    cloneSnapshot: (snapshot) => ({ ...snapshot }),
    cloneVector: (point) => ({ ...point }),
    completeLiveActionPlayersBeforeCommit: () => {},
    computeReachDistance: (_player, _elapsed, target) => Math.hypot(target.x - state.players[0].position.x, target.y - state.players[0].position.y),
    computeTimeToCoverDistance: () => 1,
    configureBallTravelProfile: () => {},
    connectBallToPlayerForNextAction: () => {},
    createCommittedSnapshotFromCurrentState: () => ({}),
    createLooseBallSpill: () => ({ winner: null }),
    defaultKickoffTeamId: "home",
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    executePlannedAction: () => {},
    finishSequencePlayback: () => {},
    formatSpeed: (value) => `${value} m/s`,
    getActionInitiator: () => state.players[0],
    getActionOrigin: (player) => player.position,
    getActionSpeed: () => 10,
    getAttackDirectionSign: (teamId) => teamId === "home" ? 1 : -1,
    getAttackingDepth: () => 50,
    getAutoPilotFlowContext: () => ({}),
    getAutoPilotReceiveMomentum: () => null,
    getBallOwner: () => state.players[0],
    getBallFlightControlFactor: () => 1,
    getBallTravelPoint: () => state.ball.target,
    getDefensiveAutoV2Intent: () => null,
    getDefensiveAutopilotFocusPoint: () => state.ball.target,
    getDribbleCarryPathPoint: () => state.ball.target,
    getFirstTouchModeLabel: (mode) => mode,
    getGoalDirectionSign: () => 1,
    getGoalLineX: () => 105,
    getGoalNetDisplayPoint: () => ({ x: 105, y: 34 }),
    getLiveDefensiveDribblePressTarget: () => state.ball.position,
    getLiveDribbleSpeed: () => 5,
    getMovementPathPoint: () => state.ball.target,
    getOffensiveAutoV2Intent: () => null,
    getOffensiveAutopilotFocusPoint: () => state.ball.position,
    getOffensiveAutopilotProfile: () => ({ phaseKey: "buildUp" }),
    getOffensiveRoleKey: () => "connector",
    getOffsideInfo: () => ({ offside: false }),
    getOpponentGoalCenter: () => ({ x: 105, y: 34 }),
    getOpponentGoalSide: () => 1,
    getOpponentPenaltySpot: () => ({ x: 94, y: 34 }),
    getOpponentPressureAtPoint: () => 0.2,
    getOtherTeamId: (teamId) => teamId === "home" ? "away" : "home",
    getPitchThreatProfile: () => ({ value: 0.3 }),
    getPlannedPossessionTeamId: () => "home",
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) || null,
    getPlayerBallControlPoint: (player) => player.position,
    getPlayerDecisionContext: () => ({ pressure: 0.2, profile: { decisionSpeed: 0.8 } }),
    getPlayerMagnetLabel: (player) => player.role,
    getPlayerPositionForControlPoint: (_player, point) => point,
    getPlayerPressureLoad: () => 0.2,
    getPlayerRoleModel: () => ({ attack: 0.7 }),
    getPlayerTendency: () => 0.5,
    getRecordedStepEndSnapshot: () => null,
    getRequestedActionMode: () => null,
    getSelectedPlayer: () => state.players[0],
    getTeamAttackAngle: (teamId) => teamId === "home" ? 0 : Math.PI,
    getTeamSupportCountAroundPoint: () => 1,
    hasBallAction: () => Boolean(state.ball.actionType),
    isBetweenGoalPosts: () => true,
    isDefensiveAutopilotPlayer: () => false,
    isDefensiveDribblePresser: () => false,
    isGoalkeeper: (player) => player?.role === "GK",
    isInsideOpponentBox: () => false,
    isInsideOwnBox: () => false,
    isWideChannel: (point) => point.y < 16 || point.y > 52,
    isOffensiveAutopilotPlayer: () => false,
    keepSecurePossessionOnlyForOwner: () => {},
    lerp: (start, end, weight) => start + (end - start) * weight,
    logEvent: () => {},
    markSequenceDirty: () => { state.sequence.dirty = true; },
    moveDefensiveAutoV2Player: () => {},
    moveOffensiveAutoV2Player: () => {},
    moveTowards: (from) => from,
    normalize: () => ({ x: 1, y: 0 }),
    pauseLiveSimulation: () => {},
    pitch: { length: 105, width: 68 },
    queueNextSequenceStep: () => {},
    randomBetween: () => 0,
    render: () => {},
    resetPlayerMovementProgress: () => {},
    resolveBallActionProfile: () => ({ averageSpeed: 10 }),
    resolveDribbleDefensiveChallenge: () => false,
    resolveLooseBallClaim: () => ({ player: null }),
    resolvePassTransitInterception: () => null,
    resolveShotBlockCommitment: () => null,
    resolveShotTarget: () => ({ x: 105, y: 34 }),
    rotatePlayerBodyAlongMovement: () => {},
    rotatePlayerBodyToward: () => {},
    rotatePlayerBodyTowardAngle: () => {},
    setDribbleCarryPathForBall: () => {},
    setPiecePhaseProfiles: {},
    setSecurePossessionAfterControlledTouch: () => {},
    setSelectedPlayers: () => {},
    settleBallForNextAction: () => {},
    shouldTriggerLandingBounce: () => false,
    startLandingBounceSkid: () => false,
    startRecordedAction: () => {},
    teams: { home: { formation: "4-3-3" }, away: { formation: "4-3-3" } },
    ui: {},
    updateBallFlightHeight: () => {},
    updateSequenceButtons: () => {},
    win: { setTimeout: () => 1, clearTimeout: () => {} },
    getState: () => state,
    replaceState(nextState) {
      state = nextState;
    },
    ...overrides,
  };
}

test("game simulator command engine exposes moved command and update helpers", () => {
  const engine = createGameSimulatorCommandEngine(createCommandDeps());

  expect(typeof engine.planAutoPilotNextAction).toBe("function");
  expect(typeof engine.chooseAutoPilotLooseBallRecovery).toBe("function");
  expect(typeof engine.issueLooseBallRecoveryCommand).toBe("function");
  expect(typeof engine.applyLooseBallCollectControlTouch).toBe("function");
  expect(typeof engine.issuePassCommand).toBe("function");
  expect(typeof engine.detectShotGoal).toBe("function");
  expect(typeof engine.detectShotOutOfPlay).toBe("function");
  expect(typeof engine.detectTouchlineOutOfPlay).toBe("function");
  expect(typeof engine.resolveGoalkeeperSave).toBe("function");
  expect(typeof engine.completeGoalkeeperSave).toBe("function");
  expect(typeof engine.completeShotGoal).toBe("function");
  expect(typeof engine.completeShotOutOfPlay).toBe("function");
  expect(typeof engine.completeTouchlineOutOfPlay).toBe("function");
  expect(typeof engine.getTransitOutcomeEventLabel).toBe("function");
  expect(typeof engine.completeTransitOutcome).toBe("function");
  expect(typeof engine.completeBallTravelArrival).toBe("function");
  expect(typeof engine.completeDribbleCarry).toBe("function");
  expect(typeof engine.completeLooseBallRecoveryAction).toBe("function");
  expect(typeof engine.getBallStatus).toBe("function");
  expect(typeof engine.getActionTypeLabel).toBe("function");
  expect(typeof engine.describeStep).toBe("function");
  expect(typeof engine.getSequenceStartSnapshot).toBe("function");
  expect(typeof engine.getSequenceFrameSnapshot).toBe("function");
  expect(typeof engine.persistCurrentFrameSnapshot).toBe("function");
  expect(typeof engine.stepSimulation).toBe("function");
  expect(typeof engine.finalizeCurrentActionStep).toBe("function");
});

test("game simulator command engine mutates live state through dependency boundary", () => {
  const deps = createCommandDeps();
  const engine = createGameSimulatorCommandEngine(deps);

  engine.clearBallAction();

  expect(deps.getState().ball.actionType).toBeNull();
  expect(deps.getState().ball.inTransit).toBe(false);
  expect(deps.getState().ball.securePossession).toEqual({ ownerPlayerId: "H8" });
});
