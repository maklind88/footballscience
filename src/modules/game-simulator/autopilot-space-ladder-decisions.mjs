export function createGameSimulatorAutopilotSpaceLadderDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getForwardProgressionWindow,
    getNearestOpponentGap,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    isPlayerFacingForward,
    isWidePrincipleZone,
    pitch,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotSpaceLadderContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return {
active: false,
pressureType: "unknown",
};
}
const teamId = carrier.team;
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const pressureType =
pressure >= 0.64 || nearestGap <= 2.35
? "direct"
: pressure >= 0.38 || nearestGap <= 4.8
? "indirect"
: "free";
const depth = getAttackingDepth(startPoint, teamId);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const canProgress =
pressureType !== "direct" &&
depth >= 34 &&
depth <= 86 &&
(
facingForward ||
progressionWindow.active ||
currentThreat.betweenLines >= 0.3 ||
currentThreat.centralPocket >= 0.22
);
const dangerAvailable =
currentThreat.centralPocket >= 0.24 ||
currentThreat.betweenLines >= 0.34 ||
currentThreat.halfSpace >= 0.34 ||
currentSpace.key === "space2" ||
currentSpace.key === "space3";
return {
active: true,
teamId,
currentThreat,
currentSpace,
pressure,
nearestGap,
facingForward,
pressureType,
depth,
progressionWindow,
canProgress,
dangerAvailable,
};
}
function getAutoPilotSpaceLadderAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotSpaceLadderContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = getPitchThreatProfile(target, teamId);
const targetSpace = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const threatGain = targetThreat.value - context.currentThreat.value;
const gameSpaceGain = targetSpace.index - context.currentSpace.index;
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: 0.64;
const targetPriority = clamp(
targetThreat.box * 1 +
targetThreat.cutbackZone * 0.82 +
targetThreat.centralPocket * 0.74 +
targetThreat.betweenLines * 0.58 +
targetThreat.behindLine * 0.6 +
targetThreat.halfSpace * 0.42 +
targetThreat.assistZone * 0.42 +
(candidate.isBoxPass ? 0.24 : 0) +
(candidate.isLineBreak ? 0.2 : 0) +
(candidate.actionType === "shot" ? 0.28 : 0),
0,
1.45
);
const actionOpensDanger =
targetPriority >= 0.48 ||
actionSpace.value >= 0.46 ||
threatGain >= 0.07 ||
gameSpaceGain >= 1 ||
candidate.mustShoot;
const lowValueRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain < 2.2 &&
targetThreat.value <= context.currentThreat.value + 0.045 &&
actionSpace.lineBreakCount === 0 &&
targetSpace.index <= context.currentSpace.index &&
targetThreat.depth < 78;
const wastefulBackPass =
lowValueRecycle &&
forwardGain <= -3 &&
context.pressureType !== "direct" &&
context.depth >= 42;
const wideHighContext =
isWidePrincipleZone(startPoint) &&
context.depth >= 66 &&
context.pressureType !== "direct";
const finalThirdCentralContext =
context.depth >= 68 &&
Math.abs(startPoint.y - pitch.width / 2) <= 22 &&
context.pressureType !== "direct";
const labels = [];
let score = 0;
if (context.canProgress && actionOpensDanger) {
score +=
0.2 +
targetPriority * 0.42 +
Math.max(0, threatGain) * 0.38 +
clamp(forwardGain / 18, 0, 0.42) +
(gameSpaceGain > 0 ? 0.14 + gameSpaceGain * 0.08 : 0);
labels.push(targetThreat.primaryLabel === "open space" ? "Climb the next space" : `Attack ${targetThreat.primaryLabel}`);
}
if (
context.canProgress &&
context.currentSpace.key === "space2" &&
context.facingForward &&
(candidate.actionType === "shot" || candidate.isBoxPass || targetThreat.centralPocket >= 0.3 || targetThreat.box >= 0.22)
) {
score += 0.34 + (profile.shootBias ?? 0.48) * 0.1;
labels.push("Do not waste space 2");
}
if (
context.canProgress &&
candidate.actionType === "dribble" &&
forwardGain >= 5 &&
actionSpace.openTarget >= 0.48
) {
score += 0.22 + (profile.carryBias ?? 0.5) * 0.18;
labels.push("Carry through the ladder");
}
if (wideHighContext) {
if (candidate.isBoxPass || targetThreat.cutbackZone >= 0.28 || targetThreat.box >= 0.26) {
score += 0.26 + (profile.crossBias ?? 0.46) * 0.12 + (profile.overlapBias ?? 0.48) * 0.08;
labels.push("Wide route to goal");
} else if (
lowValueRecycle &&
context.pressure <= 0.48 &&
!candidate.isSwitch
) {
score -= 0.34;
}
}
if (finalThirdCentralContext && candidate.actionType !== "shot" && lowValueRecycle) {
score -= 0.42 + (profile.shootBias ?? 0.48) * 0.18;
}
if (context.canProgress && lowValueRecycle && context.dangerAvailable) {
score -= 0.48 + (profile.progressionUrgency ?? 0.5) * 0.28;
labels.push("Avoid low-value recycle");
}
if (wastefulBackPass) {
score -= 0.24 + clamp(context.depth / 100, 0, 1) * 0.18;
}
if (
candidate.actionType === "pass" &&
actionOpensDanger &&
passDistance >= 16 &&
laneClarity < 0.34 &&
!candidate.mustShoot
) {
score -= 0.26;
}
if (
context.pressureType === "direct" &&
candidate.actionType === "pass" &&
passDistance <= 16 &&
forwardGain >= -6 &&
laneClarity >= 0.44
) {
score += 0.12 + (profile.shortSupport ?? 0.55) * 0.08;
labels.push("Secure under direct pressure");
}
return {
score: clamp(score, -1.25, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
pressureType: context.pressureType,
canProgress: context.canProgress,
startSpaceKey: context.currentSpace.key,
targetSpaceKey: targetSpace.key,
targetPriority,
lowValueRecycle,
actionOpensDanger,
},
};
}

  return {
    getAutoPilotSpaceLadderContext,
    getAutoPilotSpaceLadderAdjustment,
  };
}
