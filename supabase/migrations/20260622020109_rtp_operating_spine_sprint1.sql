-- RTP Library Sprint 1: operating spine foundation.
-- This is additive and inert: no injury content, no player-plan automation,
-- no Medical case linking, and no frontend Supabase writes.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

create schema if not exists app_private;

create table if not exists public.rtp_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  lifecycle_status text not null default 'created' check (
    lifecycle_status in (
      'created',
      'medical-review',
      'active-rtp',
      'training-available',
      'match-available',
      'performance-restored',
      'closed'
    )
  ),
  public_label text check (public_label is null or char_length(public_label) <= 160),
  case_origin text not null default 'manual' check (case_origin in ('manual', 'medical', 'performance', 'system')),
  opened_on date not null default current_date,
  next_review_on date,
  training_available_on date,
  match_available_on date,
  performance_restored_on date,
  closed_on date,
  closed_reason text check (closed_reason is null or char_length(closed_reason) <= 240),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint rtp_cases_closed_on_check check (
    closed_on is null or opened_on <= closed_on
  ),
  constraint rtp_cases_review_on_check check (
    next_review_on is null or opened_on <= next_review_on
  )
);

create table if not exists public.rtp_medical_clearances (
  id uuid primary key default gen_random_uuid(),
  rtp_case_id uuid not null references public.rtp_cases(id) on delete cascade,
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  clearance_status text not null default 'not-cleared' check (
    clearance_status in (
      'not-cleared',
      'rehab-only',
      'running-only',
      'modified-training',
      'full-training',
      'match-available',
      'blocked'
    )
  ),
  participation_ceiling text not null default 'rehab-only' check (
    participation_ceiling in (
      'none',
      'rehab-only',
      'running-only',
      'modified-training',
      'full-training',
      'match-available'
    )
  ),
  medical_confidence_level text not null default 'low' check (
    medical_confidence_level in ('high', 'moderate', 'low')
  ),
  medical_restrictions jsonb not null default '{}'::jsonb,
  coach_safe_restriction_summary text check (
    coach_safe_restriction_summary is null
    or char_length(coach_safe_restriction_summary) <= 500
  ),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  superseded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint rtp_medical_clearances_current_check check (
    superseded_at is null or revoked_at is null or superseded_at <= revoked_at
  )
);

