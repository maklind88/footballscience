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
    quickClearResult: {
      player: { name: "Ada" },
      archivedRecord: { id: "r-quick", playerId: "p-1", archivedAt: "now" },
      archivedRecords: [
        { id: "r-quick", playerId: "p-1", archivedAt: "now" },
        { id: "r-older", playerId: "p-1", archivedAt: "later" },
      ],
      cleared: true,
    },
    quickRecommendationResult: { player: { name: "Ada" }, record: { id: "r-quick", playerId: "p-1", participation: 100 } },
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
      applyMedicalQuickRecommendation: () => mutable.quickRecommendationResult,
      canEditMedicalTeam: () => canEdit,
      clearMedicalQuickRecommendation: () => mutable.quickClearResult,
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
      getMedicalRtpLibraryProfile: (profileId) => ({
        id: profileId,
        name: profileId === "acl-reconstruction-rtp" ? "ACL Reconstruction RTP" : "Hamstring Strain",
        phases: ["Rehab: restore clinical capacity"],
        loadText: ["Running: staged field exposure"],
        criteria: ["strength and control acceptable"],
        trainingChecklist: ["controlled field exposure"],
        redFlags: ["reactive swelling"],
      }),
      getMedicalRtpExercisesForProfile: () => [
        {
          id: "hop-and-stick",
          name: "Hop and stick",
          intent: "Build single-leg landing confidence.",
          tissueTypes: ["ligament"],
          phases: ["modified", "full"],
          footballDemands: ["landing", "cutting preparation"],
          riskLevel: "moderate",
          evidenceLevel: "Consensus supported",
          evidenceSummary: "Hop and landing tasks are common RTP battery items.",
          holdRules: ["hold if swelling follows"],
        },
      ],
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
  expect(appSource).toContain("clearMedicalQuickRecommendation");
  expect(appSource).not.toContain("bindMedicalRuntimeBindings({");
  expect(platformBindingsSource).toContain("bindMedicalRuntimeBindings({");
  expect(platformBindingsSource).toContain("clearMedicalQuickRecommendation");
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

