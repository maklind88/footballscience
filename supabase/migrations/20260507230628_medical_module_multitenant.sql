-- Football Science Medical Room: clinical data foundation.
-- The current UI continues to use /api/app-state while this schema prepares a
-- production-grade server-owned medical store with RLS and coach-safe read paths.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

create schema if not exists app_private;

create or replace function app_private.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

create or replace function app_private.is_medical_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_medical_practitioner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'medical', 'performance');
$$;

create or replace function app_private.is_medical_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() = 'admin';
$$;

create table if not exists public.medical_governance_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  data_level text not null default 'private-medical' check (data_level = 'private-medical'),
  coach_share_boundary text not null default 'availability-approved-note' check (coach_share_boundary = 'availability-approved-note'),
  consent_required boolean not null default true,
  retention_months integer not null default 24 check (retention_months between 1 and 120),
  review_cadence_days integer not null default 30 check (review_cadence_days between 1 and 90),
  last_reviewed_on date,
  policy_owner text not null default 'Medical Lead' check (char_length(policy_owner) between 2 and 120),
  incident_contact text not null default 'Admin' check (char_length(incident_contact) between 2 and 180),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id)
);

create table if not exists public.medical_player_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  consent_type text not null default 'medical-availability' check (consent_type in ('medical-availability', 'rehab-data', 'wellness-data', 'performance-medical-share')),
  status text not null default 'required' check (status in ('required', 'granted', 'declined', 'withdrawn', 'expired', 'not-required')),
  valid_from date,
  valid_until date,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, player_id, consent_type),
  constraint medical_player_consents_dates_check check (
    valid_from is null or valid_until is null or valid_from <= valid_until
  )
);

create table if not exists public.medical_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  case_type text not null default 'injury' check (case_type in ('injury', 'illness', 'load-management', 'return-to-play', 'other')),
  status text not null default 'open' check (status in ('open', 'monitoring', 'cleared', 'closed', 'archived')),
  privacy_level text not null default 'medical' check (privacy_level in ('medical', 'restricted')),
  injury_type text check (injury_type is null or char_length(injury_type) <= 160),
  body_area text check (body_area is null or char_length(body_area) <= 120),
  diagnosis_summary text check (diagnosis_summary is null or char_length(diagnosis_summary) <= 1200),
  opened_on date not null default current_date,
  closed_on date,
  review_on date,
  rtp_phase text not null default 'medical-restriction' check (rtp_phase in ('medical-restriction', 'rehab', 'modified-team', 'full-training', 'match-available')),
  coach_note text check (coach_note is null or char_length(coach_note) <= 500),
  share_with_coach boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint medical_cases_dates_check check (
    closed_on is null or opened_on <= closed_on
  )
);

create table if not exists public.medical_availability_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  medical_case_id uuid references public.medical_cases(id) on delete set null,
  recommendation_date date not null,
  status text not null check (status in ('full', 'modified', 'controlled', 'rehab', 'unavailable', 'monitor')),
  recommended_participation integer not null check (recommended_participation in (0, 10, 25, 50, 75, 100)),
  actual_participation integer check (actual_participation is null or actual_participation in (0, 10, 25, 50, 75, 100)),
  rtp_phase text not null check (rtp_phase in ('medical-restriction', 'rehab', 'modified-team', 'full-training', 'match-available')),
  source text not null default 'manual' check (source in ('manual', 'availability-plan', 'integration', 'system')),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  coach_note text check (coach_note is null or char_length(coach_note) <= 500),
  share_with_coach boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, player_id, recommendation_date, source, medical_case_id)
);

create table if not exists public.medical_availability_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  medical_case_id uuid references public.medical_cases(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  status text not null check (status in ('full', 'modified', 'controlled', 'rehab', 'unavailable', 'monitor')),
  recommended_participation integer not null check (recommended_participation in (0, 10, 25, 50, 75, 100)),
  rtp_phase text not null check (rtp_phase in ('medical-restriction', 'rehab', 'modified-team', 'full-training', 'match-available')),
  review_on date,
  phase_note text check (phase_note is null or char_length(phase_note) <= 1200),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  coach_note text check (coach_note is null or char_length(coach_note) <= 500),
  share_with_coach boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint medical_availability_plans_dates_check check (starts_on <= ends_on)
);

create table if not exists public.medical_clearance_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  medical_case_id uuid references public.medical_cases(id) on delete cascade,
  availability_plan_id uuid references public.medical_availability_plans(id) on delete cascade,
  role text not null check (role in ('doctor', 'physio', 'performance')),
  status text not null default 'pending' check (status in ('pending', 'signed-off', 'blocked', 'revoked')),
  signed_by uuid references auth.users(id) on delete set null,
  signed_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint medical_clearance_parent_check check (
    medical_case_id is not null or availability_plan_id is not null
  )
);

