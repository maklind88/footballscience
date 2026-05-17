-- Football Science DB foundation.
-- Global, server-first player identity and season data store for Scouting and future
-- analytics. Large datasets must stay behind guarded APIs with search, filters,
-- and pagination; raw provider dumps must not be shipped to the browser.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pgcrypto set schema extensions;
alter extension pg_trgm set schema extensions;

create schema if not exists app_private;

create or replace function app_private.is_fsdb_reader()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in (
    'admin',
    'club-admin',
    'team-admin',
    'coach',
    'scout',
    'analyst',
    'performance',
    'medical'
  );
$$;

create or replace function app_private.is_fsdb_writer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'scout', 'analyst');
$$;

create or replace function app_private.fsdb_touch_updated_at_and_row_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and to_jsonb(new) is distinct from to_jsonb(old) and to_jsonb(new) ? 'row_version' then
    new.row_version = coalesce(old.row_version, 1) + 1;
  end if;
  return new;
end;
$$;

create or replace function app_private.fsdb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.fsdb_metric_count_from_jsonb()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.metric_count = (
    select count(*)::integer
    from jsonb_each(new.metrics) as metric(key, value)
    where metric.value is not null and metric.value <> 'null'::jsonb
  );
  return new;
end;
$$;

create or replace function app_private.fsdb_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Football Science DB records must be archived, not hard deleted.';
end;
$$;

