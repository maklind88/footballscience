const runtimeMethodNames = Object.freeze([
  "canEditScenario",
  "applyTeamFormation",
  "getScaleX",
  "getScaleY",
  "getMetersToPixels",
  "toCanvas",
  "eventToPitch",
  "logEvent",
  "getPlayerById",
  "normalizeSelectedPlayerIds",
  "getSelectedPlayerIds",
  "setSelectedPlayers",
  "setSingleSelectedPlayer",
  "clearSelectedPlayers",
  "toggleSelectedPlayer",
  "isPlayerSelected",
  "getSelectionPreviewIds",
  "getRenderedSelectedPlayerIds",
  "isPlayerRenderedSelected",
  "getRenderedPrimarySelectedPlayerId",
  "isSelectionModifierActive",
  "getSelectedPlayer",
  "getBallOwner",
  "cloneRestartPhase",
  "getPlayerPressureLoad",
  "getNearestOpponentGap",
  "getPlayerDecisionContext",
  "captureSnapshot",
  "applySnapshot",
  "cloneSnapshot",
  "cloneSequenceStep",
  "buildSnapshotFromFormations",
  "withSnapshotOverrides",
  "createLowBlockPressExample",
  "loadLowBlockPressExample",
  "cloneScenarioInfo",
  "markSimulatorDirty",
  "markSequenceDirty",
  "markSimulatorSaved",
  "writeSavedSequenceLibrary",
  "sanitizeFileName",
  "goToSequenceFrame",
  "cancelSequenceAdvance",
  "stopSequencePlayback",
  "finishSequencePlayback",
  "queueNextSequenceStep",
  "startRecordedAction",
  "createCommittedSnapshotFromCurrentState",
  "applyCommittedSnapshot",
  "serializeSequence",
  "loadSequenceData",
  "saveSequenceToLocal",
  "loadSequenceFromLocal",
  "downloadSequence",
  "createStepThumbnail",
  "startSequenceStep",
  "startSequencePlayback",
  "getActiveExampleOverlay",
  "getSavedSequenceById",
  "loadSavedSequenceEntry",
  "removeSavedSequenceEntry",
  "render",
  "isGameSimulatorWorkspaceActive",
  "shouldIgnoreSimulatorTextOrModifierTarget",
  "ensureGameSimulatorControllers",
  "queueGameSimulatorControllersLoad",
  "resetSimulatorAnimationClock",
  "startSimulatorAnimationLoop",
  "stopSimulatorAnimationLoop",
  "animationFrame",
  "executePlannedAction",
  "pauseLiveSimulation",
  "resumeLiveSimulation",
  "toggleSpaceAutopilotPlayback",
  "bindGameSimulatorLateUiEvents",
  "bindGameSimulatorSequenceUiEvents",
  "positionMetricTooltip",
  "ensureMetricTooltipLayer",
  "showMetricTooltip",
  "hideMetricTooltip",
  "hasActiveMetricTooltip",
  "updateModeButtons",
  "syncDefensiveAutopilotButton",
  "syncOffensiveAutopilotButton",
  "syncAutoV2DebugButton",
  "toggleAutoV2DebugOverlay",
  "toggleActionMode",
  "syncFormationControls",
  "syncTeamIdentityControls",
  "syncPhysicalProfileControls",
  "syncSurfaceControls",
  "syncWeatherControls",
  "syncFirstTouchControls",
  "syncDefensiveAggressionControls",
  "syncBallSpeedControls",
  "syncDribbleSpeedControls",
  "updateSequenceButtons",
  "refreshKickoffSetupIfWaitingToStart",
  "updateTeamIdentity",
  "updatePhysicalProfile",
  "updateSelectedPlayerProfile",
  "clearKeyboardActionGrace",
  "armKeyboardActionGrace",
  "getPointerRequestedActionMode",
  "consumePointerActionMode",
  "setKeyboardActionMode"
]);

