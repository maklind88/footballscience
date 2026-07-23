import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  executeSessionPlannerStagingDrill,
  STAGING_DRILL_CONFIRMATION,
} from "../scripts/session-planner-staging-drill.mjs";
import {
  actorId,
  createDrillOptions,
  createDrillTimestamps,
  createInitialBundleSha256,
  createMigrationFixture,
  createPreparedMigration,
  createRecoveryReceipt,
  organizationId,
  sourceHash,
  teamId,
} from "./helpers/session-planner-migration-fixture.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const database = require("../api/_lib/session-planner-database.js");
const migrationFiles = [
  "20260722202605_session_planner_domain_records_v1.sql",
  "20260722235545_session_planner_audit_context_hardening.sql",
  "20260723002733_session_planner_atomic_migration_rpc.sql",
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
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select '{"app_metadata":{"role":"admin"}}'::jsonb $$;
create or replace function auth.role() returns text
language sql stable as $$ select 'service_role'::text $$;
create or replace function app_private.current_platform_role() returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

create table public.platform_organizations (id uuid primary key);
create table public.platform_teams (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  club_id uuid,
  status text not null default 'active',
  deleted_at timestamptz
);
create table public.platform_memberships (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id),
  club_id uuid,
  team_id uuid,
  user_id uuid not null references auth.users(id),
  role text not null,
  scope text not null,
  status text not null default 'active',
  deleted_at timestamptz
);
create table public.platform_module_migration_checkpoints (
  module_id text not null,
  source_storage_key text not null,
  target_table text not null,
  phase text not null,
  reads_from_database boolean not null,
  writes_to_database boolean not null,
  app_state_fallback_enabled boolean not null,
  owner text not null,
  notes text,
  primary key (module_id, source_storage_key, target_table)
);
create table public.platform_app_state_records (
  organization_id text not null,
  state_key text not null,
  module_id text,
  revision bigint not null,
  value jsonb not null default '{}'::jsonb,
  value_hash text not null,
  removed boolean not null default false,
  primary key (organization_id, state_key)
);
`;

async function createPostgresFixture() {
  const pg = await PGlite.create({
    extensions: { pgcrypto },
    // PostgREST returns PostgreSQL dates as YYYY-MM-DD strings.
    parsers: { 1082: (value) => value },
  });
  await pg.exec(platformBootstrap);
  for (const file of migrationFiles) {
    await pg.exec(await fs.readFile(path.join(rootDir, "supabase/migrations", file), "utf8"));
  }
  return pg;
}

async function seedPlatformAndBaseline(pg, data) {
  await pg.query(
    "insert into auth.users (id, raw_app_meta_data) values ($1, $2::jsonb)",
    [actorId, JSON.stringify({ role: "admin", status: "active" })]
  );
  await pg.query("insert into public.platform_organizations (id) values ($1)", [organizationId]);
  await pg.query(
    "insert into public.platform_teams (id, organization_id) values ($1, $2)",
    [teamId, organizationId]
  );
  await pg.query(
    `insert into public.platform_app_state_records
      (organization_id, state_key, module_id, revision, value, value_hash, removed)
     values ('global', 'football-session-planner-v3', 'session-planner', 42, '{}'::jsonb, $1, false)`,
    [sourceHash]
  );

  const session = data.baselineSnapshot.rows.sessions[0];
  await pg.query(
    `insert into public.session_planner_sessions (
      id, organization_id, team_id, session_date, session_slot, legacy_session_id,
      title, theme, selected_block_legacy_id, schema_version, row_version,
      content, content_hash, created_by, updated_by
    ) values (
      $1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11,
      $12::jsonb, $13, $14, $14
    )`,
    [
      session.id,
      session.organizationId,
      session.teamId,
      session.sessionDate,
      session.sessionSlot,
      session.legacySessionId,
      session.title,
      session.theme,
      session.selectedBlockLegacyId,
      session.schemaVersion,
      session.rowVersion,
      JSON.stringify(session.content),
      session.contentHash,
      actorId,
    ]
  );
}

function createDatabaseDependencies(pg, data) {
  const readTargetSnapshot = async () => {
    const sessions = await pg.query(
      "select * from public.session_planner_sessions order by session_date, id"
    );
    const blocks = await pg.query(
      "select * from public.session_planner_blocks order by session_id, sort_order, id"
    );
    return {
      ok: true,
      sessions: sessions.rows.map(database.mapSessionRow),
      blocks: blocks.rows.map(database.mapBlockRow),
    };
  };
  const executeRpc = async (bundle, confirmation) => {
    const result = await pg.query(
      `select public.execute_session_planner_migration_bundle(
        $1::jsonb, $2::text, 'global'::text, $3::text
      ) as result`,
      [JSON.stringify(bundle), bundle.integrity.contentSha256, confirmation]
    );
    return result.rows[0].result;
  };
  return {
    config: { url: "https://staging-project.supabase.co", serviceRoleKey: "isolated-test" },
    prepareBackfillReview: async () => createPreparedMigration(data),
    storeMigrationRecovery: async ({ recoveryPackage }) =>
      createRecoveryReceipt(recoveryPackage),
    readTargetSnapshot,
    executeRpc,
    nextTimestamp: createDrillTimestamps(),
  };
}

test("Session Planner SQL compiles and executes atomic backfill, rollback and reapply", async () => {
  const pg = await createPostgresFixture();
  try {
    const data = createMigrationFixture();
    const baseOptions = createDrillOptions({
      apply: true,
      confirm: STAGING_DRILL_CONFIRMATION,
    });
    const options = {
      ...baseOptions,
      expectedInitialBundleSha256: createInitialBundleSha256(data, baseOptions),
    };
    await seedPlatformAndBaseline(pg, data);

    const report = await executeSessionPlannerStagingDrill(
      options,
      createDatabaseDependencies(pg, data)
    );
    const sessions = await pg.query(
      "select row_version, archived_at from public.session_planner_sessions order by id"
    );
    const blocks = await pg.query(
      "select row_version, archived_at from public.session_planner_blocks order by id"
    );
    const versions = await pg.query(
      `select action, count(*)::integer as count
         from public.session_planner_record_versions
        group by action order by action`
    );
    const runs = await pg.query(
      `select mode, status, session_count, block_count
         from public.session_planner_migration_runs order by mode`
    );

    expect(report).toMatchObject({
      ok: true,
      ready: true,
      mode: "drill",
      containsCoachingContent: false,
    });
    expect(report.firstApply.projectionSha256).toBe(report.reapply.projectionSha256);
    expect(sessions.rows).toMatchObject([{ row_version: 5, archived_at: null }]);
    expect(blocks.rows).toMatchObject([{ row_version: 3, archived_at: null }]);
    expect(versions.rows).toEqual([
      { action: "archive", count: 1 },
      { action: "insert", count: 2 },
      { action: "restore", count: 1 },
      { action: "update", count: 3 },
    ]);
    expect(runs.rows).toEqual([
      { mode: "backfill", status: "completed", session_count: 1, block_count: 1 },
      { mode: "rollback", status: "completed", session_count: 1, block_count: 1 },
    ]);
    expect(JSON.stringify(report)).not.toContain("Private first-team training");
  } finally {
    await pg.close();
  }
});
