import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  PLATFORM_IDENTITY_BACKFILL_MARKER,
  createPlatformIdentityRollbackPlan,
  createPlatformIdentitySnapshot,
} from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  createPlatformIdentityMigrationBundle,
  createPlatformIdentityRollbackBundle,
} from "../scripts/lib/platform-identity-migration-bundle.mjs";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";
const planSha256 = "a".repeat(64);
const projectRef = "staging-project-ref";
const createdAt = "2026-07-23T12:00:00.000Z";
const migrationFiles = [
  "20260723143000_platform_identity_migration_foundation.sql",
  "20260723143100_platform_identity_migration_tenant_commands.sql",
  "20260723143200_platform_identity_migration_subject_commands.sql",
  "20260723143300_platform_identity_atomic_migration_rpc.sql",
];
const platformBootstrap = `
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit;
create schema auth;
create schema app_private;

create table auth.users (
  id uuid primary key,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.role() returns text
language sql stable as $$ select 'service_role'::text $$;

create or replace function app_private.platform_touch_updated_at_and_row_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.row_version = coalesce(old.row_version, 1) + 1;
  return new;
end;
$$;
create or replace function app_private.platform_prevent_hard_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Hard delete is disabled.';
end;
$$;

create table public.platform_organizations (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  row_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table public.platform_clubs (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  slug text not null,
  name text not null,
  country_code text,
  status text not null default 'active',
  row_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table public.platform_teams (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  club_id uuid references public.platform_clubs(id),
  slug text not null,
  name text not null,
  sport text not null default 'football',
  age_group text,
  gender text,
  status text not null default 'active',
  row_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table public.platform_user_profiles (
  user_id uuid primary key references auth.users(id),
  primary_organization_id uuid references public.platform_organizations(id),
  primary_club_id uuid references public.platform_clubs(id),
  primary_team_id uuid references public.platform_teams(id),
  display_name text,
  first_name text,
  last_name text,
  email text,
  title text,
  department text,
  avatar_url text,
  status text not null default 'active',
  row_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table public.platform_memberships (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  club_id uuid references public.platform_clubs(id),
  team_id uuid references public.platform_teams(id),
  user_id uuid not null references auth.users(id),
  role text not null,
  scope text not null,
  status text not null default 'active',
  relationship text not null default 'staff',
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  row_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table public.platform_tenant_links (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  club_id uuid references public.platform_clubs(id),
  team_id uuid references public.platform_teams(id),
  module_id text not null,
  module_table text not null,
  module_record_id uuid not null,
  scope text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create trigger platform_organizations_touch_updated_at before update
  on public.platform_organizations for each row
  execute function app_private.platform_touch_updated_at_and_row_version();
create trigger platform_clubs_touch_updated_at before update
  on public.platform_clubs for each row
  execute function app_private.platform_touch_updated_at_and_row_version();
create trigger platform_teams_touch_updated_at before update
  on public.platform_teams for each row
  execute function app_private.platform_touch_updated_at_and_row_version();
create trigger platform_user_profiles_touch_updated_at before update
  on public.platform_user_profiles for each row
  execute function app_private.platform_touch_updated_at_and_row_version();
create trigger platform_memberships_touch_updated_at before update
  on public.platform_memberships for each row
  execute function app_private.platform_touch_updated_at_and_row_version();
`;
async function createPostgresFixture() {
  const pg = await PGlite.create({ extensions: { pgcrypto } });
  await pg.exec(platformBootstrap);
  for (const file of migrationFiles) {
    try {
      await pg.exec(
        await fs.readFile(
          path.join(rootDir, "supabase/migrations", file),
          "utf8"
        )
      );
    } catch (error) {
      const details = [
        error.position && `position=${error.position}`,
        error.where && `where=${error.where}`,
        error.detail && `detail=${error.detail}`,
      ]
        .filter(Boolean)
        .join(" ");
      throw new Error(
        `${file}: ${error.message}${details ? ` (${details})` : ""}`,
        { cause: error }
      );
    }
  }
  await pg.query(
    `insert into auth.users (id, raw_app_meta_data)
     values ($1, '{"role":"admin","status":"active"}'::jsonb),
            ($2, '{}'::jsonb)`,
    [actorId, userId]
  );
  return pg;
}
function emptySnapshot() {
  return createPlatformIdentitySnapshot({
    target: "staging",
    projectRef,
    planSha256,
    userCount: 1,
    createdAt,
    scope: {
      organizationId,
      teamId,
      userIds: [userId],
      links: [],
    },
    rowsByTable: {},
  });
}
function createBackfillBundle(snapshot = emptySnapshot()) {
  return createPlatformIdentityMigrationBundle({
    target: "staging",
    projectRef,
    actorId,
    requestId: "identity-backfill-1",
    createdAt,
    operation: "backfill",
    planSha256,
    snapshot,
    commands: [
      {
        table: "platform_organizations",
        action: "create",
        keyColumn: "id",
        key: organizationId,
        expectedRowVersion: null,
        record: {
          id: organizationId,
          slug: "football-science",
          name: "Football Science",
          status: "active",
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
        },
      },
      {
        table: "platform_teams",
        action: "create",
        keyColumn: "id",
        key: teamId,
        expectedRowVersion: null,
        record: {
          id: teamId,
          organization_id: organizationId,
          club_id: null,
          slug: "first-team",
          name: "First Team",
          sport: "football",
          status: "active",
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
        },
      },
      {
        table: "platform_user_profiles",
        action: "create",
        keyColumn: "user_id",
        key: userId,
        expectedRowVersion: null,
        record: {
          user_id: userId,
          primary_organization_id: organizationId,
          primary_club_id: null,
          primary_team_id: teamId,
          display_name: "Coach",
          email: "coach@example.com",
          status: "active",
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
        },
      },
      {
        table: "platform_memberships",
        action: "create",
        keyColumn: "id",
        key: membershipId,
        expectedRowVersion: null,
        record: {
          id: membershipId,
          organization_id: organizationId,
          club_id: null,
          team_id: teamId,
          user_id: userId,
          role: "coach",
          scope: "team",
          status: "active",
          relationship: "staff",
          invited_by: actorId,
          accepted_at: createdAt,
          metadata: { backfillSchema: PLATFORM_IDENTITY_BACKFILL_MARKER },
        },
      },
    ],
  });
}
async function executeBundle(pg, bundle, confirmation) {
  const result = await pg.query(
    `select public.execute_platform_identity_migration_bundle(
      $1::jsonb, $2::text, $3::text, $4::text
    ) as result`,
    [
      JSON.stringify(bundle),
      bundle.integrity.contentSha256,
      projectRef,
      confirmation,
    ]
  );
  return result.rows[0].result;
}
async function readIdentityRows(pg) {
  const tables = {};
  for (const table of [
    "platform_organizations",
    "platform_clubs",
    "platform_teams",
    "platform_user_profiles",
    "platform_memberships",
    "platform_tenant_links",
  ]) {
    tables[table] = (await pg.query(`select * from public.${table}`)).rows;
  }
  return tables;
}

