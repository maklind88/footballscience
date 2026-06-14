export function createGameSimulatorAutopilotOpponentBlockReadDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAutoPilotCandidatePattern,
    getOpponentDensityAtPoint,
    getOpponentLineDepthsForAttackingTeam,
    getOtherTeamId,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getWideSideSign,
    isGoalkeeper,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getOpponentBlockReadProfile(teamId, ballPoint = state.ball.position) {
const opponentTeamId = getOtherTeamId(teamId);
if (!opponentTeamId) {
return {
compactCenter: 0,
stretchedWidth: 0,
ballSideCompression: 0,
lineGap: 0,
highLine: 0,
deepBlock: 0,
nearBallPressure: 0,
lineDepths: getOpponentLineDepthsForAttackingTeam(teamId, ballPoint),
};
}
const opponents = state.players.filter((player) => player.team === opponentTeamId && !isGoalkeeper(player));
const lineDepths = getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
if (!opponents.length) {
return {
compactCenter: 0,
stretchedWidth: 0,
ballSideCompression: 0,
lineGap: 0,
highLine: 0,
deepBlock: 0,
nearBallPressure: 0,
lineDepths,
};
}
const ys = opponents.map((player) => player.position.y);
const blockWidth = Math.max(...ys) - Math.min(...ys);
const centralPlayers = opponents.filter((player) => Math.abs(player.position.y - pitch.width / 2) <= 18).length;
const centralDensity = centralPlayers / opponents.length;
const ballSide = getWideSideSign(ballPoint) || 1;
const ballSidePlayers = opponents.filter((player) => {
const side = getWideSideSign(player) || ballSide;
return side === ballSide || Math.abs(player.position.y - pitch.width / 2) <= 8;
}).length;
const farSidePlayers = opponents.length - ballSidePlayers;
const midfieldBackGap = Math.max(0, lineDepths.back - lineDepths.midfield);
const forwardMidfieldGap = Math.max(0, lineDepths.midfield - lineDepths.forward);
const lineGap = Math.max(midfieldBackGap, forwardMidfieldGap);
const nearBallOpponents = getOpponentDensityAtPoint(teamId, ballPoint, 12.5);
return {
compactCenter: clamp(centralDensity * 0.72 + (1 - blockWidth / 54) * 0.42, 0, 1),
stretchedWidth: clamp((blockWidth - 42) / 22, 0, 1),
ballSideCompression: clamp((ballSidePlayers - farSidePlayers + 1) / Math.max(opponents.length * 0.55, 1), 0, 1),
lineGap: clamp((lineGap - 7) / 8, 0, 1),
rawLineGapMeters: lineGap,
highLine: clamp((64 - lineDepths.back) / 16, 0, 1),
deepBlock: clamp((lineDepths.back - 76) / 16, 0, 1),
nearBallPressure: clamp(nearBallOpponents / 4, 0, 1),
ballSide,
blockWidth,
lineDepths,
};
}
function getAutoPilotOpponentBlockReadAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return {
score: 0,
labels: [],
block: null,
};
}
const teamId = carrier.team;
const block = getOpponentBlockReadProfile(teamId, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetLane = getPitchLaneKey(candidate.target);
const startLane = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetIsWide = targetLane === "leftWide" || targetLane === "rightWide";
const targetIsCentral =
targetLane === "central" ||
targetLane === "leftHalf" ||
targetLane === "rightHalf";
const highValueException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
targetThreat.value >= 0.64 ||
targetThreat.box >= 0.3;
const labels = [];
let score = 0;
if (
block.ballSideCompression >= 0.5 &&
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 16
) {
score += 0.24 + block.ballSideCompression * 0.28 + profile.switchBias * 0.18;
labels.push("Exploit weak side");
}
if (block.compactCenter >= 0.58) {
if (targetIsWide && forwardGain >= -2) {
score += 0.16 + block.compactCenter * 0.18 + profile.widthDiscipline * 0.12;
labels.push("Stretch compact block");
} else if (
!highValueException &&
targetIsCentral &&
actionSpace.lineBreakCount === 0 &&
actionSpace.openTarget < 0.46 &&
forwardGain < 5
) {
score -= 0.24 + block.compactCenter * 0.22;
}
}
if (
block.stretchedWidth >= 0.42 &&
targetIsCentral &&
forwardGain >= 3 &&
(targetThreat.betweenLines >= 0.3 || actionSpace.lineBreakCount >= 1 || targetThreat.centralPocket >= 0.28)
) {
score += 0.18 + block.stretchedWidth * 0.24 + profile.lineBreakBias * 0.16;
labels.push("Play through stretched block");
}
if (
block.lineGap >= 0.42 &&
candidate.actionType === "pass" &&
forwardGain >= 3 &&
(targetThreat.betweenLines >= 0.34 || actionSpace.targetGameSpaceKey === "space2")
) {
score += 0.22 + block.lineGap * 0.28 + profile.shortSupport * 0.12;
labels.push("Find gap between lines");
}
if (block.highLine >= 0.38) {
const attacksDepth =
actionSpace.targetGameSpaceKey === "space3" ||
targetThreat.behindLine >= 0.3 ||
candidate.isLineBreak ||
pattern.family === "front-line";
if ((candidate.actionType === "pass" || candidate.actionType === "dribble") && attacksDepth && forwardGain >= 6) {
score += 0.22 + block.highLine * 0.32 + profile.directness * 0.16;
labels.push("Attack high line");
}
}
if (block.deepBlock >= 0.38) {
if (
candidate.actionType === "shot" ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
candidate.isBoxPass ||
targetThreat.cutbackZone >= 0.32
) {
score += 0.18 + block.deepBlock * 0.22 + profile.deliveryBias * 0.12;
labels.push("Break down deep block");
} else if (
!highValueException &&
candidate.actionType === "pass" &&
passDistance >= 28 &&
forwardGain >= 8 &&
actionSpace.targetGameSpaceKey === "space3"
) {
score -= 0.22 + block.deepBlock * 0.18;
}
}
if (block.nearBallPressure >= 0.5) {
if (
candidate.actionType === "pass" &&
(candidate.isSwitch || pattern.family === "support-link" || pattern.family === "line-break") &&
(candidate.laneClarity ?? 0.5) >= 0.42
) {
score += 0.12 + block.nearBallPressure * 0.18;
labels.push("Play away from pressure");
}
if (
!highValueException &&
candidate.actionType === "dribble" &&
actionSpace.openTarget < 0.46 &&
forwardGain < 7
) {
score -= 0.2 + block.nearBallPressure * 0.22;
}
}
return {
score: clamp(score, -0.88, 1),
labels: uniquePrincipleLabels(labels),
block,
};
}

  return {
    getOpponentBlockReadProfile,
    getAutoPilotOpponentBlockReadAdjustment,
  };
}
