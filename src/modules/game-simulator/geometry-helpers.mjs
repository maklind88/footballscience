export function createGameSimulatorGeometryHelpers(deps = {}) {
  const {
    formationMagnetLabels,
    getActionSpaceValue,
    getAutoPilotCandidatePattern,
    getAutoPilotRoleStrength,
    getBallControlOffsetMeters,
    getPitchLaneIndex,
    getPitchThreatProfile,
    getPlayerDecisionContext,
    getPlayerTeamId,
    getPlayerTendency,
    getRecentPossessionSteps,
    getRecordedStepPattern,
    intelligenceRoleArchetypes,
    isTransitionAttackStyle,
    pitch,
    sprintRoleArchetypes,
    teamRosterOrder,
    teams,
  } = deps;

function getPlayerMagnetLabel(player) {
if (!player) {
return "";
}
const teamId = getPlayerTeamId(player);
const roster = teamRosterOrder[teamId] ?? [];
const slotIndex = roster.indexOf(player.id);
const formation = teams[teamId]?.formation;
const formationLabels = formationMagnetLabels[formation];
if (slotIndex >= 0 && formationLabels?.[slotIndex]) {
return formationLabels[slotIndex];
}
const role = player.role ?? "";
const shortLabel = player.shortLabel ?? "";
if (/goalkeeper/i.test(role) || shortLabel === "GK") return "GK";
if (/center back/i.test(role) || /^(LCB|RCB|CB)$/i.test(shortLabel)) return "CB";
if (/wing-back/i.test(role) || /^(LM|RM)$/i.test(shortLabel)) return "WB";
if (/left back/i.test(role) || shortLabel === "LB") return "LB";
if (/right back/i.test(role) || shortLabel === "RB") return "RB";
if (/back/i.test(role) && !/center back/i.test(role)) {
return player.position.y <= pitch.width / 2 ? "LB" : "RB";
}
if (shortLabel === "6" || /holding midfielder/i.test(role)) return "6";
if (shortLabel === "10" || /attacking midfielder/i.test(role)) return "10";
if (shortLabel === "8" || /no\. 8|central midfielder/i.test(role)) return "8";
if (/striker|centre forward/i.test(role) || /^ST$/i.test(shortLabel)) return "9";
if (/winger|forward/i.test(role) || /^(LW|RW)$/i.test(shortLabel)) return "W";
return shortLabel;
}
function vec(x, y) {
return { x, y };
}
function cloneVector(point) {
return { x: point.x, y: point.y };
}
function cloneSecurePossession(securePossession) {
if (!securePossession) {
return null;
}
return {
...securePossession,
opponentPlayerIds: Array.isArray(securePossession.opponentPlayerIds)
? [...securePossession.opponentPlayerIds]
: undefined,
point: securePossession.point ? cloneVector(securePossession.point) : null,
escapePoint: securePossession.escapePoint ? cloneVector(securePossession.escapePoint) : null,
};
}
function cloneGoalEvent(goal) {
if (!goal) {
return null;
}
return {
scoringTeamId: goal.scoringTeamId ?? null,
concedingTeamId: goal.concedingTeamId ?? null,
side: goal.side ?? null,
scoredAt: Number.isFinite(goal.scoredAt) ? goal.scoredAt : 0,
point: goal.point ? cloneVector(goal.point) : null,
displayPoint: goal.displayPoint ? cloneVector(goal.displayPoint) : null,
};
}
function cloneShotPlacement(placement) {
if (!placement) {
return null;
}
return {
intendedTarget: placement.intendedTarget ? cloneVector(placement.intendedTarget) : null,
executedTarget: placement.executedTarget ? cloneVector(placement.executedTarget) : null,
errorMeters: Number.isFinite(placement.errorMeters) ? placement.errorMeters : 0,
missRisk: Number.isFinite(placement.missRisk) ? placement.missRisk : 0,
executionQuality: Number.isFinite(placement.executionQuality) ? placement.executionQuality : 0,
pressure: Number.isFinite(placement.pressure) ? placement.pressure : 0,
angleQuality: Number.isFinite(placement.angleQuality) ? placement.angleQuality : 0,
blockRisk: Number.isFinite(placement.blockRisk) ? placement.blockRisk : 0,
goalDistance: Number.isFinite(placement.goalDistance) ? placement.goalDistance : 0,
};
}
function subtract(a, b) {
return {
x: a.x - b.x,
y: a.y - b.y,
};
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(start, end, ratio) { return start + (end - start) * ratio; }
function randomBetween(min, max) { return min + Math.random() * (max - min); }
function randomSign() { return Math.random() < 0.5 ? -1 : 1; }
function addPointNoise(point, radiusMeters = 0, inset = pitch.inset) {
if (!point || radiusMeters <= 0) {
return point ? cloneVector(point) : point;
}
const angle = randomBetween(0, Math.PI * 2);
const radius = Math.sqrt(Math.random()) * radiusMeters;
return clampToPitch({
x: point.x + Math.cos(angle) * radius,
y: point.y + Math.sin(angle) * radius,
}, inset);
}
function chooseWeightedOption(options, getWeight) {
const weighted = options
.map((option) => ({
option,
weight: Math.max(0, getWeight(option)),
}))
.filter((entry) => entry.weight > 0);
if (!weighted.length) {
return options[0] ?? null;
}
const totalWeight = weighted.reduce((total, entry) => total + entry.weight, 0);
let cursor = Math.random() * totalWeight;
for (const entry of weighted) {
cursor -= entry.weight;
if (cursor <= 0) {
return entry.option;
}
}
return weighted[weighted.length - 1].option;
}
function getNaturalDecisionDiversityWeight(candidate, profile = {}, options = {}) {
const carrier = options.carrier ?? candidate?.carrier ?? null;
const startPoint =
options.startPoint ??
(carrier ? getPlayerBallControlPoint(carrier) : null);
if (!candidate?.target || !carrier?.team || !startPoint) {
return 1;
}
const recent = getRecentPossessionSteps(carrier.team, 7)
.map((step) => getRecordedStepPattern(step, carrier.team))
.filter(Boolean);
if (!recent.length) {
return 1;
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const lastPattern = recent[0] ?? null;
let familyStreak = 0;
let laneStreak = 0;
for (const entry of recent) {
if (entry.family === pattern.family) {
familyStreak += 1;
} else {
break;
}
}
for (const entry of recent) {
if (entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey) {
laneStreak += 1;
} else {
break;
}
}
const sameReceiverRoleCount = pattern.receiverRoleKey
? recent.filter((entry) => entry.receiverRoleKey === pattern.receiverRoleKey).length
: 0;
const sameSpaceCount = recent.filter((entry) => entry.targetSpaceLabel === pattern.targetSpaceLabel).length;
const highValueException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= 0.7 ||
targetThreat.centralPocket >= 0.48;
const identityRepeat =
((profile.styleKey === "wing-play" || profile.styleKey === "overlap-wide") &&
["wide-overload", "cross", "cutback", "switch"].includes(pattern.family)) ||
((profile.styleKey === "control-possession" || profile.styleKey === "tiki-taka" || profile.styleKey === "fluid-combinations") &&
["support-link", "third-player", "line-break"].includes(pattern.family)) ||
(isTransitionAttackStyle(profile.styleKey) &&
["line-break", "carry-forward", "front-line", "shot"].includes(pattern.family));
const repeatTolerance = identityRepeat ? 0.56 : 1;
const laneShiftFromLast = lastPattern
? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(lastPattern.laneKey))
: 0;
let weight = 1;
if (!highValueException) {
weight -= clamp(familyStreak * 0.1 * repeatTolerance, 0, 0.34);
weight -= clamp(laneStreak * 0.12, 0, 0.38);
weight -= clamp((sameReceiverRoleCount - 1) * 0.05, 0, 0.18);
weight -= clamp((sameSpaceCount - 2) * 0.05, 0, 0.2);
}
if (laneStreak >= 2 && laneShiftFromLast >= 2) {
weight += 0.18 + (profile.switchBias ?? 0.5) * 0.1;
}
if (familyStreak >= 2 && pattern.family !== lastPattern?.family) {
weight += 0.14 + (profile.tempo ?? 0.5) * 0.08;
}
if (recent.some((entry) => entry.family === "recycle") && pattern.forwardGain >= 6) {
weight += 0.12 + (profile.progressionUrgency ?? 0.5) * 0.08;
}
if (highValueException) {
weight += candidate.actionType === "shot" ? 0.12 : 0.06;
}
const naturalNoise = randomBetween(
-clamp(0.04 + (profile.risk ?? 0.5) * 0.04, 0.04, 0.1),
clamp(0.05 + (profile.tempo ?? 0.5) * 0.06, 0.05, 0.12)
);
return clamp(weight + naturalNoise, highValueException ? 0.72 : 0.36, 1.42);
}
function getAutoPilotDecisionPersonalityWeight(candidate, profile = {}, options = {}) {
const carrier = options.carrier ?? candidate?.carrier ?? null;
const startPoint =
options.startPoint ??
(carrier ? getPlayerBallControlPoint(carrier) : null);
if (!candidate?.target || !carrier || !startPoint) {
return 1;
}
const context = getPlayerDecisionContext(carrier);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
const decisionSecurity = clamp(
context.profile.perception * 0.24 +
context.profile.decisionQuality * 0.3 +
context.profile.tacticalDiscipline * 0.18 +
context.profile.composure * 0.16 +
context.profile.technicalSecurity * 0.12,
0,
1
);
const creativeFreedom = clamp(
(profile.risk ?? 0.5) * 0.26 +
(profile.tempo ?? 0.5) * 0.16 +
(1 - context.profile.tacticalDiscipline) * 0.14 +
context.profile.decisionQuality * 0.18,
0,
0.72
);
const underPressure = clamp(context.pressure, 0, 1);
const isHighValue =
candidate.mustShoot ||
candidate.isLineBreak ||
candidate.isBoxPass ||
candidate.actionType === "shot" ||
targetThreat.value >= 0.62 ||
targetThreat.centralPocket >= 0.42 ||
actionSpace.spacePriority?.score >= 0.62;
let fit = 0;
let tendencyFit = 0;
if (candidate.actionType === "dribble") {
fit =
getAutoPilotRoleStrength(carrier, "dribbler") * 0.58 +
getAutoPilotRoleStrength(carrier, "runner") * 0.22;
tendencyFit =
getPlayerTendency(carrier, "dribble") * 0.62 +
getPlayerTendency(carrier, "boxRun") * 0.18;
} else if (candidate.actionType === "shot") {
fit =
getAutoPilotRoleStrength(carrier, "finisher") * 0.66 +
getAutoPilotRoleStrength(carrier, "runner") * 0.12;
tendencyFit =
getPlayerTendency(carrier, "boxRun") * 0.28 +
(profile.shootBias ?? 0.5) * 0.28;
} else if (pattern.family === "switch" || candidate.isSwitch) {
fit =
getAutoPilotRoleStrength(carrier, "switcher") * 0.62 +
getAutoPilotRoleStrength(carrier, "creator") * 0.18;
tendencyFit = getPlayerTendency(carrier, "switchPlay") * 0.68;
} else if (pattern.family === "cross" || pattern.family === "cutback" || candidate.isBoxPass) {
fit =
getAutoPilotRoleStrength(carrier, "crosser") * 0.48 +
getAutoPilotRoleStrength(carrier, "creator") * 0.28;
tendencyFit =
getPlayerTendency(carrier, "earlyCross") * 0.46 +
getPlayerTendency(carrier, "passAndMove") * 0.18;
} else if (
pattern.family === "line-break" ||
pattern.family === "front-line" ||
candidate.isLineBreak
) {
fit =
getAutoPilotRoleStrength(carrier, "creator") * 0.46 +
getAutoPilotRoleStrength(carrier, "receiver") * 0.18;
tendencyFit =
getPlayerTendency(carrier, "lineBreakPass") * 0.58 +
getPlayerTendency(carrier, "passAndMove") * 0.16;
} else if (pattern.family === "support-link" || pattern.family === "recycle") {
fit =
getAutoPilotRoleStrength(carrier, "receiver") * 0.34 +
getAutoPilotRoleStrength(carrier, "creator") * 0.24;
tendencyFit =
getPlayerTendency(carrier, "retain") * 0.5 +
getPlayerTendency(carrier, "passAndMove") * 0.22;
} else {
fit =
getAutoPilotRoleStrength(carrier, "creator") * 0.32 +
getAutoPilotRoleStrength(carrier, "receiver") * 0.22;
tendencyFit = getPlayerTendency(carrier, "passAndMove") * 0.34;
}
const personalityFit = clamp((fit + tendencyFit) / 1.18, 0, 1.16);
const pressureSafetyFit =
underPressure >= 0.48
? candidate.actionType === "pass" && pattern.forwardGain <= 6 && (candidate.receiverPressure ?? 1) <= 0.68
? 0.12 + context.profile.pressResistance * 0.1
: candidate.actionType === "dribble" && getAutoPilotRoleStrength(carrier, "dribbler") >= 0.66
? 0.08 + context.profile.pressResistance * 0.08
: -0.12 * underPressure
: 0;
const lowValueRisk =
!isHighValue &&
(
(candidate.actionType === "shot" && targetThreat.box < 0.16) ||
(candidate.actionType === "pass" && pattern.forwardGain < -5 && !(candidate.isSwitch || pattern.family === "switch")) ||
(candidate.actionType === "dribble" && actionSpace.openTarget < 0.32 && underPressure >= 0.42)
);
const intelligenceGuard =
lowValueRisk
? -0.18 - decisionSecurity * 0.18
: isHighValue
? decisionSecurity * 0.12
: decisionSecurity * 0.04;
const naturalVariance = randomBetween(
-clamp(0.035 + (1 - decisionSecurity) * 0.06, 0.035, 0.095),
clamp(0.04 + creativeFreedom * 0.08, 0.04, 0.105)
);
const score =
0.9 +
personalityFit * 0.18 +
pressureSafetyFit +
intelligenceGuard +
naturalVariance;
return clamp(score, lowValueRisk ? 0.62 : 0.74, isHighValue ? 1.28 : 1.2);
}
function chooseScoredCandidateWithVariation(candidates, profile = {}, options = {}) {
const available = candidates.filter(Boolean);
if (!available.length) {
return null;
}
const sorted = [...available].sort((a, b) => b.score - a.score);
const bestScore = sorted[0].score ?? 0;
const tolerance =
options.tolerance ??
clamp(0.54 + (profile.risk ?? 0.5) * 0.52 + (profile.tempo ?? 0.5) * 0.28, 0.55, 1.45);
const temperature =
options.temperature ??
clamp(0.22 + (profile.risk ?? 0.5) * 0.16 + (profile.tempo ?? 0.5) * 0.1, 0.2, 0.58);
const pool = sorted.filter((candidate, index) => (
index === 0 ||
(candidate.score ?? 0) >= bestScore - tolerance ||
candidate.mustShoot
));
return chooseWeightedOption(pool, (candidate) => {
const relativeScore = ((candidate.score ?? 0) - bestScore) / Math.max(temperature, 0.01);
const principleBoost = candidate.isPrinciplePattern ? 1.1 : 1;
const preferredBoost = options.preferredCandidate && candidate === options.preferredCandidate ? 1.35 : 1;
const shotBoost = candidate.actionType === "shot" && (candidate.mustShoot || profile.phaseKey === "finalThird") ? 1.25 : 1;
const diversityWeight = getNaturalDecisionDiversityWeight(candidate, profile, options);
const personalityWeight = getAutoPilotDecisionPersonalityWeight(candidate, profile, options);
return Math.exp(relativeScore) * principleBoost * preferredBoost * shotBoost * diversityWeight * personalityWeight;
});
}
function clampToPitch(point, inset = pitch.inset) {
return {
x: clamp(point.x, inset, pitch.length - inset),
y: clamp(point.y, inset, pitch.width - inset),
};
}
function distance(a, b) {
const dx = b.x - a.x;
const dy = b.y - a.y;
return Math.sqrt(dx * dx + dy * dy);
}
function normalize(from, to) {
const dx = to.x - from.x;
const dy = to.y - from.y;
const length = Math.sqrt(dx * dx + dy * dy);
if (length === 0) {
return { x: 0, y: 0 };
}
return {
x: dx / length,
y: dy / length,
};
}
function moveTowards(from, to, maxDistance) {
const remaining = distance(from, to);
if (remaining <= maxDistance) {
return cloneVector(to);
}
const direction = normalize(from, to);
return {
x: from.x + direction.x * maxDistance,
y: from.y + direction.y * maxDistance,
};
}
function normalizeAngle(angle) {
let next = angle;
while (next > Math.PI) {
next -= Math.PI * 2;
}
while (next < -Math.PI) {
next += Math.PI * 2;
}
return next;
}
function angleBetween(from, to) { return Math.atan2(to.y - from.y, to.x - from.x); }
function angleDifference(a, b) { return Math.abs(normalizeAngle(a - b)); }
function getTeamAttackAngle(teamId) { return teamId === "home" ? 0 : Math.PI; }
function getPlayerFacingAngle(player) { return Number.isFinite(player.bodyAngle) ? player.bodyAngle : getTeamAttackAngle(player.team); }
function rotatePlayerBodyToward(player, targetPoint, blend = 1) {
if (!targetPoint) {
return;
}
const desiredAngle = angleBetween(player.position, targetPoint);
const currentAngle = getPlayerFacingAngle(player);
const delta = normalizeAngle(desiredAngle - currentAngle);
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function rotatePlayerBodyTowardAngle(player, desiredAngle, blend = 1, maxTurn = Infinity) {
if (!player || !Number.isFinite(desiredAngle)) {
return;
}
const currentAngle = getPlayerFacingAngle(player);
let delta = normalizeAngle(desiredAngle - currentAngle);
if (Number.isFinite(maxTurn)) {
delta = clamp(delta, -Math.abs(maxTurn), Math.abs(maxTurn));
}
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function rotatePlayerBodyAlongMovement(player, fromPoint, toPoint, blend = 1) {
if (!player || !fromPoint || !toPoint || distance(fromPoint, toPoint) <= 0.001) {
return;
}
const desiredAngle = angleBetween(fromPoint, toPoint);
const currentAngle = getPlayerFacingAngle(player);
const delta = normalizeAngle(desiredAngle - currentAngle);
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function getBallAwareBodyAngle(player, focusPoint) {
if (!player || !focusPoint) {
return player ? getPlayerFacingAngle(player) : 0;
}
const ballAngle = angleBetween(player.position, focusPoint);
const nextPlayAngle = getTeamAttackAngle(player.team);
const attackBias = clamp(
normalizeAngle(nextPlayAngle - ballAngle) * 0.26,
-Math.PI / 7.5,
Math.PI / 7.5
);
return normalizeAngle(ballAngle + attackBias);
}
function getPlayerBallControlPoint(player) {
const facingAngle = getPlayerFacingAngle(player);
const controlOffset = getBallControlOffsetMeters();
return clampToPitch({
x: player.position.x + Math.cos(facingAngle) * controlOffset,
y: player.position.y + Math.sin(facingAngle) * controlOffset,
});
}
function getPreferredFootOffsetAngle(player) { return player?.preferredFoot === "left" ? Math.PI / 7.5 : -Math.PI / 7.5; }
function getFootUsageScore(player, referenceAngle, baseAngle = getPlayerFacingAngle(player)) {
if (!player || !Number.isFinite(referenceAngle)) {
return 0.82;
}
const preferredPocketAngle = normalizeAngle(baseAngle + getPreferredFootOffsetAngle(player));
const alternatePocketAngle = normalizeAngle(baseAngle - getPreferredFootOffsetAngle(player));
const preferredAlignment = 1 - angleDifference(referenceAngle, preferredPocketAngle) / Math.PI;
const alternateAlignment = 1 - angleDifference(referenceAngle, alternatePocketAngle) / Math.PI;
const weakFootQuality = clamp(player.weakFootQuality ?? 0.68, 0.45, 0.92);
return clamp(
Math.max(preferredAlignment, alternateAlignment * weakFootQuality),
0.2,
1
);
}
function blendAngles(angleA, angleB, weightA = 0.5, weightB = 0.5) {
const x = Math.cos(angleA) * weightA + Math.cos(angleB) * weightB;
const y = Math.sin(angleA) * weightA + Math.sin(angleB) * weightB;
if (Math.abs(x) <= 0.0001 && Math.abs(y) <= 0.0001) {
return angleA;
}
return Math.atan2(y, x);
}
function projectPointOnSegment(point, segmentStart, segmentEnd) {
const dx = segmentEnd.x - segmentStart.x;
const dy = segmentEnd.y - segmentStart.y;
const lengthSquared = dx * dx + dy * dy;
if (lengthSquared === 0) {
return cloneVector(segmentStart);
}
const t = clamp(
((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared,
0,
1
);
return {
x: segmentStart.x + dx * t,
y: segmentStart.y + dy * t,
};
}
function projectPointOnSegmentWithRatio(point, segmentStart, segmentEnd) {
const dx = segmentEnd.x - segmentStart.x;
const dy = segmentEnd.y - segmentStart.y;
const lengthSquared = dx * dx + dy * dy;
if (lengthSquared === 0) {
return {
point: cloneVector(segmentStart),
ratio: 0,
};
}
const ratio = clamp(
((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared,
0,
1
);
return {
point: {
x: segmentStart.x + dx * ratio,
y: segmentStart.y + dy * ratio,
},
ratio,
};
}
function formatTime(seconds) {
return `${seconds.toFixed(2)} s`;
}
function formatSpeed(value) {
return `${value.toFixed(1)} m/s`;
}
function formatMeters(value) {
return `${value.toFixed(1)} m`;
}
function getIntelligenceArchetype(blueprint) {
return (
intelligenceRoleArchetypes.find((archetype) =>
archetype.test(blueprint.role, blueprint.shortLabel)
) ?? intelligenceRoleArchetypes[intelligenceRoleArchetypes.length - 1]
);
}
function getSprintArchetype(blueprint) {
const roleLabel = blueprint?.team
? getPlayerMagnetLabel(blueprint) || blueprint.shortLabel
: blueprint?.shortLabel;
return (
sprintRoleArchetypes.find((archetype) =>
archetype.test(blueprint.role, roleLabel)
) ?? sprintRoleArchetypes[sprintRoleArchetypes.length - 1]
);
}

  return {
    getPlayerMagnetLabel,
    vec,
    cloneVector,
    cloneSecurePossession,
    cloneGoalEvent,
    cloneShotPlacement,
    subtract,
    clamp,
    lerp,
    randomBetween,
    randomSign,
    addPointNoise,
    chooseWeightedOption,
    getNaturalDecisionDiversityWeight,
    getAutoPilotDecisionPersonalityWeight,
    chooseScoredCandidateWithVariation,
    clampToPitch,
    distance,
    normalize,
    moveTowards,
    normalizeAngle,
    angleBetween,
    angleDifference,
    getTeamAttackAngle,
    getPlayerFacingAngle,
    rotatePlayerBodyToward,
    rotatePlayerBodyTowardAngle,
    rotatePlayerBodyAlongMovement,
    getBallAwareBodyAngle,
    getPlayerBallControlPoint,
    getPreferredFootOffsetAngle,
    getFootUsageScore,
    blendAngles,
    projectPointOnSegment,
    projectPointOnSegmentWithRatio,
    formatTime,
    formatSpeed,
    formatMeters,
    getIntelligenceArchetype,
    getSprintArchetype,
  };
}
