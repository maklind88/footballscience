import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeOperationsService } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness(overrides = {}) {
  let recordCounter = 1;
  let bulkSelectedPlayerIds = new Set();
  let bulkRecommendationOpen = false;
  let rosterSearchQuery = "";
  let statusFilter = "all";
  const commits = [];
  const databaseEvents = [];
  const auditEvents = [];
  const renders = [];
  const writes = [];
  const syncUpdates = [];
  const clipboardWrites = [];
  const state = overrides.state || {
    selectedDate: "2026-05-31",
    rosterVersion: "medical-v1",
    dataSafety: { lastClinicalChangeAt: "2026-05-31T09:00:00.000Z" },
    players: [
      { id: "p1", number: "10", name: "Alex Morgan", position: "FW" },
      { id: "p2", number: "8", name: "Sam Kerr", position: "FW" },
      { id: "p3", number: "6", name: "Blocked Player", position: "CM", blocked: true },
    ],
    records: [
      { id: "r-old", playerId: "p2", date: "2026-05-31", status: "modified", participation: 75, shareWithCoach: true },
    ],
    injuryPlans: [{ id: "plan-1", playerId: "p2", shareWithCoach: true }],
  };
  const win = {
    footballScienceAudit: {
      record: async (event) => {
        auditEvents.push(event);
        return { ok: true };
      },
    },
    footballScienceMedicalDatabase: {
      record: async (event) => {
        databaseEvents.push(event);
        return { ok: true, stored: true };
      },
    },
  };
  const service = createMedicalRuntimeOperationsService({
    addMedicalRecord: (values, options = {}) => {
      const record = { id: `record-${recordCounter++}`, ...values };
      state.records = [record, ...state.records];
      state.selectedDate = record.date;
      state.selectedPlayerId = record.playerId;
      if (options.skipDataSafety) {
        writes.push("skip-write");
      } else {
        commits.push({ type: "recommendation-saved", summary: `${record.playerId}:${record.participation}` });
      }
      return record;
    },
    buildMedicalCoachHandoverText: (dateValue) => `Handover ${dateValue}`,
    canEditMedicalTeam: () => true,
    canViewPrivateMedicalDetails: () => true,
    commitMedicalClinicalState: (type, summary) => commits.push({ type, summary }),
    compareMedicalPlayers: (first, second) => String(first.name).localeCompare(String(second.name)),
    ensureMedicalState: () => state,
    formatDateValue: () => "2026-05-31",
    getActiveMedicalPlayers: () => state.players.filter((player) => !player.archivedAt),
    getActiveMedicalPlayersForDate: () => state.players.filter((player) => !player.archivedAt),
    getBulkRecommendationOpen: () => bulkRecommendationOpen,
    getBulkSelectedPlayerIds: () => bulkSelectedPlayerIds,
    getCurrentPlatformUser: () => ({ id: "medical-user" }),
    getLatestMedicalRecord: (playerId, dateValue) => state.records.find((record) =>
      record.playerId === playerId && record.date === dateValue && !record.archivedAt
    ) || null,
    getMedicalCoachHandoverItems: () => [{ playerId: "p1" }],
    getMedicalDataSafetyCounts: () => ({ archivedPlayers: 1, archivedRecords: 2, archivedPlans: 3 }),
    getMedicalDailyStats: () => ({ fullCount: 1, modifiedCount: 1, unavailableCount: 0, unloggedCount: 1 }),
    getMedicalPlayerRecords: (playerId) => state.records.filter((record) =>
      record.playerId === playerId && !record.archivedAt
    ).sort((first, second) => {
      const dateComparison = second.date.localeCompare(first.date);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt);
    }),
    getMedicalPlayerSquadAvailabilityBlockReason: (player) => player?.blocked ? "Blocked by Squad Room" : "",
    getMedicalRecommendationActivityContext: (dateValue) => dateValue === "2026-06-02"
      ? { isRecommendable: false, blockReason: "No recommendable activity", type: "off", activityLabel: "Off", scheduleLabel: "Off" }
      : { isRecommendable: true, type: "training", activityLabel: "Training", scheduleLabel: "AM" },
    getMedicalRecommendationBlockReason: (playerId) => playerId === "p3" ? "Blocked by Squad Room" : "",
    getMedicalRecordStatus: (record) => ({ key: record?.status || "not-set" }),
    getMedicalRtpPhaseForRecommendation: () => "modified-team",
    getMedicalRtpPhaseOption: (key) => ({ key, label: "Modified team" }),
    getMedicalState: () => state,
    getMedicalStatusForParticipation: (participation) => participation >= 100 ? "full" : participation > 0 ? "modified" : "unavailable",
    getPlayerProfileRosterLabel: () => "Squad",
    getRosterSearchQuery: () => rosterSearchQuery,
    getStatusFilter: () => statusFilter,
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    isMedicalItemArchived: (item) => Boolean(item?.archivedAt),
    isMedicalPlayerBlockedBySquadAvailability: (player) => Boolean(player?.blocked),
    medicalActualParticipationFallback: "not-logged",
    medicalRtpPhaseOptions: [{ key: "modified-team" }],
    medicalTeamStorageKey: "football-medical-team-v1",
    navigatorRef: { clipboard: { writeText: async (text) => clipboardWrites.push(text) } },
    normalizeMedicalGovernancePolicy: (policy = {}) => ({ ...policy }),
    normalizeMedicalParticipation: (value, fallback = 100) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    removeMedicalRecord: (recordId) => {
      const record = state.records.find((candidate) => candidate.id === recordId);
      if (!record) {
        return null;
      }
      const archivedRecord = {
        ...record,
        archivedAt: "2026-05-31T10:00:00.000Z",
        archiveReason: "Manual archive from Medical Room",
      };
      state.records = state.records.map((candidate) => candidate.id === recordId ? archivedRecord : candidate);
      commits.push({ type: "record-archived", summary: recordId });
      return archivedRecord;
    },
    renderMedicalTeamWorkspace: (message = "") => renders.push(message),
    setBulkRecommendationOpen: (isOpen) => {
      bulkRecommendationOpen = Boolean(isOpen);
    },
    setBulkSelectedPlayerIds: (nextIds) => {
      bulkSelectedPlayerIds = nextIds instanceof Set ? nextIds : new Set(nextIds || []);
    },
    updateMedicalDatabaseSyncStatus: (eventType, result) => syncUpdates.push({ eventType, result }),
    win,
    writeMedicalState: () => writes.push("write"),
    ...overrides.deps,
  });
  return {
    auditEvents,
    clipboardWrites,
    commits,
    databaseEvents,
    get bulkRecommendationOpen() { return bulkRecommendationOpen; },
    get bulkSelectedPlayerIds() { return bulkSelectedPlayerIds; },
    renders,
    service,
    setRosterSearchQuery: (value) => { rosterSearchQuery = value; },
    setStatusFilter: (value) => { statusFilter = value; },
    state,
    syncUpdates,
    writes,
  };
}

