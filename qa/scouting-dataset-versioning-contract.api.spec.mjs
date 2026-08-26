import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(projectRoot, "supabase/migrations/20260825224516_scouting_dataset_versioning.sql"),
  "utf8"
);
const databaseApi = readFileSync(resolve(projectRoot, "api/_lib/scouting-database.js"), "utf8");

test("Scouting dataset versions preserve immutable sources and staged records", () => {
  for (const table of [
    "scouting_source_artifacts",
    "scouting_dataset_versions",
    "scouting_import_stage_metrics",
    "scouting_import_stage_records",
    "scouting_import_validations",
    "scouting_player_identity_links",
  ]) {
    expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
  }
  expect(migration).toContain("checksum_sha256 text not null");
  expect(migration).toContain("source_artifact_id uuid references public.scouting_source_artifacts");
  expect(migration).toContain("primary key (dataset_version_id, source_system, source_record_id)");
});

test("Scouting import creation and publication are atomic service-only operations", () => {
  expect(migration).toContain("create or replace function public.start_scouting_dataset_import");
  expect(migration).toContain("create or replace function public.validate_scouting_dataset_version");
  expect(migration).toContain("create or replace function public.publish_scouting_dataset_version");
  expect(migration).toContain("grant execute on function public.start_scouting_dataset_import");
  expect(migration).toContain("grant execute on function public.publish_scouting_dataset_version");
  expect(migration).toContain("to service_role");
  expect(migration).toContain("target_version.status <> 'validated'");
  expect(migration).toContain("Scouting dataset version has unresolved validation blockers");
  expect(migration).toContain("where status = 'active'");
  expect(migration).toContain("rollback_from_version_id");
  expect(migration).not.toMatch(/create or replace function public\.[\s\S]{0,220}security definer/i);
});

test("Scouting publication protects retention, metrics, identities and manual references", () => {
  expect(migration).toContain("Incoming data removes more than 35% of the active dataset");
  expect(migration).toContain("League and season coverage is preserved");
  expect(migration).toContain("get_scouting_filter_options");
  expect(migration).toContain("resolve_scouting_player_identity_keys");
  expect(migration).toContain("source_aliases ?| p_identity_keys");
  expect(migration).toContain("set status = 'hidden'");
  expect(migration).toContain("set status = 'inactive'");
  expect(migration).not.toMatch(/delete\s+from\s+public\.scouting_(lists|reports|shadow|targets)/i);
});

test("Scouting source storage is private and upload-scoped to the creating admin", () => {
  expect(migration).toContain("values ('footballscience-scouting-imports', 'footballscience-scouting-imports', false)");
  expect(migration).toContain("file_size_limit = 52428800");
  expect(migration).toContain("artifact.uploaded_by = (select auth.uid())");
  expect(migration).toContain("app_private.can_administer_scouting_data_scope");
});

test("Scouting import support tables carry direct tenant scope", () => {
  for (const table of [
    "scouting_import_stage_metrics",
    "scouting_import_validations",
    "scouting_player_identity_links",
  ]) {
    const tableStart = migration.indexOf(`create table if not exists public.${table}`);
    const tableEnd = migration.indexOf("\n);", tableStart);
    const tableDefinition = migration.slice(tableStart, tableEnd);
    expect(tableDefinition).toContain("organization_id uuid");
    expect(tableDefinition).toContain("team_id uuid");
  }
  expect(migration).toContain("app_private.can_administer_scouting_data_scope(organization_id, team_id)");
  expect(migration).toContain("app_private.can_access_scouting_scope(organization_id, team_id)");
});

test("Scouting API defaults to versioned imports and bounded request payloads", () => {
  expect(databaseApi).toContain('SCOUTING_ALLOW_LEGACY_DIRECT_IMPORT');
  expect(databaseApi).toContain("Direct scouting imports are disabled");
  expect(databaseApi).toContain("SCOUTING_MAX_JSON_BODY_BYTES");
  expect(databaseApi).toContain("resolveScoutingDatasetRecordIdentities");
  expect(databaseApi).toContain('"/rpc/get_scouting_filter_options"');
  expect(databaseApi).not.toContain('limit: "10000"');
});
