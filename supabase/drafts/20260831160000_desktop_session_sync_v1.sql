-- DRAFT ONLY. Intentionally outside supabase/migrations.
-- Preconditions: reconciled migration ledger accepted and the selected Session Planner
-- foundation reviewed. Existing football-session-planner-v3 app-state remains canonical.

create schema if not exists app_private;

do $$
begin
  create role fs_desktop_sync_executor nologin;
exception
  when duplicate_object then null;
end
$$;

create table if not exists app_private.session_planner_desktop_operations (
  organization_id uuid not null,
  team_id uuid not null,
  client_instance_id uuid not null,
  operation_id uuid not null,
  actor_id uuid not null,
  auth_epoch bigint not null check (auth_epoch > 0),
  session_id uuid not null,
  operation_type text not null check (operation_type in ('session.rename', 'block.duration.set')),
  operation_version integer not null check (operation_version = 1),
  base_revision bigint not null check (base_revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  acknowledgement_id uuid not null,
  resulting_revision bigint not null check (resulting_revision > 0),
  operation_result jsonb not null check (jsonb_typeof(operation_result) = 'object'),
  request_id text not null check (char_length(request_id) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '180 days'),
  primary key (organization_id, team_id, client_instance_id, operation_id)
);

create index if not exists session_planner_desktop_operations_expiry_idx
  on app_private.session_planner_desktop_operations (expires_at, organization_id, team_id);

create table if not exists app_private.session_planner_desktop_tombstones (
  organization_id uuid not null,
  team_id uuid not null,
  session_id uuid not null,
  record_type text not null check (record_type in ('session', 'block')),
  record_id uuid not null,
  archived_revision bigint not null check (archived_revision > 0),
  archived_by uuid not null,
  archived_at timestamptz not null default clock_timestamp(),
  reason_code text not null check (char_length(reason_code) between 4 and 80),
  primary key (organization_id, team_id, record_type, record_id)
);

revoke all on app_private.session_planner_desktop_operations from public, anon, authenticated, service_role;
revoke all on app_private.session_planner_desktop_tombstones from public, anon, authenticated, service_role;

create or replace function app_private.apply_session_planner_desktop_operation_v1(
  p_actor_id uuid,
  p_organization_id uuid,
  p_team_id uuid,
  p_auth_epoch bigint,
  p_client_instance_id uuid,
  p_operation_id uuid,
  p_session_id uuid,
  p_operation_type text,
  p_operation_version integer,
  p_base_revision bigint,
  p_payload jsonb,
  p_payload_sha256 text,
  p_request_id text
)
returns table (
  acknowledgement text,
  acknowledgement_id uuid,
  resulting_revision bigint,
  operation_result jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, app_private, pg_temp
as $$
declare
  existing_operation app_private.session_planner_desktop_operations%rowtype;
  selected_session public.session_planner_sessions%rowtype;
  next_acknowledgement_id uuid;
  next_revision bigint;
  next_result jsonb;
  next_title text;
  target_block_id uuid;
  next_duration integer;
  payload_key_count integer;
begin
  if p_auth_epoch <= 0
    or p_operation_version <> 1
    or p_operation_type not in ('session.rename', 'block.duration.set')
    or p_base_revision <= 0
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 8192
    or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(p_request_id) not between 1 and 120 then
    raise exception 'desktop sync contract rejected' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_team_id::text || ':' ||
    p_client_instance_id::text || ':' || p_operation_id::text,
    0
  ));

  select * into existing_operation
  from app_private.session_planner_desktop_operations operation_row
  where operation_row.organization_id = p_organization_id
    and operation_row.team_id = p_team_id
    and operation_row.client_instance_id = p_client_instance_id
    and operation_row.operation_id = p_operation_id;

  if found then
    if existing_operation.actor_id <> p_actor_id
      or existing_operation.auth_epoch <> p_auth_epoch
      or existing_operation.session_id <> p_session_id
      or existing_operation.operation_type <> p_operation_type
      or existing_operation.operation_version <> p_operation_version
      or existing_operation.base_revision <> p_base_revision
      or existing_operation.payload <> p_payload
      or existing_operation.payload_sha256 <> p_payload_sha256 then
      raise exception 'desktop operation id was reused with different content' using errcode = '22023';
    end if;
    return query select
      'already-applied'::text,
      existing_operation.acknowledgement_id,
      existing_operation.resulting_revision,
      existing_operation.operation_result;
    return;
  end if;

  if not exists (
    select 1
    from public.platform_memberships membership
    join public.platform_teams team on team.id = p_team_id
    where membership.user_id = p_actor_id
      and membership.organization_id = p_organization_id
      and membership.status = 'active'
      and membership.deleted_at is null
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach')
      and team.organization_id = p_organization_id
      and team.status = 'active'
      and team.deleted_at is null
      and (
        membership.scope = 'organization'
        or (membership.scope = 'team' and membership.team_id = p_team_id)
      )
  ) then
    raise exception 'desktop sync membership rejected' using errcode = '42501';
  end if;

  select * into selected_session
  from public.session_planner_sessions session_row
  where session_row.id = p_session_id
    and session_row.organization_id = p_organization_id
    and session_row.team_id = p_team_id
    and session_row.archived_at is null
  for update;

  if not found then
    raise exception 'selected session unavailable' using errcode = 'P0002';
  end if;

  if selected_session.row_version <> p_base_revision then
    return query select
      'conflict'::text,
      null::uuid,
      selected_session.row_version,
      jsonb_build_object('sessionId', p_session_id, 'currentRevision', selected_session.row_version);
    return;
  end if;

  select count(*) into payload_key_count from jsonb_object_keys(p_payload);
  next_revision := selected_session.row_version + 1;

  if p_operation_type = 'session.rename' then
    if payload_key_count <> 1 or not (p_payload ? 'title') or jsonb_typeof(p_payload -> 'title') <> 'string' then
      raise exception 'invalid session.rename payload' using errcode = '22023';
    end if;
    next_title := btrim(p_payload ->> 'title');
    if char_length(next_title) not between 1 and 120 then
      raise exception 'invalid session.rename title' using errcode = '22023';
    end if;
    update public.session_planner_sessions
    set title = next_title,
        row_version = next_revision,
        updated_by = p_actor_id,
        updated_at = clock_timestamp()
    where id = p_session_id;
    next_result := jsonb_build_object('sessionId', p_session_id, 'title', next_title);
  else
    if payload_key_count <> 2
      or not (p_payload ? 'blockId')
      or not (p_payload ? 'durationMinutes')
      or jsonb_typeof(p_payload -> 'blockId') <> 'string'
      or jsonb_typeof(p_payload -> 'durationMinutes') <> 'number' then
      raise exception 'invalid block.duration.set payload' using errcode = '22023';
    end if;
    target_block_id := (p_payload ->> 'blockId')::uuid;
    next_duration := (p_payload ->> 'durationMinutes')::integer;
    if next_duration not between 1 and 240 then
      raise exception 'invalid block duration' using errcode = '22023';
    end if;
    update public.session_planner_blocks
    set payload = jsonb_set(payload, '{durationMinutes}', to_jsonb(next_duration), true),
        row_version = row_version + 1,
        updated_by = p_actor_id,
        updated_at = clock_timestamp()
    where id = target_block_id
      and session_id = p_session_id
      and organization_id = p_organization_id
      and team_id = p_team_id
      and archived_at is null;
    if not found then
      raise exception 'selected block unavailable' using errcode = 'P0002';
    end if;
    update public.session_planner_sessions
    set row_version = next_revision,
        updated_by = p_actor_id,
        updated_at = clock_timestamp()
    where id = p_session_id;
    next_result := jsonb_build_object(
      'sessionId', p_session_id,
      'blockId', target_block_id,
      'durationMinutes', next_duration
    );
  end if;

  next_acknowledgement_id := gen_random_uuid();
  insert into app_private.session_planner_desktop_operations (
    organization_id, team_id, client_instance_id, operation_id, actor_id, auth_epoch,
    session_id, operation_type, operation_version, base_revision, payload, payload_sha256,
    acknowledgement_id, resulting_revision, operation_result, request_id
  ) values (
    p_organization_id, p_team_id, p_client_instance_id, p_operation_id, p_actor_id, p_auth_epoch,
    p_session_id, p_operation_type, p_operation_version, p_base_revision, p_payload, p_payload_sha256,
    next_acknowledgement_id, next_revision, next_result, p_request_id
  );

  return query select 'accepted'::text, next_acknowledgement_id, next_revision, next_result;
