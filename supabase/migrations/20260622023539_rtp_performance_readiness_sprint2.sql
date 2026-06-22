-- RTP Build Sprint 2: performance readiness, exposure tracking, and API contracts.
-- Additive and inert: no UI, no AI recommendations, no Matchday integration,
-- no injury profile import, no Medical case linking, no player-plan automation,
-- and no frontend Supabase writes.

create schema if not exists app_private;

create table if not exists public.rtp_performance_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  rtp_case_id uuid not null references public.rtp_cases(id) on delete cascade,
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  assessment_status text not null default 'draft' check (
    assessment_status in ('draft', 'active', 'superseded', 'revoked')
  ),
  readiness_label text not null default 'Progression score – not clearance' check (
    readiness_label = 'Progression score – not clearance'
  ),
  readiness_band text not null default 'insufficient-data' check (
    readiness_band in (
      'insufficient-data',
      'foundation-incomplete',
      'controlled-loading',
      'field-build',
      'training-demand-build',
      'match-demand-candidate'
    )
  ),
  overall_progression_score numeric(5,2) check (
    overall_progression_score is null
    or overall_progression_score between 0 and 100
  ),
  strength_readiness_score numeric(5,2) check (
    strength_readiness_score is null
    or strength_readiness_score between 0 and 100
  ),
  running_readiness_score numeric(5,2) check (
    running_readiness_score is null
    or running_readiness_score between 0 and 100
  ),
  sprint_readiness_score numeric(5,2) check (
    sprint_readiness_score is null
    or sprint_readiness_score between 0 and 100
  ),
  cod_readiness_score numeric(5,2) check (
    cod_readiness_score is null
    or cod_readiness_score between 0 and 100
  ),
  jump_landing_readiness_score numeric(5,2) check (
    jump_landing_readiness_score is null
    or jump_landing_readiness_score between 0 and 100
  ),
  position_demand_readiness_score numeric(5,2) check (
    position_demand_readiness_score is null
    or position_demand_readiness_score between 0 and 100
  ),
  data_completeness text not null default 'insufficient' check (
    data_completeness in ('complete', 'partial', 'insufficient')
  ),
  bottleneck_key text check (bottleneck_key is null or char_length(bottleneck_key) <= 120),
  bottleneck_domain text check (
    bottleneck_domain is null
    or bottleneck_domain in (
      'medical',
      'exposure',
      'sprint',
      'change-of-direction',
      'strength',
      'running',
      'jump-landing',
      'position-demand',
      'match-minutes',
      'data',
      'readiness'
    )
  ),
  bottleneck_severity text check (
    bottleneck_severity is null
    or bottleneck_severity in ('low', 'moderate', 'high', 'critical')
  ),
  coach_safe_bottleneck_summary text check (
    coach_safe_bottleneck_summary is null
    or char_length(coach_safe_bottleneck_summary) <= 500
  ),
  next_required_exposure_summary text check (
    next_required_exposure_summary is null
    or char_length(next_required_exposure_summary) <= 500
  ),
  coach_safe_summary jsonb not null default '{}'::jsonb,
  performance_notes jsonb not null default '{}'::jsonb,
  component_scores jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  baseline_context jsonb not null default '{}'::jsonb,
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  superseded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint rtp_performance_readiness_current_check check (
    superseded_at is null
    or revoked_at is null
    or superseded_at <= revoked_at
  )
);

