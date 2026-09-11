-- Analysis Room owns these imported statistics, not FS Player or Squad records.
create schema if not exists app_private;

create table if not exists public.analysis_performance_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id),
  team_id uuid not null references public.platform_teams(id),
  source_key text not null check (source_key = 'nc-courage-sop-v1'),
  revision integer not null check (revision > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_generated_at timestamptz not null,
  imported_at timestamptz not null default now(),
  imported_by uuid not null,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  event_count integer not null check (event_count between 1 and 50000),
  unique (organization_id, team_id, source_key, revision),
  unique (organization_id, team_id, id)
);
create table if not exists public.analysis_performance_sources (
  organization_id uuid not null references public.platform_organizations(id),
  team_id uuid not null references public.platform_teams(id),
  source_key text not null check (source_key = 'nc-courage-sop-v1'),
  revision integer not null default 0,
  current_version_id uuid,
  primary key (organization_id, team_id, source_key),
  foreign key (organization_id, team_id, current_version_id)
    references public.analysis_performance_versions(organization_id, team_id, id)
);
create table if not exists public.analysis_performance_events (
  organization_id uuid not null,
  team_id uuid not null,
  version_id uuid not null,
  source_event_id text not null,
  match_number integer not null,
  category text not null check (category in ('Zone 2','Zone 3','Zone 3.5','Passing Zone','Shooting Zone')),
  outcome text not null check (outcome in ('Completed','Attempted')),
  period text not null check (period in ('1st Half','2nd Half')),
  venue text not null check (venue in ('Home','Away')),
  into_corridor text,
  ball_carriers text[] not null,
  receiving_players text[] not null,
  event_data jsonb not null check (jsonb_typeof(event_data) = 'object'),
  primary key (version_id, source_event_id),
  foreign key (organization_id, team_id, version_id)
    references public.analysis_performance_versions(organization_id, team_id, id)
);
create index if not exists analysis_performance_versions_history_idx
  on public.analysis_performance_versions (organization_id, team_id, revision desc);
create index if not exists analysis_performance_events_filter_idx
  on public.analysis_performance_events (version_id, match_number, category, period);
create index if not exists analysis_performance_events_carriers_idx
  on public.analysis_performance_events using gin (ball_carriers);
create index if not exists analysis_performance_events_receivers_idx
  on public.analysis_performance_events using gin (receiving_players);

alter table public.analysis_performance_versions enable row level security;
alter table public.analysis_performance_sources enable row level security;
alter table public.analysis_performance_events enable row level security;
revoke all on public.analysis_performance_versions from anon, authenticated;
revoke all on public.analysis_performance_sources from anon, authenticated;
revoke all on public.analysis_performance_events from anon, authenticated;
revoke all on public.analysis_performance_versions, public.analysis_performance_sources, public.analysis_performance_events from public;
revoke all on public.analysis_performance_versions, public.analysis_performance_sources, public.analysis_performance_events from service_role;
grant select, insert on public.analysis_performance_versions, public.analysis_performance_events to service_role;
grant select, insert, update on public.analysis_performance_sources to service_role;

create or replace function app_private.analysis_performance_require_staff(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid
) returns void language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.platform_memberships m
    join public.platform_teams t on t.id = p_team_id and t.organization_id = m.organization_id
    join public.platform_user_profiles u on u.user_id = m.user_id and u.status = 'active' and u.deleted_at is null
    where m.user_id = p_actor_id and m.organization_id = p_organization_id
      and m.status = 'active' and m.deleted_at is null and t.status = 'active' and t.deleted_at is null
      and m.role in ('admin','club-admin','team-admin','coach','analyst')
      and (m.scope = 'organization' or (m.scope = 'club' and m.club_id = t.club_id) or (m.scope = 'team' and m.team_id = t.id))
  ) then raise exception 'Analysis Room access denied.' using errcode = '42501'; end if;
end;
$$;
revoke all on function app_private.analysis_performance_require_staff(uuid, uuid, uuid) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.analysis_performance_require_staff(uuid, uuid, uuid) to service_role;