create table if not exists public.rtp_case_transitions (
  id uuid primary key default gen_random_uuid(),
  rtp_case_id uuid not null references public.rtp_cases(id) on delete cascade,
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  from_status text check (
    from_status is null
    or from_status in (
      'created',
      'medical-review',
      'active-rtp',
      'training-available',
      'match-available',
      'performance-restored',
      'closed'
    )
  ),
  to_status text not null check (
    to_status in (
      'created',
      'medical-review',
      'active-rtp',
      'training-available',
      'match-available',
      'performance-restored',
      'closed'
    )
  ),
  transition_reason text check (transition_reason is null or char_length(transition_reason) <= 500),
  transition_source text not null default 'manual' check (transition_source in ('manual', 'api', 'system')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.rtp_audit_events (
  id uuid primary key default gen_random_uuid(),
  rtp_case_id uuid references public.rtp_cases(id) on delete set null,
  organization_id uuid references public.squad_organizations(id) on delete cascade,
  team_id uuid references public.squad_teams(id) on delete set null,
  player_id uuid references public.squad_players(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text check (
    actor_role is null
    or actor_role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest', 'system')
  ),
  coach_safe boolean not null default false,
  contains_private_medical_data boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rtp_cases_team_status_idx
on public.rtp_cases (team_id, lifecycle_status, opened_on desc);

create index if not exists rtp_cases_player_status_idx
on public.rtp_cases (player_id, lifecycle_status, opened_on desc);

create index if not exists rtp_cases_review_idx
on public.rtp_cases (team_id, next_review_on, lifecycle_status)
where lifecycle_status not in ('closed', 'performance-restored');

create index if not exists rtp_medical_clearances_case_idx
on public.rtp_medical_clearances (rtp_case_id, reviewed_at desc);

create index if not exists rtp_medical_clearances_player_idx
on public.rtp_medical_clearances (player_id, clearance_status, reviewed_at desc);

create unique index if not exists rtp_medical_clearances_current_unique_idx
on public.rtp_medical_clearances (rtp_case_id)
where superseded_at is null and revoked_at is null;

create index if not exists rtp_case_transitions_case_created_idx
on public.rtp_case_transitions (rtp_case_id, created_at desc);

create index if not exists rtp_case_transitions_team_created_idx
on public.rtp_case_transitions (team_id, created_at desc);

create index if not exists rtp_audit_events_org_created_idx
on public.rtp_audit_events (organization_id, created_at desc);

create index if not exists rtp_audit_events_case_created_idx
on public.rtp_audit_events (rtp_case_id, created_at desc);

create index if not exists rtp_audit_events_player_created_idx
on public.rtp_audit_events (player_id, created_at desc);

create or replace function app_private.is_rtp_team_member(target_team_id uuid)
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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_manage_rtp_team(target_team_id uuid)
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

create or replace function app_private.can_manage_rtp_medical_team(target_team_id uuid)
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
      and membership.role in ('admin', 'medical')
  );
$$;

create or replace function public.rtp_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rtp_cases_touch_updated_at
before update on public.rtp_cases
for each row execute function public.rtp_touch_updated_at();

create trigger rtp_medical_clearances_touch_updated_at
before update on public.rtp_medical_clearances
for each row execute function public.rtp_touch_updated_at();

alter table public.rtp_cases enable row level security;
alter table public.rtp_medical_clearances enable row level security;
alter table public.rtp_case_transitions enable row level security;
alter table public.rtp_audit_events enable row level security;

revoke all on public.rtp_cases from anon, authenticated;
revoke all on public.rtp_medical_clearances from anon, authenticated;
revoke all on public.rtp_case_transitions from anon, authenticated;
revoke all on public.rtp_audit_events from anon, authenticated;

grant execute on function app_private.is_rtp_team_member(uuid) to authenticated;
grant execute on function app_private.can_manage_rtp_team(uuid) to authenticated;
grant execute on function app_private.can_manage_rtp_medical_team(uuid) to authenticated;

create policy "rtp cases are visible to authorized team staff"
on public.rtp_cases
for select
to authenticated
using (
  app_private.is_rtp_team_member(team_id)
);

create policy "rtp cases are server-managed by rtp owners"
on public.rtp_cases
for all
to authenticated
using (
  app_private.can_manage_rtp_team(team_id)
)
with check (
  app_private.can_manage_rtp_team(team_id)
);

create policy "rtp medical clearances are visible to medical owners only"
on public.rtp_medical_clearances
for select
to authenticated
using (
  app_private.can_manage_rtp_medical_team(team_id)
);

create policy "rtp medical clearances are server-managed by medical owners"
on public.rtp_medical_clearances
for all
to authenticated
using (
  app_private.can_manage_rtp_medical_team(team_id)
)
with check (
  app_private.can_manage_rtp_medical_team(team_id)
);

create policy "rtp transitions are visible to rtp owners"
on public.rtp_case_transitions
for select
to authenticated
using (
  app_private.can_manage_rtp_team(team_id)
);

create policy "rtp transitions are server-managed by rtp owners"
on public.rtp_case_transitions
for all
to authenticated
using (
  app_private.can_manage_rtp_team(team_id)
)
with check (
  app_private.can_manage_rtp_team(team_id)
);

create policy "rtp audit events are visible to admin and medical owners"
on public.rtp_audit_events
for select
to authenticated
using (
  team_id is null
  or app_private.can_manage_rtp_medical_team(team_id)
);

create policy "rtp audit events are server-managed by rtp owners"
on public.rtp_audit_events
for all
to authenticated
using (
  team_id is null
  or app_private.can_manage_rtp_team(team_id)
)
with check (
  team_id is null
  or app_private.can_manage_rtp_team(team_id)
);

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('rtp', 'read', array['admin','club-admin','team-admin','coach','performance','medical'], 'team', true, true, 'Read coach-safe RTP operating spine status through guarded server routes.'),
  ('rtp', 'write', array['admin','club-admin','team-admin','performance','medical'], 'team', true, true, 'Create and update RTP operating spine records through guarded server routes when writes are enabled.'),
  ('rtp', 'delete', array['admin'], 'team', true, true, 'Archive or close RTP operating records; hard deletes are blocked outside approved rollback.'),
  ('rtp', 'export', array['admin','medical'], 'team', true, true, 'Export RTP operating audit and clinical clearance records for authorized review.'),
  ('rtp', 'restore', array['admin','medical'], 'team', true, true, 'Restore RTP operating records before production data exists or through approved recovery workflows.'),
  ('rtp', 'admin', array['admin'], 'team', true, true, 'Administer RTP operating spine access controls and governance.'),
  ('rtp', 'observe', array['admin','medical','performance'], 'team', true, true, 'Observe RTP operating spine health, audit coverage, and readiness contract status.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
