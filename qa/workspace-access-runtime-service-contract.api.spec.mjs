import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspaceAccessRuntimeService } from "../src/core/workspace-access-runtime-service.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRuntimeSource = fs.readFileSync(path.join(repoRoot, "app-runtime.js"), "utf8");
const platformRuntimeAccessorsSource = fs.readFileSync(path.join(repoRoot, "src/core/platform-runtime-accessors.mjs"), "utf8");
const serviceSource = fs.readFileSync(path.join(repoRoot, "src/core/workspace-access-runtime-service.mjs"), "utf8");

const defaultHubState = {
  activeWorkspaceId: "home",
  profile: {},
  workspaces: [
    { id: "home", kind: "dashboard", title: "Home" },
    { id: "schedule", kind: "schedule", title: "Schedule" },
    { id: "admin", kind: "admin", title: "Admin", requiresAdmin: true },
    { id: "transfer-room", kind: "transfer-room", title: "Transfers" },
    { id: "session-planner", kind: "session", title: "Sessions", status: "Ready" },
    { id: "player-profiles", kind: "player-profiles", title: "Squad Room", meta: "Squad", description: "Players", status: "Ready" },
  ],
  workspaceAccess: {},
};

function createMemoryWindow(url = "https://footballscience.xyz/?workspace=schedule") {
  const localStore = new Map();
  const sessionStore = new Map();
  const storageApi = (store) => ({
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  });
  return {
    location: new URL(url),
    localStorage: storageApi(localStore),
    sessionStorage: storageApi(sessionStore),
  };
}

function createService(overrides = {}) {
  const state = {
    hubState: {
      ...defaultHubState,
      workspaces: defaultHubState.workspaces.map((workspace) => ({ ...workspace })),
      workspaceAccess: { ...defaultHubState.workspaceAccess },
    },
  };
  const win = createMemoryWindow();
  const service = createWorkspaceAccessRuntimeService({
    window: win,
    defaultHubState,
    defaultWorkspaceAccess: {
      home: ["admin", "coach", "guest"],
      schedule: ["admin", "coach", "guest"],
      admin: ["admin", "club-admin", "team-admin"],
      "transfer-room": ["admin", "scout"],
      "session-planner": ["admin", "coach"],
      "player-profiles": ["admin", "coach"],
    },
    defaultWorkspaceEditAccess: {
      schedule: ["admin", "coach"],
      "session-planner": ["admin", "coach"],
      "player-profiles": ["admin", "coach"],
      "transfer-room": ["admin", "scout"],
    },
    requiredWorkspaceAccess: {
      admin: { view: ["admin"], edit: ["admin"] },
    },
    defaultRoles: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"],
    workspaceHubStorageKey: "workspace-hub-test",
    workspaceLastActiveStorageKey: "workspace-last-test",
    defaultActiveWorkspaceId: "home",
    getHubState: () => state.hubState,
    getCurrentPlatformUser: () => overrides.currentUser ?? { id: "coach-1", role: "coach" },
    normalizePlatformRole: (role, fallback = "guest") => String(role || fallback).trim().toLowerCase(),
    isPlatformManagementUser: (user = {}) => ["admin", "club-admin", "team-admin"].includes(String(user.role || "").toLowerCase()),
    isPlatformStaffUser: (user = {}) => !["guest", ""].includes(String(user.role || "").toLowerCase()),
    canUserAccessTransferRoom: overrides.canUserAccessTransferRoom ?? ((user = {}) => ["admin", "scout"].includes(user.role)),
    canUserEditTransferRoom: overrides.canUserEditTransferRoom ?? ((user = {}) => ["admin", "scout"].includes(user.role)),
    logEvent: () => {},
  });
  return { service, state, win };
}

