export function createGameSimulatorAutopilotPossessionPlanner(deps = {}) {
  const {
    chooseWeightedOption,
    clamp,
    getAttackingDepth,
    getLaneForSideSign,
    getPitchLaneKey,
    getPossessionRhythmContext,
    getWideSideSign,
    isTransitionAttackStyle,
    randomBetween,
    randomSign,
    state,
  } = deps;
  const pitchLaneKeys = deps.pitchLaneKeys ?? ["leftWide", "leftHalf", "central", "rightHalf", "rightWide"];

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
  };
}
