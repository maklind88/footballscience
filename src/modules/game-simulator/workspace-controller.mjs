const introClassName = "is-simulator-intro";
const launchedClassName = "is-simulator-launched";

function noop() {}

export function createSimulatorWorkspaceController(options = {}) {
  const getWorkspaceElement =
    typeof options.getWorkspaceElement === "function" ? options.getWorkspaceElement : () => null;
  const getIntroElement = typeof options.getIntroElement === "function" ? options.getIntroElement : () => null;
  const getPitchStageElement =
    typeof options.getPitchStageElement === "function" ? options.getPitchStageElement : () => null;
  const getIsActiveWorkspace =
    typeof options.getIsActiveWorkspace === "function" ? options.getIsActiveWorkspace : () => false;
  const render = typeof options.render === "function" ? options.render : noop;
  const renderWorkspaceChrome =
    typeof options.renderWorkspaceChrome === "function" ? options.renderWorkspaceChrome : noop;
  const log = typeof options.log === "function" ? options.log : noop;
  const syncFullscreen = typeof options.syncFullscreen === "function" ? options.syncFullscreen : noop;
  const documentRef = options.documentRef || globalThis.document;
  const requestFrame =
    typeof options.requestAnimationFrame === "function"
      ? options.requestAnimationFrame
      : (callback) => globalThis.requestAnimationFrame?.(callback);

  function getWorkspace() {
    return getWorkspaceElement();
  }

  function isLaunched() {
    return Boolean(getWorkspace()?.classList.contains(launchedClassName));
  }

  function isIntroActive() {
    return Boolean(getIsActiveWorkspace() && getWorkspace()?.classList.contains(introClassName));
  }

  function resetIntro() {
    const workspace = getWorkspace();
    if (!workspace) {
      return;
    }

    workspace.classList.add(introClassName);
    workspace.classList.remove(launchedClassName);
    requestFrame(() => {
      getIntroElement()?.focus?.({ preventScroll: true });
    });
  }

  function syncIntroState() {
    const workspace = getWorkspace();
    if (!getIsActiveWorkspace() || !workspace) {
      return;
    }

    if (!workspace.classList.contains(launchedClassName)) {
      workspace.classList.add(introClassName);
    }
  }

  async function launchFromIntro() {
    const workspace = getWorkspace();
    if (!workspace) {
      return;
    }

    workspace.classList.remove(introClassName);
    workspace.classList.add(launchedClassName);
    documentRef.activeElement?.blur?.();
    render();

    try {
      const pitchStage = getPitchStageElement();
      if (!pitchStage?.requestFullscreen) {
        throw new Error("Fullscreen is not available.");
      }

      if (!documentRef.fullscreenElement) {
        await pitchStage.requestFullscreen();
      }

      if (!documentRef.fullscreenElement) {
        throw new Error("Fullscreen could not be opened.");
      }
    } catch {
      log("Fullscreen mode is not available here, so the simulator opened in normal mode.");
      requestFrame(() => {
        getPitchStageElement()?.scrollIntoView?.({ block: "start", inline: "nearest" });
      });
      renderWorkspaceChrome();
    } finally {
      syncFullscreen();
    }
  }

  return Object.freeze({
    isIntroActive,
    isLaunched,
    launchFromIntro,
    resetIntro,
    syncIntroState,
  });
}