test("Workspace access runtime owns access and hub-state bodies outside app-runtime", () => {
  expect(appRuntimeSource).toContain("createWorkspaceAccessRuntimeService({");
  expect(appRuntimeSource).toContain("platform-runtime-accessors.mjs");
  expect(appRuntimeSource).toContain("workspaceAccessRuntimeService,");
  expect(platformRuntimeAccessorsSource).toContain('callAccessorSource("workspaceAccessRuntimeService", "canUserAccessWorkspace"');
  expect(platformRuntimeAccessorsSource).toContain('callAccessorSource("workspaceAccessRuntimeService", "readWorkspaceHubState"');
  expect(appRuntimeSource).not.toContain("function canUserAccessWorkspace(\nworkspace,");
  expect(appRuntimeSource).not.toContain("function readWorkspaceHubState() {\ntry {");
  expect(appRuntimeSource).not.toContain("function canUserAccessWorkspace(...args)");
  expect(appRuntimeSource).not.toContain("function readWorkspaceHubState(...args)");

  expect(serviceSource).toContain("createWorkspaceHubStateHelpers({");
  expect(serviceSource).toContain("function canUserAccessWorkspace(");
  expect(serviceSource).toContain("function repairWorkspaceState(");
  expect(serviceSource).toContain("function readWorkspaceHubState()");
});

test("Workspace access runtime preserves view and edit permission behavior", () => {
  const { service } = createService();
  const schedule = service.getWorkspaceByIdFromPool("schedule");
  const admin = service.getWorkspaceByIdFromPool("admin");
  const transferRoom = service.getWorkspaceByIdFromPool("transfer-room");

  expect(service.canUserAccessWorkspace(schedule, { role: "guest" })).toBe(true);
  expect(service.canUserEditWorkspace("schedule", { role: "guest" })).toBe(false);
  expect(service.canUserEditWorkspace("schedule", { role: "coach" })).toBe(true);
  expect(service.canUserAccessWorkspace(admin, { role: "club-admin" })).toBe(true);
  expect(service.canUserAccessWorkspace(admin, { role: "admin" })).toBe(true);
  expect(service.canUserAccessWorkspace(transferRoom, { role: "coach" })).toBe(false);
  expect(service.canUserAccessWorkspace(transferRoom, { role: "scout" })).toBe(true);
  expect(service.canUserEditWorkspace("transfer-room", { role: "scout" })).toBe(true);
});

test("Workspace access runtime repairs inaccessible state and preserves default workspace definitions", () => {
  const { service } = createService({ currentUser: { id: "guest-1", role: "guest" } });
  const repaired = service.repairWorkspaceState({
    activeWorkspaceId: "admin",
    workspaces: [{ id: "session-planner", kind: "custom", title: "Changed", hiddenFromNav: true }],
    workspaceAccess: {
      schedule: { view: ["guest"], edit: ["guest"] },
    },
  });

  expect(repaired.activeWorkspaceId).toBe("home");
  expect(repaired.workspaces.find((workspace) => workspace.id === "session-planner")).toMatchObject({
    kind: "session",
    status: "Ready",
  });
  expect(repaired.workspaces.find((workspace) => workspace.id === "player-profiles")).toMatchObject({
    title: "Squad Room",
    meta: "Squad",
    description: "Players",
  });
  expect(repaired.workspaceAccess.schedule.view).toContain("guest");
});

test("Workspace access runtime preserves hub storage, remembered workspace, safe id, and view mapping", () => {
  const { service, state, win } = createService();
  state.hubState.activeWorkspaceId = "schedule";
  service.writeWorkspaceHubState();

  const stored = JSON.parse(win.localStorage.getItem("workspace-hub-test"));
  expect(stored.activeWorkspaceId).toBeUndefined();
  expect(service.readWorkspaceHubState().activeWorkspaceId).toBe("home");
  expect(service.getWorkspaceIdFromUrl()).toBe("schedule");

  service.rememberActiveWorkspaceId("session-planner");
  expect(service.readRememberedWorkspaceId()).toBe("session-planner");
  expect(service.getSafeWorkspaceId("schedule")).toBe("schedule");
  expect(service.getSafeWorkspaceId("admin")).toBeNull();
  expect(service.getWorkspaceViewId("session-planner")).toBe("session-planner");
  expect(service.getWorkspaceViewId("transfer-room")).toBe("home");
});