test("Medical runtime bindings preserve quick recommendation, clear, archive, and plan edit behavior", async () => {
  const { calls, mutable, workspace } = createHarness();

  await workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-quick-recommend]": { dataset: { medicalQuickRecommend: "full", medicalQuickParticipation: "100" } } },
  })));
  expect(calls).toContainEqual(["sync", "recommendation-saved", expect.objectContaining({ playerId: "p-1" })]);
  expect(calls).toContainEqual(["render", "Ada: 100% recommendation saved."]);

  await workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-quick-clear]": { dataset: { medicalQuickClear: "p-1" } } },
  })));
  expect(calls).toContainEqual(["sync", "record-archived", expect.objectContaining({ recordId: "r-quick", playerId: "p-1" })]);
  expect(calls).toContainEqual(["sync", "record-archived", expect.objectContaining({ recordId: "r-older", playerId: "p-1" })]);
  expect(calls).toContainEqual(["render", "Ada: recommendation cleared."]);

  mutable.quickRecommendationResult = { player: { name: "Ada" }, record: null, unchanged: true };
  await workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-quick-recommend]": { dataset: { medicalQuickRecommend: "full", medicalQuickParticipation: "100" } } },
  })));
  expect(calls).toContainEqual(["render", "Ada: recommendation already set."]);

  await workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-delete-record]": { dataset: { medicalDeleteRecord: "r-1" } } },
  })));
  expect(calls).toContainEqual(["sync", "record-archived", expect.objectContaining({ recordId: "r-1" })]);

  await workspace.listeners.click(createEvent(createTarget({
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
  expect(calls).toContainEqual(["render", "ACL Reconstruction RTP starter opened in Medical Plan draft. Review and save before it becomes active."]);

  const preview = { innerHTML: "" };
  const guideChangeForm = {
    querySelector(selector) {
      return selector === "[data-medical-rtp-guide-preview]" ? preview : null;
    },
  };
  const guideSelect = {
    value: "acl-reconstruction-rtp",
    closest(selector) {
      return selector === "#medicalInjuryPlanForm" ? guideChangeForm : null;
    },
  };
  workspace.listeners.change(createEvent(createTarget({
    closest: {
      "[data-medical-plan-rtp-guide]": guideSelect,
      "#medicalInjuryPlanForm": guideChangeForm,
    },
  })));
  expect(preview.innerHTML).toContain("ACL Reconstruction RTP");
  expect(preview.innerHTML).toContain("Medical Plan draft");
  expect(preview.innerHTML).toContain("Rehab: restore clinical capacity");
  expect(preview.innerHTML).toContain("Exercise Bank starters");
  expect(preview.innerHTML).toContain("Hop and stick");

  const guideLoaderForm = {
    querySelector(selector) {
      return selector === "[data-medical-plan-rtp-guide]" ? { value: "hamstring-strain" } : null;
    },
  };
  const guideLoaderButton = {
    closest(selector) {
      return selector === "#medicalInjuryPlanForm" ? guideLoaderForm : null;
    },
  };
  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-plan-load-rtp-guide]": guideLoaderButton },
  })));
  expect(calls).toContainEqual(["set-draft", "p-1", "Hamstring Strain"]);
  expect(mutable.selectedPlayerId).toBe("p-1");
  expect(mutable.modalOpen).toBe(true);
  expect(mutable.modalTab).toBe("plan");
  expect(calls).toContainEqual(["render", "Hamstring Strain guide loaded into Medical Plan draft. Review before saving."]);

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
  const content = { innerHTML: "" };
  const modal = {
    hidden: true,
    dataset: {},
    querySelector(selector) {
      if (selector === "[data-medical-rtp-profile-dialog-content]") return content;
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
      if (selector === "[data-medical-rtp-profile-modal]") return modal;
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
    actions: {
      canEditMedicalTeam: () => false,
      getMedicalRtpLibraryProfile: () => ({
        id: "hamstring-strain",
        name: "Hamstring Strain",
        system: "Muscle",
        bodyArea: "Posterior thigh",
        evidenceLevel: "Moderate to high",
        summary: "Sprint exposure must be rebuilt.",
        evidence: "Criteria-based RTP evidence.",
        experience: "Football staff should expose sprint actions.",
        riskTags: ["sprint exposure gap"],
        redFlags: ["pain with walking"],
        criteria: ["maximal sprint exposure"],
        trainingChecklist: ["linear sprint exposure"],
        matchChecklist: ["repeated sprint block"],
        mistakes: ["clearing on jogging"],
        goldStandardSections: Array.from({ length: 37 }, (_, index) => ({
          title: index === 34 ? "RTP Risk Score" : `Section ${index + 1}`,
          content: `Content ${index + 1}`,
          items: index === 0 ? ["item"] : [],
        })),
      }),
      getMedicalRtpExercisesForProfile: () => [
        {
          id: "nordic-hamstring-progression",
          name: "Nordic hamstring progression",
          intent: "Develop high-intensity eccentric hamstring capacity.",
          tissueTypes: ["muscle"],
          phases: ["modified", "full"],
          footballDemands: ["max velocity", "repeated sprint"],
          riskLevel: "high",
          evidenceLevel: "Moderate to high",
          evidenceSummary: "Nordic programs are associated with reduced hamstring injury risk.",
          holdRules: ["hold if sharp pain occurs"],
        },
      ],
    },
  });

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-open-rtp-profile]": { dataset: { medicalOpenRtpProfile: "hamstring-strain" } } },
  })));
  expect(modal.hidden).toBe(false);
  expect(modal["aria-hidden"]).toBeUndefined();
  expect(calls).toContain("focus-dialog");
  expect(content.innerHTML).toContain("Hamstring Strain");
  expect(content.innerHTML).toContain("Medical RTP guide");
  expect(content.innerHTML).toContain("Club-neutral knowledge");
  expect(content.innerHTML).toContain("No player data is stored or selected inside the Library.");
  expect(content.innerHTML).toContain("To build a player program");
  expect(content.innerHTML).toContain("Knowledge only");
  expect(content.innerHTML).not.toContain("data-medical-apply-rtp-starter");
  expect(content.innerHTML).toContain("Next field exposure");
  expect(content.innerHTML).toContain("Exercise Bank starters");
  expect(content.innerHTML).toContain("Nordic hamstring progression");
  expect(content.innerHTML).not.toContain("Gold Standard Template");
  expect(content.innerHTML).toContain("37 sections");
  expect(content.innerHTML).toContain('data-medical-rtp-profile-jump="medical-rtp-hamstring-strain-full-guide"');
  expect(content.innerHTML).toContain("RTP Risk Score");

  const criteriaSection = {
    id: "medical-rtp-hamstring-strain-criteria",
    getBoundingClientRect: () => ({ top: 260 }),
  };
  const dialogBody = {
    scrollTop: 20,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: (selector) => (selector === "[id]" ? [criteriaSection] : []),
    scrollTo: (options) => calls.push(["jump-scroll", options.top]),
  };
  const jumpLink = {
    dataset: { medicalRtpProfileJump: "medical-rtp-hamstring-strain-criteria" },
    closest: (selector) => (selector === ".medical-rtp-profile-dialog-body" ? dialogBody : null),
  };
  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-rtp-profile-jump]": jumpLink },
  })));
  expect(calls).toContainEqual(["jump-scroll", 172]);

  workspace.listeners.keydown(createEvent(createTarget(), {
    key: "Escape",
    preventDefault: () => calls.push("prevent-escape"),
  }));
  expect(modal.hidden).toBe(true);
  expect(modal["aria-hidden"]).toBe("true");
  expect(calls).toContain("prevent-escape");
});

