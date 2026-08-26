-- Scouting dataset versioning and fail-closed Excel import foundation.
-- Source workbooks are immutable artifacts, parsed rows are staged by version,
-- and only a validated version can replace the active scouting dataset.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

create schema if not exists app_private;

create or replace function app_private.can_administer_scouting_data()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() = 'admin';
$$;

create or replace function app_private.can_administer_scouting_data_scope(
  target_organization_id uuid,
  target_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.can_administer_scouting_data()
    and (
      target_organization_id is null
      or app_private.is_squad_org_member(target_organization_id)
      or (target_team_id is not null and app_private.is_squad_team_member(target_team_id))
    );
$$;

create table if not exists public.scouting_source_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 240),
  media_type text not null check (char_length(media_type) between 3 and 160),
  byte_size bigint not null check (byte_size between 1 and 52428800),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  storage_bucket text not null default 'footballscience-scouting-imports' check (char_length(storage_bucket) between 3 and 120),
  storage_path text not null check (char_length(storage_path) between 3 and 600),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'verified', 'quarantined', 'failed', 'archived')),
  uploaded_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_source_artifacts_storage_path_idx
  on public.scouting_source_artifacts (storage_bucket, storage_path);

create index if not exists scouting_source_artifacts_checksum_idx
  on public.scouting_source_artifacts (checksum_sha256, created_at desc);