create table if not exists public.medical_load_gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  medical_case_id uuid references public.medical_cases(id) on delete cascade,
  availability_plan_id uuid references public.medical_availability_plans(id) on delete cascade,
  gate_type text not null check (gate_type in ('strength', 'gps-load', 'pain-response', 'wellness', 'psychological-readiness')),
  status text not null default 'pending' check (status in ('pending', 'pass', 'monitor', 'fail')),
  measured_on date,
  value jsonb not null default '{}'::jsonb,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint medical_load_gate_parent_check check (
    medical_case_id is not null or availability_plan_id is not null
  )
);

create table if not exists public.medical_review_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  medical_case_id uuid references public.medical_cases(id) on delete cascade,
  availability_plan_id uuid references public.medical_availability_plans(id) on delete cascade,
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled', 'overdue')),
  assigned_to uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.medical_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete cascade,
  team_id uuid references public.squad_teams(id) on delete set null,
  player_id uuid references public.squad_players(id) on delete set null,
  medical_case_id uuid references public.medical_cases(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  actor_id uuid references auth.users(id) on delete set null,
  coach_safe boolean not null default false,
  destructive boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.medical_state_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  source_key text not null default 'football-medical-team-v1',
  event_type text not null check (
    event_type in (
      'state-snapshot',
      'recommendation-saved',
      'bulk-recommendation-saved',
      'availability-plan-created',
      'availability-plan-deleted',
      'clearance-saved',
      'governance-saved',
      'player-profile-saved',
      'players-imported',
      'player-added',
      'player-removed',
      'record-deleted'
    )
  ),
  legacy_player_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  actor_id uuid references auth.users(id) on delete set null,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (source_key, idempotency_key)
);

create index if not exists medical_policies_team_idx on public.medical_governance_policies (team_id, updated_at desc);
create index if not exists medical_consents_player_idx on public.medical_player_consents (player_id, status, consent_type);
create index if not exists medical_cases_player_status_idx on public.medical_cases (player_id, status, opened_on desc);
create index if not exists medical_cases_team_review_idx on public.medical_cases (team_id, review_on, status) where status in ('open', 'monitoring');
create index if not exists medical_recommendations_team_date_idx on public.medical_availability_recommendations (team_id, recommendation_date, recommended_participation, status) where deleted_at is null;
create index if not exists medical_recommendations_player_date_idx on public.medical_availability_recommendations (player_id, recommendation_date desc) where deleted_at is null;
create index if not exists medical_recommendations_coach_safe_idx on public.medical_availability_recommendations (team_id, recommendation_date, share_with_coach) where deleted_at is null;
create index if not exists medical_plans_player_dates_idx on public.medical_availability_plans (player_id, starts_on, ends_on) where archived_at is null;
create index if not exists medical_plans_team_review_idx on public.medical_availability_plans (team_id, review_on, rtp_phase) where archived_at is null;
create index if not exists medical_signoffs_case_role_idx on public.medical_clearance_signoffs (medical_case_id, role, status);
create index if not exists medical_signoffs_plan_role_idx on public.medical_clearance_signoffs (availability_plan_id, role, status);
create index if not exists medical_load_gates_case_type_idx on public.medical_load_gates (medical_case_id, gate_type, status);
create index if not exists medical_load_gates_plan_type_idx on public.medical_load_gates (availability_plan_id, gate_type, status);
create index if not exists medical_review_tasks_team_due_idx on public.medical_review_tasks (team_id, due_on, status);
create index if not exists medical_audit_events_org_created_idx on public.medical_audit_events (organization_id, created_at desc);
create index if not exists medical_audit_events_player_created_idx on public.medical_audit_events (player_id, created_at desc);
create index if not exists medical_state_sync_events_status_created_idx on public.medical_state_sync_events (processing_status, created_at desc);
create index if not exists medical_state_sync_events_actor_created_idx on public.medical_state_sync_events (actor_id, created_at desc);
create index if not exists medical_state_sync_events_legacy_player_idx on public.medical_state_sync_events (legacy_player_id, created_at desc);

create or replace function app_private.is_medical_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_view_private_medical_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'medical', 'performance')
  );
$$;

create or replace function app_private.can_manage_medical_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'medical', 'performance')
  );
$$;

create or replace function public.medical_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger medical_governance_policies_touch_updated_at
before update on public.medical_governance_policies
for each row execute function public.medical_touch_updated_at();

create trigger medical_cases_touch_updated_at
before update on public.medical_cases
for each row execute function public.medical_touch_updated_at();

create trigger medical_availability_recommendations_touch_updated_at
before update on public.medical_availability_recommendations
for each row execute function public.medical_touch_updated_at();

create trigger medical_availability_plans_touch_updated_at
before update on public.medical_availability_plans
for each row execute function public.medical_touch_updated_at();

