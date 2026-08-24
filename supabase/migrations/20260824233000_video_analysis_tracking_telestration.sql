-- FS Player Elite tracking and dynamic telestration metadata.
-- Raw video and dense tracking samples remain device-local.

create table if not exists public.video_object_tracks (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  entity_type text not null default 'player' check (entity_type in ('player','ball','referee','area','unknown')),
  player_id text check (player_id is null or char_length(player_id) <= 160),
  player_label text check (player_label is null or char_length(player_label) <= 180),
  team_side text check (team_side is null or char_length(team_side) <= 80),
  shirt_number text check (shirt_number is null or char_length(shirt_number) <= 24),
  start_ms bigint not null check (start_ms >= 0),
  end_ms bigint not null check (end_ms > start_ms),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  identity_confidence numeric(5,4) not null default 0 check (identity_confidence between 0 and 1),
  coverage_ratio numeric(5,4) not null default 0 check (coverage_ratio between 0 and 1),
  point_count integer not null default 0 check (point_count >= 0),
  segment_count integer not null default 0 check (segment_count >= 0),
  engine text check (engine is null or char_length(engine) <= 120),
  engine_version text check (engine_version is null or char_length(engine_version) <= 80),
  local_artifact_id text check (local_artifact_id is null or char_length(local_artifact_id) <= 180),
  local_artifact_hash text check (local_artifact_hash is null or char_length(local_artifact_hash) <= 128),
  status text not null default 'review' check (status in ('draft','processing','review','verified','archived')),
  revision integer not null default 1 check (revision > 0),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 160),
  reviewed_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_object_tracks_clip_time_idx
  on public.video_object_tracks (clip_instance_id, start_ms, end_ms, id)
  where status <> 'archived';

create index if not exists video_object_tracks_player_time_idx
  on public.video_object_tracks (team_id, player_id, match_id, start_ms)
  where status <> 'archived' and player_id is not null;

create table if not exists public.video_track_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  object_track_id uuid not null references public.video_object_tracks(id) on delete restrict,
  at_ms bigint not null check (at_ms >= 0),
  correction_type text not null default 'position' check (correction_type in ('position','identity','occlusion','split','merge')),
  box_json jsonb not null default '{}'::jsonb,
  ground_point_json jsonb not null default '{}'::jsonb,
  player_id text check (player_id is null or char_length(player_id) <= 160),
  player_label text check (player_label is null or char_length(player_label) <= 180),
  reason text check (reason is null or char_length(reason) <= 1000),
  corrected_by text check (corrected_by is null or char_length(corrected_by) <= 160),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_track_corrections_track_time_idx
  on public.video_track_corrections (object_track_id, at_ms, created_at, id)
  where status = 'active';

create table if not exists public.video_dynamic_graphics (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  presentation_item_id uuid references public.video_presentation_items(id) on delete restrict,
  graphic_type text not null check (graphic_type in ('arrow','circle','spotlight','label','trail','distance','unit-hull','unit-line','movement-curve')),
  source text not null check (source in ('static','tracking','spatial')),
  start_ms bigint not null check (start_ms >= 0),
  end_ms bigint not null check (end_ms > start_ms),
  layer_text text check (layer_text is null or char_length(layer_text) <= 500),
  bindings_json jsonb not null default '[]'::jsonb check (jsonb_typeof(bindings_json) = 'array' and jsonb_array_length(bindings_json) <= 40),
  static_points_json jsonb not null default '[]'::jsonb check (jsonb_typeof(static_points_json) = 'array' and jsonb_array_length(static_points_json) <= 500),
  style_json jsonb not null default '{}'::jsonb,
  trail_duration_ms integer not null default 2000 check (trail_duration_ms between 0 and 120000),
  confidence_threshold numeric(5,4) not null default 0.55 check (confidence_threshold between 0 and 1),
  locked boolean not null default false,
  hidden boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  revision integer not null default 1 check (revision > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_dynamic_graphics_clip_time_idx
  on public.video_dynamic_graphics (clip_instance_id, start_ms, end_ms, id)
  where status = 'active';

alter table public.video_object_tracks enable row level security;
alter table public.video_track_corrections enable row level security;
alter table public.video_dynamic_graphics enable row level security;

revoke all on public.video_object_tracks from anon, authenticated;
revoke all on public.video_track_corrections from anon, authenticated;
revoke all on public.video_dynamic_graphics from anon, authenticated;

grant select, insert, update, delete on public.video_object_tracks to service_role;
grant select, insert, update, delete on public.video_track_corrections to service_role;
grant select, insert, update, delete on public.video_dynamic_graphics to service_role;

create or replace function app_private.video_analysis_increment_tracking_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

revoke all on function app_private.video_analysis_increment_tracking_revision() from public, anon, authenticated;
grant execute on function app_private.video_analysis_increment_tracking_revision() to service_role;

drop trigger if exists video_object_tracks_touch_updated_at on public.video_object_tracks;
create trigger video_object_tracks_touch_updated_at before update on public.video_object_tracks
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_object_tracks_increment_revision on public.video_object_tracks;
create trigger video_object_tracks_increment_revision before update on public.video_object_tracks
  for each row execute function app_private.video_analysis_increment_tracking_revision();
drop trigger if exists video_object_tracks_prevent_hard_delete on public.video_object_tracks;
create trigger video_object_tracks_prevent_hard_delete before delete on public.video_object_tracks
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_track_corrections_prevent_hard_delete on public.video_track_corrections;
create trigger video_track_corrections_prevent_hard_delete before delete on public.video_track_corrections
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_dynamic_graphics_touch_updated_at on public.video_dynamic_graphics;
create trigger video_dynamic_graphics_touch_updated_at before update on public.video_dynamic_graphics
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_dynamic_graphics_increment_revision on public.video_dynamic_graphics;
create trigger video_dynamic_graphics_increment_revision before update on public.video_dynamic_graphics
  for each row execute function app_private.video_analysis_increment_tracking_revision();
drop trigger if exists video_dynamic_graphics_prevent_hard_delete on public.video_dynamic_graphics;
create trigger video_dynamic_graphics_prevent_hard_delete before delete on public.video_dynamic_graphics
  for each row execute function app_private.video_analysis_prevent_hard_delete();
