export function createGameSimulatorBallResolutionLandingBounce(deps = {}) {
  const {
    angleBetween,
    clamp,
    clampToPitch,
    clearSecurePossession,
    cloneVector,
    configureBallTravelProfile,
    distance,
    getPitchSurfacePreset,
    getWeatherPreset,
    isAerialFlightStyle,
    state,
  } = deps;

  function shouldTriggerLandingBounce(actionType, reachedReceiverControlZone) {
    if (actionType !== "pass" && actionType !== "shot") {
      return false;
    }
    if (state.ball.bounceCount > 0) {
      return false;
    }
    if (reachedReceiverControlZone && state.ball.targetKind === "to-feet") {
      return false;
    }
    if (state.ball.trackDistanceTotal < 14) {
      return false;
    }
    if (isAerialFlightStyle(state.ball.flightStyle)) {
      return true;
    }
    return actionType === "shot" || state.ball.targetKind === "into-space";
  }

  function startLandingBounceSkid(previousPosition) {
    const landingPoint = cloneVector(state.ball.position);
    const incomingAngle =
      distance(previousPosition, landingPoint) > 0.01
        ? angleBetween(previousPosition, landingPoint)
        : angleBetween(state.ball.startPosition, state.ball.target);
    const surfacePreset = getPitchSurfacePreset();
    const weatherPreset = getWeatherPreset();
    const skidFactor = surfacePreset.groundRollFactor * weatherPreset.ballSkidFactor;
    const baseCarry =
      Math.max(state.ball.currentSpeed, state.ball.finalSpeed, 5.2) *
      (0.24 + skidFactor * 0.11);
    const bounceDistance = clamp(
      baseCarry + (isAerialFlightStyle(state.ball.flightStyle) ? 0.85 : 0.35),
      1.3,
      isAerialFlightStyle(state.ball.flightStyle) ? 7.4 : 4.9
    );
    const bounceTarget = clampToPitch({
      x: landingPoint.x + Math.cos(incomingAngle) * bounceDistance,
      y: landingPoint.y + Math.sin(incomingAngle) * bounceDistance,
    });
    const bounceTravelDistance = distance(landingPoint, bounceTarget);
    if (bounceTravelDistance <= 0.25) {
      return false;
    }
    const bounceProfile = {
      key: `${state.ball.profileKey ?? "ball"}-bounce`,
      label: `${state.ball.profileLabel ?? "Ball"} Bounce`,
      source: state.ball.profileMode,
      targetKind: "into-space",
      averageSpeed: clamp(
        Math.max(state.ball.finalSpeed, state.ball.currentSpeed * 0.72) * weatherPreset.ballRollFactor,
        4.8,
        11.5
      ),
      launchMultiplier: isAerialFlightStyle(state.ball.flightStyle) ? 1.14 : 1.08,
      rollFloor: clamp(0.9 * skidFactor, 0.8, 2.2),
      flightStyle: "driven",
      peakHeight: clamp(
        state.ball.height * 0.3 + (isAerialFlightStyle(state.ball.flightStyle) ? 0.34 : 0.16),
        0.12,
        0.52
      ),
      controlHeightThreshold: 0.18,
      landingPhaseStart: 0.4,
      curveAmount: (state.ball.curveAmount ?? 0) * 0.18,
      spinRate: (state.ball.spinRate ?? 0) * 0.66,
    };
    state.ball.position = landingPoint;
    state.ball.startPosition = cloneVector(landingPoint);
    state.ball.target = bounceTarget;
    state.ball.ownerPlayerId = null;
    clearSecurePossession();
    state.ball.bounceCount += 1;
    configureBallTravelProfile(
      state.ball.actionType,
      bounceTravelDistance,
      bounceProfile.averageSpeed,
      bounceProfile
    );
    state.ball.inTransit = true;
    return true;
  }

  return {
    shouldTriggerLandingBounce,
    startLandingBounceSkid,
  };
}
