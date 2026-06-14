export function createGameSimulatorAutopilotOffballSupportTriangleTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

function getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const compactness = profile.supportCompactness ?? 0.56;
const width = profile.width ?? 58;
const directness = profile.directness ?? 0.52;
const halfSpaceY = pitch.width / 2 + sideSign * 12.5;
const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 10;
const wideY = clamp(pitch.width / 2 + sideSign * clamp(width * 0.48, 23, 31), 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.46, 22, 30), 3.5, pitch.width - 3.5);
const underDrop = lerp(9.5, 15.5, compactness);
const points = {
underSupport: getDepthPoint(teamId, clamp(depth - underDrop, 17, 78), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 5.5, 0.54), 8, pitch.width - 8),
}),
insideAngle: getDepthPoint(teamId, clamp(depth + lerp(-1.5, 3, directness), 28, 86), {
y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.72 : 0.42), 8, pitch.width - 8),
}),
beyondOption: getDepthPoint(teamId, clamp(depth + lerp(8, 16, directness), 42, 96), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.42), 10, pitch.width - 10),
}),
outsideWidth: getDepthPoint(teamId, clamp(depth + lerp(1.5, 6.5, profile.widthDiscipline ?? 0.62), 32, 92), {
y: wideY,
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + lerp(3, 9, profile.switchBias ?? 0.5), 34, 92), {
y: weakWideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.16),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.74), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyBallNearSupportTriangleTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return [];
}
const labels = [];
const localExcluded = new Set([
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
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 13);
const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
const threat = getPitchThreatProfile(ballPoint, teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const isWide = isWidePrincipleZone(ballPoint);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
localExcluded.add(player.id);
labels.push(label);
return player;
};
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Ball-near support triangle");
assign("insideAngle", ["connector", "pivot", "wideForward", "secondStriker"], "Inside support angle", isWide ? sideSign : 0);
if (depth <= 86 && (gameSpace.key !== "outlet" || pressure <= 0.68 || profile.directness >= 0.5)) {
assign("beyondOption", ["striker", "wideForward", "secondStriker"], "Depth option beyond");
}
if (isWide || profile.widthDiscipline >= 0.62 || profile.overlapBias >= 0.54) {
assign("outsideWidth", ["wideBack", "wideForward"], "Outside width", sideSign);
}
if (!isWide && (profile.switchBias >= 0.56 || threat.centralPocket >= 0.28 || pressure >= 0.5)) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Weak-side release", -sideSign);
}
if (depth >= 38 || pressure >= 0.5) {
assign("restLock", ["pivot", "rest", "wideBack"], "Rest-defence lock");
}
return uniquePrincipleLabels(labels);
}
function getTargetLocalSuperiorityProfile(teamId, targets, point, excludedIds = new Set(), radius = 15) {
if (!teamId || !point) {
return {
supportCount: 0,
opponentCount: 0,
closeOpponents: 0,
underSupport: false,
lateralSupport: false,
forwardSupport: false,
geometryScore: 0,
sectorVariety: 0,
};
}
const attackSign = getAttackDirectionSign(teamId);
const sectors = new Set();
let supportCount = 0;
let opponentCount = 0;
let closeOpponents = 0;
let underSupport = false;
let lateralSupport = false;
let forwardSupport = false;
state.players.forEach((player) => {
if (isGoalkeeper(player)) {
return;
}
if (player.team === teamId) {
if (excludedIds.has(player.id)) {
return;
}
const target = targets.get(player.id) ?? player.position;
const gap = distance(target, point);
if (gap > radius) {
return;
}
supportCount += 1;
const forwardOffset = (target.x - point.x) * attackSign;
const lateralOffset = target.y - point.y;
if (forwardOffset <= -2.2 && Math.abs(lateralOffset) <= 18) {
underSupport = true;
sectors.add("under");
}
if (forwardOffset >= 3.2 && Math.abs(lateralOffset) <= 18) {
forwardSupport = true;
sectors.add("ahead");
}
if (Math.abs(lateralOffset) >= 6.5) {
lateralSupport = true;
sectors.add(lateralOffset > 0 ? "outsidePlus" : "outsideMinus");
}
if (Math.abs(forwardOffset) <= 5.5 && Math.abs(lateralOffset) <= 9) {
sectors.add("bounce");
}
return;
}
const opponentGap = distance(player.position, point);
if (opponentGap <= radius) {
opponentCount += 1;
}
if (opponentGap <= 5.5) {
closeOpponents += 1;
}
});
const sectorVariety = sectors.size;
const geometryScore = clamp(
(underSupport ? 0.3 : 0) +
(lateralSupport ? 0.22 : 0) +
(forwardSupport ? 0.18 : 0) +
clamp(supportCount / 3, 0, 1) * 0.18 +
clamp(sectorVariety / 4, 0, 1) * 0.16 -
clamp(closeOpponents / 3, 0, 1) * 0.16,
0,
1
);
return {
supportCount,
opponentCount,
closeOpponents,
underSupport,
lateralSupport,
forwardSupport,
geometryScore,
sectorVariety,
};
}
function getLocalSuperioritySupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const width = profile.width ?? 58;
const outsideY = clamp(pitch.width / 2 + sideSign * clamp(width * 0.47, 23, 31), 3.5, pitch.width - 3.5);
const insideY = clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 8.5, 0.56), 7.5, pitch.width - 7.5);
const weakSideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.45, 22, 30), 3.8, pitch.width - 3.8);
const points = {
underSupport: getDepthPoint(teamId, clamp(depth - 10.5 - (profile.supportCompactness ?? 0.55) * 4.5, 17, 76), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.46), 9, pitch.width - 9),
}),
insideSupport: getDepthPoint(teamId, clamp(depth + 1 + (profile.shortSupport ?? 0.55) * 3.5, 30, 84), {
y: insideY,
}),
outsideSupport: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.62) * 4.5, 32, 92), {
y: outsideY,
}),
forwardSupport: getDepthPoint(teamId, clamp(depth + 7 + (profile.directness ?? 0.52) * 5, 42, 96), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.36), 10, pitch.width - 10),
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + 3 + (profile.switchBias ?? 0.5) * 7, 34, 91), {
y: weakSideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.16),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 13, pitch.width - 13),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyLocalSuperioritySupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
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
const protectedSupportIds = new Set();
const sideSign = getWideSideSign(ballPoint) || 1;
const passDistance = actionMeta?.beforeSnapshot?.ball?.position
? distance(actionMeta.beforeSnapshot.ball.position, ballPoint)
: distance(state.ball.startPosition ?? state.ball.position, ballPoint);
const radius = passDistance >= 26 ? 17 : 14.5;
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const local = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11.5);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const needsRepair =
local.geometryScore < 0.62 ||
local.supportCount <= 1 ||
pressure >= 0.48 ||
(local.opponentCount > local.supportCount && targetDepth >= 34);
if (!needsRepair) {
return {
labels: [],
protectedIds: new Set(),
};
}
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getLocalSuperioritySupportTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
protectedSupportIds.add(player.id);
labels.push(label);
return player;
};
if (!local.underSupport || pressure >= 0.5) {
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Local superiority: under support");
}
const refreshedAfterUnder = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
if (!refreshedAfterUnder.lateralSupport || isWidePrincipleZone(ballPoint)) {
assign(
isWidePrincipleZone(ballPoint) ? "outsideSupport" : "insideSupport",
isWidePrincipleZone(ballPoint) ? ["wideBack", "wideForward"] : ["connector", "wideForward", "pivot"],
isWidePrincipleZone(ballPoint) ? "Local superiority: outside option" : "Local superiority: lateral angle",
isWidePrincipleZone(ballPoint) ? sideSign : 0
);
}
const refreshedAfterLateral = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
if (
!refreshedAfterLateral.forwardSupport &&
targetDepth >= 36 &&
(
targetThreat.betweenLines >= 0.24 ||
targetThreat.halfSpace >= 0.28 ||
profile.directness >= 0.55 ||
local.opponentCount <= local.supportCount + 1
)
) {
assign("forwardSupport", ["striker", "wideForward", "secondStriker", "connector"], "Local superiority: forward option");
}
if (
(profile.switchBias ?? 0.5) >= 0.56 &&
(pressure >= 0.48 || local.opponentCount >= local.supportCount + 1 || targetThreat.centralPocket >= 0.26)
) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Local superiority: weak-side release", -sideSign);
}
if (targetDepth >= 42 || pressure >= 0.52) {
assign("restLock", ["pivot", "rest", "wideBack"], "Local superiority: rest lock");
}
if (labels.length) {
labels.unshift("Local superiority support");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSupportIds,
};
}

  return {
    getBallNearSupportTriangleTarget,
    applyBallNearSupportTriangleTargets,
    getTargetLocalSuperiorityProfile,
    getLocalSuperioritySupportTarget,
    applyLocalSuperioritySupportTargets,
  };
}
