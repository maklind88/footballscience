import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindPlayerProfileRuntimeBindings } from "../src/modules/squad/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createWorkspace() {
  const listeners = {};
  const fileInput = { clicked: false, click() { this.clicked = true; } };
  const workspace = {
    activeDialog: null,
    activeModal: null,
    fileInput,
    listeners,
    ownerDocument: { activeElement: null },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector(selector) {
      if (selector === "[data-squad-data-import-file]") return fileInput;
      if (selector === "#playerProfileEditForm") return { id: "edit-form" };
      if (selector === '[role="dialog"][aria-modal="true"]') return this.activeDialog;
      if (selector === "[data-player-profile-new-modal-overlay]") return this.activeModal === "new" ? {} : null;
      if (selector === "[data-player-profile-modal-overlay]") return this.activeModal === "player" ? {} : null;
      return null;
    },
  };
  return workspace;
}

function createTarget(matches = {}) {
  return {
    dataset: matches.dataset || {},
    files: matches.files || [],
    type: matches.type || "",
    value: matches.value || "",
    click: matches.click || (() => {}),
    closest(selector) {
      const value = matches.closest?.[selector];
      return value === undefined ? null : value;
    },
    matches(selector) {
      return Boolean(matches.matches?.[selector]);
    },
  };
}

function createEvent(target, extra = {}) {
  return {
    target,
    preventDefault: extra.preventDefault || (() => {}),
    stopPropagation: extra.stopPropagation || (() => {}),
    key: extra.key || "",
    shiftKey: Boolean(extra.shiftKey),
  };
}

function createHarness({ canEdit = true } = {}) {
  const calls = [];
  const workspace = createWorkspace();
  const mutable = {
    activeTab: "overview",
    autosaveSignature: "",
    collapsed: true,
    importPlan: { canApply: true, rows: [{ row: 2, action: "update", playerName: "Ada", message: "ok" }] },
    modalOpen: true,
    newModalOpen: true,
    profileState: { players: [{ id: "p-1", name: "Ada Lovelace" }] },
    roleGroupFilter: "",
    rosterFilter: "",
    searchQuery: "",
  };
  const controllers = bindPlayerProfileRuntimeBindings({
    workspaceElement: workspace,
    win: { confirm: () => true },
    state: {
      getPendingPlayerProfileImportPlan: () => mutable.importPlan,
      setPendingPlayerProfileImportPlan: (value) => { mutable.importPlan = value; },
      getPlayerProfilesState: () => mutable.profileState,
      setPlayerProfileActiveTab: (value) => { mutable.activeTab = value; },
      setPlayerProfileAutosaveLastSignature: (value) => { mutable.autosaveSignature = value; },
      getPlayerProfilesTemporarySectionCollapsed: () => mutable.collapsed,
      setPlayerProfilesTemporarySectionCollapsed: (value) => { mutable.collapsed = value; },
      setPlayerProfilesSearchQuery: (value) => { mutable.searchQuery = value; },
      setPlayerProfilesRoleGroupFilter: (value) => { mutable.roleGroupFilter = value; },
      setPlayerProfilesRosterFilter: (value) => { mutable.rosterFilter = value; },
      setPlayerProfileModalOpen: (value) => { mutable.modalOpen = value; },
      setPlayerProfileNewPlayerModalOpen: (value) => { mutable.newModalOpen = value; },
    },
    helpers: {
      getPlayerProfileFormSignature: () => "sig-1",
      isTemporaryPlayerProfile: (player) => Boolean(player.temporary),
      normalizePlayerProfileTab: (value) => `tab:${value}`,
    },
    actions: {
      addPlayerProfile: () => ({ ok: true, player: { id: "p-2", temporary: false } }),
      applyPlayerProfileImportUndo: () => "undo-result",
      buildPlayerProfileImportFeedback: (result) => `feedback:${result?.ok}`,
      buildPlayerProfileOperationFeedback: (_result, message) => `operation:${message}`,
      canEditPlayerProfiles: () => canEdit,
      closePlayerProfileModal: () => calls.push("close-modal"),
      closePlayerProfileNewPlayerModal: () => calls.push("close-new-modal"),
      ensurePlayerProfilesState: () => calls.push("ensure-state"),
      exportSquadDataFoundationJson: () => calls.push("export-json"),
      exportSquadSessionPlannerCsv: () => calls.push("export-csv"),
      flushPlayerProfileAutosave: () => calls.push("flush-autosave"),
      getPlatformFormValues: () => ({ name: "Grace" }),
      handlePhotoInput: () => calls.push("photo"),
      importSquadDataFoundationFile: (file) => calls.push(`import-file:${file?.name || ""}`),
      importSquadDataFoundationPayload: (_payload, options) => ({ ok: Boolean(options?.plan?.canApply) }),
      isCurrentPlatformUserAdmin: () => true,
      openPlayerProfileModal: (id) => calls.push(`open:${id}`),
      openPlayerProfileNewPlayerModal: () => calls.push("open-new"),
      queuePlayerProfileAutosave: (_form, delay) => calls.push(`autosave:${delay ?? "default"}`),
      removePlayerProfile: (id) => {
        calls.push(`remove:${id}`);
        return true;
      },
      renderPlayerProfilesRosterListOnly: () => calls.push("render-list"),
      renderPlayerProfilesWorkspace: (message) => calls.push(["render", message]),
      savePlayerProfileEditForm: () => ({ ok: true }),
      uploadSquadTeamLogo: (file) => calls.push(`upload-logo:${file?.name || ""}`),
    },
  });
  return { calls, controllers, mutable, workspace };
}

