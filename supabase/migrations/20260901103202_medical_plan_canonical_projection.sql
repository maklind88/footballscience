-- Make the complete Medical Plan aggregate durable in the canonical Medical
-- compatibility state. The recovery journal remains the write-ahead log, but a
-- successful API response now means that the plan itself is centrally stored.

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
      'medical-board-updated',
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

create or replace function app_private.validate_medical_compat_plan(plan jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  participation integer;
  start_date date;
  end_date date;
begin
  if jsonb_typeof(plan) <> 'object' then
    raise exception 'Medical availability plan must be an object.' using errcode = '22023';
  end if;
  if nullif(btrim(plan ->> 'id'), '') is null or char_length(plan ->> 'id') > 180 then
    raise exception 'Medical availability plan id is invalid.' using errcode = '22023';
  end if;
  if nullif(btrim(plan ->> 'playerId'), '') is null or char_length(plan ->> 'playerId') > 180 then
    raise exception 'Medical availability plan player id is invalid.' using errcode = '22023';
  end if;
  begin
    start_date := (plan ->> 'startDate')::date;
    end_date := (plan ->> 'endDate')::date;
  exception when others then
    raise exception 'Medical availability plan date range is invalid.' using errcode = '22023';
  end;
  if end_date < start_date
     or to_char(start_date, 'YYYY-MM-DD') <> plan ->> 'startDate'
     or to_char(end_date, 'YYYY-MM-DD') <> plan ->> 'endDate' then
    raise exception 'Medical availability plan date range is invalid.' using errcode = '22023';
  end if;
  begin
    participation := (plan ->> 'participation')::integer;
  exception when others then
    raise exception 'Medical availability plan participation is invalid.' using errcode = '22023';
  end;
  if participation not in (0, 10, 25, 50, 75, 100) then
    raise exception 'Medical availability plan participation is unsupported.' using errcode = '22023';
  end if;
end;
$$;

create or replace function app_private.upsert_medical_compat_plan(state_value jsonb, incoming_plan jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  plans jsonb := coalesce(state_value -> 'injuryPlans', '[]'::jsonb);
  plan_id text := incoming_plan ->> 'id';
  plan_exists boolean;
  merged_plans jsonb;
begin
  perform app_private.validate_medical_compat_plan(incoming_plan);
  if jsonb_typeof(plans) <> 'array' then
    plans := '[]'::jsonb;
  end if;

  select exists (
    select 1
      from jsonb_array_elements(plans) existing
     where existing ->> 'id' = plan_id
  ) into plan_exists;

  if plan_exists then
    select coalesce(
      jsonb_agg(
        case
          when existing.value ->> 'id' <> plan_id then existing.value
          when app_private.medical_compat_entity_timestamp(incoming_plan) >=
               app_private.medical_compat_entity_timestamp(existing.value)
            then existing.value || incoming_plan
          else incoming_plan || existing.value
        end
        order by existing.ordinality
      ),
      '[]'::jsonb
    )
      into merged_plans
      from jsonb_array_elements(plans) with ordinality existing(value, ordinality);
  else
    merged_plans := jsonb_build_array(incoming_plan) || plans;
  end if;

  return jsonb_set(state_value, '{injuryPlans}', merged_plans, true);
end;
$$;

revoke all on function app_private.validate_medical_compat_plan(jsonb) from public, anon, authenticated;
revoke all on function app_private.upsert_medical_compat_plan(jsonb, jsonb) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.validate_medical_compat_plan(jsonb) to service_role;
grant execute on function app_private.upsert_medical_compat_plan(jsonb, jsonb) to service_role;

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

  return query select
    processed_total,
    failed_total,
    current_record.revision,
    failed_total = 0 and processed_total = cardinality(p_event_ids);
end;
$$;

revoke all on function public.project_medical_state_sync_events(uuid[]) from public, anon, authenticated;
grant execute on function public.project_medical_state_sync_events(uuid[]) to service_role;

-- Repair only false roster-removal archives for players who are currently an
-- active squad member. Manual clinical archives and non-squad players remain
-- untouched.
with profile_state as (
  select value::jsonb as state
    from public.platform_app_state_records
   where organization_id = 'global'
     and state_key = 'football-player-profiles-v1'
), active_squad_ids as (
  select player.value ->> 'id' as player_id
    from profile_state,
         jsonb_array_elements(coalesce(profile_state.state -> 'players', '[]'::jsonb)) player(value)
   where nullif(btrim(player.value ->> 'id'), '') is not null
     and coalesce(player.value ->> 'rosterType', 'squad') = 'squad'
     and coalesce(player.value ->> 'countsInSquad', 'true') <> 'false'
     and coalesce(player.value ->> 'archivedAt', '') = ''
     and coalesce(player.value ->> 'deletedAt', '') = ''
), medical_source as (
  select records.*, records.value::jsonb as state
    from public.platform_app_state_records records
   where records.organization_id = 'global'
     and records.state_key = 'football-medical-team-v1'
), repaired_state as (
  select medical_source.organization_id,
         medical_source.state_key,
         jsonb_set(
           jsonb_set(
             jsonb_set(
               medical_source.state,
               '{players}',
               coalesce((
                 select jsonb_agg(
                   case
                     when player.value ->> 'id' in (select player_id from active_squad_ids)
                          and player.value ->> 'archiveReason' = 'Removed from Squad Room'
                       then (player.value - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'deletedAt' - 'deletedBy')
                            || jsonb_build_object('updatedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                     else player.value
                   end
                   order by player.ordinality
                 )
                   from jsonb_array_elements(coalesce(medical_source.state -> 'players', '[]'::jsonb))
                        with ordinality player(value, ordinality)
               ), '[]'::jsonb),
               true
             ),
             '{records}',
             coalesce((
               select jsonb_agg(
                 case
                   when record.value ->> 'playerId' in (select player_id from active_squad_ids)
                        and record.value ->> 'archiveReason' = 'Player removed from Squad Room'
                     then (record.value - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'deletedAt' - 'deletedBy')
                          || jsonb_build_object('updatedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                   else record.value
                 end
                 order by record.ordinality
               )
                 from jsonb_array_elements(coalesce(medical_source.state -> 'records', '[]'::jsonb))
                      with ordinality record(value, ordinality)
             ), '[]'::jsonb),
             true
           ),
           '{injuryPlans}',
           coalesce((
             select jsonb_agg(
               case
                 when plan.value ->> 'playerId' in (select player_id from active_squad_ids)
                      and plan.value ->> 'archiveReason' = 'Player removed from Squad Room'
                   then (plan.value - 'archivedAt' - 'archivedBy' - 'archiveReason' - 'deletedAt' - 'deletedBy')
                        || jsonb_build_object('updatedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                 else plan.value
               end
               order by plan.ordinality
             )
               from jsonb_array_elements(coalesce(medical_source.state -> 'injuryPlans', '[]'::jsonb))
                    with ordinality plan(value, ordinality)
           ), '[]'::jsonb),
           true
         ) as state
    from medical_source
)
update public.platform_app_state_records records
   set revision = records.revision + 1,
       value = repaired_state.state::text,
       updated_at = clock_timestamp(),
       value_hash = encode(extensions.digest(convert_to(repaired_state.state::text, 'UTF8'), 'sha256'), 'hex'),
       metadata = coalesce(records.metadata, '{}'::jsonb) || jsonb_build_object(
         'medicalRosterArchiveRepairAt', clock_timestamp()
       )
  from repaired_state
 where records.organization_id = repaired_state.organization_id
   and records.state_key = repaired_state.state_key
   and records.value::jsonb is distinct from repaired_state.state;

-- Resolve historical plan journal entries without multiplying repeated form
-- submissions. Existing canonical ids are acknowledged, and only the newest
-- missing plan per player is projected when it is newer than that player's
-- canonical plan data.
do $$
declare
  recoverable_event_ids uuid[];
begin
  update public.medical_state_sync_events events
     set processing_status = 'processed',
         processed_at = clock_timestamp(),
         error_message = null
   where events.source_key = 'football-medical-team-v1'
     and events.processing_status = 'pending'
     and events.event_type in ('availability-plan-created', 'availability-plan-updated')
     and exists (
       select 1
         from public.platform_app_state_records records,
              jsonb_array_elements(coalesce(records.value::jsonb -> 'injuryPlans', '[]'::jsonb)) plan(value)
        where records.organization_id = 'global'
          and records.state_key = 'football-medical-team-v1'
          and plan.value ->> 'id' = events.payload -> 'plan' ->> 'id'
     );

  with canonical_plans as (
    select plan.value
      from public.platform_app_state_records records,
           jsonb_array_elements(coalesce(records.value::jsonb -> 'injuryPlans', '[]'::jsonb)) plan(value)
     where records.organization_id = 'global'
       and records.state_key = 'football-medical-team-v1'
  ), ranked as (
    select events.id,
           events.legacy_player_id,
           coalesce(nullif(events.payload -> 'plan' ->> 'updatedAt', '')::timestamptz, events.created_at) as event_time,
           row_number() over (
             partition by events.legacy_player_id
             order by coalesce(nullif(events.payload -> 'plan' ->> 'updatedAt', '')::timestamptz, events.created_at) desc,
                      events.created_at desc,
                      events.id desc
           ) as event_rank,
           coalesce((
             select max(coalesce(
               nullif(canonical.value ->> 'updatedAt', '')::timestamptz,
               nullif(canonical.value ->> 'createdAt', '')::timestamptz
             ))
               from canonical_plans canonical
              where canonical.value ->> 'playerId' = events.legacy_player_id
           ), '-infinity'::timestamptz) as canonical_time
      from public.medical_state_sync_events events
     where events.source_key = 'football-medical-team-v1'
       and events.processing_status = 'pending'
       and events.event_type in ('availability-plan-created', 'availability-plan-updated')
       and jsonb_typeof(events.payload -> 'plan') = 'object'
  )
  select array_agg(ranked.id order by ranked.event_time, ranked.id)
    into recoverable_event_ids
    from ranked
   where ranked.event_rank = 1
     and ranked.event_time > ranked.canonical_time;

  if recoverable_event_ids is not null and cardinality(recoverable_event_ids) > 0 then
    perform * from public.project_medical_state_sync_events(recoverable_event_ids);
  end if;

  update public.medical_state_sync_events events
     set processing_status = 'processed',
         processed_at = clock_timestamp(),
         error_message = 'Superseded by newer canonical Medical Plan data.'
   where events.source_key = 'football-medical-team-v1'
     and events.processing_status = 'pending'
     and events.event_type in ('availability-plan-created', 'availability-plan-updated');
end;
$$;
