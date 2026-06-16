export const idpInitialUiState = Object.freeze({
  selectedPlayerId: "",
  statusFilter: "All",
  ownerFilter: "All",
  categoryFilter: "All",
  searchQuery: "",
  actionMode: "",
  message: "",
  error: "",
  loading: false,
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
        ui: { ...state.ui, ...(patch.ui || {}) },
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
