import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(rootDir, "supabase/migrations/20260613000100_video_analysis_metadata_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const workstationMigrationPath = path.join(rootDir, "supabase/migrations/20260614004604_video_analysis_workstation_v2_metadata.sql");
const workstationMigration = fs.readFileSync(workstationMigrationPath, "utf8");
const buttonBehaviorMigrationPath = path.join(rootDir, "supabase/migrations/20260614222541_video_analysis_coding_button_behavior.sql");
const buttonBehaviorMigration = fs.readFileSync(buttonBehaviorMigrationPath, "utf8");
const presentationMigrationPath = path.join(rootDir, "supabase/migrations/20260615035024_video_analysis_presentation_builder_v1.sql");
const presentationMigration = fs.readFileSync(presentationMigrationPath, "utf8");
const smartCollectionSharingMigrationPath = path.join(rootDir, "supabase/migrations/20260615223732_video_analysis_smart_collection_sharing_v2.sql");
const smartCollectionSharingMigration = fs.readFileSync(smartCollectionSharingMigrationPath, "utf8");

test("video analysis schema stores metadata only with millisecond precision", () => {
  for (const tableName of [
    "video_matches",
    "video_videos",
    "video_sources",
    "video_clip_instances",
    "video_clip_players",
    "video_clip_tags",
    "video_clip_notes",
    "video_coding_schemas",
    "video_playlists",
    "video_playlist_items",
  ]) {
    expect(migration).toContain(`create table if not exists public.${tableName}`);
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
  }

  expect(migration).toContain("start_ms integer not null check (start_ms >= 0)");
  expect(migration).toContain("end_ms integer not null check (end_ms > start_ms)");
  expect(migration).toContain("outcome text not null default 'Neutral' check (outcome in ('Positive', 'Development', 'Neutral'))");
  expect(migration).toContain("role text not null default 'primary' check (role in ('primary', 'secondary', 'supporting', 'unit'))");
  expect(migration).toContain("local_video_identifier text not null");
  expect(migration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("video analysis permission seed and hard-delete guard are present", () => {
  expect(migration).toContain("app_private.video_analysis_prevent_hard_delete");
  expect(migration).toContain("Video analysis records must be archived, not hard-deleted.");
  expect(migration).toContain("('video-analysis', 'read'");
  expect(migration).toContain("('video-analysis', 'write'");
  expect(migration).toContain("('video-analysis', 'admin', array['admin']");
  expect(migration).toContain("grant select, insert, update, delete on public.video_clip_instances to service_role");
});

test("video analysis workstation v2 schema adds templates, descriptors, searches, and reviews additively", () => {
  for (const tableName of [
    "video_coding_templates",
    "video_coding_buttons",
    "video_coding_button_links",
    "video_clip_labels",
    "video_clip_descriptors",
    "video_timeline_lanes",
    "video_saved_clip_searches",
    "video_playlist_sections",
    "video_review_sessions",
    "video_clip_revisions",
  ]) {
    expect(workstationMigration).toContain(`create table if not exists public.${tableName}`);
    expect(workstationMigration).toContain(`alter table public.${tableName} enable row level security`);
    expect(workstationMigration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(workstationMigration).toContain(`grant select, insert, update, delete on public.${tableName} to service_role`);
  }

  expect(workstationMigration).toContain("descriptor_type text not null check (descriptor_type in ('player', 'unit', 'pitch_zone', 'pressure', 'decision', 'execution', 'custom'))");
  expect(workstationMigration).toContain("add column if not exists coding_mode text not null default 'manual' check (coding_mode in ('manual', 'instant'))");
  expect(workstationMigration).toContain("add column if not exists section_id uuid references public.video_playlist_sections(id) on delete restrict");
  expect(workstationMigration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("video analysis coding buttons own timing and behavior metadata", () => {
  for (const requiredText of [
    "add column if not exists default_clip_duration_ms integer not null default 15000",
    "alter column default_mode set default 'instant'",
    "add column if not exists group_id text",
    "add column if not exists target_field text",
    "add column if not exists button_behavior text not null default 'create_tag'",
    "add column if not exists creates_clip boolean not null default true",
    "add column if not exists applies_label boolean not null default false",
    "add column if not exists default_duration_ms integer not null default 15000",
    "add column if not exists start_offset_ms integer not null default 0",
    "add column if not exists end_offset_ms integer not null default 15000",
    "video_coding_buttons_template_group_order_idx",
  ]) {
    expect(buttonBehaviorMigration).toContain(requiredText);
  }
  expect(buttonBehaviorMigration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("video analysis presentation builder stores shareable metadata only", () => {
  for (const tableName of [
    "video_presentations",
    "video_presentation_sections",
    "video_presentation_items",
    "video_drawing_layers",
    "video_smart_collections",
    "video_presentation_share_targets",
  ]) {
    expect(presentationMigration).toContain(`create table if not exists public.${tableName}`);
    expect(presentationMigration).toContain(`alter table public.${tableName} enable row level security`);
    expect(presentationMigration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(presentationMigration).toContain(`grant select, insert, update, delete on public.${tableName} to service_role`);
    expect(presentationMigration).toContain(`${tableName}_prevent_hard_delete`);
  }

  expect(presentationMigration).toContain("tool text not null check (tool in ('arrow', 'circle', 'spotlight', 'text', 'freeze', 'zoom'))");
  expect(presentationMigration).toContain("target_type text not null check (target_type in ('team', 'role', 'group', 'player', 'user'))");
  expect(presentationMigration).toContain("access_level text not null default 'view' check (access_level in ('view', 'present', 'edit'))");
  expect(presentationMigration).toContain("video_presentation_items_clip_idx");
  expect(presentationMigration).toContain("video_drawing_layers_clip_time_idx");
  expect(presentationMigration).toContain("video_smart_collections_search_gin_idx");
  expect(presentationMigration).toContain("('video-analysis', 'present'");
  expect(presentationMigration).toContain("('video-analysis', 'share'");
  expect(presentationMigration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});

test("video analysis smart collection sharing stores playlist metadata only", () => {
  expect(smartCollectionSharingMigration).toContain("add column if not exists description text");
  expect(smartCollectionSharingMigration).toContain("add column if not exists visibility text not null default 'coach-analyst'");
  expect(smartCollectionSharingMigration).toContain("add column if not exists sort_mode text not null default 'newest'");
  expect(smartCollectionSharingMigration).toContain("create table if not exists public.video_smart_collection_share_targets");
  expect(smartCollectionSharingMigration).toContain("target_type text not null check (target_type in ('team', 'role', 'group', 'player', 'user'))");
  expect(smartCollectionSharingMigration).toContain("alter table public.video_smart_collection_share_targets enable row level security");
  expect(smartCollectionSharingMigration).toContain("revoke all on public.video_smart_collection_share_targets from anon, authenticated");
  expect(smartCollectionSharingMigration).toContain("grant select, insert, update, delete on public.video_smart_collection_share_targets to service_role");
  expect(smartCollectionSharingMigration).toContain("video_smart_collection_share_targets_prevent_hard_delete");
  expect(smartCollectionSharingMigration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea)\b/i);
});
