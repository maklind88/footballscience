import { expect, test } from "@playwright/test";
import { createSimulatorWorkspaceController } from "../src/modules/game-simulator/workspace-controller.mjs";

function createClassList(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    add: (...values) => values.forEach((value) => classes.add(value)),
    remove: (...values) => values.forEach((value) => classes.delete(value)),
    contains: (value) => classes.has(value),
  };
}

function createElement(initialClasses = []) {
  return {
    classList: createClassList(initialClasses),
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
  };
}

test("game simulator workspace controller resets intro state without touching app internals", () => {
  const workspace = createElement(["is-simulator-launched"]);
  const intro = createElement();
  const controller = createSimulatorWorkspaceController({
    getWorkspaceElement: () => workspace,
    getIntroElement: () => intro,
    getIsActiveWorkspace: () => true,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
  });

  controller.resetIntro();

  expect(workspace.classList.contains("is-simulator-intro")).toBe(true);
  expect(workspace.classList.contains("is-simulator-launched")).toBe(false);
  expect(intro.focusCalls).toBe(1);
  expect(controller.isIntroActive()).toBe(true);
});

test("game simulator workspace controller launches fullscreen and reports fallback cleanly", async () => {
  const workspace = createElement(["is-simulator-intro"]);
  const documentRef = { fullscreenElement: null };
  const pitchStage = {
    async requestFullscreen() {
      documentRef.fullscreenElement = pitchStage;
    },
  };
  const calls = [];
  const controller = createSimulatorWorkspaceController({
    getWorkspaceElement: () => workspace,
    getPitchStageElement: () => pitchStage,
    getIsActiveWorkspace: () => true,
    documentRef,
    render: () => calls.push("render"),
    syncFullscreen: () => calls.push("sync"),
  });

  await controller.launchFromIntro();

  expect(workspace.classList.contains("is-simulator-intro")).toBe(false);
  expect(workspace.classList.contains("is-simulator-launched")).toBe(true);
  expect(calls).toEqual(["render", "sync"]);
});

test("game simulator workspace controller returns to intro when fullscreen fails", async () => {
  const workspace = createElement(["is-simulator-intro"]);
  const logs = [];
  const calls = [];
  const controller = createSimulatorWorkspaceController({
    getWorkspaceElement: () => workspace,
    getPitchStageElement: () => ({}),
    getIsActiveWorkspace: () => true,
    documentRef: { fullscreenElement: null },
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    render: () => calls.push("render"),
    renderWorkspaceChrome: () => calls.push("chrome"),
    syncFullscreen: () => calls.push("sync"),
    log: (message) => logs.push(message),
  });

  await controller.launchFromIntro();

  expect(workspace.classList.contains("is-simulator-intro")).toBe(true);
  expect(workspace.classList.contains("is-simulator-launched")).toBe(false);
  expect(calls).toEqual(["render", "chrome", "sync"]);
  expect(logs[0]).toContain("Fullscreen mode is not available");
});
