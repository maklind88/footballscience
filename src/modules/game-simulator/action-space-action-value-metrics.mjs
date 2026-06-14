export function createGameSimulatorActionSpaceActionValueMetrics(deps = {}) {
  const {
    clamp,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getPitchSpaceProfile,
    getPitchThreatProfile,
    lerp,
    pitch,
    projectPointOnSegmentWithRatio,
    state,
  } = deps;

function getOpponentPressureAtPoint(teamId, point, radius = 14) {
if (!teamId || !point) {
return 1;
}
let pressure = 0;
state.players.forEach((player) => {
if (player.team === teamId) {
return;
}
const gap = distance(player.position, point);
if (gap > radius) {
return;
}
const closeWeight = gap <= 3.5 ? 1.1 : gap <= 7 ? 0.76 : 0.38;
pressure += (1 - gap / radius) * closeWeight;
});
return clamp(pressure / 1.85, 0, 1);
}
function getNearestOpponentGapToPoint(teamId, point) {
if (!teamId || !point) {
return Infinity;
}
return state.players.reduce((nearest, player) => {
if (player.team === teamId) {
return nearest;
}
return Math.min(nearest, distance(player.position, point));
}, Infinity);
}
function getOpponentsBypassedByAction(startPoint, targetPoint, teamId) {
if (!startPoint || !targetPoint || !teamId) {
return 0;
}
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
if (forwardGain <= 3) {
return 0;
}
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const laneLength = Math.max(distance(startPoint, targetPoint), 0.01);
return state.players.reduce((count, player) => {
if (player.team === teamId) {
return count;
}
const playerDepth = getAttackingDepth(player.position, teamId);
if (playerDepth <= startDepth + 1.5 || playerDepth >= targetDepth - 1) {
return count;
}
const projection = projectPointOnSegmentWithRatio(player.position, startPoint, targetPoint);
if (projection.ratio <= 0.08 || projection.ratio >= 0.96) {
return count;
}
const laneGap = distance(player.position, projection.point);
const laneWidth = lerp(5.2, 8.8, clamp(laneLength / 36, 0, 1));
return count + (laneGap <= laneWidth ? 1 : 0);
}, 0);
}
function getFootballSpacePriority(startPoint, targetPoint, teamId, profile = {}) {
if (!startPoint || !targetPoint || !teamId) {
return {
score: 0,
label: "open space",
targetSpace: getPitchSpaceProfile(targetPoint, teamId),
startSpace: getPitchSpaceProfile(startPoint, teamId),
lineBreakCount: 0,
forwardGain: 0,
targetPressure: 1,
gameSpaceGain: 0,
targetGameSpaceKey: "outlet",
startGameSpaceKey: "outlet",
};
}
const targetSpace = getPitchSpaceProfile(targetPoint, teamId);
const startSpace = getPitchSpaceProfile(startPoint, teamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const gameSpaceGain = (targetSpace.gameSpaceIndex ?? 0) - (startSpace.gameSpaceIndex ?? 0);
const lineBreakCount = getOpponentsBypassedByAction(startPoint, targetPoint, teamId);
const targetPressure = getOpponentPressureAtPoint(teamId, targetPoint);
const wideStyle = clamp(
(profile.widthDiscipline ?? 0.48) * 0.34 +
(profile.crossBias ?? 0.42) * 0.28 +
(profile.overlapBias ?? 0.42) * 0.28 +
(profile.switchBias ?? 0.42) * 0.1,
0,
1
);
const centralStyle = clamp(
(profile.shortSupport ?? 0.5) * 0.25 +
(profile.lineBreakBias ?? 0.5) * 0.28 +
(profile.progressionUrgency ?? 0.5) * 0.25 +
(profile.tempo ?? 0.5) * 0.22,
0,
1
);
const verticalStyle = clamp(
(profile.directness ?? 0.5) * 0.36 +
(profile.lineBreakBias ?? 0.5) * 0.32 +
(profile.carryBias ?? 0.42) * 0.16 +
(profile.risk ?? 0.42) * 0.16,
0,
1
);
const progressionValue = clamp(forwardGain / 22, -0.18, 0.78);
const threatGain = targetSpace.value - startSpace.value;
const centralAccess =
targetSpace.centralPocket * (0.42 + centralStyle * 0.24) +
targetSpace.betweenLines * (0.38 + centralStyle * 0.26);
const halfSpaceAccess =
targetSpace.halfSpace * (0.22 + centralStyle * 0.16 + wideStyle * 0.14) +
(targetSpace.assistZone >= 0.38 ? targetSpace.assistZone * (0.18 + wideStyle * 0.22) : 0);
const wideAccess =
targetSpace.wideCorridor * (0.08 + wideStyle * 0.3) +
targetSpace.assistZone * (0.2 + wideStyle * 0.28);
const finalActionAccess =
targetSpace.box * 0.52 +
targetSpace.cutbackZone * (0.34 + wideStyle * 0.24) +
targetSpace.behindLine * (0.22 + verticalStyle * 0.34 + (lineBreakCount >= 1 ? 0.18 : 0));
const lineBreakValue = clamp(lineBreakCount / 3, 0, 1) * (0.18 + verticalStyle * 0.28);
const gameSpaceEntryValue = clamp(gameSpaceGain / 2, 0, 1) * (0.2 + verticalStyle * 0.2);
const targetGameSpaceValue =
targetSpace.gameSpaceKey === "space3"
? 0.22 + verticalStyle * 0.22 + targetSpace.centrality * 0.08
: targetSpace.gameSpaceKey === "space2"
? 0.16 + centralStyle * 0.22 + targetSpace.centrality * 0.08 + (targetSpace.halfSpace >= 0.34 ? 0.08 : 0)
: targetSpace.gameSpaceKey === "space1" && forwardGain >= 3
? 0.08 + centralStyle * 0.08
: 0;
const openTargetValue = clamp((getNearestOpponentGapToPoint(teamId, targetPoint) - 2.4) / 9.2, 0, 1) * 0.12;
const lowValueWidePenalty =
targetSpace.wideCorridor >= 0.42 &&
targetSpace.depth < 62 &&
forwardGain < 4 &&
targetSpace.assistZone < 0.24
? 0.18 - wideStyle * 0.08
: 0;
const sterileRecyclePenalty =
forwardGain < 1.5 &&
targetSpace.value <= startSpace.value + 0.03 &&
targetSpace.depth < 72
? 0.22 + (profile.progressionUrgency ?? 0.5) * 0.16
: 0;
const backwardsSpacePenalty =
gameSpaceGain < 0 &&
targetSpace.value <= startSpace.value + 0.04 &&
targetPressure < 0.62
? Math.abs(gameSpaceGain) * (0.16 + (profile.progressionUrgency ?? 0.5) * 0.08)
: 0;
const pressurePenalty = targetPressure * (targetSpace.depth >= 64 ? 0.18 : 0.12);
const score = clamp(
centralAccess +
halfSpaceAccess +
wideAccess +
finalActionAccess +
targetGameSpaceValue +
Math.max(0, threatGain) * 0.34 +
progressionValue * 0.22 +
lineBreakValue +
gameSpaceEntryValue +
openTargetValue -
pressurePenalty -
lowValueWidePenalty -
sterileRecyclePenalty,
-0.55,
1.2
);
const adjustedScore = clamp(
score - backwardsSpacePenalty,
-0.55,
1.2
);
return {
score: adjustedScore,
label: targetSpace.primaryLabel,
targetSpace,
startSpace,
lineBreakCount,
forwardGain,
targetPressure,
threatGain,
gameSpaceGain,
targetGameSpaceKey: targetSpace.gameSpaceKey,
startGameSpaceKey: startSpace.gameSpaceKey,
centralAccess,
halfSpaceAccess,
wideAccess,
finalActionAccess,
};
}
function getActionSpaceValue(startPoint, targetPoint, teamId, profile = {}) {
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const threatGain = targetThreat.value - startThreat.value;
const targetPressure = getOpponentPressureAtPoint(teamId, targetPoint);
const nearestOpponentGap = getNearestOpponentGapToPoint(teamId, targetPoint);
const openTarget = Number.isFinite(nearestOpponentGap)
? clamp((nearestOpponentGap - 2.2) / 8.8, 0, 1)
: 1;
const lineBreakCount = getOpponentsBypassedByAction(startPoint, targetPoint, teamId);
const progressionValue = clamp(forwardGain / 24, -0.2, 0.85);
const centralLaneValue =
Math.abs(targetPoint.y - pitch.width / 2) <= 20 && targetThreat.depth >= 42
? 0.16
: 0;
const spacePriority = getFootballSpacePriority(startPoint, targetPoint, teamId, profile);
const value = clamp(
targetThreat.value * 0.28 +
Math.max(0, threatGain) * 0.48 +
progressionValue * 0.24 +
openTarget * 0.16 +
clamp(lineBreakCount / 3, 0, 1) * 0.26 +
clamp(spacePriority.gameSpaceGain / 2, 0, 1) * 0.18 +
spacePriority.score * 0.34 +
centralLaneValue -
targetPressure * 0.12,
0,
1.35
);
return {
value,
targetPressure,
nearestOpponentGap,
openTarget,
lineBreakCount,
forwardGain,
threatGain,
targetThreat,
startThreat,
spacePriority,
gameSpaceGain: spacePriority.gameSpaceGain,
targetGameSpaceKey: spacePriority.targetGameSpaceKey,
startGameSpaceKey: spacePriority.startGameSpaceKey,
};
}


  return {
    getOpponentPressureAtPoint,
    getNearestOpponentGapToPoint,
    getOpponentsBypassedByAction,
    getFootballSpacePriority,
    getActionSpaceValue,
  };
}
