export function createGameSimulatorAutopilotOffballPressEscapeTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getNearestOpponentGapToPoint,
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

function getPressResistanceEscapeTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const compactness = profile.supportCompactness ?? 0.56;
const isWide = isWidePrincipleZone(ballPoint);
const insideY = clamp(lerp(ballPoint.y, pitch.width / 2, isWide ? 0.78 : 0.44), 7, pitch.width - 7);
const oppositeY = clamp(pitch.width / 2 - sideSign * 18.5, 6, pitch.width - 6);
const sameSideHalfY = clamp(pitch.width / 2 + sideSign * 10.5, 8, pitch.width - 8);
const points = {
underEscape: getDepthPoint(teamId, clamp(depth - (10.5 + compactness * 4), 16, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 3.5, 0.52), 8, pitch.width - 8),
}),
sideEscape: getDepthPoint(teamId, clamp(depth - 2.5, 24, 82), {
y: insideY,
}),
thirdPlayer: getDepthPoint(teamId, clamp(depth + 4.5 + (profile.directness ?? 0.52) * 4.5, 34, 88), {
y: clamp(lerp(ballPoint.y, sameSideHalfY, isWide ? 0.42 : 0.68), 8, pitch.width - 8),
}),
switchOutlet: getDepthPoint(teamId, clamp(depth + 1.5 + (profile.switchBias ?? 0.5) * 6, 32, 88), {
y: oppositeY,
}),
safetyBehind: clampToPitch({
x: ballPoint.x - sign * (18 + compactness * 5),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.82), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underEscape;
}
function applyPressResistanceEscapeSupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11.5);
const nearestGap = getNearestOpponentGapToPoint(teamId, ballPoint);
const active =
pressure >= 0.46 ||
nearestGap <= 4.9 ||
(actionMeta?.autoPrinciples ?? []).some((label) => String(label).toLowerCase().includes("pressure"));
if (!active) {
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
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const depth = getAttackingDepth(ballPoint, teamId);
const isWide = isWidePrincipleZone(ballPoint);
const threat = getPitchThreatProfile(ballPoint, teamId);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getPressResistanceEscapeTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("underEscape", ["pivot", "connector", "wideBack", "rest"], "Press escape: support under ball");
assign("sideEscape", ["connector", "pivot", "wideForward", "wideBack"], "Press escape: inside angle", isWide ? 0 : sideSign);
if (pressure >= 0.56 || nearestGap <= 3.4 || threat.betweenLines >= 0.28) {
assign("thirdPlayer", ["connector", "wideForward", "secondStriker", "striker"], "Press escape: third-player outlet", isWide ? sideSign : 0);
}
if (isWide || profile.switchBias >= 0.56 || pressure >= 0.58) {
assign("switchOutlet", ["wideForward", "wideBack", "connector"], "Press escape: switch outlet", -sideSign);
}
if (depth >= 34 && pressure >= 0.54) {
assign("safetyBehind", ["pivot", "rest", "wideBack"], "Press escape: safety behind ball");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: assignedIds,
};
}
function getPressEscapeContinuationTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const halfSpaceY = clamp(pitch.width / 2 + sideSign * 10.5, 8, pitch.width - 8);
const oppositeHalfSpaceY = clamp(pitch.width / 2 - sideSign * 11.5, 8, pitch.width - 8);
const wideExitY = clamp(pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.46, 22, 30), 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.44, 20, 29), 3.5, pitch.width - 3.5);
const points = {
exitLane: getDepthPoint(teamId, clamp(depth + 8 + (profile.directness ?? 0.52) * 6, 42, 94), {
y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.52 : 0.7), 8, pitch.width - 8),
}),
wallRelease: getDepthPoint(teamId, clamp(depth + 2.5, 34, 84), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.38), 8, pitch.width - 8),
}),
wideExit: getDepthPoint(teamId, clamp(depth + 5 + (profile.overlapBias ?? 0.5) * 5, 38, 92), {
y: wideExitY,
}),
weakSwitch: getDepthPoint(teamId, clamp(depth + 4 + (profile.switchBias ?? 0.5) * 6, 38, 92), {
y: weakWideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (16 + (profile.restBehind ?? 22) * 0.12),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.exitLane;
}
function applyPressEscapeContinuationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 12.5);
const nearestGap = getNearestOpponentGapToPoint(teamId, ballPoint);
const active =
pressure >= 0.5 ||
nearestGap <= 4.4 ||
principleText.includes("press escape") ||
principleText.includes("receive escape") ||
principleText.includes("secure under pressure");
if (!active) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const isWide = isWidePrincipleZone(ballPoint);
const threat = getPitchThreatProfile(ballPoint, teamId);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getPressEscapeContinuationTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("exitLane", ["wideForward", "secondStriker", "striker", "connector"], "Escape continuation: exit lane", isWide ? sideSign : 0);
assign("wallRelease", ["connector", "pivot", "wideForward", "secondStriker"], "Escape continuation: wall release");
if (isWide || (profile.overlapBias ?? 0) >= 0.55) {
assign("wideExit", ["wideBack", "wideForward"], "Escape continuation: wide exit", sideSign);
}
if ((profile.switchBias ?? 0) >= 0.56 || pressure >= 0.58 || threat.centralPocket >= 0.24) {
assign("weakSwitch", ["wideForward", "wideBack", "connector"], "Escape continuation: weak-side switch", -sideSign);
}
assign("restLock", ["pivot", "rest", "wideBack"], "Escape continuation: rest lock");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: assignedIds,
};
}

  return {
    getPressResistanceEscapeTarget,
    applyPressResistanceEscapeSupportTargets,
    getPressEscapeContinuationTarget,
    applyPressEscapeContinuationTargets,
  };
}
