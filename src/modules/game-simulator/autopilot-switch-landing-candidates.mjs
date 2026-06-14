export function createGameSimulatorAutopilotSwitchLandingCandidates(deps = {}) {
  const {
    buildAutoPilotBoxDeliveryCandidate,
    chooseWideOverlapRunner,
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getRecentPossessionSteps,
    getRecordedStepDuration,
    getState,
    getSwitchLandingAttackTarget,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isPassReceiverOffside,
    isWidePrincipleZone,
    teams,
    uniquePrincipleLabels,
  } = deps;

  function getLastSwitchLandingActionContext(carrier, startPoint, profile) {
  const state = getState();
  if (!carrier || !startPoint || state.restartPhase?.type) {
  return null;
  }
  const teamId = carrier.team;
  const lastStep = getRecentPossessionSteps(teamId, 4)[0] ?? null;
  if (
  !lastStep ||
  lastStep.actionType !== "pass" ||
  lastStep.receiverPlayerId !== carrier.id ||
  getRecordedStepDuration(lastStep) > 5
  ) {
  return null;
  }
  const start = lastStep.beforeSnapshot?.ball?.position;
  const target = lastStep.target ?? startPoint;
  if (!start || !target) {
  return null;
  }
  const actionDistance = distance(start, target);
  const laneShift = Math.abs(getPitchLaneIndex(start) - getPitchLaneIndex(target));
  const principleText = [
  lastStep.profileLabel,
  lastStep.offensiveAutopilot?.principleKey,
  lastStep.offensiveAutopilot?.principleLabel,
  ...(lastStep.autoPrinciples ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  const wasSwitch =
  (actionDistance >= 18 && laneShift >= 2) ||
  principleText.includes("switch") ||
  principleText.includes("weak-side") ||
  principleText.includes("far side");
  if (!wasSwitch) {
  return null;
  }
  const sideSign =
  getWideSideSign(startPoint) ||
  getWideSideSign(target) ||
  1;
  const depth = getAttackingDepth(startPoint, teamId);
  const pressure = getPlayerPressureLoad(carrier, startPoint);
  const targetThreat = getPitchThreatProfile(startPoint, teamId);
  const startsWide = isWidePrincipleZone(startPoint);
  const finalThirdCue =
  depth >= 62 ||
  targetThreat.assistZone >= 0.22 ||
  targetThreat.cutbackZone >= 0.18 ||
  targetThreat.box >= 0.14;
  if (!startsWide && depth < 44 && pressure >= 0.46) {
  return null;
  }
  return {
  actionDistance,
  depth,
  finalThirdCue,
  lastStep,
  laneShift,
  pressure,
  sideSign,
  start,
  target,
  targetThreat,
  startsWide,
  switchBias: profile.switchBias ?? 0.5,
  };
  }

  function buildAutoPilotSwitchLandingContinuationCandidate(carrier, startPoint, profile) {
  const state = getState();
  const context = getLastSwitchLandingActionContext(carrier, startPoint, profile);
  if (!context) {
  return null;
  }
  const teamId = carrier.team;
  const formation = teams[teamId]?.formation;
  const carrierRoleKey = getOffensiveRoleKey(carrier, formation);
  const options = [];
  const addOption = (option) => {
  if (option && Number.isFinite(option.score)) {
  options.push(option);
  }
  };
  const addPassToReceiver = (receiver, target, meta = {}) => {
  if (!receiver || receiver.team !== teamId || receiver.id === carrier.id || isPassReceiverOffside(receiver, startPoint)) {
  return;
  }
  const passDistance = distance(startPoint, target);
  if (passDistance < (meta.minDistance ?? 4) || passDistance > (meta.maxDistance ?? 30)) {
  return;
  }
  const roleKey = getOffensiveRoleKey(receiver, formation);
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const laneClarity = computePassLaneClarity(carrier, target, { receiverPlayerId: receiver.id });
  const receiverPressure = getPlayerPressureLoad(receiver, target);
  const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
  const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, receiver.id]), 14);
  const score =
  (meta.baseScore ?? 1.55) +
  laneClarity * 0.84 +
  getAutoPilotRoleStrength(receiver, "receiver") * 0.24 +
  getAutoPilotRoleStrength(receiver, "runner") * (meta.runnerWeight ?? 0.28) +
  actionSpace.value * 0.36 +
  clamp(forwardGain / 18, -0.1, 0.48) +
  clamp(supportNearTarget, 0, 3) * 0.08 +
  (meta.bonus ?? 0) -
  receiverPressure * 0.42 -
  Math.max(0, passDistance - 22) * 0.026;
  if (score < (meta.minScore ?? 1.72)) {
  return;
  }
  addOption({
  actionType: "pass",
  target,
  receiverPlayerId: receiver.id,
  receiverRoleKey: roleKey,
  passDistance,
  forwardGain,
  laneClarity,
  receiverPressure,
  supportNearTarget,
  isLineBreak: forwardGain >= 6 || actionSpace.lineBreakCount >= 1,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: actionSpace.targetThreat.box >= 0.18 || actionSpace.targetThreat.assistZone >= 0.28,
  isPrinciplePattern: true,
  principleKey: meta.principleKey ?? "switch-landing-continuation",
  principleLabel: meta.principleLabel ?? `Switch landing: ${getPlayerMagnetLabel(carrier)} continues the far-side attack`,
  principleRunnerPlayerId: receiver.id,
  score,
  firstTouchMode: actionSpace.targetThreat.box >= 0.18 || forwardGain >= 5 ? "forward" : "inside",
  label: meta.label ?? "switch continuation",
  reason: meta.reason ?? "switch landing has opened the far side, so the next action continues that advantage",
  });
  };
  if (context.startsWide && context.depth >= 42 && (profile.overlapBias ?? 0.5) >= 0.48) {
  const overlap = chooseWideOverlapRunner(teamId, context.sideSign, startPoint, profile, new Set([carrier.id]));
  if (overlap) {
  const runnerPoint = getPlayerBallControlPoint(overlap.player);
  const runnerArrived = distance(runnerPoint, overlap.target) <= 8.8;
  addPassToReceiver(overlap.player, runnerArrived ? runnerPoint : overlap.target, {
  baseScore: 1.72,
  bonus: overlap.principleFit * 0.42 + getPlayerTendency(overlap.player, "overlap") * 0.22,
  label: "overlap after switch",
  maxDistance: 31,
  minScore: 1.68,
  principleKey: "switch-overlap-continuation",
  principleLabel: `Switch landing: ${getPlayerMagnetLabel(overlap.player)} overlaps outside`,
  reason: "far-side switch creates the timing for an outside overlap",
  runnerWeight: 0.42,
  });
  }
  }
  const halfSpaceTarget = getSwitchLandingAttackTarget(teamId, {
  sideSign: context.sideSign,
  targetDepth: context.depth,
  targetPoint: startPoint,
  }, context.finalThirdCue ? "cutbackEdge" : "insidePocket", profile);
  const insideReceiver = state.players
  .filter((player) => {
  if (player.team !== teamId || player.id === carrier.id || isGoalkeeper(player)) {
  return false;
  }
  const roleKey = getOffensiveRoleKey(player, formation);
  return ["connector", "secondStriker", "wideForward", "striker"].includes(roleKey);
  })
  .sort((a, b) => distance(a.position, halfSpaceTarget) - distance(b.position, halfSpaceTarget))[0] ?? null;
  addPassToReceiver(insideReceiver, halfSpaceTarget, {
  baseScore: context.finalThirdCue ? 1.82 : 1.58,
  bonus: (profile.shortSupport ?? 0.55) * 0.18 + (context.finalThirdCue ? 0.3 : 0),
  label: context.finalThirdCue ? "cutback edge" : "underlap pass",
  maxDistance: context.finalThirdCue ? 26 : 24,
  minScore: context.finalThirdCue ? 1.66 : 1.78,
  principleKey: context.finalThirdCue ? "switch-cutback-edge" : "switch-underlap-continuation",
  principleLabel: context.finalThirdCue
  ? "Switch landing: cutback edge arrives"
  : "Switch landing: underlap into half-space",
  reason: context.finalThirdCue
  ? "switch lands wide in the final third and the cutback edge is available"
  : "switch lands wide and the half-space support is the next forward option",
  });
  if (context.finalThirdCue) {
  const boxCandidate = buildAutoPilotBoxDeliveryCandidate(carrier, startPoint, profile);
  if (boxCandidate) {
  addOption({
  ...boxCandidate,
  score: boxCandidate.score + 0.34 + (profile.deliveryBias ?? 0.45) * 0.16,
  isPrinciplePattern: true,
  principleKey: "switch-final-third-delivery",
  principleLabel: "Switch landing: deliver before the block resets",
  principleLabels: uniquePrincipleLabels([
  ...(boxCandidate.principleLabels ?? []),
  "Switch landing: deliver before the block resets",
  ]),
  reason: "far-side switch reaches the final third before the block can slide across",
  });
  }
  }
  if (
  context.pressure <= 0.52 &&
  (carrierRoleKey === "wideForward" || carrierRoleKey === "wideBack" || carrierRoleKey === "connector")
  ) {
  const carryTarget = getSwitchLandingAttackTarget(teamId, {
  sideSign: context.sideSign,
  targetDepth: context.depth,
  targetPoint: startPoint,
  }, context.finalThirdCue ? "cutbackEdge" : "underlap", profile);
  const actionDistance = distance(startPoint, carryTarget);
  const forwardGain = (carryTarget.x - startPoint.x) * getAttackDirectionSign(teamId);
  const actionSpace = getActionSpaceValue(startPoint, carryTarget, teamId, profile);
  const score =
  1.5 +
  getAutoPilotRoleStrength(carrier, "dribbler") * 0.48 +
  (profile.carryBias ?? 0.5) * 0.26 +
  (profile.dribbleBias ?? 0.5) * 0.2 +
  Math.max(0, forwardGain) * 0.045 +
  actionSpace.value * 0.34 -
  context.pressure * 0.36;
  if (actionDistance >= 4.5 && forwardGain >= 2 && score >= 1.68) {
  addOption({
  actionType: "dribble",
  target: carryTarget,
  receiverPlayerId: null,
  passDistance: actionDistance,
  forwardGain,
  laneClarity: 0.72,
  receiverPressure: context.pressure,
  isLineBreak: actionSpace.lineBreakCount >= 1,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: actionSpace.targetThreat.box >= 0.18,
  isPrinciplePattern: true,
  principleKey: "switch-landing-carry",
  principleLabel: `Switch landing: ${getPlayerMagnetLabel(carrier)} attacks the isolated side`,
  score,
  firstTouchMode: null,
  label: "carry after switch",
  reason: "far-side switch creates a moment to carry before pressure arrives",
  });
  }
  }
  if (!options.length) {
  return null;
  }
  return options.sort((a, b) => b.score - a.score)[0];
  }

  return {
    getLastSwitchLandingActionContext,
    buildAutoPilotSwitchLandingContinuationCandidate,
  };
}
