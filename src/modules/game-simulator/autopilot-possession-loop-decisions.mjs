export function createGameSimulatorAutopilotPossessionLoopDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAttackingThirdKey,
    getAutoPilotCandidatePattern,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getRecentPossessionSteps,
    getRecordedStepActorIds,
    getRecordedStepPattern,
    isWideChannel,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotPossessionLoopAdjustment(candidate, carrier, startPoint, profile) {
    if (!candidate?.target || !carrier?.team || !startPoint) {
      return { score: 0, labels: [], context: null };
    }
    const teamId = carrier.team;
    const recent = getRecentPossessionSteps(teamId, 8);
    if (!recent.length) {
      return { score: 0, labels: [], context: null };
    }
    const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
    const rhythm = getPossessionRhythmContext(teamId, 8);
    const lastStep = recent[0] ?? null;
    const lastActors = getRecordedStepActorIds(lastStep);
    const candidateReceiverId = candidate.receiverPlayerId ?? null;
    const targetThreat = getPitchThreatProfile(candidate.target, teamId);
    const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
    const laneShiftFromLast = lastStep?.target
      ? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(getPitchLaneKey(lastStep.target)))
      : 0;
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const sameLaneThirdCount = recent
      .map((step) => getRecordedStepPattern(step, teamId))
      .filter(Boolean)
      .filter((entry) => entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey)
      .length;
    const sameTargetClusterCount = recent
      .filter((step) => step.target && distance(step.target, candidate.target) <= 8.5)
      .length;
    const sameReceiverCount = candidateReceiverId
      ? recent.filter((step) => (getRecordedStepActorIds(step).receiverId ?? null) === candidateReceiverId).length
      : 0;
    const samePairCount = candidateReceiverId
      ? recent.filter((step) => {
        const actors = getRecordedStepActorIds(step);
        return actors.carrierId === carrier.id && actors.receiverId === candidateReceiverId;
      }).length
      : 0;
    const directReturn =
      candidate.actionType === "pass" &&
      candidateReceiverId &&
      lastActors.carrierId === candidateReceiverId &&
      lastActors.receiverId === carrier.id;
    const thirdPlayerRelease =
      candidate.actionType === "pass" &&
      candidateReceiverId &&
      candidateReceiverId !== lastActors.carrierId &&
      candidateReceiverId !== lastActors.receiverId &&
      pattern.forwardGain >= 2.5;
    const highValueException =
      candidate.actionType === "shot" ||
      candidate.mustShoot ||
      candidate.isBoxPass ||
      candidate.isLineBreak ||
      targetThreat.value >= 0.66 ||
      actionSpace.lineBreakCount >= 2;
    const staleLowValue =
      !highValueException &&
      pattern.forwardGain < 4 &&
      !candidate.isSwitch &&
      actionSpace.value < 0.42;
    const labels = [];
    let score = 0;
    if (directReturn && staleLowValue && pressure < 0.62) {
      score -= 0.92 + profile.progressionUrgency * 0.34;
      labels.push("Avoid two-player loop");
    } else if (directReturn && pattern.forwardGain >= 5 && (candidate.isLineBreak || actionSpace.lineBreakCount >= 1)) {
      score += 0.18;
      labels.push("Bounce forward");
    }
    if (samePairCount >= 1 && staleLowValue && pressure < 0.66) {
      score -= 0.42 + Math.min(samePairCount, 3) * 0.22;
      labels.push("Find third player");
    }
    if (sameReceiverCount >= 2 && staleLowValue) {
      score -= 0.26 + Math.min(sameReceiverCount - 1, 3) * 0.16;
    }
    if (sameTargetClusterCount >= 2 && staleLowValue) {
      score -= 0.36 + Math.min(sameTargetClusterCount, 4) * 0.18;
      labels.push("Leave repeated zone");
    }
    if (sameLaneThirdCount >= 3 && staleLowValue) {
      score -= 0.34 + Math.min(sameLaneThirdCount - 2, 3) * 0.18;
      labels.push("Change corridor");
    }
    if (
      rhythm.steps >= 3 &&
      rhythm.forwardPasses === 0 &&
      rhythm.lineBreaks === 0 &&
      pattern.forwardGain < 3 &&
      !candidate.isSwitch &&
      candidate.actionType !== "shot"
    ) {
      score -= 0.48 + profile.progressionUrgency * 0.42;
      labels.push("Break sterile circulation");
    }
    if (
      rhythm.steps >= 2 &&
      (candidate.isLineBreak || actionSpace.lineBreakCount >= 1 || pattern.forwardGain >= 7) &&
      (sameLaneThirdCount >= 2 || rhythm.backPasses >= 1 || rhythm.sidewaysPasses >= 2)
    ) {
      score += 0.26 + profile.progressionUrgency * 0.22;
      labels.push("Play out of the loop");
    }
    if (
      thirdPlayerRelease &&
      (samePairCount >= 1 || directReturn || sameLaneThirdCount >= 2 || rhythm.sidewaysPasses >= 2) &&
      actionSpace.targetPressure <= 0.74
    ) {
      score += 0.22 + profile.shortSupport * 0.12 + profile.tempo * 0.1;
      labels.push("Third-player release");
    }
    if (
      candidate.actionType === "dribble" &&
      pattern.forwardGain >= 4.5 &&
      (rhythm.sidewaysPasses >= 2 || sameLaneThirdCount >= 2) &&
      pressure <= 0.68
    ) {
      score += 0.24 + profile.carryBias * 0.22;
      labels.push("Carry out of pressure");
    }
    if (
      candidate.isSwitch &&
      laneShiftFromLast >= 2 &&
      (sameLaneThirdCount >= 2 || rhythm.sidewaysPasses >= 1) &&
      (candidate.laneClarity ?? 0.5) >= 0.42
    ) {
      score += 0.24 + profile.switchBias * 0.22;
      labels.push("Escape to weak side");
    }
    return {
      score: clamp(score, -1.75, 0.88),
      labels: uniquePrincipleLabels(labels),
      context: {
        sameLaneThirdCount,
        sameTargetClusterCount,
        sameReceiverCount,
        samePairCount,
        directReturn,
        thirdPlayerRelease,
        pattern,
      },
    };
  }

  function getAutoPilotCorridorTempoReleaseAdjustment(candidate, carrier, startPoint, profile = {}) {
    if (!candidate?.target || !carrier?.team || !startPoint) {
      return { score: 0, labels: [], context: null };
    }
    const teamId = carrier.team;
    const recent = getRecentPossessionSteps(teamId, 7);
    if (recent.length < 2) {
      return { score: 0, labels: [], context: null };
    }
    const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
    const recentPatterns = recent
      .map((step) => getRecordedStepPattern(step, teamId))
      .filter(Boolean);
    const rhythm = getPossessionRhythmContext(teamId, 8);
    const startThreat = getPitchThreatProfile(startPoint, teamId);
    const targetThreat = getPitchThreatProfile(candidate.target, teamId);
    const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
    const startGameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
    const targetGameSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
    const pressure = getPlayerPressureLoad(carrier, startPoint);
    const startLaneIndex = getPitchLaneIndex(startPoint);
    const targetLaneIndex = getPitchLaneIndex(pattern.laneKey);
    const laneShiftFromStart = Math.abs(targetLaneIndex - startLaneIndex);
    const lastPattern = recentPatterns[0] ?? null;
    const laneShiftFromLast = lastPattern
      ? Math.abs(targetLaneIndex - getPitchLaneIndex(lastPattern.laneKey))
      : laneShiftFromStart;
    const currentThirdKey = getAttackingThirdKey(startPoint, teamId);
    const sameCorridorRecent = recentPatterns
      .slice(0, 4)
      .filter((entry) => entry.laneKey === getPitchLaneKey(startPoint) && entry.thirdKey === currentThirdKey)
      .length;
    const consecutiveSameCorridor = (() => {
      let count = 0;
      for (const entry of recentPatterns) {
        if (entry.laneKey === getPitchLaneKey(startPoint) && entry.thirdKey === currentThirdKey) {
          count += 1;
        } else {
          break;
        }
      }
      return count;
    })();
    const recentThreatGain = recent
      .slice(0, 4)
      .reduce((total, step) => {
        const from = step.beforeSnapshot?.ball?.position ?? null;
        const to = step.target ?? step.afterSnapshot?.ball?.position ?? null;
        return from && to ? total + Math.max(0, getActionThreatGain(from, to, teamId)) : total;
      }, 0);
    const corridorLoad = clamp(
      sameCorridorRecent * 0.22 +
        consecutiveSameCorridor * 0.28 +
        rhythm.sidewaysPasses * 0.14 +
        rhythm.backPasses * 0.18 +
        (rhythm.lineBreaks === 0 ? 0.22 : -0.16) +
        (recentThreatGain <= 0.12 ? 0.18 : -0.12),
      0,
      1.45
    );
    const finalThirdStart = getAttackingDepth(startPoint, teamId) >= 66 || startThreat.value >= 0.52;
    const wideStart = isWideChannel(startPoint);
    const highValueAction =
      candidate.actionType === "shot" ||
      candidate.mustShoot ||
      candidate.isBoxPass ||
      candidate.isLineBreak ||
      targetThreat.value >= startThreat.value + 0.09 ||
      actionSpace.lineBreakCount >= 1 ||
      targetGameSpace.index > startGameSpace.index;
    const switchRelease =
      candidate.actionType === "pass" &&
      (candidate.isSwitch || laneShiftFromStart >= 2 || laneShiftFromLast >= 2) &&
      (candidate.laneClarity ?? 0.55) >= 0.42 &&
      actionSpace.targetPressure <= 0.76;
    const diagonalRelease =
      candidate.actionType === "pass" &&
      laneShiftFromStart >= 1 &&
      pattern.forwardGain >= 4.5 &&
      actionSpace.targetPressure <= 0.7 &&
      (targetGameSpace.index >= startGameSpace.index || targetThreat.value >= startThreat.value + 0.05);
    const carryRelease =
      candidate.actionType === "dribble" &&
      pattern.forwardGain >= 4.5 &&
      actionSpace.openTarget >= 0.45 &&
      pressure <= 0.68;
    const endProductRelease =
      finalThirdStart &&
      (
        candidate.actionType === "shot" ||
        candidate.label === "cutback" ||
        candidate.label === "cross" ||
        targetThreat.cutbackZone >= 0.32 ||
        targetThreat.box >= 0.28
      );
    const sterileSameCorridor =
      candidate.actionType === "pass" &&
      !candidate.isSwitch &&
      laneShiftFromStart <= 1 &&
      pattern.forwardGain < 3.5 &&
      actionSpace.lineBreakCount === 0 &&
      targetThreat.value <= startThreat.value + 0.04;
    const hopefulRelease =
      switchRelease &&
      (candidate.laneClarity ?? 0.55) < 0.52 &&
      actionSpace.targetPressure >= 0.62 &&
      !highValueAction;
    const stylePrefersCirculation =
      profile.styleKey === "control-possession" ||
      profile.styleKey === "tiki-taka" ||
      profile.styleKey === "fluid-combinations";
    const stylePrefersWidth =
      profile.styleKey === "wing-play" ||
      profile.styleKey === "overlap-wide" ||
      profile.crossBias >= 0.64;
    const labels = [];
    let score = 0;
    if (corridorLoad >= 0.58) {
      if (diagonalRelease) {
        score += 0.28 + profile.lineBreakBias * 0.16 + (stylePrefersCirculation ? 0.1 : 0);
        labels.push("Corridor: diagonal release");
      }
      if (switchRelease) {
        score += 0.22 + profile.switchBias * 0.2 + (stylePrefersWidth ? 0.08 : 0);
        labels.push("Corridor: change point of attack");
      }
      if (carryRelease) {
        score += 0.22 + profile.carryBias * 0.18;
        labels.push("Corridor: carry out of lane");
      }
      if (endProductRelease) {
        score += 0.3 + profile.shootBias * 0.16 + profile.deliveryBias * 0.12;
        labels.push("Corridor: create end product");
      }
      if (sterileSameCorridor && pressure <= 0.62) {
        score -= 0.36 + corridorLoad * 0.42 + profile.progressionUrgency * 0.2;
        labels.push("Corridor: stop same-lane circulation");
      }
    }
    if (
      wideStart &&
      stylePrefersWidth &&
      sameCorridorRecent >= 2 &&
      !endProductRelease &&
      candidate.actionType === "pass" &&
      !candidate.isSwitch &&
      targetThreat.assistZone < 0.28 &&
      targetThreat.cutbackZone < 0.28
    ) {
      score -= 0.2 + profile.crossBias * 0.12;
      labels.push("Corridor: finish wide overload");
    }
    if (hopefulRelease) {
      score -= 0.18 + (1 - (candidate.laneClarity ?? 0.55)) * 0.22;
    }
    if (corridorLoad < 0.46 && sterileSameCorridor && rhythm.steps <= 1 && stylePrefersCirculation) {
      score += 0.08;
    }
    return {
      score: clamp(score, -1.25, 1.05),
      labels: uniquePrincipleLabels(labels),
      context: {
        corridorLoad,
        sameCorridorRecent,
        consecutiveSameCorridor,
        recentThreatGain,
        laneShiftFromStart,
        laneShiftFromLast,
        startGameSpaceKey: startGameSpace.key,
        targetGameSpaceKey: targetGameSpace.key,
        switchRelease,
        diagonalRelease,
        carryRelease,
        endProductRelease,
        sterileSameCorridor,
      },
    };
  }

  return {
    getAutoPilotPossessionLoopAdjustment,
    getAutoPilotCorridorTempoReleaseAdjustment,
  };
}
