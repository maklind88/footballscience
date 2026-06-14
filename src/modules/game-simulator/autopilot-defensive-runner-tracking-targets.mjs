export function createGameSimulatorAutopilotDefensiveRunnerTrackingTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefendingDirectionSign,
    getOffensiveRoleKey,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getSnapshotPlayerMap,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pickDefensiveAutopilotPlayer,
    pitch,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveRunnerThreats(defensiveTeamId, ballPoint, profile) {
const attackingTeamId = getOtherTeamId(defensiveTeamId);
if (!attackingTeamId || state.restartPhase?.type) {
return [];
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
principleRunnerPlayerId: null,
beforeSnapshot: {
ball: {
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const carrierId =
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId;
const actionTarget = actionMeta.target ?? ballPoint;
const actionThreat = getPitchThreatProfile(actionTarget, attackingTeamId);
const ballSide = getWideSideSign(actionTarget) || 1;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const snapshotPositions = getSnapshotPlayerMap(actionMeta.beforeSnapshot);
const attackSign = getAttackDirectionSign(attackingTeamId);
const hasChannelCue =
principleText.includes("channel") ||
principleText.includes("blindside") ||
principleText.includes("run behind") ||
principleText.includes("run beyond") ||
principleText.includes("depth");
return state.players
.filter((player) => player.team === attackingTeamId && !isGoalkeeper(player) && player.id !== carrierId)
.map((player) => {
const startPosition = snapshotPositions.get(player.id) ?? player.actionOrigin ?? player.position;
const roleKey = getOffensiveRoleKey(player, teams[attackingTeamId]?.formation);
const threat = getPitchThreatProfile(player.position, attackingTeamId);
const depth = getAttackingDepth(player.position, attackingTeamId);
const startDepth = getAttackingDepth(startPosition, attackingTeamId);
const runDistance = distance(startPosition, player.position);
const runForwardGain = (player.position.x - startPosition.x) * attackSign;
const distanceToAction = distance(player.position, actionTarget);
const isPrincipleRunner = player.id === actionMeta.principleRunnerPlayerId;
const isReceiver = player.id === actionMeta.receiverPlayerId;
const isFrontLine = roleKey === "striker" || roleKey === "wideForward" || roleKey === "secondStriker";
const isBoxThreat = threat.box >= 0.22 || threat.cutbackZone >= 0.32 || depth >= 72;
const isDepthThreat = threat.behindLine >= 0.26 || depth >= 66 || (isFrontLine && depth >= 58);
const movedIntoChannel =
Math.abs(player.position.y - pitch.width / 2) >= 8.5 ||
Math.abs(player.position.y - startPosition.y) >= 5.2;
const isChannelRun =
runDistance >= 3.2 &&
runForwardGain >= 1.8 &&
movedIntoChannel &&
(
hasChannelCue ||
isPrincipleRunner ||
threat.assistZone >= 0.24 ||
threat.behindLine >= 0.18 ||
(isFrontLine && depth >= Math.max(startDepth + 4, 54))
);
const isBlindsideRun =
isChannelRun &&
(
principleText.includes("blindside") ||
isPrincipleRunner ||
getWideSideSign(startPosition) !== getWideSideSign(player.position) ||
runForwardGain >= 6
);
const isBetweenLinesThreat =
threat.betweenLines >= 0.34 ||
threat.centralPocket >= 0.26 ||
(roleKey === "connector" && depth >= 44);
const farSideThreat =
getWideSideSign(player) === -ballSide &&
(actionThreat.assistZone >= 0.34 || principleText.includes("switch") || principleText.includes("far"));
const score =
threat.value * 0.78 +
threat.box * 0.78 +
threat.behindLine * 0.62 +
threat.cutbackZone * 0.42 +
threat.betweenLines * 0.36 +
(isPrincipleRunner ? 0.82 : 0) +
(isReceiver && actionType === "pass" ? 0.22 : 0) +
(isFrontLine ? 0.28 : 0) +
(isBoxThreat ? 0.38 : 0) +
(isDepthThreat ? 0.28 : 0) +
(isChannelRun ? 0.42 : 0) +
(isBlindsideRun ? 0.34 : 0) +
Math.max(0, runForwardGain - 2) * 0.025 +
(isBetweenLinesThreat ? 0.22 : 0) +
(farSideThreat ? 0.34 : 0) -
(distanceToAction > 34 && !isPrincipleRunner ? 0.26 : 0);
return {
player,
roleKey,
threat,
depth,
startPosition,
startDepth,
runDistance,
runForwardGain,
distanceToAction,
isPrincipleRunner,
isReceiver,
isFrontLine,
isBoxThreat,
isDepthThreat,
isChannelRun,
isBlindsideRun,
isBetweenLinesThreat,
farSideThreat,
score,
};
})
.filter((entry) =>
entry.score >= 0.74 ||
entry.isPrincipleRunner ||
entry.isBoxThreat ||
entry.isDepthThreat ||
entry.isChannelRun ||
entry.isBlindsideRun ||
entry.isBetweenLinesThreat
)
.sort((a, b) => b.score - a.score)
.slice(0, 4);
}
function getDefensiveRunnerTrackingTarget(teamId, runnerThreat, slot = "goalSideMark") {
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const runner = runnerThreat.player;
const sideSign = getWideSideSign(runner) || 1;
const points = {
goalSideMark: {
x: runner.position.x - sign * (runnerThreat.isDepthThreat ? 1.8 : 1.25),
y: lerp(runner.position.y, pitch.width / 2, runnerThreat.isBoxThreat ? 0.18 : 0.1),
},
depthCover: {
x: lerp(runner.position.x, ownGoal.x, 0.34),
y: lerp(runner.position.y, pitch.width / 2, 0.28),
},
blindsideTrack: {
x: runner.position.x - sign * 2.15,
y: lerp(runner.position.y, pitch.width / 2, 0.22),
},
channelHandover: {
x: runner.position.x - sign * 1.55,
y: lerp(runner.position.y, pitch.width / 2, runnerThreat.isBlindsideRun ? 0.28 : 0.18),
},
channelCover: {
x: lerp(runner.position.x, ownGoal.x, 0.3),
y: lerp(runner.position.y, pitch.width / 2, 0.38),
},
weakSideTuck: {
x: lerp(runner.position.x, ownGoal.x, 0.4),
y: clamp(pitch.width / 2 - sideSign * 7.8, 10, pitch.width - 10),
},
pocketScreen: {
x: runner.position.x - sign * 2.7,
y: lerp(runner.position.y, pitch.width / 2, 0.54),
},
farPostCover: {
x: lerp(runner.position.x, ownGoal.x, 0.28),
y: clamp(pitch.width / 2 + sideSign * 9.4, 8, pitch.width - 8),
},
cutbackCover: {
x: lerp(runner.position.x, ownGoal.x, 0.42),
y: clamp(pitch.width / 2 - sideSign * 4.8, 12, pitch.width - 12),
},
};
return clampToPitch(points[slot] ?? points.goalSideMark, 2.2);
}
function applyDefensiveRunnerTrackingTargets(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
const threats = getDefensiveRunnerThreats(teamId, ballPoint, profile);
if (!threats.length) {
return {
labels: [],
focusPoint: null,
protectedIds: new Set(protectedIds),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
...groups.gk.map((goalkeeper) => goalkeeper.id),
].filter(Boolean));
const maxAssignments =
profile.phaseKey === "boxDefending"
? 4
: profile.phaseKey === "lowBlock"
? 3
: 2;
const assignTrackingTarget = (threat, slot, lineKeys, preferLabels, label) => {
const target = getDefensiveRunnerTrackingTarget(teamId, threat, slot);
const marker = pickDefensiveAutopilotPlayer(groups, lineKeys, assignedIds, target, preferLabels);
if (!marker) {
return null;
}
targets.set(marker.id, target);
assignedIds.add(marker.id);
if (label) {
labels.push(label);
}
return marker;
};
threats.slice(0, maxAssignments).forEach((threat, index) => {
const slot =
threat.isBlindsideRun
? "blindsideTrack"
: threat.isChannelRun
? "channelHandover"
: threat.farSideThreat
? "farPostCover"
: threat.isBoxThreat
? index % 2 === 0 ? "goalSideMark" : "cutbackCover"
: threat.isDepthThreat
? "depthCover"
: threat.isBetweenLinesThreat
? "pocketScreen"
: "goalSideMark";
const lineKeys =
threat.isDepthThreat || threat.isBoxThreat || threat.farSideThreat || threat.isChannelRun
? ["back", "midfield"]
: ["midfield", "back"];
const preferLabels =
threat.isDepthThreat || threat.isBoxThreat || threat.isChannelRun
? ["CB", "LB", "RB", "WB", "6"]
: ["6", "8", "10", "CB"];
const marker = assignTrackingTarget(threat, slot, lineKeys, preferLabels, null);
if (!marker) return;
if (threat.isBlindsideRun) {
labels.push("Track blindside channel run");
} else if (threat.isChannelRun) {
labels.push("Handover channel runner");
} else if (threat.isPrincipleRunner) {
labels.push("Track designed runner");
} else if (threat.farSideThreat) {
labels.push("Track far-side runner");
} else if (threat.isBoxThreat) {
labels.push("Mark box runner");
} else if (threat.isDepthThreat) {
labels.push("Cover depth runner");
} else if (threat.isBetweenLinesThreat) {
labels.push("Screen pocket runner");
}
if ((threat.isBlindsideRun || threat.isChannelRun) && index === 0) {
assignTrackingTarget(
threat,
"channelCover",
["back"],
["CB", "LB", "RB", "WB"],
"Cover depth behind channel run"
);
if (profile.phaseKey !== "highPress") {
assignTrackingTarget(
threat,
"weakSideTuck",
["back", "midfield"],
["CB", "LB", "RB", "WB", "6"],
"Weak side tucks against runner"
);
}
}
});
return {
labels: uniquePrincipleLabels(labels),
focusPoint: threats[0]?.player?.position ? cloneVector(threats[0].player.position) : null,
protectedIds: assignedIds,
};
}

  return {
    getDefensiveRunnerThreats,
    getDefensiveRunnerTrackingTarget,
    applyDefensiveRunnerTrackingTargets,
  };
}
