function readSavedSequenceLibraryFallback(win, sequenceLibraryStorageKey) {
  try {
    const raw = win.localStorage.getItem(sequenceLibraryStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => entry && entry.id && entry.name && entry.sequence?.steps)
      .sort((a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0));
  } catch {
    return [];
  }
}

export function createGameSimulatorAppRuntimeSequenceAdapter(deps = {}) {
  const {
    getSequenceEngine,
    sequenceLibraryStorageKey,
    win = globalThis,
  } = deps;

  function invokeGameSimulatorSequenceEngine(methodName, args) {
    const gameSimulatorSequenceEngine = getSequenceEngine?.();
    if (!gameSimulatorSequenceEngine?.[methodName]) {
      throw new Error(`Game simulator sequence engine is not ready: ${methodName}`);
    }
    return gameSimulatorSequenceEngine[methodName](...args);
  }

  function delegateSequenceMethod(methodName) {
    return (...args) => invokeGameSimulatorSequenceEngine(methodName, args);
  }

  function readSavedSequenceLibrary(...args) {
    const gameSimulatorSequenceEngine = getSequenceEngine?.();
    if (!gameSimulatorSequenceEngine?.readSavedSequenceLibrary) {
      return readSavedSequenceLibraryFallback(win, sequenceLibraryStorageKey);
    }
    return invokeGameSimulatorSequenceEngine("readSavedSequenceLibrary", args);
  }

  return {
    invokeGameSimulatorSequenceEngine,
    captureSnapshot: delegateSequenceMethod("captureSnapshot"),
    applySnapshot: delegateSequenceMethod("applySnapshot"),
    cloneSnapshot: delegateSequenceMethod("cloneSnapshot"),
    cloneSequenceStep: delegateSequenceMethod("cloneSequenceStep"),
    buildSnapshotFromFormations: delegateSequenceMethod("buildSnapshotFromFormations"),
    withSnapshotOverrides: delegateSequenceMethod("withSnapshotOverrides"),
    createLowBlockPressExample: delegateSequenceMethod("createLowBlockPressExample"),
    loadLowBlockPressExample: delegateSequenceMethod("loadLowBlockPressExample"),
    cloneScenarioInfo: delegateSequenceMethod("cloneScenarioInfo"),
    markSimulatorDirty: delegateSequenceMethod("markSimulatorDirty"),
    markSequenceDirty: delegateSequenceMethod("markSequenceDirty"),
    markSimulatorSaved: delegateSequenceMethod("markSimulatorSaved"),
    readSavedSequenceLibrary,
    writeSavedSequenceLibrary: delegateSequenceMethod("writeSavedSequenceLibrary"),
    sanitizeFileName: delegateSequenceMethod("sanitizeFileName"),
    goToSequenceFrame: delegateSequenceMethod("goToSequenceFrame"),
    cancelSequenceAdvance: delegateSequenceMethod("cancelSequenceAdvance"),
    stopSequencePlayback: delegateSequenceMethod("stopSequencePlayback"),
    finishSequencePlayback: delegateSequenceMethod("finishSequencePlayback"),
    queueNextSequenceStep: delegateSequenceMethod("queueNextSequenceStep"),
    startRecordedAction: delegateSequenceMethod("startRecordedAction"),
    createCommittedSnapshotFromCurrentState: delegateSequenceMethod("createCommittedSnapshotFromCurrentState"),
    applyCommittedSnapshot: delegateSequenceMethod("applyCommittedSnapshot"),
    serializeSequence: delegateSequenceMethod("serializeSequence"),
    loadSequenceData: delegateSequenceMethod("loadSequenceData"),
    saveSequenceToLocal: delegateSequenceMethod("saveSequenceToLocal"),
    loadSequenceFromLocal: delegateSequenceMethod("loadSequenceFromLocal"),
    downloadSequence: delegateSequenceMethod("downloadSequence"),
    createStepThumbnail: delegateSequenceMethod("createStepThumbnail"),
    startSequenceStep: delegateSequenceMethod("startSequenceStep"),
    startSequencePlayback: delegateSequenceMethod("startSequencePlayback"),
    getActiveExampleOverlay: delegateSequenceMethod("getActiveExampleOverlay"),
    getSavedSequenceById: delegateSequenceMethod("getSavedSequenceById"),
    loadSavedSequenceEntry: delegateSequenceMethod("loadSavedSequenceEntry"),
    removeSavedSequenceEntry: delegateSequenceMethod("removeSavedSequenceEntry"),
  };
}
