import { createGameSimulatorCanvasRenderer } from "./canvas-renderer.mjs";
import { createGameSimulatorPointerController } from "./pointer-controller.mjs";
import { createGameSimulatorAppRuntimeSequenceAdapter } from "./app-runtime-sequence-adapter.mjs";
import { createGameSimulatorSequenceEngine } from "./sequence-engine.mjs";

function noop() {}

function createStateProxy(getAppState) {
  return new Proxy({}, {
    get(_target, property) {
      return getAppState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getAppState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getAppState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getAppState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Object.getOwnPropertyDescriptor(getAppState?.() ?? {}, property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    deleteProperty(_target, property) {
      const currentState = getAppState?.();
      if (currentState && property in currentState) {
        delete currentState[property];
      }
      return true;
    },
  });
}

export function createGameSimulatorAppRuntimeController(deps = {}) {
  const {
    applyAutopilotsForCurrentAction = noop,
    applyBallExecutionProfile = noop,
    applyKickoffSetup = noop,
    applyNearbyBallOrientation = noop,
    applyPhysicalProfileToPlayers = noop,
    applyDefensiveAutopilotForCurrentAction = noop,
    applyOffensiveAutopilotForCurrentAction = noop,
    applyResolvedBallProfile = noop,
    attackStylePresets = {},
    ballRadiusMeters = 0,
    buildPlayerIntelligenceProfile = noop,
    buildPlayerSprintProfile = noop,
    buildPlayerTendencyProfile = noop,
    canEditGameSimulatorWorkspace = () => false,
    cancelAutoPilotContinuation = noop,
    canvas,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    clampToCircle = noop,
    clampToPitch = (point) => point,
    clearAutoPilotReceiveMomentum = noop,
    clearBallAction = noop,
    clearSecurePossession = noop,
    cloneAutoV2DecisionTriggers = noop,
    cloneDefensiveAutopilotIntents = noop,
    cloneGoalEvent = noop,
    cloneOffensiveAutopilotIntents = noop,
    cloneSecurePossession = noop,
    cloneShotPlacement = noop,
    cloneVector = (point) => ({ x: point?.x ?? 0, y: point?.y ?? 0 }),
    competitionPhysicalProfiles = {},
    computeReachDistance = noop,
    configureBallTravelProfile = noop,
    createInitialState = noop,
    createPlayer = noop,
    createTransitionPlan = noop,
    ctx,
    defaultKickoffTeamId = "home",
    defaultPhysicalProfileKey = "professional",
    defaultScenarioInfo = {},
    defaultTeamIdentities = {},
    defenseStylePresets = {},
    describeStep = noop,
    distance = noop,
    documentRef = globalThis.document,
    formatSpeed = (value) => `${Number(value || 0).toFixed(1)} m/s`,
    gameSimulatorSidebarRenderer,
    getActionOrigin = noop,
    getActionSpeed = noop,
    getEditableRadius = noop,
    getGoalDirectionSign = noop,
    getHubState = () => null,
    getPlayerBallControlPoint = noop,
    getPlayerFacingAngle = noop,
    getPlayerMagnetLabel = noop,
    getProjectedActionDuration = noop,
    getRecordedStepEndSnapshot = noop,
    getRequestedActionMode = noop,
    getSequenceFrameSnapshot = noop,
    getState = () => ({}),
    hasBallAction = () => false,
    issueBallCommand = noop,
    issuePassCommand = noop,
    lerp = noop,
    normalize = noop,
    pauseAutoPilotPlay = noop,
    pitch = {},
    planAutoPilotNextAction = noop,
    platformModuleLoader,
    playerRadiusMeters = 0,
    playerTendencyTemplates = {},
    refreshPlannedBallActionProfile = noop,
    renderWorkspaceChrome = noop,
    resolveExecutedShotTarget = noop,
    resolveRecordedStepProfile = noop,
    rotatePlayerBodyAlongMovement = noop,
    sequenceLibraryStorageKey = "football-simulator-sequence-library-v2",
    sequenceStorageKey = "football-simulator-sequence-v1",
    setBallOwner = noop,
    setDribbleCarryPathForBall = noop,
    setState = noop,
    setTeamFormationOnPlayers = noop,
    snapshotsMatch = noop,
    squadBlueprints = {},
    stepSimulation = noop,
    subtract = noop,
    teamRosterOrder = {},
    teams = {},
    ui = {},
    vec = (x, y) => ({ x, y }),
    win = globalThis,
  } = deps;
  const document = documentRef;
  const getAppState = typeof getState === "function" ? getState : () => ({});
  const setAppState = typeof setState === "function" ? setState : noop;
  const state = createStateProxy(getAppState);
  let lastFrame = null;
  let simulatorAnimationRuntime = null;
  let simulatorAnimationRuntimePromise = null;
  let simulatorAnimationLoopRequested = false;
  let gameSimulatorControllersPromise = null;
  let gameSimulatorFullscreenController = null;
  let gameSimulatorKeyboardState = null;
  let gameSimulatorWorkspaceController = null;
  let activeMetricTooltipTarget = null;
  let pinnedMetricTooltipTarget = null;

function isPitchFullscreenActive() { return gameSimulatorFullscreenController?.isActive() ?? false; }
function syncPitchFullscreenButton() { gameSimulatorFullscreenController?.syncButton(); }
function updatePitchFullscreenHudLayout() { gameSimulatorFullscreenController?.updateHudLayout(); }
async function togglePitchFullscreen() {
await ensureGameSimulatorControllers();
await gameSimulatorFullscreenController?.toggle();
}
function hasUnsavedSimulatorWork() {
return Boolean(
state.simulatorDirty ||
state.sequence.dirty ||
state.draftStep ||
state.actionMode !== null ||
(hasBallAction() && !state.sequence.isPlaying)
);
}
function resetUnsavedSimulatorSession() {
cancelAutoPilotContinuation();
cancelSequenceAdvance();
if (document.fullscreenElement === ui.pitchStage) {
document.exitFullscreen().catch(() => {});
}
if (state.autoPilotPlay) {
state.autoPilotPlay.active = false;
state.autoPilotPlay.possessionPlan = null;
state.autoPilotPlay.receiveMomentum = null;
}
state.isRunning = false;
state.drag = null;
state.actionMode = null;
state.keyboardActionMode = null;
state.keyboardActionGraceMode = null;
state.keyboardActionGraceUntil = 0;
state.goalFlash = null;
state.sequence.isPlaying = false;
state.sequence.playbackIndex = -1;
state.sequence.currentFrameIndex = -1;
state.sequence.phase = null;
state.sequence.transition = null;
state.sequence.actionTargets = null;
state.sequence.initialSnapshot = null;
state.sequence.steps = [];
state.sequence.dirty = false;
state.example = null;
state.scenario = { ...defaultScenarioInfo };
state.draftStep = null;
state.activeActionTargets = null;
clearBallAction();
applyKickoffSetup(state, {
teamId: defaultKickoffTeamId,
resetFormations: true,
});
state.time = 0;
state.simulatorDirty = false;
ui.playPauseButton.textContent = "Start";
updateModeButtons();
syncDefensiveAutopilotButton();
syncOffensiveAutopilotButton();
syncAutoV2DebugButton();
updateSequenceButtons();
logEvent("Unsaved simulator session closed. New simulator session starts with a kick-off.");
}
function isSimulatorIntroActive() {
return gameSimulatorWorkspaceController?.isIntroActive() ??
Boolean(isGameSimulatorWorkspaceActive() && ui.gameSimulatorWorkspace?.classList.contains("is-simulator-intro"));
}
function resetGameSimulatorIntro() {
if (gameSimulatorWorkspaceController) return gameSimulatorWorkspaceController.resetIntro();
ui.gameSimulatorWorkspace?.classList.add("is-simulator-intro");
ui.gameSimulatorWorkspace?.classList.remove("is-simulator-launched");
}
function syncGameSimulatorIntroState() {
if (gameSimulatorWorkspaceController) return gameSimulatorWorkspaceController.syncIntroState();
const workspace = ui.gameSimulatorWorkspace;
if (isGameSimulatorWorkspaceActive() && workspace && !workspace.classList.contains("is-simulator-launched")) {
workspace.classList.add("is-simulator-intro");
}
}
async function launchGameSimulatorFromIntro() {
await ensureGameSimulatorControllers();
await gameSimulatorWorkspaceController?.launchFromIntro();
}
function pauseSimulatorForWorkspaceSwitch() {
const shouldResetUnsavedSession = hasUnsavedSimulatorWork();
cancelAutoPilotContinuation();
if (state.autoPilotPlay) {
state.autoPilotPlay.active = false;
}
if (state.sequence.isPlaying) {
stopSequencePlayback(false);
}
if (state.isRunning) {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
}
if (state.keyboardActionMode !== null) {
setKeyboardActionMode(null);
}
if (shouldResetUnsavedSession) {
resetUnsavedSimulatorSession();
}
if (document.fullscreenElement === ui.pitchStage) {
document.exitFullscreen?.().catch(() => {});
}
}

function canEditScenario() { return canEditGameSimulatorWorkspace() && !state.isRunning && !state.sequence.isPlaying; }
function applyTeamFormation(teamId, formation) {
teams[teamId].formation = formation;
setTeamFormationOnPlayers(state.players, teamId, formation);
applyPhysicalProfileToPlayers(state.players, state.physicalProfile);
if (state.ball.ownerPlayerId && teamRosterOrder[teamId].includes(state.ball.ownerPlayerId) && !hasBallAction()) {
const owner = getBallOwner();
if (owner) {
const controlPoint = getPlayerBallControlPoint(owner);
state.ball.position = cloneVector(controlPoint);
state.ball.startPosition = cloneVector(controlPoint);
state.ball.target = cloneVector(controlPoint);
}
}
}
function getScaleX() { return canvas.width / pitch.length; }
function getScaleY() { return canvas.height / pitch.width; }
function getMetersToPixels() { return getScaleX(); }
function toCanvas(point) {
return {
x: point.x * getScaleX(),
y: point.y * getScaleY(),
};
}
function eventToPitch(event) {
const rect = canvas.getBoundingClientRect();
return clampToPitch(
vec(
((event.clientX - rect.left) / rect.width) * pitch.length,
((event.clientY - rect.top) / rect.height) * pitch.width
),
0
);
}
function logEvent(message) {
if (state.eventLog[state.eventLog.length - 1] !== message) {
state.eventLog.push(message);
if (state.eventLog.length > 18) {
state.eventLog = state.eventLog.slice(-18);
}
}
}
function getPlayerById(playerId) { return state.players.find((player) => player.id === playerId) ?? null; }
function normalizeSelectedPlayerIds(playerIds = [], fallbackId = null) {
const seen = new Set();
const normalized = [];
playerIds.forEach((playerId) => {
if (!playerId || seen.has(playerId) || !getPlayerById(playerId)) {
return;
}
seen.add(playerId);
normalized.push(playerId);
});
if (!normalized.length && fallbackId && getPlayerById(fallbackId)) {
normalized.push(fallbackId);
}
return normalized;
}
function getSelectedPlayerIds() { return normalizeSelectedPlayerIds(state.selectedPlayerIds, state.selectedPlayerId); }
function setSelectedPlayers(playerIds, primaryId = null) {
const normalized = normalizeSelectedPlayerIds(playerIds, primaryId ?? state.selectedPlayerId);
const nextPrimary =
(primaryId && normalized.includes(primaryId) ? primaryId : null) ??
normalized[0] ??
null;
state.selectedPlayerIds = normalized;
state.selectedPlayerId = nextPrimary;
}
function setSingleSelectedPlayer(playerId) { setSelectedPlayers([playerId], playerId); }
function clearSelectedPlayers() {
state.selectedPlayerIds = [];
state.selectedPlayerId = null;
}
function toggleSelectedPlayer(playerId) {
const selectedIds = getSelectedPlayerIds();
if (selectedIds.includes(playerId)) {
if (selectedIds.length === 1) {
setSingleSelectedPlayer(playerId);
return;
}
const nextIds = selectedIds.filter((id) => id !== playerId);
const nextPrimary = state.selectedPlayerId === playerId ? nextIds[0] : state.selectedPlayerId;
setSelectedPlayers(nextIds, nextPrimary);
return;
}
setSelectedPlayers([...selectedIds, playerId], state.selectedPlayerId ?? playerId);
}
function isPlayerSelected(playerId) { return getSelectedPlayerIds().includes(playerId); }
function getSelectionPreviewIds() {
if (state.drag?.type === "selection" && state.drag.moved && Array.isArray(state.drag.previewSelectedPlayerIds)) {
return state.drag.previewSelectedPlayerIds;
}
return null;
}
function getRenderedSelectedPlayerIds() { return getSelectionPreviewIds() ?? getSelectedPlayerIds(); }
function isPlayerRenderedSelected(playerId) { return getRenderedSelectedPlayerIds().includes(playerId); }
function getRenderedPrimarySelectedPlayerId() {
if (state.drag?.type === "selection" && state.drag.moved && state.drag.previewPrimaryPlayerId) {
return state.drag.previewPrimaryPlayerId;
}
return state.selectedPlayerId;
}
function isSelectionModifierActive(event) { return event.shiftKey || event.metaKey || event.ctrlKey; }
function getSelectedPlayer() { return getPlayerById(state.selectedPlayerId) ?? getPlayerById(getSelectedPlayerIds()[0]) ?? null; }
function getBallOwner() { return getPlayerById(state.ball.ownerPlayerId); }
function cloneTeamIdentity(identity) {
return {
attackStyle: identity?.attackStyle ?? "balanced",
defenseStyle: identity?.defenseStyle ?? "balanced-block",
};
}
function cloneTeamIdentities() {
return {
home: cloneTeamIdentity(teams.home.identity),
away: cloneTeamIdentity(teams.away.identity),
};
}
function cloneRestartPhase(restartPhase) {
if (!restartPhase) {
return null;
}
return {
type: restartPhase.type ?? null,
teamId: restartPhase.teamId ?? null,
label: restartPhase.label ?? null,
sideY: Number.isFinite(restartPhase.sideY) ? restartPhase.sideY : null,
point: restartPhase.point ? cloneVector(restartPhase.point) : null,
supportPlayerId: restartPhase.supportPlayerId ?? null,
openingKey: restartPhase.openingKey ?? null,
openingLabel: restartPhase.openingLabel ?? null,
};
}
function applyTeamIdentities(identitySnapshot = {}) {
["home", "away"].forEach((teamId) => {
const incoming = identitySnapshot[teamId] ?? teams[teamId].identity ?? {};
const defaults = defaultTeamIdentities[teamId] ?? {};
teams[teamId].identity = {
attackStyle: incoming.attackStyle ?? defaults.attackStyle ?? "balanced",
defenseStyle: incoming.defenseStyle ?? defaults.defenseStyle ?? "balanced-block",
};
});
}
function resetTeamIdentities() { applyTeamIdentities(defaultTeamIdentities); }
function getTeamAttackStyleKey(teamId) { return teams[teamId]?.identity?.attackStyle ?? defaultTeamIdentities[teamId]?.attackStyle ?? "balanced"; }
function getTeamDefenseStyleKey(teamId) { return teams[teamId]?.identity?.defenseStyle ?? defaultTeamIdentities[teamId]?.defenseStyle ?? "balanced-block"; }
function getTeamAttackStyleProfile(teamId) {
const styleKey = getTeamAttackStyleKey(teamId);
return attackStylePresets[styleKey] ?? attackStylePresets.balanced;
}
function getTeamDefenseStyleProfile(teamId) {
const styleKey = getTeamDefenseStyleKey(teamId);
return defenseStylePresets[styleKey] ?? defenseStylePresets["balanced-block"];
}
function getPlayerPressureLoad(player, referencePoint = player.position) {
const opponents = state.players.filter((candidate) => candidate.team !== player.team);
let pressure = 0;
opponents.forEach((opponent) => {
const gap = distance(referencePoint, opponent.position);
if (gap > 14) {
return;
}
const zoneWeight = gap <= 4 ? 1 : gap <= 8 ? 0.72 : 0.38;
pressure += (1 - gap / 14) * zoneWeight;
});
return clamp(pressure / 1.8, 0, 1);
}
function getNearestOpponentGap(player, referencePoint = player.position) {
if (!player || !referencePoint) {
return Infinity;
}
return state.players.reduce((nearestGap, candidate) => {
if (candidate.team === player.team) {
return nearestGap;
}
return Math.min(nearestGap, distance(referencePoint, candidate.position));
}, Infinity);
}
function getPlayerDecisionContext(player) {
const intelligenceProfile = player.intelligenceProfile ?? buildPlayerIntelligenceProfile(player);
const sprintProfile = player.sprintProfile ?? buildPlayerSprintProfile(player);
const pressure = getPlayerPressureLoad(player);
const anticipationReduction =
player.reactionTime * (0.06 + intelligenceProfile.decisionSpeed * 0.1);
const perceptionReduction =
player.reactionTime * (0.02 + intelligenceProfile.perception * 0.05);
const tacticalReduction =
hasBallAction()
? player.reactionTime * 0.03 * intelligenceProfile.tacticalDiscipline
: 0;
const pressurePenalty =
player.reactionTime *
pressure *
(0.05 + (1 - intelligenceProfile.composure) * 0.16);
const effectiveReactionTime = clamp(
player.reactionTime - anticipationReduction - perceptionReduction - tacticalReduction + pressurePenalty,
0.08,
player.reactionTime + 0.08
);
const effectiveAcceleration = Math.max(
0.01,
player.acceleration *
sprintProfile.accelerationFactor *
(1 - pressure * (0.02 + (1 - intelligenceProfile.pressResistance) * 0.08))
);
const effectiveMaxSpeed = Math.max(
0.01,
player.maxSpeed *
sprintProfile.maxSpeedFactor *
(1 - pressure * (0.015 + (1 - intelligenceProfile.composure) * 0.05))
);
return {
pressure,
profile: intelligenceProfile,
sprintProfile,
reactionTime: effectiveReactionTime,
acceleration: effectiveAcceleration,
maxSpeed: effectiveMaxSpeed,
};
}
var gameSimulatorSequenceEngine;
const gameSimulatorSequenceAdapter = createGameSimulatorAppRuntimeSequenceAdapter({
  getSequenceEngine: () => gameSimulatorSequenceEngine,
  sequenceLibraryStorageKey,
  win,
});
const {
  captureSnapshot,
  applySnapshot,
  cloneSnapshot,
  cloneSequenceStep,
  buildSnapshotFromFormations,
  withSnapshotOverrides,
  createLowBlockPressExample,
  loadLowBlockPressExample,
  cloneScenarioInfo,
  markSimulatorDirty,
  markSequenceDirty,
  markSimulatorSaved,
  readSavedSequenceLibrary,
  writeSavedSequenceLibrary,
  sanitizeFileName,
  goToSequenceFrame,
  cancelSequenceAdvance,
  stopSequencePlayback,
  finishSequencePlayback,
  queueNextSequenceStep,
  startRecordedAction,
  createCommittedSnapshotFromCurrentState,
  applyCommittedSnapshot,
  serializeSequence,
  loadSequenceData,
  saveSequenceToLocal,
  loadSequenceFromLocal,
  downloadSequence,
  createStepThumbnail,
  startSequenceStep,
  startSequencePlayback,
  getActiveExampleOverlay,
  getSavedSequenceById,
  loadSavedSequenceEntry,
  removeSavedSequenceEntry,
} = gameSimulatorSequenceAdapter;
gameSimulatorSequenceEngine = createGameSimulatorSequenceEngine({
  applyBallExecutionProfile: (...args) => applyBallExecutionProfile(...args),
  applyPhysicalProfileToPlayers: (...args) => applyPhysicalProfileToPlayers(...args),
  applyResolvedBallProfile: (...args) => applyResolvedBallProfile(...args),
  applyTeamIdentities: (...args) => applyTeamIdentities(...args),
  buildPlayerTendencyProfile: (...args) => buildPlayerTendencyProfile(...args),
  canEditScenario: (...args) => canEditScenario(...args),
  clamp,
  clearAutoPilotReceiveMomentum: (...args) => clearAutoPilotReceiveMomentum(...args),
  clearBallAction: (...args) => clearBallAction(...args),
  cloneAutoV2DecisionTriggers,
  cloneDefensiveAutopilotIntents,
  cloneGoalEvent,
  cloneOffensiveAutopilotIntents,
  cloneRestartPhase,
  cloneSecurePossession,
  cloneShotPlacement,
  cloneTeamIdentities,
  cloneTeamIdentity,
  cloneVector,
  competitionPhysicalProfiles,
  configureBallTravelProfile: (...args) => configureBallTravelProfile(...args),
  createInitialState,
  createPlayer: (...args) => createPlayer(...args),
  createTransitionPlan: (...args) => createTransitionPlan(...args),
  defaultScenarioInfo,
  describeStep: (...args) => describeStep(...args),
  distance,
  getActionSpeed: (...args) => getActionSpeed(...args),
  getPlayerById: (...args) => getPlayerById(...args),
  getPlayerFacingAngle,
  getRecordedStepEndSnapshot: (...args) => getRecordedStepEndSnapshot(...args),
  getSelectedPlayerIds: (...args) => getSelectedPlayerIds(...args),
  getSequenceFrameSnapshot: (...args) => getSequenceFrameSnapshot(...args),
  hasBallAction: (...args) => hasBallAction(...args),
  logEvent,
  persistCurrentFrameSnapshot: (...args) => persistCurrentFrameSnapshot(...args),
  pitch,
  playerTendencyTemplates,
  resolveRecordedStepProfile: (...args) => resolveRecordedStepProfile(...args),
  setDribbleCarryPathForBall: (...args) => setDribbleCarryPathForBall(...args),
  setLastFrame: (nextLastFrame) => { lastFrame = nextLastFrame; },
  setSelectedPlayers: (...args) => setSelectedPlayers(...args),
  setState: setAppState,
  setTeamFormationOnPlayers: (...args) => setTeamFormationOnPlayers(...args),
  sequenceLibraryStorageKey,
  sequenceStorageKey,
  snapshotsMatch: (...args) => snapshotsMatch(...args),
  squadBlueprints,
  teams,
  ui,
  updateModeButtons: (...args) => updateModeButtons(...args),
  updateSequenceButtons: (...args) => updateSequenceButtons(...args),
  vec,
  win,
  getState: getAppState,
});
const gameSimulatorCanvasRenderer = createGameSimulatorCanvasRenderer({
  ballRadiusMeters,
  canvas,
  clamp,
  cloneVector,
  computeReachDistance,
  ctx,
  gameSimulatorSidebarRenderer,
  getActionOrigin,
  getActiveExampleOverlay,
  getBallOwner,
  getGoalDirectionSign,
  getMetersToPixels,
  getPlayerBallControlPoint,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getProjectedActionDuration,
  getRenderedPrimarySelectedPlayerId,
  hasBallAction,
  isPlayerRenderedSelected,
  lerp,
  normalize,
  pitch,
  playerRadiusMeters,
  syncBallSpeedControls,
  syncDefensiveAggressionControls,
  syncDefensiveAutopilotButton,
  syncDribbleSpeedControls,
  syncFirstTouchControls,
  syncFormationControls,
  syncOffensiveAutopilotButton,
  syncPhysicalProfileControls,
  syncSurfaceControls,
  syncTeamIdentityControls,
  syncWeatherControls,
  toCanvas,
  updatePitchFullscreenHudLayout,
  updateSequenceButtons,
  win,
  getState: getAppState,
});
function render() {   gameSimulatorCanvasRenderer.render(); }
win.renderGameSimulator = render;
const gameSimulatorPointerController = createGameSimulatorPointerController({
canvas,
getState: () => state,
playerRadiusMeters,
ballRadiusMeters,
pitch,
distance,
clamp,
cloneVector,
normalizeSelectedPlayerIds,
hasBallAction,
getPlayerById,
getPlayerBallControlPoint,
refreshPlannedBallActionProfile,
getPointerRequestedActionMode,
issuePassCommand,
issueBallCommand,
consumePointerActionMode,
clearBallAction,
logEvent,
isSelectionModifierActive,
toggleSelectedPlayer,
isPlayerSelected,
setSingleSelectedPlayer,
setSelectedPlayers,
getSelectedPlayerIds,
getActionOrigin,
getEditableRadius,
eventToPitch,
clampToPitch,
subtract,
clampToCircle,
rotatePlayerBodyAlongMovement,
clearSecurePossession,
markSimulatorDirty,
clearSelectedPlayers,
render,
});
function isGameSimulatorWorkspaceActive() { return getHubState()?.activeWorkspaceId === "game-simulator"; }
function shouldIgnoreSimulatorTextOrModifierTarget(event) { const t = event?.target, tag = t?.tagName; return Boolean(event?.metaKey || event?.ctrlKey || event?.altKey || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || t?.isContentEditable); }
async function ensureGameSimulatorControllers() {
if (gameSimulatorWorkspaceController) return;
if (!gameSimulatorControllersPromise) {
gameSimulatorControllersPromise = platformModuleLoader.loadModule("game-simulator.controllers", () =>
import("./controllers.mjs")
)
.then(({ createSimulatorControllers }) => {
const controllers = createSimulatorControllers({
windowRef: win, documentRef: document, bindButtonControls: false,
getStageElement: () => ui.pitchStage,
getCanvasElement: () => canvas,
getButtonElement: () => ui.pitchFullscreenButton,
getWorkspaceElement: () => ui.gameSimulatorWorkspace,
getIntroElement: () => ui.gameSimulatorIntro,
getPitchStageElement: () => ui.pitchStage,
getIsActiveWorkspace: () => isGameSimulatorWorkspaceActive(),
getOffensiveAutopilotEnabled: () => state.offensiveAutopilot,
getKeyboardActionMode: () => state.keyboardActionMode,
hasActiveMetricTooltip: () => Boolean(activeMetricTooltipTarget && !ui.metricTooltip?.hidden),
log: (message) => logEvent(message),
onActionModeChanged: () => { updateModeButtons(); render(); },
render,
renderWorkspaceChrome,
syncFullscreen: syncPitchFullscreenButton,
syncFullscreenButton: syncPitchFullscreenButton,
updateFullscreenHudLayout: updatePitchFullscreenHudLayout,
ensureMetricTooltipLayer,
positionMetricTooltip: () => positionMetricTooltip(activeMetricTooltipTarget),
resetIntro: resetGameSimulatorIntro,
toggleSpaceAutopilotPlayback,
executePlannedAction,
setKeyboardActionMode,
armKeyboardActionGrace,
clearKeyboardActionGrace,
requestAnimationFrame: (callback) => win.requestAnimationFrame(callback),
});
gameSimulatorFullscreenController = controllers.fullscreenController;
gameSimulatorKeyboardState = controllers.keyboardState; gameSimulatorWorkspaceController = controllers.workspaceController;
controllers.controlBindings.bind();
syncGameSimulatorIntroState();
syncPitchFullscreenButton();
updatePitchFullscreenHudLayout();
})
.catch((error) => {
gameSimulatorControllersPromise = null;
throw error;
});
}
return gameSimulatorControllersPromise;
}
function queueGameSimulatorControllersLoad() { ensureGameSimulatorControllers().catch(() => {}); }
function resetSimulatorAnimationClock() {
lastFrame = null;
}
async function getSimulatorAnimationRuntime() {
if (simulatorAnimationRuntime) {
return simulatorAnimationRuntime;
}
if (!simulatorAnimationRuntimePromise) {
simulatorAnimationRuntimePromise = platformModuleLoader.loadModule("game-simulator.runtime", () =>
import("./runtime.mjs")
)
.then(({ createSimulatorAnimationLoop }) => {
simulatorAnimationRuntime = createSimulatorAnimationLoop({
shouldRun: () => simulatorAnimationLoopRequested && isGameSimulatorWorkspaceActive(),
onFrame: animationFrame,
});
return simulatorAnimationRuntime;
})
.catch((error) => {
simulatorAnimationRuntimePromise = null;
console.error(error);
throw error;
});
}
return simulatorAnimationRuntimePromise;
}
function startSimulatorAnimationLoop() {
simulatorAnimationLoopRequested = true;
getSimulatorAnimationRuntime()
.then((runtime) => {
if (simulatorAnimationLoopRequested && isGameSimulatorWorkspaceActive()) {
runtime.start();
}
})
.catch(() => {});
}
function stopSimulatorAnimationLoop() {
simulatorAnimationLoopRequested = false;
simulatorAnimationRuntime?.stop();
resetSimulatorAnimationClock();
}
function animationFrame(timestamp) {
if (!isGameSimulatorWorkspaceActive()) {
resetSimulatorAnimationClock();
return;
}
if (lastFrame === null) {
lastFrame = timestamp;
}
const realDt = Math.min((timestamp - lastFrame) / 1000, 0.05);
lastFrame = timestamp;
if (state.isRunning) {
stepSimulation(realDt);
}
applyNearbyBallOrientation(realDt);
render();
}
function executePlannedAction() {
if (!isGameSimulatorWorkspaceActive()) {
return;
}
if (state.isRunning || state.sequence.isPlaying) {
return;
}
if (!hasBallAction()) {
logEvent("Set a new ball target before starting the action.");
render();
return;
}
if (state.draftStep?.beforeSnapshot && !state.activeActionTargets) {
const actionTargetSnapshot = captureSnapshot();
const resolvedProfile = resolveRecordedStepProfile(state.draftStep);
state.activeActionTargets = new Map(
actionTargetSnapshot.players.map((player) => [
player.id,
cloneVector(player.position),
])
);
applySnapshot(state.draftStep.beforeSnapshot);
setSelectedPlayers(
actionTargetSnapshot.selectedPlayerIds ?? [],
actionTargetSnapshot.selectedPlayerId ?? actionTargetSnapshot.selectedPlayerIds?.[0] ?? null
);
if (state.draftStep.actionType === "dribble") {
const carrier = getPlayerById(state.draftStep.carrierPlayerId);
state.dribbleSpeed = state.draftStep.speed;
ui.dribbleSpeed.value = String(state.draftStep.speed);
ui.dribbleSpeedLabel.textContent = `${state.draftStep.speed.toFixed(1)} m/s`;
applyResolvedBallProfile(resolvedProfile);
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.target = cloneVector(state.draftStep.target);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "dribble";
state.ball.initiatorPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.carrierPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.receiverPlayerId = null;
state.ball.ownerPlayerId = state.draftStep.carrierPlayerId ?? null;
applyBallExecutionProfile("dribble", carrier, state.draftStep.target, resolvedProfile);
configureBallTravelProfile(
"dribble",
distance(state.ball.startPosition, state.ball.target),
getActionSpeed(),
resolvedProfile
);
if (carrier) {
setDribbleCarryPathForBall(carrier, carrier.position, state.ball.target);
}
} else if (state.draftStep.actionType === "recovery") {
applyResolvedBallProfile(resolvedProfile);
state.ball.speed = state.draftStep.speed;
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.target = cloneVector(state.draftStep.target);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "recovery";
state.ball.initiatorPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.carrierPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.receiverPlayerId = null;
state.ball.ownerPlayerId = null;
state.ball.recoveryDuration = Math.max(state.draftStep.recoveryDuration ?? 0, 0.35);
state.ball.currentSpeed = 0;
state.ball.launchSpeed = 0;
state.ball.finalSpeed = 0;
state.ball.deceleration = 0;
state.ball.trackDistanceTotal = 0;
state.ball.trackDistanceCovered = 0;
} else {
const initiator = getPlayerById(state.draftStep.beforeSnapshot.ball.ownerPlayerId);
state.ballSpeedMode = state.draftStep.speedMode ?? state.ballSpeedMode;
state.ball.speed = state.draftStep.speed;
if (state.draftStep.speedMode === "manual") {
state.ball.manualSpeed = state.draftStep.speed;
}
applyResolvedBallProfile(resolvedProfile);
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
const intendedTarget = cloneVector(state.draftStep.target);
state.ball.target = cloneVector(intendedTarget);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = state.draftStep.actionType;
state.ball.initiatorPlayerId = state.draftStep.beforeSnapshot.ball.ownerPlayerId ?? null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = state.draftStep.receiverPlayerId ?? null;
state.ball.firstTouchMode = state.draftStep.firstTouchMode ?? "auto";
state.ball.ownerPlayerId = null;
applyBallExecutionProfile(state.draftStep.actionType, initiator, intendedTarget, resolvedProfile);
if (state.draftStep.actionType === "shot") {
const executedTarget = resolveExecutedShotTarget(initiator, intendedTarget, resolvedProfile) ?? intendedTarget;
state.ball.target = cloneVector(executedTarget);
state.draftStep.intendedTarget = cloneVector(intendedTarget);
state.draftStep.target = cloneVector(executedTarget);
state.draftStep.shotPlacement = cloneShotPlacement(state.ball.shotPlacement);
}
configureBallTravelProfile(
state.draftStep.actionType,
distance(state.ball.startPosition, state.ball.target),
getActionSpeed(),
resolvedProfile
);
}
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
}
state.isRunning = true;
ui.playPauseButton.textContent = "Pause";
logEvent("Action started.");
}
function pauseLiveSimulation(message = "Simulation paused.") {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(message);
updateSequenceButtons();
render();
}
function resumeLiveSimulation(message = "Simulation resumed.") {
state.isRunning = true;
ui.playPauseButton.textContent = "Pause";
logEvent(message);
updateSequenceButtons();
render();
}
function toggleSpaceAutopilotPlayback() {
if (!state.offensiveAutopilot) {
return;
}
if (state.sequence.isPlaying) {
if (state.isRunning) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
state.autoPilotPlay.active = true;
resumeLiveSimulation("Autopilot playback resumed.");
return;
}
if (state.isRunning) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
if (state.autoPilotPlay?.active && !hasBallAction() && !state.draftStep) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
state.autoPilotPlay.active = true;
if (state.ball.inTransit && (hasBallAction() || state.draftStep)) {
resumeLiveSimulation("Auto play resumed.");
return;
}
if (hasBallAction() || state.draftStep) {
executePlannedAction();
render();
return;
}
planAutoPilotNextAction({ startImmediately: true });
}

function clearKeyboardActionGrace() { gameSimulatorKeyboardState?.clearKeyboardActionGrace(state); }
function armKeyboardActionGrace(mode, durationMs = 220) {
if (gameSimulatorKeyboardState) return gameSimulatorKeyboardState.armKeyboardActionGrace(state, mode, durationMs);
state.keyboardActionGraceMode = mode;
state.keyboardActionGraceUntil = Date.now() + durationMs;
}
function getPointerRequestedActionMode() { return gameSimulatorKeyboardState?.getPointerRequestedActionMode(state) ?? state.keyboardActionMode ?? state.actionMode; }
function consumePointerActionMode(mode) { gameSimulatorKeyboardState?.consumePointerActionMode(state, mode); }
function setKeyboardActionMode(mode) {
if (gameSimulatorKeyboardState) return gameSimulatorKeyboardState.setKeyboardActionMode(state, mode);
if (state.keyboardActionMode === mode) return;
state.keyboardActionMode = mode;
updateModeButtons();
render();
}


function positionMetricTooltip(target) {
if (!ui.metricTooltip || !target) {
return;
}
if (!target.isConnected) {
hideMetricTooltip({ force: true });
return;
}
const rect = target.getBoundingClientRect();
const padding = 12;
const tooltipWidth = ui.metricTooltip.offsetWidth;
const tooltipHeight = ui.metricTooltip.offsetHeight;
let left = rect.left + rect.width / 2 - tooltipWidth / 2;
let top = rect.bottom + 10;
left = clamp(left, padding, win.innerWidth - tooltipWidth - padding);
if (top + tooltipHeight > win.innerHeight - padding) {
top = rect.top - tooltipHeight - 10;
}
top = clamp(top, padding, win.innerHeight - tooltipHeight - padding);
ui.metricTooltip.style.left = `${left}px`;
ui.metricTooltip.style.top = `${top}px`;
}
function ensureMetricTooltipLayer() {
if (!ui.metricTooltip) {
return;
}
const layerRoot = document.fullscreenElement ?? document.body;
if (ui.metricTooltip.parentElement !== layerRoot) {
layerRoot.appendChild(ui.metricTooltip);
}
}
function showMetricTooltip(target, { pinned = false } = {}) {
const helpText = target?.dataset?.metricHelp;
if (!ui.metricTooltip || !helpText) {
return;
}
ensureMetricTooltipLayer();
activeMetricTooltipTarget = target;
pinnedMetricTooltipTarget = pinned ? target : pinnedMetricTooltipTarget;
ui.metricTooltip.textContent = helpText;
ui.metricTooltip.hidden = false;
ui.metricTooltip.classList.add("is-visible");
ui.metricTooltip.dataset.metricLabel = target.dataset.metricLabel ?? "";
target.setAttribute("aria-expanded", "true");
positionMetricTooltip(target);
}
function hideMetricTooltip({ force = false } = {}) {
if (!ui.metricTooltip) {
return;
}
if (!force && pinnedMetricTooltipTarget) {
return;
}
if (activeMetricTooltipTarget) {
activeMetricTooltipTarget.setAttribute("aria-expanded", "false");
}
activeMetricTooltipTarget = null;
pinnedMetricTooltipTarget = null;
ui.metricTooltip.classList.remove("is-visible");
ui.metricTooltip.hidden = true;
delete ui.metricTooltip.dataset.metricLabel;
}
ui.playPauseButton.addEventListener("click", () => {
if (state.isRunning) {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent("Simulation paused.");
return;
}
executePlannedAction();
});
ui.resetButton.addEventListener("click", () => {
cancelAutoPilotContinuation();
cancelSequenceAdvance();
state = createInitialState();
resetSimulatorAnimationClock();
ui.playPauseButton.textContent = "Start";
ui.playbackSpeed.value = "1";
ui.playbackSpeedLabel.textContent = "1.00x";
ui.ballSpeed.value = "12";
ui.ballSpeedLabel.textContent = "Auto";
ui.dribbleSpeed.value = "4.5";
ui.dribbleSpeedLabel.textContent = "Auto";
if (ui.firstTouchSelect) {
ui.firstTouchSelect.value = "auto";
}
if (ui.defensiveAggressionSelect) {
ui.defensiveAggressionSelect.value = "balanced";
}
syncSurfaceControls();
syncWeatherControls();
syncFirstTouchControls();
syncDefensiveAggressionControls();
syncBallSpeedControls();
syncDribbleSpeedControls();
updateModeButtons();
updateSequenceButtons();
logEvent("Reset complete: new sequence starts with a kick-off.");
render();
});
ui.playbackSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.playbackSpeed = value;
ui.playbackSpeedLabel.textContent = `${value.toFixed(2)}x`;
});
ui.ballSpeedAutoButton.addEventListener("click", () => {
state.ballSpeedMode = "auto";
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.ballSpeedManualButton.addEventListener("click", () => {
state.ballSpeedMode = "manual";
state.ball.speed = state.ball.manualSpeed;
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.ballSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.ball.manualSpeed = value;
if (state.ballSpeedMode === "manual") {
state.ball.speed = value;
}
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.dribbleSpeedAutoButton?.addEventListener("click", () => {
state.dribbleSpeedMode = "auto";
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.dribbleSpeedManualButton?.addEventListener("click", () => {
state.dribbleSpeedMode = "manual";
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.dribbleSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.dribbleSpeed = value;
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.pitchSurfaceSelect?.addEventListener("input", (event) => {
state.surfacePreset = event.target.value;
refreshPlannedBallActionProfile();
render();
});
ui.weatherSelect?.addEventListener("input", (event) => {
state.weatherPreset = event.target.value;
refreshPlannedBallActionProfile();
render();
});
ui.firstTouchSelect?.addEventListener("input", (event) => {
state.firstTouchMode = event.target.value;
if (state.draftStep?.actionType === "pass") {
state.draftStep.firstTouchMode = state.firstTouchMode;
state.ball.firstTouchMode = state.firstTouchMode;
}
render();
});
ui.defensiveAggressionSelect?.addEventListener("input", (event) => {
state.defensiveAggressionPreset = event.target.value;
syncDefensiveAggressionControls();
render();
});
function updateModeButtons() {
const activeMode = getRequestedActionMode();
ui.passModeButton.classList.toggle("is-active", activeMode === "pass");
ui.dribbleModeButton.classList.toggle("is-active", activeMode === "dribble");
ui.shotModeButton.classList.toggle("is-active", activeMode === "shot");
}
function syncDefensiveAutopilotButton() {
if (!ui.defensiveAutopilotButton) {
return;
}
ui.defensiveAutopilotButton.classList.toggle("is-active", state.defensiveAutopilot);
ui.defensiveAutopilotButton.setAttribute("aria-pressed", String(state.defensiveAutopilot));
ui.defensiveAutopilotButton.textContent = state.defensiveAutopilot
? "Defence Auto"
: "Defence Manual";
ui.defensiveAutopilotButton.disabled = state.isRunning || state.sequence.isPlaying;
}
function syncOffensiveAutopilotButton() {
if (!ui.offensiveAutopilotButton) {
return;
}
ui.offensiveAutopilotButton.classList.toggle("is-active", state.offensiveAutopilot);
ui.offensiveAutopilotButton.setAttribute("aria-pressed", String(state.offensiveAutopilot));
ui.offensiveAutopilotButton.textContent = state.offensiveAutopilot
? "Attack Auto"
: "Attack Manual";
ui.offensiveAutopilotButton.disabled = state.isRunning || state.sequence.isPlaying;
}
function syncAutoV2DebugButton() {
if (!ui.autoV2DebugButton) {
return;
}
ui.autoV2DebugButton.classList.toggle("is-active", Boolean(win.__autoV2DebugEnabled));
ui.autoV2DebugButton.setAttribute("aria-pressed", String(Boolean(win.__autoV2DebugEnabled)));
ui.autoV2DebugButton.textContent = win.__autoV2DebugEnabled ? "Auto v2 Debug On" : "Auto v2 Debug";
}
function toggleAutoV2DebugOverlay() {
state.autoV2Debug = !state.autoV2Debug;
win.__autoV2DebugEnabled = state.autoV2Debug;
logEvent(state.autoV2Debug ? "Auto v2 debug overlay is on." : "Auto v2 debug overlay is off.");
render();
}
win.toggleAutoV2DebugOverlay = toggleAutoV2DebugOverlay;

function hasActiveMetricTooltip() { return Boolean(activeMetricTooltipTarget && !ui.metricTooltip?.hidden); }
function bindGameSimulatorLateUiEvents() {
ui.simulatorIntroEnterButton?.addEventListener("click", () => launchGameSimulatorFromIntro().catch(console.error));
ui.pitchFullscreenButton?.addEventListener("click", () => togglePitchFullscreen().catch(console.error));
document.addEventListener("mousemove", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger) {
showMetricTooltip(trigger);
return;
}
hideMetricTooltip();
});
document.addEventListener("click", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (!trigger) {
hideMetricTooltip({ force: true });
return;
}
event.preventDefault();
event.stopPropagation();
if (pinnedMetricTooltipTarget === trigger && !ui.metricTooltip?.hidden) {
hideMetricTooltip({ force: true });
return;
}
showMetricTooltip(trigger, { pinned: true });
});
document.addEventListener("focusin", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger) {
showMetricTooltip(trigger);
}
});
document.addEventListener("focusout", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger && pinnedMetricTooltipTarget !== trigger) {
hideMetricTooltip();
}
});

}
function bindGameSimulatorSequenceUiEvents() {
ui.previousStepButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
goToSequenceFrame(state.sequence.currentFrameIndex - 1);
updateSequenceButtons();
render();
});
ui.nextStepButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
goToSequenceFrame(state.sequence.currentFrameIndex + 1);
updateSequenceButtons();
render();
});
ui.playSequenceButton.addEventListener("click", () => {
if (state.sequence.isPlaying) {
stopSequencePlayback();
render();
return;
}
if (state.isRunning) {
return;
}
startSequencePlayback();
updateSequenceButtons();
render();
});
ui.clearSequenceButton.addEventListener("click", () => {
if (state.isRunning && !state.sequence.isPlaying) {
return;
}
if (state.sequence.isPlaying) {
stopSequencePlayback(false);
}
state.sequence.steps = [];
state.sequence.initialSnapshot = null;
state.sequence.dirty = false;
state.sequence.playbackIndex = -1;
state.sequence.currentFrameIndex = -1;
state.example = null;
state.scenario = { ...defaultScenarioInfo };
state.simulatorDirty = false;
cancelSequenceAdvance();
clearBallAction();
applyKickoffSetup(state, {
teamId: defaultKickoffTeamId,
resetFormations: true,
});
state.time = 0;
logEvent("Sequence cleared. New sequence starts with a kick-off.");
updateSequenceButtons();
render();
});
ui.saveSequenceButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
saveSequenceToLocal();
render();
});
ui.loadSequenceButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
loadSequenceFromLocal();
render();
});
ui.downloadSequenceButton.addEventListener("click", () => {
downloadSequence();
});
ui.playerTable.addEventListener("click", (event) => {
const button = event.target.closest("[data-player-id]");
if (!button) {
return;
}
if (!hasBallAction() && isSelectionModifierActive(event)) {
toggleSelectedPlayer(button.dataset.playerId);
} else {
setSingleSelectedPlayer(button.dataset.playerId);
}
render();
});
function handleSelectedPlayerProfileChange(event) {
const select = event.target.closest("[data-selected-player-profile]");
if (!select) {
return;
}
updateSelectedPlayerProfile(select.dataset.selectedPlayerProfile, select.value);
}
function handleSelectedPlayerProfileClick(event) {
const button = event.target.closest("[data-selected-player-profile-option]");
if (!button) {
return;
}
updateSelectedPlayerProfile(
button.dataset.selectedPlayerProfileOption,
button.dataset.playerProfileKey
);
}
ui.selectedPlayerCard?.addEventListener("change", handleSelectedPlayerProfileChange);
ui.fullscreenSelectedPlayerCard?.addEventListener("change", handleSelectedPlayerProfileChange);
ui.selectedPlayerCard?.addEventListener("click", handleSelectedPlayerProfileClick);
ui.fullscreenSelectedPlayerCard?.addEventListener("click", handleSelectedPlayerProfileClick);
ui.sequenceList.addEventListener("click", (event) => {
const stepCard = event.target.closest("[data-sequence-frame-index]");
if (!stepCard || !canEditScenario()) {
return;
}
goToSequenceFrame(Number(stepCard.dataset.sequenceFrameIndex));
updateSequenceButtons();
render();
});
ui.savedSequenceList.addEventListener("click", (event) => {
const button = event.target.closest("[data-saved-sequence-action]");
if (!button || !canEditScenario()) {
return;
}
const { savedSequenceAction, savedSequenceId } = button.dataset;
if (!savedSequenceId) {
return;
}
if (savedSequenceAction === "load") {
loadSavedSequenceEntry(savedSequenceId);
render();
return;
}
if (savedSequenceAction === "download") {
const entry = getSavedSequenceById(savedSequenceId);
if (entry) {
downloadSequence(entry.sequence, entry.name);
}
return;
}
if (savedSequenceAction === "delete") {
removeSavedSequenceEntry(savedSequenceId);
render();
}
});

}