test("Player profile runtime bindings own Squad workspace event binding outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/squad/player-profile-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/squad/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindPlayerProfileRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindPlayerProfileRuntimeBindings({");
  expect(appSource).not.toContain('ui.playerProfilesWorkspace?.addEventListener("click"');
  expect(appSource).not.toContain('ui.playerProfilesWorkspace?.addEventListener("input"');
  expect(appSource).not.toContain('ui.playerProfilesWorkspace?.addEventListener("submit"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("click"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("input"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("change"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("keydown"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("submit"');
  expect(bindingsSource).not.toContain("localStorage");
  expect(bindingsSource).not.toContain("queueCentralStateWrite");
  expect(indexSource).toContain('export * from "./player-profile-runtime-bindings.mjs";');
});

test("Player profile runtime bindings register the expected workspace listeners", () => {
  const { controllers, workspace } = createHarness();

  expect(Object.keys(controllers).sort()).toEqual(["change", "click", "input", "keydown", "submit"]);
  expect(typeof workspace.listeners.click).toBe("function");
  expect(typeof workspace.listeners.input).toBe("function");
  expect(typeof workspace.listeners.change).toBe("function");
  expect(typeof workspace.listeners.keydown).toBe("function");
  expect(typeof workspace.listeners.submit).toBe("function");
});

test("Player profile runtime bindings preserve import apply and cancel behavior", () => {
  const { calls, mutable, workspace } = createHarness();

  workspace.listeners.click(createEvent(createTarget({ closest: { "[data-player-profile-import-apply]": { dataset: {} } } })));
  expect(mutable.importPlan).toBe(null);
  expect(calls).toContainEqual(["render", "feedback:true"]);

  mutable.importPlan = { rows: [{ row: 4, action: "skip", playerName: "Ada", message: "duplicate" }] };
  workspace.listeners.click(createEvent(createTarget({ closest: { "[data-player-profile-import-cancel]": { dataset: {} } } })));
  expect(mutable.importPlan).toBe(null);
  expect(calls.at(-1)[0]).toBe("render");
  expect(calls.at(-1)[1].items[0]).toContain("Row 4: SKIP Ada");
});

test("Player profile runtime bindings open temporary section from the hidden default", () => {
  const { calls, mutable, workspace } = createHarness();

  expect(mutable.collapsed).toBe(true);
  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-squad-temporary-toggle]": { dataset: {} } },
  })));
  expect(mutable.collapsed).toBe(false);
  expect(calls).toContain("render-list");

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-squad-temporary-toggle]": { dataset: {} } },
  })));
  expect(mutable.collapsed).toBe(true);
});

