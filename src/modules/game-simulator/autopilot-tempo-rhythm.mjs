export function createGameSimulatorAutopilotTempoRhythm(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackStyleRhythmProfile,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAttackingThirdKey,
    getAutoPilotCandidatePattern,
    getAutoPilotFlowContext,
    getAutoPilotPossessionPlan,
    getOpponentGoalCenter,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getRecentLaneRepeatCount,
    getRecentPossessionSteps,
    getRecordedStepPattern,
    isSupportRole,
    isTransitionAttackStyle,
    possessionRhythmDefaults,
    teams,
    uniquePrincipleLabels,
  } = deps;

const autoPilotTempoPhaseLabels = {
settle: "Tempo phase: settle first pass",
probe: "Tempo phase: probe the block",
moveBlock: "Tempo phase: move the block",
accelerate: "Tempo phase: accelerate",
finish: "Tempo phase: finish attack",
};
function getAutoPilotTempoPhaseContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const rhythm = getPossessionRhythmContext(teamId, 10);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const threat = getPitchThreatProfile(startPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const depth = getAttackingDepth(startPoint, teamId);
const targetSeconds =
profile.targetPossessionSeconds ??
getAttackStyleRhythmProfile(profile.styleKey).targetSeconds ??
possessionRhythmDefaults.targetSeconds;
const maturity = clamp(rhythm.duration / Math.max(targetSeconds, 0.1), 0, 1.6);
const currentLane = getPitchLaneKey(startPoint);
const currentThird = getAttackingThirdKey(startPoint, teamId);
const laneRepeats = getRecentLaneRepeatCount(teamId, currentLane, currentThird, 6);
const recent = getRecentPossessionSteps(teamId, 6);
const recentFinalThirdActions = recent.filter((step) => {
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return target && getAttackingDepth(target, teamId) >= 66;
}).length;
const recentShots = recent.filter((step) => step.actionType === "shot").length;
const noProgress =
rhythm.steps >= 2 &&
rhythm.forwardPasses === 0 &&
rhythm.lineBreaks === 0;
const staleCirculation =
rhythm.lineBreaks === 0 &&
(rhythm.sidewaysPasses >= 2 || rhythm.backPasses >= 1 || laneRepeats >= 2);
const finalThirdState =
depth >= 68 ||
threat.box >= 0.2 ||
threat.cutbackZone >= 0.26 ||
threat.centralPocket >= 0.42 ||
gameSpace.key === "space3" ||
recentFinalThirdActions >= 2;
const directStyle =
profile.directness >= 0.68 ||
isTransitionAttackStyle(profile.styleKey) ||
profile.styleKey === "route-one";
let phaseKey = "probe";
if (finalThirdState) {
phaseKey = "finish";
} else if (staleCirculation || noProgress) {
phaseKey = "moveBlock";
} else if (
maturity >= 0.62 ||
depth >= 54 ||
rhythm.steps >= Math.max(3, Math.round(targetSeconds / 3.4)) ||
flow.carrierJustReceived
) {
phaseKey = "accelerate";
} else if (rhythm.steps <= 1 && flow.pressure <= 0.58 && !directStyle) {
phaseKey = "settle";
}
return {
active: true,
teamId,
rhythm,
flow,
threat,
gameSpace,
depth,
targetSeconds,
maturity,
currentLane,
currentThird,
laneRepeats,
recentFinalThirdActions,
recentShots,
noProgress,
staleCirculation,
finalThirdState,
directStyle,
phaseKey,
};
}
function getAutoPilotTempoPhaseAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotTempoPhaseContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetLane = getPitchLaneKey(target);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.currentLane));
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const supportPass =
candidate.actionType === "pass" &&
passDistance <= 20 &&
forwardGain >= -8 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "rest" || receiverRoleKey === "gk");
const highValueAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= context.threat.value + 0.08 ||
targetThreat.box >= 0.26 ||
actionSpace.lineBreakCount >= 1;
const sterileAction =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2.5 &&
targetThreat.value <= context.threat.value + 0.04 &&
actionSpace.lineBreakCount === 0;
const progressiveAction =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 4 &&
(
candidate.isLineBreak ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.34 ||
targetThreat.value >= context.threat.value + 0.055
);
const switchAction =
candidate.actionType === "pass" &&
(candidate.isSwitch || (laneShift >= 2 && passDistance >= 15));
const carryToGoal =
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
distance(target, getOpponentGoalCenter(teamId)) <= distance(startPoint, getOpponentGoalCenter(teamId)) - 3;
const labels = [];
let score = 0;
if (autoPilotTempoPhaseLabels[context.phaseKey]) {
labels.push(autoPilotTempoPhaseLabels[context.phaseKey]);
}
if (context.phaseKey === "settle") {
if (supportPass) {
score += 0.22 + profile.shortSupport * 0.22;
}
if (progressiveAction && passDistance <= 24) {
score += 0.1 + profile.tempo * 0.08;
}
if (
candidate.actionType === "pass" &&
passDistance >= 27 &&
!candidate.isSwitch &&
!candidate.isLineBreak &&
!candidate.isBoxPass
) {
score -= 0.34 + (1 - profile.directness) * 0.22;
}
if (candidate.actionType === "shot" && !candidate.mustShoot) {
score -= 0.28;
}
} else if (context.phaseKey === "probe") {
if (progressiveAction || targetThreat.betweenLines >= 0.32 || targetThreat.halfSpace >= 0.36) {
score += 0.18 + actionSpace.value * 0.24;
}
if (switchAction && context.rhythm.sidewaysPasses >= 1) {
score += 0.14 + profile.switchBias * 0.14;
}
if (sterileAction && targetLane === context.currentLane && context.flow.pressure <= 0.52) {
score -= 0.2 + profile.progressionUrgency * 0.16;
}
} else if (context.phaseKey === "moveBlock") {
if (switchAction) {
score += 0.34 + profile.switchBias * 0.26 + Math.min(context.laneRepeats, 4) * 0.08;
}
if (progressiveAction) {
score += 0.24 + profile.progressionUrgency * 0.2;
}
if (carryToGoal && context.flow.pressure <= 0.64) {
score += 0.22 + profile.carryBias * 0.16;
}
if (sterileAction && !switchAction) {
score -= 0.46 + context.maturity * 0.22;
}
} else if (context.phaseKey === "accelerate") {
if (progressiveAction) {
score += 0.32 + actionSpace.value * 0.3 + profile.progressionUrgency * 0.2;
}
if (carryToGoal) {
score += 0.26 + profile.carryBias * 0.18;
}
if (candidate.actionType === "shot" && (context.depth >= 58 || context.threat.centralPocket >= 0.34)) {
score += 0.22 + profile.shootBias * 0.18;
}
if (sterileAction && context.flow.pressure <= 0.52) {
score -= 0.42 + profile.progressionUrgency * 0.22;
}
} else if (context.phaseKey === "finish") {
if (candidate.actionType === "shot") {
score +=
0.36 +
profile.shootBias * 0.28 +
(candidate.mustShoot ? 0.28 : 0) +
(candidate.insideBox ? 0.24 : 0);
}
if (
candidate.actionType === "pass" &&
(candidate.isBoxPass || candidate.label === "cutback" || targetThreat.cutbackZone >= 0.3)
) {
score += 0.28 + profile.deliveryBias * 0.18 + targetThreat.box * 0.16;
}
if (carryToGoal && actionSpace.openTarget >= 0.38) {
score += 0.2 + profile.dribbleBias * 0.16;
}
if (
sterileAction &&
context.flow.pressure <= 0.56 &&
!candidate.isSwitch &&
!highValueAction
) {
score -= 0.54 + (context.recentShots === 0 ? 0.18 : 0);
}
}
if (
context.maturity >= 1 &&
!highValueAction &&
!switchAction &&
candidate.actionType !== "shot" &&
forwardGain < 4
) {
score -= 0.18 + Math.min(context.maturity - 1, 0.6) * 0.28;
}
if (
context.recentFinalThirdActions >= 2 &&
context.recentShots === 0 &&
candidate.actionType === "shot"
) {
score += 0.18 + profile.shootBias * 0.16;
labels.push("Stop overplaying");
}
if (pattern.family === "recycle" && context.phaseKey !== "settle" && context.flow.pressure <= 0.45) {
score -= 0.16 + profile.progressionUrgency * 0.12;
}
return {
score: clamp(score, -1.25, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
phaseKey: context.phaseKey,
maturity: context.maturity,
laneRepeats: context.laneRepeats,
staleCirculation: context.staleCirculation,
noProgress: context.noProgress,
recentFinalThirdActions: context.recentFinalThirdActions,
recentShots: context.recentShots,
pattern,
},
};
}
function getAutoPilotRhythmGovernorAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const rhythm = getPossessionRhythmContext(teamId, 10);
if (!rhythm.steps) {
return { score: 0, labels: [], context: null };
}
const recent = getRecentPossessionSteps(teamId, 7);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const targetSeconds = profile.targetPossessionSeconds ?? possessionRhythmDefaults.targetSeconds;
const averageActionTime = rhythm.duration / Math.max(rhythm.steps, 1);
const targetActionTime = clamp(1.42 - (profile.tempo ?? 0.55) * 0.42, 0.72, 1.35);
const maturity = clamp(rhythm.duration / Math.max(targetSeconds, 0.1), 0, 1.8);
const recentPatterns = recent
.map((step) => getRecordedStepPattern(step, teamId))
.filter(Boolean);
const recentVerticalActions = recentPatterns
.slice(0, 3)
.filter((entry) => ["line-break", "carry-forward", "front-line"].includes(entry.family)).length;
const recentRecycles = recentPatterns
.slice(0, 4)
.filter((entry) => entry.family === "recycle" || entry.forwardGain <= -4.5).length;
const recentFinalThird = recent.filter((step) => {
const point = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return point && getAttackingDepth(point, teamId) >= 67;
}).length;
const recentShots = recent.filter((step) => step.actionType === "shot").length;
const directStyle = profile.directness >= 0.68 || isTransitionAttackStyle(profile.styleKey) || profile.styleKey === "route-one";
const rushedTempo =
rhythm.steps >= 2 &&
averageActionTime < targetActionTime * 0.72 &&
!directStyle &&
pressure <= 0.58;
const stalePossession =
rhythm.steps >= 3 &&
rhythm.lineBreaks === 0 &&
(rhythm.sidewaysPasses >= 2 || rhythm.backPasses >= 1 || recentRecycles >= 2);
const overTargetWithoutThreat =
maturity >= 0.9 &&
targetThreat.value < startThreat.value + 0.06 &&
rhythm.lineBreaks === 0;
const finalThirdNeedsEndProduct =
recentFinalThird >= 2 &&
recentShots === 0 &&
(getAttackingDepth(startPoint, teamId) >= 64 || startThreat.value >= 0.5);
const supportAction =
candidate.actionType === "pass" &&
pattern.passDistance <= 20 &&
pattern.forwardGain >= -8 &&
(isSupportRole(pattern.receiverRoleKey) || pattern.receiverRoleKey === "rest" || pattern.receiverRoleKey === "gk");
const valueAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= 0.62 ||
actionSpace.lineBreakCount >= 1 ||
pattern.forwardGain >= 7;
const sterileAction =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
pattern.forwardGain < 3 &&
targetThreat.value <= startThreat.value + 0.04 &&
actionSpace.lineBreakCount === 0;
const switchOrChangeLane =
candidate.actionType === "pass" &&
(candidate.isSwitch || Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(getPitchLaneKey(startPoint))) >= 2);
const labels = [];
let score = 0;
if (rushedTempo) {
if (supportAction) {
score += 0.2 + (profile.shortSupport ?? 0.5) * 0.18;
labels.push("Rhythm: regain control");
}
if (
candidate.actionType === "pass" &&
pattern.passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isLineBreak &&
!candidate.isBoxPass
) {
score -= 0.36 + (1 - (profile.directness ?? 0.5)) * 0.22;
labels.push("Rhythm: avoid rushed turnover");
}
if (candidate.actionType === "dribble" && pattern.forwardGain >= 4 && pressure <= 0.46) {
score += 0.1 + (profile.carryBias ?? 0.5) * 0.08;
}
}
if (recentVerticalActions >= 2 && !directStyle) {
if (supportAction || switchOrChangeLane) {
score += 0.12 + (profile.shortSupport ?? 0.5) * 0.08;
labels.push("Rhythm: connect after vertical play");
} else if (pattern.forwardGain >= 9 && !valueAction) {
score -= 0.22 + (1 - (profile.directness ?? 0.5)) * 0.16;
}
}
if (stalePossession || overTargetWithoutThreat) {
if (valueAction || switchOrChangeLane) {
score += 0.26 + (profile.progressionUrgency ?? 0.5) * 0.24;
labels.push(stalePossession ? "Rhythm: change tempo" : "Rhythm: progress now");
}
if (sterileAction) {
score -= 0.36 + (profile.progressionUrgency ?? 0.5) * 0.26 + maturity * 0.08;
labels.push("Rhythm: stop sterile circulation");
}
}
if (finalThirdNeedsEndProduct) {
if (
candidate.actionType === "shot" ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
candidate.isBoxPass ||
targetThreat.cutbackZone >= 0.32
) {
score += 0.32 + (profile.shootBias ?? 0.5) * 0.18 + (profile.deliveryBias ?? 0.5) * 0.12;
labels.push("Rhythm: create end product");
} else if (sterileAction && pressure <= 0.58) {
score -= 0.42 + (profile.progressionUrgency ?? 0.5) * 0.2;
}
}
if (
rhythm.steps <= 1 &&
!directStyle &&
candidate.actionType === "shot" &&
!candidate.mustShoot &&
startThreat.value < 0.62
) {
score -= 0.18;
}
return {
score: clamp(score, -1.18, 1.1),
labels: uniquePrincipleLabels(labels),
context: {
averageActionTime,
targetActionTime,
maturity,
rushedTempo,
stalePossession,
overTargetWithoutThreat,
finalThirdNeedsEndProduct,
recentVerticalActions,
recentRecycles,
recentFinalThird,
recentShots,
pattern,
},
};
}
function getAutoPilotOpeningVariationAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier?.team) {
return { score: 0, labels: [] };
}
const plan = getAutoPilotPossessionPlan(carrier.team, startPoint, profile);
const rhythm = getPossessionRhythmContext(carrier.team);
const stepLimit = plan.openingStepLimit ?? 0;
if (!plan.openingKey || rhythm.steps >= stepLimit) {
return { score: 0, labels: [] };
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const openingProgress = clamp(rhythm.steps / Math.max(stepLimit, 1), 0, 1);
const laneFit = (plan.openingLanes ?? []).includes(pattern.laneKey);
const familyFit = (plan.openingFamilies ?? []).includes(pattern.family);
const receiverRoleFit = pattern.receiverRoleKey
? (plan.openingReceiverRoles ?? []).includes(pattern.receiverRoleKey)
: candidate.actionType === "dribble" || candidate.actionType === "shot";
const isLongUnsupported =
candidate.actionType === "pass" &&
pattern.passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isLineBreak &&
!candidate.isBoxPass &&
(candidate.supportNearTarget ?? 0) <= 0;
const isSterileSideways =
candidate.isSidewaysPass &&
rhythm.sidewaysPasses >= 1 &&
!familyFit &&
!laneFit;
const isEarlyBackPass =
pattern.forwardGain <= -5 &&
rhythm.steps >= 1 &&
rhythm.forwardPasses === 0 &&
candidate.receiverRoleKey !== "gk" &&
profile.directness >= 0.5;
const valuableException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
getPitchThreatProfile(candidate.target, carrier.team).value >= 0.62;
let score = 0;
if (laneFit) {
score += 0.18 + (1 - openingProgress) * 0.12;
}
if (familyFit) {
score += 0.26 + (1 - openingProgress) * 0.16;
}
if (receiverRoleFit) {
score += 0.15;
}
if (pattern.family === "switch" && plan.openingKey === "switch-to-weak-side" && rhythm.steps >= 1) {
score += 0.28 + profile.switchBias * 0.18;
}
if (pattern.family === "wide-overload" && plan.openingKey === "wide-probe") {
score += 0.32 + profile.overlapBias * 0.2;
}
if (pattern.family === "line-break" && plan.openingKey === "half-space-probe") {
score += 0.24 + profile.lineBreakBias * 0.22;
}
if (pattern.family === "front-line" && plan.openingKey === "vertical-threat") {
score += 0.28 + profile.directness * 0.18;
}
if (!valuableException) {
if (isLongUnsupported) {
score -= plan.openingLongPassPenalty ?? 0.32;
}
if (isSterileSideways) {
score -= 0.24 + profile.progressionUrgency * 0.18;
}
if (isEarlyBackPass) {
score -= 0.22 + profile.progressionUrgency * 0.16;
}
}
const labels = [];
if (score >= 0.24) {
labels.push(`Opening variation: ${plan.openingLabel}`);
}
return {
score: clamp(score, -0.72, 0.82),
labels: uniquePrincipleLabels(labels),
openingKey: plan.openingKey,
};
}

  return {
    getAutoPilotTempoPhaseContext,
    getAutoPilotTempoPhaseAdjustment,
    getAutoPilotRhythmGovernorAdjustment,
    getAutoPilotOpeningVariationAdjustment,
  };
}
