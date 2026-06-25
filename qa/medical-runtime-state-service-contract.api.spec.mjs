import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeStateService } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    value: (key) => map.get(key) ?? null,
  };
}

function createServiceHarness(options = {}) {
  const medicalTeamStorageKey = "football-medical-team-v1";
  const storage = createStorage(options.storage || {});
  const rawWrites = [];
  const logs = [];
  let medicalState = options.state || null;
  const service = createMedicalRuntimeStateService({
    archiveMedicalPlayersRemovedFromSquad: options.archiveMedicalPlayersRemovedFromSquad || (() => {}),
    canEditMedicalTeam: () => Boolean(options.canEdit),
    compareMedicalPlayers: (first, second) => String(first.name || "").localeCompare(String(second.name || "")),
    defaultMedicalPlayers: [{ id: "p1", name: "Alex Morgan", createdAt: "2026-05-01T09:00:00.000Z" }],
    formatDateValue: () => "2026-05-31",
    getCurrentMedicalActorId: () => "medical-user",
    getCurrentPlatformUser: () => options.currentUser ?? { id: "user-1" },
    getMedicalLinkedPlayerProfile: (player) => options.profileById?.[player.id] || null,
    getMedicalRecommendationActivityContext: () => ({ type: "training" }),
    getMedicalRtpPhaseForRecommendation: () => "modified-team",
    getMedicalState: () => medicalState,
    getMedicalStatusForParticipation: (participation) => participation >= 100 ? "full" : participation > 0 ? "modified" : "unavailable",
    getMedicalStatusOptionForDateFromHelper: (statusKey, dateValue, rtpPhase) => ({ key: statusKey, dateValue, rtpPhase }),
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    logEvent: (message) => logs.push(message),
    medicalActualParticipationFallback: "not-logged",
    medicalDefaultRosterVersion: "medical-roster-v1",
    medicalRtpPhaseOptions: [{ key: "modified-team" }],
    medicalStatusOptions: [{ key: "full" }, { key: "modified" }, { key: "unavailable" }],
    medicalTeamStorageKey,
    normalizeMedicalDataSafety: (value = {}) => ({ ...value }),
    normalizeMedicalGovernancePolicy: (value = {}) => ({ ...value }),
    normalizeMedicalInjuryPlan: (value = {}) => value && value.playerId ? { ...value } : null,
    normalizeMedicalParticipation: (value, fallback = 100) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    normalizeMedicalPlayer: (value = {}) => value && value.id ? { ...value } : null,
    normalizeMedicalPlayerAvailabilityStatus: (value, fallback = "") => String(value || fallback || "").trim(),
    normalizeMedicalRecord: (value = {}) => value && value.playerId ? { ...value } : null,
    normalizeMedicalShareValue: (value) => value === true || value === "true" || value === "on" || value === "1",
    rawDataSafetySetItem: (key, value) => {
      rawWrites.push({ key, value });
      storage.setItem(key, value);
    },
    sanitizeMedicalGovernancePolicyForCoachView: () => ({ coachSafe: true }),
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    win: { localStorage: storage },
  });
  return {
    getState: () => medicalState,
    logs,
    medicalTeamStorageKey,
    rawWrites,
    service,
    storage,
  };
}

function createStoredMedicalState() {
  return {
    selectedDate: "2026-05-31",
    selectedPlayerId: "p1",
    rosterVersion: "medical-roster-v1",
    players: [{ id: "p1", name: "Alex Morgan", status: "available", createdAt: "2026-05-01T09:00:00.000Z" }],
    records: [
      {
        id: "r1",
        playerId: "p1",
        date: "2026-05-31",
        status: "modified",
        participation: 75,
        comment: "Private clinical note",
        coachNote: "Coach-safe note",
        shareWithCoach: true,
        rtpPhase: "modified-team",
        createdAt: "2026-05-31T09:00:00.000Z",
      },
    ],
    injuryPlans: [
      {
        id: "plan-1",
        playerId: "p1",
        startDate: "2026-05-01",
        endDate: "2026-06-15",
        reviewDate: "2026-06-01",
        status: "modified",
        participation: 75,
        injuryType: "Hamstring",
        bodyArea: "Left",
        coachNote: "Shared plan",
        shareWithCoach: true,
        rtpPhase: "modified-team",
        rtpLibraryProfileId: "hamstring-strain",
        rtpLibraryProfileName: "Hamstring Strain",
        rtpLibraryEvidenceLevel: "Moderate to high",
        rtpProgramGateCriteria: ["Pain-free sprinting"],
        rtpProgramNextSteps: ["Controlled sprint exposure"],
        rtpProgramHoldRules: ["Pain increase"],
        createdAt: "2026-05-01T09:00:00.000Z",
      },
    ],
    dataSafety: {},
    policy: { policyOwner: "Medical Lead" },
  };
}