test("Platform Identity SQL atomically applies, audits, and rolls back a reviewed staging bundle", async () => {
  const pg = await createPostgresFixture();
  try {
    const snapshot = emptySnapshot();
    const backfill = createBackfillBundle(snapshot);
    const applyResult = await executeBundle(
      pg,
      backfill,
      "APPLY_PLATFORM_IDENTITY_BACKFILL"
    );
    expect(applyResult).toMatchObject({
      ok: true,
      operation: "backfill",
      appliedCount: 4,
      piiExposed: false,
    });

    const currentRowsByTable = await readIdentityRows(pg);
    const rollbackPlan = createPlatformIdentityRollbackPlan({
      snapshot,
      currentRowsByTable,
      actorId,
      createdAt: "2026-07-23T12:05:00.000Z",
    });
    const rollback = createPlatformIdentityRollbackBundle({
      snapshot,
      rollbackPlan,
      projectRef,
      actorId,
      requestId: "identity-rollback-1",
      createdAt: "2026-07-23T12:05:00.000Z",
    });
    const rollbackResult = await executeBundle(
      pg,
      rollback,
      "APPLY_PLATFORM_IDENTITY_ROLLBACK"
    );

    const statuses = await pg.query(
      `select 'organization' as type, status from public.platform_organizations
       union all select 'team', status from public.platform_teams
       union all select 'profile', status from public.platform_user_profiles
       union all select 'membership', status from public.platform_memberships
       order by type`
    );
    const events = await pg.query(
      "select count(*)::integer as total, count(distinct organization_id)::integer as tenants, min(organization_id::text) as organization_id from public.platform_identity_migration_events"
    );
    const runs = await pg.query(
      "select organization_id::text, operation, status, applied_count from public.platform_identity_migration_runs order by operation"
    );

    expect(rollbackResult).toMatchObject({
      ok: true,
      operation: "rollback",
      appliedCount: 4,
      piiExposed: false,
    });
    expect(statuses.rows).toEqual([
      { type: "membership", status: "removed" },
      { type: "organization", status: "archived" },
      { type: "profile", status: "removed" },
      { type: "team", status: "archived" },
    ]);
    expect(events.rows[0]).toEqual({ total: 8, tenants: 1, organization_id: organizationId });
    expect(runs.rows).toEqual([
      { organization_id: organizationId, operation: "backfill", status: "rolled-back", applied_count: 4 },
      { organization_id: organizationId, operation: "rollback", status: "completed", applied_count: 4 },
    ]);
  } finally {
    await pg.close();
  }
});

