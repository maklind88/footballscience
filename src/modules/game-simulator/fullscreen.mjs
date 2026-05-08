const fullscreenHudProperties = Object.freeze([
  "--fullscreen-hud-top",
  "--fullscreen-hud-width",
  "--fullscreen-hud-left-offset",
  "--fullscreen-hud-right-offset",
]);

function noop() {}

function getElementRect(element) {
  return typeof element?.getBoundingClientRect === "function"
    ? element.getBoundingClientRect()
    : { top: 0, left: 0, right: 0 };
}

export function createSimulatorFullscreenController(options = {}) {
  const getStageElement = typeof options.getStageElement === "function" ? options.getStageElement : () => null;
  const getCanvasElement = typeof options.getCanvasElement === "function" ? options.getCanvasElement : () => null;
  const getButtonElement = typeof options.getButtonElement === "function" ? options.getButtonElement : () => null;
  const documentRef = options.documentRef || globalThis.document;
  const log = typeof options.log === "function" ? options.log : noop;

  function isActive() {
    return Boolean(getStageElement() && documentRef.fullscreenElement === getStageElement());
  }

  function syncButton() {
    const button = getButtonElement();
    if (!button) {
      return;
    }

    button.textContent = isActive() ? "Exit Fullscreen" : "Fullscreen";
  }

  function clearHudLayout() {
    const stage = getStageElement();
    if (!stage?.style) {
      return;
    }

    fullscreenHudProperties.forEach((property) => stage.style.removeProperty(property));
  }

  function updateHudLayout() {
    const stage = getStageElement();
    const canvas = getCanvasElement();
    if (!stage) {
      return;
    }

    if (!isActive() || !canvas) {
      clearHudLayout();
      return;
    }

    const stageRect = getElementRect(stage);
    const canvasRect = getElementRect(canvas);
    const sidePadding = 16;
    const canvasLeftOffset = Math.max(0, canvasRect.left - stageRect.left);
    const canvasRightOffset = Math.max(0, stageRect.right - canvasRect.right);
    const usableLeftGutter = Math.max(0, canvasLeftOffset - sidePadding * 2);
    const usableRightGutter = Math.max(0, canvasRightOffset - sidePadding * 2);
    const minGutter = Math.min(usableLeftGutter, usableRightGutter);
    const preferredWidth = Math.min(272, Math.max(176, minGutter));
    const panelWidth = Math.max(136, Math.min(preferredWidth, minGutter || preferredWidth));
    const leftOffset = Math.max(sidePadding, (canvasLeftOffset - panelWidth) / 2);
    const rightOffset = Math.max(sidePadding, (canvasRightOffset - panelWidth) / 2);
    const topOffset = Math.max(84, canvasRect.top - stageRect.top + 12);

    stage.style.setProperty("--fullscreen-hud-top", `${topOffset}px`);
    stage.style.setProperty("--fullscreen-hud-width", `${panelWidth}px`);
    stage.style.setProperty("--fullscreen-hud-left-offset", `${leftOffset}px`);
    stage.style.setProperty("--fullscreen-hud-right-offset", `${rightOffset}px`);
  }

  async function toggle() {
    const stage = getStageElement();
    if (!stage) {
      return;
    }

    try {
      if (isActive()) {
        await documentRef.exitFullscreen?.();
      } else {
        await stage.requestFullscreen?.();
      }
    } catch {
      log("Fullscreen mode is not available here.");
    } finally {
      syncButton();
    }
  }

  return Object.freeze({
    clearHudLayout,
    isActive,
    syncButton,
    toggle,
    updateHudLayout,
  });
}
