export function createGameSimulatorAutopilotCombinationChainDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getAutoPilotCandidateReceiver,
    getNearestOpponentGap,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getRecordedStepActorIds,
    getRecordedStepDuration,
    teams,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotCombinationChainContext(carrier, startPoint, profile = {}) {
    if (!carrier?.team || !startPoint) {
      return { active: false };
    }
    const teamId = carrier.team;
    const recent = getRecentPossessionSteps(teamId, 6);
    const lastStep = recent[0] ?? null;
    if (!lastStep || lastStep.actionType !== "pass") {
      return {
        active: false,
        recent,
      };
    }
    const actors = getRecordedStepActorIds(lastStep);
    const carrierReceived =
      actors.receiverId === carrier.id ||
      lastStep.afterSnapshot?.ball?.ownerPlayerId === carrier.id;
    const duration = getRecordedStepDuration(lastStep);
    if (!carrierReceived || duration > 3.4) {
      return {
        active: false,
        recent,
        carrierReceived,
        duration,
      };
    }
    const incomingStart =
      lastStep.beforeSnapshot?.ball?.position ??
      lastStep.beforeSnapshot?.ball?.startPosition ??
      null;
    const incomingTarget = lastStep.target ?? startPoint;
    const incomingLane = incomingStart ? getPitchLaneKey(incomingStart) : getPitchLaneKey(incomingTarget);
    const currentLane = getPitchLaneKey(startPoint);
    const incomingForwardGain =
      incomingStart && incomingTarget
        ? (incomingTarget.x - incomingStart.x) * getAttackDirectionSign(teamId)
        : 0;
    const incomingLaneShift =
      incomingLane && currentLane
        ? Math.abs(getPitchLaneIndex(currentLane) - getPitchLaneIndex(incomingLane))
        : 0;
    let consecutivePasses = 0;
    for (const step of recent) {
      if (step.actionType !== "pass") {
        break;
      }
      consecutivePasses += 1;
    }
    return {
      active: true,
      teamId,
      recent,
      lastStep,
      lastCarrierId: actors.carrierId,
      lastReceiverId: actors.receiverId,
      duration,
      incomingStart,
      incomingTarget,
      incomingLane,
      currentLane,
      incomingForwardGain,
      incomingLaneShift,
      consecutivePasses,
      pressure: getPlayerPressureLoad(carrier, startPoint),
      nearestGap: getNearestOpponentGap(carrier, startPoint),
      startThreat: getPitchThreatProfile(startPoint, teamId),
      startSpace: getAttackingGameSpaceProfile(startPoint, teamId),
      carrierRoleKey: getOffensiveRoleKey(carrier, teams[teamId]?.formation),
      tempoFit: clamp((profile.tempo ?? 0.5) * 0.58 + (profile.shortSupport ?? 0.5) * 0.42, 0, 1),
    };
  }

  function getAutoPilotCombinationChainAdjustment(candidate, carrier, startPoint, profile = {}) {
    const context = getAutoPilotCombinationChainContext(carrier, startPoint, profile);
    if (!context.active || !candidate?.target) {
      return {
        score: 0,
        labels: [],
        context,
      };
    }
    const teamId = carrier.team;
    const target = candidate.target;
    const targetLane = getPitchLaneKey(target);
    const laneShiftFromCurrent = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.currentLane));
    const laneShiftFromIncoming = context.incomingLane
      ? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.incomingLane))
      : laneShiftFromCurrent;
    const candidateReceiver = getAutoPilotCandidateReceiver(candidate, carrier);
    const candidateReceiverId =
      candidate.receiverPlayerId ??
      candidate.principleRunnerPlayerId ??
      candidateReceiver?.id ??
      null;
    const receiverRoleKey =
      candidate.receiverRoleKey ??
      (candidateReceiver ? getOffensiveRoleKey(candidateReceiver, teams[teamId]?.formation) : null);
    const forwardGain =
      candidate.forwardGain ??
      ((target.x - startPoint.x) * getAttackDirectionSign(teamId));
    const passDistance = candidate.passDistance ?? distance(startPoint, target);
    const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
    const targetThreat = actionSpace.targetThreat;
    const directReturn =
      candidate.actionType === "pass" &&
      candidateReceiverId &&
      candidateReceiverId === context.lastCarrierId;
    const thirdPlayerRelease =
      candidate.actionType === "pass" &&
      candidateReceiverId &&
      candidateReceiverId !== context.lastCarrierId &&
      candidateReceiverId !== context.lastReceiverId &&
      (
        forwardGain >= 2.5 ||
        actionSpace.lineBreakCount >= 1 ||
        actionSpace.value >= 0.38 ||
        laneShiftFromIncoming >= 1
      );
    const wallPassWithPurpose =
      directReturn &&
      (
        context.pressure >= 0.58 ||
        forwardGain >= 5 ||
        candidate.isLineBreak ||
        actionSpace.lineBreakCount >= 1 ||
        targetThreat.value >= context.startThreat.value + 0.08
      );
    const deadBounce =
      directReturn &&
      !wallPassWithPurpose &&
      context.pressure < 0.58 &&
      targetThreat.value <= context.startThreat.value + 0.04 &&
      !candidate.isSwitch;
    const aroundCorner =
      thirdPlayerRelease &&
      passDistance <= 22 &&
      laneShiftFromCurrent >= 1 &&
      (receiverRoleKey === "connector" || receiverRoleKey === "pivot" || receiverRoleKey === "wideBack");
    const receiveAndDrive =
      candidate.actionType === "dribble" &&
      forwardGain >= 4.2 &&
      context.pressure <= 0.68 &&
      (
        actionSpace.openTarget >= 0.42 ||
        context.startSpace.key === "space2" ||
        context.startThreat.betweenLines >= 0.3 ||
        context.startThreat.halfSpace >= 0.3
      );
    const lowValueSafety =
      candidate.actionType === "pass" &&
      forwardGain <= -4.5 &&
      context.pressure <= 0.48 &&
      targetThreat.value <= context.startThreat.value + 0.035 &&
      actionSpace.lineBreakCount === 0;
    const labels = [];
    let score = 0;
    if (thirdPlayerRelease) {
      score +=
        0.24 +
        context.tempoFit * 0.24 +
        (profile.lineBreakBias ?? 0.5) * 0.12 +
        Math.max(0, targetThreat.value - context.startThreat.value) * 0.3 +
        (actionSpace.lineBreakCount >= 1 ? 0.16 : 0);
      labels.push("Third-man chain");
    }
    if (aroundCorner) {
      score += 0.16 + (profile.shortSupport ?? 0.5) * 0.12;
      labels.push("Play around the corner");
    }
    if (wallPassWithPurpose) {
      score += 0.14 + context.pressure * 0.12 + (candidate.isLineBreak ? 0.12 : 0);
      labels.push("Wall pass with purpose");
    }
    if (receiveAndDrive) {
      score +=
        0.22 +
        (profile.carryBias ?? 0.5) * 0.18 +
        actionSpace.openTarget * 0.16 +
        (context.consecutivePasses >= 2 ? 0.12 : 0);
      labels.push("Receive and drive");
    }
    if (deadBounce) {
      score -= 0.78 + Math.max(0, 0.62 - context.pressure) * 0.28;
      labels.push("Avoid dead bounce");
    }
    if (lowValueSafety && !deadBounce) {
      score -= 0.28 + (profile.progressionUrgency ?? 0.5) * 0.2;
    }
    if (
      context.consecutivePasses >= 2 &&
      candidate.actionType === "pass" &&
      !thirdPlayerRelease &&
      !candidate.isSwitch &&
      !candidate.isBoxPass &&
      forwardGain < 3 &&
      context.pressure < 0.56
    ) {
      score -= 0.18 + Math.min(context.consecutivePasses, 4) * 0.08;
    }
    return {
      score: clamp(score, -1.35, 1.05),
      labels: uniquePrincipleLabels(labels),
      context: {
        directReturn,
        thirdPlayerRelease,
        wallPassWithPurpose,
        receiveAndDrive,
        laneShiftFromIncoming,
        incomingForwardGain: context.incomingForwardGain,
        consecutivePasses: context.consecutivePasses,
      },
    };
  }

  return {
    getAutoPilotCombinationChainContext,
    getAutoPilotCombinationChainAdjustment,
  };
}
