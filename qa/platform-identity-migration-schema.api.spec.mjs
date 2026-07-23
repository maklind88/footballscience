import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260723143000_platform_identity_migration_foundation.sql",
    import.meta.url
  ),
  "utf8"
);

test("Platform Identity migration foundation adds tenant-link revisions and hard-delete protection", () => {
  expect(migration).toContain(
    "alter table public.platform_tenant_links"
  );
  expect(migration).toContain(
    "add column if not exists row_version integer not null default 1"
  );
  expect(migration).toContain(
    "platform_tenant_links_touch_updated_at"
  );
  expect(migration).toContain(
    "app_private.platform_touch_updated_at_and_row_version()"
  );
  expect(migration).toContain(
    "platform_tenant_links_prevent_hard_delete"
  );
  expect(migration).toContain(
    "app_private.platform_prevent_hard_delete()"
  );
});

test("Platform Identity migration journals are staging-only, bounded, and service-role private", () => {
  expect(migration).toContain(
    "create table if not exists public.platform_identity_migration_runs"
  );
  expect(migration).toContain(
    "create table if not exists public.platform_identity_migration_events"
  );
  expect(migration).toContain("check (target = 'staging')");
  expect(migration).toContain(
    "command_count integer not null check (command_count between 0 and 5000)"
  );
  expect(migration).toContain(
    "alter table public.platform_identity_migration_runs enable row level security"
  );
  expect(migration).toContain(
    "alter table public.platform_identity_migration_events enable row level security"
  );
  expect(migration).toContain(
    "revoke all on public.platform_identity_migration_runs"
  );
  expect(migration).toContain(
    "revoke all on public.platform_identity_migration_events"
  );
  expect(migration).not.toMatch(
    /grant\s+(?:all|select|insert|update|delete)[^;]+platform_identity_migration_(?:runs|events)[^;]+authenticated/is
  );
});

test("Platform Identity migration actor authorization is derived from server-owned identity", () => {
  expect(migration).toContain(
    "app_private.platform_identity_migration_actor_allowed"
  );
  expect(migration).toContain("actor.raw_app_meta_data ->> 'role'");
  expect(migration).toContain("membership.role = 'admin'");
  expect(migration).toContain("membership.status = 'active'");
  expect(migration).toContain("membership.deleted_at is null");
  expect(migration).toContain(
    "revoke all on function app_private.platform_identity_migration_actor_allowed(uuid)"
  );
  expect(migration).toContain(
    "grant execute on function app_private.platform_identity_migration_actor_allowed(uuid)"
  );
});

test("Platform Identity migration foundation cannot execute a migration", () => {
  expect(migration).not.toContain(
    "execute_platform_identity_migration_bundle"
  );
  expect(migration).not.toContain("security definer");
  expect(migration).not.toContain("grant execute on function public.");
});
