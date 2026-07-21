-- Qualify the insert conflict target so PL/pgSQL output variables cannot make
-- the atomic bootstrap path ambiguous.

create or replace function public.write_platform_app_state_record(
  p_organization_id text,
  p_state_key text,
  p_module_id text,
  p_merge_policy text,
  p_expected_revision bigint,
  p_next_revision bigint,
  p_value text,
  p_removed boolean,
  p_updated_by text,
  p_value_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  applied boolean,
  organization_id text,
  state_key text,
  module_id text,
  merge_policy text,
  revision bigint,
  value text,
  removed boolean,
  updated_by text,
  updated_at timestamptz,
  value_hash text,
  metadata jsonb
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_record public.platform_app_state_records%rowtype;
begin
  select *
    into current_record
    from public.platform_app_state_records records
   where records.organization_id = p_organization_id
     and records.state_key = p_state_key
   for update;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      return;
    end if;

    insert into public.platform_app_state_records as target (
      organization_id,
      state_key,
      module_id,
      merge_policy,
      revision,
      value,
      removed,
      updated_by,
      updated_at,
      value_hash,
      metadata
    ) values (
      p_organization_id,
      p_state_key,
      p_module_id,
      p_merge_policy,
      greatest(coalesce(p_next_revision, 1), 1),
      p_value,
      coalesce(p_removed, false),
      coalesce(p_updated_by, ''),
      clock_timestamp(),
      p_value_hash,
      coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict on constraint platform_app_state_records_pkey do nothing
    returning target.* into current_record;

    if found then
      return query select true, current_record.*;
      return;
    end if;

    select *
      into current_record
      from public.platform_app_state_records records
     where records.organization_id = p_organization_id
       and records.state_key = p_state_key;

    return query select false, current_record.*;
    return;
  end if;

  if current_record.revision <> coalesce(p_expected_revision, -1) then
    return query select false, current_record.*;
    return;
  end if;

  update public.platform_app_state_records records
     set module_id = p_module_id,
         merge_policy = p_merge_policy,
         revision = records.revision + 1,
         value = p_value,
         removed = coalesce(p_removed, false),
         updated_by = coalesce(p_updated_by, ''),
         updated_at = clock_timestamp(),
         value_hash = p_value_hash,
         metadata = coalesce(p_metadata, '{}'::jsonb)
   where records.organization_id = p_organization_id
     and records.state_key = p_state_key
  returning * into current_record;

  return query select true, current_record.*;
end;
$$;

revoke all on function public.write_platform_app_state_record(
  text, text, text, text, bigint, bigint, text, boolean, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.write_platform_app_state_record(
  text, text, text, text, bigint, bigint, text, boolean, text, text, jsonb
) to service_role;
