function noop() {}

function isSpaceKey(event) {
  const key = String(event?.key || "").toLowerCase();
  return event?.code === "Space" || key === " ";
}

function getKey(event) {
  return String(event?.key || "").toLowerCase();
}

function getShiftActionMode(event) {
  if (!event?.shiftKey) {
    return null;
  }

  const key = getKey(event);
  if (key === "p") {
    return "pass";
  }

  if (key === "d") {
    return "dribble";
  }

  if (key === "s") {
    return "shot";
  }

  return null;
}

export function createSimulatorControlBindings(options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const getIntroButton = typeof options.getIntroButton === "function" ? options.getIntroButton : () => null;
  const getFullscreenButton =
    typeof options.getFullscreenButton === "function" ? options.getFullscreenButton : () => null;
  const isActiveWorkspace =
    typeof options.isActiveWorkspace === "function" ? options.isActiveWorkspace : () => false;
  const isLaunched = typeof options.isLaunched === "function" ? options.isLaunched : () => false;
  const getOffensiveAutopilotEnabled =
    typeof options.getOffensiveAutopilotEnabled === "function"
      ? options.getOffensiveAutopilotEnabled
      : () => false;
  const getKeyboardActionMode =
    typeof options.getKeyboardActionMode === "function" ? options.getKeyboardActionMode : () => null;
  const hasActiveMetricTooltip =
    typeof options.hasActiveMetricTooltip === "function" ? options.hasActiveMetricTooltip : () => false;

  const launchFromIntro = typeof options.launchFromIntro === "function" ? options.launchFromIntro : noop;
  const toggleFullscreen = typeof options.toggleFullscreen === "function" ? options.toggleFullscreen : noop;
  const syncFullscreenButton =
    typeof options.syncFullscreenButton === "function" ? options.syncFullscreenButton : noop;
  const updateFullscreenHudLayout =
    typeof options.updateFullscreenHudLayout === "function" ? options.updateFullscreenHudLayout : noop;
  const ensureMetricTooltipLayer =
    typeof options.ensureMetricTooltipLayer === "function" ? options.ensureMetricTooltipLayer : noop;
  const positionMetricTooltip =
    typeof options.positionMetricTooltip === "function" ? options.positionMetricTooltip : noop;
  const resetIntro = typeof options.resetIntro === "function" ? options.resetIntro : noop;
  const renderWorkspaceChrome =
    typeof options.renderWorkspaceChrome === "function" ? options.renderWorkspaceChrome : noop;
  const shouldIgnoreSpaceAutopilotHotkey =
    typeof options.shouldIgnoreSpaceAutopilotHotkey === "function"
      ? options.shouldIgnoreSpaceAutopilotHotkey
      : () => false;
  const toggleSpaceAutopilotPlayback =
    typeof options.toggleSpaceAutopilotPlayback === "function"
      ? options.toggleSpaceAutopilotPlayback
      : noop;
  const shouldIgnoreHotkey =
    typeof options.shouldIgnoreHotkey === "function" ? options.shouldIgnoreHotkey : () => false;
  const executePlannedAction =
    typeof options.executePlannedAction === "function" ? options.executePlannedAction : noop;
  const setKeyboardActionMode =
    typeof options.setKeyboardActionMode === "function" ? options.setKeyboardActionMode : noop;
  const armKeyboardActionGrace =
    typeof options.armKeyboardActionGrace === "function" ? options.armKeyboardActionGrace : noop;
  const clearKeyboardActionGrace =
    typeof options.clearKeyboardActionGrace === "function" ? options.clearKeyboardActionGrace : noop;

  const listeners = [];

  function addListener(target, eventName, handler, listenerOptions) {
    if (!target?.addEventListener) {
      return;
    }

    target.addEventListener(eventName, handler, listenerOptions);
    listeners.push(() => target.removeEventListener?.(eventName, handler, listenerOptions));
  }

  function syncFullscreenSurfaces() {
    syncFullscreenButton();
    updateFullscreenHudLayout();
    if (hasActiveMetricTooltip()) {
      ensureMetricTooltipLayer();
      positionMetricTooltip();
    }

    if (!documentRef.fullscreenElement && isActiveWorkspace() && isLaunched()) {
      resetIntro();
      renderWorkspaceChrome();
    }
  }

  function handleResize() {
    updateFullscreenHudLayout();
    if (hasActiveMetricTooltip()) {
      positionMetricTooltip();
    }
  }

  function handleKeyDown(event) {
    if (!isActiveWorkspace()) {
      return;
    }

    const key = getKey(event);
    if (isSpaceKey(event) && getOffensiveAutopilotEnabled() && !shouldIgnoreSpaceAutopilotHotkey(event)) {
      event.preventDefault();
      if (!event.repeat) {
        toggleSpaceAutopilotPlayback();
      }
      return;
    }

    if (shouldIgnoreHotkey(event)) {
      return;
    }

    if (key === "enter") {
      event.preventDefault();
      executePlannedAction();
      return;
    }

    const shiftActionMode = getShiftActionMode(event);
    if (shiftActionMode) {
      event.preventDefault();
      setKeyboardActionMode(shiftActionMode);
    }
  }

  function handleKeyUp(event) {
    if (!isActiveWorkspace()) {
      return;
    }

    const key = getKey(event);
    const currentMode = getKeyboardActionMode();
    if (key === "p" && currentMode === "pass") {
      armKeyboardActionGrace("pass");
      setKeyboardActionMode(null);
      return;
    }

    if (key === "d" && currentMode === "dribble") {
      armKeyboardActionGrace("dribble");
      setKeyboardActionMode(null);
      return;
    }

    if (key === "s" && currentMode === "shot") {
      armKeyboardActionGrace("shot");
      setKeyboardActionMode(null);
    }
  }

  function handleBlur() {
    clearKeyboardActionGrace();
    if (getKeyboardActionMode() !== null) {
      setKeyboardActionMode(null);
    }
  }

  function bind() {
    addListener(getIntroButton(), "click", launchFromIntro);
    addListener(getFullscreenButton(), "click", toggleFullscreen);
    addListener(documentRef, "fullscreenchange", syncFullscreenSurfaces);
    addListener(windowRef, "resize", handleResize);
    addListener(windowRef, "keydown", handleKeyDown);
    addListener(windowRef, "keyup", handleKeyUp);
    addListener(windowRef, "blur", handleBlur);
  }

  function destroy() {
    while (listeners.length) {
      listeners.pop()?.();
    }
  }

  return Object.freeze({
    bind,
    destroy,
    handleBlur,
    handleKeyDown,
    handleKeyUp,
    handleResize,
    syncFullscreenSurfaces,
  });
}
