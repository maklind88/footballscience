import { expect, test } from "@playwright/test";
import { bindPlatformNavigationInteractions } from "../src/core/platform-navigation-bindings.mjs";

class FakeElement {
  constructor(value = "") {
    this.dataset = value ? { openWorkspace: value } : {};
    this.listeners = new Map();
    this.value = value;
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
  contains() {
    return false;
  }
  closest(selector) {
    return selector === "[data-open-workspace]" && this.dataset.openWorkspace ? this : null;
  }
  dispatch(type, event = {}) {
    this.listeners.get(type)?.({ target: this, ...event });
  }
}

test("platform navigation bindings keep sidebar and workspace interactions outside app.js", async ({}, testInfo) => {
  const fs = await import("node:fs/promises");
  const appSource = testInfo.config.configFile ? await fs.readFile("app.js", "utf8") : "";
  expect(appSource).not.toContain("ui.workspaceList?.addEventListener(\"mouseover\"");
  expect(appSource).not.toContain("ui.topIconMenu?.addEventListener(\"focusin\"");
});

test("platform navigation bindings preserve shell navigation behavior", () => {
  const hubState = { sidebarCollapsed: false };
  const calls = [];
  const ui = {
    sidebarToggle: new FakeElement(),
    topIconMenu: new FakeElement(),
    workspaceList: new FakeElement(),
    workspaceQuickSwitch: new FakeElement("schedule"),
    workspaceTitle: new FakeElement(),
  };
  const win = new FakeElement();
  const trigger = new FakeElement("medical-team");
  bindPlatformNavigationInteractions({
    getHubState: () => hubState,
    platformNavigationController: {
      hideTopIconTooltip: () => calls.push("hide"),
      showTopIconTooltip: (node) => calls.push(`show:${node?.dataset?.openWorkspace || ""}`),
    },
    preloadWorkspaceFromTrigger: (node) => calls.push(`preload:${node?.dataset?.openWorkspace || ""}`),
    renderWorkspaceChrome: () => calls.push("render"),
    setActiveWorkspace: (workspaceId) => calls.push(`set:${workspaceId}`),
    ui,
    win,
    writeWorkspaceHubState: () => calls.push("write"),
  });

  ui.sidebarToggle.dispatch("click");
  expect(hubState.sidebarCollapsed).toBe(true);
  expect(calls).toContain("write");
  expect(calls).toContain("render");

  ui.workspaceQuickSwitch.dispatch("change");
  expect(calls).toContain("set:schedule");

  ui.workspaceList.listeners.get("click")({ target: trigger });
  ui.topIconMenu.listeners.get("mouseover")({ target: trigger });
  expect(calls).toContain("set:medical-team");
  expect(calls).toContain("preload:medical-team");
  expect(calls).toContain("show:medical-team");

  let prevented = false;
  ui.workspaceTitle.listeners.get("keydown")({ key: " ", preventDefault: () => { prevented = true; } });
  expect(prevented).toBe(true);
  expect(calls).toContain("set:home");
});
