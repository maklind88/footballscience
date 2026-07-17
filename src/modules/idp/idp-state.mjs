import { idpPlayerBoardUiDefaults } from "./idp-player-board-helpers.mjs";

export const idpInitialUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  ownerFilter: "All",
  categoryFilter: "All",
  openFilterMenu: "",
  searchQuery: "",
  profileView: "development",
  clipBankSearchQuery: "",
  actionMode: "",
  editEvidenceId: "",
  editGoalId: "",
  message: "",
  error: "",
  loading: false,
  selectedClipBankIds: [],
  scoutingMetricSelections: {},
  openScoutingMetricPickerKey: "",
  scoutingMetricPickerSearchQueries: {},
  clipPreviewOpen: false,
  clipPreviewQueueIds: [],
  clipPreviewActiveIndex: 0,
  clipPreviewStatus: "",
  clipPreviewMessage: "",
  clipPreviewObjectUrl: "",
  ...idpPlayerBoardUiDefaults,
});

export const idpInitialSyncState = Object.freeze({
  revision: "",
  updatedAt: "",
  checkedAt: "",
  playerId: "",
});

export function createIdpStore(initialState = {}) {
  let state = {
    ui: { ...idpInitialUiState, ...(initialState.ui || {}) },
    dashboardPlayers: Array.isArray(initialState.dashboardPlayers) ? initialState.dashboardPlayers : [],
    playerDetail: initialState.playerDetail || null,
    sync: { ...idpInitialSyncState, ...(initialState.sync || {}) },
  };
  const subscribers = new Set();

  function emit() {
    subscribers.forEach((subscriber) => subscriber(state));
  }

  return {
    getState: () => state,
    setState: (patch = {}) => {
      state = {
        ...state,
        ...patch,
        ui: {
          ...state.ui,
          ...(patch.ui || {}),
          selectedClipBankIds: Array.isArray(patch.ui?.selectedClipBankIds)
            ? patch.ui.selectedClipBankIds
            : state.ui.selectedClipBankIds,
          scoutingMetricSelections:
            patch.ui?.scoutingMetricSelections && typeof patch.ui.scoutingMetricSelections === "object"
              ? patch.ui.scoutingMetricSelections
              : state.ui.scoutingMetricSelections,
          scoutingMetricPickerSearchQueries:
            patch.ui?.scoutingMetricPickerSearchQueries && typeof patch.ui.scoutingMetricPickerSearchQueries === "object"
              ? patch.ui.scoutingMetricPickerSearchQueries
              : state.ui.scoutingMetricPickerSearchQueries,
          clipPreviewQueueIds: Array.isArray(patch.ui?.clipPreviewQueueIds)
            ? patch.ui.clipPreviewQueueIds
            : state.ui.clipPreviewQueueIds,
          idpPlayerBoardSelectedElementIds: Array.isArray(patch.ui?.idpPlayerBoardSelectedElementIds)
            ? patch.ui.idpPlayerBoardSelectedElementIds
            : state.ui.idpPlayerBoardSelectedElementIds,
          idpPlayerBoardClipboard: Array.isArray(patch.ui?.idpPlayerBoardClipboard)
            ? patch.ui.idpPlayerBoardClipboard
            : state.ui.idpPlayerBoardClipboard,
        },
        sync: patch.sync ? { ...state.sync, ...patch.sync } : state.sync,
      };
      emit();
    },
    update: (updater) => {
      state = typeof updater === "function" ? updater(state) : state;
      emit();
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}
