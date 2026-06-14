export function createGameSimulatorAutopilotLiveDefensiveAutoV2(deps = {}) {
  const {
    angleBetween,
    clamp,
    clampToPitch,
    clampToCircle,
    cloneVector,
    distance,
    getActionOrigin,
    getDefendingDirectionSign,
    getDefensiveAutopilotGroupsForTeam,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveDribblePressTarget,
    getDefensiveLineCenterY,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensivePhaseKey,
    getDefensiveUnitGap,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getEditableRadius,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    normalizeAngle,
    pitch,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    teams,
    uniquePrincipleLabels,
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

  function getDefensiveAutopilotFocusPoint(actionMeta, fallbackPoint = state.ball.target) {
    if (!actionMeta?.defensiveAutopilot?.teamId) {
      return null;
    }
    return actionMeta.defensiveAutopilot.ballFocusPoint
    ? cloneVector(actionMeta.defensiveAutopilot.ballFocusPoint)
    : cloneVector(fallbackPoint ?? actionMeta.target ?? state.ball.target);
  }
  function isDefensiveAutopilotPlayer(player, actionMeta) {
    return (
    !!player &&
    !!actionMeta?.defensiveAutopilot?.teamId &&
    player.team === actionMeta.defensiveAutopilot.teamId
    );
  }
  function isDefensiveDribblePresser(player, actionMeta) {
    return (
    !!player &&
    actionMeta?.actionType === "dribble" &&
    isDefensiveAutopilotPlayer(player, actionMeta) &&
    player.id === actionMeta.defensiveAutopilot?.presserPlayerId
    );
  }
  function getLiveDefensiveDribblePressTarget(player, actionMeta, fallbackTarget) {
    if (!isDefensiveDribblePresser(player, actionMeta)) {
      return fallbackTarget;
    }
    const reference = getDribblePressureReference(actionMeta);
    if (!reference) {
      return fallbackTarget;
    }
    const profile = getDefensiveAutopilotProfile(
    player.team,
    actionMeta.target ?? reference.targetPoint,
    actionMeta.defensiveAutopilot?.phaseKey ?? null
    );
    return getDefensiveDribblePressTarget(player, reference, profile, state.ball.position);
  }
  function cloneDefensiveAutopilotIntents(intents = null) {
    if (!intents || typeof intents !== "object") {
      return null;
    }
    return Object.fromEntries(
    Object.entries(intents).map(([playerId, intent]) => [
    playerId,
    {
      type: intent?.type ?? "protect-space",
      label: intent?.label ?? "Protect space",
      urgency: Number.isFinite(intent?.urgency) ? intent.urgency : 0.5,
      lineKey: intent?.lineKey ?? null,
      relationship: intent?.relationship ?? null,
    },
    ])
    );
  }
  function getDefensiveAutoV2Intent(player, actionMeta, targetPosition = null) {
    const storedIntent = actionMeta?.defensiveAutopilot?.intents?.[player.id];
    if (storedIntent) {
      return {
        type: storedIntent.type ?? "protect-space",
        label: storedIntent.label ?? "Protect space",
        urgency: Number.isFinite(storedIntent.urgency) ? storedIntent.urgency : 0.5,
        lineKey: storedIntent.lineKey ?? getDefensiveAutopilotLineKey(
        player,
        teams[player.team]?.formation,
        actionMeta?.defensiveAutopilot?.phaseKey ?? "midBlock"
        ),
        relationship: storedIntent.relationship ?? null,
      };
    }
    const phaseKey = actionMeta?.defensiveAutopilot?.phaseKey ?? getDefensivePhaseKey(player.team, targetPosition ?? state.ball.position);
    const lineKey = getDefensiveAutopilotLineKey(player, teams[player.team]?.formation, phaseKey);
    const presserId = actionMeta?.defensiveAutopilot?.presserPlayerId ?? null;
    if (presserId && player.id === presserId) {
      return {
        type: "press-ball",
        label: "Press ball",
        urgency: phaseKey === "highPress" ? 1 : 0.88,
        lineKey,
        relationship: "nearest pressure",
      };
    }
    if (lineKey === "back") {
      return {
        type: phaseKey === "highPress" ? "recover-goal-side" : "protect-space",
        label: phaseKey === "highPress" ? "Recover goal-side" : "Protect space",
        urgency: phaseKey === "boxDefending" ? 0.66 : 0.58,
        lineKey,
        relationship: "hold back-line relation",
      };
    }
    if (lineKey === "midfield") {
      const centralDistance = Math.abs((targetPosition?.y ?? player.position.y) - pitch.width / 2);
      return {
        type: centralDistance < pitch.width * 0.18 ? "screen-central-lane" : "cover-lane",
        label: centralDistance < pitch.width * 0.18 ? "Screen central lane" : "Cover lane",
        urgency: phaseKey === "lowBlock" || phaseKey === "boxDefending" ? 0.7 : 0.76,
        lineKey,
        relationship: "protect pass lane",
      };
    }
    return {
      type: phaseKey === "highPress" ? "cover-lane" : "support-behind",
      label: phaseKey === "highPress" ? "Cover lane" : "Support behind",
      urgency: phaseKey === "highPress" ? 0.82 : 0.62,
      lineKey,
      relationship: "cover behind pressure",
    };
  }
  function buildDefensiveAutoV2Intents(teamId, defensivePlayers, plannedPositions, profile, presserId = null) {
    const phaseKey = profile?.phaseKey ?? "midBlock";
    const intents = {};
    defensivePlayers.forEach((player) => {
      const lineKey = getDefensiveAutopilotLineKey(player, teams[teamId]?.formation, phaseKey);
      let intent;
      if (presserId && player.id === presserId) {
        intent = {
          type: "press-ball",
          label: "Press ball",
          urgency: phaseKey === "highPress" ? 1 : 0.9,
          lineKey,
          relationship: "nearest pressure",
        };
      } else if (lineKey === "back") {
        intent = {
          type: profile?.lineActionAdjustment?.mode === "drop" ? "recover-goal-side" : "protect-space",
          label: profile?.lineActionAdjustment?.mode === "drop" ? "Recover goal-side" : "Protect space",
          urgency: phaseKey === "boxDefending" ? 0.66 : 0.58,
          lineKey,
          relationship: "hold back-line relation",
        };
      } else if (lineKey === "midfield") {
        const target = plannedPositions.get(player.id) ?? player.position;
        const centralDistance = Math.abs(target.y - pitch.width / 2);
        intent = {
          type: centralDistance < pitch.width * 0.18 ? "screen-central-lane" : "cover-lane",
          label: centralDistance < pitch.width * 0.18 ? "Screen central lane" : "Cover lane",
          urgency: phaseKey === "lowBlock" || phaseKey === "boxDefending" ? 0.7 : 0.76,
          lineKey,
          relationship: "protect pass lane",
        };
      } else {
        intent = {
          type: phaseKey === "highPress" ? "cover-lane" : "support-behind",
          label: phaseKey === "highPress" ? "Cover lane" : "Support behind",
          urgency: phaseKey === "highPress" ? 0.82 : 0.62,
          lineKey,
          relationship: "cover behind pressure",
        };
      }
      intents[player.id] = intent;
    });
    return intents;
  }
  function setReachableDefensiveAutoV2Target(plannedPositions, player, target) {
    if (!player || !target || !plannedPositions.has(player.id)) {
      return false;
    }
    const origin = getActionOrigin(player);
    const nextTarget = clampToPitch(
    clampToCircle(target, origin, getEditableRadius(player)),
    2
    );
    if (distance(plannedPositions.get(player.id), nextTarget) <= 0.04) {
      return false;
    }
    plannedPositions.set(player.id, nextTarget);
    return true;
  }
  function applyDefensiveAutoV2BackLineRelationship(
  teamId,
  plannedPositions,
  groups,
  profile,
  ballPoint,
  presserId = null
  ) {
    const backs = (groups.back ?? [])
    .filter((player) => !isGoalkeeper(player) && plannedPositions.has(player.id))
    .sort((a, b) => plannedPositions.get(a.id).y - plannedPositions.get(b.id).y);
    if (backs.length < 2) {
      return [];
    }
    const desiredGap = clamp(
    getDefensiveUnitGap(profile, "back"),
    profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8.2,
    profile.phaseKey === "highPress" ? 11.6 : 9.8
    );
    const lineWidth = desiredGap * (backs.length - 1);
    const lineX = getDefensiveLineX(teamId, "back", ballPoint, profile);
    const centerY = getDefensiveLineCenterY("back", profile, ballPoint, lineWidth);
    let adjusted = false;
    backs.forEach((player, index) => {
      const current = plannedPositions.get(player.id);
      const isPresser = presserId && player.id === presserId;
      const slot = {
        x: lineX,
        y: clamp(centerY - lineWidth / 2 + desiredGap * index, 3.1, pitch.width - 3.1),
      };
      const relationshipWeight =
      profile.phaseKey === "boxDefending"
      ? 0.82
      : profile.phaseKey === "lowBlock"
      ? 0.74
      : profile.phaseKey === "highPress"
      ? 0.46
      : 0.62;
      const weight = isPresser ? relationshipWeight * 0.36 : relationshipWeight;
      adjusted = setReachableDefensiveAutoV2Target(plannedPositions, player, {
        x: lerp(current.x, slot.x, weight),
        y: lerp(current.y, slot.y, weight),
      }) || adjusted;
    });
    return adjusted ? ["Auto v2: back line stays connected"] : [];
  }
  function applyDefensiveAutoV2MidfieldPressCover(
  teamId,
  plannedPositions,
  groups,
  profile,
  ballPoint,
  presser = null
  ) {
    if (!presser || !plannedPositions.has(presser.id)) {
      return [];
    }
    const midfielders = (groups.midfield ?? [])
    .filter((player) => !isGoalkeeper(player) && player.id !== presser.id && plannedPositions.has(player.id))
    .sort((a, b) => {
      const aTarget = plannedPositions.get(a.id);
      const bTarget = plannedPositions.get(b.id);
      return Math.abs(aTarget.y - ballPoint.y) - Math.abs(bTarget.y - ballPoint.y);
    });
    if (!midfielders.length) {
      return [];
    }
    const sign = getDefendingDirectionSign(teamId);
    const ownGoalX = teamId === "home" ? 0 : pitch.length;
    const pressTarget = plannedPositions.get(presser.id);
    const pressDepth = getDistanceFromOwnGoal(teamId, pressTarget);
    const screenDepth = clamp(
    pressDepth - (profile.phaseKey === "highPress" ? 6.2 : profile.phaseKey === "midBlock" ? 5.2 : 4.2),
    profile.minBackLineFromOwnGoal + 5.8,
    Math.max(profile.minBackLineFromOwnGoal + 6.2, getDefensiveLineDistanceFromOwnGoal(teamId, "midfield", ballPoint, profile))
    );
    const screenX = ownGoalX + sign * screenDepth;
    const screenPlayers = midfielders.slice(0, Math.min(2, midfielders.length));
    let adjusted = false;
    screenPlayers.forEach((player, index) => {
      const current = plannedPositions.get(player.id);
      const side = index === 0 ? 0 : Math.sign(current.y - ballPoint.y) || getWideSideSign(ballPoint) || 1;
      const screenY = clamp(
      lerp(current.y, ballPoint.y + side * (index === 0 ? 0 : 7.2), 0.62),
      5.2,
      pitch.width - 5.2
      );
      const weight =
      profile.phaseKey === "boxDefending"
      ? 0.78
      : profile.phaseKey === "lowBlock"
      ? 0.7
      : profile.phaseKey === "highPress"
      ? 0.42
      : 0.58;
      adjusted = setReachableDefensiveAutoV2Target(plannedPositions, player, {
        x: lerp(current.x, screenX, weight),
        y: screenY,
      }) || adjusted;
    });
    return adjusted ? ["Auto v2: midfield covers behind press"] : [];
  }
  function applyDefensiveAutoV2PressTether(
  teamId,
  plannedPositions,
  groups,
  profile,
  ballPoint,
  presser = null
  ) {
    if (!presser || !plannedPositions.has(presser.id)) {
      return [];
    }
    const supportPool = [...(groups.midfield ?? []), ...(groups.back ?? [])]
    .filter((player) => !isGoalkeeper(player) && player.id !== presser.id && plannedPositions.has(player.id));
    if (!supportPool.length) {
      return [];
    }
    const pressTarget = plannedPositions.get(presser.id);
    const nearestSupport = supportPool
    .map((player) => ({
      player,
      target: plannedPositions.get(player.id),
      gap: distance(pressTarget, plannedPositions.get(player.id)),
    }))
    .sort((a, b) => a.gap - b.gap)[0];
    const maxSupportGap =
    profile.phaseKey === "highPress"
    ? 13.8
    : profile.phaseKey === "midBlock"
    ? 11.8
    : 9.8;
    if (!nearestSupport || nearestSupport.gap <= maxSupportGap) {
      return [];
    }
    const sign = getDefendingDirectionSign(teamId);
    const ownGoalX = teamId === "home" ? 0 : pitch.length;
    const pressDepth = getDistanceFromOwnGoal(teamId, pressTarget);
    const supportDepth = clamp(
    pressDepth - (profile.phaseKey === "highPress" ? 5.4 : 4.2),
    profile.minBackLineFromOwnGoal + 4,
    profile.maxBackLineFromOwnGoal + 12
    );
    const tetherTarget = {
      x: ownGoalX + sign * supportDepth,
      y: lerp(nearestSupport.target.y, pressTarget.y, 0.48),
    };
    const adjusted = setReachableDefensiveAutoV2Target(
    plannedPositions,
    nearestSupport.player,
    tetherTarget
    );
    return adjusted ? ["Auto v2: press has close cover"] : [];
  }
  function applyDefensiveAutoV2AntiMagnetRelationships(
  teamId,
  plannedPositions,
  groups,
  profile,
  ballPoint,
  presser = null
  ) {
    const labels = [];
    ["back", "midfield", "forward"].forEach((lineKey) => {
      const players = (groups[lineKey] ?? [])
      .filter((player) => !isGoalkeeper(player) && player.id !== presser?.id && plannedPositions.has(player.id));
      if (!players.length) {
        return;
      }
      const lineWidth = getDefensiveUnitGap(profile, lineKey) * Math.max(0, players.length - 1);
      const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
      const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
      const ballPullLimit =
      lineKey === "forward"
      ? 13.5
      : lineKey === "midfield"
      ? 10.8
      : 8.2;
      players.forEach((player, index) => {
        const current = plannedPositions.get(player.id);
        const overPulledToBall = distance(current, ballPoint) < ballPullLimit;
        if (!overPulledToBall) {
          return;
        }
        const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
        const relationshipSlot = {
          x: lineX,
          y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.2, pitch.width - 3.2),
        };
        const weight = lineKey === "back" ? 0.64 : lineKey === "midfield" ? 0.5 : 0.34;
        if (setReachableDefensiveAutoV2Target(plannedPositions, player, {
          x: lerp(current.x, relationshipSlot.x, weight),
          y: lerp(current.y, relationshipSlot.y, weight),
        })) {
          labels.push("Auto v2: non-pressers hold team shape");
        }
      });
    });
    return uniquePrincipleLabels(labels);
  }
  function applyDefensiveAutoV2RelationshipLayer(
  teamId,
  plannedPositions,
  profile,
  ballPoint,
  presser = null
  ) {
    if (!teamId || !plannedPositions?.size || !profile || !ballPoint) {
      return [];
    }
    const groups = getDefensiveAutopilotGroupsForTeam(teamId, profile.phaseKey);
    return uniquePrincipleLabels([
    ...applyDefensiveAutoV2MidfieldPressCover(teamId, plannedPositions, groups, profile, ballPoint, presser),
    ...applyDefensiveAutoV2PressTether(teamId, plannedPositions, groups, profile, ballPoint, presser),
    ...applyDefensiveAutoV2BackLineRelationship(teamId, plannedPositions, groups, profile, ballPoint, presser?.id ?? null),
    ...applyDefensiveAutoV2AntiMagnetRelationships(teamId, plannedPositions, groups, profile, ballPoint, presser),
    ]);
  }
  function getDefensiveAutoV2FrameDt(player, elapsed) {
    const previousElapsed = Number.isFinite(player.autoV2LastElapsed) ? player.autoV2LastElapsed : 0;
    let frameDt = elapsed - previousElapsed;
    if (!Number.isFinite(frameDt) || frameDt <= 0 || frameDt > 0.12) {
      frameDt = 0.05;
    }
    player.autoV2LastElapsed = elapsed;
    return frameDt;
  }
  function moveDefensiveAutoV2Player(player, targetPosition, actionMeta, intent, elapsed, focusPoint = null) {
    if (!targetPosition) {
      return;
    }
    const context = getPlayerDecisionContext(player);
    const frameDt = getDefensiveAutoV2FrameDt(player, elapsed);
    const runTime = Math.max(0, elapsed - context.reactionTime * (intent.type === "press-ball" ? 0.42 : 0.78));
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
        rotatePlayerBodyToward(player, focusPoint, intent.type === "press-ball" ? 0.42 : 0.3);
      }
      return;
    }
    const currentVelocity = player.autoV2Velocity ?? { x: 0, y: 0 };
    const currentSpeed = Math.hypot(currentVelocity.x, currentVelocity.y);
    const currentAngle =
    currentSpeed > 0.05
    ? Math.atan2(currentVelocity.y, currentVelocity.x)
    : getPlayerFacingAngle(player);
    const desiredAngle = angleBetween(previousPosition, targetPosition);
    const intentUrgency = clamp(intent.urgency ?? 0.65, 0.35, 1.08);
    const turnRate =
    (intent.type === "press-ball" ? 3.9 : intent.lineKey === "back" ? 2.35 : 2.9) *
    (0.74 + context.profile.tacticalDiscipline * 0.24 + context.profile.perception * 0.18);
    const angleDelta = normalizeAngle(desiredAngle - currentAngle);
    const limitedAngle = currentAngle + clamp(angleDelta, -turnRate * frameDt, turnRate * frameDt);
    const brakeDistance = intent.type === "press-ball" ? 1.35 : intent.lineKey === "back" ? 2.35 : 1.85;
    const maxSpeed =
    context.maxSpeed *
    (intent.type === "press-ball" ? 0.94 : intent.lineKey === "back" ? 0.62 : 0.72) *
    intentUrgency;
    const acceleration =
    context.acceleration *
    (intent.type === "press-ball" ? 1.04 : intent.lineKey === "back" ? 0.72 : 0.84);
    const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * Math.max(0, remaining - brakeDistance * 0.32)));
    const desiredSpeed = clamp(Math.min(maxSpeed, brakingSpeed), 0, maxSpeed);
    const nextSpeed = currentSpeed + clamp(desiredSpeed - currentSpeed, -acceleration * 1.34 * frameDt, acceleration * frameDt);
    const nextVelocity = {
      x: Math.cos(limitedAngle) * nextSpeed,
      y: Math.sin(limitedAngle) * nextSpeed,
    };
    const rawNext = {
      x: previousPosition.x + nextVelocity.x * frameDt,
      y: previousPosition.y + nextVelocity.y * frameDt,
    };
    const nextPosition = clampToPitch(
    distance(rawNext, targetPosition) < Math.max(0.05, nextSpeed * frameDt * 0.7)
    ? targetPosition
    : rawNext,
    2
    );
    player.position = nextPosition;
    player.autoV2Velocity = nextVelocity;
    player.movementProgress = distance(getActionOrigin(player), nextPosition);
    if (distance(previousPosition, nextPosition) > 0.004) {
      rotatePlayerBodyAlongMovement(player, previousPosition, nextPosition, intent.type === "press-ball" ? 0.36 : 0.28);
    } else if (focusPoint) {
      rotatePlayerBodyToward(player, focusPoint, 0.16);
    }
  }
  function alignArrivedDefensiveAutopilotPlayers(actionMeta, targetMap, focusPoint = null) {
    const defensiveFocusPoint = focusPoint ?? getDefensiveAutopilotFocusPoint(actionMeta);
    if (!targetMap || !defensiveFocusPoint) {
      return;
    }
    state.players.forEach((player) => {
      if (!isDefensiveAutopilotPlayer(player, actionMeta)) {
        return;
      }
      const targetPosition = targetMap.get(player.id);
      if (!targetPosition || distance(player.position, targetPosition) > 0.12) {
        return;
      }
      rotatePlayerBodyToward(player, defensiveFocusPoint, 0.92);
    });
  }

  return {
    getDefensiveAutopilotFocusPoint,
    isDefensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    getLiveDefensiveDribblePressTarget,
    cloneDefensiveAutopilotIntents,
    getDefensiveAutoV2Intent,
    buildDefensiveAutoV2Intents,
    setReachableDefensiveAutoV2Target,
    applyDefensiveAutoV2BackLineRelationship,
    applyDefensiveAutoV2MidfieldPressCover,
    applyDefensiveAutoV2PressTether,
    applyDefensiveAutoV2AntiMagnetRelationships,
    applyDefensiveAutoV2RelationshipLayer,
    getDefensiveAutoV2FrameDt,
    moveDefensiveAutoV2Player,
    alignArrivedDefensiveAutopilotPlayers,
  };
}