test("Medical runtime bindings open RTP guide authoring draft and copy the template", async () => {
  const calls = [];
  const modal = {
    hidden: true,
    dataset: {},
    querySelector(selector) {
      return selector === "[role='dialog']" ? { focus: () => calls.push("focus-guide-dialog") } : null;
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
      if (selector === "[data-medical-rtp-guide-draft-modal]") return modal;
      if (selector === "[data-medical-rtp-guide-draft-modal]:not([hidden])" && !modal.hidden) return modal;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-medical-rtp-guide-draft-modal]" ? [modal] : [];
    },
  };
  let copiedText = "";

  bindMedicalRuntimeBindings({
    workspaceElement: workspace,
    win: { navigator: { clipboard: { writeText: async (value) => { copiedText = value; } } } },
    state: {},
    actions: {
      canEditMedicalTeam: () => false,
      renderMedicalTeamWorkspace: (...args) => calls.push(["render", ...args]),
    },
  });

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-open-rtp-guide-draft]": { dataset: {} } },
  })));
  expect(modal.hidden).toBe(false);
  expect(modal["aria-hidden"]).toBeUndefined();
  expect(calls).toContain("focus-guide-dialog");

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-copy-rtp-guide-template]": { dataset: {} } },
  })));
  await Promise.resolve();
  expect(copiedText).toContain("RTP Injury Guide Draft");
  expect(copiedText).toContain("24. Evidence Level");
  expect(copiedText).toContain("37. Return-to-Performance Analytics");
  expect(calls).toContainEqual(["render", "RTP injury guide template copied."]);

  workspace.listeners.keydown(createEvent(createTarget(), {
    key: "Escape",
    preventDefault: () => calls.push("prevent-guide-escape"),
  }));
  expect(modal.hidden).toBe(true);
  expect(modal["aria-hidden"]).toBe("true");
  expect(calls).toContain("prevent-guide-escape");
});

