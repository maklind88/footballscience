import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createCentralAppStateReloadService } from "../src/core/central-app-state-reload-service.mjs";

function createHarness(options = {}) {
  const calls = [];
  const timers = [];
  const state = {
    hubState: { activeWorkspaceId: options.activeWorkspaceId || "session-planner" },
    sessionPlannerState: {
      selectedDate: "2026-06-08",
      sessions: {
        "2026-06-08": { selectedBlockId: "block-1", blocks: [{ id: "block-1" }, { id: "block-2" }] },
      },
    },
  };
  const documentRef = {
    activeElement: options.activeElement || null,
    hasFocus: () => options.hasFocus !== false,
    visibilityState: options.visibilityState || "visible",
  };
  const service = createCentralAppStateReloadService({
    activeRefreshMinMs: 10,
    defaultActiveWorkspaceId: "home",
    documentRef,
    getCentralStateBridge: () => ({
      hydrate: async () => calls.push("hydrate"),
    }),
    getCurrentPlatformUser: () => options.currentUser ?? { id: "coach-1" },
    getHubState: () => state.hubState,
    getSessionPlannerState: () => state.sessionPlannerState,
    hasPendingCentralStateWrites: () => options.pendingWrites || false,
    intervalRefreshMinMs: 10,
    isEditableKeyboardTarget: (element) => Boolean(element?.isEditable),
    queueCentralStateStatus: (message) => calls.push(["status", message]),
    queueSessionPlannerSnapshotRecovery: () => calls.push("snapshot-recovery"),
    readMedicalState: () => ({ module: "medical" }),
    readPeriodizationState: () => ({ module: "periodization" }),
    readPlayerProfilesState: () => ({ module: "profiles" }),
    readScheduleState: () => ({ module: "schedule" }),
    readScoutingState: () => ({ module: "scouting" }),
    readSessionPlannerExerciseLibrary: () => ({ module: "exercise-library" }),
    readSessionPlannerState: () => ({
      selectedDate: "server-date",
      sessions: {
        "2026-06-08": { selectedBlockId: "server-block", blocks: [{ id: "block-1" }, { id: "block-3" }] },
      },
    }),
    readTransferRoomState: () => ({ module: "transfer-room" }),
    readWorkspaceHubState: () => ({ activeWorkspaceId: "admin", workspaces: [] }),
    refreshIntervalMs: 100,
    renderWorkspaceChrome: () => calls.push("render-workspace"),
    repairWorkspaceState: (hubState) => ({ ...hubState, repaired: true }),
    retryCentral: () => calls.push("retry"),
    scheduleDashboardLoginPopups: () => calls.push("login-popups"),
    sessionPlannerLocalUiState: { state: options.localUiState || {} },
    setHubState: (nextState) => { state.hubState = nextState; },
    setMedicalState: (nextState) => { state.medicalState = nextState; },
    setPeriodizationState: (nextState) => { state.periodizationState = nextState; },
    setPlayerProfilesState: (nextState) => { state.playerProfilesState = nextState; },
    setScheduleState: (nextState) => { state.scheduleState = nextState; },
    setScoutingState: (nextState) => { state.scoutingState = nextState; },
    setSessionPlannerExerciseLibrary: (nextState) => { state.sessionPlannerExerciseLibrary = nextState; },
    setSessionPlannerState: (nextState) => { state.sessionPlannerState = nextState; },
    setTransferRoomState: (nextState) => { state.transferRoomState = nextState; },
    syncGameSimulatorSavedSequencesFromStorage: () => calls.push("simulator-sync"),
    syncSelectedSessionPlannerBlockFieldsFromDom: () => calls.push("session-dom-sync"),
    ui: {
      scoutingWorkspace: {
        querySelector: () => options.scoutingOverlay || null,
      },
    },
    win: {
      setInterval: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      },
    },
  });
  return { calls, documentRef, service, state, timers };
}

