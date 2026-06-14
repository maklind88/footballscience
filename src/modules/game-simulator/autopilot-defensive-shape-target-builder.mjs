export function createGameSimulatorDefensiveShapeTargetBuilder(deps = {}) {
  const {
    clamp,
    clampToPitch,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveGoalkeeperTarget,
    getDefensiveLineCenterY,
    getDefensiveLineWidth,
    getDefensiveLineX,
    getDefensivePhaseKey,
    getFormationPositions,
    getState,
    lerp,
    pitch,
    teamRosterOrder,
    teams,
  } = deps;

function buildDefensiveShapeTargets(teamId, ballPoint) {
const state = getState();
const formation = teams[teamId]?.formation ?? "4-3-3";
const phaseKey = getDefensivePhaseKey(teamId, ballPoint);
const profile = getDefensiveAutopilotProfile(teamId, ballPoint, phaseKey);
const roster = teamRosterOrder[teamId] ?? [];
const basePositions = getFormationPositions(formation, teamId);
const baseYById = new Map(
roster.map((playerId, index) => [playerId, basePositions[index]?.y ?? pitch.width / 2])
);
const groups = {
gk: [],
back: [],
midfield: [],
forward: [],
};
state.players
.filter((player) => player.team === teamId)
.forEach((player) => {
groups[getDefensiveAutopilotLineKey(player, formation, profile.phaseKey)].push(player);
});
Object.values(groups).forEach((group) => {
group.sort((a, b) => (baseYById.get(a.id) ?? a.position.y) - (baseYById.get(b.id) ?? b.position.y));
});
const targets = new Map();
groups.gk.forEach((player) => {
targets.set(player.id, getDefensiveGoalkeeperTarget(teamId, ballPoint, profile));
});
["back", "midfield", "forward"].forEach((lineKey) => {
const players = groups[lineKey];
if (!players.length) {
return;
}
const lineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const lineWidth = getDefensiveLineWidth(lineKey, profile, ballPoint, players.length);
const centerY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const phaseInsideBoost = profile.phaseKey === "boxDefending" ? 0.08 : profile.phaseKey === "lowBlock" ? 0.04 : 0;
const insidePull =
(lineKey === "forward" ? 0.18 : lineKey === "midfield" ? 0.13 : 0.08) +
phaseInsideBoost;
players.forEach((player, index) => {
const spreadRatio = players.length === 1 ? 0.5 : index / (players.length - 1);
const spreadY = centerY - lineWidth / 2 + lineWidth * spreadRatio;
const targetY = lerp(spreadY, ballPoint.y, insidePull);
targets.set(player.id, clampToPitch({
x: lineX,
y: clamp(targetY, 3, pitch.width - 3),
}, 3));
});
});
return {
  groups,
  targets,
  profile,
};
}

  return {
    buildDefensiveShapeTargets,
  };
}
