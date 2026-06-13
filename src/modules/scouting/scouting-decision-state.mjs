import { defaultScoutingState, scoutingShadowSlots, scoutingTabs } from "./scouting-defaults.mjs";
import {
  cloneScoutingList,
  cloneScoutingReport,
  cloneScoutingSavedViewState,
  cloneScoutingState,
  cloneScoutingTarget,
  normalizeScoutingComparisonLab,
  normalizeScoutingDatabaseFilters,
  normalizeScoutingMyTeamPositions,
  normalizeScoutingMyTeamSlots,
  normalizeScoutingPlayerSnapshots,
  normalizeScoutingRecordIds,
  normalizeScoutingRoleModel,
  normalizeScoutingText,
} from "./scouting-state.mjs";

export const scoutingPersistentDecisionStateKeys = Object.freeze([
  "favoriteRecordIds",
  "lists",
  "shadowXi",
  "myTeam",
  "reports",
  "targets",
  "roleModels",
  "savedViews",
  "contactLog",
  "compareRecordIds",
  "playerSnapshots",
]);

export const scoutingWorkflowStateKeys = Object.freeze([
  "activeTab",
  "databaseFilters",
  "selectedRecordId",
  "profileTab",
  "profileRoleProfileId",
  "profileSpiderSeasonMode",
  "profileSpiderSeasonValue",
  "comparisonLab",
  "activeShadowBoardId",
  "selectedShadowSlotId",
]);

export const scoutingTransientUiStateKeys = Object.freeze([
  "advancedFiltersOpen",
  "comparisonMetricMenuOpen",
  "comparisonCandidatesOpen",
  "comparisonSearchQuery",
  "openRecordActionMenuId",
  "reportBuilderOpen",
  "roleModelBuilderOpen",
  "savedViewsOpen",
  "settingsPanel",
  "shadowFavoriteSearchQuery",
]);

function normalizeScoutingContactLogEntry(entry = {}) {
  return {
    id: normalizeScoutingText(entry?.id, 120),
    recordId: normalizeScoutingText(entry?.recordId, 160),
    date: normalizeScoutingText(entry?.date, 40),
    type: normalizeScoutingText(entry?.type, 40),
    contact: normalizeScoutingText(entry?.contact, 120),
    outcome: normalizeScoutingText(entry?.outcome, 160),
    nextStep: normalizeScoutingText(entry?.nextStep, 180),
    notes: normalizeScoutingText(entry?.notes, 700),
    createdAt: normalizeScoutingText(entry?.createdAt, 40),
  };
}

function normalizeDecisionShadowXi(shadowXi = {}) {
  const slotIds = new Set(scoutingShadowSlots.map((slot) => slot.id));
  return {
    formation: shadowXi.formation || "4-3-3",
    slots: Object.fromEntries(
      Object.entries(shadowXi.slots && typeof shadowXi.slots === "object" ? shadowXi.slots : {})
        .map(([slotId, recordIds]) => [
          normalizeScoutingText(slotId, 40),
          normalizeScoutingRecordIds(Array.isArray(recordIds) ? recordIds : recordIds ? [recordIds] : []),
        ])
        .filter(([slotId, recordIds]) => slotIds.has(slotId) && recordIds.length)
    ),
    positions: normalizeScoutingMyTeamPositions(shadowXi.positions, slotIds),
    meta: shadowXi.meta && typeof shadowXi.meta === "object" ? { ...shadowXi.meta } : {},
    activeBoardId: normalizeScoutingText(shadowXi.activeBoardId, 100) || "default-shadow-xi",
    boards: Array.isArray(shadowXi.boards) ? shadowXi.boards.map((board) => ({ ...board })).filter((board) => board.id) : [],
  };
}

function normalizeDecisionMyTeam(myTeam = {}) {
  const slotIds = new Set(scoutingShadowSlots.map((slot) => slot.id));
  return {
    formation: myTeam.formation || "4-3-3",
    slots: normalizeScoutingMyTeamSlots(myTeam.slots, slotIds),
    positions: normalizeScoutingMyTeamPositions(myTeam.positions, slotIds),
  };
}

export function normalizeScoutingPersistentDecisionState(source = defaultScoutingState) {
  const state = cloneScoutingState(source || defaultScoutingState);
  return {
    favoriteRecordIds: normalizeScoutingRecordIds(state.favoriteRecordIds),
    lists: Array.isArray(state.lists) ? state.lists.map(cloneScoutingList) : [],
    shadowXi: normalizeDecisionShadowXi(state.shadowXi),
    myTeam: normalizeDecisionMyTeam(state.myTeam),
    reports: Array.isArray(state.reports) ? state.reports.map(cloneScoutingReport).filter((report) => report.title || report.summary) : [],
    targets: Array.isArray(state.targets) ? state.targets.map(cloneScoutingTarget).filter((target) => target.name || target.recordId) : [],
    roleModels: Array.isArray(state.roleModels) ? state.roleModels.map(normalizeScoutingRoleModel).filter((model) => model.name) : [],
    savedViews: Array.isArray(state.savedViews) ? state.savedViews.map(cloneScoutingSavedViewState).filter(Boolean) : [],
    contactLog: Array.isArray(state.contactLog)
      ? state.contactLog.map(normalizeScoutingContactLogEntry).filter((entry) => entry.recordId)
      : [],
    compareRecordIds: normalizeScoutingRecordIds(state.compareRecordIds).slice(0, 5),
    playerSnapshots: normalizeScoutingPlayerSnapshots(state.playerSnapshots),
  };
}

export function normalizeScoutingWorkflowState(source = defaultScoutingState) {
  const rawState = source || defaultScoutingState;
  const state = cloneScoutingState(rawState);
  const activeTab = scoutingTabs.some((tab) => tab.id === state.activeTab) ? state.activeTab : defaultScoutingState.activeTab;
  return {
    activeTab,
    databaseFilters: normalizeScoutingDatabaseFilters(state.databaseFilters),
    selectedRecordId: normalizeScoutingText(state.selectedRecordId, 160),
    profileTab: normalizeScoutingText(rawState.profileTab, 40),
    profileRoleProfileId: normalizeScoutingText(rawState.profileRoleProfileId, 120),
    profileSpiderSeasonMode: normalizeScoutingText(rawState.profileSpiderSeasonMode, 40),
    profileSpiderSeasonValue: normalizeScoutingText(rawState.profileSpiderSeasonValue, 80),
    comparisonLab: normalizeScoutingComparisonLab(state.comparisonLab),
    activeShadowBoardId: normalizeScoutingText(state.shadowXi?.activeBoardId, 100) || "default-shadow-xi",
    selectedShadowSlotId: normalizeScoutingText(state.shadowXi?.selectedSlotId, 40),
  };
}
