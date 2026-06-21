-- Football Science RTP Library foundation.
-- Phase 1 creates the shared content spine only. No injury content is seeded
-- and no athlete-specific medical record, plan, or case table is linked here.

create schema if not exists app_private;

create or replace function app_private.rtp_library_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

create or replace function app_private.rtp_library_prevent_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'RTP Library records must be archived or versioned, not hard-deleted.';
end;
$$;

create table if not exists public.rtp_injury_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  library_key text not null check (library_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  body_region text not null default '' check (char_length(body_region) <= 120),
  injury_family text not null default '' check (char_length(injury_family) <= 120),
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  owner_domain text not null default 'shared' check (owner_domain in ('medical', 'performance', 'shared')),
  audience text not null default 'medical-performance' check (audience in ('medical-performance', 'coach-safe', 'internal')),
  clinical_overview jsonb not null default '{}'::jsonb,
  performance_overview jsonb not null default '{}'::jsonb,
  coach_safe_summary text not null default '' check (char_length(coach_safe_summary) <= 2000),
  content_tags text[] not null default '{}'::text[],
  published_at timestamptz,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, library_key)
);

create table if not exists public.rtp_profile_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid not null references public.rtp_injury_profiles(id) on delete restrict,
  section_key text not null check (section_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  section_type text not null check (section_type in ('clinical', 'performance', 'coach-safe', 'contraindication', 'monitoring', 'research', 'operations')),
  title text not null check (char_length(title) between 2 and 160),
  body jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, section_key)
);

create table if not exists public.rtp_assessment_protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid references public.rtp_injury_profiles(id) on delete restrict,
  protocol_key text not null check (protocol_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  domain text not null check (domain in ('medical', 'performance', 'shared')),
  instructions jsonb not null default '{}'::jsonb,
  measurement_schema jsonb not null default '{}'::jsonb,
  coach_safe_visibility boolean not null default false,
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, protocol_key)
);

create table if not exists public.rtp_exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  exercise_key text not null check (exercise_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  category text not null default '' check (char_length(category) <= 120),
  domain text not null check (domain in ('running', 'sprint', 'strength', 'mobility', 'conditioning', 'testing', 'shared')),
  equipment text[] not null default '{}'::text[],
  instructions jsonb not null default '{}'::jsonb,
  load_parameters jsonb not null default '{}'::jsonb,
  contraindications jsonb not null default '{}'::jsonb,
  coach_safe_summary text not null default '' check (char_length(coach_safe_summary) <= 2000),
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, exercise_key)
);

create table if not exists public.rtp_profile_exercise_links (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid not null references public.rtp_injury_profiles(id) on delete restrict,
  exercise_id uuid not null references public.rtp_exercises(id) on delete restrict,
  phase_key text not null default '' check (char_length(phase_key) <= 120),
  purpose text not null default '' check (char_length(purpose) <= 240),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, exercise_id, phase_key)
);

create table if not exists public.rtp_progressions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  progression_key text not null check (progression_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  domain text not null check (domain in ('running', 'sprint', 'strength', 'load', 'field', 'shared')),
  summary text not null default '' check (char_length(summary) <= 2000),
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, progression_key)
);

create table if not exists public.rtp_progression_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  progression_id uuid not null references public.rtp_progressions(id) on delete restrict,
  step_key text not null check (step_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  entry_criteria jsonb not null default '{}'::jsonb,
  prescription jsonb not null default '{}'::jsonb,
  exit_criteria jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (progression_id, step_key)
);

create table if not exists public.rtp_profile_progression_links (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid not null references public.rtp_injury_profiles(id) on delete restrict,
  progression_id uuid not null references public.rtp_progressions(id) on delete restrict,
  phase_key text not null default '' check (char_length(phase_key) <= 120),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, progression_id, phase_key)
);

create table if not exists public.rtp_criteria_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid references public.rtp_injury_profiles(id) on delete restrict,
  criteria_key text not null check (criteria_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  domain text not null check (domain in ('medical', 'performance', 'shared')),
  audience text not null default 'medical-performance' check (audience in ('medical-performance', 'coach-safe', 'internal')),
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, criteria_key)
);

