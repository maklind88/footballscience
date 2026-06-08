import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { bindPlatformWorkspaceRuntimeBindings } from "../src/core/platform-workspace-runtime-bindings.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createControl() {
  const listeners = {};
  return {
    listeners,
    clicks: 0,
    value: "selected",
    files: [],
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    click() {
      this.clicks += 1;
      listeners.click?.({ target: this });
    },
  };
}

function createHarness() {
  const calls = [];
  const ui = {
    adminWorkspace: { id: "admin" },
    dataSafetyExportButton: createControl(),
    dataSafetyImportButton: createControl(),
    dataSafetyImportInput: createControl(),
    medicalTeamWorkspace: { id: "medical" },
    playerProfilesWorkspace: { id: "players" },
    profileMenu: { id: "profile-menu" },
    profileWorkspace: { id: "profile" },
    sessionPlannerWorkspace: { id: "session" },
    staffWorkspace: { id: "staff" },
  };
  const createBinder = (name) => (config) => {
    calls.push(name);
    calls.push([`${name}-config`, config]);
    return { name };
  };
  const actions = {
    exportFootballScienceDataBackup: () => calls.push("export"),
    getAdminRuntimeBindingState: () => ({ selected: "admin-state" }),
    importFootballScienceDataBackupFile: (file) => calls.push(["import", file]),
    setProfileMenuOpen: (isOpen) => calls.push(["profile-menu", isOpen]),
  };

  bindPlatformWorkspaceRuntimeBindings({
    ui,
    win: { name: "window" },
    bindProfileStaffRuntimeBindings: createBinder("profile"),
    bindAdminRuntimeBindings: createBinder("admin"),
    bindMedicalRuntimeBindings: createBinder("medical"),
    bindPlayerProfileRuntimeBindings: createBinder("player"),
    bindSessionPlannerRuntimeBindings: createBinder("session"),
    periodizationWorkspaceController: { bind: () => calls.push("periodization-bind") },
    scheduleWorkspaceController: { bind: () => calls.push("schedule-bind") },
    profileState: {
      getSelectedStaffUserId: () => "staff-1",
      setSelectedStaffUserId: () => calls.push("set-staff"),
    },
    medicalState: {
      getMedicalState: () => ({ players: [] }),
    },
    playerProfileState: {
      getPlayerProfilesState: () => ({ players: [] }),
    },
    sessionPlannerState: {
      localUiState: { selectedBlockId: "block-1" },
      runtimeDelegates: { renderSessionPlannerWorkspace: () => {} },
      boardHistory: { undo: () => {}, redo: () => {} },
      normalizers: { normalizeTacticalColor: (value) => value },
    },
    actions,
  });

  return { calls, ui };
}

test("platform workspace runtime bindings own non-chat workspace binding orchestration", () => {
  const appSource = readProjectFile("app-runtime.js");
  const facadeSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const coreIndexSource = readProjectFile("src/core/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindProfileStaffRuntimeBindings({");
  expect(appSource).not.toContain("bindAdminRuntimeBindings({");
  expect(appSource).not.toContain("bindMedicalRuntimeBindings({");
  expect(appSource).not.toContain("bindPlayerProfileRuntimeBindings({");
  expect(appSource).not.toContain("bindSessionPlannerRuntimeBindings({");
  expect(facadeSource).toContain("bindProfileStaffRuntimeBindings({");
  expect(facadeSource).toContain("bindAdminRuntimeBindings({");
  expect(facadeSource).toContain("bindMedicalRuntimeBindings({");
  expect(facadeSource).toContain("bindPlayerProfileRuntimeBindings({");
  expect(facadeSource).toContain("bindSessionPlannerRuntimeBindings({");
  expect(facadeSource).toContain("dataSafetyExportButton");
  expect(facadeSource).toContain("dataSafetyImportInput");
  expect(facadeSource).not.toMatch(/dashboardChatWidgetRoot|data-dashboard-chat|renderDashboardChatWidget|createDashboardMessageWithApi/);
  expect(coreIndexSource).toContain('export * from "./platform-workspace-runtime-bindings.mjs";');
});

test("platform workspace runtime bindings preserve binding order and injected configs", () => {
  const { calls } = createHarness();
  const names = calls.filter((call) => typeof call === "string");

  expect(names).toEqual(["profile", "admin", "medical", "player", "session", "periodization-bind", "schedule-bind"]);
  expect(calls).toContainEqual(["profile-config", expect.objectContaining({
    ui: expect.objectContaining({ profileMenu: expect.any(Object), profileWorkspace: expect.any(Object), staffWorkspace: expect.any(Object) }),
    state: expect.objectContaining({ getSelectedStaffUserId: expect.any(Function) }),
  })]);
  expect(calls).toContainEqual(["admin-config", expect.objectContaining({
    workspaceElement: { id: "admin" },
    state: { selected: "admin-state" },
  })]);
  expect(calls).toContainEqual(["medical-config", expect.objectContaining({ workspaceElement: { id: "medical" } })]);
  expect(calls).toContainEqual(["player-config", expect.objectContaining({ workspaceElement: { id: "players" } })]);
  expect(calls).toContainEqual(["session-config", expect.objectContaining({ workspaceElement: { id: "session" } })]);
});

test("platform workspace runtime bindings preserve data-safety export and import controls", () => {
  const { calls, ui } = createHarness();
  const backupFile = { name: "backup.json" };

  ui.dataSafetyExportButton.listeners.click();
  expect(calls).toContain("export");
  expect(calls).toContainEqual(["profile-menu", false]);

  ui.dataSafetyImportButton.listeners.click();
  expect(ui.dataSafetyImportInput.clicks).toBe(1);

  ui.dataSafetyImportInput.files = [backupFile];
  ui.dataSafetyImportInput.value = "backup-selected";
  ui.dataSafetyImportInput.listeners.change({ target: ui.dataSafetyImportInput });
  expect(calls).toContainEqual(["import", backupFile]);
  expect(calls).toContainEqual(["profile-menu", false]);
  expect(ui.dataSafetyImportInput.value).toBe("");
});
