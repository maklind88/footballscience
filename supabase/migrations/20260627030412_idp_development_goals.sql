-- IDP Player Development Goals.
-- Goals and check-ins are owned by IDP. They may reference focuses and player
-- board interventions, but must not use Session Planner state as source data.

create table if not exists public.idp_development_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  club_id text check (club_id is null or char_length(club_id) <= 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid not null references public.idp_profiles(id) on delete restrict,
  focus_id uuid references public.idp_focuses(id) on delete set null,
  goal_role text not null default 'supporting' check (goal_role in ('primary', 'supporting', 'leadership')),
  category text not null check (category in ('Technical', 'Tactical', 'Physical', 'Psychological', 'Leadership')),
  title text not null check (char_length(title) between 1 and 180),
  description text check (description is null or char_length(description) <= 1200),
  metric_label text not null check (char_length(metric_label) between 1 and 160),
  metric_type text not null default 'observation' check (metric_type in ('observation', 'count', 'percentage', 'rating', 'time', 'distance', 'custom')),
  baseline_value numeric(10,2),
  current_value numeric(10,2),
  target_value numeric(10,2),
  unit text check (unit is null or char_length(unit) <= 40),
  cadence text not null default 'weekly' check (cadence in ('daily', 'weekly', 'biweekly', 'monthly', 'review')),
  due_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'at_risk', 'achieved', 'paused', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint idp_development_goals_target_range_check check (
    baseline_value is null or target_value is null or baseline_value <> target_value
  )
);

create table if not exists public.idp_goal_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  club_id text check (club_id is null or char_length(club_id) <= 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid not null references public.idp_profiles(id) on delete restrict,
  goal_id uuid not null references public.idp_development_goals(id) on delete restrict,
  focus_id uuid references public.idp_focuses(id) on delete set null,
  value numeric(10,2),
  confidence integer check (confidence is null or confidence between 1 and 5),
  note text check (note is null or char_length(note) <= 1200),
  status_snapshot text check (status_snapshot is null or status_snapshot in ('draft', 'active', 'at_risk', 'achieved', 'paused', 'archived')),
  checkin_on date not null default current_date,
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

alter table public.idp_development_interventions
  add column if not exists goal_id uuid references public.idp_development_goals(id) on delete set null,
  add column if not exists coaching_cue text check (coaching_cue is null or char_length(coaching_cue) <= 800),
  add column if not exists success_criteria text[] not null default '{}'::text[];

create index if not exists idp_development_goals_player_status_idx
  on public.idp_development_goals (team_id, player_id, status, due_on, updated_at desc)
  where deleted_at is null;

create index if not exists idp_development_goals_focus_status_idx
  on public.idp_development_goals (focus_id, status, updated_at desc)
  where deleted_at is null and focus_id is not null;

create index if not exists idp_development_goals_role_idx
  on public.idp_development_goals (team_id, player_id, goal_role, status)
  where deleted_at is null;

create index if not exists idp_goal_checkins_goal_recent_idx
  on public.idp_goal_checkins (goal_id, checkin_on desc, created_at desc)
  where deleted_at is null;

create index if not exists idp_goal_checkins_player_recent_idx
  on public.idp_goal_checkins (team_id, player_id, checkin_on desc, created_at desc)
  where deleted_at is null;

create index if not exists idp_development_interventions_goal_idx
  on public.idp_development_interventions (goal_id, status, updated_at desc)
  where deleted_at is null and goal_id is not null;

alter table public.idp_development_goals enable row level security;
alter table public.idp_goal_checkins enable row level security;

revoke all on public.idp_development_goals from anon, authenticated;
revoke all on public.idp_goal_checkins from anon, authenticated;
grant select, insert, update, delete on public.idp_development_goals to service_role;
grant select, insert, update, delete on public.idp_goal_checkins to service_role;

drop trigger if exists idp_development_goals_touch_updated_at on public.idp_development_goals;
create trigger idp_development_goals_touch_updated_at
  before update on public.idp_development_goals
  for each row execute function app_private.idp_touch_updated_at();

drop trigger if exists idp_goal_checkins_touch_updated_at on public.idp_goal_checkins;
create trigger idp_goal_checkins_touch_updated_at
  before update on public.idp_goal_checkins
  for each row execute function app_private.idp_touch_updated_at();

drop trigger if exists idp_development_goals_prevent_hard_delete on public.idp_development_goals;
create trigger idp_development_goals_prevent_hard_delete
  before delete on public.idp_development_goals
  for each row execute function app_private.idp_prevent_hard_delete();

drop trigger if exists idp_goal_checkins_prevent_hard_delete on public.idp_goal_checkins;
create trigger idp_goal_checkins_prevent_hard_delete
  before delete on public.idp_goal_checkins
  for each row execute function app_private.idp_prevent_hard_delete();
