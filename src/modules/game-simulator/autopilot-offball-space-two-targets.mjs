export function createGameSimulatorAutopilotOffballSpaceTwoTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOffensiveAutopilotProfile,
    getOffensivePhaseKey,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getWideSideSign,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

function getSpaceTwoForwardFacingTarget(teamId, hubPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(hubPoint, teamId);
const width = clamp(profile.width ?? 58, 42, 66);
const nearHalfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const nearWideY = clamp(pitch.width / 2 + sideSign * width * 0.48, 3.5, pitch.width - 3.5);
const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.5, pitch.width - 3.5);
const points = {
bounceUnder: getDepthPoint(teamId, clamp(depth - 8.5 - profile.shortSupport * 4.5, 22, 72), {
y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 4.8, 0.46), 10, pitch.width - 10),
}),
nextLinePin: getDepthPoint(teamId, clamp(depth + 11 + profile.runnerBoost * 0.45, 54, 97), {
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.5), 13, pitch.width - 13),
}),
blindsideDiagonal: getDepthPoint(teamId, clamp(depth + 13 + profile.directness * 5.5, 56, 98), {
y: clamp(lerp(hubPoint.y, farHalfY, 0.62), 9, pitch.width - 9),
}),
insideWall: getDepthPoint(teamId, clamp(depth + 2.5 + profile.shortSupport * 4, 42, 84), {
y: clamp(lerp(hubPoint.y, nearHalfY, 0.48), 8, pitch.width - 8),
}),
outsideWidth: getDepthPoint(teamId, clamp(depth + 2 + profile.widthDiscipline * 5, 40, 90), {
y: nearWideY,
}),
weakSideWidth: getDepthPoint(teamId, clamp(depth + 4 + profile.switchBias * 7, 42, 91), {
y: farWideY,
}),
boxArrive: getDepthPoint(teamId, clamp(84 + profile.directness * 8, 80, 98), {
y: clamp(pitch.width / 2 + sideSign * 6.4, 12, pitch.width - 12),
}),
cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6, 68, 83), {
y: clamp(pitch.width / 2 - sideSign * 6.5, 14, pitch.width - 14),
}),
restLock: clampToPitch({
x: hubPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.bounceUnder;
}
function applySpaceTwoForwardFacingTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
hubPoint;
const hubSpace = getAttackingGameSpaceProfile(hubPoint, teamId);
const hubThreat = getPitchThreatProfile(hubPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, hubPoint, teamId, profile);
const targetDepth = getAttackingDepth(hubPoint, teamId);
const pressure = getOpponentPressureAtPoint(teamId, hubPoint, 11.5);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.firstTouchMode,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const forwardFacingCue =
principleText.includes("forward") ||
principleText.includes("space 2") ||
principleText.includes("spelyta") ||
principleText.includes("between-lines") ||
principleText.includes("line break") ||
actionSpace.forwardGain >= 4 ||
actionSpace.lineBreakCount >= 1;
const activeSpace =
hubSpace.key === "space2" ||
hubThreat.betweenLines >= 0.32 ||
hubThreat.centralPocket >= 0.24 ||
hubThreat.halfSpace >= 0.36;
const canAttackNextLine =
activeSpace &&
targetDepth >= 40 &&
targetDepth <= 80 &&
pressure <= 0.68 &&
forwardFacingCue;
if (!canAttackNextLine) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
state.ball.carrierPlayerId,
].filter(Boolean));
const protectedSpaceTwoIds = new Set();
const sideSign = getWideSideSign(hubPoint) || getWideSideSign(startPoint) || 1;
const isWideOrHalf = isWidePrincipleZone(hubPoint) || hubThreat.halfSpace >= 0.34;
const finalThirdEntry =
targetDepth >= 62 ||
hubThreat.centralPocket >= 0.34 ||
hubThreat.behindLine >= 0.22 ||
actionSpace.value >= 0.46;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getSpaceTwoForwardFacingTarget(teamId, hubPoint, slot, sideSign, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, hubPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, hubPoint);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedSpaceTwoIds.add(player.id);
labels.push(label);
return player;
};
assign("bounceUnder", ["pivot", "connector", "wideBack", "rest"], "Space 2: bounce support");
assign("nextLinePin", ["striker", "wideForward", "secondStriker"], "Space 2: pin next line");
assign("blindsideDiagonal", ["wideForward", "secondStriker", "striker"], "Space 2: blindside diagonal", -sideSign);
assign("insideWall", ["connector", "wideForward", "secondStriker", "pivot"], "Space 2: inside wall pass", isWideOrHalf ? sideSign : 0);
if (isWideOrHalf || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.62) {
assign("outsideWidth", ["wideBack", "wideForward"], "Space 2: outside lane", sideSign);
}
if (profile.switchBias >= 0.54 || pressure >= 0.48 || !isWideOrHalf) {
assign("weakSideWidth", ["wideForward", "wideBack"], "Space 2: weak-side release", -sideSign);
}
if (finalThirdEntry) {
assign("boxArrive", ["striker", "wideForward", "secondStriker"], "Space 2: attack box");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Space 2: cutback edge");
}
assign("restLock", ["pivot", "rest", "wideBack"], "Space 2: rest-defence lock");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSpaceTwoIds,
};
}
function getSpaceTwoContinuationContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return null;
}
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
hubPoint;
const hubSpace = getAttackingGameSpaceProfile(hubPoint, teamId);
const hubThreat = getPitchThreatProfile(hubPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, hubPoint, teamId, profile);
const targetDepth = getAttackingDepth(hubPoint, teamId);
const pressure = getOpponentPressureAtPoint(teamId, hubPoint, 11.5);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.firstTouchMode,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const continuationCue =
principleText.includes("space 2") ||
principleText.includes("spelyta") ||
principleText.includes("between-lines") ||
principleText.includes("line break") ||
principleText.includes("third-man") ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.forwardGain >= 4 ||
actionSpace.gameSpaceGain >= 1;
const activeSpace =
hubSpace.key === "space2" ||
actionSpace.targetGameSpaceKey === "space2" ||
hubThreat.betweenLines >= 0.28 ||
hubThreat.centralPocket >= 0.22 ||
hubThreat.halfSpace >= 0.34;
if (!activeSpace || !continuationCue || targetDepth < 38 || targetDepth > 86 || pressure > 0.78) {
return null;
}
const sideSign = getWideSideSign(hubPoint) || getWideSideSign(startPoint) || 1;
const isWideOrHalf = isWidePrincipleZone(hubPoint) || hubThreat.halfSpace >= 0.34;
const finalThirdSurge =
targetDepth >= 64 ||
hubThreat.centralPocket >= 0.34 ||
hubThreat.behindLine >= 0.2 ||
actionSpace.value >= 0.5;
const mode = finalThirdSurge
? "finalThird"
: isWideOrHalf || profile.overlapBias >= 0.58 || profile.widthDiscipline >= 0.64
? "wide"
: "central";
return {
actionSpace,
hubPoint,
hubThreat,
mode,
pressure,
sideSign,
startPoint,
targetDepth,
};
}
function getSpaceTwoContinuationTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const { actionSpace, hubPoint, mode, sideSign, targetDepth } = context;
const profile = getOffensiveAutopilotProfile(teamId, hubPoint, getOffensivePhaseKey(teamId, hubPoint));
const width = clamp(profile.width ?? 58, 44, 68);
const forwardBoost = clamp((actionSpace.forwardGain ?? 0) / 12, 0, 2.5);
const nearHalfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const nearWideY = clamp(pitch.width / 2 + sideSign * width * 0.5, 3.2, pitch.width - 3.2);
const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.5, 3.2, pitch.width - 3.2);
const boxLaneY = clamp(pitch.width / 2 + sideSign * 5.4, 13, pitch.width - 13);
const farPostY = clamp(pitch.width / 2 - sideSign * 10.5, 10, pitch.width - 10);
const nextLineDepth = clamp(targetDepth + 10 + profile.directness * 5 + forwardBoost, 54, 97);
const supportDepth = clamp(targetDepth - 7.5 - profile.shortSupport * 5, 24, 72);
const points = {
secureBounce: getDepthPoint(teamId, supportDepth, {
y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 5.5, 0.52), 9, pitch.width - 9),
}),
thirdManRelease: getDepthPoint(teamId, clamp(targetDepth + 4 + profile.shortSupport * 4, 44, 84), {
y: clamp(lerp(hubPoint.y, mode === "wide" ? nearHalfY : farHalfY, 0.56), 8, pitch.width - 8),
}),
runnerBeyond: getDepthPoint(teamId, nextLineDepth, {
y: clamp(lerp(hubPoint.y, mode === "central" ? boxLaneY : farHalfY, 0.64), 9, pitch.width - 9),
}),
outsideOverlap: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.overlapBias * 6, 48, 96), {
y: nearWideY,
}),
insideUnderlap: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.overlapBias * 4, 50, 92), {
y: clamp(lerp(hubPoint.y, nearHalfY, 0.72), 8, pitch.width - 8),
}),
weakSideArrive: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.switchBias * 7, 50, 94), {
y: mode === "finalThird" ? farPostY : farWideY,
}),
boxPin: getDepthPoint(teamId, clamp(84 + profile.directness * 7, 78, 98), {
y: clamp(pitch.width / 2 - sideSign * 2.8, 14, pitch.width - 14),
}),
cutbackEdge: getDepthPoint(teamId, clamp(71 + profile.shortSupport * 8, 68, 84), {
y: clamp(pitch.width / 2 + sideSign * 9.5, 14, pitch.width - 14),
}),
restShield: clampToPitch({
x: hubPoint.x - sign * (22 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.8), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.thirdManRelease;
}
function applySpaceTwoContinuationTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getSpaceTwoContinuationContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const labels = [];
const protectedContinuationIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, context.hubPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, context.hubPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getSpaceTwoContinuationTarget(teamId, context, slot)
)) {
return null;
}
assignedIds.add(player.id);
protectedContinuationIds.add(player.id);
labels.push(label);
return player;
};
if (context.pressure >= 0.48 || profile.shortSupport >= 0.72) {
assign("secureBounce", ["pivot", "connector", "wideBack", "rest"], "Space 2 continuation: secure bounce");
}
assign("thirdManRelease", ["connector", "pivot", "wideForward", "secondStriker"], "Space 2 continuation: third-man release");
assign("runnerBeyond", ["striker", "wideForward", "secondStriker"], "Space 2 continuation: run beyond");
if (context.mode === "wide" || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.62) {
assign("outsideOverlap", ["wideBack", "wideForward"], "Space 2 continuation: outside overlap", context.sideSign);
assign("insideUnderlap", ["connector", "wideBack", "wideForward"], "Space 2 continuation: inside underlap", context.sideSign);
}
if (context.mode !== "wide" || profile.switchBias >= 0.54 || context.pressure >= 0.44) {
assign("weakSideArrive", ["wideForward", "wideBack"], "Space 2 continuation: weak-side arrival", -context.sideSign);
}
if (context.mode === "finalThird") {
assign("boxPin", ["striker", "secondStriker", "wideForward"], "Space 2 continuation: box pin");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Space 2 continuation: cutback edge");
}
assign("restShield", ["pivot", "rest", "wideBack"], "Space 2 continuation: rest shield");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedContinuationIds,
};
}

  return {
    getSpaceTwoForwardFacingTarget,
    applySpaceTwoForwardFacingTargets,
    getSpaceTwoContinuationContext,
    getSpaceTwoContinuationTarget,
    applySpaceTwoContinuationTargets,
  };
}