test("Medical runtime operations service owns operations outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const service = readProjectFile("src/modules/medical/medical-runtime-operations-service.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeOperationsService).toBe("function");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(runtimeService).toContain("createMedicalRuntimeFacade({");
  expect(accessors).toContain('export function applyMedicalBulkRecommendation(...args) { return callFacade("applyMedicalBulkRecommendation", args); }');
  expect(accessors).toContain('export function clearMedicalQuickRecommendation(...args) { return callFacade("clearMedicalQuickRecommendation", args); }');
  expect(app).not.toContain("createMedicalRuntimeOperationsService({");
  expect(app).not.toContain("function applyMedicalBulkRecommendation(values = {}) {");
  expect(app).not.toContain("function recordMedicalDatabaseSyncEvent(eventType, payload = {}) {");
  expect(service).toContain("function applyMedicalBulkRecommendation(values = {})");
  expect(service).toContain("function recordMedicalDatabaseSyncEvent(eventType, payload = {})");
  expect(service).not.toContain("renderDashboardChatWidget");
  expect(index).toContain('export * from "./medical-runtime-operations-service.mjs";');
  expect(index).toContain('export * from "./medical-runtime-facade.mjs";');
});

test("Medical runtime operations service preserves database sync, audit, and coach handover copy", async () => {
  const harness = createHarness();

  const result = await harness.service.recordMedicalDatabaseSyncEvent("recommendation-saved", {
    record: { id: "r-new", playerId: "p1" },
  });
  expect(result).toMatchObject({ ok: true, stored: true });
  expect(harness.databaseEvents[0]).toMatchObject({
    action: "recordSyncEvent",
    eventType: "recommendation-saved",
    legacyPlayerId: "p1",
    payload: {
      schema: "footballscience-medical-room-event-v1",
      sourceKey: "football-medical-team-v1",
      selectedDate: "2026-05-31",
      stateSummary: {
        playerCount: 3,
        archivedPlayerCount: 1,
        recordCount: 1,
        injuryPlanCount: 1,
      },
    },
  });
  expect(harness.syncUpdates[0]).toMatchObject({ eventType: "recommendation-saved", result: { ok: true, stored: true } });

  harness.service.copyMedicalCoachHandoverToClipboard();
  await Promise.resolve();
  await Promise.resolve();
  expect(harness.clipboardWrites).toEqual(["Handover 2026-05-31"]);
  expect(harness.auditEvents[0]).toMatchObject({
    action: "medical.handover.copied",
    details: { date: "2026-05-31", itemCount: 1 },
  });
  expect(harness.renders.at(-1)).toBe("Coach-safe handover copied.");
});