test("Platform Identity SQL rolls back earlier writes when a later revision is stale", async () => {
  const pg = await createPostgresFixture();
  try {
    await pg.query(
      `insert into public.platform_organizations
        (id, slug, name, status, metadata, created_by, updated_by)
       values ($1, 'football-science', 'Original', 'active', '{}'::jsonb, $2, $2)`,
      [organizationId, actorId]
    );
    await pg.query(
      `insert into public.platform_teams
        (id, organization_id, slug, name, sport, status, metadata, created_by, updated_by)
       values ($1, $2, 'first-team', 'First Team', 'football', 'active', '{}'::jsonb, $3, $3)`,
      [teamId, organizationId, actorId]
    );
    const rowsByTable = await readIdentityRows(pg);
    const snapshot = createPlatformIdentitySnapshot({
      target: "staging",
      projectRef,
      planSha256,
      userCount: 1,
      createdAt,
      scope: { organizationId, teamId, userIds: [userId], links: [] },
      rowsByTable,
    });
    const bundle = createPlatformIdentityMigrationBundle({
      target: "staging",
      projectRef,
      actorId,
      requestId: "identity-stale-1",
      createdAt,
      operation: "backfill",
      planSha256,
      snapshot,
      commands: [
        {
          table: "platform_organizations",
          action: "update",
          keyColumn: "id",
          key: organizationId,
          expectedRowVersion: 1,
          patch: { name: "Must Roll Back" },
        },
        {
          table: "platform_teams",
          action: "update",
          keyColumn: "id",
          key: teamId,
          expectedRowVersion: 99,
          patch: { name: "Stale" },
        },
      ],
    });

    await expect(
      executeBundle(pg, bundle, "APPLY_PLATFORM_IDENTITY_BACKFILL")
    ).rejects.toThrow("team revision changed");

    const organization = await pg.query(
      "select name, row_version from public.platform_organizations where id = $1",
      [organizationId]
    );
    const runCount = await pg.query(
      "select count(*)::integer as total from public.platform_identity_migration_runs"
    );
    const eventCount = await pg.query(
      "select count(*)::integer as total from public.platform_identity_migration_events"
    );
    expect(organization.rows[0]).toEqual({
      name: "Original",
      row_version: 1,
    });
    expect(runCount.rows[0].total).toBe(0);
    expect(eventCount.rows[0].total).toBe(0);
  } finally {
    await pg.close();
  }
});