create table if not exists public.rtp_criteria_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  criteria_set_id uuid not null references public.rtp_criteria_sets(id) on delete restrict,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  label text not null check (char_length(label) between 2 and 160),
  measurement_type text not null default 'qualitative' check (measurement_type in ('qualitative', 'numeric', 'boolean', 'range', 'checklist')),
  threshold jsonb not null default '{}'::jsonb,
  required boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (criteria_set_id, item_key)
);

create table if not exists public.rtp_monitoring_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  metric_key text not null check (metric_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  domain text not null check (domain in ('medical', 'performance', 'coach-safe', 'shared')),
  unit text not null default '' check (char_length(unit) <= 40),
  capture_schema jsonb not null default '{}'::jsonb,
  interpretation jsonb not null default '{}'::jsonb,
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, metric_key)
);

create table if not exists public.rtp_benchmarks (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  metric_id uuid references public.rtp_monitoring_metrics(id) on delete restrict,
  benchmark_key text not null check (benchmark_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  population text not null default '' check (char_length(population) <= 160),
  values jsonb not null default '{}'::jsonb,
  evidence_grade text not null default '' check (char_length(evidence_grade) <= 40),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, benchmark_key)
);

create table if not exists public.rtp_research_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  evidence_key text not null check (evidence_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 240),
  citation text not null default '' check (char_length(citation) <= 500),
  url text not null default '' check (char_length(url) <= 800),
  evidence_type text not null default 'research' check (evidence_type in ('research', 'guideline', 'expert-consensus', 'internal-review')),
  summary jsonb not null default '{}'::jsonb,
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, evidence_key)
);

create table if not exists public.rtp_case_studies (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  case_key text not null check (case_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 2 and 160),
  profile_id uuid references public.rtp_injury_profiles(id) on delete restrict,
  anonymized_context jsonb not null default '{}'::jsonb,
  learning_points jsonb not null default '{}'::jsonb,
  is_anonymized boolean not null default true,
  content_status text not null default 'draft' check (content_status in ('draft', 'review', 'published', 'archived')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, case_key)
);

create table if not exists public.rtp_club_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  profile_id uuid references public.rtp_injury_profiles(id) on delete restrict,
  note_key text not null check (note_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  owner_domain text not null check (owner_domain in ('medical', 'performance', 'shared')),
  audience text not null default 'internal' check (audience in ('medical-performance', 'coach-safe', 'internal')),
  title text not null check (char_length(title) between 2 and 160),
  note_body jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, note_key)
);

create table if not exists public.rtp_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  tag_key text not null check (tag_key ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  label text not null check (char_length(label) between 2 and 80),
  tag_type text not null default 'content' check (tag_type in ('content', 'domain', 'equipment', 'phase', 'audience')),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, tag_key)
);

create table if not exists public.rtp_tag_links (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  tag_id uuid not null references public.rtp_tags(id) on delete restrict,
  target_table text not null check (target_table in ('rtp_injury_profiles', 'rtp_exercises', 'rtp_progressions', 'rtp_criteria_sets', 'rtp_research_evidence')),
  target_id uuid not null,
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tag_id, target_table, target_id)
);

create table if not exists public.rtp_favorites (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  user_id text not null,
  target_table text not null check (target_table in ('rtp_injury_profiles', 'rtp_exercises', 'rtp_progressions', 'rtp_criteria_sets')),
  target_id uuid not null,
  favorite_context text not null default '' check (char_length(favorite_context) <= 120),
  archived_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_id, user_id, target_table, target_id)
);

create table if not exists public.rtp_content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  target_table text not null check (target_table in ('rtp_injury_profiles', 'rtp_profile_sections', 'rtp_assessment_protocols', 'rtp_exercises', 'rtp_progressions', 'rtp_criteria_sets')),
  target_id uuid not null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null default '{}'::jsonb,
  change_summary text not null default '' check (char_length(change_summary) <= 1000),
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_table, target_id, version_number)
);