test("Medical runtime operations service preserves filtering, bulk recommendations, and governance", () => {
  const harness = createHarness();

  harness.setRosterSearchQuery("alex");
  expect(harness.service.getFilteredMedicalPlayers().map((player) => player.id)).toEqual(["p1"]);
  harness.setRosterSearchQuery("");
  harness.setStatusFilter("not-set");
  expect(harness.service.getFilteredMedicalPlayers().map((player) => player.id)).toEqual(["p1", "p3"]);

  harness.service.toggleMedicalBulkPlayer("p1");
  harness.service.toggleMedicalBulkPlayer("p3");
  expect(Array.from(harness.bulkSelectedPlayerIds)).toEqual(["p1"]);
  expect(harness.renders.at(-1)).toBe("Blocked by Squad Room");

  const quick = harness.service.applyMedicalQuickRecommendation("p1", 75);
  expect(quick.record).toMatchObject({
    playerId: "p1",
    participation: 75,
    rtpPhase: "modified-team",
  });
  expect(harness.commits.at(-1)).toMatchObject({ type: "recommendation-saved" });

  const quickSame = harness.service.applyMedicalQuickRecommendation("p1", 75);
  expect(quickSame).toMatchObject({ unchanged: true, record: null });

  const quickClear = harness.service.clearMedicalQuickRecommendation("p1");
  expect(quickClear).toMatchObject({ cleared: true });
  expect(quickClear.archivedRecord).toMatchObject({
    playerId: "p1",
    participation: 75,
    archivedAt: "2026-05-31T10:00:00.000Z",
  });
  expect(harness.commits.at(-1)).toMatchObject({ type: "record-archived" });
  const quickAgain = harness.service.applyMedicalQuickRecommendation("p1", 75);
  expect(quickAgain.record).toMatchObject({
    playerId: "p1",
    participation: 75,
    rtpPhase: "modified-team",
  });

  harness.state.records = [
    {
      id: "latest-zero",
      playerId: "p1",
      date: "2026-05-31",
      status: "unavailable",
      participation: 0,
      createdAt: "2026-05-31T10:00:00.000Z",
    },
    {
      id: "older-full",
      playerId: "p1",
      date: "2026-05-31",
      status: "full",
      participation: 100,
      createdAt: "2026-05-31T09:00:00.000Z",
    },
    ...harness.state.records.filter((record) => record.playerId !== "p1" || record.date !== "2026-05-31"),
  ];
  const stackedQuickClear = harness.service.clearMedicalQuickRecommendation("p1");
  expect(stackedQuickClear).toMatchObject({ cleared: true });
  expect(stackedQuickClear.archivedRecords.map((record) => record.id).sort()).toEqual(["latest-zero", "older-full"]);
  expect(harness.state.records.filter((record) =>
    record.playerId === "p1" && record.date === "2026-05-31" && !record.archivedAt
  )).toEqual([]);

  harness.state.records = [
    {
      id: "plan-controlled",
      playerId: "p1",
      date: "2026-05-31",
      status: "unavailable",
      participation: 0,
      injuryPlanId: "plan-acl",
      createdAt: "2026-05-31T11:00:00.000Z",
    },
  ];
  const controlledClear = harness.service.clearMedicalQuickRecommendation("p1");
  expect(controlledClear).toMatchObject({
    cleared: false,
    blockReason: "This availability is controlled by Squad Room or an active medical plan.",
  });

  harness.state.records = [
    {
      id: "record-with-actual",
      playerId: "p1",
      date: "2026-05-31",
      status: "modified",
      participation: 75,
      actualParticipation: 50,
    },
    ...harness.state.records.filter((record) => record.playerId !== "p1" || record.date !== "2026-05-31" || record.archivedAt),
  ];
  const protectedQuickClear = harness.service.clearMedicalQuickRecommendation("p1");
  expect(protectedQuickClear).toMatchObject({
    archivedRecord: null,
    cleared: false,
  });
  expect(protectedQuickClear.blockReason).toContain("logged details");

  harness.service.setMedicalBulkSelection(["p1", "p2", "p3"], "2026-06-01");
  expect(Array.from(harness.bulkSelectedPlayerIds).sort()).toEqual(["p1", "p2"]);
  const bulk = harness.service.applyMedicalBulkRecommendation({
    date: "2026-06-01",
    participation: 100,
    comment: "Full",
    coachNote: "Ready",
    shareWithCoach: true,
    rtpPhase: "modified-team",
  });
  expect(bulk).toMatchObject({
    savedCount: 2,
    blockedCount: 0,
  });
  expect(harness.bulkSelectedPlayerIds.size).toBe(0);
  expect(harness.bulkRecommendationOpen).toBe(false);
  expect(harness.commits.at(-1)).toMatchObject({
    type: "bulk-recommendation-saved",
    summary: "2 bulk recommendations saved for 2026-06-01.",
  });

  expect(harness.service.updateMedicalGovernancePolicy({ policyOwner: "Medical Lead", retentionMonths: 24 })).toBe(true);
  expect(harness.state.policy).toMatchObject({
    policyOwner: "Medical Lead",
    retentionMonths: 24,
    updatedBy: "medical-user",
  });
  expect(harness.writes).toContain("write");
});

