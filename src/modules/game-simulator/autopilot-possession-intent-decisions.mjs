const autoPilotPossessionIntentLabels = {
  secure: "Secure possession",
  progress: "Progress through pressure",
  switch: "Change point of attack",
  wide: "Build wide overload",
  accelerate: "Accelerate into valuable space",
  finish: "Finish the attack",
};

export function createGameSimulatorAutopilotPossessionIntentDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingThirdKey,
    getAutoPilotFlowContext,
    getAutoPilotPossessionPlan,
    getAutoPilotPossessionRouteStage,
    getForwardProgressionWindow,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getRecentLaneRepeatCount,
    isSupportRole,
    teams,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotPossessionIntentContext(carrier, startPoint, profile) {
const teamId = carrier.team;
const rhythm = getPossessionRhythmContext(teamId);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const plan = getAutoPilotPossessionPlan(teamId, startPoint, profile);
const depth = getAttackingDepth(startPoint, teamId);
const pressure = flow.pressure;
const currentLane = getPitchLaneKey(startPoint);
const currentThird = getAttackingThirdKey(startPoint, teamId);
const laneRepeats = getRecentLaneRepeatCount(teamId, currentLane, currentThird, 5);
const threat = getPitchThreatProfile(startPoint, teamId);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const routeStage = getAutoPilotPossessionRouteStage(plan, rhythm, depth);
const routeTargetLane =
plan.routeLanes?.[routeStage] ??
plan.routeLanes?.[0] ??
plan.preferredLane;
const routeIntent =
plan.routeIntents?.[Math.min(routeStage, (plan.routeIntents?.length ?? 1) - 1)] ??
plan.intentSequence[Math.min(plan.intentSequence.length - 1, rhythm.steps)] ??
"progress";
const weights = {
secure: clamp(0.2 + profile.shortSupport * 0.32 - profile.directness * 0.08 + (rhythm.steps <= 1 ? 0.14 : 0), 0, 1),
progress: clamp(0.24 + profile.lineBreakBias * 0.38 + profile.progressionUrgency * 0.26 + (depth >= 34 && depth < 68 ? 0.12 : 0), 0, 1),
switch: clamp(0.14 + profile.switchBias * 0.32 + rhythm.sidewaysPasses * 0.12 + laneRepeats * 0.1, 0, 1),
wide: clamp(0.12 + profile.widthDiscipline * 0.16 + profile.crossBias * 0.22 + profile.overlapBias * 0.22, 0, 1),
accelerate: clamp(0.14 + profile.directness * 0.24 + profile.tempo * 0.18 + profile.progressionUrgency * 0.22 + (depth >= 58 ? 0.16 : 0), 0, 1),
finish: clamp(0.08 + profile.shootBias * 0.28 + threat.value * 0.34 + (depth >= 72 ? 0.24 : 0), 0, 1),
};
const plannedIntent = plan.intentSequence[
Math.min(plan.intentSequence.length - 1, rhythm.steps)
];
if (weights[plannedIntent] !== undefined) {
weights[plannedIntent] = clamp(weights[plannedIntent] + 0.22 + Math.abs(plan.tempoNudge), 0, 1.22);
}
if (weights[routeIntent] !== undefined) {
weights[routeIntent] = clamp(
weights[routeIntent] + 0.18 + Math.abs(plan.tempoNudge) * 0.6,
0,
1.28
);
}
if (routeTargetLane && routeTargetLane !== currentLane && rhythm.steps >= 1) {
weights.switch = clamp(weights.switch + 0.08 + profile.switchBias * 0.08, 0, 1.28);
}
if (pressure >= 0.62) {
weights.secure = clamp(weights.secure + 0.24, 0, 1.25);
weights.progress = clamp(weights.progress + 0.08, 0, 1.15);
}
if (progressionWindow.active) {
weights.progress = clamp(weights.progress + 0.26 + progressionWindow.urgency * 0.16, 0, 1.3);
weights.accelerate = clamp(weights.accelerate + 0.18 + progressionWindow.openLane * 0.18, 0, 1.28);
weights.secure = clamp(weights.secure - 0.18 * progressionWindow.urgency, 0, 1.05);
}
if (laneRepeats >= plan.switchAfter || rhythm.sidewaysPasses >= 2) {
weights.switch = clamp(weights.switch + 0.3 * plan.lanePatience, 0, 1.34);
weights.progress = clamp(weights.progress + 0.1, 0, 1.18);
}
if (rhythm.steps >= plan.escalateAfter || depth >= 64) {
weights.accelerate = clamp(weights.accelerate + 0.24 + profile.risk * 0.14, 0, 1.34);
weights.finish = clamp(weights.finish + (depth >= 70 ? 0.22 : 0.08), 0, 1.3);
}
if (threat.centralPocket >= 0.42 || threat.betweenLines >= 0.5 || threat.box >= 0.32) {
weights.finish = clamp(weights.finish + 0.24 + threat.box * 0.18, 0, 1.35);
weights.accelerate = clamp(weights.accelerate + 0.16, 0, 1.28);
}
const top = Object.entries(weights)
.sort((a, b) => b[1] - a[1])[0] ?? ["progress", 0.5];
return {
plan,
rhythm,
flow,
depth,
pressure,
currentLane,
currentThird,
laneRepeats,
threat,
progressionWindow,
routeStage,
routeTargetLane,
routeIntent,
weights,
topIntent: top[0],
topWeight: top[1],
};
}
function getAutoPilotPossessionIntentFit(candidate, carrier, startPoint, profile, context) {
const targetLane = getPitchLaneKey(candidate.target);
const startLane = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const startThreat = getPitchThreatProfile(startPoint, carrier.team);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, candidate.target)
: 0.42;
const targetIsWide = targetLane === "leftWide" || targetLane === "rightWide";
const supportRole = isSupportRole(receiverRoleKey) || receiverRoleKey === "gk" || receiverRoleKey === "rest";
const highValueTarget =
targetThreat.value >= 0.48 ||
targetThreat.centralPocket >= 0.4 ||
targetThreat.betweenLines >= 0.46 ||
targetThreat.box >= 0.28 ||
actionSpace.value >= 0.52;
const fit = {
secure: candidate.actionType === "pass"
? clamp((passDistance <= 18 ? 0.48 : 0.18) + (supportRole ? 0.28 : 0) + (receiverPressure <= 0.62 ? 0.18 : 0) + (forwardGain >= -8 ? 0.12 : -0.16), 0, 1)
: 0,
progress: clamp((forwardGain >= 5 ? 0.36 : 0) + (candidate.isLineBreak ? 0.34 : 0) + actionSpace.lineBreakCount * 0.12 + (candidate.actionType === "dribble" && forwardGain >= 4 ? 0.22 : 0), 0, 1),
switch: candidate.actionType === "pass"
? clamp((candidate.isSwitch ? 0.72 : 0) + (laneShift >= 2 && passDistance >= 14 ? 0.42 : 0) + (targetLane === context.plan.secondaryLane ? 0.18 : 0), 0, 1)
: 0,
wide: clamp((targetIsWide ? 0.42 : 0) + (receiverRoleKey === "wideBack" || receiverRoleKey === "wideForward" ? 0.3 : 0) + (candidate.principleKey?.includes("wide") || candidate.principleKey?.includes("overlap") ? 0.34 : 0), 0, 1),
accelerate: clamp((forwardGain >= 7 ? 0.32 : 0) + (highValueTarget ? 0.32 : 0) + (candidate.isBoxPass ? 0.24 : 0) + (candidate.actionType === "dribble" && forwardGain >= 6 ? 0.24 : 0), 0, 1),
finish: clamp(
(candidate.actionType === "shot" ? 0.9 : 0) +
(candidate.isBoxPass ? 0.34 : 0) +
targetThreat.box * 0.34 +
targetThreat.centralPocket * 0.18 +
targetThreat.cutbackZone * 0.16,
0,
1
),
};
return {
fit,
targetLane,
forwardGain,
targetThreat,
startThreat,
actionSpace,
};
}
function getAutoPilotPossessionIntentAdjustment(candidate, carrier, startPoint, profile) {
const context = getAutoPilotPossessionIntentContext(carrier, startPoint, profile);
const details = getAutoPilotPossessionIntentFit(candidate, carrier, startPoint, profile, context);
const weightedFit = Object.entries(context.weights).reduce(
(total, [intentKey, weight]) => total + (details.fit[intentKey] ?? 0) * weight,
0
) / Math.max(Object.values(context.weights).reduce((total, value) => total + value, 0), 0.01);
const topFit = details.fit[context.topIntent] ?? 0;
const preferredLaneFit = details.targetLane === context.plan.preferredLane && context.rhythm.steps <= context.plan.switchAfter
? 0.13
: 0;
const secondaryLaneFit = details.targetLane === context.plan.secondaryLane && (context.laneRepeats >= 2 || context.topIntent === "switch")
? 0.16
: 0;
const routeLaneDistance = context.routeTargetLane
? Math.abs(getPitchLaneIndex(details.targetLane) - getPitchLaneIndex(context.routeTargetLane))
: 0;
const routeLaneFit = context.routeTargetLane
? routeLaneDistance === 0
? 0.2 + Math.min(context.routeStage, 3) * 0.035
: routeLaneDistance === 1 && details.forwardGain >= 2
? 0.08
: 0
: 0;
const routeIntentFit = details.fit[context.routeIntent] ?? 0;
const staleLanePenalty =
details.targetLane === context.currentLane &&
context.laneRepeats >= context.plan.switchAfter &&
!candidate.isLineBreak &&
!candidate.isBoxPass &&
candidate.actionType !== "shot"
? 0.24 + context.laneRepeats * 0.08
: 0;
const forwardFacingLowValuePenalty =
context.progressionWindow.active &&
candidate.actionType === "pass" &&
details.forwardGain < 2 &&
details.targetThreat.value <= details.startThreat.value + 0.04 &&
context.pressure <= 0.52
? 0.34 + context.progressionWindow.urgency * 0.22
: 0;
const topIntentMissPenalty =
topFit < 0.28 && candidate.actionType !== "shot"
? context.topWeight * 0.24
: 0;
const routeMissPenalty =
context.routeTargetLane &&
context.rhythm.steps >= 1 &&
routeLaneDistance >= 2 &&
!candidate.isSwitch &&
!candidate.isLineBreak &&
!candidate.isBoxPass &&
candidate.actionType !== "shot"
? 0.12 + Math.min(routeLaneDistance, 4) * 0.055
: 0;
const score = clamp(
weightedFit * 0.72 +
topFit * 0.22 +
routeIntentFit * 0.12 +
preferredLaneFit +
secondaryLaneFit -
routeMissPenalty +
routeLaneFit -
staleLanePenalty -
forwardFacingLowValuePenalty -
topIntentMissPenalty,
-0.85,
0.95
);
const labels = [];
if (topFit >= 0.36 && autoPilotPossessionIntentLabels[context.topIntent]) {
labels.push(autoPilotPossessionIntentLabels[context.topIntent]);
}
if (details.targetThreat.value >= 0.5 || details.targetThreat.box >= 0.3) {
labels.push(`Attack ${details.targetThreat.primaryLabel}`);
}
if (details.targetLane === context.plan.secondaryLane && context.topIntent === "switch") {
labels.push("Change point of attack");
}
if (routeLaneFit >= 0.16) {
labels.push(context.plan.routeLabel ?? "Follow possession route");
}
if (
context.routeTargetLane &&
routeLaneDistance >= 2 &&
(candidate.isSwitch || context.routeIntent === "switch")
) {
labels.push("Use weak side");
}
return {
score,
labels: uniquePrincipleLabels(labels),
intentKey: context.topIntent,
intentLabel: autoPilotPossessionIntentLabels[context.topIntent] ?? "Possession plan",
};
}

  return {
    getAutoPilotPossessionIntentContext,
    getAutoPilotPossessionIntentFit,
    getAutoPilotPossessionIntentAdjustment,
  };
}
