-- Make the durable Medical sync journal update the compatibility Medical state
-- atomically. This removes the 2+ MB browser upload from the critical path for
-- recommendations while the normalized Medical tables are being introduced.

alter table public.medical_state_sync_events
  drop constraint if exists medical_state_sync_events_event_type_check;

alter table public.medical_state_sync_events
  add constraint medical_state_sync_events_event_type_check
  check (
    event_type in (
      'state-snapshot',
      'recommendation-saved',
      'bulk-recommendation-saved',
      'availability-plan-created',
      'availability-plan-updated',
      'availability-plan-archived',
      'availability-plan-deleted',
      'clearance-saved',
      'governance-saved',
      'player-profile-saved',
      'players-imported',
      'player-added',
      'player-archived',
      'player-removed',
      'record-archived',
      'record-deleted'
    )
  );

create or replace function app_private.medical_compat_entity_timestamp(entity jsonb)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select greatest(
    coalesce(entity ->> 'archivedAt', ''),
    coalesce(entity ->> 'deletedAt', ''),
    coalesce(entity ->> 'updatedAt', ''),
    coalesce(entity ->> 'createdAt', ''),
    coalesce(entity ->> 'lastClinicalChangeAt', ''),
    coalesce(entity ->> 'date', '')
  );
$$;

create or replace function app_private.validate_medical_compat_record(record jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  participation integer;
  activity_date date;
begin
  if jsonb_typeof(record) <> 'object' then
    raise exception 'Medical recommendation record must be an object.' using errcode = '22023';
  end if;
  if nullif(btrim(record ->> 'id'), '') is null or char_length(record ->> 'id') > 180 then
    raise exception 'Medical recommendation record id is invalid.' using errcode = '22023';
  end if;
  if nullif(btrim(record ->> 'playerId'), '') is null or char_length(record ->> 'playerId') > 180 then
    raise exception 'Medical recommendation player id is invalid.' using errcode = '22023';
  end if;
  begin
    activity_date := (record ->> 'date')::date;
  exception when others then
    raise exception 'Medical recommendation date is invalid.' using errcode = '22023';
  end;
  if to_char(activity_date, 'YYYY-MM-DD') <> record ->> 'date' then
    raise exception 'Medical recommendation date must use YYYY-MM-DD.' using errcode = '22023';
  end if;
  begin
    participation := (record ->> 'participation')::integer;
  exception when others then
    raise exception 'Medical recommendation participation is invalid.' using errcode = '22023';
  end;
  if participation not in (0, 10, 25, 50, 75, 100) then
    raise exception 'Medical recommendation participation is unsupported.' using errcode = '22023';
  end if;
end;
$$;

create or replace function app_private.upsert_medical_compat_record(state_value jsonb, incoming_record jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  records jsonb := coalesce(state_value -> 'records', '[]'::jsonb);
  record_id text := incoming_record ->> 'id';
  record_exists boolean;
  merged_records jsonb;
begin
  perform app_private.validate_medical_compat_record(incoming_record);
  if jsonb_typeof(records) <> 'array' then
    records := '[]'::jsonb;
  end if;

  select exists (
    select 1
      from jsonb_array_elements(records) existing
     where existing ->> 'id' = record_id
  ) into record_exists;

  if record_exists then
    select coalesce(
      jsonb_agg(
        case
          when existing.value ->> 'id' <> record_id then existing.value
          when app_private.medical_compat_entity_timestamp(incoming_record) >=
               app_private.medical_compat_entity_timestamp(existing.value)
            then existing.value || incoming_record
          else incoming_record || existing.value
        end
        order by existing.ordinality
      ),
      '[]'::jsonb
    )
      into merged_records
      from jsonb_array_elements(records) with ordinality existing(value, ordinality);
  else
    merged_records := jsonb_build_array(incoming_record) || records;
  end if;

  return jsonb_set(state_value, '{records}', merged_records, true);
end;
$$;

create or replace function app_private.archive_medical_compat_record(
  state_value jsonb,
  record_id text,
  archived_at text
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  records jsonb := coalesce(state_value -> 'records', '[]'::jsonb);
  record_exists boolean;
  merged_records jsonb;
begin
  if nullif(btrim(record_id), '') is null or char_length(record_id) > 180 then
    raise exception 'Medical archive record id is invalid.' using errcode = '22023';
  end if;
  begin
    perform archived_at::timestamptz;
  exception when others then
    raise exception 'Medical archive timestamp is invalid.' using errcode = '22023';
  end;
  if jsonb_typeof(records) <> 'array' then
    raise exception 'Medical recommendation collection is invalid.' using errcode = '22023';
  end if;

  select exists (
    select 1
      from jsonb_array_elements(records) existing
     where existing ->> 'id' = record_id
  ) into record_exists;
  if not record_exists then
    raise exception 'Medical recommendation to archive was not found.' using errcode = 'P0002';
  end if;

  select jsonb_agg(
    case
      when existing.value ->> 'id' <> record_id then existing.value
      when archived_at >= app_private.medical_compat_entity_timestamp(existing.value)
        then existing.value || jsonb_build_object('archivedAt', archived_at, 'updatedAt', archived_at)
      else existing.value
    end
    order by existing.ordinality
  )
    into merged_records
    from jsonb_array_elements(records) with ordinality existing(value, ordinality);

  return jsonb_set(state_value, '{records}', coalesce(merged_records, '[]'::jsonb), true);
end;
$$;

revoke all on function app_private.medical_compat_entity_timestamp(jsonb) from public, anon, authenticated;
revoke all on function app_private.validate_medical_compat_record(jsonb) from public, anon, authenticated;
revoke all on function app_private.upsert_medical_compat_record(jsonb, jsonb) from public, anon, authenticated;
revoke all on function app_private.archive_medical_compat_record(jsonb, text, text) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.medical_compat_entity_timestamp(jsonb) to service_role;
grant execute on function app_private.validate_medical_compat_record(jsonb) to service_role;
grant execute on function app_private.upsert_medical_compat_record(jsonb, jsonb) to service_role;
grant execute on function app_private.archive_medical_compat_record(jsonb, text, text) to service_role;

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
  archive_timestamp text;
  state_changed boolean := false;
  processed_total integer := 0;
  failed_total integer := 0;
  last_actor text := '';
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

  return query select
    processed_total,
    failed_total,
    current_record.revision,
    failed_total = 0 and processed_total = cardinality(p_event_ids);
end;
$$;

revoke all on function public.project_medical_state_sync_events(uuid[]) from public, anon, authenticated;
grant execute on function public.project_medical_state_sync_events(uuid[]) to service_role;
