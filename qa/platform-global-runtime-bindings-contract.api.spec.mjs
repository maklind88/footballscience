import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { bindPlatformGlobalRuntimeEvents } from "../src/core/platform-global-runtime-bindings.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createEventHub(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    listeners,
    addEventListener(type, handler) {
      listeners[type] ||= [];
      listeners[type].push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners[type] || []) handler(event);
    },
  };
}

test("platform global runtime bindings own lifecycle events outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const moduleSource = readProjectFile("src/core/platform-global-runtime-bindings.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("bindPlatformGlobalRuntimeEvents({");
  expect(appSource).not.toContain('win.addEventListener("platform:user-change"');
  expect(appSource).not.toContain('win.addEventListener("footballscience:central-state-ready"');
  expect(appSource).not.toContain('win.addEventListener("storage"');
  expect(appSource).not.toContain('document.addEventListener("visibilitychange"');
  expect(appSource).not.toContain("workspaceModuleRuntimeController.bindWorkspaceModuleEvents();");

  expect(moduleSource).toContain('win.addEventListener("platform:user-change"');
  expect(moduleSource).toContain('win.addEventListener("footballscience:central-state-ready"');
  expect(moduleSource).toContain('win.addEventListener("storage"');
  expect(moduleSource).toContain('documentRef.addEventListener("visibilitychange"');
  expect(moduleSource).not.toMatch(/data-dashboard-chat-form|data-dashboard-chat-input|createDashboardMessageWithApi/);
  expect(packageJson.scripts.check).toContain("src/core/platform-global-runtime-bindings.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-global-runtime-bindings-contract.api.spec.mjs");
});

test("platform global runtime bindings preserve boot, escape, and storage behavior", () => {
  const calls = [];
  let hubState = { activeWorkspaceId: "medical-team" };
  let playerProfilesState = null;
  let medicalPlayerModalOpen = true;
  let medicalPlayerModalTab = "availability";
  const documentRef = createEventHub({
    visibilityState: "visible",
    querySelectorAll: () => [],
  });
  const win = createEventHub({
    setTimeout: (handler) => {
      handler();
      return 1;
    },
  });

  bindPlatformGlobalRuntimeEvents({
    documentRef,
    win,
    ui: { profileMenuButton: { focus: () => calls.push("profile-focus") }, profileMenu: true },
    workspaceModuleRuntimeController: { bindWorkspaceModuleEvents: () => calls.push("bind-workspaces") },
    isSimulatorIntroActive: () => true,
    isEditableKeyboardTarget: () => false,
    launchGameSimulatorFromIntro: () => calls.push("launch-simulator"),
    isProfileMenuOpen: () => true,
    setProfileMenuOpen: (isOpen) => calls.push(`profile-menu:${isOpen}`),
    getMedicalPlayerModalOpen: () => medicalPlayerModalOpen,
    setMedicalPlayerModalOpen: (isOpen) => {
      medicalPlayerModalOpen = isOpen;
      calls.push(`medical-modal:${isOpen}`);
    },
    setMedicalPlayerModalTab: (tab) => {
      medicalPlayerModalTab = tab;
      calls.push(`medical-tab:${tab}`);
    },
    renderMedicalTeamWorkspace: () => calls.push("render-medical"),
    getPlayerProfileModalOpen: () => false,
    getPlayerProfileNewPlayerModalOpen: () => false,
    getPeriodizationOverlayState: () => ({ open: false }),
    hasActiveMetricTooltip: () => false,
    getCurrentPlatformUser: () => ({ id: "coach-1" }),
    startDashboardPresenceRuntime: () => calls.push("presence-start"),
    stopDashboardPresenceRuntime: () => calls.push("presence-stop"),
    getCentralStateBridge: () => ({ isHydrated: () => true }),
    reloadCentralizedAppStateFromStorage: () => calls.push("reload-central"),
    getHubState: () => hubState,
    renderWorkspaceChrome: () => calls.push("render-workspace-chrome"),
    scheduleDashboardLoginPopups: () => calls.push("login-popups"),
    getDataSafetyRuntimeStatus: () => ({ lastError: "x" }),
    retryCentral: () => calls.push("retry-central"),
    flushCentralStateWrites: () => calls.push("flush-central"),
    refreshDashboardPresence: () => calls.push("presence-refresh"),
    requestCentralizedAppStateReload: () => calls.push("request-reload"),
    refreshDataSafetyStatus: () => calls.push("data-safety"),
    flushDeferredCentralizedAppStateReload: () => calls.push("flush-deferred"),
    markDashboardPresenceActivity: () => calls.push("activity"),
    pushDashboardPresence: (status) => calls.push(`push:${status}`),
    queueDashboardChatCurrentViewRefresh: () => calls.push("chat-refresh"),
    refreshCentralStateFromSource: (source) => calls.push(`central-source:${source}`),
    pauseDashboardPresenceRuntime: () => calls.push("presence-pause"),
    renderDashboardChatWidget: () => calls.push("render-chat"),
    centralAppStateReloadService: { startCentralStateRefreshTimer: () => calls.push("central-timer") },
    isDataSafetyProtectedStorageKey: () => false,
    dashboardTaskStorageKey: "tasks",
    dashboardNotificationSeenStorageKey: "seen",
    playerProfilesStorageKey: "profiles",
    scoutingStorageKey: "scouting",
    transferRoomStorageKey: "transfer",
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
      calls.push("set-profiles");
    },
    readPlayerProfilesState: () => ({ players: [{ id: "p1" }] }),
    syncTransferRoomLinkedState: () => calls.push("sync-transfer"),
    renderPlayerProfilesWorkspace: () => calls.push("render-profiles"),
    setScoutingState: () => calls.push("set-scouting"),
    readScoutingState: () => ({}),
    getScoutingState: () => ({}),
    preserveScoutingTransientUiState: (nextState) => nextState,
    setTransferRoomState: () => calls.push("set-transfer"),
    readTransferRoomState: () => ({}),
    renderTransferRoomWorkspace: () => calls.push("render-transfer"),
    markDashboardHomeSeenForCurrentUser: () => calls.push("home-seen"),
    renderDashboardCards: () => calls.push("render-home"),
    initializeWorkspaceHub: () => calls.push("init-hub"),
  });

  expect(calls).toEqual(expect.arrayContaining(["bind-workspaces", "central-timer", "data-safety", "init-hub", "presence-start"]));

  let prevented = false;
  documentRef.dispatch("keydown", {
    key: "Enter",
    target: {},
    preventDefault: () => {
      prevented = true;
    },
  });
  expect(prevented).toBe(true);
  expect(calls).toContain("launch-simulator");

  documentRef.dispatch("keydown", { key: "Escape", target: {} });
  expect(medicalPlayerModalOpen).toBe(false);
  expect(medicalPlayerModalTab).toBe("availability");
  expect(calls).toEqual(expect.arrayContaining(["profile-menu:false", "profile-focus", "render-medical"]));

  win.dispatch("platform:user-change", {});
  expect(calls).toEqual(expect.arrayContaining(["presence-start", "reload-central"]));
  expect(calls).not.toContain("login-popups");

  win.dispatch("storage", { key: "profiles" });
  expect(playerProfilesState).toEqual({ players: [{ id: "p1" }] });
  expect(calls).toContain("render-medical");

  hubState = { activeWorkspaceId: "home" };
  win.dispatch("storage", { key: "tasks" });
  expect(calls).toEqual(expect.arrayContaining(["home-seen", "render-home"]));
});
