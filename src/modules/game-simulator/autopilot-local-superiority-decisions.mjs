export function createGameSimulatorAutopilotLocalSuperiorityDecisions(deps = {}) {
  const {
    clamp,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotCandidateReceiver,
    getNearestOpponentGapToPoint,
    getOpponentPressureAtPoint,
    getPitchThreatProfile,
    getPlayerPressureLoad,
    isGoalkeeper,
    state,
    uniquePrincipleLabels,
  } = deps;

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

  return {
    getAutoPilotLocalSuperiorityProfile,
    getAutoPilotLocalSuperiorityAdjustment,
  };
}
