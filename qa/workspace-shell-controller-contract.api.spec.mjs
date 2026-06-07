import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspaceShellController } from "../src/core/workspace-shell-controller.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createToggleTarget(dataset = {}) {
  return {
    dataset,
    active: false,
    classList: {
      toggle(name, enabled) {
        if (name === "is-active") this.owner.active = Boolean(enabled);
      },
      owner: null,
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  let hubState = options.hubState ?? {
    activeWorkspaceId: "home",
    profile: { name: "Mak Lind", role: "Coach", shortName: "Mak" },
    sidebarCollapsed: false,
    workspaces: [
      { id: "home", title: "Home", status: "Ready" },
      { id: "schedule", title: "Schedule", status: "Ready" },
      { id: "game-simulator", title: "Game Simulator", status: "Ready" },
    ],
  };
  const body = { dataset: {} };
  const workspaceViews = [
    createToggleTarget({ workspaceView: "home" }),
    createToggleTarget({ workspaceView: "schedule" }),
  ];
  const workspaceTriggers = [
    createToggleTarget({ openWorkspace: "home" }),
    createToggleTarget({ openWorkspace: "schedule" }),
  ];
  for (const target of [...workspaceViews, ...workspaceTriggers]) {
    target.classList.owner = target;
  }
  const documentRef = {
    body,
    querySelectorAll(selector) {
      if (selector === ".workspace-view") return workspaceViews;
      if (selector === "[data-open-workspace]") return workspaceTriggers;
      return [];
    },
  };
  const ui = {
    coachAvatar: {},
    coachName: { textContent: "" },
    coachRole: { textContent: "" },
    dashboardDate: { textContent: "" },
    dashboardGreeting: { textContent: "" },
    gameSimulatorWorkspace: { classList: { contains: () => Boolean(options.simulatorLaunched) } },
    hubShell: { classList: { toggle: (name, enabled) => calls.push(["shell-toggle", name, enabled]) } },
    profileMenuButton: { classList: { toggle: (name, enabled) => calls.push(["profile-menu-toggle", name, enabled]) } },
    workspaceMeta: { textContent: "" },
    workspaceStatus: { textContent: "" },
    workspaceTitle: { textContent: "" },
  };
  const controller = createWorkspaceShellController({
    applyUserAvatar: () => calls.push(["avatar"]),
    closeDashboardModal: (value) => calls.push(["close-dashboard", value]),
    defaultHubState: { workspaces: hubState.workspaces },
    documentRef,
    formatUserName: (user) => user.name,
    getAccessibleWorkspacePool: () => hubState.workspaces,
    getDashboardDateLabel: () => "Today",
    getHubState: () => hubState,
    getSafeWorkspaceId: (workspaceId) => (hubState.workspaces.some((workspace) => workspace.id === workspaceId) ? workspaceId : ""),
    getUi: () => ui,
    getWorkspaceById: (workspaceId) => hubState.workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    getWorkspaceIdFromUrl: () => options.urlWorkspaceId ?? "",
    getWorkspaceViewId: (workspaceId) => workspaceId,
    hydrateWorkspaceModuleState: (workspaceId) => calls.push(["hydrate", workspaceId]),
    markDashboardHomeSeenForCurrentUser: () => calls.push(["home-seen"]),
    onLeavePlayerProfiles: () => calls.push(["leave-player-profiles"]),
    pauseSimulatorForWorkspaceSwitch: () => calls.push(["pause-simulator"]),
    platformNavigationController: {
      renderPlaceholderWorkspace: () => calls.push(["placeholder"]),
      renderTopIconMenu: () => calls.push(["top-icons"]),
      renderWorkspaceList: () => calls.push(["workspace-list"]),
      renderWorkspaceQuickSwitch: (workspaceId) => calls.push(["quick-switch", workspaceId]),
    },
    queueCriticalWorkspacePreloads: () => calls.push(["critical-preloads"]),
    queueDashboardChatStylesheetLoad: () => calls.push(["chat-css"]),
    queueWorkspaceModulePreload: (workspaceId) => calls.push(["preload", workspaceId]),
    readRememberedWorkspaceId: () => options.rememberedWorkspaceId ?? "",
    readWorkspaceHubState: () => hubState,
    rememberActiveWorkspaceId: (workspaceId) => calls.push(["remember", workspaceId]),
    renderDashboardCards: () => calls.push(["dashboard-cards"]),
    renderDashboardChatWidget: () => calls.push(["chat-widget"]),
    renderWorkspaceByViewId: (viewId) => calls.push(["render-view", viewId]),
    repairWorkspaceState: (state) => state,
    resetGameSimulatorIntro: () => calls.push(["reset-simulator"]),
    scheduleDashboardLoginPopups: () => calls.push(["login-popups"]),
    setHubState: (nextState) => { hubState = nextState; },
    simulatorRender: () => calls.push(["simulator-render"]),
    startPlatformThemeScheduler: () => calls.push(["theme"]),
    startSimulatorAnimationLoop: () => calls.push(["start-simulator"]),
    stopSimulatorAnimationLoop: () => calls.push(["stop-simulator"]),
    syncAccountMenu: () => calls.push(["account-menu"]),
    syncDashboardChatWidgetNotificationCursor: () => calls.push(["chat-cursor"]),
    syncGameSimulatorIntroState: () => calls.push(["simulator-intro"]),
    syncPlatformAutosaveStatusVisibility: (workspaceId) => calls.push(["autosave", workspaceId]),
    syncPlatformUserFromAuth: () => ({ firstName: "Mak", name: "Mak Lind", role: "admin", title: "Coach" }),
    win: { __pendingWorkspaceId: options.pendingWorkspaceId ?? null },
    workspaceHubDefaultActiveWorkspaceId: "home",
    writeWorkspaceHubState: () => calls.push(["write-hub"]),
  });
  return { body, calls, controller, getHubState: () => hubState, ui, workspaceTriggers, workspaceViews };
}

test("workspace shell controller owns the render/init shell outside app.js", () => {
  const app = readProjectFile("app.js");
  const controller = readProjectFile("src/core/workspace-shell-controller.mjs");

  expect(app).toContain('import { createWorkspaceShellController } from "./src/core/workspace-shell-controller.mjs";');
  expect(app).toContain("const workspaceShellController = createWorkspaceShellController({");
  expect(app).not.toContain("function renderWorkspaceChrome()");
  expect(app).not.toContain("function initializeWorkspaceHub()");
  expect(controller).toContain("renderWorkspaceChrome");
  expect(controller).toContain("setActiveWorkspace");
});

test("workspace shell controller renders the active workspace without owning module internals", () => {
  const harness = createHarness();

  harness.controller.renderWorkspaceChrome();

  expect(harness.body.dataset.appReady).toBe("true");
  expect(harness.body.dataset.activeWorkspace).toBe("home");
  expect(harness.body.dataset.userRole).toBe("admin");
  expect(harness.ui.workspaceTitle.textContent).toBe("Home");
  expect(harness.ui.dashboardGreeting.textContent).toBe("Welcome back, Mak.");
  expect(harness.calls).toContainEqual(["dashboard-cards"]);
  expect(harness.calls).toContainEqual(["chat-widget"]);
  expect(harness.calls).toContainEqual(["stop-simulator"]);
  expect(harness.workspaceViews[0].active).toBe(true);
  expect(harness.workspaceTriggers[0].active).toBe(true);
});

test("workspace shell controller switches workspaces and preserves simulator/profile guards", () => {
  const harness = createHarness({
    hubState: {
      activeWorkspaceId: "game-simulator",
      profile: { name: "Mak Lind", role: "Coach", shortName: "Mak" },
      sidebarCollapsed: false,
      workspaces: [
        { id: "home", title: "Home", status: "Ready" },
        { id: "schedule", title: "Schedule", status: "Ready" },
        { id: "game-simulator", title: "Game Simulator", status: "Ready" },
      ],
    },
  });

  harness.controller.setActiveWorkspace("schedule");

  expect(harness.getHubState().activeWorkspaceId).toBe("schedule");
  expect(harness.calls).toContainEqual(["pause-simulator"]);
  expect(harness.calls).toContainEqual(["stop-simulator"]);
  expect(harness.calls).toContainEqual(["preload", "schedule"]);
  expect(harness.calls).toContainEqual(["remember", "schedule"]);
  expect(harness.calls).toContainEqual(["write-hub"]);
});

test("workspace shell controller initializes pending workspace before URL and remembered workspace", () => {
  const harness = createHarness({
    pendingWorkspaceId: "schedule",
    rememberedWorkspaceId: "home",
    urlWorkspaceId: "game-simulator",
  });

  harness.controller.initializeWorkspaceHub();

  expect(harness.getHubState().activeWorkspaceId).toBe("schedule");
  expect(harness.calls).toContainEqual(["theme"]);
  expect(harness.calls).toContainEqual(["remember", "schedule"]);
  expect(harness.calls).toContainEqual(["chat-css"]);
  expect(harness.calls).toContainEqual(["critical-preloads"]);
  expect(harness.calls).toContainEqual(["login-popups"]);
});
