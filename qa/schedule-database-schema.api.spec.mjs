import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260509230500_schedule_module_database_v1.sql"),
  "utf8"
);

const scheduleTables = [
  "schedule_events",
  "schedule_event_versions",
  "schedule_import_batches",
  "schedule_state_sync_events",
  "schedule_audit_events",
];

test("schedule database migration includes the durable schedule model", () => {
  scheduleTables.forEach((tableName) => {
    expect(migration).toContain(`public.${tableName}`);
  });
  expect(migration).toContain("organization_id uuid not null references public.squad_organizations");
  expect(migration).toContain("team_id uuid not null references public.squad_teams");
  expect(migration).toContain("type text not null default 'training' check");
  expect(migration).toContain("row_version integer not null default 1 check (row_version > 0)");
  expect(migration).toContain("unique (source_key, idempotency_key)");
});

test("schedule database migration is server-write first and RLS protected", () => {
  scheduleTables.forEach((tableName) => {
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).not.toContain(`grant insert on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant update on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant delete on public.${tableName} to authenticated`);
  });
  expect(migration).toContain("app_private.is_schedule_staff()");
  expect(migration).toContain("app_private.is_squad_team_member(team_id)");
  expect(migration).not.toContain("user_metadata");
});

test("schedule database migration prevents stale writes and hard deletes", () => {
  expect(migration).toContain("app_private.schedule_update_event");
  expect(migration).toContain("schedule_event.row_version = expected_row_version");
  expect(migration).toContain("Schedule row version conflict.");
  expect(migration).toContain("app_private.schedule_archive_event");
  expect(migration).toContain("app_private.schedule_restore_event");
  expect(migration).toContain("Hard delete is disabled for Schedule records");
  expect(migration).not.toContain("grant delete");
});

test("schedule database migration records versions and audit events", () => {
  expect(migration).toContain("create table if not exists public.schedule_event_versions");
  expect(migration).toContain("create table if not exists public.schedule_audit_events");
  expect(migration).toContain("before_record jsonb");
  expect(migration).toContain("after_record jsonb");
  expect(migration).toContain("changed_fields text[]");
  expect(migration).toContain("create trigger schedule_events_log_version");
  expect(migration).toContain("'schedule.event.' || next_change_type");
});

test("schedule database migration keeps sync inbox server-only", () => {
  expect(migration).toContain("create table if not exists public.schedule_state_sync_events");
  expect(migration).toContain("payload jsonb not null default '{}'::jsonb");
  expect(migration).toContain("payload_hash text not null");
  expect(migration).toContain("processing_status text not null default 'pending'");
  expect(migration).not.toContain("grant select on public.schedule_state_sync_events to authenticated");
  expect(migration).not.toContain("grant insert on public.schedule_state_sync_events to authenticated");
});

test("schedule database migration includes operational indexes", () => {
  [
    "schedule_events_team_date_idx",
    "schedule_events_org_date_type_idx",
    "schedule_events_team_legacy_event_unique_idx",
    "schedule_event_versions_event_created_idx",
    "schedule_event_versions_org_created_idx",
    "schedule_import_batches_org_created_idx",
    "schedule_state_sync_events_org_created_idx",
    "schedule_state_sync_events_status_created_idx",
    "schedule_audit_events_org_created_idx",
    "schedule_audit_events_event_created_idx",
  ].forEach((requiredText) => {
    expect(migration).toContain(requiredText);
  });
});
