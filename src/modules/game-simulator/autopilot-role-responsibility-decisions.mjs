export function createGameSimulatorAutopilotRoleResponsibilityDecisions(deps = {}) {
  const {
    clamp,
    computePassLaneClarity,
    distance,
    getActionSpaceValue,
    getAttackingDepth,
    getAutoPilotCandidatePattern,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerPressureLoad,
    getPotentialPassReceiverAtTarget,
    isFrontLineRole,
    teams,
    uniquePrincipleLabels,
  } = deps;

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

  return {
    getAutoPilotCandidateReceiver,
    getAutoPilotRoleResponsibilityAdjustment,
  };
}
