export function createGameSimulatorCommandTransitOutcomes(deps = {}) {
  const {
    captureSnapshot,
    cloneSnapshot,
    completeLiveActionPlayersBeforeCommit,
    finalizeCurrentActionStep,
    logEvent,
    queueNextSequenceStep,
    scheduleAutoPilotContinuation,
    state,
    ui,
  } = deps;

  function getTransitOutcomeEventLabel(transitOutcome, actionLabel) {
    if (transitOutcome.kind === "block") {
      return `${transitOutcome.player.shortLabel} ${transitOutcome.player.role} blocks the ${actionLabel}.`;
    }
    if (transitOutcome.kind === "interception") {
      return `${transitOutcome.player.shortLabel} ${transitOutcome.player.role} intercepts the ${actionLabel}.`;
    }
    if (transitOutcome.kind === "deflection") {
      return `${transitOutcome.player.shortLabel} ${transitOutcome.player.role} gets a touch on the ${actionLabel}.`;
    }
    return `${transitOutcome.player.shortLabel} ${transitOutcome.player.role} meets the ${actionLabel} early.`;
  }

  function clearTransitBallAction() {
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
  }

  function completeTransitOutcome(transitOutcome, actionType) {
    const actionLabel = actionType === "shot" ? "shot" : "pass";
    state.ball.inTransit = false;
    if (state.sequence.isPlaying) {
      clearTransitBallAction();
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step) {
        const afterSnapshot = cloneSnapshot(captureSnapshot());
        step.afterSnapshot = afterSnapshot;
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      logEvent(getTransitOutcomeEventLabel(transitOutcome, actionLabel));
      queueNextSequenceStep();
      return;
    }
    completeLiveActionPlayersBeforeCommit(state.ball.position);
    clearTransitBallAction();
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(getTransitOutcomeEventLabel(transitOutcome, actionLabel));
    scheduleAutoPilotContinuation(null, actionLabel);
  }

  return {
    getTransitOutcomeEventLabel,
    completeTransitOutcome,
  };
}
