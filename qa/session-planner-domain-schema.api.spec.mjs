import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  rootDir,
  "supabase/migrations/20260722202605_session_planner_domain_records_v1.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");

const sessionPlannerTables = [
  "session_planner_sessions",
  "session_planner_blocks",
  "session_planner_record_versions",
  "session_planner_migration_runs",
];

test("Session Planner domain schema is additive and keeps app-state production-primary", () => {
  expect(migration).toContain("This migration is intentionally additive and inert");
  expect(migration).toContain("'football-session-planner-v3'");
  expect(migration).toContain("'planned'");
  expect(migration).toMatch(/'planned',\s*false,\s*false,\s*true,/s);
  expect(migration).not.toMatch(/\b(drop table|truncate table)\b/i);
  expect(migration).not.toContain("reads_from_database = true");
  expect(migration).not.toContain("writes_to_database = true");
  expect(migration).toContain("on conflict (module_id, source_storage_key, target_table) do nothing");
  expect(migration).not.toMatch(/on conflict[\s\S]*do update set[\s\S]*phase = excluded\.phase/i);
});

test("Session Planner domain tables carry tenant, revision, audit and soft-delete fields", () => {
  for (const table of sessionPlannerTables) {
    expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
  }
  expect(migration).toContain("organization_id uuid not null");
  expect(migration).toContain("team_id uuid not null");
  expect(migration).toContain("row_version bigint not null default 1");
  expect(migration).toContain("session_planner_record_versions");
  expect(migration).toContain("session_planner_prevent_hard_delete");
  expect(migration).toContain("archived_at timestamptz");
});

test("Session Planner direct access is read-only and tenant-scoped", () => {
  expect(migration).toContain("app_private.can_read_session_planner_scope(organization_id, team_id)");
  expect(migration).toContain("membership.organization_id = target_organization_id");
  expect(migration).toContain("membership.scope = 'organization'");
  expect(migration).toContain("membership.scope = 'club'");
  expect(migration).toContain("membership.club_id = target_team.club_id");
  expect(migration).toContain("membership.scope = 'team'");
  expect(migration).toContain("membership.team_id = target_team_id");
  expect(migration).toContain("grant select on public.session_planner_sessions to authenticated");
  expect(migration).toContain("grant select on public.session_planner_blocks to authenticated");
  expect(migration).not.toMatch(/grant\s+(insert|update|delete).*authenticated/i);
  expect(migration).toContain("Session Planner tenant scope mismatch");
  expect(migration).toContain("Session Planner block scope does not match its session");
});

test("Session Planner domain payloads are bounded instead of recreating a megablob", () => {
  expect(migration).toContain("octet_length(content::text) <= 131072");
  expect(migration).toContain("octet_length(payload::text) <= 262144");
  expect(migration).toContain("session_planner_sessions_team_date_slot_active_idx");
  expect(migration).toContain("session_planner_blocks_session_order_active_idx");
});
