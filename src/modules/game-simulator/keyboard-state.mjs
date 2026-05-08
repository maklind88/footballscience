const DEFAULT_KEYBOARD_ACTION_GRACE_MS = 220;

function defaultInteractionTimestamp() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function shouldIgnoreTextOrModifierTarget(event) {
  const tagName = event.target?.tagName;
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    tagName === "BUTTON" ||
    event.target?.isContentEditable
  );
}

export function shouldIgnoreHotkey(event) {
  return shouldIgnoreTextOrModifierTarget(event);
}

export function shouldIgnoreSpaceAutopilotHotkey(event) {
  return shouldIgnoreTextOrModifierTarget(event);
}

export function createSimulatorKeyboardStateController(options = {}) {
  const getInteractionTimestamp =
    typeof options.getInteractionTimestamp === "function"
      ? options.getInteractionTimestamp
      : defaultInteractionTimestamp;
  const onActionModeChanged =
    typeof options.onActionModeChanged === "function"
      ? options.onActionModeChanged
      : () => {};

  function clearKeyboardActionGrace(state) {
    if (!state) {
      return;
    }

    state.keyboardActionGraceMode = null;
    state.keyboardActionGraceUntil = 0;
  }

  function armKeyboardActionGrace(state, mode, durationMs = DEFAULT_KEYBOARD_ACTION_GRACE_MS) {
    if (!state) {
      return;
    }

    state.keyboardActionGraceMode = mode;
    state.keyboardActionGraceUntil = getInteractionTimestamp() + durationMs;
  }

  function getPointerRequestedActionMode(state) {
    if (!state) {
      return null;
    }

    if (state.keyboardActionMode) {
      return state.keyboardActionMode;
    }

    const isWithinGraceWindow =
      state.keyboardActionGraceMode && getInteractionTimestamp() <= state.keyboardActionGraceUntil;
    if (isWithinGraceWindow) {
      return state.keyboardActionGraceMode;
    }

    if (state.keyboardActionGraceMode) {
      clearKeyboardActionGrace(state);
    }

    return state.actionMode;
  }

  function consumePointerActionMode(state, mode) {
    if (!state) {
      return;
    }

    if (!state.keyboardActionMode && state.keyboardActionGraceMode === mode) {
      clearKeyboardActionGrace(state);
    }
  }

  function setKeyboardActionMode(state, mode) {
    if (!state || state.keyboardActionMode === mode) {
      return;
    }

    state.keyboardActionMode = mode;
    if (mode) {
      clearKeyboardActionGrace(state);
    }
    onActionModeChanged();
  }

  return Object.freeze({
    clearKeyboardActionGrace,
    armKeyboardActionGrace,
    getPointerRequestedActionMode,
    consumePointerActionMode,
    setKeyboardActionMode,
    getInteractionTimestamp,
  });
}
