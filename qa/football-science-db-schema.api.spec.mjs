import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readFsdbMigration() {
  const migrationName = readdirSync(resolve(projectRoot, "supabase", "migrations"))
    .filter((entry) => entry.endsWith("_football_science_db_foundation.sql"))
    .sort()
    .pop();
  if (!migrationName) {
    throw new Error("Missing Football Science DB migration.");
  }
  return readFileSync(resolve(projectRoot, "supabase", "migrations", migrationName), "utf8");
}

test("Football Science DB migration creates the server-first global player foundation", () => {
  const migration = readFsdbMigration();
  const tables = [
    "fsdb_import_batches",
    "fsdb_players",
    "fsdb_player_aliases",
    "fsdb_player_source_links",
    "fsdb_teams",
    "fsdb_competitions",
    "fsdb_roster_entries",
    "fsdb_player_season_stats",
    "fsdb_import_errors",
  ];

  for (const table of tables) {
    expect(migration).toContain(`create table if not exists public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
  }

  expect(migration).toContain("create or replace function app_private.is_fsdb_reader()");
  expect(migration).toContain("create or replace function app_private.is_fsdb_writer()");
  expect(migration).toContain("dedupe_key text");
  expect(migration).toContain("name_quality text not null default 'unknown'");
  expect(migration).toContain("source_link_count integer not null default 0");
  expect(migration).toContain("roster_entry_count integer not null default 0");
  expect(migration).toContain("season_stat_count integer not null default 0");
  expect(migration).toContain("metric_count integer not null default 0");
  expect(migration).toContain("grant select on public.fsdb_players to authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.fsdb_players to service_role");
  expect(migration).toContain("using ((select app_private.is_fsdb_reader()))");
});

test("Football Science DB migration includes scale indexes and hard-delete guards", () => {
  const migration = readFsdbMigration();
  const expectedIndexes = [
    "fsdb_players_search_trgm_idx",
    "fsdb_players_filter_idx",
    "fsdb_players_cursor_idx",
    "fsdb_players_dedupe_key_unique_idx",
    "fsdb_players_readiness_idx",
    "fsdb_player_aliases_search_trgm_idx",
    "fsdb_player_source_links_source_idx",
    "fsdb_roster_entries_player_idx",
    "fsdb_player_season_stats_metrics_gin_idx",
  ];

  for (const indexName of expectedIndexes) {
    expect(migration).toContain(indexName);
  }

  expect(migration).toContain("fsdb_prevent_hard_delete");
  expect(migration).toContain("fsdb_players_prevent_hard_delete");
  expect(migration).toContain("fsdb_player_season_stats_metric_count");
  expect(migration).toContain("gender_segment in ('women', 'men', 'mixed', 'unknown')");
  expect(migration).toContain("unique (source_system, source_entity_id)");
});
