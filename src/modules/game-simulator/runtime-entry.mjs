import {
  attackStylePresets,
  autoBallProfiles,
  autoDribbleProfiles,
  ballRadiusMeters,
  competitionPhysicalProfiles,
  defaultFormations,
  defaultKickoffTeamId,
  defaultPhysicalProfileKey,
  defaultScenarioInfo,
  defaultTeamIdentities,
  defenseStylePresets,
  defensiveAggressionPresets,
  defensiveAutopilotProfiles,
  defensivePhaseProfiles,
  firstTouchModes,
  formationLayouts,
  formationMagnetLabels,
  gameRoleProfiles,
  getAttackStyleRhythmProfile,
  intelligenceLabelBoosts,
  intelligenceRoleArchetypes,
  offensiveAutopilotProfiles,
  offensivePhaseProfiles,
  pitch,
  pitchSurfacePresets,
  playerRadiusMeters,
  playerTendencyTemplates,
  possessionRhythmDefaults,
  resolvePreferredFoot,
  resolveWeakFootQuality,
  sequenceLibraryStorageKey as defaultSequenceLibraryStorageKey,
  sequenceStorageKey as defaultSequenceStorageKey,
  setPiecePhaseProfiles,
  sprintRoleArchetypes,
  squadBlueprints,
  teamRosterOrder,
  teams,
  weatherPresets,
} from "./model-data.mjs";
import { createGameSimulatorAppRuntimeController } from "./app-runtime-controller.mjs";
import { createGameSimulatorEngineBundle } from "./engine-wiring.mjs";
import { createGameSimulatorInitialStateFactory } from "./initial-state.mjs";
import { createGameSimulatorRuntimeFacade } from "./runtime-facade.mjs";
import { createGameSimulatorSidebarRenderer } from "./sidebar-renderer.mjs";

function noop() {}

