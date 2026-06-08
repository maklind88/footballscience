import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindProfileStaffRuntimeBindings } from "../src/modules/profile/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createElement() {
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
    files: matches.files || [],
    closest(selector) {
      const value = matches.closest?.[selector];
      return value === undefined ? null : value;
    },
  };
}

function createEvent(target, extra = {}) {
  return {
    detail: extra.detail || {},
    target,
    preventDefault: extra.preventDefault || (() => {}),
  };
}

function createHarness() {
  const calls = [];
  const ui = {
    profileMenu: createElement(),
    profileWorkspace: createElement(),
    staffWorkspace: createElement(),
  };
  const winListeners = {};
  const mutable = {
    selectedStaffUserId: "staff-1",
    staffCreateUserEditorOpen: false,
    hubReady: true,
  };
  const currentUser = { id: "user-1", username: "mak", email: "mak@example.com" };
  const users = [
    currentUser,
    { id: "staff-1", username: "coach", email: "coach@example.com" },
  ];
  const authStore = {
    createUser: async (values) => ({ ok: true, user: { id: "staff-2", username: values.username, email: values.email }, generatedPassword: "temp123" }),
    removeUser: async (userId) => ({ ok: true, userId }),
    removeProfileImage: async (userId) => ({ ok: true, user: { id: userId, profileImageUrl: "" } }),
    updateUser: async (userId, values) => ({ ok: true, user: { id: userId, ...values } }),
  };
  const controllers = bindProfileStaffRuntimeBindings({
    ui,
    win: {
      __pendingWorkspaceId: "",
      addEventListener(type, listener) {
        winListeners[type] = listener;
      },
      confirm: () => true,
      platformAuthReadyPromise: Promise.resolve(),
    },
    state: {
      getSelectedStaffUserId: () => mutable.selectedStaffUserId,
      setSelectedStaffUserId: (value) => { mutable.selectedStaffUserId = value; },
      getStaffCreateUserEditorOpen: () => mutable.staffCreateUserEditorOpen,
      setStaffCreateUserEditorOpen: (value) => { mutable.staffCreateUserEditorOpen = value; },
    },
    actions: {
      canAdminManageUser: () => true,
      createDashboardTask: (task) => calls.push(["task", task]),
      createProfileImageDataUrl: async () => "data:image/png;base64,abc",
      formatUserName: (user) => user.username,
      getCurrentPlatformUser: () => currentUser,
      getPasswordValidationMessage: () => "",
      getPlatformAuthStore: () => authStore,
      getPlatformFormValues: (form) => form.values || {},
      getPlatformUsers: () => users,
      hasHubState: () => mutable.hubReady,
      hasUserFieldConflict: () => false,
      isCurrentPlatformUserAdmin: () => true,
      maybeCopyToClipboard: async (message) => {
        calls.push(["copy", message]);
        return true;
      },
      normalizeAdminUserSubmissionValues: (values) => values,
      readDashboardTasks: () => [{ id: "task-1", status: "open" }],
      refreshDashboardSurfaces: () => calls.push("refresh-dashboard"),
      removeDashboardTask: (taskId) => calls.push(`remove-task:${taskId}`),
      renderProfileWorkspace: (message) => calls.push(["profile-render", message]),
      renderStaffWorkspace: (message) => calls.push(["staff-render", message]),
      renderWorkspaceChrome: () => calls.push("chrome"),
      setActiveWorkspace: (workspaceId) => calls.push(`workspace:${workspaceId}`),
      setFormSubmitButtonState: (_form, state) => calls.push(["submit-state", state]),
      setProfileMenuOpen: (open) => calls.push(`profile-menu:${open}`),
      stripPasswordConfirmation: (values) => {
        const next = { ...values };
        delete next.passwordConfirm;
        return next;
      },
      syncPlatformStructureWithUsers: () => ({ teams: [] }),
      syncPlatformUserFromAuth: () => calls.push("sync-user"),
      togglePasswordInputVisibility: () => calls.push("toggle-password"),
      updateDashboardTask: (taskId, patch) => calls.push(["update-task", taskId, patch]),
      updatePlatformUserFromPayload: (payload) => calls.push(["update-user", payload]),
    },
  });
  return { calls, controllers, mutable, ui, users, winListeners };
}

