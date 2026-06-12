export function createGameSimulatorAutopilotAdvantageDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAutoPilotFlowContext,
    getNearestOpponentGap,
    getOpponentGoalCenter,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getPossessionRhythmContext,
    getRecentPossessionSteps,
    getShotWindowProfile,
    isPlayerFacingForward,
    uniquePrincipleLabels,
  } = deps;

function getAutoPilotLineBreakAdvantageAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const flow = getAutoPilotFlowContext(carrier, startPoint);
const lastStep = flow.lastStep;
if (!flow.carrierJustReceived || !lastStep || lastStep.actionType !== "pass") {
return { score: 0, labels: [], context: null };
}
const lastStart =
lastStep.beforeSnapshot?.ball?.position ??
lastStep.beforeSnapshot?.ball?.startPosition ??
null;
const lastTarget = lastStep.target ?? startPoint;
const lastPrincipleText = [
lastStep.profileLabel,
lastStep.offensiveAutopilot?.principleKey,
lastStep.offensiveAutopilot?.principleLabel,
...(lastStep.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const previousActionSpace = lastStart
? getActionSpaceValue(lastStart, lastTarget, teamId, profile)
: null;
const previousForwardGain = lastStart
? (lastTarget.x - lastStart.x) * getAttackDirectionSign(teamId)
: 0;
const previousLineBreak =
lastStep.profileLabel?.toLowerCase?.().includes("line-breaking") ||
lastPrincipleText.includes("line break") ||
lastPrincipleText.includes("line-breaking") ||
lastPrincipleText.includes("third-player") ||
lastPrincipleText.includes("between-lines") ||
lastPrincipleText.includes("space 2") ||
lastPrincipleText.includes("spelyta") ||
(previousActionSpace?.lineBreakCount ?? 0) >= 1 ||
(previousForwardGain >= 7.5 && (previousActionSpace?.targetThreat?.value ?? 0) >= 0.34);
if (!previousLineBreak) {
return { score: 0, labels: [], context: null };
}
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = flow.pressure;
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.15);
const depth = getAttackingDepth(startPoint, teamId);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const advantageValue = clamp(
currentThreat.box * 0.34 +
currentThreat.centralPocket * 0.3 +
currentThreat.betweenLines * 0.24 +
currentThreat.halfSpace * 0.16 +
currentThreat.behindLine * 0.18 +
clamp((depth - 46) / 34, 0, 1) * 0.22 +
clamp(previousForwardGain / 18, 0, 0.38) +
clamp((previousActionSpace?.lineBreakCount ?? 0) / 2, 0, 1) * 0.22 +
(currentSpace.key === "space2" || currentSpace.key === "space3" ? 0.14 : 0) +
(facingForward ? 0.16 : 0) +
(nearestGap >= 3.2 ? 0.08 : 0) -
pressure * 0.22,
0,
1.35
);
if (advantageValue < 0.24 || pressure >= 0.86) {
return {
score: 0,
labels: [],
context: {
active: false,
advantageValue,
pressure,
previousForwardGain,
},
};
}
const target = candidate.target;
const targetThreat = candidate.actionType === "shot"
? currentThreat
: getPitchThreatProfile(target, teamId);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: actionSpace?.openTarget ?? 0.56;
const highValueContinuation =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.label === "cutback" ||
targetThreat.box >= 0.22 ||
targetThreat.cutbackZone >= 0.24 ||
targetThreat.centralPocket >= 0.3 ||
targetThreat.behindLine >= 0.24;
const carriesAdvantage =
candidate.actionType === "dribble" &&
forwardGain >= 3.5 &&
(actionSpace?.openTarget ?? 0) >= 0.38 &&
distance(target, getOpponentGoalCenter(teamId)) <= goalDistance - 2.4;
const connectsAdvantage =
candidate.actionType === "pass" &&
!highValueContinuation &&
forwardGain >= 3.5 &&
(targetThreat.value >= currentThreat.value + 0.045 || (actionSpace?.lineBreakCount ?? 0) >= 1) &&
laneClarity >= 0.42;
const supportReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!highValueContinuation &&
forwardGain < 2.4 &&
passDistance <= 25 &&
targetThreat.value <= currentThreat.value + 0.04 &&
(actionSpace?.lineBreakCount ?? 0) === 0;
const backwardsReset = supportReset && forwardGain < -2.5 && pressure <= 0.66;
const labels = [];
let score = 0;
if (candidate.actionType === "shot") {
const shotWindow = getShotWindowProfile(carrier, startPoint, candidate.target);
score +=
0.24 +
advantageValue * 0.5 +
shotWindow.quality * 0.34 +
(candidate.mustShoot ? 0.28 : 0) -
(shotWindow.blockRisk >= 0.88 && !candidate.mustShoot ? 0.2 : 0);
labels.push("Line-break advantage: shoot");
} else if (highValueContinuation) {
score +=
0.22 +
advantageValue * 0.38 +
targetThreat.box * 0.22 +
targetThreat.cutbackZone * 0.18 +
targetThreat.centralPocket * 0.16 -
(laneClarity < 0.34 && passDistance >= 14 ? 0.16 : 0);
labels.push(candidate.label === "cutback" || targetThreat.cutbackZone >= 0.24
? "Line-break advantage: cutback"
: "Line-break advantage: final action");
} else if (carriesAdvantage) {
score += 0.16 + advantageValue * 0.24 + (actionSpace?.openTarget ?? 0) * 0.18;
labels.push("Line-break advantage: drive at goal");
} else if (connectsAdvantage) {
score += 0.08 + advantageValue * 0.16;
labels.push("Line-break advantage: keep attacking");
}
if (supportReset) {
score -= 0.34 + advantageValue * 0.4 + (facingForward ? 0.16 : 0);
labels.push("Do not reset line-break advantage");
}
if (backwardsReset) {
score -= 0.2 + advantageValue * 0.18;
}
return {
score: clamp(score, -1.2, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
advantageValue,
pressure,
facingForward,
depth,
goalDistance,
previousForwardGain,
previousLineBreakCount: previousActionSpace?.lineBreakCount ?? 0,
highValueContinuation,
carriesAdvantage,
supportReset,
},
};
}
function getAutoPilotAdvantageLifecycleContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const recent = getRecentPossessionSteps(teamId, 4);
if (!recent.length) {
return { active: false };
}
let bestSignal = 0;
let latestAdvantageStep = null;
let resetPenalty = 0;
const signalLabels = [];
recent.forEach((step, index) => {
const start =
step.beforeSnapshot?.ball?.position ??
step.beforeSnapshot?.ball?.startPosition ??
null;
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
if (!target) {
return;
}
const principleText = [
step.profileLabel,
step.offensiveAutopilot?.principleKey,
step.offensiveAutopilot?.principleLabel,
...(step.autoPrinciples ?? []),
].filter(Boolean).join(" ").toLowerCase();
const threat = getPitchThreatProfile(target, teamId);
const space = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = start ? getActionSpaceValue(start, target, teamId, profile) : null;
const forwardGain = start
? (target.x - start.x) * getAttackDirectionSign(teamId)
: 0;
const isAdvantageCue =
principleText.includes("line-break advantage") ||
principleText.includes("line break") ||
principleText.includes("line-breaking") ||
principleText.includes("third-player") ||
principleText.includes("between-lines") ||
principleText.includes("space 2") ||
principleText.includes("spelyta") ||
principleText.includes("do not reset line-break") ||
(actionSpace?.lineBreakCount ?? 0) >= 1 ||
(forwardGain >= 7 && threat.value >= 0.34);
const threatSignal =
threat.box * 0.42 +
threat.cutbackZone * 0.34 +
threat.centralPocket * 0.32 +
threat.behindLine * 0.24 +
threat.betweenLines * 0.2 +
(space.key === "space2" || space.key === "space3" ? 0.18 : 0) +
(isAdvantageCue ? 0.38 : 0) +
Math.max(0, forwardGain) * 0.01;
const ageDecay = Math.max(0.36, 1 - index * 0.22);
const signal = clamp(threatSignal * ageDecay, 0, 1.35);
if (signal > bestSignal) {
bestSignal = signal;
latestAdvantageStep = step;
}
if (isAdvantageCue) {
signalLabels.push(space.label);
}
if (
step.actionType === "pass" &&
start &&
forwardGain <= -6 &&
threat.value <= 0.38
) {
resetPenalty += 0.22 + index * 0.08;
}
});
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const currentDepth = getAttackingDepth(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const rhythm = getPossessionRhythmContext(teamId, 6);
const finalThirdStillAlive =
currentDepth >= 58 ||
currentThreat.centralPocket >= 0.24 ||
currentThreat.betweenLines >= 0.28 ||
currentThreat.box >= 0.12 ||
currentThreat.cutbackZone >= 0.18 ||
currentSpace.key === "space2" ||
currentSpace.key === "space3";
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.15);
const lifecycleValue = clamp(
bestSignal +
(finalThirdStillAlive ? 0.22 : 0) +
(facingForward ? 0.1 : 0) +
(rhythm.lineBreaks >= 1 ? 0.12 : 0) -
resetPenalty -
rhythm.backPasses * 0.08 -
pressure * 0.1,
0,
1.35
);
return {
active: lifecycleValue >= 0.34,
lifecycleValue,
bestSignal,
pressure,
facingForward,
finalThirdStillAlive,
currentThreat,
currentSpace,
currentDepth,
rhythm,
resetPenalty,
latestAdvantageStep,
signalLabels: uniquePrincipleLabels(signalLabels),
};
}
function getAutoPilotAdvantageLifecycleAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotAdvantageLifecycleContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = candidate.actionType === "shot"
? context.currentThreat
: getPitchThreatProfile(target, teamId);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const targetGoalDistance = candidate.actionType === "shot"
? 0
: distance(target, getOpponentGoalCenter(teamId));
const finalAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.label === "cutback" ||
targetThreat.box >= 0.2 ||
targetThreat.cutbackZone >= 0.22 ||
targetThreat.centralPocket >= 0.3 ||
targetThreat.behindLine >= 0.22;
const carryAdvantage =
candidate.actionType === "dribble" &&
forwardGain >= 3 &&
(actionSpace?.openTarget ?? 0) >= 0.38 &&
targetGoalDistance <= goalDistance - 2.2;
const keepPressure =
candidate.actionType === "pass" &&
!finalAction &&
forwardGain >= 3 &&
(targetThreat.value >= context.currentThreat.value + 0.04 ||
(actionSpace?.lineBreakCount ?? 0) >= 1);
const reset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!finalAction &&
forwardGain < 1.5 &&
passDistance <= 26 &&
targetThreat.value <= context.currentThreat.value + 0.04 &&
(actionSpace?.lineBreakCount ?? 0) === 0;
const labels = [];
let score = 0;
if (finalAction) {
score += 0.18 + context.lifecycleValue * 0.38;
labels.push("Keep advantage alive: final action");
} else if (carryAdvantage) {
score += 0.12 + context.lifecycleValue * 0.22;
labels.push("Keep advantage alive: drive");
} else if (keepPressure) {
score += 0.08 + context.lifecycleValue * 0.14;
labels.push("Keep advantage alive");
}
if (reset && context.pressure <= 0.7) {
score -= 0.28 + context.lifecycleValue * 0.34;
labels.push("Do not let advantage die");
}
return {
score: clamp(score, -1, 1.15),
labels: uniquePrincipleLabels(labels),
context: {
active: context.active,
lifecycleValue: context.lifecycleValue,
bestSignal: context.bestSignal,
pressure: context.pressure,
currentSpace: context.currentSpace?.key,
finalThirdStillAlive: context.finalThirdStillAlive,
finalAction,
carryAdvantage,
keepPressure,
reset,
},
};
}

  return {
    getAutoPilotLineBreakAdvantageAdjustment,
    getAutoPilotAdvantageLifecycleContext,
    getAutoPilotAdvantageLifecycleAdjustment,
  };
}
