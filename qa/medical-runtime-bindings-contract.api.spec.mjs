import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindMedicalRuntimeBindings } from "../src/modules/medical/index.mjs";

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
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createTarget(matches = {}) {
  return {
    dataset: matches.dataset || {},
    selectionEnd: matches.selectionEnd,
    selectionStart: matches.selectionStart,
    value: matches.value || "",
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
    key: extra.key || "",
    preventDefault: extra.preventDefault || (() => {}),
    stopPropagation: extra.stopPropagation || (() => {}),
  };
}

function createHarness({ canEdit = true } = {}) {
  const calls = [];
  const workspace = createWorkspace();
  const mutable = {
    bulkOpen: false,
    historyDateFilter: "all",
    historyPlayerFilter: "all",
    historySearch: "",
    modalOpen: true,
    modalTab: "availability",
    operationsTab: "availability",
    rosterSearch: "",
    selectedPlayerId: "",
    statusFilter: "all",
    medicalState: {
      selectedDate: "2026-05-29",
      selectedPlayerId: "p-1",
      policy: { updatedAt: "2026-05-29T10:00:00.000Z" },
      players: [{ id: "p-1", name: "Ada Lovelace" }],
      records: [{ id: "r-1", playerId: "p-1" }],
      injuryPlans: [{ id: "plan-1", playerId: "p-1" }],
    },
  };
  const controllers = bindMedicalRuntimeBindings({
    workspaceElement: workspace,
    win: { confirm: () => true },
    state: {
      getMedicalState: () => mutable.medicalState,
      setMedicalSelectedPlayerId: (value) => { mutable.selectedPlayerId = value; mutable.medicalState.selectedPlayerId = value; },
      setMedicalPlayerModalOpen: (value) => { mutable.modalOpen = value; },
      setMedicalPlayerModalTab: (value) => { mutable.modalTab = value; },
      getMedicalBulkRecommendationOpen: () => mutable.bulkOpen,
      setMedicalBulkRecommendationOpen: (value) => { mutable.bulkOpen = value; },
      setMedicalHistoryDateFilter: (value) => { mutable.historyDateFilter = value; },
      setMedicalHistoryPlayerFilter: (value) => { mutable.historyPlayerFilter = value; },
      setMedicalHistorySearchQuery: (value) => { mutable.historySearch = value; },
      setMedicalOperationsTab: (value) => { mutable.operationsTab = value; },
      setMedicalRosterSearchQuery: (value) => { mutable.rosterSearch = value; },
      setMedicalStatusFilter: (value) => { mutable.statusFilter = value; },
    },
    actions: {
      addMedicalInjuryPlan: () => ({ id: "plan-2", playerId: "p-1", updatedAt: "now" }),
      addMedicalRecord: () => ({ id: "r-2", playerId: "p-1" }),
      applyMedicalBulkRecommendation: () => ({ savedCount: 1, records: [{ id: "bulk-1" }], blockedCount: 0, blockedNames: [] }),
      applyMedicalQuickRecommendation: () => ({ player: { name: "Ada" }, record: { id: "r-quick", playerId: "p-1", participation: 100 } }),
      canEditMedicalTeam: () => canEdit,
      clearMedicalInjuryPlanDraft: (playerId) => calls.push(`clear-draft:${playerId}`),
      closeMedicalPlayerModal: () => calls.push("close-modal"),
      copyMedicalCoachHandoverToClipboard: () => calls.push("copy-handover"),
      formatScheduleDateValue: () => "2026-05-29",
      getFilteredMedicalPlayers: () => mutable.medicalState.players,
      getMedicalBulkSelectedPlayers: () => ["p-1"],
      getMedicalDatabasePlayer: (playerId) => ({ id: playerId, updatedAt: "now" }),
      getMedicalInjuryPlanFormDraft: () => ({ playerId: "p-1" }),
      getMedicalRecommendationActivityContext: () => ({ type: "training" }),
      getMedicalRecommendationBlockReason: () => "",
      getMedicalRtpLibraryStarterDraft: () => ({
        playerId: "p-1",
        injuryType: "Hamstring Strain",
        bodyArea: "Posterior thigh",
      }),
      getMedicalRtpLibraryStarterDraftForPlan: (profileId, planId) => ({
        playerId: "p-1",
        planId,
        injuryType: "ACL reconstruction",
        rtpLibraryProfileName: "ACL Reconstruction RTP",
      }),
      getMedicalRtpPhaseForRecommendation: () => "full",
      getMedicalRtpPhaseOption: (key) => ({ key, label: "Full", participation: 100, status: "available" }),
      getMedicalStatusForParticipation: () => "available",
      getMedicalStatusOption: (key) => ({ key, defaultParticipation: 100 }),
      getMedicalStatusOptionForDate: (key) => ({ key, label: "Available" }),
      getPlatformFormValues: (form) => form.values || { playerId: "p-1", participation: "100", rosterText: "Ada", name: "Ada" },
      isMedicalItemArchived: () => false,
      normalizeMedicalOperationsTab: (value) => `ops:${value}`,
      normalizeMedicalParticipation: (value) => Number(value || 100),
      normalizeMedicalPlayer: () => ({ id: "p-2", name: "Grace" }),
      normalizeMedicalPlayerModalTab: (value) => `tab:${value}`,
      openMedicalPlayerModal: (playerId) => calls.push(`open:${playerId}`),
      parseMedicalRosterText: () => ({ players: [{ id: "p-3", name: "Roster Player" }], skippedLines: [] }),
      persistMedicalInjuryPlanDraftFromForm: () => calls.push("persist-draft"),
      recordMedicalDatabaseSyncEvent: (eventType, payload) => calls.push(["sync", eventType, payload]),
      removeMedicalInjuryPlan: () => ({ id: "plan-1", playerId: "p-1", archivedAt: "now" }),
      removeMedicalPlayer: () => ({ id: "p-1", archivedAt: "now" }),
      removeMedicalRecord: () => ({ id: "r-1", playerId: "p-1", archivedAt: "now" }),
      renderMedicalTeamWorkspace: (...args) => calls.push(["render", ...args]),
      setMedicalBulkNotSetSelection: () => calls.push("bulk-not-set"),
      setMedicalBulkSelection: (ids) => calls.push(["bulk-selection", ids]),
      setMedicalInjuryPlanDraft: (playerId, draft) => calls.push(["set-draft", playerId, draft.injuryType]),
      setMedicalInjuryPlanDraftFromPlan: (plan) => calls.push(["draft-from-plan", plan.id]),
      setMedicalSelectedDate: (value) => calls.push(`date:${value}`),
      shiftMedicalSelectedDate: (value) => calls.push(`shift:${value}`),
      toggleMedicalBulkPlayer: (playerId) => calls.push(`bulk-toggle:${playerId}`),
      updateMedicalBulkActivityControls: () => calls.push("bulk-activity"),
      updateMedicalGovernancePolicy: () => true,
      updateMedicalInjuryPlan: () => ({ id: "plan-1", playerId: "p-1", updatedAt: "now" }),
      updateMedicalPlanClearance: () => ({ id: "plan-1", playerId: "p-1", updatedAt: "now" }),
      updateMedicalPlayerProfile: () => true,
      upsertMedicalPlayers: (players) => calls.push(["upsert", players.map((player) => player.id)]),
    },
  });
  return { calls, controllers, mutable, workspace };
}

