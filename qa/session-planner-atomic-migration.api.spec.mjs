import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  rootDir,
  "supabase/migrations/20260723002733_session_planner_atomic_migration_rpc.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("Session Planner migration RPC is one server-only atomic command boundary", () => {
  expect(migration).toContain(
    "create or replace function public.execute_session_planner_migration_bundle("
  );
  expect(migration).toMatch(
    /execute_session_planner_migration_bundle\([\s\S]*returns jsonb[\s\S]*language plpgsql[\s\S]*security invoker/
  );
  expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
  expect(migration).toContain("grant execute on function public.execute_session_planner_migration_bundle(");
  expect(migration).toMatch(
    /revoke all on function public\.execute_session_planner_migration_bundle\([\s\S]*from public, anon, authenticated/
  );
  expect(migration).not.toMatch(
    /grant\s+execute\s+on\s+function\s+public\.execute_session_planner_migration_bundle[\s\S]*to\s+(anon|authenticated)/i
  );
  expect(migration).toContain("p_bundle ->> 'target' <> 'staging'");
  expect(migration).not.toContain("'staging', 'production'");
});

test("Session Planner migration RPC locks tenant and exact app-state checkpoint", () => {
  expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
  expect(migration).toContain("'session-planner-migration:' || target_team_id::text");
  expect(migration).toMatch(
    /from public\.platform_app_state_records records[\s\S]*state_key = 'football-session-planner-v3'[\s\S]*for share/
  );
  expect(migration).toContain("source_record.revision <> expected_source_revision");
  expect(migration).toContain("source_record.value_hash <> expected_source_hash");
  expect(migration).toContain("p_source_organization_id <> 'global'");
  expect(migration).toMatch(
    /from public\.platform_teams teams[\s\S]*teams\.id = target_team_id[\s\S]*teams\.organization_id = target_organization_id/
  );
  expect(migration).toContain("app_private.session_planner_can_operate_migration(");
  expect(migration).toMatch(/from auth\.users actor[\s\S]*actor\.id = p_actor_id/);
});

test("Session Planner migration commands use optimistic revisions and fail the transaction", () => {
  expect(migration).toContain("row_version = expected_version");
  expect(migration).toContain("nullif(p_command -> 'record', 'null'::jsonb)");
  expect(migration).toContain("applied_version <> expected_applied_version");
  expect(migration).toContain("using errcode = '40001'");
  expect(migration).toContain("Session Planner session command scope mismatch.");
  expect(migration).toContain("Session Planner block command scope mismatch.");
  expect(migration).toContain(
    "Session Planner migration action does not match its operation."
  );
  expect(migration).toContain("app_private.session_planner_apply_session_command(");
  expect(migration).toContain("app_private.session_planner_apply_block_command(");
  expect(migration).not.toMatch(/\b(delete from|truncate table|drop table)\b/i);
  expect(migration).not.toContain("where team_id = team_id");
  expect(migration).not.toContain("where source_revision = source_revision");
  expect(migration).not.toContain("where source_hash = source_hash");
});

test("Session Planner migration RPC preserves audit attribution and idempotent ledger", () => {
  expect(migration).toContain(
    "pg_catalog.set_config('app.session_planner_actor_id', actor_id::text, true)"
  );
  expect(migration).toContain(
    "pg_catalog.set_config('app.session_planner_request_id', request_id, true)"
  );
  expect(migration).toContain("insert into public.session_planner_migration_runs");
  expect(migration).toContain(
    "on conflict (team_id, source_storage_key, source_revision, source_hash, mode)"
  );
  expect(migration).toContain("session_planner_migration_runs.status = 'rolled-back'");
  expect(migration).toContain("'containsCoachingContent', false");
});

test("Session Planner migration operator must be an active platform or tenant administrator", () => {
  expect(migration).toContain("app_private.session_planner_can_operate_migration");
  expect(migration).toContain("actor.raw_app_meta_data ->> 'role' = 'admin'");
  expect(migration).toContain("coalesce(actor.raw_app_meta_data ->> 'status', 'active') = 'active'");
  expect(migration).toContain("membership.organization_id = p_organization_id");
  expect(migration).toContain("membership.status = 'active'");
  expect(migration).toContain("membership.deleted_at is null");
  expect(migration).toContain("membership.club_id = target_team.club_id");
  expect(migration).toContain("membership.team_id = target_team.id");
  expect(migration).toContain("membership.role in ('admin', 'club-admin', 'team-admin')");
  expect(migration).toContain("migration actor is not authorized for this tenant");
});

test("Session Planner migration RPC requires distinct explicit confirmations", () => {
  expect(migration).toContain("'APPLY_SESSION_PLANNER_BACKFILL'");
  expect(migration).toContain("'APPLY_SESSION_PLANNER_ROLLBACK'");
  expect(migration).toContain("p_confirmation <> (case");
  expect(migration).toContain("end) then");
  expect(migration).toContain(
    "p_bundle #>> '{integrity,contentSha256}' <> p_expected_bundle_sha256"
  );
});

test("Session Planner runtime does not call the migration RPC", () => {
  const runtimeFiles = [
    "app.js",
    "app-runtime.js",
    "platform-auth-boot.js",
    "src/modules/session-planner/index.mjs",
    "src/modules/session-planner/session-planner-runtime-service.mjs",
    "api/_lib/session-planner-database.js",
  ];
  for (const relativePath of runtimeFiles) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    expect(source).not.toContain("execute_session_planner_migration_bundle");
  }
});
