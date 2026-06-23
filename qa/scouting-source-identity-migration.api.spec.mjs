import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const migrationsDir = resolve(projectRoot, "supabase", "migrations");

function readMigrationBySuffix(suffix) {
  const migrationName = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(suffix))
    .sort()
    .pop();
  if (!migrationName) {
    throw new Error(`Missing migration ending with ${suffix}`);
  }
  return {
    migrationName,
    migration: readFileSync(resolve(migrationsDir, migrationName), "utf8"),
  };
}

const sourceIdentity = readMigrationBySuffix("_scouting_source_identity_indexes.sql");
const forwardFix = readMigrationBySuffix("_fix_scouting_source_identity_defaults.sql");

function expectNoRowColumnDefaults(sql) {
  expect(sql).not.toMatch(/alter\s+column\s+\w+\s+set\s+default[^;]*\bid::text/is);
  expect(sql).not.toMatch(/set\s+default\s+encode\s*\(\s*extensions\.digest\s*\(\s*id::text/is);
}

function expectNoStandaloneDropConstraint(sql) {
  const lines = sql.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/^\s*drop\s+constraint\s+if\s+exists/i.test(line)) {
      return;
    }
    expect(lines[index - 1] || "").toMatch(/alter\s+table/i);
  });
}

test("scouting source identity migration has replayable source fields and indexes", () => {
  expect(sourceIdentity.migrationName).toBe("20260514153000_scouting_source_identity_indexes.sql");
  expect(sourceIdentity.migration).toContain("add column if not exists source_system text");
  expect(sourceIdentity.migration).toContain("add column if not exists source_player_id text");
  expect(sourceIdentity.migration).toContain("add column if not exists source_record_id text");
  expect(sourceIdentity.migration).toContain("scouting_players_source_key_idx");
  expect(sourceIdentity.migration).toContain("scouting_player_seasons_source_record_idx");
  expect(sourceIdentity.migration).toContain("scouting_player_seasons_source_player_idx");
});

test("scouting source identity migration avoids invalid replay SQL", () => {
  expectNoRowColumnDefaults(sourceIdentity.migration);
  expectNoStandaloneDropConstraint(sourceIdentity.migration);
  expect(sourceIdentity.migration).not.toMatch(/add\s+constraint\s+if\s+not\s+exists/i);
  expect(sourceIdentity.migration).toContain("alter table public.scouting_players\n  drop constraint if exists scouting_players_sort_name_unique");
  expect(sourceIdentity.migration).toContain("conrelid = 'public.scouting_players'::regclass");
});

test("scouting source identity defaults are row-independent and valid for staging replay", () => {
  const rowIndependentDefault = "set default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex')";
  expect(sourceIdentity.migration.match(new RegExp(rowIndependentDefault.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(3);
});

test("scouting source identity forward fix is idempotent for already-applied environments", () => {
  expect(forwardFix.migrationName).toMatch(/^\d{14}_fix_scouting_source_identity_defaults\.sql$/);
  expectNoRowColumnDefaults(forwardFix.migration);
  expect(forwardFix.migration).toContain("add column if not exists source_system text");
  expect(forwardFix.migration).toContain("add column if not exists source_player_id text");
  expect(forwardFix.migration).toContain("add column if not exists source_record_id text");
  expect(forwardFix.migration).toContain("conrelid = 'public.scouting_players'::regclass");
  expect(forwardFix.migration).toContain("create unique index if not exists scouting_players_source_key_idx");
  expect(forwardFix.migration).toContain("create unique index if not exists scouting_player_seasons_source_record_idx");
  expect(forwardFix.migration).toContain("create index if not exists scouting_player_seasons_source_player_idx");
});

test("scouting source identity forward fix preserves existing source identity before defaults", () => {
  expect(forwardFix.migration).toContain("coalesce(nullif(btrim(source_system), ''), 'file-import')");
  expect(forwardFix.migration).toContain("nullif(btrim(source_player_id), '')");
  expect(forwardFix.migration).toContain("nullif(btrim(source_record_id), '')");
  expect(forwardFix.migration).toContain("nullif(btrim(record_key), '')");
  expect(forwardFix.migration).toContain("alter column source_system set not null");
  expect(forwardFix.migration).toContain("alter column source_player_id set not null");
  expect(forwardFix.migration).toContain("alter column source_record_id set not null");
});
