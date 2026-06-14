export function createGameSimulatorAutopilotLiveDefensiveLineControl(deps = {}) {
  const {
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getDefendingDirectionSign,
    getDefensiveLineCenterY,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensiveUnitGap,
    isGoalkeeper,
    lerp,
    pitch,
    state,
    uniquePrincipleLabels,
  } = deps;

function enforceDefensiveMeasuredBlockEnvelope(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const phaseSettings = {
highPress: {
height: 34,
backToMidfield: 11.2,
unitGap: 9.5,
weight: 0.28,
label: "High-press block envelope",
},
midBlock: {
height: 30,
backToMidfield: 10.2,
unitGap: 9,
weight: 0.46,
label: "Mid-block measured envelope",
},
lowBlock: {
height: 26,
backToMidfield: 10.2,
unitGap: 8,
weight: 0.72,
label: "Low-block measured envelope",
},
boxDefending: {
height: 17,
backToMidfield: 7.2,
unitGap: 7.5,
weight: 0.78,
label: "Box measured envelope",
},
};
const settings = phaseSettings[profile.phaseKey] ?? phaseSettings.midBlock;
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const targetHeight = clamp(
profile.targetBlockHeight ?? settings.height,
profile.phaseKey === "boxDefending" ? 15 : profile.phaseKey === "lowBlock" ? 24 : 26,
profile.phaseKey === "boxDefending" ? 19 : profile.phaseKey === "lowBlock" ? 28 : 36
);
const backDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const backToMidfield = clamp(
profile.targetBackToMidfield ?? settings.backToMidfield,
profile.phaseKey === "boxDefending" ? 6.4 : 8,
Math.max(profile.phaseKey === "boxDefending" ? 8.6 : 12, targetHeight - 5.2)
);
const depthByLine = {
back: backDepth,
midfield: clamp(backDepth + backToMidfield, backDepth + 5.6, backDepth + targetHeight - 4.8),
forward: clamp(backDepth + targetHeight, backDepth + backToMidfield + 4.8, pitch.length - 8),
};
const labels = [];
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const players = (groups[lineKey] ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.sort((a, b) => {
const aY = targets.get(a.id)?.y ?? a.position.y;
const bY = targets.get(b.id)?.y ?? b.position.y;
return aY - bY;
});
if (!players.length) {
return;
}
const unitGap = clamp(
getDefensiveUnitGap(profile, lineKey) || settings.unitGap,
profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8,
profile.phaseKey === "boxDefending" ? 8.2 : profile.phaseKey === "lowBlock" ? 8.6 : 10.8
);
const lineWidth = unitGap * Math.max(0, players.length - 1);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const lineX = ownGoalX + sign * depthByLine[lineKey];
const lineWeight =
lineKey === "forward"
? settings.weight * (profile.phaseKey === "highPress" ? 0.72 : 0.82)
: settings.weight;
players.forEach((player, index) => {
if (hardFixedIds.has(player.id)) {
return;
}
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const measuredSlot = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.1, pitch.width - 3.1),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
const weight = softFixedIds.has(player.id) ? lineWeight * 0.42 : lineWeight;
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, measuredSlot.x, weight),
y: lerp(currentTarget.y, measuredSlot.y, weight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
});
if (adjusted) {
labels.push(settings.label);
}
return labels;
}
function enforceDefensiveCollectiveShiftCohesion(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
if (!ballPoint || state.restartPhase?.type) {
return [];
}
const phaseSettings = {
highPress: {
centerWeight: 0.28,
depthWeight: 0.22,
widthWeight: 0.3,
label: "High-press collective shift",
},
midBlock: {
centerWeight: 0.38,
depthWeight: 0.32,
widthWeight: 0.42,
label: "Mid-block collective shift",
},
lowBlock: {
centerWeight: 0.56,
depthWeight: 0.5,
widthWeight: 0.68,
label: "Low-block collective shift",
},
boxDefending: {
centerWeight: 0.62,
depthWeight: 0.54,
widthWeight: 0.72,
label: "Box collective shift",
},
};
const settings = phaseSettings[profile.phaseKey] ?? phaseSettings.midBlock;
const labels = [];
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const entries = (groups[lineKey] ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.map((player) => ({
player,
target: cloneVector(targets.get(player.id)),
}))
.sort((a, b) => a.target.y - b.target.y);
if (!entries.length) {
return;
}
const desiredGap = clamp(
getDefensiveUnitGap(profile, lineKey),
profile.phaseKey === "boxDefending" ? 7 : profile.phaseKey === "lowBlock" ? 7.6 : 8,
profile.phaseKey === "boxDefending" ? 8.2 : profile.phaseKey === "lowBlock" ? 8.8 : 10.8
);
const desiredWidth = desiredGap * Math.max(0, entries.length - 1);
const desiredCenterY = getDefensiveLineCenterY(lineKey, profile, ballPoint, desiredWidth);
const desiredLineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const yValues = entries.map((entry) => entry.target.y);
const actualCenterY = yValues.length
? yValues.reduce((total, value) => total + value, 0) / yValues.length
: desiredCenterY;
const actualWidth = Math.max(0.1, Math.max(...yValues) - Math.min(...yValues));
const lineTooWide = actualWidth > desiredWidth * 1.16 + 1.1;
const lineTooNarrow = entries.length > 2 && actualWidth < desiredWidth * 0.78 - 0.8;
const widthRatio = desiredWidth > 0
? clamp(desiredWidth / actualWidth, 0.72, 1.22)
: 1;
entries.forEach(({ player, target }) => {
if (hardFixedIds.has(player.id)) {
return;
}
const softScale = softFixedIds.has(player.id) ? 0.38 : 1;
const centerPull = settings.centerWeight * softScale;
const depthPull = settings.depthWeight * softScale;
const widthPull = (lineTooWide || lineTooNarrow ? settings.widthWeight : settings.widthWeight * 0.24) * softScale;
const desiredOffset = (target.y - actualCenterY) * widthRatio;
const cohesiveY = desiredCenterY + desiredOffset;
const nextTarget = clampToPitch({
x: lerp(target.x, desiredLineX, depthPull),
y: lerp(
lerp(target.y, target.y + (desiredCenterY - actualCenterY), centerPull),
cohesiveY,
widthPull
),
}, 2.2);
if (distance(target, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
});
if (adjusted) {
labels.push(settings.label);
}
return labels;
}
function getDefensiveCompactLineIntegritySettings(profile, lineKey) {
if (!profile || profile.phaseKey === "highPress" || profile.phaseKey === "setPiece") {
return null;
}
const phaseSettings = {
boxDefending: {
gap: {
back: 7.5,
midfield: 7.5,
forward: 8.2,
},
xWeight: {
back: 0.98,
midfield: 0.96,
forward: 0.66,
},
yWeight: {
back: 0.98,
midfield: 0.96,
forward: 0.7,
},
protectedScale: {
back: 0.82,
midfield: 0.78,
forward: 0.52,
},
presserScale: {
back: 0.72,
midfield: 0.5,
forward: 0.42,
},
label: "Box line integrity",
},
lowBlock: {
gap: {
back: 8,
midfield: 8,
forward: 8.4,
},
xWeight: {
back: 0.97,
midfield: 0.94,
forward: 0.62,
},
yWeight: {
back: 0.98,
midfield: 0.95,
forward: 0.68,
},
protectedScale: {
back: 0.84,
midfield: 0.8,
forward: 0.56,
},
presserScale: {
back: 0.74,
midfield: 0.52,
forward: 0.44,
},
label: "Low-block 8m line integrity",
},
midBlock: {
gap: {
back: 9,
midfield: 8.8,
forward: 10.4,
},
xWeight: {
back: 0.62,
midfield: 0.58,
forward: 0.34,
},
yWeight: {
back: 0.66,
midfield: 0.62,
forward: 0.4,
},
protectedScale: {
back: 0.62,
midfield: 0.58,
forward: 0.42,
},
presserScale: {
back: 0.62,
midfield: 0.5,
forward: 0.42,
},
label: "Mid-block line integrity",
},
};
const settings = phaseSettings[profile.phaseKey];
if (!settings) {
return null;
}
return {
gap: settings.gap[lineKey] ?? settings.gap.midfield,
xWeight: settings.xWeight[lineKey] ?? settings.xWeight.midfield,
yWeight: settings.yWeight[lineKey] ?? settings.yWeight.midfield,
protectedScale: settings.protectedScale[lineKey] ?? settings.protectedScale.midfield,
presserScale: settings.presserScale[lineKey] ?? settings.presserScale.midfield,
label: settings.label,
};
}
function enforceDefensiveCompactLineIntegrity(
teamId,
targets,
groups,
ballPoint,
profile,
presserId = null,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
const restartType = state.restartPhase?.type;
if (!ballPoint || (restartType && restartType !== "kickoff")) {
return [];
}
const labels = new Set();
let adjusted = false;
["back", "midfield", "forward"].forEach((lineKey) => {
const settings = getDefensiveCompactLineIntegritySettings(profile, lineKey);
if (!settings) {
return;
}
const players = (groups[lineKey] ?? []).filter(
(player) => !isGoalkeeper(player) && targets.has(player.id)
);
if (players.length < 2) {
return;
}
const lineWidth = settings.gap * (players.length - 1);
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
players.forEach((player, index) => {
const slotTarget = clampToPitch({
x: lineX,
y: clamp(centerY - lineWidth / 2 + settings.gap * index, 3.1, pitch.width - 3.1),
}, 2.2);
const currentTarget = targets.get(player.id) ?? player.position;
const isPresser = presserId && player.id === presserId;
const protectedScale =
hardFixedIds.has(player.id) || softFixedIds.has(player.id)
? settings.protectedScale
: 1;
const presserScale = isPresser ? settings.presserScale : 1;
const xWeight = settings.xWeight * protectedScale * presserScale;
const yWeight = settings.yWeight * protectedScale * presserScale;
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, slotTarget.x, xWeight),
y: lerp(currentTarget.y, slotTarget.y, yWeight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.06) {
adjusted = true;
labels.add(settings.label);
}
targets.set(player.id, nextTarget);
});
});
return adjusted ? uniquePrincipleLabels([...labels]) : [];
}

  return {
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveCollectiveShiftCohesion,
    getDefensiveCompactLineIntegritySettings,
    enforceDefensiveCompactLineIntegrity,
  };
}
