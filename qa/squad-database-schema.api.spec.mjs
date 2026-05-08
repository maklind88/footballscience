import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260507185637_squad_module_multitenant.sql"),
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
  expect(migration).toContain("'available', 'managed', 'rehab', 'unavailable', 'loan', 'unknown'");
  expect(migration).toContain("squad_staff_org_user_unique_idx");
  expect(migration).toContain("squad_staff_club_user_unique_idx");
  expect(migration).toContain("squad_staff_team_user_unique_idx");
});