export function createGameSimulatorRuntimeFacade(deps = {}) {
  const {
    attackStylePresets = {},
    defaultTeamIdentities = {},
    defenseStylePresets = {},
    getController = () => null,
    invoke = () => { throw new Error("Game simulator runtime invoke is not configured."); },
    sequenceLibraryStorageKey = "",
    teams = {},
    win = globalThis,
  } = deps;

  function callRuntime(methodName, args) {
    return invoke(methodName, args);
  }

  function readSavedSequenceLibrary(...args) {
    const controller = getController();
    if (controller?.readSavedSequenceLibrary) {
      return controller.readSavedSequenceLibrary(...args);
    }
    try {
      const raw = win.localStorage?.getItem(sequenceLibraryStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => entry && entry.id && entry.name && entry.sequence?.steps)
        .sort((a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0));
    } catch {
      return [];
    }
  }

  function cloneTeamIdentity(identity) {
    const controller = getController();
    if (controller?.cloneTeamIdentity) {
      return controller.cloneTeamIdentity(identity);
    }
    return {
      attackStyle: identity?.attackStyle ?? "balanced",
      defenseStyle: identity?.defenseStyle ?? "balanced-block",
    };
  }

  function cloneTeamIdentities(...args) {
    const controller = getController();
    if (controller?.cloneTeamIdentities) {
      return controller.cloneTeamIdentities(...args);
    }
    return {
      home: cloneTeamIdentity(teams.home?.identity),
      away: cloneTeamIdentity(teams.away?.identity),
    };
  }

  function applyTeamIdentities(identitySnapshot = {}) {
    const controller = getController();
    if (controller?.applyTeamIdentities) {
      return controller.applyTeamIdentities(identitySnapshot);
    }
    ["home", "away"].forEach((teamId) => {
      const incoming = identitySnapshot[teamId] ?? teams[teamId]?.identity ?? {};
      const defaults = defaultTeamIdentities[teamId] ?? {};
      if (!teams[teamId]) return;
      teams[teamId].identity = {
        attackStyle: incoming.attackStyle ?? defaults.attackStyle ?? "balanced",
        defenseStyle: incoming.defenseStyle ?? defaults.defenseStyle ?? "balanced-block",
      };
    });
  }

  function resetTeamIdentities(...args) {
    const controller = getController();
    if (controller?.resetTeamIdentities) {
      return controller.resetTeamIdentities(...args);
    }
    return applyTeamIdentities(defaultTeamIdentities);
  }

  function getTeamAttackStyleKey(teamId) {
    const controller = getController();
    if (controller?.getTeamAttackStyleKey) {
      return controller.getTeamAttackStyleKey(teamId);
    }
    return teams[teamId]?.identity?.attackStyle ?? defaultTeamIdentities[teamId]?.attackStyle ?? "balanced";
  }

  function getTeamDefenseStyleKey(teamId) {
    const controller = getController();
    if (controller?.getTeamDefenseStyleKey) {
      return controller.getTeamDefenseStyleKey(teamId);
    }
    return teams[teamId]?.identity?.defenseStyle ?? defaultTeamIdentities[teamId]?.defenseStyle ?? "balanced-block";
  }

  function getTeamAttackStyleProfile(teamId) {
    const controller = getController();
    if (controller?.getTeamAttackStyleProfile) {
      return controller.getTeamAttackStyleProfile(teamId);
    }
    const styleKey = getTeamAttackStyleKey(teamId);
    return attackStylePresets[styleKey] ?? attackStylePresets.balanced;
  }

  function getTeamDefenseStyleProfile(teamId) {
    const controller = getController();
    if (controller?.getTeamDefenseStyleProfile) {
      return controller.getTeamDefenseStyleProfile(teamId);
    }
    const styleKey = getTeamDefenseStyleKey(teamId);
    return defenseStylePresets[styleKey] ?? defenseStylePresets["balanced-block"];
  }

  const facade = {
    readSavedSequenceLibrary,
    cloneTeamIdentity,
    cloneTeamIdentities,
    applyTeamIdentities,
    resetTeamIdentities,
    getTeamAttackStyleKey,
    getTeamDefenseStyleKey,
    getTeamAttackStyleProfile,
    getTeamDefenseStyleProfile,
  };

  runtimeMethodNames.forEach((methodName) => {
    facade[methodName] = (...args) => callRuntime(methodName, args);
  });
  facade.shouldIgnoreHotkey = (event) => facade.shouldIgnoreSimulatorTextOrModifierTarget(event);
  facade.shouldIgnoreSpaceAutopilotHotkey = (event) => facade.shouldIgnoreSimulatorTextOrModifierTarget(event);
  return facade;
}
