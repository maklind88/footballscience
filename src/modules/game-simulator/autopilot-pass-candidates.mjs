export function createGameSimulatorAutopilotPassCandidates(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getForwardFacingSpaceTwoContext,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getState,
    getTeamSupportCountAroundPoint,
    getWideEntryPrincipleContext,
    isPassReceiverOffside,
    isWideChannel,
    pitch,
    teams,
  } = deps;

  function buildAutoPilotPassCandidates(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const formation = teams[teamId]?.formation;
  const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
  const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
  const ballDepth = getAttackingDepth(startPoint, teamId);
  const maxPassDistance = profile.routeOneBias >= 0.55
  ? 36 + profile.directness * 22 + profile.routeOneBias * 18 + (profile.phaseKey === "finalThird" ? 8 : 0)
  : profile.shortSupport >= 0.78 && profile.directness < 0.5
  ? 26 + profile.lineBreakBias * 9 + (profile.phaseKey === "finalThird" ? 5 : 0)
  : 34 + profile.directness * 18 + (profile.phaseKey === "finalThird" ? 7 : 0);
  const rhythm = getPossessionRhythmContext(teamId);
  const possessionMaturity = clamp(
  rhythm.duration / Math.max(profile.targetPossessionSeconds ?? 8.8, 0.1),
  0,
  1.45
  );
  const candidates = [];
  state.players.forEach((receiver) => {
  if (receiver.team !== teamId || receiver.id === carrier.id) {
  return;
  }
  if (isPassReceiverOffside(receiver, startPoint)) {
  return;
  }
  const receiverRoleKey = getOffensiveRoleKey(receiver, formation);
  const target = getPlayerBallControlPoint(receiver);
  const passDistance = distance(startPoint, target);
  if (passDistance < 3.2 || passDistance > maxPassDistance) {
  return;
  }
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const targetDepth = getAttackingDepth(target, teamId);
  const lateralMeters = Math.abs(target.y - startPoint.y);
  const laneClarity = computePassLaneClarity(carrier, target);
  const receiverPressure = getPlayerPressureLoad(receiver, target);
  const supportNearTarget = getTeamSupportCountAroundPoint(
  teamId,
  target,
  new Set([carrier.id, receiver.id]),
  passDistance >= 26 ? 15 : 11
  );
  const wideEntryPrinciple = getWideEntryPrincipleContext(carrier, receiver, startPoint, target, profile);
  const receiverStrength = getAutoPilotRoleStrength(receiver, "receiver");
  const runnerStrength = getAutoPilotRoleStrength(receiver, "runner");
  const creatorStrength = getAutoPilotRoleStrength(carrier, "creator");
  const switchStrength = getAutoPilotRoleStrength(carrier, "switcher");
  const passAndMoveTendency = getPlayerTendency(receiver, "passAndMove");
  const lineBreakTendency = getPlayerTendency(carrier, "lineBreakPass");
  const retainTendency = getPlayerTendency(carrier, "retain");
  const isSwitch = lateralMeters >= 19 && passDistance >= 22;
  const isRouteOnePass =
  profile.routeOneBias >= 0.55 &&
  passDistance >= 20 &&
  forwardGain >= 10 &&
  (receiverRoleKey === "striker" || receiverRoleKey === "secondStriker" || receiverRoleKey === "wideForward");
  const isSwitchOpportunity =
  isSwitch &&
  (ownerPressure >= 0.46 ||
  (profile.switchBias >= 0.68 && laneClarity >= 0.72 && receiverPressure <= 0.48) ||
  (switchStrength >= 0.82 && laneClarity >= 0.78 && receiverPressure <= 0.42));
  const isLineBreak = forwardGain >= 7.5 && targetDepth >= ballDepth + 5;
  const isBoxPass = targetDepth >= 73 && Math.abs(target.y - pitch.width / 2) <= 17;
  const isBackPass = forwardGain < -6;
  const sameLanePass = getPitchLaneKey(startPoint) === getPitchLaneKey(target);
  const isSidewaysPass = Math.abs(forwardGain) < 4 && lateralMeters >= 6.5 && !isSwitch;
  const threatGain = getActionThreatGain(startPoint, target, teamId);
  const targetThreat = getPitchThreatProfile(target, teamId);
  const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
  const centralPocketScore = targetThreat.centralPocket;
  const centralPocketPassBonus =
  centralPocketScore > 0.42
  ? 0.48 +
  centralPocketScore * 0.92 +
  (forwardFacingSpaceTwo.active ? 0.42 : 0) +
  (receiverPressure <= 0.56 ? 0.16 : 0)
  : 0;
  const highValueSpaceBonus =
  Math.max(0, threatGain) * 0.86 +
  targetThreat.value * 0.34 +
  targetThreat.halfSpace * 0.14 +
  targetThreat.betweenLines * 0.14 +
  targetThreat.cutbackZone * 0.18 +
  actionSpace.spacePriority.score * 0.42 +
  targetThreat.assistZone * (profile.crossBias >= 0.56 || profile.overlapBias >= 0.56 ? 0.18 : 0.08);
  const progressionSpaceBonus =
  forwardGain >= 3
  ? actionSpace.value * (0.34 + profile.progressionUrgency * 0.42) +
  clamp(actionSpace.lineBreakCount, 0, 3) * 0.15 +
  (actionSpace.openTarget >= 0.68 && targetDepth >= 48 ? 0.12 : 0)
  : 0;
  const rightWayBackPassPenalty =
  forwardFacingSpaceTwo.active && isBackPass
  ? 1.15 + profile.progressionUrgency * 0.42 + (ownerPressure <= 0.28 ? 0.28 : 0)
  : 0;
  const lowValueSafetyPenalty =
  forwardFacingSpaceTwo.active &&
  !isLineBreak &&
  !isSwitch &&
  targetThreat.value < getPitchThreatProfile(startPoint, teamId).value + 0.05 &&
  centralPocketScore < 0.35 &&
  forwardGain < 2
  ? 0.72
  : 0;
  const lowValueProgressionWindowPenalty =
  forwardFacingSpaceTwo.active &&
  !isLineBreak &&
  !isSwitch &&
  actionSpace.value < 0.28 &&
  actionSpace.lineBreakCount === 0 &&
  forwardGain < 2 &&
  ownerPressure < 0.55
  ? 0.36 + profile.progressionUrgency * 0.36
  : 0;
  const possessionHasSettled = rhythm.steps >= 2 || possessionMaturity >= 0.38;
  const sidewaysRepeatPenalty = isSidewaysPass
  ? clamp(rhythm.sidewaysPasses - profile.sidewaysTolerance * 2, 0, 4) *
  (0.28 + profile.progressionUrgency * 0.22) +
  (possessionHasSettled ? possessionMaturity * (0.22 + profile.directness * 0.36) : 0)
  : 0;
  const progressionRhythmBonus =
  isLineBreak || isBoxPass || isRouteOnePass
  ? (0.24 + profile.progressionUrgency * 0.48) * clamp(possessionMaturity + 0.4, 0.35, 1.25)
  : 0;
  const controlledRecycleBonus =
  isBackPass && rhythm.steps <= 1
  ? profile.recycleWindow * Math.max(0.2, 0.54 - profile.directness * 0.18)
  : 0;
  const sterileRecyclePenalty =
  isBackPass && rhythm.backPasses >= 1 && rhythm.forwardPasses === 0
  ? 0.26 + profile.progressionUrgency * 0.38
  : 0;
  const lowValueSwitchPenalty =
  isSwitch && forwardGain < 4 && ownerPressure < 0.42 && profile.switchBias < 0.72
  ? 0.32 + possessionMaturity * 0.3
  : 0;
  if (isSwitch && !isSwitchOpportunity) {
  return;
  }
  if (passDistance > 42 && profile.phaseKey !== "finalThird" && profile.directness < 0.72 && !isRouteOnePass) {
  return;
  }
  const rolePreference = profile.runnerPreferences?.[receiverRoleKey] ?? 0.2;
  const distancePenalty = passDistance <= 22
  ? passDistance * 0.006
  : 0.13 + (passDistance - 22) * (0.058 - profile.directness * 0.026);
  const supportPassBonus = passDistance >= 6 && passDistance <= 18 && forwardGain > -4
  ? 0.18 + profile.shortSupport * 0.42 + passAndMoveTendency * 0.18
  : 0;
  const pressureEscape = ownerPressure >= 0.5 && passDistance <= 18 ? 0.32 : 0;
  const longPassPenalty =
  passDistance >= 32 && !isBoxPass && !isSwitchOpportunity && !isRouteOnePass
  ? 0.8 - profile.directness * 0.52 - profile.routeOneBias * 0.28 + (supportNearTarget <= 0 ? 0.36 : 0)
  : passDistance >= 26 && !isBoxPass
  ? 0.38 - profile.directness * 0.22 - profile.routeOneBias * 0.2 + (supportNearTarget <= 0 ? 0.22 : 0)
  : 0;
  const secondBallSupportBonus =
  passDistance >= 24 && forwardGain >= 8
  ? clamp(supportNearTarget, 0, 3) * (0.1 + profile.directness * 0.06 + profile.routeOneBias * 0.08)
  : 0;
  const activeFirstTouchMode = isSwitch
  ? isWideChannel(target) ? "inside" : "forward"
  : isLineBreak || isBoxPass
  ? "forward"
  : supportPassBonus > 0 && receiverPressure <= 0.52 && forwardGain >= 1.5 &&
  (profile.firstTouchForwardBias >= 0.56 || passAndMoveTendency >= 0.68)
  ? "forward"
  : profile.tempo >= 0.62 && forwardGain >= -1.5
  ? "inside"
  : receiverPressure <= 0.65
  ? "inside"
  : "kill";
  const score =
  0.72 +
  laneClarity * 1.55 +
  receiverStrength * 0.82 +
  creatorStrength * 0.42 +
  profile.passBias * 0.24 +
  clamp(forwardGain / 24, -0.32, 0.74) * (0.72 + profile.directness * 0.62) +
  clamp(targetDepth / 100, 0, 1) * 0.35 +
  rolePreference * 0.22 +
  (isLineBreak ? 0.42 + profile.lineBreakBias * 0.72 + lineBreakTendency * 0.32 + runnerStrength * 0.38 : 0) +
  (isSwitch ? 0.12 + profile.switchBias * 0.42 + switchStrength * 0.34 + ownerPressure * 0.32 : 0) +
  (isRouteOnePass ? 0.42 + profile.routeOneBias * 0.58 + runnerStrength * 0.26 : 0) +
  (isBoxPass ? 0.48 + getAutoPilotRoleStrength(receiver, "finisher") * 0.5 : 0) +
  secondBallSupportBonus +
  centralPocketPassBonus +
  highValueSpaceBonus +
  progressionSpaceBonus +
  (wideEntryPrinciple ? wideEntryPrinciple.scoreBonus : 0) +
  progressionRhythmBonus +
  supportPassBonus +
  controlledRecycleBonus +
  pressureEscape -
  receiverPressure * 0.52 -
  distancePenalty -
  longPassPenalty -
  sidewaysRepeatPenalty -
  sterileRecyclePenalty -
  lowValueSwitchPenalty -
  rightWayBackPassPenalty -
  lowValueSafetyPenalty -
  lowValueProgressionWindowPenalty -
  (sameLanePass && forwardGain < 7 && ownerPressure < 0.5 ? 0.32 : 0) -
  (isBackPass ? 0.28 + profile.directness * 0.4 - retainTendency * 0.18 : 0);
  if (score < 1.55) {
  return;
  }
  candidates.push({
  actionType: "pass",
  target,
  receiverPlayerId: receiver.id,
  receiverRoleKey,
  passDistance,
  forwardGain,
  laneClarity,
  receiverPressure,
  supportNearTarget,
  isLineBreak,
  isSwitch,
  isSidewaysPass,
  isBoxPass,
  isPrinciplePattern: !!wideEntryPrinciple,
  principleKey: wideEntryPrinciple?.key ?? null,
  principleLabel: wideEntryPrinciple
  ? `Wide overload: W receives high, ${getPlayerMagnetLabel(wideEntryPrinciple.runner)} overlaps outside`
  : null,
  principleRunnerPlayerId: wideEntryPrinciple?.runner.id ?? null,
  score,
  firstTouchMode: activeFirstTouchMode,
  label: wideEntryPrinciple ? "wide entry" : isSwitch ? "switch" : isLineBreak ? "line-breaking pass" : "pass",
  reason: isSwitch
  ? "switching play away from pressure"
  : isRouteOnePass
  ? "route-one territory and second-ball pressure"
  : wideEntryPrinciple
  ? `${profile.styleLabel.toLowerCase()} wide overload: play into W and trigger the outside overlap`
  : isLineBreak
  ? `${profile.styleLabel.toLowerCase()} line break`
  : `${profile.styleLabel.toLowerCase()} support option`,
  });
  });
  return candidates;
  }

  return {
    buildAutoPilotPassCandidates,
  };
}
