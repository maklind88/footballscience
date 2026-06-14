export function createGameSimulatorAutopilotLiveDefensiveShape(deps = {}) {
  const {
    clamp,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getDefendingDirectionSign,
    getDefensiveThreatResponse,
    getDistanceFromOwnGoal,
    getKickoffDefensivePhaseKey,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    lerp,
    pitch,
    teams,
    getState,
  } = deps;
  const state = new Proxy(
    {},
    {
      get(_target, property) {
        return getState?.()?.[property];
      },
    }
  );

function getDefensivePhaseKey(teamId, ballPoint, actionType = state.ball.actionType ?? state.draftStep?.actionType) {
if (state.restartPhase?.type) {
if (state.restartPhase.type === "kickoff") {
return getKickoffDefensivePhaseKey(teamId);
}
return "setPiece";
}
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const wideRatio = Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
const styleProfile = getTeamDefenseStyleProfile(teamId);
if (
ballFromOwnGoal <= 22 ||
(actionType === "shot" && ballFromOwnGoal <= 34) ||
(ballFromOwnGoal <= 27 && wideRatio > 0.62)
) {
return "boxDefending";
}
if (ballFromOwnGoal <= 36) {
return "lowBlock";
}
if (styleProfile.preferredPhase === "lowBlock" && ballFromOwnGoal <= 52) {
return "lowBlock";
}
if (styleProfile.preferredPhase === "boxDefending" && ballFromOwnGoal <= 46) {
return ballFromOwnGoal <= 30 ? "boxDefending" : "lowBlock";
}
if (
ballFromOwnGoal >= 67 ||
(styleProfile.preferredPhase === "highPress" && ballFromOwnGoal >= 52)
) {
return "highPress";
}
return "midBlock";
}
function getDefensiveAutopilotLineKey(
player,
formation = teams[player.team]?.formation,
phaseKey = "midBlock"
) {
const label = getPlayerMagnetLabel(player);
const isHighPress = phaseKey === "highPress";
const isDeepDefending = phaseKey === "lowBlock" || phaseKey === "boxDefending";
if (label === "GK") {
return "gk";
}
if (label === "CB" || label === "LB" || label === "RB") {
return "back";
}
if (label === "WB") {
return isDeepDefending ? "back" : "midfield";
}
if (formation === "4-4-2") {
return label === "9" || label === "10" ? "forward" : "midfield";
}
if (formation === "4-1-4-1" || formation === "4-2-3-1") {
if (formation === "4-2-3-1") {
if (isHighPress) {
return label === "9" || label === "10" || label === "W" ? "forward" : "midfield";
}
if (phaseKey === "boxDefending") {
return label === "9" ? "forward" : "midfield";
}
return label === "9" || label === "10" ? "forward" : "midfield";
}
return label === "9" ? "forward" : "midfield";
}
if (formation === "3-4-3") {
if (isDeepDefending && label === "W") {
return "midfield";
}
return label === "9" || label === "W" ? "forward" : "midfield";
}
if (formation === "3-5-2") {
return label === "9" ? "forward" : "midfield";
}
if (formation === "4-3-3") {
if (isHighPress && (label === "9" || label === "W")) {
return "forward";
}
return label === "9" ? "forward" : "midfield";
}
if (label === "9" || (isHighPress && label === "W")) {
return "forward";
}
return "midfield";
}
function getDefensiveAutopilotProfile(teamId, ballPoint = state.ball.target ?? state.ball.position, phaseKey = null) {
const formation = teams[teamId]?.formation ?? "4-3-3";
const formationProfile = defensiveAutopilotProfiles[formation] ?? defensiveAutopilotProfiles["4-3-3"];
const referenceProfile = defensiveAutopilotProfiles["4-3-3"];
const resolvedPhaseKey = phaseKey ?? getDefensivePhaseKey(teamId, ballPoint);
const phaseProfile = defensivePhaseProfiles[resolvedPhaseKey] ?? defensivePhaseProfiles.midBlock;
const styleKey = getTeamDefenseStyleKey(teamId);
const styleProfile = getTeamDefenseStyleProfile(teamId);
const threatResponse = getDefensiveThreatResponse(teamId, ballPoint);
const lineActionAdjustment = getDefensiveLineActionAdjustment(teamId, ballPoint, resolvedPhaseKey);
const gapWeight = phaseProfile.formationGapWeight ?? 0.4;
const widthWeight = phaseProfile.formationWidthWeight ?? 0.45;
return {
...phaseProfile,
formation,
phaseKey: resolvedPhaseKey,
phaseLabel: phaseProfile.label,
styleKey,
styleLabel: styleProfile.label,
stylePrincipleLabel: styleProfile.principleLabel,
threatResponse,
lineActionAdjustment,
pressingIntensity: styleProfile.pressingIntensity,
tackleIntent: styleProfile.tackleIntent,
blockWidth: clamp(
(phaseProfile.blockWidth + (formationProfile.blockWidth - referenceProfile.blockWidth) * widthWeight) *
styleProfile.blockWidthMultiplier,
phaseProfile.minBlockWidth,
phaseProfile.maxBlockWidth
),
ballSideShift: clamp(
phaseProfile.ballSideShift +
(formationProfile.ballSideShift - referenceProfile.ballSideShift) * 0.45 +
styleProfile.ballSideShiftOffset,
0.36,
0.82
),
wideCompression: clamp(
phaseProfile.wideCompression +
(formationProfile.wideCompression - referenceProfile.wideCompression) * 0.35,
0.7,
0.92
),
backToBall: clamp(
phaseProfile.backToBall +
(formationProfile.backToBall - referenceProfile.backToBall) * gapWeight +
styleProfile.backToBallOffset,
5,
30
),
backToMidfield: clamp(
phaseProfile.backToMidfield +
(formationProfile.backToMidfield - referenceProfile.backToMidfield) * gapWeight +
styleProfile.lineGapOffset,
4.5,
12.5
),
midfieldToForward: clamp(
phaseProfile.midfieldToForward +
(formationProfile.midfieldToForward - referenceProfile.midfieldToForward) * gapWeight +
styleProfile.lineGapOffset,
4.5,
12.5
),
pressOffset: clamp(
(phaseProfile.pressOffset + (formationProfile.pressOffset - referenceProfile.pressOffset) * 0.35) *
styleProfile.pressOffsetMultiplier,
0.55,
2.7
),
maxBackLineFromOwnGoal: clamp(
phaseProfile.maxBackLineFromOwnGoal +
(formationProfile.maxBackLineFromOwnGoal - referenceProfile.maxBackLineFromOwnGoal) * 0.35 +
styleProfile.lineHeightOffset,
phaseProfile.minBackLineFromOwnGoal + 3,
pitch.length - 8
),
minBackLineFromOwnGoal: clamp(
(phaseProfile.minBackLineFromOwnGoal ?? 9) + styleProfile.lineHeightOffset,
7,
pitch.length - 22
),
};
}
function getDefensiveLineActionAdjustment(teamId, ballPoint, phaseKey = "midBlock") {
if (state.restartPhase?.type || !ballPoint) {
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
};
}
const attackingTeamId = getOtherTeamId(teamId);
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
targetPoint;
if (!attackingTeamId || !actionType || !startPoint || !targetPoint) {
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
};
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const attackSign = getAttackDirectionSign(attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const passDistance = distance(startPoint, targetPoint);
const startThreat = getPitchThreatProfile(startPoint, attackingTeamId);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const targetSpace = getAttackingGameSpaceProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.5;
const targetFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const startFromOwnGoal = getDistanceFromOwnGoal(teamId, startPoint);
const isHighPress = phaseKey === "highPress";
const isLowBlock = phaseKey === "lowBlock";
const isBoxDefending = phaseKey === "boxDefending";
const depthThreat =
actionType === "pass" &&
(
targetSpace.key === "space3" ||
targetThreat.behindLine >= 0.24 ||
actionSpace.lineBreakCount >= 1 ||
(forwardGain >= 9 && passDistance >= 13 && targetThreat.value >= startThreat.value + 0.03) ||
(targetFromOwnGoal <= 31 && forwardGain >= 5)
);
const carryThreat =
actionType === "dribble" &&
(
targetThreat.behindLine >= 0.2 ||
targetThreat.centralPocket >= 0.26 ||
targetFromOwnGoal <= 42 ||
(forwardGain >= 7 && actionSpace.value >= 0.3)
);
const backwardPass =
actionType === "pass" &&
forwardGain <= -4 &&
targetFromOwnGoal >= startFromOwnGoal + 1.2;
const lowRiskBackwardPass =
backwardPass &&
targetThreat.value <= startThreat.value + 0.04 &&
targetThreat.behindLine < 0.16 &&
carrierPressure >= 0.28;
if (depthThreat) {
const dropShift =
isBoxDefending
? -1.2
: isLowBlock
? -2.4
: isHighPress
? -5.2
: -3.6;
return {
mode: "drop",
shift: dropShift,
heightDelta: isHighPress ? -1.2 : -0.8,
label: "Back line drops with depth threat",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
if (carryThreat) {
const carryDrop =
isBoxDefending
? -0.8
: isLowBlock
? -1.6
: isHighPress
? -3.4
: -2.4;
return {
mode: "delayDrop",
shift: carryDrop,
heightDelta: isHighPress ? -0.8 : -0.4,
label: "Back line delays and drops",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
if (lowRiskBackwardPass) {
const stepShift =
isBoxDefending
? 0.6
: isLowBlock
? 1.8
: isHighPress
? 4.2
: 2.8;
return {
mode: "step",
shift: stepShift,
heightDelta: isLowBlock ? 0 : 0.6,
label: "Back line steps on backward pass",
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
return {
mode: "hold",
shift: 0,
heightDelta: 0,
label: null,
forwardGain,
targetSpaceKey: targetSpace.key,
lineBreakCount: actionSpace.lineBreakCount,
};
}
function getDefensiveLineDistanceFromOwnGoal(teamId, lineKey, ballPoint, profile) {
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, ballPoint);
const lineShift = profile.lineActionAdjustment?.shift ?? 0;
const backLine = clamp(
ballFromOwnGoal - profile.backToBall + lineShift,
profile.minBackLineFromOwnGoal ?? 9,
profile.maxBackLineFromOwnGoal
);
const targetBlockHeight = profile.targetBlockHeight
? clamp(
profile.targetBlockHeight + (profile.lineActionAdjustment?.heightDelta ?? 0),
profile.phaseKey === "boxDefending" ? 14 : 22,
profile.phaseKey === "boxDefending" ? 19 : 28
)
: null;
if (targetBlockHeight && lineKey !== "gk") {
const backToMidfield = clamp(
profile.targetBackToMidfield ?? profile.backToMidfield,
profile.phaseKey === "boxDefending" ? 6 : 8,
Math.max(8, targetBlockHeight - 6)
);
const midfieldLine = clamp(
backLine + backToMidfield,
backLine + 5.5,
Math.min(backLine + targetBlockHeight - 4.5, pitch.length - 10)
);
const forwardLine = clamp(
backLine + targetBlockHeight,
midfieldLine + 5,
Math.min(
Math.max(
ballFromOwnGoal + (profile.forwardAheadOfBall ?? 8),
backLine + targetBlockHeight
),
pitch.length - 8
)
);
if (lineKey === "back") {
return backLine;
}
if (lineKey === "forward") {
return forwardLine;
}
return midfieldLine;
}
const midfieldMinimum = Math.max(
(profile.minBackLineFromOwnGoal ?? 9) + profile.backToMidfield,
12
);
const forwardMinimum = midfieldMinimum + profile.midfieldToForward * 0.8;
const midfieldCap = Math.max(
midfieldMinimum,
Math.min(ballFromOwnGoal + (profile.midfieldAheadOfBall ?? 3), 72)
);
const forwardCap = Math.max(
forwardMinimum,
Math.min(ballFromOwnGoal + (profile.forwardAheadOfBall ?? 8), 86)
);
const midfieldLine = clamp(
backLine + profile.backToMidfield,
midfieldMinimum,
midfieldCap
);
const forwardLine = clamp(
midfieldLine + profile.midfieldToForward,
forwardMinimum,
forwardCap
);
if (lineKey === "gk") {
return clamp(
(profile.gkDepthMin ?? 6.5) +
Math.max(0, ballFromOwnGoal - (profile.gkSweepStart ?? 35)) *
(profile.gkSweepFactor ?? 0.08),
profile.gkDepthMin ?? 6.5,
profile.gkDepthMax ?? 11
);
}
if (lineKey === "back") {
return backLine;
}
if (lineKey === "forward") {
return forwardLine;
}
return midfieldLine;
}
function getDefensiveLineX(teamId, lineKey, ballPoint, profile) {
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const lineFromOwnGoal = getDefensiveLineDistanceFromOwnGoal(
teamId,
lineKey,
ballPoint,
profile
);
return ownGoalX + getDefendingDirectionSign(teamId) * lineFromOwnGoal;
}
function getDefensiveLineWidth(lineKey, profile, ballPoint, playerCount = 1) {
if (lineKey === "gk" || playerCount <= 1) {
return 0;
}
if (profile.unitPlayerGap) {
const gapValue =
typeof profile.unitPlayerGap === "number"
? profile.unitPlayerGap
: profile.unitPlayerGap?.[lineKey] ?? 8;
return gapValue * (playerCount - 1);
}
const wideRatio = Math.abs(ballPoint.y - pitch.width / 2) / (pitch.width / 2);
const dangerCompression =
1 -
(profile.threatResponse?.protectCenter ?? 0) *
(lineKey === "forward" ? 0.04 : lineKey === "midfield" ? 0.1 : 0.14);
const baseWidth = profile.blockWidth * lerp(1, profile.wideCompression, wideRatio) * dangerCompression;
const lineRatio =
profile.lineWidthRatio?.[lineKey] ??
(lineKey === "forward" ? 0.68 : lineKey === "midfield" ? 0.9 : 1);
const gap = profile.playerGap?.[lineKey] ?? { min: 7, max: 12 };
const segmentCount = playerCount - 1;
const minimumWidth = gap.min * segmentCount;
const maximumWidth = gap.max * segmentCount;
const shapeWidth = baseWidth * lineRatio;
return clamp(shapeWidth, minimumWidth, maximumWidth);
}
function getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth) {
const lineShift = lineKey === "forward" ? 1.12 : lineKey === "midfield" ? 1 : 0.86;
const centerProtection = profile.threatResponse?.protectCenter ?? 0;
const shiftReduction = 1 - centerProtection * (lineKey === "forward" ? 0.22 : lineKey === "midfield" ? 0.42 : 0.52);
const centerY = pitch.width / 2 + (ballPoint.y - pitch.width / 2) * profile.ballSideShift * lineShift * shiftReduction;
const margin = Math.max(4, lineWidth / 2 + 3);
return clamp(centerY, margin, pitch.width - margin);
}

  return {
    getDefensivePhaseKey,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveLineActionAdjustment,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensiveLineWidth,
    getDefensiveLineCenterY,
  };
}
