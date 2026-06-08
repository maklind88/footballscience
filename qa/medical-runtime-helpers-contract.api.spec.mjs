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
    createId: (prefix) => `${prefix}-1`,
    getCurrentUser: () => ({ id: "medical-lead" }),
    getPlayerProfilesState: () => ({
      players: [
        { id: "p1", name: "Alex Morgan", number: "13", status: "injured" },
        { id: "p2", name: "Sam Kerr", number: "20", status: "available" },
      ],
    }),
    medicalDataSafetySyncStatusOptions: new Set(["idle", "pending", "stored", "legacy", "duplicate", "failed"]),
    medicalOptionSelectors: {
      getMedicalGateOption: (value) => ({ key: value || "pending" }),
      getMedicalRtpPhaseForRecommendation: () => "full-training",
      getMedicalRtpPhaseOption: (phaseKey) => ({ key: phaseKey, status: "full", participation: 100 }),
      getMedicalStatusActivityType: () => "training",
      getMedicalStatusForParticipation: (participation) => (participation >= 90 ? "full" : "modified"),
      getMedicalStatusOption: (statusKey) => ({ key: statusKey, label: statusKey }),
      getMedicalStatusOptionForActivity: (statusKey) => ({ key: statusKey, label: statusKey }),
      getMedicalStatusOptionForDate: (statusKey) => ({ key: statusKey, label: statusKey }),
      normalizeMedicalActualParticipation: (value) => Math.max(0, Number(value) || 0),
      normalizeMedicalParticipation: (value, fallback = 100) => Math.max(0, Number(value) || fallback),
    },
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
  const helpers = readProjectFile("src/modules/medical/medical-runtime-helpers.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeHelpers).toBe("function");
  expect(app).toContain("createMedicalRuntimeHelpers({");
  expect(app).not.toContain("function normalizeMedicalPlayer(");
  expect(app).not.toContain("function getMedicalPlayerAvailabilityStatus(");
  expect(app).not.toContain("function compareMedicalPlayers(");
  expect(helpers).toContain("function normalizeMedicalPlayer(");
  expect(helpers).toContain("function getMedicalPlayerAvailabilityStatus(");
  expect(helpers).toContain("function compareMedicalPlayers(");
  expect(index).toContain('export * from "./medical-runtime-helpers.mjs";');
});

test("Medical runtime helpers stay read-only and do not own write paths", () => {
  const helpers = readProjectFile("src/modules/medical/medical-runtime-helpers.mjs");

  expect(helpers).not.toContain("writeMedicalState");
  expect(helpers).not.toContain("recordMedicalDatabaseSyncEvent");
  expect(helpers).not.toContain("localStorage");
  expect(helpers).not.toContain("rawDataSafetySetItem");
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
