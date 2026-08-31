import { createPlayerProfileRuntimeImportService } from "./player-profile-runtime-import-service.mjs";
import { createPlayerProfileRuntimeMedicalSyncService } from "./player-profile-runtime-medical-sync-service.mjs";
import { createPlayerProfileRuntimeStateService } from "./player-profile-runtime-state-service.mjs";
import { createPlayerProfileRuntimeWriteService } from "./player-profile-runtime-write-service.mjs";
import { createSquadMedicalStatusService } from "./squad-medical-status-service.mjs";
import { createSquadRosterRuntimeController } from "./squad-roster-runtime-controller.mjs";
export function createPlayerProfileRuntimeFacade(deps = {}) {
  const win = deps.win ?? globalThis;
  const ui = deps.ui ?? {};
  const call = (name, ...args) => deps[name]?.(...args);
  let ageCacheState = null;
  let ageHydrationTimer = 0;
  let ageHydrationPending = false;
  let ageHydrationLastFingerprint = "";
  let autosaveTimer = 0;
  let autosaveLastSignature = "";
  let importUndoHistory = [];
  let lastImportSnapshot = null;
  let newPlayerDraft = {};
  let pendingImportPlan = null;
  let runtimeImportService = null;
  let runtimeMedicalSyncService = null;
  let runtimeStateService = null;
  let runtimeWriteService = null;
  let squadRosterRuntimeController = null;
  let squadMedicalStatusService = null;
  const getProfilesState = () => call("getPlayerProfilesState") || null;
  const setProfilesState = (nextState) => call("setPlayerProfilesState", nextState);
  const getMedicalState = () => call("getMedicalState") || null;
  const setMedicalState = (nextState) => call("setMedicalState", nextState);
  const getNow = () => new Date().toISOString();

  function getPlayerProfileFormSignature(form) {
    try {
      return form ? JSON.stringify(call("getPlayerProfileFormValues", form)) : "";
    } catch {
      return "";
    }
  }

  function savePlayerProfileEditForm(form) {
    if (!form || !canEditPlayerProfiles()) return null;
    const values = call("getPlayerProfileFormValues", form);
    if (!values.playerId) return null;
    const signature = JSON.stringify(values);
    if (signature && signature === autosaveLastSignature) return { ok: true, skipped: true };
    const result = updatePlayerProfile(values);
    if (result?.ok) autosaveLastSignature = getPlayerProfileFormSignature(form);
    return result;
  }

  function queuePlayerProfileAutosave(form, delayMs = 420) {
    if (!form || !canEditPlayerProfiles()) return;
    win.clearTimeout(autosaveTimer);
    autosaveTimer = win.setTimeout(() => {
      autosaveTimer = 0;
      savePlayerProfileEditForm(form);
    }, delayMs);
  }

  function flushPlayerProfileAutosave() {
    const form = ui.playerProfilesWorkspace?.querySelector("#playerProfileEditForm");
    win.clearTimeout(autosaveTimer);
    autosaveTimer = 0;
    return savePlayerProfileEditForm(form);
  }

  function readPlayerProfileNewPlayerDraft() {
    const form = ui.playerProfilesWorkspace?.querySelector("#playerProfileNewPlayerForm");
    if (!form) {
      return newPlayerDraft;
    }
    try {
      const data = new win.FormData(form);
      newPlayerDraft = {
        name: String(data.get("name") ?? "").trim(),
        number: String(data.get("number") ?? "").trim(),
        birthDate: String(data.get("birthDate") ?? "").trim(),
        position: String(data.get("position") ?? "").trim(),
        primaryRole: String(data.get("primaryRole") ?? "").trim(),
        rosterType: String(data.get("rosterType") ?? "").trim(),
        temporaryGroup: String(data.get("temporaryGroup") ?? "").trim(),
        temporaryFrom: String(data.get("temporaryFrom") ?? "").trim(),
        temporaryTo: String(data.get("temporaryTo") ?? "").trim(),
      };
    } catch {
      return newPlayerDraft;
    }
    return newPlayerDraft;
  }

  runtimeStateService = createPlayerProfileRuntimeStateService({
    canCurrentUserEditWorkspace: deps.canCurrentUserEditWorkspace,
    comparePlayerProfiles: deps.comparePlayerProfiles,
    createDashboardId: deps.createDashboardId,
    defaultMedicalPlayers: deps.defaultMedicalPlayers,
    ensureMedicalState: deps.ensureMedicalState,
    fetchFn: (...args) => deps.fetchRef?.(...args),
    flushPlayerProfileAutosave,
    getCurrentPlatformUser: deps.getCurrentPlatformUser,
    getDefaultPlayerProfileRole: deps.getDefaultPlayerProfileRole,
    getHubState: deps.getHubState,
    getMedicalState,
    getNow,
    getPlatformApiAccessToken: deps.getPlatformApiAccessToken,
    getPlatformStructureState: deps.getPlatformStructureState,
    getPlatformTeamDisplayName: deps.getPlatformTeamDisplayName,
    getPlatformTeamDisplayTeam: deps.getPlatformTeamDisplayTeam,
    getPlayerProfileAgeCacheKey: deps.getPlayerProfileAgeCacheKey,
    getPlayerProfileAgeCacheState: () => ageCacheState,
    getPlayerProfileAgeHydrationLastFingerprint: () => ageHydrationLastFingerprint,
    getPlayerProfileAgeHydrationPending: () => ageHydrationPending,
    getPlayerProfileAgeHydrationTimer: () => ageHydrationTimer,
    getPlayerProfileAgeLookupSignature: deps.getPlayerProfileAgeLookupSignature,
    getPlayerProfileBirthDateValue: deps.getPlayerProfileBirthDateValue,
    getPlayerProfileFormSignature,
    getPlayerProfileModalOpen: deps.getPlayerProfileModalOpen,
    getPlayerProfileNewPlayerModalOpen: deps.getPlayerProfileNewPlayerModalOpen,
    getPlayerProfileRoleGroupForRole: deps.getPlayerProfileRoleGroupForRole,
    getPlayerProfileRosterTypeOption: deps.getPlayerProfileRosterTypeOption,
    getPlayerProfileSyncIdentityKeys: deps.getPlayerProfileSyncIdentityKeys,
    getPlayerProfilesState: getProfilesState,
    getPlayerProfilesWorkspace: () => ui.playerProfilesWorkspace,
    getSquadChangeSummary: deps.getSquadChangeSummary,
    getTemporaryRosterTypeFromPlayerSource: deps.getTemporaryRosterTypeFromPlayerSource,
    isCurrentPlatformUserAdmin: deps.isCurrentPlatformUserAdmin,
    isMedicalItemArchived: deps.isMedicalItemArchived,
    isTemporaryPlayerProfile: deps.isTemporaryPlayerProfile,
    logEvent: deps.logEvent,
    normalizePlayerProfile: deps.normalizePlayerProfile,
    normalizePlayerProfileAgeCacheEntry: deps.normalizePlayerProfileAgeCacheEntry,
    normalizePlayerProfileAgeValue: deps.normalizePlayerProfileAgeValue,
    normalizePlayerProfileBirthDate: deps.normalizePlayerProfileBirthDate,
    normalizePlayerProfileChangeLog: deps.normalizePlayerProfileChangeLog,
    normalizePlayerProfileChangeLogEntry: deps.normalizePlayerProfileChangeLogEntry,
    normalizePlayerProfileRemovedIds: deps.normalizePlayerProfileRemovedIds,
    normalizePlayerProfileRosterType: deps.normalizePlayerProfileRosterType,
    playerProfileAgeCacheStorageKey: deps.playerProfileAgeCacheStorageKey,
    playerProfileCountsInSquad: deps.playerProfileCountsInSquad,
    playerProfileRosterTypeCountsInSquad: deps.playerProfileRosterTypeCountsInSquad,
    playerProfilesDefaultRosterVersion: deps.playerProfilesDefaultRosterVersion,
    playerProfilesSchemaVersion: deps.playerProfilesSchemaVersion,
    playerProfilesStorageKey: deps.playerProfilesStorageKey,
    rawDataSafetySetItem: deps.rawDataSafetySetItem,
    renderPlayerProfilesRosterListOnly,
    renderPlayerProfilesWorkspace,
    setPlayerProfileAgeCacheState: (nextState) => {
      ageCacheState = nextState;
    },
    setPlayerProfileAgeHydrationLastFingerprint: (nextFingerprint) => {
      ageHydrationLastFingerprint = nextFingerprint;
    },
    setPlayerProfileAgeHydrationPending: (nextPending) => {
      ageHydrationPending = Boolean(nextPending);
    },
    setPlayerProfileAgeHydrationTimer: (nextTimer) => {
      ageHydrationTimer = nextTimer;
    },
    setPlayerProfileAutosaveLastSignature: (nextSignature) => {
      autosaveLastSignature = nextSignature;
    },
    setPlayerProfileModalOpen: deps.setPlayerProfileModalOpen,
    setPlayerProfileNewPlayerModalOpen: deps.setPlayerProfileNewPlayerModalOpen,
    setPlayerProfilesState: setProfilesState,
    win,
  });

  squadMedicalStatusService = createSquadMedicalStatusService({
    ensureMedicalState: deps.ensureMedicalState,
    formatDateValue: deps.formatDateValue,
    formatMedicalDateLabel: deps.formatMedicalDateLabel,
    getActiveMedicalInjuryPlan: deps.getActiveMedicalInjuryPlan,
    getLatestMedicalRecord: deps.getLatestMedicalRecord,
    getMedicalRecommendationActivityContext: deps.getMedicalRecommendationActivityContext,
    getMedicalRecordStatus: deps.getMedicalRecordStatus,
    getMedicalRtpPhaseOption: deps.getMedicalRtpPhaseOption,
    getMedicalState,
    getPlayerProfileById: (playerId) =>
      (getProfilesState()?.players || []).find((player) => player.id === playerId) || null,
    getPlayerAvailabilityStatusForDate: (playerId, dateValue) =>
      deps.getMedicalPlayerAvailabilityStatusForDate?.({ id: playerId }, dateValue) || "",
    getTeamTrainingDateValues: deps.getTeamTrainingDateValues,
    medicalActualParticipationFallback: deps.medicalActualParticipationFallback,
  });

  squadRosterRuntimeController = createSquadRosterRuntimeController({
    createMedicalSnapshotContext: (options) => squadMedicalStatusService.createPlayerProfileMedicalSnapshotContext(options),
    ensureMedicalState: deps.ensureMedicalState,
    ensurePlayerProfilesState,
    getMedicalSnapshot: (...args) => squadMedicalStatusService.getPlayerProfileMedicalSnapshot(...args),
    getPlayers: () => getProfilesState()?.players || [],
    getRosterSummary: deps.getPlayerProfilesRosterSummary,
    getTemporaryPlayerProfiles: getAllTemporaryPlayerProfiles,
    getVisiblePlayerProfiles,
    getWorkspace: () => ui.playerProfilesWorkspace,
    queueAgeHydration: queuePlayerProfileAgeHydration,
    renderRosterSections: renderSquadRosterSections,
    renderWorkspace: renderPlayerProfilesWorkspace,
    win,
  });

  function getVisiblePlayerProfiles() {
    ensurePlayerProfilesState();
    return deps.playerProfileRosterUiSelectors.getVisibleProfiles(getProfilesState().players, {
      query: deps.getPlayerProfilesSearchQuery(),
      roleGroupFilter: deps.getPlayerProfilesRoleGroupFilter(),
      rosterFilter: deps.getPlayerProfilesRosterFilter(),
    });
  }

  function getAllTemporaryPlayerProfiles() {
    ensurePlayerProfilesState();
    return deps.playerProfileRosterUiSelectors.getTemporaryProfiles(getProfilesState().players);
  }

  function renderPlayerProfileStatusChip(statusKey, medicalSnapshot = null) {
    return deps.squadRosterRenderer.renderStatusChip(statusKey, medicalSnapshot);
  }

  function renderSquadRosterSections(visiblePlayers = [], summaries = {}) {
    return deps.squadRosterRenderer.renderRosterSections(visiblePlayers, summaries);
  }

  function renderPlayerProfilesRosterListOnly(renderOptions = {}) {
    return squadRosterRuntimeController?.renderListOnly(renderOptions);
  }

  runtimeImportService = createPlayerProfileRuntimeImportService({
    buildPlayerProfileImportFeedbackMessage: deps.buildPlayerProfileImportFeedbackMessage,
    buildPlayerProfileImportPlan: deps.buildPlayerProfileImportPlan,
    buildPlayerProfileImportPreviewMessage: deps.buildPlayerProfileImportPreviewMessage,
    canEditPlayerProfiles,
    cloneMedicalState: deps.cloneMedicalState,
    clonePlayerProfilesState,
    comparePlayerProfiles: deps.comparePlayerProfiles,
    ensureMedicalState: deps.ensureMedicalState,
    ensurePlayerProfilesState,
    FileReaderCtor: win.FileReader || (typeof FileReader !== "undefined" ? FileReader : null),
    getCurrentSquadActorLabel,
    getMedicalState,
    getNow,
    getPendingPlayerProfileImportPlan: () => pendingImportPlan,
    getPlayerProfileImportUndoHistoryState: () => importUndoHistory,
    getPlayerProfileImportUndoRelativeTimeLabel: deps.getPlayerProfileImportUndoRelativeTimeLabel,
    getPlayerProfileLastImportSnapshot: () => lastImportSnapshot,
    getPlayerProfilesState: getProfilesState,
    getRecentPlayerProfileChangeLog,
    normalizePlayerProfileRemovedIds: deps.normalizePlayerProfileRemovedIds,
    playerProfileImportUndoHistoryLimit: deps.playerProfileImportUndoHistoryLimit,
    recordPlayerProfileChange,
    renderPendingPlayerProfileImport: (plan, preview, canEdit) => deps.squadWorkspaceRenderer.renderPendingImport(plan, preview, canEdit),
    renderPlayerProfilesWorkspace,
    setMedicalState,
    setPendingPlayerProfileImportPlan: (nextPlan) => {
      pendingImportPlan = nextPlan;
    },
    setPlayerProfileImportUndoHistoryState: (nextHistory) => {
      importUndoHistory = nextHistory;
    },
    setPlayerProfileLastImportSnapshot: (nextSnapshot) => {
      lastImportSnapshot = nextSnapshot;
    },
    setPlayerProfilesState: setProfilesState,
    syncMedicalPlayersFromPlayerProfiles,
    writeMedicalState: deps.writeMedicalState,
    writePlayerProfilesState,
  });

  function renderPlayerProfilesWorkspace(message = "", renderOptions = {}) {
    if (!ui.playerProfilesWorkspace) {
      return;
    }
    const { generation: hydrationGeneration } = squadRosterRuntimeController.beginWorkspaceRender();
    ensurePlayerProfilesState();
    deps.ensureMedicalState();
    syncPlayerProfilesFromMedicalTrainingGuests({ medicalStateReady: true });
    const visiblePlayers = getVisiblePlayerProfiles();
    const selectedPlayer = getSelectedPlayerProfile();
    const rosterSummary = deps.getPlayerProfilesRosterSummary(getProfilesState().players);
    const visibleSummary = deps.getPlayerProfilesRosterSummary(visiblePlayers);
    const platformStructure = deps.getPlatformStructureState();
    const currentPlatformUser = deps.getCurrentPlatformUser();
    const squadTeam = deps.getPlatformTeamDisplayTeam(currentPlatformUser, platformStructure);
    const squadTeamName = squadTeam?.name || deps.getPlatformTeamDisplayName(currentPlatformUser, platformStructure);
    const canEdit = renderOptions.canEdit === true || (renderOptions.canEdit !== false && canEditPlayerProfiles());
    const newPlayerModalMarkup = deps.squadProfileSupportRenderer.renderNewPlayerModal(readPlayerProfileNewPlayerDraft());
    const medicalSnapshotContext = squadMedicalStatusService.createPlayerProfileMedicalSnapshotContext({
      medicalStateReady: true,
      includeTrainingAvailability: false,
    });
    const rosterSectionsMarkup = renderSquadRosterSections(visiblePlayers, {
      rosterSummary,
      visibleSummary,
      medicalStateReady: true,
      includeTrainingAvailability: false,
      medicalSnapshotContext,
    });
    ui.playerProfilesWorkspace.innerHTML = deps.squadWorkspaceRenderer.renderWorkspace({
      canEdit,
      messageMarkup: message ? deps.renderPlayerProfilesWorkspaceMessage(message) : "",
      newPlayerModalMarkup,
      pendingImportMarkup: renderPendingPlayerProfileImport(),
      playerModalMarkup: deps.squadProfileSelectedRenderer.renderModal(selectedPlayer),
      roleGroupFilter: deps.getPlayerProfilesRoleGroupFilter(),
      roleGroupOptionsMarkup: deps.squadProfileSupportRenderer.renderOptionSet(deps.playerProfileRoleGroupOptions, deps.getPlayerProfilesRoleGroupFilter()),
      rosterFilterOptionsMarkup: deps.squadProfileSupportRenderer.renderOptionSet(deps.playerProfileRosterFilterOptions, deps.getPlayerProfilesRosterFilter()),
      rosterSectionsMarkup,
      searchQuery: deps.getPlayerProfilesSearchQuery(),
      teamLogoMarkup: deps.renderPlatformTeamLogoMark(squadTeam || { name: squadTeamName }, { teamName: squadTeamName, canUpload: canEdit }),
      teamName: squadTeamName,
    });
    queuePlayerProfileAgeHydration();
    squadRosterRuntimeController.queueAvailabilityHydration(hydrationGeneration);
  }

  runtimeMedicalSyncService = createPlayerProfileRuntimeMedicalSyncService({
    canViewPrivateMedicalDetails: deps.canViewPrivateMedicalDetails,
    commitMedicalClinicalState: deps.commitMedicalClinicalState,
    createDashboardId: deps.createDashboardId,
    ensureMedicalState: deps.ensureMedicalState,
    ensurePlayerProfilesState,
    getActiveMedicalPlayers: deps.getActiveMedicalPlayers,
    getCurrentMedicalActorId: deps.getCurrentMedicalActorId,
    getMedicalState,
    getNow,
    isMedicalItemArchived: deps.isMedicalItemArchived,
    normalizeMedicalInjuryPlan: deps.normalizeMedicalInjuryPlan,
    normalizeMedicalPlayer: deps.normalizeMedicalPlayer,
    normalizeMedicalRecord: deps.normalizeMedicalRecord,
    normalizePlayerProfileName: deps.normalizePlayerProfileName,
    normalizePlayerProfileRemovedIds: deps.normalizePlayerProfileRemovedIds,
    setMedicalState,
    upsertMedicalPlayers: deps.upsertMedicalPlayers,
    writeMedicalState: deps.writeMedicalState,
  });

  runtimeWriteService = createPlayerProfileRuntimeWriteService({
    archiveMedicalPlayersForRemovedPlayerProfile,
    comparePlayerProfiles: deps.comparePlayerProfiles,
    ensurePlayerProfilesState,
    formatPlayerProfileChangeValue: deps.formatPlayerProfileChangeValue,
    getNow,
    getPlayerProfileChangeDiffs: deps.getPlayerProfileChangeDiffs,
    getPlayerProfileRoleGroupForRole: deps.getPlayerProfileRoleGroupForRole,
    getPlayerProfilesState: getProfilesState,
    isCurrentPlatformUserAdmin: deps.isCurrentPlatformUserAdmin,
    normalizePlayerProfile: deps.normalizePlayerProfile,
    normalizePlayerProfileRemovedIds: deps.normalizePlayerProfileRemovedIds,
    normalizePlayerProfileRole: deps.normalizePlayerProfileRole,
    normalizePlayerProfileRosterType: deps.normalizePlayerProfileRosterType,
    playerProfileRoleGroupOptions: deps.playerProfileRoleGroupOptions,
    playerProfileRosterTypeCountsInSquad: deps.playerProfileRosterTypeCountsInSquad,
    playerProfileRosterTypeOptions: deps.playerProfileRosterTypeOptions,
    playerProfileSquadStatusOptions: deps.playerProfileSquadStatusOptions,
    recordPlayerProfileChange,
    setPlayerProfilesState: setProfilesState,
    syncMedicalPlayersFromPlayerProfiles,
    validatePlayerProfileFormValues: deps.validatePlayerProfileFormValues,
    writePlayerProfilesState,
  });

  if (win) {
    win.footballSciencePlayerProfiles = {
      getState: () => clonePlayerProfilesState(ensurePlayerProfilesState()),
      getPlayersForSessionPlanner: deps.getSessionPlannerPlayerProfileContracts,
      getPlayerForSessionPlanner: deps.getSessionPlannerPlayerProfileContract,
      getDataFoundationPayload: deps.buildSquadDataFoundationPayload,
      getDataQualityReport: deps.buildSquadDataQualityReport,
      getSessionPlannerContractsV2: deps.buildSquadSessionPlannerContracts,
    };
  }

  function method(serviceRef, methodName, ...args) {
    return serviceRef?.[methodName]?.(...args);
  }

  function readPlayerProfileAgeCache(...args) { return method(runtimeStateService, "readPlayerProfileAgeCache", ...args); }
  function ensurePlayerProfileAgeCache(...args) { return method(runtimeStateService, "ensurePlayerProfileAgeCache", ...args); }
  function writePlayerProfileAgeCache(...args) { return method(runtimeStateService, "writePlayerProfileAgeCache", ...args); }
  function getPlayerProfileAgeCacheEntry(...args) { return method(runtimeStateService, "getPlayerProfileAgeCacheEntry", ...args); }
  function getCurrentSquadActorLabel(...args) { return method(runtimeStateService, "getCurrentSquadActorLabel", ...args); }
  function recordPlayerProfileChange(...args) { return method(runtimeStateService, "recordPlayerProfileChange", ...args); }
  function getPlayerProfileChangeLog(...args) { return method(runtimeStateService, "getPlayerProfileChangeLog", ...args); }
  function getRecentPlayerProfileChangeLog(...args) { return method(runtimeStateService, "getRecentPlayerProfileChangeLog", ...args); }
  function clonePlayerProfilesState(...args) { return method(runtimeStateService, "clonePlayerProfilesState", ...args); }
  function buildPlayerProfileFromMedicalTrainingGuest(...args) { return method(runtimeStateService, "buildPlayerProfileFromMedicalTrainingGuest", ...args); }
  function syncPlayerProfilesFromMedicalTrainingGuests(...args) { return method(runtimeStateService, "syncPlayerProfilesFromMedicalTrainingGuests", ...args); }
  function readPlayerProfilesState(...args) { return method(runtimeStateService, "readPlayerProfilesState", ...args); }
  function writePlayerProfilesState(...args) { return method(runtimeStateService, "writePlayerProfilesState", ...args); }
  function getPlayerProfileAgeHydrationCandidates(...args) { return method(runtimeStateService, "getPlayerProfileAgeHydrationCandidates", ...args); }
  function buildPlayerProfileAgeHydrationPayload(...args) { return method(runtimeStateService, "buildPlayerProfileAgeHydrationPayload", ...args); }
  function mergePlayerProfileAgeHydrationResult(...args) { return method(runtimeStateService, "mergePlayerProfileAgeHydrationResult", ...args); }
  function hydratePlayerProfileAgesOnce(...args) { return method(runtimeStateService, "hydratePlayerProfileAgesOnce", ...args); }
  function queuePlayerProfileAgeHydration(...args) { return method(runtimeStateService, "queuePlayerProfileAgeHydration", ...args); }
  function ensurePlayerProfilesState(...args) { return method(runtimeStateService, "ensurePlayerProfilesState", ...args); }
  function canEditPlayerProfiles(...args) { return method(runtimeStateService, "canEditPlayerProfiles", ...args); }
  function getPlayerProfilesAccessLabel(...args) { return method(runtimeStateService, "getPlayerProfilesAccessLabel", ...args); }
  function getSelectedPlayerProfile(...args) { return method(runtimeStateService, "getSelectedPlayerProfile", ...args); }
  function openPlayerProfileModal(...args) { return method(runtimeStateService, "openPlayerProfileModal", ...args); }
  function closePlayerProfileModal(...args) { return method(runtimeStateService, "closePlayerProfileModal", ...args); }
  function openPlayerProfileNewPlayerModal(...args) {
    newPlayerDraft = {};
    return method(runtimeStateService, "openPlayerProfileNewPlayerModal", ...args);
  }
  function closePlayerProfileNewPlayerModal(...args) {
    newPlayerDraft = {};
    return method(runtimeStateService, "closePlayerProfileNewPlayerModal", ...args);
  }
  function buildPlayerProfileImportFeedback(...args) { return method(runtimeImportService, "buildPlayerProfileImportFeedback", ...args); }
  function createPlayerProfileImportUndoSnapshot(...args) { return method(runtimeImportService, "createPlayerProfileImportUndoSnapshot", ...args); }
  function clearPlayerProfileImportUndoSnapshots(...args) { return method(runtimeImportService, "clearPlayerProfileImportUndoSnapshots", ...args); }
  function registerPlayerProfileImportUndoSnapshot(...args) { return method(runtimeImportService, "registerPlayerProfileImportUndoSnapshot", ...args); }
  function getPlayerProfileImportUndoHistory(...args) { return method(runtimeImportService, "getPlayerProfileImportUndoHistory", ...args); }
  function getPlayerProfileImportUndoState(...args) { return method(runtimeImportService, "getPlayerProfileImportUndoState", ...args); }
  function applyPlayerProfileImportUndo(...args) { return method(runtimeImportService, "applyPlayerProfileImportUndo", ...args); }
  function importSquadDataFoundationPayload(...args) { return method(runtimeImportService, "importSquadDataFoundationPayload", ...args); }
  function importSquadDataFoundationFile(...args) { return method(runtimeImportService, "importSquadDataFoundationFile", ...args); }
  function renderPendingPlayerProfileImport(...args) { return method(runtimeImportService, "renderPendingPlayerProfileImport", ...args); }
  function buildMedicalPlayerFromPlayerProfile(...args) { return method(runtimeMedicalSyncService, "buildMedicalPlayerFromPlayerProfile", ...args); }
  function syncMedicalPlayersFromPlayerProfiles(...args) { return method(runtimeMedicalSyncService, "syncMedicalPlayersFromPlayerProfiles", ...args); }
  function getMedicalPlayersMatchingPlayerProfile(...args) { return method(runtimeMedicalSyncService, "getMedicalPlayersMatchingPlayerProfile", ...args); }
  function getMedicalRemovedSquadPlayerIdSet(...args) { return method(runtimeMedicalSyncService, "getMedicalRemovedSquadPlayerIdSet", ...args); }
  function isMedicalPlayerRemovedFromSquad(...args) { return method(runtimeMedicalSyncService, "isMedicalPlayerRemovedFromSquad", ...args); }
  function archiveMedicalPlayersRemovedFromSquad(...args) { return method(runtimeMedicalSyncService, "archiveMedicalPlayersRemovedFromSquad", ...args); }
  function archiveMedicalPlayersForRemovedPlayerProfile(...args) { return method(runtimeMedicalSyncService, "archiveMedicalPlayersForRemovedPlayerProfile", ...args); }
  function addPlayerProfile(...args) { return method(runtimeWriteService, "addPlayerProfile", ...args); }
  function updatePlayerProfile(...args) { return method(runtimeWriteService, "updatePlayerProfile", ...args); }
  function removePlayerProfile(...args) { return method(runtimeWriteService, "removePlayerProfile", ...args); }
  function getLatestManualMedicalLog(...args) { return method(squadMedicalStatusService, "getLatestManualMedicalLog", ...args); }
  function getPlayerProfileMedicalStatusOverride(...args) { return method(squadMedicalStatusService, "getPlayerProfileMedicalStatusOverride", ...args); }
  function getPlayerProfileEffectiveStatusFromSnapshot(...args) { return method(squadMedicalStatusService, "getPlayerProfileEffectiveStatusFromSnapshot", ...args); }
  function getPlayerProfileEffectiveStatus(...args) { return method(squadMedicalStatusService, "getPlayerProfileEffectiveStatus", ...args); }
  function getPlayerProfileMedicalSnapshot(...args) { return method(squadMedicalStatusService, "getPlayerProfileMedicalSnapshot", ...args); }

  return {
    addPlayerProfile,
    applyPlayerProfileImportUndo,
    archiveMedicalPlayersForRemovedPlayerProfile,
    archiveMedicalPlayersRemovedFromSquad,
    buildMedicalPlayerFromPlayerProfile,
    buildPlayerProfileFromMedicalTrainingGuest,
    buildPlayerProfileImportFeedback,
    buildPlayerProfileAgeHydrationPayload,
    canEditPlayerProfiles,
    clearPlayerProfileImportUndoSnapshots,
    clonePlayerProfilesState,
    closePlayerProfileModal,
    closePlayerProfileNewPlayerModal,
    createPlayerProfileImportUndoSnapshot,
    ensurePlayerProfileAgeCache,
    ensurePlayerProfilesState,
    flushPlayerProfileAutosave,
    getAllTemporaryPlayerProfiles,
    getCurrentSquadActorLabel,
    getLatestManualMedicalLog,
    getMedicalPlayersMatchingPlayerProfile,
    getMedicalRemovedSquadPlayerIdSet,
    getPendingPlayerProfileImportPlan: () => pendingImportPlan,
    getPlayerProfileAgeCacheEntry,
    getPlayerProfileAgeHydrationCandidates,
    getPlayerProfileChangeLog,
    getPlayerProfileEffectiveStatus,
    getPlayerProfileEffectiveStatusFromSnapshot,
    getPlayerProfileImportUndoHistory,
    getPlayerProfileImportUndoState,
    getPlayerProfileMedicalSnapshot,
    getPlayerProfileMedicalStatusOverride,
    getPlayerProfilesAccessLabel,
    getRecentPlayerProfileChangeLog,
    getSelectedPlayerProfile,
    getVisiblePlayerProfiles,
    getPlayerProfileFormSignature,
    hydratePlayerProfileAgesOnce,
    importSquadDataFoundationFile,
    importSquadDataFoundationPayload,
    isMedicalPlayerRemovedFromSquad,
    mergePlayerProfileAgeHydrationResult,
    openPlayerProfileModal,
    openPlayerProfileNewPlayerModal,
    queuePlayerProfileAgeHydration,
    queuePlayerProfileAutosave,
    readPlayerProfileAgeCache,
    readPlayerProfilesState,
    registerPlayerProfileImportUndoSnapshot,
    removePlayerProfile,
    renderPendingPlayerProfileImport,
    renderPlayerProfileStatusChip,
    renderPlayerProfilesRosterListOnly,
    renderPlayerProfilesWorkspace,
    renderSquadRosterSections,
    savePlayerProfileEditForm,
    setPendingPlayerProfileImportPlan: (nextPlan) => { pendingImportPlan = nextPlan; },
    setPlayerProfileAutosaveLastSignature: (nextSignature) => { autosaveLastSignature = nextSignature; },
    syncMedicalPlayersFromPlayerProfiles,
    syncPlayerProfilesFromMedicalTrainingGuests,
    updatePlayerProfile,
    writePlayerProfileAgeCache,
    writePlayerProfilesState,
  };
}
