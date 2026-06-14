export function createGameSimulatorAutopilotKickoffCandidates(deps = {}) {
  const {
    chooseScoredCandidateWithVariation,
    clamp,
    computePassLaneClarity,
    distance,
    getAttackDirectionSign,
    getKickoffSupportId,
    getOffensiveRoleKey,
    getPitchLaneIndex,
    getPitchLaneKey,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerPressureLoad,
    getState,
    getWideSideSign,
    isLastStepKickoffResetForTeam,
    kickoffOpeningProfiles,
    pitch,
    teams,
  } = deps;

function buildAutoPilotKickoffCandidate(carrier, startPoint, profile) {
const state = getState();
if (state.restartPhase?.type !== "kickoff" || state.restartPhase.teamId !== carrier.team) {
return null;
}
const support = getPlayerById(state.restartPhase.supportPlayerId) ?? getPlayerById(getKickoffSupportId(carrier.team));
if (!support || support.id === carrier.id) {
return null;
}
const target = getPlayerBallControlPoint(support);
const passDistance = distance(startPoint, target);
if (passDistance < 2.5 || passDistance > 12) {
return null;
}
return {
actionType: "pass",
target,
receiverPlayerId: support.id,
receiverRoleKey: getOffensiveRoleKey(support, teams[carrier.team]?.formation),
passDistance,
forwardGain: (target.x - startPoint.x) * getAttackDirectionSign(carrier.team),
laneClarity: computePassLaneClarity(carrier, target),
receiverPressure: getPlayerPressureLoad(support, target),
isLineBreak: false,
isSwitch: false,
isBoxPass: false,
score: 4.6,
firstTouchMode: "back",
label: "kick-off reset",
reason: "play home first and let the possession identity start from a stable shape",
};
}

function getLastKickoffOpeningProfile(teamId) {
const state = getState();
const lastStep = state.sequence?.steps?.[state.sequence.steps.length - 1];
const openingKey =
lastStep?.restartPhase?.openingKey ??
state.restartPhase?.openingKey ??
null;
if (!openingKey || lastStep?.restartPhase?.teamId !== teamId) {
return kickoffOpeningProfiles["secure-backline"];
}
return kickoffOpeningProfiles[openingKey] ?? kickoffOpeningProfiles["secure-backline"];
}

function getKickoffOpeningCandidateFit(openingProfile, candidate, startPoint, teamId, profile) {
const state = getState();
if (!openingProfile || !candidate?.receiver) {
return {
score: 0,
label: "kick-off build-up reset",
reason: "drop the second touch into the back line before the chosen identity takes over",
firstTouchMode: profile.directness >= 0.68 ? "forward" : "inside",
};
}
const targetLane = getPitchLaneKey(candidate.target);
const startLane = getPitchLaneKey(startPoint);
const laneShift = Math.abs(getPitchLaneIndex(targetLane) - getPitchLaneIndex(startLane));
const isWeakSide =
getWideSideSign(candidate.target) &&
getWideSideSign(startPoint) &&
getWideSideSign(candidate.target) === -getWideSideSign(startPoint);
const forwardFit = clamp(candidate.forwardGain / 11, -0.2, 1);
const backwardFit = clamp((-candidate.forwardGain - 3) / 20, 0, 1);
const roleFit = openingProfile.receiverRoles.includes(candidate.roleKey) ? 0.72 : -0.38;
let score = roleFit;
if (openingProfile.key === "secure-backline") {
score += backwardFit * 0.46 + candidate.laneClarity * 0.2 - Math.max(candidate.forwardGain - 1, 0) * 0.08;
} else if (openingProfile.key === "pivot-turnout") {
score +=
(candidate.roleKey === "pivot" || candidate.roleKey === "connector" ? 0.38 : 0) +
clamp(Math.abs(candidate.forwardGain) <= 8 ? 0.22 : -0.12, -0.12, 0.22) +
candidate.laneClarity * 0.24 -
candidate.receiverPressure * 0.18;
} else if (openingProfile.key === "wide-release") {
score +=
(candidate.roleKey === "wideBack" || candidate.roleKey === "wideForward" ? 0.42 : 0) +
laneShift * 0.13 +
(targetLane.includes("Wide") ? 0.28 : 0) +
clamp(candidate.forwardGain / 8, -0.08, 0.22);
} else if (openingProfile.key === "weak-side-shift") {
score +=
(isWeakSide ? 0.44 : 0) +
laneShift * 0.16 +
candidate.laneClarity * 0.22 +
profile.switchBias * 0.18;
} else if (openingProfile.key === "vertical-second-touch") {
score +=
forwardFit * 0.58 +
(candidate.roleKey === "connector" || candidate.roleKey === "secondStriker" ? 0.34 : 0) +
profile.lineBreakBias * 0.22 -
candidate.receiverPressure * 0.2;
}
return {
score,
label: openingProfile.key,
reason: `${openingProfile.label} after the kick-off reset`,
firstTouchMode: openingProfile.firstTouchMode,
};
}

function buildAutoPilotPostKickoffResetCandidate(carrier, startPoint, profile) {
const state = getState();
if (!isLastStepKickoffResetForTeam(carrier.team)) {
return null;
}
const formation = teams[carrier.team]?.formation;
const openingProfile = getLastKickoffOpeningProfile(carrier.team);
const candidates = state.players
.filter((receiver) => {
if (receiver.team !== carrier.team || receiver.id === carrier.id) {
return false;
}
const roleKey = getOffensiveRoleKey(receiver, formation);
return (
roleKey === "rest" ||
roleKey === "gk" ||
roleKey === "wideBack" ||
roleKey === "pivot" ||
openingProfile.receiverRoles.includes(roleKey)
);
})
.map((receiver) => {
const target = getPlayerBallControlPoint(receiver);
const passDistance = distance(startPoint, target);
const forwardGain = (target.x - startPoint.x) * getAttackDirectionSign(carrier.team);
const roleKey = getOffensiveRoleKey(receiver, formation);
const laneClarity = computePassLaneClarity(carrier, target);
const receiverPressure = getPlayerPressureLoad(receiver, target);
const roleBase =
roleKey === "rest"
? 1.45
: roleKey === "gk"
? 0.92
: roleKey === "wideBack"
? 0.48
: 0.24;
const backwardFit = clamp((-forwardGain - 4) / 22, 0, 1);
const centralFit = 1 - Math.abs(target.y - pitch.width / 2) / (pitch.width / 2);
const styleFit =
profile.directness < 0.45
? roleKey === "rest" || roleKey === "gk" ? 0.42 : 0.14
: roleKey === "rest" ? 0.32 : 0.05;
const openingFit = getKickoffOpeningCandidateFit(
openingProfile,
{
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
},
startPoint,
carrier.team,
profile
);
const score =
3.55 +
roleBase +
openingFit.score +
laneClarity * 0.62 +
backwardFit * 0.88 +
centralFit * 0.22 +
profile.recycleWindow * 0.46 +
styleFit -
receiverPressure * 0.34 -
Math.abs(passDistance - 24) * 0.014;
return {
receiver,
roleKey,
target,
passDistance,
forwardGain,
laneClarity,
receiverPressure,
openingFit,
score,
};
})
.filter((candidate) => {
if (candidate.passDistance < 7 || candidate.passDistance > 38) {
return false;
}
if (openingProfile.key === "vertical-second-touch") {
return candidate.forwardGain <= 10 && candidate.receiverPressure <= 0.72;
}
if (openingProfile.key === "wide-release" || openingProfile.key === "weak-side-shift") {
return candidate.forwardGain <= 6 || candidate.roleKey === "wideBack";
}
return candidate.forwardGain <= 2 || candidate.roleKey === "gk";
})
.sort((a, b) => b.score - a.score);
const selected = chooseScoredCandidateWithVariation(candidates, profile, {
tolerance: 0.9,
temperature: 0.34,
carrier,
startPoint,
});
if (!selected) {
return null;
}
return {
actionType: "pass",
target: selected.target,
receiverPlayerId: selected.receiver.id,
receiverRoleKey: selected.roleKey,
passDistance: selected.passDistance,
forwardGain: selected.forwardGain,
laneClarity: selected.laneClarity,
receiverPressure: selected.receiverPressure,
isLineBreak: false,
isSwitch: false,
isBoxPass: false,
score: selected.score,
firstTouchMode: selected.openingFit.firstTouchMode,
label: selected.openingFit.label,
reason: selected.openingFit.reason,
principleLabels: [selected.openingFit.reason],
};
}


  return {
    buildAutoPilotKickoffCandidate,
    getLastKickoffOpeningProfile,
    getKickoffOpeningCandidateFit,
    buildAutoPilotPostKickoffResetCandidate,
  };
}
