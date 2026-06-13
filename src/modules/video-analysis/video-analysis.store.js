import { createInitialVideoAnalysisState } from "./video-analysis.state.js";

export function createVideoAnalysisStore(context = {}) {
  let state = createInitialVideoAnalysisState(context);
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) listener(state);
  }

  return {
    getState: () => state,
    setState(patch = {}) {
      state = { ...state, ...patch };
      emit();
      return state;
    },
    update(updater) {
      state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
      emit();
      return state;
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
