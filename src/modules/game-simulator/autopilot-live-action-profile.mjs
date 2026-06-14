export function createGameSimulatorAutopilotLiveActionProfile(deps = {}) {
  const {
    clamp,
    distance,
    getActionInitiator,
    getPitchSurfacePreset,
    getPlayerDecisionContext,
    getWeatherPreset,
    isAerialFlightStyle,
    lerp,
    materializeBallProfile,
    resolveBallCurveDirection,
    getState,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

  function getActionSpeed() {
    const dribbleDraftSpeed =
      state.draftStep?.actionType === "dribble" ? state.draftStep.speed : null;
    const baseSpeed = state.ball.actionType === "dribble"
      ? dribbleDraftSpeed ?? state.ball.speed ?? state.dribbleSpeed
      : state.ball.speed;
    const initiator = getActionInitiator();
    if (!initiator) {
      return baseSpeed;
    }
    const context = getPlayerDecisionContext(initiator);
    const actionSecurity =
      context.profile.executionUnderPressure * 0.75 +
      context.profile.decisionQuality * 0.25;
    const pressurePenalty =
      context.pressure *
      (state.ball.actionType === "dribble" ? 0.18 : 0.12) *
      (1 - actionSecurity);
    if (state.ball.actionType === "dribble") {
      return baseSpeed;
    }
    const laneBonus = state.ball.actionType === "pass"
      ? 0.92 + state.ball.laneClarity * 0.08
      : 1;
    return baseSpeed * clamp((1 - pressurePenalty) * laneBonus, 0.82, 1.04);
  }

  function configureBallTravelProfile(actionType, distanceValue, averageSpeed, ballProfile = null) {
    if (actionType === "dribble") {
      state.ball.launchSpeed = averageSpeed;
      state.ball.currentSpeed = averageSpeed;
      state.ball.finalSpeed = averageSpeed;
      state.ball.deceleration = 0;
      state.ball.flightStyle = "ground";
      state.ball.peakHeight = 0;
      state.ball.height = 0;
      state.ball.controlHeightThreshold = 0.12;
      state.ball.landingPhaseStart = 0.58;
      state.ball.curveAmount = 0;
      state.ball.curveDirection = 1;
      state.ball.spinRate = 0;
      state.ball.spinAngle = 0;
      state.ball.trackDistanceTotal = Math.max(distanceValue, 0);
      state.ball.trackDistanceCovered = 0;
      return;
    }
    const safeDistance = Math.max(distanceValue, 0.01);
    const safeAverageSpeed = Math.max(averageSpeed, 0.01);
    const surfacePreset = getPitchSurfacePreset();
    const weatherPreset = getWeatherPreset();
    const resolvedProfile =
      ballProfile ??
      materializeBallProfile(
        actionType === "shot" ? "shot" : "firm-feet",
        safeDistance,
        actionType === "shot" ? "goal" : "to-feet",
        state.ball.profileMode ?? state.ballSpeedMode
      );
    const executionBlend = clamp(state.ball.executionQuality, 0.42, 0.98);
    const isGroundLike = !isAerialFlightStyle(resolvedProfile.flightStyle);
    const groundSurfaceRatio = clamp(
      (surfacePreset.groundRollFactor - 0.94) / 0.13,
      0,
      1
    );
    const launchSurfaceFactor = isGroundLike
      ? lerp(0.985, 1.015, groundSurfaceRatio)
      : surfacePreset.airCarryFactor;
    const launchSpeed =
      safeAverageSpeed *
      (resolvedProfile.launchMultiplier + (1 - executionBlend) * (actionType === "shot" ? 0.04 : 0.03)) *
      launchSurfaceFactor;
    const finalFloor = Math.max(
      actionType === "shot" ? 1.8 : 0.45,
      resolvedProfile.rollFloor *
        (isGroundLike ? surfacePreset.groundRollFactor : lerp(0.9, 1.03, groundSurfaceRatio)) *
        weatherPreset.ballRollFactor *
        (0.96 + executionBlend * 0.05)
    );
    const finalSpeed = clamp(
      2 * safeAverageSpeed - launchSpeed,
      finalFloor,
      Math.max(finalFloor, launchSpeed - 0.12)
    );
    const travelDuration = (2 * safeDistance) / Math.max(launchSpeed + finalSpeed, 0.01);
    const deceleration = Math.max((launchSpeed - finalSpeed) / Math.max(travelDuration, 0.01), 0);
    state.ball.launchSpeed = launchSpeed;
    state.ball.currentSpeed = launchSpeed;
    state.ball.finalSpeed = finalSpeed;
    state.ball.deceleration = deceleration;
    state.ball.flightStyle = resolvedProfile.flightStyle ?? "ground";
    state.ball.peakHeight = resolvedProfile.peakHeight ?? 0;
    state.ball.height = 0;
    state.ball.controlHeightThreshold = resolvedProfile.controlHeightThreshold ?? 0.12;
    state.ball.landingPhaseStart = resolvedProfile.landingPhaseStart ?? 0.58;
    state.ball.curveAmount = resolvedProfile.curveAmount ?? 0;
    state.ball.curveDirection = resolveBallCurveDirection(
      state.ball.startPosition,
      state.ball.target,
      getActionInitiator()
    );
    state.ball.spinRate = resolvedProfile.spinRate ?? 0;
    state.ball.spinAngle = 0;
    state.ball.trackDistanceTotal = safeDistance;
    state.ball.trackDistanceCovered = 0;
  }

  function getActionDistance() {
    if (state.ball.actionType !== null || state.ball.inTransit || state.draftStep) {
      return distance(state.ball.startPosition, state.ball.target);
    }
    return 0;
  }

  function getRequestedActionMode() {
    return state.keyboardActionMode ?? state.actionMode;
  }

  return {
    getActionSpeed,
    configureBallTravelProfile,
    getActionDistance,
    getRequestedActionMode,
  };
}
