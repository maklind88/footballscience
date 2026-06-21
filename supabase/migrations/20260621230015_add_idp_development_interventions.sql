-- IDP Player Board / individual development interventions.
-- These records are owned by IDP and must not use Session Planner state,
-- session blocks, or exercise-library ownership.

create table if not exists public.idp_development_interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  club_id text check (club_id is null or char_length(club_id) <= 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  player_id text not null check (char_length(player_id) between 1 and 160),
  profile_id uuid not null references public.idp_profiles(id) on delete restrict,
  focus_id uuid not null references public.idp_focuses(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  objective text check (objective is null or char_length(objective) <= 1200),
  pitch_mode text not null default 'half' check (pitch_mode in ('full', 'half', 'final-third', 'box')),
  board_state jsonb not null default '{}'::jsonb check (jsonb_typeof(board_state) = 'object'),
  status text not null default 'active' check (status in ('draft', 'active', 'review', 'completed', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  updated_by text check (updated_by is null or char_length(updated_by) <= 160),
  deleted_by text check (deleted_by is null or char_length(deleted_by) <= 160),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idp_development_interventions_player_updated_idx
  on public.idp_development_interventions (team_id, player_id, updated_at desc)
  where deleted_at is null;

create index if not exists idp_development_interventions_focus_status_idx
  on public.idp_development_interventions (focus_id, status, updated_at desc)
  where deleted_at is null;

alter table public.idp_development_interventions enable row level security;

revoke all on public.idp_development_interventions from anon, authenticated;
grant select, insert, update, delete on public.idp_development_interventions to service_role;

drop trigger if exists idp_development_interventions_touch_updated_at on public.idp_development_interventions;
create trigger idp_development_interventions_touch_updated_at
  before update on public.idp_development_interventions
  for each row execute function app_private.idp_touch_updated_at();

drop trigger if exists idp_development_interventions_prevent_hard_delete on public.idp_development_interventions;
create trigger idp_development_interventions_prevent_hard_delete
  before delete on public.idp_development_interventions
  for each row execute function app_private.idp_prevent_hard_delete();
