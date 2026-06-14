export function createGameSimulatorAutopilotLiveOffensiveSupport(deps = {}) {
  const {
    angleBetween,
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefensiveAutoV2FrameDt,
    getDepthX,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getRecordedStepDuration,
    normalizeAngle,
    pitch,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    getState,
  } = deps;
  const state = new Proxy(
    {},
    {
      get(_target, property) {
        return getState?.()?.[property];
      },
    }
  );

  function getRecentPossessionSteps(teamId, limit = 5) {
    const steps = state.sequence?.steps ?? [];
    const recent = [];
    for (let index = steps.length - 1; index >= 0 && recent.length < limit; index -= 1) {
      const step = steps[index];
      const ownerId =
        step.beforeSnapshot?.ball?.ownerPlayerId ??
        step.carrierPlayerId ??
        step.initiatorPlayerId ??
        null;
      const owner = getPlayerById(ownerId);
      const receiver = getPlayerById(step.receiverPlayerId);
      if (owner?.team === teamId || receiver?.team === teamId) {
        recent.push(step);
      }
    }
    return recent;
  }

  function getRecordedStepPossessionTeamId(step) {
    const ownerAfter = getPlayerById(step?.afterSnapshot?.ball?.ownerPlayerId);
    if (ownerAfter?.team) {
      return ownerAfter.team;
    }
    const receiver = getPlayerById(step?.receiverPlayerId);
    if (receiver?.team) {
      return receiver.team;
    }
    const carrier = getPlayerById(step?.carrierPlayerId);
    if (carrier?.team) {
      return carrier.team;
    }
    const ownerBefore = getPlayerById(step?.beforeSnapshot?.ball?.ownerPlayerId);
    return ownerBefore?.team ?? null;
  }

  function getPossessionRhythmContext(teamId, limit = 8) {
    const steps = state.sequence?.steps ?? [];
    const context = {
      steps: 0,
      duration: 0,
      sidewaysPasses: 0,
      backPasses: 0,
      forwardPasses: 0,
      lineBreaks: 0,
      lastActionType: null,
      lastStep: null,
    };
    for (let index = steps.length - 1; index >= 0 && context.steps < limit; index -= 1) {
      const step = steps[index];
      const stepTeamId = getRecordedStepPossessionTeamId(step);
      if (!stepTeamId || stepTeamId !== teamId) {
        break;
      }
      const startPoint = step.beforeSnapshot?.ball?.position;
      const target = step.target;
      const forwardGain =
        startPoint && target ? (target.x - startPoint.x) * getAttackDirectionSign(teamId) : 0;
      const lateralMeters = startPoint && target ? Math.abs(target.y - startPoint.y) : 0;
      context.steps += 1;
      context.duration += getRecordedStepDuration(step);
      context.lastActionType = context.lastActionType ?? step.actionType;
      context.lastStep = context.lastStep ?? step;
      if (step.actionType !== "pass") {
        continue;
      }
      if (Math.abs(forwardGain) < 4 && lateralMeters >= 6.5) {
        context.sidewaysPasses += 1;
      }
      if (forwardGain <= -4.5) {
        context.backPasses += 1;
      }
      if (forwardGain >= 6) {
        context.forwardPasses += 1;
      }
      if (forwardGain >= 8.5) {
        context.lineBreaks += 1;
      }
    }
    return context;
  }

  function getLaneForSideSign(sideSign, laneType = "half") {
    if (laneType === "wide") {
      return sideSign < 0 ? "leftWide" : "rightWide";
    }
    return sideSign < 0 ? "leftHalf" : "rightHalf";
  }

  function getWideOverlapPrincipleFit(profile) {
    const formationFit =
      {
        "4-3-3": 1,
        "4-2-3-1": 0.88,
        "3-4-3": 0.84,
        "4-1-4-1": 0.7,
        "3-5-2": 0.62,
        "4-4-2": 0.52,
      }[profile.formation] ?? 0.56;
    const identityFit =
      profile.overlapBias * 0.48 +
      profile.widthDiscipline * 0.24 +
      profile.crossBias * 0.18 +
      profile.switchBias * 0.1;
    return clamp(formationFit * 0.58 + identityFit * 0.72, 0, 1.35);
  }

  function getWideOverlapRunTarget(teamId, anchorPoint, sideSign, profile) {
    const sign = getAttackDirectionSign(teamId);
    const anchorDepth = getAttackingDepth(anchorPoint, teamId);
    const forwardPush = 7.2 + profile.overlapBias * 4.8 + (profile.phaseKey === "finalThird" ? 2.2 : 0);
    const outsideWidth = 4.4 + profile.widthDiscipline * 2.2;
    const targetDepth = clamp(anchorDepth + forwardPush, 42, 96);
    return clampToPitch(
      {
        x: getDepthX(teamId, targetDepth) + sign * 0.4,
        y: clamp(anchorPoint.y + sideSign * outsideWidth, 3.4, pitch.width - 3.4),
      },
      2
    );
  }

  function moveOffensiveAutoV2Player(player, targetPosition, actionMeta, intent, elapsed, focusPoint = null) {
    if (!targetPosition) {
      return;
    }
    const context = getPlayerDecisionContext(player);
    const frameDt = getDefensiveAutoV2FrameDt(player, elapsed);
    const delayedElapsed = elapsed - (intent.startDelay ?? 0);
    const runTime = Math.max(0, delayedElapsed - context.reactionTime * 0.58);
    if (runTime <= 0) {
      if (focusPoint) {
        rotatePlayerBodyToward(player, focusPoint, 0.08);
      }
      return;
    }
    const previousPosition = cloneVector(player.position);
    const remaining = distance(previousPosition, targetPosition);
    if (remaining <= 0.025) {
      player.position = cloneVector(targetPosition);
      player.autoV2Velocity = { x: 0, y: 0 };
      if (focusPoint) {
        rotatePlayerBodyToward(player, focusPoint, 0.28);
      }
      return;
    }
    const currentVelocity = player.autoV2Velocity ?? { x: 0, y: 0 };
    const currentSpeed = Math.hypot(currentVelocity.x, currentVelocity.y);
    const currentAngle = currentSpeed > 0.05 ? Math.atan2(currentVelocity.y, currentVelocity.x) : getPlayerFacingAngle(player);
    const desiredAngle = angleBetween(previousPosition, targetPosition);
    const urgency = clamp(intent.urgency ?? 0.6, 0.34, 1);
    const turnRate =
      (intent.type === "run-behind" || intent.type === "attack-box"
        ? 3.35
        : intent.type === "rest-defense"
          ? 2.05
          : 2.75) *
      (0.72 + context.profile.perception * 0.18 + context.profile.decisionSpeed * 0.18);
    const limitedAngle =
      currentAngle + clamp(normalizeAngle(desiredAngle - currentAngle), -turnRate * frameDt, turnRate * frameDt);
    const maxSpeed =
      context.maxSpeed *
      (intent.type === "run-behind" || intent.type === "attack-box" ? 0.88 : intent.type === "rest-defense" ? 0.52 : 0.68) *
      urgency;
    const acceleration =
      context.acceleration * (intent.type === "run-behind" || intent.type === "counter-movement" ? 0.94 : intent.type === "rest-defense" ? 0.62 : 0.78);
    const brakeDistance = intent.type === "hold-width" || intent.type === "rest-defense" ? 2.4 : 1.65;
    const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * Math.max(0, remaining - brakeDistance * 0.34)));
    const desiredSpeed = clamp(Math.min(maxSpeed, brakingSpeed), 0, maxSpeed);
    const nextSpeed = currentSpeed + clamp(desiredSpeed - currentSpeed, -acceleration * 1.3 * frameDt, acceleration * frameDt);
    const nextVelocity = {
      x: Math.cos(limitedAngle) * nextSpeed,
      y: Math.sin(limitedAngle) * nextSpeed,
    };
    const rawNext = {
      x: previousPosition.x + nextVelocity.x * frameDt,
      y: previousPosition.y + nextVelocity.y * frameDt,
    };
    const nextPosition = clampToPitch(
      distance(rawNext, targetPosition) < Math.max(0.05, nextSpeed * frameDt * 0.7) ? targetPosition : rawNext,
      2
    );
    player.position = nextPosition;
    player.autoV2Velocity = nextVelocity;
    player.movementProgress = distance(getActionOrigin(player), nextPosition);
    if (distance(previousPosition, nextPosition) > 0.004) {
      rotatePlayerBodyAlongMovement(player, previousPosition, nextPosition, intent.type === "run-behind" ? 0.34 : 0.26);
    } else if (focusPoint) {
      rotatePlayerBodyToward(player, focusPoint, 0.14);
    }
  }

  return {
    getRecentPossessionSteps,
    getRecordedStepPossessionTeamId,
    getPossessionRhythmContext,
    getLaneForSideSign,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    moveOffensiveAutoV2Player,
  };
}
