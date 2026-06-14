import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(rootDir, "supabase/migrations/20260614163504_idp_player_development_system.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const allMigrations = fs
  .readdirSync(path.join(rootDir, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => fs.readFileSync(path.join(rootDir, "supabase", "migrations", file), "utf8"))
  .join("\n");

const idpTables = [
  "idp_profiles",
  "idp_development_areas",
  "idp_focuses",
  "idp_clip_bank_items",
  "idp_evidence",
  "idp_reviews",
  "idp_next_actions",
  "idp_milestones",
  "idp_staff_ownership",
  "idp_audit_events",
];

test("idp schema creates additive team-scoped tables with RLS and service-role API access", () => {
  for (const tableName of idpTables) {
    expect(migration).toContain(`create table if not exists public.${tableName}`);
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${tableName} to service_role`);
  }

  expect(migration).toContain("organization_id text not null");
  expect(migration).toContain("team_id text not null");
  expect(migration).toContain("player_id text not null");
  expect(migration).toContain("squad_player_id uuid references public.squad_players(id) on delete restrict");
  expect(migration).toContain("clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict");
});

test("idp schema protects data retention and avoids storing raw video or image payloads", () => {
  expect(migration).toContain("app_private.idp_prevent_hard_delete");
  expect(migration).toContain("IDP records must be archived or soft-deleted, not hard-deleted.");
  expect(migration).toContain("deleted_at timestamptz");
  expect(migration).toContain("row_version integer not null default 1");
  expect(migration).toContain("idp_clip_bank_unique_active_clip_idx");
  expect(migration).toContain("idp_next_actions_active_type_idx");
  expect(migration).not.toMatch(/\b(video_path|local_path|file_path|storage_bucket|bucket_id|base64|bytea|data:image)\b/i);
});

test("idp focus and evidence lifecycle values are constrained", () => {
  expect(migration).toContain("status text not null default 'Active' check (status in ('Draft', 'Active', 'Needs Evidence', 'Ready For Review', 'Reviewed', 'Completed', 'Archived'))");
  expect(migration).toContain("evidence_status text not null default 'Needs Evidence' check (evidence_status in ('No Evidence', 'Needs Evidence', 'Has Evidence', 'Ready For Review'))");
  expect(migration).toContain("evidence_type text not null check (evidence_type in ('Video Clip', 'Coach Note', 'Training Observation', 'Match Observation', 'Performance Note', 'Medical Note', 'Leadership Note', 'Player Reflection', 'Review Meeting'))");
  expect(migration).toContain("action_type text not null check (action_type in ('Add Evidence', 'Review Clip Bank', 'Schedule IDP Meeting', 'Update Focus', 'Complete Review', 'Create Next Focus'))");
});

test("idp permission seed is registered for the live control plane", () => {
  expect(allMigrations).toContain("('idp', 'read'");
  expect(allMigrations).toContain("('idp', 'write'");
  expect(allMigrations).toContain("('idp', 'admin', array['admin']");
});
