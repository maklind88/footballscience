export function createGameSimulatorAutopilotNextSupportNetworkDecisions(deps = {}) {
  const {
    clamp,
    computeTimeToCoverDistance,
    distance,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotCandidateReceiver,
    getAutoPilotRoleStrength,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    getPlayerTendency,
    getReceptionSupportTarget,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    resolveBallActionProfile,
    state,
    teams,
    uniquePrincipleLabels,
  } = deps;

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

  return {
    estimateAutoPilotCandidateDuration,
    getNextSupportSlotRoleFit,
    getAutoPilotNextSupportNetworkProfile,
    getAutoPilotNextSupportNetworkAdjustment,
  };
}