create table if not exists public.rtp_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  team_id text not null,
  event_type text not null check (char_length(event_type) between 3 and 100),
  target_table text not null default '' check (char_length(target_table) <= 120),
  target_id uuid,
  actor_id text not null default '',
  actor_role text not null default '' check (char_length(actor_role) <= 80),
  event_summary text not null default '' check (char_length(event_summary) <= 1000),
  details jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  updated_by text not null default '',
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rtp_injury_profiles_scope_status_idx on public.rtp_injury_profiles (organization_id, team_id, content_status, updated_at desc);
create index if not exists rtp_profile_sections_profile_idx on public.rtp_profile_sections (profile_id, sort_order);
create index if not exists rtp_assessment_protocols_profile_idx on public.rtp_assessment_protocols (profile_id, domain);
create index if not exists rtp_exercises_scope_domain_idx on public.rtp_exercises (organization_id, team_id, domain, updated_at desc);
create index if not exists rtp_profile_exercise_links_profile_idx on public.rtp_profile_exercise_links (profile_id, phase_key, sort_order);
create index if not exists rtp_progressions_scope_domain_idx on public.rtp_progressions (organization_id, team_id, domain, updated_at desc);
create index if not exists rtp_progression_steps_progression_idx on public.rtp_progression_steps (progression_id, sort_order);
create index if not exists rtp_profile_progression_links_profile_idx on public.rtp_profile_progression_links (profile_id, phase_key, sort_order);
create index if not exists rtp_criteria_sets_profile_idx on public.rtp_criteria_sets (profile_id, domain);
create index if not exists rtp_criteria_items_set_idx on public.rtp_criteria_items (criteria_set_id, sort_order);
create index if not exists rtp_monitoring_metrics_scope_domain_idx on public.rtp_monitoring_metrics (organization_id, team_id, domain);
create index if not exists rtp_benchmarks_metric_idx on public.rtp_benchmarks (metric_id);
create index if not exists rtp_research_evidence_scope_status_idx on public.rtp_research_evidence (organization_id, team_id, content_status, updated_at desc);
create index if not exists rtp_case_studies_profile_idx on public.rtp_case_studies (profile_id, content_status);
create index if not exists rtp_club_notes_profile_idx on public.rtp_club_notes (profile_id, owner_domain);
create index if not exists rtp_tag_links_target_idx on public.rtp_tag_links (target_table, target_id);
create index if not exists rtp_favorites_user_idx on public.rtp_favorites (organization_id, team_id, user_id, target_table);
create index if not exists rtp_content_versions_target_idx on public.rtp_content_versions (target_table, target_id, version_number desc);
create index if not exists rtp_audit_events_scope_created_idx on public.rtp_audit_events (organization_id, team_id, created_at desc);

alter table public.rtp_injury_profiles enable row level security;
alter table public.rtp_profile_sections enable row level security;
alter table public.rtp_assessment_protocols enable row level security;
alter table public.rtp_exercises enable row level security;
alter table public.rtp_profile_exercise_links enable row level security;
alter table public.rtp_progressions enable row level security;
alter table public.rtp_progression_steps enable row level security;
alter table public.rtp_profile_progression_links enable row level security;
alter table public.rtp_criteria_sets enable row level security;
alter table public.rtp_criteria_items enable row level security;
alter table public.rtp_monitoring_metrics enable row level security;
alter table public.rtp_benchmarks enable row level security;
alter table public.rtp_research_evidence enable row level security;
alter table public.rtp_case_studies enable row level security;
alter table public.rtp_club_notes enable row level security;
alter table public.rtp_tags enable row level security;
alter table public.rtp_tag_links enable row level security;
alter table public.rtp_favorites enable row level security;
alter table public.rtp_content_versions enable row level security;
alter table public.rtp_audit_events enable row level security;

revoke all on public.rtp_injury_profiles from anon, authenticated;
revoke all on public.rtp_profile_sections from anon, authenticated;
revoke all on public.rtp_assessment_protocols from anon, authenticated;
revoke all on public.rtp_exercises from anon, authenticated;
revoke all on public.rtp_profile_exercise_links from anon, authenticated;
revoke all on public.rtp_progressions from anon, authenticated;
revoke all on public.rtp_progression_steps from anon, authenticated;
revoke all on public.rtp_profile_progression_links from anon, authenticated;
revoke all on public.rtp_criteria_sets from anon, authenticated;
revoke all on public.rtp_criteria_items from anon, authenticated;
revoke all on public.rtp_monitoring_metrics from anon, authenticated;
revoke all on public.rtp_benchmarks from anon, authenticated;
revoke all on public.rtp_research_evidence from anon, authenticated;
revoke all on public.rtp_case_studies from anon, authenticated;
revoke all on public.rtp_club_notes from anon, authenticated;
revoke all on public.rtp_tags from anon, authenticated;
revoke all on public.rtp_tag_links from anon, authenticated;
revoke all on public.rtp_favorites from anon, authenticated;
revoke all on public.rtp_content_versions from anon, authenticated;
revoke all on public.rtp_audit_events from anon, authenticated;

