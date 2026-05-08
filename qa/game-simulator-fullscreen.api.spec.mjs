import { expect, test } from "@playwright/test";
import { createSimulatorFullscreenController } from "../src/modules/game-simulator/fullscreen.mjs";

function createStyle() {
  const values = new Map();
  return {
    get(property) {
      return values.get(property);
    },
    removeProperty(property) {
      values.delete(property);
    },
    setProperty(property, value) {
      values.set(property, value);
    },
  };
}

function createElement(rect = {}) {
  return {
    style: createStyle(),
    textContent: "",
    getBoundingClientRect() {
      return {
        top: rect.top ?? 0,
        left: rect.left ?? 0,
        right: rect.right ?? 0,
      };
    },
  };
}

test("game simulator fullscreen controller syncs button and clears inactive HUD layout", () => {
  const stage = createElement();
  const button = createElement();
  stage.style.setProperty("--fullscreen-hud-top", "100px");

  const controller = createSimulatorFullscreenController({
    getStageElement: () => stage,
    getButtonElement: () => button,
    documentRef: { fullscreenElement: null },
  });

  controller.syncButton();
  controller.updateHudLayout();

  expect(controller.isActive()).toBe(false);
  expect(button.textContent).toBe("Fullscreen");
  expect(stage.style.get("--fullscreen-hud-top")).toBeUndefined();
});

test("game simulator fullscreen controller computes stable HUD layout while active", () => {
  const stage = createElement({ top: 0, left: 0, right: 1200 });
  const canvas = createElement({ top: 90, left: 300, right: 900 });
  const button = createElement();
  const documentRef = { fullscreenElement: stage };

  const controller = createSimulatorFullscreenController({
    getStageElement: () => stage,
    getCanvasElement: () => canvas,
    getButtonElement: () => button,
    documentRef,
  });

  controller.syncButton();
  controller.updateHudLayout();

  expect(controller.isActive()).toBe(true);
  expect(button.textContent).toBe("Exit Fullscreen");
  expect(stage.style.get("--fullscreen-hud-top")).toBe("102px");
  expect(stage.style.get("--fullscreen-hud-width")).toBe("268px");
});

test("game simulator fullscreen controller toggles request and exit paths", async () => {
  const stage = createElement();
  const button = createElement();
  const calls = [];
  const documentRef = {
    fullscreenElement: null,
    async exitFullscreen() {
      calls.push("exit");
      documentRef.fullscreenElement = null;
    },
  };
  stage.requestFullscreen = async () => {
    calls.push("request");
    documentRef.fullscreenElement = stage;
  };

  const controller = createSimulatorFullscreenController({
    getStageElement: () => stage,
    getButtonElement: () => button,
    documentRef,
  });

  await controller.toggle();
  await controller.toggle();

  expect(calls).toEqual(["request", "exit"]);
  expect(button.textContent).toBe("Fullscreen");
});

test("game simulator fullscreen controller logs unavailable fullscreen without throwing", async () => {
  const stage = createElement();
  const logs = [];
  stage.requestFullscreen = async () => {
    throw new Error("blocked");
  };

  const controller = createSimulatorFullscreenController({
    getStageElement: () => stage,
    documentRef: { fullscreenElement: null },
    log: (message) => logs.push(message),
  });

  await controller.toggle();

  expect(logs[0]).toContain("Fullscreen mode is not available");
});
