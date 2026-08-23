-- Journaled, service-role-only migration support for moving legacy global
-- app-state rows into one explicit canonical organization. Normal product
-- traffic must never read the global fallback after this release.

create table if not exists public.platform_app_state_tenant_migrations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  source_organization_id text not null,
  target_organization_id text not null,
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'applying' check (status in ('applying', 'completed', 'failed', 'rolled_back')),
  source_record_count bigint not null default 0 check (source_record_count >= 0),
  source_content_sha256 text not null check (source_content_sha256 ~ '^[a-f0-9]{64}$'),
  source_revision_sha256 text not null check (source_revision_sha256 ~ '^[a-f0-9]{64}$'),
  target_before_record_count bigint not null default 0 check (target_before_record_count >= 0),
  target_before_content_sha256 text not null check (target_before_content_sha256 ~ '^[a-f0-9]{64}$'),
  target_before_revision_sha256 text not null check (target_before_revision_sha256 ~ '^[a-f0-9]{64}$'),
  target_after_record_count bigint,
  target_after_content_sha256 text check (target_after_content_sha256 is null or target_after_content_sha256 ~ '^[a-f0-9]{64}$'),
  target_after_revision_sha256 text check (target_after_revision_sha256 is null or target_after_revision_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_path text not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  last_error text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_app_state_tenant_migration_global_source check (source_organization_id = 'global'),
  constraint platform_app_state_tenant_migration_target_owner check (organization_id = target_organization_id),
  constraint platform_app_state_tenant_migration_unique_plan unique (source_organization_id, target_organization_id, plan_sha256)
);

create index if not exists platform_app_state_tenant_migrations_target_idx
  on public.platform_app_state_tenant_migrations (target_organization_id, created_at desc);

alter table public.platform_app_state_tenant_migrations enable row level security;
alter table public.platform_app_state_tenant_migrations force row level security;
revoke all on public.platform_app_state_tenant_migrations from anon, authenticated;
revoke all on public.platform_app_state_tenant_migrations from public;
grant select, insert, update on public.platform_app_state_tenant_migrations to service_role;

create or replace function public.apply_platform_app_state_tenant_migration(
  p_migration_id uuid,
  p_target_organization_id text,
  p_plan_sha256 text,
  p_actor_id text,
  p_source_rows jsonb,
  p_expected_record_count bigint
)
returns table (
  applied boolean,
  migrated_count bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  migration_row public.platform_app_state_tenant_migrations%rowtype;
  source_count bigint := 0;
  inserted_count bigint := 0;
begin
  select *
    into migration_row
    from public.platform_app_state_tenant_migrations journal
   where journal.id = p_migration_id
   for update;

  if not found then
    raise exception 'Migration journal entry was not found.';
  end if;

  if migration_row.status not in ('applying', 'failed') then
    raise exception 'Migration journal status % is not applyable.', migration_row.status;
  end if;

  if migration_row.source_organization_id <> 'global'
     or migration_row.target_organization_id <> p_target_organization_id
     or migration_row.organization_id <> p_target_organization_id
     or migration_row.plan_sha256 <> p_plan_sha256 then
    raise exception 'Migration journal identity does not match the reviewed plan.';
  end if;

  select count(*)
    into source_count
    from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
      "stateKey" text,
      "moduleId" text,
      "mergePolicy" text,
      revision bigint,
      value text,
      removed boolean,
      "updatedBy" text,
      "updatedAt" text,
      "valueHash" text,
      metadata jsonb
    );

  if source_count <> p_expected_record_count or source_count <> migration_row.source_record_count then
    raise exception 'Migration source count does not match the reviewed journal.';
  end if;

  if exists (
    with source_rows as (
      select *
        from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
          "stateKey" text,
          "moduleId" text,
          "mergePolicy" text,
          revision bigint,
          value text,
          removed boolean,
          "updatedBy" text,
          "updatedAt" text,
          "valueHash" text,
          metadata jsonb
        )
    )
    select 1
      from public.platform_app_state_records target
      left join source_rows source
        on source."stateKey" = target.state_key
     where target.organization_id = p_target_organization_id
       and source."stateKey" is null
  ) then
    raise exception 'Migration target contains rows outside the reviewed legacy plan.';
  end if;

  if exists (
    with source_rows as (
      select *
        from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
          "stateKey" text,
          "moduleId" text,
          "mergePolicy" text,
          revision bigint,
          value text,
          removed boolean,
          "updatedBy" text,
          "updatedAt" text,
          "valueHash" text,
          metadata jsonb
        )
    )
    select 1
      from public.platform_app_state_records target
      join source_rows source
        on source."stateKey" = target.state_key
     where target.organization_id = p_target_organization_id
       and (
         target.module_id is distinct from source."moduleId"
         or target.merge_policy is distinct from source."mergePolicy"
         or target.revision is distinct from source.revision
         or target.value is distinct from coalesce(source.value, '')
         or target.removed is distinct from coalesce(source.removed, false)
         or target.value_hash is distinct from source."valueHash"
         or target.metadata is distinct from coalesce(source.metadata, '{}'::jsonb)
       )
  ) then
    raise exception 'Migration target contains a differing row for the reviewed legacy plan.';
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
  )
  select
    p_target_organization_id,
    source."stateKey",
    source."moduleId",
    source."mergePolicy",
    greatest(source.revision, 1),
    coalesce(source.value, ''),
    coalesce(source.removed, false),
    coalesce(nullif(p_actor_id, ''), source."updatedBy", ''),
    clock_timestamp(),
    source."valueHash",
    coalesce(source.metadata, '{}'::jsonb)
    from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source(
      "stateKey" text,
      "moduleId" text,
      "mergePolicy" text,
      revision bigint,
      value text,
      removed boolean,
      "updatedBy" text,
      "updatedAt" text,
      "valueHash" text,
      metadata jsonb
    )
  on conflict (organization_id, state_key) do nothing;

  get diagnostics inserted_count = row_count;

  update public.platform_app_state_tenant_migrations journal
     set status = 'applying',
         updated_at = clock_timestamp(),
         failed_at = null,
         last_error = ''
   where journal.id = p_migration_id;

  if not found then
    raise exception 'Migration journal could not be updated after apply.';
  end if;

  return query select true, source_count;
