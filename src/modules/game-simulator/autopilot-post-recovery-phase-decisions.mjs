export function createGameSimulatorAutopilotPostRecoveryPhaseDecisions(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getCarryLaneOpenSpaceScore,
    getNearestOpponentGapInCarryLane,
    getOffensiveRoleKey,
    getOpponentDensityAtPoint,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getRecordedStepDuration,
    getRecordedStepPattern,
    getRecordedStepPossessionTeamId,
    getTeamSupportCountAroundPoint,
    isSupportRole,
    isTransitionAttackStyle,
    lerp,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
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
if (isRecovery && possessionTeamId === carrier.team) {
recoveryIndex = index;
break;
}
if (possessionTeamId && possessionTeamId !== carrier.team) {
break;
}
}
if (recoveryIndex < 0) {
return { active: false };
}
const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
if (!actionsAfterRecovery.length || actionsAfterRecovery.length > 4) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length };
}
if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== carrier.team)) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length };
}
const recoveryStep = steps[recoveryIndex];
const origin =
recoveryStep?.target ??
recoveryStep?.afterSnapshot?.ball?.position ??
startPoint;
const elapsed = actionsAfterRecovery.reduce(
(total, step) => total + getRecordedStepDuration(step),
0
);
if (elapsed > 10.5) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length, elapsed };
}
const originDepth = getAttackingDepth(origin, carrier.team);
const currentDepth = getAttackingDepth(startPoint, carrier.team);
const depthGain = currentDepth - originDepth;
const patterns = actionsAfterRecovery
.map((step) => getRecordedStepPattern(step, carrier.team))
.filter(Boolean);
const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
const backwardsCount = patterns.filter((pattern) => pattern.forwardGain < -4).length;
const forwardCount = patterns.filter((pattern) => pattern.forwardGain >= 6).length;
const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
const switchCount = patterns.filter((pattern) => pattern.family === "switch").length;
const lanes = patterns.map((pattern) => pattern.laneKey).filter(Boolean);
const laneVariety = new Set(lanes).size;
const sameLaneStall = actionsAfterRecovery.length >= 2 && laneVariety <= 1 && depthGain < 8;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const localSupport = getTeamSupportCountAroundPoint(
carrier.team,
startPoint,
new Set([carrier.id]),
13
);
const opponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 9);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(carrier.team) * 20,
y: lerp(startPoint.y, pitch.width / 2, 0.26),
}, 2.5);
const forwardOpenSpace = getCarryLaneOpenSpaceScore(
getNearestOpponentGapInCarryLane(carrier, forwardProbe)
);
const directStyle = isTransitionAttackStyle(profile.styleKey);
const controlStyle = ["control-possession", "tiki-taka", "fluid-combinations"].includes(profile.styleKey);
const counterWindow = clamp(
(directStyle ? 0.34 : 0) +
(profile.directness ?? 0.5) * 0.26 +
(profile.progressionUrgency ?? 0.5) * 0.16 +
forwardOpenSpace * 0.24 +
(pressure <= 0.42 ? 0.12 : 0) -
Math.max(0, actionsAfterRecovery.length - 2) * 0.08,
0,
1.1
);
const secureNeed = clamp(
pressure * 0.38 +
Math.min(opponentDensity, 4) * 0.11 +
(localSupport <= 1 ? 0.18 : 0) +
(controlStyle ? 0.14 : 0) +
(depthGain < 4 ? 0.08 : 0),
0,
1.1
);
const stalePossession =
actionsAfterRecovery.length >= 2 &&
depthGain < 8 &&
sidewaysOrBackCount >= 2 &&
lineBreakCount === 0;
const mode =
counterWindow >= Math.max(0.58, secureNeed + 0.12)
? "counter"
: secureNeed >= 0.58
? "secure"
: "establish";
return {
active: true,
recoveryIndex,
actionsAfterRecovery: actionsAfterRecovery.length,
elapsed,
origin: cloneVector(origin),
originDepth,
currentDepth,
depthGain,
sidewaysOrBackCount,
backwardsCount,
forwardCount,
lineBreakCount,
switchCount,
laneVariety,
sameLaneStall,
pressure,
localSupport,
opponentDensity,
forwardOpenSpace,
directStyle,
controlStyle,
counterWindow,
secureNeed,
stalePossession,
mode,
};
}
function getAutoPilotPostRecoveryPhaseAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const startThreat = getPitchThreatProfile(startPoint, teamId);
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const threatGain = targetThreat.value - startThreat.value;
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, candidate.actionType === "dribble" ? 8.5 : 11.5);
const targetSupport = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 12
);
const laneShift = Math.abs(getPitchLaneIndex(target) - getPitchLaneIndex(startPoint));
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const transitionAttack =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 6 &&
(
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.42 ||
targetThreat.value >= startThreat.value + 0.08 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.behindLine >= 0.22
) &&
laneClarity >= 0.44 &&
targetPressure <= 0.74;
const secureSupport =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 22 &&
targetPressure <= 0.68 &&
targetSupport >= 1 &&
forwardGain >= -8 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "wideBack" || laneShift >= 1);
const switchOut =
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 16 &&
laneClarity >= 0.54 &&
targetPressure <= 0.62;
const carryProgress =
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
laneClarity >= 0.5 &&
targetPressure <= Math.max(0.52, context.pressure + 0.04);
const finishAttack =
candidate.actionType === "shot" &&
(candidate.mustShoot || candidate.insideBox || startThreat.centralPocket >= 0.36 || startThreat.box >= 0.18);
const lowValueRecycle =
candidate.actionType === "pass" &&
forwardGain <= -4 &&
targetThreat.value <= startThreat.value + 0.04 &&
!candidate.isSwitch &&
context.pressure <= 0.5;
const sameLaneChurn =
candidate.actionType === "pass" &&
Math.abs(forwardGain) <= 3.5 &&
laneShift <= 1 &&
targetThreat.value <= startThreat.value + 0.05 &&
actionSpace.lineBreakCount === 0 &&
!candidate.isSwitch;
const forcedLong =
candidate.actionType === "pass" &&
passDistance >= 30 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!candidate.isLineBreak &&
targetSupport <= 0 &&
laneClarity < 0.62;
const labels = [];
let score = 0;
if (context.mode === "counter") {
if (transitionAttack) {
score += 0.2 + context.counterWindow * 0.34 + Math.max(0, threatGain) * 0.32;
labels.push("Post-recovery: keep counter alive");
}
if (carryProgress) {
score += 0.12 + context.forwardOpenSpace * 0.22 + (profile.carryBias ?? 0.5) * 0.12;
labels.push("Post-recovery: drive transition");
}
if (finishAttack) {
score += 0.14 + context.counterWindow * 0.18;
labels.push("Post-recovery: finish transition");
}
if (lowValueRecycle || sameLaneChurn) {
score -= 0.32 + context.counterWindow * 0.24 + (context.actionsAfterRecovery >= 2 ? 0.12 : 0);
labels.push("Post-recovery: do not kill the counter");
}
} else if (context.mode === "secure") {
if (secureSupport) {
score += 0.2 + context.secureNeed * 0.26 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Post-recovery: stabilise possession");
}
if (switchOut) {
score += 0.14 + context.secureNeed * 0.14 + (profile.switchBias ?? 0.5) * 0.16;
labels.push("Post-recovery: move away from pressure");
}
if (carryProgress && targetPressure <= context.pressure + 0.02) {
score += 0.1 + (profile.carryBias ?? 0.5) * 0.1;
labels.push("Post-recovery: carry into control");
}
if (forcedLong && !transitionAttack) {
score -= 0.34 + context.secureNeed * 0.22;
labels.push("Post-recovery: avoid forced release");
}
} else {
if (transitionAttack && context.forwardCount === 0) {
score += 0.16 + actionSpace.value * 0.24;
labels.push("Post-recovery: progress after secure pass");
}
if (switchOut && (context.sameLaneStall || context.sidewaysOrBackCount >= 1)) {
score += 0.18 + (profile.switchBias ?? 0.5) * 0.18;
labels.push("Post-recovery: change corridor");
}
if (secureSupport && context.pressure >= 0.48 && context.localSupport <= 1) {
score += 0.12 + context.secureNeed * 0.16;
labels.push("Post-recovery: create support angle");
}
if (sameLaneChurn && context.sidewaysOrBackCount >= 1) {
score -= 0.24 + (profile.progressionUrgency ?? 0.5) * 0.18;
labels.push("Post-recovery: avoid same-zone loop");
}
}
if (context.stalePossession) {
if (transitionAttack || switchOut || carryProgress) {
score += 0.18 + (profile.progressionUrgency ?? 0.5) * 0.18;
labels.push("Post-recovery: restart momentum");
} else if (sameLaneChurn || lowValueRecycle) {
score -= 0.28 + (profile.progressionUrgency ?? 0.5) * 0.22;
}
}
if (forcedLong && context.mode !== "counter" && (profile.routeOneBias ?? 0.5) < 0.58) {
score -= 0.18;
}
return {
score: clamp(score, -0.95, 0.9),
labels: uniquePrincipleLabels(labels),
context: {
mode: context.mode,
actionsAfterRecovery: context.actionsAfterRecovery,
elapsed: context.elapsed,
depthGain: context.depthGain,
pressure: context.pressure,
localSupport: context.localSupport,
forwardOpenSpace: context.forwardOpenSpace,
counterWindow: context.counterWindow,
secureNeed: context.secureNeed,
stalePossession: context.stalePossession,
sameLaneStall: context.sameLaneStall,
laneClarity,
targetPressure,
transitionAttack,
secureSupport,
switchOut,
carryProgress,
finishAttack,
lowValueRecycle,
sameLaneChurn,
forcedLong,
},
};
}

  return {
    getAutoPilotPostRecoveryPhaseContext,
    getAutoPilotPostRecoveryPhaseAdjustment,
  };
}
