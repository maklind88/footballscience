import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260515045748_platform_identity_foundation.sql"),
  "utf8"
);

const identityTables = [
  "platform_organizations",
  "platform_clubs",
  "platform_teams",
  "platform_user_profiles",
  "platform_memberships",
  "platform_tenant_links",
  "platform_module_migration_checkpoints",
  "platform_membership_events",
];

test("platform identity migration creates the canonical tenant model", () => {
  for (const tableName of identityTables) {
    expect(migration).toContain(`public.${tableName}`);
  }

  expect(migration).toContain("organization_id uuid not null references public.platform_organizations");
  expect(migration).toContain("club_id uuid references public.platform_clubs");
  expect(migration).toContain("team_id uuid references public.platform_teams");
  expect(migration).toContain("user_id uuid not null references auth.users");
  expect(migration).toContain("role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest')");
  expect(migration).toContain("scope in ('organization', 'club', 'team')");
  expect(migration).toContain("platform_memberships_scope_target_check");
});

test("platform identity is server-write first and RLS protected", () => {
  for (const tableName of identityTables) {
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).toContain(`grant select on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant insert on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant update on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant delete on public.${tableName} to authenticated`);
  }
});

test("platform identity uses app metadata and tenant membership helpers", () => {
  expect(migration).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
  expect(migration).not.toContain("user_metadata");
  expect(migration).toContain("app_private.current_platform_role");
  expect(migration).toContain("app_private.is_platform_org_member");
  expect(migration).toContain("app_private.is_platform_club_member");
  expect(migration).toContain("app_private.is_platform_team_member");
  expect(migration).toContain("app_private.can_manage_platform_scope");
  expect(migration).toContain("user_id = (select auth.uid())");
});

test("platform identity blocks hard deletes and versions mutable rows", () => {
  ["platform_organizations", "platform_clubs", "platform_teams", "platform_user_profiles", "platform_memberships"].forEach(
    (tableName) => {
      expect(migration).toContain(`drop trigger if exists ${tableName}_touch_updated_at`);
      expect(migration).toContain(`before update on public.${tableName}`);
      expect(migration).toContain(`drop trigger if exists ${tableName}_prevent_hard_delete`);
      expect(migration).toContain(`before delete on public.${tableName}`);
    }
  );

  expect(migration).toContain("row_version integer not null default 1 check (row_version > 0)");
  expect(migration).toContain("new.row_version = coalesce(old.row_version, 1) + 1");
  expect(migration).toContain("Hard delete is disabled for Platform Identity records");
  expect(migration).toContain("platform_membership_events");
  expect(migration).toContain("platform_log_membership_event");
});

test("platform identity bridges current module tenants and app-state migration phases", () => {
  expect(migration).toContain("platform_tenant_links");
  expect(migration).toContain("module_id text not null");
  expect(migration).toContain("module_table text not null");
  expect(migration).toContain("module_record_id uuid not null");
  expect(migration).toContain("organization_id uuid not null references public.platform_organizations");
  expect(migration).toContain("platform_module_migration_checkpoints");
  expect(migration).toContain("app_state_fallback_enabled boolean not null default true");
  expect(migration).toContain("phase in ('planned', 'shadow', 'dual-write', 'dual-read', 'database-primary', 'retired')");
  expect(migration).toContain("'football-dashboard-chat-v1'");
  expect(migration).toContain("'football-scouting-v1'");
});

test("platform identity is registered in the permission matrix contract", () => {
  expect(migration).toContain("('platform-identity', 'read'");
  expect(migration).toContain("('platform-identity', 'admin'");
  expect(migration).toContain("on conflict (module_id, action) do update");
});
