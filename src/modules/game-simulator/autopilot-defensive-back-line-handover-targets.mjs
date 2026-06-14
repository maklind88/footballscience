export function createGameSimulatorAutopilotDefensiveBackLineHandoverTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getDefendingDirectionSign,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveRunnerThreats,
    getDefensiveUnitGap,
    getDistanceFromOwnGoal,
    getOtherTeamId,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function getDefensiveBackLineHandoverContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type) {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
const actionType = actionMeta.actionType ?? state.ball.actionType;
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(attackingTeamId);
const principleText = [
actionMeta.offensiveAutopilot?.principleKey,
actionMeta.offensiveAutopilot?.principleLabel,
...(actionMeta.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const threats = getDefensiveRunnerThreats(teamId, ballPoint, profile);
const primaryThreat =
threats.find((threat) => threat.isBlindsideRun || threat.isChannelRun) ??
threats.find((threat) => threat.isDepthThreat || threat.isBoxThreat) ??
threats[0] ??
null;
const hasDepthCue =
principleText.includes("blindside") ||
principleText.includes("channel") ||
principleText.includes("run behind") ||
principleText.includes("line break") ||
principleText.includes("depth");
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const shouldCoordinate =
primaryThreat?.isBlindsideRun ||
primaryThreat?.isChannelRun ||
primaryThreat?.isDepthThreat ||
primaryThreat?.isBoxThreat ||
targetThreat.behindLine >= 0.22 ||
forwardGain >= 6.5 ||
(hasDepthCue && forwardGain >= 2.5);
if (!shouldCoordinate || actionType === "shot") {
return null;
}
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const phaseDrop =
profile.phaseKey === "boxDefending"
? 1.1
: profile.phaseKey === "lowBlock"
? 1.6
: profile.phaseKey === "highPress"
? 2.8
: 2.2;
const lineBreakDrop =
primaryThreat?.isBlindsideRun || targetThreat.behindLine >= 0.32
? 2.8
: primaryThreat?.isChannelRun || forwardGain >= 8
? 2.2
: 1.35;
const dropDepth = clamp(phaseDrop + lineBreakDrop + Math.max(0, forwardGain - 6) * 0.08, 1.4, 6.8);
const sideSign =
getWideSideSign(primaryThreat?.player) ||
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
return {
targetPoint,
primaryThreat,
sideSign,
dropDepth,
ballFromOwnGoal,
isChannelThreat: !!(primaryThreat?.isBlindsideRun || primaryThreat?.isChannelRun),
isDeepThreat: !!(primaryThreat?.isDepthThreat || targetThreat.behindLine >= 0.22 || forwardGain >= 6.5),
};
}
function applyDefensiveBackLineHandoverTargets(
teamId,
targets,
groups,
ballPoint,
profile,
protectedIds = new Set()
) {
const context = getDefensiveBackLineHandoverContext(teamId, ballPoint, profile);
if (!context) {
return [];
}
const labels = [];
const sign = getDefendingDirectionSign(teamId);
const ownGoal = getOwnGoalCenter(teamId);
const backPlayers = (groups.back ?? []).filter((player) => !isGoalkeeper(player));
const midfieldPlayers = (groups.midfield ?? []).filter((player) => !isGoalkeeper(player));
if (!backPlayers.length) {
return [];
}
const baseBackDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const backDepth = clamp(
baseBackDepth - context.dropDepth,
profile.minBackLineFromOwnGoal ?? 6,
profile.maxBackLineFromOwnGoal ?? 64
);
const gap = clamp(getDefensiveUnitGap(profile, "back"), 7.2, 9);
const lineWidth = gap * Math.max(0, backPlayers.length - 1);
const runnerY = context.primaryThreat?.player?.position?.y ?? context.targetPoint.y;
const centerY = clamp(
lerp(pitch.width / 2, lerp(context.targetPoint.y, runnerY, 0.62), context.isChannelThreat ? 0.38 : 0.24),
Math.max(4, lineWidth / 2 + 3),
pitch.width - Math.max(4, lineWidth / 2 + 3)
);
const orderedBacks = [...backPlayers].sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
orderedBacks.forEach((player, index) => {
if (protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const spreadRatio = orderedBacks.length === 1 ? 0.5 : index / (orderedBacks.length - 1);
const slotY = clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.5, pitch.width - 3.5);
const isBallSide = Math.sign(slotY - pitch.width / 2) === context.sideSign;
const channelNudge = context.isChannelThreat && isBallSide
? (runnerY - slotY) * 0.24
: (pitch.width / 2 - slotY) * 0.08;
const currentTarget = targets.get(player.id) ?? player.position;
const slot = clampToPitch({
x: ownGoal.x + sign * (backDepth + (isBallSide ? 0.35 : -0.45)),
y: clamp(slotY + channelNudge, 3.5, pitch.width - 3.5),
}, 2.2);
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, slot.x, 0.78),
y: lerp(currentTarget.y, slot.y, 0.74),
}, 2.2));
});
if (midfieldPlayers.length && context.isDeepThreat) {
const screenDepth = clamp(backDepth + (profile.backToMidfield ?? 10) * 0.72, backDepth + 5.5, backDepth + 12);
const midfieldGap = clamp(getDefensiveUnitGap(profile, "midfield"), 7.2, 9.5);
const screenWidth = midfieldGap * Math.max(0, midfieldPlayers.length - 1);
const screenCenterY = clamp(
lerp(pitch.width / 2, context.targetPoint.y, 0.26),
Math.max(5, screenWidth / 2 + 3),
pitch.width - Math.max(5, screenWidth / 2 + 3)
);
const orderedMidfield = [...midfieldPlayers].sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
orderedMidfield.forEach((player, index) => {
if (protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const spreadRatio = orderedMidfield.length === 1 ? 0.5 : index / (orderedMidfield.length - 1);
const currentTarget = targets.get(player.id) ?? player.position;
const slot = clampToPitch({
x: ownGoal.x + sign * screenDepth,
y: clamp(screenCenterY - screenWidth / 2 + screenWidth * spreadRatio, 4, pitch.width - 4),
}, 2.2);
targets.set(player.id, clampToPitch({
x: lerp(currentTarget.x, slot.x, 0.42),
y: lerp(currentTarget.y, slot.y, 0.38),
}, 2.2));
});
}
labels.push(context.isChannelThreat ? "Back line handover against channel run" : "Back line drops against depth threat");
if (context.isDeepThreat) {
labels.push("Midfield screens second ball behind line");
}
return uniquePrincipleLabels(labels);
}

  return {
    getDefensiveBackLineHandoverContext,
    applyDefensiveBackLineHandoverTargets,
  };
}