test("central app-state reload service owns reload and refresh bodies outside app-runtime", () => {
  const runtimeSource = readFileSync(new URL("../app-runtime.js", import.meta.url), "utf8");
  const accessorsSource = readFileSync(new URL("../src/core/platform-runtime-accessors.mjs", import.meta.url), "utf8");
  const serviceSource = readFileSync(new URL("../src/core/central-app-state-reload-service.mjs", import.meta.url), "utf8");

  expect(runtimeSource).toContain("createCentralAppStateReloadService({");
  expect(runtimeSource).toContain("platform-runtime-accessors.mjs");
  expect(runtimeSource).toContain("centralAppStateReloadService,");
  expect(accessorsSource).toContain("reloadCentralizedAppStateFromStorage");
  expect(accessorsSource).toContain('callAccessorSource("centralAppStateReloadService", "reloadCentralizedAppStateFromStorage"');
  expect(runtimeSource).not.toContain("let centralizedAppStateReloadPending = false");
  expect(runtimeSource).not.toContain("function refreshCentralStateFromSource(reason = \"refresh\", options = {})");
  expect(runtimeSource).not.toContain("function reloadCentralizedAppStateFromStorage(...args)");
  expect(serviceSource).toContain("function reloadCentralizedAppStateFromStorage()");
  expect(serviceSource).toContain("function refreshCentralStateFromSource(reason = \"refresh\", options = {})");
});

test("central app-state reload service preserves session selection while reloading every module state", () => {
  const { calls, service, state } = createHarness();

  service.reloadCentralizedAppStateFromStorage();

  expect(calls).toEqual(["session-dom-sync", "simulator-sync", "snapshot-recovery", "render-workspace", "login-popups"]);
  expect(state.hubState).toMatchObject({ activeWorkspaceId: "session-planner", repaired: true });
  expect(state.periodizationState).toEqual({ module: "periodization" });
  expect(state.scheduleState).toEqual({ module: "schedule" });
  expect(state.medicalState).toEqual({ module: "medical" });
  expect(state.playerProfilesState).toEqual({ module: "profiles" });
  expect(state.scoutingState).toEqual({ module: "scouting" });
  expect(state.transferRoomState).toEqual({ module: "transfer-room" });
  expect(state.sessionPlannerExerciseLibrary).toEqual({ module: "exercise-library" });
  expect(state.sessionPlannerState.selectedDate).toBe("2026-06-08");
  expect(state.sessionPlannerState.sessions["2026-06-08"].selectedBlockId).toBe("block-1");
});

test("central app-state reload service preserves defer, pending, and flush behavior", () => {
  const editableHarness = createHarness({ activeElement: { isEditable: true } });
  editableHarness.service.requestCentralizedAppStateReload();
  expect(editableHarness.service.isCentralizedAppStateReloadPending()).toBe(true);

  editableHarness.documentRef.activeElement = null;
  editableHarness.service.flushDeferredCentralizedAppStateReload();
  expect(editableHarness.service.isCentralizedAppStateReloadPending()).toBe(false);
  expect(editableHarness.calls).toContain("render-workspace");

  const overlayHarness = createHarness({ activeWorkspaceId: "scouting", scoutingOverlay: {} });
  expect(overlayHarness.service.shouldDeferCentralizedAppStateReload()).toBe(true);

  const sessionOverlayHarness = createHarness({ localUiState: { sessionPlannerPlayerBoardOpen: true } });
  expect(sessionOverlayHarness.service.shouldDeferCentralizedAppStateReload()).toBe(true);
});

test("central app-state reload service preserves central refresh throttling and interval setup", async () => {
  const { calls, service, timers } = createHarness({ pendingWrites: true });

  service.refreshCentralStateFromSource("focus", { force: true });
  await Promise.resolve();
  await Promise.resolve();

  expect(calls).toContain("hydrate");
  expect(calls).toContain("retry");

  service.startCentralStateRefreshTimer();
  service.startCentralStateRefreshTimer();
  expect(timers).toHaveLength(1);
  expect(timers[0].delay).toBe(100);
});
