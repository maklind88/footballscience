export function createGameSimulatorAutopilotOffballTargets(deps = {}) {
  const {
    addPointNoise,
    clamp,
    clampToPitch,
    cloneVector,
    computeTimeToCoverDistance,
    distance,
    gameRoleProfiles,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAutoPilotPossessionPlan,
    getAutoPilotPossessionRouteStage,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getDefensiveAutopilotLineKey,
    getDepthX,
    getFormationPositions,
    getLaneCenterY,
    getNearestOpponentGapInCarryLane,
    getNearestOpponentGapToPoint,
    getOffensiveAutopilotProfile,
    getOffensivePhaseKey,
    getOffensiveRoleKey,
    getOpponentBlockReadProfile,
    getOpponentGoalCenter,
    getOpponentLineDepthsForAttackingTeam,
    getOpponentPenaltySpot,
    getOpponentPressureAtPoint,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchSpaceProfile,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getRecordedStepDuration,
    getRecordedStepPattern,
    getRecordedStepPossessionTeamId,
    getSecondLastOpponentLineX,
    getSecurePossessionSnapshotForTeam,
    getShotWindowProfile,
    getSideLaneKeys,
    getState,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    getWideSideSign,
    isAerialFlightStyle,
    isFrontLineRole,
    isGoalkeeper,
    isTransitionAttackStyle,
    isWideChannel,
    isWidePrincipleZone,
    lerp,
    pitch,
    resolveBallActionProfile,
    teamRosterOrder,
    teams,
    uniquePrincipleLabels,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

function getSameSideWideBacks(teamId, sideSign, excludedPlayerIds = new Set()) {
const formation = teams[teamId]?.formation;
return state.players.filter((player) => {
if (player.team !== teamId || excludedPlayerIds.has(player.id)) {
return false;
}
if (getOffensiveRoleKey(player, formation) !== "wideBack") {
return false;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === sideSign;
});
}
function chooseWideOverlapRunner(teamId, sideSign, anchorPoint, profile, excludedPlayerIds = new Set()) {
if (!sideSign || !anchorPoint) {
return null;
}
const principleFit = getWideOverlapPrincipleFit(profile);
if (principleFit < 0.5) {
return null;
}
const anchorDepth = getAttackingDepth(anchorPoint, teamId);
const target = getWideOverlapRunTarget(teamId, anchorPoint, sideSign, profile);
let best = null;
let bestScore = -Infinity;
getSameSideWideBacks(teamId, sideSign, excludedPlayerIds).forEach((player) => {
const playerDepth = getAttackingDepth(player.position, teamId);
const distanceToTarget = distance(player.position, target);
const distanceToAnchor = distance(player.position, anchorPoint);
const timingScore = playerDepth <= anchorDepth + 2.5
? 0.55
: playerDepth <= anchorDepth + 9
? 0.18
: -0.34;
const overlapTendency = getPlayerTendency(player, "overlap");
const athleticScore = clamp((player.maxSpeed - 6.6) / 2.1, 0, 1) * 0.42 +
clamp((player.acceleration - 2.2) / 1.1, 0, 1) * 0.22;
const roleStrength =
getAutoPilotRoleStrength(player, "runner") * 0.5 +
getAutoPilotRoleStrength(player, "crosser") * 0.34;
const score =
principleFit * 1.2 +
overlapTendency * 0.82 +
athleticScore +
roleStrength +
timingScore -
distanceToTarget * 0.035 -
Math.max(0, distanceToAnchor - 28) * 0.035;
if (score > bestScore) {
bestScore = score;
best = {
player,
target,
score,
principleFit,
};
}
});
return best && best.score >= 0.72 ? best : null;
}
function getWideEntryPrincipleContext(carrier, receiver, startPoint, target, profile) {
if (!carrier || !receiver || carrier.team !== receiver.team) {
return null;
}
const receiverRoleKey = getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
if (receiverRoleKey !== "wideForward" || !isWidePrincipleZone(target)) {
return null;
}
const teamId = carrier.team;
const targetDepth = getAttackingDepth(target, teamId);
const ballDepth = getAttackingDepth(startPoint, teamId);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(teamId);
if (targetDepth < 38 || forwardGain < -3 || targetDepth < ballDepth - 2) {
return null;
}
const sideSign = getWideSideSign(target) || getWideSideSign(receiver);
const overlap = chooseWideOverlapRunner(
teamId,
sideSign,
target,
profile,
new Set([carrier.id, receiver.id])
);
if (!overlap) {
return null;
}
return {
key: "wide-overlap-entry",
label: "Wide entry",
runner: overlap.player,
runnerTarget: overlap.target,
sideSign,
scoreBonus: 0.34 + overlap.principleFit * 0.58 + getPlayerTendency(overlap.player, "overlap") * 0.22,
};
}
function getOffensiveActionPrinciple(teamId, ballPoint, actionMeta, profile) {
if (actionMeta?.actionType !== "pass") {
return null;
}
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const carrier = getPlayerById(
actionMeta.carrierPlayerId ??
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const startPoint = actionMeta.beforeSnapshot?.ball?.position ?? carrier?.position ?? state.ball.position;
const principle = getWideEntryPrincipleContext(carrier, receiver, startPoint, ballPoint, profile);
if (!principle) {
return null;
}
return {
...principle,
label: `Wide overload: W receives, ${getPlayerMagnetLabel(principle.runner)} overlaps`,
};
}
function getPlayerRoleModel(player, formation = teams[player.team]?.formation) {
const roleKey = getOffensiveRoleKey(player, formation);
return gameRoleProfiles[roleKey] ?? gameRoleProfiles.connector;
}
function getOffensiveLaneY(baseY, ballPoint, profile, roleKey) {
const centerY = pitch.width / 2;
const side = Math.sign(baseY - centerY) || Math.sign(ballPoint.y - centerY) || 1;
const laneKeys = getSideLaneKeys(baseY);
const wideY = getLaneCenterY(laneKeys.wide, profile);
const halfSpaceY = getLaneCenterY(laneKeys.half, profile);
const narrowWideY = lerp(wideY, halfSpaceY, profile.wideForwardNarrowing ?? 0);
const centralHalfSpaceY = lerp(halfSpaceY, centerY, profile.centralOverload ?? 0);
const compactness = profile.supportCompactness ?? 0.12;
const widthDiscipline = profile.widthDiscipline ?? 0.62;
if (roleKey === "wideBack") {
const supportPull = compactness * (profile.overlapBias >= 0.7 ? 0.14 : 0.08);
return clamp(lerp(wideY, ballPoint.y, supportPull * (1 - widthDiscipline * 0.42)), 4, pitch.width - 4);
}
if (roleKey === "wideForward") {
const shouldHoldTouchline = profile.crossBias >= 0.72 || profile.switchBias >= 0.7;
const preferredLaneY = shouldHoldTouchline
? lerp(wideY, narrowWideY, 0.24)
: narrowWideY;
return clamp(lerp(preferredLaneY, ballPoint.y, compactness * 0.12), 5, pitch.width - 5);
}
if (roleKey === "connector") {
return clamp(lerp(centralHalfSpaceY, ballPoint.y, compactness * 0.38), 8, pitch.width - 8);
}
if (roleKey === "pivot") {
return clamp(lerp(centerY, ballPoint.y, 0.12 + (1 - (profile.centralOverload ?? 0.4)) * 0.08), 12, pitch.width - 12);
}
if (roleKey === "secondStriker") {
return clamp(lerp(centerY + side * 7.5, ballPoint.y, 0.14), 14, pitch.width - 14);
}
if (roleKey === "striker") {
return clamp(lerp(centerY, ballPoint.y, 0.12), 15, pitch.width - 15);
}
return clamp(lerp(centerY, ballPoint.y, compactness), 9, pitch.width - 9);
}
function shouldSkipOffensiveAutopilotPlayer(player, actionMeta) {
return (
player.id === actionMeta?.carrierPlayerId ||
player.id === actionMeta?.receiverPlayerId ||
player.id === actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ||
player.id === state.ball.carrierPlayerId ||
player.id === state.ball.receiverPlayerId ||
player.id === state.ball.initiatorPlayerId
);
}
function getOffensiveAutopilotTarget(player, ballPoint, actionMeta, profile, baseY, isPrimaryRunner = false) {
const roleKey = getOffensiveRoleKey(player, profile.formation);
const ballDepth = getAttackingDepth(ballPoint, player.team);
const attackSign = getAttackDirectionSign(player.team);
const side = Math.sign(baseY - pitch.width / 2) || 1;
const ballSide = Math.sign(ballPoint.y - pitch.width / 2) || side;
const isBallSide = side === ballSide || Math.abs(ballPoint.y - pitch.width / 2) < 5;
let depth = ballDepth;
let y = getOffensiveLaneY(baseY, ballPoint, profile, roleKey);
if (roleKey === "gk") {
depth = clamp(ballDepth - 55, 7, 15);
y = clamp(lerp(pitch.width / 2, ballPoint.y, 0.08), 28, 40);
} else if (roleKey === "rest") {
const restOffset = profile.restBehind + (isBallSide ? -2 : 1.5);
depth = clamp(ballDepth - restOffset, 16, 56);
y = clamp(lerp(getOffensiveLaneY(baseY, ballPoint, profile, "connector"), pitch.width / 2, 0.46), 13, 55);
} else if (roleKey === "wideBack") {
const supportBoost = isBallSide
? profile.wideDepthBoost * 0.5 * (profile.wideBackAdvance ?? 1)
: -profile.restBehind * 0.22;
const overlapPush = (profile.overlapBias - 0.5) * 4.2;
const runnerBoost = isPrimaryRunner ? profile.runnerBoost * 0.72 * (profile.wideBackAdvance ?? 1) : 0;
depth = clamp(ballDepth - 9 + supportBoost + runnerBoost, 20, 84);
depth = clamp(depth + overlapPush, 20, 88);
y = clamp(lerp(y, ballPoint.y, isBallSide ? 0.12 : 0.03), 4, pitch.width - 4);
} else if (roleKey === "pivot") {
depth = clamp(ballDepth - profile.pivotBehind - (profile.pivotDrop ?? 0), 20, 72);
} else if (roleKey === "connector") {
const ahead =
(isBallSide ? profile.connectorAhead * 0.6 : profile.connectorAhead * 1.05) +
(profile.connectorAdvance ?? 0);
depth = clamp(ballDepth + ahead, 28, 88);
} else if (roleKey === "wideForward") {
const diagonalRun = isBallSide
? profile.wideDepthBoost + (profile.dribbleBias - 0.5) * 2
: profile.frontAhead + 2 + (profile.directness - 0.5) * 3;
depth = clamp(ballDepth + diagonalRun + (isPrimaryRunner ? profile.runnerBoost : 0), 36, 98);
y = isBallSide
? y
: clamp(lerp(y, pitch.width / 2 + side * 11, 0.54), 8, pitch.width - 8);
} else if (roleKey === "striker") {
depth = clamp(ballDepth + profile.frontAhead + profile.finalThirdPin + (isPrimaryRunner ? profile.runnerBoost : 0), 38, 99);
const pairedLaneOffset = (profile.strikerPairSupport ?? 0) * side * 6;
y = clamp(
lerp(y, pitch.width / 2 + pairedLaneOffset - ballSide * 2.5, isPrimaryRunner ? 0.35 : 0.16),
14,
pitch.width - 14
);
} else if (roleKey === "secondStriker") {
depth = clamp(
ballDepth + profile.frontAhead * 0.74 + profile.finalThirdPin + (isPrimaryRunner ? profile.runnerBoost * 0.7 : 0),
36,
96
);
y = clamp(lerp(y, pitch.width / 2 + side * 4.5, 0.34), 14, pitch.width - 14);
}
if (
actionMeta?.actionType === "shot" &&
(roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward" || roleKey === "connector")
) {
depth = clamp(Math.max(depth, getAttackingDepth(ballPoint, player.team) + 4), 50, 99);
y = clamp(lerp(y, pitch.width / 2 + side * 8, 0.4), 10, pitch.width - 10);
}
return clampToPitch({
x: getDepthX(player.team, depth) + attackSign * (roleKey === "wideForward" && isPrimaryRunner ? 1.5 : 0),
y,
}, 3);
}
function chooseOffensiveAutopilotRunner(teamId, targets, actionMeta, ballPoint, profile) {
const ballDepth = getAttackingDepth(ballPoint, teamId);
if (ballDepth < 38 && actionMeta?.actionType !== "pass") {
return null;
}
let bestCandidate = null;
let bestScore = -Infinity;
state.players
.filter((player) => player.team === teamId && !shouldSkipOffensiveAutopilotPlayer(player, actionMeta))
.forEach((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const roleBonus = profile.runnerPreferences?.[roleKey] ?? 0;
if (roleBonus <= 0) {
return;
}
const target = targets.get(player.id);
if (!target) {
return;
}
const targetDepth = getAttackingDepth(target, teamId);
const speedValue = player.maxSpeed + player.acceleration * 0.38;
const score =
targetDepth * 0.12 +
speedValue * 0.72 +
player.intelligenceProfile.perception * 1.8 +
Math.max(getPlayerTendency(player, "boxRun"), getPlayerTendency(player, "overlap")) * 1.2 +
profile.directness * 0.9 +
roleBonus -
distance(player.position, target) * 0.08;
if (score > bestScore) {
bestScore = score;
bestCandidate = player;
}
});
return bestCandidate;
}
function enforceOffensiveTargetSpacing(teamId, targets, ballPoint, profile, protectedIds = new Set()) {
const entries = state.players
.filter((player) => player.team === teamId && targets.has(player.id))
.map((player) => ({
player,
roleKey: getOffensiveRoleKey(player, profile.formation),
target: cloneVector(targets.get(player.id)),
protected: protectedIds.has(player.id),
}))
.sort((a, b) => a.target.y - b.target.y);
const minGap = profile.phaseKey === "finalThird" ? 4.6 : 6.1;
entries.forEach((entry) => {
if (entry.protected) {
return;
}
if (entry.roleKey === "wideBack" || entry.roleKey === "wideForward") {
const baseY = getFormationPositions(profile.formation, teamId)[
(teamRosterOrder[teamId] ?? []).indexOf(entry.player.id)
]?.y ?? entry.player.position.y;
const disciplinedY = getOffensiveLaneY(baseY, ballPoint, profile, entry.roleKey);
entry.target.y = lerp(entry.target.y, disciplinedY, profile.widthDiscipline ?? 0.62);
}
});
for (let pass = 0; pass < 2; pass += 1) {
for (let index = 1; index < entries.length; index += 1) {
const previous = entries[index - 1];
const current = entries[index];
const verticalGap = current.target.y - previous.target.y;
const depthGap = Math.abs(current.target.x - previous.target.x);
if (verticalGap >= minGap || depthGap > 18) {
continue;
}
const adjustment = (minGap - verticalGap) * 0.52;
if (previous.protected && current.protected) {
continue;
}
if (previous.protected) {
current.target.y = clamp(current.target.y + adjustment * 1.9, 4, pitch.width - 4);
continue;
}
if (current.protected) {
previous.target.y = clamp(previous.target.y - adjustment * 1.9, 4, pitch.width - 4);
continue;
}
previous.target.y = clamp(previous.target.y - adjustment, 4, pitch.width - 4);
current.target.y = clamp(current.target.y + adjustment, 4, pitch.width - 4);
}
}
entries.forEach((entry) => {
targets.set(entry.player.id, clampToPitch(entry.target, 3));
});
}
function getOffensiveOnsideLineContext(teamId, ballPoint) {
const lineX = getSecondLastOpponentLineX(teamId);
if (lineX === null || !ballPoint) {
return null;
}
const attackSign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const lineDepth = getAttackingDepth({ x: lineX, y: pitch.width / 2 }, teamId);
const active = Math.max(ballDepth, lineDepth) >= pitch.length / 2 - 0.4;
const legalBoundaryX = attackSign > 0
? Math.max(lineX, ballPoint.x)
: Math.min(lineX, ballPoint.x);
if (!active) {
return null;
}
return {
lineX,
legalBoundaryX,
attackSign,
ballDepth,
lineDepth,
};
}
function enforceOffensiveOnsideLineAwareness(
teamId,
targets,
ballPoint,
profile,
hardFixedIds = new Set()
) {
const context = getOffensiveOnsideLineContext(teamId, ballPoint);
if (!context) {
return [];
}
const labels = [];
let adjusted = false;
const shoulderMargin =
profile.phaseKey === "finalThird"
? 0.38
: profile.directness >= 0.68
? 0.46
: 0.62;
state.players
.filter((player) => player.team === teamId && targets.has(player.id) && !isGoalkeeper(player))
.forEach((player) => {
if (hardFixedIds.has(player.id)) {
return;
}
const roleKey = getOffensiveRoleKey(player, profile.formation);
const target = cloneVector(targets.get(player.id));
const currentDepth = getAttackingDepth(player.position, teamId);
const targetDepth = getAttackingDepth(target, teamId);
const lineRelevant =
isFrontLineRole(roleKey) ||
roleKey === "connector" ||
(roleKey === "wideBack" && targetDepth >= 58);
if (!lineRelevant || targetDepth <= pitch.length / 2 - 0.2) {
return;
}
const beyondLine = (target.x - context.legalBoundaryX) * context.attackSign;
if (beyondLine <= -0.05) {
return;
}
const holdLineX = context.legalBoundaryX - context.attackSign * shoulderMargin;
const laneCurve =
isFrontLineRole(roleKey)
? (Math.sign(target.y - pitch.width / 2) || getWideSideSign(target) || 1) * 0.85
: 0;
const urgencyWeight =
currentDepth > context.lineDepth + 0.4
? 0.84
: isFrontLineRole(roleKey)
? 0.68
: 0.52;
const nextTarget = clampToPitch({
x: lerp(target.x, holdLineX, urgencyWeight),
y: clamp(target.y + laneCurve, 3.2, pitch.width - 3.2),
}, 2.2);
if (distance(target, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
if (adjusted) {
labels.push("Onside line awareness");
}
return labels;
}
function enforceOffensiveOccupationZones(teamId, targets, ballPoint, profile) {
const roster = teamRosterOrder[teamId] ?? [];
const basePositions = getFormationPositions(profile.formation, teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const ballSide = getWideSideSign(ballPoint) || 1;
state.players
.filter((player) => player.team === teamId && targets.has(player.id))
.forEach((player) => {
const roleKey = getOffensiveRoleKey(player, profile.formation);
const target = cloneVector(targets.get(player.id));
const baseY = basePositions[roster.indexOf(player.id)]?.y ?? player.position.y;
const playerSide = getWideSideSign({ y: baseY }) || getWideSideSign(player);
const isWeakSide = playerSide && playerSide === -ballSide;
const isStrongSide = playerSide && playerSide === ballSide;
if (roleKey === "wideForward" || roleKey === "wideBack") {
const laneY = getOffensiveLaneY(baseY, ballPoint, profile, roleKey);
const widthPull = isWeakSide
? 0.9
: isStrongSide
? roleKey === "wideForward" ? 0.58 : 0.72
: 0.62;
target.y = lerp(target.y, laneY, clamp(widthPull * (profile.widthDiscipline ?? 0.64), 0.42, 0.92));
if (isWeakSide) {
target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth - 2), 34, 86));
}
if (isStrongSide && roleKey === "wideBack" && profile.overlapBias >= 0.62) {
target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth - 1), 34, 88));
}
}
if (roleKey === "pivot") {
target.x = getDepthX(teamId, clamp(ballDepth - 9 - profile.shortSupport * 4, 18, 70));
target.y = clamp(lerp(target.y, pitch.width / 2 - ballSide * 4.5, 0.48), 12, pitch.width - 12);
}
if (roleKey === "rest") {
target.x = getDepthX(teamId, clamp(ballDepth - profile.restBehind, 14, 56));
target.y = clamp(lerp(target.y, pitch.width / 2, 0.62), 13, pitch.width - 13);
}
if (roleKey === "striker" && ballDepth >= 54) {
target.x = getDepthX(teamId, clamp(Math.max(getAttackingDepth(target, teamId), ballDepth + 7), 56, 98));
target.y = clamp(lerp(target.y, pitch.width / 2, 0.42), 14, pitch.width - 14);
}
targets.set(player.id, clampToPitch(target, 3));
});
}
function getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const width = clamp(profile.width ?? 58, 42, 66);
const wideOffset = clamp(width * 0.48, 24, 31.5);
const halfOffset = clamp(width * 0.24, 11.5, 16.8);
const strongWideY = clamp(pitch.width / 2 + sideSign * wideOffset, 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * wideOffset, 3.5, pitch.width - 3.5);
const strongHalfY = clamp(pitch.width / 2 + sideSign * halfOffset, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * halfOffset, 8, pitch.width - 8);
const points = {
strongWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.widthDiscipline * 3, 34, 88), {
y: strongWideY,
}),
weakWidth: getDepthPoint(teamId, clamp(ballDepth + 1 + profile.switchBias * 6, 34, 86), {
y: weakWideY,
}),
strongHalf: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.shortSupport * 3, 36, 82), {
y: strongHalfY,
}),
weakHalf: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 4, 38, 84), {
y: weakHalfY,
}),
underSupport: getDepthPoint(teamId, clamp(ballDepth - 9 - profile.supportCompactness * 6, 18, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.42), 10, pitch.width - 10),
}),
depthPin: getDepthPoint(teamId, clamp(ballDepth + 12 + profile.directness * 4, 52, 98), {
y: clamp(lerp(pitch.width / 2, ballPoint.y, 0.16), 14, pitch.width - 14),
}),
farDepth: getDepthPoint(teamId, clamp(ballDepth + 11 + profile.runnerBoost * 0.45, 50, 96), {
y: clamp(weakHalfY, 9, pitch.width - 9),
}),
restCentral: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.74), 14, pitch.width - 14),
}, 3),
restFar: clampToPitch({
x: ballPoint.x - sign * (24 + (profile.restBehind ?? 22) * 0.16),
y: clamp(pitch.width / 2 - sideSign * 11.2, 10, pitch.width - 10),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function getStructureBalanceCandidates(teamId, targets, excludedIds, roleKeys, referencePoint, sideSign = 0) {
const roleSet = new Set(roleKeys);
const desiredSide = sideSign ? Math.sign(sideSign) : 0;
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
if (!roleSet.has(roleKey)) {
return false;
}
if (!desiredSide) {
return true;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === desiredSide;
})
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
const aTarget = targets.get(a.id) ?? a.position;
const bTarget = targets.get(b.id) ?? b.position;
return distance(aTarget, referencePoint) - distance(bTarget, referencePoint);
});
}
function enforceOffensiveStructureBalance(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (profile.phaseKey === "setPiece") {
return [];
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const ballDepth = getAttackingDepth(ballPoint, teamId);
const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.24 || targetSpace.cutbackZone >= 0.28;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign, profile);
const player = getStructureBalanceCandidates(teamId, targets, assignedIds, roleKeys, target, preferredSide)[0] ?? null;
if (!player) {
return null;
}
targets.set(player.id, target);
assignedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
assign("underSupport", ["pivot", "connector", "wideBack"], "Structure: under support");
assign("weakWidth", ["wideForward", "wideBack"], "Structure: weak-side width", -sideSign);
if (targetSpace.wideCorridor >= 0.34 || isWidePrincipleZone(ballPoint)) {
assign("strongHalf", ["connector", "wideForward", "secondStriker"], "Structure: half-space connection", sideSign);
if ((profile.overlapBias ?? 0) >= 0.54 || (profile.widthDiscipline ?? 0) >= 0.66) {
assign("strongWidth", ["wideBack", "wideForward"], "Structure: outside lane", sideSign);
}
} else {
assign("strongHalf", ["connector", "wideForward", "secondStriker"], "Structure: near half-space", sideSign);
if ((profile.switchBias ?? 0) >= 0.56) {
assign("weakHalf", ["connector", "wideForward"], "Structure: switch connection", -sideSign);
}
}
if (ballDepth >= 42) {
assign(isFinalThird ? "farDepth" : "depthPin", ["striker", "wideForward", "secondStriker"], "Structure: depth threat");
}
assign("restCentral", ["rest", "pivot"], "Structure: rest-defence");
if (ballDepth >= 48 || actionMeta?.actionType === "dribble") {
assign("restFar", ["rest", "pivot", "wideBack"], "Structure: far rest cover", -sideSign);
}
const crowdedEntries = state.players
.filter((player) => player.team === teamId && targets.has(player.id) && !assignedIds.has(player.id))
.map((player) => ({
player,
target: targets.get(player.id),
roleKey: getOffensiveRoleKey(player, profile.formation),
}))
.filter((entry) => distance(entry.target, ballPoint) <= (isFinalThird ? 7.2 : 8.8));
crowdedEntries.forEach((entry, index) => {
if (entry.roleKey === "wideForward" || entry.roleKey === "wideBack") {
const slot = getWideSideSign(entry.player) === -sideSign ? "weakWidth" : "strongWidth";
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, slot, sideSign, profile));
} else if (entry.roleKey === "pivot" || entry.roleKey === "rest") {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, index % 2 ? "restFar" : "restCentral", sideSign, profile));
} else if (entry.roleKey === "striker" || entry.roleKey === "secondStriker") {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, "depthPin", sideSign, profile));
} else {
targets.set(entry.player.id, getOffensiveStructureBalanceTarget(teamId, ballPoint, index % 2 ? "weakHalf" : "strongHalf", sideSign, profile));
}
});
if (crowdedEntries.length >= 2) {
labels.push("Structure: decongest ball area");
}
return uniquePrincipleLabels(labels);
}
function getFiveLaneOccupationSlotTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const strongWideLane = sideSign < 0 ? "leftWide" : "rightWide";
const strongHalfLane = sideSign < 0 ? "leftHalf" : "rightHalf";
const weakHalfLane = sideSign < 0 ? "rightHalf" : "leftHalf";
const weakWideLane = sideSign < 0 ? "rightWide" : "leftWide";
const points = {
strongWide: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.widthDiscipline * 4, 34, 88), {
y: getLaneCenterY(strongWideLane, profile),
}),
strongHalf: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.shortSupport * 4, 36, 84), {
y: getLaneCenterY(strongHalfLane, profile),
}),
central: getDepthPoint(teamId, clamp(ballDepth - 2.5 + profile.shortSupport * 3, 28, 78), {
y: getLaneCenterY("central", profile),
}),
weakHalf: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 4, 38, 86), {
y: getLaneCenterY(weakHalfLane, profile),
}),
weakWide: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.switchBias * 6, 36, 88), {
y: getLaneCenterY(weakWideLane, profile),
}),
restCentral: clampToPitch({
x: ballPoint.x - sign * (21 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.central;
}
function getFiveLaneOccupationCandidates(teamId, targets, protectedIds, roleKeys, target, preferredSide = 0) {
const roleSet = new Set(roleKeys);
const desiredSide = preferredSide ? Math.sign(preferredSide) : 0;
return state.players
.filter((player) => {
if (player.team !== teamId || protectedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
if (!roleSet.has(roleKey)) {
return false;
}
if (!desiredSide) {
return true;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === desiredSide;
})
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
const aTarget = targets.get(a.id) ?? a.position;
const bTarget = targets.get(b.id) ?? b.position;
const aSideFit = desiredSide && getWideSideSign(a) !== desiredSide ? 0.8 : 0;
const bSideFit = desiredSide && getWideSideSign(b) !== desiredSide ? 0.8 : 0;
return distance(aTarget, target) + aSideFit - (distance(bTarget, target) + bSideFit);
});
}
function enforceOffensiveFiveLaneOccupation(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (profile.phaseKey === "setPiece" || !ballPoint) {
return [];
}
const ballDepth = getAttackingDepth(ballPoint, teamId);
if (ballDepth < 30) {
return [];
}
const sideSign = getWideSideSign(ballPoint) || 1;
const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.22 || targetSpace.cutbackZone >= 0.28;
const shouldHoldFullWidth =
profile.widthDiscipline >= 0.56 ||
profile.switchBias >= 0.5 ||
profile.overlapBias >= 0.5 ||
targetSpace.wideCorridor >= 0.28 ||
isFinalThird;
const assignedIds = new Set([...protectedIds].filter(Boolean));
const slotDefinitions = [
{
slot: "strongWide",
lanes: sideSign < 0 ? ["leftWide"] : ["rightWide"],
roleKeys: ["wideBack", "wideForward"],
label: "Five-lane: strong-side width",
preferredSide: sideSign,
minDepth: 34,
active: shouldHoldFullWidth,
},
{
slot: "strongHalf",
lanes: sideSign < 0 ? ["leftHalf"] : ["rightHalf"],
roleKeys: ["connector", "wideForward", "secondStriker"],
label: "Five-lane: strong half-space",
preferredSide: sideSign,
minDepth: 34,
active: true,
},
{
slot: "central",
lanes: ["central"],
roleKeys: ["pivot", "connector", "secondStriker"],
label: "Five-lane: central link",
preferredSide: 0,
minDepth: 30,
active: true,
},
{
slot: "weakHalf",
lanes: sideSign < 0 ? ["rightHalf"] : ["leftHalf"],
roleKeys: ["connector", "wideForward", "secondStriker"],
label: "Five-lane: weak half-space",
preferredSide: -sideSign,
minDepth: 38,
active: profile.switchBias >= 0.42 || profile.shortSupport >= 0.58 || isFinalThird,
},
{
slot: "weakWide",
lanes: sideSign < 0 ? ["rightWide"] : ["leftWide"],
roleKeys: ["wideForward", "wideBack"],
label: "Five-lane: weak-side width",
preferredSide: -sideSign,
minDepth: 36,
active: shouldHoldFullWidth,
},
];
const labels = [];
const laneHasOccupation = (definition) =>
state.players.some((player) => {
if (player.team !== teamId || !targets.has(player.id)) {
return false;
}
const target = targets.get(player.id);
const laneKey = getPitchLaneKey(target);
const depth = getAttackingDepth(target, teamId);
return definition.lanes.includes(laneKey) && depth >= definition.minDepth && distance(target, ballPoint) >= 4.8;
});
slotDefinitions
.filter((definition) => definition.active)
.forEach((definition) => {
if (laneHasOccupation(definition)) {
return;
}
const target = getFiveLaneOccupationSlotTarget(teamId, ballPoint, definition.slot, sideSign, profile);
const player = getFiveLaneOccupationCandidates(
teamId,
targets,
assignedIds,
definition.roleKeys,
target,
definition.preferredSide
)[0] ?? null;
if (!player) {
return;
}
targets.set(player.id, target);
assignedIds.add(player.id);
labels.push(definition.label);
});
const crowdedNearBall = state.players
.filter((player) => player.team === teamId && targets.has(player.id) && !assignedIds.has(player.id))
.map((player) => ({
player,
target: targets.get(player.id),
roleKey: getOffensiveRoleKey(player, profile.formation),
}))
.filter((entry) => distance(entry.target, ballPoint) <= (isFinalThird ? 6.6 : 8.2));
crowdedNearBall.slice(0, 2).forEach((entry, index) => {
const slot = entry.roleKey === "wideForward" || entry.roleKey === "wideBack"
? index % 2 ? "weakWide" : "strongWide"
: entry.roleKey === "pivot" || entry.roleKey === "rest"
? "restCentral"
: index % 2 ? "weakHalf" : "strongHalf";
targets.set(entry.player.id, getFiveLaneOccupationSlotTarget(teamId, ballPoint, slot, sideSign, profile));
});
if (crowdedNearBall.length >= 2) {
labels.push("Five-lane: decongest around ball");
}
return uniquePrincipleLabels(labels);
}
function getAutopilotTargetVariationRadius(player, profile, mode = "attack") {
if (!player || isGoalkeeper(player)) {
return 0;
}
const roleKey = mode === "attack"
? getOffensiveRoleKey(player, profile.formation)
: getDefensiveAutopilotLineKey(player, teams[player.team]?.formation, profile.phaseKey);
const tempo = profile.tempo ?? profile.pressingIntensity ?? 0.5;
const risk = profile.risk ?? profile.tackleIntent ?? 0.48;
const phaseFactor =
profile.phaseKey === "finalThird"
? 0.85
: profile.phaseKey === "buildUp"
? 0.55
: profile.phaseKey === "highPress"
? 0.82
: 0.68;
const roleFactor =
roleKey === "wideForward" || roleKey === "wideBack" || roleKey === "forward"
? 1.16
: roleKey === "striker" || roleKey === "secondStriker" || roleKey === "connector"
? 0.96
: roleKey === "rest" || roleKey === "back"
? 0.55
: 0.72;
const modeBase = mode === "attack" ? 0.55 : 0.38;
return clamp(
modeBase + tempo * 0.34 + risk * 0.24 + phaseFactor * 0.26,
0.32,
1.35
) * roleFactor;
}
function applyAutopilotTargetVariation(teamId, targets, profile, mode = "attack", protectedIds = new Set()) {
if (profile.phaseKey === "setPiece") {
return;
}
state.players.forEach((player) => {
if (player.team !== teamId || protectedIds.has(player.id) || !targets.has(player.id)) {
return;
}
const radius = getAutopilotTargetVariationRadius(player, profile, mode);
if (radius <= 0.02) {
return;
}
targets.set(player.id, addPointNoise(targets.get(player.id), radius, 3));
});
}
function getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, excludedIds = new Set(), referencePoint = null) {
const roleSet = new Set(roleKeys);
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
})
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
if (!referencePoint) {
return getAutoPilotRoleStrength(b, "runner") - getAutoPilotRoleStrength(a, "runner");
}
return distance(a.position, referencePoint) - distance(b.position, referencePoint);
})[0] ?? null;
}
function getMovableAutopilotPlayerByRolesOnSide(
teamId,
roleKeys,
targets,
excludedIds = new Set(),
sideSign = 0,
referencePoint = null
) {
const roleSet = new Set(roleKeys);
const desiredSide = sideSign === 0 ? 0 : Math.sign(sideSign);
const candidates = state.players.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id)) {
return false;
}
if (!roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation))) {
return false;
}
if (!desiredSide) {
return true;
}
const playerSide = getWideSideSign(player);
return playerSide === 0 || playerSide === desiredSide;
});
if (!candidates.length) {
return getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, excludedIds, referencePoint);
}
return candidates
.sort((a, b) => {
const aRole = getOffensiveRoleKey(a, teams[teamId]?.formation);
const bRole = getOffensiveRoleKey(b, teams[teamId]?.formation);
const aRoleFit = roleKeys.indexOf(aRole);
const bRoleFit = roleKeys.indexOf(bRole);
if (aRoleFit !== bRoleFit) {
return aRoleFit - bRoleFit;
}
const aSideFit = getWideSideSign(a) === desiredSide ? 0 : 1;
const bSideFit = getWideSideSign(b) === desiredSide ? 0 : 1;
if (aSideFit !== bSideFit) {
return aSideFit - bSideFit;
}
if (!referencePoint) {
return getAutoPilotRoleStrength(b, "runner") - getAutoPilotRoleStrength(a, "runner");
}
return distance(a.position, referencePoint) - distance(b.position, referencePoint);
})[0] ?? null;
}
function setAutopilotPrincipleTarget(targets, player, target) {
if (!player || !targets.has(player.id)) {
return false;
}
targets.set(player.id, clampToPitch(target, 3));
return true;
}
function getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const supportDepth = clamp(depth - 8.5 - profile.supportCompactness * 8, 18, 78);
return getDepthPoint(teamId, supportDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 8.5, 0.42), 8, pitch.width - 8),
});
}
function getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile) {
const depth = getAttackingDepth(ballPoint, teamId);
const runnerDepth = clamp(depth + 9 + profile.runnerBoost * 0.72, 38, 96);
return getDepthPoint(teamId, runnerDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 11, 0.42), 8, pitch.width - 8),
});
}
function getBoxOccupationTarget(teamId, ballPoint, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const ballSide = Math.sign(ballPoint.y - pitch.width / 2) || 1;
const points = {
nearPost: {
x: penaltySpot.x + sign * 3.4,
y: pitch.width / 2 + ballSide * 8.8,
},
farPost: {
x: penaltySpot.x + sign * 4.2,
y: pitch.width / 2 - ballSide * 12.5,
},
penaltySpot: {
x: penaltySpot.x - sign * 0.8,
y: pitch.width / 2,
},
edge: {
x: penaltySpot.x - sign * 8.2,
y: pitch.width / 2 - ballSide * 2.8,
},
};
return clampToPitch(points[slot] ?? points.penaltySpot, 2);
}
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
function applyCornerDeliveryPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds = new Set()) {
const restart = actionMeta?.beforeSnapshot?.restartPhase;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isCornerAction =
restart?.type === "corner" ||
state.restartPhase?.type === "corner" ||
principleText.includes("corner");
if (!isCornerAction) {
return [];
}
const sideY = Number.isFinite(restart?.sideY)
? restart.sideY
: Number.isFinite(state.restartPhase?.sideY)
? state.restartPhase.sideY
: actionMeta?.beforeSnapshot?.ball?.position?.y ?? ballPoint.y;
const labels = [];
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
if (
plannedRunner?.team === teamId &&
!excludedIds.has(plannedRunner.id) &&
setAutopilotPrincipleTarget(targets, plannedRunner, clampToPitch(ballPoint, 2))
) {
excludedIds.add(plannedRunner.id);
labels.push("Primary corner runner");
}
const nearRunner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "secondStriker", "wideForward"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, nearRunner, getCornerDeliveryTarget(teamId, sideY, "nearPost"))) {
excludedIds.add(nearRunner.id);
labels.push("Near-post corner run");
}
const farRunner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "striker", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farRunner, getCornerDeliveryTarget(teamId, sideY, "farPost"))) {
excludedIds.add(farRunner.id);
labels.push("Far-post corner run");
}
const centralRunner = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "striker", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, centralRunner, getCornerDeliveryTarget(teamId, sideY, "penaltySpot"))) {
excludedIds.add(centralRunner.id);
labels.push("Penalty-spot attack");
}
const edgePlayer = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector", "wideBack"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, edgePlayer, getCornerDeliveryTarget(teamId, sideY, "edge"))) {
excludedIds.add(edgePlayer.id);
labels.push("Edge box lock");
}
return labels;
}
function getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const widthScale = profile.widthDiscipline ?? 0.64;
const points = {
splitNear: getDepthPoint(teamId, 18, {
y: clamp(pitch.width / 2 + sideSign * lerp(10.5, 15.5, widthScale), 7, pitch.width - 7),
}),
splitFar: getDepthPoint(teamId, 20, {
y: clamp(pitch.width / 2 - sideSign * lerp(10.5, 15.5, widthScale), 7, pitch.width - 7),
}),
wideOutlet: getDepthPoint(teamId, 31, {
y: clamp(pitch.width / 2 + sideSign * lerp(24, 30, widthScale), 4.5, pitch.width - 4.5),
}),
pivotDrop: getDepthPoint(teamId, clamp(27 + (profile.shortSupport ?? 0.55) * 5, 27, 34), {
y: clamp(lerp(pitch.width / 2, ballPoint.y, 0.12), 20, 48),
}),
secondBall: getDepthPoint(teamId, 48, {
y: clamp(pitch.width / 2 - sideSign * 7, 12, pitch.width - 12),
}),
};
return points[slot] ?? points.pivotDrop;
}
function applyGoalkeeperBuildOutPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds = new Set()) {
const goalkeeper = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
if (!goalkeeper || !isGoalkeeper(goalkeeper)) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || 1;
const directRelease = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
]
.filter(Boolean)
.join(" ")
.toLowerCase()
.includes("gk release");
const nearCenterBack = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["rest"],
targets,
excludedIds,
sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, nearCenterBack, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "splitNear", sideSign, profile))) {
excludedIds.add(nearCenterBack.id);
labels.push("Split centre-back");
}
const farCenterBack = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["rest"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farCenterBack, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "splitFar", sideSign, profile))) {
excludedIds.add(farCenterBack.id);
labels.push("Opposite centre-back support");
}
const wideOutlet = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideBack"],
targets,
excludedIds,
sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, wideOutlet, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, "wideOutlet", sideSign, profile))) {
excludedIds.add(wideOutlet.id);
labels.push("Wide build-out outlet");
}
const pivot = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, pivot, getGoalkeeperBuildOutSupportTarget(teamId, ballPoint, directRelease ? "secondBall" : "pivotDrop", sideSign, profile))) {
excludedIds.add(pivot.id);
labels.push(directRelease ? "Second-ball screen" : "6 drops to connect");
}
return labels;
}
function applyBoxOccupationPrincipleTargets(teamId, targets, ballPoint, excludedIds = new Set()) {
const labels = [];
const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker", "secondStriker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, striker, getBoxOccupationTarget(teamId, ballPoint, "nearPost"))) {
excludedIds.add(striker.id);
labels.push("Near-post run");
}
const farRunner = getMovableAutopilotPlayerByRoles(teamId, ["wideForward", "secondStriker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, farRunner, getBoxOccupationTarget(teamId, ballPoint, "farPost"))) {
excludedIds.add(farRunner.id);
labels.push("Far-post run");
}
const centralRunner = getMovableAutopilotPlayerByRoles(teamId, ["connector", "striker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, centralRunner, getBoxOccupationTarget(teamId, ballPoint, "penaltySpot"))) {
excludedIds.add(centralRunner.id);
labels.push("Penalty-spot occupation");
}
const edgePlayer = getMovableAutopilotPlayerByRoles(teamId, ["connector", "pivot"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, edgePlayer, getBoxOccupationTarget(teamId, ballPoint, "edge"))) {
labels.push("Edge support");
}
return labels;
}
function getTimedBoxArrivalContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType === "shot" || actionType === "recovery") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const principleText = [
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.autoReason,
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isWideSource = isWidePrincipleZone(startPoint);
const isRunwayAction =
principleText.includes("runway") ||
principleText.includes("open-grass") ||
principleText.includes("carry end product") ||
principleText.includes("runway end product");
const isCentralCarry =
actionType === "dribble" &&
Math.abs(ballPoint.y - pitch.width / 2) <= 18 &&
targetDepth >= 56;
const isEndProductAction =
principleText.includes("end product") ||
principleText.includes("final pass") ||
principleText.includes("chance") ||
principleText.includes("shooting window");
const runwayFinishCue =
isRunwayAction &&
(
targetDepth >= 58 ||
targetThreat.behindLine >= 0.18 ||
targetThreat.centralPocket >= 0.24 ||
targetThreat.value >= 0.42
);
const isFinalAction =
targetDepth >= 70 ||
targetThreat.box >= 0.2 ||
targetThreat.cutbackZone >= 0.24 ||
runwayFinishCue ||
isEndProductAction ||
isCentralCarry ||
principleText.includes("cutback") ||
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("final-third") ||
principleText.includes("end product") ||
(actionType === "dribble" && targetDepth >= 64) ||
(actionType === "pass" && isWideSource && targetDepth >= 62);
if (!isFinalAction) {
return null;
}
const initiator = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const receiverPlayerId = actionMeta?.receiverPlayerId ?? null;
const actionDistance = distance(startPoint, ballPoint);
const resolvedProfile = resolveBallActionProfile(
actionType,
startPoint,
ballPoint,
initiator,
receiverPlayerId
);
const actionSpeed = Math.max(
actionMeta?.speed ??
state.ball.speed ??
resolvedProfile.averageSpeed ??
(actionType === "dribble" ? 5.2 : 12),
0.1
);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(startPoint) ||
getWideSideSign(ballPoint) ||
1;
const deliveryKind =
principleText.includes("cutback") || targetThreat.cutbackZone >= 0.24
? "cutback"
: principleText.includes("cross") || principleText.includes("delivery") || (isWideSource && targetThreat.box >= 0.16)
? "cross"
: runwayFinishCue
? "runway"
: actionType === "dribble"
? isCentralCarry ? "centralCarry" : "carry"
: "finalPass";
return {
actionType,
startPoint,
targetPoint: ballPoint,
targetThreat,
targetDepth,
startDepth,
eta,
arrivalWindow: eta + 0.65 + (profile.tempo ?? 0.5) * 0.26,
sideSign,
deliveryKind,
isWideSource,
isRunwayAction,
runwayFinishCue,
isCentralCarry,
isEndProductAction,
};
}
function getTimedBoxArrivalTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const sideSign = context.sideSign || 1;
const bylinePull = context.deliveryKind === "cutback" ? -1.8 : 0;
const centralCarryPull = context.deliveryKind === "centralCarry" || context.deliveryKind === "runway" ? 1 : 0;
const points = {
nearPost: {
x: penaltySpot.x + sign * (4.4 + (context.deliveryKind === "cross" ? 0.9 : centralCarryPull ? 0.35 : 0.2)),
y: pitch.width / 2 + sideSign * (centralCarryPull ? 4.6 : 5.6),
},
farPost: {
x: penaltySpot.x + sign * (4.2 + (context.deliveryKind === "cross" ? 0.7 : centralCarryPull ? 0.45 : 0.1)),
y: pitch.width / 2 - sideSign * (context.deliveryKind === "cross" ? 10.4 : 9.2),
},
centralGold: {
x: penaltySpot.x + sign * (context.deliveryKind === "runway" ? 1.6 : 0.9),
y: pitch.width / 2 + sideSign * (context.deliveryKind === "cross" ? 1.6 : 0.4),
},
penaltySpot: {
x: penaltySpot.x - sign * (0.8 + bylinePull),
y: pitch.width / 2 - sideSign * 0.7,
},
cutbackEdge: {
x: penaltySpot.x - sign * (7.2 + (context.deliveryKind === "cutback" ? 1.6 : centralCarryPull ? 0.9 : 0.4)),
y: pitch.width / 2 - sideSign * (centralCarryPull ? 5.8 : 4.8),
},
lateEdge: {
x: penaltySpot.x - sign * 10.6,
y: pitch.width / 2 + sideSign * 5.2,
},
reverseSquare: {
x: penaltySpot.x - sign * 5.8,
y: pitch.width / 2 + sideSign * 9.2,
},
restLock: clampToPitch({
x: context.targetPoint.x - sign * 20.5,
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return clampToPitch(points[slot] ?? points.penaltySpot, 2);
}
function chooseTimedBoxArrivalPlayer(teamId, targets, excludedIds, roleKeys, target, context) {
const roleSet = new Set(roleKeys);
const arrivalWindow = Math.max(context.arrivalWindow, 0.75);
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
return false;
}
return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
})
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const runDistance = distance(player.position, target);
const timeToTarget = computeTimeToCoverDistance(player, runDistance, target);
const timingFit = clamp(1 - Math.abs(timeToTarget - arrivalWindow) / 1.55, 0, 1);
const canArrive = timeToTarget <= arrivalWindow + 1.05;
const roleIndex = roleKeys.indexOf(roleKey);
const roleFit = roleIndex >= 0 ? 1 - roleIndex * 0.08 : 0.4;
const score =
roleFit * 0.34 +
timingFit * 0.42 +
getAutoPilotRoleStrength(player, "runner") * 0.22 +
getAutoPilotRoleStrength(player, "finisher") * 0.2 +
getPlayerTendency(player, "boxRun") * 0.14 -
Math.max(timeToTarget - arrivalWindow, 0) * 0.16 -
runDistance * 0.006 +
(canArrive ? 0.22 : -0.24);
return {
player,
score,
canArrive,
timeToTarget,
};
})
.filter((entry) => entry.canArrive || entry.score >= 0.42)
.sort((a, b) => b.score - a.score)[0]?.player ?? null;
}
function applyTimedFinalThirdBoxArrivals(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getTimedBoxArrivalContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const protectedArrivalIds = new Set();
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
if (plannedRunner?.team === teamId) {
assignedIds.add(plannedRunner.id);
}
const assign = (slot, roleKeys, label) => {
const target = getTimedBoxArrivalTarget(teamId, context, slot);
const player = chooseTimedBoxArrivalPlayer(teamId, targets, assignedIds, roleKeys, target, context);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedArrivalIds.add(player.id);
labels.push(label);
return player;
};
if (context.deliveryKind === "cross") {
assign("nearPost", ["striker", "secondStriker", "wideForward"], "Timed box: near-post attack");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post attack");
assign("penaltySpot", ["connector", "striker", "secondStriker"], "Timed box: penalty spot");
assign("lateEdge", ["connector", "pivot", "wideForward"], "Timed box: edge lock");
} else if (context.deliveryKind === "cutback") {
assign("penaltySpot", ["connector", "striker", "secondStriker"], "Timed box: cutback target");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post hold");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Timed box: cutback edge");
assign("nearPost", ["striker", "secondStriker", "wideForward"], "Timed box: front run");
} else if (context.deliveryKind === "runway" || context.deliveryKind === "centralCarry") {
assign("centralGold", ["striker", "secondStriker", "wideForward"], "Finish lane: central goal run");
assign("nearPost", ["striker", "wideForward", "secondStriker"], "Finish lane: near-post pin");
assign("farPost", ["wideForward", "secondStriker", "striker"], "Finish lane: far-post hold");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Finish lane: cutback edge");
assign("reverseSquare", ["connector", "wideForward", "secondStriker"], "Finish lane: reverse pass option");
} else {
assign("penaltySpot", ["striker", "secondStriker", "wideForward"], "Timed box: central arrival");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Timed box: far-post arrival");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Timed box: second wave");
}
const restLock = chooseTimedBoxArrivalPlayer(
teamId,
targets,
assignedIds,
["pivot", "rest", "wideBack"],
getTimedBoxArrivalTarget(teamId, context, "restLock"),
{
...context,
arrivalWindow: context.arrivalWindow + 0.8,
}
);
if (setAutopilotPrincipleTarget(targets, restLock, getTimedBoxArrivalTarget(teamId, context, "restLock"))) {
protectedArrivalIds.add(restLock.id);
labels.push("Timed box: rest-defence lock");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedArrivalIds,
};
}
function getAttackingBoxOccupationChainContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType === "shot" || actionType === "recovery") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta?.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const sourcePoint = actionType === "dribble" ? targetPoint : startPoint;
const sourceThreat = getPitchThreatProfile(sourcePoint, teamId);
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const sourceDepth = getAttackingDepth(sourcePoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const forwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionDistance = distance(startPoint, targetPoint);
const sideSign =
getWideSideSign(sourcePoint) ||
getWideSideSign(targetPoint) ||
1;
const principleText = [
actionMeta?.profileKey,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.autoReason,
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const sourceIsWide =
isWidePrincipleZone(sourcePoint) ||
sourceThreat.assistZone >= 0.24 ||
Math.abs(sourcePoint.y - pitch.width / 2) >= 17;
const finalThirdCue =
sourceDepth >= 66 ||
targetDepth >= 68 ||
targetThreat.box >= 0.12 ||
targetThreat.cutbackZone >= 0.14 ||
targetThreat.assistZone >= 0.28 ||
actionSpace.targetThreat.behindLine >= 0.18;
const deliveryCue =
principleText.includes("cross") ||
principleText.includes("delivery") ||
principleText.includes("cutback") ||
principleText.includes("box") ||
principleText.includes("final-third") ||
principleText.includes("end product") ||
principleText.includes("wide") ||
(actionType === "pass" && (targetThreat.box >= 0.12 || targetThreat.cutbackZone >= 0.16)) ||
(actionType === "dribble" && sourceIsWide && sourceDepth >= 66);
const active =
finalThirdCue &&
(
deliveryCue ||
sourceIsWide ||
profile.crossBias >= 0.56 ||
profile.overlapBias >= 0.58 ||
(forwardGain >= 6 && targetThreat.behindLine >= 0.2)
);
if (!active) {
return null;
}
const deliveryKind =
principleText.includes("cutback") || targetThreat.cutbackZone >= 0.2 || (sourceIsWide && forwardGain <= 1.5 && targetDepth >= 72)
? "cutback"
: principleText.includes("cross") || principleText.includes("delivery") || sourceIsWide
? "cross"
: "finalPass";
return {
actionType,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
sourcePoint: cloneVector(sourcePoint),
sourceThreat,
targetThreat,
sourceDepth,
targetDepth,
actionSpace,
forwardGain,
actionDistance,
sideSign,
sourceIsWide,
deliveryKind,
};
}
function getAttackingBoxOccupationChainTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const penaltySpot = getOpponentPenaltySpot(teamId);
const sideSign = context.sideSign || 1;
const target = context.targetPoint;
const cutbackBias = context.deliveryKind === "cutback" ? 1 : 0;
const crossBias = context.deliveryKind === "cross" ? 1 : 0;
const points = {
nearPostPin: {
x: penaltySpot.x + sign * (4.8 + crossBias * 0.5),
y: clamp(pitch.width / 2 + sideSign * (5.4 + crossBias * 1.2), 8, pitch.width - 8),
},
penaltySpotArrive: {
x: penaltySpot.x - sign * (0.4 + cutbackBias * 1.2),
y: clamp(pitch.width / 2 - sideSign * 0.5, 10, pitch.width - 10),
},
farPostHold: {
x: penaltySpot.x + sign * (4.1 + crossBias * 0.4),
y: clamp(pitch.width / 2 - sideSign * (10.4 + crossBias * 1), 7, pitch.width - 7),
},
cutbackEdge: {
x: penaltySpot.x - sign * (7.4 + cutbackBias * 1.7),
y: clamp(pitch.width / 2 - sideSign * 5.2, 12, pitch.width - 12),
},
secondWave: {
x: penaltySpot.x - sign * 11.2,
y: clamp(pitch.width / 2 + sideSign * 4.6, 12, pitch.width - 12),
},
weakSideWidth: getDepthPoint(teamId, clamp(Math.max(context.targetDepth, 76), 70, 92), {
y: clamp(pitch.width / 2 - sideSign * 26, 3.8, pitch.width - 3.8),
}),
recycleSupport: clampToPitch({
x: target.x - sign * 11.5,
y: clamp(lerp(target.y, pitch.width / 2 + sideSign * 8.5, 0.52), 9, pitch.width - 9),
}, 3),
restLock: clampToPitch({
x: target.x - sign * (21 + (context.sourceIsWide ? 2.2 : 0)),
y: clamp(lerp(target.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return clampToPitch(points[slot] ?? points.penaltySpotArrive, 2);
}
function applyAttackingBoxOccupationChainTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
const context = getAttackingBoxOccupationChainContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const protectedBoxIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getAttackingBoxOccupationChainTarget(teamId, context, slot);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedBoxIds.add(player.id);
labels.push(label);
return player;
};
assign("nearPostPin", ["striker", "secondStriker", "wideForward"], "Box chain: near-post pin");
if (context.deliveryKind === "cutback") {
assign("penaltySpotArrive", ["connector", "striker", "secondStriker"], "Box chain: cutback target");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Box chain: cutback edge");
assign("farPostHold", ["wideForward", "striker", "secondStriker"], "Box chain: far-post hold", -context.sideSign);
} else {
assign("penaltySpotArrive", ["striker", "secondStriker", "connector"], "Box chain: penalty-spot arrival");
assign("farPostHold", ["wideForward", "striker", "secondStriker"], "Box chain: far-post hold", -context.sideSign);
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Box chain: cutback edge");
}
if (context.sourceIsWide || profile.switchBias >= 0.56) {
assign("weakSideWidth", ["wideForward", "wideBack"], "Box chain: weak-side width", -context.sideSign);
}
assign("secondWave", ["connector", "pivot", "wideForward"], "Box chain: second wave");
assign("recycleSupport", ["wideBack", "connector", "pivot"], "Box chain: recycle support", context.sideSign);
assign("restLock", ["pivot", "rest", "wideBack"], "Box chain: rest-defence lock");
if (labels.length) {
labels.unshift(
context.deliveryKind === "cutback"
? "Prepare cutback occupation"
: context.deliveryKind === "cross"
? "Prepare box occupation"
: "Prepare final-pass occupation"
);
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedBoxIds,
};
}
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
function applyBetweenLinesPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
if (!principleText.includes("between-lines") && !principleText.includes("ficka")) {
return [];
}
const labels = [];
const sideSign = getWideSideSign(ballPoint) || 1;
const depthRunner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "wideForward", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, depthRunner, getHighValueAttackTarget(teamId, ballPoint, "goldenRun", sideSign))) {
excludedIds.add(depthRunner.id);
labels.push("Depth threat beyond pocket");
}
const bounceSupport = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, bounceSupport, getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile))) {
excludedIds.add(bounceSupport.id);
labels.push("Bounce support under pocket");
}
const weakSide = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideForward", "wideBack"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, weakSide, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", sideSign, profile))) {
excludedIds.add(weakSide.id);
labels.push("Weak-side width");
}
const restLock = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "rest"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, restLock, getFormationIdentityTarget(teamId, ballPoint, "restLock", sideSign, profile))) {
excludedIds.add(restLock.id);
labels.push("Rest-defence lock");
}
return labels;
}
function getReceptionSupportTarget(teamId, hubPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(hubPoint, teamId);
const compactness = profile.supportCompactness ?? 0.58;
const width = profile.widthDiscipline ?? 0.64;
const directness = profile.directness ?? 0.52;
const wideY = pitch.width / 2 + sideSign * lerp(22, 29, width);
const halfSpaceY = pitch.width / 2 + sideSign * 12.5;
const insideY = lerp(hubPoint.y, halfSpaceY, isWideChannel(hubPoint) ? 0.72 : 0.38);
const outsideY = clamp(hubPoint.y + sideSign * lerp(5.5, 8.5, width), 3.5, pitch.width - 3.5);
const points = {
under: getDepthPoint(teamId, clamp(depth - lerp(8, 13.5, compactness), 18, 78), {
y: clamp(lerp(hubPoint.y, pitch.width / 2 + sideSign * 5.5, 0.5), 8, pitch.width - 8),
}),
inside: getDepthPoint(teamId, clamp(depth - 1.5 + directness * 2.5, 32, 86), {
y: clamp(insideY, 8, pitch.width - 8),
}),
outside: getDepthPoint(teamId, clamp(depth + lerp(1.5, 6.5, width), 34, 93), {
y: outsideY,
}),
beyond: getDepthPoint(teamId, clamp(depth + lerp(7.5, 15, directness), 48, 97), {
y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 5.5, 0.42), 11, pitch.width - 11),
}),
weakSide: getDepthPoint(teamId, clamp(depth + 3.5, 36, 88), {
y: clamp(wideY * -1 + pitch.width, 3.5, pitch.width - 3.5),
}),
restLink: clampToPitch({
x: hubPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.14),
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.72), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.under;
}
function applyReceptionSupportPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
if (actionMeta?.actionType !== "pass") {
return [];
}
const labels = [];
const localExcluded = new Set(excludedIds);
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
const hubPlayer = receiver ?? plannedRunner ?? null;
const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const sideSign =
getWideSideSign(hubPoint) ||
getWideSideSign(hubPlayer) ||
getWideSideSign(startPoint) ||
1;
const targetDepth = getAttackingDepth(hubPoint, teamId);
const targetIsWide = isWidePrincipleZone(hubPoint);
const targetIsCentral = Math.abs(hubPoint.y - pitch.width / 2) <= 15;
if (hubPlayer) {
localExcluded.add(hubPlayer.id);
}
const underSupport = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector", "wideBack"],
targets,
localExcluded,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, underSupport, getReceptionSupportTarget(teamId, hubPoint, "under", sideSign, profile))) {
localExcluded.add(underSupport.id);
excludedIds.add(underSupport.id);
labels.push("Reception triangle");
}
const insideSupport = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["connector", "pivot", "wideForward"],
targets,
localExcluded,
targetIsWide ? sideSign : 0,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, insideSupport, getReceptionSupportTarget(teamId, hubPoint, "inside", sideSign, profile))) {
localExcluded.add(insideSupport.id);
excludedIds.add(insideSupport.id);
labels.push("Inside support angle");
}
if (targetIsWide && (profile.overlapBias >= 0.52 || profile.widthDiscipline >= 0.62)) {
const outsideSupport = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideBack", "wideForward"],
targets,
localExcluded,
sideSign,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, outsideSupport, getReceptionSupportTarget(teamId, hubPoint, "outside", sideSign, profile))) {
localExcluded.add(outsideSupport.id);
excludedIds.add(outsideSupport.id);
labels.push("Outside option");
}
}
if (targetDepth >= 38 && (targetIsCentral || profile.directness >= 0.56 || plannedRunner)) {
const depthOption = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "wideForward", "secondStriker"],
targets,
localExcluded,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, depthOption, getReceptionSupportTarget(teamId, hubPoint, "beyond", sideSign, profile))) {
localExcluded.add(depthOption.id);
excludedIds.add(depthOption.id);
labels.push("Next depth option");
}
}
if (!targetIsWide && profile.switchBias >= 0.56) {
const weakSide = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideForward", "wideBack"],
targets,
localExcluded,
-sideSign,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, weakSide, getReceptionSupportTarget(teamId, hubPoint, "weakSide", sideSign, profile))) {
localExcluded.add(weakSide.id);
excludedIds.add(weakSide.id);
labels.push("Weak-side release");
}
}
const restLink = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "rest"],
targets,
localExcluded,
hubPoint
);
if (setAutopilotPrincipleTarget(targets, restLink, getReceptionSupportTarget(teamId, hubPoint, "restLink", sideSign, profile))) {
excludedIds.add(restLink.id);
}
return labels;
}
function getOpenGrassCarrySupportTarget(teamId, startPoint, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const halfY = pitch.width / 2 + sideSign * 12.5;
const farHalfY = pitch.width / 2 - sideSign * 12.5;
const wideY = clamp(pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.48, 24, 31), 3.4, pitch.width - 3.4);
const farWideY = clamp(pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.48, 24, 31), 3.4, pitch.width - 3.4);
const carryDistance = distance(startPoint, ballPoint);
const points = {
stretchAhead: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.directness * 6, Math.max(48, targetDepth + 4), 97), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 5.5, 0.45), 9, pitch.width - 9),
}),
insideLane: getDepthPoint(teamId, clamp(targetDepth + 1.5 + profile.shortSupport * 5, Math.max(38, startDepth + 5), 86), {
y: clamp(lerp(ballPoint.y, halfY, 0.58), 8, pitch.width - 8),
}),
outsideLane: getDepthPoint(teamId, clamp(targetDepth + 1 + profile.widthDiscipline * 4, Math.max(36, startDepth + 3), 92), {
y: clamp(lerp(ballPoint.y, wideY, 0.74), 3.4, pitch.width - 3.4),
}),
trailingSupport: getDepthPoint(teamId, clamp(targetDepth - 10 - profile.supportCompactness * 6, 20, 76), {
y: clamp(lerp(startPoint.y, pitch.width / 2 + sideSign * 5.5, 0.48), 10, pitch.width - 10),
}),
farRelease: getDepthPoint(teamId, clamp(targetDepth + 4 + profile.switchBias * 8, 38, 90), {
y: farWideY,
}),
cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6 + Math.min(carryDistance, 18) * 0.08, 70, 83), {
y: clamp(pitch.width / 2 - sideSign * 6.2, 14, pitch.width - 14),
}),
boxArrive: getDepthPoint(teamId, clamp(86 + profile.directness * 7, 82, 98), {
y: clamp(pitch.width / 2 + sideSign * 6.8, 12, pitch.width - 12),
}),
farPost: getDepthPoint(teamId, clamp(87, 84, 97), {
y: clamp(pitch.width / 2 - sideSign * 11.5, 11, pitch.width - 11),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.insideLane;
}
function applyOpenGrassCarrySupportTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
if (actionMeta?.actionType !== "dribble" || !ballPoint) {
return [];
}
const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
const carryDistance = distance(startPoint, ballPoint);
const forwardGain = (ballPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionSpace = getActionSpaceValue(startPoint, ballPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isOpenGrassCarry =
principleText.includes("open-grass") ||
(
carryDistance >= 9 &&
forwardGain >= 5 &&
actionSpace.openTarget >= 0.5 &&
actionSpace.targetPressure <= 0.66
);
if (!isOpenGrassCarry) {
return [];
}
const labels = [];
const localExcluded = new Set(excludedIds);
const sideSign = getWideSideSign(ballPoint) || getWideSideSign(startPoint) || 1;
const targetDepth = getAttackingDepth(ballPoint, teamId);
const targetIsWide = isWidePrincipleZone(ballPoint);
const finalThirdCarry = targetDepth >= 64 || targetThreat.box >= 0.18 || targetThreat.behindLine >= 0.3;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getOpenGrassCarrySupportTarget(teamId, startPoint, ballPoint, slot, sideSign, profile)
)) {
return null;
}
localExcluded.add(player.id);
excludedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
assign("stretchAhead", ["striker", "wideForward", "secondStriker"], "Carry support: stretch last line");
assign("insideLane", ["connector", "wideForward", "secondStriker"], "Carry support: inside lane", targetIsWide ? sideSign : 0);
if (targetIsWide || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.66) {
assign("outsideLane", ["wideBack", "wideForward"], "Carry support: outside option", sideSign);
}
assign("trailingSupport", ["pivot", "connector", "wideBack"], "Carry support: trailing option");
if (finalThirdCarry) {
assign("boxArrive", ["striker", "wideForward", "secondStriker"], "Carry support: box arrival");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Carry support: cutback edge");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Carry support: far-post threat", -sideSign);
} else if (profile.switchBias >= 0.56 || actionSpace.targetPressure >= 0.46) {
assign("farRelease", ["wideForward", "wideBack"], "Carry support: far release", -sideSign);
}
assign("restLock", ["pivot", "rest"], "Carry support: rest-defence lock");
return uniquePrincipleLabels(labels);
}
function getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const compactness = profile.supportCompactness ?? 0.56;
const width = profile.width ?? 58;
const directness = profile.directness ?? 0.52;
const halfSpaceY = pitch.width / 2 + sideSign * 12.5;
const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 10;
const wideY = clamp(pitch.width / 2 + sideSign * clamp(width * 0.48, 23, 31), 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.46, 22, 30), 3.5, pitch.width - 3.5);
const underDrop = lerp(9.5, 15.5, compactness);
const points = {
underSupport: getDepthPoint(teamId, clamp(depth - underDrop, 17, 78), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 5.5, 0.54), 8, pitch.width - 8),
}),
insideAngle: getDepthPoint(teamId, clamp(depth + lerp(-1.5, 3, directness), 28, 86), {
y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.72 : 0.42), 8, pitch.width - 8),
}),
beyondOption: getDepthPoint(teamId, clamp(depth + lerp(8, 16, directness), 42, 96), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.42), 10, pitch.width - 10),
}),
outsideWidth: getDepthPoint(teamId, clamp(depth + lerp(1.5, 6.5, profile.widthDiscipline ?? 0.62), 32, 92), {
y: wideY,
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + lerp(3, 9, profile.switchBias ?? 0.5), 34, 92), {
y: weakWideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.16),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.74), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyBallNearSupportTriangleTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return [];
}
const labels = [];
const localExcluded = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 13);
const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
const threat = getPitchThreatProfile(ballPoint, teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const isWide = isWidePrincipleZone(ballPoint);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getBallNearSupportTriangleTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
localExcluded.add(player.id);
labels.push(label);
return player;
};
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Ball-near support triangle");
assign("insideAngle", ["connector", "pivot", "wideForward", "secondStriker"], "Inside support angle", isWide ? sideSign : 0);
if (depth <= 86 && (gameSpace.key !== "outlet" || pressure <= 0.68 || profile.directness >= 0.5)) {
assign("beyondOption", ["striker", "wideForward", "secondStriker"], "Depth option beyond");
}
if (isWide || profile.widthDiscipline >= 0.62 || profile.overlapBias >= 0.54) {
assign("outsideWidth", ["wideBack", "wideForward"], "Outside width", sideSign);
}
if (!isWide && (profile.switchBias >= 0.56 || threat.centralPocket >= 0.28 || pressure >= 0.5)) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Weak-side release", -sideSign);
}
if (depth >= 38 || pressure >= 0.5) {
assign("restLock", ["pivot", "rest", "wideBack"], "Rest-defence lock");
}
return uniquePrincipleLabels(labels);
}
function getTargetLocalSuperiorityProfile(teamId, targets, point, excludedIds = new Set(), radius = 15) {
if (!teamId || !point) {
return {
supportCount: 0,
opponentCount: 0,
closeOpponents: 0,
underSupport: false,
lateralSupport: false,
forwardSupport: false,
geometryScore: 0,
sectorVariety: 0,
};
}
const attackSign = getAttackDirectionSign(teamId);
const sectors = new Set();
let supportCount = 0;
let opponentCount = 0;
let closeOpponents = 0;
let underSupport = false;
let lateralSupport = false;
let forwardSupport = false;
state.players.forEach((player) => {
if (isGoalkeeper(player)) {
return;
}
if (player.team === teamId) {
if (excludedIds.has(player.id)) {
return;
}
const target = targets.get(player.id) ?? player.position;
const gap = distance(target, point);
if (gap > radius) {
return;
}
supportCount += 1;
const forwardOffset = (target.x - point.x) * attackSign;
const lateralOffset = target.y - point.y;
if (forwardOffset <= -2.2 && Math.abs(lateralOffset) <= 18) {
underSupport = true;
sectors.add("under");
}
if (forwardOffset >= 3.2 && Math.abs(lateralOffset) <= 18) {
forwardSupport = true;
sectors.add("ahead");
}
if (Math.abs(lateralOffset) >= 6.5) {
lateralSupport = true;
sectors.add(lateralOffset > 0 ? "outsidePlus" : "outsideMinus");
}
if (Math.abs(forwardOffset) <= 5.5 && Math.abs(lateralOffset) <= 9) {
sectors.add("bounce");
}
return;
}
const opponentGap = distance(player.position, point);
if (opponentGap <= radius) {
opponentCount += 1;
}
if (opponentGap <= 5.5) {
closeOpponents += 1;
}
});
const sectorVariety = sectors.size;
const geometryScore = clamp(
(underSupport ? 0.3 : 0) +
(lateralSupport ? 0.22 : 0) +
(forwardSupport ? 0.18 : 0) +
clamp(supportCount / 3, 0, 1) * 0.18 +
clamp(sectorVariety / 4, 0, 1) * 0.16 -
clamp(closeOpponents / 3, 0, 1) * 0.16,
0,
1
);
return {
supportCount,
opponentCount,
closeOpponents,
underSupport,
lateralSupport,
forwardSupport,
geometryScore,
sectorVariety,
};
}
function getLocalSuperioritySupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const width = profile.width ?? 58;
const outsideY = clamp(pitch.width / 2 + sideSign * clamp(width * 0.47, 23, 31), 3.5, pitch.width - 3.5);
const insideY = clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 8.5, 0.56), 7.5, pitch.width - 7.5);
const weakSideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.45, 22, 30), 3.8, pitch.width - 3.8);
const points = {
underSupport: getDepthPoint(teamId, clamp(depth - 10.5 - (profile.supportCompactness ?? 0.55) * 4.5, 17, 76), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.46), 9, pitch.width - 9),
}),
insideSupport: getDepthPoint(teamId, clamp(depth + 1 + (profile.shortSupport ?? 0.55) * 3.5, 30, 84), {
y: insideY,
}),
outsideSupport: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.62) * 4.5, 32, 92), {
y: outsideY,
}),
forwardSupport: getDepthPoint(teamId, clamp(depth + 7 + (profile.directness ?? 0.52) * 5, 42, 96), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.36), 10, pitch.width - 10),
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + 3 + (profile.switchBias ?? 0.5) * 7, 34, 91), {
y: weakSideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.16),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 13, pitch.width - 13),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyLocalSuperioritySupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const protectedSupportIds = new Set();
const sideSign = getWideSideSign(ballPoint) || 1;
const passDistance = actionMeta?.beforeSnapshot?.ball?.position
? distance(actionMeta.beforeSnapshot.ball.position, ballPoint)
: distance(state.ball.startPosition ?? state.ball.position, ballPoint);
const radius = passDistance >= 26 ? 17 : 14.5;
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const local = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11.5);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const needsRepair =
local.geometryScore < 0.62 ||
local.supportCount <= 1 ||
pressure >= 0.48 ||
(local.opponentCount > local.supportCount && targetDepth >= 34);
if (!needsRepair) {
return {
labels: [],
protectedIds: new Set(),
};
}
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getLocalSuperioritySupportTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
protectedSupportIds.add(player.id);
labels.push(label);
return player;
};
if (!local.underSupport || pressure >= 0.5) {
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Local superiority: under support");
}
const refreshedAfterUnder = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
if (!refreshedAfterUnder.lateralSupport || isWidePrincipleZone(ballPoint)) {
assign(
isWidePrincipleZone(ballPoint) ? "outsideSupport" : "insideSupport",
isWidePrincipleZone(ballPoint) ? ["wideBack", "wideForward"] : ["connector", "wideForward", "pivot"],
isWidePrincipleZone(ballPoint) ? "Local superiority: outside option" : "Local superiority: lateral angle",
isWidePrincipleZone(ballPoint) ? sideSign : 0
);
}
const refreshedAfterLateral = getTargetLocalSuperiorityProfile(teamId, targets, ballPoint, assignedIds, radius);
if (
!refreshedAfterLateral.forwardSupport &&
targetDepth >= 36 &&
(
targetThreat.betweenLines >= 0.24 ||
targetThreat.halfSpace >= 0.28 ||
profile.directness >= 0.55 ||
local.opponentCount <= local.supportCount + 1
)
) {
assign("forwardSupport", ["striker", "wideForward", "secondStriker", "connector"], "Local superiority: forward option");
}
if (
(profile.switchBias ?? 0.5) >= 0.56 &&
(pressure >= 0.48 || local.opponentCount >= local.supportCount + 1 || targetThreat.centralPocket >= 0.26)
) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Local superiority: weak-side release", -sideSign);
}
if (targetDepth >= 42 || pressure >= 0.52) {
assign("restLock", ["pivot", "rest", "wideBack"], "Local superiority: rest lock");
}
if (labels.length) {
labels.unshift("Local superiority support");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSupportIds,
};
}
function getOffensivePassingGeometryContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "recovery"].includes(actionType)) {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = clampToPitch(ballPoint, 2.5);
const targetDepth = getAttackingDepth(targetPoint, teamId);
if (targetDepth < 24 && actionType !== "recovery") {
return null;
}
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(targetPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const pressure = getOpponentPressureAtPoint(teamId, targetPoint, 12);
const isWide = isWidePrincipleZone(targetPoint);
const isFinalThird =
targetDepth >= 66 ||
targetThreat.box >= 0.16 ||
targetThreat.cutbackZone >= 0.22 ||
targetThreat.assistZone >= 0.32;
const needsGeometry =
pressure >= 0.28 ||
targetDepth >= 34 ||
gameSpace.key === "space1" ||
gameSpace.key === "space2" ||
actionSpace.lineBreakCount >= 1 ||
actionType === "recovery";
if (!needsGeometry) {
return null;
}
return {
actionSpace,
actionType,
gameSpace,
isFinalThird,
isWide,
pressure,
sideSign,
startPoint: cloneVector(startPoint),
targetDepth,
targetPoint,
targetThreat,
};
}
function getOffensivePassingGeometryTarget(teamId, context, slot, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const depth = context.targetDepth;
const width = clamp(profile.width ?? 58, 44, 68);
const pressure = context.pressure;
const underDrop = lerp(7.2, 14.2, clamp(pressure, 0, 1));
const strongHalfY = clamp(pitch.width / 2 + sideSign * 12.2, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * 11.2, 8, pitch.width - 8);
const strongWideY = clamp(pitch.width / 2 + sideSign * width * 0.49, 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.5, pitch.width - 3.5);
const points = {
underAngle: getDepthPoint(teamId, clamp(depth - underDrop - (profile.shortSupport ?? 0.55) * 2.5, 16, 76), {
y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 4.2, 0.58), 8, pitch.width - 8),
}),
insideAngle: getDepthPoint(teamId, clamp(depth + lerp(-2.2, 3.6, profile.tempo ?? 0.5), 28, 84), {
y: clamp(lerp(ball.y, strongHalfY, context.isWide ? 0.72 : 0.48), 8, pitch.width - 8),
}),
outsideExit: getDepthPoint(teamId, clamp(depth + lerp(0.5, 5.8, profile.widthDiscipline ?? 0.62), 30, 90), {
y: strongWideY,
}),
thirdManAngle: getDepthPoint(teamId, clamp(depth + 5.8 + (profile.lineBreakBias ?? 0.5) * 5.4, 40, 92), {
y: clamp(lerp(ball.y, context.isWide ? weakHalfY : strongHalfY, 0.54), 8, pitch.width - 8),
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + 4.5 + (profile.switchBias ?? 0.5) * 6.5, 36, 92), {
y: weakWideY,
}),
restBalance: clampToPitch({
x: ball.x - sign * (20 + (profile.restBehind ?? 22) * 0.16),
y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return points[slot] ?? points.underAngle;
}
function applyOffensivePassingGeometryTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getOffensivePassingGeometryContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const protectedGeometryIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getOffensivePassingGeometryTarget(teamId, context, slot, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedGeometryIds.add(player.id);
labels.push(label);
return player;
};
assign("underAngle", ["pivot", "connector", "wideBack", "rest"], "Passing geometry: under angle");
assign("insideAngle", ["connector", "pivot", "wideForward", "secondStriker"], "Passing geometry: inside angle", context.isWide ? context.sideSign : 0);
if (context.isWide || profile.widthDiscipline >= 0.62 || profile.overlapBias >= 0.54) {
assign("outsideExit", ["wideBack", "wideForward"], "Passing geometry: outside exit", context.sideSign);
}
if (!context.isFinalThird || context.gameSpace.key === "space2" || context.pressure >= 0.42) {
assign("thirdManAngle", ["connector", "wideForward", "secondStriker", "pivot"], "Passing geometry: third-man angle", context.isWide ? -context.sideSign : context.sideSign);
}
if (profile.switchBias >= 0.5 || context.pressure >= 0.46 || context.targetThreat.centralPocket >= 0.24) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Passing geometry: weak-side release", -context.sideSign);
}
if (context.targetDepth >= 38 || context.pressure >= 0.44) {
assign("restBalance", ["pivot", "rest", "wideBack"], "Passing geometry: rest balance");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedGeometryIds,
};
}
function getLooseBallRecoverySupportTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const width = profile.widthDiscipline ?? 0.62;
const directness = profile.directness ?? 0.52;
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11);
const halfSpaceY = pitch.width / 2 + sideSign * 11.5;
const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 10.5;
const wideY = clamp(pitch.width / 2 + sideSign * lerp(22, 30, width), 4.5, pitch.width - 4.5);
const points = {
secureUnder: getDepthPoint(teamId, clamp(depth - lerp(7.5, 13, pressure), 16, 76), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4, 0.54), 8, pitch.width - 8),
}),
insideBounce: getDepthPoint(teamId, clamp(depth + lerp(-1.5, 3.5, directness), 28, 84), {
y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.62 : 0.42), 8, pitch.width - 8),
}),
forwardOutlet: getDepthPoint(teamId, clamp(depth + lerp(8, 18, directness), 42, 94), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.32), 9, pitch.width - 9),
}),
widthRelease: getDepthPoint(teamId, clamp(depth + lerp(1, 7, width), 32, 90), {
y: wideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * lerp(17, 25, profile.restDefence ?? 0.62),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.secureUnder;
}
function applyLooseBallRecoverySupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const isRecoveryAction =
actionMeta?.actionType === "recovery" ||
actionMeta?.profileKey === "loose-ball-recovery" ||
state.ball.actionType === "recovery" ||
state.ball.profileKey === "loose-ball-recovery";
if (!isRecoveryAction || !ballPoint || profile?.phaseKey === "setPiece") {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const protectedRecoveryIds = new Set();
const sideSign = getWideSideSign(ballPoint) || 1;
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11);
const threat = getPitchThreatProfile(ballPoint, teamId);
const directTransition = isTransitionAttackStyle(profile.styleKey) || profile.directness >= 0.62;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
const target = getLooseBallRecoverySupportTarget(teamId, ballPoint, slot, sideSign, profile);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedRecoveryIds.add(player.id);
labels.push(label);
return player;
};
assign("secureUnder", ["pivot", "connector", "wideBack", "rest"], "Recovery: secure first pass");
assign("insideBounce", ["connector", "pivot", "wideForward", "secondStriker"], "Recovery: inside bounce angle");
if (directTransition || pressure <= 0.5 || threat.depth >= 48) {
assign("forwardOutlet", ["striker", "wideForward", "secondStriker"], "Recovery: forward outlet");
}
if (isWidePrincipleZone(ballPoint) || profile.widthDiscipline >= 0.6 || pressure >= 0.48) {
assign("widthRelease", ["wideBack", "wideForward"], "Recovery: width release", sideSign);
}
assign("restLock", ["pivot", "rest", "wideBack"], "Recovery: rest-defence lock");
if (labels.length) {
labels.unshift("Loose-ball recovery support");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedRecoveryIds,
};
}
function getPostRecoveryAttackSupportContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (!["pass", "dribble", "shot"].includes(actionType)) {
return null;
}
const steps = state.sequence?.steps ?? [];
let recoveryIndex = -1;
for (let index = steps.length - 1; index >= 0; index -= 1) {
const step = steps[index];
const possessionTeamId = getRecordedStepPossessionTeamId(step);
const isRecovery =
step?.actionType === "recovery" ||
step?.profileKey === "loose-ball-recovery" ||
`${step?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
if (isRecovery && possessionTeamId === teamId) {
recoveryIndex = index;
break;
}
if (possessionTeamId && possessionTeamId !== teamId) {
break;
}
}
if (recoveryIndex < 0) {
return null;
}
const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
if (actionsAfterRecovery.length > 4) {
return null;
}
if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== teamId)) {
return null;
}
const elapsed = actionsAfterRecovery.reduce(
(total, step) => total + getRecordedStepDuration(step),
0
);
if (elapsed > 10.5) {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta?.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const recoveryStep = steps[recoveryIndex];
const recoveryPoint =
recoveryStep?.target ??
recoveryStep?.afterSnapshot?.ball?.position ??
startPoint;
const originDepth = getAttackingDepth(recoveryPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const targetDepth = getAttackingDepth(targetPoint, teamId);
const depthGainSinceRecovery = startDepth - originDepth;
const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const actionDistance = distance(startPoint, targetPoint);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const currentCarrier = getPlayerById(
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta?.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const pressure = currentCarrier?.team === teamId
? getPlayerPressureLoad(currentCarrier, startPoint)
: getOpponentPressureAtPoint(teamId, startPoint, 9.5);
const localSupport = getTeamSupportCountAroundPoint(
teamId,
startPoint,
new Set([currentCarrier?.id, actionMeta?.receiverPlayerId].filter(Boolean)),
13
);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(teamId) * 20,
y: lerp(startPoint.y, pitch.width / 2, 0.24),
}, 2.5);
const forwardOpenSpace = currentCarrier?.team === teamId
? getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(currentCarrier, forwardProbe))
: actionSpace.openTarget;
const patterns = actionsAfterRecovery
.map((step) => getRecordedStepPattern(step, teamId))
.filter(Boolean);
const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
const lanes = patterns.map((pattern) => pattern.laneKey).filter(Boolean);
const laneVariety = new Set(lanes).size;
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const directStyle = isTransitionAttackStyle(profile.styleKey);
const transitionCue =
actionForwardGain >= 5.5 &&
(
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.4 ||
targetThreat.behindLine >= 0.2 ||
targetThreat.centralPocket >= 0.24 ||
forwardOpenSpace >= 0.58
);
const secureCue =
pressure >= 0.5 ||
localSupport <= 1 ||
(
actionType === "pass" &&
actionDistance <= 22 &&
actionForwardGain >= -8 &&
actionSpace.targetPressure <= 0.72
);
const staleCue =
actionsAfterRecovery.length >= 2 &&
depthGainSinceRecovery < 8 &&
sidewaysOrBackCount >= 1 &&
lineBreakCount === 0 &&
laneVariety <= 2;
const finalThirdCue =
targetDepth >= 66 ||
targetThreat.box >= 0.16 ||
targetThreat.cutbackZone >= 0.22 ||
targetThreat.assistZone >= 0.32;
const counterWindow = clamp(
(directStyle ? 0.34 : 0) +
(profile.directness ?? 0.5) * 0.26 +
(profile.progressionUrgency ?? 0.5) * 0.16 +
forwardOpenSpace * 0.24 +
(transitionCue ? 0.22 : 0) -
Math.max(0, actionsAfterRecovery.length - 2) * 0.08,
0,
1.15
);
const secureNeed = clamp(
pressure * 0.34 +
(localSupport <= 1 ? 0.2 : 0) +
(secureCue ? 0.16 : 0) +
(profile.shortSupport ?? 0.5) * 0.08,
0,
1.1
);
const mode =
counterWindow >= Math.max(0.58, secureNeed + 0.12)
? "counter"
: secureNeed >= 0.58
? "secure"
: "establish";
return {
active: true,
teamId,
actionType,
actionMeta,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
recoveryPoint: cloneVector(recoveryPoint),
actionsAfterRecovery: actionsAfterRecovery.length,
elapsed,
originDepth,
startDepth,
targetDepth,
depthGainSinceRecovery,
actionForwardGain,
actionDistance,
actionSpace,
targetThreat,
pressure,
localSupport,
forwardOpenSpace,
sidewaysOrBackCount,
lineBreakCount,
laneVariety,
sideSign,
directStyle,
transitionCue,
secureCue,
staleCue,
finalThirdCue,
counterWindow,
secureNeed,
mode,
};
}
function getPostRecoveryAttackSupportTarget(teamId, context, slot, sideSign = context.sideSign, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(context.targetPoint, teamId);
const startDepth = getAttackingDepth(context.startPoint, teamId);
const wideY = clamp(pitch.width / 2 + sideSign * lerp(23, 31, profile.widthDiscipline ?? 0.62), 4, pitch.width - 4);
const farWideY = clamp(pitch.width / 2 - sideSign * lerp(23, 31, profile.widthDiscipline ?? 0.62), 4, pitch.width - 4);
const halfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const points = {
counterRunner: getDepthPoint(teamId, clamp(depth + 13 + (profile.directness ?? 0.5) * 8, Math.max(50, startDepth + 10), 98), {
y: clamp(lerp(context.targetPoint.y, farHalfY, 0.5), 9, pitch.width - 9),
}),
pinLastLine: getDepthPoint(teamId, clamp(depth + 10 + (profile.runnerBoost ?? 7) * 0.34, 48, 98), {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.56), 11, pitch.width - 11),
}),
wideRelease: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.6) * 7, 34, 92), {
y: wideY,
}),
weakSideRelease: getDepthPoint(teamId, clamp(depth + 4 + (profile.switchBias ?? 0.5) * 8, 36, 92), {
y: farWideY,
}),
insideLink: getDepthPoint(teamId, clamp(depth + 1 + (profile.shortSupport ?? 0.55) * 5, 30, 86), {
y: clamp(lerp(context.targetPoint.y, halfY, context.finalThirdCue ? 0.42 : 0.58), 9, pitch.width - 9),
}),
underSupport: getDepthPoint(teamId, clamp(depth - 9 - (profile.supportCompactness ?? 0.55) * 5, 17, 78), {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2 - sideSign * 4.5, 0.54), 9, pitch.width - 9),
}),
trailer: getDepthPoint(teamId, clamp(depth - 4 + (profile.shortSupport ?? 0.55) * 4, 28, 82), {
y: clamp(lerp(context.targetPoint.y, farHalfY, 0.34), 10, pitch.width - 10),
}),
boxArrive: getDepthPoint(teamId, clamp(84 + (profile.directness ?? 0.5) * 8, 80, 98), {
y: clamp(pitch.width / 2 + sideSign * 6.2, 12, pitch.width - 12),
}),
farPostArrive: getDepthPoint(teamId, clamp(86, 82, 98), {
y: clamp(pitch.width / 2 - sideSign * 10.8, 10, pitch.width - 10),
}),
restLock: clampToPitch({
x: context.targetPoint.x - sign * (18 + (profile.restBehind ?? 22) * 0.22),
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
farRestCover: clampToPitch({
x: context.targetPoint.x - sign * (22 + (profile.restBehind ?? 22) * 0.2),
y: clamp(pitch.width / 2 - sideSign * 10.4, 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyPostRecoveryAttackSupportTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getPostRecoveryAttackSupportContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const protectedPostRecoveryIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
const target = getPostRecoveryAttackSupportTarget(teamId, context, slot, context.sideSign, profile);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedPostRecoveryIds.add(player.id);
labels.push(label);
return player;
};
if (context.mode === "counter") {
assign("counterRunner", ["striker", "wideForward", "secondStriker"], "Post-recovery attack: depth runner");
assign("wideRelease", ["wideForward", "wideBack"], "Post-recovery attack: width release", context.sideSign);
assign("insideLink", ["connector", "wideForward", "secondStriker"], "Post-recovery attack: inside link", context.sideSign);
assign("trailer", ["connector", "pivot", "wideForward"], "Post-recovery attack: trailer support");
if (context.finalThirdCue || context.targetDepth >= 62) {
assign("boxArrive", ["striker", "secondStriker", "wideForward"], "Post-recovery attack: box arrival");
}
} else if (context.mode === "secure") {
assign("underSupport", ["pivot", "connector", "wideBack", "rest"], "Post-recovery attack: secure under-support");
assign("insideLink", ["connector", "pivot", "wideForward"], "Post-recovery attack: inside angle");
if (context.pressure >= 0.48 || context.staleCue || profile.switchBias >= 0.54) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Post-recovery attack: weak-side release", -context.sideSign);
}
assign("trailer", ["connector", "pivot"], "Post-recovery attack: reset trailer");
} else {
assign("underSupport", ["pivot", "connector", "wideBack"], "Post-recovery attack: connect under");
assign("insideLink", ["connector", "wideForward", "secondStriker"], "Post-recovery attack: half-space link", context.sideSign);
assign("pinLastLine", ["striker", "wideForward", "secondStriker"], "Post-recovery attack: pin last line");
if (context.staleCue || profile.switchBias >= 0.56) {
assign("weakSideRelease", ["wideForward", "wideBack"], "Post-recovery attack: change-side outlet", -context.sideSign);
} else {
assign("wideRelease", ["wideBack", "wideForward"], "Post-recovery attack: hold width", context.sideSign);
}
}
assign("restLock", ["pivot", "rest", "wideBack"], "Post-recovery attack: rest-defence lock");
if (context.targetDepth >= 48 || context.mode === "counter") {
assign("farRestCover", ["rest", "pivot", "wideBack"], "Post-recovery attack: far rest cover", -context.sideSign);
}
if (context.finalThirdCue && context.mode !== "secure") {
assign("farPostArrive", ["wideForward", "striker", "secondStriker"], "Post-recovery attack: far-post threat", -context.sideSign);
}
if (labels.length) {
labels.unshift(
context.mode === "counter"
? "Post-recovery attacking support: counter"
: context.mode === "secure"
? "Post-recovery attacking support: secure"
: "Post-recovery attacking support: establish"
);
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedPostRecoveryIds,
};
}
function getOffensiveRestDefenceNetContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType === "recovery") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = clampToPitch(actionMeta?.target ?? ballPoint, 2.5);
const ballDepth = getAttackingDepth(targetPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
if (ballDepth < 34 && startDepth < 34) {
return null;
}
const actionSpace = getActionSpaceValue(startPoint, targetPoint, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(startPoint) ||
1;
const actionForwardGain = (targetPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const highAttack =
ballDepth >= 58 ||
targetThreat.assistZone >= 0.28 ||
targetThreat.cutbackZone >= 0.18 ||
targetThreat.box >= 0.12;
const transitionRisk = clamp(
ballDepth / 100 * 0.34 +
(profile.risk ?? 0.5) * 0.22 +
(profile.directness ?? 0.5) * 0.12 +
(actionForwardGain >= 6 ? 0.12 : 0) +
(actionType === "dribble" ? 0.08 : 0) +
(actionType === "shot" ? 0.16 : 0) +
actionSpace.value * 0.18 +
clamp(actionSpace.lineBreakCount / 2, 0, 1) * 0.14,
0,
1.3
);
const counterPressReadiness = clamp(
(profile.tempo ?? 0.5) * 0.22 +
(profile.risk ?? 0.5) * 0.18 +
(profile.supportCompactness ?? 0.55) * 0.14 +
(profile.styleKey === "gegenpress" ? 0.22 : 0) +
(profile.styleKey === "vertical-tiki-taka" ? 0.08 : 0) +
(actionSpace.targetPressure >= 0.44 ? 0.08 : 0) +
(highAttack ? 0.12 : 0),
0,
1.25
);
const restNeed = clamp(
transitionRisk * 0.64 +
(highAttack ? 0.16 : 0) +
((profile.restBehind ?? 22) <= 21 ? 0.1 : 0),
0,
1.2
);
return {
actionType,
actionForwardGain,
actionSpace,
ballDepth,
counterPressReadiness,
highAttack,
restNeed,
sideSign,
startPoint: cloneVector(startPoint),
targetPoint,
targetThreat,
transitionRisk,
};
}
function getOffensiveRestDefenceNetTarget(teamId, context, slot, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = context.ballDepth;
const sideSign = context.sideSign || 1;
const restBehind = profile.restBehind ?? 22;
const compactness = profile.supportCompactness ?? 0.56;
const ball = context.targetPoint;
const points = {
centralAnchor: clampToPitch({
x: ball.x - sign * (19 + restBehind * 0.2 + context.restNeed * 2.2),
y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
farAnchor: clampToPitch({
x: ball.x - sign * (23 + restBehind * 0.18 + context.transitionRisk * 2),
y: clamp(pitch.width / 2 - sideSign * 11.5, 10, pitch.width - 10),
}, 3),
ballSideScreen: clampToPitch({
x: ball.x - sign * (9 + context.restNeed * 3.2),
y: clamp(lerp(ball.y, pitch.width / 2 + sideSign * 5.5, 0.5 + compactness * 0.12), 9, pitch.width - 9),
}, 3),
closeCounterPress: clampToPitch({
x: ball.x - sign * lerp(5.8, 2.8, context.counterPressReadiness),
y: clamp(ball.y + sideSign * lerp(4.8, 2.7, context.counterPressReadiness), 4.5, pitch.width - 4.5),
}, 3),
farSidePrevent: clampToPitch({
x: ball.x - sign * (14.5 + context.restNeed * 3),
y: clamp(pitch.width / 2 - sideSign * lerp(17, 24, profile.widthDiscipline ?? 0.62), 5, pitch.width - 5),
}, 3),
recoveryLine: clampToPitch({
x: ball.x - sign * (29 + restBehind * 0.12 + context.transitionRisk * 2.4),
y: clamp(pitch.width / 2 + sideSign * 5.5, 12, pitch.width - 12),
}, 3),
};
if (slot === "centralAnchor" && depth < 46) {
points.centralAnchor.x = getDepthX(teamId, clamp(depth - restBehind * 0.72, 14, 48));
}
return points[slot] ?? points.centralAnchor;
}
function applyOffensiveRestDefenceNetTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getOffensiveRestDefenceNetContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const protectedRestIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getOffensiveRestDefenceNetTarget(teamId, context, slot, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedRestIds.add(player.id);
labels.push(label);
return player;
};
assign("centralAnchor", ["rest", "pivot", "wideBack"], "Rest-defence net: central anchor");
if (context.restNeed >= 0.42 || context.ballDepth >= 48) {
assign("farAnchor", ["rest", "wideBack", "pivot"], "Rest-defence net: far cover", -context.sideSign);
}
if (context.counterPressReadiness >= 0.46 || context.actionType === "dribble" || context.actionSpace.targetPressure >= 0.44) {
assign("ballSideScreen", ["pivot", "connector", "wideBack"], "Rest-defence net: ball-side screen", context.sideSign);
assign("closeCounterPress", ["connector", "wideForward", "secondStriker", "pivot"], "Rest-defence net: counter-press support", context.sideSign);
}
if (context.highAttack || profile.switchBias >= 0.56 || profile.widthDiscipline >= 0.64) {
assign("farSidePrevent", ["wideBack", "wideForward", "connector"], "Rest-defence net: stop weak-side break", -context.sideSign);
}
if (context.ballDepth >= 66 || context.actionType === "shot" || context.transitionRisk >= 0.72) {
assign("recoveryLine", ["rest", "pivot", "wideBack"], "Rest-defence net: recovery line");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedRestIds,
};
}
function getPressResistanceEscapeTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const compactness = profile.supportCompactness ?? 0.56;
const isWide = isWidePrincipleZone(ballPoint);
const insideY = clamp(lerp(ballPoint.y, pitch.width / 2, isWide ? 0.78 : 0.44), 7, pitch.width - 7);
const oppositeY = clamp(pitch.width / 2 - sideSign * 18.5, 6, pitch.width - 6);
const sameSideHalfY = clamp(pitch.width / 2 + sideSign * 10.5, 8, pitch.width - 8);
const points = {
underEscape: getDepthPoint(teamId, clamp(depth - (10.5 + compactness * 4), 16, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 3.5, 0.52), 8, pitch.width - 8),
}),
sideEscape: getDepthPoint(teamId, clamp(depth - 2.5, 24, 82), {
y: insideY,
}),
thirdPlayer: getDepthPoint(teamId, clamp(depth + 4.5 + (profile.directness ?? 0.52) * 4.5, 34, 88), {
y: clamp(lerp(ballPoint.y, sameSideHalfY, isWide ? 0.42 : 0.68), 8, pitch.width - 8),
}),
switchOutlet: getDepthPoint(teamId, clamp(depth + 1.5 + (profile.switchBias ?? 0.5) * 6, 32, 88), {
y: oppositeY,
}),
safetyBehind: clampToPitch({
x: ballPoint.x - sign * (18 + compactness * 5),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.82), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underEscape;
}
function applyPressResistanceEscapeSupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 11.5);
const nearestGap = getNearestOpponentGapToPoint(teamId, ballPoint);
const active =
pressure >= 0.46 ||
nearestGap <= 4.9 ||
(actionMeta?.autoPrinciples ?? []).some((label) => String(label).toLowerCase().includes("pressure"));
if (!active) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const depth = getAttackingDepth(ballPoint, teamId);
const isWide = isWidePrincipleZone(ballPoint);
const threat = getPitchThreatProfile(ballPoint, teamId);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getPressResistanceEscapeTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("underEscape", ["pivot", "connector", "wideBack", "rest"], "Press escape: support under ball");
assign("sideEscape", ["connector", "pivot", "wideForward", "wideBack"], "Press escape: inside angle", isWide ? 0 : sideSign);
if (pressure >= 0.56 || nearestGap <= 3.4 || threat.betweenLines >= 0.28) {
assign("thirdPlayer", ["connector", "wideForward", "secondStriker", "striker"], "Press escape: third-player outlet", isWide ? sideSign : 0);
}
if (isWide || profile.switchBias >= 0.56 || pressure >= 0.58) {
assign("switchOutlet", ["wideForward", "wideBack", "connector"], "Press escape: switch outlet", -sideSign);
}
if (depth >= 34 && pressure >= 0.54) {
assign("safetyBehind", ["pivot", "rest", "wideBack"], "Press escape: safety behind ball");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: assignedIds,
};
}
function getPressEscapeContinuationTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const halfSpaceY = clamp(pitch.width / 2 + sideSign * 10.5, 8, pitch.width - 8);
const oppositeHalfSpaceY = clamp(pitch.width / 2 - sideSign * 11.5, 8, pitch.width - 8);
const wideExitY = clamp(pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.46, 22, 30), 3.5, pitch.width - 3.5);
const weakWideY = clamp(pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.44, 20, 29), 3.5, pitch.width - 3.5);
const points = {
exitLane: getDepthPoint(teamId, clamp(depth + 8 + (profile.directness ?? 0.52) * 6, 42, 94), {
y: clamp(lerp(ballPoint.y, halfSpaceY, isWidePrincipleZone(ballPoint) ? 0.52 : 0.7), 8, pitch.width - 8),
}),
wallRelease: getDepthPoint(teamId, clamp(depth + 2.5, 34, 84), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.38), 8, pitch.width - 8),
}),
wideExit: getDepthPoint(teamId, clamp(depth + 5 + (profile.overlapBias ?? 0.5) * 5, 38, 92), {
y: wideExitY,
}),
weakSwitch: getDepthPoint(teamId, clamp(depth + 4 + (profile.switchBias ?? 0.5) * 6, 38, 92), {
y: weakWideY,
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (16 + (profile.restBehind ?? 22) * 0.12),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.exitLane;
}
function applyPressEscapeContinuationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
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
const pressure = getOpponentPressureAtPoint(teamId, ballPoint, 12.5);
const nearestGap = getNearestOpponentGapToPoint(teamId, ballPoint);
const active =
pressure >= 0.5 ||
nearestGap <= 4.4 ||
principleText.includes("press escape") ||
principleText.includes("receive escape") ||
principleText.includes("secure under pressure");
if (!active) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const sideSign = getWideSideSign(ballPoint) || 1;
const isWide = isWidePrincipleZone(ballPoint);
const threat = getPitchThreatProfile(ballPoint, teamId);
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getPressEscapeContinuationTarget(teamId, ballPoint, slot, sideSign, profile)
)) {
return null;
}
assignedIds.add(player.id);
labels.push(label);
return player;
};
assign("exitLane", ["wideForward", "secondStriker", "striker", "connector"], "Escape continuation: exit lane", isWide ? sideSign : 0);
assign("wallRelease", ["connector", "pivot", "wideForward", "secondStriker"], "Escape continuation: wall release");
if (isWide || (profile.overlapBias ?? 0) >= 0.55) {
assign("wideExit", ["wideBack", "wideForward"], "Escape continuation: wide exit", sideSign);
}
if ((profile.switchBias ?? 0) >= 0.56 || pressure >= 0.58 || threat.centralPocket >= 0.24) {
assign("weakSwitch", ["wideForward", "wideBack", "connector"], "Escape continuation: weak-side switch", -sideSign);
}
assign("restLock", ["pivot", "rest", "wideBack"], "Escape continuation: rest lock");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: assignedIds,
};
}
function getSwitchLandingAttackContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!teamId || !ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const actionType = actionMeta?.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = clampToPitch(actionMeta?.target ?? ballPoint, 2.5);
const actionDistance = distance(startPoint, targetPoint);
const laneShift = Math.abs(getPitchLaneIndex(startPoint) - getPitchLaneIndex(targetPoint));
const targetDepth = getAttackingDepth(targetPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const sideSign =
getWideSideSign(targetPoint) ||
getWideSideSign(ballPoint) ||
getWideSideSign(startPoint) ||
1;
const targetThreat = getPitchThreatProfile(targetPoint, teamId);
const pressure = getOpponentPressureAtPoint(teamId, targetPoint, 12);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const isSwitchAction =
actionType === "pass" &&
(
(actionDistance >= 18 && laneShift >= 2) ||
principleText.includes("switch") ||
principleText.includes("weak-side")
);
const isPressureEscapeSwitch =
isSwitchAction &&
(
principleText.includes("press escape") ||
principleText.includes("pressure-trap") ||
principleText.includes("switch away")
);
const isFarSideWideEntry =
isSwitchAction &&
isWidePrincipleZone(targetPoint) &&
targetDepth >= 34;
const active =
isPressureEscapeSwitch ||
isFarSideWideEntry ||
(
isSwitchAction &&
targetDepth >= 42 &&
((profile.switchBias ?? 0.5) >= 0.56 || (profile.widthDiscipline ?? 0.62) >= 0.64)
);
if (!active) {
return null;
}
const finalThirdCue =
targetDepth >= 64 ||
targetThreat.assistZone >= 0.22 ||
targetThreat.cutbackZone >= 0.18 ||
targetThreat.box >= 0.16;
const wideIsolationCue =
isWidePrincipleZone(targetPoint) &&
pressure <= 0.5 &&
((profile.overlapBias ?? 0.5) >= 0.54 || (profile.dribbleBias ?? 0.5) >= 0.5);
const settleCue =
targetDepth < 52 ||
pressure >= 0.6 ||
startDepth > targetDepth + 4;
return {
actionDistance,
actionType,
finalThirdCue,
isFarSideWideEntry,
isPressureEscapeSwitch,
laneShift,
mode: finalThirdCue
? "finalThird"
: wideIsolationCue
? "wideIsolation"
: settleCue
? "settle"
: "progress",
pressure,
sideSign,
startDepth,
startPoint: cloneVector(startPoint),
targetDepth,
targetPoint,
targetThreat,
};
}
function getSwitchLandingAttackTarget(teamId, context, slot, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = context.targetDepth;
const ball = context.targetPoint;
const sideSign = context.sideSign || 1;
const wideY = clamp(
pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.49, 25.5, 31.5),
3.4,
pitch.width - 3.4
);
const outsideY = clamp(ball.y + sideSign * (5.2 + (profile.widthDiscipline ?? 0.62) * 2.2), 3.2, pitch.width - 3.2);
const halfY = clamp(
pitch.width / 2 + sideSign * clamp((profile.width ?? 58) * 0.24, 12, 17),
7,
pitch.width - 7
);
const weakHalfY = clamp(
pitch.width / 2 - sideSign * clamp((profile.width ?? 58) * 0.23, 11, 16),
8,
pitch.width - 8
);
const nearBoxY = clamp(pitch.width / 2 + sideSign * 6.8, 9, pitch.width - 9);
const farPostY = clamp(pitch.width / 2 - sideSign * 12.8, 7, pitch.width - 7);
const points = {
outsideOverlap: getDepthPoint(teamId, clamp(depth + 6.8 + (profile.overlapBias ?? 0.5) * 5.2, 42, 96), {
y: outsideY,
}),
underlap: getDepthPoint(teamId, clamp(depth + 5.4 + (profile.shortSupport ?? 0.55) * 4.2, 42, 92), {
y: clamp(lerp(ball.y, halfY, 0.72), 7, pitch.width - 7),
}),
insidePocket: getDepthPoint(teamId, clamp(depth + 2.5 + (profile.lineBreakBias ?? 0.5) * 5.2, 40, 88), {
y: clamp(lerp(ball.y, halfY, 0.64), 7, pitch.width - 7),
}),
underSupport: getDepthPoint(teamId, clamp(depth - 8.5 - (profile.supportCompactness ?? 0.56) * 5.5, 18, 78), {
y: clamp(lerp(ball.y, pitch.width / 2 - sideSign * 2.8, 0.52), 10, pitch.width - 10),
}),
oneVsOneClearout: getDepthPoint(teamId, clamp(depth + 9.5 + (profile.runnerBoost ?? 7) * 0.34, 48, 96), {
y: clamp(lerp(pitch.width / 2 - sideSign * 6.5, weakHalfY, 0.22), 10, pitch.width - 10),
}),
boxRun: getDepthPoint(teamId, clamp(Math.max(depth + 9, 82), 76, 98), {
y: nearBoxY,
}),
farPostRun: getDepthPoint(teamId, clamp(Math.max(depth + 10, 84), 78, 98), {
y: farPostY,
}),
cutbackEdge: getDepthPoint(teamId, clamp(Math.max(depth + 3.5, 69), 62, 86), {
y: clamp(lerp(pitch.width / 2 + sideSign * 8.5, halfY, 0.28), 10, pitch.width - 10),
}),
widthHold: getDepthPoint(teamId, clamp(depth + 2 + (profile.widthDiscipline ?? 0.62) * 4, 38, 88), {
y: wideY,
}),
weakRestLock: clampToPitch({
x: ball.x - sign * (17 + (profile.restBehind ?? 22) * 0.18),
y: clamp(pitch.width / 2 - sideSign * 10.5, 11, pitch.width - 11),
}, 3),
restBalance: clampToPitch({
x: ball.x - sign * (22 + (profile.restBehind ?? 22) * 0.2),
y: clamp(lerp(ball.y, pitch.width / 2, 0.78), 13, pitch.width - 13),
}, 3),
};
return points[slot] ?? points.insidePocket;
}
function applySwitchLandingAttackTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
const context = getSwitchLandingAttackContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const protectedSwitchIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getSwitchLandingAttackTarget(teamId, context, slot, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, target)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, target);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedSwitchIds.add(player.id);
labels.push(label);
return player;
};
assign("outsideOverlap", ["wideBack", "wideForward"], "Switch landing: outside overlap", context.sideSign);
assign("insidePocket", ["connector", "secondStriker", "wideForward", "pivot"], "Switch landing: half-space link", context.sideSign);
if (context.mode === "wideIsolation") {
assign("underlap", ["connector", "wideBack", "wideForward"], "Switch landing: underlap option", context.sideSign);
assign("oneVsOneClearout", ["striker", "secondStriker", "wideForward"], "Switch landing: clear the 1v1");
} else {
assign("underSupport", ["pivot", "connector", "rest", "wideBack"], "Switch landing: secure under-support");
}
if (context.mode === "finalThird") {
assign("boxRun", ["striker", "secondStriker", "wideForward"], "Switch landing: near-box run");
assign("farPostRun", ["wideForward", "striker", "secondStriker"], "Switch landing: far-post run", -context.sideSign);
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Switch landing: cutback edge", context.sideSign);
} else if (context.mode === "progress") {
assign("widthHold", ["wideForward", "wideBack"], "Switch landing: hold width to stretch", context.sideSign);
}
assign("restBalance", ["rest", "pivot", "wideBack"], "Switch landing: rest balance");
if (context.targetDepth >= 48 || context.isPressureEscapeSwitch || context.mode === "finalThird") {
assign("weakRestLock", ["rest", "wideBack", "pivot"], "Switch landing: far-side rest lock", -context.sideSign);
}
if (labels.length) {
labels.unshift(
context.mode === "finalThird"
? "Switch landing attack: attack the far side"
: context.mode === "wideIsolation"
? "Switch landing attack: isolate and support"
: context.mode === "settle"
? "Switch landing attack: secure the far side"
: "Switch landing attack: progress after switch"
);
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSwitchIds,
};
}
function getBlindsideChannelRunContext(teamId, ballPoint, actionMeta, profile) {
if (!ballPoint || profile?.phaseKey === "setPiece") {
return null;
}
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const actionType = actionMeta?.actionType ?? state.ball.actionType;
const ballDepth = getAttackingDepth(ballPoint, teamId);
const startDepth = getAttackingDepth(startPoint, teamId);
const forwardGain = (ballPoint.x - startPoint.x) * getAttackDirectionSign(teamId);
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, ballPoint, teamId, profile);
const lineDepths = targetThreat.opponentLineDepths ?? getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const canThreatenDepth =
ballDepth >= 36 &&
(
gameSpace.key === "space2" ||
gameSpace.key === "space3" ||
targetThreat.behindLine >= 0.16 ||
actionSpace.lineBreakCount >= 1 ||
forwardGain >= 5 ||
profile.lineBreakBias >= 0.58 ||
profile.directness >= 0.62 ||
principleText.includes("exit lane") ||
principleText.includes("line break") ||
principleText.includes("run beyond")
);
if (!canThreatenDepth) {
return null;
}
const initiator = getPlayerById(
actionMeta?.carrierPlayerId ??
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId ??
state.ball.initiatorPlayerId
);
const actionDistance = distance(startPoint, ballPoint);
const ballProfile = resolveBallActionProfile(
actionType,
startPoint,
ballPoint,
initiator,
actionMeta?.receiverPlayerId ?? null
);
const actionSpeed = Math.max(
actionMeta?.speed ??
state.ball.speed ??
ballProfile.averageSpeed ??
(actionType === "dribble" ? 5.2 : 12),
0.1
);
const eta = actionDistance / actionSpeed;
const sideSign =
getWideSideSign(ballPoint) ||
getWideSideSign(startPoint) ||
1;
const breakLine =
actionSpace.lineBreakCount >= 1 ||
targetThreat.behindLine >= 0.24 ||
gameSpace.key === "space3" ||
(forwardGain >= 8 && profile.lineBreakBias >= 0.52);
return {
actionType,
startPoint,
targetPoint: ballPoint,
ballDepth,
startDepth,
forwardGain,
targetThreat,
gameSpace,
actionSpace,
lineDepths,
eta,
arrivalWindow: eta + 0.85 + (profile.tempo ?? 0.5) * 0.35,
sideSign,
breakLine,
};
}
function getBlindsideChannelRunTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const lineDepth = context.lineDepths.back ?? clamp(context.ballDepth + 18, 56, 88);
const depthLead = context.breakLine
? 3.8 + (context.profile?.lineBreakBias ?? 0.5) * 4.2
: -1.2;
const runDepth = clamp(
Math.max(context.ballDepth + 6, lineDepth + depthLead),
46,
97
);
const pinDepth = clamp(Math.max(context.ballDepth + 5, lineDepth - 1.4), 44, 93);
const sideSign = context.sideSign || 1;
const strongHalfY = clamp(pitch.width / 2 + sideSign * 11.5, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * 11.5, 8, pitch.width - 8);
const wideChannelY = clamp(pitch.width / 2 + sideSign * 23.5, 4, pitch.width - 4);
const farChannelY = clamp(pitch.width / 2 - sideSign * 20.5, 5, pitch.width - 5);
const points = {
blindsideRun: getDepthPoint(teamId, runDepth, {
y: clamp(lerp(context.targetPoint.y, weakHalfY, 0.56), 7, pitch.width - 7),
}),
nearChannel: getDepthPoint(teamId, clamp(runDepth - 1.2, 45, 96), {
y: clamp(lerp(context.targetPoint.y, strongHalfY, 0.68), 7, pitch.width - 7),
}),
wideChannel: getDepthPoint(teamId, clamp(runDepth - 2.4, 44, 95), {
y: wideChannelY,
}),
farChannel: getDepthPoint(teamId, clamp(runDepth - 1.8, 45, 96), {
y: farChannelY,
}),
pinLine: getDepthPoint(teamId, pinDepth, {
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.58), 12, pitch.width - 12),
}),
restScreen: clampToPitch({
x: context.targetPoint.x - sign * 22,
y: clamp(lerp(context.targetPoint.y, pitch.width / 2, 0.74), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.blindsideRun;
}
function chooseBlindsideChannelRunner(teamId, targets, excludedIds, roleKeys, target, context) {
const roleSet = new Set(roleKeys);
const arrivalWindow = Math.max(context.arrivalWindow, 0.85);
return state.players
.filter((player) => {
if (player.team !== teamId || excludedIds.has(player.id) || !targets.has(player.id) || isGoalkeeper(player)) {
return false;
}
return roleSet.has(getOffensiveRoleKey(player, teams[teamId]?.formation));
})
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const runDistance = distance(player.position, target);
const timeToTarget = computeTimeToCoverDistance(player, runDistance, target);
const timingFit = clamp(1 - Math.abs(timeToTarget - arrivalWindow) / 1.8, 0, 1);
const playerSide = getWideSideSign(player);
const targetSide = getWideSideSign(target);
const sideFit = !targetSide || !playerSide || playerSide === targetSide ? 0.12 : -0.08;
const roleFit = Math.max(0.4, 1 - roleKeys.indexOf(roleKey) * 0.08);
const score =
roleFit * 0.24 +
timingFit * 0.34 +
getAutoPilotRoleStrength(player, "runner") * 0.28 +
getPlayerTendency(player, "boxRun") * 0.16 +
getPlayerTendency(player, "passAndMove") * 0.1 +
sideFit -
Math.max(timeToTarget - arrivalWindow, 0) * 0.14 -
runDistance * 0.005;
return {
player,
score,
timeToTarget,
};
})
.filter((entry) => entry.score >= 0.34 || entry.timeToTarget <= arrivalWindow + 1.2)
.sort((a, b) => b.score - a.score)[0]?.player ?? null;
}
function applyBlindsideChannelRunTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
protectedIds = new Set()
) {
const context = getBlindsideChannelRunContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
context.profile = profile;
const labels = [];
const assignedIds = new Set([...protectedIds].filter(Boolean));
const protectedRunIds = new Set();
const assign = (slot, roleKeys, label) => {
const target = getBlindsideChannelRunTarget(teamId, context, slot);
const player = chooseBlindsideChannelRunner(teamId, targets, assignedIds, roleKeys, target, context);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedRunIds.add(player.id);
labels.push(label);
return player;
};
if (context.breakLine) {
assign("blindsideRun", ["wideForward", "secondStriker", "striker"], "Blindside run behind line");
assign("nearChannel", ["striker", "secondStriker", "wideForward"], "Near-channel run");
} else {
assign("pinLine", ["striker", "secondStriker", "wideForward"], "Pin last line");
assign("nearChannel", ["wideForward", "secondStriker", "striker"], "Prepare channel run");
}
if (isWidePrincipleZone(context.targetPoint) || profile.overlapBias >= 0.56) {
assign("wideChannel", ["wideBack", "wideForward"], "Wide channel release");
}
if (profile.switchBias >= 0.58 || context.targetThreat.centralPocket >= 0.28 || context.actionSpace.value >= 0.42) {
assign("farChannel", ["wideForward", "secondStriker", "wideBack"], "Far-side blindside run");
}
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedRunIds,
};
}
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
function getSpaceTwoForwardFacingTarget(teamId, hubPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(hubPoint, teamId);
const width = clamp(profile.width ?? 58, 42, 66);
const nearHalfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const nearWideY = clamp(pitch.width / 2 + sideSign * width * 0.48, 3.5, pitch.width - 3.5);
const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.5, pitch.width - 3.5);
const points = {
bounceUnder: getDepthPoint(teamId, clamp(depth - 8.5 - profile.shortSupport * 4.5, 22, 72), {
y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 4.8, 0.46), 10, pitch.width - 10),
}),
nextLinePin: getDepthPoint(teamId, clamp(depth + 11 + profile.runnerBoost * 0.45, 54, 97), {
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.5), 13, pitch.width - 13),
}),
blindsideDiagonal: getDepthPoint(teamId, clamp(depth + 13 + profile.directness * 5.5, 56, 98), {
y: clamp(lerp(hubPoint.y, farHalfY, 0.62), 9, pitch.width - 9),
}),
insideWall: getDepthPoint(teamId, clamp(depth + 2.5 + profile.shortSupport * 4, 42, 84), {
y: clamp(lerp(hubPoint.y, nearHalfY, 0.48), 8, pitch.width - 8),
}),
outsideWidth: getDepthPoint(teamId, clamp(depth + 2 + profile.widthDiscipline * 5, 40, 90), {
y: nearWideY,
}),
weakSideWidth: getDepthPoint(teamId, clamp(depth + 4 + profile.switchBias * 7, 42, 91), {
y: farWideY,
}),
boxArrive: getDepthPoint(teamId, clamp(84 + profile.directness * 8, 80, 98), {
y: clamp(pitch.width / 2 + sideSign * 6.4, 12, pitch.width - 12),
}),
cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6, 68, 83), {
y: clamp(pitch.width / 2 - sideSign * 6.5, 14, pitch.width - 14),
}),
restLock: clampToPitch({
x: hubPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.78), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.bounceUnder;
}
function applySpaceTwoForwardFacingTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return {
labels: [],
protectedIds: new Set(),
};
}
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
hubPoint;
const hubSpace = getAttackingGameSpaceProfile(hubPoint, teamId);
const hubThreat = getPitchThreatProfile(hubPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, hubPoint, teamId, profile);
const targetDepth = getAttackingDepth(hubPoint, teamId);
const pressure = getOpponentPressureAtPoint(teamId, hubPoint, 11.5);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.firstTouchMode,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const forwardFacingCue =
principleText.includes("forward") ||
principleText.includes("space 2") ||
principleText.includes("spelyta") ||
principleText.includes("between-lines") ||
principleText.includes("line break") ||
actionSpace.forwardGain >= 4 ||
actionSpace.lineBreakCount >= 1;
const activeSpace =
hubSpace.key === "space2" ||
hubThreat.betweenLines >= 0.32 ||
hubThreat.centralPocket >= 0.24 ||
hubThreat.halfSpace >= 0.36;
const canAttackNextLine =
activeSpace &&
targetDepth >= 40 &&
targetDepth <= 80 &&
pressure <= 0.68 &&
forwardFacingCue;
if (!canAttackNextLine) {
return {
labels: [],
protectedIds: new Set(),
};
}
const labels = [];
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
state.ball.carrierPlayerId,
].filter(Boolean));
const protectedSpaceTwoIds = new Set();
const sideSign = getWideSideSign(hubPoint) || getWideSideSign(startPoint) || 1;
const isWideOrHalf = isWidePrincipleZone(hubPoint) || hubThreat.halfSpace >= 0.34;
const finalThirdEntry =
targetDepth >= 62 ||
hubThreat.centralPocket >= 0.34 ||
hubThreat.behindLine >= 0.22 ||
actionSpace.value >= 0.46;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const target = getSpaceTwoForwardFacingTarget(teamId, hubPoint, slot, sideSign, profile);
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, hubPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, hubPoint);
if (!setAutopilotPrincipleTarget(targets, player, target)) {
return null;
}
assignedIds.add(player.id);
protectedSpaceTwoIds.add(player.id);
labels.push(label);
return player;
};
assign("bounceUnder", ["pivot", "connector", "wideBack", "rest"], "Space 2: bounce support");
assign("nextLinePin", ["striker", "wideForward", "secondStriker"], "Space 2: pin next line");
assign("blindsideDiagonal", ["wideForward", "secondStriker", "striker"], "Space 2: blindside diagonal", -sideSign);
assign("insideWall", ["connector", "wideForward", "secondStriker", "pivot"], "Space 2: inside wall pass", isWideOrHalf ? sideSign : 0);
if (isWideOrHalf || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.62) {
assign("outsideWidth", ["wideBack", "wideForward"], "Space 2: outside lane", sideSign);
}
if (profile.switchBias >= 0.54 || pressure >= 0.48 || !isWideOrHalf) {
assign("weakSideWidth", ["wideForward", "wideBack"], "Space 2: weak-side release", -sideSign);
}
if (finalThirdEntry) {
assign("boxArrive", ["striker", "wideForward", "secondStriker"], "Space 2: attack box");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Space 2: cutback edge");
}
assign("restLock", ["pivot", "rest", "wideBack"], "Space 2: rest-defence lock");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedSpaceTwoIds,
};
}
function getSpaceTwoContinuationContext(teamId, ballPoint, actionMeta, profile = {}) {
if (!ballPoint || profile?.phaseKey === "setPiece" || actionMeta?.actionType === "shot") {
return null;
}
const hubPoint = clampToPitch(ballPoint ?? actionMeta?.target ?? state.ball.target, 2.5);
const startPoint =
actionMeta?.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
hubPoint;
const hubSpace = getAttackingGameSpaceProfile(hubPoint, teamId);
const hubThreat = getPitchThreatProfile(hubPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, hubPoint, teamId, profile);
const targetDepth = getAttackingDepth(hubPoint, teamId);
const pressure = getOpponentPressureAtPoint(teamId, hubPoint, 11.5);
const principleText = [
actionMeta?.offensiveAutopilot?.principleKey,
actionMeta?.offensiveAutopilot?.principleLabel,
actionMeta?.profileLabel,
actionMeta?.label,
actionMeta?.firstTouchMode,
...(actionMeta?.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const continuationCue =
principleText.includes("space 2") ||
principleText.includes("spelyta") ||
principleText.includes("between-lines") ||
principleText.includes("line break") ||
principleText.includes("third-man") ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.forwardGain >= 4 ||
actionSpace.gameSpaceGain >= 1;
const activeSpace =
hubSpace.key === "space2" ||
actionSpace.targetGameSpaceKey === "space2" ||
hubThreat.betweenLines >= 0.28 ||
hubThreat.centralPocket >= 0.22 ||
hubThreat.halfSpace >= 0.34;
if (!activeSpace || !continuationCue || targetDepth < 38 || targetDepth > 86 || pressure > 0.78) {
return null;
}
const sideSign = getWideSideSign(hubPoint) || getWideSideSign(startPoint) || 1;
const isWideOrHalf = isWidePrincipleZone(hubPoint) || hubThreat.halfSpace >= 0.34;
const finalThirdSurge =
targetDepth >= 64 ||
hubThreat.centralPocket >= 0.34 ||
hubThreat.behindLine >= 0.2 ||
actionSpace.value >= 0.5;
const mode = finalThirdSurge
? "finalThird"
: isWideOrHalf || profile.overlapBias >= 0.58 || profile.widthDiscipline >= 0.64
? "wide"
: "central";
return {
actionSpace,
hubPoint,
hubThreat,
mode,
pressure,
sideSign,
startPoint,
targetDepth,
};
}
function getSpaceTwoContinuationTarget(teamId, context, slot) {
const sign = getAttackDirectionSign(teamId);
const { actionSpace, hubPoint, mode, sideSign, targetDepth } = context;
const profile = getOffensiveAutopilotProfile(teamId, hubPoint, getOffensivePhaseKey(teamId, hubPoint));
const width = clamp(profile.width ?? 58, 44, 68);
const forwardBoost = clamp((actionSpace.forwardGain ?? 0) / 12, 0, 2.5);
const nearHalfY = clamp(pitch.width / 2 + sideSign * 12.5, 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const nearWideY = clamp(pitch.width / 2 + sideSign * width * 0.5, 3.2, pitch.width - 3.2);
const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.5, 3.2, pitch.width - 3.2);
const boxLaneY = clamp(pitch.width / 2 + sideSign * 5.4, 13, pitch.width - 13);
const farPostY = clamp(pitch.width / 2 - sideSign * 10.5, 10, pitch.width - 10);
const nextLineDepth = clamp(targetDepth + 10 + profile.directness * 5 + forwardBoost, 54, 97);
const supportDepth = clamp(targetDepth - 7.5 - profile.shortSupport * 5, 24, 72);
const points = {
secureBounce: getDepthPoint(teamId, supportDepth, {
y: clamp(lerp(hubPoint.y, pitch.width / 2 - sideSign * 5.5, 0.52), 9, pitch.width - 9),
}),
thirdManRelease: getDepthPoint(teamId, clamp(targetDepth + 4 + profile.shortSupport * 4, 44, 84), {
y: clamp(lerp(hubPoint.y, mode === "wide" ? nearHalfY : farHalfY, 0.56), 8, pitch.width - 8),
}),
runnerBeyond: getDepthPoint(teamId, nextLineDepth, {
y: clamp(lerp(hubPoint.y, mode === "central" ? boxLaneY : farHalfY, 0.64), 9, pitch.width - 9),
}),
outsideOverlap: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.overlapBias * 6, 48, 96), {
y: nearWideY,
}),
insideUnderlap: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.overlapBias * 4, 50, 92), {
y: clamp(lerp(hubPoint.y, nearHalfY, 0.72), 8, pitch.width - 8),
}),
weakSideArrive: getDepthPoint(teamId, clamp(targetDepth + 8 + profile.switchBias * 7, 50, 94), {
y: mode === "finalThird" ? farPostY : farWideY,
}),
boxPin: getDepthPoint(teamId, clamp(84 + profile.directness * 7, 78, 98), {
y: clamp(pitch.width / 2 - sideSign * 2.8, 14, pitch.width - 14),
}),
cutbackEdge: getDepthPoint(teamId, clamp(71 + profile.shortSupport * 8, 68, 84), {
y: clamp(pitch.width / 2 + sideSign * 9.5, 14, pitch.width - 14),
}),
restShield: clampToPitch({
x: hubPoint.x - sign * (22 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(hubPoint.y, pitch.width / 2, 0.8), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.thirdManRelease;
}
function applySpaceTwoContinuationTargets(teamId, targets, ballPoint, actionMeta, profile, protectedIds = new Set()) {
const context = getSpaceTwoContinuationContext(teamId, ballPoint, actionMeta, profile);
if (!context) {
return {
labels: [],
protectedIds: new Set(),
};
}
const assignedIds = new Set([
...protectedIds,
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.initiatorPlayerId,
state.ball.receiverPlayerId,
].filter(Boolean));
const labels = [];
const protectedContinuationIds = new Set();
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, assignedIds, preferredSide, context.hubPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, assignedIds, context.hubPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getSpaceTwoContinuationTarget(teamId, context, slot)
)) {
return null;
}
assignedIds.add(player.id);
protectedContinuationIds.add(player.id);
labels.push(label);
return player;
};
if (context.pressure >= 0.48 || profile.shortSupport >= 0.72) {
assign("secureBounce", ["pivot", "connector", "wideBack", "rest"], "Space 2 continuation: secure bounce");
}
assign("thirdManRelease", ["connector", "pivot", "wideForward", "secondStriker"], "Space 2 continuation: third-man release");
assign("runnerBeyond", ["striker", "wideForward", "secondStriker"], "Space 2 continuation: run beyond");
if (context.mode === "wide" || profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.62) {
assign("outsideOverlap", ["wideBack", "wideForward"], "Space 2 continuation: outside overlap", context.sideSign);
assign("insideUnderlap", ["connector", "wideBack", "wideForward"], "Space 2 continuation: inside underlap", context.sideSign);
}
if (context.mode !== "wide" || profile.switchBias >= 0.54 || context.pressure >= 0.44) {
assign("weakSideArrive", ["wideForward", "wideBack"], "Space 2 continuation: weak-side arrival", -context.sideSign);
}
if (context.mode === "finalThird") {
assign("boxPin", ["striker", "secondStriker", "wideForward"], "Space 2 continuation: box pin");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Space 2 continuation: cutback edge");
}
assign("restShield", ["pivot", "rest", "wideBack"], "Space 2 continuation: rest shield");
return {
labels: uniquePrincipleLabels(labels),
protectedIds: protectedContinuationIds,
};
}
function getDepthPoint(teamId, attackingDepth, overrides = {}) {
return clampToPitch({
x: getDepthX(teamId, attackingDepth),
y: pitch.width / 2,
...overrides,
}, 2);
}
function applyGenerativePrincipleSupportTargets(teamId, targets, ballPoint, actionMeta, profile) {
const labels = [];
const excludedIds = new Set([
actionMeta?.carrierPlayerId,
actionMeta?.receiverPlayerId,
actionMeta?.beforeSnapshot?.ball?.ownerPlayerId,
state.ball.carrierPlayerId,
state.ball.receiverPlayerId,
state.ball.initiatorPlayerId,
].filter(Boolean));
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null;
const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
const laneShift = Math.abs(getPitchLaneIndex(ballPoint) - getPitchLaneIndex(startPoint));
const targetDepth = getAttackingDepth(ballPoint, teamId);
const sideSign = getWideSideSign(ballPoint) || getWideSideSign(receiver) || 1;
if (
actionMeta?.actionType === "pass" &&
(receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack") &&
isWidePrincipleZone(ballPoint)
) {
const support = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "pivot"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, support, getSupportUnderBallTarget(teamId, ballPoint, sideSign, profile))) {
excludedIds.add(support.id);
labels.push("Underneath support");
}
labels.push("Ask question wide");
}
labels.push(...applyGoalkeeperBuildOutPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyShotReboundPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyCornerDeliveryPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyReceptionSupportPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyOpenGrassCarrySupportTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyGameSpaceOffBallPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyHighValueSpacePrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyTransitionAttackPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyBetweenLinesPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyFormationIdentityPrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyPossessionRoutePrincipleTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
labels.push(...applyOpponentBlockResponsiveTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
if (
actionMeta?.actionType === "pass" &&
(receiverRoleKey === "pivot" || receiverRoleKey === "connector" || receiverRoleKey === "secondStriker")
) {
const runner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "striker", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, runner, getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile))) {
excludedIds.add(runner.id);
labels.push("Third-player runner");
}
labels.push("Find the Third");
}
if (actionMeta?.actionType === "pass" && laneShift >= 2 && distance(startPoint, ballPoint) >= 16) {
const weakSideRunner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "wideBack"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, weakSideRunner, getThirdManRunnerTarget(teamId, ballPoint, sideSign, profile))) {
excludedIds.add(weakSideRunner.id);
}
labels.push("Change corridor");
}
if (
targetDepth >= 70 ||
actionMeta?.actionType === "shot" ||
(actionMeta?.actionType === "pass" && Math.abs(ballPoint.y - pitch.width / 2) <= 18 && targetDepth >= 64)
) {
labels.push(...applyBoxOccupationPrincipleTargets(teamId, targets, ballPoint, excludedIds));
labels.push("Attack box");
}
labels.push(...applyPositionalPlayOccupationTargets(
teamId,
targets,
ballPoint,
actionMeta,
profile,
excludedIds
));
return {
labels: uniquePrincipleLabels(labels),
protectedIds: new Set(excludedIds),
};
}
function getHighValueAttackTarget(teamId, ballPoint, slot, sideSign = 1) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const baseDepth = clamp(ballDepth + 8, 52, 86);
const halfSpaceY = pitch.width / 2 + sideSign * 13.5;
const oppositeHalfSpaceY = pitch.width / 2 - sideSign * 12.5;
const points = {
goldenRun: getDepthPoint(teamId, clamp(baseDepth + 8, 62, 91), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.68), 14, pitch.width - 14),
}),
halfSpaceRun: getDepthPoint(teamId, clamp(baseDepth + 6, 60, 88), {
y: clamp(lerp(ballPoint.y, halfSpaceY, 0.5), 8, pitch.width - 8),
}),
supportPocket: getDepthPoint(teamId, clamp(ballDepth + 1.5, 42, 72), {
y: clamp(lerp(ballPoint.y, oppositeHalfSpaceY, 0.34), 9, pitch.width - 9),
}),
reboundEdge: getDepthPoint(teamId, 74, {
y: clamp(pitch.width / 2 - sideSign * 5.5, 17, pitch.width - 17),
}),
pinLine: clampToPitch({
x: ballPoint.x + sign * 12,
y: clamp(pitch.width / 2 + sideSign * 5.5, 14, pitch.width - 14),
}, 2),
};
return points[slot] ?? points.goldenRun;
}
function applyHighValueSpacePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const labels = [];
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const targetDepth = getAttackingDepth(ballPoint, teamId);
const ballSide = getWideSideSign(ballPoint) || 1;
const shouldAttackHighValueSpace =
targetDepth >= 46 &&
(targetThreat.value >= 0.44 ||
targetThreat.centralPocket >= 0.32 ||
targetThreat.betweenLines >= 0.42 ||
targetThreat.assistZone >= 0.42 ||
actionMeta?.actionType === "dribble");
if (!shouldAttackHighValueSpace) {
return labels;
}
const plannedRunner = getPlayerById(actionMeta?.principleRunnerPlayerId);
if (
plannedRunner?.team === teamId &&
targets.has(plannedRunner.id) &&
!excludedIds.has(plannedRunner.id) &&
setAutopilotPrincipleTarget(targets, plannedRunner, clampToPitch(ballPoint, 2.5))
) {
excludedIds.add(plannedRunner.id);
labels.push("Runner attacks space");
}
const runner = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "wideForward", "secondStriker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(
targets,
runner,
getHighValueAttackTarget(
teamId,
ballPoint,
targetThreat.assistZone >= 0.5 ? "halfSpaceRun" : "goldenRun",
ballSide
)
)) {
excludedIds.add(runner.id);
labels.push(`Attack ${targetThreat.primaryLabel}`);
}
const connector = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "pivot"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(
targets,
connector,
getHighValueAttackTarget(teamId, ballPoint, "supportPocket", -ballSide)
)) {
excludedIds.add(connector.id);
labels.push("Support the next action");
}
if (targetThreat.box >= 0.34 || targetDepth >= 70) {
const edge = getMovableAutopilotPlayerByRoles(
teamId,
["connector", "pivot", "wideForward"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, edge, getHighValueAttackTarget(teamId, ballPoint, "reboundEdge", ballSide))) {
excludedIds.add(edge.id);
labels.push("Edge-of-box security");
}
}
return labels;
}
function getFormationIdentityTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const points = {
wideOverlap: getDepthPoint(teamId, clamp(ballDepth + 9 + profile.overlapBias * 4, 48, 94), {
y: clamp(ballPoint.y + sideSign * (5.5 + profile.widthDiscipline * 2.4), 3.2, pitch.width - 3.2),
}),
halfSpaceSupport: getDepthPoint(teamId, clamp(ballDepth - 1 + profile.shortSupport * 5, 42, 78), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 12.5, 0.55), 8, pitch.width - 8),
}),
underSupport: getDepthPoint(teamId, clamp(ballDepth - 9, 24, 72), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 8, 0.44), 8, pitch.width - 8),
}),
pinCentreBacks: getDepthPoint(teamId, clamp(ballDepth + 12, 58, 97), {
y: clamp(pitch.width / 2 - sideSign * 3.6, 15, pitch.width - 15),
}),
farSideAttack: getDepthPoint(teamId, clamp(ballDepth + 11, 56, 95), {
y: clamp(pitch.width / 2 - sideSign * 18.5, 5, pitch.width - 5),
}),
weakSideWidth: getDepthPoint(teamId, clamp(ballDepth + 3, 38, 82), {
y: clamp(pitch.width / 2 - sideSign * 28.5, 3.6, pitch.width - 3.6),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (21 + profile.restBehind * 0.16),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.7), 15, pitch.width - 15),
}, 3),
secondStrikerLink: getDepthPoint(teamId, clamp(ballDepth + 5, 44, 84), {
y: clamp(pitch.width / 2 + sideSign * 7.5, 14, pitch.width - 14),
}),
secondBallRing: getDepthPoint(teamId, clamp(ballDepth + 2, 42, 76), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.52), 12, pitch.width - 12),
}),
};
return points[slot] ?? points.halfSpaceSupport;
}
function applyFormationIdentityPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const labels = [];
const formation = profile.formation ?? teams[teamId]?.formation ?? "4-3-3";
const receiver = getPlayerById(actionMeta?.receiverPlayerId);
const receiverRoleKey = receiver ? getOffensiveRoleKey(receiver, formation) : null;
const ballSide = getWideSideSign(ballPoint) || getWideSideSign(receiver) || 1;
const targetDepth = getAttackingDepth(ballPoint, teamId);
const isWideEntry =
isWidePrincipleZone(ballPoint) &&
targetDepth >= 38 &&
(receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack" || actionMeta?.actionType === "dribble");
const isCentralProgression =
Math.abs(ballPoint.y - pitch.width / 2) <= 18 &&
targetDepth >= 38 &&
targetDepth <= 76;
if (formation === "4-3-3" && isWideEntry) {
const overlap = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideBack"], targets, excludedIds, ballSide, ballPoint);
if (setAutopilotPrincipleTarget(targets, overlap, getFormationIdentityTarget(teamId, ballPoint, "wideOverlap", ballSide, profile))) {
excludedIds.add(overlap.id);
labels.push("4-3-3 overlap");
}
const halfSpace = getMovableAutopilotPlayerByRoles(teamId, ["connector"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, halfSpace, getFormationIdentityTarget(teamId, ballPoint, "halfSpaceSupport", ballSide, profile))) {
excludedIds.add(halfSpace.id);
labels.push("8/10 half-space support");
}
const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, striker, getFormationIdentityTarget(teamId, ballPoint, "pinCentreBacks", ballSide, profile))) {
excludedIds.add(striker.id);
labels.push("9 pins the line");
}
const farWinger = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward"], targets, excludedIds, -ballSide, ballPoint);
if (setAutopilotPrincipleTarget(targets, farWinger, getFormationIdentityTarget(teamId, ballPoint, "farSideAttack", ballSide, profile))) {
excludedIds.add(farWinger.id);
labels.push("Far-side W attacks");
}
}
if (formation === "3-4-3" && isWideEntry) {
const insideForward = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward"], targets, excludedIds, ballSide, ballPoint);
if (setAutopilotPrincipleTarget(targets, insideForward, getFormationIdentityTarget(teamId, ballPoint, "halfSpaceSupport", ballSide, profile))) {
excludedIds.add(insideForward.id);
labels.push("3-4-3 inside forward pocket");
}
const oppositeWingBack = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideBack"], targets, excludedIds, -ballSide, ballPoint);
if (setAutopilotPrincipleTarget(targets, oppositeWingBack, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", ballSide, profile))) {
excludedIds.add(oppositeWingBack.id);
labels.push("Weak-side WB holds width");
}
const striker = getMovableAutopilotPlayerByRoles(teamId, ["striker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, striker, getFormationIdentityTarget(teamId, ballPoint, "pinCentreBacks", ballSide, profile))) {
excludedIds.add(striker.id);
labels.push("Front three pinning");
}
}
if ((formation === "4-4-2" || formation === "3-5-2") && targetDepth >= 42) {
const secondStriker = getMovableAutopilotPlayerByRoles(teamId, ["secondStriker", "striker"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, secondStriker, getFormationIdentityTarget(teamId, ballPoint, "secondStrikerLink", ballSide, profile))) {
excludedIds.add(secondStriker.id);
labels.push("Front-two link");
}
const secondBall = getMovableAutopilotPlayerByRoles(teamId, ["connector", "pivot"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, secondBall, getFormationIdentityTarget(teamId, ballPoint, "secondBallRing", ballSide, profile))) {
excludedIds.add(secondBall.id);
labels.push("Second-ball ring");
}
}
if (isCentralProgression) {
const weakSide = getMovableAutopilotPlayerByRolesOnSide(teamId, ["wideForward", "wideBack"], targets, excludedIds, -ballSide, ballPoint);
if (setAutopilotPrincipleTarget(targets, weakSide, getFormationIdentityTarget(teamId, ballPoint, "weakSideWidth", ballSide, profile))) {
excludedIds.add(weakSide.id);
labels.push("Weak-side outlet");
}
const restLock = getMovableAutopilotPlayerByRoles(teamId, ["pivot", "rest"], targets, excludedIds, ballPoint);
if (setAutopilotPrincipleTarget(targets, restLock, getFormationIdentityTarget(teamId, ballPoint, "restLock", ballSide, profile))) {
excludedIds.add(restLock.id);
labels.push("Rest-defence lock");
}
}
return labels;
}
function getPossessionRouteOccupationTarget(teamId, ballPoint, slot, context, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const routeY = getLaneCenterY(context.routeTargetLane ?? getPitchLaneKey(ballPoint), profile);
const nextY = getLaneCenterY(context.nextRouteLane ?? context.routeTargetLane ?? getPitchLaneKey(ballPoint), profile);
const routeSide =
Math.sign(routeY - pitch.width / 2) ||
getWideSideSign(ballPoint) ||
1;
const nextSide =
Math.sign(nextY - pitch.width / 2) ||
-routeSide;
const points = {
routeLaneWidth: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.widthDiscipline * 5, 34, 90), {
y: clamp(routeY, 3.4, pitch.width - 3.4),
}),
routeHalfConnection: getDepthPoint(teamId, clamp(ballDepth + 1 + profile.shortSupport * 5, 34, 82), {
y: clamp(lerp(routeY, pitch.width / 2 + routeSide * 12.5, 0.48), 7, pitch.width - 7),
}),
centralLink: getDepthPoint(teamId, clamp(ballDepth - 3 + profile.shortSupport * 4, 28, 76), {
y: clamp(lerp(routeY, pitch.width / 2, 0.72), 10, pitch.width - 10),
}),
underLink: getDepthPoint(teamId, clamp(ballDepth - 10 - profile.supportCompactness * 5, 18, 72), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - routeSide * 5.2, 0.42), 10, pitch.width - 10),
}),
nextLaneRun: getDepthPoint(teamId, clamp(ballDepth + 10 + profile.progressionUrgency * 6, 46, 96), {
y: clamp(nextY, 5.5, pitch.width - 5.5),
}),
switchRelease: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 8, 38, 88), {
y: clamp(nextY || pitch.width / 2 - routeSide * 25, 3.5, pitch.width - 3.5),
}),
depthPin: getDepthPoint(teamId, clamp(ballDepth + 13 + profile.directness * 5, 54, 98), {
y: clamp(lerp(routeY, pitch.width / 2, 0.58), 12, pitch.width - 12),
}),
farSideHold: getDepthPoint(teamId, clamp(ballDepth + 1.5 + profile.switchBias * 5, 34, 86), {
y: clamp(pitch.width / 2 - nextSide * 27, 3.5, pitch.width - 3.5),
}),
restBalance: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.centralLink;
}
function applyPossessionRoutePrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
const startPoint = actionMeta?.beforeSnapshot?.ball?.position ?? state.ball.startPosition ?? state.ball.position;
if (!startPoint || !ballPoint || profile.phaseKey === "setPiece") {
return [];
}
const plan = getAutoPilotPossessionPlan(teamId, startPoint, profile);
const rhythm = getPossessionRhythmContext(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const routeStage = getAutoPilotPossessionRouteStage(plan, rhythm, depth);
const routeTargetLane =
plan.routeLanes?.[routeStage] ??
plan.routeLanes?.[0] ??
getPitchLaneKey(ballPoint);
const nextRouteLane =
plan.routeLanes?.[Math.min(routeStage + 1, (plan.routeLanes?.length ?? 1) - 1)] ??
routeTargetLane;
const routeIntent =
plan.routeIntents?.[Math.min(routeStage, (plan.routeIntents?.length ?? 1) - 1)] ??
"progress";
const laneDistance = Math.abs(getPitchLaneIndex(routeTargetLane) - getPitchLaneIndex(nextRouteLane));
const routeSide =
Math.sign(getLaneCenterY(routeTargetLane, profile) - pitch.width / 2) ||
getWideSideSign(ballPoint) ||
1;
const targetIsWide = routeTargetLane === "leftWide" || routeTargetLane === "rightWide";
const targetIsHalf = routeTargetLane === "leftHalf" || routeTargetLane === "rightHalf";
const targetIsCentral = routeTargetLane === "central";
const context = {
plan,
routeStage,
routeTargetLane,
nextRouteLane,
routeIntent,
};
const labels = [];
const localExcluded = new Set(excludedIds);
const assign = (slot, roleKeys, label, sideSign = 0) => {
const player = sideSign
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, sideSign, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(targets, player, getPossessionRouteOccupationTarget(teamId, ballPoint, slot, context, profile))) {
return null;
}
localExcluded.add(player.id);
excludedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
if (targetIsWide) {
assign("routeLaneWidth", ["wideBack", "wideForward"], "Route width", routeSide);
assign("routeHalfConnection", ["connector", "wideForward"], "Half-space link", routeSide);
if (profile.overlapBias >= 0.52 || plan.routeKey === "overlap-cutback") {
assign("nextLaneRun", ["wideBack", "wideForward"], "Route overlap", routeSide);
}
} else if (targetIsHalf) {
assign("routeHalfConnection", ["connector", "wideForward", "secondStriker"], "Route half-space", routeSide);
assign("routeLaneWidth", ["wideBack", "wideForward"], "Hold route width", routeSide);
assign("depthPin", ["striker", "wideForward", "secondStriker"], "Pin for route");
} else if (targetIsCentral) {
assign("centralLink", ["pivot", "connector", "secondStriker"], "Central route link");
assign("depthPin", ["striker", "wideForward", "secondStriker"], "Central depth threat");
assign("farSideHold", ["wideForward", "wideBack"], "Far-side route outlet", -routeSide);
}
if (routeIntent === "switch" || laneDistance >= 2 || plan.routeKey === "wide-overload-switch" || plan.routeKey === "patient-switch") {
const nextSide = Math.sign(getLaneCenterY(nextRouteLane, profile) - pitch.width / 2) || -routeSide;
assign("switchRelease", ["wideForward", "wideBack"], "Route switch release", nextSide);
}
if (routeIntent === "accelerate" || routeIntent === "finish") {
assign("nextLaneRun", ["striker", "wideForward", "secondStriker"], "Route acceleration");
}
assign("underLink", ["pivot", "connector", "wideBack"], "Route support under");
assign("restBalance", ["pivot", "rest"], "Route rest-defence");
if (labels.length) {
labels.unshift(plan.routeLabel ?? "Possession route");
}
return uniquePrincipleLabels(labels);
}
function getPositionalPlayOccupationTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const width = clamp(profile.width ?? 58, 42, 66);
const farWideY = clamp(pitch.width / 2 - sideSign * width * 0.48, 3.8, pitch.width - 3.8);
const nearHalfY = clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 13.5, 0.46), 8, pitch.width - 8);
const farHalfY = clamp(lerp(pitch.width / 2 - sideSign * 13.5, ballPoint.y, 0.16), 8, pitch.width - 8);
const points = {
underSupport: getDepthPoint(teamId, clamp(ballDepth - 8.5 - profile.shortSupport * 4, 20, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.34), 11, pitch.width - 11),
}),
nearHalfSupport: getDepthPoint(teamId, clamp(ballDepth + 2.5 + profile.shortSupport * 4, 38, 82), {
y: nearHalfY,
}),
farHalfConnection: getDepthPoint(teamId, clamp(ballDepth + 3.5, 38, 84), {
y: farHalfY,
}),
weakSideWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.switchBias * 5, 36, 86), {
y: farWideY,
}),
depthPin: getDepthPoint(teamId, clamp(ballDepth + 12 + profile.directness * 4, 52, 98), {
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.58), 14, pitch.width - 14),
}),
diagonalRunner: getDepthPoint(teamId, clamp(ballDepth + 11 + profile.runnerBoost * 0.6, 48, 96), {
y: clamp(pitch.width / 2 - sideSign * 10.5, 9, pitch.width - 9),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (18 + profile.restBehind * 0.22),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 15, pitch.width - 15),
}, 3),
farRestCover: clampToPitch({
x: ballPoint.x - sign * (22 + profile.restBehind * 0.18),
y: clamp(pitch.width / 2 - sideSign * 10.5, 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.underSupport;
}
function applyPositionalPlayOccupationTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
if (profile.phaseKey === "setPiece") {
return [];
}
const labels = [];
const ballDepth = getAttackingDepth(ballPoint, teamId);
const sideSign = getWideSideSign(ballPoint) || 1;
const targetSpace = getPitchSpaceProfile(ballPoint, teamId);
const actionType = actionMeta?.actionType ?? state.ball.actionType;
const isWideAction = targetSpace.wideCorridor >= 0.34 || targetSpace.assistZone >= 0.34 || isWidePrincipleZone(ballPoint);
const isProgression = ballDepth >= 36;
const isFinalThird = ballDepth >= 66 || targetSpace.box >= 0.24 || targetSpace.cutbackZone >= 0.28;
const underSupport = getMovableAutopilotPlayerByRoles(
teamId,
["pivot", "connector"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, underSupport, getPositionalPlayOccupationTarget(teamId, ballPoint, "underSupport", sideSign, profile))) {
excludedIds.add(underSupport.id);
labels.push("Under-ball support");
}
if (isWideAction || isProgression) {
const weakSideWidth = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["wideForward", "wideBack"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, weakSideWidth, getPositionalPlayOccupationTarget(teamId, ballPoint, "weakSideWidth", sideSign, profile))) {
excludedIds.add(weakSideWidth.id);
labels.push("Weak-side width");
}
}
if (isProgression) {
const halfSpaceSupport = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["connector", "wideForward", "secondStriker"],
targets,
excludedIds,
sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, halfSpaceSupport, getPositionalPlayOccupationTarget(teamId, ballPoint, "nearHalfSupport", sideSign, profile))) {
excludedIds.add(halfSpaceSupport.id);
labels.push("Half-space support");
}
}
if (isProgression && !isFinalThird) {
const depthPin = getMovableAutopilotPlayerByRoles(
teamId,
["striker", "secondStriker", "wideForward"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, depthPin, getPositionalPlayOccupationTarget(teamId, ballPoint, "depthPin", sideSign, profile))) {
excludedIds.add(depthPin.id);
labels.push("Pin last line");
}
}
if (isFinalThird) {
const diagonalRunner = getMovableAutopilotPlayerByRoles(
teamId,
["wideForward", "secondStriker", "striker"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, diagonalRunner, getPositionalPlayOccupationTarget(teamId, ballPoint, "diagonalRunner", sideSign, profile))) {
excludedIds.add(diagonalRunner.id);
labels.push("Diagonal box threat");
}
const farHalfConnection = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["connector", "wideForward"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farHalfConnection, getPositionalPlayOccupationTarget(teamId, ballPoint, "farHalfConnection", sideSign, profile))) {
excludedIds.add(farHalfConnection.id);
labels.push("Far-half connection");
}
}
const restLock = getMovableAutopilotPlayerByRoles(
teamId,
["rest", "pivot"],
targets,
excludedIds,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, restLock, getPositionalPlayOccupationTarget(teamId, ballPoint, "restLock", sideSign, profile))) {
excludedIds.add(restLock.id);
labels.push("Rest-defence lock");
}
if ((actionType === "pass" || actionType === "dribble") && ballDepth >= 48) {
const farRestCover = getMovableAutopilotPlayerByRolesOnSide(
teamId,
["rest", "pivot", "wideBack"],
targets,
excludedIds,
-sideSign,
ballPoint
);
if (setAutopilotPrincipleTarget(targets, farRestCover, getPositionalPlayOccupationTarget(teamId, ballPoint, "farRestCover", sideSign, profile))) {
excludedIds.add(farRestCover.id);
labels.push("Far rest cover");
}
}
return labels;
}
function getOpponentBlockOccupationTarget(teamId, ballPoint, slot, block, sideSign = 1, profile = {}) {
const sign = getAttackDirectionSign(teamId);
const ballDepth = getAttackingDepth(ballPoint, teamId);
const lineDepths = block?.lineDepths ?? getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
const width = clamp(profile.width ?? 58, 42, 66);
const wideOffset = clamp(width * 0.49, 25.5, 31.5);
const halfOffset = clamp(width * 0.24, 12, 17);
const strongWideY = clamp(pitch.width / 2 + sideSign * wideOffset, 3.4, pitch.width - 3.4);
const weakWideY = clamp(pitch.width / 2 - sideSign * wideOffset, 3.4, pitch.width - 3.4);
const strongHalfY = clamp(pitch.width / 2 + sideSign * halfOffset, 8, pitch.width - 8);
const weakHalfY = clamp(pitch.width / 2 - sideSign * halfOffset, 8, pitch.width - 8);
const betweenLinesDepth = clamp(
(lineDepths.midfield + lineDepths.back) / 2,
Math.max(38, ballDepth + 2),
84
);
const highLineRunDepth = clamp((lineDepths.back ?? ballDepth + 18) + 8 + (profile.runnerBoost ?? 7) * 0.25, 56, 98);
const points = {
strongWidth: getDepthPoint(teamId, clamp(ballDepth + 2 + profile.widthDiscipline * 5, 34, 90), {
y: strongWideY,
}),
weakWidth: getDepthPoint(teamId, clamp(ballDepth + 4 + profile.switchBias * 7, 36, 88), {
y: weakWideY,
}),
switchRelease: getDepthPoint(teamId, clamp(ballDepth + 7 + profile.switchBias * 8, 42, 92), {
y: weakWideY,
}),
betweenLinesPocket: getDepthPoint(teamId, betweenLinesDepth, {
y: strongHalfY,
}),
farBetweenLinesPocket: getDepthPoint(teamId, clamp(betweenLinesDepth + 1.6, 42, 84), {
y: weakHalfY,
}),
bounceUnder: getDepthPoint(teamId, clamp(ballDepth - 9 - profile.shortSupport * 4, 18, 74), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.5, 0.45), 10, pitch.width - 10),
}),
highLineRun: getDepthPoint(teamId, highLineRunDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 7, 0.46), 10, pitch.width - 10),
}),
boxPin: getDepthPoint(teamId, clamp(85 + profile.directness * 7, 82, 98), {
y: clamp(pitch.width / 2 + sideSign * 5.2, 13, pitch.width - 13),
}),
cutbackEdge: getDepthPoint(teamId, clamp(72 + profile.shortSupport * 6, 70, 82), {
y: clamp(pitch.width / 2 - sideSign * 6.4, 15, pitch.width - 15),
}),
farPost: getDepthPoint(teamId, clamp(87, 84, 96), {
y: clamp(pitch.width / 2 - sideSign * 11.8, 12, pitch.width - 12),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (20 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
}, 3),
};
return points[slot] ?? points.bounceUnder;
}
function applyOpponentBlockResponsiveTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
if (profile.phaseKey === "setPiece" || !ballPoint) {
return [];
}
const block = getOpponentBlockReadProfile(teamId, ballPoint);
const labels = [];
const localExcluded = new Set(excludedIds);
const sideSign = getWideSideSign(ballPoint) || block.ballSide || 1;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getOpponentBlockOccupationTarget(teamId, ballPoint, slot, block, sideSign, profile)
)) {
return null;
}
localExcluded.add(player.id);
excludedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
if (block.compactCenter >= 0.52) {
assign("strongWidth", ["wideBack", "wideForward"], "Block read: stretch compact centre", sideSign);
assign("weakWidth", ["wideForward", "wideBack"], "Block read: hold far width", -sideSign);
if (block.lineGap >= 0.3 || profile.shortSupport >= 0.6) {
assign("betweenLinesPocket", ["connector", "wideForward", "secondStriker"], "Block read: pocket outside compact block", sideSign);
}
}
if (block.ballSideCompression >= 0.46) {
assign("switchRelease", ["wideForward", "wideBack"], "Block read: weak-side release", -sideSign);
assign("bounceUnder", ["pivot", "connector", "wideBack"], "Block read: bounce to switch");
}
if (block.lineGap >= 0.42) {
assign("betweenLinesPocket", ["connector", "secondStriker", "wideForward"], "Block read: occupy line gap", sideSign);
assign("farBetweenLinesPocket", ["connector", "wideForward"], "Block read: far pocket", -sideSign);
}
if (block.highLine >= 0.38) {
assign("highLineRun", ["striker", "wideForward", "secondStriker"], "Block read: threaten high line");
assign("bounceUnder", ["pivot", "connector"], "Block read: set the through ball");
}
if (block.deepBlock >= 0.38) {
assign("strongWidth", ["wideBack", "wideForward"], "Block read: stretch low block", sideSign);
assign("boxPin", ["striker", "secondStriker", "wideForward"], "Block read: pin box line");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Block read: cutback edge");
assign("farPost", ["wideForward", "striker", "secondStriker"], "Block read: far-post occupation", -sideSign);
}
if (block.nearBallPressure >= 0.5 && block.ballSideCompression < 0.46) {
assign("bounceUnder", ["pivot", "connector", "wideBack"], "Block read: secure pressure escape");
}
assign("restLock", ["pivot", "rest"], "Block read: rest-defence balance");
return uniquePrincipleLabels(labels);
}
function getGameSpaceOffBallTarget(teamId, ballPoint, slot, sideSign = 1, profile = {}, gameSpace = null) {
const sign = getAttackDirectionSign(teamId);
const depth = getAttackingDepth(ballPoint, teamId);
const lineDepths = gameSpace?.lineDepths ?? getAttackingGameSpaceProfile(ballPoint, teamId).lineDepths;
const nextLine = gameSpace?.nextLineDepth ?? lineDepths.midfield;
const backLine = lineDepths.back ?? clamp(depth + 20, 52, 84);
const spaceTwoDepth = clamp((lineDepths.midfield + lineDepths.back) / 2, 42, 82);
const runnerBoost = profile.runnerBoost ?? 6;
const width = profile.width ?? 58;
const spaceThreeDepth = clamp(backLine + 7.5 + runnerBoost * 0.35, 56, 98);
const nearHalfY = clamp(lerp(ballPoint.y, pitch.width / 2 + sideSign * 12.5, 0.5), 8, pitch.width - 8);
const farHalfY = clamp(pitch.width / 2 - sideSign * 12.5, 8, pitch.width - 8);
const farWideY = clamp(pitch.width / 2 - sideSign * clamp(width * 0.48, 24, 31), 3.5, pitch.width - 3.5);
const points = {
outletUnder: getDepthPoint(teamId, clamp(depth - 9 - profile.shortSupport * 5, 16, 68), {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 4.8, 0.42), 10, pitch.width - 10),
}),
spaceOneLink: getDepthPoint(teamId, clamp(Math.max(depth + 4, lineDepths.forward + 3), 24, 58), {
y: clamp(lerp(ballPoint.y, nearHalfY, 0.5), 8, pitch.width - 8),
}),
spaceTwoPocket: getDepthPoint(teamId, clamp(spaceTwoDepth, Math.max(38, depth + 2), 84), {
y: nearHalfY,
}),
farSpaceTwoPocket: getDepthPoint(teamId, clamp(spaceTwoDepth + profile.switchBias * 2.2, 42, 84), {
y: farHalfY,
}),
spaceThreeRun: getDepthPoint(teamId, spaceThreeDepth, {
y: clamp(lerp(ballPoint.y, pitch.width / 2 - sideSign * 7.5, 0.45), 10, pitch.width - 10),
}),
wideStretch: getDepthPoint(teamId, clamp(Math.max(depth + 2, nextLine - 2), 34, 90), {
y: clamp(pitch.width / 2 + sideSign * clamp(width * 0.48, 24, 31), 3.5, pitch.width - 3.5),
}),
weakSideHold: getDepthPoint(teamId, clamp(depth + 3 + profile.switchBias * 5, 34, 88), {
y: farWideY,
}),
boxArrive: getDepthPoint(teamId, clamp(87 + profile.directness * 6, 84, 98), {
y: clamp(pitch.width / 2 + sideSign * 7.5, 13, pitch.width - 13),
}),
cutbackEdge: getDepthPoint(teamId, clamp(73 + profile.shortSupport * 5, 70, 82), {
y: clamp(pitch.width / 2 - sideSign * 6.2, 15, pitch.width - 15),
}),
restLock: clampToPitch({
x: ballPoint.x - sign * (19 + (profile.restBehind ?? 22) * 0.18),
y: clamp(lerp(ballPoint.y, pitch.width / 2, 0.76), 14, pitch.width - 14),
}, 3),
farRestCover: clampToPitch({
x: ballPoint.x - sign * (24 + (profile.restBehind ?? 22) * 0.16),
y: clamp(pitch.width / 2 - sideSign * 10.5, 12, pitch.width - 12),
}, 3),
};
return points[slot] ?? points.outletUnder;
}
function applyGameSpaceOffBallPrincipleTargets(teamId, targets, ballPoint, actionMeta, profile, excludedIds) {
if (profile.phaseKey === "setPiece" || !ballPoint) {
return [];
}
const labels = [];
const localExcluded = new Set(excludedIds);
const gameSpace = getAttackingGameSpaceProfile(ballPoint, teamId);
const targetThreat = getPitchThreatProfile(ballPoint, teamId);
const sideSign = getWideSideSign(ballPoint) || 1;
const directStyle = profile.directness >= 0.62 || isTransitionAttackStyle(profile.styleKey);
const combinationStyle = profile.shortSupport >= 0.62 || profile.tempo >= 0.62;
const wideStyle = profile.crossBias >= 0.58 || profile.overlapBias >= 0.58 || profile.widthDiscipline >= 0.66;
const assign = (slot, roleKeys, label, preferredSide = 0) => {
const player = preferredSide
? getMovableAutopilotPlayerByRolesOnSide(teamId, roleKeys, targets, localExcluded, preferredSide, ballPoint)
: getMovableAutopilotPlayerByRoles(teamId, roleKeys, targets, localExcluded, ballPoint);
if (!setAutopilotPrincipleTarget(
targets,
player,
getGameSpaceOffBallTarget(teamId, ballPoint, slot, sideSign, profile, gameSpace)
)) {
return null;
}
localExcluded.add(player.id);
excludedIds.add(player.id);
if (label) {
labels.push(label);
}
return player;
};
if (gameSpace.key === "outlet" || gameSpace.key === "space1") {
assign("outletUnder", ["pivot", "connector", "wideBack"], "Spelyta: secure support");
assign("spaceOneLink", ["connector", "pivot"], "Spelyta: link behind first line");
if (combinationStyle) {
assign("spaceTwoPocket", ["connector", "wideForward", "secondStriker"], "Spelyta: prepare space 2");
}
if (wideStyle) {
assign("wideStretch", ["wideForward", "wideBack"], "Spelyta: hold width", sideSign);
assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: weak-side width", -sideSign);
}
if (directStyle || profile.lineBreakBias >= 0.58) {
assign("spaceThreeRun", ["striker", "wideForward", "secondStriker"], "Spelyta: threaten space 3");
}
}
if (gameSpace.key === "space2") {
assign("outletUnder", ["pivot", "connector", "wideBack"], "Spelyta: bounce support");
assign("farSpaceTwoPocket", ["connector", "wideForward", "secondStriker"], "Spelyta: far pocket");
assign("spaceThreeRun", ["striker", "wideForward", "secondStriker"], "Spelyta: run beyond");
if (wideStyle || isWidePrincipleZone(ballPoint)) {
assign("wideStretch", ["wideForward", "wideBack"], "Spelyta: outside option", sideSign);
assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: switch outlet", -sideSign);
}
}
if (gameSpace.key === "space3" || targetThreat.box >= 0.28 || targetThreat.cutbackZone >= 0.28) {
assign("boxArrive", ["striker", "secondStriker", "wideForward"], "Spelyta: attack box");
assign("cutbackEdge", ["connector", "pivot", "wideForward"], "Spelyta: cutback edge");
assign("weakSideHold", ["wideForward", "wideBack"], "Spelyta: far-post width", -sideSign);
}
assign("restLock", ["pivot", "rest"], "Spelyta: rest-defence lock");
if (getAttackingDepth(ballPoint, teamId) >= 46 || actionMeta?.actionType === "dribble") {
assign("farRestCover", ["rest", "pivot", "wideBack"], "Spelyta: far rest cover", -sideSign);
}
return uniquePrincipleLabels(labels);
}

  return {
    getSameSideWideBacks,
    chooseWideOverlapRunner,
    getWideEntryPrincipleContext,
    getOffensiveActionPrinciple,
    getPlayerRoleModel,
    getOffensiveLaneY,
    shouldSkipOffensiveAutopilotPlayer,
    getOffensiveAutopilotTarget,
    chooseOffensiveAutopilotRunner,
    enforceOffensiveTargetSpacing,
    getOffensiveOnsideLineContext,
    enforceOffensiveOnsideLineAwareness,
    enforceOffensiveOccupationZones,
    getOffensiveStructureBalanceTarget,
    getStructureBalanceCandidates,
    enforceOffensiveStructureBalance,
    getFiveLaneOccupationSlotTarget,
    getFiveLaneOccupationCandidates,
    enforceOffensiveFiveLaneOccupation,
    getAutopilotTargetVariationRadius,
    applyAutopilotTargetVariation,
    getMovableAutopilotPlayerByRoles,
    getMovableAutopilotPlayerByRolesOnSide,
    setAutopilotPrincipleTarget,
    getSupportUnderBallTarget,
    getThirdManRunnerTarget,
    getBoxOccupationTarget,
    getShotReboundGeometryContext,
    getShotReboundTarget,
    applyShotReboundPrincipleTargets,
    getSecondBallAnticipationContext,
    getOffensiveSecondBallAnticipationTarget,
    applyOffensiveSecondBallAnticipationTargets,
    applyCornerDeliveryPrincipleTargets,
    getGoalkeeperBuildOutSupportTarget,
    applyGoalkeeperBuildOutPrincipleTargets,
    applyBoxOccupationPrincipleTargets,
    getTimedBoxArrivalContext,
    getTimedBoxArrivalTarget,
    chooseTimedBoxArrivalPlayer,
    applyTimedFinalThirdBoxArrivals,
    getAttackingBoxOccupationChainContext,
    getAttackingBoxOccupationChainTarget,
    applyAttackingBoxOccupationChainTargets,
    getTransitionAttackTarget,
    applyTransitionAttackPrincipleTargets,
    applyBetweenLinesPrincipleTargets,
    getReceptionSupportTarget,
    applyReceptionSupportPrincipleTargets,
    getOpenGrassCarrySupportTarget,
    applyOpenGrassCarrySupportTargets,
    getBallNearSupportTriangleTarget,
    applyBallNearSupportTriangleTargets,
    getTargetLocalSuperiorityProfile,
    getLocalSuperioritySupportTarget,
    applyLocalSuperioritySupportTargets,
    getOffensivePassingGeometryContext,
    getOffensivePassingGeometryTarget,
    applyOffensivePassingGeometryTargets,
    getLooseBallRecoverySupportTarget,
    applyLooseBallRecoverySupportTargets,
    getPostRecoveryAttackSupportContext,
    getPostRecoveryAttackSupportTarget,
    applyPostRecoveryAttackSupportTargets,
    getOffensiveRestDefenceNetContext,
    getOffensiveRestDefenceNetTarget,
    applyOffensiveRestDefenceNetTargets,
    getPressResistanceEscapeTarget,
    applyPressResistanceEscapeSupportTargets,
    getPressEscapeContinuationTarget,
    applyPressEscapeContinuationTargets,
    getSwitchLandingAttackContext,
    getSwitchLandingAttackTarget,
    applySwitchLandingAttackTargets,
    getBlindsideChannelRunContext,
    getBlindsideChannelRunTarget,
    chooseBlindsideChannelRunner,
    applyBlindsideChannelRunTargets,
    getPasserContinuationTarget,
    applyPasserContinuationTargets,
    applyThirdManChainSupportTargets,
    getSpaceTwoForwardFacingTarget,
    applySpaceTwoForwardFacingTargets,
    getSpaceTwoContinuationContext,
    getSpaceTwoContinuationTarget,
    applySpaceTwoContinuationTargets,
    getDepthPoint,
    applyGenerativePrincipleSupportTargets,
    getHighValueAttackTarget,
    applyHighValueSpacePrincipleTargets,
    getFormationIdentityTarget,
    applyFormationIdentityPrincipleTargets,
    getPossessionRouteOccupationTarget,
    applyPossessionRoutePrincipleTargets,
    getPositionalPlayOccupationTarget,
    applyPositionalPlayOccupationTargets,
    getOpponentBlockOccupationTarget,
    applyOpponentBlockResponsiveTargets,
    getGameSpaceOffBallTarget,
    applyGameSpaceOffBallPrincipleTargets,
  };
}
