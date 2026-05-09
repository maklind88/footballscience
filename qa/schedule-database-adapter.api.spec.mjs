import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scheduleDatabase = require("../api/_lib/schedule-database.js");

const organizationId = "0f9a1865-0b2e-4a28-b933-87e137f7e3a4";
const teamId = "f0d82f45-8a8c-4c70-9d5e-f52d179b7ff1";
const actor = { id: "5712f8d2-67fd-4a65-9ab8-264b891adcd4", role: "coach" };

function restoreEnv(previousValues) {
  for (const [key, value] of Object.entries(previousValues)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("schedule database adapter remains feature flagged", () => {
  const previousValues = {
    SCHEDULE_STORAGE_MODE: process.env.SCHEDULE_STORAGE_MODE,
    SCHEDULE_DATABASE_MODE: process.env.SCHEDULE_DATABASE_MODE,
    SCHEDULE_DUAL_WRITE_MODE: process.env.SCHEDULE_DUAL_WRITE_MODE,
  };
  delete process.env.SCHEDULE_STORAGE_MODE;
  delete process.env.SCHEDULE_DATABASE_MODE;
  delete process.env.SCHEDULE_DUAL_WRITE_MODE;

  expect(scheduleDatabase.isScheduleDatabaseEnabled()).toBe(false);
  process.env.SCHEDULE_STORAGE_MODE = "dual-write";
  expect(scheduleDatabase.isScheduleDatabaseEnabled()).toBe(true);
  process.env.SCHEDULE_STORAGE_MODE = "legacy";
  expect(scheduleDatabase.isScheduleDatabaseEnabled()).toBe(false);

  restoreEnv(previousValues);
});

test("schedule database writes stay coach-side only", () => {
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "guest" })).toBe(false);
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "analyst" })).toBe(false);
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "performance" })).toBe(false);
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "medical" })).toBe(false);
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "coach" })).toBe(true);
  expect(scheduleDatabase.canWriteScheduleDatabase({ role: "admin" })).toBe(true);
});

test("schedule legacy events normalize to tenant-owned database rows", () => {
  const normalized = scheduleDatabase.normalizeScheduleEventRows(
    {
      selectedDate: "2026-05-12",
      events: [
        { id: "legacy-training-1", date: "2026-05-12", time: "10:30", type: "training", title: "Training", note: "Tactical prep" },
        { id: "legacy-match-1", date: "2026-05-13", time: "18:00", type: "match", title: "Match day" },
      ],
    },
    { organizationId, teamId }
  );

  expect(normalized.ok).toBe(true);
  expect(normalized.rows).toHaveLength(2);
  expect(normalized.rows[0]).toMatchObject({
    organization_id: organizationId,
    team_id: teamId,
    legacy_event_id: "legacy-training-1",
    event_date: "2026-05-12",
    type: "training",
    title: "Training",
    note: "Tactical prep",
    source: "legacy-app-state",
  });
  expect(normalized.rows[0].metadata.legacyTime).toBe("10:30");
  expect(normalized.rows[1].type).toBe("match");
});

test("schedule database adapter rejects missing tenant context", () => {
  const normalized = scheduleDatabase.normalizeScheduleEventRows({ events: [{ title: "Training", date: "2026-05-12" }] });
  expect(normalized.ok).toBe(false);
  expect(normalized.status).toBe(400);
  expect(normalized.reason).toContain("organizationId and teamId");
});

test("schedule sync events normalize to an idempotent database row", () => {
  const first = scheduleDatabase.normalizeSyncEventBody(
    {
      eventType: "state-snapshot",
      organizationId,
      teamId,
      payload: {
        selectedDate: "2026-05-12",
        events: [{ id: "event-1", date: "2026-05-12", type: "training", title: "Training", note: "A" }],
      },
    },
    actor
  );
  const second = scheduleDatabase.normalizeSyncEventBody(
    {
      eventType: "state-snapshot",
      teamId,
      organizationId,
      payload: {
        events: [{ note: "A", title: "Training", type: "training", date: "2026-05-12", id: "event-1" }],
        selectedDate: "2026-05-12",
      },
    },
    actor
  );

  expect(first.ok).toBe(true);
  expect(first.row.organization_id).toBe(organizationId);
  expect(first.row.team_id).toBe(teamId);
  expect(first.row.actor_id).toBe(actor.id);
  expect(first.row.event_type).toBe("state-snapshot");
  expect(first.row.event_count).toBe(1);
  expect(first.row.payload_hash).toBe(second.row.payload_hash);
  expect(first.row.idempotency_key).toBe(second.row.idempotency_key);
});

test("schedule sync recorder does not write while database mode is disabled", async () => {
  const previousValues = {
    SCHEDULE_STORAGE_MODE: process.env.SCHEDULE_STORAGE_MODE,
    SCHEDULE_DATABASE_MODE: process.env.SCHEDULE_DATABASE_MODE,
    SCHEDULE_DUAL_WRITE_MODE: process.env.SCHEDULE_DUAL_WRITE_MODE,
  };
  delete process.env.SCHEDULE_STORAGE_MODE;
  delete process.env.SCHEDULE_DATABASE_MODE;
  delete process.env.SCHEDULE_DUAL_WRITE_MODE;

  const result = await scheduleDatabase.recordScheduleStateSyncEvent(
    actor,
    { events: [{ id: "event-1", date: "2026-05-12", type: "training", title: "Training" }] },
    { organizationId, teamId }
  );

  expect(result.ok).toBe(true);
  expect(result.enabled).toBe(false);
  expect(result.stored).toBe(false);
  expect(result.payloadHash).toHaveLength(64);

  restoreEnv(previousValues);
});
