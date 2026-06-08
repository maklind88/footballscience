import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeHelpers } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHelpers(options = {}) {
  return createMedicalRuntimeHelpers({
    addCalendarDays: (date, days) => {
      const next = new Date(date);
      next.setDate(next.getDate() + Number(days || 0));
      return next;
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    createId: (prefix) => `${prefix}-1`,
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getActivityContext: () => ({ type: "training" }),
    getCurrentUser: () => ({ id: "medical-lead" }),
    getPlayerProfilesState: () => ({
      players: [
        { id: "p1", name: "Alex Morgan", number: "13", status: "injured" },
        { id: "p2", name: "Sam Kerr", number: "20", status: "available" },
      ],
    }),
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    medicalClearanceRoles: [{ key: "doctor" }, { key: "physio" }],
    medicalDataSafetySyncStatusOptions: new Set(["idle", "pending", "stored", "legacy", "duplicate", "failed"]),
    medicalGateOptions: [{ key: "pending" }, { key: "pass" }, { key: "fail" }],
    medicalInjuryPlanStatusOptions: [{ key: "full" }, { key: "modified" }],
    medicalLoadGateOptions: [{ key: "running" }, { key: "contact" }],
    medicalOptionSelectors: {
      getMedicalGateOption: (value) => ({ key: value || "pending" }),
      getMedicalRtpPhaseForRecommendation: () => "full-training",
      getMedicalRtpPhaseOption: (phaseKey) => ({ key: phaseKey, label: "Full training", status: "full", participation: 100 }),
      getMedicalStatusActivityType: () => "training",
      getMedicalStatusForParticipation: (participation) => (participation >= 90 ? "full" : "modified"),
      getMedicalStatusOption: (statusKey) => ({ key: statusKey, label: statusKey }),
      getMedicalStatusOptionForActivity: (statusKey) => ({ key: statusKey, label: statusKey }),
      getMedicalStatusOptionForDate: (statusKey) => ({ key: statusKey, label: statusKey }),
      normalizeMedicalActualParticipation: (value) => Math.max(0, Number(value) || 0),
      normalizeMedicalParticipation: (value, fallback = 100) => Math.max(0, Number(value) || fallback),
    },
    medicalRtpPhaseOptions: [{ key: "full-training" }, { key: "modified-training" }],
    medicalStatusOptions: [{ key: "full" }, { key: "modified" }],
    parseDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
    medicalPositionAliases: {
      Forward: ["st", "striker", "forward"],
      Midfielder: ["cm", "midfielder"],
    },
    medicalPositionOrder: { Forward: 1, Midfielder: 2 },
    playerProfileStatusOptions: [
      { key: "available", label: "Available" },
      { key: "injured", label: "Injured" },
    ],
    normalizePlayerProfileName: (value) => String(value || "").trim().toLowerCase(),
    normalizePlayerProfileRole: (value, fallback = "") => String(value || fallback || "").trim(),
    normalizePlayerProfileRoleList: (value = []) => (Array.isArray(value) ? value : []),
    normalizePlayerProfileRosterType: (value, fallback = "squad") => value || fallback,
    normalizePlayerProfileTemporaryDate: (value = "") => String(value || ""),
    playerProfileRosterTypeCountsInSquad: (value) => value !== "trialist",
    ...options,
  });
}

test("Medical runtime helpers own pure helper wiring outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const helpers = readProjectFile("src/modules/medical/medical-runtime-helpers.mjs");
  const clinical = readProjectFile("src/modules/medical/medical-clinical-normalizers.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeHelpers).toBe("function");
  expect(app).toContain("const medicalRuntimeHelpers = medicalRuntimeService.helpers;");
  expect(app).not.toContain("createMedicalRuntimeHelpers({");
  expect(runtimeService).toContain("createMedicalRuntimeHelpers({");
  expect(app).toContain("function normalizeMedicalPlayer(...args) { return medicalRuntimeHelpers.normalizeMedicalPlayer(...args); }");
  expect(app).toContain("function normalizeMedicalRecord(...args) { return medicalRuntimeHelpers.normalizeMedicalRecord(...args); }");
  expect(app).toContain("function normalizeMedicalInjuryPlan(...args) { return medicalRuntimeHelpers.normalizeMedicalInjuryPlan(...args); }");
  expect(app).toContain("function getMedicalPlayerAvailabilityStatus(...args) { return medicalRuntimeHelpers.getMedicalPlayerAvailabilityStatus(...args); }");
  expect(app).toContain("function compareMedicalPlayers(...args) { return medicalRuntimeHelpers.compareMedicalPlayers(...args); }");
  expect(app).not.toContain("function normalizeMedicalPlayer(player");
  expect(app).not.toContain("function normalizeMedicalRecord(record");
  expect(app).not.toContain("function normalizeMedicalInjuryPlan(plan");
  expect(app).not.toContain("function getMedicalPlayerAvailabilityStatus(player");
  expect(app).not.toContain("function compareMedicalPlayers(first, second)");
  expect(app).toContain("function commitMedicalClinicalState(");
  expect(app).toContain("function updateMedicalDatabaseSyncStatus(");
  expect(helpers).toContain("createMedicalClinicalNormalizers({");
  expect(helpers).toContain("function normalizeMedicalPlayer(");
  expect(helpers).toContain("function getMedicalPlayerAvailabilityStatus(");
  expect(helpers).toContain("function compareMedicalPlayers(");
  expect(clinical).toContain("function normalizeMedicalRecord(");
  expect(clinical).toContain("function normalizeMedicalInjuryPlan(");
  expect(clinical).toContain("function normalizeMedicalGovernancePolicy(");
  expect(index).toContain('export * from "./medical-clinical-normalizers.mjs";');
  expect(index).toContain('export * from "./medical-runtime-helpers.mjs";');
});

test("Medical runtime helpers stay read-only and do not own write paths", () => {
  const helpers = readProjectFile("src/modules/medical/medical-runtime-helpers.mjs");
  const clinical = readProjectFile("src/modules/medical/medical-clinical-normalizers.mjs");
  const pureRuntimeSources = `${helpers}\n${clinical}`;

  expect(pureRuntimeSources).not.toContain("writeMedicalState");
  expect(pureRuntimeSources).not.toContain("commitMedicalClinicalState");
  expect(pureRuntimeSources).not.toContain("updateMedicalDatabaseSyncStatus");
  expect(pureRuntimeSources).not.toContain("markMedicalClinicalChange");
  expect(pureRuntimeSources).not.toContain("recordMedicalDatabaseSyncEvent");
  expect(pureRuntimeSources).not.toContain("localStorage");
  expect(pureRuntimeSources).not.toContain("rawDataSafetySetItem");
});

test("Medical runtime helpers preserve linked Squad availability and player normalization", () => {
  const helpers = createHelpers();
  const linkedPlayer = { id: "p1", name: "Alex Morgan", number: "13", position: "striker" };

  expect(helpers.getMedicalLinkedPlayerProfile(linkedPlayer)).toMatchObject({ id: "p1" });
  expect(helpers.getMedicalPlayerAvailabilityStatus(linkedPlayer)).toBe("injured");
  expect(helpers.isMedicalPlayerBlockedBySquadAvailability(linkedPlayer)).toBe(true);
  expect(helpers.getMedicalPlayerSquadAvailabilityBlockReason(linkedPlayer)).toContain("Injured");

  expect(helpers.normalizeMedicalPlayerPosition("striker")).toBe("Forward");
  expect(helpers.normalizeMedicalPlayer({ name: "New Player", position: "cm", rosterType: "trialist" })).toMatchObject({
    id: "medical-player-1",
    countsInSquad: false,
    position: "Midfielder",
  });
});

test("Medical runtime helpers preserve timestamps, data safety counts, and sorting", () => {
  const helpers = createHelpers();
  const source = {
    players: [{ archivedAt: "2026-01-01T00:00:00.000Z" }, {}],
    records: [{ deletedAt: "2026-01-02T00:00:00.000Z" }],
    injuryPlans: [{}],
  };

  expect(helpers.getCurrentMedicalActorId()).toBe("medical-lead");
  expect(helpers.normalizeMedicalTimestamp("not-a-date")).toBe("");
  expect(helpers.getMedicalDataSafetyCounts(source)).toEqual({
    archivedPlayers: 1,
    archivedRecords: 1,
    archivedPlans: 0,
  });
  expect(helpers.normalizeMedicalDataSafety({ lastDatabaseSyncStatus: "stored" }, source)).toMatchObject({
    archivedPlayerCount: 1,
    archivedRecordCount: 1,
    archivedPlanCount: 0,
    lastDatabaseSyncStatus: "stored",
  });

  const sorted = [
    { name: "B", number: "", position: "cm" },
    { name: "A", number: "9", position: "striker" },
  ].sort(helpers.compareMedicalPlayers);
  expect(sorted[0].name).toBe("A");
});

test("Medical runtime helpers preserve record, plan, clearance, and policy normalization", () => {
  const helpers = createHelpers();

  expect(helpers.normalizeMedicalClearance({ doctor: "on", physio: false })).toEqual({
    doctor: true,
    physio: false,
  });
  expect(helpers.normalizeMedicalLoadGates({ running: "pass", contact: "unknown" })).toEqual({
    running: "pass",
    contact: "pending",
  });
  expect(helpers.getMedicalClearanceValues({ "clearance.doctor": "true", "clearance.physio": "" })).toEqual({
    doctor: "true",
    physio: "",
  });
  expect(helpers.getMedicalLoadGateValues({ "gates.running": "pass", "gates.contact": "fail" })).toEqual({
    running: "pass",
    contact: "fail",
  });

  expect(helpers.normalizeMedicalRecord({
    playerId: " p1 ",
    date: "2026-05-10",
    participation: 75,
    actualParticipation: 70,
    shareWithCoach: "on",
    createdAt: "2026-05-10T09:00:00.000Z",
  })).toMatchObject({
    id: "medical-record-1",
    playerId: "p1",
    date: "2026-05-10",
    status: "modified",
    participation: 75,
    actualParticipation: 70,
    shareWithCoach: true,
    rtpPhase: "full-training",
    createdBy: "medical-lead",
  });

  expect(helpers.normalizeMedicalInjuryPlan({
    playerId: "p1",
    startDate: "2026-05-10",
    duration: 2,
    durationUnit: "weeks",
    clearance: { doctor: "true" },
    gates: { running: "pass" },
    createdAt: "2026-05-10T09:00:00.000Z",
  })).toMatchObject({
    id: "medical-injury-plan-1",
    playerId: "p1",
    startDate: "2026-05-10",
    endDate: "2026-05-23",
    status: "full",
    rtpPhase: "full-training",
    clearance: { doctor: true, physio: false },
    gates: { running: "pass", contact: "pending" },
  });

  expect(helpers.normalizeMedicalGovernancePolicy({
    retentionMonths: 999,
    reviewCadenceDays: 0,
    policyOwner: " Lead ",
    consentRequired: "on",
  })).toMatchObject({
    dataLevel: "private-medical",
    retentionMonths: 120,
    reviewCadenceDays: 30,
    policyOwner: "Lead",
    consentRequired: true,
  });
  expect(helpers.sanitizeMedicalGovernancePolicyForCoachView()).toMatchObject({
    dataLevel: "coach-safe",
    retentionMonths: 0,
    policyOwner: "",
  });
});
