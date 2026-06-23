let getPlayerProfileRuntimeFacade = () => null;

export const playerProfileRuntimeAccessorNames = Object.freeze([
  "readPlayerProfileAgeCache",
  "ensurePlayerProfileAgeCache",
  "writePlayerProfileAgeCache",
  "getPlayerProfileAgeCacheEntry",
  "getCurrentSquadActorLabel",
  "recordPlayerProfileChange",
  "getPlayerProfileChangeLog",
  "getRecentPlayerProfileChangeLog",
  "clonePlayerProfilesState",
  "buildPlayerProfileFromMedicalTrainingGuest",
  "syncPlayerProfilesFromMedicalTrainingGuests",
  "readPlayerProfilesState",
  "writePlayerProfilesState",
  "getPlayerProfileAgeHydrationCandidates",
  "buildPlayerProfileAgeHydrationPayload",
  "mergePlayerProfileAgeHydrationResult",
  "hydratePlayerProfileAgesOnce",
  "queuePlayerProfileAgeHydration",
  "ensurePlayerProfilesState",
  "canEditPlayerProfiles",
  "getPlayerProfilesAccessLabel",
  "getSelectedPlayerProfile",
  "openPlayerProfileModal",
  "closePlayerProfileModal",
  "openPlayerProfileNewPlayerModal",
  "closePlayerProfileNewPlayerModal",
  "getLatestManualMedicalLog",
  "getPlayerProfileMedicalStatusOverride",
  "getPlayerProfileEffectiveStatusFromSnapshot",
  "getPlayerProfileEffectiveStatus",
  "getPlayerProfileMedicalSnapshot",
  "getPlayerProfileRtpCoachStatus",
  "getVisiblePlayerProfiles",
  "getAllTemporaryPlayerProfiles",
  "renderPlayerProfileStatusChip",
  "renderSquadRosterSections",
  "renderPlayerProfilesRosterListOnly",
  "buildPlayerProfileImportFeedback",
  "createPlayerProfileImportUndoSnapshot",
  "clearPlayerProfileImportUndoSnapshots",
  "registerPlayerProfileImportUndoSnapshot",
  "getPlayerProfileImportUndoHistory",
  "getPlayerProfileImportUndoState",
  "applyPlayerProfileImportUndo",
  "importSquadDataFoundationPayload",
  "importSquadDataFoundationFile",
  "renderPendingPlayerProfileImport",
  "renderPlayerProfilesWorkspace",
  "getPlayerProfileFormSignature",
  "savePlayerProfileEditForm",
  "queuePlayerProfileAutosave",
  "flushPlayerProfileAutosave",
  "buildMedicalPlayerFromPlayerProfile",
  "syncMedicalPlayersFromPlayerProfiles",
  "getMedicalPlayersMatchingPlayerProfile",
  "getMedicalRemovedSquadPlayerIdSet",
  "isMedicalPlayerRemovedFromSquad",
  "archiveMedicalPlayersRemovedFromSquad",
  "archiveMedicalPlayersForRemovedPlayerProfile",
  "addPlayerProfile",
  "updatePlayerProfile",
  "removePlayerProfile",
  "getPendingPlayerProfileImportPlan",
  "setPendingPlayerProfileImportPlan",
  "setPlayerProfileAutosaveLastSignature",
]);

export function configurePlayerProfileRuntimeAccessors(nextGetPlayerProfileRuntimeFacade) {
  if (typeof nextGetPlayerProfileRuntimeFacade !== "function") {
    throw new TypeError("Player profile runtime accessors require a facade getter.");
  }
  getPlayerProfileRuntimeFacade = nextGetPlayerProfileRuntimeFacade;
}

function callPlayerProfileRuntimeFacade(methodName, args) {
  const facade = getPlayerProfileRuntimeFacade();
  const method = facade?.[methodName];
  if (typeof method !== "function") {
    throw new ReferenceError(`Player profile runtime facade.${methodName} is not configured.`);
  }
  return method(...args);
}

function createPlayerProfileRuntimeAccessor(methodName) {
  return (...args) => callPlayerProfileRuntimeFacade(methodName, args);
}

