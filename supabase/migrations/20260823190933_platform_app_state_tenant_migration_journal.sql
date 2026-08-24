-- migration-safety: allow-destructive
-- Journaled, service-role-only migration support for moving legacy global
-- app-state rows into one explicit canonical organization. The rollback RPC
-- deletes only rows that exactly match the reviewed source generation.

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
  p_expected_record_count bigint,
  p_expected_source_content_sha256 text,
  p_expected_source_revision_sha256 text,
  p_expected_target_before_record_count bigint,
  p_expected_journal_status text
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
  duplicate_source_count bigint := 0;
  target_before_count bigint := 0;
  target_after_count bigint := 0;
  inserted_count bigint := 0;
  updated_journal_count bigint := 0;
begin
  if jsonb_typeof(coalesce(p_source_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Migration source rows must be a JSON array.';
  end if;

  lock table public.platform_app_state_records in share row exclusive mode;

  select *
    into migration_row
    from public.platform_app_state_tenant_migrations journal
   where journal.id = p_migration_id
   for update;

  if not found then
    raise exception 'Migration journal entry was not found.';
  end if;

  if migration_row.status <> p_expected_journal_status
     or migration_row.status not in ('applying', 'failed') then
    raise exception 'Migration journal status % does not match expected apply status %.',
      migration_row.status,
      p_expected_journal_status;
  end if;

  if migration_row.source_organization_id <> 'global'
     or migration_row.target_organization_id <> p_target_organization_id
     or migration_row.organization_id <> p_target_organization_id
     or migration_row.plan_sha256 <> p_plan_sha256
     or migration_row.source_content_sha256 <> p_expected_source_content_sha256
     or migration_row.source_revision_sha256 <> p_expected_source_revision_sha256
     or migration_row.target_before_record_count <> p_expected_target_before_record_count then
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

  if source_count <> p_expected_record_count
     or source_count <> migration_row.source_record_count then
    raise exception 'Migration source count does not match the reviewed journal.';
  end if;

  select count(*) - count(distinct source_rows."stateKey")
    into duplicate_source_count
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

  if duplicate_source_count <> 0 then
    raise exception 'Migration source contains duplicate state keys.';
  end if;

  if exists (
    select 1
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
     where coalesce(source_rows."stateKey", '') = ''
        or coalesce(source_rows."moduleId", '') = ''
        or coalesce(source_rows."mergePolicy", '') = ''
        or coalesce(source_rows.revision, 0) <= 0
        or coalesce(source_rows."valueHash", '') !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'Migration source contains an invalid state row.';
  end if;

  select count(*)
    into target_before_count
    from public.platform_app_state_records target
   where target.organization_id = p_target_organization_id;

  if target_before_count <> p_expected_target_before_record_count
     or target_before_count <> migration_row.target_before_record_count
     or target_before_count <> 0 then
    raise exception 'Migration target is not the reviewed empty generation.';
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
    source_rows."stateKey",
    source_rows."moduleId",
    source_rows."mergePolicy",
    source_rows.revision,
    coalesce(source_rows.value, ''),
    coalesce(source_rows.removed, false),
    coalesce(nullif(p_actor_id, ''), source_rows."updatedBy", ''),
    clock_timestamp(),
    source_rows."valueHash",
    coalesce(source_rows.metadata, '{}'::jsonb)
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

  get diagnostics inserted_count = row_count;

  if inserted_count <> source_count then
    raise exception 'Migration inserted % rows, expected %.', inserted_count, source_count;
  end if;

  select count(*)
    into target_after_count
    from public.platform_app_state_records target
   where target.organization_id = p_target_organization_id;

  if target_after_count <> source_count then
    raise exception 'Migration target count verification failed.';
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
      from (
        select *
          from public.platform_app_state_records records
         where records.organization_id = p_target_organization_id
      ) target
      full join source_rows source
        on source."stateKey" = target.state_key
     where source."stateKey" is null
        or target.state_key is null
        or target.module_id is distinct from source."moduleId"
        or target.merge_policy is distinct from source."mergePolicy"
        or target.revision is distinct from source.revision
        or target.value is distinct from coalesce(source.value, '')
        or target.removed is distinct from coalesce(source.removed, false)
        or target.value_hash is distinct from source."valueHash"
        or target.metadata is distinct from coalesce(source.metadata, '{}'::jsonb)
  ) then
    raise exception 'Migration target generation does not match the reviewed source rows.';
  end if;

  update public.platform_app_state_tenant_migrations journal
     set status = 'applying',
         updated_at = clock_timestamp(),
         failed_at = null,
         last_error = ''
   where journal.id = p_migration_id
     and journal.status = p_expected_journal_status
     and journal.plan_sha256 = p_plan_sha256;

  get diagnostics updated_journal_count = row_count;

  if updated_journal_count <> 1 then
    raise exception 'Migration journal apply CAS update failed.';
  end if;

  return query select true, source_count;
end;
$$;

revoke all on function public.apply_platform_app_state_tenant_migration(
  uuid, text, text, text, jsonb, bigint, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.apply_platform_app_state_tenant_migration(
  uuid, text, text, text, jsonb, bigint, text, text, bigint, text
) to service_role;

create or replace function public.rollback_platform_app_state_tenant_migration(
  p_migration_id uuid,
  p_plan_sha256 text,
  p_source_rows jsonb,
  p_expected_record_count bigint,
  p_expected_source_content_sha256 text,
  p_expected_source_revision_sha256 text,
  p_expected_journal_status text
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
  duplicate_source_count bigint := 0;
  target_before_delete_count bigint := 0;
  removed_count bigint := 0;
  target_after_delete_count bigint := 0;
  updated_journal_count bigint := 0;
begin
  if jsonb_typeof(coalesce(p_source_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Rollback source rows must be a JSON array.';
  end if;

  lock table public.platform_app_state_records in share row exclusive mode;

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

  if migration_row.status <> p_expected_journal_status
     or migration_row.status not in ('applying', 'failed', 'completed') then
    raise exception 'Migration journal status % does not match expected rollback status %.',
      migration_row.status,
      p_expected_journal_status;
  end if;

  if migration_row.source_organization_id <> 'global'
     or migration_row.organization_id <> migration_row.target_organization_id
     or migration_row.plan_sha256 <> p_plan_sha256
     or migration_row.source_content_sha256 <> p_expected_source_content_sha256
     or migration_row.source_revision_sha256 <> p_expected_source_revision_sha256 then
    raise exception 'Rollback journal identity does not match the reviewed plan.';
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

  if source_count <> p_expected_record_count
     or source_count <> migration_row.source_record_count then
    raise exception 'Rollback source count does not match the reviewed journal.';
  end if;

  select count(*) - count(distinct source_rows."stateKey")
    into duplicate_source_count
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

  if duplicate_source_count <> 0 then
    raise exception 'Rollback source contains duplicate state keys.';
  end if;

  select count(*)
    into target_before_delete_count
    from public.platform_app_state_records target
   where target.organization_id = migration_row.target_organization_id;

  if target_before_delete_count <> source_count then
    raise exception 'Rollback target count no longer matches the migrated generation.';
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
      from (
        select *
          from public.platform_app_state_records records
         where records.organization_id = migration_row.target_organization_id
      ) target
      full join source_rows source
        on source."stateKey" = target.state_key
     where source."stateKey" is null
        or target.state_key is null
        or target.module_id is distinct from source."moduleId"
        or target.merge_policy is distinct from source."mergePolicy"
        or target.revision is distinct from source.revision
        or target.value is distinct from coalesce(source.value, '')
        or target.removed is distinct from coalesce(source.removed, false)
        or target.value_hash is distinct from source."valueHash"
        or target.metadata is distinct from coalesce(source.metadata, '{}'::jsonb)
  ) then
    raise exception 'Rollback refused because target data changed after the migration generation.';
  end if;

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
  delete from public.platform_app_state_records target
   using source_rows source
   where target.organization_id = migration_row.target_organization_id
     and target.state_key = source."stateKey"
     and target.module_id is not distinct from source."moduleId"
     and target.merge_policy is not distinct from source."mergePolicy"
     and target.revision is not distinct from source.revision
     and target.value is not distinct from coalesce(source.value, '')
     and target.removed is not distinct from coalesce(source.removed, false)
     and target.value_hash is not distinct from source."valueHash"
     and target.metadata is not distinct from coalesce(source.metadata, '{}'::jsonb);

  get diagnostics removed_count = row_count;

  if removed_count <> source_count then
    raise exception 'Rollback deleted % rows, expected %.', removed_count, source_count;
  end if;

  select count(*)
    into target_after_delete_count
    from public.platform_app_state_records target
   where target.organization_id = migration_row.target_organization_id;

  if target_after_delete_count <> 0 then
    raise exception 'Rollback verification found remaining target rows.';
  end if;

  update public.platform_app_state_tenant_migrations journal
     set status = 'rolled_back',
         rolled_back_at = clock_timestamp(),
         updated_at = clock_timestamp(),
         last_error = ''
   where journal.id = p_migration_id
     and journal.status = p_expected_journal_status
     and journal.plan_sha256 = p_plan_sha256;

  get diagnostics updated_journal_count = row_count;

  if updated_journal_count <> 1 then
    raise exception 'Migration journal rollback CAS update failed.';
  end if;

  return query select true, removed_count;
end;
$$;

revoke all on function public.rollback_platform_app_state_tenant_migration(
  uuid, text, jsonb, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.rollback_platform_app_state_tenant_migration(
  uuid, text, jsonb, bigint, text, text, text
) to service_role;
