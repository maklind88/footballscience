-- Dormant production preparation; execute only after explicit release authorization.
-- Execute the entire artifact in ONE transaction (the migration executor owns it).
-- No historical repair/replay, row writes, constraint or projector replacement.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $precondition$
declare
  expected record;
  function_id regprocedure;
begin
  for expected in select * from (values
      ('public.project_medical_state_sync_events(uuid[])', '462d583bb2028f79fa3f199e99ad3107'),
      ('app_private.validate_medical_compat_plan(jsonb)', 'd47a621ab7fc46a74f3116f3e29b2848'),
      ('app_private.upsert_medical_compat_plan(jsonb,jsonb)', 'affc1a542729c3f93a324de792036a74'),
      ('app_private.validate_medical_compat_record(jsonb)', 'ab93098ee063878cdc8810fc0796066a'),
      ('app_private.upsert_medical_compat_record(jsonb,jsonb)', '2c5eca6f4ca8a592436cb27947a10f67'),
      ('app_private.archive_medical_compat_record(jsonb,text,text)', 'bca261764b94315c173d1ac8c1275c7d'),
      ('app_private.medical_compat_entity_timestamp(jsonb)', '2d80a598eee0c4f64b1ecaa9231961b9')
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
    coalesce(entity ->> 'lastClinicalChangeAt', '')
  );
$$;
revoke all on function app_private.medical_compat_entity_timestamp(jsonb) from public, anon, authenticated;
grant execute on function app_private.medical_compat_entity_timestamp(jsonb) to service_role;

do $postcondition$
begin
  if md5(pg_get_functiondef('app_private.medical_compat_entity_timestamp(jsonb)'::regprocedure))
    is distinct from '5219258aef9bc1859efa4fe5ca5223d3' then
    raise exception 'Medical timestamp replacement differs from reviewed definition';
  end if;
end;
$postcondition$;
