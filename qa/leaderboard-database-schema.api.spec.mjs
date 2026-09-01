import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
  .find((name) => name.endsWith("_leaderboard_foundation.sql"));
const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", migrationName), "utf8");
const coachIdentityRepairName = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
  .find((name) => name.endsWith("_leaderboard_active_coach_identity_repair.sql"));
const coachIdentityRepair = fs.readFileSync(
  path.join(rootDir, "supabase", "migrations", coachIdentityRepairName),
  "utf8"
);
const staffIdentityRepairName = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
  .find((name) => name.endsWith("_leaderboard_active_staff_identity_repair.sql"));
const staffIdentityRepair = fs.readFileSync(
  path.join(rootDir, "supabase", "migrations", staffIdentityRepairName),
  "utf8"
);

function functionSql(functionName, nextFunctionName) {
  const start = migration.indexOf(`create or replace function public.${functionName}`);
  const end = migration.indexOf(`create or replace function public.${nextFunctionName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

const tables = [
  "leaderboard_competitions",
  "leaderboard_participants",
  "leaderboard_scoring_events",
  "leaderboard_point_transactions",
  "leaderboard_audit_events",
];

test("Leaderboard migration is CLI-named, modular-sized, and owns the full ledger", () => {
  expect(migrationName).toMatch(/^\d{14}_leaderboard_foundation\.sql$/);
  expect(migration.split("\n").length).toBeLessThan(500);
  for (const table of tables) expect(migration).toContain(`create table public.${table}`);
  expect(migration).toContain("rank() over (order by points desc)");
  expect(migration).toContain("award_player_id uuid;");
  expect(migration).toContain("award_participant_id uuid;");
  expect(migration).not.toMatch(/\n\s+player_id uuid;/);
  expect(migration).not.toMatch(/\n\s+participant_id uuid;/);
  expect(migration).not.toMatch(/\btotal_points\s+(integer|bigint|numeric)/i);
});

test("tenant identity is locked through composite foreign keys", () => {
  expect(migration).toContain("leaderboard_competitions_platform_team_fk");
  expect(migration).toContain("foreign key (team_id, organization_id)");
  expect(migration).toContain("leaderboard_competitions_squad_team_fk");
  expect(migration).toContain("leaderboard_participants_roster_fk");
  expect(migration).toContain("foreign key (squad_roster_membership_id, squad_organization_id, squad_team_id, squad_player_id)");
  expect(migration).toContain("leaderboard_point_transactions_event_fk");
  expect(migration).toContain("leaderboard_point_transactions_participant_fk");
  expect(migration).toContain("leaderboard_point_transactions_reversal_fk");
  expect(migration).toContain("foreign key (reverses_transaction_id, event_id, participant_id, competition_id, organization_id, team_id)");
});

test("every Leaderboard table has RLS and no browser grants", () => {
  for (const table of tables) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  }
  expect(migration).toContain("from public, anon, authenticated, service_role");
  expect(migration).toContain("grant select, insert on public.leaderboard_point_transactions, public.leaderboard_audit_events to service_role");
  expect(migration).toContain("grant select on public.platform_memberships, public.platform_teams, public.squad_roster_memberships, public.squad_players, public.platform_user_profiles to service_role");
  expect(migration).not.toMatch(/grant [^;]*(delete|truncate|references|trigger|maintain)[^;]*to service_role/i);
  expect(migration).not.toMatch(/grant [^;]*to service_role with grant option/i);
  expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|truncate|references|trigger|maintain)\s*\([^)]/i);
  expect(migration).not.toContain("to authenticated;");
});

test("RPCs are atomic, idempotent, service-only, and invoker-safe", () => {
  expect(migration).toContain("function public.leaderboard_award_batch");
  expect(migration).toContain("function public.leaderboard_reverse_event");
  expect(migration).toContain("function public.leaderboard_month_snapshot");
  expect(migration.match(/security invoker/g)?.length).toBe(4);
  expect(migration).not.toContain("security definer");
  expect(migration).toContain("on conflict (team_id, month_start) do nothing");
  expect(migration).toContain("request_hash <> p_request_hash");
  expect(migration).toContain("reversal_request_hash <> p_request_hash");
  expect(migration).toContain("reversal_request_hash = p_request_hash");
  expect(migration.match(/Invalid request hash\./g)?.length).toBe(2);
  expect(migration).toContain("reverses_transaction_id");
  expect(migration.match(/grant execute on function/g)?.length).toBe(4);
  expect(migration).toContain("grant execute on function public.leaderboard_award_batch");
  expect(migration).toContain("app_private.leaderboard_guard_event_update() from public, anon, authenticated, service_role");
  expect(migration.match(/from public, anon, authenticated, service_role/g)?.length).toBe(6);
  expect(migration).not.toMatch(/alter (table|function) [^;]* owner to service_role/i);
});

test("validated idempotent retries replay before month and competition write gates", () => {
  const awardRpc = functionSql("leaderboard_award_batch", "leaderboard_reverse_event");
  const awardReplay = awardRpc.indexOf("if found then");
  expect(awardRpc.indexOf("leaderboard_actor_has_role")).toBeLessThan(awardReplay);
  expect(awardRpc.indexOf("Awards must be a JSON array.")).toBeLessThan(awardReplay);
  expect(awardRpc.indexOf("Competition tenant mapping mismatch.")).toBeLessThan(awardReplay);
  expect(awardRpc.indexOf("Invalid award payload.")).toBeLessThan(awardReplay);
  expect(awardRpc.indexOf("Award player is not an active mapped team roster member.")).toBeLessThan(awardReplay);
  expect(awardRpc).toContain("Invalid award payload.' using errcode = '22023'");
  expect(awardRpc).toContain("Award player is not an active mapped team roster member.' using errcode = '42501'");
  expect(awardRpc.indexOf("Historical Leaderboard months are read-only.")).toBeGreaterThan(awardReplay);
  expect(awardRpc.indexOf("Competition is not open for scoring.")).toBeGreaterThan(awardReplay);

  const reverseRpc = functionSql("leaderboard_reverse_event", "leaderboard_month_snapshot");
  const reverseReplay = reverseRpc.indexOf("if scoring_event.status = 'reversed' then");
  expect(reverseRpc.indexOf("leaderboard_actor_has_role")).toBeLessThan(reverseReplay);
  expect(reverseRpc.indexOf("Scoring event was not found in this team.")).toBeLessThan(reverseReplay);
  expect(reverseRpc.indexOf("Historical Leaderboard months are read-only.")).toBeGreaterThan(reverseReplay);
  expect(reverseRpc.indexOf("Competition is not open.")).toBeGreaterThan(reverseReplay);
});

test("historical months are consistently read-only and reported completed", () => {
  expect(migration.match(/Historical Leaderboard months are read-only\./g)?.length).toBe(2);
  expect(migration).toContain("competition.month_start <> date_trunc('month', current_timestamp at time zone 'UTC')::date");
  expect(migration).toContain("competition.month_start < date_trunc('month', current_timestamp at time zone 'UTC')::date then 'completed'");
  expect(migration).toContain("p_month_start <> date_trunc('month', current_timestamp at time zone 'UTC')::date");
  expect(migration).not.toContain("current_date");
});

test("database scoring dates are pinned to UTC independently of the PostgreSQL session timezone", () => {
  expect(migration).toContain("timezone text not null default 'UTC' check (timezone = 'UTC')");
  expect(migration).toContain("p_timezone is distinct from 'UTC'");
  expect(migration).toContain("p_occurred_on > (current_timestamp at time zone 'UTC')::date");
  expect(migration.match(/current_timestamp at time zone 'UTC'/g)?.length).toBeGreaterThanOrEqual(4);
});

test("every read and write rechecks fresh server-side membership scope", () => {
  expect(migration).toContain("app_private.leaderboard_actor_has_role");
  expect(migration).toContain("from platform_memberships membership");
  expect(migration).toContain("membership.deleted_at is null");
  expect(migration).toContain("membership.role = any(p_roles)");
  expect(migration.match(/app_private\.leaderboard_actor_has_role\(/g)?.length).toBeGreaterThanOrEqual(6);
  expect(migration).toContain("p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_month_start date");
});

test("event read model exposes safe actor and immutable award snapshots", () => {
  expect(migration).toContain("'createdByName', coalesce(nullif(creator.display_name, ''), 'Staff member')");
  expect(migration).toContain("'awards', coalesce(activity.awards, '[]'::jsonb)");
  expect(migration).toContain("'playerId', participant.player_source_key, 'playerName', participant.display_name_snapshot");
  expect(migration).toContain("'points', tx.points_delta, 'placement', tx.placement");
  expect(migration).not.toContain("creator.email");
  expect(migration).not.toContain("'playerDatabaseId'");
});

test("point, participant snapshot, and audit history cannot be mutated", () => {
  expect(migration).toContain("leaderboard_block_append_only_mutation");
  expect(migration).toContain("leaderboard_participants_append_only before update or delete");
  expect(migration).toContain("leaderboard_point_transactions_append_only before update or delete");
  expect(migration).toContain("leaderboard_audit_events_append_only before update or delete");
  expect(migration).toContain("Scoring events are immutable except for one audited reversal");
  expect(migration).toContain("Hard delete is disabled for Leaderboard records");
});

test("database permission seed mirrors the guarded API contract", () => {
  expect(migration).toContain("('leaderboard', 'read'");
  expect(migration).toContain("'club-admin','team-admin','coach','scout','analyst','performance','medical'");
  expect(migration).not.toContain("('leaderboard', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical','guest']");
  expect(migration).toContain("('leaderboard', 'write', array['admin','club-admin','team-admin','coach']");
  expect(migration).toContain("requires_team_scope");
});

test("active coach identity repair is production-targeted, role-safe, exact, and retryable", () => {
  expect(coachIdentityRepairName).toMatch(/^\d{14}_leaderboard_active_coach_identity_repair\.sql$/);
  const coachIdentityRepairVersion = coachIdentityRepairName.match(/^(\d{14})_leaderboard_active_coach_identity_repair\.sql$/)?.[1];
  expect(coachIdentityRepair).toContain("leaderboard-live-qa-activation");
  expect(coachIdentityRepair).toContain("raw_app_meta_data ->> 'role'");
  expect(coachIdentityRepair).toContain("raw_app_meta_data ->> 'status'");
  expect(coachIdentityRepair).toContain("'roleSource', 'app_metadata'");
  expect(coachIdentityRepairVersion).toBeTruthy();
  expect(coachIdentityRepair).toContain(`'migration', '${coachIdentityRepairVersion}'`);
  expect(coachIdentityRepair).toContain("reviewed 7/1/6 precondition changed");
  expect(coachIdentityRepair).toContain("all seven active coaches are already canonical; no-op");
  expect(coachIdentityRepair).toContain("expected six new profiles");
  expect(coachIdentityRepair).toContain("expected six new memberships");
  expect(coachIdentityRepair).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  expect(coachIdentityRepair).not.toContain("raw_user_meta_data ->> 'role'");
});

test("active staff identity repair completes the reviewed team scope without trusting user roles", () => {
  expect(staffIdentityRepairName).toMatch(/^[0-9]{14}_leaderboard_active_staff_identity_repair\.sql$/);
  const version = staffIdentityRepairName.match(/^([0-9]{14})_leaderboard_active_staff_identity_repair\.sql$/)?.[1];
  expect(staffIdentityRepair).toContain("leaderboard-live-qa-activation");
  expect(staffIdentityRepair).toContain("raw_app_meta_data ->> 'role'");
  expect(staffIdentityRepair).toContain("raw_app_meta_data ->> 'status'");
  expect(staffIdentityRepair).toContain("'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'");
  expect(staffIdentityRepair).toContain("reviewed 20/19/1 role population changed");
  expect(staffIdentityRepair).toContain("reviewed 20/7/13 identity precondition changed");
  expect(staffIdentityRepair).toContain("all twenty active staff are already canonical; no-op");
  expect(staffIdentityRepair).toContain("expected thirteen new profiles");
  expect(staffIdentityRepair).toContain("expected thirteen new memberships");
  expect(staffIdentityRepair).toContain("membership.role = 'admin' and membership.scope = 'organization'");
  expect(staffIdentityRepair).toContain("membership.role not in ('admin','club-admin') and membership.scope = 'team'");
  expect(staffIdentityRepair).toContain("'roleSource', 'app_metadata'");
  expect(version).toBeTruthy();
  expect(staffIdentityRepair).toContain(`'migration', '${version}'`);
  expect(staffIdentityRepair).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  expect(staffIdentityRepair).not.toContain("raw_user_meta_data ->> 'role'");
});
