-- Keep the current legacy Squad source projected into the canonical Squad
-- tables used by Leaderboard. The compatibility scope is deliberately bound
-- to the one verified live tenant until Squad becomes database-primary.

create index if not exists squad_players_org_legacy_id_projection_idx
  on public.squad_players (organization_id, ((metadata ->> 'legacyId')))
  where metadata ? 'legacyId' and status <> 'archived';

create index if not exists squad_import_batches_projection_applied_idx
  on public.squad_import_batches (team_id, applied_at desc)
  where source = 'integration' and status = 'applied';

create or replace function public.sync_squad_roster_projection(
  p_actor_id uuid,
  p_platform_organization_id uuid,
  p_platform_team_id uuid,
  p_source_key text,
  p_source_revision bigint,
  p_source_hash text,
  p_source_updated_at timestamptz,
  p_players jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  platform_team public.platform_teams%rowtype;
  squad_team public.squad_teams%rowtype;
  active_season public.squad_seasons%rowtype;
  source_player jsonb;
  source_player_count integer;
  unique_source_player_count integer;
  existing_player_count integer;
  projected_count integer := 0;
  deactivated_count integer := 0;
  legacy_id text;
  target_player_id uuid;
  target_membership_id uuid;
  season_label text;
  import_batch_id uuid;
begin
  if p_source_key is distinct from 'football-player-profiles-v1'
    or p_source_revision < 1
    or p_source_hash is null
    or p_source_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid Squad projection source identity.' using errcode = '22023';
  end if;

  if not app_private.leaderboard_actor_has_role(
    p_actor_id,
    p_platform_organization_id,
    p_platform_team_id,
    array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical']
  ) then
    raise exception 'Active team membership is required for Squad projection.' using errcode = '42501';
  end if;

  select team.* into platform_team
  from public.platform_teams team
  join public.platform_organizations organization
    on organization.id = team.organization_id
  where team.id = p_platform_team_id
    and team.organization_id = p_platform_organization_id
    and team.status = 'active'
    and team.deleted_at is null
    and organization.status = 'active'
    and organization.deleted_at is null
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live';

  if not found then
    return jsonb_build_object(
      'applied', false,
      'targetMatched', false,
      'reason', 'canonical-squad-or-non-legacy-target'
    );
  end if;

  select team.* into squad_team
  from public.squad_teams team
  where team.id = platform_team.id
    and team.organization_id = platform_team.organization_id
    and team.status = 'active';

  if not found then
    raise exception 'Verified Platform team has no canonical Squad team.' using errcode = '55000';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'Squad projection players must be an array.' using errcode = '22023';
  end if;

  select count(*), count(distinct player ->> 'playerId')
    into source_player_count, unique_source_player_count
  from jsonb_array_elements(p_players) player;

  if source_player_count < 1 or source_player_count > 500
    or unique_source_player_count <> source_player_count
    or exists (
      select 1
      from jsonb_array_elements(p_players) player
      where jsonb_typeof(player) <> 'object'
        or nullif(btrim(player ->> 'playerId'), '') is null
        or char_length(player ->> 'playerId') > 180
        or nullif(btrim(player ->> 'displayName'), '') is null
        or char_length(player ->> 'displayName') > 180
        or coalesce(player ->> 'availabilityStatus', 'available') not in (
          'available','injured','managed','rehab','unavailable','national-team','vacation','personal','suspended','loan','unknown'
        )
        or coalesce(player ->> 'roleGroup', 'forward') not in ('goalkeeper','defender','midfielder','forward')
        or coalesce(player ->> 'squadStatus', 'squad') not in ('key','important','rotation','squad','depth','development','academy','trial','loan')
    )
  then
    raise exception 'Squad projection player payload is invalid or ambiguous.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('squad-roster-projection:' || squad_team.id::text, 0));

  select season.* into active_season
  from public.squad_seasons season
  where season.organization_id = squad_team.organization_id
    and season.team_id = squad_team.id
    and season.status = 'active'
  order by season.starts_on desc nulls last, season.created_at desc
  limit 1;

  if not found then
    season_label := to_char(coalesce(p_source_updated_at, current_timestamp) at time zone 'UTC', 'YYYY');
    insert into public.squad_seasons (
      organization_id,
      team_id,
      label,
      starts_on,
      ends_on,
      status,
      metadata
    ) values (
      squad_team.organization_id,
      squad_team.id,
      season_label,
      make_date(season_label::integer, 1, 1),
      make_date(season_label::integer, 12, 31),
      'active',
      jsonb_build_object('source', 'legacy-squad-roster-projection', 'sourceKey', p_source_key)
    ) on conflict (team_id, label) do nothing;

    select season.* into active_season
    from public.squad_seasons season
    where season.organization_id = squad_team.organization_id
      and season.team_id = squad_team.id
      and season.label = season_label
      and season.status = 'active';
  end if;

  if active_season.id is null then
    raise exception 'Squad projection requires one active season.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.squad_import_batches batch
    where batch.organization_id = squad_team.organization_id
      and batch.team_id = squad_team.id
      and batch.source = 'integration'
      and batch.status = 'applied'
      and batch.metadata ->> 'projectionSource' = p_source_key
      and batch.metadata ->> 'sourceRevision' = p_source_revision::text
      and batch.metadata ->> 'sourceHash' = p_source_hash
      and (
        select count(*)
        from public.squad_roster_memberships membership
        where membership.organization_id = squad_team.organization_id
          and membership.team_id = squad_team.id
          and membership.season_id = active_season.id
          and membership.status = 'active'
          and membership.deleted_at is null
          and membership.metadata ->> 'projectionSource' = p_source_key
          and membership.metadata ->> 'sourceRevision' = p_source_revision::text
          and membership.metadata ->> 'sourceHash' = p_source_hash
      ) = source_player_count
  ) then
    return jsonb_build_object(
      'applied', false,
      'targetMatched', true,
      'reason', 'source-already-projected',
      'sourceRevision', p_source_revision
    );
  end if;

  insert into public.platform_tenant_links (
    organization_id,
    club_id,
    team_id,
    module_id,
    module_table,
    module_record_id,
    scope,
    status,
    metadata
  ) values (
    platform_team.organization_id,
    platform_team.club_id,
    platform_team.id,
    'player-profiles',
    'squad_teams',
    squad_team.id,
    'team',
    'active',
    jsonb_build_object('source', 'legacy-squad-roster-projection', 'sourceKey', p_source_key)
  ) on conflict (module_id, module_table, module_record_id) do nothing;

  if not exists (
    select 1
    from public.platform_tenant_links link
    where link.organization_id = platform_team.organization_id
      and link.team_id = platform_team.id
      and link.module_id = 'player-profiles'
      and link.module_table = 'squad_teams'
      and link.module_record_id = squad_team.id
      and link.status = 'active'
  ) then
    raise exception 'Canonical Platform-to-Squad link conflicts with another tenant.' using errcode = '55000';
  end if;

  for source_player in select value from jsonb_array_elements(p_players)
  loop
    legacy_id := btrim(source_player ->> 'playerId');
    select count(*), (array_agg(player.id order by player.id))[1]
      into existing_player_count, target_player_id
    from public.squad_players player
    where player.organization_id = squad_team.organization_id
      and player.metadata ->> 'legacyId' = legacy_id
      and player.status <> 'archived';

    if existing_player_count > 1 then
      raise exception 'Legacy Squad player identity is ambiguous.' using errcode = '55000';
    end if;

    if existing_player_count = 0 then
      insert into public.squad_players (
        organization_id,
        display_name,
        sort_name,
        status,
        metadata
      ) values (
        squad_team.organization_id,
        source_player ->> 'displayName',
        source_player ->> 'sortName',
        'active',
        jsonb_strip_nulls(jsonb_build_object(
          'legacyId', legacy_id,
          'photoUrl', nullif(source_player ->> 'photoUrl', ''),
          'rosterType', 'squad',
          'countsInSquad', true,
          'projectionSource', p_source_key,
          'sourceRevision', p_source_revision
        ))
      ) returning id into target_player_id;
    else
      update public.squad_players player
      set display_name = source_player ->> 'displayName',
          sort_name = source_player ->> 'sortName',
          status = 'active',
          updated_at = now(),
          metadata = (player.metadata - 'photoUrl') || jsonb_strip_nulls(jsonb_build_object(
            'legacyId', legacy_id,
            'photoUrl', nullif(source_player ->> 'photoUrl', ''),
            'rosterType', 'squad',
            'countsInSquad', true,
            'projectionSource', p_source_key,
            'sourceRevision', p_source_revision
          ))
      where player.id = target_player_id;
    end if;

    insert into public.squad_roster_memberships (
      organization_id,
      club_id,
      team_id,
      season_id,
      player_id,
      shirt_number,
      position_label,
      primary_role,
      secondary_roles,
      role_group,
      preferred_side,
      squad_status,
      availability_status,
      status,
      metadata
    ) values (
      squad_team.organization_id,
      squad_team.club_id,
      squad_team.id,
      active_season.id,
      target_player_id,
      nullif(source_player ->> 'shirtNumber', ''),
      nullif(source_player ->> 'position', ''),
      nullif(source_player ->> 'primaryRole', ''),
      array(select jsonb_array_elements_text(coalesce(source_player -> 'secondaryRoles', '[]'::jsonb))),
      source_player ->> 'roleGroup',
      source_player ->> 'preferredSide',
      source_player ->> 'squadStatus',
      source_player ->> 'availabilityStatus',
      'active',
      jsonb_build_object(
        'legacyId', legacy_id,
        'projectionSource', p_source_key,
        'sourceRevision', p_source_revision,
        'sourceHash', p_source_hash
      )
    ) on conflict (team_id, season_id, player_id) do update set
      shirt_number = excluded.shirt_number,
      position_label = excluded.position_label,
      primary_role = excluded.primary_role,
      secondary_roles = excluded.secondary_roles,
      role_group = excluded.role_group,
      preferred_side = excluded.preferred_side,
      squad_status = excluded.squad_status,
      availability_status = excluded.availability_status,
      status = 'active',
      left_on = null,
      updated_at = now(),
      metadata = (public.squad_roster_memberships.metadata - 'projectionInactive') || excluded.metadata
    returning id into target_membership_id;

    projected_count := projected_count + 1;
  end loop;

  update public.squad_roster_memberships membership
  set status = 'inactive',
      left_on = coalesce(membership.left_on, (current_timestamp at time zone 'UTC')::date),
      updated_at = now(),
      metadata = membership.metadata || jsonb_build_object(
        'projectionSource', p_source_key,
        'sourceRevision', p_source_revision,
        'sourceHash', p_source_hash,
        'projectionInactive', true
      )
  where membership.organization_id = squad_team.organization_id
    and membership.team_id = squad_team.id
    and membership.status = 'active'
    and membership.metadata ->> 'projectionSource' = p_source_key
    and (
      membership.season_id <> active_season.id
      or not exists (
        select 1
        from jsonb_array_elements(p_players) player
        where player ->> 'playerId' = membership.metadata ->> 'legacyId'
      )
    );
  get diagnostics deactivated_count = row_count;

  insert into public.squad_import_batches (
    organization_id,
    team_id,
    season_id,
    source,
    status,
    total_rows,
    accepted_rows,
    rejected_rows,
    error_report,
    applied_at,
    metadata
  ) values (
    squad_team.organization_id,
    squad_team.id,
    active_season.id,
    'integration',
    'applied',
    source_player_count,
    projected_count,
    0,
    '[]'::jsonb,
    now(),
    jsonb_build_object(
      'projectionSource', p_source_key,
      'sourceRevision', p_source_revision,
      'sourceHash', p_source_hash,
      'sourceUpdatedAt', p_source_updated_at,
      'purpose', 'leaderboard-active-roster'
    )
  ) returning id into import_batch_id;

  insert into public.squad_audit_events (
    organization_id,
    club_id,
    team_id,
    season_id,
    action,
    severity,
    actor_id,
    destructive,
    details
  ) values (
    squad_team.organization_id,
    squad_team.club_id,
    squad_team.id,
    active_season.id,
    'squad.roster-projection.applied',
    'notice',
    p_actor_id,
    false,
    jsonb_build_object(
      'sourceKey', p_source_key,
      'sourceRevision', p_source_revision,
      'sourceHash', p_source_hash,
      'importBatchId', import_batch_id,
      'projectedPlayers', projected_count,
      'deactivatedMemberships', deactivated_count
    )
  );

  return jsonb_build_object(
    'applied', true,
    'targetMatched', true,
    'sourceRevision', p_source_revision,
    'projectedPlayers', projected_count,
    'deactivatedMemberships', deactivated_count,
    'seasonId', active_season.id,
    'importBatchId', import_batch_id
  );
end;
$$;

revoke all on function public.sync_squad_roster_projection(uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb)
  from public, anon, authenticated, service_role;

grant select, insert on public.platform_tenant_links to service_role;
grant select, insert, update on public.squad_seasons, public.squad_players, public.squad_roster_memberships to service_role;
grant select, insert on public.squad_import_batches, public.squad_audit_events to service_role;
grant execute on function public.sync_squad_roster_projection(uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb)
  to service_role;