test("Medical runtime bindings own Medical workspace event binding outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const platformBindingsSource = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");
  const bindingsSource = readProjectFile("src/modules/medical/medical-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/medical/index.mjs");

  expect(appSource).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(appSource).not.toContain("bindMedicalRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindMedicalRuntimeBindings({");
  expect(appSource).not.toContain('ui.medicalTeamWorkspace?.addEventListener("click"');
  expect(appSource).not.toContain('ui.medicalTeamWorkspace?.addEventListener("submit"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("click"');
  expect(bindingsSource).toContain('workspaceElement.addEventListener("submit"');
  expect(bindingsSource).not.toContain("localStorage");
  expect(bindingsSource).not.toContain("queueCentralStateWrite");
  expect(indexSource).toContain('export * from "./medical-runtime-bindings.mjs";');
});

test("Medical runtime bindings register the expected workspace listeners", () => {
  const { controllers, workspace } = createHarness();

  expect(Object.keys(controllers).sort()).toEqual(["change", "click", "input", "keydown", "submit"]);
  expect(typeof workspace.listeners.click).toBe("function");
  expect(typeof workspace.listeners.keydown).toBe("function");
  expect(typeof workspace.listeners.input).toBe("function");
  expect(typeof workspace.listeners.change).toBe("function");
  expect(typeof workspace.listeners.submit).toBe("function");
});

