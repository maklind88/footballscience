import { SET_PIECES_HISTORY_LIMIT } from "./constants.mjs";

function clone(value) {
  return structuredClone(value);
}

export function createSetPiecesHistory(limit = SET_PIECES_HISTORY_LIMIT) {
  const undoStack = [];
  const redoStack = [];

  function record(state) {
    undoStack.push(clone(state));
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
  }

  function undo(currentState) {
    if (!undoStack.length) return null;
    redoStack.push(clone(currentState));
    return clone(undoStack.pop());
  }

  function redo(currentState) {
    if (!redoStack.length) return null;
    undoStack.push(clone(currentState));
    return clone(redoStack.pop());
  }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  return Object.freeze({
    clear,
    get canRedo() { return redoStack.length > 0; },
    get canUndo() { return undoStack.length > 0; },
    record,
    redo,
    undo,
  });
}