end;
$$;

revoke all on function public.apply_platform_app_state_tenant_migration(
  uuid, text, text, text, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.apply_platform_app_state_tenant_migration(
  uuid, text, text, text, jsonb, bigint
) to service_role;

create or replace function public.rollback_platform_app_state_tenant_migration(
  p_migration_id uuid,
  p_source_rows jsonb,
  p_expected_record_count bigint
)
returns table (
  rolled_back boolean,
  deleted_count bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  migration_row public.platform_app_state_tenant_migrations%rowtype;
  source_count bigint := 0;
  removed_count bigint := 0;
begin
  select *
    into migration_row
    from public.platform_app_state_tenant_migrations journal
   where journal.id = p_migration_id
   for update;

  if not found then
    raise exception 'Migration journal entry was not found.';
  end if;

  if migration_row.target_before_record_count <> 0 then
    raise exception 'Rollback is allowed only when the verified target was empty before migration.';
  end if;

  if migration_row.status not in ('applying', 'failed', 'completed') then
    raise exception 'Migration journal status % is not rollbackable.', migration_row.status;
  end if;

  select count(*)
    into source_count
    from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
      "stateKey" text,
      "moduleId" text,
      "mergePolicy" text,
      revision bigint,
      value text,
      removed boolean,
      "updatedBy" text,
      "updatedAt" text,
      "valueHash" text,
      metadata jsonb
    );

  if source_count <> p_expected_record_count or source_count <> migration_row.source_record_count then
    raise exception 'Rollback source count does not match the reviewed journal.';
  end if;

  if exists (
    with source_rows as (
      select *
        from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
          "stateKey" text,
          "moduleId" text,
          "mergePolicy" text,
          revision bigint,
          value text,
          removed boolean,
          "updatedBy" text,
          "updatedAt" text,
          "valueHash" text,
          metadata jsonb
        )
    )
    select 1
      from public.platform_app_state_records target
      left join source_rows source
        on source."stateKey" = target.state_key
     where target.organization_id = migration_row.target_organization_id
       and (
         source."stateKey" is null
         or target.module_id is distinct from source."moduleId"
         or target.merge_policy is distinct from source."mergePolicy"
         or target.revision is distinct from source.revision
         or target.value is distinct from coalesce(source.value, '')
         or target.removed is distinct from coalesce(source.removed, false)
         or target.value_hash is distinct from source."valueHash"
         or target.metadata is distinct from coalesce(source.metadata, '{}'::jsonb)
       )
  ) then
    raise exception 'Rollback refused because target data changed after the migration generation.';
  end if;

  with source_rows as (
    select *
      from jsonb_to_recordset(coalesce(p_source_rows, '[]'::jsonb)) as source_rows(
