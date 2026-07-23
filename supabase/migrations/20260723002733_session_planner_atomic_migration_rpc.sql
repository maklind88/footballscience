-- Atomic, server-only Session Planner migration executor.
--
-- The application runtime does not call this RPC. It exists only for an
-- explicitly confirmed staging-only migration drill using an already
-- integrity-verified private bundle. Any exception rolls back every command.

create or replace function app_private.session_planner_apply_session_command(
  p_command jsonb,
  p_organization_id uuid,
  p_team_id uuid,
  p_actor_id uuid,
  p_operation text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  command_action text := p_command ->> 'action';
  command_record jsonb := nullif(p_command -> 'record', 'null'::jsonb);
  command_id uuid := (p_command ->> 'id')::uuid;
  expected_version bigint := nullif(p_command ->> 'expectedRowVersion', '')::bigint;
  expected_applied_version bigint := (p_command ->> 'expectedAppliedRowVersion')::bigint;
  expected_archived boolean := coalesce((p_command ->> 'expectedAppliedArchived')::boolean, false);
  applied_version bigint;
  affected integer;
begin
  if p_command ->> 'recordType' <> 'session'
    or command_action not in ('create', 'update', 'restore', 'archive', 'restore-existing', 'archive-created') then
    raise exception 'Invalid Session Planner session migration command.' using errcode = 'P0001';
  end if;
  if command_record is not null and (
    command_record ->> 'id' <> command_id::text
    or (command_record ->> 'organizationId')::uuid <> p_organization_id
    or (command_record ->> 'teamId')::uuid <> p_team_id
  ) then
    raise exception 'Session Planner session command scope mismatch.' using errcode = '23514';
  end if;

  if command_action = 'create' then
    if expected_version is not null or command_record is null then
      raise exception 'Invalid Session Planner session create guard.' using errcode = 'P0001';
    end if;
    insert into public.session_planner_sessions (
      id, organization_id, team_id, session_date, session_slot,
      legacy_session_id, title, theme, selected_block_legacy_id,
      schema_version, content, content_hash, created_by, updated_by
    ) values (
      command_id,
      p_organization_id,
      p_team_id,
      (command_record ->> 'sessionDate')::date,
      command_record ->> 'sessionSlot',
      command_record ->> 'legacySessionId',
      coalesce(command_record ->> 'title', ''),
      coalesce(command_record ->> 'theme', ''),
      coalesce(command_record ->> 'selectedBlockLegacyId', ''),
      (command_record ->> 'schemaVersion')::integer,
      command_record -> 'content',
      command_record ->> 'contentHash',
      p_actor_id,
      p_actor_id
    )
    returning row_version into applied_version;
  elsif command_action in ('update', 'restore', 'restore-existing') then
    if expected_version is null or command_record is null then
      raise exception 'Invalid Session Planner session update guard.' using errcode = 'P0001';
    end if;
    if expected_archived and nullif(command_record ->> 'archivedAt', '') is null then
      raise exception 'Archived Session Planner baseline timestamp is missing.' using errcode = 'P0001';
    end if;
    update public.session_planner_sessions
       set session_date = (command_record ->> 'sessionDate')::date,
           session_slot = command_record ->> 'sessionSlot',
           legacy_session_id = command_record ->> 'legacySessionId',
           title = coalesce(command_record ->> 'title', ''),
           theme = coalesce(command_record ->> 'theme', ''),
           selected_block_legacy_id = coalesce(command_record ->> 'selectedBlockLegacyId', ''),
           schema_version = (command_record ->> 'schemaVersion')::integer,
           content = command_record -> 'content',
           content_hash = command_record ->> 'contentHash',
           archived_at = case
             when expected_archived then (command_record ->> 'archivedAt')::timestamptz
             else null
           end,
           archived_by = case
             when expected_archived then nullif(command_record ->> 'archivedBy', '')::uuid
             else null
           end,
           archive_reason = case
             when expected_archived then nullif(command_record ->> 'archiveReason', '')
             else null
           end,
           updated_by = p_actor_id
     where id = command_id
       and organization_id = p_organization_id
       and team_id = p_team_id
       and row_version = expected_version
    returning row_version into applied_version;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Session Planner session revision conflict.' using errcode = '40001';
    end if;
  else
    if expected_version is null or command_record is not null then
      raise exception 'Invalid Session Planner session archive guard.' using errcode = 'P0001';
    end if;
    update public.session_planner_sessions
       set archived_at = pg_catalog.clock_timestamp(),
           archived_by = p_actor_id,
           archive_reason = case
             when p_operation = 'rollback' then 'Rollback of Session Planner migration.'
             else 'Session Planner source tombstone.'
           end,
           updated_by = p_actor_id
     where id = command_id
       and organization_id = p_organization_id
       and team_id = p_team_id
       and row_version = expected_version
       and archived_at is null
    returning row_version into applied_version;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Session Planner session archive conflict.' using errcode = '40001';
    end if;
  end if;

  if applied_version <> expected_applied_version then
    raise exception 'Session Planner session applied revision mismatch.' using errcode = '40001';
  end if;
  return applied_version;
end;
$$;

create or replace function app_private.session_planner_apply_block_command(
  p_command jsonb,
  p_organization_id uuid,
  p_team_id uuid,
  p_actor_id uuid,
  p_operation text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  command_action text := p_command ->> 'action';
  command_record jsonb := nullif(p_command -> 'record', 'null'::jsonb);
  command_id uuid := (p_command ->> 'id')::uuid;
  expected_version bigint := nullif(p_command ->> 'expectedRowVersion', '')::bigint;
  expected_applied_version bigint := (p_command ->> 'expectedAppliedRowVersion')::bigint;
  expected_archived boolean := coalesce((p_command ->> 'expectedAppliedArchived')::boolean, false);
  applied_version bigint;
  affected integer;
begin
  if p_command ->> 'recordType' <> 'block'
    or command_action not in ('create', 'update', 'restore', 'archive', 'restore-existing', 'archive-created') then
    raise exception 'Invalid Session Planner block migration command.' using errcode = 'P0001';
  end if;
  if command_record is not null and (
    command_record ->> 'id' <> command_id::text
    or (command_record ->> 'organizationId')::uuid <> p_organization_id
    or (command_record ->> 'teamId')::uuid <> p_team_id
  ) then
    raise exception 'Session Planner block command scope mismatch.' using errcode = '23514';
  end if;

  if command_action = 'create' then
    if expected_version is not null or command_record is null then
      raise exception 'Invalid Session Planner block create guard.' using errcode = 'P0001';
    end if;
    insert into public.session_planner_blocks (
      id, organization_id, team_id, session_id, legacy_block_id,
      sort_order, schema_version, payload, payload_hash, created_by, updated_by
    ) values (
      command_id,
      p_organization_id,
      p_team_id,
      (command_record ->> 'sessionId')::uuid,
      command_record ->> 'legacyBlockId',
      (command_record ->> 'sortOrder')::integer,
      (command_record ->> 'schemaVersion')::integer,
      command_record -> 'payload',
      command_record ->> 'payloadHash',
      p_actor_id,
      p_actor_id
    )
    returning row_version into applied_version;
  elsif command_action in ('update', 'restore', 'restore-existing') then
    if expected_version is null or command_record is null then
      raise exception 'Invalid Session Planner block update guard.' using errcode = 'P0001';
    end if;
    if expected_archived and nullif(command_record ->> 'archivedAt', '') is null then
      raise exception 'Archived Session Planner block baseline timestamp is missing.' using errcode = 'P0001';
    end if;
    update public.session_planner_blocks
       set session_id = (command_record ->> 'sessionId')::uuid,
           legacy_block_id = command_record ->> 'legacyBlockId',
           sort_order = (command_record ->> 'sortOrder')::integer,
           schema_version = (command_record ->> 'schemaVersion')::integer,
           payload = command_record -> 'payload',
           payload_hash = command_record ->> 'payloadHash',
           archived_at = case
             when expected_archived then (command_record ->> 'archivedAt')::timestamptz
             else null
           end,
           archived_by = case
             when expected_archived then nullif(command_record ->> 'archivedBy', '')::uuid
             else null
           end,
           archive_reason = case
             when expected_archived then nullif(command_record ->> 'archiveReason', '')
             else null
           end,
           updated_by = p_actor_id
     where id = command_id
       and organization_id = p_organization_id
       and team_id = p_team_id
       and row_version = expected_version
    returning row_version into applied_version;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Session Planner block revision conflict.' using errcode = '40001';
    end if;
  else
    if expected_version is null or command_record is not null then
      raise exception 'Invalid Session Planner block archive guard.' using errcode = 'P0001';
    end if;
    update public.session_planner_blocks
       set archived_at = coalesce(
             nullif(p_command ->> 'tombstoneAt', '')::timestamptz,
             pg_catalog.clock_timestamp()
           ),
           archived_by = p_actor_id,
           archive_reason = case
             when p_operation = 'rollback' then 'Rollback of Session Planner migration.'
             else 'Session Planner source tombstone.'
           end,
           updated_by = p_actor_id
     where id = command_id
       and organization_id = p_organization_id
       and team_id = p_team_id
       and row_version = expected_version
       and archived_at is null
    returning row_version into applied_version;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Session Planner block archive conflict.' using errcode = '40001';
    end if;
  end if;

  if applied_version <> expected_applied_version then
    raise exception 'Session Planner block applied revision mismatch.' using errcode = '40001';
  end if;
  return applied_version;
end;
$$;

create or replace function app_private.session_planner_can_operate_migration(
  p_actor_id uuid,
  p_organization_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users actor
     where actor.id = p_actor_id
       and coalesce(actor.raw_app_meta_data ->> 'status', 'active') = 'active'
       and (
         actor.raw_app_meta_data ->> 'role' = 'admin'
         or exists (
           select 1
             from public.platform_memberships membership
             join public.platform_teams target_team
               on target_team.id = p_team_id
              and target_team.organization_id = p_organization_id
              and target_team.status = 'active'
              and target_team.deleted_at is null
            where membership.user_id = p_actor_id
              and membership.organization_id = p_organization_id
              and membership.status = 'active'
              and membership.deleted_at is null
              and (
                (
                  membership.scope = 'organization'
                  and membership.role = 'admin'
                )
                or (
                  membership.scope = 'club'
                  and membership.club_id = target_team.club_id
                  and membership.role in ('admin', 'club-admin')
                )
                or (
                  membership.scope = 'team'
                  and membership.team_id = target_team.id
                  and membership.role in ('admin', 'club-admin', 'team-admin')
                )
              )
         )
       )
  );
$$;

create or replace function public.execute_session_planner_migration_bundle(
  p_bundle jsonb,
  p_expected_bundle_sha256 text,
  p_source_organization_id text,
  p_confirmation text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_name text := p_bundle ->> 'operation';
  target_organization_id uuid := (p_bundle #>> '{scope,organizationId}')::uuid;
  target_team_id uuid := (p_bundle #>> '{scope,teamId}')::uuid;
  actor_id uuid := (p_bundle ->> 'actorId')::uuid;
  expected_source_revision bigint := (p_bundle #>> '{source,revision}')::bigint;
  expected_source_hash text := p_bundle #>> '{source,hash}';
  plan_sha256 text := p_bundle ->> 'planSha256';
  project_ref text := p_bundle ->> 'projectRef';
  request_id text := p_bundle ->> 'requestId';
  command_value jsonb;
  command_priority integer;
  applied_sessions integer := 0;
  applied_blocks integer := 0;
  run_id uuid;
  source_record public.platform_app_state_records%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Session Planner migration RPC requires service_role.' using errcode = '42501';
  end if;
  if p_bundle ->> 'schema' <> 'footballscience-session-planner-migration-bundle-v1'
    or coalesce((p_bundle ->> 'executionEnabled')::boolean, true)
    or coalesce((p_bundle ->> 'transactionRequired')::boolean, false) is not true
    or coalesce((p_bundle ->> 'containsCoachingContent')::boolean, false) is not true
    or p_bundle ->> 'target' <> 'staging'
    or p_bundle #>> '{source,storageKey}' <> 'football-session-planner-v3'
    or operation_name is null
    or operation_name not in ('backfill', 'rollback') then
    raise exception 'Session Planner migration bundle contract is invalid.' using errcode = 'P0001';
  end if;
  if p_confirmation <> case
    when operation_name = 'backfill' then 'APPLY_SESSION_PLANNER_BACKFILL'
    else 'APPLY_SESSION_PLANNER_ROLLBACK'
  end then
    raise exception 'Session Planner migration confirmation is invalid.' using errcode = 'P0001';
  end if;
  if coalesce(p_expected_bundle_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or p_bundle #>> '{integrity,contentSha256}' <> p_expected_bundle_sha256
    or coalesce(plan_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(expected_source_hash ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(project_ref ~ '^[a-z0-9][a-z0-9-]{2,79}$', false) is not true
    or request_id is null
    or char_length(request_id) not between 1 and 180
    or jsonb_typeof(p_bundle -> 'commands') <> 'array'
    or jsonb_array_length(p_bundle -> 'commands') <> (p_bundle ->> 'commandCount')::integer then
    raise exception 'Session Planner migration integrity metadata is invalid.' using errcode = 'P0001';
  end if;
  if p_source_organization_id <> 'global' then
    raise exception 'Session Planner migration source organization must be global.' using errcode = 'P0001';
  end if;
  if not app_private.session_planner_can_operate_migration(
    actor_id,
    target_organization_id,
    target_team_id
  ) then
    raise exception 'Session Planner migration actor is not authorized for this tenant.' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.platform_teams teams
     where teams.id = target_team_id
       and teams.organization_id = target_organization_id
       and teams.status = 'active'
       and teams.deleted_at is null
  ) then
    raise exception 'Session Planner migration tenant is not active.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('session-planner-migration:' || target_team_id::text, 0)
  );
  select *
    into source_record
    from public.platform_app_state_records records
   where records.organization_id = p_source_organization_id
     and records.state_key = 'football-session-planner-v3'
   for share;
  if not found
    or source_record.removed
    or source_record.revision <> expected_source_revision
    or source_record.value_hash <> expected_source_hash then
    raise exception 'Session Planner source checkpoint changed.' using errcode = '40001';
  end if;

  insert into public.session_planner_migration_runs (
    organization_id, team_id, source_storage_key, source_revision, source_hash,
    mode, status, actor_id, verification_summary
  ) values (
    target_organization_id, target_team_id, 'football-session-planner-v3',
    expected_source_revision, expected_source_hash,
    operation_name, 'processing', actor_id,
    jsonb_build_object(
      'planSha256', plan_sha256,
      'bundleSha256', p_expected_bundle_sha256,
      'projectRef', project_ref,
      'requestId', request_id
    )
  )
  on conflict (team_id, source_storage_key, source_revision, source_hash, mode)
  do update set
    status = 'processing',
    actor_id = excluded.actor_id,
    completed_at = null,
    error_message = null,
    verification_summary = excluded.verification_summary
  where (
    session_planner_migration_runs.status in ('planned', 'failed')
    and session_planner_migration_runs.verification_summary ->> 'planSha256' = plan_sha256
  ) or (
    session_planner_migration_runs.status = 'rolled-back'
    and operation_name = 'backfill'
  )
  returning id into run_id;
  if run_id is null then
    raise exception 'Session Planner migration run is already active, completed, or differs from the reviewed plan.'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config('app.session_planner_actor_id', actor_id::text, true);
  perform pg_catalog.set_config('app.session_planner_request_id', request_id, true);

  for command_value, command_priority in
    select commands.value, case
      when operation_name = 'backfill' and commands.value ->> 'recordType' = 'session' then 10
      when operation_name = 'backfill' and commands.value ->> 'action' = 'archive' then 20
      when operation_name = 'backfill' then 30
      when commands.value ->> 'recordType' = 'block'
        and commands.value ->> 'action' = 'archive-created' then 10
      when commands.value ->> 'recordType' = 'session'
        and commands.value ->> 'action' = 'restore-existing' then 20
      when commands.value ->> 'recordType' = 'block' then 30
      else 40
    end
    from pg_catalog.jsonb_array_elements(p_bundle -> 'commands') as commands(value)
    order by 2, commands.value ->> 'id'
  loop
    if (
      operation_name = 'backfill'
      and command_value ->> 'action' not in ('create', 'update', 'restore', 'archive')
    ) or (
      operation_name = 'rollback'
      and command_value ->> 'action' not in ('restore-existing', 'archive-created')
    ) then
      raise exception 'Session Planner migration action does not match its operation.' using errcode = 'P0001';
    end if;
    if command_value ->> 'recordType' = 'session' then
      perform app_private.session_planner_apply_session_command(
        command_value, target_organization_id, target_team_id, actor_id, operation_name
      );
      applied_sessions := applied_sessions + 1;
    elsif command_value ->> 'recordType' = 'block' then
      perform app_private.session_planner_apply_block_command(
        command_value, target_organization_id, target_team_id, actor_id, operation_name
      );
      applied_blocks := applied_blocks + 1;
    else
      raise exception 'Unknown Session Planner migration record type.' using errcode = 'P0001';
    end if;
  end loop;

  update public.session_planner_migration_runs
     set status = 'completed',
         session_count = applied_sessions,
         block_count = applied_blocks,
         mismatch_count = 0,
         completed_at = pg_catalog.clock_timestamp(),
         verification_summary = verification_summary || jsonb_build_object(
           'appliedSessions', applied_sessions,
           'appliedBlocks', applied_blocks
         )
   where id = run_id;

  if operation_name = 'rollback' then
    update public.session_planner_migration_runs backfill_run
       set status = 'rolled-back'
     where backfill_run.team_id = target_team_id
       and backfill_run.source_storage_key = 'football-session-planner-v3'
       and backfill_run.source_revision = expected_source_revision
       and backfill_run.source_hash = expected_source_hash
       and backfill_run.mode = 'backfill'
       and backfill_run.status = 'completed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'schema', 'footballscience-session-planner-migration-execution-v1',
    'operation', operation_name,
    'runId', run_id,
    'planSha256', plan_sha256,
    'bundleSha256', p_expected_bundle_sha256,
    'projectRef', project_ref,
    'appliedSessions', applied_sessions,
    'appliedBlocks', applied_blocks,
    'containsCoachingContent', false
  );
end;
$$;

revoke all on function app_private.session_planner_apply_session_command(
  jsonb, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.session_planner_apply_block_command(
  jsonb, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.session_planner_can_operate_migration(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.execute_session_planner_migration_bundle(
  jsonb, text, text, text
) from public, anon, authenticated;

grant usage on schema app_private to service_role;
grant execute on function app_private.session_planner_apply_session_command(
  jsonb, uuid, uuid, uuid, text
) to service_role;
grant execute on function app_private.session_planner_apply_block_command(
  jsonb, uuid, uuid, uuid, text
) to service_role;
grant execute on function app_private.session_planner_can_operate_migration(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.execute_session_planner_migration_bundle(
  jsonb, text, text, text
) to service_role;
