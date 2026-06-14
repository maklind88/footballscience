export function createGameSimulatorCommandActionCompletions(deps = {}) {
  const {
    applyCommittedSnapshot,
    applyLooseBallCollectControlTouch,
    cloneVector,
    completeLiveActionPlayersBeforeCommit,
    finalizeCurrentActionStep,
    formatTime,
    getPlayerBallControlPoint,
    logEvent,
    queueNextSequenceStep,
    scheduleAutoPilotContinuation,
    settleBallForNextAction,
    shouldTriggerLandingBounce,
    startLandingBounceSkid,
    state,
    ui,
  } = deps;

  function completeBallTravelArrival({
    previousPosition,
    receiverControlPoint,
    reachedReceiverControlZone,
    reachedTravelEnd,
  } = {}) {
    const actionType = state.ball.actionType;
    const actionLabel = actionType === "shot" ? "Shot" : actionType === "pass" ? "Pass" : "Ball";
    const completedTravelTime = state.ball.elapsedTravelTime;
    const completedBallPosition = cloneVector(state.ball.position);
    state.ball.position = cloneVector(receiverControlPoint ?? state.ball.target);
    if (reachedTravelEnd && actionType === "shot") {
      state.ball.position = cloneVector(completedBallPosition);
      state.ball.target = cloneVector(completedBallPosition);
    }
    state.ball.height = 0;
    if (shouldTriggerLandingBounce(actionType, reachedReceiverControlZone) && startLandingBounceSkid(previousPosition)) {
      return { completed: false, deferredByBounce: true };
    }
    state.ball.inTransit = false;
    if (state.sequence.isPlaying) {
      state.ball.actionType = null;
      state.ball.initiatorPlayerId = null;
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      logEvent(`${actionLabel} connects into the next step after ${formatTime(state.ball.elapsedTravelTime)}.`);
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      queueNextSequenceStep();
      return { completed: true, sequence: true };
    }
    completeLiveActionPlayersBeforeCommit(state.ball.position);
    settleBallForNextAction(actionType);
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.receiverPlayerId = null;
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(`${actionLabel} connects into the next step after ${formatTime(completedTravelTime)}.`);
    scheduleAutoPilotContinuation(null, actionType);
    return { completed: true, sequence: false };
  }

  function completeDribbleCarry(carrier, completedTravelTime) {
    state.ball.height = 0;
    state.ball.inTransit = false;
    completeLiveActionPlayersBeforeCommit(state.ball.position);
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.carrierPlayerId = null;
    if (state.sequence.isPlaying) {
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      logEvent(
        `${carrier.shortLabel} ${carrier.role} finishes the dribble after ${formatTime(state.ball.elapsedTravelTime)}.`
      );
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      queueNextSequenceStep();
      return { completed: true, sequence: true };
    }
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(
      `${carrier.shortLabel} ${carrier.role} finishes the dribble after ${formatTime(completedTravelTime)}.`
    );
    scheduleAutoPilotContinuation(null, "dribble");
    return { completed: true, sequence: false };
  }

  function completeLooseBallRecoveryAction(carrier) {
    completeLiveActionPlayersBeforeCommit(state.ball.position);
    applyLooseBallCollectControlTouch(carrier, state.ball.position);
    state.ball.inTransit = false;
    state.ball.actionType = null;
    state.ball.initiatorPlayerId = null;
    state.ball.carrierPlayerId = null;
    state.ball.receiverPlayerId = null;
    if (state.sequence.isPlaying) {
      state.sequence.phase = null;
      state.sequence.actionTargets = null;
      logEvent(`${carrier.shortLabel} ${carrier.role} collects the loose ball.`);
      const step = state.sequence.steps[state.sequence.playbackIndex];
      if (step?.afterSnapshot) {
        applyCommittedSnapshot(step.afterSnapshot);
        state.sequence.currentFrameIndex = state.sequence.playbackIndex;
      }
      queueNextSequenceStep();
      return { completed: true, sequence: true };
    }
    finalizeCurrentActionStep();
    state.isRunning = false;
    ui.playPauseButton.textContent = "Start";
    logEvent(`${carrier.shortLabel} ${carrier.role} collects the loose ball and can play forward.`);
    scheduleAutoPilotContinuation(null, "recovery");
    return { completed: true, sequence: false };
  }

  return {
    completeBallTravelArrival,
    completeDribbleCarry,
    completeLooseBallRecoveryAction,
  };
}
