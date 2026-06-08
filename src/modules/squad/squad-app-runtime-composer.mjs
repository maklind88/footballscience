import { createPlayerProfileHelpers } from "./player-profile-helpers.mjs";
import { createPlayerProfileIntelligenceHelpers } from "./player-profile-intelligence-helpers.mjs";
import { createPlayerProfileFormValueReader, createPlayerProfileRosterUiSelectors } from "./player-profile-ui-helpers.mjs";
import { createSquadDataFoundationHelpers } from "./squad-data-foundation.mjs";
import { createSquadImportPlanner } from "./squad-import-planner.mjs";

export function createSquadAppRuntimeComposition(deps = {}) {
  const fallbackComparePlayers = typeof deps.compareMedicalPlayers === "function"
    ? deps.compareMedicalPlayers
    : undefined;

  const playerProfileHelpers = createPlayerProfileHelpers({
    changeLogLimit: deps.playerProfileChangeLogLimit,
    comparePlayers: fallbackComparePlayers,
    createId: deps.createDashboardId,
    getAgeCacheEntry: deps.getPlayerProfileAgeCacheEntry,
    getNow: () => new Date().toISOString(),
    isDateValue: deps.isMedicalDateValue,
  });

  const comparePlayerProfiles = typeof deps.comparePlayerProfiles === "function"
    ? deps.comparePlayerProfiles
    : playerProfileHelpers.comparePlayerProfiles;

  const getPlayerProfileFormValues = createPlayerProfileFormValueReader({
    attributeGroups: deps.playerProfileAttributeGroups,
    normalizeNumber: playerProfileHelpers.normalizePlayerProfileNumber,
  });

  const playerProfileRosterUiSelectors = createPlayerProfileRosterUiSelectors({
    compareProfiles: comparePlayerProfiles,
    countsInSquad: playerProfileHelpers.playerProfileCountsInSquad,
    getRosterLabel: playerProfileHelpers.getPlayerProfileRosterLabel,
    isTemporaryProfile: playerProfileHelpers.isTemporaryPlayerProfile,
    normalizeRosterType: playerProfileHelpers.normalizePlayerProfileRosterType,
  });
  const getPlayerProfilesRosterSummary = playerProfileRosterUiSelectors.getRosterSummary;

  const playerProfileIntelligenceHelpers = createPlayerProfileIntelligenceHelpers({
    formatDateValue: deps.formatScheduleDateValue,
    formatMedicalDateLabel: (...args) => deps.formatMedicalDateLabel(...args),
    getCompleteness: deps.getPlayerProfileCompleteness,
    getMedicalSnapshot: deps.getPlayerProfileMedicalSnapshot,
    isDateValue: deps.isMedicalDateValue,
    normalizeNumber: playerProfileHelpers.normalizePlayerProfileNumber,
    normalizeRole: playerProfileHelpers.normalizePlayerProfileRole,
    parseDateValue: deps.parseScheduleDateValue,
  });

  const squadDataFoundationHelpers = createSquadDataFoundationHelpers({
    ensureState: deps.ensurePlayerProfilesState,
    getPlayers: () => deps.getPlayerProfilesState().players,
    getStorageKey: () => deps.playerProfilesStorageKey,
    getNow: () => new Date().toISOString(),
    getFileDate: () => new Date().toISOString().slice(0, 10),
    getDataQualityFlags: playerProfileIntelligenceHelpers.getSquadPlayerDataQualityFlags,
    getPlayerCompleteness: deps.getPlayerProfileCompleteness,
    getRoleOptions: () => deps.playerProfileRoleOptions,
    getRoleDnaScore: playerProfileIntelligenceHelpers.getPlayerRoleDnaScore,
    getRoleFitScore: playerProfileIntelligenceHelpers.getPlayerProfileRoleFitScore,
    getRoleDnaBestMatches: playerProfileIntelligenceHelpers.getPlayerRoleDnaBestMatches,
    getMedicalSnapshot: deps.getPlayerProfileMedicalSnapshot,
    getEffectiveStatus: deps.getPlayerProfileEffectiveStatusFromSnapshot,
    getRosterSummary: getPlayerProfilesRosterSummary,
    getAttributeGroups: () => deps.playerProfileAttributeGroups,
    normalizeChangeLog: playerProfileHelpers.normalizePlayerProfileChangeLog,
    getChangeLog: () => deps.getPlayerProfilesState().changeLog,
    formatDateValue: deps.formatScheduleDateValue,
    isMedicalDateValue: deps.isMedicalDateValue,
  });

  const squadImportPlanner = createSquadImportPlanner({
    ensureState: deps.ensurePlayerProfilesState,
    getPlayers: () => deps.getPlayerProfilesState().players,
    normalizeProfile: playerProfileHelpers.normalizePlayerProfile,
    normalizeName: playerProfileHelpers.normalizePlayerProfileName,
    validateProfile: playerProfileHelpers.validatePlayerProfileFormValues,
    createId: deps.createDashboardId,
    getNow: () => new Date().toISOString(),
  });

  return {
    ...playerProfileHelpers,
    ...playerProfileIntelligenceHelpers,
    ...squadDataFoundationHelpers,
    buildPlayerProfileImportPlan: squadImportPlanner.buildPlayerProfileImportPlan,
    getPlayerProfileFormValues,
    getPlayerProfilesRosterSummary,
    playerProfileRosterUiSelectors,
  };
}
