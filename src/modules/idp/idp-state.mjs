export const idpInitialUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  ownerFilter: "All",
  categoryFilter: "All",
  searchQuery: "",
  clipBankSearchQuery: "",
  actionMode: "",
  message: "",
  error: "",
  loading: false,
  selectedClipBankIds: [],
  clipPreviewOpen: false,
  clipPreviewQueueIds: [],
  clipPreviewActiveIndex: 0,
  clipPreviewStatus: "",
  clipPreviewMessage: "",
  clipPreviewObjectUrl: "",
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
          clipPreviewQueueIds: Array.isArray(patch.ui?.clipPreviewQueueIds)
            ? patch.ui.clipPreviewQueueIds
            : state.ui.clipPreviewQueueIds,
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
