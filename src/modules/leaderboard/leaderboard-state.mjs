import {
  createLeaderboardIdempotencyKey,
  getLeaderboardMonthValue,
  getLeaderboardTodayValue,
} from "./leaderboard-helpers.mjs";

export function createLeaderboardAwardDraft(now = new Date()) {
  return {
    occurredOn: getLeaderboardTodayValue(now),
    title: "",
    note: "",
    mode: "placements",
    samePoints: 3,
    customPoints: "",
    searchQuery: "",
    assignments: {},
    idempotencyKey: createLeaderboardIdempotencyKey("leaderboard-award"),
  };
}

export function createLeaderboardState(now = new Date()) {
  const month = getLeaderboardMonthValue(now);
  return {
    status: "idle",
    month,
    data: null,
    monthCache: {},
    requestError: "",
    ui: {
      tab: "standings",
      standingsSearch: "",
      awardOpen: false,
      selectedPlayerId: "",
      reverseEventId: "",
      reverseReason: "",
      reverseIdempotencyKey: "",
      pendingAction: "",
      draftError: "",
      notice: null,
    },
    draft: createLeaderboardAwardDraft(now),
  };
}

export function createLeaderboardStore(initialState = createLeaderboardState()) {
  let state = initialState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(patch = {}, options = {}) {
    state = {
      ...state,
      ...patch,
      data: Object.prototype.hasOwnProperty.call(patch, "data") ? patch.data : state.data,
      monthCache: patch.monthCache ? { ...state.monthCache, ...patch.monthCache } : state.monthCache,
      ui: patch.ui ? { ...state.ui, ...patch.ui } : state.ui,
      draft: patch.draft ? { ...state.draft, ...patch.draft } : state.draft,
    };
    if (options.notify !== false) listeners.forEach((listener) => listener(state));
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ getState, setState, subscribe });
}
