export function createGameSimulatorAutopilotLiveOffensiveAutoV2(deps = {}) {
  const {
    angleDifference,
    clamp,
    clampToCircle,
    clampToPitch,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getBallNearSupportTriangleTarget,
    getDistanceFromOwnGoal,
    getEditableRadius,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPlayerById,
    getPlayerFacingAngle,
    getTeamAttackAngle,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone = () => false,
    lerp,
    pitch,
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

  function cloneOffensiveAutopilotIntents(intents = null) {
    if (!intents || typeof intents !== "object") {
      return null;
    }
    return Object.fromEntries(
      Object.entries(intents).map(([playerId, intent]) => [
        playerId,
        {
          type: intent?.type ?? "offer-angle",
          label: intent?.label ?? "Offer angle",
          urgency: Number.isFinite(intent?.urgency) ? intent.urgency : 0.55,
          roleKey: intent?.roleKey ?? null,
          startDelay: Number.isFinite(intent?.startDelay) ? intent.startDelay : 0,
          relationship: intent?.relationship ?? null,
        },
      ])
    );
  }

  function cloneAutoV2DecisionTriggers(triggers = null) {
    if (!triggers || typeof triggers !== "object") {
      return null;
    }
    return {
      ballPressure: Number.isFinite(triggers.ballPressure) ? triggers.ballPressure : 0,
      forwardFacing: Number.isFinite(triggers.forwardFacing) ? triggers.forwardFacing : 0,
      highBackLine: Number.isFinite(triggers.highBackLine) ? triggers.highBackLine : 0,
      centralCongestion: Number.isFinite(triggers.centralCongestion) ? triggers.centralCongestion : 0,
      receiverPressure: Number.isFinite(triggers.receiverPressure) ? triggers.receiverPressure : 0,
      restDefenseBalance: Number.isFinite(triggers.restDefenseBalance) ? triggers.restDefenseBalance : 0,
      poorTouchLooseBall: Number.isFinite(triggers.poorTouchLooseBall) ? triggers.poorTouchLooseBall : 0,
      centralClosed: Number.isFinite(triggers.centralClosed) ? triggers.centralClosed : 0,
      labels: Array.isArray(triggers.labels) ? [...triggers.labels] : [],
    };
  }

  function scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile = {}) {
    const attackingTeamId = teamId;
    const defendingTeamId = getOtherTeamId(attackingTeamId);
    const startPoint =
      actionMeta?.beforeSnapshot?.ball?.position ??
      state.ball.startPosition ??
      state.ball.position ??
      ballPoint;
    const carrier =
      getPlayerById(actionMeta?.carrierPlayerId) ??
      getPlayerById(actionMeta?.beforeSnapshot?.ball?.ownerPlayerId) ??
      getPlayerById(state.ball.carrierPlayerId) ??
      getPlayerById(state.ball.initiatorPlayerId) ??
      getPlayerById(state.ball.ownerPlayerId);
    const receiver = getPlayerById(actionMeta?.receiverPlayerId);
    const actionType = actionMeta?.actionType ?? state.ball.actionType;
    const ballPressure = getOpponentPressureAtPoint(attackingTeamId, startPoint ?? ballPoint, 12);
    const receiverPressure = receiver || actionType === "pass"
      ? getOpponentPressureAtPoint(attackingTeamId, ballPoint, 10.5)
      : 0;
    const attackSign = getAttackDirectionSign(attackingTeamId);
    const facingAngle = carrier ? getPlayerFacingAngle(carrier) : getTeamAttackAngle(attackingTeamId);
    const forwardAngle = attackSign > 0 ? 0 : Math.PI;
    const forwardFacing = carrier ? clamp(1 - angleDifference(facingAngle, forwardAngle) / (Math.PI * 0.62), 0, 1) : 0.5;
    const centralCongestion = state.players.reduce((count, player) => {
      if (player.team === attackingTeamId) {
        return count;
      }
      const gap = Math.abs(player.position.y - pitch.width / 2);
      const depthGap = Math.abs(getAttackingDepth(player.position, attackingTeamId) - getAttackingDepth(ballPoint, attackingTeamId));
      return count + (gap <= 15 && depthGap <= 18 ? 1 : 0);
    }, 0);
    const centralCongestionScore = clamp(centralCongestion / 5, 0, 1);
    const defenders = state.players.filter((player) => player.team === defendingTeamId && !isGoalkeeper(player));
    const backLineDepth = defenders.length
      ? defenders.reduce((maxDepth, player) => Math.max(maxDepth, getDistanceFromOwnGoal(defendingTeamId, player.position)), 0)
      : 0;
    const highBackLine = clamp((backLineDepth - 42) / 22, 0, 1);
    const ballDepth = getAttackingDepth(ballPoint, attackingTeamId);
    const restDefenseCount = state.players.filter((player) => {
      if (player.team !== attackingTeamId || isGoalkeeper(player)) {
        return false;
      }
      const roleKey = getOffensiveRoleKey(player, teams[attackingTeamId]?.formation);
      const depth = getAttackingDepth(player.position, attackingTeamId);
      return (roleKey === "pivot" || roleKey === "rest" || roleKey === "wideBack") && depth <= Math.max(28, ballDepth - 14);
    }).length;
    const restDefenseBalance = clamp(restDefenseCount / 2, 0, 1);
    const passDistance = startPoint && ballPoint ? distance(startPoint, ballPoint) : 0;
    const poorTouchLooseBall =
      actionType === "recovery" ||
      state.ball.actionType === "recovery" ||
      state.ball.inTransit && !state.ball.ownerPlayerId && actionType !== "shot" && passDistance >= 9
        ? clamp(0.45 + receiverPressure * 0.35 + ballPressure * 0.2, 0, 1)
        : 0;
    const centralClosed = clamp(
      centralCongestionScore * 0.58 +
        getOpponentPressureAtPoint(attackingTeamId, {
          x: ballPoint.x,
          y: pitch.width / 2,
        }, 16) * 0.42,
      0,
      1
    );
    const labels = [];
    if (ballPressure >= 0.55) labels.push("ball-carrier pressured");
    if (forwardFacing >= 0.62 && ballPressure <= 0.62) labels.push("ball-carrier forward-facing");
    if (highBackLine >= 0.5) labels.push("high defensive line");
    if (centralClosed >= 0.54) labels.push("central lane closed");
    if (receiverPressure >= 0.5) labels.push("receiver pressured");
    if (restDefenseBalance < 0.65 && ballDepth >= 38) labels.push("rest defense thin");
    if (poorTouchLooseBall >= 0.48) labels.push("loose/poor-touch risk");
    return {
      ballPressure,
      forwardFacing,
      highBackLine,
      centralCongestion: centralCongestionScore,
      receiverPressure,
      restDefenseBalance,
      poorTouchLooseBall,
      centralClosed,
      labels,
    };
  }

  function weightOffensiveAutoV2Intent(intent, triggers = null) {
    if (!triggers) {
      return intent;
    }
    const next = { ...intent };
    if (next.type === "support-behind" || next.type === "offer-angle") {
      next.urgency = clamp(next.urgency + triggers.ballPressure * 0.22 + triggers.receiverPressure * 0.12, 0.35, 1);
      next.startDelay = Math.max(0, next.startDelay - triggers.ballPressure * 0.05);
    }
    if (next.type === "run-behind" || next.type === "pin-line" || next.type === "create-third-man-option") {
      next.urgency = clamp(next.urgency + triggers.forwardFacing * 0.16 + triggers.highBackLine * 0.18 - triggers.ballPressure * 0.12, 0.34, 1);
      next.startDelay = clamp(next.startDelay + triggers.ballPressure * 0.1 - triggers.forwardFacing * 0.06, 0, 0.34);
    }
    if (next.type === "hold-width") {
      next.urgency = clamp(next.urgency + triggers.centralClosed * 0.24 + triggers.centralCongestion * 0.12, 0.35, 1);
      next.startDelay = clamp(next.startDelay - triggers.centralClosed * 0.04, 0, 0.24);
    }
    if (next.type === "rest-defense") {
      next.urgency = clamp(next.urgency + (1 - triggers.restDefenseBalance) * 0.32 + triggers.poorTouchLooseBall * 0.12, 0.34, 0.9);
      next.startDelay = 0;
    }
    next.relationship = [
      next.relationship,
      ...(triggers.labels?.slice(0, 2) ?? []),
    ].filter(Boolean).join(" / ");
    return next;
  }

  function getOffensiveAutoV2Intent(player, actionMeta, targetPosition = null) {
    const storedIntent = actionMeta?.offensiveAutopilot?.intents?.[player.id];
    if (storedIntent) {
      return {
        type: storedIntent.type ?? "offer-angle",
        label: storedIntent.label ?? "Offer angle",
        urgency: Number.isFinite(storedIntent.urgency) ? storedIntent.urgency : 0.55,
        roleKey: storedIntent.roleKey ?? getOffensiveRoleKey(player, teams[player.team]?.formation),
        startDelay: Number.isFinite(storedIntent.startDelay) ? storedIntent.startDelay : 0,
        relationship: storedIntent.relationship ?? null,
      };
    }
    const triggers = actionMeta?.offensiveAutopilot?.triggers ?? null;
    const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
    const ballPoint = actionMeta?.offensiveAutopilot?.ballFocusPoint ?? actionMeta?.target ?? state.ball.position;
    const attackSign = getAttackDirectionSign(player.team);
    const target = targetPosition ?? player.position;
    const forwardOffset = (target.x - ballPoint.x) * attackSign;
    const lateralOffset = Math.abs(target.y - pitch.width / 2);
    if (actionMeta?.offensiveAutopilot?.runnerPlayerId === player.id || forwardOffset >= 10) {
      return weightOffensiveAutoV2Intent({
        type: "run-behind",
        label: "Run behind",
        urgency: 0.86,
        roleKey,
        startDelay: 0.18,
        relationship: "depth threat after support appears",
      }, triggers);
    }
    if (roleKey === "rest" || (roleKey === "pivot" && forwardOffset < -7)) {
      return weightOffensiveAutoV2Intent({
        type: "rest-defense",
        label: "Rest defense",
        urgency: 0.46,
        roleKey,
        startDelay: 0,
        relationship: "secure behind attack",
      }, triggers);
    }
    if (roleKey === "wideBack" || roleKey === "wideForward" || lateralOffset >= pitch.width * 0.28) {
      return weightOffensiveAutoV2Intent({
        type: "hold-width",
        label: "Hold width",
        urgency: 0.52,
        roleKey,
        startDelay: 0.08,
        relationship: "stretch outside lane",
      }, triggers);
    }
    if (roleKey === "striker" || roleKey === "secondStriker") {
      return weightOffensiveAutoV2Intent({
        type: forwardOffset >= 5 ? "pin-line" : "offer-angle",
        label: forwardOffset >= 5 ? "Pin line" : "Offer angle",
        urgency: forwardOffset >= 5 ? 0.72 : 0.62,
        roleKey,
        startDelay: forwardOffset >= 5 ? 0.16 : 0.06,
        relationship: "occupy last line",
      }, triggers);
    }
    if (roleKey === "connector" && forwardOffset >= 2) {
      return weightOffensiveAutoV2Intent({
        type: "create-third-man-option",
        label: "Create third-man option",
        urgency: 0.66,
        roleKey,
        startDelay: 0.12,
        relationship: "diagonal third player",
      }, triggers);
    }
    return weightOffensiveAutoV2Intent({
      type: forwardOffset < -3 ? "support-behind" : "offer-angle",
      label: forwardOffset < -3 ? "Support behind" : "Offer angle",
      urgency: forwardOffset < -3 ? 0.58 : 0.64,
      roleKey,
      startDelay: forwardOffset < -3 ? 0.02 : 0.07,
      relationship: forwardOffset < -3 ? "bounce support" : "playable angle",
    }, triggers);
  }

  function setReachableOffensiveAutoV2Target(plannedPositions, player, target) {
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

  function pickOffensiveAutoV2Player(teamId, plannedPositions, excludedIds, roleKeys, referencePoint, preferredSide = 0) {
    return state.players
      .filter((player) => {
        if (player.team !== teamId || excludedIds.has(player.id) || !plannedPositions.has(player.id) || isGoalkeeper(player)) {
          return false;
        }
        const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
        if (roleKeys.length && !roleKeys.includes(roleKey)) {
          return false;
        }
        if (preferredSide) {
          const side = Math.sign((plannedPositions.get(player.id)?.y ?? player.position.y) - pitch.width / 2) || 0;
          if (side !== preferredSide) {
            return false;
          }
        }
        return true;
      })
      .map((player) => ({
        player,
        score: distance(plannedPositions.get(player.id), referencePoint) -
          getAutoPilotRoleStrength(player, "receiver") * 4 -
          getAutoPilotRoleStrength(player, "runner") * (roleKeys.includes("striker") || roleKeys.includes("wideForward") ? 3 : 0),
      }))
      .sort((a, b) => a.score - b.score)[0]?.player ?? null;
  }

  function applyOffensiveAutoV2RelationshipLayer(teamId, plannedPositions, profile, ballPoint, actionMeta, runner = null) {
    if (!teamId || !plannedPositions?.size || !ballPoint || !profile) {
      return [];
    }
    const labels = [];
    const sideSign = getWideSideSign(ballPoint) || 1;
    const attackSign = getAttackDirectionSign(teamId);
    const depth = getAttackingDepth(ballPoint, teamId);
    const triggers = actionMeta?.offensiveAutopilot?.triggers ?? scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile);
    const excludedIds = new Set([
      actionMeta?.carrierPlayerId,
      actionMeta?.receiverPlayerId,
      actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
      state.ball.initiatorPlayerId,
      state.ball.receiverPlayerId,
      runner?.id,
    ].filter(Boolean));
    const relationTarget = (slot) => getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign, profile);
    const supportBehind = pickOffensiveAutoV2Player(teamId, plannedPositions, excludedIds, ["pivot", "connector", "wideBack", "rest"], relationTarget("underSupport"));
    if (supportBehind && setReachableOffensiveAutoV2Target(plannedPositions, supportBehind, relationTarget("underSupport"))) {
      excludedIds.add(supportBehind.id);
      labels.push(triggers.ballPressure >= 0.55 ? "Auto v2 trigger: pressure creates support behind" : "Auto v2: support behind ball");
    }
    const anglePlayer = pickOffensiveAutoV2Player(
      teamId,
      plannedPositions,
      excludedIds,
      ["connector", "pivot", "wideForward", "secondStriker"],
      relationTarget("insideAngle"),
      isWidePrincipleZone(ballPoint) ? sideSign : 0
    );
    if (anglePlayer && setReachableOffensiveAutoV2Target(plannedPositions, anglePlayer, relationTarget("insideAngle"))) {
      excludedIds.add(anglePlayer.id);
      labels.push(triggers.receiverPressure >= 0.5 ? "Auto v2 trigger: receiver pressure creates escape angle" : "Auto v2: playable angle");
    }
    const thirdMan = pickOffensiveAutoV2Player(
      teamId,
      plannedPositions,
      excludedIds,
      ["connector", "wideForward", "secondStriker", "striker"],
      relationTarget("beyondOption")
    );
    if (
      thirdMan &&
      (depth >= 34 || triggers.forwardFacing >= 0.62 || triggers.highBackLine >= 0.5) &&
      setReachableOffensiveAutoV2Target(plannedPositions, thirdMan, relationTarget("beyondOption"))
    ) {
      excludedIds.add(thirdMan.id);
      labels.push(triggers.forwardFacing >= 0.62 ? "Auto v2 trigger: forward-facing opens third man" : "Auto v2: diagonal third-man option");
    }
    const widthPlayer = pickOffensiveAutoV2Player(
      teamId,
      plannedPositions,
      excludedIds,
      ["wideBack", "wideForward"],
      relationTarget("outsideWidth"),
      sideSign
    );
    if (
      widthPlayer &&
      (triggers.centralClosed >= 0.46 || isWidePrincipleZone(ballPoint) || profile.widthDiscipline >= 0.6) &&
      setReachableOffensiveAutoV2Target(plannedPositions, widthPlayer, relationTarget("outsideWidth"))
    ) {
      excludedIds.add(widthPlayer.id);
      labels.push(triggers.centralClosed >= 0.46 ? "Auto v2 trigger: central lane closed, hold width" : "Auto v2: width held outside");
    }
    const restPlayer = pickOffensiveAutoV2Player(
      teamId,
      plannedPositions,
      excludedIds,
      ["pivot", "rest", "wideBack"],
      relationTarget("restLock")
    );
    if (restPlayer && setReachableOffensiveAutoV2Target(plannedPositions, restPlayer, relationTarget("restLock"))) {
      excludedIds.add(restPlayer.id);
      labels.push(triggers.restDefenseBalance < 0.65 ? "Auto v2 trigger: rest defense secured" : "Auto v2: rest defense secured");
    }
    if (runner && plannedPositions.has(runner.id) && (triggers.highBackLine >= 0.42 || triggers.forwardFacing >= 0.58 || depth >= 38)) {
      const current = plannedPositions.get(runner.id);
      const minDepthAhead = ballPoint.x + attackSign * 9;
      const runTarget = {
        x: attackSign > 0 ? Math.max(current.x, minDepthAhead) : Math.min(current.x, minDepthAhead),
        y: lerp(current.y, pitch.width / 2 - sideSign * 7, 0.24),
      };
      if (setReachableOffensiveAutoV2Target(plannedPositions, runner, runTarget)) {
        labels.push(triggers.highBackLine >= 0.42 ? "Auto v2 trigger: high line invites depth run" : "Auto v2: depth run timed after triangle");
      }
    }
    return uniquePrincipleLabels(labels);
  }

  function buildOffensiveAutoV2Intents(teamId, attackingPlayers, plannedPositions, profile, ballPoint, actionMeta, runnerId = null) {
    const intents = {};
    attackingPlayers.forEach((player) => {
      const target = plannedPositions.get(player.id);
      if (!target) {
        return;
      }
      const intent = getOffensiveAutoV2Intent(player, {
        ...actionMeta,
        offensiveAutopilot: {
          ...(actionMeta?.offensiveAutopilot ?? {}),
          teamId,
          ballFocusPoint: ballPoint,
          runnerPlayerId: runnerId,
          phaseKey: profile?.phaseKey ?? null,
          triggers: actionMeta?.offensiveAutopilot?.triggers ?? scanAutoV2DecisionTriggers(teamId, ballPoint, actionMeta, profile),
        },
      }, target);
      intents[player.id] = intent;
    });
    return intents;
  }

  return {
    cloneOffensiveAutopilotIntents,
    cloneAutoV2DecisionTriggers,
    scanAutoV2DecisionTriggers,
    weightOffensiveAutoV2Intent,
    getOffensiveAutoV2Intent,
    setReachableOffensiveAutoV2Target,
    pickOffensiveAutoV2Player,
    applyOffensiveAutoV2RelationshipLayer,
    buildOffensiveAutoV2Intents,
  };
}
