import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(rootDir, "supabase/migrations/20260621233632_rtp_library_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const allMigrations = fs
  .readdirSync(path.join(rootDir, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => fs.readFileSync(path.join(rootDir, "supabase", "migrations", file), "utf8"))
  .join("\n");

const rtpTables = [
  "rtp_injury_profiles",
  "rtp_profile_sections",
  "rtp_assessment_protocols",
  "rtp_exercises",
  "rtp_profile_exercise_links",
  "rtp_progressions",
  "rtp_progression_steps",
  "rtp_profile_progression_links",
  "rtp_criteria_sets",
  "rtp_criteria_items",
  "rtp_monitoring_metrics",
  "rtp_benchmarks",
  "rtp_research_evidence",
  "rtp_case_studies",
  "rtp_club_notes",
  "rtp_tags",
  "rtp_tag_links",
  "rtp_favorites",
  "rtp_content_versions",
  "rtp_audit_events",
];

test("rtp library schema creates additive team-scoped service-role tables", () => {
  for (const tableName of rtpTables) {
    expect(migration).toContain(`create table if not exists public.${tableName}`);
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${tableName} to service_role`);
  }

  expect(migration).toContain("organization_id text not null");
  expect(migration).toContain("team_id text not null");
  expect(migration).toContain("row_version integer not null default 1");
  expect(migration).toContain("coach_safe_summary text not null default");
  expect(migration).toContain("owner_domain text not null");
  expect(migration).toContain("audience text not null");
});

test("rtp library schema blocks hard deletes and keeps content versioned", () => {
  expect(migration).toContain("app_private.rtp_library_prevent_hard_delete");
  expect(migration).toContain("RTP Library records must be archived or versioned, not hard-deleted.");
  expect(migration).toContain("app_private.rtp_library_touch_updated_at");
  expect(migration).toContain("create table if not exists public.rtp_content_versions");
  expect(migration).toContain("snapshot jsonb not null default '{}'::jsonb");
  expect(migration).toContain("rtp_content_versions_target_idx");
  expect(migration).toContain("rtp_audit_events_scope_created_idx");
});

test("rtp library foundation does not seed injuries or link private athlete data", () => {
  expect(migration).not.toMatch(/insert\s+into\s+public\.rtp_injury_profiles/i);
  expect(migration).not.toMatch(/\b(player_id|medical_case_id|rtp_player_plan|medical_cases|medical_availability|medical_injury_plans)\b/i);
  expect(migration).not.toMatch(/\b(acl|hamstring|concussion|ankle sprain|groin)\b/i);
});

test("rtp library permission seed is registered for the live control plane", () => {
  expect(allMigrations).toContain("('rtp-library', 'read'");
  expect(allMigrations).toContain("('rtp-library', 'write'");
  expect(allMigrations).toContain("('rtp-library', 'admin', array['admin']");
  expect(allMigrations).toContain("('rtp-library', 'observe', array['admin','medical','performance']");
});
