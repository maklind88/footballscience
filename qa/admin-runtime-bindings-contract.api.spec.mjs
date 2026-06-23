import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindAdminRuntimeBindings } from "../src/modules/admin/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createWorkspace() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
}

function createTarget(matches = {}) {
  return {
    dataset: matches.dataset || {},
    closest(selector) {
      const value = matches.closest?.[selector];
      return value === undefined ? null : value;
    },
  };
}

function createEvent(target) {
  return {
    target,
    preventDefault() {},
  };
}

function createHarness() {
  const calls = [];
  const workspaceElement = createWorkspace();
  const currentUser = { id: "admin-1", role: "admin", username: "admin", email: "admin@example.com" };
  const users = [
    currentUser,
    { id: "user-2", role: "coach", username: "coach", email: "coach@example.com" },
  ];
  const mutable = {
    adminCreateUserEditorOpen: false,
    adminCreateUserDraft: null,
    adminCreateUserTeamId: "",
    adminUserEditorOpen: false,
    hubState: { workspaceAccess: {} },
    selectedAdminUserId: "user-2",
  };
  const authStore = {
    createUser: async (values) => ({ ok: true, user: { id: "user-3", username: values.username, email: values.email }, generatedPassword: "temp123" }),
    removeUser: async (userId) => ({ ok: true, userId }),
    sendPasswordReset: async () => ({ ok: true }),
    updateUser: async (_userId, values) => ({ ok: true, user: { id: "user-2", ...values }, generatedPassword: values.generatePassword ? "temp456" : "" }),
  };
  const transferRoomState = { accessByTeam: { "team-1": { userIds: ["user-2"] } } };
  const controllers = bindAdminRuntimeBindings({
    workspaceElement,
    win: { confirm: () => true },
    state: {
      getSelectedAdminUserId: () => mutable.selectedAdminUserId,
      setSelectedAdminUserId: (value) => { mutable.selectedAdminUserId = value; },
      setAdminCreateUserDraft: (value) => { mutable.adminCreateUserDraft = value; },
      setAdminCreateUserEditorOpen: (value) => { mutable.adminCreateUserEditorOpen = value; },
      setAdminUserEditorOpen: (value) => { mutable.adminUserEditorOpen = value; },
      setAdminCreateUserTeamId: (value) => { mutable.adminCreateUserTeamId = value; },
      getHubState: () => mutable.hubState,
      setHubState: (value) => { mutable.hubState = value; },
    },
    actions: {
      buildPlatformAppearanceConfigFromForm: () => ({ theme: "light" }),
      buildTemporaryLoginMessage: (user, password, copied) => `login:${user.id}:${password}:${copied}`,
      canAdminManageUser: (_admin, _user, _structure, options) => {
        calls.push(["can-manage", options || {}]);
        return true;
      },
      createAdminClubFromForm: () => calls.push("club"),
      createAdminTeamFromForm: () => calls.push("team"),
      createDefaultPlatformAppearanceConfig: (config) => ({ theme: "default", ...config }),
      ensureTransferRoomState: () => transferRoomState,
      formatUserName: (user) => user.username,
      getAdminManagedWorkspaces: () => [
        { id: "home", requiresAdmin: false },
        { id: "admin", requiresAdmin: true },
      ],
      getAdminTransferRoomAccessTeamId: () => "team-1",
      getCurrentPlatformUser: () => currentUser,
      getPasswordValidationMessage: () => "",
      getPlatformAuthStore: () => authStore,
      getPlatformFormValues: (form) => form.values || {},
      getPlatformRoles: () => ["admin", "coach", "player"],
      getPlatformStructureState: () => ({ teams: [{ id: "team-1" }] }),
      getPlatformUsers: () => users,
      getUserTeamId: () => "team-1",
      getWorkspaceAccessConfig: () => ({ home: { view: ["admin"], edit: ["admin"] } }),
      hasUserFieldConflict: () => false,
      isCurrentPlatformUserAdmin: () => true,
      isPlatformAdminUser: () => true,
      loadAdminAuditLog: async () => calls.push("audit"),
      loadPlatformReadinessReport: async () => calls.push("readiness"),
      maybeCopyToClipboard: async (message) => {
        calls.push(["copy", message]);
        return true;
      },
      normalizeAdminUserSubmissionValues: (values) => values,
      openCredentialsMailto: async () => ({ copied: true }),
      publishPlatformAppearanceConfig: async (config, message) => calls.push(["appearance", config, message]),
      readPlatformAppearanceState: () => ({ theme: "light" }),
      renderAdminWorkspace: (message) => calls.push(["render", message]),
      renderWorkspaceChrome: () => calls.push("chrome"),
      repairWorkspaceState: (hubState) => ({ ...hubState, repaired: true }),
      setFormSubmitButtonState: (_form, state) => calls.push(["submit-state", state]),
      stripPasswordConfirmation: (values) => {
        const next = { ...values };
        delete next.passwordConfirm;
        return next;
      },
      syncPlatformStructureWithUsers: () => ({ teams: [{ id: "team-1" }] }),
      syncPlatformUserFromAuth: () => calls.push("sync-user"),
      togglePasswordInputVisibility: () => calls.push("toggle-password"),
      transferRoomRuntime: {
        canManageAccess: () => true,
        toggleAccessUser: (userId, enabled) => calls.push(["transfer-access", userId, enabled]),
      },
      withUiTimeout: async (promise) => promise,
      writeWorkspaceHubState: () => calls.push("write-hub"),
    },
  });
  return { calls, controllers, mutable, workspaceElement };
}