function toggleActionMode(mode) {
state.actionMode = state.actionMode === mode ? null : mode;
updateModeButtons();
render();
}
function syncFormationControls() {
ui.homeFormationSelect.value = teams.home.formation;
ui.awayFormationSelect.value = teams.away.formation;
ui.homeLegendLabel.innerHTML = `<i class="swatch swatch-home"></i>${teams.home.name} ${teams.home.formation}`;
ui.awayLegendLabel.innerHTML = `<i class="swatch swatch-away"></i>${teams.away.name} ${teams.away.formation}`;
}
function syncTeamIdentityControls() {
if (ui.homeAttackStyleSelect) {
ui.homeAttackStyleSelect.value = getTeamAttackStyleKey("home");
ui.homeAttackStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.homeDefenseStyleSelect) {
ui.homeDefenseStyleSelect.value = getTeamDefenseStyleKey("home");
ui.homeDefenseStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.awayAttackStyleSelect) {
ui.awayAttackStyleSelect.value = getTeamAttackStyleKey("away");
ui.awayAttackStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.awayDefenseStyleSelect) {
ui.awayDefenseStyleSelect.value = getTeamDefenseStyleKey("away");
ui.awayDefenseStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncPhysicalProfileControls() {
if (ui.physicalProfileSelect) {
ui.physicalProfileSelect.value = state.physicalProfile ?? defaultPhysicalProfileKey;
ui.physicalProfileSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncSurfaceControls() {
if (ui.pitchSurfaceSelect) {
ui.pitchSurfaceSelect.value = state.surfacePreset;
ui.pitchSurfaceSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncWeatherControls() {
if (ui.weatherSelect) {
ui.weatherSelect.value = state.weatherPreset;
ui.weatherSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncFirstTouchControls() {
if (ui.firstTouchSelect) {
ui.firstTouchSelect.value = state.firstTouchMode;
ui.firstTouchSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncDefensiveAggressionControls() {
if (ui.defensiveAggressionSelect) {
ui.defensiveAggressionSelect.value = state.defensiveAggressionPreset;
ui.defensiveAggressionSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncBallSpeedControls() {
const isAuto = state.ballSpeedMode === "auto";
ui.ballSpeedAutoButton.classList.toggle("is-active", isAuto);
ui.ballSpeedManualButton.classList.toggle("is-active", !isAuto);
ui.ballSpeed.disabled = isAuto;
ui.ballSpeed.closest(".speed-control")?.classList.toggle("is-disabled", isAuto);
ui.ballSpeed.value = String(state.ball.manualSpeed);
ui.ballSpeedLabel.textContent = isAuto
? hasBallAction() || state.ball.inTransit
? `Auto • ${formatSpeed(state.ball.speed)}`
: "Auto"
: formatSpeed(state.ball.manualSpeed);
}
function syncDribbleSpeedControls() {
const isAuto = state.dribbleSpeedMode === "auto";
ui.dribbleSpeedAutoButton?.classList.toggle("is-active", isAuto);
ui.dribbleSpeedManualButton?.classList.toggle("is-active", !isAuto);
ui.dribbleSpeed.disabled = isAuto;
ui.dribbleSpeed.closest(".speed-control")?.classList.toggle("is-disabled", isAuto);
ui.dribbleSpeed.value = String(state.dribbleSpeed);
const isLiveDribble = (hasBallAction() || state.ball.inTransit || !!state.draftStep) &&
(state.ball.actionType === "dribble" || state.draftStep?.actionType === "dribble");
const displayedSpeed = state.draftStep?.actionType === "dribble"
? state.draftStep.speed
: state.ball.actionType === "dribble"
? state.ball.currentSpeed || state.ball.speed || state.dribbleSpeed
: state.dribbleSpeed;
ui.dribbleSpeedLabel.textContent = isAuto
? isLiveDribble
? `Auto • ${formatSpeed(displayedSpeed)}`
: "Auto"
: formatSpeed(state.dribbleSpeed);
}
function updateSequenceButtons() {
ui.playSequenceButton.textContent = state.sequence.isPlaying
? "Stop Playback"
: "Play From Here";
const isLocked = !canEditScenario() || hasBallAction() || !!state.draftStep;
const hasPrevious = state.sequence.currentFrameIndex > -1;
const hasNext = state.sequence.currentFrameIndex < state.sequence.steps.length - 1;
ui.previousStepButton.disabled = isLocked || !hasPrevious;
ui.nextStepButton.disabled = isLocked || !hasNext;
ui.playSequenceButton.disabled =
(state.sequence.steps.length === 0 && !state.sequence.isPlaying) ||
(!state.sequence.isPlaying && isLocked);
ui.clearSequenceButton.disabled = state.sequence.isPlaying || state.isRunning;
if (!state.sequence.steps.length) {
ui.sequenceStepLabel.textContent = "Start";
return;
}
ui.sequenceStepLabel.textContent =
state.sequence.currentFrameIndex < 0
? `Start / ${state.sequence.steps.length}`
: `Step ${state.sequence.currentFrameIndex + 1} / ${state.sequence.steps.length}`;
}
function refreshKickoffSetupIfWaitingToStart() {
if (
state.restartPhase?.type !== "kickoff" ||
state.isRunning ||
state.sequence.isPlaying ||
state.sequence.steps.length ||
hasBallAction() ||
state.draftStep
) {
return;
}
applyKickoffSetup(state, {
teamId: state.restartPhase.teamId ?? defaultKickoffTeamId,
resetFormations: false,
});
}
ui.passModeButton.addEventListener("click", () => {
toggleActionMode("pass");
});
ui.dribbleModeButton.addEventListener("click", () => {
toggleActionMode("dribble");
});
ui.shotModeButton.addEventListener("click", () => {
toggleActionMode("shot");
});
ui.homeFormationSelect.addEventListener("change", (event) => {
if (!canEditScenario()) {
syncFormationControls();
return;
}
if (hasBallAction() || state.draftStep) {
clearBallAction();
}
applyTeamFormation("home", event.target.value);
refreshKickoffSetupIfWaitingToStart();
state.example = null;
state.scenario = { ...defaultScenarioInfo };
logEvent(`Blue Team switched to a ${event.target.value} shape.`);
render();
});
ui.awayFormationSelect.addEventListener("change", (event) => {
if (!canEditScenario()) {
syncFormationControls();
return;
}
if (hasBallAction() || state.draftStep) {
clearBallAction();
}
applyTeamFormation("away", event.target.value);
refreshKickoffSetupIfWaitingToStart();
state.example = null;
state.scenario = { ...defaultScenarioInfo };
logEvent(`Red Team switched to a ${event.target.value} shape.`);
render();
});
function updateTeamIdentity(teamId, type, styleKey) {
if (!canEditScenario()) {
syncTeamIdentityControls();
return;
}
const team = teams[teamId];
if (!team) {
return;
}
if (type === "attack") {
team.identity.attackStyle = attackStylePresets[styleKey] ? styleKey : "balanced";
const style = getTeamAttackStyleProfile(teamId);
logEvent(`${team.name} attack identity set to ${style.label}.`);
} else {
team.identity.defenseStyle = defenseStylePresets[styleKey] ? styleKey : "balanced-block";
const style = getTeamDefenseStyleProfile(teamId);
logEvent(`${team.name} defensive identity set to ${style.label}.`);
}
if (!state.isRunning && !state.sequence.isPlaying && hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
syncTeamIdentityControls();
render();
}
function updatePhysicalProfile(profileKey) {
if (!canEditScenario()) {
syncPhysicalProfileControls();
return;
}
const nextProfile = competitionPhysicalProfiles[profileKey] ?? competitionPhysicalProfiles[defaultPhysicalProfileKey];
state.physicalProfile = nextProfile.key;
applyPhysicalProfileToPlayers(state.players, nextProfile.key);
refreshPlannedBallActionProfile();
if (!state.isRunning && !state.sequence.isPlaying && hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
logEvent(`Physical level set to ${nextProfile.label}. Player speed, acceleration and auto carry speed now use that profile.`);
syncPhysicalProfileControls();
render();
}
function updateSelectedPlayerProfile(playerId, profileKey) {
if (!canEditScenario()) {
render();
return;
}
const player = getPlayerById(playerId);
const profile = playerTendencyTemplates[profileKey];
if (!player || !profile) {
render();
return;
}
player.tendencyProfile = buildPlayerTendencyProfile({
...player,
tendencyKey: profileKey,
});
if (hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
logEvent(`${player.shortLabel} ${player.role} profile set to ${profile.label}.`);
render();
}
ui.homeAttackStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("home", "attack", event.target.value);
});
ui.homeDefenseStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("home", "defense", event.target.value);
});
ui.awayAttackStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("away", "attack", event.target.value);
});
ui.awayDefenseStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("away", "defense", event.target.value);
});
ui.physicalProfileSelect?.addEventListener("change", (event) => {
updatePhysicalProfile(event.target.value);
});
ui.assignBallButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
if (!state.selectedPlayerId) {
logEvent("Select a player before setting the ball carrier.");
render();
return;
}
setBallOwner(state.selectedPlayerId);
render();
});
ui.defensiveAutopilotButton?.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
state.defensiveAutopilot = !state.defensiveAutopilot;
if (state.defensiveAutopilot) {
const applied = applyDefensiveAutopilotForCurrentAction();
if (!applied) {
logEvent("Defensive autopilot is on and will shape the team without the ball on the next action.");
}
} else {
logEvent("Defensive autopilot is off.");
}
render();
});
ui.offensiveAutopilotButton?.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
state.offensiveAutopilot = !state.offensiveAutopilot;
if (state.offensiveAutopilot) {
const applied = applyOffensiveAutopilotForCurrentAction();
if (!applied) {
logEvent("Offensive autopilot is on and will shape the team with the ball on the next action.");
}
} else {
if (state.autoPilotPlay?.active || state.isRunning) {
pauseAutoPilotPlay("Auto play paused because offensive autopilot is off.");
} else {
cancelAutoPilotContinuation();
state.autoPilotPlay.active = false;
}
logEvent("Offensive autopilot is off.");
}
render();
});
ui.autoV2DebugButton?.addEventListener("click", () => {
toggleAutoV2DebugOverlay();
});

  return Object.freeze({
    applyTeamFormation, applyTeamIdentities, applySnapshot, animationFrame, armKeyboardActionGrace,
    bindGameSimulatorLateUiEvents, bindGameSimulatorSequenceUiEvents, buildSnapshotFromFormations, canEditScenario, cancelSequenceAdvance, captureSnapshot, clearKeyboardActionGrace,
    clearSelectedPlayers, cloneRestartPhase, cloneScenarioInfo, cloneSequenceStep, cloneSnapshot, cloneTeamIdentities,
    cloneTeamIdentity, consumePointerActionMode, createCommittedSnapshotFromCurrentState, createLowBlockPressExample,
    createStepThumbnail, downloadSequence, ensureGameSimulatorControllers, eventToPitch, executePlannedAction,
    finishSequencePlayback, getActiveExampleOverlay, getBallOwner, getMetersToPixels, getNearestOpponentGap,
    getPlayerById, getPlayerDecisionContext, getPlayerPressureLoad, getPointerRequestedActionMode,
    getRenderedPrimarySelectedPlayerId, getRenderedSelectedPlayerIds, getSavedSequenceById, getScaleX, getScaleY,
    getSelectedPlayer, getSelectedPlayerIds, getSelectionPreviewIds, getTeamAttackStyleKey, getTeamAttackStyleProfile,
    getTeamDefenseStyleKey, getTeamDefenseStyleProfile, goToSequenceFrame, hasUnsavedSimulatorWork,
    isGameSimulatorWorkspaceActive, isPitchFullscreenActive, isPlayerRenderedSelected, isPlayerSelected, isSelectionModifierActive,
    isSimulatorIntroActive, launchGameSimulatorFromIntro, loadLowBlockPressExample, loadSavedSequenceEntry, loadSequenceData,
    loadSequenceFromLocal, logEvent, markSequenceDirty, markSimulatorDirty, markSimulatorSaved, normalizeSelectedPlayerIds,
    hideMetricTooltip, hasActiveMetricTooltip, positionMetricTooltip, showMetricTooltip,
    pauseLiveSimulation, pauseSimulatorForWorkspaceSwitch, pointerController: gameSimulatorPointerController, queueGameSimulatorControllersLoad,
    queueNextSequenceStep, readSavedSequenceLibrary, removeSavedSequenceEntry, render, resetGameSimulatorIntro,
    resetSimulatorAnimationClock, resetTeamIdentities, resetUnsavedSimulatorSession, resumeLiveSimulation, sanitizeFileName,
    saveSequenceToLocal, serializeSequence, setKeyboardActionMode, setSelectedPlayers, setSingleSelectedPlayer,
    refreshKickoffSetupIfWaitingToStart, syncAutoV2DebugButton, syncBallSpeedControls, syncDefensiveAggressionControls,
    syncDefensiveAutopilotButton, syncDribbleSpeedControls, syncFirstTouchControls, syncFormationControls,
    syncOffensiveAutopilotButton, syncPhysicalProfileControls, syncSurfaceControls, syncTeamIdentityControls,
    syncWeatherControls, toggleActionMode, toggleAutoV2DebugOverlay, updateModeButtons, updatePhysicalProfile,
    updateSelectedPlayerProfile, updateSequenceButtons, updateTeamIdentity,
    shouldIgnoreSimulatorTextOrModifierTarget, startRecordedAction, startSequencePlayback, startSequenceStep, startSimulatorAnimationLoop,
    stopSequencePlayback, stopSimulatorAnimationLoop, syncGameSimulatorIntroState, syncPitchFullscreenButton, toCanvas,
    togglePitchFullscreen, toggleSelectedPlayer, toggleSpaceAutopilotPlayback, updatePitchFullscreenHudLayout,
    withSnapshotOverrides, writeSavedSequenceLibrary,
  });
}
