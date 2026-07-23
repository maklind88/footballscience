-- Atomic, service-role-only Platform Identity staging migration executor.

create or replace function public.execute_platform_identity_migration_bundle(
  p_bundle jsonb,
  p_expected_bundle_sha256 text,
  p_expected_project_ref text,
  p_confirmation text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_name text := p_bundle ->> 'operation';
  actor_id uuid := nullif(p_bundle ->> 'actorId', '')::uuid;
  bundle_plan_sha256 text := p_bundle ->> 'planSha256';
  bundle_snapshot_sha256 text := p_bundle ->> 'snapshotSha256';
  bundle_project_ref text := p_bundle ->> 'projectRef';
  bundle_request_id text := p_bundle ->> 'requestId';
  expected_user_count integer := (p_bundle ->> 'expectedUserCount')::integer;
  command_count integer := (p_bundle ->> 'commandCount')::integer;
  command_value jsonb;
  command_priority integer;
  command_result jsonb;
  after_version integer;
  applied_command_count integer := 0;
  run_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Platform Identity migration RPC requires service_role.'
      using errcode = '42501';
  end if;
  if p_bundle ->> 'schema' <>
      'footballscience-platform-identity-migration-bundle-v1'
    or coalesce((p_bundle ->> 'executionEnabled')::boolean, true)
    or coalesce((p_bundle ->> 'transactionRequired')::boolean, false) is not true
    or p_bundle ->> 'target' <> 'staging'
    or operation_name not in ('backfill', 'rollback') then
    raise exception 'Platform Identity migration bundle contract is invalid.'
      using errcode = 'P0001';
  end if;
  if p_confirmation <> (
    case
      when operation_name = 'backfill' then 'APPLY_PLATFORM_IDENTITY_BACKFILL'
      else 'APPLY_PLATFORM_IDENTITY_ROLLBACK'
    end
  ) then
    raise exception 'Platform Identity migration confirmation is invalid.'
      using errcode = 'P0001';
  end if;
  if coalesce(p_expected_bundle_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or p_bundle #>> '{integrity,contentSha256}' <>
      p_expected_bundle_sha256
    or coalesce(bundle_plan_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(bundle_snapshot_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(bundle_project_ref ~ '^[a-z0-9][a-z0-9-]{2,79}$', false) is not true
    or bundle_project_ref <> p_expected_project_ref
    or bundle_request_id is null
    or char_length(bundle_request_id) not between 1 and 180
    or expected_user_count < 0
    or command_count not between 0 and 5000
    or jsonb_typeof(p_bundle -> 'commands') <> 'array'
    or jsonb_array_length(p_bundle -> 'commands') <> command_count then
    raise exception 'Platform Identity migration integrity metadata is invalid.'
      using errcode = 'P0001';
  end if;
  if not app_private.platform_identity_migration_actor_allowed(actor_id) then
    raise exception 'Platform Identity migration actor is not authorized.'
      using errcode = '42501';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_bundle -> 'commands') commands(command)
     group by command ->> 'table', command ->> 'key'
    having count(*) > 1
  ) then
    raise exception 'Platform Identity migration bundle contains duplicate rows.'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('platform-identity-migration', 0)
  );

  insert into public.platform_identity_migration_runs (
    target,
    project_ref,
    operation,
    status,
    plan_sha256,
    snapshot_sha256,
    bundle_sha256,
    request_id,
    expected_user_count,
    command_count,
    applied_count,
    actor_id,
    verification_summary
  ) values (
    'staging',
    bundle_project_ref,
    operation_name,
    'processing',
    bundle_plan_sha256,
    bundle_snapshot_sha256,
    p_expected_bundle_sha256,
    bundle_request_id,
    expected_user_count,
    command_count,
    0,
    actor_id,
    jsonb_build_object(
      'transactionRequired',
      true,
      'bundleSha256',
      p_expected_bundle_sha256
    )
  ) returning id into run_id;

  for command_value, command_priority in
    select commands.command,
      case
        when operation_name = 'backfill' then case commands.command ->> 'table'
          when 'platform_organizations' then 10
          when 'platform_clubs' then 20
          when 'platform_teams' then 30
          when 'platform_user_profiles' then 40
          when 'platform_memberships' then 50
          when 'platform_tenant_links' then 60
          else 999
        end
        when commands.command ->> 'action' = 'restore-existing' then
          case commands.command ->> 'table'
            when 'platform_organizations' then 10
            when 'platform_clubs' then 20
            when 'platform_teams' then 30
            when 'platform_user_profiles' then 40
            when 'platform_memberships' then 50
            when 'platform_tenant_links' then 60
            else 999
          end
        else case commands.command ->> 'table'
          when 'platform_tenant_links' then 70
          when 'platform_memberships' then 80
          when 'platform_user_profiles' then 90
          when 'platform_teams' then 100
          when 'platform_clubs' then 110
          when 'platform_organizations' then 120
          else 999
        end
      end
      from jsonb_array_elements(p_bundle -> 'commands') commands(command)
     order by 2, commands.command ->> 'key'
  loop
    if command_value ->> 'table' = 'platform_organizations' then
      command_result :=
        app_private.platform_identity_apply_organization_command(
          command_value,
          actor_id,
          operation_name
        );
    elsif command_value ->> 'table' = 'platform_clubs' then
      command_result := app_private.platform_identity_apply_club_command(
        command_value,
        actor_id,
        operation_name
      );
    elsif command_value ->> 'table' = 'platform_teams' then
      command_result := app_private.platform_identity_apply_team_command(
        command_value,
        actor_id,
        operation_name
      );
    elsif command_value ->> 'table' = 'platform_user_profiles' then
      command_result := app_private.platform_identity_apply_profile_command(
        command_value,
        actor_id,
        operation_name
      );
    elsif command_value ->> 'table' = 'platform_memberships' then
      command_result :=
        app_private.platform_identity_apply_membership_command(
          command_value,
          actor_id,
          operation_name
        );
    elsif command_value ->> 'table' = 'platform_tenant_links' then
      command_result :=
        app_private.platform_identity_apply_tenant_link_command(
          command_value,
          actor_id,
          operation_name
        );
    else
      raise exception 'Unknown Platform Identity migration table.'
        using errcode = 'P0001';
    end if;

    after_version := (command_result #>> '{after,row_version}')::integer;
    if after_version <> (
      case
        when command_value ->> 'action' = 'create' then 1
        else (command_value ->> 'expectedRowVersion')::integer + 1
      end
    ) then
      raise exception
        'Platform Identity migration revision proof failed for % (expected %, got %).',
        command_value ->> 'table',
        case
          when command_value ->> 'action' = 'create' then 1
          else (command_value ->> 'expectedRowVersion')::integer + 1
        end,
        after_version
        using errcode = '40001';
    end if;

    insert into public.platform_identity_migration_events (
      run_id,
      table_name,
      record_key,
      action,
      expected_row_version,
      before_record,
      after_record,
      actor_id
    ) values (
      run_id,
      command_value ->> 'table',
      (command_value ->> 'key')::uuid,
      command_value ->> 'action',
      nullif(command_value ->> 'expectedRowVersion', '')::integer,
      command_result -> 'before',
      command_result -> 'after',
      actor_id
    );
    applied_command_count := applied_command_count + 1;
  end loop;

  update public.platform_identity_migration_runs migration_run
     set status = 'completed',
         applied_count = applied_command_count,
         completed_at = clock_timestamp(),
         verification_summary = migration_run.verification_summary ||
           jsonb_build_object('appliedCount', applied_command_count)
   where migration_run.id = run_id;

  if operation_name = 'rollback' then
    update public.platform_identity_migration_runs backfill_run
       set status = 'rolled-back'
     where backfill_run.operation = 'backfill'
       and backfill_run.status = 'completed'
       and backfill_run.plan_sha256 = bundle_plan_sha256
       and backfill_run.snapshot_sha256 = bundle_snapshot_sha256;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'schema',
    'footballscience-platform-identity-migration-execution-v1',
    'operation',
    operation_name,
    'runId',
    run_id,
    'planSha256',
    bundle_plan_sha256,
    'snapshotSha256',
    bundle_snapshot_sha256,
    'bundleSha256',
    p_expected_bundle_sha256,
    'appliedCount',
    applied_command_count,
    'piiExposed',
    false
  );
end;
$$;

revoke all on function public.execute_platform_identity_migration_bundle(
  jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.execute_platform_identity_migration_bundle(
  jsonb, text, text, text
) to service_role;