test("Admin runtime bindings own Admin workspace event binding outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/admin/admin-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/admin/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindAdminRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindAdminRuntimeBindings({");
  expect(appSource).not.toContain("async function createAdminUserFromForm");
  expect(appSource).not.toContain('ui.adminWorkspace?.addEventListener("click"');
  expect(appSource).not.toContain('ui.adminWorkspace?.addEventListener("submit"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("click"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("submit"');
  expect(bindingsSource).not.toContain("localStorage");
  expect(bindingsSource).not.toContain("queueCentralStateWrite");
  expect(indexSource).toContain('export * from "./admin-runtime-bindings.mjs";');
});

test("Admin runtime bindings register click and submit handlers", () => {
  const { controllers, workspaceElement } = createHarness();

  expect(typeof controllers.click).toBe("function");
  expect(typeof controllers.input).toBe("function");
  expect(typeof controllers.change).toBe("function");
  expect(typeof controllers.submit).toBe("function");
  expect(typeof controllers.createAdminUserFromForm).toBe("function");
  expect(typeof workspaceElement.listeners.click).toBe("function");
  expect(typeof workspaceElement.listeners.input).toBe("function");
  expect(typeof workspaceElement.listeners.change).toBe("function");
  expect(typeof workspaceElement.listeners.submit).toBe("function");
});

test("Admin runtime bindings keep create user modal stable while drafting", async () => {
  const { mutable, workspaceElement } = createHarness();
  const createUserForm = {
    values: {
      firstName: "Jess",
      lastName: "Silva",
      email: "jess@example.com",
      username: "jess.silva",
      password: "secret123",
      passwordConfirm: "secret123",
      teamId: "team-1",
    },
  };
  let focused = false;
  const overlay = {
    closest(selector) {
      return selector === "[data-admin-create-user-overlay]" ? overlay : null;
    },
    querySelector(selector) {
      return selector === ".admin-create-user-modal" ? { focus: () => { focused = true; } } : null;
    },
  };

  await workspaceElement.listeners.click(createEvent(createTarget({
    closest: { "[data-admin-open-create-user]": { dataset: { adminOpenCreateUser: "team-1" } } },
  })));
  expect(mutable.adminCreateUserEditorOpen).toBe(true);
  expect(mutable.adminCreateUserDraft).toEqual({ teamId: "team-1" });

  workspaceElement.listeners.input(createEvent(createTarget({ closest: { "#adminCreateUserForm": createUserForm } })));
  expect(mutable.adminCreateUserDraft).toEqual(createUserForm.values);

  await workspaceElement.listeners.click(createEvent(overlay));
  expect(mutable.adminCreateUserEditorOpen).toBe(true);
  expect(mutable.adminCreateUserDraft).toEqual(createUserForm.values);
  expect(focused).toBe(true);
});

test("Admin runtime bindings preserve create, password, and update user behavior", async () => {
  const { calls, mutable, workspaceElement } = createHarness();
  const createUserForm = {
    reset: () => calls.push("create-reset"),
    values: { username: "newcoach", email: "new@example.com", password: "pw", passwordConfirm: "pw" },
  };
  const userForm = { values: { username: "coach2", email: "coach2@example.com" } };

  await workspaceElement.listeners.submit(createEvent(createTarget({ closest: { "#adminCreateUserForm": createUserForm } })));
  expect(mutable.selectedAdminUserId).toBe("user-3");
  expect(mutable.adminCreateUserEditorOpen).toBe(false);
  expect(mutable.adminUserEditorOpen).toBe(true);
  expect(calls).toContain("create-reset");
  expect(calls).toContainEqual(["render", expect.stringContaining("User created in Supabase. Password: pw.")]);

  await workspaceElement.listeners.click(createEvent(createTarget({
    closest: { "[data-admin-generate-password]": { dataset: { adminGeneratePassword: "user-2" } } },
  })));
  expect(calls).toContainEqual(["render", "Temporary password for coach@example.com: temp456. This replaces any previous password. Copied to clipboard."]);
  expect(calls).toContainEqual(["can-manage", {}]);

  mutable.selectedAdminUserId = "user-2";
  await workspaceElement.listeners.submit(createEvent(createTarget({ closest: { "#adminUserForm": userForm } })));
  expect(calls).toContain("sync-user");
  expect(calls).toContainEqual(["render", "User saved."]);
});

test("Admin runtime bindings preserve access and transfer room forms", async () => {
  const { calls, mutable, workspaceElement } = createHarness();
  const accessControls = [
    { dataset: { adminAccessWorkspace: "home", adminAccessRole: "coach" }, value: "edit" },
    { dataset: { adminAccessWorkspace: "home", adminAccessRole: "player" }, value: "none" },
  ];
  const transferControls = [
    { checked: false, dataset: { adminTransferRoomAccessUser: "user-2" } },
    { checked: true, dataset: { adminTransferRoomAccessUser: "user-3" } },
  ];

  await workspaceElement.listeners.submit(createEvent(createTarget({
    closest: {
      "#adminTransferRoomAccessForm": {
        querySelectorAll: () => transferControls,
      },
    },
  })));
  expect(calls).toContainEqual(["transfer-access", "user-2", false]);
  expect(calls).toContainEqual(["transfer-access", "user-3", true]);
  expect(calls).toContainEqual(["render", "Transfer Room access saved."]);

  await workspaceElement.listeners.submit(createEvent(createTarget({
    closest: {
      "#adminAccessForm": {
        querySelectorAll: () => accessControls,
      },
    },
  })));
  expect(mutable.hubState.repaired).toBe(true);
  expect(mutable.hubState.workspaceAccess.home.view).toEqual(["admin", "coach"]);
  expect(mutable.hubState.workspaceAccess.home.edit).toEqual(["admin", "coach"]);
  expect(calls).toContain("write-hub");
  expect(calls).toContainEqual(["render", "Access saved."]);
});