test("Player profile runtime bindings preserve filters, search, remove, and new-player submit", async () => {
  const { calls, mutable, workspace } = createHarness();
  const newPlayerForm = { reset: () => calls.push("reset-new-player") };

  workspace.listeners.input(createEvent(createTarget({
    value: "ada",
    closest: { "[data-player-profile-search]": { value: "ada" } },
  })));
  expect(mutable.searchQuery).toBe("ada");
  expect(calls).toContain("render-list");

  workspace.listeners.change(createEvent(createTarget({
    closest: { "[data-player-profile-role-group-filter]": { value: "defender" } },
  })));
  expect(mutable.roleGroupFilter).toBe("defender");

  await workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-player-profile-remove]": { dataset: { playerProfileRemove: "p-1" } } },
  })));
  expect(calls).toContain("ensure-state");
  expect(calls).toContain("remove:p-1");
  expect(mutable.modalOpen).toBe(false);
  expect(mutable.newModalOpen).toBe(false);

  workspace.listeners.submit(createEvent(createTarget({
    closest: { "#playerProfileNewPlayerForm": newPlayerForm },
  })));
  expect(mutable.newModalOpen).toBe(false);
  expect(calls).toContain("reset-new-player");
  expect(calls.at(-2)).toEqual(["render", expect.stringContaining("Player added")]);
});

test("Player profile runtime bindings handle photo uploads on change only", () => {
  const { calls, workspace } = createHarness();
  const photoTarget = createTarget({
    closest: { "[data-player-profile-photo-upload]": { dataset: { playerProfilePhotoUpload: "p-1" } } },
  });

  workspace.listeners.input(createEvent(photoTarget));
  expect(calls).not.toContain("photo");

  workspace.listeners.change(createEvent(photoTarget));
  expect(calls).toEqual(["flush-autosave", "photo"]);
});

test("Player profile runtime bindings reveal guest fields and close dialogs with Escape", () => {
  const { calls, workspace } = createHarness();
  const temporaryFields = { hidden: true };
  const newPlayerForm = {
    dataset: {},
    querySelector: (selector) => selector === "[data-player-profile-new-temporary-fields]" ? temporaryFields : null,
  };

  workspace.listeners.change(createEvent(createTarget({
    value: "guest",
    closest: { "#playerProfileNewPlayerForm": newPlayerForm },
    matches: { 'select[name="rosterType"]': true },
  })));
  expect(newPlayerForm.dataset.playerProfileNewRosterType).toBe("guest");
  expect(temporaryFields.hidden).toBe(false);

  workspace.listeners.change(createEvent(createTarget({
    value: "squad",
    closest: { "#playerProfileNewPlayerForm": newPlayerForm },
    matches: { 'select[name="rosterType"]': true },
  })));
  expect(temporaryFields.hidden).toBe(true);

  workspace.activeModal = "new";
  workspace.listeners.keydown(createEvent(createTarget(), { key: "Escape" }));
  expect(calls).toContain("close-new-modal");

  workspace.activeModal = "player";
  workspace.listeners.keydown(createEvent(createTarget(), { key: "Escape" }));
  expect(calls).toContain("close-modal");
});

test("Player profile runtime bindings keep keyboard focus inside open dialogs", () => {
  const { workspace } = createHarness();
  const first = {
    focus() { workspace.ownerDocument.activeElement = this; },
    getAttribute: () => null,
    closest: () => null,
  };
  const last = {
    focus() { workspace.ownerDocument.activeElement = this; },
    getAttribute: () => null,
    closest: () => null,
  };
  workspace.activeDialog = {
    contains: (element) => element === first || element === last,
    querySelectorAll: () => [first, last],
  };
  workspace.ownerDocument.activeElement = last;
  let prevented = false;

  workspace.listeners.keydown(createEvent(createTarget(), {
    key: "Tab",
    preventDefault: () => { prevented = true; },
  }));

  expect(prevented).toBe(true);
  expect(workspace.ownerDocument.activeElement).toBe(first);

  workspace.listeners.keydown(createEvent(createTarget(), { key: "Tab", shiftKey: true }));
  expect(workspace.ownerDocument.activeElement).toBe(last);
});

test("Player profile runtime bindings save status changes immediately", () => {
  const { calls, workspace } = createHarness();

  workspace.listeners.change(createEvent(createTarget({
    closest: { "#playerProfileEditForm": {} },
    matches: { 'select[name="status"]': true },
  })));

  expect(calls).toContainEqual(["render", undefined]);
  expect(calls.some((entry) => String(entry).startsWith("autosave:"))).toBe(false);
});