export const readPlayerProfileAgeCache = createPlayerProfileRuntimeAccessor("readPlayerProfileAgeCache");
export const ensurePlayerProfileAgeCache = createPlayerProfileRuntimeAccessor("ensurePlayerProfileAgeCache");
export const writePlayerProfileAgeCache = createPlayerProfileRuntimeAccessor("writePlayerProfileAgeCache");
export const getPlayerProfileAgeCacheEntry = createPlayerProfileRuntimeAccessor("getPlayerProfileAgeCacheEntry");
export const getCurrentSquadActorLabel = createPlayerProfileRuntimeAccessor("getCurrentSquadActorLabel");
export const recordPlayerProfileChange = createPlayerProfileRuntimeAccessor("recordPlayerProfileChange");
export const getPlayerProfileChangeLog = createPlayerProfileRuntimeAccessor("getPlayerProfileChangeLog");
export const getRecentPlayerProfileChangeLog = createPlayerProfileRuntimeAccessor("getRecentPlayerProfileChangeLog");
export const clonePlayerProfilesState = createPlayerProfileRuntimeAccessor("clonePlayerProfilesState");
export const buildPlayerProfileFromMedicalTrainingGuest = createPlayerProfileRuntimeAccessor("buildPlayerProfileFromMedicalTrainingGuest");
export const syncPlayerProfilesFromMedicalTrainingGuests = createPlayerProfileRuntimeAccessor("syncPlayerProfilesFromMedicalTrainingGuests");
export const readPlayerProfilesState = createPlayerProfileRuntimeAccessor("readPlayerProfilesState");
export const writePlayerProfilesState = createPlayerProfileRuntimeAccessor("writePlayerProfilesState");
export const getPlayerProfileAgeHydrationCandidates = createPlayerProfileRuntimeAccessor("getPlayerProfileAgeHydrationCandidates");
export const buildPlayerProfileAgeHydrationPayload = createPlayerProfileRuntimeAccessor("buildPlayerProfileAgeHydrationPayload");
export const mergePlayerProfileAgeHydrationResult = createPlayerProfileRuntimeAccessor("mergePlayerProfileAgeHydrationResult");
export const hydratePlayerProfileAgesOnce = createPlayerProfileRuntimeAccessor("hydratePlayerProfileAgesOnce");
export const queuePlayerProfileAgeHydration = createPlayerProfileRuntimeAccessor("queuePlayerProfileAgeHydration");
export const ensurePlayerProfilesState = createPlayerProfileRuntimeAccessor("ensurePlayerProfilesState");
export const canEditPlayerProfiles = createPlayerProfileRuntimeAccessor("canEditPlayerProfiles");
export const getPlayerProfilesAccessLabel = createPlayerProfileRuntimeAccessor("getPlayerProfilesAccessLabel");
export const getSelectedPlayerProfile = createPlayerProfileRuntimeAccessor("getSelectedPlayerProfile");
export const openPlayerProfileModal = createPlayerProfileRuntimeAccessor("openPlayerProfileModal");
export const closePlayerProfileModal = createPlayerProfileRuntimeAccessor("closePlayerProfileModal");
export const openPlayerProfileNewPlayerModal = createPlayerProfileRuntimeAccessor("openPlayerProfileNewPlayerModal");
export const closePlayerProfileNewPlayerModal = createPlayerProfileRuntimeAccessor("closePlayerProfileNewPlayerModal");
export const getLatestManualMedicalLog = createPlayerProfileRuntimeAccessor("getLatestManualMedicalLog");
export const getPlayerProfileMedicalStatusOverride = createPlayerProfileRuntimeAccessor("getPlayerProfileMedicalStatusOverride");
export const getPlayerProfileEffectiveStatusFromSnapshot = createPlayerProfileRuntimeAccessor("getPlayerProfileEffectiveStatusFromSnapshot");
export const getPlayerProfileEffectiveStatus = createPlayerProfileRuntimeAccessor("getPlayerProfileEffectiveStatus");
export const getPlayerProfileMedicalSnapshot = createPlayerProfileRuntimeAccessor("getPlayerProfileMedicalSnapshot");
export const getPlayerProfileRtpCoachStatus = createPlayerProfileRuntimeAccessor("getPlayerProfileRtpCoachStatus");
export const getVisiblePlayerProfiles = createPlayerProfileRuntimeAccessor("getVisiblePlayerProfiles");
export const getAllTemporaryPlayerProfiles = createPlayerProfileRuntimeAccessor("getAllTemporaryPlayerProfiles");
export const renderPlayerProfileStatusChip = createPlayerProfileRuntimeAccessor("renderPlayerProfileStatusChip");
export const renderSquadRosterSections = createPlayerProfileRuntimeAccessor("renderSquadRosterSections");
export const renderPlayerProfilesRosterListOnly = createPlayerProfileRuntimeAccessor("renderPlayerProfilesRosterListOnly");
export const buildPlayerProfileImportFeedback = createPlayerProfileRuntimeAccessor("buildPlayerProfileImportFeedback");
export const createPlayerProfileImportUndoSnapshot = createPlayerProfileRuntimeAccessor("createPlayerProfileImportUndoSnapshot");
export const clearPlayerProfileImportUndoSnapshots = createPlayerProfileRuntimeAccessor("clearPlayerProfileImportUndoSnapshots");
export const registerPlayerProfileImportUndoSnapshot = createPlayerProfileRuntimeAccessor("registerPlayerProfileImportUndoSnapshot");
export const getPlayerProfileImportUndoHistory = createPlayerProfileRuntimeAccessor("getPlayerProfileImportUndoHistory");
export const getPlayerProfileImportUndoState = createPlayerProfileRuntimeAccessor("getPlayerProfileImportUndoState");
export const applyPlayerProfileImportUndo = createPlayerProfileRuntimeAccessor("applyPlayerProfileImportUndo");
export const importSquadDataFoundationPayload = createPlayerProfileRuntimeAccessor("importSquadDataFoundationPayload");
export const importSquadDataFoundationFile = createPlayerProfileRuntimeAccessor("importSquadDataFoundationFile");
export const renderPendingPlayerProfileImport = createPlayerProfileRuntimeAccessor("renderPendingPlayerProfileImport");
export const renderPlayerProfilesWorkspace = createPlayerProfileRuntimeAccessor("renderPlayerProfilesWorkspace");
export const getPlayerProfileFormSignature = createPlayerProfileRuntimeAccessor("getPlayerProfileFormSignature");
export const savePlayerProfileEditForm = createPlayerProfileRuntimeAccessor("savePlayerProfileEditForm");
export const queuePlayerProfileAutosave = createPlayerProfileRuntimeAccessor("queuePlayerProfileAutosave");
export const flushPlayerProfileAutosave = createPlayerProfileRuntimeAccessor("flushPlayerProfileAutosave");
export const buildMedicalPlayerFromPlayerProfile = createPlayerProfileRuntimeAccessor("buildMedicalPlayerFromPlayerProfile");
export const syncMedicalPlayersFromPlayerProfiles = createPlayerProfileRuntimeAccessor("syncMedicalPlayersFromPlayerProfiles");
export const getMedicalPlayersMatchingPlayerProfile = createPlayerProfileRuntimeAccessor("getMedicalPlayersMatchingPlayerProfile");
export const getMedicalRemovedSquadPlayerIdSet = createPlayerProfileRuntimeAccessor("getMedicalRemovedSquadPlayerIdSet");
export const isMedicalPlayerRemovedFromSquad = createPlayerProfileRuntimeAccessor("isMedicalPlayerRemovedFromSquad");
export const archiveMedicalPlayersRemovedFromSquad = createPlayerProfileRuntimeAccessor("archiveMedicalPlayersRemovedFromSquad");
export const archiveMedicalPlayersForRemovedPlayerProfile = createPlayerProfileRuntimeAccessor("archiveMedicalPlayersForRemovedPlayerProfile");
export const addPlayerProfile = createPlayerProfileRuntimeAccessor("addPlayerProfile");
export const updatePlayerProfile = createPlayerProfileRuntimeAccessor("updatePlayerProfile");
export const removePlayerProfile = createPlayerProfileRuntimeAccessor("removePlayerProfile");
export const getPendingPlayerProfileImportPlan = createPlayerProfileRuntimeAccessor("getPendingPlayerProfileImportPlan");
export const setPendingPlayerProfileImportPlan = createPlayerProfileRuntimeAccessor("setPendingPlayerProfileImportPlan");
export const setPlayerProfileAutosaveLastSignature = createPlayerProfileRuntimeAccessor("setPlayerProfileAutosaveLastSignature");