create table if not exists public.scouting_dataset_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  import_batch_id uuid not null unique references public.scouting_import_batches(id) on delete restrict,
  source_artifact_id uuid references public.scouting_source_artifacts(id) on delete restrict,
  version_number bigint generated always as identity,
  version_label text not null check (char_length(version_label) between 1 and 160),
  data_hash text not null check (data_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'staged' check (status in ('staged', 'validating', 'validated', 'blocked', 'active', 'superseded', 'rolled_back', 'failed', 'archived')),
  expected_row_count integer not null check (expected_row_count > 0),
  expected_metric_count integer not null default 0 check (expected_metric_count >= 0),
  staged_row_count integer not null default 0 check (staged_row_count >= 0),
  staged_metric_count integer not null default 0 check (staged_metric_count >= 0),
  validation_summary jsonb not null default '{}'::jsonb,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  rollback_from_version_id uuid references public.scouting_dataset_versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists scouting_dataset_versions_scope_active_idx
  on public.scouting_dataset_versions (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create unique index if not exists scouting_dataset_versions_scope_hash_idx
  on public.scouting_dataset_versions (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data_hash
  )
  where status not in ('failed', 'archived');

create index if not exists scouting_dataset_versions_status_created_idx
  on public.scouting_dataset_versions (status, created_at desc);

create table if not exists public.scouting_import_stage_metrics (
  dataset_version_id uuid not null references public.scouting_dataset_versions(id) on delete cascade,
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  metric_key text not null check (metric_key ~ '^[a-z0-9][a-z0-9_:-]{1,118}[a-z0-9]$'),
  label text not null check (char_length(label) between 1 and 160),
  category text not null default 'performance' check (char_length(category) between 1 and 80),
  unit text check (unit is null or char_length(unit) <= 40),
  direction text not null default 'higher' check (direction in ('higher', 'lower')),
  source_column text check (source_column is null or char_length(source_column) <= 240),
  display_order integer not null default 1000,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (dataset_version_id, metric_key)
);

create table if not exists public.scouting_import_stage_records (
  dataset_version_id uuid not null references public.scouting_dataset_versions(id) on delete cascade,
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  source_system text not null check (char_length(source_system) between 2 and 40),
  source_player_id text not null check (char_length(source_player_id) between 2 and 160),
  source_aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(source_aliases) = 'array'),
  source_record_id text not null check (char_length(source_record_id) between 2 and 160),
  record_key text not null check (char_length(record_key) between 2 and 180),
  player_identity_key text not null check (char_length(player_identity_key) between 2 and 160),
  fsdb_player_id uuid references public.fsdb_players(id) on delete set null,
  canonical_name text not null check (char_length(canonical_name) between 1 and 180),
  sort_name text not null check (char_length(sort_name) between 1 and 180),
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
  date_of_birth date,
  metrics jsonb not null default '{}'::jsonb,
  external_refs jsonb not null default '{}'::jsonb,
  player_metadata jsonb not null default '{}'::jsonb,
  record_metadata jsonb not null default '{}'::jsonb,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  validation_status text not null default 'valid' check (validation_status in ('valid', 'warning', 'blocked')),
  change_type text not null default 'new-season-row' check (change_type in ('new-season-row', 'updated-player', 'unchanged')),
  created_at timestamptz not null default now(),
  primary key (dataset_version_id, source_system, source_record_id)
);

create index if not exists scouting_import_stage_records_version_player_idx
  on public.scouting_import_stage_records (dataset_version_id, source_system, source_player_id);

create index if not exists scouting_import_stage_records_version_segment_idx
  on public.scouting_import_stage_records (dataset_version_id, league_name, season_label);

create table if not exists public.scouting_import_validations (
  id uuid primary key default extensions.gen_random_uuid(),
  dataset_version_id uuid not null references public.scouting_dataset_versions(id) on delete cascade,
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  validation_code text not null check (validation_code ~ '^[a-z0-9][a-z0-9_.:-]{1,118}[a-z0-9]$'),
  severity text not null check (severity in ('info', 'warning', 'blocker')),
  status text not null check (status in ('passed', 'failed')),
  message text not null check (char_length(message) between 1 and 1200),
  expected_value jsonb,
  actual_value jsonb,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  unique (dataset_version_id, validation_code)
);

create table if not exists public.scouting_player_identity_links (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  source_system text not null check (char_length(source_system) between 2 and 40),
  source_player_id text not null check (char_length(source_player_id) between 2 and 160),
  scouting_player_id uuid references public.scouting_players(id) on delete set null,
  fsdb_player_id uuid references public.fsdb_players(id) on delete set null,
  match_method text not null default 'source-id' check (match_method in ('source-id', 'provider-crosswalk', 'verified-identity', 'manual-review')),
  confidence integer not null default 100 check (confidence between 0 and 100),
  status text not null default 'active' check (status in ('active', 'review', 'rejected', 'archived')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_system, source_player_id)
);

alter table public.scouting_players
  add column if not exists fsdb_player_id uuid references public.fsdb_players(id) on delete set null;

alter table public.scouting_metrics
  add column if not exists dataset_version_id uuid references public.scouting_dataset_versions(id) on delete set null;

alter table public.scouting_player_seasons
  add column if not exists dataset_version_id uuid references public.scouting_dataset_versions(id) on delete set null,
  add column if not exists fsdb_player_id uuid references public.fsdb_players(id) on delete set null,
  add column if not exists source_payload_hash text check (source_payload_hash is null or source_payload_hash ~ '^[a-f0-9]{64}$');

create index if not exists scouting_players_fsdb_player_idx
  on public.scouting_players (fsdb_player_id)
  where fsdb_player_id is not null;

create index if not exists scouting_metrics_dataset_active_idx
  on public.scouting_metrics (dataset_version_id, status, display_order);

create index if not exists scouting_players_source_aliases_gin_idx
  on public.scouting_players using gin (source_aliases jsonb_ops);

create index if not exists scouting_player_seasons_dataset_active_idx
  on public.scouting_player_seasons (dataset_version_id, status, minutes desc)
  where deleted_at is null;

create index if not exists scouting_player_seasons_fsdb_player_idx
  on public.scouting_player_seasons (fsdb_player_id, season_label desc)
  where fsdb_player_id is not null and deleted_at is null;

create or replace function public.resolve_scouting_player_identity_keys(p_identity_keys text[])
returns setof public.scouting_players
language sql
stable
set search_path = public, pg_temp
as $$
  select player.*
  from public.scouting_players player
  where player.status = 'active'
    and cardinality(coalesce(p_identity_keys, '{}'::text[])) > 0
    and (
      player.player_identity_key = any(p_identity_keys)
      or player.source_player_id = any(p_identity_keys)
      or player.source_aliases ?| p_identity_keys
    )
  order by player.updated_at desc, player.id;
$$;

create or replace function public.get_scouting_filter_options()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'leagues', (
      select coalesce(jsonb_agg(option_value order by option_value), '[]'::jsonb)
      from (
        select distinct league_name as option_value
        from public.scouting_player_seasons
        where status = 'active' and deleted_at is null and nullif(btrim(league_name), '') is not null
      ) league_options
    ),
    'teams', (
      select coalesce(jsonb_agg(option_value order by option_value), '[]'::jsonb)
      from (
        select distinct team_name as option_value
        from public.scouting_player_seasons
        where status = 'active' and deleted_at is null and nullif(btrim(team_name), '') is not null
      ) team_options
    ),
    'seasons', (
      select coalesce(jsonb_agg(option_value order by option_value desc), '[]'::jsonb)
      from (
        select distinct season_label as option_value
        from public.scouting_player_seasons
        where status = 'active' and deleted_at is null and nullif(btrim(season_label), '') is not null
      ) season_options
    ),
    'positions', (
      select coalesce(jsonb_agg(option_value order by option_value), '[]'::jsonb)
      from (
        select distinct upper(position_token) as option_value
        from public.scouting_player_seasons season,
          lateral regexp_split_to_table(coalesce(season.position_text, ''), '[^A-Za-z0-9]+') position_token
        where season.status = 'active'
          and season.deleted_at is null
          and nullif(btrim(position_token), '') is not null
      ) position_options
    )
  );