create table if not exists public.rtp_exposure_events (
  id uuid primary key default gen_random_uuid(),
  rtp_case_id uuid not null references public.rtp_cases(id) on delete cascade,
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  exposure_type text not null check (
    exposure_type in (
      'running',
      'sprint',
      'change-of-direction',
      'jump-landing',
      'strength',
      'football-technical',
      'contact',
      'match-minutes',
      'position-specific',
      'reconditioning',
      'other'
    )
  ),
  exposure_status text not null default 'planned' check (
    exposure_status in ('planned', 'completed', 'modified', 'failed', 'cancelled')
  ),
  exposure_date date not null default current_date,
  duration_minutes numeric(6,2) check (
    duration_minutes is null
    or duration_minutes >= 0
  ),
  total_distance_m numeric(8,2) check (
    total_distance_m is null
    or total_distance_m >= 0
  ),
  high_speed_distance_m numeric(8,2) check (
    high_speed_distance_m is null
    or high_speed_distance_m >= 0
  ),
  sprint_distance_m numeric(8,2) check (
    sprint_distance_m is null
    or sprint_distance_m >= 0
  ),
  sprint_count integer check (
    sprint_count is null
    or sprint_count >= 0
  ),
  acceleration_count integer check (
    acceleration_count is null
    or acceleration_count >= 0
  ),
  deceleration_count integer check (
    deceleration_count is null
    or deceleration_count >= 0
  ),
  peak_speed_percentage numeric(5,2) check (
    peak_speed_percentage is null
    or peak_speed_percentage between 0 and 130
  ),
  rpe numeric(4,2) check (
    rpe is null
    or rpe between 0 and 10
  ),
  coach_safe_summary text check (
    coach_safe_summary is null
    or char_length(coach_safe_summary) <= 500
  ),
  performance_notes jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists rtp_performance_readiness_case_idx
on public.rtp_performance_readiness_snapshots (rtp_case_id, assessed_at desc);

create index if not exists rtp_performance_readiness_team_player_idx
on public.rtp_performance_readiness_snapshots (team_id, player_id, assessed_at desc);

create unique index if not exists rtp_performance_readiness_current_unique_idx
on public.rtp_performance_readiness_snapshots (rtp_case_id)
where superseded_at is null and revoked_at is null;

create index if not exists rtp_exposure_events_case_date_idx
on public.rtp_exposure_events (rtp_case_id, exposure_date desc, exposure_type);

create index if not exists rtp_exposure_events_team_player_date_idx
on public.rtp_exposure_events (team_id, player_id, exposure_date desc);

create index if not exists rtp_exposure_events_type_status_idx
on public.rtp_exposure_events (team_id, exposure_type, exposure_status, exposure_date desc);

create or replace function app_private.can_view_rtp_performance_team(target_team_id uuid)
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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_manage_rtp_performance_team(target_team_id uuid)
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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'performance')
  );
$$;

create trigger rtp_performance_readiness_touch_updated_at
before update on public.rtp_performance_readiness_snapshots
for each row execute function public.rtp_touch_updated_at();

create trigger rtp_exposure_events_touch_updated_at
before update on public.rtp_exposure_events
for each row execute function public.rtp_touch_updated_at();

alter table public.rtp_performance_readiness_snapshots enable row level security;
alter table public.rtp_exposure_events enable row level security;

revoke all on public.rtp_performance_readiness_snapshots from anon, authenticated;
revoke all on public.rtp_exposure_events from anon, authenticated;

grant execute on function app_private.can_view_rtp_performance_team(uuid) to authenticated;
grant execute on function app_private.can_manage_rtp_performance_team(uuid) to authenticated;

create policy "rtp performance readiness is visible to medical and performance owners"
on public.rtp_performance_readiness_snapshots
for select
to authenticated
using (
  app_private.can_view_rtp_performance_team(team_id)
);

create policy "rtp performance readiness is server-managed by performance owners"
on public.rtp_performance_readiness_snapshots
for all
to authenticated
using (
  app_private.can_manage_rtp_performance_team(team_id)
)
with check (
  app_private.can_manage_rtp_performance_team(team_id)
);

create policy "rtp exposure events are visible to medical and performance owners"
on public.rtp_exposure_events
for select
to authenticated
using (
  app_private.can_view_rtp_performance_team(team_id)
);

create policy "rtp exposure events are server-managed by performance owners"
on public.rtp_exposure_events
for all
to authenticated
using (
  app_private.can_manage_rtp_performance_team(team_id)
)
with check (
  app_private.can_manage_rtp_performance_team(team_id)
);