create or replace function public.analysis_performance_import(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_expected_revision integer,
  p_content_hash text, p_source_generated_at timestamptz, p_manifest jsonb, p_events jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_source public.analysis_performance_sources%rowtype;
  v_id uuid;
  v_count integer;
begin
  perform app_private.analysis_performance_require_staff(p_actor_id, p_organization_id, p_team_id);
  if p_expected_revision is null or p_expected_revision < 0 or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_source_generated_at is null or p_manifest is null or p_events is null
    or jsonb_typeof(p_events) <> 'array' or jsonb_typeof(p_manifest->'matches') is distinct from 'array'
    or p_manifest->>'sourceKey' is distinct from 'nc-courage-sop-v1'
    or p_manifest->>'schemaVersion' is distinct from '1'
  then raise exception 'Invalid statistics import.' using errcode = '22023'; end if;
  v_count := jsonb_array_length(p_events);
  if v_count < 1 or v_count > 50000 or jsonb_array_length(p_manifest->'matches') not between 1 and 300
  then raise exception 'Invalid import size.' using errcode = '22023'; end if;

  -- Serialize the first import too, before a source pointer exists.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_team_id::text || ':analysis-performance', 0));
  insert into public.analysis_performance_sources(organization_id, team_id, source_key)
    values (p_organization_id, p_team_id, 'nc-courage-sop-v1') on conflict do nothing;
  select * into v_source from public.analysis_performance_sources
    where organization_id = p_organization_id and team_id = p_team_id and source_key = 'nc-courage-sop-v1' for update;
  if v_source.revision <> p_expected_revision then
    raise exception 'Statistics changed. Preview the import again.' using errcode = '40001';
  end if;
  if exists (select 1 from public.analysis_performance_versions where id = v_source.current_version_id and content_hash = p_content_hash) then
    return jsonb_build_object('unchanged', true, 'versionId', v_source.current_version_id, 'revision', v_source.revision);
  end if;
  insert into public.analysis_performance_versions(organization_id, team_id, source_key, revision, content_hash, source_generated_at, imported_by, manifest, event_count)
    values (p_organization_id, p_team_id, 'nc-courage-sop-v1', v_source.revision + 1, p_content_hash, p_source_generated_at, p_actor_id, p_manifest, v_count) returning id into v_id;
  insert into public.analysis_performance_events(organization_id, team_id, version_id, source_event_id, match_number, category, outcome, period, venue, into_corridor, ball_carriers, receiving_players, event_data)
    select p_organization_id, p_team_id, v_id, e->>'id', (e->>'matchNumber')::integer, e->>'eventCategory', e->>'outcome', e->>'period', e->>'homeAway', e->>'progressIntoCorridor',
      array(select jsonb_array_elements_text(e->'ballCarriers')), array(select jsonb_array_elements_text(e->'receivingPlayers')), e
    from jsonb_array_elements(p_events) e;
  if exists (
    select 1 from jsonb_array_elements(p_manifest->'matches') m
    where (m->>'cleanEvents')::integer <> (select count(*) from public.analysis_performance_events where version_id = v_id and match_number = (m->>'matchNumber')::integer)
  ) or (select coalesce(sum((m->>'cleanEvents')::integer),0) from jsonb_array_elements(p_manifest->'matches') m) <> v_count
  then raise exception 'Match counts do not match the imported events.' using errcode = '22023'; end if;
  update public.analysis_performance_sources set revision = v_source.revision + 1, current_version_id = v_id
    where organization_id = p_organization_id and team_id = p_team_id and source_key = 'nc-courage-sop-v1';
  return jsonb_build_object('unchanged', false, 'versionId', v_id, 'revision', v_source.revision + 1);
end;
$$;

