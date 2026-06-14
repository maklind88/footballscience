import { createGameSimulatorAutopilotLiveActionProfile } from "./autopilot-live-action-profile.mjs";
import { createGameSimulatorAutopilotLiveContextHelpers } from "./autopilot-live-context-helpers.mjs";
import { createGameSimulatorAutopilotLiveDefensiveAutoV2 } from "./autopilot-live-defensive-auto-v2.mjs";
import { createGameSimulatorAutopilotLiveDefensiveLineGeometry } from "./autopilot-live-defensive-line-geometry.mjs";
import { createGameSimulatorAutopilotLiveDefensiveLineControl } from "./autopilot-live-defensive-line-control.mjs";
import { createGameSimulatorAutopilotLiveDefensiveShape } from "./autopilot-live-defensive-shape.mjs";
import { createGameSimulatorAutopilotLiveMovementPlanning } from "./autopilot-live-movement-planning.mjs";
import { createGameSimulatorAutopilotLiveOffensiveAutoV2 } from "./autopilot-live-offensive-auto-v2.mjs";
import { createGameSimulatorAutopilotLiveOffensiveSupport } from "./autopilot-live-offensive-support.mjs";

export function createGameSimulatorAutopilotLiveEngine(deps = {}) {
  const {
    angleBetween,
    angleDifference,
    buildDefensiveAutopilotTargets,
    buildOffensiveAutopilotTargets,
    clamp,
    clampToPitch,
    cloneVector,
    computePassLaneClarity,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance,
    getActionInitiator,
    getActionOrigin,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackStyleRhythmProfile,
    getAttackingGameSpaceProfile,
    getAutoPilotRoleStrength,
    getBallNearSupportTriangleTarget,
    getCurrentActionDuration,
    getDefensiveDribblePressTarget,
    getDefensiveThreatResponse,
    getDribblePressureReference,
    getFormationPositions,
    getKickoffDefensivePhaseKey,
    getOpponentPressureAtPoint,
    getOrientationTurnDelay,
    getOrientationMovementProfile,
    getOwnGoalCenter,
    getPitchSurfacePreset,
    getPitchThreatProfile,
    getPlayerBallControlPoint,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getProjectedActionDuration,
    getSecondLastOpponentLineX,
    getTeamAttackAngle,
    getTeamAttackStyleKey,
    getTeamAttackStyleProfile,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    getWeatherPreset,
    getWideSideSign,
    hasBallAction,
    isAerialFlightStyle,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    logEvent,
    materializeBallProfile,
    moveTowards,
    normalize,
    normalizeAngle,
    offensiveAutopilotProfiles,
    offensivePhaseProfiles,
    pitch,
    resolveBallCurveDirection,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    teamRosterOrder,
    teams,
    uniquePrincipleLabels,
    updateActionPlayers,
    getState,
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

  const {
    getOffensiveAutopilotFocusPoint,
    isOffensiveAutopilotPlayer,
    getOtherTeamId,
    getPlannedPossessionTeamId,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensivePhaseKey,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchLaneIndex,
    getAttackingThirdKey,
    getLaneCenterY,
    getSideLaneKeys,
    autoPilotPossessionIntentLabels,
  } = createGameSimulatorAutopilotLiveContextHelpers({
    clamp,
    cloneVector,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackStyleRhythmProfile,
    getPlayerById,
    getPlayerMagnetLabel,
    getTeamAttackStyleKey,
    getTeamAttackStyleProfile,
    offensiveAutopilotProfiles,
    offensivePhaseProfiles,
    pitch,
    teams,
    getState,
  });

  const {
    getDefensivePhaseKey,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveLineActionAdjustment,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensiveLineWidth,
    getDefensiveLineCenterY,
  } = createGameSimulatorAutopilotLiveDefensiveShape({
    clamp,
    defensiveAutopilotProfiles,
    defensivePhaseProfiles,
    distance,
    getActionSpaceValue,
    getAttackDirectionSign,
    getAttackingGameSpaceProfile,
    getDefendingDirectionSign,
    getDefensiveThreatResponse,
    getDistanceFromOwnGoal,
    getKickoffDefensivePhaseKey,
    getOtherTeamId,
    getPitchThreatProfile,
    getPlayerById,
    getPlayerMagnetLabel,
    getPlayerPressureLoad,
    getTeamDefenseStyleKey,
    getTeamDefenseStyleProfile,
    lerp,
    pitch,
    teams,
    getState,
  });

  const {
    enforceDefensiveUnitCompactness,
    getDefensiveUnitGap,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveLineStaggering,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveVerticalBlockConnections,
  } = createGameSimulatorAutopilotLiveDefensiveLineGeometry({
    clamp,
    clampToPitch,
    cloneVector,
    getDefendingDirectionSign,
    getDefensiveLineCenterY,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineWidth,
    getDefensiveLineX,
    getDistanceFromOwnGoal,
    getOwnGoalCenter,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    pitch,
    state,
  });

  const {
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveCollectiveShiftCohesion,
    getDefensiveCompactLineIntegritySettings,
    enforceDefensiveCompactLineIntegrity,
  } = createGameSimulatorAutopilotLiveDefensiveLineControl({
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
  });

  const {
    computeReachDistance,
    computeTimeToCoverDistance,
    shouldUseCurvedRecoveryRun,
    getCurvedRecoveryWaypoint,
    shouldUseOffBallCounterMovementRun,
    getOffBallCounterMovementWaypoint,
    buildMovementPath,
    getMovementPathPoint,
    getSnapshotPlayerMap,
    getRecordedStepEndSnapshot,
    getRecordedStepDuration,
    snapshotsMatch,
    createTransitionPlan,
    clampToCircle,
    getEditableRadius,
  } = createGameSimulatorAutopilotLiveMovementPlanning({
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth,
    getAttackingGameSpaceProfile,
    getCurrentActionDuration,
    getOrientationMovementProfile,
    getOrientationTurnDelay,
    getOwnGoalCenter,
    getPitchThreatProfile,
    getPlayerDecisionContext,
    getPlayerMagnetLabel,
    getProjectedActionDuration,
    getOffensiveRoleKey,
    hasBallAction,
    isGoalkeeper,
    isOffensiveAutopilotPlayer,
    lerp,
    moveTowards,
    normalize,
    pitch,
    teams,
    getState,
  });

  const {
    cloneOffensiveAutopilotIntents,
    cloneAutoV2DecisionTriggers,
    scanAutoV2DecisionTriggers,
    weightOffensiveAutoV2Intent,
    getOffensiveAutoV2Intent,
    setReachableOffensiveAutoV2Target,
    pickOffensiveAutoV2Player,
    applyOffensiveAutoV2RelationshipLayer,
    buildOffensiveAutoV2Intents,
  } = createGameSimulatorAutopilotLiveOffensiveAutoV2({
    angleDifference,
    clamp,
    clampToCircle,
    clampToPitch,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth,
    getAutoPilotRoleStrength,
    getBallNearSupportTriangleTarget,
    getDistanceFromOwnGoal,
    getEditableRadius,
    getOffensiveRoleKey,
    getOpponentPressureAtPoint,
    getOtherTeamId,
    getPlayerById,
    getPlayerFacingAngle,
    getTeamAttackAngle,
    getWideSideSign,
    isGoalkeeper,
    isWidePrincipleZone,
    lerp,
    pitch,
    teams,
    uniquePrincipleLabels,
    getState,
  });

	  const {
    getDefensiveAutopilotFocusPoint,
    isDefensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    getLiveDefensiveDribblePressTarget,
    cloneDefensiveAutopilotIntents,
    getDefensiveAutoV2Intent,
    buildDefensiveAutoV2Intents,
    setReachableDefensiveAutoV2Target,
    applyDefensiveAutoV2BackLineRelationship,
    applyDefensiveAutoV2MidfieldPressCover,
    applyDefensiveAutoV2PressTether,
    applyDefensiveAutoV2AntiMagnetRelationships,
    applyDefensiveAutoV2RelationshipLayer,
    getDefensiveAutoV2FrameDt,
    moveDefensiveAutoV2Player,
    alignArrivedDefensiveAutopilotPlayers,
  } = createGameSimulatorAutopilotLiveDefensiveAutoV2({
    angleBetween,
    clamp,
    clampToPitch,
    clampToCircle,
    cloneVector,
    distance,
    getActionOrigin,
    getDefendingDirectionSign,
    getDefensiveAutopilotGroupsForTeam,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveDribblePressTarget,
    getDefensiveLineCenterY,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensivePhaseKey,
    getDefensiveUnitGap,
    getDistanceFromOwnGoal,
    getDribblePressureReference,
    getEditableRadius,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getWideSideSign,
    isGoalkeeper,
    lerp,
    normalizeAngle,
    pitch,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    teams,
    uniquePrincipleLabels,
    getState,
  });

  const {
    getActionSpeed,
    configureBallTravelProfile,
    getActionDistance,
    getRequestedActionMode,
  } = createGameSimulatorAutopilotLiveActionProfile({
    clamp,
    distance,
    getActionInitiator,
    getPitchSurfacePreset,
    getPlayerDecisionContext,
    getWeatherPreset,
    isAerialFlightStyle,
    lerp,
    materializeBallProfile,
    resolveBallCurveDirection,
    getState,
  });

  const {
    getRecentPossessionSteps,
    getRecordedStepPossessionTeamId,
    getPossessionRhythmContext,
    getLaneForSideSign,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    moveOffensiveAutoV2Player,
  } = createGameSimulatorAutopilotLiveOffensiveSupport({
    angleBetween,
    clamp,
    clampToPitch,
    cloneVector,
    distance,
    getActionOrigin,
    getAttackDirectionSign,
    getAttackingDepth,
    getDefensiveAutoV2FrameDt,
    getDepthX,
    getPlayerById,
    getPlayerDecisionContext,
    getPlayerFacingAngle,
    getRecordedStepDuration,
    normalizeAngle,
    pitch,
    rotatePlayerBodyAlongMovement,
    rotatePlayerBodyToward,
    getState,
  });

function completeLiveActionPlayersBeforeCommit(focusPoint = state.ball.position) {
	if (!state.activeActionTargets || !state.draftStep) {
	return;
}
updateActionPlayers(state.activeActionTargets, state.draftStep);
alignArrivedDefensiveAutopilotPlayers(
state.draftStep,
	state.activeActionTargets,
	focusPoint
	);
	}
function getDefensiveOffsideLineControlContext(teamId, ballPoint, profile) {
if (!ballPoint || state.restartPhase?.type || profile.phaseKey === "setPiece") {
return null;
}
const attackingTeamId = getOtherTeamId(teamId);
if (!attackingTeamId) {
return null;
}
const actionMeta = state.draftStep ?? {
actionType: state.ball.actionType,
target: state.ball.target,
receiverPlayerId: state.ball.receiverPlayerId,
carrierPlayerId: state.ball.carrierPlayerId,
beforeSnapshot: {
ball: {
position: state.ball.startPosition,
ownerPlayerId: state.ball.initiatorPlayerId ?? state.ball.ownerPlayerId,
},
},
autoPrinciples: [],
};
const actionType = actionMeta.actionType ?? state.ball.actionType;
if (actionType !== "pass" && actionType !== "dribble") {
return null;
}
const startPoint =
actionMeta.beforeSnapshot?.ball?.position ??
state.ball.startPosition ??
state.ball.position ??
ballPoint;
const targetPoint = actionMeta.target ?? state.ball.target ?? ballPoint;
if (!startPoint || !targetPoint) {
return null;
}
const carrier = getPlayerById(
actionMeta.beforeSnapshot?.ball?.ownerPlayerId ??
actionMeta.carrierPlayerId ??
state.ball.initiatorPlayerId ??
state.ball.ownerPlayerId
);
const receiver = getPlayerById(actionMeta.receiverPlayerId);
const secondLastX = getSecondLastOpponentLineX(attackingTeamId);
if (secondLastX === null) {
return null;
}
const attackSign = getAttackDirectionSign(attackingTeamId);
const ownGoal = getOwnGoalCenter(teamId);
const linePoint = { x: secondLastX, y: pitch.width / 2 };
const lineDepth = getAttackingDepth(linePoint, attackingTeamId);
const targetDepth = getAttackingDepth(targetPoint, attackingTeamId);
const startDepth = getAttackingDepth(startPoint, attackingTeamId);
const receiverPoint = receiver ? getPlayerBallControlPoint(receiver) : targetPoint;
const receiverDepth = getAttackingDepth(receiverPoint, attackingTeamId);
const forwardGain = (targetPoint.x - startPoint.x) * attackSign;
const passDistance = distance(startPoint, targetPoint);
const targetThreat = getPitchThreatProfile(targetPoint, attackingTeamId);
const actionSpace = getActionSpaceValue(startPoint, targetPoint, attackingTeamId);
const carrierPressure = carrier ? getPlayerPressureLoad(carrier, startPoint) : 0.5;
const laneClarity = carrier && actionType === "pass"
? computePassLaneClarity(carrier, targetPoint)
: 0.58;
const ballFromOwnGoal = getDistanceFromOwnGoal(teamId, targetPoint);
const backLineDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const receiverBeyondLine = (receiverPoint.x - secondLastX) * attackSign > -0.4;
const targetBehindLine = (targetPoint.x - secondLastX) * attackSign > -1.2;
const depthThreat =
actionType === "pass" &&
forwardGain >= 4.5 &&
passDistance >= 8 &&
(
targetBehindLine ||
receiverBeyondLine ||
targetThreat.behindLine >= 0.18 ||
actionSpace.lineBreakCount >= 1
);
const carrierCanPickPass =
carrierPressure <= 0.42 &&
laneClarity >= 0.56 &&
(targetThreat.behindLine >= 0.2 || actionSpace.value >= 0.36);
const trapCondition =
depthThreat &&
(profile.phaseKey === "highPress" || profile.phaseKey === "midBlock") &&
backLineDepth >= 20 &&
(
carrierPressure >= 0.54 ||
laneClarity <= 0.44 ||
(receiverBeyondLine && forwardGain <= 10)
);
const emergencyCover =
depthThreat &&
(
profile.phaseKey === "boxDefending" ||
ballFromOwnGoal <= 30 ||
carrierCanPickPass ||
targetThreat.box >= 0.16
);
if (!depthThreat && !(receiverBeyondLine && receiverDepth >= pitch.length / 2)) {
return null;
}
const mode =
emergencyCover
? "coverDrop"
: trapCondition
? (carrierPressure >= 0.62 || laneClarity <= 0.38 ? "stepTrap" : "holdLine")
: "holdLine";
return {
actionType,
attackingTeamId,
carrier,
receiver,
startPoint: cloneVector(startPoint),
targetPoint: cloneVector(targetPoint),
receiverPoint: cloneVector(receiverPoint),
linePoint,
secondLastX,
ownGoal,
attackSign,
lineDepth,
startDepth,
targetDepth,
receiverDepth,
forwardGain,
passDistance,
targetThreat,
actionSpace,
carrierPressure,
laneClarity,
ballFromOwnGoal,
backLineDepth,
receiverBeyondLine,
targetBehindLine,
depthThreat,
carrierCanPickPass,
trapCondition,
emergencyCover,
mode,
};
}
function enforceDefensiveOffsideLineControl(
teamId,
targets,
groups,
ballPoint,
profile,
hardFixedIds = new Set(),
softFixedIds = new Set()
) {
const context = getDefensiveOffsideLineControlContext(teamId, ballPoint, profile);
if (!context) {
return [];
}
const backPlayers = (groups.back ?? [])
.filter((player) => !isGoalkeeper(player) && targets.has(player.id))
.sort((a, b) => (targets.get(a.id)?.y ?? a.position.y) - (targets.get(b.id)?.y ?? b.position.y));
if (!backPlayers.length) {
return [];
}
const sign = getDefendingDirectionSign(teamId);
const ownGoalX = teamId === "home" ? 0 : pitch.length;
const baseDepth = getDefensiveLineDistanceFromOwnGoal(teamId, "back", ballPoint, profile);
const lineDepthFromOwnGoal = getDistanceFromOwnGoal(teamId, context.linePoint);
const desiredDepth =
context.mode === "coverDrop"
? clamp(baseDepth - (profile.phaseKey === "boxDefending" ? 1.2 : 2.4), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal)
: context.mode === "stepTrap"
? clamp(Math.max(baseDepth, lineDepthFromOwnGoal + 0.8), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal)
: clamp(lerp(baseDepth, lineDepthFromOwnGoal, 0.5), profile.minBackLineFromOwnGoal ?? 6, profile.maxBackLineFromOwnGoal);
const unitGap = clamp(
getDefensiveUnitGap(profile, "back"),
profile.phaseKey === "highPress" ? 8.4 : 7.6,
profile.phaseKey === "highPress" ? 10.6 : 9.2
);
const lineWidth = unitGap * Math.max(0, backPlayers.length - 1);
const sideSign =
getWideSideSign(context.receiverPoint) ||
getWideSideSign(context.targetPoint) ||
getWideSideSign(ballPoint) ||
1;
const centerY = clamp(
lerp(pitch.width / 2, context.receiverPoint.y, context.mode === "coverDrop" ? 0.28 : 0.18),
Math.max(4, lineWidth / 2 + 3),
pitch.width - Math.max(4, lineWidth / 2 + 3)
);
const weightBase =
context.mode === "stepTrap"
? 0.72
: context.mode === "holdLine"
? 0.6
: 0.46;
const labels = [];
let adjusted = false;
backPlayers.forEach((player, index) => {
if (hardFixedIds.has(player.id)) {
return;
}
const spreadRatio = backPlayers.length === 1 ? 0.5 : index / (backPlayers.length - 1);
const slotY = clamp(centerY - lineWidth / 2 + lineWidth * spreadRatio, 3.4, pitch.width - 3.4);
const ballSideCover =
context.mode === "coverDrop" &&
Math.sign(slotY - pitch.width / 2) === sideSign
? (context.receiverPoint.y - slotY) * 0.16
: 0;
const currentTarget = targets.get(player.id) ?? player.position;
const weight = softFixedIds.has(player.id) ? weightBase * 0.5 : weightBase;
const lineTarget = clampToPitch({
x: ownGoalX + sign * desiredDepth,
y: clamp(slotY + ballSideCover, 3.4, pitch.width - 3.4),
}, 2.2);
const nextTarget = clampToPitch({
x: lerp(currentTarget.x, lineTarget.x, weight),
y: lerp(currentTarget.y, lineTarget.y, weight),
}, 2.2);
if (distance(currentTarget, nextTarget) > 0.08) {
adjusted = true;
}
targets.set(player.id, nextTarget);
});
if (adjusted) {
labels.push(
context.mode === "coverDrop"
? "Offside line: cover depth"
: context.mode === "stepTrap"
? "Offside line: step together"
: "Offside line: hold shoulder"
);
}
return labels;
}
function applyOffensiveAutopilotForCurrentAction(options = {}) {
if (!state.offensiveAutopilot || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return false;
}
const possessionTeamId = getPlannedPossessionTeamId();
if (!possessionTeamId) {
return false;
}
const ballPoint = cloneVector(state.ball.target ?? state.draftStep?.target ?? state.ball.position);
if (state.restartPhase?.type === "kickoff") {
const profile = getOffensiveAutopilotProfile(possessionTeamId, ballPoint, "setPiece");
if (state.draftStep) {
state.draftStep.offensiveAutopilot = {
teamId: possessionTeamId,
ballFocusPoint: cloneVector(ballPoint),
runnerPlayerId: null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
};
}
return false;
}
const { targets, runner, profile, principle } = buildOffensiveAutopilotTargets(possessionTeamId, ballPoint);
let movedPlayers = 0;
let autoV2RelationshipLabels = [];
const autoV2DecisionTriggers = scanAutoV2DecisionTriggers(
possessionTeamId,
ballPoint,
state.draftStep,
profile
);
if (state.draftStep) {
state.draftStep.offensiveAutopilot = {
teamId: possessionTeamId,
ballFocusPoint: cloneVector(ballPoint),
runnerPlayerId: runner?.id ?? null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
principleKey: principle?.key ?? null,
principleLabel: principle?.label ?? null,
triggers: autoV2DecisionTriggers,
};
}
const plannedPositions = new Map();
const attackingPlayers = state.players.filter((player) => player.team === possessionTeamId);
attackingPlayers.forEach((player) => {
if (player.team !== possessionTeamId) {
return;
}
const target = targets.get(player.id);
if (!target) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const origin = getActionOrigin(player);
const reachableTarget = clampToPitch(
clampToCircle(target, origin, getEditableRadius(player)),
2
);
plannedPositions.set(player.id, reachableTarget);
});
autoV2RelationshipLabels = applyOffensiveAutoV2RelationshipLayer(
possessionTeamId,
plannedPositions,
profile,
ballPoint,
state.draftStep,
runner ?? null
);
const offensiveIntents = buildOffensiveAutoV2Intents(
possessionTeamId,
attackingPlayers,
plannedPositions,
profile,
ballPoint,
state.draftStep,
runner?.id ?? null
);
if (state.draftStep?.offensiveAutopilot) {
state.draftStep.offensiveAutopilot.behaviorVersion = "v2";
state.draftStep.offensiveAutopilot.triggers = autoV2DecisionTriggers;
state.draftStep.offensiveAutopilot.intents = offensiveIntents;
const autoV2PrincipleLabel = uniquePrincipleLabels([
principle?.label,
...(autoV2RelationshipLabels ?? []),
]).join("; ");
state.draftStep.offensiveAutopilot.principleLabel = autoV2PrincipleLabel || (principle?.label ?? null);
}
attackingPlayers.forEach((player) => {
const reachableTarget = plannedPositions.get(player.id);
if (!reachableTarget) {
return;
}
const previousPosition = cloneVector(player.position);
if (distance(previousPosition, reachableTarget) > 0.03) {
movedPlayers += 1;
}
player.position = reachableTarget;
if (distance(previousPosition, reachableTarget) > 0.04) {
rotatePlayerBodyAlongMovement(player, previousPosition, reachableTarget, 0.72);
}
rotatePlayerBodyToward(player, ballPoint, runner?.id === player.id ? 0.38 : 0.52);
});
if (movedPlayers > 0 && !options.silent) {
const runnerText = runner ? ` ${getPlayerMagnetLabel(runner)} attacks depth.` : "";
const principleText = principle ? ` ${principle.label}.` : "";
const relationshipText = autoV2RelationshipLabels?.length ? ` ${autoV2RelationshipLabels.join("; ")}.` : "";
logEvent(
`Offensive autopilot shaped ${teams[possessionTeamId].name} into ${profile.phaseLabel.toLowerCase()} support from ${teams[possessionTeamId].formation} / ${profile.styleLabel}: ${profile.principleLabel}.${runnerText}${principleText}${relationshipText}`
);
}
return movedPlayers > 0;
}
function getDefensiveAutopilotGroupsForTeam(teamId, phaseKey, players = state.players) {
const formation = teams[teamId]?.formation ?? "4-3-3";
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
players
.filter((player) => player.team === teamId)
.forEach((player) => {
groups[getDefensiveAutopilotLineKey(player, formation, phaseKey)].push(player);
});
Object.values(groups).forEach((group) => {
group.sort((a, b) => (baseYById.get(a.id) ?? a.position.y) - (baseYById.get(b.id) ?? b.position.y));
});
return groups;
}
function applyReachableDefensiveLineCohesion(
teamId,
plannedPositions,
profile,
ballPoint,
presserId = null
) {
if (!ballPoint || !profile || profile.phaseKey === "highPress" || profile.phaseKey === "setPiece") {
return;
}
const groups = getDefensiveAutopilotGroupsForTeam(teamId, profile.phaseKey);
const phaseWeights = {
boxDefending: {
center: 0.84,
depth: 0.8,
slot: 0.88,
forwardSlot: 0.56,
},
lowBlock: {
center: 0.78,
depth: 0.72,
slot: 0.84,
forwardSlot: 0.52,
},
midBlock: {
center: 0.48,
depth: 0.42,
slot: 0.54,
forwardSlot: 0.34,
},
};
const weights = phaseWeights[profile.phaseKey] ?? phaseWeights.midBlock;
["back", "midfield", "forward"].forEach((lineKey) => {
const settings = getDefensiveCompactLineIntegritySettings(profile, lineKey);
if (!settings) {
return;
}
const linePlayers = (groups[lineKey] ?? []).filter(
(player) => !isGoalkeeper(player) && plannedPositions.has(player.id)
);
if (linePlayers.length < 2) {
return;
}
const currentPositions = linePlayers.map((player) => plannedPositions.get(player.id));
const currentCenterY =
currentPositions.reduce((total, point) => total + point.y, 0) / currentPositions.length;
const currentLineX =
currentPositions.reduce((total, point) => total + point.x, 0) / currentPositions.length;
const lineWidth = settings.gap * (linePlayers.length - 1);
const desiredCenterY = getDefensiveLineCenterY(lineKey, profile, ballPoint, lineWidth);
const desiredLineX = getDefensiveLineX(teamId, lineKey, ballPoint, profile);
const cohesiveCenterY = lerp(currentCenterY, desiredCenterY, weights.center);
const cohesiveLineX = lerp(currentLineX, desiredLineX, weights.depth);
const slotWeight = lineKey === "forward" ? weights.forwardSlot : weights.slot;
linePlayers.forEach((player, index) => {
const currentPosition = plannedPositions.get(player.id);
const lineSlot = clampToPitch({
x: cohesiveLineX,
y: clamp(cohesiveCenterY - lineWidth / 2 + settings.gap * index, 3.1, pitch.width - 3.1),
}, 2.2);
const isPresser = presserId && player.id === presserId;
const playerSlotWeight = isPresser ? slotWeight * settings.presserScale : slotWeight;
const cohesiveTarget = clampToPitch({
x: lerp(currentPosition.x, lineSlot.x, playerSlotWeight),
y: lerp(currentPosition.y, lineSlot.y, playerSlotWeight),
}, 2.2);
const origin = getActionOrigin(player);
const reachableCohesiveTarget = clampToPitch(
clampToCircle(cohesiveTarget, origin, getEditableRadius(player)),
2
);
plannedPositions.set(player.id, reachableCohesiveTarget);
});
});
}
function applyDefensiveAutopilotForCurrentAction(options = {}) {
if (!state.defensiveAutopilot || !hasBallAction() || state.isRunning || state.sequence.isPlaying) {
return false;
}
const possessionTeamId = getPlannedPossessionTeamId();
const defensiveTeamId = getOtherTeamId(possessionTeamId);
if (!defensiveTeamId) {
return false;
}
const ballPoint = cloneVector(state.ball.target ?? state.draftStep?.target ?? state.ball.position);
const { targets, presser, profile, protectionLabels, focusPoint } = buildDefensiveAutopilotTargets(defensiveTeamId, ballPoint);
const orientationPoint = focusPoint ?? ballPoint;
let movedPlayers = 0;
let autoV2RelationshipLabels = [];
if (state.draftStep) {
state.draftStep.defensiveAutopilot = {
teamId: defensiveTeamId,
ballFocusPoint: cloneVector(orientationPoint),
presserPlayerId: presser?.id ?? null,
phaseKey: profile.phaseKey,
phaseLabel: profile.phaseLabel,
protectionLabels: protectionLabels ?? [],
};
}
const plannedPositions = new Map();
const defensivePlayers = state.players.filter((player) => player.team === defensiveTeamId);
defensivePlayers.forEach((player) => {
const target = targets.get(player.id);
if (!target) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const origin = getActionOrigin(player);
plannedPositions.set(
player.id,
clampToPitch(clampToCircle(target, origin, getEditableRadius(player)), 2)
);
});
applyReachableDefensiveLineCohesion(
defensiveTeamId,
plannedPositions,
profile,
ballPoint,
presser?.id ?? null
);
autoV2RelationshipLabels = applyDefensiveAutoV2RelationshipLayer(
defensiveTeamId,
plannedPositions,
profile,
ballPoint,
presser ?? null
);
const defensiveIntents = buildDefensiveAutoV2Intents(
defensiveTeamId,
defensivePlayers,
plannedPositions,
profile,
presser?.id ?? null
);
if (state.draftStep?.defensiveAutopilot) {
state.draftStep.defensiveAutopilot.behaviorVersion = "v2";
state.draftStep.defensiveAutopilot.intents = defensiveIntents;
state.draftStep.defensiveAutopilot.protectionLabels = uniquePrincipleLabels([
...(protectionLabels ?? []),
...(autoV2RelationshipLabels ?? []),
]);
}
defensivePlayers.forEach((player) => {
if (player.team !== defensiveTeamId) {
return;
}
const reachableTarget = plannedPositions.get(player.id);
if (!reachableTarget) {
return;
}
if (!player.actionOrigin) {
player.actionOrigin = cloneVector(player.position);
}
const previousPosition = cloneVector(player.position);
if (distance(previousPosition, reachableTarget) > 0.03) {
movedPlayers += 1;
}
player.position = reachableTarget;
if (distance(previousPosition, reachableTarget) > 0.04) {
rotatePlayerBodyAlongMovement(player, previousPosition, reachableTarget, 0.76);
}
rotatePlayerBodyToward(player, orientationPoint, presser?.id === player.id ? 0.62 : 0.42);
});
if (movedPlayers > 0 && !options.silent) {
const presserText = presser ? ` ${getPlayerMagnetLabel(presser)} starts the pressure.` : "";
const protectionText = protectionLabels?.length ? ` ${protectionLabels.join("; ")}.` : "";
const relationshipText = autoV2RelationshipLabels?.length ? ` ${autoV2RelationshipLabels.join("; ")}.` : "";
logEvent(
`Defensive autopilot shaped ${teams[defensiveTeamId].name} into a compact ${profile.phaseLabel.toLowerCase()} from ${teams[defensiveTeamId].formation} / ${profile.styleLabel}.${presserText}${protectionText}${relationshipText}`
);
}
return movedPlayers > 0;
}
function applyAutopilotsForCurrentAction(options = {}) {
const offensiveApplied = applyOffensiveAutopilotForCurrentAction(options);
const defensiveApplied = applyDefensiveAutopilotForCurrentAction(options);
return offensiveApplied || defensiveApplied;
}

  return {
    getDefensiveAutopilotFocusPoint,
    getOffensiveAutopilotFocusPoint,
    isDefensiveAutopilotPlayer,
    isOffensiveAutopilotPlayer,
    isDefensiveDribblePresser,
    getLiveDefensiveDribblePressTarget,
    cloneDefensiveAutopilotIntents,
    getDefensiveAutoV2Intent,
    buildDefensiveAutoV2Intents,
    setReachableDefensiveAutoV2Target,
    applyDefensiveAutoV2BackLineRelationship,
    applyDefensiveAutoV2MidfieldPressCover,
    applyDefensiveAutoV2PressTether,
    applyDefensiveAutoV2AntiMagnetRelationships,
    applyDefensiveAutoV2RelationshipLayer,
    getDefensiveAutoV2FrameDt,
    moveDefensiveAutoV2Player,
    alignArrivedDefensiveAutopilotPlayers,
    completeLiveActionPlayersBeforeCommit,
    getActionSpeed,
    configureBallTravelProfile,
    getActionDistance,
    getRequestedActionMode,
    computeReachDistance,
    computeTimeToCoverDistance,
    shouldUseCurvedRecoveryRun,
    getCurvedRecoveryWaypoint,
    shouldUseOffBallCounterMovementRun,
    getOffBallCounterMovementWaypoint,
    buildMovementPath,
    getMovementPathPoint,
    getSnapshotPlayerMap,
    getRecordedStepEndSnapshot,
    getRecordedStepDuration,
    snapshotsMatch,
    createTransitionPlan,
    clampToCircle,
    getEditableRadius,
    getOtherTeamId,
    getPlannedPossessionTeamId,
    getDefendingDirectionSign,
    getDepthX,
    getDistanceFromOwnGoal,
    getOffensivePhaseKey,
    getOffensiveAutopilotProfile,
    getOffensiveRoleKey,
    getPitchLaneKey,
    getPitchLaneIndex,
    getAttackingThirdKey,
    getLaneCenterY,
    getSideLaneKeys,
    getRecentPossessionSteps,
    getRecordedStepPossessionTeamId,
    getPossessionRhythmContext,
    getLaneForSideSign,
    getWideOverlapPrincipleFit,
    getWideOverlapRunTarget,
    cloneOffensiveAutopilotIntents,
    cloneAutoV2DecisionTriggers,
    scanAutoV2DecisionTriggers,
    weightOffensiveAutoV2Intent,
    getOffensiveAutoV2Intent,
    setReachableOffensiveAutoV2Target,
    pickOffensiveAutoV2Player,
    applyOffensiveAutoV2RelationshipLayer,
    buildOffensiveAutoV2Intents,
    moveOffensiveAutoV2Player,
    getDefensivePhaseKey,
    getDefensiveAutopilotLineKey,
    getDefensiveAutopilotProfile,
    getDefensiveLineActionAdjustment,
    getDefensiveLineDistanceFromOwnGoal,
    getDefensiveLineX,
    getDefensiveLineWidth,
    getDefensiveLineCenterY,
    enforceDefensiveUnitCompactness,
    getDefensiveUnitGap,
    enforceDefensiveBlockGeometryLock,
    enforceDefensiveLineStaggering,
    enforceDefensiveLineChainSpacing,
    enforceDefensiveVerticalBlockConnections,
    enforceDefensiveMeasuredBlockEnvelope,
    enforceDefensiveCollectiveShiftCohesion,
    getDefensiveCompactLineIntegritySettings,
    enforceDefensiveCompactLineIntegrity,
    getDefensiveOffsideLineControlContext,
    enforceDefensiveOffsideLineControl,
    applyOffensiveAutopilotForCurrentAction,
    getDefensiveAutopilotGroupsForTeam,
    applyReachableDefensiveLineCohesion,
    applyDefensiveAutopilotForCurrentAction,
    applyAutopilotsForCurrentAction,
  };
}