test("Medical runtime state service owns protected storage and sanitizer bodies outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const service = readProjectFile("src/modules/medical/medical-runtime-state-service.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeStateService).toBe("function");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(app).not.toContain("createMedicalRuntimeStateService({");
  expect(runtimeService).toContain("createMedicalRuntimeStateService({");
  expect(accessors).toContain('export function readMedicalState(...args) { return callStateService("readMedicalState", args); }');
  expect(app).not.toContain("function readMedicalState() {\ntry {");
  expect(app).not.toContain("function cloneMedicalState(source = {}) {");
  expect(service).toContain("function readMedicalState()");
  expect(service).toContain("function cloneMedicalState(source = {})");
  expect(service).toContain("win.localStorage.setItem");
  expect(service).toContain("rawDataSafetySetItem");
  expect(service).toContain("lastClinicalChangeAt");
  expect(service).not.toContain("renderDashboardChatWidget");
  expect(index).toContain('export * from "./medical-runtime-state-service.mjs";');
});

test("Medical runtime state service preserves private and coach-safe read behavior", () => {
  const storedState = createStoredMedicalState();
  const privateHarness = createServiceHarness({
    canEdit: true,
    storage: { "football-medical-team-v1": JSON.stringify(storedState) },
  });
  const privateState = privateHarness.service.readMedicalState();

  expect(privateState.records[0]).toMatchObject({
    comment: "Private clinical note",
    coachNote: "Coach-safe note",
  });
  expect(privateState.injuryPlans[0]).toMatchObject({
    rtpLibraryProfileName: "Hamstring Strain",
    rtpProgramGateCriteria: ["Pain-free sprinting"],
  });
  expect(privateState.records[0]).not.toHaveProperty("createdBy");
  expect(privateState.policy).toMatchObject({ policyOwner: "Medical Lead" });

  const coachHarness = createServiceHarness({
    canEdit: false,
    currentUser: null,
    storage: { "football-medical-team-v1": JSON.stringify(storedState) },
  });
  const coachState = coachHarness.service.readMedicalState();

  expect(coachState.records[0]).toMatchObject({
    comment: "",
    coachNote: "Coach-safe note",
    createdBy: "coach-safe",
    shareWithCoach: true,
  });
  expect(coachState.injuryPlans[0]).toMatchObject({
    injuryType: "Availability plan",
    bodyArea: "",
    comment: "",
    coachNote: "Shared plan",
    createdBy: "coach-safe",
    rtpLibraryProfileName: "",
    rtpProgramGateCriteria: [],
  });
  expect(coachState.policy).toMatchObject({ coachSafe: true });
});

test("Medical runtime state service preserves write, sync-status, and profile status updates", () => {
  const harness = createServiceHarness({
    canEdit: true,
    profileById: { p1: { status: "modified" } },
    state: createStoredMedicalState(),
  });

  expect(harness.service.syncMedicalPlayerAvailabilityStatusesFromProfiles()).toBe(true);
  expect(harness.getState().players[0]).toMatchObject({
    status: "modified",
    availabilityStatus: "modified",
    availability_status: "modified",
  });

  harness.service.commitMedicalClinicalState("recommendation-saved", "Alex Morgan saved.");
  const committed = JSON.parse(harness.storage.value(harness.medicalTeamStorageKey));
  expect(committed.dataSafety).toMatchObject({
    lastClinicalChangeBy: "medical-user",
    lastClinicalChangeType: "recommendation-saved",
    lastClinicalChangeSummary: "Alex Morgan saved.",
    lastDatabaseSyncStatus: "pending",
  });

  harness.service.updateMedicalDatabaseSyncStatus("recommendation-saved", { ok: true, stored: true, payloadHash: "hash-1" });
  const synced = JSON.parse(harness.storage.value(harness.medicalTeamStorageKey));
  expect(synced.dataSafety).toMatchObject({
    lastDatabaseSyncStatus: "stored",
    lastDatabaseSyncEvent: "recommendation-saved",
    lastPayloadHash: "hash-1",
  });
});

test("Medical runtime state service seeds missing roster through raw data-safety storage", () => {
  const harness = createServiceHarness({ canEdit: true });
  const state = harness.service.readMedicalState();

  expect(state.players.map((player) => player.id)).toEqual(["p1"]);
  expect(harness.rawWrites).toHaveLength(1);
  expect(harness.rawWrites[0].key).toBe(harness.medicalTeamStorageKey);
  expect(JSON.parse(harness.rawWrites[0].value).rosterVersion).toBe("medical-roster-v1");
});
