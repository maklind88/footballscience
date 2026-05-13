import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260507185637_squad_module_multitenant.sql"),
  "utf8"
);
const guardMigration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260508000000_squad_data_loss_guards.sql"),
  "utf8"
);

const coreTables = [
  "squad_organizations",
  "squad_clubs",
  "squad_teams",
  "squad_seasons",
  "squad_staff_memberships",
  "squad_players",
  "squad_player_external_ids",
  "squad_roster_memberships",
  "squad_player_profile_snapshots",
  "squad_player_status_events",
  "squad_player_notes",
  "squad_player_media",
  "squad_import_batches",
  "squad_audit_events",
];

test("squad database migration includes the multi-tenant roster model", () => {
  coreTables.forEach((tableName) => {
    expect(migration).toContain(`public.${tableName}`);
  });

  expect(migration).toContain("organization_id uuid not null references public.squad_organizations");
  expect(migration).toContain("club_id uuid references public.squad_clubs");
  expect(migration).toContain("team_id uuid not null references public.squad_teams");
  expect(migration).toContain("season_id uuid not null references public.squad_seasons");
  expect(migration).toContain("player_id uuid not null references public.squad_players");
  expect(migration).toContain("unique (team_id, season_id, player_id)");
});

test("squad database migration is server-write first and RLS protected", () => {
  coreTables.forEach((tableName) => {
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).toContain(`grant select on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant insert on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant update on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant delete on public.${tableName} to authenticated`);
  });
});

test("squad database migration uses app metadata and excludes guest from staff access", () => {
  expect(migration).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
  expect(migration).not.toContain("user_metadata");
  expect(migration).toContain("'admin', 'coach', 'analyst', 'performance', 'medical'");
  expect(migration).not.toContain("'admin', 'coach', 'analyst', 'performance', 'medical', 'guest'");
  expect(migration).toContain("visibility in ('staff', 'coach', 'medical', 'private')");
  expect(migration).toContain("target_visibility = 'medical'");
  expect(migration).toContain("target_visibility = 'private'");
});

test("squad database migration includes scale indexes for search, roster pages, imports, and history", () => {
  [
    "create extension if not exists pg_trgm",
    "squad_players_org_status_sort_idx",
    "squad_players_display_name_trgm_idx",
    "squad_player_external_ids_player_idx",
    "squad_roster_team_season_status_idx",
    "squad_roster_team_season_role_idx",
    "squad_roster_org_role_idx",
    "squad_profile_snapshots_player_created_idx",
    "squad_status_events_player_effective_idx",
    "squad_import_batches_org_created_idx",
    "squad_audit_events_org_created_idx",
  ].forEach((requiredText) => {
    expect(migration).toContain(requiredText);
  });

  expect(migration).not.toContain("(team_id, season_id, status, sort_name)");
});

test("squad database migration keeps current UI values compatible during rollout", () => {
  expect(migration).toContain("'key', 'important', 'rotation', 'squad', 'depth', 'development', 'academy', 'trial', 'loan'");
  expect(migration).toContain("'available', 'injured', 'managed', 'rehab', 'unavailable', 'national-team', 'vacation', 'personal', 'suspended', 'loan', 'unknown'");
  expect(migration).toContain("squad_staff_org_user_unique_idx");
  expect(migration).toContain("squad_staff_club_user_unique_idx");
  expect(migration).toContain("squad_staff_team_user_unique_idx");
});

test("squad guard migration adds row-version and soft-delete fields to critical roster records", () => {
  ["public.squad_players", "public.squad_roster_memberships"].forEach((tableName) => {
    expect(guardMigration).toContain(`alter table ${tableName}`);
    expect(guardMigration).toContain("add column if not exists row_version integer not null default 1");
    expect(guardMigration).toContain("add column if not exists deleted_at timestamptz");
    expect(guardMigration).toContain("add column if not exists deleted_by uuid references auth.users(id) on delete set null");
    expect(guardMigration).toContain("add column if not exists delete_reason text");
  });

  expect(guardMigration).toContain("squad_players_row_version_check check (row_version > 0)");
  expect(guardMigration).toContain("squad_roster_memberships_row_version_check check (row_version > 0)");
  expect(guardMigration).toContain("squad_players_active_org_sort_idx");
  expect(guardMigration).toContain("squad_roster_active_team_season_idx");
  expect(guardMigration).toContain("where deleted_at is null and status <> 'archived'");
});

test("squad guard migration records rollback history for roster changes", () => {
  expect(guardMigration).toContain("create table if not exists public.squad_roster_membership_versions");
  expect(guardMigration).toContain("before_record jsonb");
  expect(guardMigration).toContain("after_record jsonb not null");
  expect(guardMigration).toContain("changed_fields text[] not null default '{}'::text[]");
  expect(guardMigration).toContain("change_type in ('insert', 'update', 'archive', 'restore')");
  expect(guardMigration).toContain("create trigger squad_roster_memberships_log_version");
  expect(guardMigration).toContain("after insert or update on public.squad_roster_memberships");
  expect(guardMigration).toContain("squad_roster_versions_roster_created_idx");
  expect(guardMigration).toContain("squad roster versions are manager visible");
});

test("squad guard migration forces database writes through version-checked server functions", () => {
  expect(guardMigration).toContain("create or replace function app_private.squad_update_roster_membership");
  expect(guardMigration).toContain("create or replace function app_private.squad_archive_roster_membership");
  expect(guardMigration).toContain("create or replace function app_private.squad_restore_roster_membership");
  expect(guardMigration).toContain("expected_row_version integer");
  expect(guardMigration).toContain("and row_version = expected_row_version");
  expect(guardMigration).toContain("raise exception 'Squad row version conflict.' using errcode = '40001'");
  expect(guardMigration).toContain("revoke execute on function app_private.squad_update_roster_membership(uuid, integer, jsonb) from public, anon, authenticated");
  expect(guardMigration).toContain("revoke execute on function public.squad_log_roster_membership_version() from public, anon, authenticated");
  expect(guardMigration).toContain("grant execute on function app_private.squad_update_roster_membership(uuid, integer, jsonb) to service_role");
  expect(guardMigration).not.toContain("grant delete on public.squad_players");
  expect(guardMigration).not.toContain("grant delete on public.squad_roster_memberships");
});

test("squad guard migration blocks hard deletes at the database boundary", () => {
  expect(guardMigration).toContain("create or replace function app_private.squad_prevent_hard_delete");
  expect(guardMigration).toContain("Hard delete is disabled for Squad records");
  expect(guardMigration).toContain("before delete on public.squad_players");
  expect(guardMigration).toContain("before delete on public.squad_roster_memberships");
  expect(guardMigration).toContain("Use archive/restore with deleted_at instead");
});