test("Medical runtime bindings preserve quick recommendation, archive, and plan edit behavior", () => {
  const { calls, mutable, workspace } = createHarness();

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-quick-recommend]": { dataset: { medicalQuickRecommend: "full", medicalQuickParticipation: "100" } } },
  })));
  expect(calls).toContainEqual(["sync", "recommendation-saved", expect.objectContaining({ playerId: "p-1" })]);
  expect(calls).toContainEqual(["render", "Ada: 100% recommendation saved."]);

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-delete-record]": { dataset: { medicalDeleteRecord: "r-1" } } },
  })));
  expect(calls).toContainEqual(["sync", "record-archived", expect.objectContaining({ recordId: "r-1" })]);

  workspace.listeners.click(createEvent(createTarget({
    closest: {
      "[data-medical-edit-injury-plan]": {
        dataset: {
          medicalEditInjuryPlan: "plan-1",
          medicalRtpFocus: "hold",
          medicalRtpFocusGroup: "holdRules",
          medicalRtpFocusIndex: "0",
        },
      },
    },
  })));
  expect(calls).toContainEqual(["draft-from-plan", "plan-1"]);
  expect(mutable.selectedPlayerId).toBe("p-1");
  expect(mutable.modalOpen).toBe(true);
  expect(mutable.modalTab).toBe("plan");
  expect(calls).toContainEqual([
    "render",
    "Medical plan ready to edit.",
    expect.objectContaining({
      focusMedicalRtpPlan: true,
      rtpFocusPlanId: "plan-1",
      rtpFocusKey: "hold",
      rtpFocusGroupKey: "holdRules",
      rtpFocusIndex: "0",
    }),
  ]);

  const caseLinkerForm = {
    dataset: { medicalPlanId: "plan-1" },
    querySelector(selector) {
      return selector === "[data-medical-rtp-case-profile]" ? { value: "acl-reconstruction-rtp" } : null;
    },
  };
  workspace.listeners.submit(createEvent(createTarget({
    closest: { "[data-medical-rtp-case-linker-form]": caseLinkerForm },
  })));
  expect(calls).toContainEqual(["set-draft", "p-1", "ACL reconstruction"]);
  expect(mutable.selectedPlayerId).toBe("p-1");
  expect(mutable.modalOpen).toBe(true);
  expect(mutable.modalTab).toBe("plan");
  expect(calls).toContainEqual(["render", "ACL Reconstruction RTP starter ready for active case. Review and save Medical Plan."]);

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-apply-rtp-starter]": { dataset: { medicalRtpProfileId: "hamstring-strain", medicalPlayerId: "p-1" } } },
  })));
  expect(calls).toContainEqual(["set-draft", "p-1", "Hamstring Strain"]);
  expect(mutable.selectedPlayerId).toBe("p-1");
  expect(mutable.modalOpen).toBe(true);
  expect(mutable.modalTab).toBe("plan");
  expect(calls).toContainEqual(["render", "Hamstring Strain starter ready in Medical Plan."]);
});

test("Medical runtime bindings open and close RTP Library profile overlays", () => {
  const calls = [];
  const modal = {
    hidden: true,
    dataset: { medicalRtpProfileModal: "hamstring-strain" },
    querySelector(selector) {
      return selector === "[role='dialog']" ? { focus: () => calls.push("focus-dialog") } : null;
    },
    removeAttribute(name) {
      delete this[name];
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const workspace = {
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector(selector) {
      return selector === "[data-medical-rtp-profile-modal]:not([hidden])" && !modal.hidden ? modal : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-medical-rtp-profile-modal]" ? [modal] : [];
    },
  };

  bindMedicalRuntimeBindings({
    workspaceElement: workspace,
    win: {},
    state: {},
    actions: { canEditMedicalTeam: () => false },
  });

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-open-rtp-profile]": { dataset: { medicalOpenRtpProfile: "hamstring-strain" } } },
  })));
  expect(modal.hidden).toBe(false);
  expect(modal["aria-hidden"]).toBeUndefined();
  expect(calls).toContain("focus-dialog");

  workspace.listeners.keydown(createEvent(createTarget(), {
    key: "Escape",
    preventDefault: () => calls.push("prevent-escape"),
  }));
  expect(modal.hidden).toBe(true);
  expect(modal["aria-hidden"]).toBe("true");
  expect(calls).toContain("prevent-escape");
});

