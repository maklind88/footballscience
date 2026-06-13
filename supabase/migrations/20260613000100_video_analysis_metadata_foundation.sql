-- Football Science Video Analysis metadata foundation.
-- Video remains local. The database stores coaching intelligence only.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app_private;

create or replace function app_private.video_analysis_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.video_analysis_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Video analysis records must be archived, not hard-deleted.';
end;
$$;

create table if not exists public.video_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  match_date date,
  opponent text check (opponent is null or char_length(opponent) <= 180),
  competition text check (competition is null or char_length(competition) <= 180),
  venue text check (venue is null or char_length(venue) <= 180),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_videos (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  local_video_identifier text not null check (char_length(local_video_identifier) between 8 and 240),
  source_kind text not null default 'local-file' check (source_kind in ('local-file', 'desktop-bridge')),
  status text not null default 'active' check (status in ('active', 'missing-local-file', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, local_video_identifier)
);

create table if not exists public.video_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  source_type text not null default 'local-file' check (source_type in ('local-file', 'desktop-bridge')),
  local_video_identifier text not null check (char_length(local_video_identifier) between 8 and 240),
  display_name text not null check (char_length(display_name) between 1 and 180),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  fingerprint_method text not null default 'browser-file-metadata-v1' check (char_length(fingerprint_method) between 1 and 80),
  status text not null default 'available-this-device' check (status in ('available-this-device', 'needs-local-file', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, video_id, local_video_identifier)
);

create table if not exists public.video_clip_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  period text check (period is null or char_length(period) <= 40),
  phase text not null check (phase in ('In Possession', 'Out of Possession', 'Offensive Transition', 'Defensive Transition', 'Set Pieces')),
  sub_phase text not null check (char_length(sub_phase) between 1 and 80),
  team_principle_id text check (team_principle_id is null or char_length(team_principle_id) <= 120),
  mini_game_principle_id text check (mini_game_principle_id is null or char_length(mini_game_principle_id) <= 120),
  outcome text not null default 'Neutral' check (outcome in ('Positive', 'Development', 'Neutral')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_clip_players (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  player_id text not null check (char_length(player_id) between 1 and 160),
  player_label text check (player_label is null or char_length(player_label) <= 180),
  role text not null default 'primary' check (role in ('primary', 'secondary', 'supporting', 'unit')),
  created_at timestamptz not null default now(),
  unique (clip_instance_id, player_id, role)
);

create table if not exists public.video_clip_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  tag text not null check (char_length(tag) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (clip_instance_id, tag)
);

create table if not exists public.video_clip_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  note text not null check (char_length(note) between 1 and 4000),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now()
);

create table if not exists public.video_coding_schemas (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  schema_version integer not null default 1 check (schema_version > 0),
  schema_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.video_playlists (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  purpose text not null default 'review' check (purpose in ('review', 'player-review', 'team-meeting', 'unit-meeting')),
  owner_id text check (owner_id is null or char_length(owner_id) <= 160),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_playlist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  playlist_id uuid not null references public.video_playlists(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  custom_note text check (custom_note is null or char_length(custom_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (playlist_id, clip_instance_id)
);

create table if not exists public.video_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text check (organization_id is null or char_length(organization_id) <= 160),
  team_id text check (team_id is null or char_length(team_id) <= 160),
  action text not null check (char_length(action) between 2 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  actor_id text check (actor_id is null or char_length(actor_id) <= 160),
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now(),
  request_id text check (request_id is null or char_length(request_id) <= 160),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_matches_team_date_idx on public.video_matches (team_id, match_date desc, created_at desc) where status = 'active';
create index if not exists video_videos_match_idx on public.video_videos (match_id, created_at desc) where status <> 'archived';
create index if not exists video_sources_video_idx on public.video_sources (video_id, created_at desc) where status <> 'archived';
create index if not exists video_sources_identifier_idx on public.video_sources (team_id, local_video_identifier);
create index if not exists video_clip_instances_match_start_idx on public.video_clip_instances (match_id, start_ms, id) where status = 'active';
create index if not exists video_clip_instances_video_start_idx on public.video_clip_instances (video_id, start_ms, id) where status = 'active';
create index if not exists video_clip_instances_language_idx on public.video_clip_instances (team_id, phase, sub_phase, outcome) where status = 'active';
create index if not exists video_clip_instances_principle_idx on public.video_clip_instances (team_principle_id, mini_game_principle_id) where status = 'active';
create index if not exists video_clip_players_player_idx on public.video_clip_players (team_id, player_id, created_at desc);
create index if not exists video_clip_tags_tag_trgm_idx on public.video_clip_tags using gin ((lower(tag)) gin_trgm_ops);
create index if not exists video_clip_notes_note_trgm_idx on public.video_clip_notes using gin ((lower(note)) gin_trgm_ops);
create index if not exists video_playlists_team_created_idx on public.video_playlists (team_id, created_at desc) where status <> 'archived';
create index if not exists video_playlist_items_playlist_order_idx on public.video_playlist_items (playlist_id, sort_order, id);
create index if not exists video_audit_events_team_created_idx on public.video_audit_events (team_id, created_at desc);

alter table public.video_matches enable row level security;
alter table public.video_videos enable row level security;
alter table public.video_sources enable row level security;
alter table public.video_clip_instances enable row level security;
alter table public.video_clip_players enable row level security;
alter table public.video_clip_tags enable row level security;
alter table public.video_clip_notes enable row level security;
alter table public.video_coding_schemas enable row level security;
alter table public.video_playlists enable row level security;
alter table public.video_playlist_items enable row level security;
alter table public.video_audit_events enable row level security;

revoke all on public.video_matches from anon, authenticated;
revoke all on public.video_videos from anon, authenticated;
revoke all on public.video_sources from anon, authenticated;
revoke all on public.video_clip_instances from anon, authenticated;
revoke all on public.video_clip_players from anon, authenticated;
revoke all on public.video_clip_tags from anon, authenticated;
revoke all on public.video_clip_notes from anon, authenticated;
revoke all on public.video_coding_schemas from anon, authenticated;
revoke all on public.video_playlists from anon, authenticated;
revoke all on public.video_playlist_items from anon, authenticated;
revoke all on public.video_audit_events from anon, authenticated;

grant select, insert, update, delete on public.video_matches to service_role;
grant select, insert, update, delete on public.video_videos to service_role;
grant select, insert, update, delete on public.video_sources to service_role;
grant select, insert, update, delete on public.video_clip_instances to service_role;
grant select, insert, update, delete on public.video_clip_players to service_role;
grant select, insert, update, delete on public.video_clip_tags to service_role;
grant select, insert, update, delete on public.video_clip_notes to service_role;
grant select, insert, update, delete on public.video_coding_schemas to service_role;
grant select, insert, update, delete on public.video_playlists to service_role;
grant select, insert, update, delete on public.video_playlist_items to service_role;
grant select, insert, update, delete on public.video_audit_events to service_role;

drop trigger if exists video_matches_touch_updated_at on public.video_matches;
create trigger video_matches_touch_updated_at before update on public.video_matches for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_videos_touch_updated_at on public.video_videos;
create trigger video_videos_touch_updated_at before update on public.video_videos for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_sources_touch_updated_at on public.video_sources;
create trigger video_sources_touch_updated_at before update on public.video_sources for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_clip_instances_touch_updated_at on public.video_clip_instances;
create trigger video_clip_instances_touch_updated_at before update on public.video_clip_instances for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_coding_schemas_touch_updated_at on public.video_coding_schemas;
create trigger video_coding_schemas_touch_updated_at before update on public.video_coding_schemas for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_playlists_touch_updated_at on public.video_playlists;
create trigger video_playlists_touch_updated_at before update on public.video_playlists for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_matches_prevent_hard_delete on public.video_matches;
create trigger video_matches_prevent_hard_delete before delete on public.video_matches for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_videos_prevent_hard_delete on public.video_videos;
create trigger video_videos_prevent_hard_delete before delete on public.video_videos for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_sources_prevent_hard_delete on public.video_sources;
create trigger video_sources_prevent_hard_delete before delete on public.video_sources for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_instances_prevent_hard_delete on public.video_clip_instances;
create trigger video_clip_instances_prevent_hard_delete before delete on public.video_clip_instances for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_players_prevent_hard_delete on public.video_clip_players;
create trigger video_clip_players_prevent_hard_delete before delete on public.video_clip_players for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_tags_prevent_hard_delete on public.video_clip_tags;
create trigger video_clip_tags_prevent_hard_delete before delete on public.video_clip_tags for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_notes_prevent_hard_delete on public.video_clip_notes;
create trigger video_clip_notes_prevent_hard_delete before delete on public.video_clip_notes for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_playlists_prevent_hard_delete on public.video_playlists;
create trigger video_playlists_prevent_hard_delete before delete on public.video_playlists for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_playlist_items_prevent_hard_delete on public.video_playlist_items;
create trigger video_playlist_items_prevent_hard_delete before delete on public.video_playlist_items for each row execute function app_private.video_analysis_prevent_hard_delete();

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('video-analysis', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance'], 'team', true, true, 'Read local video metadata, clip instances, tags, notes, players, and review lists.'),
  ('video-analysis', 'write', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Create and update local video references, clip coding metadata, notes, and review lists.'),
  ('video-analysis', 'delete', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Archive video analysis metadata without deleting local video files.'),
  ('video-analysis', 'export', array['admin','coach','analyst'], 'team', true, true, 'Export video analysis metadata for authorized coaching review.'),
  ('video-analysis', 'restore', array['admin','coach'], 'team', true, true, 'Restore video analysis metadata from audited backups.'),
  ('video-analysis', 'admin', array['admin'], 'team', true, true, 'Administer Video Analysis access controls and coding schema governance.'),
  ('video-analysis', 'observe', array['admin','coach','analyst'], 'team', true, true, 'Observe Video Analysis health and metadata coverage.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