export function createGameSimulatorRuntimeEntry(deps = {}) {
  const {
    canEditGameSimulatorWorkspace = () => false,
    documentRef = globalThis.document,
    escapeHtml = (value) => String(value ?? ""),
    getHubState = () => null,
    platformModuleLoader,
    renderWorkspaceChrome = noop,
    sequenceLibraryStorageKey = defaultSequenceLibraryStorageKey,
    sequenceStorageKey = defaultSequenceStorageKey,
    ui = {},
    win = globalThis,
  } = deps;

  const canvas = documentRef?.getElementById?.("pitchCanvas") ?? null;
  const ctx = canvas?.getContext?.("2d") ?? null;
  let state = null;
  let gameSimulatorAppRuntimeController = null;
  let pointerEventsBound = false;

  function invokeGameSimulatorAppRuntime(methodName, args) {
    if (!gameSimulatorAppRuntimeController?.[methodName]) {
      throw new Error(`Game simulator app runtime is not ready: ${methodName}`);
    }
    return gameSimulatorAppRuntimeController[methodName](...args);
  }

  const gameSimulatorRuntimeFacade = createGameSimulatorRuntimeFacade({
    attackStylePresets,
    defaultTeamIdentities,
    defenseStylePresets,
    getController: () => gameSimulatorAppRuntimeController,
    invoke: invokeGameSimulatorAppRuntime,
    sequenceLibraryStorageKey,
    teams,
    win,
  });
  const {
    readSavedSequenceLibrary, cloneTeamIdentity, cloneTeamIdentities, applyTeamIdentities,
    resetTeamIdentities, getTeamAttackStyleKey, getTeamDefenseStyleKey, getTeamAttackStyleProfile,
    getTeamDefenseStyleProfile, canEditScenario, applyTeamFormation, getScaleX,
    getScaleY, getMetersToPixels, toCanvas, eventToPitch,
    logEvent, getPlayerById, normalizeSelectedPlayerIds, getSelectedPlayerIds,
    setSelectedPlayers, setSingleSelectedPlayer, clearSelectedPlayers, toggleSelectedPlayer,
    isPlayerSelected, getSelectionPreviewIds, getRenderedSelectedPlayerIds, isPlayerRenderedSelected,
    getRenderedPrimarySelectedPlayerId, isSelectionModifierActive, getSelectedPlayer, getBallOwner,
    cloneRestartPhase, getPlayerPressureLoad, getNearestOpponentGap, getPlayerDecisionContext,
    captureSnapshot, applySnapshot, cloneSnapshot, cloneSequenceStep,
    buildSnapshotFromFormations, withSnapshotOverrides, createLowBlockPressExample, loadLowBlockPressExample,
    cloneScenarioInfo, markSimulatorDirty, markSequenceDirty, markSimulatorSaved,
    writeSavedSequenceLibrary, sanitizeFileName, goToSequenceFrame, cancelSequenceAdvance,
    stopSequencePlayback, finishSequencePlayback, queueNextSequenceStep, startRecordedAction,
    createCommittedSnapshotFromCurrentState, applyCommittedSnapshot, serializeSequence, loadSequenceData,
    saveSequenceToLocal, loadSequenceFromLocal, downloadSequence, createStepThumbnail,
    startSequenceStep, startSequencePlayback, getActiveExampleOverlay, getSavedSequenceById,
    loadSavedSequenceEntry, removeSavedSequenceEntry, render, isGameSimulatorWorkspaceActive,
    shouldIgnoreSimulatorTextOrModifierTarget, ensureGameSimulatorControllers, queueGameSimulatorControllersLoad,
    resetSimulatorAnimationClock, startSimulatorAnimationLoop, stopSimulatorAnimationLoop, animationFrame,
    executePlannedAction, pauseLiveSimulation, resumeLiveSimulation, toggleSpaceAutopilotPlayback,
    bindGameSimulatorLateUiEvents, bindGameSimulatorSequenceUiEvents, positionMetricTooltip,
    ensureMetricTooltipLayer, showMetricTooltip, hideMetricTooltip, hasActiveMetricTooltip,
    updateModeButtons, syncDefensiveAutopilotButton, syncOffensiveAutopilotButton, syncAutoV2DebugButton,
    toggleAutoV2DebugOverlay, toggleActionMode, syncFormationControls, syncTeamIdentityControls,
    syncPhysicalProfileControls, syncSurfaceControls, syncWeatherControls, syncFirstTouchControls,
    syncDefensiveAggressionControls, syncBallSpeedControls, syncDribbleSpeedControls,
    updateSequenceButtons, refreshKickoffSetupIfWaitingToStart, updateTeamIdentity,
    updatePhysicalProfile, updateSelectedPlayerProfile, clearKeyboardActionGrace, armKeyboardActionGrace,
    getPointerRequestedActionMode, consumePointerActionMode, setKeyboardActionMode,
  } = gameSimulatorRuntimeFacade;

  const {
    applyAutopilotsForCurrentAction, applyBallExecutionProfile, applyDefensiveAutopilotForCurrentAction,
    applyKickoffSetup, applyNearbyBallOrientation, applyOffensiveAutopilotForCurrentAction,
    applyPhysicalProfileToPlayers, applyResolvedBallProfile, buildPlayerIntelligenceProfile,
    buildPlayerSprintProfile, buildPlayerTendencyProfile, cancelAutoPilotContinuation, clamp,
    clampToCircle, clampToPitch, clearAutoPilotReceiveMomentum, clearBallAction, clearSecurePossession,
    cloneAutoV2DecisionTriggers, cloneDefensiveAutopilotIntents, cloneGoalEvent,
    cloneOffensiveAutopilotIntents, cloneSecurePossession, cloneShotPlacement, cloneVector,
    computeReachDistance, configureBallTravelProfile, createPlayer, createTransitionPlan,
    describeStep, distance, formatMeters, formatSpeed, formatTime, getActionDistance,
    getActionOrigin, getActionSpeed, getActionTypeLabel, getBallProfileLabel, getBallStatus,
    getCompetitionPhysicalLabel, getCurrentActionDuration, getDisplayedBallSpeed,
    getEditableRadius, getGoalDirectionSign, getKickoffSpot, getKickoffTakerId,
    getPlayerBallControlPoint, getPlayerFacingAngle, getPlayerMagnetLabel, getPlayerRoleModel,
    getProjectedActionDuration, getRecordedStepEndSnapshot, getRemainingBallTravelTime,
    getRequestedActionMode, getSequenceFrameSnapshot, hasBallAction, issueBallCommand,
    issuePassCommand, lerp, normalize, pauseAutoPilotPlay, planAutoPilotNextAction,
    refreshPlannedBallActionProfile, resolveExecutedShotTarget, resolveRecordedStepProfile,
    rotatePlayerBodyAlongMovement, setBallOwner, setDribbleCarryPathForBall,
    setTeamFormationOnPlayers, snapshotsMatch, stepSimulation, subtract, vec,
  } = createGameSimulatorEngineBundle({
    applyCommittedSnapshot, applySnapshot, autoBallProfiles, autoDribbleProfiles, ballRadiusMeters,
    canEditScenario, captureSnapshot, clearKeyboardActionGrace, cloneRestartPhase, cloneSnapshot,
    competitionPhysicalProfiles, createCommittedSnapshotFromCurrentState, defaultKickoffTeamId,
    defaultPhysicalProfileKey, defensiveAggressionPresets, defensiveAutopilotProfiles,
    defensivePhaseProfiles, executePlannedAction, finishSequencePlayback, firstTouchModes,
    formationLayouts, formationMagnetLabels, gameRoleProfiles, getAttackStyleRhythmProfile,
    getBallOwner, getNearestOpponentGap, getPlayerById, getPlayerDecisionContext,
    getPlayerPressureLoad, getSelectedPlayer, getState: () => state, getTeamAttackStyleKey,
    getTeamAttackStyleProfile, getTeamDefenseStyleKey, getTeamDefenseStyleProfile,
    intelligenceLabelBoosts, intelligenceRoleArchetypes, logEvent, markSequenceDirty,
    offensiveAutopilotProfiles, offensivePhaseProfiles, pauseLiveSimulation, pitch,
    pitchSurfacePresets, playerRadiusMeters, playerTendencyTemplates, possessionRhythmDefaults,
    queueNextSequenceStep, render, resolvePreferredFoot, resolveWeakFootQuality, setPiecePhaseProfiles,
    setSelectedPlayers, sprintRoleArchetypes, squadBlueprints, startRecordedAction,
    teamRosterOrder, teams, ui, updateSequenceButtons, weatherPresets, win,
  });

  const createInitialState = createGameSimulatorInitialStateFactory({
    applyKickoffSetup,
    cloneVector,
    createPlayer,
    defaultFormations,
    defaultKickoffTeamId,
    defaultPhysicalProfileKey,
    defaultScenarioInfo,
    getKickoffSpot,
    getKickoffTakerId,
    readSavedSequenceLibrary,
    resetTeamIdentities,
    setPiecePhaseProfiles,
    setTeamFormationOnPlayers,
    squadBlueprints,
    teams,
  });
  state = createInitialState();
  win.__autoV2DebugEnabled = Boolean(win.__autoV2DebugEnabled);

  const gameSimulatorSidebarRenderer = createGameSimulatorSidebarRenderer({
    ui,
    getState: () => state,
    teams,
    getSelectedPlayer,
    getBallOwner,
    getProjectedActionDuration,
    formatMeters,
    getActionDistance,
    computeReachDistance,
    getCurrentActionDuration,
    getPlayerBallControlPoint,
    distance,
    getActionOrigin,
    getEditableRadius,
    getPlayerRoleModel: (...args) => getPlayerRoleModel(...args),
    getCompetitionPhysicalLabel,
    hasBallAction,
    formatTime,
    getRemainingBallTravelTime,
    getBallProfileLabel,
    getDisplayedBallSpeed,
    formatSpeed,
    getBallStatus,
    getActionTypeLabel,
    isPlayerRenderedSelected,
    describeStep,
    createStepThumbnail,
    escapeHtml,
    playerTendencyTemplates,
  });

  gameSimulatorAppRuntimeController = createGameSimulatorAppRuntimeController({
    applyBallExecutionProfile, applyKickoffSetup, applyNearbyBallOrientation, applyPhysicalProfileToPlayers,
    applyResolvedBallProfile, attackStylePresets, ballRadiusMeters, buildPlayerIntelligenceProfile,
    buildPlayerSprintProfile, buildPlayerTendencyProfile, canEditGameSimulatorWorkspace, cancelAutoPilotContinuation,
    canvas, clamp, clampToCircle, clampToPitch, clearAutoPilotReceiveMomentum, clearBallAction,
    clearSecurePossession, cloneAutoV2DecisionTriggers, cloneDefensiveAutopilotIntents, cloneGoalEvent,
    cloneOffensiveAutopilotIntents, cloneSecurePossession, cloneShotPlacement, cloneVector,
    competitionPhysicalProfiles, computeReachDistance, configureBallTravelProfile, createInitialState,
    createPlayer, createTransitionPlan, ctx, defaultKickoffTeamId, defaultPhysicalProfileKey,
    defaultScenarioInfo, defaultTeamIdentities, defenseStylePresets, describeStep, distance,
    documentRef, gameSimulatorSidebarRenderer, getActionOrigin, getActionSpeed, getEditableRadius,
    getGoalDirectionSign, getHubState, getPlayerBallControlPoint, getPlayerFacingAngle,
    getPlayerMagnetLabel, getProjectedActionDuration, getRecordedStepEndSnapshot,
    getRequestedActionMode, getSequenceFrameSnapshot, getState: () => state, hasBallAction,
    issueBallCommand, issuePassCommand, lerp, normalize, pauseAutoPilotPlay, pitch,
    planAutoPilotNextAction, platformModuleLoader, playerRadiusMeters, playerTendencyTemplates,
    refreshPlannedBallActionProfile, renderWorkspaceChrome, resolveExecutedShotTarget,
    resolveRecordedStepProfile, rotatePlayerBodyAlongMovement, sequenceLibraryStorageKey,
    sequenceStorageKey, setBallOwner, setDribbleCarryPathForBall, setState: (nextState) => { state = nextState; },
    setTeamFormationOnPlayers, snapshotsMatch, squadBlueprints, stepSimulation, subtract,
    teamRosterOrder, teams, ui, vec, win, applyAutopilotsForCurrentAction,
    applyDefensiveAutopilotForCurrentAction, applyOffensiveAutopilotForCurrentAction, formatSpeed,
  });

  function bindPointerEvents() {
    const pointerController = gameSimulatorAppRuntimeController.pointerController;
    if (!canvas || !pointerController || pointerEventsBound) return;
    pointerEventsBound = true;
    canvas.addEventListener("pointerdown", pointerController.handlePointerDown);
    canvas.addEventListener("pointermove", pointerController.handlePointerMove);
    canvas.addEventListener("pointerup", pointerController.handlePointerUp);
    canvas.addEventListener("pointercancel", pointerController.handlePointerCancel);
    canvas.addEventListener("dblclick", pointerController.handleCanvasDoubleClick);
  }

  function syncInitialControls() {
    if (ui.playbackSpeedLabel) {
      ui.playbackSpeedLabel.textContent = `${state.playbackSpeed.toFixed(2)}x`;
    }
    syncBallSpeedControls();
    syncDribbleSpeedControls();
    syncSurfaceControls();
    syncWeatherControls();
    syncDefensiveAggressionControls();
    syncTeamIdentityControls();
    syncPhysicalProfileControls();
    updateModeButtons();
    syncDefensiveAutopilotButton();
    syncOffensiveAutopilotButton();
    syncFormationControls();
    updateSequenceButtons();
  }

  function initialize() {
    bindPointerEvents();
    bindGameSimulatorLateUiEvents();
    bindGameSimulatorSequenceUiEvents();
    syncInitialControls();
  }

  return {
    ...gameSimulatorRuntimeFacade,
    controller: gameSimulatorAppRuntimeController,
    getState: () => state,
    initialize,
    syncSavedSequencesFromStorage: () => {
      state.savedSequences = readSavedSequenceLibrary();
    },
  };
}
