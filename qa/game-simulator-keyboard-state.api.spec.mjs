import { expect, test } from "@playwright/test";
import {
  createSimulatorKeyboardStateController,
  shouldIgnoreHotkey,
  shouldIgnoreSpaceAutopilotHotkey,
} from "../src/modules/game-simulator/keyboard-state.mjs";

function createIgnoreEvent(overrides = {}) {
  return {
    target: { tagName: "INPUT", isContentEditable: false },
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...overrides,
  };
}

function createKeyboardState() {
  return {
    keyboardActionMode: null,
    keyboardActionGraceMode: null,
    keyboardActionGraceUntil: 0,
    actionMode: null,
  };
}

test("game simulator keyboard state exposes shared hotkey guards", () => {
  expect(shouldIgnoreHotkey(createIgnoreEvent())).toBe(true);
  expect(shouldIgnoreSpaceAutopilotHotkey(createIgnoreEvent())).toBe(true);
  expect(shouldIgnoreHotkey({ target: { tagName: "DIV", isContentEditable: false } })).toBe(false);
});

test("game simulator keyboard state transitions preserve intended action mode behavior", () => {
  const state = createKeyboardState();
  let updates = 0;

  const keyboardState = createSimulatorKeyboardStateController({
    getInteractionTimestamp: () => 1000,
    onActionModeChanged: () => {
      updates += 1;
    },
  });

  keyboardState.setKeyboardActionMode(state, "pass");
  expect(state.keyboardActionMode).toBe("pass");
  expect(updates).toBe(1);

  keyboardState.armKeyboardActionGrace(state, "pass");
  expect(state.keyboardActionGraceMode).toBe("pass");
  expect(state.keyboardActionMode).toBe("pass");

  expect(keyboardState.getPointerRequestedActionMode(state)).toBe("pass");

  keyboardState.setKeyboardActionMode(state, null);
  expect(state.keyboardActionMode).toBe(null);
  expect(state.keyboardActionGraceMode).toBe("pass");
  expect(state.keyboardActionGraceUntil).toBe(1220);

  expect(keyboardState.getPointerRequestedActionMode(state)).toBe("pass");
  keyboardState.consumePointerActionMode(state, "pass");
  expect(state.keyboardActionGraceMode).toBe(null);
  expect(state.keyboardActionGraceUntil).toBe(0);
});

test("game simulator keyboard state expires grace mode after timeout", () => {
  let now = 2500;
  const state = createKeyboardState();
  const keyboardState = createSimulatorKeyboardStateController({
    getInteractionTimestamp: () => now,
  });

  state.actionMode = "dribble";
  keyboardState.armKeyboardActionGrace(state, "shot", 180);
  expect(keyboardState.getPointerRequestedActionMode(state)).toBe("shot");

  now = 2681;
  expect(keyboardState.getPointerRequestedActionMode(state)).toBe("dribble");
  expect(state.keyboardActionGraceMode).toBe(null);
});
