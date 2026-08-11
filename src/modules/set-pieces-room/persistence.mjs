import { SET_PIECES_STORAGE_KEY } from "./constants.mjs";
import { createEmptySetPiecesState, normalizeSetPiecesState } from "./state.mjs";

export function createSetPiecesPersistence(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const storageKey = options.storageKey || SET_PIECES_STORAGE_KEY;

  function read() {
    try {
      const raw = storage?.getItem?.(storageKey);
      return raw ? normalizeSetPiecesState(JSON.parse(raw)) : createEmptySetPiecesState();
    } catch {
      return createEmptySetPiecesState();
    }
  }

  function write(state) {
    const normalized = normalizeSetPiecesState(state);
    try {
      storage?.setItem?.(storageKey, JSON.stringify(normalized));
      return { ok: true, state: normalized };
    } catch (error) {
      return {
        ok: false,
        state: normalized,
        error: error instanceof Error ? error.message : "Set Pieces Room could not save.",
      };
    }
  }

  return Object.freeze({ read, storageKey, write });
}
