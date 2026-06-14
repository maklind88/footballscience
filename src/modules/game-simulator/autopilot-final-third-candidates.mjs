export function createGameSimulatorAutopilotFinalThirdCandidates(deps = {}) {
  const {
    chooseWideOverlapRunner,
    clamp,
    clampToPitch,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotBoxTarget,
    getAutoPilotRoleStrength,
    getHighValueAttackTarget,
    getOffensiveRoleKey,
    getPlayerBallControlPoint,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isBylineZone,
    isGoalkeeper,
    isPassReceiverOffside,
    isWideChannel,
    isWidePrincipleZone,
    lerp,
    pitch,
    resolveBallActionProfile,
    teams,
  } = deps;

  function buildAutoPilotBoxDeliveryCandidate(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const attackingDepth = getAttackingDepth(startPoint, teamId);
  const startsWide = isWideChannel(startPoint);
  if (!startsWide || attackingDepth < 63) {
  return null;
  }
  const isCutback = isBylineZone(startPoint, teamId);
  const target = getAutoPilotBoxTarget(teamId, carrier, isCutback ? "cutback" : "cross");
  const creatorStrength = Math.max(
  getAutoPilotRoleStrength(carrier, "crosser"),
  getAutoPilotRoleStrength(carrier, "creator")
  );
  const runners = state.players.filter((player) => {
  if (player.team !== teamId || player.id === carrier.id) {
  return false;
  }
  const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
  return roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward" || roleKey === "connector";
  });
  const runnerThreat = runners.reduce(
  (best, player) => Math.max(best, getAutoPilotRoleStrength(player, "runner") + getAutoPilotRoleStrength(player, "finisher") * 0.55),
  0.3
  );
  const boxSupportCount = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id]), 20);
  const laneClarity = computePassLaneClarity(carrier, target);
  const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
  const hopefulDelivery =
  !isCutback &&
  boxSupportCount <= 1 &&
  profile.crossBias < 0.74 &&
  laneClarity < 0.66;
  const score =
  1.35 +
  creatorStrength * 1.1 +
  runnerThreat * 0.82 +
  laneClarity * 0.6 +
  actionSpace.value * 0.36 +
  profile.crossBias * 0.74 +
  profile.deliveryBias * 0.36 +
  getPlayerTendency(carrier, "earlyCross") * 0.42 +
  clamp(boxSupportCount, 0, 4) * 0.16 -
  (boxSupportCount <= 1 && !isCutback ? 0.46 : 0) +
  (isCutback ? 0.36 : 0) +
  (profile.phaseKey === "finalThird" ? 0.32 : 0) -
  (hopefulDelivery ? 0.62 : 0);
  if (score < (isCutback ? 1.48 : 1.72) || (hopefulDelivery && score < 2.05)) {
  return null;
  }
  return {
  actionType: "pass",
  target,
  receiverPlayerId: null,
  score,
  label: isCutback ? "cutback" : "cross",
  reason: isCutback ? "cutback from wide final-third position" : `${profile.styleLabel.toLowerCase()} delivery into the box`,
  };
  }

  function getFinalThirdCombinationVariants(teamId, carrier, startPoint, profile) {
  const state = getState();
  const attackingDepth = getAttackingDepth(startPoint, teamId);
  const startsWide = isWideChannel(startPoint);
  const byline = isBylineZone(startPoint, teamId);
  const sideSign = getWideSideSign(startPoint) || 1;
  const cutbackBias = profile.cutbackBias ?? clamp(0.24 + profile.shortSupport * 0.28 + profile.overlapBias * 0.22, 0.22, 0.82);
  const variants = [];
  if (startsWide && attackingDepth >= 62) {
  variants.push({
  key: "cutback",
  label: "cutback",
  target: getAutoPilotBoxTarget(teamId, carrier, "cutback"),
  roles: ["connector", "striker", "secondStriker", "wideForward"],
  styleFit: 0.48 + cutbackBias * 0.3 + (byline ? 0.36 : 0),
  maxDistance: 30,
  timingWindow: 1.55,
  });
  variants.push({
  key: "far-post-cross",
  label: "cross",
  target: getAutoPilotBoxTarget(teamId, carrier, "far-post"),
  roles: ["striker", "wideForward", "secondStriker"],
  styleFit: 0.28 + profile.crossBias * 0.44,
  maxDistance: 38,
  timingWindow: 1.85,
  });
  }
  if (attackingDepth >= 58) {
  variants.push({
  key: "golden-zone-slip",
  label: "final pass",
  target: getHighValueAttackTarget(teamId, startPoint, "goldenRun", sideSign),
  roles: ["striker", "secondStriker", "wideForward"],
  styleFit: 0.28 + profile.lineBreakBias * 0.34 + profile.shootBias * 0.12,
  maxDistance: 27,
  timingWindow: 1.45,
  });
  variants.push({
  key: "edge-cutback",
  label: "cutback",
  target: getHighValueAttackTarget(teamId, startPoint, "reboundEdge", sideSign),
  roles: ["connector", "pivot", "wideForward"],
  styleFit: 0.22 + cutbackBias * 0.28 + profile.shortSupport * 0.16,
  maxDistance: 24,
  timingWindow: 1.5,
  });
  }
  return variants;
  }

  function buildAutoPilotFinalThirdCombinationCandidate(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const attackingDepth = getAttackingDepth(startPoint, teamId);
  const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
  if (attackingDepth < 58 || ownerPressure > 0.86) {
  return null;
  }
  const formation = teams[teamId]?.formation;
  const creatorQuality = Math.max(
  getAutoPilotRoleStrength(carrier, "creator"),
  getAutoPilotRoleStrength(carrier, "crosser")
  );
  const variants = getFinalThirdCombinationVariants(teamId, carrier, startPoint, profile);
  const candidates = [];
  variants.forEach((variant) => {
  state.players.forEach((runner) => {
  if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
  return;
  }
  const roleKey = getOffensiveRoleKey(runner, formation);
  if (!variant.roles.includes(roleKey) || isPassReceiverOffside(runner, startPoint)) {
  return;
  }
  const runnerBlend = roleKey === "connector" || roleKey === "pivot" ? 0.14 : 0.08;
  const target = clampToPitch({
  x: lerp(variant.target.x, runner.position.x, runnerBlend),
  y: lerp(variant.target.y, runner.position.y, runnerBlend),
  }, 2);
  const passDistance = distance(startPoint, target);
  if (passDistance < 5 || passDistance > variant.maxDistance) {
  return;
  }
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const laneClarity = computePassLaneClarity(carrier, target);
  const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
  const runnerDistance = distance(runner.position, target);
  const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
  const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
  const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / variant.timingWindow, 0, 1);
  const boxThreat = actionSpace.targetThreat.box;
  const cutbackThreat = variant.key.includes("cutback") ? actionSpace.targetThreat.centrality * 0.18 : 0;
  const runnerQuality =
  getAutoPilotRoleStrength(runner, "finisher") * 0.42 +
  getAutoPilotRoleStrength(runner, "runner") * 0.28 +
  getAutoPilotRoleStrength(runner, "receiver") * 0.18 +
  getPlayerTendency(runner, "boxRun") * 0.18;
  const supportCount = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 18);
  const hopefulCrossPenalty =
  variant.key === "far-post-cross" && supportCount <= 1
  ? 0.36
  : 0;
  const score =
  1.24 +
  creatorQuality * 0.72 +
  runnerQuality * 0.82 +
  laneClarity * 0.78 +
  actionSpace.value * 1.04 +
  boxThreat * 0.46 +
  cutbackThreat +
  timingFit * 0.56 +
  variant.styleFit +
  clamp(supportCount, 0, 4) * 0.1 +
  (forwardGain >= -2 ? 0.16 : -0.1) -
  ownerPressure * 0.32 -
  actionSpace.targetPressure * 0.46 -
  hopefulCrossPenalty -
  (passDistance > 28 && variant.key !== "far-post-cross" ? 0.18 : 0);
  candidates.push({
  variant,
  runner,
  roleKey,
  target,
  passDistance,
  forwardGain,
  laneClarity,
  actionSpace,
  supportCount,
  score,
  timingFit,
  });
  });
  });
  const selected = candidates
  .filter((candidate) => (
  candidate.laneClarity >= 0.34 &&
  candidate.timingFit >= 0.12 &&
  candidate.actionSpace.value >= 0.32 &&
  candidate.score >= 1.7
  ))
  .sort((a, b) => b.score - a.score)[0];
  if (!selected) {
  return null;
  }
  const isCutback = selected.variant.key.includes("cutback");
  return {
  actionType: "pass",
  target: selected.target,
  receiverPlayerId: null,
  receiverRoleKey: selected.roleKey,
  passDistance: selected.passDistance,
  forwardGain: selected.forwardGain,
  laneClarity: selected.laneClarity,
  receiverPressure: selected.actionSpace.targetPressure,
  supportNearTarget: selected.supportCount,
  isLineBreak: selected.forwardGain >= 4 || selected.actionSpace.lineBreakCount >= 1,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: true,
  isPrinciplePattern: true,
  principleKey: `final-third-${selected.variant.key}`,
  principleLabel: `${isCutback ? "Cutback" : "Final-third delivery"}: ${getPlayerMagnetLabel(selected.runner)} attacks the chance`,
  principleRunnerPlayerId: selected.runner.id,
  score: selected.score,
  firstTouchMode: "forward",
  label: selected.variant.label,
  reason: isCutback
  ? "final-third cutback to a runner arriving in the highest-value zone"
  : "final-third chance creation before the defence can reset",
  };
  }

  function buildAutoPilotWideOverlapCandidate(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const carrierRoleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
  const attackingDepth = getAttackingDepth(startPoint, teamId);
  const sideSign = getWideSideSign(startPoint) || getWideSideSign(carrier);
  if (carrierRoleKey !== "wideForward" || attackingDepth < 42 || !isWidePrincipleZone(startPoint)) {
  return null;
  }
  const overlap = chooseWideOverlapRunner(
  teamId,
  sideSign,
  startPoint,
  profile,
  new Set([carrier.id])
  );
  if (!overlap) {
  return null;
  }
  const runnerPoint = getPlayerBallControlPoint(overlap.player);
  const runnerDepth = getAttackingDepth(runnerPoint, teamId);
  const overlapDepth = getAttackingDepth(overlap.target, teamId);
  const runnerHasArrived = runnerDepth >= attackingDepth - 1.5 && distance(runnerPoint, overlap.target) <= 9.5;
  const target = runnerHasArrived ? runnerPoint : overlap.target;
  const passDistance = distance(startPoint, target);
  if (passDistance < 5 || passDistance > 30 || isPassReceiverOffside(overlap.player, startPoint)) {
  return null;
  }
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const laneClarity = computePassLaneClarity(carrier, target);
  const receiverPressure = getPlayerPressureLoad(overlap.player, target);
  const runnerQuality =
  getAutoPilotRoleStrength(overlap.player, "runner") +
  getAutoPilotRoleStrength(overlap.player, "crosser") * 0.42 +
  getPlayerTendency(overlap.player, "overlap") * 0.35;
  const score =
  1.35 +
  overlap.principleFit * 0.96 +
  runnerQuality * 0.74 +
  laneClarity * 0.72 +
  profile.overlapBias * 0.72 +
  profile.crossBias * 0.26 +
  clamp(forwardGain / 20, -0.12, 0.55) -
  receiverPressure * 0.48 -
  Math.max(0, Math.abs(overlapDepth - runnerDepth) - 10) * 0.025;
  if (score < 1.62) {
  return null;
  }
  return {
  actionType: "pass",
  target,
  receiverPlayerId: overlap.player.id,
  receiverRoleKey: "wideBack",
  passDistance,
  forwardGain,
  laneClarity,
  receiverPressure,
  isLineBreak: forwardGain >= 7.5,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: getAttackingDepth(target, teamId) >= 73 && isWidePrincipleZone(target),
  isPrinciplePattern: true,
  principleKey: "wide-overlap",
  principleLabel: `Wide overload: W releases ${getPlayerMagnetLabel(overlap.player)} on the overlap`,
  score,
  firstTouchMode: attackingDepth >= 64 ? "forward" : "inside",
  label: "overlap pass",
  reason: "wide-overload principle: winger receives high, then releases the outside full-back or wing-back run",
  };
  }


  return {
    buildAutoPilotBoxDeliveryCandidate,
    getFinalThirdCombinationVariants,
    buildAutoPilotFinalThirdCombinationCandidate,
    buildAutoPilotWideOverlapCandidate,
  };
}
