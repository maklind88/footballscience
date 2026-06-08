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
  const bindingsSource = readProjectFile("src/modules/medical/medical-runtime-bindings.mjs");
  const indexSource = readProjectFile("src/modules/medical/index.mjs");

  expect(appSource).toContain("bindMedicalRuntimeBindings({");
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
    closest: { "[data-medical-edit-injury-plan]": { dataset: { medicalEditInjuryPlan: "plan-1" } } },
  })));
  expect(calls).toContainEqual(["draft-from-plan", "plan-1"]);
  expect(mutable.selectedPlayerId).toBe("p-1");
  expect(mutable.modalOpen).toBe(true);
  expect(mutable.modalTab).toBe("plan");
});

test("Medical runtime bindings preserve roster search, filters, and protected submit writes", () => {
  const { calls, mutable, workspace } = createHarness();
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
