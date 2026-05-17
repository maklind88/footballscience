import { expect, test } from "@playwright/test";
import { createSimulatorControlBindings } from "../src/modules/game-simulator/control-bindings.mjs";

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) {
        listeners.delete(name);
      }
    },
    dispatch(name, event = {}) {
      listeners.get(name)?.(event);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createKeyboardEvent(key, options = {}) {
  return {
    key,
    code: options.code || "",
    shiftKey: Boolean(options.shiftKey),
    repeat: Boolean(options.repeat),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("game simulator control bindings wire and unwire DOM events", () => {
  const windowRef = createEventTarget();
  const documentRef = createEventTarget();
  const introButton = createEventTarget();
  const fullscreenButton = createEventTarget();
  const calls = [];
  const bindings = createSimulatorControlBindings({
    windowRef,
    documentRef,
    getIntroButton: () => introButton,
    getFullscreenButton: () => fullscreenButton,
    launchFromIntro: () => calls.push("intro"),
    toggleFullscreen: () => calls.push("fullscreen"),
  });

  bindings.bind();
  introButton.dispatch("click");
  fullscreenButton.dispatch("click");

  expect(calls).toEqual(["intro", "fullscreen"]);
  expect(windowRef.listenerCount()).toBeGreaterThan(0);
  expect(documentRef.listenerCount()).toBeGreaterThan(0);

  bindings.destroy();
  expect(windowRef.listenerCount()).toBe(0);
  expect(documentRef.listenerCount()).toBe(0);
});

test("game simulator control bindings route simulator hotkeys only while active", () => {
  const calls = [];
  let active = false;
  let keyboardMode = null;
  const bindings = createSimulatorControlBindings({
    isActiveWorkspace: () => active,
    getKeyboardActionMode: () => keyboardMode,
    shouldIgnoreHotkey: () => false,
    executePlannedAction: () => calls.push("enter"),
    setKeyboardActionMode: (mode) => {
      keyboardMode = mode;
      calls.push(`mode:${mode || "none"}`);
    },
    armKeyboardActionGrace: (mode) => calls.push(`grace:${mode}`),
  });

  const inactiveEnter = createKeyboardEvent("Enter");
  bindings.handleKeyDown(inactiveEnter);
  expect(inactiveEnter.defaultPrevented).toBe(false);
  expect(calls).toEqual([]);

  active = true;
  const enter = createKeyboardEvent("Enter");
  bindings.handleKeyDown(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(calls).toEqual(["enter"]);

  const passDown = createKeyboardEvent("p");
  bindings.handleKeyDown(passDown);
  const passUp = createKeyboardEvent("p");
  bindings.handleKeyUp(passUp);

  expect(passDown.defaultPrevented).toBe(true);
  expect(calls).toEqual(["enter", "mode:pass"]);

  const dribbleDown = createKeyboardEvent("d");
  bindings.handleKeyDown(dribbleDown);
  bindings.handleKeyUp(createKeyboardEvent("d"));
  const shotDown = createKeyboardEvent("s");
  bindings.handleKeyDown(shotDown);
  bindings.handleKeyUp(createKeyboardEvent("s"));

  expect(dribbleDown.defaultPrevented).toBe(true);
  expect(shotDown.defaultPrevented).toBe(true);
  expect(calls).toEqual([
    "enter",
    "mode:pass",
    "mode:dribble",
    "mode:shot",
  ]);
});

test("game simulator control bindings handle fullscreen fallback surfaces", () => {
  const calls = [];
  const bindings = createSimulatorControlBindings({
    documentRef: { fullscreenElement: null },
    isActiveWorkspace: () => true,
    isLaunched: () => true,
    hasActiveMetricTooltip: () => true,
    syncFullscreenButton: () => calls.push("sync"),
    updateFullscreenHudLayout: () => calls.push("hud"),
    ensureMetricTooltipLayer: () => calls.push("layer"),
    positionMetricTooltip: () => calls.push("tooltip"),
    resetIntro: () => calls.push("intro"),
    renderWorkspaceChrome: () => calls.push("chrome"),
  });

  bindings.syncFullscreenSurfaces();

  expect(calls).toEqual(["sync", "hud", "layer", "tooltip", "intro", "chrome"]);
});
