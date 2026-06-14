export function createGameSimulatorActionSpacePitchSpaceProfiles(deps = {}) {
  const {
    clamp,
    getDefensiveAutopilotLineKey,
    getDefensivePhaseKey,
    getOtherTeamId,
    getPitchLaneKey,
    pitch,
    state,
    teams,
    vec,
  } = deps;

function getAttackDirectionSign(teamId) {
return teamId === "home" ? 1 : -1;
}
function getAttackingDepth(point, teamId) {
return teamId === "home" ? point.x : pitch.length - point.x;
}
function getOpponentGoalCenter(teamId) {
return vec(teamId === "home" ? pitch.length : 0, pitch.width / 2);
}
function getDepthZoneKey(point, teamId) {
const depth = getAttackingDepth(point, teamId);
if (depth < 24) return "firstLine";
if (depth < 42) return "buildUp";
if (depth < 64) return "progression";
if (depth < 83) return "creation";
if (depth < 100) return "box";
return "goalLine";
}
function getDepthZoneLabel(depthZoneKey) {
const labels = {
firstLine: "first build-up space",
buildUp: "build-up space",
progression: "progression space",
creation: "chance-creation space",
box: "box space",
goalLine: "goal-line space",
};
return labels[depthZoneKey] ?? "open space";
}
function getLaneLabel(laneKey) {
const labels = {
leftWide: "left wide corridor",
leftHalf: "left half-space",
central: "central corridor",
rightHalf: "right half-space",
rightWide: "right wide corridor",
};
return labels[laneKey] ?? "corridor";
}
function getGoldenZoneScore(point, teamId) {
if (!point || !teamId) {
return 0;
}
const depth = getAttackingDepth(point, teamId);
const centralDistance = Math.abs(point.y - pitch.width / 2);
const centrality = clamp(1 - centralDistance / 15.5, 0, 1);
const depthValue =
depth < 56
? 0
: depth < 68
? (depth - 56) / 12
: depth <= 82
? 1
: clamp(1 - (depth - 82) / 10, 0, 1);
return clamp(depthValue * centrality, 0, 1);
}
function isGoldenZone(point, teamId, threshold = 0.52) {
return getGoldenZoneScore(point, teamId) >= threshold;
}
function getMedianNumber(values, fallback = 0) {
const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
if (!finiteValues.length) {
return fallback;
}
const middle = Math.floor(finiteValues.length / 2);
return finiteValues.length % 2
? finiteValues[middle]
: (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}
function getDepthQuantile(values, ratio, fallback = 0) {
const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
if (!finiteValues.length) {
return fallback;
}
const index = clamp(Math.round((finiteValues.length - 1) * ratio), 0, finiteValues.length - 1);
return finiteValues[index];
}
function getOpponentLineDepthsForAttackingTeam(teamId, referencePoint = state.ball.position) {
const opponentTeamId = getOtherTeamId(teamId);
if (!opponentTeamId) {
return {
forward: 34,
midfield: 54,
back: 78,
gk: pitch.length - 2,
};
}
const formation = teams[opponentTeamId]?.formation ?? "4-3-3";
const phaseKey = getDefensivePhaseKey(opponentTeamId, referencePoint ?? state.ball.position);
const lineDepths = {
forward: [],
midfield: [],
back: [],
gk: [],
};
const fieldDepths = [];
state.players
.filter((player) => player.team === opponentTeamId)
.forEach((player) => {
const lineKey = getDefensiveAutopilotLineKey(player, formation, phaseKey);
const depth = getAttackingDepth(player.position, teamId);
if (lineDepths[lineKey]) {
lineDepths[lineKey].push(depth);
}
if (lineKey !== "gk") {
fieldDepths.push(depth);
}
});
let forward = getMedianNumber(lineDepths.forward, getDepthQuantile(fieldDepths, 0.2, 34));
let midfield = getMedianNumber(lineDepths.midfield, getDepthQuantile(fieldDepths, 0.5, 54));
let back = getMedianNumber(lineDepths.back, getDepthQuantile(fieldDepths, 0.82, 78));
let gk = getMedianNumber(lineDepths.gk, pitch.length - 2);
forward = clamp(forward, 8, pitch.length - 32);
midfield = clamp(Math.max(midfield, forward + 6.5), forward + 6.5, pitch.length - 20);
back = clamp(Math.max(back, midfield + 7), midfield + 7, pitch.length - 8);
gk = clamp(Math.max(gk, back + 5.5), back + 5.5, pitch.length);
return {
forward,
midfield,
back,
gk,
};
}
function getAttackingGameSpaceProfile(point, teamId) {
if (!point || !teamId) {
return {
key: "outlet",
label: "outlet space",
index: 0,
depth: 0,
size: 0,
nextLineDepth: 34,
previousLineDepth: 0,
lineDepths: getOpponentLineDepthsForAttackingTeam(teamId, point),
};
}
const depth = getAttackingDepth(point, teamId);
const lineDepths = getOpponentLineDepthsForAttackingTeam(teamId, point);
const spaces = [
{
key: "outlet",
label: "outlet space",
index: 0,
from: 0,
to: lineDepths.forward,
},
{
key: "space1",
label: "space 1",
index: 1,
from: lineDepths.forward,
to: lineDepths.midfield,
},
{
key: "space2",
label: "space 2",
index: 2,
from: lineDepths.midfield,
to: lineDepths.back,
},
{
key: "space3",
label: "space 3",
index: 3,
from: lineDepths.back,
to: lineDepths.gk,
},
];
const activeSpace =
spaces.find((space) => depth >= space.from - 0.5 && depth < space.to + 0.5) ??
spaces[spaces.length - 1];
return {
...activeSpace,
depth,
size: Math.max(0, activeSpace.to - activeSpace.from),
nextLineDepth: activeSpace.to,
previousLineDepth: activeSpace.from,
lineDepths,
};
}
function getPitchSpaceProfile(point, teamId) {
if (!point || !teamId) {
return {
laneKey: "central",
laneLabel: "central corridor",
depthZoneKey: "buildUp",
depthZoneLabel: "build-up space",
gameSpaceKey: "outlet",
gameSpaceLabel: "outlet space",
gameSpaceIndex: 0,
gameSpaceSize: 0,
centralPocket: 0,
halfSpace: 0,
wideCorridor: 0,
betweenLines: 0,
assistZone: 0,
cutbackZone: 0,
box: 0,
behindLine: 0,
depth: 0,
centrality: 0,
value: 0,
primaryLabel: "open space",
};
}
const depth = getAttackingDepth(point, teamId);
const centralDistance = Math.abs(point.y - pitch.width / 2);
const centrality = clamp(1 - centralDistance / (pitch.width / 2), 0, 1);
const laneKey = getPitchLaneKey(point);
const depthZoneKey = getDepthZoneKey(point, teamId);
const isHalfSpaceLane = laneKey === "leftHalf" || laneKey === "rightHalf";
const isWideLane = laneKey === "leftWide" || laneKey === "rightWide";
const gameSpace = getAttackingGameSpaceProfile(point, teamId);
const centralPocket = getGoldenZoneScore(point, teamId);
const dynamicBetweenLines = gameSpace.key === "space2"
? clamp(gameSpace.size / 18, 0.25, 1) *
clamp(0.42 + centrality * 0.26 + (isHalfSpaceLane ? 0.18 : 0) - (isWideLane ? 0.12 : 0), 0, 1)
: 0;
const dynamicBehindLine = gameSpace.key === "space3"
? clamp(gameSpace.size / 15, 0.18, 1) *
clamp(0.38 + centrality * 0.2 + (isHalfSpaceLane ? 0.12 : 0), 0, 1)
: 0;
const dynamicSpaceOne = gameSpace.key === "space1"
? clamp(gameSpace.size / 20, 0.2, 1) *
clamp(0.22 + centrality * 0.18 + (isHalfSpaceLane ? 0.1 : 0), 0, 0.62)
: 0;
const halfSpace = isHalfSpaceLane && depth >= 42 && depth <= 88
? clamp(0.28 + (depth >= 58 ? 0.34 : 0.12) + (depth >= 72 ? 0.18 : 0), 0, 1)
: 0;
const wideCorridor = isWideLane && depth >= 34
? clamp(0.22 + (depth >= 58 ? 0.22 : 0) + (depth >= 74 ? 0.18 : 0), 0, 0.82)
: 0;
const betweenLines = Math.max(
depth >= 42 && depth <= 74 && centralDistance <= 23
? clamp(0.34 + centrality * 0.24 + (isHalfSpaceLane ? 0.16 : 0), 0, 1)
: 0,
dynamicBetweenLines
);
const box = depth >= 83 && depth <= 100
? clamp((1 - centralDistance / 22) * 0.78 + (depth >= 88 ? 0.22 : 0), 0, 1)
: 0;
const assistZone = depth >= 70 && depth <= 96 && centralDistance >= 18
? clamp((depth - 70) / 18, 0, 1) * clamp((centralDistance - 18) / 12, 0, 1)
: 0;
const cutbackZone = depth >= 84 && depth <= 98 && centralDistance >= 8 && centralDistance <= 24
? clamp((depth - 84) / 8, 0, 1) * clamp(1 - Math.abs(centralDistance - 15) / 10, 0, 1)
: 0;
const behindLine = Math.max(
depth >= 78
? clamp((depth - 78) / 14, 0, 1) * clamp(1 - centralDistance / 30, 0, 1)
: 0,
dynamicBehindLine
);
const value = clamp(
centralPocket * 0.24 +
betweenLines * 0.2 +
dynamicSpaceOne * 0.06 +
halfSpace * 0.16 +
wideCorridor * 0.08 +
assistZone * 0.16 +
cutbackZone * 0.2 +
box * 0.3 +
behindLine * 0.18,
0,
1
);
const primaryLabel =
box >= 0.4
? "box space"
: cutbackZone >= 0.42
? "cutback space"
: centralPocket >= 0.42
? "central pocket"
: betweenLines >= 0.42
? "between-lines space"
: assistZone >= 0.42
? "assist corridor"
: halfSpace >= 0.42
? getLaneLabel(laneKey)
: wideCorridor >= 0.42
? getLaneLabel(laneKey)
: getDepthZoneLabel(depthZoneKey);
return {
laneKey,
laneLabel: getLaneLabel(laneKey),
depthZoneKey,
depthZoneLabel: getDepthZoneLabel(depthZoneKey),
gameSpaceKey: gameSpace.key,
gameSpaceLabel: gameSpace.label,
gameSpaceIndex: gameSpace.index,
gameSpaceSize: gameSpace.size,
opponentLineDepths: gameSpace.lineDepths,
centralPocket,
zone14: centralPocket,
halfSpace,
wideCorridor,
betweenLines,
assistZone,
cutbackZone,
box,
behindLine,
depth,
centrality,
value,
primaryLabel,
};
}
function getPitchThreatProfile(point, teamId) {
if (!point || !teamId) {
return {
value: 0,
goldenZone: 0,
centralPocket: 0,
zone14: 0,
box: 0,
assistZone: 0,
cutbackZone: 0,
halfSpace: 0,
wideCorridor: 0,
betweenLines: 0,
behindLine: 0,
centrality: 0,
depth: 0,
laneKey: "central",
laneLabel: "central corridor",
depthZoneKey: "buildUp",
depthZoneLabel: "build-up space",
gameSpaceKey: "outlet",
gameSpaceLabel: "outlet space",
gameSpaceIndex: 0,
gameSpaceSize: 0,
primaryLabel: "open space",
};
}
const space = getPitchSpaceProfile(point, teamId);
const value = clamp(
space.value +
(space.depth >= 58 ? space.centrality * 0.06 : 0),
0,
1
);
return {
value,
goldenZone: space.centralPocket,
centralPocket: space.centralPocket,
zone14: space.centralPocket,
box: space.box,
assistZone: space.assistZone,
cutbackZone: space.cutbackZone,
halfSpace: space.halfSpace,
wideCorridor: space.wideCorridor,
betweenLines: space.betweenLines,
behindLine: space.behindLine,
centrality: space.centrality,
depth: space.depth,
laneKey: space.laneKey,
laneLabel: space.laneLabel,
depthZoneKey: space.depthZoneKey,
depthZoneLabel: space.depthZoneLabel,
gameSpaceKey: space.gameSpaceKey,
gameSpaceLabel: space.gameSpaceLabel,
gameSpaceIndex: space.gameSpaceIndex,
gameSpaceSize: space.gameSpaceSize,
opponentLineDepths: space.opponentLineDepths,
primaryLabel: space.primaryLabel,
};
}
  return {
    getAttackDirectionSign,
    getAttackingDepth,
    getOpponentGoalCenter,
    getDepthZoneKey,
    getDepthZoneLabel,
    getLaneLabel,
    getGoldenZoneScore,
    isGoldenZone,
    getMedianNumber,
    getDepthQuantile,
    getOpponentLineDepthsForAttackingTeam,
    getAttackingGameSpaceProfile,
    getPitchSpaceProfile,
    getPitchThreatProfile,
  };
}
