-- Strongly consistent source of truth for central app-state records.
-- Supabase Storage remains a compatibility backup while reads and CAS writes
-- move to Postgres behind APP_STATE_DATABASE_MODE=database.

create table if not exists public.platform_app_state_records (
  organization_id text not null default 'global',
  state_key text not null,
  module_id text not null,
  merge_policy text not null,
  revision bigint not null default 1 check (revision > 0),
  value text not null default '',
  removed boolean not null default false,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  value_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, state_key),
  constraint platform_app_state_organization_length check (char_length(organization_id) between 1 and 120),
  constraint platform_app_state_key_length check (char_length(state_key) between 1 and 180),
  constraint platform_app_state_module_length check (char_length(module_id) between 1 and 120),
  constraint platform_app_state_merge_policy_length check (char_length(merge_policy) between 1 and 120),
  constraint platform_app_state_hash_format check (value_hash ~ '^[a-f0-9]{64}$'),
  constraint platform_app_state_value_size check (octet_length(value) <= 12582912)
);

create index if not exists platform_app_state_updated_at_idx
  on public.platform_app_state_records (updated_at desc);

alter table public.platform_app_state_records enable row level security;
revoke all on public.platform_app_state_records from anon, authenticated;
grant select, insert, update on public.platform_app_state_records to service_role;

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

    insert into public.platform_app_state_records (
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
    on conflict (organization_id, state_key) do nothing
    returning * into current_record;

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
