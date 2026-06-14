import { autoPilotStylePrincipleWeights } from "./autopilot-intention-weights.mjs";
import { autoPilotPrincipleLabels } from "./autopilot-principle-labels.mjs";

export function createGameSimulatorAutopilotPrincipleScoringDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotCandidatePrincipleMetrics,
    getAutoPilotFlowContext,
    getAutoPilotIntentionModel,
    getOpponentGoalCenter,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getRecentLaneRepeatCount,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getUniversalFootballDecisionAdjustment(candidate, carrier, startPoint, profile, model, metrics) {
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const startThreat = getPitchThreatProfile(startPoint, carrier.team);
const threatGain = targetThreat.value - startThreat.value;
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
const targetDepth = getAttackingDepth(candidate.target, carrier.team);
const pressure = model.flow.pressure;
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, candidate.target)
: 0.45;
const goalDistance = distance(startPoint, getOpponentGoalCenter(carrier.team));
const labels = [];
let score = 0;
if (model.progressionWindow?.active) {
const progressionUrgency = model.progressionWindow.urgency;
const lowValueRecycle =
candidate.actionType === "pass" &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.04 &&
actionSpace.lineBreakCount === 0 &&
pressure <= 0.5;
const progressiveAction =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 4 &&
(actionSpace.value >= 0.34 || actionSpace.lineBreakCount >= 1 || targetThreat.value >= 0.42);
if (progressiveAction) {
score += 0.18 + actionSpace.value * 0.48 + progressionUrgency * 0.22;
labels.push("Exploit forward-facing advantage");
}
if (candidate.actionType === "shot" && goalDistance <= 33 && pressure <= 0.72) {
score += 0.12 + progressionUrgency * 0.18;
labels.push("Use open shooting window");
}
if (lowValueRecycle) {
score -=
0.38 +
profile.progressionUrgency * 0.36 +
model.progressionWindow.openLane * 0.28 +
(forwardGain < -5 ? 0.18 : 0);
}
}
if (model.regain?.active) {
const regainFreshness = model.regain.freshness;
const transitionIntent = model.regain.counterIntent * regainFreshness;
const secureIntent = model.regain.secureIntent * regainFreshness;
const isLowValueRecycle =
candidate.actionType === "pass" &&
forwardGain <= -5 &&
targetThreat.value <= startThreat.value + 0.04 &&
pressure <= 0.42;
if (candidate.actionType === "pass" && passDistance <= 20 && receiverPressure <= 0.7) {
score += secureIntent * 0.28;
labels.push("Secure first pass");
}
if (
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 7 &&
(threatGain >= 0.04 || model.regain.forwardOpenSpace >= 0.58)
) {
score += 0.18 + transitionIntent * 0.42 + Math.max(0, threatGain) * 0.22;
labels.push("Attack transition space");
}
if (isLowValueRecycle && profile.directness >= 0.58 && model.regain.pressure <= 0.48) {
score -= 0.34 + transitionIntent * 0.28;
}
if (candidate.actionType === "shot" && (goalDistance <= 28 || targetThreat.box >= 0.28)) {
score += 0.14 + transitionIntent * 0.22;
labels.push("End transition with shot");
}
}
if (targetThreat.value >= 0.62 || (targetThreat.betweenLines >= 0.48 && threatGain >= 0.08)) {
score += 0.28 + targetThreat.value * 0.26 + Math.max(0, threatGain) * 0.42;
labels.push(`Attack ${targetThreat.primaryLabel}`);
}
if (candidate.actionType === "shot" && (targetThreat.box >= 0.28 || startThreat.centralPocket >= 0.45)) {
score += 0.22 + metrics.shoot * 0.28;
labels.push("Find sweet spot");
}
if (
candidate.actionType === "dribble" &&
forwardGain >= 5 &&
pressure <= 0.52 &&
(metrics.driveSpace >= 0.48 || metrics.goldenZone >= 0.42)
) {
score += 0.2 + metrics.driveSpace * 0.28 + Math.max(0, threatGain) * 0.32;
labels.push("Drive past press");
}
if (
model.forwardFacingSpaceTwo.active &&
candidate.actionType === "pass" &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.05 &&
pressure <= 0.38
) {
score -= 0.52 + profile.progressionUrgency * 0.32;
}
if (
candidate.actionType === "pass" &&
passDistance >= 30 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
targetThreat.value < 0.52 &&
profile.routeOneBias < 0.56
) {
score -=
0.42 +
(1 - profile.directness) * 0.28 +
((candidate.supportNearTarget ?? 0) <= 0 ? 0.28 : 0);
}
if (
candidate.actionType === "pass" &&
targetDepth >= 58 &&
forwardGain >= 7 &&
metrics.breakLine >= 0.44 &&
pressure <= 0.62
) {
score += 0.18 + profile.lineBreakBias * 0.22;
labels.push("Break the next line");
}
if (
candidate.actionType === "pass" &&
candidate.isSidewaysPass &&
model.rhythm.sidewaysPasses >= 2 &&
pressure <= 0.48 &&
threatGain <= 0.03
) {
score -= 0.34 + profile.progressionUrgency * 0.24;
}
return {
score,
labels: uniquePrincipleLabels(labels),
};
}
function scoreAutoPilotCandidateByIntentions(candidate, carrier, startPoint, profile) {
const model = getAutoPilotIntentionModel(carrier, startPoint, profile);
const metrics = getAutoPilotCandidatePrincipleMetrics(candidate, carrier, startPoint, profile, model);
const decisionAdjustment = getUniversalFootballDecisionAdjustment(
candidate,
carrier,
startPoint,
profile,
model,
metrics
);
const weighted = Object.entries(metrics)
.map(([key, value]) => ({
key,
value,
score: value * (model.weights[key] ?? 0),
}))
.filter((entry) => entry.score > 0.06)
.sort((a, b) => b.score - a.score);
const score = clamp(
weighted.reduce((total, entry) => total + entry.score, 0) * 0.42 + decisionAdjustment.score,
-0.75,
1.85
);
const labels = weighted
.filter((entry) => entry.value >= 0.36)
.slice(0, 3)
.map((entry) => autoPilotPrincipleLabels[entry.key]);
return {
score,
labels: uniquePrincipleLabels([...decisionAdjustment.labels, ...labels]),
metrics,
model,
};
}
function getAutoPilotStylePrincipleWeights(profile) {
return {
...autoPilotStylePrincipleWeights.balanced,
...(autoPilotStylePrincipleWeights[profile?.styleKey] ?? {}),
};
}
function getAutoPilotPrincipleAdjustment(candidate, carrier, startPoint, profile) {
const weights = getAutoPilotStylePrincipleWeights(profile);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const rhythm = getPossessionRhythmContext(carrier.team);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetLaneKey = getPitchLaneKey(candidate.target);
const startLaneKey = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLaneKey) - getPitchLaneIndex(startLaneKey));
const targetDepth = getAttackingDepth(candidate.target, carrier.team);
const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const labels = [];
const intentionAdjustment = scoreAutoPilotCandidateByIntentions(candidate, carrier, startPoint, profile);
let score = 0;
if (candidate.principleLabel) {
labels.push(candidate.principleLabel);
}
score += intentionAdjustment.score;
labels.push(...intentionAdjustment.labels);
if (candidate.actionType === "pass") {
const sameWideLaneRepeat =
targetIsWide && getRecentLaneRepeatCount(carrier.team, targetLaneKey, null, 4) >= 1;
const changeCorridorCue =
candidate.isSwitch ||
(laneShift >= 2 &&
passDistance >= 16 &&
(rhythm.sidewaysPasses >= 1 || sameWideLaneRepeat || flow.pressure >= 0.44));
if (changeCorridorCue) {
score += 0.18 + weights.changeCorridor * 0.52 + Math.min(rhythm.sidewaysPasses, 3) * 0.12;
labels.push("Change corridor");
}
const thirdPlayerCue =
passDistance <= 24 &&
forwardGain >= -1 &&
(receiverRoleKey === "connector" ||
receiverRoleKey === "pivot" ||
receiverRoleKey === "secondStriker") &&
(flow.consecutivePasses >= 1 || flow.carrierJustReceived || profile.shortSupport >= 0.7);
if (thirdPlayerCue) {
score +=
0.2 +
weights.thirdPlayer * 0.46 +
(receiver ? getPlayerTendency(receiver, "passAndMove") : 0.5) * 0.18;
labels.push("Find the Third");
}
const highestPointCue =
receiverRoleKey === "striker" && forwardGain >= 5.5 && passDistance <= 28 && targetDepth >= 46;
if (highestPointCue) {
score += 0.12 + profile.lineBreakBias * 0.22 + weights.directTransition * 0.18;
labels.push("Exit: highest point");
}
const wideQuestionCue =
receiverRoleKey === "wideForward" && targetIsWide && targetDepth >= 42 && forwardGain >= -2;
if (wideQuestionCue) {
score += 0.18 + weights.wideQuestion * 0.5 + profile.widthDiscipline * 0.16;
labels.push("Ask question wide");
}
const finalThirdCombinationCue =
targetDepth >= 64 &&
(candidate.isBoxPass ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
receiverRoleKey === "connector" ||
receiverRoleKey === "secondStriker");
if (finalThirdCombinationCue) {
score += 0.16 + weights.finalThirdCombination * 0.42;
labels.push(candidate.label === "cutback" ? "Cutback zone" : "Final-third combination");
}
}
if (candidate.actionType === "dribble") {
const goal = getOpponentGoalCenter(carrier.team);
const goalDistance = distance(startPoint, goal);
const targetGoalDistance = distance(candidate.target, goal);
const drivePastPressCue =
forwardGain >= 4.5 &&
targetGoalDistance <= goalDistance - 3 &&
flow.pressure <= 0.58;
if (drivePastPressCue) {
score += 0.18 + profile.carryBias * 0.28 + weights.directTransition * 0.26;
labels.push(targetDepth >= 58 ? "Attack open space" : "Drive past press");
}
}
if (candidate.actionType === "shot") {
if (candidate.insideBox) {
score += 0.22 + weights.finalThirdCombination * 0.18;
labels.push("Find sweet spot");
} else if ((candidate.goalDistance ?? passDistance) >= 23) {
score += 0.08 + profile.shootBias * 0.16;
labels.push("Distance shooting");
}
}
return {
score,
labels: uniquePrincipleLabels(labels),
};
}
function getAutoPilotLaneRealityAdjustment(candidate, carrier, startPoint, profile) {
if (candidate.actionType !== "pass" || !candidate.target) {
return { score: 0, labels: [] };
}
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: computePassLaneClarity(carrier, candidate.target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
});
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const valuablePass =
candidate.isLineBreak ||
candidate.isBoxPass ||
forwardGain >= 7 ||
getActionSpaceValue(startPoint, candidate.target, carrier.team, profile).value >= 0.5;
const labels = [];
let score = 0;
if (laneClarity < 0.24) {
score -= valuablePass ? 0.78 : 0.48;
} else if (laneClarity < 0.36) {
score -= valuablePass || passDistance >= 20 ? 0.46 : 0.24;
} else if (laneClarity < 0.48 && (valuablePass || passDistance >= 24)) {
score -= 0.18;
}
if (laneClarity >= 0.74 && valuablePass) {
score += 0.14 + (profile.lineBreakBias ?? 0.45) * 0.08;
labels.push("Clean passing lane");
}
if (laneClarity >= 0.82 && candidate.isSwitch) {
score += 0.08 + (profile.switchBias ?? 0) * 0.08;
labels.push("Safe switch lane");
}
if (candidate.isBoxPass && laneClarity < 0.42) {
score -= 0.18;
}
return {
score: clamp(score, -0.9, 0.38),
labels: uniquePrincipleLabels(labels),
};
}
  return {
    getUniversalFootballDecisionAdjustment,
    scoreAutoPilotCandidateByIntentions,
    getAutoPilotStylePrincipleWeights,
    getAutoPilotPrincipleAdjustment,
    getAutoPilotLaneRealityAdjustment,
  };
}