create trigger medical_clearance_signoffs_touch_updated_at
before update on public.medical_clearance_signoffs
for each row execute function public.medical_touch_updated_at();

create trigger medical_load_gates_touch_updated_at
before update on public.medical_load_gates
for each row execute function public.medical_touch_updated_at();

create trigger medical_review_tasks_touch_updated_at
before update on public.medical_review_tasks
for each row execute function public.medical_touch_updated_at();

create or replace view public.medical_coach_availability
with (security_invoker = true)
as
select
  recommendation.id,
  recommendation.organization_id,
  recommendation.team_id,
  recommendation.season_id,
  recommendation.player_id,
  recommendation.roster_membership_id,
  recommendation.recommendation_date,
  recommendation.status,
  recommendation.recommended_participation,
  recommendation.rtp_phase,
  case when recommendation.share_with_coach then recommendation.coach_note else null end as coach_note,
  recommendation.share_with_coach,
  recommendation.source,
  recommendation.created_at,
  recommendation.updated_at
from public.medical_availability_recommendations recommendation
where recommendation.deleted_at is null;

create or replace view public.medical_coach_availability_plans
with (security_invoker = true)
as
select
  plan.id,
  plan.organization_id,
  plan.team_id,
  plan.season_id,
  plan.player_id,
  plan.roster_membership_id,
  plan.starts_on,
  plan.ends_on,
  plan.status,
  plan.recommended_participation,
  plan.rtp_phase,
  case when plan.share_with_coach then plan.coach_note else null end as coach_note,
  plan.share_with_coach,
  plan.created_at,
  plan.updated_at
from public.medical_availability_plans plan
where plan.archived_at is null;

alter table public.medical_governance_policies enable row level security;
alter table public.medical_player_consents enable row level security;
alter table public.medical_cases enable row level security;
alter table public.medical_availability_recommendations enable row level security;
alter table public.medical_availability_plans enable row level security;
alter table public.medical_clearance_signoffs enable row level security;
alter table public.medical_load_gates enable row level security;
alter table public.medical_review_tasks enable row level security;
alter table public.medical_audit_events enable row level security;
alter table public.medical_state_sync_events enable row level security;

revoke all on public.medical_governance_policies from anon, authenticated;
revoke all on public.medical_player_consents from anon, authenticated;
revoke all on public.medical_cases from anon, authenticated;
revoke all on public.medical_availability_recommendations from anon, authenticated;
revoke all on public.medical_availability_plans from anon, authenticated;
revoke all on public.medical_clearance_signoffs from anon, authenticated;
revoke all on public.medical_load_gates from anon, authenticated;
revoke all on public.medical_review_tasks from anon, authenticated;
revoke all on public.medical_audit_events from anon, authenticated;
revoke all on public.medical_state_sync_events from anon, authenticated;
revoke all on public.medical_coach_availability from anon, authenticated;
revoke all on public.medical_coach_availability_plans from anon, authenticated;

grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

grant select (
  id,
  organization_id,
  team_id,
  season_id,
  player_id,
  roster_membership_id,
  recommendation_date,
  status,
  recommended_participation,
  rtp_phase,
  coach_note,
  share_with_coach,
  source,
  created_at,
  updated_at
) on public.medical_availability_recommendations to authenticated;

grant select (
  id,
  organization_id,
  team_id,
  season_id,
  player_id,
  roster_membership_id,
  starts_on,
  ends_on,
  status,
  recommended_participation,
  rtp_phase,
  coach_note,
  share_with_coach,
  created_at,
  updated_at
) on public.medical_availability_plans to authenticated;

grant select on public.medical_coach_availability to authenticated;
grant select on public.medical_coach_availability_plans to authenticated;

create policy "medical recommendations are coach-safe visible to team staff"
on public.medical_availability_recommendations
for select
to authenticated
using (
  deleted_at is null
  and app_private.is_medical_staff()
  and app_private.is_medical_team_member(team_id)
);

create policy "medical plans are coach-safe visible to team staff"
on public.medical_availability_plans
for select
to authenticated
using (
  archived_at is null
  and app_private.is_medical_staff()
  and app_private.is_medical_team_member(team_id)
);

create policy "medical governance is private medical visible"
on public.medical_governance_policies
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical consents are private medical visible"
on public.medical_player_consents
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical cases are private medical visible"
on public.medical_cases
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical clearance is private medical visible"
on public.medical_clearance_signoffs
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical load gates are private medical visible"
on public.medical_load_gates
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical review tasks are private medical visible"
on public.medical_review_tasks
for select
to authenticated
using (
  app_private.can_view_private_medical_team(team_id)
);

create policy "medical audit events are admin visible"
on public.medical_audit_events
for select
to authenticated
using (
  app_private.is_medical_admin()
  and (
    team_id is null
    or app_private.can_view_private_medical_team(team_id)
  )
);