$$;

create or replace function public.start_scouting_dataset_import(
  p_source_artifact_id uuid,
  p_version_label text,
  p_data_hash text,
  p_expected_row_count integer,
  p_expected_metric_count integer,
  p_source_file_name text,
  p_sheet_name text,
  p_season_label text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  source_artifact public.scouting_source_artifacts%rowtype;
  existing_version public.scouting_dataset_versions%rowtype;
  created_version public.scouting_dataset_versions%rowtype;
  created_batch_id uuid;
begin
  if p_expected_row_count < 1 or p_expected_metric_count < 0 then
    raise exception 'Invalid scouting dataset dimensions.';
  end if;

  if p_data_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid scouting dataset hash.';
  end if;

  select * into source_artifact
  from public.scouting_source_artifacts
  where id = p_source_artifact_id
    and status = 'verified'
  for update;

  if source_artifact.id is null then
    raise exception 'A verified scouting source artifact is required.';
  end if;

  select * into existing_version
  from public.scouting_dataset_versions
  where organization_id is not distinct from source_artifact.organization_id
    and team_id is not distinct from source_artifact.team_id
    and data_hash = p_data_hash
    and status not in ('failed', 'archived')
  order by created_at desc
  limit 1;

  if existing_version.id is not null then
    return jsonb_build_object(
      'datasetVersionId', existing_version.id,
      'importBatchId', existing_version.import_batch_id,
      'status', existing_version.status,
      'reused', true
    );
  end if;

  insert into public.scouting_import_batches (
    organization_id, team_id, source_label, source_file_name, sheet_name,
    season_label, status, row_count, metric_count, data_hash, imported_by, metadata
  ) values (
    source_artifact.organization_id,
    source_artifact.team_id,
    'scouting player database',
    left(coalesce(nullif(btrim(p_source_file_name), ''), source_artifact.file_name), 240),
    left(nullif(btrim(p_sheet_name), ''), 160),
    left(nullif(btrim(p_season_label), ''), 80),
    'staged',
    p_expected_row_count,
    p_expected_metric_count,
    p_data_hash,
    p_actor_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into created_batch_id;

  insert into public.scouting_dataset_versions (
    organization_id, team_id, import_batch_id, source_artifact_id, version_label,
    data_hash, status, expected_row_count, expected_metric_count, created_by, metadata
  ) values (
    source_artifact.organization_id,
    source_artifact.team_id,
    created_batch_id,
    source_artifact.id,
    left(coalesce(nullif(btrim(p_version_label), ''), source_artifact.file_name), 160),
    p_data_hash,
    'staged',
    p_expected_row_count,
    p_expected_metric_count,
    p_actor_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into created_version;

  return jsonb_build_object(
    'datasetVersionId', created_version.id,
    'importBatchId', created_batch_id,
    'status', created_version.status,
    'reused', false
  );
exception
  when unique_violation then
    select * into existing_version
    from public.scouting_dataset_versions
    where organization_id is not distinct from source_artifact.organization_id
      and team_id is not distinct from source_artifact.team_id
      and data_hash = p_data_hash
      and status not in ('failed', 'archived')
    order by created_at desc
    limit 1;

    if existing_version.id is null then
      raise;
    end if;

    return jsonb_build_object(
      'datasetVersionId', existing_version.id,
      'importBatchId', existing_version.import_batch_id,
      'status', existing_version.status,
      'reused', true
    );
end;
$$;

create or replace function public.validate_scouting_dataset_version(p_dataset_version_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_version public.scouting_dataset_versions%rowtype;
  actual_rows integer := 0;
  actual_metrics integer := 0;
  blocked_rows integer := 0;
  previous_rows integer := 0;
  dropped_segments jsonb := '[]'::jsonb;
  blocker_count integer := 0;
  warning_count integer := 0;
  new_rows integer := 0;
  updated_rows integer := 0;
  unchanged_rows integer := 0;
  summary jsonb;
begin
  select * into target_version
  from public.scouting_dataset_versions
  where id = p_dataset_version_id
  for update;

  if target_version.id is null then
    raise exception 'Unknown scouting dataset version.';
  end if;

  if target_version.status not in ('staged', 'validating', 'validated', 'blocked') then
    raise exception 'Scouting dataset version cannot be validated from status %.', target_version.status;
  end if;

  update public.scouting_dataset_versions
  set status = 'validating'
  where id = target_version.id;

  select count(*)::integer,
         count(*) filter (where validation_status = 'blocked')::integer
  into actual_rows, blocked_rows
  from public.scouting_import_stage_records
  where dataset_version_id = target_version.id;

  select count(*)::integer into actual_metrics
  from public.scouting_import_stage_metrics
  where dataset_version_id = target_version.id;

  select coalesce(active_version.staged_row_count, 0) into previous_rows
  from public.scouting_dataset_versions active_version
  where active_version.status = 'active'
    and active_version.organization_id is not distinct from target_version.organization_id
    and active_version.team_id is not distinct from target_version.team_id
  limit 1;

  if previous_rows is null then
    select count(*)::integer into previous_rows
    from public.scouting_player_seasons
    where status = 'active'
      and deleted_at is null
      and organization_id is not distinct from target_version.organization_id
      and team_id is not distinct from target_version.team_id;
  end if;

  previous_rows := coalesce(previous_rows, 0);

  update public.scouting_import_stage_records staged
  set change_type = case
    when existing.id is null then 'new-season-row'
    when existing.source_payload_hash = staged.payload_hash then 'unchanged'
    else 'updated-player'
  end
  from (
    select incoming.dataset_version_id,
           incoming.source_system,
           incoming.source_record_id,
           season.id,
           season.source_payload_hash
    from public.scouting_import_stage_records incoming
    left join public.scouting_player_seasons season
      on season.source_system = incoming.source_system
     and season.source_record_id = incoming.source_record_id
    where incoming.dataset_version_id = target_version.id
  ) existing
  where staged.dataset_version_id = existing.dataset_version_id
    and staged.source_system = existing.source_system
    and staged.source_record_id = existing.source_record_id;

  select
    count(*) filter (where change_type = 'new-season-row')::integer,
    count(*) filter (where change_type = 'updated-player')::integer,
    count(*) filter (where change_type = 'unchanged')::integer
  into new_rows, updated_rows, unchanged_rows
  from public.scouting_import_stage_records
  where dataset_version_id = target_version.id;

  with active_segments as (
    select league_name, season_label, count(*)::integer as row_count
    from public.scouting_player_seasons
    where status = 'active'
      and deleted_at is null
      and organization_id is not distinct from target_version.organization_id
      and team_id is not distinct from target_version.team_id
      and league_name is not null
      and season_label is not null
    group by league_name, season_label
  ), incoming_segments as (
    select league_name, season_label, count(*)::integer as row_count
    from public.scouting_import_stage_records
    where dataset_version_id = target_version.id
      and validation_status <> 'blocked'
      and league_name is not null
      and season_label is not null
    group by league_name, season_label
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'league', active_segments.league_name,
        'season', active_segments.season_label,
        'previousRows', active_segments.row_count,
        'incomingRows', coalesce(incoming_segments.row_count, 0)
      )
      order by active_segments.row_count desc
    ),
    '[]'::jsonb
  ) into dropped_segments
  from active_segments
  left join incoming_segments
    on incoming_segments.league_name = active_segments.league_name
   and incoming_segments.season_label = active_segments.season_label
  where active_segments.row_count >= 10
    and coalesce(incoming_segments.row_count, 0) < greatest(1, floor(active_segments.row_count * 0.5)::integer);

  insert into public.scouting_import_validations (
    dataset_version_id, organization_id, team_id, validation_code, severity, status, message, expected_value, actual_value, checked_at
  ) values
    (
      target_version.id,
      target_version.organization_id,
      target_version.team_id,
      'row_count.exact',
      'blocker',
      case when actual_rows = target_version.expected_row_count then 'passed' else 'failed' end,
      case when actual_rows = target_version.expected_row_count then 'All expected player rows were staged.' else 'Staged player row count does not match the workbook preview.' end,
      to_jsonb(target_version.expected_row_count),
      to_jsonb(actual_rows),
      now()
    ),
    (
      target_version.id,
      target_version.organization_id,
      target_version.team_id,
      'metric_count.exact',
      'blocker',
      case when actual_metrics = target_version.expected_metric_count then 'passed' else 'failed' end,
      case when actual_metrics = target_version.expected_metric_count then 'All expected metrics were staged.' else 'Staged metric count does not match the workbook preview.' end,
      to_jsonb(target_version.expected_metric_count),
      to_jsonb(actual_metrics),
      now()
    ),
    (
      target_version.id,
      target_version.organization_id,
      target_version.team_id,
      'records.blocked',
      'blocker',
      case when blocked_rows = 0 then 'passed' else 'failed' end,
      case when blocked_rows = 0 then 'No staged rows failed structural validation.' else 'One or more staged rows failed structural validation.' end,
      '0'::jsonb,
      to_jsonb(blocked_rows),
      now()
    ),
    (
      target_version.id,
      target_version.organization_id,
      target_version.team_id,
      'dataset.retention',
      'blocker',
      case when previous_rows = 0 or actual_rows >= floor(previous_rows * 0.65)::integer then 'passed' else 'failed' end,
      case when previous_rows = 0 or actual_rows >= floor(previous_rows * 0.65)::integer then 'Dataset size is within the protected retention range.' else 'Incoming data removes more than 35% of the active dataset.' end,
      to_jsonb(previous_rows),
      to_jsonb(actual_rows),
      now()
    ),
    (
      target_version.id,
      target_version.organization_id,
      target_version.team_id,
      'segments.retention',
      'blocker',
      case when jsonb_array_length(dropped_segments) = 0 then 'passed' else 'failed' end,
      case when jsonb_array_length(dropped_segments) = 0 then 'League and season coverage is preserved.' else 'One or more league-season groups lost at least half their rows.' end,
      null,
      dropped_segments,
      now()
    )
  on conflict (dataset_version_id, validation_code) do update set
    organization_id = excluded.organization_id,
    team_id = excluded.team_id,
    severity = excluded.severity,
    status = excluded.status,
    message = excluded.message,
    expected_value = excluded.expected_value,
    actual_value = excluded.actual_value,
    details = excluded.details,
    checked_at = excluded.checked_at;

  select count(*) filter (where status = 'failed' and severity = 'blocker')::integer,
         count(*) filter (where status = 'failed' and severity = 'warning')::integer
  into blocker_count, warning_count
  from public.scouting_import_validations
  where dataset_version_id = target_version.id;

  summary := jsonb_build_object(
    'rowCount', actual_rows,
    'metricCount', actual_metrics,
    'expectedRowCount', target_version.expected_row_count,
    'expectedMetricCount', target_version.expected_metric_count,
    'previousRowCount', previous_rows,
    'newRows', new_rows,
    'updatedRows', updated_rows,
    'unchangedRows', unchanged_rows,
    'blockerCount', blocker_count,
    'warningCount', warning_count,
    'droppedSegments', dropped_segments,
    'validatedAt', now()
  );

  update public.scouting_dataset_versions
  set status = case when blocker_count = 0 then 'validated' else 'blocked' end,
      staged_row_count = actual_rows,
      staged_metric_count = actual_metrics,
      validation_summary = summary
  where id = target_version.id;

  return summary || jsonb_build_object('status', case when blocker_count = 0 then 'validated' else 'blocked' end);
end;
$$;

create or replace function public.publish_scouting_dataset_version(
  p_dataset_version_id uuid,
  p_actor_id uuid,
  p_rollback boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_version public.scouting_dataset_versions%rowtype;
  previous_version_id uuid;
  published_rows integer := 0;
begin
  select * into target_version
  from public.scouting_dataset_versions
  where id = p_dataset_version_id
  for update;

  if target_version.id is null then
    raise exception 'Unknown scouting dataset version.';
  end if;

  if (not p_rollback and target_version.status <> 'validated')
     or (p_rollback and target_version.status not in ('active', 'superseded', 'rolled_back')) then
    raise exception 'Scouting dataset version cannot be activated from status %.', target_version.status;
  end if;

  if exists (
    select 1
    from public.scouting_import_validations validation
    where validation.dataset_version_id = target_version.id
      and validation.severity = 'blocker'
      and validation.status = 'failed'
  ) then
    raise exception 'Scouting dataset version has unresolved validation blockers.';
  end if;

  select id into previous_version_id
  from public.scouting_dataset_versions
  where status = 'active'
    and organization_id is not distinct from target_version.organization_id
    and team_id is not distinct from target_version.team_id
    and id <> target_version.id
  limit 1
  for update;

  update public.scouting_metrics metric
  set status = 'hidden'
  where metric.dataset_version_id is not null
    and metric.organization_id is not distinct from target_version.organization_id
    and not exists (
      select 1
      from public.scouting_import_stage_metrics staged
      where staged.dataset_version_id = target_version.id
        and staged.metric_key = metric.metric_key
    );

  insert into public.scouting_metrics (
    organization_id, dataset_version_id, metric_key, label, category, unit, direction, source_column, display_order, status, metadata
  )
  select
    target_version.organization_id,
    target_version.id,
    staged.metric_key,
    staged.label,
    staged.category,
    staged.unit,
    staged.direction,
    staged.source_column,
    staged.display_order,
    'active',
    staged.metadata
  from public.scouting_import_stage_metrics staged
  where staged.dataset_version_id = target_version.id
  on conflict (metric_key) do update set
    dataset_version_id = excluded.dataset_version_id,
    label = excluded.label,
    category = excluded.category,
    unit = excluded.unit,
    direction = excluded.direction,
    source_column = excluded.source_column,
    display_order = excluded.display_order,
    status = 'active',
    metadata = excluded.metadata;

  insert into public.scouting_players (
    organization_id, team_id, canonical_name, sort_name, player_identity_key,
    source_system, source_player_id, source_aliases, fsdb_player_id,
    birth_country, passport_country, height_cm, weight_kg, date_of_birth,
    external_refs, status, metadata
  )
  select distinct on (staged.source_system, staged.source_player_id)
    staged.organization_id,
    staged.team_id,
    staged.canonical_name,
    staged.sort_name,
    staged.player_identity_key,
    staged.source_system,
    staged.source_player_id,
    staged.source_aliases,
    staged.fsdb_player_id,
    staged.birth_country,
    staged.passport_country,
    staged.height_cm,
    staged.weight_kg,
    staged.date_of_birth,
    staged.external_refs,
    'active',
    staged.player_metadata
  from public.scouting_import_stage_records staged
  where staged.dataset_version_id = target_version.id
    and staged.validation_status <> 'blocked'
  order by staged.source_system, staged.source_player_id, staged.minutes desc
  on conflict (source_system, source_player_id) do update set
    canonical_name = excluded.canonical_name,
    sort_name = excluded.sort_name,
    player_identity_key = excluded.player_identity_key,
    source_aliases = excluded.source_aliases,
    fsdb_player_id = coalesce(excluded.fsdb_player_id, scouting_players.fsdb_player_id),
    birth_country = coalesce(excluded.birth_country, scouting_players.birth_country),
    passport_country = coalesce(excluded.passport_country, scouting_players.passport_country),
    height_cm = coalesce(excluded.height_cm, scouting_players.height_cm),
    weight_kg = coalesce(excluded.weight_kg, scouting_players.weight_kg),
    date_of_birth = coalesce(excluded.date_of_birth, scouting_players.date_of_birth),
    external_refs = scouting_players.external_refs || excluded.external_refs,
    status = 'active',
    metadata = scouting_players.metadata || excluded.metadata;

  insert into public.scouting_player_identity_links (
    organization_id, team_id, source_system, source_player_id, scouting_player_id, fsdb_player_id, match_method, confidence, status, metadata
  )
  select distinct on (staged.source_system, staged.source_player_id)
    staged.organization_id,
    staged.team_id,
    staged.source_system,
    staged.source_player_id,
    player.id,
    staged.fsdb_player_id,
    case when staged.fsdb_player_id is null then 'source-id' else 'provider-crosswalk' end,
    case when staged.fsdb_player_id is null then 90 else 100 end,
    'active',
    jsonb_build_object('datasetVersionId', target_version.id)
  from public.scouting_import_stage_records staged
  join public.scouting_players player
    on player.source_system = staged.source_system
   and player.source_player_id = staged.source_player_id
  where staged.dataset_version_id = target_version.id
    and staged.validation_status <> 'blocked'
  order by staged.source_system, staged.source_player_id, staged.minutes desc
  on conflict (source_system, source_player_id) do update set
    organization_id = excluded.organization_id,
    team_id = excluded.team_id,
    scouting_player_id = excluded.scouting_player_id,
    fsdb_player_id = coalesce(excluded.fsdb_player_id, scouting_player_identity_links.fsdb_player_id),
    match_method = excluded.match_method,
    confidence = greatest(scouting_player_identity_links.confidence, excluded.confidence),
    status = 'active',
    metadata = scouting_player_identity_links.metadata || excluded.metadata;

  update public.scouting_player_seasons existing
  set status = 'inactive',
      deleted_at = now(),
      deleted_by = p_actor_id,
      delete_reason = 'Not present in active scouting dataset version'
  where existing.status = 'active'
    and existing.deleted_at is null
    and existing.organization_id is not distinct from target_version.organization_id
    and existing.team_id is not distinct from target_version.team_id
    and not exists (
      select 1
      from public.scouting_import_stage_records staged
      where staged.dataset_version_id = target_version.id
        and staged.validation_status <> 'blocked'
        and staged.source_system = existing.source_system
        and staged.source_record_id = existing.source_record_id
    );

  insert into public.scouting_player_seasons (
    organization_id, team_id, import_batch_id, dataset_version_id, player_id, fsdb_player_id,
    record_key, player_identity_key, source_system, source_player_id, source_record_id,
    player_name, team_name, team_within_timeframe, league_name, season_label,
    position_text, position_group, age, matches, minutes, birth_country,
    passport_country, height_cm, weight_kg, date_of_birth, metrics, status,
    deleted_at, deleted_by, delete_reason, source_payload_hash, metadata
  )
  select
    staged.organization_id,
    staged.team_id,
    target_version.import_batch_id,
    target_version.id,
    player.id,
    staged.fsdb_player_id,
    staged.record_key,
    staged.player_identity_key,
    staged.source_system,
    staged.source_player_id,
    staged.source_record_id,
    staged.player_name,
    staged.team_name,
    staged.team_within_timeframe,
    staged.league_name,
    staged.season_label,
    staged.position_text,
    staged.position_group,
    staged.age,
    staged.matches,
    staged.minutes,
    staged.birth_country,
    staged.passport_country,
    staged.height_cm,
    staged.weight_kg,
    staged.date_of_birth,
    staged.metrics,
    'active',
    null,
    null,
    null,
    staged.payload_hash,
    staged.record_metadata
  from public.scouting_import_stage_records staged
  join public.scouting_players player
    on player.source_system = staged.source_system
   and player.source_player_id = staged.source_player_id
  where staged.dataset_version_id = target_version.id
    and staged.validation_status <> 'blocked'
  on conflict (source_system, source_record_id) do update set
    organization_id = excluded.organization_id,
    team_id = excluded.team_id,
    import_batch_id = excluded.import_batch_id,
    dataset_version_id = excluded.dataset_version_id,
    player_id = excluded.player_id,
    fsdb_player_id = coalesce(excluded.fsdb_player_id, scouting_player_seasons.fsdb_player_id),
    record_key = excluded.record_key,
    player_identity_key = excluded.player_identity_key,
    source_player_id = excluded.source_player_id,
    player_name = excluded.player_name,
    team_name = excluded.team_name,
    team_within_timeframe = excluded.team_within_timeframe,
    league_name = excluded.league_name,
    season_label = excluded.season_label,
    position_text = excluded.position_text,
    position_group = excluded.position_group,
    age = excluded.age,
    matches = excluded.matches,
    minutes = excluded.minutes,
    birth_country = excluded.birth_country,
    passport_country = excluded.passport_country,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    date_of_birth = excluded.date_of_birth,
    metrics = excluded.metrics,
    status = 'active',
    deleted_at = null,
    deleted_by = null,
    delete_reason = null,
    source_payload_hash = excluded.source_payload_hash,
    metadata = excluded.metadata;

  get diagnostics published_rows = row_count;

  update public.scouting_players player
  set status = 'inactive'
  where player.status = 'active'
    and player.organization_id is not distinct from target_version.organization_id
    and player.team_id is not distinct from target_version.team_id
    and not exists (
      select 1
      from public.scouting_player_seasons season
      where season.player_id = player.id
        and season.status = 'active'
        and season.deleted_at is null
    );

  update public.scouting_dataset_versions
  set status = case when p_rollback then 'rolled_back' else 'superseded' end
  where id = previous_version_id;

  update public.scouting_dataset_versions
  set status = 'active',
      activated_by = p_actor_id,
      activated_at = now(),
      rollback_from_version_id = case when p_rollback then previous_version_id else null end
  where id = target_version.id;

  update public.scouting_import_batches
  set status = 'published',
      published_by = p_actor_id,
      published_at = now(),
      row_count = target_version.staged_row_count,
      metric_count = target_version.staged_metric_count
  where id = target_version.import_batch_id;

  return jsonb_build_object(
    'datasetVersionId', target_version.id,
    'previousDatasetVersionId', previous_version_id,
    'rowCount', target_version.staged_row_count,
    'metricCount', target_version.staged_metric_count,
    'publishedRows', published_rows,
    'status', 'active',
    'rollback', p_rollback,
    'activatedAt', now()
  );
end;
$$;

drop trigger if exists scouting_source_artifacts_touch_updated_at on public.scouting_source_artifacts;
create trigger scouting_source_artifacts_touch_updated_at
before update on public.scouting_source_artifacts
for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_dataset_versions_touch_updated_at on public.scouting_dataset_versions;
create trigger scouting_dataset_versions_touch_updated_at
before update on public.scouting_dataset_versions
for each row execute function public.scouting_touch_updated_at();

drop trigger if exists scouting_player_identity_links_touch_updated_at on public.scouting_player_identity_links;
create trigger scouting_player_identity_links_touch_updated_at
before update on public.scouting_player_identity_links
for each row execute function public.scouting_touch_updated_at();

alter table public.scouting_source_artifacts enable row level security;
alter table public.scouting_dataset_versions enable row level security;
alter table public.scouting_import_stage_metrics enable row level security;
alter table public.scouting_import_stage_records enable row level security;
alter table public.scouting_import_validations enable row level security;
alter table public.scouting_player_identity_links enable row level security;

revoke all on public.scouting_source_artifacts from anon, authenticated;
revoke all on public.scouting_dataset_versions from anon, authenticated;
revoke all on public.scouting_import_stage_metrics from anon, authenticated;
revoke all on public.scouting_import_stage_records from anon, authenticated;
revoke all on public.scouting_import_validations from anon, authenticated;
revoke all on public.scouting_player_identity_links from anon, authenticated;

grant select on public.scouting_source_artifacts to authenticated;
grant select on public.scouting_dataset_versions to authenticated;
grant select on public.scouting_import_validations to authenticated;
grant select on public.scouting_player_identity_links to authenticated;

drop policy if exists "scouting source artifacts readable by data admins" on public.scouting_source_artifacts;
create policy "scouting source artifacts readable by data admins"
on public.scouting_source_artifacts for select to authenticated
using (app_private.can_administer_scouting_data_scope(organization_id, team_id));

drop policy if exists "scouting dataset versions readable by scouting staff" on public.scouting_dataset_versions;
create policy "scouting dataset versions readable by scouting staff"
on public.scouting_dataset_versions for select to authenticated
using (app_private.can_access_scouting_scope(organization_id, team_id));

drop policy if exists "scouting validations readable by data admins" on public.scouting_import_validations;
create policy "scouting validations readable by data admins"
on public.scouting_import_validations for select to authenticated
using (app_private.can_administer_scouting_data_scope(organization_id, team_id));

drop policy if exists "scouting identity links readable by scouting staff" on public.scouting_player_identity_links;
create policy "scouting identity links readable by scouting staff"
on public.scouting_player_identity_links for select to authenticated
using (app_private.can_access_scouting_scope(organization_id, team_id));

revoke all on function public.start_scouting_dataset_import(uuid, text, text, integer, integer, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_scouting_player_identity_keys(text[]) from public, anon, authenticated;
revoke all on function public.get_scouting_filter_options() from public, anon, authenticated;
revoke all on function public.validate_scouting_dataset_version(uuid) from public, anon, authenticated;
revoke all on function public.publish_scouting_dataset_version(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.start_scouting_dataset_import(uuid, text, text, integer, integer, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.resolve_scouting_player_identity_keys(text[]) to service_role;
grant execute on function public.get_scouting_filter_options() to service_role;
grant execute on function public.validate_scouting_dataset_version(uuid) to service_role;
grant execute on function public.publish_scouting_dataset_version(uuid, uuid, boolean) to service_role;

insert into storage.buckets (id, name, public)
values ('footballscience-scouting-imports', 'footballscience-scouting-imports', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 52428800
    where id = 'footballscience-scouting-imports';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/tab-separated-values',
      'text/plain',
      'application/json',
      'application/pdf'
    ]
    where id = 'footballscience-scouting-imports';
  end if;
end $$;

drop policy if exists "scouting source artifacts uploadable by data admins" on storage.objects;
create policy "scouting source artifacts uploadable by data admins"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'footballscience-scouting-imports'
  and exists (
    select 1
    from public.scouting_source_artifacts artifact
    where artifact.storage_bucket = storage.objects.bucket_id
      and artifact.storage_path = storage.objects.name
      and artifact.status = 'pending'
      and artifact.uploaded_by = (select auth.uid())
      and app_private.can_administer_scouting_data_scope(artifact.organization_id, artifact.team_id)
  )
);