test("Medical runtime bindings reveal restricted history rows in batches", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    hidden: index >= 25,
    dataset: { medicalHistoryRowVisible: index < 25 ? "true" : "false" },
  }));
  const status = { textContent: "Showing 25 of 30" };
  const showMoreButton = {
    hidden: false,
    dataset: { medicalHistoryPageSize: "25" },
    closest(selector) {
      return selector === "[data-medical-history-table]" ? table : null;
    },
  };
  const table = {
    dataset: { medicalHistoryPageSize: "25" },
    querySelector(selector) {
      return selector === "[data-medical-history-page-status]" ? status : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-medical-history-row]" ? rows : [];
    },
  };
  const workspace = {
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  bindMedicalRuntimeBindings({
    workspaceElement: workspace,
    win: {},
    state: {},
    actions: { canEditMedicalTeam: () => false },
  });

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-history-show-more]": showMoreButton },
  })));

  expect(rows.every((row) => row.hidden === false)).toBe(true);
  expect(rows.every((row) => row.dataset.medicalHistoryRowVisible === "true")).toBe(true);
  expect(status.textContent).toBe("Showing 30 of 30");
  expect(showMoreButton.hidden).toBe(true);
});

test("Medical runtime bindings preserve roster search, filters, and protected submit writes", () => {
  const { calls, mutable, workspace } = createHarness();
  const historyForm = {
    querySelector(selector) {
      return {
        "[data-medical-history-search]": { value: "acl" },
        "[data-medical-history-date-filter]": { value: "2026-05-15" },
        "[data-medical-history-player-filter]": { value: "p-1" },
      }[selector] ?? null;
    },
  };
  const newPlayerForm = { reset: () => calls.push("reset-new-player") };
  const recommendationForm = { values: { playerId: "p-1", participation: "100", date: "2026-05-29" } };

  workspace.listeners.input(createEvent(createTarget({
    value: "ada",
    selectionStart: 1,
    selectionEnd: 3,
    closest: { "[data-medical-roster-search]": { value: "ada", selectionStart: 1, selectionEnd: 3 } },
  })));
  expect(mutable.rosterSearch).toBe("ada");
  expect(calls).toContainEqual(["render", "", { focusRosterSearch: true, searchSelectionStart: 1, searchSelectionEnd: 3 }]);

  workspace.listeners.change(createEvent(createTarget({
    closest: { "[data-medical-status-filter]": { value: "available" } },
  })));
  expect(mutable.statusFilter).toBe("available");

  workspace.listeners.change(createEvent(createTarget({
    closest: { "[data-medical-history-date-filter]": { value: "2026-05-15" } },
  })));
  expect(mutable.historyDateFilter).toBe("2026-05-15");

  workspace.listeners.change(createEvent(createTarget({
    closest: { "[data-medical-history-player-filter]": { value: "p-1" } },
  })));
  expect(mutable.historyPlayerFilter).toBe("p-1");

  workspace.listeners.submit(createEvent(createTarget({
    closest: { "[data-medical-history-filter-form]": historyForm },
  })));
  expect(mutable.historySearch).toBe("acl");
  expect(mutable.historyDateFilter).toBe("2026-05-15");
  expect(mutable.historyPlayerFilter).toBe("p-1");

  workspace.listeners.submit(createEvent(createTarget({
    closest: { "#medicalNewPlayerForm": newPlayerForm },
  })));
  expect(calls).toContainEqual(["upsert", ["p-2"]]);
  expect(calls).toContainEqual(["sync", "player-added", expect.objectContaining({ playerId: "p-2" })]);
  expect(calls).toContain("reset-new-player");

  workspace.listeners.submit(createEvent(createTarget({
    closest: { "[data-medical-recommendation-form]": recommendationForm },
  })));
  expect(mutable.modalOpen).toBe(false);
  expect(calls).toContainEqual(["sync", "recommendation-saved", expect.objectContaining({ playerId: "p-1" })]);
  expect(calls).toContainEqual(["render", "Status saved."]);
});
