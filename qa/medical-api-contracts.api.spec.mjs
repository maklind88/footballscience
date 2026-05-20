import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const medicalDatabase = require("../api/_lib/medical-database.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

test("medical database adapter remains feature flagged", () => {
  const previousStorageMode = process.env.MEDICAL_STORAGE_MODE;
  const previousDatabaseMode = process.env.MEDICAL_DATABASE_MODE;
  const previousDualWriteMode = process.env.MEDICAL_DUAL_WRITE_MODE;
  delete process.env.MEDICAL_STORAGE_MODE;
  delete process.env.MEDICAL_DATABASE_MODE;
  delete process.env.MEDICAL_DUAL_WRITE_MODE;

  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(false);

  process.env.MEDICAL_STORAGE_MODE = "dual-write";
  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(true);

  process.env.MEDICAL_STORAGE_MODE = "legacy";
  expect(medicalDatabase.isMedicalDatabaseEnabled()).toBe(false);

  if (previousStorageMode === undefined) {
    delete process.env.MEDICAL_STORAGE_MODE;
  } else {
    process.env.MEDICAL_STORAGE_MODE = previousStorageMode;
  }
  if (previousDatabaseMode === undefined) {
    delete process.env.MEDICAL_DATABASE_MODE;
  } else {
    process.env.MEDICAL_DATABASE_MODE = previousDatabaseMode;
  }
  if (previousDualWriteMode === undefined) {
    delete process.env.MEDICAL_DUAL_WRITE_MODE;
  } else {
    process.env.MEDICAL_DUAL_WRITE_MODE = previousDualWriteMode;
  }
});

test("medical database writes stay medical-side only", () => {
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "guest" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "coach" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "analyst" })).toBe(false);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "medical" })).toBe(true);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "performance" })).toBe(true);
  expect(medicalDatabase.canWriteMedicalDatabase({ role: "admin" })).toBe(true);
});

test("medical sync events normalize to an idempotent database row", () => {
  const first = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "recommendation-saved",
      playerId: "legacy-player-7",
      payload: {
        record: {
          id: "record-1",
          playerId: "legacy-player-7",
          participation: 50,
          comment: "Private medical note",
          coachNote: "Modified team only",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );
  const second = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "recommendation-saved",
      playerId: "legacy-player-7",
      payload: {
        record: {
          coachNote: "Modified team only",
          comment: "Private medical note",
          id: "record-1",
          participation: 50,
          playerId: "legacy-player-7",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );

  expect(first.ok).toBe(true);
  expect(first.row.event_type).toBe("recommendation-saved");
  expect(first.row.legacy_player_id).toBe("legacy-player-7");
  expect(first.row.actor_id).toBe("0f9a1865-0b2e-4a28-b933-87e137f7e3a4");
  expect(first.row.payload_hash).toBe(second.row.payload_hash);
  expect(first.row.idempotency_key).toBe(second.row.idempotency_key);
});

test("medical archive events are first-class sync events", () => {
  const recordArchive = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "record-archived",
      playerId: "legacy-player-7",
      payload: {
        recordId: "record-1",
        record: {
          id: "record-1",
          playerId: "legacy-player-7",
          archivedAt: "2026-05-20T12:00:00.000Z",
          archiveReason: "Manual archive from Medical Room",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );
  const planArchive = medicalDatabase.normalizeSyncEventBody(
    {
      eventType: "availability-plan-archived",
      playerId: "legacy-player-7",
      payload: {
        planId: "plan-1",
        plan: {
          id: "plan-1",
          playerId: "legacy-player-7",
          archivedAt: "2026-05-20T12:00:00.000Z",
          archiveReason: "Manual archive from Medical Room",
        },
      },
    },
    { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
  );

  expect(recordArchive.ok).toBe(true);
  expect(recordArchive.row.event_type).toBe("record-archived");
  expect(planArchive.ok).toBe(true);
  expect(planArchive.row.event_type).toBe("availability-plan-archived");
  expect(
    medicalDatabase.normalizeSyncEventBody(
      {
        eventType: "availability-plan-updated",
        playerId: "legacy-player-7",
        payload: { planId: "plan-1", plan: { id: "plan-1", playerId: "legacy-player-7", participation: 0 } },
      },
      { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
    ).row.event_type
  ).toBe("availability-plan-updated");
  expect(
    medicalDatabase.normalizeSyncEventBody(
      {
        eventType: "player-archived",
        playerId: "legacy-player-7",
        payload: { player: { id: "legacy-player-7", archivedAt: "2026-05-20T12:00:00.000Z" } },
      },
      { id: "0f9a1865-0b2e-4a28-b933-87e137f7e3a4", role: "medical" }
    ).row.event_type
  ).toBe("player-archived");
});

test("medical room archives clinical items instead of hard deleting them", () => {
  const appSource = readFileSync(resolve(__dirname, "../app.js"), "utf8");
  expect(appSource).toContain("archiveReason: \"Manual archive from Medical Room\"");
  expect(appSource).toContain("record-archived");
  expect(appSource).toContain("availability-plan-archived");
  expect(appSource).toContain("availability-plan-updated");
  expect(appSource).toContain("player-archived");
  expect(appSource).toContain("data-medical-data-safety");
  expect(appSource).not.toContain("medicalState.records = medicalState.records.filter((record) => record.id !== recordId)");
  expect(appSource).not.toContain("medicalState.injuryPlans = medicalState.injuryPlans.filter((plan) => plan.id !== planId)");
});

test("medical API route is auth protected and delegates to database handler", () => {
  const route = readFileSync(resolve(__dirname, "../api/medical.js"), "utf8");
  expect(route).toContain("getCurrentActor");
  expect(route).toContain("handleMedicalDatabaseRequest");
  expect(route).toContain("You must be signed in.");
});
