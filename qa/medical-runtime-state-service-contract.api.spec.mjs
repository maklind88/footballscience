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
    createMedicalLinkedPlayerProfileIndex: () => ({
      ...(options.onCreateMedicalLinkedPlayerProfileIndex?.() || {}),
      profiles: Array.isArray(options.playerProfiles) ? options.playerProfiles : [],
      byId: new Map(
        (Array.isArray(options.playerProfiles) ? options.playerProfiles : [])
          .map((profile, index) => [String(profile?.id || "").trim(), { index, profile }])
          .filter(([id]) => id)
      ),
      byName: new Map(),
      byNameAndNumber: new Map(),
    }),
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
    normalizePlayerProfileRosterType: (value, fallback = "squad") => {
      const cleanValue = String(value || fallback || "squad").trim().toLowerCase();
      return cleanValue === "guest-player" ? "guest" : cleanValue;
    },
    playerProfileRosterTypeCountsInSquad: (value) => String(value || "squad").trim().toLowerCase() === "squad",
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
        rtpProgramExercises: ["Nordic hamstring progression"],
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
    rtpProgramExercises: ["Nordic hamstring progression"],
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
    rtpProgramExercises: [],
  });
  expect(coachState.policy).toMatchObject({ coachSafe: true });
});

test("Medical runtime state service auto-closes past unlogged actual participation only", () => {
  const storedState = {
    ...createStoredMedicalState(),
    records: [
      {
        id: "past-unlogged",
        playerId: "p1",
        date: "2026-05-30",
        status: "modified",
        participation: 75,
        actualParticipation: "not-logged",
        createdAt: "2026-05-30T09:00:00.000Z",
      },
      {
        id: "past-missing-actual",
        playerId: "p1",
        date: "2026-05-29",
        status: "modified",
        participation: 50,
        createdAt: "2026-05-29T09:00:00.000Z",
      },
      {
        id: "past-manual-actual",
        playerId: "p1",
        date: "2026-05-28",
        status: "modified",
        participation: 75,
        actualParticipation: 10,
        createdAt: "2026-05-28T09:00:00.000Z",
      },
      {
        id: "today-unlogged",
        playerId: "p1",
        date: "2026-05-31",
        status: "modified",
        participation: 25,
        actualParticipation: "not-logged",
        createdAt: "2026-05-31T09:00:00.000Z",
      },
      {
        id: "today-legacy-missing-actual",
        playerId: "p1",
        date: "2026-05-31",
        status: "modified",
        participation: 75,
        createdAt: "2026-05-31T10:00:00.000Z",
      },
      {
        id: "future-unlogged",
        playerId: "p1",
        date: "2026-06-01",
        status: "modified",
        participation: 25,
        actualParticipation: "not-logged",
        createdAt: "2026-06-01T09:00:00.000Z",
      },
      {
        id: "archived-unlogged",
        playerId: "p1",
        date: "2026-05-27",
        status: "modified",
        participation: 25,
        actualParticipation: "not-logged",
        archivedAt: "2026-05-27T12:00:00.000Z",
        createdAt: "2026-05-27T09:00:00.000Z",
      },
      {
        id: "synthetic-unlogged",
        playerId: "p1",
        date: "2026-05-26",
        status: "modified",
        participation: 25,
        actualParticipation: "not-logged",
        source: "injury-plan",
        injuryPlanId: "plan-1",
        createdAt: "2026-05-26T09:00:00.000Z",
      },
    ],
  };
  const harness = createServiceHarness({
    canEdit: true,
    storage: { "football-medical-team-v1": JSON.stringify(storedState) },
  });

  const state = harness.service.readMedicalState();
  const byId = new Map(state.records.map((record) => [record.id, record]));

  expect(byId.get("past-unlogged").actualParticipation).toBe(75);
  expect(byId.get("past-missing-actual").actualParticipation).toBe(50);
  expect(byId.get("past-manual-actual").actualParticipation).toBe(10);
  expect(byId.get("today-unlogged").actualParticipation).toBe("not-logged");
  expect(byId.get("today-legacy-missing-actual")).not.toHaveProperty("actualParticipation");
  expect(byId.get("future-unlogged").actualParticipation).toBe("not-logged");
  expect(byId.get("archived-unlogged").actualParticipation).toBe("not-logged");
  expect(byId.get("synthetic-unlogged").actualParticipation).toBe("not-logged");

  expect(harness.rawWrites).toHaveLength(1);
  const persisted = JSON.parse(harness.storage.value(harness.medicalTeamStorageKey));
  const persistedById = new Map(persisted.records.map((record) => [record.id, record]));
  expect(persistedById.get("past-unlogged").actualParticipation).toBe(75);
  expect(persistedById.get("today-unlogged").actualParticipation).toBe("not-logged");
  expect(persistedById.get("today-legacy-missing-actual")).not.toHaveProperty("actualParticipation");

  const coachHarness = createServiceHarness({
    canEdit: false,
    currentUser: null,
    storage: { "football-medical-team-v1": JSON.stringify(storedState) },
  });
  const coachState = coachHarness.service.readMedicalState();
  const coachById = new Map(coachState.records.map((record) => [record.id, record]));
  expect(coachById.get("past-unlogged").actualParticipation).toBe("not-logged");
  expect(coachHarness.rawWrites).toHaveLength(0);
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

test("Medical runtime state service materializes active Squad players into Medical roster on ensure", () => {
  const storedState = {
    ...createStoredMedicalState(),
    players: [
      {
        id: "p1",
        name: "Alex Morgan",
        number: "10",
        position: "Forward",
        rosterType: "squad",
        status: "Available",
        availabilityStatus: "Available",
        availability_status: "Available",
      },
    ],
    records: [],
    injuryPlans: [],
  };
  const harness = createServiceHarness({
    canEdit: true,
    playerProfiles: [
      { id: "p1", name: "Alex Morgan", number: "10", position: "Forward", rosterType: "squad", countsInSquad: true },
      {
        id: "new-squad-player",
        name: "New Squad Player",
        number: "27",
        position: "Midfielder",
        primaryRole: "8",
        rosterType: "squad",
        countsInSquad: true,
        createdAt: "2026-05-30T09:00:00.000Z",
        updatedAt: "2026-05-30T09:00:00.000Z",
      },
      {
        id: "academy-guest",
        name: "Academy Guest",
        number: "91",
        position: "Forward",
        rosterType: "academy",
        countsInSquad: false,
      },
    ],
    state: storedState,
  });

  expect(harness.service.syncMedicalRosterFromPlayerProfiles()).toBe(true);
  expect(harness.getState().players.map((player) => player.id)).toEqual(["p1", "new-squad-player"]);
  expect(harness.getState().players.find((player) => player.id === "p1")).toMatchObject({
    status: "Available",
    availabilityStatus: "Available",
    availability_status: "Available",
  });
  expect(harness.getState().players.find((player) => player.id === "new-squad-player")).toMatchObject({
    name: "New Squad Player",
    number: "27",
    rosterType: "squad",
    countsInSquad: true,
    primaryRole: "8",
  });
  expect(harness.getState().players.some((player) => player.id === "academy-guest")).toBe(false);
});

test("Medical runtime state service persists roster sync during private Medical ensure", () => {
  const harness = createServiceHarness({
    canEdit: true,
    playerProfiles: [
      { id: "p1", name: "Alex Morgan", rosterType: "squad", countsInSquad: true },
      { id: "p2", name: "Central Sync Player", position: "Defender", rosterType: "squad", countsInSquad: true },
    ],
    state: {
      selectedDate: "2026-05-31",
      selectedPlayerId: "p1",
      rosterVersion: "medical-roster-v1",
      players: [{ id: "p1", name: "Alex Morgan", rosterType: "squad" }],
      records: [],
      injuryPlans: [],
      dataSafety: {},
      policy: {},
    },
  });

  harness.service.ensureMedicalState();

  const persisted = JSON.parse(harness.storage.value(harness.medicalTeamStorageKey));
  expect(persisted.players.map((player) => player.id)).toContain("p2");
  expect(persisted.players.find((player) => player.id === "p2")).toMatchObject({
    name: "Central Sync Player",
    position: "Defender",
    rosterType: "squad",
  });
});

test("Medical runtime state service batches repeated render reads behind one roster sync", () => {
  const players = Array.from({ length: 28 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${String(index + 1).padStart(2, "0")}`,
    number: String(index + 1),
    position: index < 3 ? "Goalkeeper" : index < 11 ? "Defender" : index < 19 ? "Midfielder" : "Forward",
    rosterType: "squad",
    countsInSquad: true,
  }));
  const createHarness = (counters) => createServiceHarness({
    archiveMedicalPlayersRemovedFromSquad: () => {
      counters.archivePasses += 1;
    },
    onCreateMedicalLinkedPlayerProfileIndex: () => {
      counters.profileIndexPasses += 1;
    },
    playerProfiles: players,
    state: {
      selectedDate: "2026-05-31",
      selectedPlayerId: players[0].id,
      rosterVersion: "medical-roster-v1",
      players,
      records: [],
      injuryPlans: [],
      dataSafety: {},
      policy: {},
    },
  });
  const readCount = 200;
  const baselineCounters = { archivePasses: 0, profileIndexPasses: 0 };
  const baselineHarness = createHarness(baselineCounters);
  for (let index = 0; index < readCount; index += 1) {
    baselineHarness.service.ensureMedicalState();
  }

  const batchedCounters = { archivePasses: 0, profileIndexPasses: 0 };
  const batchedHarness = createHarness(batchedCounters);
  batchedHarness.service.withMedicalStateReadBatch(() => {
    for (let index = 0; index < readCount; index += 1) {
      batchedHarness.service.ensureMedicalState();
    }
  });

  expect(baselineCounters).toEqual({ archivePasses: readCount, profileIndexPasses: readCount * 2 });
  expect(batchedCounters).toEqual({ archivePasses: 1, profileIndexPasses: 2 });
  expect(batchedHarness.getState().players.map((player) => player.id)).toEqual(
    baselineHarness.getState().players.map((player) => player.id)
  );
});

test("Medical runtime state service seeds missing roster through raw data-safety storage", () => {
  const harness = createServiceHarness({ canEdit: true });
  const state = harness.service.readMedicalState();

  expect(state.players.map((player) => player.id)).toEqual(["p1"]);
  expect(harness.rawWrites).toHaveLength(1);
  expect(harness.rawWrites[0].key).toBe(harness.medicalTeamStorageKey);
  expect(JSON.parse(harness.rawWrites[0].value).rosterVersion).toBe("medical-roster-v1");
});
