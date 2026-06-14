export function createGameSimulatorAutopilotOffballSecondBallTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getMovableAutopilotPlayerByRoles,
    getOpponentPenaltySpot,
    getPlayerById,
    getPlayerPressureLoad,
    getWideSideSign,
    isAerialFlightStyle,
    lerp,
    pitch,
    resolveBallActionProfile,
    setAutopilotPrincipleTarget,
    state,
    uniquePrincipleLabels,
  } = deps;

function getSecondBallAnticipationContext(teamId, ballPoint, actionMeta, profile = {}) {
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType !== "pass" || state.restartPhase?.type || profile?.phaseKey === "setPiece") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position;
const targetPoint = actionMeta?.target ?? ballPoint ?? state.ball.target;
if (!startPoint || !targetPoint) {
return null;
}
const initiator = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const passDistance = distance(startPoint, targetPoint);
if (passDistance < 16) {
return null;
}
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const resolvedProfile = resolveBallActionProfile(
actionType,
startPoint,
targetPoint,
initiator,
actionMeta?.receiverPlayerId ?? null
);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const profileText = [
resolvedProfile.key,
resolvedProfile.label,
actionMeta?.profileKey,
actionMeta?.profileLabel,
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const aerial = isAerialFlightStyle(resolvedProfile.flightStyle);
const delivery =
profileText.includes("cross") ||
profileText.includes("delivery") ||
profileText.includes("switch") ||
profileText.includes("onto-9") ||
profileText.includes("second-ball") ||
profileText.includes("route-one");
const finalThirdLanding =
targetThreat.box >= 0.16 ||
targetThreat.assistZone >= 0.34 ||
targetThreat.cutbackZone >= 0.22 ||
getAttackingDepth(targetPoint, teamId) >= 66;
const lineBreakLanding =
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.22 ||
(forwardGain >= 9 && passDistance >= 18);
const shouldAnticipate =
(passDistance >= 22 && (aerial || delivery || lineBreakLanding)) ||
(passDistance >= 18 && finalThirdLanding) ||
(receiver && passDistance >= 20 && getPlayerPressureLoad(receiver, targetPoint) >= 0.5);
if (!shouldAnticipate) {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
getWideSideSign(receiver) ||
1;
return {
actionType,
startPoint: cloneVector(startPoint),
targetPoint: clampToPitch(targetPoint, 2.2),
initiator,
receiver,
passDistance,
forwardGain,
resolvedProfile,
actionSpace,
targetThreat,
aerial,
delivery,
finalThirdLanding,
lineBreakLanding,
sideSign,
};
}
function getOffensiveSecondBallAnticipationTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const target = context.targetPoint;
const sideSign = context.sideSign || 1;
const penaltySpot = getOpponentPenaltySpot(teamId);
const points = {
contestSupport: {
x: target.x - sign * (context.finalThirdLanding ? 1.8 : 2.8),
y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.12 : 0.22),
},
dropZone: {
x: target.x - sign * (context.aerial ? 7.2 : 5.2),
y: lerp(target.y, pitch.width / 2, context.finalThirdLanding ? 0.42 : 0.54),
},
farCollect: {
x: target.x - sign * 4.4,
y: clamp(target.y - sideSign * (context.finalThirdLanding ? 9.8 : 12.4), 5, pitch.width - 5),
},
edgeLock: {
x: context.finalThirdLanding ? penaltySpot.x - sign * 9.2 : target.x - sign * 12.2,
y: clamp(lerp(target.y, pitch.width / 2 - sideSign * 4.8, 0.52), 11, pitch.width - 11),
},
restLock: {
x: target.x - sign * (context.lineBreakLanding ? 22 : 18),
y: clamp(lerp(target.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
},
};
return clampToPitch(points[slot] ?? points.dropZone, 2.2);
}
function applyOffensiveSecondBallAnticipationTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getSecondBallAnticipationContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
context.initiator?.id,
context.receiver?.id,
].filter(Boolean));
const protectedSecondBallIds = new Set();
const assign = (slot, roleKeys, label) => {
const target = getOffensiveSecondBallAnticipationTarget(teamId, context, slot);
const player = getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedSecondBallIds.add(player.id);
labels.push(label);
return player;
};
assign("contestSupport", ["striker", "wideForward", "secondStriker", "connector"], "Second ball: contest support");
assign("dropZone", ["connector", "pivot", "wideBack"], "Second ball: drop-zone collector");
if (context.finalThirdLanding || context.delivery) {
assign("farCollect", ["wideForward", "secondStriker", "wideBack"], "Second ball: far-side collector");
assign("edgeLock", ["connector", "pivot", "wideForward"], "Second ball: edge lock");
}
assign("restLock", ["pivot", "rest", "wideBack"], "Second ball: rest-defence lock");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSecondBallIds,
};
}

  return {
    getSecondBallAnticipationContext,
    getOffensiveSecondBallAnticipationTarget,
    applyOffensiveSecondBallAnticipationTargets,
  };
}
