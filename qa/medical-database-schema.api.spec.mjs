import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260507230628_medical_module_multitenant.sql"),
  "utf8"
);

const coreTables = [
  "medical_governance_policies",
  "medical_player_consents",
  "medical_cases",
  "medical_availability_recommendations",
  "medical_availability_plans",
  "medical_clearance_signoffs",
  "medical_load_gates",
  "medical_review_tasks",
  "medical_audit_events",
  "medical_state_sync_events",
];

test("medical database migration includes the clinical core model", () => {
  coreTables.forEach((tableName) => {
    expect(migration).toContain(`public.${tableName}`);
  });

  expect(migration).toContain("team_id uuid not null references public.squad_teams");
  expect(migration).toContain("player_id uuid not null references public.squad_players");
  expect(migration).toContain("recommended_participation integer not null check (recommended_participation in (0, 10, 25, 50, 75, 100))");
  expect(migration).toContain("rtp_phase text not null");
  expect(migration).toContain("role text not null check (role in ('doctor', 'physio', 'performance'))");
  expect(migration).toContain("gate_type text not null check (gate_type in ('strength', 'gps-load', 'pain-response', 'wellness', 'psychological-readiness'))");
  expect(migration).toContain("unique (source_key, idempotency_key)");
});

test("medical database migration is server-write first and RLS protected", () => {
  coreTables.forEach((tableName) => {
    expect(migration).toContain(`alter table public.${tableName} enable row level security`);
    expect(migration).toContain(`revoke all on public.${tableName} from anon, authenticated`);
    expect(migration).not.toContain(`grant insert on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant update on public.${tableName} to authenticated`);
    expect(migration).not.toContain(`grant delete on public.${tableName} to authenticated`);
  });

  expect(migration).toContain("app_private.can_view_private_medical_team");
  expect(migration).toContain("app_private.is_medical_practitioner()");
});

test("medical database migration exposes only coach-safe availability columns", () => {
  expect(migration).toContain("create or replace view public.medical_coach_availability");
  expect(migration).toContain("with (security_invoker = true)");
  expect(migration).toContain("create or replace view public.medical_coach_availability_plans");
  expect(migration).toContain("grant select on public.medical_coach_availability to authenticated");
  expect(migration).toContain("grant select on public.medical_coach_availability_plans to authenticated");
  expect(migration).toContain("grant select (\n  id,\n  organization_id,\n  team_id");
  expect(migration).not.toContain("grant select (\n  internal_note");
  expect(migration).not.toContain("grant select (\n  diagnosis_summary");
  expect(migration).not.toContain("grant select (\n  body_area");
  expect(migration).not.toContain("grant select on public.medical_cases to authenticated");
  expect(migration).not.toContain("grant select on public.medical_player_consents to authenticated");
  expect(migration).not.toContain("grant select on public.medical_governance_policies to authenticated");
});

test("medical database migration uses app metadata and excludes guest from staff access", () => {
  expect(migration).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
  expect(migration).not.toContain("user_metadata");
  expect(migration).toContain("'admin', 'coach', 'analyst', 'performance', 'medical'");
  expect(migration).not.toContain("'admin', 'coach', 'analyst', 'performance', 'medical', 'guest'");
  expect(migration).toContain("membership.role in ('admin', 'medical', 'performance')");
});

test("medical database migration includes operational indexes", () => {
  [
    "medical_recommendations_team_date_idx",
    "medical_recommendations_player_date_idx",
    "medical_recommendations_coach_safe_idx",
    "medical_plans_player_dates_idx",
    "medical_plans_team_review_idx",
    "medical_signoffs_case_role_idx",
    "medical_load_gates_case_type_idx",
    "medical_review_tasks_team_due_idx",
    "medical_audit_events_player_created_idx",
    "medical_state_sync_events_status_created_idx",
    "medical_state_sync_events_actor_created_idx",
    "medical_state_sync_events_legacy_player_idx",
  ].forEach((requiredText) => {
    expect(migration).toContain(requiredText);
  });
});

test("medical database migration keeps sync inbox server-only", () => {
  expect(migration).toContain("create table if not exists public.medical_state_sync_events");
  expect(migration).toContain("payload jsonb not null default '{}'::jsonb");
  expect(migration).toContain("payload_hash text not null");
  expect(migration).toContain("processing_status text not null default 'pending'");
  expect(migration).toContain("alter table public.medical_state_sync_events enable row level security");
  expect(migration).toContain("revoke all on public.medical_state_sync_events from anon, authenticated");
  expect(migration).not.toContain("grant select on public.medical_state_sync_events to authenticated");
  expect(migration).not.toContain("grant insert on public.medical_state_sync_events to authenticated");
});
