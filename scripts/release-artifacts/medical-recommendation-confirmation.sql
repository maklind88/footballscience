-- Dormant forward-only candidate. Apply ONLY after explicit release authorization.
-- Execute this entire artifact in ONE transaction, after the timestamp correction.
-- Replaces the projector without changing its signature or historical receipts.
-- No history repair, replay, row writes or permission expansion during installation.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $precondition$
declare
  expected record;
  function_id regprocedure;
begin
  if to_regprocedure('app_private.medical_compat_recommendation_is_stored(jsonb,jsonb)') is not null then
    raise exception 'Medical confirmation helper already exists';
  end if;
  for expected in select * from (values
      ('public.project_medical_state_sync_events(uuid[])', '462d583bb2028f79fa3f199e99ad3107'),
      ('app_private.validate_medical_compat_plan(jsonb)', 'd47a621ab7fc46a74f3116f3e29b2848'),
      ('app_private.upsert_medical_compat_plan(jsonb,jsonb)', 'affc1a542729c3f93a324de792036a74'),
      ('app_private.validate_medical_compat_record(jsonb)', 'ab93098ee063878cdc8810fc0796066a'),
      ('app_private.upsert_medical_compat_record(jsonb,jsonb)', '2c5eca6f4ca8a592436cb27947a10f67'),
      ('app_private.archive_medical_compat_record(jsonb,text,text)', 'bca261764b94315c173d1ac8c1275c7d'),
      ('app_private.medical_compat_entity_timestamp(jsonb)', '5219258aef9bc1859efa4fe5ca5223d3')
  ) baseline(signature, definition_md5)
  loop
    function_id := to_regprocedure(expected.signature);
    if function_id is null then
      raise exception 'Medical production baseline missing: %', expected.signature;
    end if;
    if md5(pg_get_functiondef(function_id)) is distinct from expected.definition_md5
      or (select prosecdef from pg_proc where oid = function_id)
      or has_function_privilege('anon', function_id, 'EXECUTE')
      or has_function_privilege('authenticated', function_id, 'EXECUTE')
      or not has_function_privilege('service_role', function_id, 'EXECUTE') then
      raise exception 'Medical production baseline differs: %', expected.signature;
    end if;
  end loop;
end;
$precondition$;

-- An event receipt is not proof that its submitted record still exists unchanged.
-- Compare all submitted fields exactly (including arrays); tolerate additional
-- canonical fields carried forward by the existing merge. Do not return clinical data.
create function app_private.medical_compat_recommendation_is_stored(state_value jsonb, incoming_record jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_typeof(incoming_record) = 'object'
    and nullif(incoming_record ->> 'id', '') is not null
    and count(*) = 1
    and bool_and(
      coalesce(existing.value ->> 'archivedAt', '') = ''
      and coalesce(existing.value ->> 'deletedAt', '') = ''
      and existing.value || incoming_record = existing.value
    ), false
  )
  from jsonb_array_elements(case when jsonb_typeof(state_value -> 'records') = 'array'
    then state_value -> 'records' else '[]'::jsonb end) existing(value)
  where existing.value ->> 'id' = incoming_record ->> 'id';
$$;
revoke all on function app_private.medical_compat_recommendation_is_stored(jsonb,jsonb) from public, anon, authenticated;
grant execute on function app_private.medical_compat_recommendation_is_stored(jsonb,jsonb) to service_role;

