function safeJsonStringify(value = {}) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function defaultNormalizeObject(source = {}) {
  return source && typeof source === "object" && !Array.isArray(source) ? { ...source } : {};
}

export function createSessionPlannerBoardHistoryController(options = {}) {
  const historyLimit = Number.isFinite(Number(options.historyLimit)) ? Number(options.historyLimit) : 80;
  const baselines = {
    tactical: new Map(),
    player: new Map(),
  };
  const stacks = {
    tactical: new Map(),
    player: new Map(),
  };
  let applying = false;

  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const clearTacticalSelection = typeof options.clearTacticalSelection === "function" ? options.clearTacticalSelection : () => {};
  const cloneTacticalElement = typeof options.cloneTacticalElement === "function"
    ? options.cloneTacticalElement
    : (element = {}) => ({ ...element });
  const getSelectedBlock = typeof options.getSelectedBlock === "function" ? options.getSelectedBlock : () => null;
  const getSelectedDate = typeof options.getSelectedDate === "function" ? options.getSelectedDate : () => "date";
  const markBlockFieldsUpdated = typeof options.markBlockFieldsUpdated === "function" ? options.markBlockFieldsUpdated : () => {};
  const normalizePlayerBoardColors = typeof options.normalizePlayerBoardColors === "function" ? options.normalizePlayerBoardColors : defaultNormalizeObject;
  const normalizePlayerBoardCustomPeople = typeof options.normalizePlayerBoardCustomPeople === "function"
    ? options.normalizePlayerBoardCustomPeople
    : (source = []) => (Array.isArray(source) ? [...source] : []);
  const normalizePlayerBoardPositions = typeof options.normalizePlayerBoardPositions === "function" ? options.normalizePlayerBoardPositions : defaultNormalizeObject;
  const normalizeTacticalActiveFrameId = typeof options.normalizeTacticalActiveFrameId === "function"
    ? options.normalizeTacticalActiveFrameId
    : (activeFrameId = "", frames = []) => (frames.some((frame) => frame.id === activeFrameId) ? activeFrameId : frames[0]?.id || "");
  const normalizeTacticalFrames = typeof options.normalizeTacticalFrames === "function"
    ? options.normalizeTacticalFrames
    : (frames = []) => (Array.isArray(frames) ? frames.map((frame) => ({ ...frame })) : []);
  const normalizeTacticalPitchMode = typeof options.normalizeTacticalPitchMode === "function"
    ? options.normalizeTacticalPitchMode
    : (mode = "full") => String(mode || "full");
  const renderWorkspace = typeof options.renderWorkspace === "function" ? options.renderWorkspace : () => {};
  const resetTacticalDraftState = typeof options.resetTacticalDraftState === "function" ? options.resetTacticalDraftState : () => {};
  const showToast = typeof options.showToast === "function" ? options.showToast : () => {};
  const writeState = typeof options.writeState === "function" ? options.writeState : () => false;

  function getKey(block = getSelectedBlock()) {
    return `${getSelectedDate() || "date"}::${block?.id || "block"}`;
  }

  function createTacticalSnapshot(block = getSelectedBlock()) {
    if (!block) {
      return null;
    }
    const frames = normalizeTacticalFrames(block.tacticalFrames);
    return {
      tacticalPitchMode: normalizeTacticalPitchMode(block.tacticalPitchMode),
      tacticalFrames: frames,
      tacticalActiveFrameId: normalizeTacticalActiveFrameId(block.tacticalActiveFrameId, frames),
      tacticalElements: Array.isArray(block.tacticalElements)
        ? block.tacticalElements.map(cloneTacticalElement)
        : [],
    };
  }

  function createPlayerSnapshot(block = getSelectedBlock()) {
    if (!block) {
      return null;
    }
    return {
      playerBoardLayoutMode: block.playerBoardLayoutMode === "manual" ? "manual" : "auto",
      playerBoardPositions: normalizePlayerBoardPositions(block.playerBoardPositions),
      playerBoardColors: normalizePlayerBoardColors(block.playerBoardColors),
      playerBoardCustomPeople: normalizePlayerBoardCustomPeople(block.playerBoardCustomPeople),
    };
  }

  function createSnapshot(type, block = getSelectedBlock()) {
    return type === "player" ? createPlayerSnapshot(block) : createTacticalSnapshot(block);
  }

  function getStack(type, key) {
    const store = stacks[type] || stacks.tactical;
    if (!store.has(key)) {
      store.set(key, { undo: [], redo: [] });
    }
    return store.get(key);
  }

  function trimStack(stack) {
    while (stack.undo.length > historyLimit) {
      stack.undo.shift();
    }
    while (stack.redo.length > historyLimit) {
      stack.redo.shift();
    }
  }

  function syncBaseline(type, block = getSelectedBlock()) {
    const snapshot = createSnapshot(type, block);
    if (!snapshot || !block) {
      return;
    }
    baselines[type]?.set(getKey(block), snapshot);
  }

  function syncBaselines(block = getSelectedBlock()) {
    syncBaseline("tactical", block);
    syncBaseline("player", block);
  }

  function captureFromState() {
    if (applying) {
      return;
    }
    const block = getSelectedBlock();
    if (!block) {
      return;
    }
    ["tactical", "player"].forEach((type) => {
      const snapshot = createSnapshot(type, block);
      const baselineStore = baselines[type];
      if (!snapshot || !baselineStore) {
        return;
      }
      const key = getKey(block);
      const previousSnapshot = baselineStore.get(key);
      if (!previousSnapshot) {
        baselineStore.set(key, snapshot);
        return;
      }
      if (safeJsonStringify(previousSnapshot) === safeJsonStringify(snapshot)) {
        return;
      }
      const stack = getStack(type, key);
      stack.undo.push(previousSnapshot);
      stack.redo = [];
      trimStack(stack);
      baselineStore.set(key, snapshot);
    });
  }

  function applySnapshot(type, snapshot) {
    const block = getSelectedBlock();
    if (!block || !snapshot) {
      return false;
    }
    applying = true;
    try {
      if (type === "player") {
        block.playerBoardLayoutMode = snapshot.playerBoardLayoutMode === "manual" ? "manual" : "auto";
        block.playerBoardPositions = normalizePlayerBoardPositions(snapshot.playerBoardPositions);
        block.playerBoardColors = normalizePlayerBoardColors(snapshot.playerBoardColors);
        block.playerBoardCustomPeople = normalizePlayerBoardCustomPeople(snapshot.playerBoardCustomPeople);
        markBlockFieldsUpdated(block, [
          "playerBoardLayoutMode",
          "playerBoardPositions",
          "playerBoardColors",
          "playerBoardCustomPeople",
        ]);
      } else {
        const frames = normalizeTacticalFrames(snapshot.tacticalFrames);
        block.tacticalPitchMode = normalizeTacticalPitchMode(snapshot.tacticalPitchMode);
        block.tacticalFrames = frames;
        block.tacticalActiveFrameId = normalizeTacticalActiveFrameId(snapshot.tacticalActiveFrameId, frames);
        block.tacticalElements = Array.isArray(snapshot.tacticalElements)
          ? snapshot.tacticalElements.map(cloneTacticalElement)
          : [];
        markBlockFieldsUpdated(block, ["tacticalPitchMode", "tacticalElements", "tacticalFrames", "tacticalActiveFrameId"]);
        resetTacticalDraftState();
        clearTacticalSelection();
      }
      writeState();
    } finally {
      applying = false;
    }
    syncBaseline(type, block);
    renderWorkspace({ preserveDateStripScroll: true });
    return true;
  }

  function undo(type) {
    const block = getSelectedBlock();
    if (!block || !canEdit()) {
      return false;
    }
    const key = getKey(block);
    const stack = getStack(type, key);
    if (!stack.undo.length) {
      showToast("Nothing to undo yet.", "warning");
      return false;
    }
    const currentSnapshot = createSnapshot(type, block);
    const previousSnapshot = stack.undo.pop();
    if (currentSnapshot) {
      stack.redo.push(currentSnapshot);
    }
    trimStack(stack);
    return applySnapshot(type, previousSnapshot);
  }

  function redo(type) {
    const block = getSelectedBlock();
    if (!block || !canEdit()) {
      return false;
    }
    const key = getKey(block);
    const stack = getStack(type, key);
    if (!stack.redo.length) {
      showToast("Nothing to redo yet.", "warning");
      return false;
    }
    const currentSnapshot = createSnapshot(type, block);
    const nextSnapshot = stack.redo.pop();
    if (currentSnapshot) {
      stack.undo.push(currentSnapshot);
    }
    trimStack(stack);
    return applySnapshot(type, nextSnapshot);
  }

  return {
    applySnapshot,
    captureFromState,
    createPlayerSnapshot,
    createSnapshot,
    createTacticalSnapshot,
    getKey,
    redo,
    syncBaseline,
    syncBaselines,
    undo,
  };
}
