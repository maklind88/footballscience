import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(rootDir, "supabase/migrations/20260613000100_video_analysis_metadata_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

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
