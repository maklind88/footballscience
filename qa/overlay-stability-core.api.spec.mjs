import { expect, test } from "@playwright/test";
import {
  createPlatformOverlayStabilityInstaller,
  installPlatformOverlayStability,
  platformOverlayStabilityRootSelectors,
} from "../src/core/overlay-stability.mjs";

test("Overlay stability core keeps platform overlay selector contract", () => {
  expect(platformOverlayStabilityRootSelectors).toContain('[role="dialog"][aria-modal="true"]');
  expect(platformOverlayStabilityRootSelectors).toContain("[data-admin-user-editor-overlay]");
  expect(platformOverlayStabilityRootSelectors).toContain("[data-player-profile-modal-overlay]");
  expect(platformOverlayStabilityRootSelectors).toContain(".medical-modal-layer");
  expect(platformOverlayStabilityRootSelectors).toContain(".scouting-profile-modal");
});

test("Overlay stability installer is a safe no-op without a DOM", () => {
  expect(installPlatformOverlayStability({ win: null, document: null })).toBe(false);
  const installer = createPlatformOverlayStabilityInstaller({ win: null, document: null });
  expect(installer.install()).toBe(false);
  expect(installer.state.installed).toBe(false);
});

test("Overlay stability preserves platform workspace scroll positions", () => {
  const listeners = new Map();
  class FakeElement {
    constructor() {
      this.clientHeight = 480;
      this.scrollHeight = 1600;
      this.scrollLeft = 0;
      this.scrollTop = 0;
      this.dataset = {};
      this.hidden = false;
      this.classList = { add() {}, remove() {} };
    }
    closest() { return null; }
    getBoundingClientRect() { return { width: 1, height: 1 }; }
    matches() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  class FakeMutationObserver {
    observe() {}
  }
  const contentScroller = new FakeElement();
  const body = new FakeElement();
  body.dataset.activeWorkspace = "schedule";
  const documentRef = {
    body,
    documentElement: contentScroller,
    scrollingElement: contentScroller,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    querySelector(selector) {
      return selector === ".platform-content" ? contentScroller : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const win = {
    document: documentRef,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    addEventListener() {},
    getComputedStyle() {
      return { display: "block", opacity: "1", visibility: "visible" };
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };

  const installer = createPlatformOverlayStabilityInstaller({
    document: documentRef,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame: win.requestAnimationFrame,
    win,
  });
  expect(installer.install()).toBe(true);

  contentScroller.scrollTop = 720;
  listeners.get("scroll")?.({ target: contentScroller });
  contentScroller.scrollTop = 0;
  win.footballScienceOverlayStability.prepareWorkspaceRestore("schedule");
  listeners.get("scroll")?.({ target: contentScroller });

  expect(win.footballScienceOverlayStability.restoreWorkspace("schedule")).toBe(true);
  expect(contentScroller.scrollTop).toBe(720);
});