create or replace function public.analysis_performance_read(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_filters jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_source public.analysis_performance_sources%rowtype;
  v_version public.analysis_performance_versions%rowtype;
  v_id uuid;
  v_offset integer := least(50000, greatest(0, coalesce((p_filters->>'offset')::integer, 0)));
  v_result jsonb;
  v_status jsonb;
begin
  perform app_private.analysis_performance_require_staff(p_actor_id, p_organization_id, p_team_id);
  select * into v_source from public.analysis_performance_sources where organization_id = p_organization_id and team_id = p_team_id and source_key = 'nc-courage-sop-v1';
  v_id := coalesce(nullif(p_filters->>'versionId','')::uuid, v_source.current_version_id);
  select * into v_version from public.analysis_performance_versions where organization_id = p_organization_id and team_id = p_team_id and id = v_id;
  if v_id is not null and v_version.id is null then raise exception 'Version not found.' using errcode = 'P0002'; end if;
  v_status := jsonb_build_object(
    'currentRevision', coalesce(v_source.revision, 0),
    'version', case when v_version.id is null then null else jsonb_build_object('id', v_version.id, 'revision', v_version.revision, 'hash', v_version.content_hash,
      'importedAt', v_version.imported_at, 'sourceGeneratedAt', v_version.source_generated_at, 'eventCount', v_version.event_count, 'matchCount', jsonb_array_length(v_version.manifest->'matches')) end,
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.revision desc), '[]'::jsonb) from
      (select id, revision, imported_at as "importedAt" from public.analysis_performance_versions where organization_id = p_organization_id and team_id = p_team_id order by revision desc limit 20) h)
  );
  if v_version.id is null or p_filters->>'mode' = 'status' then return v_status; end if;
  with filtered as materialized (
    select e.source_event_id, e.match_number, e.category, e.outcome, e.into_corridor, e.ball_carriers, e.receiving_players from public.analysis_performance_events e
    where e.version_id = v_version.id and e.organization_id = p_organization_id and e.team_id = p_team_id
      and (nullif(p_filters->>'match','') is null or e.match_number = (p_filters->>'match')::integer)
      and (nullif(p_filters->>'category','') is null or e.category = p_filters->>'category')
      and (nullif(p_filters->>'period','') is null or e.period = p_filters->>'period')
      and (nullif(p_filters->>'outcome','') is null or e.outcome = p_filters->>'outcome')
      and (nullif(p_filters->>'venue','') is null or e.venue = p_filters->>'venue')
      and (nullif(p_filters->>'player','') is null or e.ball_carriers @> array[p_filters->>'player'] or e.receiving_players @> array[p_filters->>'player'])
  ), player_events as (
    select f.source_event_id, f.outcome, n.name, 'carrier'::text as role from filtered f cross join lateral unnest(f.ball_carriers) n(name)
    union all select f.source_event_id, f.outcome, n.name, 'receiver' from filtered f cross join lateral unnest(f.receiving_players) n(name)
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object('events', count(*), 'completed', count(*) filter(where outcome = 'Completed'), 'matches', count(distinct match_number)) from filtered),
    'byMatch', (select coalesce(jsonb_agg(to_jsonb(x) order by x."matchNumber"), '[]'::jsonb) from
      (select match_number as "matchNumber", count(*) as events, count(*) filter(where outcome = 'Completed') as completed from filtered group by match_number) x),
    'players', (select coalesce(jsonb_agg(to_jsonb(x) order by x.events desc, x.name, x.role), '[]'::jsonb) from
      (select name, role, count(*) as events, count(*) filter(where outcome = 'Completed') as completed from player_events group by name, role order by events desc, name, role limit 100) x),
    'zones', (select coalesce(jsonb_agg(to_jsonb(x) order by x.category, x.corridor), '[]'::jsonb) from
      (select category, into_corridor as corridor, count(*) as events, count(*) filter(where outcome = 'Completed') as completed from filtered group by category, into_corridor) x),
    'events', (select coalesce(jsonb_agg(x.event_data order by x.match_number, x.source_event_id), '[]'::jsonb) from
      (select f.match_number, f.source_event_id, e.event_data from
        (select match_number, source_event_id from filtered order by match_number, source_event_id limit 50 offset v_offset) f
        join public.analysis_performance_events e on e.version_id = v_version.id and e.source_event_id = f.source_event_id) x),
    'hasMore', (select count(*) > v_offset + 50 from filtered), 'offset', v_offset
  ) into v_result;
  return v_status || v_result || jsonb_build_object('matches', v_version.manifest->'matches', 'playerOptions', v_version.manifest->'playerOptions');
end;
$$;
revoke all on function public.analysis_performance_import(uuid, uuid, uuid, integer, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.analysis_performance_read(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.analysis_performance_import(uuid, uuid, uuid, integer, text, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.analysis_performance_read(uuid, uuid, uuid, jsonb) to service_role;

insert into public.platform_permission_matrix(module_id, action, roles, scope, requires_team_scope, description)
values
  ('analysis-room', 'read', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, 'Read own-team performance versions'),
  ('analysis-room', 'write', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, 'Preview and confirm approved statistics imports')
on conflict (module_id, action) do update set roles = excluded.roles, scope = excluded.scope, requires_team_scope = true, description = excluded.description;
