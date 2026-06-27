-- RTP Library database/API foundation.
-- Knowledge content is club-neutral and player-independent. Player medical data
-- remains in RTP cases / Medical Plans, not in these Library tables.

create table if not exists public.rtp_library_profiles (
  id text primary key,
  profile_version integer not null default 1 check (profile_version > 0),
  status text not null default 'published' check (status in ('draft', 'review', 'published', 'archived')),
  name text not null,
  system text not null default '',
  body_area text not null default '',
  family text not null default '',
  evidence_level text not null default 'Expert consensus',
  summary text not null default '',
  evidence_summary text not null default '',
  experience_summary text not null default '',
  symptoms text[] not null default '{}',
  positions text[] not null default '{}',
  movement_planes text[] not null default '{}',
  risk_tags text[] not null default '{}',
  season text[] not null default '{}',
  sex text[] not null default '{}',
  level text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  source_profile_hash text not null default '',
  sort_order integer not null default 1000,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rtp_library_exercises (
  id text primary key,
  status text not null default 'published' check (status in ('draft', 'review', 'published', 'archived')),
  name text not null,
  family text not null default '',
  intent text not null default '',
  tissue_types text[] not null default '{}',
  phases text[] not null default '{}',
  movement_planes text[] not null default '{}',
  football_demands text[] not null default '{}',
  equipment text[] not null default '{}',
  risk_level text not null default 'controlled' check (risk_level in ('controlled', 'moderate', 'high')),
  evidence_level text not null default 'Expert consensus',
  evidence_summary text not null default '',
  consensus_note text not null default '',
  dosage text not null default '',
  progression text not null default '',
  regression text not null default '',
  hold_rules text[] not null default '{}',
  medical_notes text not null default '',
  performance_notes text not null default '',
  coach_safe_label text not null default 'Exercise starter',
  evidence_refs text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rtp_library_profile_exercises (
  profile_id text not null references public.rtp_library_profiles(id) on delete cascade,
  exercise_id text not null references public.rtp_library_exercises(id) on delete cascade,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  primary key (profile_id, exercise_id)
);

create index if not exists rtp_library_profiles_status_sort_idx
on public.rtp_library_profiles (status, sort_order, name);

create index if not exists rtp_library_profiles_system_body_idx
on public.rtp_library_profiles (system, body_area);

create index if not exists rtp_library_profiles_symptoms_gin_idx
on public.rtp_library_profiles using gin (symptoms);

create index if not exists rtp_library_profiles_movement_gin_idx
on public.rtp_library_profiles using gin (movement_planes);

create index if not exists rtp_library_profiles_risk_tags_gin_idx
on public.rtp_library_profiles using gin (risk_tags);

create index if not exists rtp_library_profiles_content_gin_idx
on public.rtp_library_profiles using gin (content jsonb_path_ops);

create index if not exists rtp_library_exercises_status_sort_idx
on public.rtp_library_exercises (status, sort_order, name);

create index if not exists rtp_library_exercises_tissue_gin_idx
on public.rtp_library_exercises using gin (tissue_types);

create index if not exists rtp_library_exercises_phases_gin_idx
on public.rtp_library_exercises using gin (phases);

create index if not exists rtp_library_exercises_demands_gin_idx
on public.rtp_library_exercises using gin (football_demands);

create index if not exists rtp_library_profile_exercises_profile_sort_idx
on public.rtp_library_profile_exercises (profile_id, sort_order, exercise_id);

create index if not exists rtp_library_profile_exercises_exercise_idx
on public.rtp_library_profile_exercises (exercise_id);

drop trigger if exists rtp_library_profiles_touch_updated_at on public.rtp_library_profiles;
create trigger rtp_library_profiles_touch_updated_at
before update on public.rtp_library_profiles
for each row execute function public.rtp_touch_updated_at();

drop trigger if exists rtp_library_exercises_touch_updated_at on public.rtp_library_exercises;
create trigger rtp_library_exercises_touch_updated_at
before update on public.rtp_library_exercises
for each row execute function public.rtp_touch_updated_at();

alter table public.rtp_library_profiles enable row level security;
alter table public.rtp_library_exercises enable row level security;
alter table public.rtp_library_profile_exercises enable row level security;

revoke all on public.rtp_library_profiles from anon, authenticated;
revoke all on public.rtp_library_exercises from anon, authenticated;
revoke all on public.rtp_library_profile_exercises from anon, authenticated;

grant select on public.rtp_library_profiles to authenticated;
grant select on public.rtp_library_exercises to authenticated;
grant select on public.rtp_library_profile_exercises to authenticated;

create or replace function app_private.can_read_rtp_library()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'medical', 'performance');
$$;

grant execute on function app_private.can_read_rtp_library() to authenticated;

create policy "rtp library profiles are visible to medical and performance staff"
on public.rtp_library_profiles
for select
to authenticated
using (
  status = 'published'
  and app_private.can_read_rtp_library()
);

create policy "rtp library exercises are visible to medical and performance staff"
on public.rtp_library_exercises
for select
to authenticated
using (
  status = 'published'
  and app_private.can_read_rtp_library()
);

create policy "rtp library exercise mapping is visible to medical and performance staff"
on public.rtp_library_profile_exercises
for select
to authenticated
using (
  app_private.can_read_rtp_library()
);

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('rtp-library', 'read', array['admin','club-admin','team-admin','medical','performance'], 'organization', true, false, 'Read club-neutral RTP Library knowledge through guarded server routes.'),
  ('rtp-library', 'write', array['admin','medical'], 'organization', true, false, 'Create or update RTP Library knowledge through guarded governance workflows.'),
  ('rtp-library', 'delete', array['admin'], 'organization', true, false, 'Archive RTP Library knowledge; hard deletes require approved rollback.'),
  ('rtp-library', 'export', array['admin','medical'], 'organization', true, false, 'Export RTP Library knowledge and evidence review status.'),
  ('rtp-library', 'restore', array['admin','medical'], 'organization', true, false, 'Restore RTP Library knowledge through approved governance workflows.'),
  ('rtp-library', 'admin', array['admin'], 'organization', true, false, 'Administer RTP Library permissions, publishing and governance.'),
  ('rtp-library', 'observe', array['admin','medical','performance'], 'organization', true, false, 'Observe RTP Library coverage, quality, and evidence review status.')
on conflict (module_id, action) do update set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