test("Medical runtime operations service preserves bulk control UI state", () => {
  const harness = createHarness();
  const controls = {
    date: { value: "2026-06-01" },
    participation: { value: "75", disabled: null },
    phase: { value: "" },
    activity: { textContent: "", classList: { calls: [], toggle(name, value) { this.calls.push([name, value]); } } },
    selectNotSet: { disabled: null },
    submit: { disabled: null },
  };
  const form = {
    querySelector: (selector) => ({
      "[data-medical-bulk-date]": controls.date,
      "[data-medical-bulk-participation]": controls.participation,
      "[data-medical-bulk-rtp-preview]": controls.phase,
      "[data-medical-bulk-activity-label]": controls.activity,
      "[data-medical-bulk-select-not-set]": controls.selectNotSet,
      'button[type="submit"]': controls.submit,
    })[selector] || null,
  };

  harness.service.setMedicalBulkSelection(["p1"], "2026-06-01");
  harness.service.updateMedicalBulkActivityControls(form);

  expect(controls.participation.disabled).toBe(false);
  expect(controls.phase.value).toBe("Modified team");
  expect(controls.activity.textContent).toBe("Training / AM");
  expect(controls.activity.classList.calls).toContainEqual(["is-locked", false]);
  expect(controls.selectNotSet.disabled).toBe(false);
  expect(controls.submit.disabled).toBe(false);
});
