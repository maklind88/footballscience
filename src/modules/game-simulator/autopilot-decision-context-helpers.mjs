export function createGameSimulatorAutopilotDecisionContextHelpers(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getAttackingThirdKey,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getRecordedStepPossessionTeamId,
    getTeamSupportCountAroundPoint,
    isWideChannel,
    lerp,
    pitch,
    state,
    teams,
  } = deps;

  function isLastStepKickoffResetForTeam(teamId) {
    const lastStep = state.sequence?.steps?.[state.sequence.steps.length - 1];
    return (
      lastStep?.restartPhase?.type === "kickoff" &&
      getRecordedStepPossessionTeamId(lastStep) === teamId
    );
  }

  function getRecentLaneRepeatCount(teamId, laneKey, thirdKey = null, limit = 4) {
    return getRecentPossessionSteps(teamId, limit).reduce((count, step) => {
      const target = step.target;
      if (!target || getPitchLaneKey(target) !== laneKey) {
        return count;
      }
      if (thirdKey && getAttackingThirdKey(target, teamId) !== thirdKey) {
        return count;
      }
      return count + 1;
    }, 0);
  }

  function isFrontLineRole(roleKey) {
    return roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward";
  }

  function isSupportRole(roleKey) {
    return roleKey === "pivot" || roleKey === "connector" || roleKey === "wideBack";
  }

  function getStepReceiverRoleKey(step, teamId) {
    const receiver = getPlayerById(step?.receiverPlayerId);
    if (!receiver || receiver.team !== teamId) {
      return null;
    }
    return getOffensiveRoleKey(receiver, teams[teamId]?.formation);
  }

  function getAutoPilotFlowContext(carrier, startPoint) {
    const teamId = carrier.team;
    const recent = getRecentPossessionSteps(teamId, 6);
    const lastStep = recent[0] ?? null;
    const carrierRoleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
    let consecutivePasses = 0;
    let recentFrontLineTargets = 0;
    let recentSupportTargets = 0;
    let recentWideTargets = 0;
    const receiverRoleCounts = new Map();
    recent.forEach((step, index) => {
      if (index === consecutivePasses && step.actionType === "pass") {
        consecutivePasses += 1;
      }
      const receiverRoleKey = getStepReceiverRoleKey(step, teamId);
      if (receiverRoleKey) {
        receiverRoleCounts.set(receiverRoleKey, (receiverRoleCounts.get(receiverRoleKey) ?? 0) + 1);
        if (isFrontLineRole(receiverRoleKey)) {
          recentFrontLineTargets += 1;
        }
        if (isSupportRole(receiverRoleKey)) {
          recentSupportTargets += 1;
        }
      }
      if (step.target) {
        const laneKey = getPitchLaneKey(step.target);
        if (laneKey === "leftWide" || laneKey === "rightWide") {
          recentWideTargets += 1;
        }
      }
    });
    const carrierJustReceived =
      lastStep?.actionType === "pass" &&
      lastStep.receiverPlayerId === carrier.id &&
      getRecordedStepDuration(lastStep) <= 3.2;
    const lastCarrierId = lastStep?.beforeSnapshot?.ball?.ownerPlayerId ?? lastStep?.carrierPlayerId ?? null;
    const lastReceiverId = lastStep?.receiverPlayerId ?? null;
    return {
      recent,
      lastStep,
      carrierRoleKey,
      carrierJustReceived,
      consecutivePasses,
      recentFrontLineTargets,
      recentSupportTargets,
      recentWideTargets,
      receiverRoleCounts,
      lastCarrierId,
      lastReceiverId,
      pressure: getPlayerPressureLoad(carrier, startPoint),
    };
  }

  function getLastAutoPrincipleSet(teamId) {
    const lastStep = getRecentPossessionSteps(teamId, 4)[0] ?? null;
    const labels = [
      ...(lastStep?.autoPrinciples ?? []),
      lastStep?.offensiveAutopilot?.principleLabel,
      lastStep?.offensiveAutopilot?.principleKey,
    ].filter(Boolean);
    return new Set(labels);
  }

  function principleSetIncludes(principles, text) {
    return [...principles].some((label) => `${label}`.toLowerCase().includes(text.toLowerCase()));
  }

  function isTransitionAttackStyle(styleKey) {
    return [
      "direct-transition",
      "counter-attack",
      "fluid-counter-attack",
      "gegenpress",
      "vertical-play",
      "vertical-tiki-taka",
    ].includes(styleKey);
  }

  function getSecurePossessionSnapshotForTeam(teamId, actionMeta = null) {
    const secure = state.ball.securePossession ?? actionMeta?.beforeSnapshot?.ball?.securePossession ?? null;
    if (!secure?.ownerPlayerId) {
      return null;
    }
    const owner = getPlayerById(secure.ownerPlayerId);
    return owner?.team === teamId ? secure : null;
  }

  function getAutoPilotRegainContext(carrier, startPoint = carrier?.position, profile = {}) {
    if (!carrier) {
      return { active: false };
    }
    const secure = getSecurePossessionSnapshotForTeam(carrier.team);
    if (!secure || secure.ownerPlayerId !== carrier.id) {
      return { active: false };
    }
    const origin = secure.point ?? startPoint ?? carrier.position;
    const movedFromRegain = distance(startPoint ?? carrier.position, origin);
    const elapsed = Math.max(0, state.time - (secure.createdAt ?? state.time));
    const minDistance = secure.minDistanceToExpire ?? 6;
    const minTime = secure.minTimeToExpire ?? 1.35;
    const freshness = clamp(
      1 - Math.max(movedFromRegain / Math.max(minDistance * 1.25, 0.01), elapsed / Math.max(minTime * 1.25, 0.01)),
      0,
      1
    );
    if (freshness <= 0.02) {
      return { active: false };
    }
    const pressure = getPlayerPressureLoad(carrier, startPoint ?? carrier.position);
    const forwardProbe = clampToPitch({
      x: (startPoint?.x ?? carrier.position.x) + getAttackDirectionSign(carrier.team) * 18,
      y: lerp(startPoint?.y ?? carrier.position.y, pitch.width / 2, 0.28),
    }, 2.5);
    const forwardOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, forwardProbe));
    const localSupport = getTeamSupportCountAroundPoint(carrier.team, startPoint ?? carrier.position, new Set([carrier.id]), 13);
    const directStyle = isTransitionAttackStyle(profile.styleKey);
    const counterIntent = clamp(
      (profile.directness ?? 0.5) * 0.42 +
      (profile.progressionUrgency ?? 0.5) * 0.32 +
      (profile.tempo ?? 0.5) * 0.14 +
      (directStyle ? 0.22 : 0) +
      (secure.reason === "interception" ? 0.1 : 0),
      0,
      1.25
    );
    const secureIntent = clamp(
      (profile.shortSupport ?? 0.5) * 0.38 +
      (profile.recycleWindow ?? 0.4) * 0.22 +
      pressure * 0.34 +
      (localSupport >= 2 ? 0.14 : 0) +
      (directStyle ? -0.08 : 0.18),
      0,
      1.2
    );
    return {
      active: true,
      reason: secure.reason ?? "regain",
      origin: cloneVector(origin),
      movedFromRegain,
      elapsed,
      freshness,
      pressure,
      forwardOpenSpace,
      localSupport,
      directStyle,
      counterIntent,
      secureIntent,
    };
  }

  function getAutoPilotCandidatePattern(candidate, carrier, startPoint) {
    if (!candidate || !carrier || !candidate.target) {
      return {
        family: "unknown",
        laneKey: "central",
        thirdKey: "build",
        receiverRoleKey: null,
        targetSpaceLabel: "open space",
        forwardGain: 0,
        passDistance: 0,
      };
    }
    const targetLaneKey = getPitchLaneKey(candidate.target);
    const targetThirdKey = getAttackingThirdKey(candidate.target, carrier.team);
    const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
    const forwardGain =
      candidate.forwardGain ??
      ((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
    const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
    const receiverRoleKey =
      candidate.receiverRoleKey ??
      (receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
    const targetSpace = getPitchThreatProfile(candidate.target, carrier.team);
    let family = "connect";
    if (candidate.actionType === "shot") {
      family = "shot";
    } else if (candidate.actionType === "dribble") {
      family = forwardGain >= 6 ? "carry-forward" : "carry-control";
    } else if (candidate.actionType === "pass") {
      if (candidate.label === "cutback") {
        family = "cutback";
      } else if (candidate.label === "cross") {
        family = "cross";
      } else if (candidate.isSwitch) {
        family = "switch";
      } else if (candidate.principleKey?.includes("wide") || candidate.label === "wide entry") {
        family = "wide-overload";
      } else if (candidate.isLineBreak || forwardGain >= 8) {
        family = "line-break";
      } else if (forwardGain <= -4.5) {
        family = "recycle";
      } else if (passDistance <= 17 && isSupportRole(receiverRoleKey)) {
        family = "support-link";
      } else if (isFrontLineRole(receiverRoleKey)) {
        family = "front-line";
      }
    }
    return {
      family,
      laneKey: targetLaneKey,
      thirdKey: targetThirdKey,
      receiverRoleKey,
      targetSpaceLabel: targetSpace.primaryLabel,
      forwardGain,
      passDistance,
    };
  }

  function getRecordedStepPattern(step, teamId) {
    if (!step?.target || !teamId) {
      return null;
    }
    const startPoint = step.beforeSnapshot?.ball?.position ?? null;
    const target = step.target;
    const targetLaneKey = getPitchLaneKey(target);
    const targetThirdKey = getAttackingThirdKey(target, teamId);
    const forwardGain =
      startPoint && target
        ? (target.x - startPoint.x) * getAttackDirectionSign(teamId)
        : 0;
    const lateralMeters = startPoint && target ? Math.abs(target.y - startPoint.y) : 0;
    const passDistance = startPoint && target ? distance(startPoint, target) : 0;
    const receiverRoleKey = getStepReceiverRoleKey(step, teamId);
    const targetSpace = getPitchThreatProfile(target, teamId);
    const principleText = [
      ...(step.autoPrinciples ?? []),
      step.offensiveAutopilot?.principleKey,
      step.offensiveAutopilot?.principleLabel,
      step.profileLabel,
    ].filter(Boolean).join(" ").toLowerCase();
    let family = "connect";
    if (step.actionType === "shot") {
      family = "shot";
    } else if (step.actionType === "dribble") {
      family = forwardGain >= 6 ? "carry-forward" : "carry-control";
    } else if (step.actionType === "pass") {
      if (principleText.includes("cutback") || step.profileLabel?.toLowerCase?.().includes("cutback")) {
        family = "cutback";
      } else if (principleText.includes("cross")) {
        family = "cross";
      } else if (principleText.includes("change corridor") || (lateralMeters >= 19 && passDistance >= 22)) {
        family = "switch";
      } else if (principleText.includes("wide") || principleText.includes("overlap")) {
        family = "wide-overload";
      } else if (principleText.includes("line break") || forwardGain >= 8) {
        family = "line-break";
      } else if (forwardGain <= -4.5) {
        family = "recycle";
      } else if (passDistance <= 17 && isSupportRole(receiverRoleKey)) {
        family = "support-link";
      } else if (isFrontLineRole(receiverRoleKey)) {
        family = "front-line";
      }
    }
    return {
      family,
      laneKey: targetLaneKey,
      thirdKey: targetThirdKey,
      receiverRoleKey,
      targetSpaceLabel: targetSpace.primaryLabel,
      forwardGain,
      passDistance,
    };
  }

  function getRecordedStepActorIds(step) {
    return {
      carrierId:
        step?.beforeSnapshot?.ball?.ownerPlayerId ??
        step?.carrierPlayerId ??
        step?.initiatorPlayerId ??
        null,
      receiverId:
        step?.receiverPlayerId ??
        step?.afterSnapshot?.ball?.ownerPlayerId ??
        null,
    };
  }

  return {
    isLastStepKickoffResetForTeam,
    getRecentLaneRepeatCount,
    isFrontLineRole,
    isSupportRole,
    getStepReceiverRoleKey,
    getAutoPilotFlowContext,
    getLastAutoPrincipleSet,
    principleSetIncludes,
    isTransitionAttackStyle,
    getSecurePossessionSnapshotForTeam,
    getAutoPilotRegainContext,
    getAutoPilotCandidatePattern,
    getRecordedStepPattern,
    getRecordedStepActorIds,
  };
}
