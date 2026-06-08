import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createCentralRuntimeFacade, createCentralRuntimeStorageConfig } from "../src/core/central-runtime-facade.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createFakeStorageConstructor() {
  function FakeStorage() {
    this.values = new Map();
  }
  Object.defineProperty(FakeStorage.prototype, "length", {
    get() {
      return this.values.size;
    },
  });
  FakeStorage.prototype.getItem = function getItem(key) {
    const normalizedKey = String(key);
    return this.values.has(normalizedKey) ? this.values.get(normalizedKey) : null;
  };
  FakeStorage.prototype.setItem = function setItem(key, value) {
    this.values.set(String(key), String(value));
  };
  FakeStorage.prototype.removeItem = function removeItem(key) {
    this.values.delete(String(key));
  };
  FakeStorage.prototype.clear = function clear() {
    this.values.clear();
  };
  FakeStorage.prototype.key = function key(index) {
    return Array.from(this.values.keys())[index] ?? null;
  };
  return FakeStorage;
}

function createHarness() {
  const StorageConstructor = createFakeStorageConstructor();
  const localStorage = new StorageConstructor();
  const autosaveStatuses = [];
  const handledKeys = [];
  const syncCalls = [];
  const timers = new Map();
  let timerId = 0;
  const win = {
    localStorage,
    location: { href: "https://footballscience.xyz/" },
    footballScienceCentralState: {
      getStatus: () => ({ metadata: { "football-schedule-v1": { revision: 12 } } }),
      isCentralKey: (key) => String(key || "").startsWith("football-"),
      syncKey: async (key, value, options) => {
        syncCalls.push({ key, value, options });
        return { ok: true, value };
      },
    },
    setTimeout: (callback, delay) => {
      timerId += 1;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    alert: () => {},
    confirm: () => true,
  };
  const storageKeys = {
    workspaceHubStorageKey: "football-workspace-hub-v3",
    platformStructureStorageKey: "football-platform-structure-v1",
    periodizationStorageKey: "football-periodization-v2",
    scheduleStorageKey: "football-schedule-v1",
    sessionPlannerStorageKey: "football-session-planner-v3",
    sessionPlannerExerciseLibraryStorageKey: "football-session-planner-exercise-library-v1",
    sessionPlannerExerciseLibraryBackupStorageKey: "football-session-planner-exercise-library-backup-v1",
    sessionPlannerExerciseLibraryFoldersStorageKey: "football-session-planner-exercise-library-folders-v1",
    sessionPlannerExerciseLibraryFoldersBackupStorageKey: "football-session-planner-exercise-library-folders-backup-v1",
    playerProfilesStorageKey: "football-player-profiles-v1",
    dashboardTaskStorageKey: "football-dashboard-tasks-v1",
    dashboardChatStorageKey: "football-dashboard-chat-v1",
    dashboardNotificationSeenStorageKey: "football-dashboard-notification-seen-v1",
    dashboardTutorialPrefsStorageKey: "football-dashboard-tutorial-prefs-v1",
    dashboardNewsSeenStorageKey: "football-dashboard-news-seen-v1",
    platformAppearanceStorageKey: "football-platform-appearance-v1",
    medicalTeamStorageKey: "football-medical-team-v1",
    scoutingStorageKey: "football-scouting-v1",
    gameplanStorageKey: "football-gameplan-v1",
    transferRoomStorageKey: "football-transfer-room-v1",
    sequenceStorageKey: "football-simulator-sequence-v1",
    sequenceLibraryStorageKey: "football-simulator-sequence-library-v2",
    dataSafetyStorageKey: "football-data-safety-v1",
    dataSafetyExportSchema: "football-science-backup-v1",
    dataSafetyDatabaseName: "football-science-data-safety-v1",
  };
  const facade = createCentralRuntimeFacade({
    win,
    documentRef: {
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {} }),
    },
    navigatorRef: { storage: { persist: () => Promise.resolve(true) } },
    storageConstructor: StorageConstructor,
    blobConstructor: class BlobMock {},
    urlApi: { createObjectURL: () => "blob://backup", revokeObjectURL: () => {} },
    ui: { dataSafetyStatus: { classList: { toggle: () => {} }, textContent: "", title: "" } },
    storageKeys,
    formatDataSafetyTime: (value) => (value ? "now" : ""),
    getActiveWorkspaceId: () => "schedule",
    getCurrentPlatformUser: () => ({ id: "coach-1" }),
    handleSyncedStateValue: (key, value) => handledKeys.push({ key, value }),
    isSessionPlannerAutosaveKey: (key) => key === storageKeys.sessionPlannerStorageKey,
    mergePeriodizationStatePreservingLocalUi: (_currentValue, syncedValue) => `periodization:${syncedValue}`,
    mergeScheduleStatePreservingLocalUi: (_currentValue, syncedValue) => `schedule:${syncedValue}`,
    getSessionPlannerLocalUiState: () => ({ state: {} }),
    setAutosaveStatusForKey: (...args) => autosaveStatuses.push(args),
    shouldDeferCentralizedAppStateReload: () => false,
    showSessionPlannerToast: (...args) => autosaveStatuses.push(["toast", ...args]),
  });
  return { autosaveStatuses, facade, handledKeys, localStorage, storageKeys, syncCalls, timers };
}

