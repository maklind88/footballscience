export function createGameSimulatorAutopilotOffballPasserContinuationTargets(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getDepthPoint,
    getLaneCenterY,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    getOffensiveRoleKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerTendency,
    getReceptionSupportTarget,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    setAutopilotPrincipleTarget,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getPasserContinuationTarget(teamId, passer, receiver, startPoint, ballPoint, profile = {}) {
const roleKey = getOffensiveRoleKey(passer, teams[teamId]?.formation);
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null;
const sign = getAttackDirectionSign(teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const sideSign =
getWideSideSign(ballPoint) ||
getWideSideSign(passer) ||
1;
const passForwardGain = (ballPoint.x - startPoint.x) * sign;
const passAndMove = getPlayerTendency(passer, "passAndMove");
const overlapTendency = getPlayerTendency(passer, "overlap");
const runTendency = Math.max(getAutoPilotRoleStrength(passer, "runner"), getPlayerTendency(passer, "boxRun"));
const sameSideReceiver = receiver && (getWideSideSign(receiver) || sideSign) === (getWideSideSign(passer) || sideSign);
const strongWideY = getLaneCenterY(sideSign < 0 ? "leftWide" : "rightWide", profile);
const strongHalfY = getLaneCenterY(sideSign < 0 ? "leftHalf" : "rightHalf", profile);
const oppositeHalfY = getLaneCenterY(sideSign < 0 ? "rightHalf" : "leftHalf", profile);
const supportY = clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.5), 9, pitch.width - 9);
if (
roleKey === "wideBack" &&
sameSideReceiver &&
(receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack") &&
(profile.overlapBias >= 0.54 || overlapTendency >= 0.58)
) {
return {
target: getDepthPoint(teamId, clamp(Math.max(targetDepth + 7, startDepth + 8), 46, 94), {
y: clamp(lerp(strongWideY, ballPoint.y + sideSign * 2.8, 0.26), 3.5, pitch.width - 3.5),
}),
label: "Pass-and-move: overlap after pass",
};
}
if (
roleKey === "wideForward" &&
passForwardGain >= -2 &&
(receiverRoleKey === "connector" || receiverRoleKey === "pivot" || receiverRoleKey === "wideBack") &&
(runTendency >= 0.54 || profile.directness >= 0.58)
) {
return {
target: getDepthPoint(teamId, clamp(Math.max(targetDepth + 8, startDepth + 9), 54, 96), {
y: clamp(lerp(ballPoint.y, strongHalfY, 0.62), 8, pitch.width - 8),
}),
label: "Pass-and-move: diagonal run",
};
}
if (
(roleKey === "connector" || roleKey === "secondStriker") &&
passAndMove >= 0.56 &&
passForwardGain >= -3 &&
targetDepth >= 36
) {
return {
target: getDepthPoint(teamId, clamp(targetDepth + 5 + runTendency * 5, 42, 88), {
y: clamp(lerp(ballPoint.y, sameSideReceiver ? oppositeHalfY : strongHalfY, 0.38), 9, pitch.width - 9),
}),
label: "Pass-and-move: third-player support",
};
}
if (
(roleKey === "striker" || roleKey === "secondStriker") &&
passForwardGain <= 3 &&
(profile.shortSupport >= 0.56 || passAndMove >= 0.56)
) {
return {
target: getDepthPoint(teamId, clamp(targetDepth + 7 + runTendency * 4, 50, 96), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 5.5, 0.38), 12, pitch.width - 12),
}),
label: "Pass-and-move: spin off",
};
}
if (roleKey === "pivot" || roleKey === "rest") {
return {
target: getDepthPoint(teamId, clamp(targetDepth - 12 - profile.supportCompactness * 4, 18, 64), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.66), 12, pitch.width - 12),
}),
label: "Pass-and-move: recycle angle",
};
}
return {
target: getDepthPoint(teamId, clamp(targetDepth - 7 - profile.shortSupport * 5, 18, 76), {
y: supportY,
}),
label: "Pass-and-move: re-support",
};
}
function applyPasserContinuationTargets(teamId, targets, ballPoint, actionMeta, profile) {
if (!ballPoint || actionMeta?.actionType !== "pass" || profile?.phaseKey === "setPiece") {
return {
labels: [],
protectedIds: new Set(),
};
}
const passer = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
if (!passer || passer.team !== teamId || isGoalkeeper(passer)) {
return {
labels: [],
protectedIds: new Set(),
};
}
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
getPlayerBallControlPoint(passer);
const context = getPasserContinuationTarget(teamId, passer, receiver, startPoint, ballPoint, profile);
const target = clampToPitch(context.target, 3);
targets.set(passer.id, target);
return {
labels: context.label ? [context.label] : [],
protectedIds: new Set([passer.id]),
};
}
function applyThirdManChainSupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType !== "pass") {
return {
labels: [],
protectedIds: new Set(),
};
}
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
const hubPlayer = receiver ?? plannedRunner ?? null;
const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const targetDepth = getAttackingDepth(hubPoint, teamId);
const targetThreat = getPitchThreatProfile(hubPoint, teamId);
const isThirdManCue =
principleText.includes("third-man") ||
principleText.includes("third player") ||
principleText.includes("third-player") ||
principleText.includes("receive continuation") ||
principleText.includes("receive flow") ||
principleText.includes("wall pass") ||
principleText.includes("around the corner");
const shouldActivate =
isThirdManCue ||
(
targetDepth >= 38 &&
(
targetThreat.betweenLines >= 0.26 ||
targetThreat.halfSpace >= 0.28 ||
targetThreat.centralPocket >= 0.22
)
);
if (!shouldActivate) {
return {
labels: [],
protectedIds: new Set(),
};
}
const sideSign =
getWideSideSign(hubPoint) ||
getWideSideSign(hubPlayer) ||
getWideSideSign(startPoint) ||
1;
const assignedIds = new Set([
...protectedIds,
hubPlayer?.id,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const labels = [];
const protectedChainIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, hubPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, hubPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getReceptionSupportTarget(teamId, hubPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
protectedChainIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
assign("under", ["pivot", "connector", "wideBack", "rest"], "Third-man chain: bounce support");
assign("inside", ["connector", "wideForward", "secondStriker", "pivot"], "Third-man chain: inside angle", isWidePrincipleZone(hubPoint) ? sideSign : 0);
assign("beyond", ["striker", "wideForward", "secondStriker"], "Third-man chain: next-line runner");
if (isWidePrincipleZone(hubPoint) || (profile.overlapBias ?? 0) >= 0.56) {
assign("outside", ["wideBack", "wideForward"], "Third-man chain: outside release", sideSign);
}
if ((profile.switchBias ?? 0) >= 0.56 || targetThreat.centralPocket >= 0.28) {
assign("weakSide", ["wideForward", "wideBack"], "Third-man chain: weak-side outlet", -sideSign);
}
assign("restLink", ["pivot", "rest"], "Third-man chain: rest link");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedChainIds,
};
}

  return {
    getPasserContinuationTarget,
    applyPasserContinuationTargets,
    applyThirdManChainSupportTargets,
  };
}
