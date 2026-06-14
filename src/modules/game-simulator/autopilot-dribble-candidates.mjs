export function createGameSimulatorAutopilotDribbleCandidates(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAutoPilotFlowContext,
    getAutoPilotRoleStrength,
    getBreakawayCarryTarget,
    getCarryLaneOpenSpaceScore,
    getCarryRunwayProfile,
    getAttackingDepth,
    getForwardFacingSpaceTwoContext,
    getForwardProgressionWindow,
    getNearestOpponentGapInCarryLane,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getOpenGrassCarryContext,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerPressureLoad,
    getPlayerTendency,
    getRunwayCarryTarget,
    isWideChannel,
    lerp,
    pitch,
    teams,
  } = deps;

  function getAutoPilotDribbleTarget(carrier, profile = getOffensiveAutopilotProfile(carrier.team, carrier.position)) {
  const teamId = carrier.team;
  const sign = getAttackDirectionSign(teamId);
  const startPoint = getPlayerBallControlPoint(carrier);
  const runwayCarry = getRunwayCarryTarget(carrier, startPoint, profile);
  if (runwayCarry?.target) {
  return runwayCarry.target;
  }
  const breakawayTarget = getBreakawayCarryTarget(carrier, startPoint, profile);
  if (breakawayTarget) {
  return breakawayTarget;
  }
  const openGrassCarry = getOpenGrassCarryContext(carrier, startPoint, profile);
  if (openGrassCarry?.target) {
  return openGrassCarry.target;
  }
  const ballDepth = getAttackingDepth(carrier.position, teamId);
  const pressure = getPlayerPressureLoad(carrier, startPoint);
  const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
  const isWide = isWideChannel(carrier.position);
  const openForwardPoint = clampToPitch({
  x: carrier.position.x + sign * 22,
  y: lerp(carrier.position.y, pitch.width / 2, isWide ? 0.42 : 0.22),
  }, 2.5);
  const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, openForwardPoint));
  const centralPull = forwardFacingSpaceTwo.active
  ? 0.34
  : isWide ? lerp(0.24, 0.5, openSpaceScore) : pressure > 0.52 ? 0.12 : lerp(0.06, 0.2, openSpaceScore);
  const tendency = getPlayerTendency(carrier, "dribble");
  const carryDistance = clamp(
  6.5 +
  getAutoPilotRoleStrength(carrier, "dribbler") * 4.1 +
  profile.dribbleBias * 2.2 +
  tendency * 1.2 -
  pressure * 3.4 +
  openSpaceScore * 8.5 +
  (forwardFacingSpaceTwo.active ? 4.2 : 0) +
  (ballDepth < 35 ? 1.1 : 0),
  4.5,
  openSpaceScore >= 0.72 && pressure <= 0.36 ? 22 : 14.5
  );
  return clampToPitch({
  x: carrier.position.x + sign * carryDistance,
  y: lerp(carrier.position.y, pitch.width / 2, centralPull),
  }, 2.5);
  }

  function buildAutoPilotDribbleCandidate(carrier, startPoint, profile) {
  const target = getAutoPilotDribbleTarget(carrier, profile);
  const travelDistance = distance(startPoint, target);
  if (travelDistance < 3.5) {
  return null;
  }
  const openGrassCarry = getOpenGrassCarryContext(carrier, startPoint, profile);
  const openSpaceScore = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
  const runwayProfile = getCarryRunwayProfile(carrier, startPoint, target, profile);
  const pressure = getPlayerPressureLoad(carrier, startPoint);
  const dribbleStrength = getAutoPilotRoleStrength(carrier, "dribbler");
  const dribbleTendency = getPlayerTendency(carrier, "dribble");
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(carrier.team);
  const goalDistance = distance(startPoint, getOpponentGoalCenter(carrier.team));
  const targetGoalDistance = distance(target, getOpponentGoalCenter(carrier.team));
  const flow = getAutoPilotFlowContext(carrier, startPoint);
  const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
  const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
  const threatGain = getActionThreatGain(startPoint, target, carrier.team);
  const targetThreat = getPitchThreatProfile(target, carrier.team);
  const actionSpace = getActionSpaceValue(startPoint, target, carrier.team, profile);
  const valuableCarryBonus =
  targetThreat.centralPocket * 0.58 +
  targetThreat.betweenLines * 0.24 +
  targetThreat.halfSpace * 0.18 +
  Math.max(0, threatGain) * 0.62 +
  targetThreat.value * 0.22 +
  actionSpace.spacePriority.score * 0.28 +
  (forwardFacingSpaceTwo.active && forwardGain >= 3 ? 0.46 : 0);
  const isBreakawayCarry =
  goalDistance <= 50 &&
  targetGoalDistance <= goalDistance - 7 &&
  openSpaceScore >= 0.62 &&
  pressure <= 0.46;
  const isOpenGrassCarry =
  !!openGrassCarry &&
  distance(openGrassCarry.target, target) <= 1.4 &&
  openGrassCarry.openSpaceScore >= 0.56;
  const isRunwayCarry =
  runwayProfile.shouldExtend &&
  runwayProfile.openSpaceScore >= 0.56 &&
  runwayProfile.forwardGain >= 6;
  const roleKey = getOffensiveRoleKey(carrier, teams[carrier.team]?.formation);
  const roleFreedom =
  roleKey === "wideForward" || roleKey === "wideBack" || roleKey === "connector"
  ? 0.18
  : roleKey === "rest" || roleKey === "gk"
  ? -0.18
  : 0;
  const score =
  0.58 +
  openSpaceScore * 1.28 +
  dribbleStrength * 1.05 +
  profile.dribbleBias * 0.55 +
  profile.carryBias * 0.36 +
  dribbleTendency * 0.28 +
  clamp(forwardGain / 18, 0, 0.72) +
  valuableCarryBonus +
  actionSpace.value * 0.34 +
  roleFreedom +
  (isBreakawayCarry ? 0.72 : 0) +
  (isOpenGrassCarry ? 0.42 + openGrassCarry.score * 0.34 + profile.carryBias * 0.16 : 0) +
  (isRunwayCarry ? 0.36 + runwayProfile.runwayScore * 0.28 + clamp(runwayProfile.forwardGain / 30, 0, 0.18) : 0) +
  (progressionWindow.active ? 0.3 + progressionWindow.openLane * 0.28 + progressionWindow.urgency * 0.22 : 0) +
  (flow.carrierJustReceived ? 0.4 + profile.carryBias * 0.22 : 0) +
  (flow.consecutivePasses >= 2 ? 0.32 + Math.min(flow.consecutivePasses, 4) * 0.08 : 0) +
  (profile.phaseKey === "buildUp" ? -0.12 : 0.08) -
  pressure * 0.62;
  const minimumScore = progressionWindow.active || flow.carrierJustReceived || flow.consecutivePasses >= 2 ? 1.5 : 1.85;
  if (score < minimumScore) {
  return null;
  }
  return {
  actionType: "dribble",
  target,
  receiverPlayerId: null,
  score,
  isOpenGrassCarry: isOpenGrassCarry || isRunwayCarry,
  isRunwayCarry,
  runwayProfile,
  label: isBreakawayCarry
  ? "breakaway carry"
  : isRunwayCarry
  ? "open-grass runway"
  : isOpenGrassCarry
  ? openGrassCarry.label
  : "carry",
  reason: isBreakawayCarry
  ? "open grass to attack the goal"
  : isRunwayCarry
  ? "open grass gives the carrier a longer runway toward goal"
  : isOpenGrassCarry
  ? "open grass ahead allows a longer natural carry"
  : "space to commit the next defender",
  principleLabels: isRunwayCarry
  ? ["Open-grass runway"]
  : isOpenGrassCarry ? ["Open-grass carry"] : [],
  };
  }

  return {
    getAutoPilotDribbleTarget,
    buildAutoPilotDribbleCandidate,
  };
}
