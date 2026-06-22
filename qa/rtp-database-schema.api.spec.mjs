import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = fs
  .readdirSync(path.join(rootDir, "supabase", "migrations"))
  .find((entry) => entry.endsWith("_rtp_operating_spine_sprint1.sql"));
const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", migrationName), "utf8");

const rtpTables = [
  "rtp_cases",
  "rtp_medical_clearances",
  "rtp_case_transitions",
  "rtp_audit_events",
];

test("rtp migration creates the operating spine tables only", () => {
  expect(migrationName).toBeTruthy();
  rtpTables.forEach((tableName) => {
    expect(migration).toContain(`create table if not exists public.${tableName}`);
  });

  expect(migration).toContain("lifecycle_status text not null default 'created'");
  expect(migration).toContain("'medical-review'");
  expect(migration).toContain("'performance-restored'");
  expect(migration).toContain("medical_confidence_level text not null default 'low'");
  expect(migration).toContain("clearance_status text not null default 'not-cleared'");
  expect(migration).not.toContain("medical_case_id");
  expect(migration).not.toMatch(/\b(hamstring|acl|meniscus|achilles|concussion)\b/i);
});

test("rtp migration is RLS protected and server-write first", () => {
  rtpTables.forEach((tableName) => {
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).not.toContain(`grant insert on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant update on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant delete on public.${tableName} to authenticated`);
  });

  expect(migration).toContain("app_private.is_rtp_team_member");
  expect(migration).toContain("app_private.can_manage_rtp_team");
  expect(migration).toContain("app_private.can_manage_rtp_medical_team");
  expect(migration).toContain("membership.role in ('admin', 'medical')");
});

test("rtp migration includes audit, lifecycle, and permission matrix foundations", () => {
  expect(migration).toContain("create table if not exists public.rtp_case_transitions");
  expect(migration).toContain("create table if not exists public.rtp_audit_events");
  expect(migration).toContain("contains_private_medical_data boolean not null default false");
  expect(migration).toContain("insert into public.platform_permission_matrix");
  expect(migration).toContain("('rtp', 'read', array['admin','club-admin','team-admin','coach','performance','medical']");
  expect(migration).toContain("('rtp', 'write', array['admin','club-admin','team-admin','performance','medical']");
});

test("rtp migration includes operational indexes for team, player, current clearance, and audit lookups", () => {
  [
    "rtp_cases_team_status_idx",
    "rtp_cases_player_status_idx",
    "rtp_cases_review_idx",
    "rtp_medical_clearances_case_idx",
    "rtp_medical_clearances_player_idx",
    "rtp_medical_clearances_current_unique_idx",
    "rtp_case_transitions_case_created_idx",
    "rtp_audit_events_org_created_idx",
    "rtp_audit_events_case_created_idx",
    "rtp_audit_events_player_created_idx",
  ].forEach((indexName) => {
    expect(migration).toContain(indexName);
  });
});
