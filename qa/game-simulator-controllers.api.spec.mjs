import { expect, test } from "@playwright/test";

import { createSimulatorControllers } from "../src/modules/game-simulator/controllers.mjs";

function createClassList() {
  const values = new Set();

  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    contains: (name) => values.has(name),
    remove: (...names) => names.forEach((name) => values.delete(name)),
  };
}

test("game simulator controller loader composes simulator controllers without binding intro buttons", () => {
  const listeners = [];
  const workspace = { classList: createClassList() };
  const introButton = {
    addEventListener: (eventName) => listeners.push(["intro", eventName]),
    removeEventListener: () => {},
  };
  const fullscreenButton = {
    addEventListener: (eventName) => listeners.push(["fullscreen", eventName]),
    removeEventListener: () => {},
    textContent: "",
  };
  const windowRef = {
    addEventListener: (eventName) => listeners.push(["window", eventName]),
    removeEventListener: () => {},
  };
  const documentRef = {
    addEventListener: (eventName) => listeners.push(["document", eventName]),
    fullscreenElement: null,
    removeEventListener: () => {},
  };

  const controllers = createSimulatorControllers({
    bindButtonControls: false,
    documentRef,
    getButtonElement: () => fullscreenButton,
    getFullscreenButton: () => fullscreenButton,
    getIntroButton: () => introButton,
    getIsActiveWorkspace: () => true,
    getWorkspaceElement: () => workspace,
    windowRef,
  });

  controllers.controlBindings.bind();
  controllers.workspaceController.resetIntro();
  controllers.fullscreenController.syncButton();

  expect(workspace.classList.contains("is-simulator-intro")).toBe(true);
  expect(fullscreenButton.textContent).toBe("Fullscreen");
  expect(controllers.shouldIgnoreHotkey({ target: { tagName: "INPUT" } })).toBe(true);
  expect(listeners).toEqual(
    expect.arrayContaining([
      ["document", "fullscreenchange"],
      ["window", "resize"],
      ["window", "keydown"],
      ["window", "keyup"],
      ["window", "blur"],
    ])
  );
  expect(listeners).not.toContainEqual(["intro", "click"]);
  expect(listeners).not.toContainEqual(["fullscreen", "click"]);
});
