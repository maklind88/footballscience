export function createGameSimulatorAutopilotOffballStructureTargets(deps = {}) {
  const {
    addPointNoise,
    clamp,
    clampToPitch,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefensiveAutopilotLineKey,
    getDepthPoint,
    getLaneCenterY,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchSpaceProfile,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const width = clamp(profile.width ?? 58, 42, 66);
const wideOffset = clamp(width * 0.48, 24, 31.5);
const halfOffset = clamp(width * 0.24, 11.5, 16.8);
const strongWideY = clamp(pitch.width / 2 + sideSign * wideOffset, 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * wideOffset, 3.5, pitch.width - 3.5);
const strongHalfY = clamp(pitch.width / 2 + sideSign * halfOffset, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * halfOffset, 8, pitch.width - 8);
const points = {
strongWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.widthDiscipline * 3, 34, 88), {
y: strongWideY,
}),
weakWidth: getDepthPoint(teamId, clamp(ballDepth + 1 + profile.switchBias * 6, 34, 86), {
y: weakWideY,
}),
strongHalf: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.shortSupport * 3, 36, 82), {
y: strongHalfY,
}),
weakHalf: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 4, 38, 84), {
y: weakHalfY,
}),
underSupport: getDepthPoint(teamId, clamp(ballDepth - 9 - profile.supportCompactness * 6, 18, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.42), 10, pitch.width - 10),
}),
depthPin: getDepthPoint(teamId, clamp(ballDepth + 12 + profile.directness * 4, 52, 98), {
y: clamp(lerp(pitch.width / 2, ballPoint.y, 0.16), 14, pitch.width - 14),
}),
farDepth: getDepthPoint(teamId, clamp(ballDepth + 11 + profile.runnerBoost * 0.45, 50, 96), {
y: clamp(weakHalfY, 9, pitch.width - 9),
}),
restCentral: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.74), 14, pitch.width - 14),
}, 3),
restFar: clampToPitch({
x: ballPoint.x - sign * (24 + (profile.restBehind ?? 22) * 0.16),
y: clamp(pitch.width / 2 - sideSign * 11.2, 10, pitch.width - 10),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function getStructureBalanceCandidates(teamId, targets, excludedIds, roleKeys, referencePoint, sideSign = 0) {
const roleSet = new Set(roleKeys);
const desiredSide = sideSign ? Math.sign(sideSign) : 0;
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
if (!roleSet.has(roleKey)) {
return false;
}
if (!desiredSide) {
return true;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === desiredSide;
})
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
const aTarget = targets.get(a.id) ?? a.position;
const bTarget = targets.get(b.id) ?? b.position;
return distance(aTarget, referencePoint) - distance(bTarget, referencePoint);
});
}
function enforceOffensiveStructureBalance(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (profile.phaseKey === "setPiece") {
return [];
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const ballDepth = getAttackingDepth(ballPoint, teamId);
const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.24 || targetSpace.cutbackZone >= 0.28;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign, profile);
const player = getStructureBalanceCandidates(teamId, targets, assignedIds, roleKeys, target, preferredSide)[0] ?? null;
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
assign("underSupport", ["pivot", "connector", "wideBack"], "Structure: under support");
assign("weakWidth", ["wideForward", "wideBack"], "Structure: weak-side width", -sideSign);
if (targetSpace.wideCorridor >= 0.34 || isWidePrincipleZone(ballPoint)) {
assign("strongHalf", ["connector", "wideForward", "secondStriker"], "Structure: half-space connection", sideSign);
if ((profile.overlapBias ?? 0) >= 0.54 || (profile.widthDiscipline ?? 0) >= 0.66) {
assign("strongWidth", ["wideBack", "wideForward"], "Structure: outside lane", sideSign);
}
} else {
assign("strongHalf", ["connector", "wideForward", "secondStriker"], "Structure: near half-space", sideSign);
if ((profile.switchBias ?? 0) >= 0.56) {
assign("weakHalf", ["connector", "wideForward"], "Structure: switch connection", -sideSign);
}
}
if (ballDepth >= 42) {
assign(isFinalThird ? "farDepth" : "depthPin", ["striker", "wideForward", "secondStriker"], "Structure: depth threat");
}
assign("restCentral", ["rest", "pivot"], "Structure: rest-defence");
if (ballDepth >= 48 || actionMeta?.actionType === "dribble") {
assign("restFar", ["rest", "pivot", "wideBack"], "Structure: far rest cover", -sideSign);
}
const crowdedEntries = state.players
.filter((player) => player.team === teamId && targets.has(player.id) && !assignedIds.has(player.id))
.map((player) => ({
player,
target: targets.get(player.id),
roleKey: getOffensiveRoleKey(player, profile.formation),
}))
.filter((entry) => distance(entry.target, ballPoint) <= (isFinalThird ? 7.2 : 8.8));
crowdedEntries.forEach((entry, index) => {
if (entry.roleKey === "wideForward" || entry.roleKey === "wideBack") {
const slot = getWideSideSign(entry.player) === -sideSign ? "weakWidth" : "strongWidth";
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign, profile));
} else if (entry.roleKey === "pivot" || entry.roleKey === "rest") {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, index % 2 ? "restFar" : "restCentral", sideSign, profile));
} else if (entry.roleKey === "striker" || entry.roleKey === "secondStriker") {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, "depthPin", sideSign, profile));
} else {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, index % 2 ? "weakHalf" : "strongHalf", sideSign, profile));
}
});
if (crowdedEntries.length >= 2) {
labels.push("Structure: decongest ball area");
}
return uniquePrincipleLabels(labels);
}
function getFiveLaneOccupationSlotTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const strongWideLane = sideSign < 0 ? "leftWide" : "rightWide";
const strongHalfLane = sideSign < 0 ? "leftHalf" : "rightHalf";
const weakHalfLane = sideSign < 0 ? "rightHalf" : "leftHalf";
const weakWideLane = sideSign < 0 ? "rightWide" : "leftWide";
const points = {
strongWide: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.widthDiscipline * 4, 34, 88), {
y: getLaneCenterY(strongWideLane, profile),
}),
strongHalf: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.shortSupport * 4, 36, 84), {
y: getLaneCenterY(strongHalfLane, profile),
}),
central: getDepthPoint(teamId, clamp(ballDepth - 2.5 + profile.shortSupport * 3, 28, 78), {
y: getLaneCenterY("central", profile),
}),
weakHalf: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 4, 38, 86), {
y: getLaneCenterY(weakHalfLane, profile),
}),
weakWide: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.switchBias * 6, 36, 88), {
y: getLaneCenterY(weakWideLane, profile),
}),
restCentral: clampToPitch({
x: ballPoint.x - sign * (21 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.central;
}
function getFiveLaneOccupationCandidates(teamId, targets, protectedIds, roleKeys, target, preferredSide = 0) {
const roleSet = new Set(roleKeys);
const desiredSide = preferredSide ? Math.sign(preferredSide) : 0;
return state.players
.filter((player) => {
if (player.team !== teamId || protectedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
if (!roleSet.has(roleKey)) {
return false;
}
if (!desiredSide) {
return true;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === desiredSide;
})
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
const aTarget = targets.get(a.id) ?? a.position;
const bTarget = targets.get(b.id) ?? b.position;
const aSideFit = desiredSide && getWideSideSign(a) !== desiredSide ? 0.8 : 0;
const bSideFit = desiredSide && getWideSideSign(b) !== desiredSide ? 0.8 : 0;
return distance(aTarget, target) + aSideFit - (distance(bTarget, target) + bSideFit);
});
}
function enforceOffensiveFiveLaneOccupation(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (profile.phaseKey === "setPiece" || !ballPoint) {
return [];
}
const ballDepth = getAttackingDepth(ballPoint, teamId);
if (ballDepth < 30) {
return [];
}
const sideSign = getWideSideSign(ballPoint) || 1;
const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.22 || targetSpace.cutbackZone >= 0.28;
const shouldHoldFullWidth =
profile.widthDiscipline >= 0.56 ||
profile.switchBias >= 0.5 ||
profile.overlapBias >= 0.5 ||
targetSpace.wideCorridor >= 0.28 ||
isFinalThird;
const assignedIds = new Set([...protectedIds].filter(Boolean));
const slotDefinitions = [
{
slot: "strongWide",
lanes: sideSign < 0 ? ["leftWide"] : ["rightWide"],
roleKeys: ["wideBack", "wideForward"],
label: "Five-lane: strong-side width",
preferredSide: sideSign,
minDepth: 34,
active: shouldHoldFullWidth,
},
{
slot: "strongHalf",
lanes: sideSign < 0 ? ["leftHalf"] : ["rightHalf"],
roleKeys: ["connector", "wideForward", "secondStriker"],
label: "Five-lane: strong half-space",
preferredSide: sideSign,
minDepth: 34,
active: true,
},
{
slot: "central",
lanes: ["central"],
roleKeys: ["pivot", "connector", "secondStriker"],
label: "Five-lane: central link",
preferredSide: 0,
minDepth: 30,
active: true,
},
{
slot: "weakHalf",
lanes: sideSign < 0 ? ["rightHalf"] : ["leftHalf"],
roleKeys: ["connector", "wideForward", "secondStriker"],
label: "Five-lane: weak half-space",
preferredSide: -sideSign,
minDepth: 38,
active: profile.switchBias >= 0.42 || profile.shortSupport >= 0.58 || isFinalThird,
},
{
slot: "weakWide",
lanes: sideSign < 0 ? ["rightWide"] : ["leftWide"],
roleKeys: ["wideForward", "wideBack"],
label: "Five-lane: weak-side width",
preferredSide: -sideSign,
minDepth: 36,
active: shouldHoldFullWidth,
},
];
const labels = [];
const laneHasOccupation = (definition) =>
state.players.some((player) => {
if (player.team !== teamId || !targets.has(player.id)) {
return false;
}
const target = targets.get(player.id);
const laneKey = getPitchLaneKey(target);
const depth = getAttackingDepth(target, teamId);
return definition.lanes.includes(laneKey) && depth >= definition.minDepth && distance(target, ballPoint) >= 4.8;
});
slotDefinitions
.filter((definition) => definition.active)
.forEach((definition) => {
if (laneHasOccupation(definition)) {
return;
}
const target = getFiveLaneOccupationSlotTarget(teamId, ballPoint, definition.slot, sideSign, profile);
const player = getFiveLaneOccupationCandidates(
teamId,
targets,
assignedIds,
definition.roleKeys,
target,
definition.preferredSide
)[0] ?? null;
if (!player) {
return;
}
targets.set(player.id, target);
assignedIds.add(player.id);
labels.push(definition.label);
});
const crowdedNearBall = state.players
.filter((player) => player.team === teamId && targets.has(player.id) && !assignedIds.has(player.id))
.map((player) => ({
player,
target: targets.get(player.id),
roleKey: getOffensiveRoleKey(player, profile.formation),
}))
.filter((entry) => distance(entry.target, ballPoint) <= (isFinalThird ? 6.6 : 8.2));
crowdedNearBall.slice(0, 2).forEach((entry, index) => {
const slot = entry.roleKey === "wideForward" || entry.roleKey === "wideBack"
? index % 2 ? "weakWide" : "strongWide"
: entry.roleKey === "pivot" || entry.roleKey === "rest"
? "restCentral"
: index % 2 ? "weakHalf" : "strongHalf";
targets.set(entry.player.id, getFiveLaneOccupationSlotTarget(teamId, ballPoint, slot, sideSign, profile));
});
if (crowdedNearBall.length >= 2) {
labels.push("Five-lane: decongest around ball");
}
return uniquePrincipleLabels(labels);
}
function getAutopilotTargetVariationRadius(player, profile, mode = "attack") {
if (!player || isGoalkeeper(player)) {
return 0;
}
const roleKey = mode === "attack"
? getOffensiveRoleKey(player, profile.formation)
: getDefensiveAutopilotLineKey(player, teams[player.team]?.formation, profile.phaseKey);
const tempo = profile.tempo ?? profile.pressingIntensity ?? 0.5;
const risk = profile.risk ?? profile.tackleIntent ?? 0.48;
const phaseFactor =
profile.phaseKey === "finalThird"
? 0.85
: profile.phaseKey === "buildUp"
? 0.55
: profile.phaseKey === "highPress"
? 0.82
: 0.68;
const roleFactor =
roleKey === "wideForward" || roleKey === "wideBack" || roleKey === "forward"
? 1.16
: roleKey === "striker" || roleKey === "secondStriker" || roleKey === "connector"
? 0.96
: roleKey === "rest" || roleKey === "back"
? 0.55
: 0.72;
const modeBase = mode === "attack" ? 0.55 : 0.38;
return clamp(
modeBase + tempo * 0.34 + risk * 0.24 + phaseFactor * 0.26,
0.32,
1.35
) * roleFactor;
}
function applyAutopilotTargetVariation(teamId, targets, profile, mode = "attack", protectedIds = new Set()) {
if (profile.phaseKey === "setPiece") {
return;
}
state.players.forEach((player) => {
if (player.team !== teamId || protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const radius = getAutopilotTargetVariationRadius(player, profile, mode);
if (radius <= 0.02) {
return;
}
targets.set(player.id, addPointNoise(targets.get(player.id), radius, 3));
});
}

  return {
    getOffensiveStructureBalanceTarget,
    getStructureBalanceCandidates,
    enforceOffensiveStructureBalance,
    getFiveLaneOccupationSlotTarget,
    getFiveLaneOccupationCandidates,
    enforceOffensiveFiveLaneOccupation,
    getAutopilotTargetVariationRadius,
    applyAutopilotTargetVariation,
  };
}
