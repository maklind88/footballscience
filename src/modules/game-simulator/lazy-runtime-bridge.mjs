export function createGameSimulatorLazyRuntimeBridge(deps = {}) {
  const {
    canEditGameSimulatorWorkspace,
    documentRef,
    escapeHtml,
    getHubState,
    platformModuleLoader,
    renderWorkspaceChrome,
    sequenceLibraryStorageKey,
    sequenceStorageKey,
    ui,
    win,
  } = deps;

  let runtime = null;
  let runtimePromise = null;

  function readSavedSequenceLibraryFallback() {
    try {
      const raw = win.localStorage?.getItem(sequenceLibraryStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => entry && entry.id && entry.name && entry.sequence?.steps)
        .sort((a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0));
    } catch {
      return [];
    }
  }

  function logRuntimeError(error) {
    console.error("Game simulator runtime failed to load.", error);
  }

  function ensureRuntime() {
    if (runtime) return Promise.resolve(runtime);
    if (!runtimePromise) {
      runtimePromise = platformModuleLoader
        .loadModule("game-simulator.runtime-entry", () =>
          import(platformModuleLoader.versionedHref("/src/modules/game-simulator/runtime-entry.mjs"))
        )
        .then(({ createGameSimulatorRuntimeEntry }) => {
          runtime = createGameSimulatorRuntimeEntry({
            canEditGameSimulatorWorkspace,
            documentRef,
            escapeHtml,
            getHubState,
            platformModuleLoader,
            renderWorkspaceChrome,
            sequenceLibraryStorageKey,
            sequenceStorageKey,
            ui,
            win,
          });
          runtime.initialize();
          return runtime;
        })
        .catch((error) => {
          runtimePromise = null;
          throw error;
        });
    }
    return runtimePromise;
  }

  function queueRuntimeLoad() {
    return ensureRuntime().catch(logRuntimeError);
  }

  function invokeRuntime(methodName, args = [], fallbackValue) {
    if (runtime?.[methodName]) {
      return runtime[methodName](...args);
    }
    queueRuntimeLoad();
    return typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
  }

  function invokeRuntimeAsync(methodName, args = []) {
    return ensureRuntime().then((entry) => entry?.[methodName]?.(...args));
  }

  function resetGameSimulatorIntro(...args) {
    if (runtime?.resetGameSimulatorIntro) {
      return runtime.resetGameSimulatorIntro(...args);
    }
    ui.gameSimulatorWorkspace?.classList.add("is-simulator-intro");
    ui.gameSimulatorWorkspace?.classList.remove("is-simulator-launched");
  }

  function syncGameSimulatorIntroState(...args) {
    if (runtime?.syncGameSimulatorIntroState) {
      return runtime.syncGameSimulatorIntroState(...args);
    }
    const workspace = ui.gameSimulatorWorkspace;
    if (workspace && getHubState()?.activeWorkspaceId === "game-simulator" && !workspace.classList.contains("is-simulator-launched")) {
      workspace.classList.add("is-simulator-intro");
    }
    queueRuntimeLoad();
  }

  function isSimulatorIntroActive(...args) {
    if (runtime?.isSimulatorIntroActive) {
      return runtime.isSimulatorIntroActive(...args);
    }
    return Boolean(getHubState()?.activeWorkspaceId === "game-simulator" && ui.gameSimulatorWorkspace?.classList.contains("is-simulator-intro"));
  }

  return {
    ensureGameSimulatorRuntime: ensureRuntime,
    hasActiveMetricTooltip: (...args) => runtime?.hasActiveMetricTooltip?.(...args) ?? false,
    hasUnsavedSimulatorWork: (...args) => runtime?.hasUnsavedSimulatorWork?.(...args) ?? false,
    hideMetricTooltip: (...args) => runtime?.hideMetricTooltip?.(...args),
    isPitchFullscreenActive: (...args) => runtime?.isPitchFullscreenActive?.(...args) ?? false,
    isSimulatorIntroActive,
    launchGameSimulatorFromIntro: (...args) => invokeRuntimeAsync("launchGameSimulatorFromIntro", args).catch(logRuntimeError),
    pauseSimulatorForWorkspaceSwitch: (...args) => runtime?.pauseSimulatorForWorkspaceSwitch?.(...args),
    queueGameSimulatorControllersLoad: (...args) => invokeRuntimeAsync("queueGameSimulatorControllersLoad", args).catch(logRuntimeError),
    queueGameSimulatorRuntimeLoad: queueRuntimeLoad,
    readSavedSequenceLibrary: (...args) =>
      runtime?.readSavedSequenceLibrary ? runtime.readSavedSequenceLibrary(...args) : readSavedSequenceLibraryFallback(),
    render: (...args) => invokeRuntime("render", args),
    resetGameSimulatorIntro,
    resetUnsavedSimulatorSession: (...args) => runtime?.resetUnsavedSimulatorSession?.(...args),
    startSimulatorAnimationLoop: (...args) => invokeRuntimeAsync("startSimulatorAnimationLoop", args).catch(logRuntimeError),
    stopSimulatorAnimationLoop: (...args) => runtime?.stopSimulatorAnimationLoop?.(...args),
    syncGameSimulatorIntroState,
    syncGameSimulatorSavedSequencesFromStorage: (...args) => runtime?.syncSavedSequencesFromStorage?.(...args),
    syncPitchFullscreenButton: (...args) => runtime?.syncPitchFullscreenButton?.(...args),
    togglePitchFullscreen: (...args) => invokeRuntimeAsync("togglePitchFullscreen", args).catch(logRuntimeError),
    updatePitchFullscreenHudLayout: (...args) => runtime?.updatePitchFullscreenHudLayout?.(...args),
  };
}
