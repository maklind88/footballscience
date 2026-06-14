export function createGameSimulatorAutopilotLineBreakCandidates(deps = {}) {
  const {
    clamp,
    clampToPitch,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getDepthX,
    getForwardProgressionWindow,
    getHighValueAttackTarget,
    getOffensiveRoleKey,
    getPitchThreatProfile,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getState,
    getTeamSupportCountAroundPoint,
    getWideSideSign,
    isGoalkeeper,
    isPassReceiverOffside,
    lerp,
    pitch,
    resolveBallActionProfile,
    teams,
  } = deps;

  function buildAutoPilotThroughBallCandidate(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const ballDepth = getAttackingDepth(startPoint, teamId);
  const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
  if (
  ballDepth < 42 ||
  ownerPressure > 0.72 ||
  (profile.phaseKey === "buildUp" && profile.directness < 0.75)
  ) {
  return null;
  }
  const formation = teams[teamId]?.formation;
  const candidates = state.players
  .filter((runner) => {
  if (runner.team !== teamId || runner.id === carrier.id || isGoalkeeper(runner)) {
  return false;
  }
  const roleKey = getOffensiveRoleKey(runner, formation);
  if (!["striker", "wideForward", "secondStriker", "connector"].includes(roleKey)) {
  return false;
  }
  return !isPassReceiverOffside(runner, startPoint);
  })
  .map((runner) => {
  const roleKey = getOffensiveRoleKey(runner, formation);
  const sideSign = getWideSideSign(runner) || getWideSideSign(startPoint) || 1;
  const baseTarget = getHighValueAttackTarget(
  teamId,
  startPoint,
  roleKey === "wideForward" ? "halfSpaceRun" : "goldenRun",
  sideSign
  );
  const target = clampToPitch({
  x: lerp(baseTarget.x, runner.position.x, roleKey === "connector" ? 0.18 : 0.08),
  y: lerp(baseTarget.y, runner.position.y, roleKey === "wideForward" ? 0.22 : 0.12),
  }, 2.5);
  const passDistance = distance(startPoint, target);
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const targetDepth = getAttackingDepth(target, teamId);
  const laneClarity = computePassLaneClarity(carrier, target);
  const targetThreat = getPitchThreatProfile(target, teamId);
  const runnerDistance = distance(runner.position, target);
  const runnerTime = computeTimeToCoverDistance(runner, runnerDistance, target);
  const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
  const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.35, 0, 1);
  const runnerStrength =
  getAutoPilotRoleStrength(runner, "runner") * 0.56 +
  getAutoPilotRoleStrength(runner, "receiver") * 0.28 +
  getPlayerTendency(runner, "boxRun") * 0.16;
  const supportNearTarget = getTeamSupportCountAroundPoint(teamId, target, new Set([carrier.id, runner.id]), 16);
  const score =
  1.02 +
  targetThreat.value * 1.05 +
  targetThreat.centralPocket * 0.42 +
  targetThreat.behindLine * 0.28 +
  laneClarity * 0.92 +
  runnerStrength * 0.8 +
  timingFit * 0.64 +
  clamp(forwardGain / 22, 0, 0.82) +
  profile.lineBreakBias * 0.58 +
  profile.directness * 0.34 +
  clamp(supportNearTarget, 0, 3) * 0.08 -
  ownerPressure * 0.38 -
  (passDistance > 34 && profile.routeOneBias < 0.5 ? 0.38 : 0) -
  (runnerTime > passTime + 1.1 ? 0.42 : 0);
  return {
  runner,
  roleKey,
  target,
  passDistance,
  forwardGain,
  laneClarity,
  targetDepth,
  targetThreat,
  supportNearTarget,
  score,
  timingFit,
  };
  })
  .filter((candidate) => (
  candidate.passDistance >= 11 &&
  candidate.passDistance <= 38 &&
  candidate.forwardGain >= 7 &&
  candidate.laneClarity >= 0.42 &&
  candidate.targetThreat.value >= 0.42 &&
  candidate.timingFit >= 0.18 &&
  candidate.score >= 1.72
  ))
  .sort((a, b) => b.score - a.score);
  const selected = candidates[0];
  if (!selected) {
  return null;
  }
  return {
  actionType: "pass",
  target: selected.target,
  receiverPlayerId: null,
  receiverRoleKey: selected.roleKey,
  passDistance: selected.passDistance,
  forwardGain: selected.forwardGain,
  laneClarity: selected.laneClarity,
  receiverPressure: 0.42,
  supportNearTarget: selected.supportNearTarget,
  isLineBreak: true,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: selected.targetDepth >= 72 && Math.abs(selected.target.y - pitch.width / 2) <= 18,
  isPrinciplePattern: true,
  principleKey: "pass-into-space",
  principleLabel: `Pass into space: ${getPlayerMagnetLabel(selected.runner)} attacks ${selected.targetThreat.primaryLabel}`,
  principleRunnerPlayerId: selected.runner.id,
  score: selected.score,
  firstTouchMode: "forward",
  label: "through ball",
  reason: `${profile.styleLabel.toLowerCase()} pass into space for ${getPlayerMagnetLabel(selected.runner)} to attack the next line`,
  };
  }

  function buildAutoPilotBetweenLinesCandidate(carrier, startPoint, profile) {
  const state = getState();
  const teamId = carrier.team;
  const ballDepth = getAttackingDepth(startPoint, teamId);
  const ownerPressure = getPlayerPressureLoad(carrier, startPoint);
  if (ballDepth < 34 || ballDepth > 76 || ownerPressure > 0.7) {
  return null;
  }
  const formation = teams[teamId]?.formation;
  const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
  const startSide = getWideSideSign(startPoint) || 1;
  const candidates = state.players
  .filter((receiver) => {
  if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
  return false;
  }
  const roleKey = getOffensiveRoleKey(receiver, formation);
  if (!["connector", "striker", "secondStriker", "wideForward"].includes(roleKey)) {
  return false;
  }
  return !isPassReceiverOffside(receiver, startPoint);
  })
  .map((receiver) => {
  const roleKey = getOffensiveRoleKey(receiver, formation);
  const receiverSide = getWideSideSign(receiver) || startSide;
  const pocketSide =
  roleKey === "wideForward"
  ? receiverSide
  : Math.abs(startPoint.y - pitch.width / 2) < 10
  ? receiverSide
  : -startSide;
  const pocketDepth = clamp(
  ballDepth +
  (roleKey === "connector" ? 8 : roleKey === "secondStriker" ? 10 : 12) +
  profile.lineBreakBias * 4,
  45,
  78
  );
  const halfSpaceY = pitch.width / 2 + pocketSide * (roleKey === "striker" ? 8.5 : 13.5);
  const target = clampToPitch({
  x: getDepthX(teamId, pocketDepth),
  y: clamp(lerp(receiver.position.y, halfSpaceY, roleKey === "wideForward" ? 0.54 : 0.7), 9, pitch.width - 9),
  }, 2.5);
  const passDistance = distance(startPoint, target);
  const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
  const laneClarity = computePassLaneClarity(carrier, target);
  const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
  const targetThreat = actionSpace.targetThreat;
  const runnerDistance = distance(receiver.position, target);
  const runnerTime = computeTimeToCoverDistance(receiver, runnerDistance, target);
  const passTime = passDistance / Math.max(resolveBallActionProfile("pass", startPoint, target, carrier, null).averageSpeed, 0.01);
  const timingFit = clamp(1 - Math.abs(runnerTime - passTime) / 1.4, 0, 1);
  const receiverRoleFit =
  roleKey === "connector"
  ? 0.48
  : roleKey === "secondStriker"
  ? 0.42
  : roleKey === "striker"
  ? 0.34
  : 0.28;
  const receiveQuality =
  getAutoPilotRoleStrength(receiver, "receiver") * 0.44 +
  getPlayerTendency(receiver, "passAndMove") * 0.22 +
  getAutoPilotRoleStrength(receiver, "creator") * 0.18;
  const score =
  1.18 +
  laneClarity * 0.92 +
  actionSpace.value * 1.15 +
  clamp(actionSpace.lineBreakCount, 0, 3) * 0.18 +
  timingFit * 0.52 +
  receiveQuality +
  receiverRoleFit +
  profile.shortSupport * 0.2 +
  profile.lineBreakBias * 0.4 +
  (progressionWindow.active ? 0.48 + progressionWindow.urgency * 0.24 : 0) +
  (
  targetThreat.centralPocket >= 0.34 ||
  targetThreat.betweenLines >= 0.46 ||
  targetThreat.halfSpace >= 0.45
  ? 0.34
  : 0
  ) -
  ownerPressure * 0.36 -
  actionSpace.targetPressure * 0.38 -
  Math.abs(passDistance - 18) * 0.012;
  return {
  receiver,
  roleKey,
  target,
  passDistance,
  forwardGain,
  laneClarity,
  actionSpace,
  score,
  timingFit,
  };
  })
  .filter((candidate) => (
  candidate.passDistance >= 7 &&
  candidate.passDistance <= 29 &&
  candidate.forwardGain >= 3.5 &&
  candidate.laneClarity >= 0.38 &&
  candidate.timingFit >= 0.14 &&
  candidate.actionSpace.value >= 0.34 &&
  candidate.score >= 1.74
  ))
  .sort((a, b) => b.score - a.score);
  const selected = candidates[0];
  if (!selected) {
  return null;
  }
  return {
  actionType: "pass",
  target: selected.target,
  receiverPlayerId: null,
  receiverRoleKey: selected.roleKey,
  passDistance: selected.passDistance,
  forwardGain: selected.forwardGain,
  laneClarity: selected.laneClarity,
  receiverPressure: selected.actionSpace.targetPressure,
  supportNearTarget: getTeamSupportCountAroundPoint(teamId, selected.target, new Set([carrier.id, selected.receiver.id]), 14),
  isLineBreak: selected.actionSpace.lineBreakCount >= 1 || selected.forwardGain >= 8,
  isSwitch: false,
  isSidewaysPass: false,
  isBoxPass: selected.actionSpace.targetThreat.box >= 0.24,
  isPrinciplePattern: true,
  principleKey: "between-lines-pocket",
  principleLabel: `Between-lines pocket: ${getPlayerMagnetLabel(selected.receiver)} receives in ${selected.actionSpace.targetThreat.primaryLabel}`,
  principleRunnerPlayerId: selected.receiver.id,
  score: selected.score,
  firstTouchMode:
  selected.actionSpace.targetThreat.centralPocket >= 0.36 ||
  selected.actionSpace.targetThreat.betweenLines >= 0.5
  ? "forward"
  : "inside",
  label: "between-lines pass",
  reason: `${profile.styleLabel.toLowerCase()} finds ${getPlayerMagnetLabel(selected.receiver)} between lines to attack ${selected.actionSpace.targetThreat.primaryLabel}`,
  };
  }

  return {
    buildAutoPilotThroughBallCandidate,
    buildAutoPilotBetweenLinesCandidate,
  };
}
