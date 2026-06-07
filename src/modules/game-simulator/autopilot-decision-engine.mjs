export function createGameSimulatorAutopilotDecisionEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    ballRadiusMeters,
    buildPlayerIntelligenceProfile,
    chooseScoredCandidateWithVariation,
    chooseWeightedOption,
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    computeTimeToCoverDistance,
    distance,
    getActionSpaceValue,
    getActionThreatGain,
    getAttackDirectionSign,
    getAttackStyleRhythmProfile,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getAttackingThirdKey,
    getAutoPilotRoleStrength,
    getCarryLaneOpenSpaceScore,
    getCoverShadowInfluence,
    getForwardFacingSpaceTwoContext,
    getForwardProgressionWindow,
    getLaneForSideSign,
    getNearestOpponentGap,
    getNearestOpponentGapInCarryLane,
    getNearestOpponentGapToPoint,
    getOffensiveRoleKey,
    getOpponentDensityAtPoint,
    getOpponentGoalCenter,
    getOpponentLineDepthsForAttackingTeam,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPassLaneRiskProfile,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getPlayerTendency,
    getPossessionRhythmContext,
    getPotentialPassReceiverAtTarget,
    getReceiveFootUsageScore,
    getReceiveOrientationScore,
    getRecentPossessionSteps,
    getReceptionSupportTarget,
    getRecordedStepDuration,
    getRecordedStepPossessionTeamId,
    getShotWindowProfile,
    getState,
    getTeamDensityAtPoint,
    isGoalkeeper,
    isPassReceiverOffside,
    isPlayerFacingForward,
    isWideChannel,
    lerp,
    pitch,
    playerRadiusMeters,
    possessionRhythmDefaults,
    projectPointOnSegmentWithRatio,
    randomBetween,
    randomSign,
    resolveBallActionProfile,
    teams,
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