test("Medical runtime bindings filter RTP Library by structured clinical search domains", () => {
  const hamstringCard = {
    hidden: false,
    dataset: {
      search: "hamstring posterior thigh",
      clinicalSymptoms: "posterior thigh pain sprint pain",
      clinicalMechanism: "high speed running acceleration",
      clinicalRedFlags: "palpable defect bruising",
      clinicalMovement: "sagittal sprint acceleration",
      clinicalTissue: "muscle hamstring posterior thigh",
      clinicalPositionDemand: "winger repeated sprint exposure",
      movement: "sagittal sprint acceleration",
      position: "winger striker",
    },
  };
  const ankleCard = {
    hidden: false,
    dataset: {
      search: "syndesmosis high ankle",
      clinicalSymptoms: "high ankle pain push off pain",
      clinicalMechanism: "external rotation contact braking",
      clinicalRedFlags: "diastasis fracture suspicion",
      clinicalMovement: "transverse rotation deceleration",
      clinicalTissue: "ligament high ankle",
      clinicalPositionDemand: "full back rotational braking",
      movement: "transverse rotation deceleration",
      position: "full back",
    },
  };
  const search = { value: "rotational braking full back" };
  const count = { textContent: "" };
  const empty = { hidden: true };
  const library = {
    querySelector(selector) {
      if (selector === "[data-medical-rtp-library-search]") return search;
      if (selector === "[data-medical-rtp-library-count]") return count;
      if (selector === "[data-medical-rtp-library-empty]") return empty;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-medical-rtp-library-filter]") return [];
      if (selector === "[data-medical-rtp-profile]") return [hamstringCard, ankleCard];
      return [];
    },
  };
  const workspace = {
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector(selector) {
      return selector === "[data-medical-rtp-library]" ? library : null;
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

  workspace.listeners.input(createEvent(createTarget({
    closest: { "[data-medical-rtp-library-search]": search },
  })));

  expect(hamstringCard.hidden).toBe(true);
  expect(ankleCard.hidden).toBe(false);
  expect(count.textContent).toBe("1");
  expect(empty.hidden).toBe(true);
});

test("Medical runtime bindings filter RTP Exercise Bank catalog by metadata", () => {
  const sprintExercise = {
    hidden: false,
    dataset: {
      search: "max velocity sprint exposure hamstring",
      phase: "full match",
      tissue: "muscle tendon",
      risk: "high",
    },
  };
  const tendonExercise = {
    hidden: false,
    dataset: {
      search: "calf raise tendon loading",
      phase: "rehab modified",
      tissue: "tendon",
      risk: "moderate",
    },
  };
  const search = { value: "sprint" };
  const phase = { value: "full", dataset: { medicalRtpExerciseFilter: "phase" } };
  const tissue = { value: "all", dataset: { medicalRtpExerciseFilter: "tissue" } };
  const risk = { value: "high", dataset: { medicalRtpExerciseFilter: "risk" } };
  const count = { textContent: "" };
  const empty = { hidden: true };
  const catalog = {
    querySelector(selector) {
      if (selector === "[data-medical-rtp-exercise-search]") return search;
      if (selector === "[data-medical-rtp-exercise-count]") return count;
      if (selector === "[data-medical-rtp-exercise-empty]") return empty;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-medical-rtp-exercise-filter]") return [phase, tissue, risk];
      if (selector === "[data-medical-rtp-exercise]") return [sprintExercise, tendonExercise];
      return [];
    },
  };
  const workspace = {
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector(selector) {
      return selector === "[data-medical-rtp-exercise-catalog]" ? catalog : null;
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

  workspace.listeners.input(createEvent(createTarget({
    closest: { "[data-medical-rtp-exercise-search]": search },
  })));

  expect(sprintExercise.hidden).toBe(false);
  expect(tendonExercise.hidden).toBe(true);
  expect(count.textContent).toBe("1");
  expect(empty.hidden).toBe(true);
});

test("Medical runtime bindings open and close the RTP Exercise Bank overlay", () => {
  const bodyClasses = new Set();
  const dialog = {
    focused: false,
    focus() {
      this.focused = true;
    },
  };
  const overlay = {
    attributes: { "aria-hidden": "true" },
    hidden: true,
    querySelector(selector) {
      return selector === "[role='dialog']" ? dialog : null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const catalog = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const workspace = {
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector(selector) {
      if (selector === "[data-medical-rtp-exercise-overlay]") return overlay;
      if (selector === "[data-medical-rtp-exercise-overlay]:not([hidden])") return overlay.hidden ? null : overlay;
      if (selector === "[data-medical-rtp-exercise-catalog]") return catalog;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-medical-rtp-exercise-overlay]" ? [overlay] : [];
    },
  };

  bindMedicalRuntimeBindings({
    workspaceElement: workspace,
    win: {
      document: {
        body: {
          classList: {
            add: (value) => bodyClasses.add(value),
            remove: (value) => bodyClasses.delete(value),
          },
        },
      },
    },
    state: {},
    actions: { canEditMedicalTeam: () => false },
  });

  workspace.listeners.click(createEvent(createTarget({
    closest: { "[data-medical-rtp-exercise-open]": {} },
  })));

  expect(overlay.hidden).toBe(false);
  expect(overlay.attributes["aria-hidden"]).toBeUndefined();
  expect(dialog.focused).toBe(true);
  expect(bodyClasses.has("medical-rtp-exercise-overlay-open")).toBe(true);

  workspace.listeners.keydown(createEvent(createTarget({}), { key: "Escape" }));

  expect(overlay.hidden).toBe(true);
  expect(overlay.attributes["aria-hidden"]).toBe("true");
  expect(bodyClasses.has("medical-rtp-exercise-overlay-open")).toBe(false);
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
