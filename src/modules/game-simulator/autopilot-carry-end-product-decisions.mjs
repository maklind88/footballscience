export function createGameSimulatorAutopilotCarryEndProductDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotFlowContext,
    getAutoPilotRoleStrength,
    getAutoPilotShotTarget,
    getLastAutoPrincipleSet,
    getOpponentGoalCenter,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getShotWindowProfile,
    principleSetIncludes,
    state,
    uniquePrincipleLabels,
  } = deps;

  function getAutoPilotCarryEndProductContext(carrier, startPoint, profile = {}) {
  if (!carrier || !startPoint) {
  return { active: false };
  }
  const teamId = carrier.team;
  const flow = getAutoPilotFlowContext(carrier, startPoint);
  const lastStep = flow.lastStep;
  if (!lastStep || lastStep.actionType !== "dribble") {
  return { active: false, flow };
  }
  const sign = getAttackDirectionSign(teamId);
  const carryStart =
  lastStep.beforeSnapshot?.ball?.position ??
  lastStep.beforeSnapshot?.ball?.startPosition ??
  lastStep.beforeSnapshot?.players?.find?.((player) => player.id === carrier.id)?.position ??
  startPoint;
  const carryEnd = lastStep.target ?? startPoint;
  const carryDistance = distance(carryStart, carryEnd);
  const carryForwardGain = (carryEnd.x - carryStart.x) * sign;
  const carryEndedHere = distance(carryEnd, startPoint) <= 8.5;
  const sameCarrier =
  lastStep.carrierPlayerId === carrier.id ||
  lastStep.afterSnapshot?.ball?.ownerPlayerId === carrier.id ||
  state.ball.ownerPlayerId === carrier.id;
  const principles = getLastAutoPrincipleSet(teamId);
  const wasRunwayCarry =
  principleSetIncludes(principles, "Open-grass runway") ||
  principleSetIncludes(principles, "runway carry");
  const wasOpenCarry =
  wasRunwayCarry ||
  principleSetIncludes(principles, "Open-grass carry") ||
  principleSetIncludes(principles, "Carry through open") ||
  principleSetIncludes(principles, "Drive at the back line");
  const meaningfulCarry =
  carryDistance >= 6 ||
  carryForwardGain >= 4.5 ||
  wasOpenCarry;
  if (!sameCarrier || !carryEndedHere || !meaningfulCarry) {
  return {
  active: false,
  flow,
  carryDistance,
  carryForwardGain,
  wasOpenCarry,
  };
  }
  const goalTarget = getAutoPilotShotTarget(teamId, carrier);
  const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
  const attackingDepth = getAttackingDepth(startPoint, teamId);
  const pressure = getPlayerPressureLoad(carrier, startPoint);
  const startThreat = getPitchThreatProfile(startPoint, teamId);
  const shotWindow = getShotWindowProfile(carrier, startPoint, goalTarget);
  const startLane = getPitchLaneKey(startPoint);
  const isWide = startLane === "leftWide" || startLane === "rightWide";
  const finishWindow =
  goalDistance <= (wasRunwayCarry ? 38 : 34) &&
  attackingDepth >= (wasRunwayCarry ? 63 : 66) &&
  shotWindow.angleQuality >= (wasRunwayCarry ? 0.12 : 0.15) &&
  shotWindow.blockRisk <= (wasRunwayCarry ? 0.88 : 0.84) &&
  pressure <= (wasRunwayCarry ? 0.88 : 0.84) &&
  (
  shotWindow.quality >= (wasRunwayCarry ? 0.17 : 0.2) ||
  shotWindow.laneClarity >= (wasRunwayCarry ? 0.32 : 0.38) ||
  getAutoPilotRoleStrength(carrier, "finisher") >= 0.7
  );
  const cutbackWindow =
  isWide &&
  attackingDepth >= (wasRunwayCarry ? 72 : 76) &&
  goalDistance <= (wasRunwayCarry ? 40 : 36) &&
  pressure <= (wasRunwayCarry ? 0.86 : 0.82);
  const boxEntryWindow =
  attackingDepth >= (wasRunwayCarry ? 64 : 68) &&
  (startThreat.centralPocket >= 0.28 ||
  startThreat.halfSpace >= 0.34 ||
  startThreat.betweenLines >= 0.34 ||
  startThreat.box >= 0.18 ||
  startThreat.cutbackZone >= 0.24 ||
  (wasRunwayCarry && shotWindow.laneClarity >= 0.3));
  const endProductUrgency = clamp(
  (attackingDepth - 60) / 28 +
  (finishWindow ? 0.28 : 0) +
  (cutbackWindow ? 0.2 : 0) +
  (boxEntryWindow ? 0.18 : 0) +
  Math.max(0, carryForwardGain - 5) / 22 +
  (wasRunwayCarry ? 0.28 : 0) +
  (wasOpenCarry ? 0.16 : 0) -
  pressure * 0.16,
  0,
  1.35
  );
  return {
  active: endProductUrgency >= 0.34,
  flow,
  principles,
  carryDistance,
  carryForwardGain,
  wasRunwayCarry,
  wasOpenCarry,
  goalDistance,
  attackingDepth,
  pressure,
  startThreat,
  shotWindow,
  startLane,
  isWide,
  finishWindow,
  cutbackWindow,
  boxEntryWindow,
  endProductUrgency,
  };
  }
  function getAutoPilotCarryEndProductAdjustment(candidate, carrier, startPoint, profile) {
  if (!candidate?.target || !carrier || !startPoint) {
  return {
  score: 0,
  labels: [],
  context: null,
  };
  }
  const context = getAutoPilotCarryEndProductContext(carrier, startPoint, profile);
  if (!context.active) {
  return {
  score: 0,
  labels: [],
  context,
  };
  }
  const teamId = carrier.team;
  const targetThreat = candidate.actionType === "shot"
  ? context.startThreat
  : getPitchThreatProfile(candidate.target, teamId);
  const actionSpace = candidate.actionType === "shot"
  ? null
  : getActionSpaceValue(startPoint, candidate.target, teamId, profile);
  const forwardGain =
  candidate.forwardGain ??
  ((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
  const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
  const targetLane = getPitchLaneKey(candidate.target);
  const targetIsBoxOrCutback =
  candidate.isBoxPass ||
  candidate.label === "cutback" ||
  candidate.label === "cross" ||
  targetThreat.box >= 0.24 ||
  targetThreat.cutbackZone >= 0.3;
  const targetIsFinalThirdPocket =
  targetThreat.centralPocket >= 0.34 ||
  targetThreat.betweenLines >= 0.42 ||
  targetThreat.halfSpace >= 0.42 ||
  targetThreat.assistZone >= 0.36;
  const sterileRecycle =
  candidate.actionType === "pass" &&
  !candidate.isSwitch &&
  !targetIsBoxOrCutback &&
  !targetIsFinalThirdPocket &&
  forwardGain < 2 &&
  targetThreat.value <= context.startThreat.value + 0.04 &&
  passDistance <= 24;
  const backwardsRecycle =
  candidate.actionType === "pass" &&
  forwardGain <= -5 &&
  !candidate.isSwitch &&
  !targetIsBoxOrCutback;
  const repeatedLowValueCarry =
  candidate.actionType === "dribble" &&
  context.attackingDepth >= 68 &&
  forwardGain < 7 &&
  (actionSpace?.openTarget ?? 0) < 0.64 &&
  targetThreat.box < 0.22 &&
  targetThreat.behindLine < 0.34;
  const continuationCarry =
  candidate.actionType === "dribble" &&
  forwardGain >= 6 &&
  (actionSpace?.openTarget ?? 0) >= 0.56 &&
  (targetThreat.box >= 0.18 || targetThreat.behindLine >= 0.28 || context.goalDistance > 27);
  const labels = [];
  let score = 0;
  if (candidate.actionType === "shot" && context.finishWindow) {
  score +=
  0.5 +
  context.endProductUrgency * 0.38 +
  context.shotWindow.quality * 0.32 +
  (context.wasRunwayCarry ? 0.22 : 0);
  labels.push(context.wasRunwayCarry ? "Runway end product: shoot" : "Carry end product: shoot");
  }
  if (candidate.actionType === "pass" && targetIsBoxOrCutback) {
  score +=
  0.42 +
  context.endProductUrgency * 0.3 +
  (targetThreat.cutbackZone >= 0.3 ? 0.16 : 0) +
  (context.wasRunwayCarry ? 0.14 : 0);
  labels.push(candidate.label === "cutback" ? "Runway end product: cutback" : "Carry end product: attack box");
  }
  if (
  candidate.actionType === "pass" &&
  targetIsFinalThirdPocket &&
  forwardGain >= -1 &&
  !targetIsBoxOrCutback
  ) {
  score += 0.24 + context.endProductUrgency * 0.18;
  labels.push("Carry end product: connect in final third");
  }
  if (
  candidate.actionType === "pass" &&
  candidate.isSwitch &&
  context.isWide &&
  targetLane !== context.startLane &&
  forwardGain >= -4
  ) {
  score += 0.16 + (profile.switchBias ?? 0.5) * 0.12;
  labels.push("Carry end product: release weak side");
  }
  if (continuationCarry && !context.finishWindow && !context.cutbackWindow) {
  score += 0.18 + (profile.carryBias ?? 0.5) * 0.12 + (context.wasRunwayCarry ? 0.1 : 0);
  labels.push(context.wasRunwayCarry ? "Runway: keep attacking" : "Carry end product: keep driving");
  }
  if (sterileRecycle) {
  score -=
  0.42 +
  context.endProductUrgency * 0.34 +
  (profile.progressionUrgency ?? 0.5) * 0.18 +
  (context.wasRunwayCarry ? 0.36 : 0);
  labels.push(context.wasRunwayCarry ? "Do not waste runway" : "Avoid recycle after carry");
  }
  if (backwardsRecycle && context.pressure <= 0.62) {
  score -= 0.36 + context.endProductUrgency * 0.26 + (context.wasRunwayCarry ? 0.28 : 0);
  }
  if (repeatedLowValueCarry) {
  score -= 0.34 + context.endProductUrgency * 0.22 + (context.wasRunwayCarry ? 0.18 : 0);
  }
  return {
  score: clamp(score, -1.05, 1.25),
  labels: uniquePrincipleLabels(labels),
  context,
  };
  }

  return {
    getAutoPilotCarryEndProductContext,
    getAutoPilotCarryEndProductAdjustment,
  };
}
