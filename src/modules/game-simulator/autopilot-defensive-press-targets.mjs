export function createGameSimulatorAutopilotDefensivePressTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getDefendingDirectionSign,
    getDefensiveAutopilotLineKey,
    getDistanceFromOwnGoal,
    getOffensiveRoleKey,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pitch,
    state,
    teams,
  } = deps;

function chooseDefensiveAutopilotPresser(teamId, ballPoint, targets, profile) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const candidates = state.players.filter(
(player) =>
player.team === teamId &&
getDefensiveAutopilotLineKey(player, formation, profile.phaseKey) !== "gk"
);
let bestCandidate = null;
let bestScore = Infinity;
candidates.forEach((player) => {
const lineKey = getDefensiveAutopilotLineKey(player, formation, profile.phaseKey);
const target = targets.get(player.id) ?? player.position;
let score =
distance(player.position, ballPoint) * 0.58 +
distance(target, ballPoint) * 0.42;
const isBallSide =
Math.sign(ballPoint.y - pitch.width / 2) === Math.sign(target.y - pitch.width / 2) ||
Math.abs(ballPoint.y - pitch.width / 2) < 6;
if (profile.phaseKey === "highPress" && lineKey !== "forward") {
score += 8;
}
if (profile.phaseKey === "midBlock" && lineKey === "back" && ballFromOwnGoal > 34) {
score += 4;
}
if (profile.phaseKey === "lowBlock" && lineKey === "forward") {
score += 5.5;
}
if (profile.phaseKey === "boxDefending" && lineKey === "forward") {
score += 7;
}
if (profile.phaseKey === "boxDefending" && lineKey === "back" && ballFromOwnGoal > 15) {
score += 2;
}
if ((profile.threatResponse?.protectCenter ?? 0) >= 0.42) {
const centralFit = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
if (lineKey === "midfield") {
score -= centralFit * (1.7 + profile.threatResponse.protectCenter * 1.8);
} else if (lineKey === "back" && ballFromOwnGoal <= 38) {
score -= centralFit * (0.8 + profile.threatResponse.protectCenter * 1.1);
} else if (lineKey === "forward" && ballFromOwnGoal <= 44) {
score += 2.2 * profile.threatResponse.protectCenter;
}
}
if (isBallSide) {
score -= (profile.phaseKey === "highPress" ? 2.5 : 1.4) * (0.8 + profile.pressingIntensity * 0.5);
}
score -= profile.pressingIntensity * (lineKey === "forward" ? 1.2 : lineKey === "midfield" ? 0.7 : 0.35);
if (score < bestScore) {
bestScore = score;
bestCandidate = player;
}
});
return bestCandidate;
}
function getDefensivePressTarget(teamId, ballPoint, profile, presser = null) {
const sign = getDefendingDirectionSign(teamId);
const protectCenter = profile.threatResponse?.protectCenter ?? 0;
const ballSide = getWideSideSign(ballPoint);
const presserSide =
presser && Number.isFinite(presser.position?.y)
? Math.sign(presser.position.y - ballPoint.y)
: 0;
const centralApproachSide = presserSide || getWideSideSign(presser) || (ballPoint.y >= pitch.width / 2 ? 1 : -1);
const widePress = ballSide !== 0;
const side = widePress ? ballSide : centralApproachSide;
const insideShield = clamp(
widePress
? 2.1 + Math.abs(ballPoint.y - pitch.width / 2) * 0.055 + protectCenter * 2.4
: 0.9 + protectCenter * 1.35,
widePress ? 1.8 : 0.65,
widePress ? 5.4 : 2.8
);
const lineCushion =
profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending"
? 0.55
: profile.phaseKey === "highPress"
? -0.25
: 0;
return clampToPitch({
x: ballPoint.x - sign * clamp(profile.pressOffset + protectCenter * 0.75 + lineCushion, 0.7, 4.2),
y: widePress
? clamp(ballPoint.y - side * insideShield, 3, pitch.width - 3)
: clamp(ballPoint.y + side * insideShield, 3, pitch.width - 3),
}, 3);
}
function getDefensiveAngledPressTarget(teamId, ballPoint, profile, presser, baseTarget = null, reference = null) {
const sign = getDefendingDirectionSign(teamId);
const attackingTeamId = getOtherTeamId(teamId);
const threat = attackingTeamId ? getPitchThreatProfile(ballPoint, attackingTeamId) : null;
const basePressTarget = getDefensivePressTarget(teamId, ballPoint, profile, presser);
const ballSide = getWideSideSign(ballPoint);
const widePress = ballSide !== 0;
const protectCenter = profile.threatResponse?.protectCenter ?? 0;
const targetThreat = threat?.value ?? 0;
const dribbleContainment = !!reference;
const goalSideCushion = clamp(
(dribbleContainment ? 1.15 : 0.55) +
protectCenter * 0.65 +
targetThreat * 0.45 +
(profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending" ? 0.4 : 0),
0.45,
2.4
);
const currentTarget = baseTarget ?? basePressTarget;
const centralLaneWeight = widePress
? clamp(0.14 + protectCenter * 0.2 + targetThreat * 0.1, 0.12, 0.42)
: clamp(0.05 + protectCenter * 0.12, 0.04, 0.2);
const sideLockY = widePress
? lerp(basePressTarget.y, pitch.width / 2, centralLaneWeight)
: basePressTarget.y;
const target = clampToPitch({
x: lerp(currentTarget.x, basePressTarget.x - sign * goalSideCushion, 0.82),
y: lerp(currentTarget.y, sideLockY, widePress ? 0.82 : 0.68),
}, 2.4);
return {
target,
label: widePress
? "Curve press to lock inside"
: dribbleContainment
? "Angle contain pressure"
: "Angled press cover shadow",
};
}
function applyDefensivePresserAngleTarget(
teamId,
targets,
presser,
ballPoint,
profile,
reference = null
) {
if (!presser || isGoalkeeper(presser) || !ballPoint || state.restartPhase?.type) {
return {
labels: [],
protectedIds: new Set([presser?.id].filter(Boolean)),
};
}
const currentTarget = targets.get(presser.id) ?? getDefensivePressTarget(teamId, ballPoint, profile, presser);
const angleProfile = getDefensiveAngledPressTarget(
teamId,
ballPoint,
profile,
presser,
currentTarget,
reference
);
const angleWeight = reference
? 0.34
: profile.phaseKey === "highPress"
? 0.56
: profile.phaseKey === "lowBlock" || profile.phaseKey === "boxDefending"
? 0.42
: 0.5;
targets.set(presser.id, clampToPitch({
x: lerp(currentTarget.x, angleProfile.target.x, angleWeight),
y: lerp(currentTarget.y, angleProfile.target.y, angleWeight),
}, 2.2));
return {
labels: [angleProfile.label],
protectedIds: new Set([presser.id]),
};
}
function getGoalkeeperBuildOutPressContext(defensiveTeamId, ballPoint) {
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
receiverPlayerId: state.ball.receiverPlayerId,
beforeSnapshot: {
ball: {
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const attackingTeamId = getOtherTeamId(defensiveTeamId);
const goalkeeper = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
if (
actionMeta.actionType !== "pass" ||
!goalkeeper ||
!isGoalkeeper(goalkeeper) ||
goalkeeper.team !== attackingTeamId
) {
return null;
}
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const startPoint = actionMeta.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? goalkeeper.position;
const target = actionMeta.target ?? ballPoint;
const passDistance = distance(startPoint, target);
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
]
.filter(Boolean)
.join(" ")
.toLowerCase();
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[attackingTeamId]?.formation) : null;
const directRelease =
principleText.includes("gk release") ||
(!receiver && passDistance >= 24) ||
(receiverRoleKey && ["striker", "wideForward", "secondStriker"].includes(receiverRoleKey) && passDistance >= 24);
const shortBuild =
!directRelease &&
(principleText.includes("gk build") ||
!!receiver ||
passDistance <= 30);
if (!shortBuild && !directRelease) {
return null;
}
return {
actionMeta,
attackingTeamId,
goalkeeper,
receiver,
receiverRoleKey,
startPoint: cloneVector(startPoint),
target: cloneVector(target),
passDistance,
directRelease,
shortBuild,
sideSign: getWideSideSign(target) || getWideSideSign(receiver) || getWideSideSign(startPoint) || 1,
};
}
function pickDefensiveAutopilotPlayer(groups, lineKeys, excludedIds, referencePoint, preferLabels = []) {
const labelPreference = new Set(preferLabels);
const candidates = lineKeys
.flatMap((lineKey) => groups[lineKey] ?? [])
.filter((player) => !excludedIds.has(player.id) && !isGoalkeeper(player));
if (!candidates.length) {
return null;
}
return candidates
.map((player) => {
const label = getPlayerMagnetLabel(player);
return {
player,
score:
distance(player.position, referencePoint) +
(labelPreference.has(label) ? -4.5 : 0) -
getPlayerDecisionContext(player).profile.tacticalDiscipline * 1.4 -
getPlayerDecisionContext(player).profile.decisionSpeed * 1.1,
};
})
.sort((a, b) => a.score - b.score)[0]?.player ?? null;
}
function getGoalkeeperBuildOutPressTarget(defensiveTeamId, context, slot) {
const sign = getDefendingDirectionSign(defensiveTeamId);
const target = context.target;
const sideSign = context.sideSign || 1;
const points = {
receiverPress: {
x: target.x - sign * 1.8,
y: lerp(target.y, pitch.width / 2, 0.16),
},
goalkeeperScreen: {
x: lerp(context.startPoint.x, target.x, 0.42) - sign * 1.4,
y: lerp(context.startPoint.y, target.y, 0.52),
},
pivotLock: {
x: lerp(context.startPoint.x, target.x, 0.72),
y: clamp(pitch.width / 2 - sideSign * 5.8, 17, pitch.width - 17),
},
farCenterBackLock: {
x: lerp(context.startPoint.x, target.x, 0.34),
y: clamp(pitch.width / 2 - sideSign * 15.5, 7, pitch.width - 7),
},
secondBallScreen: {
x: target.x - sign * 4.5,
y: clamp(lerp(target.y, pitch.width / 2, 0.42), 12, pitch.width - 12),
},
restCover: {
x: target.x - sign * 14,
y: clamp(pitch.width / 2, 15, pitch.width - 15),
},
};
return clampToPitch(points[slot] ?? points.receiverPress, 2.5);
}
function applyGoalkeeperBuildOutPressTargets(teamId, targets, groups, basePresser, ballPoint, profile) {
const context = getGoalkeeperBuildOutPressContext(teamId, ballPoint);
if (!context) {
return {
presser: basePresser,
labels: [],
};
}
const labels = [];
const excludedIds = new Set();
let presser = basePresser;
const firstPressPoint = getGoalkeeperBuildOutPressTarget(teamId, context, "receiverPress");
const firstPresser = pickDefensiveAutopilotPlayer(
groups,
profile.phaseKey === "highPress" ? ["forward", "midfield"] : ["forward"],
excludedIds,
firstPressPoint,
context.receiverRoleKey === "wideBack" || context.receiverRoleKey === "wideForward" ? ["W", "10"] : ["9", "10", "W"]
);
if (firstPresser) {
targets.set(firstPresser.id, firstPressPoint);
excludedIds.add(firstPresser.id);
presser = firstPresser;
labels.push(context.directRelease ? "Press second-ball release" : "Press GK first pass");
}
if (context.shortBuild) {
const screenForward = pickDefensiveAutopilotPlayer(
groups,
["forward"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "goalkeeperScreen"),
["9", "10"]
);
if (screenForward) {
targets.set(screenForward.id, getGoalkeeperBuildOutPressTarget(teamId, context, "goalkeeperScreen"));
excludedIds.add(screenForward.id);
labels.push("Screen pass back to GK");
}
const pivotLock = pickDefensiveAutopilotPlayer(
groups,
["midfield", "forward"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "pivotLock"),
["6", "8", "10"]
);
if (pivotLock) {
targets.set(pivotLock.id, getGoalkeeperBuildOutPressTarget(teamId, context, "pivotLock"));
excludedIds.add(pivotLock.id);
labels.push("Lock the 6");
}
const farLock = pickDefensiveAutopilotPlayer(
groups,
["forward", "midfield"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "farCenterBackLock"),
["W", "8"]
);
if (farLock) {
targets.set(farLock.id, getGoalkeeperBuildOutPressTarget(teamId, context, "farCenterBackLock"));
excludedIds.add(farLock.id);
labels.push("Curve to far CB");
}
}
if (context.directRelease) {
const secondBall = pickDefensiveAutopilotPlayer(
groups,
["midfield"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "secondBallScreen"),
["6", "8"]
);
if (secondBall) {
targets.set(secondBall.id, getGoalkeeperBuildOutPressTarget(teamId, context, "secondBallScreen"));
excludedIds.add(secondBall.id);
labels.push("Win second ball");
}
const restCover = pickDefensiveAutopilotPlayer(
groups,
["back"],
excludedIds,
getGoalkeeperBuildOutPressTarget(teamId, context, "restCover"),
["CB"]
);
if (restCover) {
targets.set(restCover.id, getGoalkeeperBuildOutPressTarget(teamId, context, "restCover"));
labels.push("Rest cover behind release");
}
}
return {
presser,
labels,
};
}

  return {
    chooseDefensiveAutopilotPresser,
    getDefensivePressTarget,
    getDefensiveAngledPressTarget,
    applyDefensivePresserAngleTarget,
    getGoalkeeperBuildOutPressContext,
    pickDefensiveAutopilotPlayer,
    getGoalkeeperBuildOutPressTarget,
    applyGoalkeeperBuildOutPressTargets,
  };
}