function getAutoPilotPossessionStartIndex(teamId) {
const continuousRhythm = getPossessionRhythmContext(teamId, 40);
return Math.max((state.sequence?.steps?.length ?? 0) - continuousRhythm.steps, 0);
}
function getAutoPilotStyleIntentSequence(styleKey = "balanced") {
if (styleKey === "wing-play" || styleKey === "overlap-wide") {
return ["secure", "wide", "switch", "wide", "accelerate", "finish"];
}
if (styleKey === "control-possession" || styleKey === "tiki-taka" || styleKey === "fluid-combinations") {
return ["secure", "progress", "switch", "progress", "accelerate", "finish"];
}
if (styleKey === "vertical-tiki-taka" || styleKey === "vertical-play" || styleKey === "gegenpress") {
return ["progress", "secure", "accelerate", "finish"];
}
if (styleKey === "direct-transition" || styleKey === "counter-attack" || styleKey === "fluid-counter-attack") {
return ["progress", "accelerate", "finish"];
}
if (styleKey === "route-one") {
return ["progress", "finish", "secondBall"];
}
return ["secure", "progress", "switch", "accelerate", "finish"];
}
const autoPilotPossessionRouteProfiles = {
"central-third-man": {
label: "central third-man route",
lanes: ["central", "leftHalf", "central", "rightHalf", "central"],
intents: ["secure", "progress", "progress", "accelerate", "finish"],
weight: ({ profile }) =>
0.48 + profile.shortSupport * 0.54 + profile.lineBreakBias * 0.28 + (profile.directness < 0.56 ? 0.18 : 0),
},
"wide-overload-switch": {
label: "wide overload to weak-side switch",
lanes: ({ sideSign, farSideSign }) => [
getLaneForSideSign(sideSign, "wide"),
getLaneForSideSign(sideSign, "half"),
getLaneForSideSign(farSideSign, "half"),
getLaneForSideSign(farSideSign, "wide"),
"central",
],
intents: ["wide", "progress", "switch", "wide", "finish"],
weight: ({ profile }) =>
0.38 + profile.widthDiscipline * 0.3 + profile.switchBias * 0.34 + profile.overlapBias * 0.28 + profile.crossBias * 0.22,
},
"overlap-cutback": {
label: "overlap to cutback route",
lanes: ({ sideSign }) => [
getLaneForSideSign(sideSign, "half"),
getLaneForSideSign(sideSign, "wide"),
getLaneForSideSign(sideSign, "half"),
"central",
],
intents: ["wide", "wide", "accelerate", "finish"],
weight: ({ profile }) =>
0.24 + profile.overlapBias * 0.62 + profile.crossBias * 0.32 + profile.widthDiscipline * 0.22,
},
"vertical-half-space": {
label: "vertical half-space route",
lanes: ({ sideSign }) => [
getLaneForSideSign(sideSign, "half"),
"central",
getLaneForSideSign(sideSign, "half"),
"central",
],
intents: ["progress", "secure", "accelerate", "finish"],
weight: ({ profile }) =>
0.34 + profile.directness * 0.42 + profile.lineBreakBias * 0.44 + profile.progressionUrgency * 0.28,
},
"direct-second-ball": {
label: "direct second-ball route",
lanes: ({ sideSign }) => [
"central",
getLaneForSideSign(sideSign, "half"),
"central",
getLaneForSideSign(sideSign, "wide"),
],
intents: ["progress", "accelerate", "finish", "finish"],
weight: ({ profile }) =>
0.18 + profile.routeOneBias * 0.78 + profile.directness * 0.38 + (profile.tempo >= 0.72 ? 0.16 : 0),
},
"patient-switch": {
label: "patient switch route",
lanes: ({ sideSign, farSideSign }) => [
getLaneForSideSign(sideSign, "half"),
"central",
getLaneForSideSign(farSideSign, "half"),
getLaneForSideSign(farSideSign, "wide"),
"central",
],
intents: ["secure", "progress", "switch", "wide", "finish"],
weight: ({ profile }) =>
0.34 + profile.switchBias * 0.48 + profile.shortSupport * 0.26 + (profile.directness < 0.5 ? 0.18 : 0),
},
};
const autoPilotOpeningVariationProfiles = {
"control-settle": {
label: "settle possession before progression",
lanes: ({ sideSign, farSideSign }) => ["central", getLaneForSideSign(sideSign, "half"), getLaneForSideSign(farSideSign, "half")],
families: ["support-link", "line-break", "switch", "carry-control"],
receiverRoles: ["pivot", "connector", "wideBack"],
stepLimit: 4,
longPassPenalty: 0.52,
weight: ({ profile }) =>
0.32 + profile.shortSupport * 0.58 + (profile.directness < 0.5 ? 0.22 : 0) + profile.switchBias * 0.18,
},
"wide-probe": {
label: "create width before attacking inside",
lanes: ({ sideSign, farSideSign }) => [
getLaneForSideSign(sideSign, "wide"),
getLaneForSideSign(sideSign, "half"),
getLaneForSideSign(farSideSign, "wide"),
],
families: ["wide-overload", "support-link", "switch", "cutback", "cross"],
receiverRoles: ["wideForward", "wideBack", "connector"],
stepLimit: 5,
longPassPenalty: 0.28,
weight: ({ profile }) =>
0.22 + profile.widthDiscipline * 0.42 + profile.overlapBias * 0.46 + profile.crossBias * 0.34 + profile.switchBias * 0.16,
},
"half-space-probe": {
label: "find the half-space connector",
lanes: ({ sideSign, farSideSign }) => [getLaneForSideSign(sideSign, "half"), "central", getLaneForSideSign(farSideSign, "half")],
families: ["line-break", "support-link", "front-line", "carry-forward"],
receiverRoles: ["connector", "striker", "wideForward", "pivot"],
stepLimit: 4,
longPassPenalty: 0.34,
weight: ({ profile }) =>
0.28 + profile.lineBreakBias * 0.46 + profile.progressionUrgency * 0.3 + profile.tempo * 0.18,
},
"vertical-threat": {
label: "threaten depth early",
lanes: ({ sideSign }) => ["central", getLaneForSideSign(sideSign, "half"), getLaneForSideSign(sideSign, "wide")],
families: ["line-break", "front-line", "carry-forward", "shot"],
receiverRoles: ["striker", "wideForward", "secondStriker", "connector"],
stepLimit: 3,
longPassPenalty: 0.12,
weight: ({ profile }) =>
0.18 + profile.directness * 0.56 + profile.lineBreakBias * 0.34 + profile.progressionUrgency * 0.24 + profile.routeOneBias * 0.28,
},
"switch-to-weak-side": {
label: "move the block then switch",
lanes: ({ sideSign, farSideSign }) => [
getLaneForSideSign(sideSign, "half"),
"central",
getLaneForSideSign(farSideSign, "half"),
getLaneForSideSign(farSideSign, "wide"),
],
families: ["support-link", "switch", "wide-overload", "line-break"],
receiverRoles: ["pivot", "connector", "wideBack", "wideForward"],
stepLimit: 5,
longPassPenalty: 0.32,
weight: ({ profile }) =>
0.2 + profile.switchBias * 0.62 + profile.shortSupport * 0.22 + (profile.directness < 0.58 ? 0.12 : 0),
},
};
const autoPilotPlanMemory = {
home: [],
away: [],
};
function resolvePossessionRouteLanes(routeProfile, context) {
const lanes = typeof routeProfile.lanes === "function"
? routeProfile.lanes(context)
: routeProfile.lanes;
return (lanes ?? ["central"]).filter((laneKey) => pitchLaneKeys.includes(laneKey));
}
function resolveOpeningVariationLanes(openingProfile, context) {
const lanes = typeof openingProfile.lanes === "function"
? openingProfile.lanes(context)
: openingProfile.lanes;
return (lanes ?? ["central"]).filter((laneKey) => pitchLaneKeys.includes(laneKey));
}
function getRecentAutoPilotPlanMemory(teamId, profile = {}, limit = 6) {
const memory = autoPilotPlanMemory[teamId] ?? [];
return memory
.filter((entry) => !profile.styleKey || entry.styleKey === profile.styleKey)
.filter((entry) => !profile.formation || entry.formation === profile.formation)
.slice(0, limit);
}
function getAutoPilotPlanRepeatPenalty(teamId, profile, key, value, limit = 6) {
if (value === null || value === undefined) {
return 0;
}
return getRecentAutoPilotPlanMemory(teamId, profile, limit).reduce((penalty, entry, index) => {
if (entry[key] !== value) {
return penalty;
}
return penalty + (index === 0 ? 0.46 : 0.22 / (index + 0.85));
}, 0);
}
function rememberAutoPilotPossessionPlan(plan) {
if (!plan?.teamId || !autoPilotPlanMemory[plan.teamId]) {
return;
}
const memory = autoPilotPlanMemory[plan.teamId];
const signature = [
plan.styleKey,
plan.formation,
plan.routeKey,
plan.openingKey,
plan.preferredLane,
plan.secondaryLane,
].join(":");
if (memory[0]?.signature === signature && state.time - (memory[0].createdAt ?? 0) < 0.2) {
return;
}
memory.unshift({
signature,
teamId: plan.teamId,
styleKey: plan.styleKey,
formation: plan.formation,
routeKey: plan.routeKey,
openingKey: plan.openingKey,
preferredLane: plan.preferredLane,
secondaryLane: plan.secondaryLane,
routeLabel: plan.routeLabel,
openingLabel: plan.openingLabel,
createdAt: state.time,
});
if (memory.length > 24) {
memory.length = 24;
}
}
function invalidateAutoPilotPossessionPlan(targetState = state) {
if (!targetState?.autoPilotPlay) {
return;
}
targetState.autoPilotPlay.possessionPlan = null;
targetState.autoPilotPlay.receiveMomentum = null;
}
function createAutoPilotPossessionRoute(teamId, profile, sideSign, farSideSign) {
const context = { profile, sideSign, farSideSign, teamId };
const routeEntries = Object.entries(autoPilotPossessionRouteProfiles);
const selectedEntry = chooseWeightedOption(routeEntries, ([routeKey, routeProfile]) => {
const repeatPenalty = getAutoPilotPlanRepeatPenalty(teamId, profile, "routeKey", routeKey, 5);
const stylisticNoise = randomBetween(-0.04, 0.09);
return routeProfile.weight(context) + stylisticNoise - repeatPenalty;
});
const [routeKey, routeProfile] = selectedEntry ?? routeEntries[0];
return {
key: routeKey,
label: routeProfile.label,
lanes: resolvePossessionRouteLanes(routeProfile, context),
intents: routeProfile.intents ?? getAutoPilotStyleIntentSequence(profile.styleKey),
stepSpan: randomBetween(profile.tempo >= 0.75 ? 0.85 : 1.1, profile.directness >= 0.68 ? 1.35 : 1.85),
};
}
function createAutoPilotOpeningVariation(teamId, profile, sideSign, farSideSign, route) {
const context = { profile, sideSign, farSideSign, route, teamId };
const entries = Object.entries(autoPilotOpeningVariationProfiles);
const selectedEntry = chooseWeightedOption(entries, ([key, openingProfile]) => {
const routeFit =
route.key === "wide-overload-switch" && key === "wide-probe"
? 0.28
: route.key === "overlap-cutback" && key === "wide-probe"
? 0.34
: route.key === "vertical-half-space" && key === "half-space-probe"
? 0.3
: route.key === "direct-second-ball" && key === "vertical-threat"
? 0.34
: route.key === "patient-switch" && key === "switch-to-weak-side"
? 0.3
: 0;
const repeatPenalty = getAutoPilotPlanRepeatPenalty(teamId, profile, "openingKey", key, 5);
return openingProfile.weight(context) + routeFit + randomBetween(-0.05, 0.1) - repeatPenalty;
});
const [key, openingProfile] = selectedEntry ?? entries[0];
return {
key,
label: openingProfile.label,
lanes: resolveOpeningVariationLanes(openingProfile, context),
families: openingProfile.families ?? ["support-link", "line-break"],
receiverRoles: openingProfile.receiverRoles ?? ["pivot", "connector"],
stepLimit: openingProfile.stepLimit ?? 4,
longPassPenalty: openingProfile.longPassPenalty ?? 0.32,
tempoNudge: randomBetween(-0.06, 0.08),
};
}
function getAutoPilotPossessionRouteStage(plan, rhythm, depth) {
const laneCount = Math.max(plan.routeLanes?.length ?? 0, 1);
const rawStage = Math.floor((rhythm.steps + Math.max(0, rhythm.forwardPasses - 1) * 0.35) / Math.max(plan.routeStepSpan ?? 1.2, 0.65));
const depthBoost = depth >= 68 ? 1 : depth >= 54 && rhythm.forwardPasses >= 1 ? 0.5 : 0;
return clamp(Math.floor(rawStage + depthBoost), 0, laneCount - 1);
}
function createAutoPilotPossessionPlan(teamId, startPoint, profile) {
const sideSign = getWideSideSign(startPoint) || randomSign();
const farSideSign = -sideSign;
const directStyle = profile.directness >= 0.68 || isTransitionAttackStyle(profile.styleKey);
const wideStyle = profile.crossBias >= 0.62 || profile.overlapBias >= 0.62;
const route = createAutoPilotPossessionRoute(teamId, profile, sideSign, farSideSign);
const opening = createAutoPilotOpeningVariation(teamId, profile, sideSign, farSideSign, route);
const preferredLaneOptions = wideStyle
? [getLaneForSideSign(sideSign, "wide"), getLaneForSideSign(sideSign, "half"), getLaneForSideSign(farSideSign, "wide")]
: directStyle
? ["central", getLaneForSideSign(sideSign, "half")]
: ["central", getLaneForSideSign(sideSign, "half"), getLaneForSideSign(farSideSign, "half")];
const preferredLane = chooseWeightedOption(preferredLaneOptions, (lane) => {
const baseWeight = lane === "central"
? directStyle ? 1.15 : 1.08
: lane.includes("Wide")
? wideStyle ? 1.18 : 0.72
: 0.92;
const routeLaneFit = route.lanes?.includes(lane) ? 0.22 : 0;
const openingLaneFit = opening.lanes?.includes(lane) ? 0.18 : 0;
const repeatPenalty = getAutoPilotPlanRepeatPenalty(teamId, profile, "preferredLane", lane, 4) * 0.82;
return baseWeight + routeLaneFit + openingLaneFit + randomBetween(-0.04, 0.08) - repeatPenalty;
});
const secondaryLane = preferredLane === "central"
? getLaneForSideSign(sideSign, wideStyle ? "wide" : "half")
: getLaneForSideSign(farSideSign, wideStyle ? "wide" : "half");
const plan = {
teamId,
startIndex: getAutoPilotPossessionStartIndex(teamId),
styleKey: profile.styleKey,
formation: profile.formation,
preferredLane,
secondaryLane,
routeKey: route.key,
routeLabel: route.label,
routeLanes: route.lanes,
routeIntents: route.intents,
routeStepSpan: route.stepSpan,
openingKey: opening.key,
openingLabel: opening.label,
openingLanes: opening.lanes,
openingFamilies: opening.families,
openingReceiverRoles: opening.receiverRoles,
openingStepLimit: opening.stepLimit,
openingLongPassPenalty: opening.longPassPenalty,
intentSequence: getAutoPilotStyleIntentSequence(profile.styleKey),
switchAfter: Math.round(randomBetween(wideStyle ? 2 : 3, wideStyle ? 4 : 5)),
escalateAfter: Math.round(randomBetween(directStyle ? 1 : 3, directStyle ? 3 : 6)),
lanePatience: randomBetween(0.82, 1.18),
tempoNudge: randomBetween(-0.08, 0.1) + opening.tempoNudge,
createdAt: state.time,
};
rememberAutoPilotPossessionPlan(plan);
return plan;
}
function getAutoPilotPossessionPlan(teamId, startPoint, profile) {
const startIndex = getAutoPilotPossessionStartIndex(teamId);
if (
!state.autoPilotPlay?.possessionPlan ||
state.autoPilotPlay.possessionPlan.teamId !== teamId ||
state.autoPilotPlay.possessionPlan.startIndex !== startIndex ||
state.autoPilotPlay.possessionPlan.styleKey !== profile.styleKey
) {
state.autoPilotPlay.possessionPlan = createAutoPilotPossessionPlan(teamId, startPoint, profile);
}
return state.autoPilotPlay.possessionPlan;
}
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
function getOpponentBlockReadProfile(teamId, ballPoint = state.ball.position) {
const opponentTeamId = getOtherTeamId(teamId);
if (!opponentTeamId) {
return {
compactCenter: 0,
stretchedWidth: 0,
ballSideCompression: 0,
lineGap: 0,
highLine: 0,
deepBlock: 0,
nearBallPressure: 0,
lineDepths: getOpponentLineDepthsForAttackingTeam(teamId, ballPoint),
};
}
const opponents = state.players.filter((player) => player.team === opponentTeamId && !isGoalkeeper(player));
const lineDepths = getOpponentLineDepthsForAttackingTeam(teamId, ballPoint);
if (!opponents.length) {
return {
compactCenter: 0,
stretchedWidth: 0,
ballSideCompression: 0,
lineGap: 0,
highLine: 0,
deepBlock: 0,
nearBallPressure: 0,
lineDepths,
};
}
const ys = opponents.map((player) => player.position.y);
const blockWidth = Math.max(...ys) - Math.min(...ys);
const centralPlayers = opponents.filter((player) => Math.abs(player.position.y - pitch.width / 2) <= 18).length;
const centralDensity = centralPlayers / opponents.length;
const ballSide = getWideSideSign(ballPoint) || 1;
const ballSidePlayers = opponents.filter((player) => {
const side = getWideSideSign(player) || ballSide;
return side === ballSide || Math.abs(player.position.y - pitch.width / 2) <= 8;
}).length;
const farSidePlayers = opponents.length - ballSidePlayers;
const midfieldBackGap = Math.max(0, lineDepths.back - lineDepths.midfield);
const forwardMidfieldGap = Math.max(0, lineDepths.midfield - lineDepths.forward);
const lineGap = Math.max(midfieldBackGap, forwardMidfieldGap);
const nearBallOpponents = getOpponentDensityAtPoint(teamId, ballPoint, 12.5);
return {
compactCenter: clamp(centralDensity * 0.72 + (1 - blockWidth / 54) * 0.42, 0, 1),
stretchedWidth: clamp((blockWidth - 42) / 22, 0, 1),
ballSideCompression: clamp((ballSidePlayers - farSidePlayers + 1) / Math.max(opponents.length * 0.55, 1), 0, 1),
lineGap: clamp((lineGap - 7) / 8, 0, 1),
rawLineGapMeters: lineGap,
highLine: clamp((64 - lineDepths.back) / 16, 0, 1),
deepBlock: clamp((lineDepths.back - 76) / 16, 0, 1),
nearBallPressure: clamp(nearBallOpponents / 4, 0, 1),
ballSide,
blockWidth,
lineDepths,
};
}
function getAutoPilotOpponentBlockReadAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return {
score: 0,
labels: [],
block: null,
};
}
const teamId = carrier.team;
const block = getOpponentBlockReadProfile(teamId, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetLane = getPitchLaneKey(candidate.target);
const startLane = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetIsWide = targetLane === "leftWide" || targetLane === "rightWide";
const targetIsCentral =
targetLane === "central" ||
targetLane === "leftHalf" ||
targetLane === "rightHalf";
const highValueException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
targetThreat.value >= 0.64 ||
targetThreat.box >= 0.3;
const labels = [];
let score = 0;
if (
block.ballSideCompression >= 0.5 &&
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 16
) {
score += 0.24 + block.ballSideCompression * 0.28 + profile.switchBias * 0.18;
labels.push("Exploit weak side");
}
if (block.compactCenter >= 0.58) {
if (targetIsWide && forwardGain >= -2) {
score += 0.16 + block.compactCenter * 0.18 + profile.widthDiscipline * 0.12;
labels.push("Stretch compact block");
} else if (
!highValueException &&
targetIsCentral &&
actionSpace.lineBreakCount === 0 &&
actionSpace.openTarget < 0.46 &&
forwardGain < 5
) {
score -= 0.24 + block.compactCenter * 0.22;
}
}
if (
block.stretchedWidth >= 0.42 &&
targetIsCentral &&
forwardGain >= 3 &&
(targetThreat.betweenLines >= 0.3 || actionSpace.lineBreakCount >= 1 || targetThreat.centralPocket >= 0.28)
) {
score += 0.18 + block.stretchedWidth * 0.24 + profile.lineBreakBias * 0.16;
labels.push("Play through stretched block");
}
if (
block.lineGap >= 0.42 &&
candidate.actionType === "pass" &&
forwardGain >= 3 &&
(targetThreat.betweenLines >= 0.34 || actionSpace.targetGameSpaceKey === "space2")
) {
score += 0.22 + block.lineGap * 0.28 + profile.shortSupport * 0.12;
labels.push("Find gap between lines");
}
if (block.highLine >= 0.38) {
const attacksDepth =
actionSpace.targetGameSpaceKey === "space3" ||
targetThreat.behindLine >= 0.3 ||
candidate.isLineBreak ||
pattern.family === "front-line";
if ((candidate.actionType === "pass" || candidate.actionType === "dribble") && attacksDepth && forwardGain >= 6) {
score += 0.22 + block.highLine * 0.32 + profile.directness * 0.16;
labels.push("Attack high line");
}
}
if (block.deepBlock >= 0.38) {
if (
candidate.actionType === "shot" ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
candidate.isBoxPass ||
targetThreat.cutbackZone >= 0.32
) {
score += 0.18 + block.deepBlock * 0.22 + profile.deliveryBias * 0.12;
labels.push("Break down deep block");
} else if (
!highValueException &&
candidate.actionType === "pass" &&
passDistance >= 28 &&
forwardGain >= 8 &&
actionSpace.targetGameSpaceKey === "space3"
) {
score -= 0.22 + block.deepBlock * 0.18;
}
}
if (block.nearBallPressure >= 0.5) {
if (
candidate.actionType === "pass" &&
(candidate.isSwitch || pattern.family === "support-link" || pattern.family === "line-break") &&
(candidate.laneClarity ?? 0.5) >= 0.42
) {
score += 0.12 + block.nearBallPressure * 0.18;
labels.push("Play away from pressure");
}
if (
!highValueException &&
candidate.actionType === "dribble" &&
actionSpace.openTarget < 0.46 &&
forwardGain < 7
) {
score -= 0.2 + block.nearBallPressure * 0.22;
}
}
return {
score: clamp(score, -0.88, 1),
labels: uniquePrincipleLabels(labels),
block,
};
}
function isLastStepKickoffResetForTeam(teamId) {
const lastStep = state.sequence?.steps?.[state.sequence.steps.length - 1];
return (
lastStep?.restartPhase?.type === "kickoff" &&
getRecordedStepPossessionTeamId(lastStep) === teamId
);
}
function getRecentLaneRepeatCount(teamId, laneKey, thirdKey = null, limit = 4) {
return getRecentPossessionSteps(teamId, limit).reduce((count, step) => {
const target = step.target;
if (!target || getPitchLaneKey(target) !== laneKey) {
return count;
}
if (thirdKey && getAttackingThirdKey(target, teamId) !== thirdKey) {
return count;
}
return count + 1;
}, 0);
}
function isFrontLineRole(roleKey) {
return roleKey === "striker" || roleKey === "secondStriker" || roleKey === "wideForward";
}
function isSupportRole(roleKey) {
return roleKey === "pivot" || roleKey === "connector" || roleKey === "wideBack";
}
function getStepReceiverRoleKey(step, teamId) {
const receiver = getPlayerById(step?.receiverPlayerId);
if (!receiver || receiver.team !== teamId) {
return null;
}
return getOffensiveRoleKey(receiver, teams[teamId]?.formation);
}
function getAutoPilotFlowContext(carrier, startPoint) {
const teamId = carrier.team;
const recent = getRecentPossessionSteps(teamId, 6);
const lastStep = recent[0] ?? null;
const carrierRoleKey = getOffensiveRoleKey(carrier, teams[teamId]?.formation);
let consecutivePasses = 0;
let recentFrontLineTargets = 0;
let recentSupportTargets = 0;
let recentWideTargets = 0;
const receiverRoleCounts = new Map();
recent.forEach((step, index) => {
if (index === consecutivePasses && step.actionType === "pass") {
consecutivePasses += 1;
}
const receiverRoleKey = getStepReceiverRoleKey(step, teamId);
if (receiverRoleKey) {
receiverRoleCounts.set(receiverRoleKey, (receiverRoleCounts.get(receiverRoleKey) ?? 0) + 1);
if (isFrontLineRole(receiverRoleKey)) {
recentFrontLineTargets += 1;
}
if (isSupportRole(receiverRoleKey)) {
recentSupportTargets += 1;
}
}
if (step.target) {
const laneKey = getPitchLaneKey(step.target);
if (laneKey === "leftWide" || laneKey === "rightWide") {
recentWideTargets += 1;
}
}
});
const carrierJustReceived =
lastStep?.actionType === "pass" &&
lastStep.receiverPlayerId === carrier.id &&
getRecordedStepDuration(lastStep) <= 3.2;
const lastCarrierId = lastStep?.beforeSnapshot?.ball?.ownerPlayerId ?? lastStep?.carrierPlayerId ?? null;
const lastReceiverId = lastStep?.receiverPlayerId ?? null;
return {
recent,
lastStep,
carrierRoleKey,
carrierJustReceived,
consecutivePasses,
recentFrontLineTargets,
recentSupportTargets,
recentWideTargets,
receiverRoleCounts,
lastCarrierId,
lastReceiverId,
pressure: getPlayerPressureLoad(carrier, startPoint),
};
}
function getLastAutoPrincipleSet(teamId) {
const lastStep = getRecentPossessionSteps(teamId, 4)[0] ?? null;
const labels = [
...(lastStep?.autoPrinciples ?? []),
lastStep?.offensiveAutopilot?.principleLabel,
lastStep?.offensiveAutopilot?.principleKey,
].filter(Boolean);
return new Set(labels);
}
function principleSetIncludes(principles, text) {
return [...principles].some((label) => `${label}`.toLowerCase().includes(text.toLowerCase()));
}
function isTransitionAttackStyle(styleKey) {
return [
"direct-transition",
"counter-attack",
"fluid-counter-attack",
"gegenpress",
"vertical-play",
"vertical-tiki-taka",
].includes(styleKey);
}
function getSecurePossessionSnapshotForTeam(teamId, actionMeta = null) {
const secure = state.ball.securePossession ?? actionMeta?.beforeSnapshot?.ball?.securePossession ?? null;
if (!secure?.ownerPlayerId) {
return null;
}
const owner = getPlayerById(secure.ownerPlayerId);
return owner?.team === teamId ? secure : null;
}
function getAutoPilotRegainContext(carrier, startPoint = carrier?.position, profile = {}) {
if (!carrier) {
return { active: false };
}
const secure = getSecurePossessionSnapshotForTeam(carrier.team);
if (!secure || secure.ownerPlayerId !== carrier.id) {
return { active: false };
}
const origin = secure.point ?? startPoint ?? carrier.position;
const movedFromRegain = distance(startPoint ?? carrier.position, origin);
const elapsed = Math.max(0, state.time - (secure.createdAt ?? state.time));
const minDistance = secure.minDistanceToExpire ?? 6;
const minTime = secure.minTimeToExpire ?? 1.35;
const freshness = clamp(
1 - Math.max(movedFromRegain / Math.max(minDistance * 1.25, 0.01), elapsed / Math.max(minTime * 1.25, 0.01)),
0,
1
);
if (freshness <= 0.02) {
return { active: false };
}
const pressure = getPlayerPressureLoad(carrier, startPoint ?? carrier.position);
const forwardProbe = clampToPitch({
x: (startPoint?.x ?? carrier.position.x) + getAttackDirectionSign(carrier.team) * 18,
y: lerp(startPoint?.y ?? carrier.position.y, pitch.width / 2, 0.28),
}, 2.5);
const forwardOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, forwardProbe));
const localSupport = getTeamSupportCountAroundPoint(carrier.team, startPoint ?? carrier.position, new Set([carrier.id]), 13);
const directStyle = isTransitionAttackStyle(profile.styleKey);
const counterIntent = clamp(
(profile.directness ?? 0.5) * 0.42 +
(profile.progressionUrgency ?? 0.5) * 0.32 +
(profile.tempo ?? 0.5) * 0.14 +
(directStyle ? 0.22 : 0) +
(secure.reason === "interception" ? 0.1 : 0),
0,
1.25
);
const secureIntent = clamp(
(profile.shortSupport ?? 0.5) * 0.38 +
(profile.recycleWindow ?? 0.4) * 0.22 +
pressure * 0.34 +
(localSupport >= 2 ? 0.14 : 0) +
(directStyle ? -0.08 : 0.18),
0,
1.2
);
return {
active: true,
reason: secure.reason ?? "regain",
origin: cloneVector(origin),
movedFromRegain,
elapsed,
freshness,
pressure,
forwardOpenSpace,
localSupport,
directStyle,
counterIntent,
secureIntent,
};
}
function getAutoPilotCandidatePattern(candidate, carrier, startPoint) {
if (!candidate || !carrier || !candidate.target) {
return {
family: "unknown",
laneKey: "central",
thirdKey: "build",
receiverRoleKey: null,
targetSpaceLabel: "open space",
forwardGain: 0,
passDistance: 0,
};
}
const targetLaneKey = getPitchLaneKey(candidate.target);
const targetThirdKey = getAttackingThirdKey(candidate.target, carrier.team);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const targetSpace = getPitchThreatProfile(candidate.target, carrier.team);
let family = "connect";
if (candidate.actionType === "shot") {
family = "shot";
} else if (candidate.actionType === "dribble") {
family = forwardGain >= 6 ? "carry-forward" : "carry-control";
} else if (candidate.actionType === "pass") {
if (candidate.label === "cutback") {
family = "cutback";
} else if (candidate.label === "cross") {
family = "cross";
} else if (candidate.isSwitch) {
family = "switch";
} else if (candidate.principleKey?.includes("wide") || candidate.label === "wide entry") {
family = "wide-overload";
} else if (candidate.isLineBreak || forwardGain >= 8) {
family = "line-break";
} else if (forwardGain <= -4.5) {
family = "recycle";
} else if (passDistance <= 17 && isSupportRole(receiverRoleKey)) {
family = "support-link";
} else if (isFrontLineRole(receiverRoleKey)) {
family = "front-line";
}
}
return {
family,
laneKey: targetLaneKey,
thirdKey: targetThirdKey,
receiverRoleKey,
targetSpaceLabel: targetSpace.primaryLabel,
forwardGain,
passDistance,
};
}
function getRecordedStepPattern(step, teamId) {
if (!step?.target || !teamId) {
return null;
}
const startPoint = step.beforeSnapshot?.ball?.position ?? null;
const target = step.target;
const targetLaneKey = getPitchLaneKey(target);
const targetThirdKey = getAttackingThirdKey(target, teamId);
const forwardGain =
startPoint && target
? (target.x - startPoint.x) * getAttackDirectionSign(teamId)
: 0;
const lateralMeters = startPoint && target ? Math.abs(target.y - startPoint.y) : 0;
const passDistance = startPoint && target ? distance(startPoint, target) : 0;
const receiverRoleKey = getStepReceiverRoleKey(step, teamId);
const targetSpace = getPitchThreatProfile(target, teamId);
const principleText = [
...(step.autoPrinciples ?? []),
step.offensiveAutopilot?.principleKey,
step.offensiveAutopilot?.principleLabel,
step.profileLabel,
].filter(Boolean).join(" ").toLowerCase();
let family = "connect";
if (step.actionType === "shot") {
family = "shot";
} else if (step.actionType === "dribble") {
family = forwardGain >= 6 ? "carry-forward" : "carry-control";
} else if (step.actionType === "pass") {
if (principleText.includes("cutback") || step.profileLabel?.toLowerCase?.().includes("cutback")) {
family = "cutback";
} else if (principleText.includes("cross")) {
family = "cross";
} else if (principleText.includes("change corridor") || (lateralMeters >= 19 && passDistance >= 22)) {
family = "switch";
} else if (principleText.includes("wide") || principleText.includes("overlap")) {
family = "wide-overload";
} else if (principleText.includes("line break") || forwardGain >= 8) {
family = "line-break";
} else if (forwardGain <= -4.5) {
family = "recycle";
} else if (passDistance <= 17 && isSupportRole(receiverRoleKey)) {
family = "support-link";
} else if (isFrontLineRole(receiverRoleKey)) {
family = "front-line";
}
}
return {
family,
laneKey: targetLaneKey,
thirdKey: targetThirdKey,
receiverRoleKey,
targetSpaceLabel: targetSpace.primaryLabel,
forwardGain,
passDistance,
};
}
function getRecordedStepActorIds(step) {
return {
carrierId:
step?.beforeSnapshot?.ball?.ownerPlayerId ??
step?.carrierPlayerId ??
step?.initiatorPlayerId ??
null,
receiverId:
step?.receiverPlayerId ??
step?.afterSnapshot?.ball?.ownerPlayerId ??
null,
};
}
function getAutoPilotPossessionLoopAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const recent = getRecentPossessionSteps(teamId, 8);
if (!recent.length) {
return { score: 0, labels: [], context: null };
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const rhythm = getPossessionRhythmContext(teamId, 8);
const lastStep = recent[0] ?? null;
const lastActors = getRecordedStepActorIds(lastStep);
const candidateReceiverId = candidate.receiverPlayerId ?? null;
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const laneShiftFromLast = lastStep?.target
? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(getPitchLaneKey(lastStep.target)))
: 0;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const sameLaneThirdCount = recent
.map((step) => getRecordedStepPattern(step, teamId))
.filter(Boolean)
.filter((entry) => entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey)
.length;
const sameTargetClusterCount = recent
.filter((step) => step.target && distance(step.target, candidate.target) <= 8.5)
.length;
const sameReceiverCount = candidateReceiverId
? recent.filter((step) => (getRecordedStepActorIds(step).receiverId ?? null) === candidateReceiverId).length
: 0;
const samePairCount = candidateReceiverId
? recent.filter((step) => {
const actors = getRecordedStepActorIds(step);
return actors.carrierId === carrier.id && actors.receiverId === candidateReceiverId;
}).length
: 0;
const directReturn =
candidate.actionType === "pass" &&
candidateReceiverId &&
lastActors.carrierId === candidateReceiverId &&
lastActors.receiverId === carrier.id;
const thirdPlayerRelease =
candidate.actionType === "pass" &&
candidateReceiverId &&
candidateReceiverId !== lastActors.carrierId &&
candidateReceiverId !== lastActors.receiverId &&
pattern.forwardGain >= 2.5;
const highValueException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= 0.66 ||
actionSpace.lineBreakCount >= 2;
const staleLowValue =
!highValueException &&
pattern.forwardGain < 4 &&
!candidate.isSwitch &&
actionSpace.value < 0.42;
const labels = [];
let score = 0;
if (directReturn && staleLowValue && pressure < 0.62) {
score -= 0.92 + profile.progressionUrgency * 0.34;
labels.push("Avoid two-player loop");
} else if (directReturn && pattern.forwardGain >= 5 && (candidate.isLineBreak || actionSpace.lineBreakCount >= 1)) {
score += 0.18;
labels.push("Bounce forward");
}
if (samePairCount >= 1 && staleLowValue && pressure < 0.66) {
score -= 0.42 + Math.min(samePairCount, 3) * 0.22;
labels.push("Find third player");
}
if (sameReceiverCount >= 2 && staleLowValue) {
score -= 0.26 + Math.min(sameReceiverCount - 1, 3) * 0.16;
}
if (sameTargetClusterCount >= 2 && staleLowValue) {
score -= 0.36 + Math.min(sameTargetClusterCount, 4) * 0.18;
labels.push("Leave repeated zone");
}
if (sameLaneThirdCount >= 3 && staleLowValue) {
score -= 0.34 + Math.min(sameLaneThirdCount - 2, 3) * 0.18;
labels.push("Change corridor");
}
if (
rhythm.steps >= 3 &&
rhythm.forwardPasses === 0 &&
rhythm.lineBreaks === 0 &&
pattern.forwardGain < 3 &&
!candidate.isSwitch &&
candidate.actionType !== "shot"
) {
score -= 0.48 + profile.progressionUrgency * 0.42;
labels.push("Break sterile circulation");
}
if (
rhythm.steps >= 2 &&
(candidate.isLineBreak || actionSpace.lineBreakCount >= 1 || pattern.forwardGain >= 7) &&
(sameLaneThirdCount >= 2 || rhythm.backPasses >= 1 || rhythm.sidewaysPasses >= 2)
) {
score += 0.26 + profile.progressionUrgency * 0.22;
labels.push("Play out of the loop");
}
if (
thirdPlayerRelease &&
(samePairCount >= 1 || directReturn || sameLaneThirdCount >= 2 || rhythm.sidewaysPasses >= 2) &&
actionSpace.targetPressure <= 0.74
) {
score += 0.22 + profile.shortSupport * 0.12 + profile.tempo * 0.1;
labels.push("Third-player release");
}
if (
candidate.actionType === "dribble" &&
pattern.forwardGain >= 4.5 &&
(rhythm.sidewaysPasses >= 2 || sameLaneThirdCount >= 2) &&
pressure <= 0.68
) {
score += 0.24 + profile.carryBias * 0.22;
labels.push("Carry out of pressure");
}
if (
candidate.isSwitch &&
laneShiftFromLast >= 2 &&
(sameLaneThirdCount >= 2 || rhythm.sidewaysPasses >= 1) &&
(candidate.laneClarity ?? 0.5) >= 0.42
) {
score += 0.24 + profile.switchBias * 0.22;
labels.push("Escape to weak side");
}
return {
score: clamp(score, -1.75, 0.88),
labels: uniquePrincipleLabels(labels),
context: {
sameLaneThirdCount,
sameTargetClusterCount,
sameReceiverCount,
samePairCount,
directReturn,
thirdPlayerRelease,
pattern,
},
};
}
function getAutoPilotCorridorTempoReleaseAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const recent = getRecentPossessionSteps(teamId, 7);
if (recent.length < 2) {
return { score: 0, labels: [], context: null };
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const recentPatterns = recent
.map((step) => getRecordedStepPattern(step, teamId))
.filter(Boolean);
const rhythm = getPossessionRhythmContext(teamId, 8);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const targetThreat = getPitchThreatProfile(candidate.target, teamId);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const startGameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const targetGameSpace = getAttackingGameSpaceProfile(candidate.target, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const startLaneIndex = getPitchLaneIndex(startPoint);
const targetLaneIndex = getPitchLaneIndex(pattern.laneKey);
const laneShiftFromStart = Math.abs(targetLaneIndex - startLaneIndex);
const lastPattern = recentPatterns[0] ?? null;
const laneShiftFromLast = lastPattern
? Math.abs(targetLaneIndex - getPitchLaneIndex(lastPattern.laneKey))
: laneShiftFromStart;
const currentThirdKey = getAttackingThirdKey(startPoint, teamId);
const sameCorridorRecent = recentPatterns
.slice(0, 4)
.filter((entry) => entry.laneKey === getPitchLaneKey(startPoint) && entry.thirdKey === currentThirdKey)
.length;
const consecutiveSameCorridor = (() => {
let count = 0;
for (const entry of recentPatterns) {
if (entry.laneKey === getPitchLaneKey(startPoint) && entry.thirdKey === currentThirdKey) {
count += 1;
} else {
break;
}
}
return count;
})();
const recentThreatGain = recent
.slice(0, 4)
.reduce((total, step) => {
const from = step.beforeSnapshot?.ball?.position ?? null;
const to = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return from && to ? total + Math.max(0, getActionThreatGain(from, to, teamId)) : total;
}, 0);
const corridorLoad = clamp(
sameCorridorRecent * 0.22 +
consecutiveSameCorridor * 0.28 +
rhythm.sidewaysPasses * 0.14 +
rhythm.backPasses * 0.18 +
(rhythm.lineBreaks === 0 ? 0.22 : -0.16) +
(recentThreatGain <= 0.12 ? 0.18 : -0.12),
0,
1.45
);
const finalThirdStart = getAttackingDepth(startPoint, teamId) >= 66 || startThreat.value >= 0.52;
const wideStart = isWideChannel(startPoint);
const highValueAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= startThreat.value + 0.09 ||
actionSpace.lineBreakCount >= 1 ||
targetGameSpace.index > startGameSpace.index;
const switchRelease =
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShiftFromStart >= 2 || laneShiftFromLast >= 2) &&
(candidate.laneClarity ?? 0.55) >= 0.42 &&
actionSpace.targetPressure <= 0.76;
const diagonalRelease =
candidate.actionType === "pass" &&
laneShiftFromStart >= 1 &&
pattern.forwardGain >= 4.5 &&
actionSpace.targetPressure <= 0.7 &&
(targetGameSpace.index >= startGameSpace.index || targetThreat.value >= startThreat.value + 0.05);
const carryRelease =
candidate.actionType === "dribble" &&
pattern.forwardGain >= 4.5 &&
actionSpace.openTarget >= 0.45 &&
pressure <= 0.68;
const endProductRelease =
finalThirdStart &&
(
candidate.actionType === "shot" ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
targetThreat.cutbackZone >= 0.32 ||
targetThreat.box >= 0.28
);
const sterileSameCorridor =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
laneShiftFromStart <= 1 &&
pattern.forwardGain < 3.5 &&
actionSpace.lineBreakCount === 0 &&
targetThreat.value <= startThreat.value + 0.04;
const hopefulRelease =
switchRelease &&
(candidate.laneClarity ?? 0.55) < 0.52 &&
actionSpace.targetPressure >= 0.62 &&
!highValueAction;
const stylePrefersCirculation =
profile.styleKey === "control-possession" ||
profile.styleKey === "tiki-taka" ||
profile.styleKey === "fluid-combinations";
const stylePrefersWidth =
profile.styleKey === "wing-play" ||
profile.styleKey === "overlap-wide" ||
profile.crossBias >= 0.64;
const labels = [];
let score = 0;
if (corridorLoad >= 0.58) {
if (diagonalRelease) {
score += 0.28 + profile.lineBreakBias * 0.16 + (stylePrefersCirculation ? 0.1 : 0);
labels.push("Corridor: diagonal release");
}
if (switchRelease) {
score += 0.22 + profile.switchBias * 0.2 + (stylePrefersWidth ? 0.08 : 0);
labels.push("Corridor: change point of attack");
}
if (carryRelease) {
score += 0.22 + profile.carryBias * 0.18;
labels.push("Corridor: carry out of lane");
}
if (endProductRelease) {
score += 0.3 + profile.shootBias * 0.16 + profile.deliveryBias * 0.12;
labels.push("Corridor: create end product");
}
if (sterileSameCorridor && pressure <= 0.62) {
score -= 0.36 + corridorLoad * 0.42 + profile.progressionUrgency * 0.2;
labels.push("Corridor: stop same-lane circulation");
}
}
if (
wideStart &&
stylePrefersWidth &&
sameCorridorRecent >= 2 &&
!endProductRelease &&
candidate.actionType === "pass" &&
!candidate.isSwitch &&
targetThreat.assistZone < 0.28 &&
targetThreat.cutbackZone < 0.28
) {
score -= 0.2 + profile.crossBias * 0.12;
labels.push("Corridor: finish wide overload");
}
if (hopefulRelease) {
score -= 0.18 + (1 - (candidate.laneClarity ?? 0.55)) * 0.22;
}
if (corridorLoad < 0.46 && sterileSameCorridor && rhythm.steps <= 1 && stylePrefersCirculation) {
score += 0.08;
}
return {
score: clamp(score, -1.25, 1.05),
labels: uniquePrincipleLabels(labels),
context: {
corridorLoad,
sameCorridorRecent,
consecutiveSameCorridor,
recentThreatGain,
laneShiftFromStart,
laneShiftFromLast,
startGameSpaceKey: startGameSpace.key,
targetGameSpaceKey: targetGameSpace.key,
switchRelease,
diagonalRelease,
carryRelease,
endProductRelease,
sterileSameCorridor,
},
};
}
function getAutoPilotCombinationChainContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const recent = getRecentPossessionSteps(teamId, 6);
const lastStep = recent[0] ?? null;
if (!lastStep || lastStep.actionType !== "pass") {
return {
active: false,
recent,
};
}
const actors = getRecordedStepActorIds(lastStep);
const carrierReceived =
actors.receiverId === carrier.id ||
lastStep.afterSnapshot?.ball?.ownerPlayerId === carrier.id;
const duration = getRecordedStepDuration(lastStep);
if (!carrierReceived || duration > 3.4) {
return {
active: false,
recent,
carrierReceived,
duration,
};
}
const incomingStart =
lastStep.beforeSnapshot?.ball?.position ??
lastStep.beforeSnapshot?.ball?.startPosition ??
null;
const incomingTarget = lastStep.target ?? startPoint;
const incomingLane = incomingStart ? getPitchLaneKey(incomingStart) : getPitchLaneKey(incomingTarget);
const currentLane = getPitchLaneKey(startPoint);
const incomingForwardGain =
incomingStart && incomingTarget
? (incomingTarget.x - incomingStart.x) * getAttackDirectionSign(teamId)
: 0;
const incomingLaneShift =
incomingLane && currentLane
? Math.abs(getPitchLaneIndex(currentLane) - getPitchLaneIndex(incomingLane))
: 0;
let consecutivePasses = 0;
for (const step of recent) {
if (step.actionType !== "pass") {
break;
}
consecutivePasses += 1;
}
return {
active: true,
teamId,
recent,
lastStep,
lastCarrierId: actors.carrierId,
lastReceiverId: actors.receiverId,
duration,
incomingStart,
incomingTarget,
incomingLane,
currentLane,
incomingForwardGain,
incomingLaneShift,
consecutivePasses,
pressure: getPlayerPressureLoad(carrier, startPoint),
nearestGap: getNearestOpponentGap(carrier, startPoint),
startThreat: getPitchThreatProfile(startPoint, teamId),
startSpace: getAttackingGameSpaceProfile(startPoint, teamId),
carrierRoleKey: getOffensiveRoleKey(carrier, teams[teamId]?.formation),
tempoFit: clamp((profile.tempo ?? 0.5) * 0.58 + (profile.shortSupport ?? 0.5) * 0.42, 0, 1),
};
}
function getAutoPilotCombinationChainAdjustment(candidate, carrier, startPoint, profile = {}) {
const context = getAutoPilotCombinationChainContext(carrier, startPoint, profile);
if (!context.active || !candidate?.target) {
return {
score: 0,
labels: [],
context,
};
}
const teamId = carrier.team;
const target = candidate.target;
const targetLane = getPitchLaneKey(target);
const laneShiftFromCurrent = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.currentLane));
const laneShiftFromIncoming = context.incomingLane
? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.incomingLane))
: laneShiftFromCurrent;
const candidateReceiver = getAutoPilotCandidateReceiver(candidate, carrier);
const candidateReceiverId =
candidate.receiverPlayerId ??
candidate.principleRunnerPlayerId ??
candidateReceiver?.id ??
null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(candidateReceiver ? getOffensiveRoleKey(candidateReceiver, teams[teamId]?.formation) : null);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const directReturn =
candidate.actionType === "pass" &&
candidateReceiverId &&
candidateReceiverId === context.lastCarrierId;
const thirdPlayerRelease =
candidate.actionType === "pass" &&
candidateReceiverId &&
candidateReceiverId !== context.lastCarrierId &&
candidateReceiverId !== context.lastReceiverId &&
(
forwardGain >= 2.5 ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.38 ||
laneShiftFromIncoming >= 1
);
const wallPassWithPurpose =
directReturn &&
(
context.pressure >= 0.58 ||
forwardGain >= 5 ||
candidate.isLineBreak ||
actionSpace.lineBreakCount >= 1 ||
targetThreat.value >= context.startThreat.value + 0.08
);
const deadBounce =
directReturn &&
!wallPassWithPurpose &&
context.pressure < 0.58 &&
targetThreat.value <= context.startThreat.value + 0.04 &&
!candidate.isSwitch;
const aroundCorner =
thirdPlayerRelease &&
passDistance <= 22 &&
laneShiftFromCurrent >= 1 &&
(receiverRoleKey === "connector" || receiverRoleKey === "pivot" || receiverRoleKey === "wideBack");
const receiveAndDrive =
candidate.actionType === "dribble" &&
forwardGain >= 4.2 &&
context.pressure <= 0.68 &&
(
actionSpace.openTarget >= 0.42 ||
context.startSpace.key === "space2" ||
context.startThreat.betweenLines >= 0.3 ||
context.startThreat.halfSpace >= 0.3
);
const lowValueSafety =
candidate.actionType === "pass" &&
forwardGain <= -4.5 &&
context.pressure <= 0.48 &&
targetThreat.value <= context.startThreat.value + 0.035 &&
actionSpace.lineBreakCount === 0;
const labels = [];
let score = 0;
if (thirdPlayerRelease) {
score +=
0.24 +
context.tempoFit * 0.24 +
(profile.lineBreakBias ?? 0.5) * 0.12 +
Math.max(0, targetThreat.value - context.startThreat.value) * 0.3 +
(actionSpace.lineBreakCount >= 1 ? 0.16 : 0);
labels.push("Third-man chain");
}
if (aroundCorner) {
score += 0.16 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Play around the corner");
}
if (wallPassWithPurpose) {
score += 0.14 + context.pressure * 0.12 + (candidate.isLineBreak ? 0.12 : 0);
labels.push("Wall pass with purpose");
}
if (receiveAndDrive) {
score +=
0.22 +
(profile.carryBias ?? 0.5) * 0.18 +
actionSpace.openTarget * 0.16 +
(context.consecutivePasses >= 2 ? 0.12 : 0);
labels.push("Receive and drive");
}
if (deadBounce) {
score -= 0.78 + Math.max(0, 0.62 - context.pressure) * 0.28;
labels.push("Avoid dead bounce");
}
if (lowValueSafety && !deadBounce) {
score -= 0.28 + (profile.progressionUrgency ?? 0.5) * 0.2;
}
if (
context.consecutivePasses >= 2 &&
candidate.actionType === "pass" &&
!thirdPlayerRelease &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain < 3 &&
context.pressure < 0.56
) {
score -= 0.18 + Math.min(context.consecutivePasses, 4) * 0.08;
}
return {
score: clamp(score, -1.35, 1.05),
labels: uniquePrincipleLabels(labels),
context: {
directReturn,
thirdPlayerRelease,
wallPassWithPurpose,
receiveAndDrive,
laneShiftFromIncoming,
incomingForwardGain: context.incomingForwardGain,
consecutivePasses: context.consecutivePasses,
},
};
}
function getAutoPilotPassLaneDenialAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!carrier || candidate?.actionType !== "pass" || !candidate.target) {
return {
score: 0,
labels: [],
context: null,
};
}
const risk = getPassLaneRiskProfile(carrier, candidate.target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
});
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const laneDanger = clamp(
Math.max(0, 0.58 - risk.clarity) * 0.7 +
Math.max(0, risk.timingRisk - 0.48) * 0.46 +
Math.max(0, risk.coverShadow - 0.9) * 0.14 +
Math.min(risk.interceptors, 3) * 0.09,
0,
1.25
);
const valueTolerance = clamp(
(profile.risk ?? 0.5) * 0.22 +
targetThreat.value * 0.18 +
(candidate.isLineBreak ? 0.16 : 0) +
(candidate.isBoxPass ? 0.16 : 0) +
(candidate.isSwitch ? 0.12 : 0),
0.08,
0.58
);
const avoidRisk = Math.max(0, laneDanger - valueTolerance);
const score =
avoidRisk > 0
? -clamp(avoidRisk * (0.58 + (profile.directness ?? 0.5) * 0.12), 0, 0.72)
: risk.clarity >= 0.74 && candidate.forwardGain >= 3
? 0.04
: 0;
const labels = [];
if (score < -0.08) {
labels.push("Respect cover shadow");
}
if (risk.interceptors >= 1 && risk.clarity <= 0.5) {
labels.push("Avoid covered lane");
}
return {
score,
labels: uniquePrincipleLabels(labels),
context: {
clarity: risk.clarity,
timingRisk: risk.timingRisk,
coverShadow: risk.coverShadow,
interceptors: risk.interceptors,
laneDanger,
valueTolerance,
},
};
}
function getAutoPilotCounterPressEscapeAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!carrier || !candidate?.target) {
return {
score: 0,
labels: [],
context: null,
};
}
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
if (!regain.active || regain.freshness < 0.08) {
return {
score: 0,
labels: [],
context: null,
};
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const lossPoint = regain.origin ?? startPoint;
const startLossDistance = distance(startPoint, lossPoint);
const targetLossDistance = distance(target, lossPoint);
const escapeGain = targetLossDistance - startLossDistance;
const targetRadius = candidate.actionType === "dribble" ? 8.5 : passDistance >= 22 ? 13.5 : 10.5;
const startPressure = regain.pressure;
const targetPressure = candidate.receiverPressure ?? getOpponentPressureAtPoint(teamId, target, targetRadius + 2);
const startOpponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 7.5);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, targetRadius);
const targetSupport = getTeamDensityAtPoint(
teamId,
target,
targetRadius,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean))
);
const laneClarity =
candidate.actionType === "pass"
? candidate.laneClarity ?? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const trapLoad = clamp(
startPressure * 0.44 +
Math.min(startOpponentDensity, 4) * 0.13 +
regain.freshness * 0.26 +
(regain.reason === "tackle" ? 0.08 : 0),
0,
1.25
);
const escapesCrowd =
escapeGain >= 2.8 ||
targetPressure <= startPressure - 0.16 ||
targetOpponentDensity <= Math.max(0, startOpponentDensity - 1);
const safeOutlet =
candidate.actionType === "pass" &&
passDistance >= 7 &&
passDistance <= 24 &&
laneClarity >= 0.54 &&
targetPressure <= 0.62 &&
targetSupport >= 1;
const transitionRelease =
candidate.actionType === "pass" &&
forwardGain >= 7 &&
laneClarity >= 0.5 &&
targetPressure <= 0.68 &&
(profile.directness >= 0.58 || regain.counterIntent >= 0.58);
const escapeCarry =
candidate.actionType === "dribble" &&
forwardGain >= 3 &&
laneClarity >= 0.5 &&
(escapesCrowd || targetPressure <= 0.52);
const crowdedReturn =
candidate.actionType === "pass" &&
passDistance <= 11.5 &&
escapeGain < 1.2 &&
targetOpponentDensity >= Math.max(2, startOpponentDensity) &&
targetPressure >= 0.5;
const backwardsIntoTrap =
candidate.actionType === "pass" &&
forwardGain < -5 &&
!escapesCrowd &&
targetPressure >= 0.46;
let score = 0;
const labels = [];
if (safeOutlet && trapLoad >= 0.38) {
score += 0.18 + trapLoad * 0.22 + regain.secureIntent * 0.14;
labels.push("Secure away from regain crowd");
}
if (transitionRelease && trapLoad <= 0.94) {
score += 0.14 + regain.counterIntent * regain.freshness * 0.3 + Math.max(0, forwardGain) * 0.006;
labels.push("Attack transition space");
}
if (escapeCarry) {
score += 0.12 + laneClarity * 0.18 + Math.max(0, escapeGain) * 0.025 + regain.counterIntent * 0.08;
labels.push("Carry out of counter-press");
}
if (crowdedReturn) {
score -= 0.34 + trapLoad * 0.28 + targetPressure * 0.18;
labels.push("Avoid regain crowd");
}
if (backwardsIntoTrap) {
score -= 0.18 + trapLoad * 0.18;
labels.push("Avoid counter-press trap");
}
if (trapLoad >= 0.58 && !escapesCrowd && candidate.actionType !== "shot") {
score -= clamp((trapLoad - 0.5) * 0.24 + targetPressure * 0.08, 0, 0.22);
}
return {
score: clamp(score, -0.86, 0.74),
labels: uniquePrincipleLabels(labels),
context: {
trapLoad,
escapeGain,
startPressure,
targetPressure,
startOpponentDensity,
targetOpponentDensity,
targetSupport,
laneClarity,
safeOutlet,
transitionRelease,
escapeCarry,
crowdedReturn,
},
};
}
function getAutoPilotRecoveryFirstActionContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const recent = getRecentPossessionSteps(carrier.team, 5);
const lastStep = recent[0] ?? null;
const isRecovery =
lastStep?.actionType === "recovery" ||
lastStep?.profileKey === "loose-ball-recovery" ||
`${lastStep?.profileLabel ?? ""}`.toLowerCase().includes("loose ball");
if (!isRecovery) {
return { active: false, lastStep };
}
const actors = getRecordedStepActorIds(lastStep);
const recoveredByCarrier =
actors.receiverId === carrier.id ||
actors.carrierId === carrier.id ||
lastStep?.carrierPlayerId === carrier.id ||
lastStep?.afterSnapshot?.ball?.ownerPlayerId === carrier.id;
if (!recoveredByCarrier) {
return { active: false, lastStep, recoveredByCarrier };
}
const recoveryPoint =
lastStep?.target ??
lastStep?.afterSnapshot?.ball?.position ??
startPoint;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const opponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 8.5);
const closeOpponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 5.2);
const localSupport = getTeamSupportCountAroundPoint(
carrier.team,
startPoint,
new Set([carrier.id]),
13
);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(carrier.team) * 18,
y: lerp(startPoint.y, pitch.width / 2, 0.28),
}, 2.5);
const forwardOpenSpace = getCarryLaneOpenSpaceScore(
getNearestOpponentGapInCarryLane(carrier, forwardProbe)
);
const recoveryDuration =
lastStep?.recoveryDuration ??
getRecordedStepDuration(lastStep);
const localTrap = clamp(
pressure * 0.52 +
Math.min(opponentDensity, 4) * 0.12 +
Math.min(closeOpponentDensity, 3) * 0.08 +
(localSupport <= 0 ? 0.18 : 0) +
(recoveryDuration >= 0.9 ? 0.06 : 0),
0,
1.25
);
return {
active: true,
lastStep,
recoveryPoint: cloneVector(recoveryPoint),
recoveryDuration,
pressure,
opponentDensity,
closeOpponentDensity,
localSupport,
localTrap,
forwardOpenSpace,
directStyle: isTransitionAttackStyle(profile.styleKey),
carrierRoleKey: getOffensiveRoleKey(carrier, teams[carrier.team]?.formation),
startThreat: getPitchThreatProfile(startPoint, carrier.team),
};
}
function getAutoPilotRecoveryFirstActionAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotRecoveryFirstActionContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const targetRadius = candidate.actionType === "dribble"
? 8.5
: passDistance >= 24
? 13.5
: 10.5;
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, targetRadius + 1.5);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, targetRadius);
const targetSupport = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 12
);
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const escapeGain =
distance(target, context.recoveryPoint) -
distance(startPoint, context.recoveryPoint);
const spaceGain =
(targetThreat.value ?? 0) -
(context.startThreat?.value ?? 0);
const lateralEscape = Math.abs(target.y - startPoint.y);
const safeFirstPass =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 22 &&
laneClarity >= 0.5 &&
targetPressure <= 0.68 &&
targetSupport >= 1 &&
forwardGain >= -8 &&
(escapeGain >= 1.2 || lateralEscape >= 5 || targetOpponentDensity <= context.opponentDensity);
const carryOut =
candidate.actionType === "dribble" &&
forwardGain >= 2.5 &&
laneClarity >= 0.48 &&
targetPressure <= Math.max(0.48, context.pressure + 0.03) &&
targetOpponentDensity <= Math.max(2, context.opponentDensity);
const transitionRelease =
candidate.actionType === "pass" &&
forwardGain >= 7 &&
laneClarity >= 0.52 &&
targetPressure <= 0.7 &&
targetSupport >= 0 &&
(
context.directStyle ||
(profile.directness ?? 0.5) >= 0.6 ||
context.forwardOpenSpace >= 0.6 ||
spaceGain >= 0.18
);
const forcedLong =
candidate.actionType === "pass" &&
passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!transitionRelease &&
context.localTrap >= 0.42;
const backwardsTrap =
candidate.actionType === "pass" &&
forwardGain < -6 &&
targetPressure >= 0.46 &&
targetSupport <= 1 &&
targetOpponentDensity >= Math.max(1, context.opponentDensity - 1);
const crowdedSameZone =
candidate.actionType !== "shot" &&
Math.abs(forwardGain) <= 3.5 &&
lateralEscape <= 4.5 &&
targetOpponentDensity >= context.opponentDensity &&
targetPressure >= 0.5;
const lowValueInstantShot =
candidate.actionType === "shot" &&
!candidate.mustShoot &&
(targetThreat.value ?? 0) < (context.startThreat?.value ?? 0) + 0.16 &&
(context.pressure >= 0.42 || context.localTrap >= 0.52);
const labels = [];
let score = 0;
if (context.localTrap >= 0.42 && safeFirstPass) {
score += 0.22 + context.localTrap * 0.24 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Recovery first action: secure first pass");
}
if (carryOut) {
score +=
0.12 +
laneClarity * 0.18 +
Math.max(0, escapeGain) * 0.02 +
(profile.carryBias ?? 0.5) * 0.1;
labels.push("Recovery first action: carry out");
}
if (transitionRelease) {
score +=
0.16 +
(profile.directness ?? 0.5) * 0.18 +
context.forwardOpenSpace * 0.14 +
Math.max(0, spaceGain) * 0.28;
labels.push("Recovery first action: attack transition");
}
if (forcedLong) {
score -= 0.42 + context.localTrap * 0.22 + Math.max(0, 0.58 - laneClarity) * 0.24;
labels.push("Recovery first action: avoid forced long ball");
}
if (backwardsTrap) {
score -= 0.28 + targetPressure * 0.18;
labels.push("Recovery first action: avoid backwards trap");
}
if (crowdedSameZone) {
score -= 0.18 + context.localTrap * 0.16;
labels.push("Recovery first action: leave the collision zone");
}
if (lowValueInstantShot) {
score -= 0.22;
}
if (context.localSupport <= 0 && candidate.actionType === "pass" && !transitionRelease) {
score -= 0.12;
}
return {
score: clamp(score, -0.9, 0.78),
labels: uniquePrincipleLabels(labels),
context: {
localTrap: context.localTrap,
pressure: context.pressure,
opponentDensity: context.opponentDensity,
targetOpponentDensity,
localSupport: context.localSupport,
targetSupport,
forwardOpenSpace: context.forwardOpenSpace,
laneClarity,
escapeGain,
spaceGain,
safeFirstPass,
carryOut,
transitionRelease,
forcedLong,
backwardsTrap,
crowdedSameZone,
},
};
}
function getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
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
if (isRecovery && possessionTeamId === carrier.team) {
recoveryIndex = index;
break;
}
if (possessionTeamId && possessionTeamId !== carrier.team) {
break;
}
}
if (recoveryIndex < 0) {
return { active: false };
}
const actionsAfterRecovery = steps.slice(recoveryIndex + 1);
if (!actionsAfterRecovery.length || actionsAfterRecovery.length > 4) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length };
}
if (actionsAfterRecovery.some((step) => getRecordedStepPossessionTeamId(step) !== carrier.team)) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length };
}
const recoveryStep = steps[recoveryIndex];
const origin =
recoveryStep?.target ??
recoveryStep?.afterSnapshot?.ball?.position ??
startPoint;
const elapsed = actionsAfterRecovery.reduce(
(total, step) => total + getRecordedStepDuration(step),
0
);
if (elapsed > 10.5) {
return { active: false, actionsAfterRecovery: actionsAfterRecovery.length, elapsed };
}
const originDepth = getAttackingDepth(origin, carrier.team);
const currentDepth = getAttackingDepth(startPoint, carrier.team);
const depthGain = currentDepth - originDepth;
const patterns = actionsAfterRecovery
.map((step) => getRecordedStepPattern(step, carrier.team))
.filter(Boolean);
const sidewaysOrBackCount = patterns.filter((pattern) => pattern.forwardGain <= 2.5).length;
const backwardsCount = patterns.filter((pattern) => pattern.forwardGain < -4).length;
const forwardCount = patterns.filter((pattern) => pattern.forwardGain >= 6).length;
const lineBreakCount = patterns.filter((pattern) => pattern.family === "line-break" || pattern.forwardGain >= 9).length;
const switchCount = patterns.filter((pattern) => pattern.family === "switch").length;
const lanes = patterns.map((pattern) => pattern.laneKey).filter(Boolean);
const laneVariety = new Set(lanes).size;
const sameLaneStall = actionsAfterRecovery.length >= 2 && laneVariety <= 1 && depthGain < 8;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const localSupport = getTeamSupportCountAroundPoint(
carrier.team,
startPoint,
new Set([carrier.id]),
13
);
const opponentDensity = getOpponentDensityAtPoint(carrier.team, startPoint, 9);
const forwardProbe = clampToPitch({
x: startPoint.x + getAttackDirectionSign(carrier.team) * 20,
y: lerp(startPoint.y, pitch.width / 2, 0.26),
}, 2.5);
const forwardOpenSpace = getCarryLaneOpenSpaceScore(
getNearestOpponentGapInCarryLane(carrier, forwardProbe)
);
const directStyle = isTransitionAttackStyle(profile.styleKey);
const controlStyle = ["control-possession", "tiki-taka", "fluid-combinations"].includes(profile.styleKey);
const counterWindow = clamp(
(directStyle ? 0.34 : 0) +
(profile.directness ?? 0.5) * 0.26 +
(profile.progressionUrgency ?? 0.5) * 0.16 +
forwardOpenSpace * 0.24 +
(pressure <= 0.42 ? 0.12 : 0) -
Math.max(0, actionsAfterRecovery.length - 2) * 0.08,
0,
1.1
);
const secureNeed = clamp(
pressure * 0.38 +
Math.min(opponentDensity, 4) * 0.11 +
(localSupport <= 1 ? 0.18 : 0) +
(controlStyle ? 0.14 : 0) +
(depthGain < 4 ? 0.08 : 0),
0,
1.1
);
const stalePossession =
actionsAfterRecovery.length >= 2 &&
depthGain < 8 &&
sidewaysOrBackCount >= 2 &&
lineBreakCount === 0;
const mode =
counterWindow >= Math.max(0.58, secureNeed + 0.12)
? "counter"
: secureNeed >= 0.58
? "secure"
: "establish";
return {
active: true,
recoveryIndex,
actionsAfterRecovery: actionsAfterRecovery.length,
elapsed,
origin: cloneVector(origin),
originDepth,
currentDepth,
depthGain,
sidewaysOrBackCount,
backwardsCount,
forwardCount,
lineBreakCount,
switchCount,
laneVariety,
sameLaneStall,
pressure,
localSupport,
opponentDensity,
forwardOpenSpace,
directStyle,
controlStyle,
counterWindow,
secureNeed,
stalePossession,
mode,
};
}
function getAutoPilotPostRecoveryPhaseAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const startThreat = getPitchThreatProfile(startPoint, teamId);
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const threatGain = targetThreat.value - startThreat.value;
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, candidate.actionType === "dribble" ? 8.5 : 11.5);
const targetSupport = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 12
);
const laneShift = Math.abs(getPitchLaneIndex(target) - getPitchLaneIndex(startPoint));
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const transitionAttack =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 6 &&
(
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.42 ||
targetThreat.value >= startThreat.value + 0.08 ||
targetThreat.centralPocket >= 0.28 ||
targetThreat.behindLine >= 0.22
) &&
laneClarity >= 0.44 &&
targetPressure <= 0.74;
const secureSupport =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 22 &&
targetPressure <= 0.68 &&
targetSupport >= 1 &&
forwardGain >= -8 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "wideBack" || laneShift >= 1);
const switchOut =
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 16 &&
laneClarity >= 0.54 &&
targetPressure <= 0.62;
const carryProgress =
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
laneClarity >= 0.5 &&
targetPressure <= Math.max(0.52, context.pressure + 0.04);
const finishAttack =
candidate.actionType === "shot" &&
(candidate.mustShoot || candidate.insideBox || startThreat.centralPocket >= 0.36 || startThreat.box >= 0.18);
const lowValueRecycle =
candidate.actionType === "pass" &&
forwardGain <= -4 &&
targetThreat.value <= startThreat.value + 0.04 &&
!candidate.isSwitch &&
context.pressure <= 0.5;
const sameLaneChurn =
candidate.actionType === "pass" &&
Math.abs(forwardGain) <= 3.5 &&
laneShift <= 1 &&
targetThreat.value <= startThreat.value + 0.05 &&
actionSpace.lineBreakCount === 0 &&
!candidate.isSwitch;
const forcedLong =
candidate.actionType === "pass" &&
passDistance >= 30 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!candidate.isLineBreak &&
targetSupport <= 0 &&
laneClarity < 0.62;
const labels = [];
let score = 0;
if (context.mode === "counter") {
if (transitionAttack) {
score += 0.2 + context.counterWindow * 0.34 + Math.max(0, threatGain) * 0.32;
labels.push("Post-recovery: keep counter alive");
}
if (carryProgress) {
score += 0.12 + context.forwardOpenSpace * 0.22 + (profile.carryBias ?? 0.5) * 0.12;
labels.push("Post-recovery: drive transition");
}
if (finishAttack) {
score += 0.14 + context.counterWindow * 0.18;
labels.push("Post-recovery: finish transition");
}
if (lowValueRecycle || sameLaneChurn) {
score -= 0.32 + context.counterWindow * 0.24 + (context.actionsAfterRecovery >= 2 ? 0.12 : 0);
labels.push("Post-recovery: do not kill the counter");
}
} else if (context.mode === "secure") {
if (secureSupport) {
score += 0.2 + context.secureNeed * 0.26 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Post-recovery: stabilise possession");
}
if (switchOut) {
score += 0.14 + context.secureNeed * 0.14 + (profile.switchBias ?? 0.5) * 0.16;
labels.push("Post-recovery: move away from pressure");
}
if (carryProgress && targetPressure <= context.pressure + 0.02) {
score += 0.1 + (profile.carryBias ?? 0.5) * 0.1;
labels.push("Post-recovery: carry into control");
}
if (forcedLong && !transitionAttack) {
score -= 0.34 + context.secureNeed * 0.22;
labels.push("Post-recovery: avoid forced release");
}
} else {
if (transitionAttack && context.forwardCount === 0) {
score += 0.16 + actionSpace.value * 0.24;
labels.push("Post-recovery: progress after secure pass");
}
if (switchOut && (context.sameLaneStall || context.sidewaysOrBackCount >= 1)) {
score += 0.18 + (profile.switchBias ?? 0.5) * 0.18;
labels.push("Post-recovery: change corridor");
}
if (secureSupport && context.pressure >= 0.48 && context.localSupport <= 1) {
score += 0.12 + context.secureNeed * 0.16;
labels.push("Post-recovery: create support angle");
}
if (sameLaneChurn && context.sidewaysOrBackCount >= 1) {
score -= 0.24 + (profile.progressionUrgency ?? 0.5) * 0.18;
labels.push("Post-recovery: avoid same-zone loop");
}
}
if (context.stalePossession) {
if (transitionAttack || switchOut || carryProgress) {
score += 0.18 + (profile.progressionUrgency ?? 0.5) * 0.18;
labels.push("Post-recovery: restart momentum");
} else if (sameLaneChurn || lowValueRecycle) {
score -= 0.28 + (profile.progressionUrgency ?? 0.5) * 0.22;
}
}
if (forcedLong && context.mode !== "counter" && (profile.routeOneBias ?? 0.5) < 0.58) {
score -= 0.18;
}
return {
score: clamp(score, -0.95, 0.9),
labels: uniquePrincipleLabels(labels),
context: {
mode: context.mode,
actionsAfterRecovery: context.actionsAfterRecovery,
elapsed: context.elapsed,
depthGain: context.depthGain,
pressure: context.pressure,
localSupport: context.localSupport,
forwardOpenSpace: context.forwardOpenSpace,
counterWindow: context.counterWindow,
secureNeed: context.secureNeed,
stalePossession: context.stalePossession,
sameLaneStall: context.sameLaneStall,
laneClarity,
targetPressure,
transitionAttack,
secureSupport,
switchOut,
carryProgress,
finishAttack,
lowValueRecycle,
sameLaneChurn,
forcedLong,
},
};
}
function getAutoPilotTransitionNumbersContext(carrier, startPoint, profile = {}) {
if (!carrier?.team || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const postRecovery = getAutoPilotPostRecoveryPhaseContext(carrier, startPoint, profile);
const activeRegain = regain.active && regain.freshness >= 0.08;
const activePostRecovery = postRecovery.active && postRecovery.elapsed <= 8.5;
if (!activeRegain && !activePostRecovery) {
return { active: false, regain, postRecovery };
}
const sign = getAttackDirectionSign(teamId);
const pressure = activeRegain ? regain.pressure : postRecovery.pressure;
const forwardOpenSpace = activeRegain ? regain.forwardOpenSpace : postRecovery.forwardOpenSpace;
const currentDepth = getAttackingDepth(startPoint, teamId);
const maxForwardBand = currentDepth >= 68 ? 28 : 42;
const laneWidth = currentDepth >= 68 ? 28 : 34;
const attackersAhead = state.players
.filter((player) => {
if (player.team !== teamId || player.id === carrier.id || isGoalkeeper(player)) {
return false;
}
const forwardMeters = (player.position.x - startPoint.x) * sign;
return forwardMeters >= 1.5 &&
forwardMeters <= maxForwardBand &&
Math.abs(player.position.y - startPoint.y) <= laneWidth;
})
.reduce((total, player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const roleWeight = isFrontLineRole(roleKey)
? 1
: roleKey === "connector"
? 0.72
: roleKey === "wideBack"
? 0.58
: roleKey === "pivot"
? 0.46
: 0.34;
const runnerWeight = getAutoPilotRoleStrength(player, "runner") * 0.18;
return total + roleWeight + runnerWeight;
}, 0);
const defendersAhead = state.players
.filter((player) => {
if (player.team === teamId || isGoalkeeper(player)) {
return false;
}
const forwardMeters = (player.position.x - startPoint.x) * sign;
return forwardMeters >= -3 &&
forwardMeters <= maxForwardBand + 8 &&
Math.abs(player.position.y - startPoint.y) <= laneWidth + 5;
})
.reduce((total, player) => {
const forwardMeters = (player.position.x - startPoint.x) * sign;
const centralWeight = 1 - clamp(Math.abs(player.position.y - startPoint.y) / (laneWidth + 5), 0, 0.42);
const depthWeight = forwardMeters >= 0 ? 1 : 0.72;
return total + centralWeight * depthWeight;
}, 0);
const nearbySupport = getTeamSupportCountAroundPoint(teamId, startPoint, new Set([carrier.id]), 15);
const transitionAdvantage = clamp(
attackersAhead - defendersAhead * 0.82 + nearbySupport * 0.18 + forwardOpenSpace * 0.72 - pressure * 0.55,
-3.5,
3.5
);
const counterWindow = clamp(
(activeRegain ? regain.counterIntent * regain.freshness : postRecovery.counterWindow) +
forwardOpenSpace * 0.28 +
Math.max(transitionAdvantage, 0) * 0.16 +
(pressure <= 0.42 ? 0.12 : 0) +
(isTransitionAttackStyle(profile.styleKey) ? 0.18 : 0),
0,
1.45
);
const secureNeed = clamp(
(activeRegain ? regain.secureIntent * regain.freshness : postRecovery.secureNeed) +
pressure * 0.28 +
Math.max(defendersAhead - attackersAhead, 0) * 0.1 +
(nearbySupport <= 1 ? 0.14 : 0) -
forwardOpenSpace * 0.1,
0,
1.35
);
return {
active: true,
source: activeRegain ? "freshRegain" : "postRecovery",
pressure,
forwardOpenSpace,
currentDepth,
attackersAhead,
defendersAhead,
nearbySupport,
transitionAdvantage,
counterWindow,
secureNeed,
};
}
function getAutoPilotTransitionNumbersAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotTransitionNumbersContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetThreat = getPitchThreatProfile(target, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const laneShift = Math.abs(getPitchLaneIndex(target) - getPitchLaneIndex(startPoint));
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getOpponentPressureAtPoint(teamId, target, candidate.actionType === "dribble" ? 8.5 : 11.5);
const supportNearTarget = Number.isFinite(candidate.supportNearTarget)
? candidate.supportNearTarget
: getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId].filter(Boolean)),
passDistance >= 24 ? 16 : 12
);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const directAction =
(candidate.actionType === "pass" || candidate.actionType === "dribble") &&
forwardGain >= 6 &&
(
candidate.isLineBreak ||
actionSpace.lineBreakCount >= 1 ||
actionSpace.value >= 0.38 ||
targetThreat.value >= startThreat.value + 0.07 ||
targetThreat.behindLine >= 0.18
) &&
laneClarity >= 0.42 &&
targetPressure <= 0.78;
const secureAction =
candidate.actionType === "pass" &&
passDistance >= 5.5 &&
passDistance <= 22 &&
forwardGain >= -8 &&
targetPressure <= 0.72 &&
(
supportNearTarget >= 1 ||
isSupportRole(receiverRoleKey) ||
receiverRoleKey === "wideBack" ||
laneShift >= 1
);
const carryExploit =
candidate.actionType === "dribble" &&
forwardGain >= 4.5 &&
actionSpace.openTarget >= 0.48 &&
context.pressure <= 0.66;
const finishTransition =
candidate.actionType === "shot" &&
(
candidate.mustShoot ||
targetThreat.box >= 0.2 ||
startThreat.centralPocket >= 0.34 ||
context.currentDepth >= 66
);
const unsupportedForward =
candidate.actionType === "pass" &&
passDistance >= 24 &&
forwardGain >= 8 &&
!candidate.isSwitch &&
supportNearTarget <= 0 &&
targetPressure >= 0.56 &&
laneClarity < 0.68 &&
context.transitionAdvantage < 0.2;
const lowValueKill =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 2 &&
targetThreat.value <= startThreat.value + 0.045 &&
context.counterWindow >= 0.58 &&
context.pressure <= 0.52;
const labels = [];
let score = 0;
if (context.transitionAdvantage >= 0.35 && context.counterWindow >= 0.54) {
if (directAction) {
score += 0.24 + context.counterWindow * 0.24 + Math.max(context.transitionAdvantage, 0) * 0.08;
labels.push("Transition numbers: exploit advantage");
}
if (carryExploit) {
score += 0.16 + context.forwardOpenSpace * 0.22 + (profile.carryBias ?? 0.5) * 0.1;
labels.push("Transition numbers: carry into open grass");
}
if (finishTransition) {
score += 0.16 + (profile.shootBias ?? 0.5) * 0.14;
labels.push("Transition numbers: finish the break");
}
if (lowValueKill) {
score -= 0.32 + context.counterWindow * 0.22;
labels.push("Transition numbers: do not kill advantage");
}
}
if (context.transitionAdvantage <= -0.35 || context.secureNeed >= 0.68) {
if (secureAction) {
score += 0.2 + context.secureNeed * 0.24 + (profile.shortSupport ?? 0.5) * 0.1;
labels.push("Transition numbers: secure against pressure");
}
if (unsupportedForward) {
score -= 0.38 + Math.min(Math.abs(context.transitionAdvantage), 1.4) * 0.18;
labels.push("Transition numbers: avoid unsupported release");
}
}
if (
context.source === "freshRegain" &&
context.pressure <= 0.38 &&
context.transitionAdvantage >= 0 &&
candidate.actionType === "pass" &&
forwardGain <= -4 &&
!candidate.isSwitch
) {
score -= 0.22 + context.counterWindow * 0.16;
}
return {
score: clamp(score, -1.05, 1.05),
labels: uniquePrincipleLabels(labels),
context: {
source: context.source,
transitionAdvantage: context.transitionAdvantage,
attackersAhead: context.attackersAhead,
defendersAhead: context.defendersAhead,
nearbySupport: context.nearbySupport,
counterWindow: context.counterWindow,
secureNeed: context.secureNeed,
laneClarity,
targetPressure,
supportNearTarget,
directAction,
secureAction,
carryExploit,
finishTransition,
unsupportedForward,
lowValueKill,
},
};
}
function getAutoPilotPressureEscapeContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGapToPoint(teamId, startPoint);
const opponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 8.5);
const closeOpponentDensity = getOpponentDensityAtPoint(teamId, startPoint, 5.4);
const supportDensity = getTeamDensityAtPoint(teamId, startPoint, 11.5, new Set([carrier.id]));
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const laneKey = getPitchLaneKey(startPoint);
const sideSign = getWideSideSign(startPoint) || 1;
const isWideTrap = isWidePrincipleZone(startPoint) && opponentDensity >= 2;
const centralTrap =
Math.abs(startPoint.y - pitch.width / 2) <= 15 &&
(pressure >= 0.54 || closeOpponentDensity >= 2);
const trapLoad = clamp(
pressure * 0.52 +
Math.min(opponentDensity, 4) * 0.13 +
Math.min(closeOpponentDensity, 3) * 0.13 -
Math.min(supportDensity, 3) * 0.05 +
(isWideTrap ? 0.12 : 0) +
(centralTrap ? 0.08 : 0) +
(profile.tempo >= 0.64 ? 0.04 : 0),
0,
1.35
);
const active =
trapLoad >= 0.48 ||
pressure >= 0.58 ||
nearestGap <= 3.6 ||
(opponentDensity >= 3 && supportDensity <= 1);
return {
active,
teamId,
pressure,
nearestGap,
opponentDensity,
closeOpponentDensity,
supportDensity,
currentThreat,
currentSpace,
laneKey,
sideSign,
isWideTrap,
centralTrap,
trapLoad,
};
}
function buildAutoPilotPressureTrapEscapeCandidate(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint || state.restartPhase?.type) {
return null;
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const context = getAutoPilotPressureEscapeContext(carrier, startPoint, profile);
const block = getOpponentBlockReadProfile(teamId, startPoint);
const sideSign = context.sideSign || getWideSideSign(startPoint) || 1;
const sideLocked =
block.ballSideCompression >= 0.52 &&
(
isWidePrincipleZone(startPoint) ||
context.pressure >= 0.36 ||
(profile.switchBias ?? 0.5) >= 0.56
);
if (!context.active && !sideLocked) {
return null;
}
const options = [];
const startLaneIndex = getPitchLaneIndex(getPitchLaneKey(startPoint));
const startThreat = getPitchThreatProfile(startPoint, teamId);
const attackSign = getAttackDirectionSign(teamId);
const trapLoad = Math.max(context.trapLoad ?? 0, sideLocked ? 0.54 + block.ballSideCompression * 0.18 : 0);
const addPassOption = (receiver, kind) => {
if (!receiver || receiver.team !== teamId || receiver.id === carrier.id || isPassReceiverOffside(receiver, startPoint)) {
return;
}
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
if (passDistance < 4.2 || passDistance > (kind === "switchAway" ? 44 : kind === "highestOutlet" ? 32 : 24)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const targetLaneIndex = getPitchLaneIndex(getPitchLaneKey(target));
const laneShift = Math.abs(targetLaneIndex - startLaneIndex);
const forwardGain = (target.x - startPoint.x) * attackSign;
const laneClarity = computePassLaneClarity(carrier, target, { receiverPlayerId: receiver.id });
const receiverPressure = getPlayerPressureLoad(receiver, target);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, kind === "switchAway" ? 13.5 : 10.5);
const targetSupport = getTeamDensityAtPoint(
teamId,
target,
kind === "switchAway" ? 15.5 : 11.5,
new Set([carrier.id, receiver.id])
);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetThreat = actionSpace.targetThreat;
const receiverSide = getWideSideSign(target) || getWideSideSign(receiver) || 0;
const isSwitch = kind === "switchAway" || (laneShift >= 2 && passDistance >= 16);
const isLineBreak =
forwardGain >= 6.5 &&
(actionSpace.lineBreakCount >= 1 || targetThreat.value >= startThreat.value + 0.07);
const isBoxPass = targetThreat.box >= 0.22 || targetThreat.cutbackZone >= 0.26;
const escapesCrowd =
receiverPressure <= Math.max(0, context.pressure - 0.12) ||
targetOpponentDensity <= Math.max(0, context.opponentDensity - 1) ||
laneShift >= 1 ||
isSwitch;
const sameTrap =
!isSwitch &&
laneShift === 0 &&
receiverPressure >= Math.max(0.44, context.pressure - 0.08) &&
targetOpponentDensity >= Math.max(2, context.opponentDensity);
const roleFit =
kind === "switchAway"
? (["wideBack", "wideForward"].includes(roleKey) ? 0.42 : roleKey === "connector" ? 0.24 : 0.08)
: kind === "thirdMan"
? (["pivot", "connector", "wideBack", "secondStriker"].includes(roleKey) ? 0.4 : 0.1)
: kind === "underEscape"
? (["pivot", "rest", "wideBack", "connector"].includes(roleKey) ? 0.38 : 0.08)
: isFrontLineRole(roleKey)
? 0.32
: 0.08;
const kindBonus =
kind === "switchAway"
? (profile.switchBias ?? 0.5) * 0.36 + block.ballSideCompression * 0.28 + (receiverSide === -sideSign ? 0.18 : 0)
: kind === "thirdMan"
? (profile.tempo ?? 0.5) * 0.24 + (profile.shortSupport ?? 0.5) * 0.18
: kind === "underEscape"
? (profile.shortSupport ?? 0.5) * 0.26 + trapLoad * 0.12
: (profile.directness ?? 0.5) * 0.2 + (profile.lineBreakBias ?? 0.5) * 0.18;
const score =
1.18 +
laneClarity * 0.95 +
clamp(1 - receiverPressure, 0, 1) * 0.42 +
clamp(targetSupport, 0, 3) * 0.08 +
trapLoad * 0.38 +
roleFit +
kindBonus +
(escapesCrowd ? 0.3 : -0.16) +
(isLineBreak ? 0.28 + actionSpace.value * 0.18 : actionSpace.value * 0.16) +
(isBoxPass ? 0.18 : 0) +
clamp(forwardGain / 18, -0.12, 0.3) -
Math.max(0, passDistance - (kind === "switchAway" ? 28 : 16)) * (kind === "switchAway" ? 0.018 : 0.028) -
(sameTrap ? 0.72 + trapLoad * 0.2 : 0) -
(forwardGain < -8 && kind !== "underEscape" && !isSwitch ? 0.28 : 0) -
(laneClarity < 0.42 && !isSwitch && !isLineBreak ? 0.24 : 0);
const minScore =
kind === "switchAway"
? 1.72
: kind === "highestOutlet"
? 1.78
: 1.6;
if (score < minScore) {
return;
}
const label =
kind === "switchAway"
? "pressure switch"
: kind === "thirdMan"
? "third-man escape"
: kind === "underEscape"
? "under escape"
: "highest outlet";
const reason =
kind === "switchAway"
? "the ball-side is locked, so the team changes corridor away from pressure"
: kind === "thirdMan"
? "the carrier finds a third-player angle to escape the trap"
: kind === "underEscape"
? "the carrier secures the ball through support under the pressure"
: "the carrier releases the highest playable outlet before the trap closes";
options.push({
actionType: "pass",
target,
receiverPlayerId: receiver.id,
receiverRoleKey: roleKey,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
supportNearTarget: targetSupport,
isLineBreak,
isSwitch,
isSidewaysPass: Math.abs(forwardGain) < 4 && laneShift >= 1 && !isSwitch,
isBoxPass,
isPrinciplePattern: true,
principleKey: `pressure-trap-${kind}`,
principleLabel: `Pressure trap escape: ${getPlayerMagnetLabel(receiver)} opens the ${kind === "switchAway" ? "weak-side" : kind === "thirdMan" ? "third-man" : "support"} exit`,
principleLabels: ["Press escape", kind === "switchAway" ? "Switch away from trap" : "Third-man escape"],
score,
firstTouchMode: isSwitch ? "inside" : isLineBreak || forwardGain >= 5 ? "forward" : "inside",
label,
reason,
});
};
state.players.forEach((receiver) => {
if (receiver.team !== teamId || receiver.id === carrier.id || isGoalkeeper(receiver)) {
return;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
const receiverSide = getWideSideSign(receiver) || getWideSideSign(receiver.position) || 0;
const target = getPlayerBallControlPoint(receiver);
const forwardGain = (target.x - startPoint.x) * attackSign;
const laneShift = Math.abs(getPitchLaneIndex(getPitchLaneKey(target)) - startLaneIndex);
if (
(sideLocked || context.isWideTrap || (profile.switchBias ?? 0.5) >= 0.6) &&
receiverSide === -sideSign &&
laneShift >= 2 &&
["wideForward", "wideBack", "connector"].includes(roleKey)
) {
addPassOption(receiver, "switchAway");
}
if (
laneShift >= 1 &&
forwardGain >= -3 &&
["pivot", "connector", "wideBack", "secondStriker"].includes(roleKey)
) {
addPassOption(receiver, "thirdMan");
}
if (
context.pressure >= 0.54 &&
forwardGain <= 1.5 &&
forwardGain >= -10 &&
["pivot", "rest", "wideBack", "connector"].includes(roleKey)
) {
addPassOption(receiver, "underEscape");
}
if (
trapLoad >= 0.62 &&
forwardGain >= 6 &&
isFrontLineRole(roleKey)
) {
addPassOption(receiver, "highestOutlet");
}
});
const carryMeters = clamp(
5.2 +
(profile.carryBias ?? 0.5) * 3.6 +
getAutoPilotRoleStrength(carrier, "dribbler") * 2.2 -
context.pressure * 2.1,
4.4,
10.5
);
const centralExitSide = (() => {
const leftTarget = clampToPitch({ x: startPoint.x + attackSign * 4.8, y: startPoint.y - 6.5 }, 2.5);
const rightTarget = clampToPitch({ x: startPoint.x + attackSign * 4.8, y: startPoint.y + 6.5 }, 2.5);
const leftDensity = getOpponentDensityAtPoint(teamId, leftTarget, 8);
const rightDensity = getOpponentDensityAtPoint(teamId, rightTarget, 8);
return leftDensity <= rightDensity ? -1 : 1;
})();
const carryTarget = clampToPitch({
x: startPoint.x + attackSign * carryMeters,
y: isWidePrincipleZone(startPoint)
? lerp(startPoint.y, pitch.width / 2, 0.54)
: clamp(startPoint.y + centralExitSide * Math.min(carryMeters * 0.78, 7.5), 5, pitch.width - 5),
}, 2.5);
const carryForwardGain = (carryTarget.x - startPoint.x) * attackSign;
const carryPressure = getOpponentPressureAtPoint(teamId, carryTarget, 8.5);
const carryOpponentDensity = getOpponentDensityAtPoint(teamId, carryTarget, 8.5);
const carryOpenSpace = getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, carryTarget));
const carryActionSpace = getActionSpaceValue(startPoint, carryTarget, teamId, profile);
const carryScore =
1.22 +
trapLoad * 0.26 +
carryOpenSpace * 0.64 +
getAutoPilotRoleStrength(carrier, "dribbler") * 0.36 +
(profile.carryBias ?? 0.5) * 0.22 +
clamp(carryForwardGain / 12, 0, 0.32) +
carryActionSpace.value * 0.22 -
carryPressure * 0.48 -
Math.max(0, carryOpponentDensity - Math.max(1, context.opponentDensity)) * 0.16;
if (
carryForwardGain >= 3.2 &&
carryOpenSpace >= 0.48 &&
carryPressure <= Math.max(0.68, context.pressure + 0.06) &&
carryScore >= 1.58
) {
options.push({
actionType: "dribble",
target: carryTarget,
receiverPlayerId: null,
passDistance: distance(startPoint, carryTarget),
forwardGain: carryForwardGain,
laneClarity: carryOpenSpace,
receiverPressure: carryPressure,
supportNearTarget: getTeamDensityAtPoint(teamId, carryTarget, 11.5, new Set([carrier.id])),
isLineBreak: carryActionSpace.lineBreakCount >= 1,
isSwitch: false,
isSidewaysPass: false,
isBoxPass: carryActionSpace.targetThreat.box >= 0.22,
isPrinciplePattern: true,
principleKey: "pressure-trap-carry-out",
principleLabel: `Pressure trap escape: ${getPlayerMagnetLabel(carrier)} carries out of the trap`,
principleLabels: ["Press escape", "Carry out of trap"],
score: carryScore,
firstTouchMode: null,
label: "carry out of trap",
reason: "the closest escape is to carry diagonally away from the pressure",
});
}
if (!options.length) {
return null;
}
return chooseScoredCandidateWithVariation(options, profile, {
carrier,
startPoint,
tolerance: 0.42,
temperature: 0.18,
});
}
function getAutoPilotPressureEscapeAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotPressureEscapeContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: candidate.actionType === "pass"
? actionSpace.targetPressure
: getOpponentPressureAtPoint(teamId, target, 8.5);
const targetOpponentDensity = getOpponentDensityAtPoint(teamId, target, candidate.actionType === "pass" ? 10.5 : 8.5);
const targetSupport = getTeamDensityAtPoint(
teamId,
target,
candidate.actionType === "pass" && passDistance >= 22 ? 15 : 11.5,
new Set([carrier.id, candidate.receiverPlayerId, candidate.principleRunnerPlayerId].filter(Boolean))
);
const laneClarity =
Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: getCarryLaneOpenSpaceScore(getNearestOpponentGapInCarryLane(carrier, target));
const targetLane = getPitchLaneKey(target);
const laneShift =
targetLane && context.laneKey
? Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(context.laneKey))
: 0;
const escapesPressure =
targetPressure <= context.pressure - 0.14 ||
targetOpponentDensity <= Math.max(0, context.opponentDensity - 1) ||
laneShift >= 1 ||
candidate.isSwitch;
const safeShortExit =
candidate.actionType === "pass" &&
passDistance >= 6 &&
passDistance <= 20 &&
laneClarity >= 0.52 &&
targetPressure <= 0.64 &&
targetSupport >= 1 &&
(escapesPressure || forwardGain >= 1.5);
const thirdPlayerExit =
candidate.actionType === "pass" &&
passDistance >= 7 &&
passDistance <= 24 &&
laneShift >= 1 &&
forwardGain >= -2 &&
laneClarity >= 0.48 &&
targetPressure <= 0.68 &&
(
targetThreat.halfSpace >= 0.26 ||
targetThreat.betweenLines >= 0.24 ||
candidate.receiverRoleKey === "connector" ||
candidate.receiverRoleKey === "pivot" ||
candidate.receiverRoleKey === "wideBack"
);
const switchExit =
candidate.actionType === "pass" &&
candidate.isSwitch &&
passDistance >= 20 &&
laneClarity >= 0.62 &&
targetPressure <= 0.58 &&
targetOpponentDensity <= Math.max(1, context.opponentDensity - 1);
const carryExit =
candidate.actionType === "dribble" &&
forwardGain >= 2.5 &&
laneClarity >= 0.5 &&
targetPressure <= context.pressure - 0.08 &&
targetOpponentDensity <= Math.max(1, context.opponentDensity);
const crowdedReturn =
candidate.actionType === "pass" &&
passDistance <= 12 &&
forwardGain <= 2 &&
laneShift === 0 &&
targetPressure >= 0.5 &&
targetOpponentDensity >= context.opponentDensity &&
!candidate.isSwitch;
const dribbleIntoTrap =
candidate.actionType === "dribble" &&
targetPressure >= 0.62 &&
targetOpponentDensity >= context.opponentDensity &&
actionSpace.lineBreakCount === 0;
const hopefulLongEscape =
candidate.actionType === "pass" &&
passDistance >= 28 &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
!candidate.isLineBreak &&
targetSupport <= 0 &&
laneClarity < 0.62 &&
profile.routeOneBias < 0.6;
const labels = [];
let score = 0;
if (safeShortExit) {
score += 0.16 + context.trapLoad * 0.22 + (profile.shortSupport ?? 0.5) * 0.1;
labels.push("Pressure escape: safe exit");
}
if (thirdPlayerExit) {
score += 0.2 + context.trapLoad * 0.24 + (profile.tempo ?? 0.5) * 0.1;
labels.push("Pressure escape: third player");
}
if (switchExit) {
score += 0.18 + context.trapLoad * 0.28 + (profile.switchBias ?? 0.5) * 0.16;
labels.push("Pressure escape: switch away");
}
if (carryExit) {
score += 0.14 + context.trapLoad * 0.18 + (profile.carryBias ?? 0.5) * 0.12;
labels.push("Pressure escape: carry out");
}
if (crowdedReturn) {
score -= 0.34 + context.trapLoad * 0.34 + targetPressure * 0.14;
labels.push("Avoid passing back into trap");
}
if (dribbleIntoTrap) {
score -= 0.3 + context.trapLoad * 0.28;
labels.push("Avoid carrying into trap");
}
if (hopefulLongEscape) {
score -= 0.24 + context.trapLoad * 0.2;
labels.push("Avoid hopeful escape ball");
}
return {
score: clamp(score, -1.05, 0.95),
labels: uniquePrincipleLabels(labels),
context: {
trapLoad: context.trapLoad,
pressure: context.pressure,
nearestGap: context.nearestGap,
opponentDensity: context.opponentDensity,
targetOpponentDensity,
supportDensity: context.supportDensity,
targetSupport,
targetPressure,
laneClarity,
laneShift,
safeShortExit,
thirdPlayerExit,
switchExit,
carryExit,
crowdedReturn,
dribbleIntoTrap,
hopefulLongEscape,
},
};
}
function getAutoPilotPatternDiversityAdjustment(candidate, carrier, startPoint, profile) {
const recent = getRecentPossessionSteps(carrier.team, 7)
.map((step) => getRecordedStepPattern(step, carrier.team))
.filter(Boolean);
if (!recent.length) {
return { score: 0, labels: [] };
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const sameFamilyCount = recent.filter((entry) => entry.family === pattern.family).length;
const sameLaneCount = recent.filter((entry) => entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey).length;
const sameReceiverRoleCount = pattern.receiverRoleKey
? recent.filter((entry) => entry.receiverRoleKey === pattern.receiverRoleKey).length
: 0;
const sameSpaceCount = recent.filter((entry) => entry.targetSpaceLabel === pattern.targetSpaceLabel).length;
let consecutiveFamily = 0;
let consecutiveLane = 0;
for (const entry of recent) {
if (entry.family === pattern.family) {
consecutiveFamily += 1;
} else {
break;
}
}
for (const entry of recent) {
if (entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey) {
consecutiveLane += 1;
} else {
break;
}
}
const identityFamily =
((profile.styleKey === "wing-play" || profile.styleKey === "overlap-wide") &&
["wide-overload", "cross", "cutback", "switch"].includes(pattern.family)) ||
((profile.styleKey === "control-possession" || profile.styleKey === "tiki-taka" || profile.styleKey === "fluid-combinations") &&
["support-link", "line-break", "switch", "cutback"].includes(pattern.family)) ||
(isTransitionAttackStyle(profile.styleKey) &&
["line-break", "carry-forward", "front-line", "shot"].includes(pattern.family));
const familyTolerance = identityFamily ? 0.58 : 1;
const highValueException =
candidate.actionType === "shot" ||
candidate.isBoxPass ||
candidate.mustShoot ||
candidate.isLineBreak ||
getPitchThreatProfile(candidate.target, carrier.team).value >= 0.68;
const stalePatternPenalty = highValueException
? 0
: clamp(
sameFamilyCount * 0.055 * familyTolerance +
consecutiveFamily * 0.16 * familyTolerance +
sameLaneCount * 0.045 +
consecutiveLane * 0.13 +
sameReceiverRoleCount * 0.035 +
sameSpaceCount * 0.035,
0,
0.92
);
const lastPattern = recent[0];
const laneShiftFromLast = lastPattern
? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(lastPattern.laneKey))
: 0;
const rhythmChangeBonus =
(consecutiveLane >= 2 && laneShiftFromLast >= 2 ? 0.22 + profile.switchBias * 0.16 : 0) +
(consecutiveFamily >= 2 && pattern.family !== lastPattern?.family ? 0.16 + profile.tempo * 0.08 : 0) +
(recent.filter((entry) => entry.family === "recycle").length >= 1 && pattern.forwardGain >= 6 ? 0.14 + profile.progressionUrgency * 0.18 : 0);
const labels = [];
if (rhythmChangeBonus >= 0.18) {
labels.push("Change rhythm");
}
if (consecutiveLane >= 2 && laneShiftFromLast >= 2) {
labels.push("Move the block");
}
return {
score: clamp(rhythmChangeBonus - stalePatternPenalty, -0.95, 0.58),
labels: uniquePrincipleLabels(labels),
pattern,
};
}
function getAutoPilotRepetitionPenalty(candidate, carrier, startPoint, profile) {
const recent = getRecentPossessionSteps(carrier.team, 5);
if (!recent.length) {
return 0;
}
const targetLane = getPitchLaneKey(candidate.target);
const targetThird = getAttackingThirdKey(candidate.target, carrier.team);
const sameLaneRepeats = getRecentLaneRepeatCount(carrier.team, targetLane, targetThird, 4);
const lastStep = recent[0];
const lastCarrierId = lastStep.beforeSnapshot?.ball?.ownerPlayerId ?? lastStep.carrierPlayerId ?? null;
const lastReceiverId = lastStep.receiverPlayerId ?? null;
const pressure = getPlayerPressureLoad(carrier, startPoint);
const passDistance = distance(startPoint, candidate.target);
let penalty = sameLaneRepeats * 0.24;
if (lastStep.target && distance(lastStep.target, candidate.target) <= 7) {
penalty += 0.52;
}
if (
candidate.actionType === "pass" &&
candidate.receiverPlayerId &&
lastCarrierId === candidate.receiverPlayerId &&
lastReceiverId === carrier.id
) {
const wallPassAllowance =
profile.tempo >= 0.72 &&
getPlayerTendency(carrier, "passAndMove") >= 0.62 &&
pressure >= 0.42;
penalty += wallPassAllowance ? 0.26 : 1.05;
}
if (
candidate.actionType === "pass" &&
candidate.receiverPlayerId &&
candidate.receiverPlayerId === lastReceiverId &&
pressure < 0.58
) {
penalty += 0.42;
}
const recentShortSameZone = recent
.slice(0, 3)
.filter((step) => step.target && getPitchLaneKey(step.target) === targetLane && getRecordedStepDuration(step) <= 1.4)
.length;
if (candidate.actionType === "pass" && passDistance <= 13 && recentShortSameZone >= 2) {
penalty += 0.5;
}
if (candidate.actionType === "dribble" && lastStep.actionType === "dribble" && sameLaneRepeats >= 1) {
penalty += 0.35;
}
if (candidate.actionType === "shot") {
const recentShots = recent.filter((step) => step.actionType === "shot").length;
const isLongShot = (candidate.goalDistance ?? passDistance) > 27;
if (lastStep.actionType === "shot") {
penalty += candidate.mustShoot && !isLongShot ? 0.35 : isLongShot ? 3.4 : 1.45;
}
if (lastStep.target && isLongShot && distance(lastStep.target, candidate.target) <= 7) {
penalty += 2.25;
}
if (recentShots >= 1 && isLongShot) {
penalty += recentShots * 1.55;
}
if (recentShots >= 2 && !candidate.insideBox) {
penalty += 1.65;
}
}
return penalty;
}
function getAutoPilotFlowAdjustment(candidate, carrier, startPoint, profile) {
const flow = getAutoPilotFlowContext(carrier, startPoint);
const rhythm = getPossessionRhythmContext(carrier.team);
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const lastPrinciples = getLastAutoPrincipleSet(carrier.team);
const possessionMaturity = clamp(
rhythm.duration / Math.max(profile.targetPossessionSeconds ?? 8.8, 0.1),
0,
1.45
);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetLaneKey = getPitchLaneKey(candidate.target);
const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
let adjustment = 0;
if (candidate.actionType === "dribble") {
if (progressionWindow.active && forwardGain >= 4) {
adjustment += 0.28 + progressionWindow.openLane * 0.26 + progressionWindow.urgency * 0.18;
}
if (regain.active) {
adjustment +=
regain.counterIntent * regain.freshness * 0.34 +
(forwardGain >= 6 ? regain.forwardOpenSpace * 0.24 : 0) -
(forwardGain < 2 && regain.pressure <= 0.42 ? 0.22 : 0);
}
const previousWideQuestion =
principleSetIncludes(lastPrinciples, "Ask question wide") ||
principleSetIncludes(lastPrinciples, "overlap") ||
principleSetIncludes(lastPrinciples, "wide");
const previousHighValue =
principleSetIncludes(lastPrinciples, "central pocket") ||
principleSetIncludes(lastPrinciples, "valuable space") ||
principleSetIncludes(lastPrinciples, "between-lines") ||
principleSetIncludes(lastPrinciples, "cutback");
if (
previousWideQuestion &&
(flow.carrierRoleKey === "wideForward" || flow.carrierRoleKey === "wideBack") &&
forwardGain >= 3
) {
adjustment += 0.34 + profile.dribbleBias * 0.2;
}
if (previousHighValue && forwardGain >= 4 && flow.pressure <= 0.62) {
adjustment += 0.22 + profile.progressionUrgency * 0.18;
}
if (flow.carrierJustReceived) {
adjustment += 0.72 + profile.carryBias * 0.28;
}
if (flow.consecutivePasses >= 2) {
adjustment += 0.44 + Math.min(flow.consecutivePasses, 4) * 0.11;
}
if (isFrontLineRole(flow.carrierRoleKey) && flow.recentFrontLineTargets >= 2) {
adjustment += 0.24;
}
if (profile.directness < 0.45 && flow.pressure <= 0.45) {
adjustment += 0.14;
}
if (rhythm.sidewaysPasses >= 2 && profile.progressionUrgency >= 0.48) {
adjustment += 0.28 + profile.progressionUrgency * 0.22;
}
return adjustment;
}
if (candidate.actionType !== "pass") {
return adjustment;
}
const previousWideQuestion =
principleSetIncludes(lastPrinciples, "Ask question wide") ||
principleSetIncludes(lastPrinciples, "overlap") ||
principleSetIncludes(lastPrinciples, "wide");
const previousThirdPlayer = principleSetIncludes(lastPrinciples, "Find the Third");
const previousChangeCorridor = principleSetIncludes(lastPrinciples, "Change corridor");
const previousHighValue =
principleSetIncludes(lastPrinciples, "central pocket") ||
principleSetIncludes(lastPrinciples, "valuable space") ||
principleSetIncludes(lastPrinciples, "between-lines") ||
principleSetIncludes(lastPrinciples, "cutback");
if (regain.active) {
if (forwardGain >= 7 && (candidate.isLineBreak || isFrontLineRole(receiverRoleKey) || candidate.receiverPlayerId === null)) {
adjustment += 0.2 + regain.counterIntent * regain.freshness * 0.48;
}
if (passDistance <= 19 && (isSupportRole(receiverRoleKey) || receiverRoleKey === "wideBack")) {
adjustment += 0.16 + regain.secureIntent * regain.freshness * 0.34;
}
if (
forwardGain <= -6 &&
regain.pressure <= 0.42 &&
profile.directness >= 0.58 &&
!candidate.isSwitch
) {
adjustment -= 0.32 + regain.counterIntent * 0.24;
}
}
if (progressionWindow.active) {
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
if (forwardGain >= 5 && (candidate.isLineBreak || actionSpace.lineBreakCount >= 1 || actionSpace.value >= 0.36)) {
adjustment += 0.24 + actionSpace.value * 0.34 + progressionWindow.urgency * 0.2;
}
if (
forwardGain < 2 &&
!candidate.isSwitch &&
actionSpace.value < 0.28 &&
flow.pressure < 0.56
) {
adjustment -= 0.36 + progressionWindow.urgency * 0.34;
}
}
if (candidate.isPrinciplePattern) {
adjustment += 0.32;
if (candidate.principleKey === "wide-overlap-entry" && profile.overlapBias >= 0.56) {
adjustment += 0.24 + profile.widthDiscipline * 0.18;
}
if (candidate.principleKey === "wide-overlap" && flow.carrierJustReceived) {
adjustment += 0.42 + profile.overlapBias * 0.18;
}
}
if (previousWideQuestion) {
if (receiverRoleKey === "wideBack" && forwardGain >= -1) {
adjustment += 0.46 + profile.overlapBias * 0.28;
}
if (candidate.label === "cutback" || candidate.label === "cross" || candidate.isBoxPass) {
adjustment += 0.36 + profile.deliveryBias * 0.24;
}
if (
receiverRoleKey === "wideForward" &&
candidate.passDistance <= 16 &&
!candidate.isLineBreak &&
!candidate.isSwitch &&
flow.pressure < 0.52
) {
adjustment -= 0.34;
}
}
if (previousThirdPlayer) {
if (forwardGain >= 6 || candidate.isLineBreak || candidate.isBoxPass) {
adjustment += 0.42 + profile.lineBreakBias * 0.24;
}
if (forwardGain <= -5 && flow.pressure < 0.48) {
adjustment -= 0.32;
}
}
if (previousChangeCorridor) {
if (isFrontLineRole(receiverRoleKey) || targetIsWide || candidate.isBoxPass) {
adjustment += 0.22 + profile.progressionUrgency * 0.18;
}
if (candidate.isSwitch && flow.pressure < 0.44) {
adjustment -= 0.38;
}
}
if (previousHighValue) {
if (forwardGain >= 3 || candidate.isBoxPass || candidate.actionType === "shot") {
adjustment += 0.2 + profile.progressionUrgency * 0.14;
}
if (forwardGain < -4 && flow.pressure < 0.54) {
adjustment -= 0.26;
}
}
if (flow.carrierJustReceived && !candidate.isLineBreak && !candidate.isSwitch && flow.pressure < 0.58) {
adjustment -= 0.5;
}
if (flow.consecutivePasses >= 3 && !candidate.isLineBreak && !candidate.isSwitch && flow.pressure < 0.62) {
adjustment -= 0.55 + Math.min(flow.consecutivePasses - 2, 3) * 0.18;
}
if (candidate.isSidewaysPass && rhythm.sidewaysPasses >= Math.max(1, Math.round(profile.sidewaysTolerance * 3))) {
adjustment -= 0.46 + profile.progressionUrgency * 0.48 + possessionMaturity * 0.28;
}
if ((candidate.isLineBreak || candidate.isBoxPass) && possessionMaturity >= 0.34) {
adjustment += 0.26 + profile.progressionUrgency * 0.44;
}
if (forwardGain <= -5 && rhythm.backPasses >= 1 && rhythm.forwardPasses === 0 && rhythm.steps >= 2) {
adjustment -= 0.24 + profile.progressionUrgency * 0.34;
}
if (receiverRoleKey) {
const roleRepeatCount = flow.receiverRoleCounts.get(receiverRoleKey) ?? 0;
adjustment -= Math.min(roleRepeatCount, 3) * 0.18;
if (
isFrontLineRole(receiverRoleKey) &&
flow.recentFrontLineTargets >= 2 &&
profile.phaseKey !== "finalThird" &&
!candidate.isLineBreak &&
!candidate.isSwitch
) {
adjustment -= 1.15;
}
if (
isFrontLineRole(flow.carrierRoleKey) &&
isFrontLineRole(receiverRoleKey) &&
profile.phaseKey !== "finalThird" &&
!candidate.isSwitch
) {
adjustment -= 0.85;
}
if (isSupportRole(receiverRoleKey) && flow.recentFrontLineTargets >= 2 && passDistance <= 26) {
adjustment += 0.86;
}
if (receiverRoleKey === "pivot" && profile.shortSupport >= 0.72 && passDistance <= 20) {
adjustment += 0.45;
}
if (receiverRoleKey === "connector" && profile.shortSupport >= 0.64 && passDistance <= 22) {
adjustment += 0.38;
}
if (receiverRoleKey === "wideBack" && (profile.overlapBias >= 0.56 || profile.widthDiscipline >= 0.68)) {
adjustment += 0.45;
}
}
if (targetIsWide && flow.recentWideTargets === 0) {
adjustment += 0.28 + profile.widthDiscipline * 0.18;
}
if (
flow.lastCarrierId === candidate.receiverPlayerId &&
flow.lastReceiverId === carrier.id &&
flow.pressure < 0.48 &&
!candidate.isLineBreak
) {
adjustment -= 0.42;
}
return adjustment;
}
function getAutoPilotCarryEndProductContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const flow = getAutoPilotFlowContext(carrier, startPoint);
const lastStep = flow.lastStep;
if (!lastStep || lastStep.actionType !== "dribble") {
return { active: false, flow };
}
const sign = getAttackDirectionSign(teamId);
const carryStart =
lastStep.beforeSnapshot?.ball?.position ??
lastStep.beforeSnapshot?.ball?.startPosition ??
lastStep.beforeSnapshot?.players?.find?.((player) => player.id === carrier.id)?.position ??
startPoint;
const carryEnd = lastStep.target ?? startPoint;
const carryDistance = distance(carryStart, carryEnd);
const carryForwardGain = (carryEnd.x - carryStart.x) * sign;
const carryEndedHere = distance(carryEnd, startPoint) <= 8.5;
const sameCarrier =
lastStep.carrierPlayerId === carrier.id ||
lastStep.afterSnapshot?.ball?.ownerPlayerId === carrier.id ||
state.ball.ownerPlayerId === carrier.id;
const principles = getLastAutoPrincipleSet(teamId);
const wasRunwayCarry =
principleSetIncludes(principles, "Open-grass runway") ||
principleSetIncludes(principles, "runway carry");
const wasOpenCarry =
wasRunwayCarry ||
principleSetIncludes(principles, "Open-grass carry") ||
principleSetIncludes(principles, "Carry through open") ||
principleSetIncludes(principles, "Drive at the back line");
const meaningfulCarry =
carryDistance >= 6 ||
carryForwardGain >= 4.5 ||
wasOpenCarry;
if (!sameCarrier || !carryEndedHere || !meaningfulCarry) {
return {
active: false,
flow,
carryDistance,
carryForwardGain,
wasOpenCarry,
};
}
const goalTarget = getAutoPilotShotTarget(teamId, carrier);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const attackingDepth = getAttackingDepth(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const shotWindow = getShotWindowProfile(carrier, startPoint, goalTarget);
const startLane = getPitchLaneKey(startPoint);
const isWide = startLane === "leftWide" || startLane === "rightWide";
const finishWindow =
goalDistance <= (wasRunwayCarry ? 38 : 34) &&
attackingDepth >= (wasRunwayCarry ? 63 : 66) &&
shotWindow.angleQuality >= (wasRunwayCarry ? 0.12 : 0.15) &&
shotWindow.blockRisk <= (wasRunwayCarry ? 0.88 : 0.84) &&
pressure <= (wasRunwayCarry ? 0.88 : 0.84) &&
(
shotWindow.quality >= (wasRunwayCarry ? 0.17 : 0.2) ||
shotWindow.laneClarity >= (wasRunwayCarry ? 0.32 : 0.38) ||
getAutoPilotRoleStrength(carrier, "finisher") >= 0.7
);
const cutbackWindow =
isWide &&
attackingDepth >= (wasRunwayCarry ? 72 : 76) &&
goalDistance <= (wasRunwayCarry ? 40 : 36) &&
pressure <= (wasRunwayCarry ? 0.86 : 0.82);
const boxEntryWindow =
attackingDepth >= (wasRunwayCarry ? 64 : 68) &&
(startThreat.centralPocket >= 0.28 ||
startThreat.halfSpace >= 0.34 ||
startThreat.betweenLines >= 0.34 ||
startThreat.box >= 0.18 ||
startThreat.cutbackZone >= 0.24 ||
(wasRunwayCarry && shotWindow.laneClarity >= 0.3));
const endProductUrgency = clamp(
(attackingDepth - 60) / 28 +
(finishWindow ? 0.28 : 0) +
(cutbackWindow ? 0.2 : 0) +
(boxEntryWindow ? 0.18 : 0) +
Math.max(0, carryForwardGain - 5) / 22 +
(wasRunwayCarry ? 0.28 : 0) +
(wasOpenCarry ? 0.16 : 0) -
pressure * 0.16,
0,
1.35
);
return {
active: endProductUrgency >= 0.34,
flow,
principles,
carryDistance,
carryForwardGain,
wasRunwayCarry,
wasOpenCarry,
goalDistance,
attackingDepth,
pressure,
startThreat,
shotWindow,
startLane,
isWide,
finishWindow,
cutbackWindow,
boxEntryWindow,
endProductUrgency,
};
}
function getAutoPilotCarryEndProductAdjustment(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const context = getAutoPilotCarryEndProductContext(carrier, startPoint, profile);
if (!context.active) {
return {
score: 0,
labels: [],
context,
};
}
const teamId = carrier.team;
const targetThreat = candidate.actionType === "shot"
? context.startThreat
: getPitchThreatProfile(candidate.target, teamId);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const targetLane = getPitchLaneKey(candidate.target);
const targetIsBoxOrCutback =
candidate.isBoxPass ||
candidate.label === "cutback" ||
candidate.label === "cross" ||
targetThreat.box >= 0.24 ||
targetThreat.cutbackZone >= 0.3;
const targetIsFinalThirdPocket =
targetThreat.centralPocket >= 0.34 ||
targetThreat.betweenLines >= 0.42 ||
targetThreat.halfSpace >= 0.42 ||
targetThreat.assistZone >= 0.36;
const sterileRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!targetIsBoxOrCutback &&
!targetIsFinalThirdPocket &&
forwardGain < 2 &&
targetThreat.value <= context.startThreat.value + 0.04 &&
passDistance <= 24;
const backwardsRecycle =
candidate.actionType === "pass" &&
forwardGain <= -5 &&
!candidate.isSwitch &&
!targetIsBoxOrCutback;
const repeatedLowValueCarry =
candidate.actionType === "dribble" &&
context.attackingDepth >= 68 &&
forwardGain < 7 &&
(actionSpace?.openTarget ?? 0) < 0.64 &&
targetThreat.box < 0.22 &&
targetThreat.behindLine < 0.34;
const continuationCarry =
candidate.actionType === "dribble" &&
forwardGain >= 6 &&
(actionSpace?.openTarget ?? 0) >= 0.56 &&
(targetThreat.box >= 0.18 || targetThreat.behindLine >= 0.28 || context.goalDistance > 27);
const labels = [];
let score = 0;
if (candidate.actionType === "shot" && context.finishWindow) {
score +=
0.5 +
context.endProductUrgency * 0.38 +
context.shotWindow.quality * 0.32 +
(context.wasRunwayCarry ? 0.22 : 0);
labels.push(context.wasRunwayCarry ? "Runway end product: shoot" : "Carry end product: shoot");
}
if (candidate.actionType === "pass" && targetIsBoxOrCutback) {
score +=
0.42 +
context.endProductUrgency * 0.3 +
(targetThreat.cutbackZone >= 0.3 ? 0.16 : 0) +
(context.wasRunwayCarry ? 0.14 : 0);
labels.push(candidate.label === "cutback" ? "Runway end product: cutback" : "Carry end product: attack box");
}
if (
candidate.actionType === "pass" &&
targetIsFinalThirdPocket &&
forwardGain >= -1 &&
!targetIsBoxOrCutback
) {
score += 0.24 + context.endProductUrgency * 0.18;
labels.push("Carry end product: connect in final third");
}
if (
candidate.actionType === "pass" &&
candidate.isSwitch &&
context.isWide &&
targetLane !== context.startLane &&
forwardGain >= -4
) {
score += 0.16 + (profile.switchBias ?? 0.5) * 0.12;
labels.push("Carry end product: release weak side");
}
if (continuationCarry && !context.finishWindow && !context.cutbackWindow) {
score += 0.18 + (profile.carryBias ?? 0.5) * 0.12 + (context.wasRunwayCarry ? 0.1 : 0);
labels.push(context.wasRunwayCarry ? "Runway: keep attacking" : "Carry end product: keep driving");
}
if (sterileRecycle) {
score -=
0.42 +
context.endProductUrgency * 0.34 +
(profile.progressionUrgency ?? 0.5) * 0.18 +
(context.wasRunwayCarry ? 0.36 : 0);
labels.push(context.wasRunwayCarry ? "Do not waste runway" : "Avoid recycle after carry");
}
if (backwardsRecycle && context.pressure <= 0.62) {
score -= 0.36 + context.endProductUrgency * 0.26 + (context.wasRunwayCarry ? 0.28 : 0);
}
if (repeatedLowValueCarry) {
score -= 0.34 + context.endProductUrgency * 0.22 + (context.wasRunwayCarry ? 0.18 : 0);
}
return {
score: clamp(score, -1.05, 1.25),
labels: uniquePrincipleLabels(labels),
context,
};
}
function getAutoPilotSpacingBonus(candidate, carrier, startPoint, profile) {
const startLaneIndex = getPitchLaneIndex(startPoint);
const targetLaneKey = getPitchLaneKey(candidate.target);
const targetLaneIndex = getPitchLaneIndex(targetLaneKey);
const laneShift = Math.abs(targetLaneIndex - startLaneIndex);
const passDistance = distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetThird = getAttackingThirdKey(candidate.target, carrier.team);
const repeatedLane = getRecentLaneRepeatCount(carrier.team, targetLaneKey, targetThird, 4);
const isWideLane = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
const isNonProgressiveLaneShift =
candidate.actionType === "pass" &&
Math.abs(forwardGain) < 4 &&
passDistance < 24 &&
!candidate.isSwitch;
const lateralMultiplier = isNonProgressiveLaneShift
? clamp(profile.sidewaysTolerance + profile.switchBias * 0.22, 0.24, 0.86)
: 1;
let bonus = 0;
if (laneShift >= 2 && passDistance >= 15) {
bonus += (0.28 + profile.switchBias * 0.34 + repeatedLane * 0.12) * lateralMultiplier;
}
if (isWideLane && candidate.actionType === "pass") {
bonus += (0.16 + profile.crossBias * 0.18 + profile.widthDiscipline * 0.2) * lateralMultiplier;
}
if (candidate.actionType === "pass" && passDistance >= 8 && passDistance <= 20 && laneShift >= 1) {
bonus += (0.16 + profile.shortSupport * 0.14) * lateralMultiplier;
}
if (candidate.actionType === "dribble" && laneShift >= 1) {
bonus += 0.12 + profile.carryBias * 0.16;
}
return bonus;
}
const autoPilotStylePrincipleWeights = {
balanced: {
thirdPlayer: 0.55,
changeCorridor: 0.5,
wideQuestion: 0.48,
finalThirdCombination: 0.5,
directTransition: 0.42,
},
"control-possession": {
thirdPlayer: 0.82,
changeCorridor: 0.62,
wideQuestion: 0.52,
finalThirdCombination: 0.58,
directTransition: 0.24,
},
"tiki-taka": {
thirdPlayer: 0.95,
changeCorridor: 0.42,
wideQuestion: 0.36,
finalThirdCombination: 0.72,
directTransition: 0.18,
},
"fluid-combinations": {
thirdPlayer: 0.92,
changeCorridor: 0.46,
wideQuestion: 0.62,
finalThirdCombination: 0.88,
directTransition: 0.36,
},
"vertical-tiki-taka": {
thirdPlayer: 0.82,
changeCorridor: 0.48,
wideQuestion: 0.5,
finalThirdCombination: 0.72,
directTransition: 0.5,
},
"vertical-play": {
thirdPlayer: 0.46,
changeCorridor: 0.38,
wideQuestion: 0.42,
finalThirdCombination: 0.48,
directTransition: 0.78,
},
gegenpress: {
thirdPlayer: 0.42,
changeCorridor: 0.32,
wideQuestion: 0.44,
finalThirdCombination: 0.5,
directTransition: 0.86,
},
"wing-play": {
thirdPlayer: 0.38,
changeCorridor: 0.82,
wideQuestion: 0.94,
finalThirdCombination: 0.5,
directTransition: 0.46,
},
"overlap-wide": {
thirdPlayer: 0.54,
changeCorridor: 0.76,
wideQuestion: 0.96,
finalThirdCombination: 0.58,
directTransition: 0.4,
},
"direct-transition": {
thirdPlayer: 0.28,
changeCorridor: 0.4,
wideQuestion: 0.38,
finalThirdCombination: 0.32,
directTransition: 0.96,
},
"fluid-counter-attack": {
thirdPlayer: 0.44,
changeCorridor: 0.54,
wideQuestion: 0.54,
finalThirdCombination: 0.48,
directTransition: 0.88,
},
"counter-attack": {
thirdPlayer: 0.3,
changeCorridor: 0.48,
wideQuestion: 0.48,
finalThirdCombination: 0.34,
directTransition: 0.92,
},
"route-one": {
thirdPlayer: 0.18,
changeCorridor: 0.32,
wideQuestion: 0.42,
finalThirdCombination: 0.2,
directTransition: 0.72,
},
};
const autoPilotPrincipleLabels = {
secure: "Secure first pass",
attractPressure: "Attract pressure",
goldenZone: "Attack central pocket",
breakLine: "Break the next line",
thirdPlayer: "Find the Third",
switchPlay: "Change corridor",
wideOverload: "Ask question wide",
overlapUnderlap: "Overlap / underlap",
driveSpace: "Drive past press",
isolate1v1: "Isolate 1v1",
boxDelivery: "Attack box",
cutback: "Cutback zone",
shoot: "Find sweet spot",
secondBall: "Second-ball structure",
counterAttack: "Attack transition space",
restDefence: "Rest-defence balance",
};
const autoPilotPhaseIntentionWeights = {
setPiece: {
secure: 0.68,
attractPressure: 0.22,
breakLine: 0.28,
thirdPlayer: 0.58,
switchPlay: 0.34,
wideOverload: 0.36,
overlapUnderlap: 0.26,
driveSpace: 0.2,
isolate1v1: 0.18,
boxDelivery: 0.3,
cutback: 0.2,
shoot: 0.18,
secondBall: 0.52,
counterAttack: 0.12,
restDefence: 0.72,
},
buildUp: {
secure: 0.86,
attractPressure: 0.58,
goldenZone: 0.58,
breakLine: 0.48,
thirdPlayer: 0.64,
switchPlay: 0.46,
wideOverload: 0.3,
overlapUnderlap: 0.22,
driveSpace: 0.36,
isolate1v1: 0.16,
boxDelivery: 0.04,
cutback: 0,
shoot: 0,
secondBall: 0.22,
counterAttack: 0.14,
restDefence: 0.84,
},
progression: {
secure: 0.48,
attractPressure: 0.48,
goldenZone: 0.92,
breakLine: 0.76,
thirdPlayer: 0.72,
switchPlay: 0.7,
wideOverload: 0.64,
overlapUnderlap: 0.56,
driveSpace: 0.62,
isolate1v1: 0.48,
boxDelivery: 0.24,
cutback: 0.12,
shoot: 0.16,
secondBall: 0.32,
counterAttack: 0.48,
restDefence: 0.58,
},
finalThird: {
secure: 0.26,
attractPressure: 0.28,
goldenZone: 1,
breakLine: 0.56,
thirdPlayer: 0.7,
switchPlay: 0.42,
wideOverload: 0.82,
overlapUnderlap: 0.84,
driveSpace: 0.62,
isolate1v1: 0.72,
boxDelivery: 0.88,
cutback: 0.94,
shoot: 0.92,
secondBall: 0.36,
counterAttack: 0.3,
restDefence: 0.66,
},
};
const autoPilotStyleIntentionWeights = {
balanced: {
secure: 0.5,
attractPressure: 0.42,
goldenZone: 0.86,
breakLine: 0.52,
thirdPlayer: 0.55,
switchPlay: 0.5,
wideOverload: 0.5,
overlapUnderlap: 0.48,
driveSpace: 0.48,
isolate1v1: 0.44,
boxDelivery: 0.42,
cutback: 0.46,
shoot: 0.48,
secondBall: 0.36,
counterAttack: 0.42,
restDefence: 0.52,
},
"control-possession": {
secure: 0.86,
attractPressure: 0.72,
goldenZone: 0.9,
breakLine: 0.48,
thirdPlayer: 0.9,
switchPlay: 0.64,
wideOverload: 0.54,
overlapUnderlap: 0.52,
driveSpace: 0.42,
isolate1v1: 0.28,
boxDelivery: 0.26,
cutback: 0.48,
shoot: 0.3,
secondBall: 0.22,
counterAttack: 0.18,
restDefence: 0.78,
},
"tiki-taka": {
secure: 0.8,
attractPressure: 0.8,
goldenZone: 0.88,
breakLine: 0.56,
thirdPlayer: 1,
switchPlay: 0.46,
wideOverload: 0.4,
overlapUnderlap: 0.5,
driveSpace: 0.36,
isolate1v1: 0.2,
boxDelivery: 0.22,
cutback: 0.62,
shoot: 0.28,
secondBall: 0.16,
counterAttack: 0.12,
restDefence: 0.74,
},
"fluid-combinations": {
secure: 0.62,
attractPressure: 0.66,
goldenZone: 0.94,
breakLine: 0.66,
thirdPlayer: 0.96,
switchPlay: 0.46,
wideOverload: 0.66,
overlapUnderlap: 0.74,
driveSpace: 0.56,
isolate1v1: 0.44,
boxDelivery: 0.44,
cutback: 0.72,
shoot: 0.42,
secondBall: 0.22,
counterAttack: 0.32,
restDefence: 0.58,
},
"vertical-tiki-taka": {
secure: 0.54,
attractPressure: 0.5,
goldenZone: 0.96,
breakLine: 0.84,
thirdPlayer: 0.84,
switchPlay: 0.5,
wideOverload: 0.5,
overlapUnderlap: 0.56,
driveSpace: 0.52,
isolate1v1: 0.36,
boxDelivery: 0.36,
cutback: 0.56,
shoot: 0.44,
secondBall: 0.24,
counterAttack: 0.5,
restDefence: 0.58,
},
"vertical-play": {
secure: 0.34,
attractPressure: 0.24,
goldenZone: 0.98,
breakLine: 0.96,
thirdPlayer: 0.46,
switchPlay: 0.4,
wideOverload: 0.42,
overlapUnderlap: 0.36,
driveSpace: 0.58,
isolate1v1: 0.46,
boxDelivery: 0.38,
cutback: 0.34,
shoot: 0.52,
secondBall: 0.48,
counterAttack: 0.78,
restDefence: 0.42,
},
gegenpress: {
secure: 0.34,
attractPressure: 0.28,
goldenZone: 0.94,
breakLine: 0.82,
thirdPlayer: 0.46,
switchPlay: 0.32,
wideOverload: 0.44,
overlapUnderlap: 0.44,
driveSpace: 0.68,
isolate1v1: 0.54,
boxDelivery: 0.42,
cutback: 0.46,
shoot: 0.62,
secondBall: 0.68,
counterAttack: 0.9,
restDefence: 0.7,
},
"wing-play": {
secure: 0.28,
attractPressure: 0.32,
goldenZone: 0.82,
breakLine: 0.44,
thirdPlayer: 0.38,
switchPlay: 0.86,
wideOverload: 0.98,
overlapUnderlap: 0.74,
driveSpace: 0.58,
isolate1v1: 0.72,
boxDelivery: 0.9,
cutback: 0.64,
shoot: 0.36,
secondBall: 0.48,
counterAttack: 0.48,
restDefence: 0.48,
},
"overlap-wide": {
secure: 0.36,
attractPressure: 0.42,
goldenZone: 0.84,
breakLine: 0.5,
thirdPlayer: 0.56,
switchPlay: 0.74,
wideOverload: 0.96,
overlapUnderlap: 1,
driveSpace: 0.52,
isolate1v1: 0.6,
boxDelivery: 0.72,
cutback: 0.82,
shoot: 0.34,
secondBall: 0.38,
counterAttack: 0.38,
restDefence: 0.52,
},
"direct-transition": {
secure: 0.22,
attractPressure: 0.12,
goldenZone: 1,
breakLine: 0.92,
thirdPlayer: 0.24,
switchPlay: 0.36,
wideOverload: 0.38,
overlapUnderlap: 0.28,
driveSpace: 0.84,
isolate1v1: 0.6,
boxDelivery: 0.46,
cutback: 0.34,
shoot: 0.62,
secondBall: 0.62,
counterAttack: 1,
restDefence: 0.32,
},
"fluid-counter-attack": {
secure: 0.36,
attractPressure: 0.22,
goldenZone: 0.96,
breakLine: 0.82,
thirdPlayer: 0.46,
switchPlay: 0.58,
wideOverload: 0.58,
overlapUnderlap: 0.44,
driveSpace: 0.9,
isolate1v1: 0.66,
boxDelivery: 0.5,
cutback: 0.46,
shoot: 0.56,
secondBall: 0.46,
counterAttack: 0.94,
restDefence: 0.44,
},
"counter-attack": {
secure: 0.28,
attractPressure: 0.12,
goldenZone: 0.96,
breakLine: 0.82,
thirdPlayer: 0.3,
switchPlay: 0.5,
wideOverload: 0.5,
overlapUnderlap: 0.34,
driveSpace: 0.9,
isolate1v1: 0.66,
boxDelivery: 0.52,
cutback: 0.34,
shoot: 0.58,
secondBall: 0.56,
counterAttack: 0.96,
restDefence: 0.36,
},
"route-one": {
secure: 0.16,
attractPressure: 0.08,
goldenZone: 0.72,
breakLine: 0.56,
thirdPlayer: 0.16,
switchPlay: 0.28,
wideOverload: 0.34,
overlapUnderlap: 0.18,
driveSpace: 0.26,
isolate1v1: 0.28,
boxDelivery: 0.62,
cutback: 0.16,
shoot: 0.46,
secondBall: 1,
counterAttack: 0.72,
restDefence: 0.42,
},
};
const autoPilotFormationIntentionWeights = {
"4-3-3": {
secure: 0.55,
goldenZone: 0.9,
breakLine: 0.62,
thirdPlayer: 0.78,
switchPlay: 0.58,
wideOverload: 0.72,
overlapUnderlap: 0.72,
driveSpace: 0.52,
isolate1v1: 0.56,
boxDelivery: 0.46,
cutback: 0.58,
restDefence: 0.62,
},
"4-1-4-1": {
secure: 0.66,
goldenZone: 0.86,
breakLine: 0.54,
thirdPlayer: 0.7,
switchPlay: 0.52,
wideOverload: 0.56,
overlapUnderlap: 0.46,
driveSpace: 0.48,
isolate1v1: 0.4,
boxDelivery: 0.36,
cutback: 0.42,
restDefence: 0.78,
},
"3-4-3": {
secure: 0.58,
goldenZone: 0.86,
breakLine: 0.62,
thirdPlayer: 0.58,
switchPlay: 0.66,
wideOverload: 0.78,
overlapUnderlap: 0.82,
driveSpace: 0.52,
isolate1v1: 0.5,
boxDelivery: 0.58,
cutback: 0.54,
secondBall: 0.46,
restDefence: 0.72,
},
"4-4-2": {
secure: 0.42,
goldenZone: 0.84,
breakLine: 0.62,
thirdPlayer: 0.42,
switchPlay: 0.54,
wideOverload: 0.58,
overlapUnderlap: 0.42,
driveSpace: 0.58,
isolate1v1: 0.44,
boxDelivery: 0.68,
secondBall: 0.76,
counterAttack: 0.7,
restDefence: 0.56,
},
"4-2-3-1": {
secure: 0.7,
goldenZone: 0.94,
breakLine: 0.64,
thirdPlayer: 0.78,
switchPlay: 0.56,
wideOverload: 0.64,
overlapUnderlap: 0.64,
driveSpace: 0.46,
isolate1v1: 0.52,
boxDelivery: 0.48,
cutback: 0.6,
restDefence: 0.78,
},
"3-5-2": {
secure: 0.62,
goldenZone: 0.9,
breakLine: 0.58,
thirdPlayer: 0.72,
switchPlay: 0.62,
wideOverload: 0.7,
overlapUnderlap: 0.76,
driveSpace: 0.46,
boxDelivery: 0.7,
secondBall: 0.62,
restDefence: 0.72,
},
};
function mergeIntentionWeights(...profiles) {
const merged = {};
Object.keys(autoPilotPrincipleLabels).forEach((key) => {
const values = profiles
.map((profile) => profile?.[key])
.filter((value) => Number.isFinite(value));
if (!values.length) {
merged[key] = 0;
return;
}
const average = values.reduce((total, value) => total + value, 0) / values.length;
const peak = Math.max(...values);
merged[key] = clamp(average * 0.62 + peak * 0.38, 0, 1.15);
});
return merged;
}
function getAutoPilotIntentionModel(carrier, startPoint, profile) {
const flow = getAutoPilotFlowContext(carrier, startPoint);
const rhythm = getPossessionRhythmContext(carrier.team);
const regain = getAutoPilotRegainContext(carrier, startPoint, profile);
const phaseWeights =
autoPilotPhaseIntentionWeights[profile.phaseKey] ?? autoPilotPhaseIntentionWeights.progression;
const styleWeights =
autoPilotStyleIntentionWeights[profile.styleKey] ?? autoPilotStyleIntentionWeights.balanced;
const formationWeights =
autoPilotFormationIntentionWeights[profile.formation] ?? autoPilotFormationIntentionWeights["4-3-3"];
const weights = mergeIntentionWeights(phaseWeights, styleWeights, formationWeights);
const ballDepth = getAttackingDepth(startPoint, carrier.team);
const carrierRoleKey = getOffensiveRoleKey(carrier, teams[carrier.team]?.formation);
if (flow.pressure >= 0.58) {
weights.secure = clamp(weights.secure + 0.24, 0, 1.25);
weights.thirdPlayer = clamp(weights.thirdPlayer + 0.14, 0, 1.25);
weights.driveSpace = clamp(weights.driveSpace + (getPlayerTendency(carrier, "dribble") >= 0.58 ? 0.16 : 0.04), 0, 1.25);
}
if (rhythm.sidewaysPasses >= 1) {
weights.switchPlay = clamp(weights.switchPlay + 0.18 + Math.min(rhythm.sidewaysPasses, 3) * 0.08, 0, 1.28);
weights.breakLine = clamp(weights.breakLine + 0.12, 0, 1.25);
}
if (rhythm.backPasses >= 1 && rhythm.forwardPasses === 0 && rhythm.steps >= 2) {
weights.breakLine = clamp(weights.breakLine + 0.22, 0, 1.28);
weights.driveSpace = clamp(weights.driveSpace + 0.12, 0, 1.22);
weights.secure = clamp(weights.secure - 0.12, 0, 1.1);
}
if (flow.consecutivePasses >= 2) {
weights.thirdPlayer = clamp(weights.thirdPlayer + 0.16, 0, 1.25);
weights.breakLine = clamp(weights.breakLine + 0.12, 0, 1.25);
}
if (ballDepth >= 66) {
weights.shoot = clamp(weights.shoot + 0.22, 0, 1.3);
weights.cutback = clamp(weights.cutback + 0.14, 0, 1.25);
weights.boxDelivery = clamp(weights.boxDelivery + 0.12, 0, 1.25);
}
if (carrierRoleKey === "wideForward" || carrierRoleKey === "wideBack") {
weights.wideOverload = clamp(weights.wideOverload + 0.16, 0, 1.25);
weights.isolate1v1 = clamp(weights.isolate1v1 + 0.12, 0, 1.22);
weights.cutback = clamp(weights.cutback + (ballDepth >= 62 ? 0.12 : 0), 0, 1.25);
}
if (carrierRoleKey === "pivot" || carrierRoleKey === "connector") {
weights.thirdPlayer = clamp(weights.thirdPlayer + 0.12, 0, 1.25);
weights.switchPlay = clamp(weights.switchPlay + 0.08, 0, 1.18);
}
const forwardFacingSpaceTwo = getForwardFacingSpaceTwoContext(carrier, startPoint);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
if (forwardFacingSpaceTwo.active) {
weights.goldenZone = clamp((weights.goldenZone ?? 0) + 0.34, 0, 1.35);
weights.breakLine = clamp(weights.breakLine + 0.24, 0, 1.3);
weights.driveSpace = clamp(weights.driveSpace + 0.18, 0, 1.25);
weights.secure = clamp(weights.secure - 0.22, 0, 1.05);
weights.restDefence = clamp(weights.restDefence - 0.18, 0, 1.05);
}
if (progressionWindow.active) {
weights.goldenZone = clamp((weights.goldenZone ?? 0) + 0.22 + progressionWindow.goldenAhead * 0.16, 0, 1.42);
weights.breakLine = clamp(weights.breakLine + 0.2 + progressionWindow.openLane * 0.14, 0, 1.38);
weights.driveSpace = clamp(weights.driveSpace + 0.2 + progressionWindow.openLane * 0.18, 0, 1.34);
weights.shoot = clamp(weights.shoot + (progressionWindow.depth >= 62 ? 0.14 : 0), 0, 1.34);
weights.secure = clamp(weights.secure - 0.14 * progressionWindow.urgency, 0, 1.08);
weights.restDefence = clamp(weights.restDefence - 0.1 * progressionWindow.urgency, 0, 1.08);
}
if (regain.active) {
const fresh = regain.freshness;
const secureNeed = regain.secureIntent * fresh;
const counterNeed = regain.counterIntent * fresh;
weights.secure = clamp(weights.secure + secureNeed * 0.36 + (regain.pressure >= 0.52 ? 0.2 : 0), 0, 1.35);
weights.thirdPlayer = clamp(weights.thirdPlayer + secureNeed * 0.18 + fresh * 0.08, 0, 1.3);
weights.restDefence = clamp(weights.restDefence + secureNeed * 0.16, 0, 1.25);
weights.counterAttack = clamp(weights.counterAttack + counterNeed * 0.48 + regain.forwardOpenSpace * 0.18, 0, 1.42);
weights.breakLine = clamp(weights.breakLine + counterNeed * 0.28, 0, 1.35);
weights.driveSpace = clamp(weights.driveSpace + counterNeed * 0.18 + regain.forwardOpenSpace * 0.12, 0, 1.3);
weights.goldenZone = clamp((weights.goldenZone ?? 0) + counterNeed * 0.18, 0, 1.4);
if (regain.pressure <= 0.34 && regain.forwardOpenSpace >= 0.62) {
weights.secure = clamp(weights.secure - 0.08, 0, 1.25);
weights.counterAttack = clamp(weights.counterAttack + 0.16, 0, 1.45);
}
}
return {
weights,
flow,
rhythm,
ballDepth,
carrierRoleKey,
forwardFacingSpaceTwo,
progressionWindow,
regain,
};
}
function getAutoPilotCandidatePrincipleMetrics(candidate, carrier, startPoint, profile, model) {
const targetLaneKey = getPitchLaneKey(candidate.target);
const startLaneKey = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLaneKey) - getPitchLaneIndex(startLaneKey));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const targetDepth = getAttackingDepth(candidate.target, carrier.team);
const targetIsWide = targetLaneKey === "leftWide" || targetLaneKey === "rightWide";
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const goalDistance = distance(startPoint, getOpponentGoalCenter(carrier.team));
const targetGoalDistance = distance(candidate.target, getOpponentGoalCenter(carrier.team));
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, candidate.target)
: 0.35;
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const threatGain = getActionThreatGain(startPoint, candidate.target, carrier.team);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
const centralPocketScore = targetThreat.centralPocket;
const supportRole = receiverRoleKey === "pivot" || receiverRoleKey === "connector" || receiverRoleKey === "secondStriker";
const forwardRole = receiverRoleKey === "striker" || receiverRoleKey === "wideForward" || receiverRoleKey === "secondStriker";
const isLongForwardPass = candidate.actionType === "pass" && passDistance >= 26 && forwardGain >= 8;
const insideBoxShot = candidate.actionType === "shot" && (candidate.insideBox || goalDistance <= 22);
const metrics = {
secure: 0,
attractPressure: 0,
goldenZone: 0,
breakLine: 0,
thirdPlayer: 0,
switchPlay: 0,
wideOverload: 0,
overlapUnderlap: 0,
driveSpace: 0,
isolate1v1: 0,
boxDelivery: 0,
cutback: 0,
shoot: 0,
secondBall: 0,
counterAttack: 0,
restDefence: 0,
};
if (candidate.actionType === "pass") {
metrics.secure = clamp(
(passDistance <= 18 ? 0.62 : 0.26) +
(receiverPressure <= 0.52 ? 0.24 : 0) +
(forwardGain >= -7 ? 0.12 : -0.16) +
(supportRole ? 0.18 : 0),
0,
1
);
metrics.attractPressure = clamp(
(Math.abs(forwardGain) < 4 && passDistance <= 16 ? 0.42 : 0) +
(model.flow.pressure >= 0.46 ? 0.24 : 0) +
(supportRole ? 0.18 : 0),
0,
1
);
metrics.breakLine = clamp(
(candidate.isLineBreak ? 0.76 : 0) +
clamp(forwardGain / 18, 0, 0.62) +
(forwardRole && targetDepth >= model.ballDepth + 6 ? 0.2 : 0) +
clamp(actionSpace.lineBreakCount / 3, 0, 1) * 0.22,
0,
1
);
metrics.goldenZone = clamp(
centralPocketScore * 0.68 +
targetThreat.betweenLines * 0.24 +
targetThreat.cutbackZone * 0.18 +
Math.max(0, threatGain) * 0.24 +
actionSpace.value * 0.16 +
(forwardGain >= 5 ? 0.16 : 0) +
(receiverPressure <= 0.56 ? 0.12 : 0) +
(model.forwardFacingSpaceTwo.active && forwardGain >= 2 ? 0.2 : 0) +
(model.progressionWindow?.active && forwardGain >= 3 ? 0.16 : 0),
0,
1
);
metrics.thirdPlayer = clamp(
(supportRole && passDistance <= 24 ? 0.48 : 0) +
(model.flow.consecutivePasses >= 1 || model.flow.carrierJustReceived ? 0.28 : 0) +
(receiver ? getPlayerTendency(receiver, "passAndMove") * 0.22 : 0),
0,
1
);
metrics.switchPlay = clamp(
(candidate.isSwitch ? 0.78 : 0) +
(laneShift >= 2 && passDistance >= 16 ? 0.42 : 0) +
(model.rhythm.sidewaysPasses >= 1 ? 0.22 : 0),
0,
1
);
metrics.wideOverload = clamp(
(targetIsWide && (receiverRoleKey === "wideForward" || receiverRoleKey === "wideBack") ? 0.58 : 0) +
(candidate.isPrinciplePattern ? 0.32 : 0) +
(targetDepth >= 42 ? 0.14 : 0),
0,
1
);
metrics.overlapUnderlap = clamp(
(candidate.principleKey === "wide-overlap" || candidate.principleKey === "wide-overlap-entry" ? 0.86 : 0) +
(receiverRoleKey === "wideBack" && targetIsWide && forwardGain >= -1 ? 0.28 : 0),
0,
1
);
metrics.isolate1v1 = clamp(
(receiverRoleKey === "wideForward" && targetIsWide && targetDepth >= 48 ? 0.48 : 0) +
(candidate.laneClarity >= 0.72 ? 0.16 : 0),
0,
1
);
metrics.boxDelivery = clamp(
(candidate.isBoxPass ? 0.62 : 0) +
(candidate.label === "cross" ? 0.76 : 0) +
targetThreat.assistZone * 0.26 +
(targetDepth >= 72 && Math.abs(candidate.target.y - pitch.width / 2) <= 18 ? 0.28 : 0),
0,
1
);
metrics.cutback = candidate.label === "cutback" ? 1 : 0;
metrics.secondBall = clamp(
(isLongForwardPass && (receiverRoleKey === "striker" || receiverRoleKey === "secondStriker") ? 0.68 : 0) +
(isLongForwardPass ? clamp(candidate.supportNearTarget ?? 0, 0, 3) * 0.12 : 0) +
(profile.routeOneBias >= 0.55 ? 0.22 : 0),
0,
1
);
metrics.counterAttack = clamp(
(forwardGain >= 10 && passDistance >= 12 ? 0.44 : 0) +
(targetGoalDistance <= goalDistance - 8 ? 0.32 : 0) +
(profile.directness >= 0.68 ? 0.18 : 0) +
(actionSpace.openTarget >= 0.62 && forwardGain >= 7 ? 0.16 : 0),
0,
1
);
metrics.restDefence = clamp(
((receiverRoleKey === "pivot" || receiverRoleKey === "rest" || receiverRoleKey === "gk") && targetDepth <= 58 ? 0.56 : 0) +
(forwardGain <= -4 && model.rhythm.steps <= 1 ? 0.22 : 0),
0,
1
);
}
if (candidate.actionType === "dribble") {
metrics.driveSpace = clamp(
(forwardGain >= 4.5 ? 0.46 : 0) +
(targetGoalDistance <= goalDistance - 3 ? 0.26 : 0) +
Math.max(0, threatGain) * 0.28 +
actionSpace.value * 0.18 +
(model.flow.pressure <= 0.58 ? 0.18 : 0) +
getPlayerTendency(carrier, "dribble") * 0.18,
0,
1
);
metrics.goldenZone = clamp(
centralPocketScore * 0.58 +
targetThreat.betweenLines * 0.22 +
targetThreat.halfSpace * 0.16 +
Math.max(0, threatGain) * 0.28 +
(model.forwardFacingSpaceTwo.active && forwardGain >= 3 ? 0.26 : 0) +
(targetGoalDistance <= goalDistance - 4 ? 0.12 : 0),
0,
1
);
metrics.breakLine = clamp(forwardGain / 18, 0, 0.72);
metrics.breakLine = clamp(metrics.breakLine + clamp(actionSpace.lineBreakCount / 3, 0, 1) * 0.18, 0, 1);
metrics.isolate1v1 = clamp(
((model.carrierRoleKey === "wideForward" || model.carrierRoleKey === "wideBack") && targetIsWide ? 0.52 : 0) +
(model.flow.pressure >= 0.28 && model.flow.pressure <= 0.68 ? 0.16 : 0),
0,
1
);
metrics.counterAttack = clamp(
(targetGoalDistance <= goalDistance - 7 ? 0.48 : 0) +
(profile.directness >= 0.62 ? 0.22 : 0) +
(forwardGain >= 10 ? 0.18 : 0),
0,
1
);
}
if (candidate.actionType === "shot") {
metrics.shoot = clamp(
(insideBoxShot ? 0.82 : 0.38) +
(candidate.mustShoot ? 0.28 : 0) +
(candidate.laneClarity >= 0.45 ? 0.16 : 0),
0,
1
);
metrics.goldenZone = clamp(getPitchThreatProfile(startPoint, carrier.team).centralPocket * 0.74, 0, 1);
metrics.cutback = insideBoxShot && model.rhythm.lastStep?.label === "cutback" ? 0.42 : 0;
}
if (model.regain?.active) {
const transitionForce = model.regain.freshness;
const counterFit = model.regain.counterIntent * transitionForce;
const secureFit = model.regain.secureIntent * transitionForce;
if (candidate.actionType === "pass") {
metrics.secure = clamp(
metrics.secure +
secureFit * (passDistance <= 19 && receiverPressure <= 0.68 ? 0.46 : 0.16) +
(supportRole ? 0.18 : 0),
0,
1.12
);
metrics.thirdPlayer = clamp(metrics.thirdPlayer + (supportRole ? secureFit * 0.2 : 0), 0, 1.08);
metrics.counterAttack = clamp(
metrics.counterAttack +
counterFit * (forwardGain >= 6 ? 0.52 : 0.12) +
(candidate.principleKey === "regain-forward-release" ? 0.38 : 0) +
(targetGoalDistance <= goalDistance - 8 ? 0.16 : 0),
0,
1.15
);
metrics.breakLine = clamp(metrics.breakLine + counterFit * (candidate.isLineBreak ? 0.28 : 0.1), 0, 1.12);
metrics.restDefence = clamp(
metrics.restDefence +
(forwardGain <= -3 && (receiverRoleKey === "pivot" || receiverRoleKey === "rest" || receiverRoleKey === "gk")
? secureFit * 0.24
: 0),
0,
1.08
);
}
if (candidate.actionType === "dribble") {
metrics.driveSpace = clamp(metrics.driveSpace + counterFit * 0.34 + model.regain.forwardOpenSpace * 0.14, 0, 1.1);
metrics.counterAttack = clamp(metrics.counterAttack + counterFit * (forwardGain >= 6 ? 0.34 : 0.08), 0, 1.08);
}
if (candidate.actionType === "shot") {
metrics.shoot = clamp(metrics.shoot + counterFit * 0.16 + (goalDistance <= 28 ? 0.12 : 0), 0, 1.08);
}
}
return metrics;
}
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
function getAutoPilotVisionScanAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getPlayerDecisionContext(carrier);
const intelligence = context.profile ?? buildPlayerIntelligenceProfile(carrier);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const actionAngle =
candidate.actionType === "shot"
? angleBetween(startPoint, getOpponentGoalCenter(carrier.team))
: angleBetween(startPoint, candidate.target);
const bodyAngle = getPlayerFacingAngle(carrier);
const angleGap = angleDifference(bodyAngle, actionAngle);
const visibleCone = clamp(1 - angleGap / (Math.PI * 0.72), 0, 1);
const peripheralVision = clamp(1 - angleGap / (Math.PI * 0.95), 0, 1);
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const laneShift = Math.abs(getPitchLaneIndex(candidate.target) - getPitchLaneIndex(startPoint));
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[carrier.team]?.formation) : null);
const shortSupport =
candidate.actionType === "pass" &&
passDistance <= 18 &&
forwardGain >= -7 &&
(isSupportRole(receiverRoleKey) || receiverRoleKey === "rest" || receiverRoleKey === "gk");
const highValueForward =
forwardGain >= 4 &&
(targetThreat.value >= 0.36 ||
targetThreat.betweenLines >= 0.34 ||
targetThreat.centralPocket >= 0.28 ||
candidate.isLineBreak ||
candidate.isBoxPass);
const scanCapacity = clamp(
intelligence.perception * 0.34 +
intelligence.decisionQuality * 0.24 +
intelligence.decisionSpeed * 0.18 +
intelligence.tacticalDiscipline * 0.14 +
intelligence.composure * 0.1 -
pressure * (0.18 + (1 - intelligence.pressResistance) * 0.2),
0,
1
);
const actionComplexity = clamp(
(passDistance >= 27 ? 0.22 : 0) +
(laneShift >= 2 ? 0.2 : 0) +
(candidate.isSwitch ? 0.16 : 0) +
(candidate.isLineBreak ? 0.18 : 0) +
(pattern.family === "third-player" ? 0.14 : 0) +
(targetThreat.behindLine >= 0.28 ? 0.12 : 0) +
(targetThreat.value >= 0.48 ? 0.1 : 0) +
pressure * 0.16,
0,
1
);
const scanGap = actionComplexity - scanCapacity * 0.72 - peripheralVision * 0.34;
const blindRisk = clamp(scanGap, 0, 1);
const labels = [];
let score = 0;
if (visibleCone >= 0.64 && highValueForward) {
score += 0.14 + scanCapacity * 0.16 + (profile.tempo ?? 0.5) * 0.04;
labels.push("Vision: sees forward option");
}
if (shortSupport && pressure >= 0.48 && peripheralVision >= 0.48) {
score += 0.12 + intelligence.decisionSpeed * 0.08 + intelligence.pressResistance * 0.06;
labels.push("Vision: simple support angle");
}
if (
candidate.actionType === "pass" &&
(candidate.isSwitch || laneShift >= 2) &&
passDistance >= 18
) {
if (scanCapacity >= 0.72 && pressure <= 0.62) {
score += 0.1 + intelligence.perception * 0.08 + (candidate.isSwitch ? 0.06 : 0);
labels.push("Vision: scanned weak side");
} else if (visibleCone < 0.34 && !candidate.isBoxPass) {
score -= 0.18 + blindRisk * 0.32;
labels.push("Vision: blind-side option");
}
}
if (
blindRisk >= 0.18 &&
!shortSupport &&
candidate.actionType !== "shot" &&
!candidate.mustShoot
) {
score -= 0.12 + blindRisk * 0.46;
}
if (
candidate.actionType === "dribble" &&
forwardGain >= 5 &&
visibleCone >= 0.58 &&
pressure <= 0.58
) {
score += 0.1 + intelligence.decisionSpeed * 0.06;
labels.push("Vision: carries what is open");
}
if (
candidate.actionType === "pass" &&
forwardGain <= -5 &&
visibleCone < 0.28 &&
pressure <= 0.46 &&
targetThreat.value <= getPitchThreatProfile(startPoint, carrier.team).value + 0.04
) {
score -= 0.16 + (profile.progressionUrgency ?? 0.5) * 0.16;
}
return {
score: clamp(score, -0.9, 0.72),
labels: uniquePrincipleLabels(labels),
context: {
visibleCone,
peripheralVision,
scanCapacity,
actionComplexity,
blindRisk,
angleGap,
pressure,
highValueForward,
shortSupport,
},
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
function uniquePrincipleLabels(labels) {
return [...new Set(labels.filter(Boolean))].slice(0, 3);
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
function getAutoPilotCandidateReceiver(candidate, carrier) {
if (!candidate || candidate.actionType !== "pass") {
return null;
}
if (candidate.receiverPlayerId) {
return getPlayerById(candidate.receiverPlayerId);
}
if (candidate.principleRunnerPlayerId) {
return getPlayerById(candidate.principleRunnerPlayerId);
}
return getPotentialPassReceiverAtTarget(carrier, candidate.target);
}
function getAutoPilotRoleResponsibilityAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const formation = teams[teamId]?.formation;
const roleKey = getOffensiveRoleKey(carrier, formation);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const family = pattern.family;
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
const receiverRoleKey =
candidate.receiverRoleKey ??
pattern.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, formation) : null);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const targetThreat =
candidate.actionType === "shot"
? startThreat
: getPitchThreatProfile(candidate.target, teamId);
const actionSpace =
candidate.actionType === "shot"
? {
value: startThreat.value,
lineBreakCount: 0,
openTarget: 0,
targetPressure: getOpponentPressureAtPoint(teamId, startPoint),
targetThreat,
startThreat,
}
: getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const forwardGain = pattern.forwardGain;
const passDistance = pattern.passDistance;
const depth = getAttackingDepth(startPoint, teamId);
const targetDepth = candidate.actionType === "shot" ? depth : getAttackingDepth(candidate.target, teamId);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, candidate.target, {
receiverPlayerId: candidate.receiverPlayerId ?? null,
})
: actionSpace.openTarget ?? 0.55;
const principleText = [
candidate.principleKey,
candidate.principleLabel,
...(candidate.principleLabels ?? []),
].filter(Boolean).join(" ").toLowerCase();
const supportReceiver =
receiverRoleKey === "gk" ||
receiverRoleKey === "rest" ||
receiverRoleKey === "wideBack" ||
receiverRoleKey === "pivot" ||
receiverRoleKey === "connector";
const forwardReceiver = isFrontLineRole(receiverRoleKey);
const wideAction =
family === "wide-overload" ||
family === "cross" ||
family === "cutback" ||
principleText.includes("wide") ||
principleText.includes("overlap");
const highValueAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= 0.58 ||
targetThreat.box >= 0.2 ||
targetThreat.centralPocket >= 0.34 ||
(actionSpace.lineBreakCount ?? 0) >= 1;
const lowValueReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain < 1.5 &&
targetThreat.value <= startThreat.value + 0.04 &&
(actionSpace.lineBreakCount ?? 0) === 0 &&
pressure <= 0.58;
const labels = [];
let score = 0;
const add = (amount, label = null) => {
score += amount;
if (label) {
labels.push(label);
}
};
if (roleKey === "gk") {
if (
candidate.actionType === "pass" &&
["rest", "wideBack", "pivot"].includes(receiverRoleKey) &&
passDistance <= 34
) {
add(0.24, "Role fit: first build pass");
}
if (
candidate.actionType === "pass" &&
forwardReceiver &&
(pressure >= 0.5 || (profile.directness ?? 0.5) >= 0.62)
) {
add(0.14, "Role fit: pressure release");
}
if (candidate.actionType === "dribble") {
add(-0.48);
}
if (candidate.actionType === "shot") {
add(-0.9);
}
} else if (roleKey === "rest") {
if (
candidate.actionType === "pass" &&
["gk", "rest", "wideBack", "pivot"].includes(receiverRoleKey) &&
depth < 58 &&
pressure <= 0.62
) {
add(0.14, "Role fit: secure first line");
}
if (candidate.actionType === "pass" && (candidate.isSwitch || family === "switch") && laneClarity >= 0.5) {
add(0.18, "Role fit: change corridor");
}
if (candidate.actionType === "pass" && candidate.isLineBreak && laneClarity >= 0.44) {
add(0.16, "Role fit: break first pressure");
}
if (candidate.actionType === "dribble" && forwardGain >= 4 && pressure <= 0.42 && depth < 58) {
add(0.1, "Role fit: step in");
}
if (candidate.actionType === "shot" || (targetDepth >= 72 && !highValueAction)) {
add(-0.36);
}
if (candidate.actionType === "pass" && passDistance >= 34 && !candidate.isSwitch && !candidate.isLineBreak) {
add(-0.26, "Role check: avoid hopeful long ball");
}
} else if (roleKey === "wideBack") {
if (wideAction || candidate.isBoxPass) {
add(0.24, "Role fit: wide relation");
}
if (candidate.actionType === "pass" && (candidate.isSwitch || family === "switch")) {
add(0.1, "Role fit: weak-side switch");
}
if (
candidate.actionType === "pass" &&
["wideForward", "connector"].includes(receiverRoleKey) &&
forwardGain >= -2
) {
add(0.13, "Role fit: connect outside lane");
}
if (candidate.actionType === "dribble" && forwardGain >= 5 && targetThreat.wideCorridor >= 0.3) {
add(0.12, "Role fit: carry the flank");
}
if (candidate.actionType === "shot" && targetThreat.box < 0.22) {
add(-0.34);
}
if (lowValueReset && depth >= 52 && pressure <= 0.46) {
add(-0.24, "Role check: keep wide attack alive");
}
} else if (roleKey === "pivot") {
if (candidate.actionType === "pass" && supportReceiver && pressure >= 0.42 && passDistance <= 20) {
add(0.14, "Role fit: play out of pressure");
}
if (candidate.actionType === "pass" && (candidate.isSwitch || family === "switch") && laneClarity >= 0.48) {
add(0.2, "Role fit: switch from six");
}
if (
candidate.actionType === "pass" &&
(candidate.isLineBreak || targetThreat.centralPocket >= 0.28 || actionSpace.targetGameSpaceKey === "space2") &&
forwardGain >= 4.5
) {
add(0.22, "Role fit: find space two");
}
if (candidate.actionType === "dribble" && forwardGain >= 4 && pressure <= 0.34) {
add(0.08, "Role fit: carry through midfield");
}
if (candidate.actionType === "shot" && depth < 68) {
add(-0.44);
}
if (candidate.actionType === "dribble" && targetDepth >= 74 && pressure >= 0.34) {
add(-0.2);
}
} else if (roleKey === "connector") {
if (
candidate.actionType === "pass" &&
(candidate.isLineBreak || family === "third-player" || targetThreat.centralPocket >= 0.3 || highValueAction)
) {
add(0.23, "Role fit: connect and break lines");
}
if (candidate.actionType === "dribble" && forwardGain >= 4 && pressure <= 0.56) {
add(0.17, "Role fit: drive between lines");
}
if (candidate.actionType === "shot" && (depth >= 64 || startThreat.centralPocket >= 0.32 || startThreat.box >= 0.16)) {
add(0.18, "Role fit: attack the box");
}
if (candidate.actionType === "pass" && wideAction && receiverRoleKey === "wideBack") {
add(0.08, "Role fit: release overlap");
}
if (lowValueReset && depth >= 45 && pressure <= 0.5) {
add(-0.38, "Role check: protect forward advantage");
}
} else if (roleKey === "wideForward") {
if (candidate.actionType === "dribble" && forwardGain >= 3) {
add(0.22, "Role fit: attack outside lane");
}
if (wideAction || candidate.isBoxPass) {
add(0.22, "Role fit: create from wide");
}
if (candidate.actionType === "shot" && (depth >= 66 || startThreat.box >= 0.18 || startThreat.halfSpace >= 0.32)) {
add(0.18, "Role fit: finish from front line");
}
if (candidate.actionType === "pass" && ["wideBack", "connector"].includes(receiverRoleKey) && pressure >= 0.38) {
add(0.08, "Role fit: bounce and move");
}
if (lowValueReset && depth >= 50 && pressure <= 0.5) {
add(-0.36, "Role check: threaten before reset");
}
} else if (roleKey === "striker" || roleKey === "secondStriker") {
if (candidate.actionType === "shot") {
add(0.28, "Role fit: finish attack");
}
if (
candidate.actionType === "pass" &&
(candidate.isBoxPass || candidate.isLineBreak || family === "front-line" || highValueAction)
) {
add(0.17, "Role fit: combine in final line");
}
if (candidate.actionType === "pass" && supportReceiver && passDistance <= 16 && pressure >= 0.36) {
add(0.12, "Role fit: set and spin");
}
if (candidate.actionType === "dribble" && forwardGain >= 3 && (depth >= 58 || targetThreat.box >= 0.16)) {
add(0.14, "Role fit: attack goal");
}
if (lowValueReset && pressure <= 0.5) {
add(-0.38, "Role check: keep final-line threat");
}
if (candidate.actionType === "pass" && ["gk", "rest"].includes(receiverRoleKey) && depth >= 48) {
add(-0.42, "Role check: avoid deep reset from front line");
}
}
if (
candidate.actionType === "pass" &&
receiverRoleKey === "gk" &&
depth >= 42 &&
pressure <= 0.52 &&
!candidate.isSwitch
) {
add(-0.36, "Role check: avoid unnecessary goalkeeper reset");
}
if (
highValueAction &&
candidate.actionType !== "shot" &&
laneClarity >= 0.56 &&
["pivot", "connector", "wideForward", "striker", "secondStriker"].includes(roleKey)
) {
add(0.08, "Role fit: take the advantage");
}
return {
score: clamp(score, -1.05, 0.9),
labels: uniquePrincipleLabels(labels),
context: {
roleKey,
receiverRoleKey,
family,
highValueAction,
lowValueReset,
pressure,
depth,
targetDepth,
laneClarity,
},
};
}
function getAutoPilotLocalSuperiorityProfile(teamId, point, excludedIds = new Set(), radius = 15) {
if (!teamId || !point) {
return {
supportCount: 0,
opponentCount: 0,
closeOpponents: 0,
underSupport: false,
forwardSupport: false,
lateralSupport: false,
geometryScore: 0,
};
}
const attackSign = getAttackDirectionSign(teamId);
const teammates = [];
const opponents = [];
let closeOpponents = 0;
let underSupport = false;
let forwardSupport = false;
let lateralSupport = false;
const supportSectors = new Set();
state.players.forEach((player) => {
if (isGoalkeeper(player)) {
return;
}
const gap = distance(player.position, point);
if (gap > radius) {
return;
}
if (player.team === teamId) {
if (excludedIds.has(player.id)) {
return;
}
teammates.push(player);
const forwardOffset = (player.position.x - point.x) * attackSign;
const lateralOffset = player.position.y - point.y;
if (forwardOffset <= -2.2 && Math.abs(lateralOffset) <= 17) {
underSupport = true;
supportSectors.add("under");
}
if (forwardOffset >= 3.2 && Math.abs(lateralOffset) <= 18) {
forwardSupport = true;
supportSectors.add("ahead");
}
if (Math.abs(lateralOffset) >= 6.8) {
lateralSupport = true;
supportSectors.add(lateralOffset > 0 ? "outsidePlus" : "outsideMinus");
}
if (Math.abs(forwardOffset) <= 5 && Math.abs(lateralOffset) <= 9) {
supportSectors.add("bounce");
}
return;
}
opponents.push(player);
if (gap <= 5.5) {
closeOpponents += 1;
}
});
const supportCount = teammates.length;
const opponentCount = opponents.length;
const sectorVariety = supportSectors.size;
const geometryScore = clamp(
(underSupport ? 0.28 : 0) +
(lateralSupport ? 0.2 : 0) +
(forwardSupport ? 0.18 : 0) +
clamp(supportCount / 3, 0, 1) * 0.22 +
clamp(sectorVariety / 4, 0, 1) * 0.18 -
clamp(closeOpponents / 3, 0, 1) * 0.16,
0,
1
);
return {
supportCount,
opponentCount,
closeOpponents,
underSupport,
forwardSupport,
lateralSupport,
sectorVariety,
geometryScore,
};
}
function getAutoPilotLocalSuperiorityAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier?.team || !startPoint) {
return { score: 0, labels: [], context: null };
}
const teamId = carrier.team;
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
const receiverId = receiver?.team === teamId ? receiver.id : candidate.receiverPlayerId ?? null;
const excludedIds = new Set([
carrier.id,
receiverId,
candidate.principleRunnerPlayerId,
].filter(Boolean));
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const radius =
candidate.actionType === "dribble"
? 13.5
: passDistance >= 26
? 17
: 14.5;
const local = getAutoPilotLocalSuperiorityProfile(teamId, candidate.target, excludedIds, radius);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, candidate.target, teamId, profile);
const targetThreat = candidate.actionType === "shot"
? getPitchThreatProfile(startPoint, teamId)
: getPitchThreatProfile(candidate.target, teamId);
const startThreat = getPitchThreatProfile(startPoint, teamId);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(teamId));
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver?.team === teamId
? getPlayerPressureLoad(receiver, candidate.target)
: actionSpace?.targetPressure ?? getOpponentPressureAtPoint(teamId, candidate.target, 11);
const openTarget = actionSpace?.openTarget ?? clamp((getNearestOpponentGapToPoint(teamId, candidate.target) - 2.2) / 8.8, 0, 1);
const targetDepth = getAttackingDepth(candidate.target, teamId);
const highValueAction =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.box >= 0.22 ||
targetThreat.cutbackZone >= 0.24 ||
targetThreat.centralPocket >= 0.34 ||
targetThreat.behindLine >= 0.28 ||
(actionSpace?.lineBreakCount ?? 0) >= 1;
const localPresence = local.supportCount + (candidate.actionType === "dribble" ? 1 : 0);
const numericalBalance = localPresence - local.opponentCount;
const playableTriangle = local.underSupport && local.lateralSupport && local.geometryScore >= 0.48;
const isolatedTarget =
candidate.actionType !== "shot" &&
local.supportCount <= 0 &&
local.opponentCount >= 1 &&
receiverPressure >= 0.5 &&
openTarget < 0.58;
const underloadedAction =
candidate.actionType !== "shot" &&
numericalBalance <= -1 &&
local.closeOpponents >= 1 &&
openTarget < 0.5;
const crowdedSameSide =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
local.supportCount >= 3 &&
local.opponentCount >= 3 &&
forwardGain < 4 &&
targetThreat.value <= startThreat.value + 0.05 &&
targetDepth < 74;
const noBounceForPressedReceiver =
candidate.actionType === "pass" &&
receiverPressure >= 0.62 &&
!local.underSupport &&
!local.lateralSupport &&
!highValueAction;
const switchIntoWeakSide =
candidate.actionType === "pass" &&
candidate.isSwitch &&
(local.supportCount >= 1 || openTarget >= 0.62) &&
local.opponentCount <= 2;
const dribbleWithSupport =
candidate.actionType === "dribble" &&
forwardGain >= 3 &&
openTarget >= 0.5 &&
(local.underSupport || local.lateralSupport || local.supportCount >= 2);
const labels = [];
let score = 0;
if (playableTriangle) {
score += 0.22 + (profile.shortSupport ?? 0.5) * 0.12;
labels.push("Local superiority: playable triangle");
} else if (local.geometryScore >= 0.6 && local.supportCount >= 2) {
score += 0.14 + (profile.shortSupport ?? 0.5) * 0.08;
labels.push("Local superiority: support around ball");
}
if (switchIntoWeakSide) {
score += 0.18 + (profile.switchBias ?? 0.5) * 0.12;
labels.push("Local superiority: weak-side access");
}
if (dribbleWithSupport) {
score += 0.12 + (profile.carryBias ?? 0.5) * 0.08;
labels.push("Local superiority: carry with support");
}
if (isolatedTarget && !highValueAction) {
score -= 0.42 + receiverPressure * 0.18;
labels.push("Avoid isolated target");
} else if (isolatedTarget && highValueAction && openTarget < 0.42) {
score -= 0.18;
}
if (underloadedAction && !highValueAction) {
score -= 0.32 + Math.abs(numericalBalance) * 0.1;
labels.push("Avoid playing into underload");
}
if (crowdedSameSide) {
score -= 0.3 + (profile.progressionUrgency ?? 0.5) * 0.12;
labels.push("Avoid same-side crowd");
}
if (noBounceForPressedReceiver) {
score -= 0.2 + receiverPressure * 0.12;
labels.push("Receiver needs a bounce option");
}
if (
candidate.actionType === "pass" &&
!candidate.isSwitch &&
forwardGain >= 4 &&
local.underSupport &&
openTarget >= 0.42 &&
receiverPressure <= 0.66
) {
score += 0.1 + (profile.tempo ?? 0.5) * 0.08;
}
return {
score: clamp(score, -0.95, 0.72),
labels: uniquePrincipleLabels(labels),
context: {
supportCount: local.supportCount,
opponentCount: local.opponentCount,
closeOpponents: local.closeOpponents,
underSupport: local.underSupport,
lateralSupport: local.lateralSupport,
forwardSupport: local.forwardSupport,
geometryScore: local.geometryScore,
numericalBalance,
receiverPressure,
openTarget,
isolatedTarget,
underloadedAction,
crowdedSameSide,
playableTriangle,
},
};
}
function getReceiverAvailabilityProfile(candidate, carrier, startPoint, profile) {
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
if (!receiver || receiver.team !== carrier.team || !candidate?.target) {
return null;
}
const target = candidate.target;
const roleKey =
candidate.receiverRoleKey ??
getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
const pressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: getPlayerPressureLoad(receiver, target);
const receiveOrientation = getReceiveOrientationScore(receiver, startPoint);
const receiveFoot = getReceiveFootUsageScore(receiver, startPoint);
const context = getPlayerDecisionContext(receiver);
const attackSign = getAttackDirectionSign(receiver.team);
const nearestGap = getNearestOpponentGap(receiver, target);
const receiveSpace = clamp((nearestGap - 1.4) / 5.4, 0, 1);
const exitPoint = clampToPitch({
x: target.x + attackSign * (isSupportRole(roleKey) ? 3.2 : 5.4),
y: lerp(target.y, pitch.width / 2, isWideChannel(target) ? 0.22 : 0.08),
}, 2);
const exitGap = getNearestOpponentGap(receiver, exitPoint);
const firstActionSpace = clamp((exitGap - 1.8) / 5.8, 0, 1);
let goalSidePressure = 0;
let touchTrap = 0;
let closeMarkers = 0;
state.players.forEach((opponent) => {
if (opponent.team === receiver.team) {
return;
}
const gap = distance(opponent.position, target);
if (gap > 7.5) {
return;
}
const goalSide = (opponent.position.x - target.x) * attackSign;
const closeness = clamp(1 - gap / 7.5, 0, 1);
const coverInfluence = getCoverShadowInfluence(opponent, target, startPoint);
if (gap <= 3.2) {
closeMarkers += 1;
}
if (goalSide >= -0.7 && goalSide <= 7.5) {
goalSidePressure = Math.max(
goalSidePressure,
closeness * (0.58 + coverInfluence * 0.42)
);
}
touchTrap += closeness * coverInfluence * 0.28;
});
const technicalSecurity =
context.profile.technicalSecurity * 0.34 +
context.profile.pressResistance * 0.26 +
context.profile.composure * 0.18 +
context.profile.perception * 0.12;
const availability = clamp(
receiveSpace * 0.28 +
(1 - pressure) * 0.2 +
receiveOrientation * 0.18 +
receiveFoot * 0.08 +
firstActionSpace * 0.16 +
technicalSecurity * 0.18 -
goalSidePressure * 0.24 -
Math.min(touchTrap, 1.2) * 0.1 -
Math.min(closeMarkers, 2) * 0.04,
0,
1
);
return {
receiver,
roleKey,
availability,
pressure,
nearestGap,
receiveSpace,
firstActionSpace,
receiveOrientation,
goalSidePressure,
closeMarkers,
};
}
function getAutoPilotReceiverAvailabilityAdjustment(candidate, carrier, startPoint, profile) {
if (candidate.actionType !== "pass" || !candidate.target) {
return { score: 0, labels: [] };
}
const availabilityProfile = getReceiverAvailabilityProfile(candidate, carrier, startPoint, profile);
if (!availabilityProfile) {
return { score: 0, labels: [] };
}
const {
availability,
roleKey,
pressure,
nearestGap,
firstActionSpace,
receiveOrientation,
goalSidePressure,
} = availabilityProfile;
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const supportRole = isSupportRole(roleKey) || roleKey === "gk" || roleKey === "rest";
const forwardRole = isFrontLineRole(roleKey);
const highValuePass = candidate.isLineBreak || candidate.isBoxPass || forwardGain >= 7;
const labels = [];
let score = 0;
if (availability <= 0.26) {
score -= highValuePass || passDistance >= 18 ? 0.62 : 0.34;
} else if (availability <= 0.38) {
score -= highValuePass ? 0.36 : 0.18;
}
if (pressure >= 0.72 && nearestGap <= 2.2 && receiveOrientation < 0.56) {
score -= supportRole ? 0.22 : 0.36;
}
if (goalSidePressure >= 0.58 && forwardRole && passDistance <= 24) {
score -= 0.18;
}
if (availability >= 0.66 && firstActionSpace >= 0.48) {
score += 0.14 + (supportRole ? (profile.shortSupport ?? 0) * 0.08 : (profile.lineBreakBias ?? 0) * 0.08);
labels.push("Available receiver");
}
if (availability >= 0.72 && highValuePass && pressure <= 0.48) {
score += 0.14;
labels.push("Receive and play forward");
}
if (supportRole && passDistance <= 18 && availability >= 0.52 && pressure <= 0.62) {
score += 0.08 + (profile.shortSupport ?? 0) * 0.08;
}
return {
score: clamp(score, -0.76, 0.42),
labels: uniquePrincipleLabels(labels),
availability,
};
}
function getAutoPilotReceivePressureTrapAdjustment(candidate, carrier, startPoint, profile = {}) {
if (candidate.actionType !== "pass" || !candidate.target) {
return { score: 0, labels: [], context: null };
}
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
if (!receiver || receiver.team !== carrier.team) {
return { score: 0, labels: [], context: null };
}
const target = candidate.target;
const roleKey =
candidate.receiverRoleKey ??
getOffensiveRoleKey(receiver, teams[carrier.team]?.formation);
const attackSign = getAttackDirectionSign(receiver.team);
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * attackSign);
const supportRole = isSupportRole(roleKey) || roleKey === "gk" || roleKey === "rest";
const forwardRole = isFrontLineRole(roleKey);
const touchlineTrap = isWideChannel(target);
const laneRisk = getPassLaneRiskProfile(carrier, target, {
receiverPlayerId: receiver.id,
});
const ballEta = passDistance / Math.max(laneRisk.averageSpeed ?? 11.5, 0.01);
const receiverContext = getPlayerDecisionContext(receiver);
const receiveOrientation = getReceiveOrientationScore(receiver, startPoint);
const receiveFoot = getReceiveFootUsageScore(receiver, startPoint);
const exitPoint = clampToPitch({
x: target.x + attackSign * (supportRole ? 4.2 : 6.4),
y: lerp(target.y, pitch.width / 2, touchlineTrap ? 0.32 : 0.12),
}, 2);
const exitGap = getNearestOpponentGap(receiver, exitPoint);
const exitSpace = clamp((exitGap - 1.8) / 6, 0, 1);
let trapPressure = 0;
let closeJumpers = 0;
let fastestTrapTime = Infinity;
let blindSidePressure = 0;
state.players.forEach((opponent) => {
if (opponent.team === receiver.team) {
return;
}
const gap = distance(opponent.position, target);
if (gap > 9) {
return;
}
const projection = projectPointOnSegmentWithRatio(opponent.position, startPoint, target);
const laneDistance = distance(opponent.position, projection.point);
const lateLane =
projection.ratio >= 0.72 &&
projection.ratio <= 1.02 &&
laneDistance <= 4.2;
const defenderReachDistance = Math.max(
gap - playerRadiusMeters * 0.75 - ballRadiusMeters * 0.35,
0
);
const defenderTime = computeTimeToCoverDistance(opponent, defenderReachDistance, target);
const canArrive = defenderTime <= ballEta + 0.58;
const closeness = clamp(1 - gap / 9, 0, 1);
const coverInfluence = getCoverShadowInfluence(opponent, target, startPoint);
const goalSide = (opponent.position.x - target.x) * attackSign;
const goalSidePressure = goalSide >= -1.2 && goalSide <= 7.5;
const receiverFacing = getPlayerFacingAngle(receiver);
const defenderAngle = angleBetween(target, opponent.position);
const blindSide = angleDifference(receiverFacing, defenderAngle) >= Math.PI / 2.15;
const trapInfluence =
closeness *
(0.28 +
coverInfluence * 0.28 +
(blindSide ? 0.18 : 0) +
(goalSidePressure ? 0.18 : 0) +
(lateLane && canArrive ? 0.22 : 0) +
(touchlineTrap && goalSidePressure ? 0.14 : 0));
trapPressure += trapInfluence;
fastestTrapTime = Math.min(fastestTrapTime, defenderTime);
blindSidePressure = Math.max(blindSidePressure, blindSide ? closeness : 0);
if ((canArrive && gap <= 4.2) || (lateLane && canArrive)) {
closeJumpers += 1;
}
});
trapPressure = clamp(trapPressure, 0, 1.4);
const receiverQuality =
receiverContext.profile.technicalSecurity * 0.3 +
receiverContext.profile.pressResistance * 0.24 +
receiverContext.profile.composure * 0.18 +
receiverContext.profile.perception * 0.16 +
receiverContext.profile.decisionSpeed * 0.12;
const escapeQuality = clamp(
receiveOrientation * 0.22 +
receiveFoot * 0.1 +
exitSpace * 0.22 +
receiverQuality * 0.32 +
(1 - (candidate.receiverPressure ?? getPlayerPressureLoad(receiver, target))) * 0.14 -
trapPressure * 0.34 -
Math.min(laneRisk.coverShadow ?? 0, 2) * 0.05,
0,
1
);
const labels = [];
let score = 0;
if (trapPressure >= 0.72 && escapeQuality < 0.52) {
score -= 0.34 + (trapPressure - escapeQuality) * 0.46 + (touchlineTrap ? 0.12 : 0);
labels.push("Receive trap: avoid locked feet");
} else if (escapeQuality >= 0.68 && trapPressure <= 0.74) {
score += 0.12 + exitSpace * 0.12 + receiverQuality * 0.08;
labels.push("Receive trap: first touch can escape");
}
if (closeJumpers >= 2 && !supportRole) {
score -= 0.14 + Math.min(closeJumpers - 1, 2) * 0.06;
}
if (supportRole && passDistance <= 18 && escapeQuality >= 0.56) {
score += 0.06 + (profile.shortSupport ?? 0) * 0.05;
labels.push("Receive trap: clean bounce option");
}
if (forwardRole && forwardGain >= 5 && blindSidePressure >= 0.45 && escapeQuality < 0.6) {
score -= 0.14;
}
return {
score: clamp(score, -0.92, 0.52),
labels: uniquePrincipleLabels(labels),
context: {
receiverId: receiver.id,
trapPressure: Number(trapPressure.toFixed(3)),
escapeQuality: Number(escapeQuality.toFixed(3)),
closeJumpers,
fastestTrapTime: Number.isFinite(fastestTrapTime)
? Number(fastestTrapTime.toFixed(2))
: null,
exitSpace: Number(exitSpace.toFixed(3)),
},
};
}
function estimateAutoPilotCandidateDuration(candidate, carrier, startPoint) {
if (!candidate?.target || !carrier || !startPoint) {
return 0;
}
const actionDistance = distance(startPoint, candidate.target);
if (actionDistance <= 0.01) {
return 0;
}
const actionProfile = resolveBallActionProfile(
candidate.actionType,
startPoint,
candidate.target,
carrier,
candidate.receiverPlayerId ?? null,
"auto"
);
return actionDistance / Math.max(actionProfile.averageSpeed ?? 8, 0.01);
}
function getNextSupportSlotRoleFit(roleKey, slot) {
const slotFits = {
under: { pivot: 0.42, connector: 0.36, wideBack: 0.26, rest: 0.22, secondStriker: 0.1 },
inside: { connector: 0.42, pivot: 0.26, wideForward: 0.24, secondStriker: 0.24, wideBack: 0.12 },
outside: { wideBack: 0.44, wideForward: 0.34, connector: 0.08 },
beyond: { striker: 0.42, wideForward: 0.34, secondStriker: 0.34, connector: 0.12 },
weakSide: { wideForward: 0.38, wideBack: 0.3, connector: 0.14 },
restLink: { rest: 0.42, pivot: 0.34, wideBack: 0.12 },
};
return slotFits[slot]?.[roleKey] ?? 0;
}
function getAutoPilotNextSupportNetworkProfile(candidate, carrier, startPoint, profile) {
if (!candidate?.target || !carrier || !startPoint || candidate.actionType === "shot") {
return null;
}
const teamId = carrier.team;
const target = candidate.target;
const receiver = getAutoPilotCandidateReceiver(candidate, carrier);
const targetDepth = getAttackingDepth(target, teamId);
const targetIsWide = isWidePrincipleZone(target);
const targetThreat = getPitchThreatProfile(target, teamId);
const actionDuration = estimateAutoPilotCandidateDuration(candidate, carrier, startPoint);
const arrivalWindow =
actionDuration +
0.38 +
(profile.shortSupport ?? 0.55) * 0.32 +
(candidate.actionType === "dribble" ? 0.34 : 0);
const sideSign =
getWideSideSign(target) ||
getWideSideSign(receiver) ||
getWideSideSign(carrier) ||
1;
const slots = [
{ key: "under", required: true },
{ key: "inside", required: true },
{ key: "restLink", required: false },
];
if (targetDepth >= 38 || targetThreat.betweenLines >= 0.28) {
slots.push({ key: "beyond", required: targetDepth >= 52 || candidate.actionType === "dribble" });
}
if (targetIsWide || (profile.overlapBias ?? 0) >= 0.54 || (profile.widthDiscipline ?? 0) >= 0.64) {
slots.push({ key: "outside", required: targetIsWide });
}
if (!targetIsWide && ((profile.switchBias ?? 0) >= 0.56 || targetThreat.centralPocket >= 0.28)) {
slots.push({ key: "weakSide", required: false });
}
const excludedIds = new Set([carrier.id, receiver?.id, candidate.principleRunnerPlayerId].filter(Boolean));
const usedIds = new Set(excludedIds);
const supportOptions = [];
slots.forEach((slot) => {
const slotTarget = getReceptionSupportTarget(teamId, target, slot.key, sideSign, profile);
const best = state.players
.filter((player) => player.team === teamId && !usedIds.has(player.id) && !isGoalkeeper(player))
.map((player) => {
const roleKey = getOffensiveRoleKey(player, teams[teamId]?.formation);
const runDistance = distance(player.position, slotTarget);
const timeToSlot = computeTimeToCoverDistance(player, runDistance, slotTarget);
const roleFit = getNextSupportSlotRoleFit(roleKey, slot.key);
const supportStrength =
getAutoPilotRoleStrength(player, "receiver") * 0.24 +
getAutoPilotRoleStrength(player, "creator") * 0.18 +
getPlayerTendency(player, "passAndMove") * 0.14;
const canArrive = timeToSlot <= arrivalWindow + roleFit * 0.42;
const score =
roleFit +
supportStrength +
(canArrive ? 0.36 : 0) +
clamp((arrivalWindow - timeToSlot) / 2.8, -0.36, 0.42) -
runDistance * 0.006;
return {
player,
roleKey,
slot: slot.key,
target: slotTarget,
runDistance,
timeToSlot,
roleFit,
canArrive,
required: slot.required,
score,
};
})
.sort((a, b) => b.score - a.score)[0] ?? null;
if (!best) {
return;
}
if (best.canArrive || best.score >= 0.28) {
supportOptions.push(best);
usedIds.add(best.player.id);
}
});
const arrivalOptions = supportOptions.filter((option) => option.canArrive);
const slotSet = new Set(arrivalOptions.map((option) => option.slot));
const requiredSlots = slots.filter((slot) => slot.required).map((slot) => slot.key);
const coveredRequiredSlots = requiredSlots.filter((slot) => slotSet.has(slot)).length;
const receiverPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: receiver
? getPlayerPressureLoad(receiver, target)
: getOpponentPressureAtPoint(teamId, target, 12);
return {
actionDuration,
arrivalWindow,
options: supportOptions,
arrivalOptions,
arrivalCount: arrivalOptions.length,
requiredCount: requiredSlots.length,
coveredRequiredSlots,
underAvailable: slotSet.has("under"),
insideAvailable: slotSet.has("inside"),
beyondAvailable: slotSet.has("beyond"),
outsideAvailable: slotSet.has("outside"),
weakSideAvailable: slotSet.has("weakSide"),
receiverPressure,
targetDepth,
targetThreat,
};
}
function getAutoPilotNextSupportNetworkAdjustment(candidate, carrier, startPoint, profile) {
const network = getAutoPilotNextSupportNetworkProfile(candidate, carrier, startPoint, profile);
if (!network) {
return { score: 0, labels: [], network: null };
}
const passDistance = candidate.passDistance ?? distance(startPoint, candidate.target);
const forwardGain =
candidate.forwardGain ??
((candidate.target.x - startPoint.x) * getAttackDirectionSign(carrier.team));
const highValueAction =
candidate.isLineBreak ||
candidate.isBoxPass ||
candidate.actionType === "dribble" ||
forwardGain >= 7 ||
network.targetThreat.value >= 0.52;
const isolated =
network.arrivalCount === 0 ||
(network.arrivalCount === 1 && network.receiverPressure >= 0.52) ||
(candidate.actionType === "pass" && passDistance >= 18 && network.coveredRequiredSlots === 0);
const labels = [];
let score = 0;
if (network.arrivalCount >= 2) {
score += 0.18 + Math.min(network.arrivalCount, 4) * 0.055;
labels.push("Next support ready");
}
if (network.underAvailable && network.insideAvailable) {
score += 0.2 + (profile.shortSupport ?? 0.55) * 0.12;
labels.push("Reception triangle ready");
} else if (network.underAvailable || network.insideAvailable) {
score += 0.08;
}
if (network.beyondAvailable && (highValueAction || network.targetDepth >= 52)) {
score += 0.12 + (profile.directness ?? 0.5) * 0.08;
labels.push("Depth option ready");
}
if (network.outsideAvailable && (isWidePrincipleZone(candidate.target) || (profile.overlapBias ?? 0) >= 0.58)) {
score += 0.1 + (profile.overlapBias ?? 0.5) * 0.08;
}
if (network.weakSideAvailable && ((profile.switchBias ?? 0) >= 0.56 || network.targetThreat.centralPocket >= 0.28)) {
score += 0.08 + (profile.switchBias ?? 0.5) * 0.08;
}
if (isolated) {
score -=
0.34 +
(network.receiverPressure >= 0.56 ? 0.2 : 0) +
(passDistance >= 22 ? 0.22 : 0) +
(highValueAction ? 0.08 : 0);
labels.push("Avoid isolated receiver");
}
if (
candidate.actionType === "pass" &&
forwardGain < 3 &&
network.arrivalCount >= 2 &&
network.targetThreat.value < 0.42
) {
score += 0.06 + (profile.shortSupport ?? 0.55) * 0.08;
}
return {
score: clamp(score, -0.9, 0.72),
labels: uniquePrincipleLabels(labels),
network,
};
}
function getAutoPilotSpaceLadderContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return {
active: false,
pressureType: "unknown",
};
}
const teamId = carrier.team;
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const pressureType =
pressure >= 0.64 || nearestGap <= 2.35
? "direct"
: pressure >= 0.38 || nearestGap <= 4.8
? "indirect"
: "free";
const depth = getAttackingDepth(startPoint, teamId);
const progressionWindow = getForwardProgressionWindow(carrier, startPoint, profile);
const canProgress =
pressureType !== "direct" &&
depth >= 34 &&
depth <= 86 &&
(
facingForward ||
progressionWindow.active ||
currentThreat.betweenLines >= 0.3 ||
currentThreat.centralPocket >= 0.22
);
const dangerAvailable =
currentThreat.centralPocket >= 0.24 ||
currentThreat.betweenLines >= 0.34 ||
currentThreat.halfSpace >= 0.34 ||
currentSpace.key === "space2" ||
currentSpace.key === "space3";
return {
active: true,
teamId,
currentThreat,
currentSpace,
pressure,
nearestGap,
facingForward,
pressureType,
depth,
progressionWindow,
canProgress,
dangerAvailable,
};
}
function getAutoPilotSpaceLadderAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotSpaceLadderContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = getPitchThreatProfile(target, teamId);
const targetSpace = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const threatGain = targetThreat.value - context.currentThreat.value;
const gameSpaceGain = targetSpace.index - context.currentSpace.index;
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: 0.64;
const targetPriority = clamp(
targetThreat.box * 1 +
targetThreat.cutbackZone * 0.82 +
targetThreat.centralPocket * 0.74 +
targetThreat.betweenLines * 0.58 +
targetThreat.behindLine * 0.6 +
targetThreat.halfSpace * 0.42 +
targetThreat.assistZone * 0.42 +
(candidate.isBoxPass ? 0.24 : 0) +
(candidate.isLineBreak ? 0.2 : 0) +
(candidate.actionType === "shot" ? 0.28 : 0),
0,
1.45
);
const actionOpensDanger =
targetPriority >= 0.48 ||
actionSpace.value >= 0.46 ||
threatGain >= 0.07 ||
gameSpaceGain >= 1 ||
candidate.mustShoot;
const lowValueRecycle =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain < 2.2 &&
targetThreat.value <= context.currentThreat.value + 0.045 &&
actionSpace.lineBreakCount === 0 &&
targetSpace.index <= context.currentSpace.index &&
targetThreat.depth < 78;
const wastefulBackPass =
lowValueRecycle &&
forwardGain <= -3 &&
context.pressureType !== "direct" &&
context.depth >= 42;
const wideHighContext =
isWidePrincipleZone(startPoint) &&
context.depth >= 66 &&
context.pressureType !== "direct";
const finalThirdCentralContext =
context.depth >= 68 &&
Math.abs(startPoint.y - pitch.width / 2) <= 22 &&
context.pressureType !== "direct";
const labels = [];
let score = 0;
if (context.canProgress && actionOpensDanger) {
score +=
0.2 +
targetPriority * 0.42 +
Math.max(0, threatGain) * 0.38 +
clamp(forwardGain / 18, 0, 0.42) +
(gameSpaceGain > 0 ? 0.14 + gameSpaceGain * 0.08 : 0);
labels.push(targetThreat.primaryLabel === "open space" ? "Climb the next space" : `Attack ${targetThreat.primaryLabel}`);
}
if (
context.canProgress &&
context.currentSpace.key === "space2" &&
context.facingForward &&
(candidate.actionType === "shot" || candidate.isBoxPass || targetThreat.centralPocket >= 0.3 || targetThreat.box >= 0.22)
) {
score += 0.34 + (profile.shootBias ?? 0.48) * 0.1;
labels.push("Do not waste space 2");
}
if (
context.canProgress &&
candidate.actionType === "dribble" &&
forwardGain >= 5 &&
actionSpace.openTarget >= 0.48
) {
score += 0.22 + (profile.carryBias ?? 0.5) * 0.18;
labels.push("Carry through the ladder");
}
if (wideHighContext) {
if (candidate.isBoxPass || targetThreat.cutbackZone >= 0.28 || targetThreat.box >= 0.26) {
score += 0.26 + (profile.crossBias ?? 0.46) * 0.12 + (profile.overlapBias ?? 0.48) * 0.08;
labels.push("Wide route to goal");
} else if (
lowValueRecycle &&
context.pressure <= 0.48 &&
!candidate.isSwitch
) {
score -= 0.34;
}
}
if (finalThirdCentralContext && candidate.actionType !== "shot" && lowValueRecycle) {
score -= 0.42 + (profile.shootBias ?? 0.48) * 0.18;
}
if (context.canProgress && lowValueRecycle && context.dangerAvailable) {
score -= 0.48 + (profile.progressionUrgency ?? 0.5) * 0.28;
labels.push("Avoid low-value recycle");
}
if (wastefulBackPass) {
score -= 0.24 + clamp(context.depth / 100, 0, 1) * 0.18;
}
if (
candidate.actionType === "pass" &&
actionOpensDanger &&
passDistance >= 16 &&
laneClarity < 0.34 &&
!candidate.mustShoot
) {
score -= 0.26;
}
if (
context.pressureType === "direct" &&
candidate.actionType === "pass" &&
passDistance <= 16 &&
forwardGain >= -6 &&
laneClarity >= 0.44
) {
score += 0.12 + (profile.shortSupport ?? 0.55) * 0.08;
labels.push("Secure under direct pressure");
}
return {
score: clamp(score, -1.25, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
pressureType: context.pressureType,
canProgress: context.canProgress,
startSpaceKey: context.currentSpace.key,
targetSpaceKey: targetSpace.key,
targetPriority,
lowValueRecycle,
actionOpensDanger,
},
};
}
function getAutoPilotAdvantageRetentionContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const currentThreat = getPitchThreatProfile(startPoint, teamId);
const currentSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
const depth = getAttackingDepth(startPoint, teamId);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const rhythm = getPossessionRhythmContext(teamId);
const pressureMode =
pressure >= 0.66 || nearestGap <= 2.15
? "direct"
: pressure >= 0.44 || nearestGap <= 4.6
? "indirect"
: "free";
const inValuableSpace =
currentSpace.key === "space2" ||
currentSpace.key === "space3" ||
currentThreat.betweenLines >= 0.34 ||
currentThreat.centralPocket >= 0.24 ||
currentThreat.halfSpace >= 0.38 ||
currentThreat.box >= 0.14 ||
currentThreat.cutbackZone >= 0.18;
const canExploit =
pressureMode !== "direct" &&
(
facingForward ||
currentThreat.betweenLines >= 0.34 ||
currentThreat.centralPocket >= 0.24 ||
currentSpace.key === "space3"
);
const advantageStrength = clamp(
currentThreat.value * 0.52 +
currentThreat.betweenLines * 0.24 +
currentThreat.centralPocket * 0.24 +
currentThreat.halfSpace * 0.14 +
currentThreat.box * 0.22 +
currentThreat.cutbackZone * 0.18 +
currentSpace.index * 0.08 +
(facingForward ? 0.14 : 0) +
(pressureMode === "free" ? 0.1 : pressureMode === "indirect" ? 0.04 : -0.08) -
pressure * 0.16,
0,
1.35
);
const mustConvert =
canExploit &&
(
currentSpace.key === "space3" ||
currentThreat.box >= 0.18 ||
currentThreat.cutbackZone >= 0.24 ||
(depth >= 66 && goalDistance <= 42)
);
const mustAttackNextLine =
canExploit &&
!mustConvert &&
(
currentSpace.key === "space2" ||
currentThreat.betweenLines >= 0.34 ||
currentThreat.centralPocket >= 0.24
);
const active = inValuableSpace && (advantageStrength >= 0.26 || currentSpace.index >= 2);
return {
active,
teamId,
currentThreat,
currentSpace,
pressure,
nearestGap,
facingForward,
depth,
goalDistance,
rhythm,
pressureMode,
inValuableSpace,
canExploit,
advantageStrength,
mustConvert,
mustAttackNextLine,
};
}
function getAutoPilotAdvantageRetentionAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return {
score: 0,
labels: [],
context: null,
};
}
const context = getAutoPilotAdvantageRetentionContext(carrier, startPoint, profile);
if (!context.active) {
return {
score: 0,
labels: [],
context,
};
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = getPitchThreatProfile(target, teamId);
const targetSpace = getAttackingGameSpaceProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: 0.62;
const supportNearTarget = getTeamSupportCountAroundPoint(
teamId,
target,
new Set([carrier.id, candidate.receiverPlayerId, candidate.principleRunnerPlayerId].filter(Boolean)),
passDistance >= 24 ? 15 : 11
);
const targetPressure = Number.isFinite(candidate.receiverPressure)
? candidate.receiverPressure
: actionSpace.targetPressure;
const threatGain = targetThreat.value - context.currentThreat.value;
const gameSpaceGain = targetSpace.index - context.currentSpace.index;
const lineBreakAction =
candidate.isLineBreak ||
actionSpace.lineBreakCount >= 1 ||
(gameSpaceGain >= 1 && forwardGain >= 3.5);
const finalAction =
candidate.actionType === "shot" ||
candidate.isBoxPass ||
targetThreat.box >= 0.24 ||
targetThreat.cutbackZone >= 0.28 ||
targetThreat.assistZone >= 0.36 ||
targetThreat.behindLine >= 0.34;
const carryAdvantage =
candidate.actionType === "dribble" &&
forwardGain >= 3.8 &&
actionSpace.openTarget >= 0.42;
const usefulSameSpace =
candidate.actionType === "pass" &&
targetSpace.index === context.currentSpace.index &&
forwardGain >= -1.5 &&
targetThreat.value >= context.currentThreat.value - 0.035 &&
(supportNearTarget >= 1 || laneClarity >= 0.58) &&
passDistance <= 23;
const purposefulSwitch =
candidate.isSwitch &&
targetThreat.value >= context.currentThreat.value - 0.06 &&
laneClarity >= 0.62 &&
(profile.switchBias >= 0.58 || context.rhythm.sidewaysPasses >= 1 || targetPressure <= 0.5);
const lowValueReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain <= -2.5 &&
targetSpace.index < context.currentSpace.index &&
targetThreat.value <= context.currentThreat.value + 0.025 &&
context.pressureMode !== "direct";
const sterileSideways =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
Math.abs(forwardGain) < 2.4 &&
targetSpace.index <= context.currentSpace.index &&
targetThreat.value <= context.currentThreat.value + 0.035 &&
actionSpace.lineBreakCount === 0 &&
context.pressureMode !== "direct";
const overplayedIntoPressure =
candidate.actionType !== "shot" &&
targetPressure >= 0.76 &&
supportNearTarget <= 0 &&
laneClarity < 0.52 &&
!candidate.isBoxPass;
const labels = [];
let score = 0;
if (candidate.actionType === "shot" && context.mustConvert) {
const shotWindow = getShotWindowProfile(carrier, startPoint, target);
score += 0.34 + shotWindow.quality * 0.42 + (profile.shootBias ?? 0.5) * 0.12;
labels.push("Convert advantage");
}
if (lineBreakAction || finalAction) {
score +=
0.18 +
context.advantageStrength * 0.18 +
actionSpace.value * 0.24 +
Math.max(0, threatGain) * 0.36 +
(finalAction ? 0.22 : 0) +
(lineBreakAction ? 0.18 : 0);
labels.push(context.mustConvert ? "Turn advantage into final action" : "Keep advantage moving forward");
}
if (carryAdvantage) {
score +=
0.22 +
(profile.carryBias ?? 0.5) * 0.18 +
actionSpace.openTarget * 0.18 +
(context.mustAttackNextLine ? 0.16 : 0);
labels.push("Carry the advantage");
}
if (usefulSameSpace && !lineBreakAction && !finalAction) {
score += 0.08 + (profile.shortSupport ?? 0.55) * 0.08;
labels.push("Retain valuable space");
}
if (purposefulSwitch) {
score += 0.12 + (profile.switchBias ?? 0.5) * 0.12;
labels.push("Switch to keep advantage");
}
if (context.mustAttackNextLine && !lineBreakAction && !finalAction && !carryAdvantage && !purposefulSwitch) {
score -= 0.28 + context.advantageStrength * 0.24;
}
if (context.mustConvert && !finalAction && !carryAdvantage && !purposefulSwitch) {
score -= 0.34 + context.advantageStrength * 0.28 + (profile.shootBias ?? 0.5) * 0.12;
}
if (lowValueReset) {
score -= 0.58 + context.advantageStrength * 0.34 + (profile.progressionUrgency ?? 0.5) * 0.22;
labels.push("Do not reset the advantage");
}
if (sterileSideways) {
score -= 0.32 + context.advantageStrength * 0.24;
labels.push("Avoid sterile sideways after advantage");
}
if (overplayedIntoPressure) {
score -= 0.22 + targetPressure * 0.18;
labels.push("Do not force advantage into pressure");
}
if (
context.rhythm.backPasses >= 1 &&
context.rhythm.forwardPasses === 0 &&
(lowValueReset || sterileSideways)
) {
score -= 0.18 + (profile.progressionUrgency ?? 0.5) * 0.14;
}
return {
score: clamp(score, -1.45, 1.35),
labels: uniquePrincipleLabels(labels),
context: {
currentSpaceKey: context.currentSpace.key,
targetSpaceKey: targetSpace.key,
pressureMode: context.pressureMode,
advantageStrength: context.advantageStrength,
mustConvert: context.mustConvert,
mustAttackNextLine: context.mustAttackNextLine,
lineBreakAction,
finalAction,
carryAdvantage,
usefulSameSpace,
purposefulSwitch,
lowValueReset,
sterileSideways,
targetPressure,
supportNearTarget,
laneClarity,
},
};
}
function getAutoPilotEndProductUrgencyContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const threat = getPitchThreatProfile(startPoint, teamId);
const gameSpace = getAttackingGameSpaceProfile(startPoint, teamId);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const pressureType =
pressure >= 0.68 || nearestGap <= 2.25
? "direct"
: pressure >= 0.42 || nearestGap <= 4.7
? "indirect"
: "free";
const depth = getAttackingDepth(startPoint, teamId);
const goalDistance = distance(startPoint, getOpponentGoalCenter(teamId));
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.25);
const recent = getRecentPossessionSteps(teamId, 5);
const recentFinalThirdActions = recent.filter((step) => {
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return target && getAttackingDepth(target, teamId) >= 66;
}).length;
const recentShots = recent.filter((step) => step.actionType === "shot").length;
const chanceState =
threat.box >= 0.14 ||
threat.cutbackZone >= 0.22 ||
threat.centralPocket >= 0.24 ||
threat.betweenLines >= 0.42 ||
gameSpace.key === "space3" ||
depth >= 66;
const active =
chanceState &&
depth >= 54 &&
pressureType !== "direct" &&
goalDistance <= 44;
const urgency = clamp(
threat.box * 0.42 +
threat.cutbackZone * 0.3 +
threat.centralPocket * 0.28 +
threat.betweenLines * 0.18 +
threat.halfSpace * 0.14 +
clamp((depth - 58) / 30, 0, 1) * 0.24 +
clamp((44 - goalDistance) / 24, 0, 1) * 0.22 +
(facingForward ? 0.16 : 0) +
(pressureType === "free" ? 0.12 : 0) +
Math.min(recentFinalThirdActions, 3) * 0.06 +
(recentShots === 0 && recentFinalThirdActions >= 2 ? 0.18 : 0) +
(profile.shootBias ?? 0.48) * 0.12 -
pressure * 0.18,
0,
1.35
);
return {
active,
teamId,
threat,
gameSpace,
pressure,
nearestGap,
pressureType,
depth,
goalDistance,
centrality,
facingForward,
recentFinalThirdActions,
recentShots,
urgency,
};
}
function getAutoPilotEndProductUrgencyAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotEndProductUrgencyContext(carrier, startPoint, profile);
if (!context.active || context.urgency <= 0.2) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = getPitchThreatProfile(target, teamId);
const actionSpace = getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const targetGoalDistance = distance(target, getOpponentGoalCenter(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: candidate.laneClarity ?? 0.62;
const highValueTarget =
targetThreat.box >= 0.24 ||
targetThreat.cutbackZone >= 0.28 ||
targetThreat.centralPocket >= 0.34 ||
candidate.isBoxPass ||
candidate.mustShoot;
const routeToGoal =
targetGoalDistance <= context.goalDistance - 3.2 ||
forwardGain >= 4 ||
highValueTarget;
const lowValueReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!candidate.isBoxPass &&
forwardGain < 1.8 &&
targetThreat.value <= context.threat.value + 0.035 &&
targetThreat.depth < 75 &&
actionSpace.lineBreakCount === 0;
const needlessBackwards =
lowValueReset &&
forwardGain < -2.5 &&
context.pressureType !== "direct";
const labels = [];
let score = 0;
if (candidate.actionType === "shot") {
const shotQuality =
candidate.shotQuality ??
clamp(
(candidate.laneClarity ?? laneClarity) * 0.32 +
(candidate.angleQuality ?? 0.34) * 0.24 +
(candidate.goalkeeperOpenness ?? 0.45) * 0.22 +
(1 - (candidate.blockRisk ?? 0.52)) * 0.22,
0,
1
);
score +=
0.34 +
context.urgency * 0.54 +
shotQuality * 0.42 +
(candidate.insideBox ? 0.38 : 0) +
(candidate.mustShoot ? 0.52 : 0);
labels.push("End product: shoot");
} else if (candidate.actionType === "pass" && highValueTarget) {
const cutbackBonus = targetThreat.cutbackZone >= 0.28 || candidate.label === "cutback" ? 0.2 : 0;
const boxSupportBonus = clamp(candidate.supportNearTarget ?? 0, 0, 4) * 0.055;
score +=
0.24 +
context.urgency * 0.38 +
targetThreat.box * 0.28 +
targetThreat.cutbackZone * 0.24 +
boxSupportBonus +
cutbackBonus -
(laneClarity < 0.36 && passDistance >= 14 ? 0.18 : 0);
labels.push(targetThreat.cutbackZone >= 0.28 || candidate.label === "cutback" ? "End product: cutback" : "End product: final pass");
} else if (
candidate.actionType === "dribble" &&
routeToGoal &&
actionSpace.openTarget >= 0.42
) {
score +=
0.18 +
context.urgency * 0.28 +
actionSpace.openTarget * 0.18 +
(targetGoalDistance <= 28 ? 0.14 : 0);
labels.push("End product: commit defender");
} else if (
candidate.actionType === "pass" &&
routeToGoal &&
targetThreat.value >= context.threat.value + 0.05
) {
score += 0.08 + context.urgency * 0.12;
}
if (lowValueReset) {
score -= 0.42 + context.urgency * 0.42 + (context.facingForward ? 0.16 : 0);
labels.push("Avoid resetting a chance");
}
if (needlessBackwards) {
score -= 0.22 + context.urgency * 0.16;
}
if (
context.recentFinalThirdActions >= 3 &&
context.recentShots === 0 &&
candidate.actionType !== "shot" &&
!candidate.isBoxPass &&
!highValueTarget
) {
score -= 0.18 + context.urgency * 0.16;
}
return {
score: clamp(score, -1.2, 1.45),
labels: uniquePrincipleLabels(labels),
context: {
pressureType: context.pressureType,
urgency: context.urgency,
goalDistance: context.goalDistance,
highValueTarget,
lowValueReset,
recentFinalThirdActions: context.recentFinalThirdActions,
recentShots: context.recentShots,
},
};
}
function getAutoPilotChanceHierarchyContext(carrier, startPoint, profile = {}) {
if (!carrier || !startPoint) {
return { active: false };
}
const teamId = carrier.team;
const threat = getPitchThreatProfile(startPoint, teamId);
const goal = getOpponentGoalCenter(teamId);
const goalDistance = distance(startPoint, goal);
const depth = getAttackingDepth(startPoint, teamId);
const centrality = 1 - Math.abs(startPoint.y - pitch.width / 2) / (pitch.width / 2);
const pressure = getPlayerPressureLoad(carrier, startPoint);
const nearestGap = getNearestOpponentGap(carrier, startPoint);
const facingForward = isPlayerFacingForward(carrier, Math.PI / 2.35);
const shotTarget = getAutoPilotShotTarget(teamId, carrier);
const shotWindow = getShotWindowProfile(carrier, startPoint, shotTarget);
const flow = getAutoPilotFlowContext(carrier, startPoint);
const recentFinalThirdActions = flow.recent.filter((step) => {
const target = step.target ?? step.afterSnapshot?.ball?.position ?? null;
return target && getAttackingDepth(target, teamId) >= 66;
}).length;
const recentShots = flow.recent.filter((step) => step.actionType === "shot").length;
const freeToAct = pressure <= 0.52 && nearestGap >= 3.2;
const centralFinishState =
depth >= 67 &&
centrality >= 0.28 &&
goalDistance <= 37 &&
shotWindow.angleQuality >= 0.14 &&
shotWindow.blockRisk <= 0.84;
const boxFinishState =
threat.box >= 0.16 ||
threat.centralPocket >= 0.32 ||
(depth >= 76 && goalDistance <= 31);
const cutbackState =
threat.cutbackZone >= 0.2 ||
(depth >= 72 && isWideChannel(startPoint) && goalDistance <= 39);
const chanceValue = clamp(
threat.box * 0.34 +
threat.centralPocket * 0.28 +
threat.cutbackZone * 0.2 +
shotWindow.quality * 0.34 +
shotWindow.laneClarity * 0.2 +
shotWindow.angleQuality * 0.16 +
centrality * 0.12 +
clamp((38 - goalDistance) / 24, 0, 1) * 0.22 +
(facingForward ? 0.14 : 0) +
(freeToAct ? 0.12 : 0) +
(recentFinalThirdActions >= 2 && recentShots === 0 ? 0.16 : 0) -
pressure * 0.22,
0,
1.35
);
const active =
depth >= 62 &&
goalDistance <= 42 &&
pressure <= 0.78 &&
(centralFinishState || boxFinishState || cutbackState || chanceValue >= 0.44);
return {
active,
teamId,
threat,
goalDistance,
depth,
centrality,
pressure,
nearestGap,
facingForward,
shotWindow,
flow,
recentFinalThirdActions,
recentShots,
freeToAct,
centralFinishState,
boxFinishState,
cutbackState,
chanceValue,
};
}
function getAutoPilotChanceHierarchyAdjustment(candidate, carrier, startPoint, profile = {}) {
if (!candidate?.target || !carrier || !startPoint) {
return { score: 0, labels: [], context: null };
}
const context = getAutoPilotChanceHierarchyContext(carrier, startPoint, profile);
if (!context.active) {
return { score: 0, labels: [], context };
}
const teamId = carrier.team;
const target = candidate.target;
const targetThreat = candidate.actionType === "shot"
? context.threat
: getPitchThreatProfile(target, teamId);
const actionSpace = candidate.actionType === "shot"
? null
: getActionSpaceValue(startPoint, target, teamId, profile);
const forwardGain =
candidate.forwardGain ??
((target.x - startPoint.x) * getAttackDirectionSign(teamId));
const passDistance = candidate.passDistance ?? distance(startPoint, target);
const receiver = candidate.receiverPlayerId ? getPlayerById(candidate.receiverPlayerId) : null;
const receiverRoleKey =
candidate.receiverRoleKey ??
(receiver ? getOffensiveRoleKey(receiver, teams[teamId]?.formation) : null);
const laneClarity = Number.isFinite(candidate.laneClarity)
? candidate.laneClarity
: candidate.actionType === "pass"
? computePassLaneClarity(carrier, target)
: context.shotWindow.laneClarity;
const isFinalPass =
candidate.actionType === "pass" &&
(
candidate.isBoxPass ||
candidate.label === "cutback" ||
targetThreat.box >= 0.22 ||
targetThreat.cutbackZone >= 0.26 ||
(targetThreat.centralPocket >= 0.34 && forwardGain >= -1)
);
const canShootNow =
candidate.actionType === "shot" &&
(
context.boxFinishState ||
context.centralFinishState ||
context.shotWindow.quality >= 0.24 ||
context.goalDistance <= 29 ||
candidate.mustShoot
);
const canCarryToFinish =
candidate.actionType === "dribble" &&
forwardGain >= 4 &&
(actionSpace?.openTarget ?? 0) >= 0.42 &&
distance(target, getOpponentGoalCenter(teamId)) <= context.goalDistance - 3;
const supportReset =
candidate.actionType === "pass" &&
!candidate.isSwitch &&
!isFinalPass &&
forwardGain < 2.5 &&
passDistance <= 24 &&
(
isSupportRole(receiverRoleKey) ||
receiverRoleKey === "rest" ||
targetThreat.value <= context.threat.value + 0.04
);
const backwardsReset = supportReset && forwardGain < -2.5;
const lowAngleWideShot =
candidate.actionType === "shot" &&
!context.boxFinishState &&
context.shotWindow.angleQuality < 0.16 &&
context.cutbackState;
const labels = [];
let score = 0;
if (canShootNow && !lowAngleWideShot) {
score +=
0.34 +
context.chanceValue * 0.5 +
context.shotWindow.quality * 0.34 +
(context.freeToAct ? 0.14 : 0) +
(context.recentFinalThirdActions >= 2 && context.recentShots === 0 ? 0.18 : 0) +
(candidate.mustShoot ? 0.28 : 0);
labels.push("Chance hierarchy: shoot");
}
if (isFinalPass) {
const cutbackBonus = candidate.label === "cutback" || targetThreat.cutbackZone >= 0.26 ? 0.2 : 0;
const boxBonus = targetThreat.box * 0.24 + targetThreat.centralPocket * 0.18;
score +=
0.24 +
context.chanceValue * 0.34 +
cutbackBonus +
boxBonus -
(laneClarity < 0.34 && passDistance >= 12 ? 0.18 : 0);
labels.push(candidate.label === "cutback" || targetThreat.cutbackZone >= 0.26
? "Chance hierarchy: cutback"
: "Chance hierarchy: final pass");
}
if (canCarryToFinish && !context.centralFinishState) {
score += 0.14 + context.chanceValue * 0.2 + (actionSpace?.openTarget ?? 0) * 0.16;
labels.push("Chance hierarchy: carry to finish");
}
if (supportReset && context.pressure <= 0.6) {
score -=
0.38 +
context.chanceValue * 0.42 +
(context.facingForward ? 0.18 : 0) +
(context.freeToAct ? 0.12 : 0);
labels.push("Avoid resetting a chance");
}
if (backwardsReset) {
score -= 0.18 + context.chanceValue * 0.18;
}
if (lowAngleWideShot) {
score -= 0.22;
}
return {
score: clamp(score, -1.15, 1.4),
labels: uniquePrincipleLabels(labels),
context: {
chanceValue: context.chanceValue,
goalDistance: context.goalDistance,
pressure: context.pressure,
centralFinishState: context.centralFinishState,
boxFinishState: context.boxFinishState,
cutbackState: context.cutbackState,
supportReset,
isFinalPass,
},
};
}
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
function getWideSideSign(pointOrPlayer) {
const y = Number.isFinite(pointOrPlayer?.y)
? pointOrPlayer.y
: Number.isFinite(pointOrPlayer?.position?.y)
? pointOrPlayer.position.y
: null;
if (!Number.isFinite(y)) {
return 0;
}
const offset = y - pitch.width / 2;
if (Math.abs(offset) < 4) {
return 0;
}
return offset < 0 ? -1 : 1;
}
function isWidePrincipleZone(point) {
if (!point) {
return false;
}
return Math.abs(point.y - pitch.width / 2) >= 12;
}

  return {
    getAutoPilotPossessionStartIndex,
    getAutoPilotStyleIntentSequence,
    resolvePossessionRouteLanes,
    resolveOpeningVariationLanes,
    getRecentAutoPilotPlanMemory,
    getAutoPilotPlanRepeatPenalty,
    rememberAutoPilotPossessionPlan,
    invalidateAutoPilotPossessionPlan,
    createAutoPilotPossessionRoute,
    createAutoPilotOpeningVariation,
    getAutoPilotPossessionRouteStage,
    createAutoPilotPossessionPlan,
    getAutoPilotPossessionPlan,
    getAutoPilotPossessionIntentContext,
    getAutoPilotPossessionIntentFit,
    getAutoPilotPossessionIntentAdjustment,
    getAutoPilotTempoPhaseContext,
    getAutoPilotTempoPhaseAdjustment,
    getAutoPilotRhythmGovernorAdjustment,
    getAutoPilotOpeningVariationAdjustment,
    getOpponentBlockReadProfile,
    getAutoPilotOpponentBlockReadAdjustment,
    isLastStepKickoffResetForTeam,
    getRecentLaneRepeatCount,
    isFrontLineRole,
    isSupportRole,
    getStepReceiverRoleKey,
    getAutoPilotFlowContext,
    getLastAutoPrincipleSet,
    principleSetIncludes,
    isTransitionAttackStyle,
    getSecurePossessionSnapshotForTeam,
    getAutoPilotRegainContext,
    getAutoPilotCandidatePattern,
    getRecordedStepPattern,
    getRecordedStepActorIds,
    getAutoPilotPossessionLoopAdjustment,
    getAutoPilotCorridorTempoReleaseAdjustment,
    getAutoPilotCombinationChainContext,
    getAutoPilotCombinationChainAdjustment,
    getAutoPilotPassLaneDenialAdjustment,
    getAutoPilotCounterPressEscapeAdjustment,
    getAutoPilotRecoveryFirstActionContext,
    getAutoPilotRecoveryFirstActionAdjustment,
    getAutoPilotPostRecoveryPhaseContext,
    getAutoPilotPostRecoveryPhaseAdjustment,
    getAutoPilotTransitionNumbersContext,
    getAutoPilotTransitionNumbersAdjustment,
    getAutoPilotPressureEscapeContext,
    buildAutoPilotPressureTrapEscapeCandidate,
    getAutoPilotPressureEscapeAdjustment,
    getAutoPilotPatternDiversityAdjustment,
    getAutoPilotRepetitionPenalty,
    getAutoPilotFlowAdjustment,
    getAutoPilotCarryEndProductContext,
    getAutoPilotCarryEndProductAdjustment,
    getAutoPilotSpacingBonus,
    mergeIntentionWeights,
    getAutoPilotIntentionModel,
    getAutoPilotCandidatePrincipleMetrics,
    getUniversalFootballDecisionAdjustment,
    getAutoPilotVisionScanAdjustment,
    scoreAutoPilotCandidateByIntentions,
    getAutoPilotStylePrincipleWeights,
    uniquePrincipleLabels,
    getAutoPilotPrincipleAdjustment,
    getAutoPilotLaneRealityAdjustment,
    getAutoPilotCandidateReceiver,
    getAutoPilotRoleResponsibilityAdjustment,
    getAutoPilotLocalSuperiorityProfile,
    getAutoPilotLocalSuperiorityAdjustment,
    getReceiverAvailabilityProfile,
    getAutoPilotReceiverAvailabilityAdjustment,
    getAutoPilotReceivePressureTrapAdjustment,
    estimateAutoPilotCandidateDuration,
    getNextSupportSlotRoleFit,
    getAutoPilotNextSupportNetworkProfile,
    getAutoPilotNextSupportNetworkAdjustment,
    getAutoPilotSpaceLadderContext,
    getAutoPilotSpaceLadderAdjustment,
    getAutoPilotAdvantageRetentionContext,
    getAutoPilotAdvantageRetentionAdjustment,
    getAutoPilotEndProductUrgencyContext,
    getAutoPilotEndProductUrgencyAdjustment,
    getAutoPilotChanceHierarchyContext,
    getAutoPilotChanceHierarchyAdjustment,
    getAutoPilotLineBreakAdvantageAdjustment,
    getAutoPilotAdvantageLifecycleContext,
    getAutoPilotAdvantageLifecycleAdjustment,
    getWideSideSign,
    isWidePrincipleZone,
  };
}