grant select, insert, update, delete on public.rtp_injury_profiles to service_role;
grant select, insert, update, delete on public.rtp_profile_sections to service_role;
grant select, insert, update, delete on public.rtp_assessment_protocols to service_role;
grant select, insert, update, delete on public.rtp_exercises to service_role;
grant select, insert, update, delete on public.rtp_profile_exercise_links to service_role;
grant select, insert, update, delete on public.rtp_progressions to service_role;
grant select, insert, update, delete on public.rtp_progression_steps to service_role;
grant select, insert, update, delete on public.rtp_profile_progression_links to service_role;
grant select, insert, update, delete on public.rtp_criteria_sets to service_role;
grant select, insert, update, delete on public.rtp_criteria_items to service_role;
grant select, insert, update, delete on public.rtp_monitoring_metrics to service_role;
grant select, insert, update, delete on public.rtp_benchmarks to service_role;
grant select, insert, update, delete on public.rtp_research_evidence to service_role;
grant select, insert, update, delete on public.rtp_case_studies to service_role;
grant select, insert, update, delete on public.rtp_club_notes to service_role;
grant select, insert, update, delete on public.rtp_tags to service_role;
grant select, insert, update, delete on public.rtp_tag_links to service_role;
grant select, insert, update, delete on public.rtp_favorites to service_role;
grant select, insert, update, delete on public.rtp_content_versions to service_role;
grant select, insert, update, delete on public.rtp_audit_events to service_role;

do $$
declare
  rtp_table text;
begin
  foreach rtp_table in array array[
    'rtp_injury_profiles',
    'rtp_profile_sections',
    'rtp_assessment_protocols',
    'rtp_exercises',
    'rtp_profile_exercise_links',
    'rtp_progressions',
    'rtp_progression_steps',
    'rtp_profile_progression_links',
    'rtp_criteria_sets',
    'rtp_criteria_items',
    'rtp_monitoring_metrics',
    'rtp_benchmarks',
    'rtp_research_evidence',
    'rtp_case_studies',
    'rtp_club_notes',
    'rtp_tags',
    'rtp_tag_links',
    'rtp_favorites',
    'rtp_content_versions',
    'rtp_audit_events'
  ] loop
    execute format('drop trigger if exists rtp_library_touch_updated_at on public.%I', rtp_table);
    execute format('create trigger rtp_library_touch_updated_at before update on public.%I for each row execute function app_private.rtp_library_touch_updated_at()', rtp_table);
    execute format('drop trigger if exists rtp_library_prevent_hard_delete on public.%I', rtp_table);
    execute format('create trigger rtp_library_prevent_hard_delete before delete on public.%I for each row execute function app_private.rtp_library_prevent_hard_delete()', rtp_table);
  end loop;
end;
$$;

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('rtp-library', 'read', array['admin','club-admin','team-admin','coach','analyst','performance','medical'], 'team', true, true, 'Read shared RTP Library content, with coach-safe summaries for coaching roles.'),
  ('rtp-library', 'write', array['admin','medical','performance'], 'team', true, true, 'Create and update shared RTP Library content through guarded server routes.'),
  ('rtp-library', 'delete', array['admin','medical','performance'], 'team', true, true, 'Archive RTP Library content; hard deletes are blocked.'),
  ('rtp-library', 'export', array['admin','medical','performance'], 'team', true, true, 'Export shared RTP Library content and version history.'),
  ('rtp-library', 'restore', array['admin','medical'], 'team', true, true, 'Restore RTP Library content from versioned snapshots.'),
  ('rtp-library', 'admin', array['admin'], 'team', true, true, 'Administer RTP Library permissions and governance.'),
  ('rtp-library', 'observe', array['admin','medical','performance'], 'team', true, true, 'Observe RTP Library health, audit events, and content coverage.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