test("central runtime facade owns data-safety and central-sync composition outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const facadeSource = readProjectFile("src/core/central-runtime-facade.mjs");
  const coreIndex = readProjectFile("src/core/index.mjs");

  expect(appSource).toContain("createCentralRuntimeFacade({");
  expect(appSource).toContain("function handleCentralSyncedStateValue(key)");
  expect(appSource).not.toContain("createDataSafetyRuntimeService({");
  expect(appSource).not.toContain("createCentralSyncRuntimeService({");
  expect(facadeSource).toContain("createDataSafetyRuntimeService({");
  expect(facadeSource).toContain("createCentralSyncRuntimeService({");
  expect(facadeSource).not.toMatch(/renderDashboardChatWidget|renderMedicalTeamWorkspace|renderPlayerProfilesWorkspace|renderScoutingWorkspace/);
  expect(coreIndex).toContain('export * from "./central-runtime-facade.mjs";');
});

test("central runtime facade preserves protected write tracking and central sync revision metadata", async () => {
  const { autosaveStatuses, facade, localStorage, syncCalls } = createHarness();

  facade.installFootballDataSafety();
  localStorage.setItem("football-schedule-v1", "{\"events\":[]}");

  expect(facade.readDataSafetyManifest().entries["football-schedule-v1"]).toMatchObject({
    label: "Schedule",
    pendingCentralSync: true,
    size: 13,
  });
  expect(autosaveStatuses).toContainEqual(["football-schedule-v1", "saving", "Saving"]);

  await facade.flushCentralStateWrites();

  expect(syncCalls).toEqual([
    {
      key: "football-schedule-v1",
      value: "{\"events\":[]}",
      options: { removed: false, baseRevision: 12 },
    },
  ]);
  expect(facade.readDataSafetyManifest().entries["football-schedule-v1"]).toMatchObject({
    pendingCentralSync: false,
  });
});

test("central runtime storage config keeps protected module labels deterministic", () => {
  const config = createCentralRuntimeStorageConfig({
    scheduleStorageKey: "football-schedule-v1",
    medicalTeamStorageKey: "football-medical-team-v1",
    dashboardChatStorageKey: "football-dashboard-chat-v1",
    sequenceLibraryStorageKey: "football-simulator-sequence-library-v2",
  });

  expect(config.protectedStorageKeys).toEqual([
    "football-schedule-v1",
    "football-medical-team-v1",
    "football-simulator-sequence-library-v2",
  ]);
  expect(config.storageLabels).toMatchObject({
    "football-schedule-v1": "Schedule",
    "football-medical-team-v1": "Medical Room",
    "football-dashboard-chat-v1": "Team Chat",
  });
  expect(config.legacyStorageKeys["football-simulator-sequence-library-v2"]).toEqual(["football-simulator-sequence-library-v1"]);
});