test("Profile/Staff runtime bindings own profile and staff event binding outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const bindingsSource = readProjectFile("src/modules/profile/profile-staff-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/profile/index.mjs");

  expect(appSource).toContain("bindProfileStaffRuntimeBindings({");
  expect(appSource).not.toContain('ui.profileWorkspace?.addEventListener("submit"');
  expect(appSource).not.toContain('ui.staffWorkspace?.addEventListener("click"');
  expect(appSource).not.toContain('win.addEventListener("platform:open-workspace"');
  expect(bindingsSource).toContain('ui.profileWorkspace.addEventListener("submit"');
  expect(bindingsSource).toContain('ui.staffWorkspace.addEventListener("submit"');
  expect(bindingsSource).not.toContain("localStorage");
  expect(bindingsSource).not.toContain("queueCentralStateWrite");
  expect(indexSource).toContain('export * from "./profile-staff-runtime-bindings.mjs";');
});

test("Profile/Staff runtime bindings register profile, staff, menu, and platform workspace listeners", () => {
  const { controllers, ui, winListeners } = createHarness();

  expect(typeof controllers.profileMenuClick).toBe("function");
  expect(typeof controllers.profileSubmit).toBe("function");
  expect(typeof controllers.profileChange).toBe("function");
  expect(typeof controllers.profileClick).toBe("function");
  expect(typeof controllers.staffClick).toBe("function");
  expect(typeof controllers.staffSubmit).toBe("function");
  expect(typeof ui.profileWorkspace.listeners.submit).toBe("function");
  expect(typeof ui.staffWorkspace.listeners.click).toBe("function");
  expect(typeof winListeners["platform:open-workspace"]).toBe("function");
});

test("Profile runtime bindings preserve todo, profile save, image remove, and workspace open behavior", async () => {
  const { calls, ui, winListeners } = createHarness();
  const todoForm = { values: { title: "Call player" } };
  const profileForm = { values: { username: "mak2", email: "mak2@example.com", role: "admin", status: "inactive" } };

  await ui.profileWorkspace.listeners.submit(createEvent(createTarget({ closest: { "#profileTodoForm": todoForm } })));
  expect(calls).toContainEqual(["task", { title: "Call player", assignedTo: "user-1", scope: "personal" }]);
  expect(calls).toContain("refresh-dashboard");

  await ui.profileWorkspace.listeners.submit(createEvent(createTarget({ closest: { "#profileForm": profileForm } })));
  expect(calls).toContainEqual(["profile-render", "Saved."]);
  expect(calls).toContain("sync-user");

  await ui.profileWorkspace.listeners.click(createEvent(createTarget({ closest: { "[data-profile-remove-photo]": { dataset: {} } } })));
  expect(calls).toContainEqual(["profile-render", "Profile image removed."]);

  winListeners["platform:open-workspace"]({ detail: { workspaceId: "squad" } });
  expect(calls).toContain("workspace:squad");
});

test("Staff runtime bindings preserve create, select, and remove user behavior", async () => {
  const { calls, mutable, ui } = createHarness();
  const staffForm = {
    reset: () => calls.push("staff-reset"),
    values: { username: "ana", email: "ana@example.com", password: "pw", passwordConfirm: "pw" },
  };

  ui.staffWorkspace.listeners.click(createEvent(createTarget({
    closest: { "[data-staff-open-create-user]": { dataset: {} } },
  })));
  expect(mutable.staffCreateUserEditorOpen).toBe(true);

  ui.staffWorkspace.listeners.click(createEvent(createTarget({
    closest: { "[data-staff-select-user]": { dataset: { staffSelectUser: "staff-1" } } },
  })));
  expect(mutable.selectedStaffUserId).toBe("staff-1");
  expect(mutable.staffCreateUserEditorOpen).toBe(false);

  await ui.staffWorkspace.listeners.submit(createEvent(createTarget({ closest: { "#staffUserForm": staffForm } })));
  expect(mutable.selectedStaffUserId).toBe("staff-2");
  expect(calls).toContain("staff-reset");
  expect(calls).toContainEqual(["staff-render", "User added. Password: pw. Copied to clipboard."]);

  await ui.staffWorkspace.listeners.click(createEvent(createTarget({
    closest: { "[data-staff-remove-user]": { dataset: { staffRemoveUser: "staff-1" } } },
  })));
  expect(mutable.selectedStaffUserId).toBe(null);
  expect(calls).toContainEqual(["staff-render", "Removed."]);
});
