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

const foundationMigration = readMigrationBySuffix("_video_analysis_metadata_foundation.sql");
const workstationMigration = readMigrationBySuffix("_video_analysis_workstation_v2_metadata.sql");
const forwardFixMigration = readMigrationBySuffix("_fix_video_analysis_trigram_indexes.sql");

test("video analysis foundation migration indexes use schema-qualified gin_trgm_ops", () => {
  expect(foundationMigration.migration).toContain(
    "create index if not exists video_clip_tags_tag_trgm_idx on public.video_clip_tags using gin ((lower(tag)) extensions.gin_trgm_ops);"
  );
  expect(foundationMigration.migration).toContain(
    "create index if not exists video_clip_notes_note_trgm_idx on public.video_clip_notes using gin ((lower(note)) extensions.gin_trgm_ops);"
  );
  expect(foundationMigration.migration.match(/extensions\.gin_trgm_ops/g)?.length).toBe(2);
  expect(foundationMigration.migration).not.toContain(
    "create index if not exists video_clip_tags_tag_trgm_idx on public.video_clip_tags using gin ((lower(tag)) gin_trgm_ops);"
  );
  expect(foundationMigration.migration).not.toContain(
    "create index if not exists video_clip_notes_note_trgm_idx on public.video_clip_notes using gin ((lower(note)) gin_trgm_ops);"
  );
});

test("video analysis workstation migration indexes use schema-qualified gin_trgm_ops", () => {
  expect(workstationMigration.migration).toContain(
    "create index if not exists video_clip_labels_value_trgm_idx on public.video_clip_labels using gin ((lower(label_value)) extensions.gin_trgm_ops);"
  );
  expect(workstationMigration.migration).not.toContain(
    "create index if not exists video_clip_labels_value_trgm_idx on public.video_clip_labels using gin ((lower(label_value)) gin_trgm_ops);"
  );
});

test("video analysis trigram forward-fix migration exists and is idempotent for replay", () => {
  expect(forwardFixMigration.migrationName).toMatch(/^\d{14}_fix_video_analysis_trigram_indexes\.sql$/);
  expect(forwardFixMigration.migration).toContain("create extension if not exists pg_trgm with schema extensions;");
  expect(forwardFixMigration.migration).toContain("alter extension pg_trgm set schema extensions;");
  expect(forwardFixMigration.migration).toContain("to_regclass('public.video_clip_tags') IS NOT NULL");
  expect(forwardFixMigration.migration).toContain("to_regclass('public.video_clip_notes') IS NOT NULL");
  expect(forwardFixMigration.migration).toContain("DROP INDEX IF EXISTS public.video_clip_tags_tag_trgm_idx;");
  expect(forwardFixMigration.migration).toContain("DROP INDEX IF EXISTS public.video_clip_notes_note_trgm_idx;");
  expect(forwardFixMigration.migration).toContain("CREATE INDEX video_clip_tags_tag_trgm_idx");
  expect(forwardFixMigration.migration).toContain("CREATE INDEX video_clip_notes_note_trgm_idx");
  expect(forwardFixMigration.migration).toContain("extensions.gin_trgm_ops");
  expect(forwardFixMigration.migration).toContain("indexdef ILIKE '%extensions.gin_trgm_ops%'");
  expect(forwardFixMigration.migration).toContain("IF NOT EXISTS (");
});
