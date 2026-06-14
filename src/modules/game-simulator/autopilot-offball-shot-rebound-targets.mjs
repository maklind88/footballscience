export function createGameSimulatorAutopilotOffballShotReboundTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getMovableAutopilotPlayerByRoles,
    getOpponentGoalCenter,
    getOpponentPenaltySpot,
    getPlayerBallControlPoint,
    getPlayerById,
    getShotWindowProfile,
    lerp,
    pitch,
    resolveBallActionProfile,
    setAutopilotPrincipleTarget,
    state,
  } = deps;

function getShotReboundGeometryContext(teamId, ballPoint, actionMeta, profile = {}) {
if (actionMeta?.actionType !== "shot") {
return null;
}
const shooter = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
(shooter ? getPlayerBallControlPoint(shooter) : null) ??
state.ball.position;
const intendedTarget =
actionMeta.target ??
state.ball.target ??
ballPoint ??
getOpponentGoalCenter(teamId);
if (!startPoint || !intendedTarget) {
return null;
}
const sign = getAttackDirectionSign(teamId);
const goalCenter = getOpponentGoalCenter(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const shotWindow = shooter ? getShotWindowProfile(shooter, startPoint, intendedTarget) : null;
const resolvedProfile = shooter
? resolveBallActionProfile("shot", startPoint, intendedTarget, shooter, null)
: null;
const shotDistance = distance(startPoint, goalCenter);
const targetY = Number.isFinite(intendedTarget.y) ? intendedTarget.y : goalCenter.y;
const shotSide =
Math.sign(targetY - pitch.width / 2) ||
Math.sign(startPoint.y - pitch.width / 2) ||
1;
const shotSpeed = Math.max(
state.ball.currentSpeed ||
state.ball.launchSpeed ||
state.ball.speed ||
resolvedProfile?.averageSpeed ||
18,
0.1
);
const shotPower = clamp((shotSpeed - 9.5) / 17, 0, 1);
const blockRisk = shotWindow?.blockRisk ?? 0.42;
const goalkeeperOpenness = shotWindow?.goalkeeperOpenness ?? 0.54;
const shotQuality = shotWindow?.quality ?? 0.52;
const laneClarity = shotWindow?.laneClarity ?? 0.54;
const closeRange = clamp((24 - shotDistance) / 20, 0, 1);
const cornerReach = clamp(Math.abs(targetY - pitch.width / 2) / (7.32 / 2), 0, 1.15);
const likelyBlock = blockRisk >= 0.52 && shotDistance >= 13;
const likelyParry =
!likelyBlock &&
(
goalkeeperOpenness <= 0.62 ||
shotQuality <= 0.62 ||
cornerReach >= 0.52 ||
shotPower >= 0.5
);
const reboundProbability = clamp(
blockRisk * 0.34 +
(1 - goalkeeperOpenness) * 0.28 +
(1 - shotQuality) * 0.2 +
shotPower * 0.08 +
cornerReach * 0.08 +
(1 - laneClarity) * 0.08 +
profile.directness * 0.02,
0,
1
);
let spillPoint;
if (likelyBlock) {
const blockRatio = clamp(0.34 + blockRisk * 0.22 - closeRange * 0.08, 0.32, 0.62);
const blockPoint = {
x: lerp(startPoint.x, intendedTarget.x, blockRatio),
y: lerp(startPoint.y, intendedTarget.y, blockRatio),
};
spillPoint = {
x: blockPoint.x - sign * (1.8 + blockRisk * 3.2),
y: blockPoint.y + shotSide * (2.1 + shotPower * 2.8),
};
} else if (likelyParry) {
spillPoint = {
x: penaltySpot.x + sign * clamp(0.8 + shotQuality * 2.6 - closeRange * 0.8, 0.6, 3.4),
y: lerp(targetY, pitch.width / 2 + shotSide * (6.8 + cornerReach * 4.8), 0.62),
};
} else {
spillPoint = {
x: penaltySpot.x - sign * clamp(1.6 + shotDistance * 0.04, 1.8, 3.8),
y: pitch.width / 2 + shotSide * clamp(2.4 + shotPower * 2.6, 2.4, 5.2),
};
}
return {
startPoint: cloneVector(startPoint),
shotTarget: cloneVector(intendedTarget),
goalCenter,
penaltySpot,
sign,
shotSide,
shotDistance,
shotPower,
blockRisk,
goalkeeperOpenness,
shotQuality,
laneClarity,
cornerReach,
reboundProbability,
likelyBlock,
likelyParry,
highReboundChance:
likelyBlock ||
likelyParry ||
reboundProbability >= 0.44,
spillPoint: clampToPitch(spillPoint, 2.2),
};
}
function getShotReboundTarget(teamId, ballPoint, slot, geometry = null) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = geometry?.penaltySpot ?? getOpponentPenaltySpot(teamId);
const shotSide =
geometry?.shotSide ??
(Math.sign((ballPoint?.y ?? pitch.width / 2) - pitch.width / 2) || 1);
const spillPoint = geometry?.spillPoint ?? null;
if (geometry && spillPoint) {
const points = {
crash: geometry.likelyBlock
? {
x: spillPoint.x + sign * 2.2,
y: lerp(spillPoint.y, pitch.width / 2 + shotSide * 3.2, 0.36),
}
: {
x: lerp(spillPoint.x, penaltySpot.x + sign * 4.4, 0.38),
y: lerp(spillPoint.y, pitch.width / 2 + shotSide * 4.2, 0.46),
},
farRebound: {
x: penaltySpot.x + sign * (geometry.likelyParry ? 3.8 : 2.8),
y: pitch.width / 2 - shotSide * (geometry.likelyBlock ? 7.6 : 10.4),
},
centralSecondBall: geometry.likelyBlock
? {
x: spillPoint.x - sign * 3.6,
y: lerp(spillPoint.y, pitch.width / 2, 0.62),
}
: {
x: lerp(spillPoint.x, penaltySpot.x - sign * 1.2, 0.62),
y: lerp(spillPoint.y, pitch.width / 2 - shotSide * 1.8, 0.56),
},
edgeLock: {
x: penaltySpot.x - sign * (geometry.likelyBlock ? 12.2 : 9.8),
y: pitch.width / 2 - shotSide * (3.6 + geometry.reboundProbability * 2.2),
},
};
return clampToPitch(points[slot] ?? points.centralSecondBall, 2);
}
const points = {
crash: {
x: penaltySpot.x + sign * 5.6,
y: pitch.width / 2 + shotSide * 4.4,
},
farRebound: {
x: penaltySpot.x + sign * 4.2,
y: pitch.width / 2 - shotSide * 8.8,
},
centralSecondBall: {
x: penaltySpot.x - sign * 1.5,
y: pitch.width / 2 - shotSide * 1.4,
},
edgeLock: {
x: penaltySpot.x - sign * 9.4,
y: pitch.width / 2 - shotSide * 3.8,
},
};
return clampToPitch(points[slot] ?? points.centralSecondBall, 2);
}
function applyShotReboundPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds = new Set()) {
if (actionMeta?.actionType !== "shot") {
return [];
}
const labels = [];
const geometry = getShotReboundGeometryContext(teamId, ballPoint, actionMeta, profile);
const shooter = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const shotWindow = shooter
? getShotWindowProfile(
shooter,
actionMeta.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position,
ballPoint
)
: null;
const highReboundChance =
geometry?.highReboundChance ??
(
!shotWindow ||
shotWindow.blockRisk >= 0.28 ||
shotWindow.goalkeeperOpenness <= 0.56 ||
shotWindow.quality <= 0.66
);
const crashRunner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "wideForward", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, crashRunner, getShotReboundTarget(teamId, ballPoint, "crash", geometry))) {
excludedIds.add(crashRunner.id);
labels.push(geometry?.likelyBlock ? "Attack blocked-shot rebound" : "Crash rebound");
}
if (highReboundChance) {
const farRunner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "secondStriker", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farRunner, getShotReboundTarget(teamId, ballPoint, "farRebound", geometry))) {
excludedIds.add(farRunner.id);
labels.push(geometry?.likelyParry ? "Far-side parry runner" : "Far-post rebound");
}
}
const secondBall = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "pivot", "wideForward"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(
targets,
secondBall,
getShotReboundTarget(teamId, ballPoint, highReboundChance ? "centralSecondBall" : "edgeLock", geometry)
)) {
excludedIds.add(secondBall.id);
labels.push(highReboundChance ? "Second-ball finish" : "Edge rebound lock");
}
const edgeLock = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "rest"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, edgeLock, getShotReboundTarget(teamId, ballPoint, "edgeLock", geometry))) {
excludedIds.add(edgeLock.id);
labels.push("Rest-defence after shot");
}
if (labels.length && geometry?.reboundProbability >= 0.44) {
labels.unshift("Shot rebound geometry");
}
return labels;
}

  return {
    getShotReboundGeometryContext,
    getShotReboundTarget,
    applyShotReboundPrincipleTargets,
  };
}
