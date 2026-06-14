export function createGameSimulatorAutopilotDefensivePostRecoveryResponseTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlannedPossessionTeamId,
    getRecordedStepDuration,
    getRecordedStepPattern,
    getRecordedStepPossessionTeamId,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isTransitionAttackStyle,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

  function getDefensivePostRecoveryResponseContext(defensiveTeamId, ballPoint, profile = {}) {
    if (state.restartPhase?.type) {
      return null;
    }
    const attackingTeamId = getOtherTeamId(defensiveTeamId);
    const plannedPossessionTeamId = getPlannedPossessionTeamId();
    if (!attackingTeamId || (plannedPossessionTeamId && plannedPossessionTeamId !== attackingTeamId)) {
      return null;
    }
    const steps = state.sequence?.steps ?? [];
    let recoveryIndex = -1;
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      const possessionTeamId = getRecordedStepPossessionTeamId(step);
      const isRecovery =
        step?.actionType === "recovery" ||
        step?.profileKey === "loose-ball-recovery" ||
        `${step?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
      if (isRecovery && possessionTeamId === attackingTeamId) {
        recoveryIndex = index;
        break;
      }
      if (possessionTeamId && possessionTeamId !== attackingTeamId) {
        break;
      }
    }
    if (recoveryIndex < 0) {
      return null;
    }
    const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
    if (actionsAfterRecovery.length > 4) {
      return null;
    }
    if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== attackingTeamId)) {
      return null;
    }
    const elapsed = actionsAfterRecovery.reduce(
      (total, step) => total + getRecordedStepDuration(step),
      0
    );
    if (elapsed > 10.5) {
      return null;
    }
    const actionMeta = state.draftStep ?? {
      actionType: state.ball.actionType,
      target: state.ball.target,
      receiverPlayerId: state.ball.receiverPlayerId,
      carrierPlayerId: state.ball.carrierPlayerId,
      beforeSnapshot: {
        ball: {
          position: state.ball.startPosition,
          ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
        },
      },
      autoPrinciples: [],
    };
    const actionType = actionMeta.actionType ?? state.ball.actionType;
    if (!["pass", "dribble", "shot"].includes(actionType)) {
      return null;
    }
    const startPoint =
      actionMeta.beforeSnapshot?.ball?.position ??
      state.ball.startPosition ??
      state.ball.position;
    const targetPoint =
      actionMeta.target ??
      ballPoint ??
      state.ball.target ??
      state.ball.position;
    if (!startPoint || !targetPoint) {
      return null;
    }
    const recoveryStep = steps[recoveryIndex];
    const recoveryPoint =
      recoveryStep?.target ??
      recoveryStep?.afterSnapshot?.ball?.position ??
      startPoint;
    const originDepth = getAttackingDepth(recoveryPoint, attackingTeamId);
    const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
    const currentDepth = getAttackingDepth(startPoint, attackingTeamId);
    const depthGainSinceRecovery = currentDepth - originDepth;
    const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
    const actionDistance = distance(startPoint, targetPoint);
    const attackingProfile = getOffensiveAutopilotProfile(attackingTeamId, targetPoint);
    const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId, attackingProfile);
    const targetThreat = actionSpace.targetThreat;
    const ballFromOwnGoal = getDistanceFromOwnGoal(defensiveTeamId, targetPoint);
    const laneShift = Math.abs(getPitchLaneIndex(targetPoint) - getPitchLaneIndex(startPoint));
    const sideSign =
      getWideSideSign(targetPoint) ||
      getWideSideSign(startPoint) ||
      1;
    const patterns = actionsAfterRecovery
      .map((step) => getRecordedStepPattern(step, attackingTeamId))
      .filter(Boolean);
    const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
    const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
    const laneVariety = new Set(patterns.map((pattern) => pattern.laneKey).filter(Boolean)).size;
    const sameLaneStall = actionsAfterRecovery.length >= 2 && laneVariety <= 1 && depthGainSinceRecovery < 8;
    const localDefensiveAccess = getTeamSupportCountAroundPoint(
      defensiveTeamId,
      targetPoint,
      new Set(),
      10.5
    );
    const localAttackingSupport = getTeamSupportCountAroundPoint(
      attackingTeamId,
      targetPoint,
      new Set([actionMeta.receiverPlayerId, actionMeta.carrierPlayerId].filter(Boolean)),
      13
    );
    const transitionThreat =
      actionForwardGain >= 6 &&
      (
        actionSpace.lineBreakCount >= 1 ||
        targetThreat.behindLine >= 0.2 ||
        targetThreat.centralPocket >= 0.24 ||
        targetThreat.box >= 0.14 ||
        targetDepth >= 58
      );
    const secureExit =
      actionType === "pass" &&
      actionDistance <= 22 &&
      actionForwardGain >= -8 &&
      actionSpace.targetPressure <= 0.72;
    const switchExit =
      actionType === "pass" &&
      laneShift >= 2 &&
      actionDistance >= 16;
    const finalThirdThreat =
      ballFromOwnGoal <= 42 ||
      targetThreat.box >= 0.14 ||
      targetThreat.cutbackZone >= 0.2 ||
      targetThreat.assistZone >= 0.32;
    const directAttackStyle = isTransitionAttackStyle(attackingProfile.styleKey);
    const pressStyle = ["counter-press", "gegenpress", "high-press", "press-trap-wide"].includes(profile.styleKey);
    const delayNeed = clamp(
      (transitionThreat ? 0.34 : 0) +
      actionSpace.value * 0.22 +
      clamp((52 - ballFromOwnGoal) / 34, 0, 1) * 0.24 +
      (directAttackStyle ? 0.14 : 0) +
      (localDefensiveAccess <= 1 ? 0.08 : 0),
      0,
      1.1
    );
    const jumpNeed = clamp(
      (secureExit ? 0.24 : 0) +
      (switchExit ? 0.18 : 0) +
      (pressStyle ? 0.22 : 0) +
      (profile.pressingIntensity ?? 0.5) * 0.24 +
      (sameLaneStall ? 0.12 : 0),
      0,
      1.1
    );
    const recoverNeed = clamp(
      clamp((44 - ballFromOwnGoal) / 28, 0, 1) * 0.32 +
      (finalThirdThreat ? 0.2 : 0) +
      (transitionThreat && localDefensiveAccess <= 1 ? 0.16 : 0) +
      (profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending" ? 0.14 : 0),
      0,
      1.1
    );
    const mode =
      delayNeed >= Math.max(0.52, jumpNeed * 0.92) || transitionThreat
        ? "delayCounter"
        : jumpNeed >= Math.max(0.5, recoverNeed * 0.9)
          ? "jumpFirstPass"
          : "recoverShape";
    return {
      active: true,
      defensiveTeamId,
      attackingTeamId,
      actionMeta,
      actionType,
      startPoint: cloneVector(startPoint),
      targetPoint: cloneVector(targetPoint),
      recoveryPoint: cloneVector(recoveryPoint),
      actionsAfterRecovery: actionsAfterRecovery.length,
      elapsed,
      originDepth,
      currentDepth,
      targetDepth,
      depthGainSinceRecovery,
      actionForwardGain,
      actionDistance,
      actionSpace,
      targetThreat,
      ballFromOwnGoal,
      laneShift,
      sideSign,
      sidewaysOrBackCount,
      lineBreakCount,
      laneVariety,
      sameLaneStall,
      localDefensiveAccess,
      localAttackingSupport,
      transitionThreat,
      secureExit,
      switchExit,
      finalThirdThreat,
      directAttackStyle,
      pressStyle,
      delayNeed,
      jumpNeed,
      recoverNeed,
      mode,
    };
  }

  function getDefensivePostRecoveryResponseTarget(teamId, context, slot, outlet = null) {
    const sign = getDefendingDirectionSign(teamId);
    const ownGoal = getOwnGoalCenter(teamId);
    const ball = context.targetPoint;
    const start = context.startPoint;
    const sideSign = context.sideSign || 1;
    const goalSideOf = (point, meters) => ({
      x: point.x - sign * meters,
      y: point.y,
    });
    const routePoint = (ratio) => ({
      x: lerp(start.x, ball.x, ratio),
      y: lerp(start.y, ball.y, ratio),
    });
    const gateDepth = clamp(context.ballFromOwnGoal + (context.finalThirdThreat ? 4.5 : 7.5), 16, 52);
    const coverDepth = clamp(context.ballFromOwnGoal - (context.finalThirdThreat ? 3.8 : 7.2), 7.5, 38);
    const outletPoint = outlet?.position ?? outlet?.point ?? ball;
    const points = {
      delayCarrier: {
        ...goalSideOf(context.actionType === "dribble" ? routePoint(0.74) : ball, context.transitionThreat ? 1.35 : 1.85),
        y: lerp(ball.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.28 : 0.16),
      },
      jumpFirstPass: {
        x: lerp(start.x, ball.x, context.secureExit ? 0.7 : 0.54) - sign * 1.25,
        y: lerp(start.y, ball.y, 0.68),
      },
      centralGate: {
        x: getDepthX(teamId, gateDepth),
        y: lerp(ball.y, pitch.width / 2, context.finalThirdThreat ? 0.88 : 0.74),
      },
      counterLaneGate: {
        x: lerp(ball.x, ownGoal.x, context.finalThirdThreat ? 0.22 : 0.16),
        y: lerp(ball.y, pitch.width / 2, context.targetThreat.centralPocket >= 0.24 ? 0.82 : 0.62),
      },
      firstOutletLock: {
        ...goalSideOf({
          x: lerp(outletPoint.x, ball.x, 0.22),
          y: lerp(outletPoint.y, pitch.width / 2, 0.14),
        }, context.transitionThreat ? 1.55 : 1.1),
      },
      switchLock: {
        x: lerp(ball.x, ownGoal.x, 0.24),
        y: clamp(pitch.width / 2 - sideSign * 16.5, 4.5, pitch.width - 4.5),
      },
      restLineCover: {
        x: getDepthX(teamId, coverDepth),
        y: lerp(ball.y, pitch.width / 2, context.finalThirdThreat ? 0.46 : 0.36),
      },
      weakSideRecover: {
        x: lerp(ball.x, ownGoal.x, context.finalThirdThreat ? 0.4 : 0.32),
        y: clamp(pitch.width / 2 - sideSign * (context.finalThirdThreat ? 8.4 : 12.4), 7, pitch.width - 7),
      },
      boxCover: {
        x: getDepthX(teamId, clamp(context.ballFromOwnGoal - 1.8, 7.5, 23)),
        y: clamp(pitch.width / 2 + sideSign * 4.6, 10, pitch.width - 10),
      },
      farPostCover: {
        x: getDepthX(teamId, clamp(context.ballFromOwnGoal - 3.8, 6.5, 20)),
        y: clamp(pitch.width / 2 - sideSign * 9.4, 7, pitch.width - 7),
      },
    };
    return clampToPitch(points[slot] ?? points.centralGate, 2.1);
  }

  function getDefensivePostRecoveryOutletOptions(context) {
    const attackSign = getAttackDirectionSign(context.attackingTeamId);
    return state.players
      .filter((player) => player.team === context.attackingTeamId && !isGoalkeeper(player))
      .map((player) => {
        const forwardGap = (player.position.x - context.targetPoint.x) * attackSign;
        const gap = distance(player.position, context.targetPoint);
        const threat = getPitchThreatProfile(player.position, context.attackingTeamId);
        const roleKey = getOffensiveRoleKey(player, teams[player.team]?.formation);
        const outletScore =
          threat.value * 0.44 +
          clamp(forwardGap / 18, -0.08, 0.34) +
          (["striker", "wideForward", "secondStriker", "connector"].includes(roleKey) ? 0.18 : 0) -
          gap * 0.014;
        return {
          player,
          position: cloneVector(player.position),
          roleKey,
          threat,
          gap,
          outletScore,
        };
      })
      .filter((option) => option.gap <= 30 && option.outletScore >= 0.08)
      .sort((a, b) => b.outletScore - a.outletScore);
  }

  function applyDefensivePostRecoveryResponseTargets(
    teamId,
    targets,
    groups,
    basePresser,
    ballPoint,
    profile,
    protectedIds = new Set()
  ) {
    const context = getDefensivePostRecoveryResponseContext(teamId, ballPoint, profile);
    if (!context) {
      return {
        presser: basePresser,
        labels: [],
        focusPoint: null,
        protectedIds: new Set(protectedIds),
      };
    }
    const labels = [];
    const assignedIds = new Set([
      ...protectedIds,
      ...groups.gk.map((goalkeeper) => goalkeeper.id),
    ].filter(Boolean));
    let presser = basePresser;
    const assign = (slot, lineKeys, preferLabels, label, outlet = null) => {
      const target = getDefensivePostRecoveryResponseTarget(teamId, context, slot, outlet);
      const player = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
      if (!player) {
        return null;
      }
      targets.set(player.id, target);
      assignedIds.add(player.id);
      if (label) {
        labels.push(label);
      }
      return player;
    };
    const delayTarget = getDefensivePostRecoveryResponseTarget(
      teamId,
      context,
      context.mode === "jumpFirstPass" ? "jumpFirstPass" : "delayCarrier"
    );
    const presserCanRespond =
      presser &&
      !assignedIds.has(presser.id) &&
      !isGoalkeeper(presser) &&
      distance(presser.position, delayTarget) <= (context.transitionThreat ? 24 : 19);
    if (presserCanRespond) {
      targets.set(presser.id, delayTarget);
      assignedIds.add(presser.id);
      labels.push(context.mode === "jumpFirstPass" ? "Post-recovery defence: jump first pass" : "Post-recovery defence: delay counter");
    } else {
      const delayPlayer = assign(
        context.mode === "jumpFirstPass" ? "jumpFirstPass" : "delayCarrier",
        context.finalThirdThreat ? ["back", "midfield", "forward"] : ["midfield", "forward", "back"],
        context.mode === "jumpFirstPass" ? ["9", "10", "W", "8", "6"] : ["6", "8", "CB", "10", "WB", "LB", "RB"],
        context.mode === "jumpFirstPass" ? "Post-recovery defence: jump first pass" : "Post-recovery defence: delay counter"
      );
      presser = delayPlayer ?? presser;
    }
    const outlets = getDefensivePostRecoveryOutletOptions(context);
    assign("centralGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Post-recovery defence: close central gate");
    if (context.transitionThreat || context.mode === "delayCounter") {
      assign("counterLaneGate", ["midfield", "back"], ["6", "8", "CB", "10"], "Post-recovery defence: block counter lane");
    }
    outlets.slice(0, context.transitionThreat ? 2 : 1).forEach((outlet, index) => {
      assign(
        "firstOutletLock",
        index === 0 ? ["midfield", "forward", "back"] : ["midfield", "back", "forward"],
        outlet.threat.box >= 0.12 || outlet.threat.centralPocket >= 0.2
          ? ["6", "8", "CB", "10"]
          : ["W", "8", "LB", "RB", "WB", "10"],
        index === 0 ? "Post-recovery defence: lock first outlet" : "Post-recovery defence: lock next outlet",
        outlet
      );
    });
    if (context.switchExit || context.sameLaneStall) {
      assign("switchLock", ["back", "midfield"], ["WB", "LB", "RB", "W", "8"], "Post-recovery defence: protect switch");
    }
    assign("restLineCover", ["back"], ["CB", "LB", "RB", "WB"], "Post-recovery defence: protect depth");
    assign("weakSideRecover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Post-recovery defence: weak side recovers");
    if (context.finalThirdThreat) {
      assign("boxCover", ["back", "midfield"], ["CB", "6", "LB", "RB", "WB"], "Post-recovery defence: protect box");
      assign("farPostCover", ["back", "midfield"], ["CB", "LB", "RB", "WB", "6"], "Post-recovery defence: cover far post");
    }
    if (labels.length) {
      labels.unshift(
        context.mode === "delayCounter"
          ? "Defend post-recovery counter"
          : context.mode === "jumpFirstPass"
            ? "Defend post-recovery first pass"
            : "Defend post-recovery shape"
      );
    }
    return {
      presser,
      labels: uniquePrincipleLabels(labels),
      focusPoint: context.targetPoint,
      protectedIds: assignedIds,
    };
  }

  return {
    getDefensivePostRecoveryResponseContext,
    getDefensivePostRecoveryResponseTarget,
    getDefensivePostRecoveryOutletOptions,
    applyDefensivePostRecoveryResponseTargets,
  };
}
