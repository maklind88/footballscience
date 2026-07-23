import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const tenantCommands = readFileSync(
  new URL(
    "../supabase/migrations/20260723143100_platform_identity_migration_tenant_commands.sql",
    import.meta.url
  ),
  "utf8"
);
const subjectCommands = readFileSync(
  new URL(
    "../supabase/migrations/20260723143200_platform_identity_migration_subject_commands.sql",
    import.meta.url
  ),
  "utf8"
);
const executor = readFileSync(
  new URL(
    "../supabase/migrations/20260723143300_platform_identity_atomic_migration_rpc.sql",
    import.meta.url
  ),
  "utf8"
);
const allSql = `${tenantCommands}\n${subjectCommands}\n${executor}`;

test("Platform Identity atomic RPC is staging-only, service-role-only, and explicitly confirmed", () => {
  expect(executor).toContain(
    "create or replace function public.execute_platform_identity_migration_bundle"
  );
  expect(executor).toContain("coalesce(auth.role(), '') <> 'service_role'");
  expect(executor).toContain("p_bundle ->> 'target' <> 'staging'");
  expect(executor).toContain("APPLY_PLATFORM_IDENTITY_BACKFILL");
  expect(executor).toContain("APPLY_PLATFORM_IDENTITY_ROLLBACK");
  expect(executor).toContain(
    "app_private.platform_identity_migration_actor_allowed(actor_id)"
  );
  expect(executor).toContain(
    "revoke all on function public.execute_platform_identity_migration_bundle"
  );
  expect(executor).not.toContain("security definer");
});

test("Platform Identity atomic RPC locks, deduplicates, journals, and proves revisions", () => {
  expect(executor).toContain("pg_advisory_xact_lock");
  expect(executor).toContain(
    "Platform Identity migration bundle contains duplicate rows."
  );
  expect(executor).toContain(
    "insert into public.platform_identity_migration_runs"
  );
  expect(executor).toContain(
    "insert into public.platform_identity_migration_events"
  );
  expect(executor).toContain(
    "Platform Identity migration revision proof failed for %"
  );
  expect(executor).toContain(
    "Platform Identity migration command escaped the reviewed tenant."
  );
  expect(executor).toContain(
    "backfill_run.organization_id = bundle_organization_id"
  );
  expect(allSql).toContain("organization.row_version = expected_version");
  expect(allSql).toContain("team.row_version = expected_version");
  expect(allSql).toContain("profile.row_version = expected_version");
  expect(allSql).toContain("membership.row_version = expected_version");
  expect(allSql).toContain("tenant_link.row_version = expected_version");
});

test("Platform Identity command helpers whitelist every table and fail closed on unowned rollback rows", () => {
  for (const table of [
    "platform_organizations",
    "platform_clubs",
    "platform_teams",
    "platform_user_profiles",
    "platform_memberships",
    "platform_tenant_links",
  ]) {
    expect(allSql).toContain(`'${table}'`);
  }
  expect(tenantCommands).toContain(
    "app_private.platform_identity_validate_command"
  );
  expect(tenantCommands).toContain(
    "Platform Identity migration will not mutate an unowned row."
  );
  expect(tenantCommands).toContain(
    "footballscience-platform-identity-backfill-v1"
  );
  expect(allSql).not.toMatch(
    /grant\s+execute[^;]+platform_identity_[^;]+to\s+(?:public|anon|authenticated)/is
  );
});

test("Platform Identity tenant validation prevents cross-organization profile, membership, and link writes", () => {
  expect(subjectCommands).toContain(
    "app_private.platform_identity_profile_scope_allowed"
  );
  expect(subjectCommands).toContain(
    "app_private.platform_identity_membership_scope_allowed"
  );
  expect(subjectCommands).toContain(
    "club.organization_id = p_organization_id"
  );
  expect(subjectCommands).toContain(
    "team.organization_id = p_organization_id"
  );
  expect(subjectCommands).toContain(
    "Platform Identity profile tenant scope is invalid."
  );
  expect(subjectCommands).toContain(
    "Platform Identity membership tenant scope is invalid."
  );
  expect(subjectCommands).toContain(
    "Platform Identity tenant-link scope is invalid."
  );
});

test("Platform Identity rollback restores parents first and archives children first", () => {
  expect(executor).toContain(
    "when commands.command ->> 'action' = 'restore-existing'"
  );
  expect(executor).toContain(
    "when 'platform_organizations' then 10"
  );
  expect(executor).toContain(
    "when 'platform_tenant_links' then 70"
  );
  expect(executor).toContain(
    "when 'platform_organizations' then 120"
  );
  expect(executor).toContain("backfill_run.status = 'completed'");
  expect(executor).toContain("set status = 'rolled-back'");
});
