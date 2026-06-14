import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandShotOutcomes } from "../src/modules/game-simulator/command-shot-outcomes.mjs";

function createShotOutcomeDeps(overrides = {}) {
  const logs = [];
  const continuations = [];
  const pitch = { length: 105, width: 68 };
  const state = overrides.state || {
    isRunning: true,
    goalFlash: null,
    ball: {
      actionType: "shot",
      ownerPlayerId: "H9",
      initiatorPlayerId: "H9",
      receiverPlayerId: null,
      position: { x: 104, y: 34 },
      target: { x: 105, y: 34 },
      startPosition: { x: 95, y: 34 },
      currentSpeed: 12,
      executionQuality: 0.82,
      elapsedTravelTime: 0.9,
      inTransit: true,
      height: 0.2,
      securePossession: { ownerPlayerId: "H9" },
    },
    players: [
      { id: "H9", team: "home", role: "ST", shortLabel: "H9", position: { x: 96, y: 34 } },
      { id: "A1", team: "away", role: "GK", shortLabel: "A1", position: { x: 104.1, y: 34 } },
      { id: "A5", team: "away", role: "CB", shortLabel: "A5", position: { x: 101, y: 36 } },
    ],
    sequence: { isPlaying: false, steps: [], playbackIndex: 0, currentFrameIndex: 0 },
    draftStep: {},
  };
  const deps = {
    applyCommittedSnapshot: () => {},
    captureSnapshot: () => ({ ball: { ...state.ball } }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToPitch: (point) => ({
      x: Math.max(0, Math.min(pitch.length, point.x)),
      y: Math.max(0, Math.min(pitch.width, point.y)),
    }),
    clearSecurePossession: () => {
      state.ball.securePossession = null;
    },
    cloneGoalEvent: (event) => ({ ...event, point: { ...event.point }, displayPoint: event.displayPoint ? { ...event.displayPoint } : null }),
    cloneSnapshot: (snapshot) => JSON.parse(JSON.stringify(snapshot)),
    cloneVector: (point) => ({ ...point }),
    completeLiveActionPlayersBeforeCommit: () => {
      state.liveActionCommitted = true;
    },
    computeTimeToCoverDistance: () => 0.05,
    connectBallToPlayerForNextAction: (player, point) => {
      state.ball.ownerPlayerId = player.id;
      state.ball.position = { ...point };
      state.ball.target = { ...point };
    },
    createLooseBallSpill: (savePoint, angle, distanceMeters, preferredPlayerId, bias, meta) => ({
      spillPoint: { x: savePoint.x - 3, y: savePoint.y + 4 },
      winner: preferredPlayerId ? { id: preferredPlayerId } : null,
      angle,
      distanceMeters,
      bias,
      meta,
    }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    finalizeCurrentActionStep: () => {
      state.finalized = true;
    },
    formatTime: (seconds) => `${seconds.toFixed(1)}s`,
    getGoalDirectionSign: (side) => (side === "left" ? -1 : 1),
    getOpponentPenaltySpot: () => ({ x: 94, y: 34 }),
    getPlayerDecisionContext: () => ({
      maxSpeed: 8.4,
      profile: {
        perception: 0.95,
        decisionSpeed: 0.94,
        decisionQuality: 0.92,
        composure: 0.95,
        technicalSecurity: 0.9,
        tacticalDiscipline: 0.9,
      },
    }),
    getPlayerMagnetLabel: (player) => player.role,
    isGoalkeeper: (player) => player?.role === "GK",
    isInsideOwnBox: () => true,
    lerp: (start, end, weight) => start + (end - start) * weight,
    logEvent: (message) => logs.push(message),
    pitch,
    queueNextSequenceStep: () => {
      state.queuedNextSequenceStep = true;
    },
    rotatePlayerBodyToward: (player, point) => {
      player.bodyTarget = { ...point };
    },
    scheduleAutoPilotContinuation: (delay, actionType) => continuations.push({ delay, actionType }),
    setPiecePhaseProfiles: {
      corner: { label: "Corner" },
      goalKick: { label: "Goal kick" },
      throwIn: { label: "Throw-in" },
    },
    state,
    teams: {
      home: { name: "Home" },
      away: { name: "Away" },
    },
    ui: { playPauseButton: { textContent: "Pause" } },
    ...overrides,
  };
  return { deps, state, logs, continuations };
}

test("game simulator command shot outcomes expose moved contracts", () => {
  const { deps } = createShotOutcomeDeps();
  const outcomes = createGameSimulatorCommandShotOutcomes(deps);

  expect(typeof outcomes.getGoalkeeperForTeam).toBe("function");
  expect(typeof outcomes.resolveGoalkeeperSave).toBe("function");
  expect(typeof outcomes.completeGoalkeeperSave).toBe("function");
  expect(typeof outcomes.completeShotGoal).toBe("function");
  expect(typeof outcomes.completeShotOutOfPlay).toBe("function");
  expect(typeof outcomes.completeTouchlineOutOfPlay).toBe("function");
});

test("game simulator command shot outcomes resolve a goalkeeper catch", () => {
  const { deps, state } = createShotOutcomeDeps();
  const outcomes = createGameSimulatorCommandShotOutcomes(deps);

  const save = outcomes.resolveGoalkeeperSave({
    scoringTeamId: "home",
    concedingTeamId: "away",
    side: "right",
    point: { x: 105, y: 34 },
  }, { x: 103, y: 34 });

  expect(save).toMatchObject({ kind: "catch", goalkeeper: { id: "A1" } });
  expect(state.ball.ownerPlayerId).toBe("A1");
  expect(state.ball.securePossession).toBeNull();
});

test("game simulator command shot outcomes complete a live goal", () => {
  const { deps, state, logs, continuations } = createShotOutcomeDeps();
  const outcomes = createGameSimulatorCommandShotOutcomes(deps);

  outcomes.completeShotGoal({
    scoringTeamId: "home",
    concedingTeamId: "away",
    point: { x: 105, y: 34 },
    displayPoint: { x: 107.6, y: 34 },
  }, 1.2);

  expect(state.draftStep.goal).toMatchObject({ scoringTeamId: "home", concedingTeamId: "away" });
  expect(state.goalFlash).toMatchObject({ scoringTeamId: "home", scoringTeamName: "Home" });
  expect(state.ball.actionType).toBeNull();
  expect(state.finalized).toBe(true);
  expect(deps.ui.playPauseButton.textContent).toBe("Start");
  expect(logs.some((message) => message.includes("GOAL: Home scores after 1.2s"))).toBe(true);
  expect(continuations).toEqual([{ delay: null, actionType: "shot" }]);
});

test("game simulator command shot outcomes complete a throw-in restart", () => {
  const { deps, state, logs, continuations } = createShotOutcomeDeps();
  const outcomes = createGameSimulatorCommandShotOutcomes(deps);
  state.ball.actionType = "pass";

  outcomes.completeTouchlineOutOfPlay({
    type: "throwIn",
    restartTeamId: "away",
    point: { x: 40, y: 68 },
    displayPoint: { x: 40, y: 68.45 },
    sideY: 68,
  }, 0.8);

  expect(state.draftStep.nextRestartPhase).toMatchObject({
    type: "throwIn",
    teamId: "away",
    label: "Throw-in",
    point: { x: 40, y: 68 },
    sideY: 68,
  });
  expect(state.ball.position).toEqual({ x: 40, y: 68.45 });
  expect(logs.some((message) => message.includes("Pass goes out after 0.8s"))).toBe(true);
  expect(continuations).toEqual([{ delay: null, actionType: "throwIn" }]);
});
