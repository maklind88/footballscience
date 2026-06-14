export function createGameSimulatorAutopilotOffballTransitionAttackTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getDepthPoint,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getPlayerById,
    getPlayerPressureLoad,
    getSecurePossessionSnapshotForTeam,
    getWideSideSign,
    isTransitionAttackStyle,
    isWideChannel,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    uniquePrincipleLabels,
  } = deps;

function getTransitionAttackTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const points = {
secureOutlet: getDepthPoint(teamId, clamp(ballDepth - 8.5, 20, 72), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 7.5, 0.46), 9, pitch.width - 9),
}),
pressureRelease: getDepthPoint(teamId, clamp(ballDepth - 4.8, 18, 78), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 6.5, 0.34), 8, pitch.width - 8),
}),
carryLane: getDepthPoint(teamId, clamp(ballDepth + 5.5 + (profile.tempo ?? 0.55) * 4.5, 36, 88), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 13.5, 0.58), 7, pitch.width - 7),
}),
counterRunner: getDepthPoint(teamId, clamp(ballDepth + 18 + (profile.frontAhead ?? 12) * 0.18, 52, 95), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 8.5, 0.38), 9, pitch.width - 9),
}),
centralPin: getDepthPoint(teamId, clamp(ballDepth + 14 + (profile.directness ?? 0.55) * 6, 54, 96), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 12, pitch.width - 12),
}),
weakSideRelease: getDepthPoint(teamId, clamp(ballDepth + 10, 44, 88), {
y: clamp(pitch.width / 2 - sideSign * 25, 4.5, pitch.width - 4.5),
}),
lateTrailer: getDepthPoint(teamId, clamp(ballDepth - 1.8 + (profile.shortSupport ?? 0.55) * 4.5, 32, 82), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.5), 10, pitch.width - 10),
}),
boxSurge: getDepthPoint(teamId, clamp(78 + (profile.directness ?? 0.55) * 12, 76, 98), {
y: clamp(pitch.width / 2 + sideSign * 7.5, 11, pitch.width - 11),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.12),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.74), 16, pitch.width - 16),
}, 3),
};
return points[slot] ?? points.secureOutlet;
}
function applyTransitionAttackPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const secure = getSecurePossessionSnapshotForTeam(teamId, actionMeta);
if (!secure) {
return [];
}
const owner = getPlayerById(secure.ownerPlayerId);
const origin = secure.point ?? actionMeta?.beforeSnapshot?.ball?.position ?? ballPoint;
const movedFromRegain = distance(ballPoint, origin);
const freshness = clamp(
1 - movedFromRegain / Math.max((secure.minDistanceToExpire ?? 6) * 1.45, 0.01),
0,
1
);
if (!owner || freshness <= 0.05) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || getWideSideSign(owner) || 1;
const directStyle = isTransitionAttackStyle(profile.styleKey);
const pressure = getPlayerPressureLoad(owner, ballPoint);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const ownHalfRegain = ballDepth < 48;
const middleThirdRegain = ballDepth >= 35 && ballDepth < 68;
const finalThirdRegain = ballDepth >= 68;
const counterIntent = clamp(
(profile.directness ?? 0.52) * 0.34 +
(profile.progressionUrgency ?? 0.5) * 0.26 +
(profile.tempo ?? 0.5) * 0.18 +
(directStyle ? 0.22 : 0) +
(secure.reason === "interception" ? 0.08 : 0) -
pressure * 0.12,
0,
1.18
);
const secureIntent = clamp(
pressure * 0.42 +
(profile.shortSupport ?? 0.5) * 0.24 +
(profile.recycleWindow ?? 0.4) * 0.16 +
(ownHalfRegain ? 0.12 : 0) -
(directStyle ? 0.08 : 0),
0,
1.08
);
const assignTransitionTarget = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(
teamId,
roleKeys,
targets,
excludedIds,
preferredSide,
ballPoint
)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, excludedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getTransitionAttackTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
excludedIds.add(player.id);
labels.push(label);
return player;
};
assignTransitionTarget("secureOutlet", ["pivot", "connector", "wideBack"], "Transition: secure first pass");
if (secureIntent >= 0.46 || pressure >= 0.45 || ownHalfRegain) {
assignTransitionTarget(
"pressureRelease",
["connector", "pivot", "wideBack"],
"Transition: pressure-release angle"
);
}
if (counterIntent >= 0.42 || pressure <= 0.38 || middleThirdRegain || finalThirdRegain) {
assignTransitionTarget(
"counterRunner",
["striker", "wideForward", "secondStriker"],
"Transition: depth runner"
);
assignTransitionTarget(
"centralPin",
["striker", "secondStriker", "wideForward"],
"Transition: pin the last line"
);
assignTransitionTarget(
"weakSideRelease",
["wideForward", "wideBack"],
"Transition: weak-side release",
-sideSign
);
}
if ((profile.widthDiscipline ?? profile.width ?? 0.58) >= 0.52 || isWideChannel(ballPoint)) {
assignTransitionTarget(
"carryLane",
["wideBack", "wideForward", "connector"],
"Transition: carry lane",
sideSign
);
}
if (finalThirdRegain || (ballDepth >= 58 && pressure <= 0.48)) {
assignTransitionTarget(
"boxSurge",
["striker", "wideForward", "secondStriker", "connector"],
"Transition: box surge"
);
} else {
assignTransitionTarget(
"lateTrailer",
["connector", "pivot", "wideForward"],
"Transition: late trailer"
);
}
assignTransitionTarget("restLock", ["pivot", "rest"], "Transition: rest-defence lock");
return uniquePrincipleLabels(labels);
}

  return {
    getTransitionAttackTarget,
    applyTransitionAttackPrincipleTargets,
  };
}
