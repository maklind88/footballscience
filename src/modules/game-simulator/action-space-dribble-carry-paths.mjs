export function createGameSimulatorActionSpaceDribbleCarryPaths(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayProfile,
    getFootUsageScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveAutopilotProfile,
    getOrientationMovementProfile,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    isWideChannel,
    lerp,
    moveTowards,
    normalize,
    pitch,
    state,
  } = deps;

  function getQuadraticPoint(startPoint, controlPoint, endPoint, progress) {
    const inverse = 1 - progress;
    return {
      x:
        inverse * inverse * startPoint.x +
        2 * inverse * progress * controlPoint.x +
        progress * progress * endPoint.x,
      y:
        inverse * inverse * startPoint.y +
        2 * inverse * progress * controlPoint.y +
        progress * progress * endPoint.y,
    };
  }

  function buildSampledCurvePath(startPoint, controlPoint, endPoint, samples = 28) {
    const points = [];
    let previousPoint = cloneVector(startPoint);
    let totalDistance = 0;
    points.push({
      distance: 0,
      point: cloneVector(startPoint),
    });
    for (let index = 1; index <= samples; index += 1) {
      const progress = index / samples;
      const point = getQuadraticPoint(startPoint, controlPoint, endPoint, progress);
      totalDistance += distance(previousPoint, point);
      points.push({
        distance: totalDistance,
        point,
      });
      previousPoint = point;
    }
    return {
      kind: "curve",
      start: cloneVector(startPoint),
      control: cloneVector(controlPoint),
      end: cloneVector(endPoint),
      points,
      totalDistance,
    };
  }

  function getSampledPathPoint(path, traveledDistance) {
    if (!path?.points?.length) {
      return cloneVector(path?.end ?? state.ball.target);
    }
    const clampedDistance = clamp(traveledDistance, 0, path.totalDistance ?? 0);
    for (let index = 1; index < path.points.length; index += 1) {
      const previous = path.points[index - 1];
      const current = path.points[index];
      if (clampedDistance > current.distance) {
        continue;
      }
      const segmentDistance = Math.max(current.distance - previous.distance, 0.001);
      const segmentProgress = (clampedDistance - previous.distance) / segmentDistance;
      return {
        x: lerp(previous.point.x, current.point.x, segmentProgress),
        y: lerp(previous.point.y, current.point.y, segmentProgress),
      };
    }
    return cloneVector(path.points[path.points.length - 1].point);
  }

  function buildDribbleCarryPath(carrier, startPoint, targetPoint) {
    const straightDistance = distance(startPoint, targetPoint);
    if (straightDistance <= 0.01) {
      return {
        kind: "straight",
        start: cloneVector(startPoint),
        end: cloneVector(targetPoint),
        totalDistance: 0,
      };
    }
    const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(carrier.team);
    const lateralGain = Math.abs(targetPoint.y - startPoint.y);
    const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, targetPoint));
    const runwayProfile = getCarryRunwayProfile(
      carrier,
      startPoint,
      targetPoint,
      getOffensiveAutopilotProfile(carrier.team, startPoint)
    );
    const shouldCurve =
      straightDistance >= 8 &&
      forwardGain >= 4 &&
      (runwayProfile.shouldExtend || openSpaceScore >= 0.52 || lateralGain >= 4 || isWideChannel(startPoint));
    if (!shouldCurve) {
      return {
        kind: "straight",
        start: cloneVector(startPoint),
        end: cloneVector(targetPoint),
        totalDistance: straightDistance,
      };
    }
    const direction = normalize(startPoint, targetPoint);
    const lateral = { x: -direction.y, y: direction.x };
    const towardCenterSign = Math.sign(pitch.width / 2 - startPoint.y);
    const bendDirection =
      towardCenterSign !== 0
        ? Math.sign(lateral.y) === towardCenterSign ? 1 : -1
        : carrier.preferredFoot === "left" ? 1 : -1;
    const bendAmount = clamp(
      straightDistance * (
        runwayProfile.shouldExtend
          ? lerp(0.11, 0.24, openSpaceScore)
          : lerp(0.08, 0.18, openSpaceScore)
      ),
      0.75,
      runwayProfile.shouldExtend
        ? isWideChannel(startPoint) ? 7.2 : 4.8
        : isWideChannel(startPoint) ? 5.2 : 3.4
    );
    const controlPoint = clampToPitch({
      x: lerp(startPoint.x, targetPoint.x, runwayProfile.shouldExtend ? 0.5 : 0.46) + lateral.x * bendAmount * bendDirection,
      y: lerp(startPoint.y, targetPoint.y, runwayProfile.shouldExtend ? 0.5 : 0.46) + lateral.y * bendAmount * bendDirection,
    }, 2);
    if (distance(startPoint, controlPoint) <= 0.45 || distance(controlPoint, targetPoint) <= 0.45) {
      return {
        kind: "straight",
        start: cloneVector(startPoint),
        end: cloneVector(targetPoint),
        totalDistance: straightDistance,
      };
    }
    const path = buildSampledCurvePath(startPoint, controlPoint, targetPoint);
    path.runwayKind = runwayProfile.runwayKind;
    path.openSpaceScore = openSpaceScore;
    return path;
  }

  function getDribbleCarryPathPoint(path, traveledDistance) {
    if (!path || path.kind === "straight") {
      return moveTowards(path?.start ?? state.ball.startPosition, path?.end ?? state.ball.target, traveledDistance);
    }
    return getSampledPathPoint(path, traveledDistance);
  }

  function setDribbleCarryPathForBall(carrier, startPoint, targetPoint) {
    const path = buildDribbleCarryPath(carrier, startPoint, targetPoint);
    state.ball.dribblePath = path;
    state.ball.trackDistanceTotal = Math.max(path.totalDistance, distance(startPoint, targetPoint));
    state.ball.trackDistanceCovered = 0;
    return path;
  }

  function getLiveDribbleSpeed(carrier, targetPoint) {
    const context = getPlayerDecisionContext(carrier);
    const orientationProfile = getOrientationMovementProfile(carrier, targetPoint);
    const averageCarrySpeed = state.ball.speed || state.draftStep?.speed || state.dribbleSpeed;
    const totalDistance = Math.max(
      state.ball.trackDistanceTotal || distance(state.ball.startPosition, state.ball.target),
      0.01
    );
    const progress = state.ball.trackDistanceTotal
      ? clamp((state.ball.trackDistanceCovered ?? 0) / totalDistance, 0, 1)
      : clamp(1 - distance(carrier.position, targetPoint) / totalDistance, 0, 1);
    const nearestOpponentGap = getNearestOpponentGapInCarryLane(carrier, targetPoint);
    const openSpaceScore = getCarryLaneOpenSpaceScore(nearestOpponentGap);
    const lanePressureScore = 1 - openSpaceScore;
    const forwardAngle = angleBetween(carrier.position, targetPoint);
    const bodyAngleDelta = angleDifference(getPlayerFacingAngle(carrier), forwardAngle);
    const turnPenalty = clamp(bodyAngleDelta / (Math.PI * 0.8), 0, 1);
    const footCarryScore = getFootUsageScore(carrier, forwardAngle);
    const technicalSecurity =
      context.profile.technicalSecurity * 0.4 +
      context.profile.pressResistance * 0.22 +
      context.profile.composure * 0.2 +
      context.profile.decisionSpeed * 0.18;
    const touchFreedom = clamp(
      0.78 +
        openSpaceScore * 0.16 +
        technicalSecurity * 0.08 -
        context.pressure * 0.14 -
        lanePressureScore * 0.09,
      0.62,
      1.02
    );
    const carryPhaseFactor =
      progress < 0.18
        ? lerp(0.86, 1, progress / 0.18)
        : progress < 0.76
          ? lerp(1, 1.03 + openSpaceScore * 0.03, (progress - 0.18) / 0.58)
          : lerp(1, 0.88, (progress - 0.76) / 0.24);
    const pressurePenalty = clamp(
      1 -
        context.pressure * (0.18 + (1 - context.profile.pressResistance) * 0.14) -
        lanePressureScore * 0.08,
      0.66,
      1
    );
    const turnPenaltyFactor = lerp(1, 0.82, turnPenalty);
    const cap = Math.min(
      context.maxSpeed * lerp(0.48, 0.68, openSpaceScore),
      averageCarrySpeed * lerp(1.02, 1.12, openSpaceScore)
    );
    return clamp(
      averageCarrySpeed *
        orientationProfile.speedMultiplier *
        lerp(0.9, 1.04, footCarryScore) *
        touchFreedom *
        carryPhaseFactor *
        pressurePenalty *
        turnPenaltyFactor,
      1.95,
      Math.max(2.05, cap)
    );
  }

  return {
    getQuadraticPoint,
    buildSampledCurvePath,
    getSampledPathPoint,
    buildDribbleCarryPath,
    getDribbleCarryPathPoint,
    setDribbleCarryPathForBall,
    getLiveDribbleSpeed,
  };
}
