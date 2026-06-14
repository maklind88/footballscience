import { expect, test } from "@playwright/test";
import { createGameSimulatorCommandTransitOutcomes } from "../src/modules/game-simulator/command-transit-outcomes.mjs";

function createTransitDeps(overrides = {}) {
  const logs = [];
  const continuations = [];
  const state = overrides.state || {
    isRunning: true,
    ball: {
      actionType: "pass",
      initiatorPlayerId: "H8",
      receiverPlayerId: "H9",
      position: { x: 42, y: 34 },
      inTransit: true,
    },
    sequence: {
      isPlaying: false,
      steps: [],
      playbackIndex: 0,
      currentFrameIndex: 0,
      phase: "action",
      actionTargets: [{ x: 50, y: 34 }],
    },
  };
  const deps = {
    captureSnapshot: () => ({ ball: { ...state.ball }, sequencePhase: state.sequence.phase }),
    cloneSnapshot: (snapshot) => JSON.parse(JSON.stringify(snapshot)),
    completeLiveActionPlayersBeforeCommit: (point) => {
      state.liveActionCommitPoint = { ...point };
    },
    finalizeCurrentActionStep: () => {
      state.finalized = true;
    },
    logEvent: (message) => logs.push(message),
    queueNextSequenceStep: () => {
      state.queuedNextSequenceStep = true;
    },
    scheduleAutoPilotContinuation: (delay, actionType) => continuations.push({ delay, actionType }),
    state,
    ui: { playPauseButton: { textContent: "Pause" } },
    ...overrides,
  };
  return { deps, state, logs, continuations };
}

test("game simulator command transit outcomes expose moved contracts", () => {
  const { deps } = createTransitDeps();
  const outcomes = createGameSimulatorCommandTransitOutcomes(deps);

  expect(typeof outcomes.getTransitOutcomeEventLabel).toBe("function");
  expect(typeof outcomes.completeTransitOutcome).toBe("function");
});

test("game simulator command transit outcomes format event labels", () => {
  const { deps } = createTransitDeps();
  const outcomes = createGameSimulatorCommandTransitOutcomes(deps);
  const player = { shortLabel: "A6", role: "DM" };

  expect(outcomes.getTransitOutcomeEventLabel({ kind: "block", player }, "shot")).toBe("A6 DM blocks the shot.");
  expect(outcomes.getTransitOutcomeEventLabel({ kind: "interception", player }, "pass")).toBe("A6 DM intercepts the pass.");
  expect(outcomes.getTransitOutcomeEventLabel({ kind: "deflection", player }, "pass")).toBe("A6 DM gets a touch on the pass.");
  expect(outcomes.getTransitOutcomeEventLabel({ kind: "early", player }, "pass")).toBe("A6 DM meets the pass early.");
});

test("game simulator command transit outcomes complete a live interception", () => {
  const { deps, state, logs, continuations } = createTransitDeps();
  const outcomes = createGameSimulatorCommandTransitOutcomes(deps);

  outcomes.completeTransitOutcome({
    kind: "interception",
    player: { shortLabel: "A6", role: "DM" },
  }, "pass");

  expect(state.ball.inTransit).toBe(false);
  expect(state.ball.actionType).toBeNull();
  expect(state.ball.initiatorPlayerId).toBeNull();
  expect(state.ball.receiverPlayerId).toBeNull();
  expect(state.liveActionCommitPoint).toEqual({ x: 42, y: 34 });
  expect(state.finalized).toBe(true);
  expect(deps.ui.playPauseButton.textContent).toBe("Start");
  expect(logs).toEqual(["A6 DM intercepts the pass."]);
  expect(continuations).toEqual([{ delay: null, actionType: "pass" }]);
});

test("game simulator command transit outcomes complete a sequence block", () => {
  const { deps, state, logs, continuations } = createTransitDeps({
    state: {
      isRunning: true,
      ball: {
        actionType: "shot",
        initiatorPlayerId: "H9",
        receiverPlayerId: null,
        position: { x: 88, y: 34 },
        inTransit: true,
      },
      sequence: {
        isPlaying: true,
        steps: [{}],
        playbackIndex: 0,
        currentFrameIndex: 0,
        phase: "action",
        actionTargets: [{ x: 105, y: 34 }],
      },
    },
  });
  const outcomes = createGameSimulatorCommandTransitOutcomes(deps);

  outcomes.completeTransitOutcome({
    kind: "block",
    player: { shortLabel: "A4", role: "CB" },
  }, "shot");

  expect(state.ball.inTransit).toBe(false);
  expect(state.ball.actionType).toBeNull();
  expect(state.sequence.phase).toBeNull();
  expect(state.sequence.actionTargets).toBeNull();
  expect(state.sequence.steps[0].afterSnapshot).toMatchObject({ sequencePhase: null });
  expect(state.sequence.currentFrameIndex).toBe(0);
  expect(state.queuedNextSequenceStep).toBe(true);
  expect(logs).toEqual(["A4 CB blocks the shot."]);
  expect(continuations).toEqual([]);
});
