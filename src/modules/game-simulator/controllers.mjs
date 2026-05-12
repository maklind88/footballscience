import { createSimulatorControlBindings } from "./control-bindings.mjs";
import { createSimulatorFullscreenController } from "./fullscreen.mjs";
import {
  createSimulatorKeyboardStateController,
  shouldIgnoreHotkey,
  shouldIgnoreSpaceAutopilotHotkey,
} from "./keyboard-state.mjs";
import { createSimulatorWorkspaceController } from "./workspace-controller.mjs";

export function createSimulatorControllers(options = {}) {
  const bindButtonControls = options.bindButtonControls !== false;

  const fullscreenController = createSimulatorFullscreenController({
    getStageElement: options.getStageElement,
    getCanvasElement: options.getCanvasElement,
    getButtonElement: options.getButtonElement,
    documentRef: options.documentRef,
    log: options.log,
  });

  const keyboardState = createSimulatorKeyboardStateController({
    onActionModeChanged: options.onActionModeChanged,
  });

  const workspaceController = createSimulatorWorkspaceController({
    getWorkspaceElement: options.getWorkspaceElement,
    getIntroElement: options.getIntroElement,
    getPitchStageElement: options.getPitchStageElement,
    getIsActiveWorkspace: options.getIsActiveWorkspace,
    render: options.render,
    renderWorkspaceChrome: options.renderWorkspaceChrome,
    log: options.log,
    syncFullscreen: options.syncFullscreen,
    documentRef: options.documentRef,
    requestAnimationFrame: options.requestAnimationFrame,
  });

  const controlBindings = createSimulatorControlBindings({
    windowRef: options.windowRef,
    documentRef: options.documentRef,
    getIntroButton: bindButtonControls ? options.getIntroButton : () => null,
    getFullscreenButton: bindButtonControls ? options.getFullscreenButton : () => null,
    isActiveWorkspace: options.getIsActiveWorkspace,
    isLaunched: () => workspaceController.isLaunched(),
    getOffensiveAutopilotEnabled: options.getOffensiveAutopilotEnabled,
    getKeyboardActionMode: options.getKeyboardActionMode,
    hasActiveMetricTooltip: options.hasActiveMetricTooltip,
    launchFromIntro: options.launchFromIntro,
    toggleFullscreen: options.toggleFullscreen,
    syncFullscreenButton: options.syncFullscreenButton,
    updateFullscreenHudLayout: options.updateFullscreenHudLayout,
    ensureMetricTooltipLayer: options.ensureMetricTooltipLayer,
    positionMetricTooltip: options.positionMetricTooltip,
    resetIntro: options.resetIntro,
    renderWorkspaceChrome: options.renderWorkspaceChrome,
    shouldIgnoreSpaceAutopilotHotkey,
    toggleSpaceAutopilotPlayback: options.toggleSpaceAutopilotPlayback,
    shouldIgnoreHotkey,
    executePlannedAction: options.executePlannedAction,
    setKeyboardActionMode: options.setKeyboardActionMode,
    armKeyboardActionGrace: options.armKeyboardActionGrace,
    clearKeyboardActionGrace: options.clearKeyboardActionGrace,
  });

  return Object.freeze({
    controlBindings,
    fullscreenController,
    keyboardState,
    shouldIgnoreHotkey,
    shouldIgnoreSpaceAutopilotHotkey,
    workspaceController,
  });
}
