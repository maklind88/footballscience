export function createGameSimulatorAutopilotLiveMovementPlanning(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth = (point, teamId) => {
      const x = point?.x ?? 0;
      return teamId === "home" ? x : (pitch?.length ?? 105) - x;
    },
    getAttackingGameSpaceProfile,
    getCurrentActionDuration,
    getOrientationMovementProfile,
    getOrientationTurnDelay,
    getOwnGoalCenter = (teamId) => ({
      x: teamId === "home" ? 0 : pitch.length,
      y: pitch.width / 2,
    }),
    getPitchThreatProfile,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getProjectedActionDuration,
    getOffensiveRoleKey,
    hasBallAction,
    isGoalkeeper,
    isOffensiveAutopilotPlayer,
    lerp,
    moveTowards,
    normalize,
    pitch,
    teams,
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

  function computeReachDistance(player, actionDuration, targetPoint = state.ball.target) {
    const context = getPlayerDecisionContext(player);
    const orientationProfile = getOrientationMovementProfile(player, targetPoint);
    const intendedDistance = targetPoint
      ? distance(getActionOrigin(player), targetPoint)
      : 0;
    const shortBurstRatio = clamp(
      1 - intendedDistance / Math.max(context.sprintProfile.burstDistance, 0.01),
      0,
      1
    );
    const runTime = Math.max(0, actionDuration - context.reactionTime - getOrientationTurnDelay(player, targetPoint));
    if (runTime <= 0) {
      return 0;
    }
    const effectiveAcceleration = Math.max(
      context.acceleration *
        orientationProfile.accelerationMultiplier *
        (1 + context.sprintProfile.shortBurstBoost * shortBurstRatio),
      0.01
    );
    const effectiveMaxSpeed = Math.max(context.maxSpeed * orientationProfile.speedMultiplier, 0.01);
    const timeToTopSpeed = effectiveMaxSpeed / effectiveAcceleration;
    if (runTime <= timeToTopSpeed) {
      return 0.5 * effectiveAcceleration * runTime * runTime;
    }
    const accelerationDistance = 0.5 * effectiveAcceleration * timeToTopSpeed * timeToTopSpeed;
    const sprintTime = runTime - timeToTopSpeed;
    return accelerationDistance + effectiveMaxSpeed * sprintTime;
  }

  function computeTimeToCoverDistance(player, targetDistance, targetPoint = state.ball.target) {
    if (targetDistance <= 0) {
      return 0;
    }
    const context = getPlayerDecisionContext(player);
    const orientationProfile = getOrientationMovementProfile(player, targetPoint);
    const intendedDistance = targetPoint
      ? distance(getActionOrigin(player), targetPoint)
      : targetDistance;
    const shortBurstRatio = clamp(
      1 - intendedDistance / Math.max(context.sprintProfile.burstDistance, 0.01),
      0,
      1
    );
    const acceleration = Math.max(
      context.acceleration *
        orientationProfile.accelerationMultiplier *
        (1 + context.sprintProfile.shortBurstBoost * shortBurstRatio),
      0.01
    );
    const maxSpeed = Math.max(context.maxSpeed * orientationProfile.speedMultiplier, 0.01);
    const timeToTopSpeed = maxSpeed / acceleration;
    const accelerationDistance = 0.5 * acceleration * timeToTopSpeed * timeToTopSpeed;
    if (targetDistance <= accelerationDistance) {
      return context.reactionTime + getOrientationTurnDelay(player, targetPoint) + Math.sqrt((2 * targetDistance) / acceleration);
    }
    return (
      context.reactionTime +
      getOrientationTurnDelay(player, targetPoint) +
      timeToTopSpeed +
      (targetDistance - accelerationDistance) / maxSpeed
    );
  }

  function shouldUseCurvedRecoveryRun(player, startPoint, endPoint) {
    const straightDistance = distance(startPoint, endPoint);
    if (straightDistance < 5.5) {
      return false;
    }
    const label = getPlayerMagnetLabel(player);
    const towardOwnGoal =
      distance(endPoint, getOwnGoalCenter(player.team)) <
      distance(startPoint, getOwnGoalCenter(player.team)) - 1.1;
    const towardInside =
      Math.abs(endPoint.y - pitch.width / 2) <
      Math.abs(startPoint.y - pitch.width / 2) - 1.2;
    return towardOwnGoal || towardInside || ["CB", "LB", "RB", "WB", "6", "8", "10"].includes(label);
  }

  function getCurvedRecoveryWaypoint(player, startPoint, endPoint) {
    if (!shouldUseCurvedRecoveryRun(player, startPoint, endPoint)) {
      return null;
    }
    const straightDistance = distance(startPoint, endPoint);
    const distanceRatio = clamp(straightDistance / 18, 0, 1);
    const ownGoalDirection = player.team === "home" ? -1 : 1;
    const towardCenterSign = Math.sign(pitch.width / 2 - startPoint.y) || 1;
    const xBias = ownGoalDirection * lerp(0.45, 2.2, distanceRatio);
    const yBias = towardCenterSign * lerp(0.3, 1.9, distanceRatio);
    const waypoint = clampToPitch({
      x: lerp(startPoint.x, endPoint.x, 0.34) + xBias,
      y: lerp(startPoint.y, endPoint.y, 0.34) + yBias,
    }, 0.2);
    if (distance(startPoint, waypoint) <= 0.55 || distance(waypoint, endPoint) <= 0.55) {
      return null;
    }
    return waypoint;
  }

  function shouldUseOffBallCounterMovementRun(player, startPoint, endPoint, actionMeta = null) {
    if (!player || !startPoint || !endPoint || !actionMeta || isGoalkeeper(player)) {
      return false;
    }
    if (!isOffensiveAutopilotPlayer(player, actionMeta)) {
      return false;
    }
    if (
      player.id === actionMeta.carrierPlayerId ||
      player.id === actionMeta.receiverPlayerId ||
      player.id === actionMeta.beforeSnapshot?.ball?.ownerPlayerId
    ) {
      return false;
    }
    const straightDistance = distance(startPoint, endPoint);
    if (straightDistance < 5.75) {
      return false;
    }
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    if (!["wideForward", "striker", "secondStriker", "connector", "wideBack"].includes(roleKey)) {
      return false;
    }
    const targetDepth = getAttackingDepth(endPoint, player.team);
    const targetThreat = getPitchThreatProfile(endPoint, player.team);
    const gameSpace = getAttackingGameSpaceProfile(endPoint, player.team);
    const principleText = [
      actionMeta.label,
      actionMeta.autoReason,
      actionMeta.offensiveAutopilot?.principleKey,
      actionMeta.offensiveAutopilot?.principleLabel,
      ...(actionMeta.autoPrinciples ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    const isRunPrinciple =
      principleText.includes("blindside") ||
      principleText.includes("overlap") ||
      principleText.includes("underlap") ||
      principleText.includes("box") ||
      principleText.includes("third-man") ||
      principleText.includes("channel") ||
      principleText.includes("run");
    const isHighValueRun =
      targetDepth >= 58 &&
      (
        gameSpace.key === "space2" ||
        gameSpace.key === "space3" ||
        targetThreat.box >= 0.18 ||
        targetThreat.behindLine >= 0.22 ||
        targetThreat.cutbackZone >= 0.22 ||
        targetThreat.assistZone >= 0.3
      );
    return isRunPrinciple || isHighValueRun;
  }

  function getOffBallCounterMovementWaypoint(player, startPoint, endPoint, actionMeta = null) {
    if (!shouldUseOffBallCounterMovementRun(player, startPoint, endPoint, actionMeta)) {
      return null;
    }
    const straightDistance = distance(startPoint, endPoint);
    const direction = normalize(startPoint, endPoint);
    const lateral = { x: -direction.y, y: direction.x };
    const attackSign = getAttackDirectionSign(player.team);
    const targetThreat = getPitchThreatProfile(endPoint, player.team);
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    const depthDip = clamp(straightDistance * 0.11, 0.75, targetThreat.box >= 0.2 ? 2.25 : 1.65);
    const lateralDip = clamp(straightDistance * 0.08, 0.55, roleKey === "wideBack" ? 2.2 : 1.55);
    const finalLaneSign =
      Math.sign(endPoint.y - startPoint.y) ||
      Math.sign(endPoint.y - pitch.width / 2) ||
      1;
    const lateralDirection = Math.sign(lateral.y) === -finalLaneSign ? 1 : -1;
    const waypoint = clampToPitch({
      x: startPoint.x - attackSign * depthDip + lateral.x * lateralDip * lateralDirection,
      y: startPoint.y + lateral.y * lateralDip * lateralDirection,
    }, 2.2);
    if (
      distance(startPoint, waypoint) <= 0.45 ||
      distance(waypoint, endPoint) <= 0.75 ||
      distance(startPoint, waypoint) > Math.max(straightDistance * 0.38, 3.4)
    ) {
      return null;
    }
    return waypoint;
  }

  function buildMovementPath(player, startPoint, endPoint, actionMeta = null) {
    const waypoint =
      getOffBallCounterMovementWaypoint(player, startPoint, endPoint, actionMeta) ??
      getCurvedRecoveryWaypoint(player, startPoint, endPoint);
    if (!waypoint) {
      const straightDistance = distance(startPoint, endPoint);
      return {
        start: startPoint,
        end: endPoint,
        waypoint: null,
        totalDistance: straightDistance,
      };
    }
    return {
      start: startPoint,
      end: endPoint,
      waypoint,
      segmentOneDistance: distance(startPoint, waypoint),
      segmentTwoDistance: distance(waypoint, endPoint),
      totalDistance: distance(startPoint, waypoint) + distance(waypoint, endPoint),
    };
  }

  function getMovementPathPoint(path, traveledDistance) {
    if (!path.waypoint) {
      return moveTowards(path.start, path.end, traveledDistance);
    }
    if (traveledDistance <= path.segmentOneDistance) {
      return moveTowards(path.start, path.waypoint, traveledDistance);
    }
    return moveTowards(
      path.waypoint,
      path.end,
      traveledDistance - path.segmentOneDistance
    );
  }

  function getSnapshotPlayerMap(snapshot) {
    return new Map(
      (snapshot?.players ?? []).map((player) => [player.id, cloneVector(player.position)])
    );
  }

  function getRecordedStepEndSnapshot(step) {
    return step.afterSnapshot ?? step.beforeSnapshot;
  }

  function getRecordedStepDuration(step) {
    const startPoint = step.beforeSnapshot?.ball?.position ?? state.ball.position;
    return distance(startPoint, step.target) / Math.max(step.speed, 0.01);
  }

  function snapshotsMatch(a, b, tolerance = 0.08) {
    if (!a || !b) {
      return false;
    }
    if (
      (a.formations?.home ?? teams.home.formation) !==
        (b.formations?.home ?? teams.home.formation) ||
      (a.formations?.away ?? teams.away.formation) !==
        (b.formations?.away ?? teams.away.formation)
    ) {
      return false;
    }
    if (
      (a.teamIdentities?.home?.attackStyle ?? teams.home.identity.attackStyle) !==
        (b.teamIdentities?.home?.attackStyle ?? teams.home.identity.attackStyle) ||
      (a.teamIdentities?.home?.defenseStyle ?? teams.home.identity.defenseStyle) !==
        (b.teamIdentities?.home?.defenseStyle ?? teams.home.identity.defenseStyle) ||
      (a.teamIdentities?.away?.attackStyle ?? teams.away.identity.attackStyle) !==
        (b.teamIdentities?.away?.attackStyle ?? teams.away.identity.attackStyle) ||
      (a.teamIdentities?.away?.defenseStyle ?? teams.away.identity.defenseStyle) !==
        (b.teamIdentities?.away?.defenseStyle ?? teams.away.identity.defenseStyle)
    ) {
      return false;
    }
    if ((a.physicalProfile ?? state.physicalProfile) !== (b.physicalProfile ?? state.physicalProfile)) {
      return false;
    }
    if (distance(a.ball.position, b.ball.position) > tolerance) {
      return false;
    }
    if ((a.ball.ownerPlayerId ?? null) !== (b.ball.ownerPlayerId ?? null)) {
      return false;
    }
    const bPlayers = getSnapshotPlayerMap(b);
    return a.players.every((player) => {
      const targetPosition = bPlayers.get(player.id);
      return targetPosition ? distance(player.position, targetPosition) <= tolerance : false;
    });
  }

  function createTransitionPlan(startSnapshot, targetSnapshot) {
    const startPositions = getSnapshotPlayerMap(startSnapshot);
    const targetPositions = getSnapshotPlayerMap(targetSnapshot);
    const playerTargets = new Map();
    let duration = 0;
    state.players.forEach((player) => {
      const start = startPositions.get(player.id) ?? cloneVector(player.position);
      const end = targetPositions.get(player.id) ?? cloneVector(start);
      playerTargets.set(player.id, {
        start,
        end,
      });
      duration = Math.max(
        duration,
        computeTimeToCoverDistance(player, distance(start, end), end)
      );
    });
    const ballStart = cloneVector(startSnapshot.ball.position);
    const ballEnd = cloneVector(targetSnapshot.ball.position);
    const hasFreeBall = !targetSnapshot.ball.ownerPlayerId;
    if (hasFreeBall) {
      duration = Math.max(duration, distance(ballStart, ballEnd) / Math.max(state.ball.speed, 12));
    }
    return {
      startSnapshot,
      targetSnapshot,
      duration,
      elapsed: 0,
      playerTargets,
      ballStart,
      ballEnd,
      ballOwnerPlayerId: targetSnapshot.ball.ownerPlayerId ?? null,
    };
  }

  function clampToCircle(point, center, radius) {
    if (!Number.isFinite(radius) || radius <= 0) {
      return cloneVector(center);
    }
    const gap = distance(center, point);
    if (gap <= radius) {
      return point;
    }
    return moveTowards(center, point, radius);
  }

  function getEditableRadius(player) {
    if (!hasBallAction()) {
      return Infinity;
    }
    if (state.ball.elapsedTravelTime > 0) {
      return computeReachDistance(player, getCurrentActionDuration());
    }
    return computeReachDistance(player, getProjectedActionDuration());
  }

  return {
    computeReachDistance,
    computeTimeToCoverDistance,
    shouldUseCurvedRecoveryRun,
    getCurvedRecoveryWaypoint,
    shouldUseOffBallCounterMovementRun,
    getOffBallCounterMovementWaypoint,
    buildMovementPath,
    getMovementPathPoint,
    getSnapshotPlayerMap,
    getRecordedStepEndSnapshot,
    getRecordedStepDuration,
    snapshotsMatch,
    createTransitionPlan,
    clampToCircle,
    getEditableRadius,
  };
}