create or replace function public.project_medical_state_sync_events(p_event_ids uuid[])
returns table (
  processed_count integer,
  failed_count integer,
  revision bigint,
  canonical_stored boolean
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
set statement_timeout = '10s'
as $$
declare
  medical_key constant text := 'football-medical-team-v1';
  current_record public.platform_app_state_records%rowtype;
  sync_event public.medical_state_sync_events%rowtype;
  working_state jsonb;
  event_state jsonb;
  incoming_record jsonb;
  incoming_plan jsonb;
  archive_timestamp text;
  state_changed boolean := false;
  processed_total integer := 0;
  failed_total integer := 0;
  last_actor text := '';
  recommendations_stored boolean := true;
begin
  if p_event_ids is null or cardinality(p_event_ids) = 0 then
    return query select 0, 0, 0::bigint, false;
    return;
  end if;

  select *
    into current_record
    from public.platform_app_state_records records
   where records.organization_id = 'global'
     and records.state_key = medical_key
   for update;

  if not found then
    return query select 0, cardinality(p_event_ids), 0::bigint, false;
    return;
  end if;

  begin
    working_state := current_record.value::jsonb;
  exception when others then
    return query select 0, cardinality(p_event_ids), current_record.revision, false;
    return;
  end;

  if jsonb_typeof(working_state) <> 'object' then
    return query select 0, cardinality(p_event_ids), current_record.revision, false;
    return;
  end if;

  for sync_event in
    select events.*
      from public.medical_state_sync_events events
     where events.id = any(p_event_ids)
       and events.source_key = medical_key
     order by events.created_at, events.id
     for update
  loop
    if sync_event.processing_status = 'processed' then
      processed_total := processed_total + 1;
      continue;
    end if;

    begin
      event_state := working_state;
      if sync_event.event_type = 'recommendation-saved' then
        incoming_record := sync_event.payload -> 'record';
        event_state := app_private.upsert_medical_compat_record(event_state, incoming_record);
      elsif sync_event.event_type = 'bulk-recommendation-saved' then
        if jsonb_typeof(sync_event.payload -> 'records') <> 'array' then
          raise exception 'Bulk medical recommendation records are invalid.' using errcode = '22023';
        end if;
        for incoming_record in
          select value from jsonb_array_elements(sync_event.payload -> 'records')
        loop
          event_state := app_private.upsert_medical_compat_record(event_state, incoming_record);
        end loop;
      elsif sync_event.event_type = 'record-archived' then
        archive_timestamp := coalesce(
          sync_event.payload ->> 'archivedAt',
          sync_event.payload -> 'record' ->> 'archivedAt'
        );
        event_state := app_private.archive_medical_compat_record(
          event_state,
          coalesce(sync_event.payload ->> 'recordId', sync_event.payload -> 'record' ->> 'id'),
          archive_timestamp
        );
      elsif sync_event.event_type in (
        'availability-plan-created',
        'availability-plan-updated',
        'availability-plan-archived',
        'availability-plan-deleted',
        'clearance-saved',
        'medical-board-updated'
      ) then
        incoming_plan := sync_event.payload -> 'plan';
        event_state := app_private.upsert_medical_compat_plan(event_state, incoming_plan);
      else
        raise exception 'Medical sync event type is not projectable.' using errcode = '22023';
      end if;

      update public.medical_state_sync_events events
         set processing_status = 'processed',
             processed_at = clock_timestamp(),
             error_message = null
       where events.id = sync_event.id;
      working_state := event_state;
      state_changed := true;
      last_actor := coalesce(sync_event.actor_id::text, last_actor);
      processed_total := processed_total + 1;
    exception when others then
      failed_total := failed_total + 1;
      update public.medical_state_sync_events events
         set processing_status = 'failed',
             processed_at = null,
             error_message = left(sqlerrm, 500)
       where events.id = sync_event.id;
    end;
  end loop;

  if state_changed then
    working_state := jsonb_set(
      working_state,
      '{updatedAt}',
      to_jsonb(to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      true
    );
    update public.platform_app_state_records records
       set revision = records.revision + 1,
           value = working_state::text,
           removed = false,
           updated_by = last_actor,
           updated_at = clock_timestamp(),
           value_hash = encode(extensions.digest(convert_to(working_state::text, 'UTF8'), 'sha256'), 'hex'),
           metadata = coalesce(records.metadata, '{}'::jsonb) || jsonb_build_object(
             'lastMedicalProjectionAt', clock_timestamp(),
             'lastMedicalProjectionCount', processed_total
           )
     where records.organization_id = current_record.organization_id
       and records.state_key = current_record.state_key
    returning records.revision into current_record.revision;
  end if;

  -- The aggregate lock is still held. Check final state, including already
  -- processed retries and several events targeting the same identity in a batch.
  -- Preserve the journal's historical processing status; a conflict is not a
  -- failed journal write and must never replay or restore archived content.
  for sync_event in
    select events.* from public.medical_state_sync_events events
    where events.id = any(p_event_ids) and events.source_key = medical_key
      and events.event_type in ('recommendation-saved', 'bulk-recommendation-saved')
  loop
    for incoming_record in
      select value from jsonb_array_elements(case
        when sync_event.event_type = 'recommendation-saved'
          then jsonb_build_array(sync_event.payload -> 'record')
        when jsonb_typeof(sync_event.payload -> 'records') = 'array'
          then sync_event.payload -> 'records'
        else '[null]'::jsonb end)
    loop
      recommendations_stored := recommendations_stored and
        app_private.medical_compat_recommendation_is_stored(working_state, incoming_record);
    end loop;
  end loop;

  return query select
    processed_total,
    failed_total,
    current_record.revision,
    failed_total = 0 and processed_total = cardinality(p_event_ids) and recommendations_stored;
end;
$$;

revoke all on function public.project_medical_state_sync_events(uuid[]) from public, anon, authenticated;
grant execute on function public.project_medical_state_sync_events(uuid[]) to service_role;

do $postcondition$
declare
  expected record;
  function_id regprocedure;
begin
  for expected in select * from (values
    ('public.project_medical_state_sync_events(uuid[])', '1c48730f74b5bcfdaaac7cc9d0b0d533'),
    ('app_private.medical_compat_recommendation_is_stored(jsonb,jsonb)', '9f88aae85182ac1f2947dc1a0f604003')
  ) reviewed(signature, definition_md5)
  loop
    function_id := to_regprocedure(expected.signature);
    if function_id is null or md5(pg_get_functiondef(function_id)) is distinct from expected.definition_md5
      or (select prosecdef from pg_proc where oid = function_id)
      or has_function_privilege('anon', function_id, 'EXECUTE')
      or has_function_privilege('authenticated', function_id, 'EXECUTE')
      or not has_function_privilege('service_role', function_id, 'EXECUTE') then
      raise exception 'Medical confirmation differs from reviewed definition: %', expected.signature;
    end if;
  end loop;
end;
$postcondition$;
