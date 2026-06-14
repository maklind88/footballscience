-- Football Science IDP / Player Development System foundation.
-- IDP owns development records and curated evidence links. Squad owns player
-- identity and Video Analysis owns clip metadata.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;

create or replace function app_private.idp_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.row_version = coalesce(old.row_version, 0) + 1;
  return new;
end;
$$;

create or replace function app_private.idp_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'IDP records must be archived or soft-deleted, not hard-deleted.';
end;
$$;

create table if not exists public.idp_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  club_id text check (club_id is null or char_length(club_id) <= 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  season_id text check (season_id is null or char_length(season_id) <= 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  squad_player_id uuid references public.squad_players(id) on delete restrict,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete restrict,
  position_label text check (position_label is null or char_length(position_label) <= 80),
  role_label text check (role_label is null or char_length(role_label) <= 120),
  primary_owner_id text check (primary_owner_id is null or char_length(primary_owner_id) <= 160),
  secondary_staff_ids text[] not null default '{}'::text[],
  strengths text[] not null default '{}'::text[],
  super_strengths text[] not null default '{}'::text[],
  leadership_profile text check (leadership_profile is null or char_length(leadership_profile) <= 1200),
  learning_notes text check (learning_notes is null or char_length(learning_notes) <= 1200),
  status text not null default 'active' check (status in ('active', 'watch', 'completed', 'archived')),
  last_review_on date,
  next_review_on date,
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint idp_profiles_review_range_check check (
    last_review_on is null or next_review_on is null or last_review_on <= next_review_on
  )
);

create table if not exists public.idp_development_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  profile_id uuid not null references public.idp_profiles(id) on delete restrict,
  player_id text not null check (char_length(player_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  category text not null check (category in ('Technical', 'Tactical', 'Physical', 'Psychological', 'Leadership')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_focuses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  club_id text check (club_id is null or char_length(club_id) <= 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  profile_id uuid not null references public.idp_profiles(id) on delete restrict,
  development_area_id uuid references public.idp_development_areas(id) on delete set null,
  player_id text not null check (char_length(player_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  description text check (description is null or char_length(description) <= 1200),
  category text not null check (category in ('Technical', 'Tactical', 'Physical', 'Psychological', 'Leadership')),
  focus_level text not null default 'main' check (focus_level in ('main', 'secondary', 'personal')),
  linked_phase text check (linked_phase is null or char_length(linked_phase) <= 80),
  linked_sub_phase text check (linked_sub_phase is null or char_length(linked_sub_phase) <= 80),
  team_principle_id text check (team_principle_id is null or char_length(team_principle_id) <= 120),
  mini_game_principle_id text check (mini_game_principle_id is null or char_length(mini_game_principle_id) <= 120),
  owner_id text check (owner_id is null or char_length(owner_id) <= 160),
  status text not null default 'Active' check (status in ('Draft', 'Active', 'Needs Evidence', 'Ready For Review', 'Reviewed', 'Completed', 'Archived')),
  evidence_status text not null default 'Needs Evidence' check (evidence_status in ('No Evidence', 'Needs Evidence', 'Has Evidence', 'Ready For Review')),
  review_date date,
  completed_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_clip_bank_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  source_module text not null default 'video-analysis' check (char_length(source_module) between 2 and 80),
  source_id text check (source_id is null or char_length(source_id) <= 160),
  status text not null default 'New' check (status in ('New', 'Reviewed', 'Linked To Focus', 'Marked As Evidence', 'Archived', 'Hidden')),
  linked_focus_id uuid references public.idp_focuses(id) on delete set null,
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 160),
  reviewed_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  focus_id uuid not null references public.idp_focuses(id) on delete restrict,
  clip_bank_item_id uuid references public.idp_clip_bank_items(id) on delete set null,
  evidence_type text not null check (evidence_type in ('Video Clip', 'Coach Note', 'Training Observation', 'Match Observation', 'Performance Note', 'Medical Note', 'Leadership Note', 'Player Reflection', 'Review Meeting')),
  source_module text not null check (char_length(source_module) between 2 and 80),
  source_table text check (source_table is null or char_length(source_table) <= 80),
  source_id text check (source_id is null or char_length(source_id) <= 160),
  note text check (note is null or char_length(note) <= 1200),
  status text not null default 'active' check (status in ('active', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  focus_id uuid not null references public.idp_focuses(id) on delete restrict,
  review_type text not null default 'coach-review' check (review_type in ('coach-review', 'player-review', 'staff-review', 'meeting')),
  progress_summary text check (progress_summary is null or char_length(progress_summary) <= 1200),
  evidence_summary text check (evidence_summary is null or char_length(evidence_summary) <= 1200),
  coach_note text check (coach_note is null or char_length(coach_note) <= 1200),
  player_response text check (player_response is null or char_length(player_response) <= 1200),
  next_action text check (next_action is null or char_length(next_action) <= 400),
  status_change text check (status_change is null or char_length(status_change) <= 80),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_next_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  focus_id uuid references public.idp_focuses(id) on delete set null,
  action_type text not null check (action_type in ('Add Evidence', 'Review Clip Bank', 'Schedule IDP Meeting', 'Update Focus', 'Complete Review', 'Create Next Focus')),
  title text not null check (char_length(title) between 1 and 180),
  owner_id text check (owner_id is null or char_length(owner_id) <= 160),
  due_on date,
  status text not null default 'open' check (status in ('open', 'completed', 'dismissed', 'archived')),
  source_module text check (source_module is null or char_length(source_module) <= 80),
  source_id text check (source_id is null or char_length(source_id) <= 160),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  focus_id uuid references public.idp_focuses(id) on delete set null,
  milestone_type text not null check (milestone_type in ('IDP Started', 'First IDP Meeting Completed', 'Current Focus Created', 'First Video Clip Linked', 'First Evidence Added', 'First Review Completed', 'Focus Completed', 'New Role Added', 'Leadership Moment Added', 'Return From Injury Milestone', 'National Team Call-Up', 'Contract Extension')),
  title text not null check (char_length(title) between 1 and 180),
  occurred_on date not null default current_date,
  source_module text check (source_module is null or char_length(source_module) <= 80),
  source_id text check (source_id is null or char_length(source_id) <= 160),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_staff_ownership (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid references public.idp_profiles(id) on delete set null,
  focus_id uuid references public.idp_focuses(id) on delete set null,
  owner_id text not null check (char_length(owner_id) between 1 and 160),
  ownership_type text not null check (ownership_type in ('player-owner', 'focus-owner', 'evidence-contributor', 'review-owner', 'support-staff')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idp_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text check (organization_id is null or char_length(organization_id) <= 160),
  team_id text check (team_id is null or char_length(team_id) <= 160),
  player_id text check (player_id is null or char_length(player_id) <= 160),
  action text not null check (char_length(action) between 2 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  actor_id text check (actor_id is null or char_length(actor_id) <= 160),
  changed_fields text[] not null default '{}'::text[],
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now(),
  request_id text check (request_id is null or char_length(request_id) <= 160),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists idp_profiles_active_player_idx on public.idp_profiles (team_id, player_id) where deleted_at is null and status <> 'archived';
create index if not exists idp_profiles_team_status_review_idx on public.idp_profiles (team_id, status, next_review_on, updated_at desc) where deleted_at is null;
create index if not exists idp_development_areas_profile_idx on public.idp_development_areas (profile_id, status, category) where deleted_at is null;
create index if not exists idp_focuses_dashboard_idx on public.idp_focuses (team_id, status, review_date, updated_at desc) where deleted_at is null;
create index if not exists idp_focuses_profile_status_idx on public.idp_focuses (profile_id, status, review_date) where deleted_at is null;
create index if not exists idp_focuses_player_idx on public.idp_focuses (team_id, player_id, updated_at desc) where deleted_at is null;
create unique index if not exists idp_focuses_active_level_idx on public.idp_focuses (profile_id, focus_level) where deleted_at is null and status in ('Active', 'Needs Evidence', 'Ready For Review', 'Reviewed');
create unique index if not exists idp_clip_bank_unique_active_clip_idx on public.idp_clip_bank_items (player_id, clip_instance_id) where deleted_at is null;
create index if not exists idp_clip_bank_player_status_idx on public.idp_clip_bank_items (team_id, player_id, status, created_at desc) where deleted_at is null;
create index if not exists idp_clip_bank_focus_idx on public.idp_clip_bank_items (linked_focus_id, status, created_at desc) where deleted_at is null and linked_focus_id is not null;
create index if not exists idp_evidence_focus_created_idx on public.idp_evidence (focus_id, created_at desc) where deleted_at is null;
create index if not exists idp_evidence_player_created_idx on public.idp_evidence (team_id, player_id, created_at desc) where deleted_at is null;
create index if not exists idp_reviews_focus_created_idx on public.idp_reviews (focus_id, created_at desc) where deleted_at is null;
create index if not exists idp_reviews_player_created_idx on public.idp_reviews (team_id, player_id, created_at desc) where deleted_at is null;
create unique index if not exists idp_next_actions_active_type_idx on public.idp_next_actions (team_id, player_id, coalesce(focus_id, '00000000-0000-0000-0000-000000000000'::uuid), action_type) where deleted_at is null and status = 'open';
create index if not exists idp_next_actions_dashboard_idx on public.idp_next_actions (team_id, status, due_on, created_at desc) where deleted_at is null;
create index if not exists idp_milestones_player_idx on public.idp_milestones (team_id, player_id, occurred_on desc, created_at desc);
create index if not exists idp_staff_ownership_player_idx on public.idp_staff_ownership (team_id, player_id, ownership_type, status) where deleted_at is null;
create index if not exists idp_audit_events_team_created_idx on public.idp_audit_events (team_id, created_at desc);

alter table public.idp_profiles enable row level security;
alter table public.idp_development_areas enable row level security;
alter table public.idp_focuses enable row level security;
alter table public.idp_clip_bank_items enable row level security;
alter table public.idp_evidence enable row level security;
alter table public.idp_reviews enable row level security;
alter table public.idp_next_actions enable row level security;
alter table public.idp_milestones enable row level security;
alter table public.idp_staff_ownership enable row level security;
alter table public.idp_audit_events enable row level security;

revoke all on public.idp_profiles from anon, authenticated;
revoke all on public.idp_development_areas from anon, authenticated;
revoke all on public.idp_focuses from anon, authenticated;
revoke all on public.idp_clip_bank_items from anon, authenticated;
revoke all on public.idp_evidence from anon, authenticated;
revoke all on public.idp_reviews from anon, authenticated;
revoke all on public.idp_next_actions from anon, authenticated;
revoke all on public.idp_milestones from anon, authenticated;
revoke all on public.idp_staff_ownership from anon, authenticated;
revoke all on public.idp_audit_events from anon, authenticated;

grant select, insert, update, delete on public.idp_profiles to service_role;
grant select, insert, update, delete on public.idp_development_areas to service_role;
grant select, insert, update, delete on public.idp_focuses to service_role;
grant select, insert, update, delete on public.idp_clip_bank_items to service_role;
grant select, insert, update, delete on public.idp_evidence to service_role;
grant select, insert, update, delete on public.idp_reviews to service_role;
grant select, insert, update, delete on public.idp_next_actions to service_role;
grant select, insert, update, delete on public.idp_milestones to service_role;
grant select, insert, update, delete on public.idp_staff_ownership to service_role;
grant select, insert, update, delete on public.idp_audit_events to service_role;

drop trigger if exists idp_profiles_touch_updated_at on public.idp_profiles;
create trigger idp_profiles_touch_updated_at before update on public.idp_profiles for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_development_areas_touch_updated_at on public.idp_development_areas;
create trigger idp_development_areas_touch_updated_at before update on public.idp_development_areas for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_focuses_touch_updated_at on public.idp_focuses;
create trigger idp_focuses_touch_updated_at before update on public.idp_focuses for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_clip_bank_items_touch_updated_at on public.idp_clip_bank_items;
create trigger idp_clip_bank_items_touch_updated_at before update on public.idp_clip_bank_items for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_evidence_touch_updated_at on public.idp_evidence;
create trigger idp_evidence_touch_updated_at before update on public.idp_evidence for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_reviews_touch_updated_at on public.idp_reviews;
create trigger idp_reviews_touch_updated_at before update on public.idp_reviews for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_next_actions_touch_updated_at on public.idp_next_actions;
create trigger idp_next_actions_touch_updated_at before update on public.idp_next_actions for each row execute function app_private.idp_touch_updated_at();
drop trigger if exists idp_staff_ownership_touch_updated_at on public.idp_staff_ownership;
create trigger idp_staff_ownership_touch_updated_at before update on public.idp_staff_ownership for each row execute function app_private.idp_touch_updated_at();

drop trigger if exists idp_profiles_prevent_hard_delete on public.idp_profiles;
create trigger idp_profiles_prevent_hard_delete before delete on public.idp_profiles for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_development_areas_prevent_hard_delete on public.idp_development_areas;
create trigger idp_development_areas_prevent_hard_delete before delete on public.idp_development_areas for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_focuses_prevent_hard_delete on public.idp_focuses;
create trigger idp_focuses_prevent_hard_delete before delete on public.idp_focuses for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_clip_bank_items_prevent_hard_delete on public.idp_clip_bank_items;
create trigger idp_clip_bank_items_prevent_hard_delete before delete on public.idp_clip_bank_items for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_evidence_prevent_hard_delete on public.idp_evidence;
create trigger idp_evidence_prevent_hard_delete before delete on public.idp_evidence for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_reviews_prevent_hard_delete on public.idp_reviews;
create trigger idp_reviews_prevent_hard_delete before delete on public.idp_reviews for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_next_actions_prevent_hard_delete on public.idp_next_actions;
create trigger idp_next_actions_prevent_hard_delete before delete on public.idp_next_actions for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_milestones_prevent_hard_delete on public.idp_milestones;
create trigger idp_milestones_prevent_hard_delete before delete on public.idp_milestones for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_staff_ownership_prevent_hard_delete on public.idp_staff_ownership;
create trigger idp_staff_ownership_prevent_hard_delete before delete on public.idp_staff_ownership for each row execute function app_private.idp_prevent_hard_delete();
drop trigger if exists idp_audit_events_prevent_hard_delete on public.idp_audit_events;
create trigger idp_audit_events_prevent_hard_delete before delete on public.idp_audit_events for each row execute function app_private.idp_prevent_hard_delete();