end;
$$;

create or replace function app_private.read_session_planner_desktop_snapshot_v1(
  p_actor_id uuid,
  p_organization_id uuid,
  p_team_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, app_private, pg_temp
as $$
declare
  selected_session public.session_planner_sessions%rowtype;
  selected_blocks jsonb;
begin
  if not exists (
    select 1
    from public.platform_memberships membership
    join public.platform_teams team on team.id = p_team_id
    where membership.user_id = p_actor_id
      and membership.organization_id = p_organization_id
      and membership.status = 'active'
      and membership.deleted_at is null
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach')
      and team.organization_id = p_organization_id
      and team.status = 'active'
      and team.deleted_at is null
      and (
        membership.scope = 'organization'
        or (membership.scope = 'team' and membership.team_id = p_team_id)
      )
  ) then
    raise exception 'desktop snapshot membership rejected' using errcode = '42501';
  end if;

  select * into selected_session
  from public.session_planner_sessions session_row
  where session_row.id = p_session_id
    and session_row.organization_id = p_organization_id
    and session_row.team_id = p_team_id
    and session_row.archived_at is null;

  if not found then
    raise exception 'selected session unavailable' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', block_row.id,
        'sortOrder', block_row.sort_order,
        'revision', block_row.row_version,
        'payload', block_row.payload
      ) order by block_row.sort_order, block_row.id
    ),
    '[]'::jsonb
  ) into selected_blocks
  from public.session_planner_blocks block_row
  where block_row.session_id = p_session_id
    and block_row.organization_id = p_organization_id
    and block_row.team_id = p_team_id
    and block_row.archived_at is null;

  return jsonb_build_object(
    'schema', 'fs-desktop-session-snapshot-v1',
    'session', jsonb_build_object(
      'id', selected_session.id,
      'title', selected_session.title,
      'sessionDate', selected_session.session_date,
      'revision', selected_session.row_version,
      'content', selected_session.content
    ),
    'blocks', selected_blocks
  );
end;
$$;

revoke all on function app_private.apply_session_planner_desktop_operation_v1(
  uuid, uuid, uuid, bigint, uuid, uuid, uuid, text, integer, bigint, jsonb, text, text
) from public, anon, authenticated, service_role;

revoke all on function app_private.read_session_planner_desktop_snapshot_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

grant usage on schema app_private to fs_desktop_sync_executor;
grant execute on function app_private.apply_session_planner_desktop_operation_v1(
  uuid, uuid, uuid, bigint, uuid, uuid, uuid, text, integer, bigint, jsonb, text, text
) to fs_desktop_sync_executor;
grant execute on function app_private.read_session_planner_desktop_snapshot_v1(
  uuid, uuid, uuid, uuid
) to fs_desktop_sync_executor;
