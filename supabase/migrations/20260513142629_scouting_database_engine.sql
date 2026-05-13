-- Football Science Scouting: database-backed scouting engine foundation.
-- The current UI keeps its local fallback while this schema becomes the durable
-- source for weekly scouting player database imports, precomputed intelligence,
-- shortlists, Shadow XI references, and report drafts.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pgcrypto set schema extensions;
alter extension pg_trgm set schema extensions;

create schema if not exists app_private;

create or replace function app_private.is_scouting_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst');
$$;

create or replace function app_private.can_write_scouting()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst');
$$;

create or replace function app_private.can_access_scouting_scope(target_organization_id uuid, target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_scouting_staff()
    and (
      target_organization_id is null
      or app_private.is_squad_org_member(target_organization_id)
      or (target_team_id is not null and app_private.is_squad_team_member(target_team_id))
    );
$$;

create or replace function app_private.can_write_scouting_scope(target_organization_id uuid, target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.can_write_scouting()
    and (
      target_organization_id is null
      or app_private.is_squad_org_member(target_organization_id)
      or (target_team_id is not null and app_private.is_squad_team_member(target_team_id))
    );
$$;

create table if not exists public.scouting_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_id uuid references public.squad_seasons(id) on delete set null,
  source_label text not null default 'scouting player database' check (char_length(source_label) between 2 and 120),
  source_file_name text check (source_file_name is null or char_length(source_file_name) <= 240),
  sheet_name text check (sheet_name is null or char_length(sheet_name) <= 160),
  season_label text check (season_label is null or char_length(season_label) <= 80),
  status text not null default 'staged' check (status in ('staged', 'reviewed', 'published', 'failed', 'archived')),
  row_count integer not null default 0 check (row_count >= 0),
  metric_count integer not null default 0 check (metric_count >= 0),
  new_player_count integer not null default 0 check (new_player_count >= 0),
  updated_player_count integer not null default 0 check (updated_player_count >= 0),
  inactive_player_count integer not null default 0 check (inactive_player_count >= 0),
  data_hash text check (data_hash is null or char_length(data_hash) = 64),
  imported_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.scouting_metrics (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  metric_key text not null check (metric_key ~ '^[a-z0-9][a-z0-9_:-]{1,118}[a-z0-9]$'),
  label text not null check (char_length(label) between 1 and 160),
  category text not null default 'performance' check (char_length(category) between 1 and 80),
  unit text check (unit is null or char_length(unit) <= 40),
  direction text not null default 'higher' check (direction in ('higher', 'lower')),
  source_column text check (source_column is null or char_length(source_column) <= 240),
  display_order integer not null default 1000,
  status text not null default 'active' check (status in ('active', 'hidden', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_metrics_org_key_unique_idx
  on public.scouting_metrics (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key);

alter table public.scouting_metrics
  drop constraint if exists scouting_metrics_metric_key_unique,
  add constraint scouting_metrics_metric_key_unique unique (metric_key);

create table if not exists public.scouting_players (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  canonical_name text not null check (char_length(canonical_name) between 1 and 180),
  sort_name text not null check (char_length(sort_name) between 1 and 180),
  birth_country text check (birth_country is null or char_length(birth_country) <= 120),
  passport_country text check (passport_country is null or char_length(passport_country) <= 120),
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  date_of_birth date,
  external_refs jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_players_org_sort_unique_idx
  on public.scouting_players (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(sort_name));

alter table public.scouting_players
  drop constraint if exists scouting_players_sort_name_unique,
  add constraint scouting_players_sort_name_unique unique (sort_name);

create table if not exists public.scouting_player_seasons (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  import_batch_id uuid references public.scouting_import_batches(id) on delete set null,
  player_id uuid not null references public.scouting_players(id) on delete cascade,
  record_key text not null check (char_length(record_key) between 2 and 180),
  player_name text not null check (char_length(player_name) between 1 and 180),
  team_name text check (team_name is null or char_length(team_name) <= 180),
  team_within_timeframe text check (team_within_timeframe is null or char_length(team_within_timeframe) <= 180),
  league_name text check (league_name is null or char_length(league_name) <= 180),
  season_label text check (season_label is null or char_length(season_label) <= 80),
  position_text text check (position_text is null or char_length(position_text) <= 120),
  position_group text check (position_group is null or char_length(position_group) <= 40),
  age numeric(5,2),
  matches integer check (matches is null or matches >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  birth_country text check (birth_country is null or char_length(birth_country) <= 120),
  passport_country text check (passport_country is null or char_length(passport_country) <= 120),
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  metrics jsonb not null default '{}'::jsonb,
  metric_count integer not null default 0 check (metric_count >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 1200),
  search_text text generated always as (
    lower(
      coalesce(player_name, '') || ' ' ||
      coalesce(team_name, '') || ' ' ||
      coalesce(league_name, '') || ' ' ||
      coalesce(season_label, '') || ' ' ||
      coalesce(position_text, '')
    )
  ) stored,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_player_seasons_org_record_unique_idx
  on public.scouting_player_seasons (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), record_key);

alter table public.scouting_player_seasons
  drop constraint if exists scouting_player_seasons_record_key_unique,
  add constraint scouting_player_seasons_record_key_unique unique (record_key);

create table if not exists public.scouting_metric_percentiles (
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_record_id uuid not null references public.scouting_player_seasons(id) on delete cascade,
  metric_id uuid not null references public.scouting_metrics(id) on delete cascade,
  metric_key text not null check (char_length(metric_key) between 2 and 120),
  raw_value numeric,
  percentile integer not null check (percentile between 1 and 99),
  benchmark_scope text not null default 'global' check (benchmark_scope in ('global', 'league', 'season', 'position', 'role-profile')),
  created_at timestamptz not null default now(),
  primary key (season_record_id, metric_id, benchmark_scope)
);

create table if not exists public.scouting_role_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  profile_key text not null check (profile_key ~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$'),
  label text not null check (char_length(label) between 2 and 160),
  position_groups text[] not null default '{}'::text[],
  metric_weights jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'hidden', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_role_profiles_org_key_unique_idx
  on public.scouting_role_profiles (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), profile_key);

create table if not exists public.scouting_role_profile_scores (
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_record_id uuid not null references public.scouting_player_seasons(id) on delete cascade,
  role_profile_id uuid not null references public.scouting_role_profiles(id) on delete cascade,
  score integer not null check (score between 0 and 99),
  strengths text[] not null default '{}'::text[],
  risks text[] not null default '{}'::text[],
  computed_at timestamptz not null default now(),
  primary key (season_record_id, role_profile_id)
);

create table if not exists public.scouting_lists (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.scouting_list_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  list_id uuid not null references public.scouting_lists(id) on delete cascade,
  season_record_id uuid not null references public.scouting_player_seasons(id) on delete cascade,
  rank integer,
  status text not null default 'monitoring' check (status in ('longlist', 'monitoring', 'shortlist', 'contacted', 'negotiation', 'signed', 'rejected', 'archived')),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (list_id, season_record_id)
);

create table if not exists public.scouting_shadow_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  slot_key text not null check (char_length(slot_key) between 1 and 80),
  season_record_id uuid not null references public.scouting_player_seasons(id) on delete cascade,
  rank integer not null default 1 check (rank > 0),
  status text not null default 'wishlist' check (status in ('wishlist', 'monitoring', 'priority', 'signed', 'archived')),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, slot_key, season_record_id)
);

create table if not exists public.scouting_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_record_id uuid not null references public.scouting_player_seasons(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  recommendation text not null default 'monitor' check (recommendation in ('monitor', 'sign', 'shortlist', 'reject', 'revisit')),
  report_body text not null default '' check (char_length(report_body) <= 20000),
  due_diligence jsonb not null default '{}'::jsonb,
  negotiation_angle text check (negotiation_angle is null or char_length(negotiation_angle) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.scouting_import_changes (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  import_batch_id uuid not null references public.scouting_import_batches(id) on delete cascade,
  season_record_id uuid references public.scouting_player_seasons(id) on delete set null,
  change_type text not null check (change_type in ('new-player', 'updated-player', 'inactive-player', 'new-season-row', 'metric-change', 'metadata-change')),
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scouting_import_batches_status_created_idx on public.scouting_import_batches (status, created_at desc);
create index if not exists scouting_metrics_label_trgm_idx on public.scouting_metrics using gin (label gin_trgm_ops);
create index if not exists scouting_players_sort_trgm_idx on public.scouting_players using gin (sort_name gin_trgm_ops);
create index if not exists scouting_player_seasons_filter_idx on public.scouting_player_seasons (league_name, season_label, position_group, minutes desc) where deleted_at is null and status = 'active';
create index if not exists scouting_player_seasons_player_idx on public.scouting_player_seasons (player_id, season_label desc, minutes desc) where deleted_at is null;
create index if not exists scouting_player_seasons_search_trgm_idx on public.scouting_player_seasons using gin (search_text gin_trgm_ops) where deleted_at is null;
create index if not exists scouting_player_seasons_metrics_gin_idx on public.scouting_player_seasons using gin (metrics jsonb_path_ops) where deleted_at is null;
create index if not exists scouting_metric_percentiles_metric_idx on public.scouting_metric_percentiles (metric_id, benchmark_scope, percentile desc);
create index if not exists scouting_role_scores_profile_idx on public.scouting_role_profile_scores (role_profile_id, score desc);
create index if not exists scouting_lists_team_status_idx on public.scouting_lists (team_id, status, updated_at desc);
create index if not exists scouting_list_entries_list_rank_idx on public.scouting_list_entries (list_id, rank nulls last, created_at desc);
create index if not exists scouting_shadow_entries_slot_rank_idx on public.scouting_shadow_entries (team_id, slot_key, rank, created_at desc);
create index if not exists scouting_reports_record_created_idx on public.scouting_reports (season_record_id, created_at desc);
create index if not exists scouting_import_changes_batch_type_idx on public.scouting_import_changes (import_batch_id, change_type, created_at desc);

create or replace function public.scouting_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.scouting_touch_updated_at_and_row_version()
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

create or replace function public.scouting_metric_count_from_jsonb()
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

drop trigger if exists scouting_import_batches_touch_updated_at on public.scouting_import_batches;
create trigger scouting_import_batches_touch_updated_at before update on public.scouting_import_batches for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_metrics_touch_updated_at on public.scouting_metrics;
create trigger scouting_metrics_touch_updated_at before update on public.scouting_metrics for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_players_touch_updated_at on public.scouting_players;
create trigger scouting_players_touch_updated_at before update on public.scouting_players for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_player_seasons_metric_count on public.scouting_player_seasons;
create trigger scouting_player_seasons_metric_count before insert or update of metrics on public.scouting_player_seasons for each row execute function public.scouting_metric_count_from_jsonb();

drop trigger if exists scouting_player_seasons_touch_updated_at on public.scouting_player_seasons;
create trigger scouting_player_seasons_touch_updated_at before update on public.scouting_player_seasons for each row execute function public.scouting_touch_updated_at_and_row_version();

drop trigger if exists scouting_role_profiles_touch_updated_at on public.scouting_role_profiles;
create trigger scouting_role_profiles_touch_updated_at before update on public.scouting_role_profiles for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_lists_touch_updated_at on public.scouting_lists;
create trigger scouting_lists_touch_updated_at before update on public.scouting_lists for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_list_entries_touch_updated_at on public.scouting_list_entries;
create trigger scouting_list_entries_touch_updated_at before update on public.scouting_list_entries for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_shadow_entries_touch_updated_at on public.scouting_shadow_entries;
create trigger scouting_shadow_entries_touch_updated_at before update on public.scouting_shadow_entries for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_reports_touch_updated_at on public.scouting_reports;
create trigger scouting_reports_touch_updated_at before update on public.scouting_reports for each row execute function public.scouting_touch_updated_at();

alter table public.scouting_import_batches enable row level security;
alter table public.scouting_metrics enable row level security;
alter table public.scouting_players enable row level security;
alter table public.scouting_player_seasons enable row level security;
alter table public.scouting_metric_percentiles enable row level security;
alter table public.scouting_role_profiles enable row level security;
alter table public.scouting_role_profile_scores enable row level security;
alter table public.scouting_lists enable row level security;
alter table public.scouting_list_entries enable row level security;
alter table public.scouting_shadow_entries enable row level security;
alter table public.scouting_reports enable row level security;
alter table public.scouting_import_changes enable row level security;

revoke all on public.scouting_import_batches from anon, authenticated;
revoke all on public.scouting_metrics from anon, authenticated;
revoke all on public.scouting_players from anon, authenticated;
revoke all on public.scouting_player_seasons from anon, authenticated;
revoke all on public.scouting_metric_percentiles from anon, authenticated;
revoke all on public.scouting_role_profiles from anon, authenticated;
revoke all on public.scouting_role_profile_scores from anon, authenticated;
revoke all on public.scouting_lists from anon, authenticated;
revoke all on public.scouting_list_entries from anon, authenticated;
revoke all on public.scouting_shadow_entries from anon, authenticated;
revoke all on public.scouting_reports from anon, authenticated;
revoke all on public.scouting_import_changes from anon, authenticated;

grant select on public.scouting_import_batches to authenticated;
grant select on public.scouting_metrics to authenticated;
grant select on public.scouting_players to authenticated;
grant select on public.scouting_player_seasons to authenticated;
grant select on public.scouting_metric_percentiles to authenticated;
grant select on public.scouting_role_profiles to authenticated;
grant select on public.scouting_role_profile_scores to authenticated;
grant select, insert, update on public.scouting_lists to authenticated;
grant select, insert, update on public.scouting_list_entries to authenticated;
grant select, insert, update on public.scouting_shadow_entries to authenticated;
grant select, insert, update on public.scouting_reports to authenticated;
grant select on public.scouting_import_changes to authenticated;

create policy "scouting import batches readable by scouting staff" on public.scouting_import_batches for select to authenticated using (app_private.can_access_scouting_scope(organization_id, team_id));
create policy "scouting import batches writable by scouting staff" on public.scouting_import_batches for all to authenticated using (app_private.can_write_scouting_scope(organization_id, team_id)) with check (app_private.can_write_scouting_scope(organization_id, team_id));

create policy "scouting metrics readable by scouting staff" on public.scouting_metrics for select to authenticated using (app_private.can_access_scouting_scope(organization_id, null));
create policy "scouting metrics writable by scouting staff" on public.scouting_metrics for all to authenticated using (app_private.can_write_scouting_scope(organization_id, null)) with check (app_private.can_write_scouting_scope(organization_id, null));

create policy "scouting players readable by scouting staff" on public.scouting_players for select to authenticated using (app_private.can_access_scouting_scope(organization_id, null));
create policy "scouting players writable by scouting staff" on public.scouting_players for all to authenticated using (app_private.can_write_scouting_scope(organization_id, null)) with check (app_private.can_write_scouting_scope(organization_id, null));

create policy "scouting seasons readable by scouting staff" on public.scouting_player_seasons for select to authenticated using (app_private.can_access_scouting_scope(organization_id, team_id));
create policy "scouting seasons writable by scouting staff" on public.scouting_player_seasons for all to authenticated using (app_private.can_write_scouting_scope(organization_id, team_id)) with check (app_private.can_write_scouting_scope(organization_id, team_id));

create policy "scouting percentiles readable by scouting staff" on public.scouting_metric_percentiles for select to authenticated using (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_access_scouting_scope(season.organization_id, season.team_id)));
create policy "scouting percentiles writable by scouting staff" on public.scouting_metric_percentiles for all to authenticated using (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_write_scouting_scope(season.organization_id, season.team_id))) with check (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_write_scouting_scope(season.organization_id, season.team_id)));

create policy "scouting role profiles readable by scouting staff" on public.scouting_role_profiles for select to authenticated using (app_private.can_access_scouting_scope(organization_id, null));
create policy "scouting role profiles writable by scouting staff" on public.scouting_role_profiles for all to authenticated using (app_private.can_write_scouting_scope(organization_id, null)) with check (app_private.can_write_scouting_scope(organization_id, null));

create policy "scouting role scores readable by scouting staff" on public.scouting_role_profile_scores for select to authenticated using (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_access_scouting_scope(season.organization_id, season.team_id)));
create policy "scouting role scores writable by scouting staff" on public.scouting_role_profile_scores for all to authenticated using (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_write_scouting_scope(season.organization_id, season.team_id))) with check (exists (select 1 from public.scouting_player_seasons season where season.id = season_record_id and app_private.can_write_scouting_scope(season.organization_id, season.team_id)));

create policy "scouting lists readable by scouting staff" on public.scouting_lists for select to authenticated using (app_private.can_access_scouting_scope(organization_id, team_id));
create policy "scouting lists writable by scouting staff" on public.scouting_lists for all to authenticated using (app_private.can_write_scouting_scope(organization_id, team_id)) with check (app_private.can_write_scouting_scope(organization_id, team_id));

create policy "scouting list entries readable by scouting staff" on public.scouting_list_entries for select to authenticated using (exists (select 1 from public.scouting_lists list where list.id = list_id and app_private.can_access_scouting_scope(list.organization_id, list.team_id)));
create policy "scouting list entries writable by scouting staff" on public.scouting_list_entries for all to authenticated using (exists (select 1 from public.scouting_lists list where list.id = list_id and app_private.can_write_scouting_scope(list.organization_id, list.team_id))) with check (exists (select 1 from public.scouting_lists list where list.id = list_id and app_private.can_write_scouting_scope(list.organization_id, list.team_id)));

create policy "scouting shadow entries readable by scouting staff" on public.scouting_shadow_entries for select to authenticated using (app_private.can_access_scouting_scope(organization_id, team_id));
create policy "scouting shadow entries writable by scouting staff" on public.scouting_shadow_entries for all to authenticated using (app_private.can_write_scouting_scope(organization_id, team_id)) with check (app_private.can_write_scouting_scope(organization_id, team_id));

create policy "scouting reports readable by scouting staff" on public.scouting_reports for select to authenticated using (app_private.can_access_scouting_scope(organization_id, team_id));
create policy "scouting reports writable by scouting staff" on public.scouting_reports for all to authenticated using (app_private.can_write_scouting_scope(organization_id, team_id)) with check (app_private.can_write_scouting_scope(organization_id, team_id));

create policy "scouting import changes readable by scouting staff" on public.scouting_import_changes for select to authenticated using (exists (select 1 from public.scouting_import_batches batch where batch.id = import_batch_id and app_private.can_access_scouting_scope(batch.organization_id, batch.team_id)));
create policy "scouting import changes writable by scouting staff" on public.scouting_import_changes for all to authenticated using (exists (select 1 from public.scouting_import_batches batch where batch.id = import_batch_id and app_private.can_write_scouting_scope(batch.organization_id, batch.team_id))) with check (exists (select 1 from public.scouting_import_batches batch where batch.id = import_batch_id and app_private.can_write_scouting_scope(batch.organization_id, batch.team_id)));
