import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandActionCompletions } from "../src/modules/game-simulator/command-action-completions.mjs";

function createCompletionDeps(overrides = {}) {
  const logs = [];
  const continuations = [];
  const state = overrides.state || {
    isRunning: true,
    ball: {
      actionType: "pass",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
      carrierPlayerId: null,
      position: { x: 30, y: 34 },
      target: { x: 30, y: 34 },
      elapsedTravelTime: 1.1,
      inTransit: true,
      height: 0.4,
    },
    sequence: {
      isPlaying: false,
      steps: [],
      playbackIndex: 0,
      currentFrameIndex: 0,
      phase: "action",
      actionTargets: [{ x: 30, y: 34 }],
    },
  };
  const deps = {
    applyCommittedSnapshot: (snapshot) => {
      state.appliedSnapshot = snapshot;
    },
    applyLooseBallCollectControlTouch: (player, point) => {
      state.looseBallCollectedBy = player.id;
      state.looseBallCollectPoint = { ...point };
    },
    cloneVector: (point) => ({ ...point }),
    completeLiveActionPlayersBeforeCommit: (point) => {
      state.liveActionCommitPoint = { ...point };
    },
    finalizeCurrentActionStep: () => {
      state.finalized = true;
    },
    formatTime: (seconds) => `${seconds.toFixed(1)}s`,
    getPlayerBallControlPoint: (player) => player.position,
    logEvent: (message) => logs.push(message),
    queueNextSequenceStep: () => {
      state.queuedNextSequenceStep = true;
    },
    scheduleAutoPilotContinuation: (delay, actionType) => continuations.push({ delay, actionType }),
    settleBallForNextAction: (actionType) => {
      state.settledActionType = actionType;
    },
    shouldTriggerLandingBounce: () => false,
    startLandingBounceSkid: () => false,
    state,
    ui: { playPauseButton: { textContent: "Pause" } },
    ...overrides,
  };
  return { deps, state, logs, continuations };
}

test("game simulator command action completions expose moved contracts", () => {
  const { deps } = createCompletionDeps();
  const completions = createGameSimulatorCommandActionCompletions(deps);

  expect(typeof completions.completeBallTravelArrival).toBe("function");
  expect(typeof completions.completeDribbleCarry).toBe("function");
  expect(typeof completions.completeLooseBallRecoveryAction).toBe("function");
});

test("game simulator command action completions finish a live pass arrival", () => {
  const { deps, state, logs, continuations } = createCompletionDeps();
  const completions = createGameSimulatorCommandActionCompletions(deps);

  const result = completions.completeBallTravelArrival({
    previousPosition: { x: 25, y: 34 },
    receiverControlPoint: { x: 30, y: 34 },
    reachedReceiverControlZone: true,
    reachedTravelEnd: false,
  });

  expect(result).toEqual({ completed: true, sequence: false });
  expect(state.ball.position).toEqual({ x: 30, y: 34 });
  expect(state.ball.actionType).toBeNull();
  expect(state.ball.receiverPlayerId).toBeNull();
  expect(state.settledActionType).toBe("pass");
  expect(state.finalized).toBe(true);
  expect(deps.ui.playPauseButton.textContent).toBe("Start");
  expect(logs).toEqual(["Pass connects into the next step after 1.1s."]);
  expect(continuations).toEqual([{ delay: null, actionType: "pass" }]);
});

test("game simulator command action completions defer arrival when landing bounce starts", () => {
  const { deps, state, logs, continuations } = createCompletionDeps({
    shouldTriggerLandingBounce: () => true,
    startLandingBounceSkid: () => true,
  });
  const completions = createGameSimulatorCommandActionCompletions(deps);

  const result = completions.completeBallTravelArrival({
    previousPosition: { x: 25, y: 34 },
    receiverControlPoint: { x: 30, y: 34 },
    reachedReceiverControlZone: true,
    reachedTravelEnd: false,
  });

  expect(result).toEqual({ completed: false, deferredByBounce: true });
  expect(state.ball.inTransit).toBe(true);
  expect(state.ball.height).toBe(0);
  expect(logs).toEqual([]);
  expect(continuations).toEqual([]);
});

test("game simulator command action completions finish a sequence dribble", () => {
  const { deps, state, logs, continuations } = createCompletionDeps({
    state: {
      isRunning: true,
      ball: {
        actionType: "dribble",
        initiatorPlayerId: "H7",
        carrierPlayerId: "H7",
        position: { x: 44, y: 30 },
        target: { x: 44, y: 30 },
        elapsedTravelTime: 1.6,
        inTransit: true,
        height: 0,
      },
      sequence: {
        isPlaying: true,
        steps: [{ afterSnapshot: { marker: "after-dribble" } }],
        playbackIndex: 0,
        currentFrameIndex: 0,
        phase: "action",
        actionTargets: [{ x: 44, y: 30 }],
      },
    },
  });
  const completions = createGameSimulatorCommandActionCompletions(deps);

  const result = completions.completeDribbleCarry({ id: "H7", shortLabel: "H7", role: "LW" }, 1.6);

  expect(result).toEqual({ completed: true, sequence: true });
  expect(state.ball.actionType).toBeNull();
  expect(state.sequence.phase).toBeNull();
  expect(state.appliedSnapshot).toEqual({ marker: "after-dribble" });
  expect(state.queuedNextSequenceStep).toBe(true);
  expect(logs).toEqual(["H7 LW finishes the dribble after 1.6s."]);
  expect(continuations).toEqual([]);
});

test("game simulator command action completions finish live loose-ball recovery", () => {
  const { deps, state, logs, continuations } = createCompletionDeps({
    state: {
      isRunning: true,
      ball: {
        actionType: "recovery",
        initiatorPlayerId: null,
        receiverPlayerId: null,
        carrierPlayerId: "H6",
        position: { x: 50, y: 35 },
        target: { x: 50, y: 35 },
        elapsedTravelTime: 0.4,
        inTransit: true,
        height: 0,
      },
      sequence: {
        isPlaying: false,
        steps: [],
        playbackIndex: 0,
        currentFrameIndex: 0,
        phase: "action",
        actionTargets: [{ x: 50, y: 35 }],
      },
    },
  });
  const completions = createGameSimulatorCommandActionCompletions(deps);

  const result = completions.completeLooseBallRecoveryAction({ id: "H6", shortLabel: "H6", role: "DM" });

  expect(result).toEqual({ completed: true, sequence: false });
  expect(state.looseBallCollectedBy).toBe("H6");
  expect(state.ball.inTransit).toBe(false);
  expect(state.ball.actionType).toBeNull();
  expect(state.ball.carrierPlayerId).toBeNull();
  expect(state.finalized).toBe(true);
  expect(deps.ui.playPauseButton.textContent).toBe("Start");
  expect(logs).toEqual(["H6 DM collects the loose ball and can play forward."]);
  expect(continuations).toEqual([{ delay: null, actionType: "recovery" }]);
});