create table if not exists public.fsdb_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  source_system text not null check (source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  source_label text not null check (char_length(source_label) between 2 and 160),
  source_url text check (source_url is null or char_length(source_url) <= 600),
  source_file_name text check (source_file_name is null or char_length(source_file_name) <= 240),
  source_license text check (source_license is null or char_length(source_license) <= 120),
  source_version text check (source_version is null or char_length(source_version) <= 120),
  entity_scope text not null default 'players' check (entity_scope in ('players', 'teams', 'competitions', 'rosters', 'stats', 'mixed')),
  status text not null default 'staged' check (status in ('staged', 'running', 'published', 'failed', 'archived')),
  row_count integer not null default 0 check (row_count >= 0),
  player_count integer not null default 0 check (player_count >= 0),
  team_count integer not null default 0 check (team_count >= 0),
  competition_count integer not null default 0 check (competition_count >= 0),
  roster_count integer not null default 0 check (roster_count >= 0),
  stats_count integer not null default 0 check (stats_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  data_hash text check (data_hash is null or char_length(data_hash) = 64),
  imported_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.fsdb_teams (
  id uuid primary key default extensions.gen_random_uuid(),
  fsdb_id text not null unique default ('fsdb_t' || replace(extensions.gen_random_uuid()::text, '-', '')),
  canonical_name text not null check (char_length(canonical_name) between 1 and 180),
  short_name text check (short_name is null or char_length(short_name) <= 120),
  country text check (country is null or char_length(country) <= 120),
  city text check (city is null or char_length(city) <= 120),
  gender_segment text not null default 'unknown' check (gender_segment in ('women', 'men', 'mixed', 'unknown')),
  current_competition_name text check (current_competition_name is null or char_length(current_competition_name) <= 180),
  active_status text not null default 'active' check (active_status in ('active', 'inactive', 'archived', 'unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0),
  search_text text generated always as (
    lower(
      coalesce(canonical_name, '') || ' ' ||
      coalesce(short_name, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(current_competition_name, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.fsdb_competitions (
  id uuid primary key default extensions.gen_random_uuid(),
  fsdb_id text not null unique default ('fsdb_c' || replace(extensions.gen_random_uuid()::text, '-', '')),
  canonical_name text not null check (char_length(canonical_name) between 1 and 180),
  country text check (country is null or char_length(country) <= 120),
  region text check (region is null or char_length(region) <= 120),
  gender_segment text not null default 'unknown' check (gender_segment in ('women', 'men', 'mixed', 'unknown')),
  competition_type text not null default 'league' check (competition_type in ('league', 'cup', 'tournament', 'friendly', 'unknown')),
  tier integer check (tier is null or tier >= 0),
  active_status text not null default 'active' check (active_status in ('active', 'inactive', 'archived', 'unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0),
  search_text text generated always as (
    lower(
      coalesce(canonical_name, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(region, '') || ' ' ||
      coalesce(competition_type, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.fsdb_players (
  id uuid primary key default extensions.gen_random_uuid(),
  fsdb_id text not null unique default ('fsdb_p' || replace(extensions.gen_random_uuid()::text, '-', '')),
  canonical_name text not null check (char_length(canonical_name) between 1 and 180),
  full_name text check (full_name is null or char_length(full_name) <= 240),
  sort_name text not null check (char_length(sort_name) between 1 and 180),
  display_name text check (display_name is null or char_length(display_name) <= 180),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 260),
  name_quality text not null default 'unknown' check (name_quality in ('full', 'initial', 'unknown')),
  date_of_birth date,
  birth_year integer check (birth_year is null or birth_year between 1880 and 2100),
  gender_segment text not null default 'unknown' check (gender_segment in ('women', 'men', 'mixed', 'unknown')),
  nationality text check (nationality is null or char_length(nationality) <= 120),
  birth_country text check (birth_country is null or char_length(birth_country) <= 120),
  passport_countries text[] not null default '{}'::text[],
  primary_position text check (primary_position is null or char_length(primary_position) <= 80),
  position_group text check (position_group is null or char_length(position_group) <= 40),
  position_detail text check (position_detail is null or char_length(position_detail) <= 160),
  preferred_foot text check (preferred_foot is null or preferred_foot in ('right', 'left', 'both', 'unknown')),
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  current_team_id uuid references public.fsdb_teams(id) on delete set null,
  current_team_name text check (current_team_name is null or char_length(current_team_name) <= 180),
  current_competition_id uuid references public.fsdb_competitions(id) on delete set null,
  current_competition_name text check (current_competition_name is null or char_length(current_competition_name) <= 180),
  current_country text check (current_country is null or char_length(current_country) <= 120),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_roster_seen_at timestamptz,
  source_priority text check (source_priority is null or char_length(source_priority) <= 80),
  source_confidence numeric(5,2) not null default 0 check (source_confidence between 0 and 100),
  source_link_count integer not null default 0 check (source_link_count >= 0),
  roster_entry_count integer not null default 0 check (roster_entry_count >= 0),
  season_stat_count integer not null default 0 check (season_stat_count >= 0),
  metric_count integer not null default 0 check (metric_count >= 0),
  identity_status text not null default 'unverified' check (identity_status in ('verified', 'linked', 'unverified', 'needs-review', 'duplicate', 'archived')),
  active_status text not null default 'unknown' check (active_status in ('active', 'inactive', 'retired', 'archived', 'unknown')),
  row_version integer not null default 1 check (row_version > 0),
  search_text text generated always as (
    lower(
      coalesce(canonical_name, '') || ' ' ||
      coalesce(full_name, '') || ' ' ||
      coalesce(display_name, '') || ' ' ||
      coalesce(nationality, '') || ' ' ||
      coalesce(birth_country, '') || ' ' ||
      coalesce(primary_position, '') || ' ' ||
      coalesce(position_group, '') || ' ' ||
      coalesce(position_detail, '') || ' ' ||
      coalesce(current_team_name, '') || ' ' ||
      coalesce(current_competition_name, '') || ' ' ||
      coalesce(current_country, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.fsdb_player_aliases (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.fsdb_players(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 240),
  alias_type text not null default 'name' check (alias_type in ('name', 'full-name', 'local-name', 'short-name', 'transliteration', 'former-name', 'nickname', 'other')),
  source_system text check (source_system is null or source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  locale text check (locale is null or char_length(locale) <= 20),
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  status text not null default 'active' check (status in ('active', 'archived')),
  search_text text generated always as (lower(coalesce(alias, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.fsdb_player_source_links (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.fsdb_players(id) on delete cascade,
  source_system text not null check (source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  source_entity_id text not null check (char_length(source_entity_id) between 1 and 180),
  source_url text check (source_url is null or char_length(source_url) <= 600),
  source_slug text check (source_slug is null or char_length(source_slug) <= 240),
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  verified_status text not null default 'unverified' check (verified_status in ('verified', 'linked', 'unverified', 'conflict', 'archived')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_system, source_entity_id)
);

create table if not exists public.fsdb_roster_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.fsdb_players(id) on delete cascade,
  team_id uuid references public.fsdb_teams(id) on delete set null,
  competition_id uuid references public.fsdb_competitions(id) on delete set null,
  season_label text check (season_label is null or char_length(season_label) <= 80),
  gender_segment text not null default 'unknown' check (gender_segment in ('women', 'men', 'mixed', 'unknown')),
  team_name text check (team_name is null or char_length(team_name) <= 180),
  competition_name text check (competition_name is null or char_length(competition_name) <= 180),
  country text check (country is null or char_length(country) <= 120),
  shirt_number text check (shirt_number is null or char_length(shirt_number) <= 20),
  position_text text check (position_text is null or char_length(position_text) <= 160),
  position_group text check (position_group is null or char_length(position_group) <= 40),
  roster_status text not null default 'listed' check (roster_status in ('listed', 'active', 'loan', 'trial', 'academy', 'inactive', 'archived', 'unknown')),
  valid_from date,
  valid_to date,
  source_system text not null default 'manual' check (source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  source_record_id text not null default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex') check (char_length(source_record_id) between 1 and 180),
  source_confidence numeric(5,2) not null default 0 check (source_confidence between 0 and 100),
  row_version integer not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 1200),
  search_text text generated always as (
    lower(
      coalesce(team_name, '') || ' ' ||
      coalesce(competition_name, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(position_text, '') || ' ' ||
      coalesce(season_label, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_system, source_record_id)
);

create table if not exists public.fsdb_player_season_stats (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.fsdb_players(id) on delete cascade,
  roster_entry_id uuid references public.fsdb_roster_entries(id) on delete set null,
  team_id uuid references public.fsdb_teams(id) on delete set null,
  competition_id uuid references public.fsdb_competitions(id) on delete set null,
  season_label text check (season_label is null or char_length(season_label) <= 80),
  gender_segment text not null default 'unknown' check (gender_segment in ('women', 'men', 'mixed', 'unknown')),
  team_name text check (team_name is null or char_length(team_name) <= 180),
  competition_name text check (competition_name is null or char_length(competition_name) <= 180),
  position_text text check (position_text is null or char_length(position_text) <= 160),
  matches integer check (matches is null or matches >= 0),
  starts integer check (starts is null or starts >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  metrics jsonb not null default '{}'::jsonb,
  metric_quality jsonb not null default '{}'::jsonb,
  metric_count integer not null default 0 check (metric_count >= 0),
  source_system text not null default 'manual' check (source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  source_record_id text not null default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex') check (char_length(source_record_id) between 1 and 180),
  source_confidence numeric(5,2) not null default 0 check (source_confidence between 0 and 100),
  row_version integer not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 1200),
  search_text text generated always as (
    lower(
      coalesce(team_name, '') || ' ' ||
      coalesce(competition_name, '') || ' ' ||
      coalesce(position_text, '') || ' ' ||
      coalesce(season_label, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_system, source_record_id)
);

create table if not exists public.fsdb_import_errors (
  id uuid primary key default extensions.gen_random_uuid(),
  import_batch_id uuid references public.fsdb_import_batches(id) on delete cascade,
  source_system text not null check (source_system ~ '^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$'),
  source_record_id text check (source_record_id is null or char_length(source_record_id) <= 180),
  row_number integer check (row_number is null or row_number >= 0),
  error_type text not null check (char_length(error_type) between 2 and 80),
  error_message text not null check (char_length(error_message) between 2 and 1200),
  raw_record jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists fsdb_import_batches_source_status_idx on public.fsdb_import_batches (source_system, status, created_at desc);
create index if not exists fsdb_players_search_trgm_idx on public.fsdb_players using gin (search_text extensions.gin_trgm_ops);
create index if not exists fsdb_players_name_trgm_idx on public.fsdb_players using gin (sort_name extensions.gin_trgm_ops);
create index if not exists fsdb_players_filter_idx on public.fsdb_players (gender_segment, position_group, active_status, last_seen_at desc, id);
create index if not exists fsdb_players_birth_idx on public.fsdb_players (date_of_birth, birth_year);
create index if not exists fsdb_players_nationality_idx on public.fsdb_players (nationality, current_country);
create index if not exists fsdb_players_team_idx on public.fsdb_players (current_team_id, current_team_name);
create index if not exists fsdb_players_competition_idx on public.fsdb_players (current_competition_id, current_competition_name);
create index if not exists fsdb_players_cursor_idx on public.fsdb_players (sort_name, id);
create index if not exists fsdb_players_updated_idx on public.fsdb_players (updated_at desc, id);
create unique index if not exists fsdb_players_dedupe_key_unique_idx
  on public.fsdb_players (dedupe_key)
  where dedupe_key is not null and identity_status <> 'duplicate' and active_status <> 'archived';
create index if not exists fsdb_players_readiness_idx
  on public.fsdb_players (name_quality, roster_entry_count, season_stat_count, metric_count, updated_at desc);
create index if not exists fsdb_player_aliases_search_trgm_idx on public.fsdb_player_aliases using gin (search_text extensions.gin_trgm_ops);
create index if not exists fsdb_player_aliases_player_idx on public.fsdb_player_aliases (player_id, status);
create unique index if not exists fsdb_player_aliases_player_alias_unique_idx
  on public.fsdb_player_aliases (player_id, lower(alias), coalesce(source_system, 'manual'));
create index if not exists fsdb_player_source_links_player_idx on public.fsdb_player_source_links (player_id, verified_status);
create index if not exists fsdb_player_source_links_source_idx on public.fsdb_player_source_links (source_system, source_entity_id);
create index if not exists fsdb_teams_search_trgm_idx on public.fsdb_teams using gin (search_text extensions.gin_trgm_ops);
create index if not exists fsdb_teams_filter_idx on public.fsdb_teams (gender_segment, country, active_status, canonical_name);
create index if not exists fsdb_competitions_search_trgm_idx on public.fsdb_competitions using gin (search_text extensions.gin_trgm_ops);
create index if not exists fsdb_competitions_filter_idx on public.fsdb_competitions (gender_segment, country, competition_type, tier);
create index if not exists fsdb_roster_entries_player_idx on public.fsdb_roster_entries (player_id, season_label desc, roster_status);
create index if not exists fsdb_roster_entries_team_idx on public.fsdb_roster_entries (team_id, season_label desc, roster_status);
create index if not exists fsdb_roster_entries_competition_idx on public.fsdb_roster_entries (competition_id, season_label desc, roster_status);
create index if not exists fsdb_roster_entries_search_trgm_idx on public.fsdb_roster_entries using gin (search_text extensions.gin_trgm_ops) where deleted_at is null;
create index if not exists fsdb_player_season_stats_player_idx on public.fsdb_player_season_stats (player_id, season_label desc, minutes desc);
create index if not exists fsdb_player_season_stats_team_idx on public.fsdb_player_season_stats (team_id, season_label desc, minutes desc);
create index if not exists fsdb_player_season_stats_competition_idx on public.fsdb_player_season_stats (competition_id, season_label desc, minutes desc);
create index if not exists fsdb_player_season_stats_metrics_gin_idx on public.fsdb_player_season_stats using gin (metrics jsonb_path_ops) where deleted_at is null;
create index if not exists fsdb_player_season_stats_search_trgm_idx on public.fsdb_player_season_stats using gin (search_text extensions.gin_trgm_ops) where deleted_at is null;
create index if not exists fsdb_import_errors_batch_idx on public.fsdb_import_errors (import_batch_id, created_at desc);

drop trigger if exists fsdb_import_batches_touch_updated_at on public.fsdb_import_batches;
create trigger fsdb_import_batches_touch_updated_at before update on public.fsdb_import_batches for each row execute function app_private.fsdb_touch_updated_at();

drop trigger if exists fsdb_teams_touch_updated_at on public.fsdb_teams;
create trigger fsdb_teams_touch_updated_at before update on public.fsdb_teams for each row execute function app_private.fsdb_touch_updated_at_and_row_version();

drop trigger if exists fsdb_competitions_touch_updated_at on public.fsdb_competitions;
create trigger fsdb_competitions_touch_updated_at before update on public.fsdb_competitions for each row execute function app_private.fsdb_touch_updated_at_and_row_version();

drop trigger if exists fsdb_players_touch_updated_at on public.fsdb_players;
create trigger fsdb_players_touch_updated_at before update on public.fsdb_players for each row execute function app_private.fsdb_touch_updated_at_and_row_version();

drop trigger if exists fsdb_player_aliases_touch_updated_at on public.fsdb_player_aliases;
create trigger fsdb_player_aliases_touch_updated_at before update on public.fsdb_player_aliases for each row execute function app_private.fsdb_touch_updated_at();

drop trigger if exists fsdb_player_source_links_touch_updated_at on public.fsdb_player_source_links;
create trigger fsdb_player_source_links_touch_updated_at before update on public.fsdb_player_source_links for each row execute function app_private.fsdb_touch_updated_at();

drop trigger if exists fsdb_roster_entries_touch_updated_at on public.fsdb_roster_entries;
create trigger fsdb_roster_entries_touch_updated_at before update on public.fsdb_roster_entries for each row execute function app_private.fsdb_touch_updated_at_and_row_version();

drop trigger if exists fsdb_player_season_stats_metric_count on public.fsdb_player_season_stats;
create trigger fsdb_player_season_stats_metric_count before insert or update of metrics on public.fsdb_player_season_stats for each row execute function app_private.fsdb_metric_count_from_jsonb();

drop trigger if exists fsdb_player_season_stats_touch_updated_at on public.fsdb_player_season_stats;
create trigger fsdb_player_season_stats_touch_updated_at before update on public.fsdb_player_season_stats for each row execute function app_private.fsdb_touch_updated_at_and_row_version();

drop trigger if exists fsdb_players_prevent_hard_delete on public.fsdb_players;
create trigger fsdb_players_prevent_hard_delete before delete on public.fsdb_players for each row execute function app_private.fsdb_prevent_hard_delete();

drop trigger if exists fsdb_player_aliases_prevent_hard_delete on public.fsdb_player_aliases;
create trigger fsdb_player_aliases_prevent_hard_delete before delete on public.fsdb_player_aliases for each row execute function app_private.fsdb_prevent_hard_delete();

drop trigger if exists fsdb_player_source_links_prevent_hard_delete on public.fsdb_player_source_links;
create trigger fsdb_player_source_links_prevent_hard_delete before delete on public.fsdb_player_source_links for each row execute function app_private.fsdb_prevent_hard_delete();

drop trigger if exists fsdb_roster_entries_prevent_hard_delete on public.fsdb_roster_entries;
create trigger fsdb_roster_entries_prevent_hard_delete before delete on public.fsdb_roster_entries for each row execute function app_private.fsdb_prevent_hard_delete();

drop trigger if exists fsdb_player_season_stats_prevent_hard_delete on public.fsdb_player_season_stats;
create trigger fsdb_player_season_stats_prevent_hard_delete before delete on public.fsdb_player_season_stats for each row execute function app_private.fsdb_prevent_hard_delete();

alter table public.fsdb_import_batches enable row level security;
alter table public.fsdb_teams enable row level security;
alter table public.fsdb_competitions enable row level security;
alter table public.fsdb_players enable row level security;
alter table public.fsdb_player_aliases enable row level security;
alter table public.fsdb_player_source_links enable row level security;
alter table public.fsdb_roster_entries enable row level security;
alter table public.fsdb_player_season_stats enable row level security;
alter table public.fsdb_import_errors enable row level security;

revoke all on public.fsdb_import_batches from anon, authenticated;
revoke all on public.fsdb_teams from anon, authenticated;
revoke all on public.fsdb_competitions from anon, authenticated;
revoke all on public.fsdb_players from anon, authenticated;
revoke all on public.fsdb_player_aliases from anon, authenticated;
revoke all on public.fsdb_player_source_links from anon, authenticated;
revoke all on public.fsdb_roster_entries from anon, authenticated;
revoke all on public.fsdb_player_season_stats from anon, authenticated;
revoke all on public.fsdb_import_errors from anon, authenticated;

grant select on public.fsdb_import_batches to authenticated;
grant select on public.fsdb_teams to authenticated;
grant select on public.fsdb_competitions to authenticated;
grant select on public.fsdb_players to authenticated;
grant select on public.fsdb_player_aliases to authenticated;
grant select on public.fsdb_player_source_links to authenticated;
grant select on public.fsdb_roster_entries to authenticated;
grant select on public.fsdb_player_season_stats to authenticated;
grant select on public.fsdb_import_errors to authenticated;

grant select, insert, update, delete on public.fsdb_import_batches to service_role;
grant select, insert, update, delete on public.fsdb_teams to service_role;
grant select, insert, update, delete on public.fsdb_competitions to service_role;
grant select, insert, update, delete on public.fsdb_players to service_role;
grant select, insert, update, delete on public.fsdb_player_aliases to service_role;
grant select, insert, update, delete on public.fsdb_player_source_links to service_role;
grant select, insert, update, delete on public.fsdb_roster_entries to service_role;
grant select, insert, update, delete on public.fsdb_player_season_stats to service_role;
grant select, insert, update, delete on public.fsdb_import_errors to service_role;

create policy "fsdb import batches readable by staff" on public.fsdb_import_batches for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb teams readable by staff" on public.fsdb_teams for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb competitions readable by staff" on public.fsdb_competitions for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb players readable by staff" on public.fsdb_players for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb aliases readable by staff" on public.fsdb_player_aliases for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb source links readable by staff" on public.fsdb_player_source_links for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb roster entries readable by staff" on public.fsdb_roster_entries for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb player stats readable by staff" on public.fsdb_player_season_stats for select to authenticated using ((select app_private.is_fsdb_reader()));
create policy "fsdb import errors readable by staff" on public.fsdb_import_errors for select to authenticated using ((select app_private.is_fsdb_reader()));

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('football-science-db', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical'], 'global', false, false, 'Read global Football Science DB player identity and roster data.'),
  ('football-science-db', 'write', array['admin','club-admin','team-admin','scout','analyst'], 'global', false, false, 'Import and update Football Science DB source data through server-owned jobs.'),
  ('football-science-db', 'delete', array['admin'], 'global', false, false, 'Archive Football Science DB source data; hard deletes are blocked.'),
  ('football-science-db', 'export', array['admin','scout','analyst'], 'global', false, false, 'Export Football Science DB source coverage and identity data.'),
  ('football-science-db', 'restore', array['admin'], 'global', false, false, 'Restore Football Science DB import state.'),
  ('football-science-db', 'admin', array['admin'], 'global', false, false, 'Administer Football Science DB sources and permissions.'),
  ('football-science-db', 'observe', array['admin','scout','analyst'], 'global', false, false, 'Observe Football Science DB import health and source coverage.')
on conflict (module_id, action) do update set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
