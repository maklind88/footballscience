-- Session Planner typed domain records v1.
--
-- This migration is intentionally additive and inert. The existing
-- football-session-planner-v3 app-state record remains production-primary.
-- The new tables establish bounded session/block records, audit history, and
-- an idempotent migration ledger for shadow verification before any cutover.

create schema if not exists app_private;
create extension if not exists pgcrypto;

create table if not exists public.session_planner_sessions (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  session_date date not null,
  session_slot text not null default 'primary' check (session_slot ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  legacy_session_id text not null check (char_length(legacy_session_id) between 1 and 180),
  title text not null default '' check (char_length(title) <= 300),
  theme text not null default '' check (char_length(theme) <= 1200),
  selected_block_legacy_id text not null default '' check (char_length(selected_block_legacy_id) <= 180),
  schema_version integer not null default 1 check (schema_version > 0),
  row_version bigint not null default 1 check (row_version > 0),
  content jsonb not null default '{}'::jsonb check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 131072
  ),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text check (archive_reason is null or char_length(archive_reason) <= 1200)
);

create unique index if not exists session_planner_sessions_team_date_slot_active_idx
  on public.session_planner_sessions (team_id, session_date, session_slot)
  where archived_at is null;
create index if not exists session_planner_sessions_org_team_date_idx
  on public.session_planner_sessions (organization_id, team_id, session_date desc, id)
  where archived_at is null;
create index if not exists session_planner_sessions_team_updated_idx
  on public.session_planner_sessions (team_id, updated_at desc, id);

create table if not exists public.session_planner_blocks (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  session_id uuid not null references public.session_planner_sessions(id) on delete restrict,
  legacy_block_id text not null check (char_length(legacy_block_id) between 1 and 180),
  sort_order integer not null check (sort_order >= 0),
  schema_version integer not null default 1 check (schema_version > 0),
  row_version bigint not null default 1 check (row_version > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 262144
  ),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text check (archive_reason is null or char_length(archive_reason) <= 1200)
);

create unique index if not exists session_planner_blocks_session_legacy_active_idx
  on public.session_planner_blocks (session_id, legacy_block_id)
  where archived_at is null;
create unique index if not exists session_planner_blocks_session_order_active_idx
  on public.session_planner_blocks (session_id, sort_order)
  where archived_at is null;
create index if not exists session_planner_blocks_org_team_session_idx
  on public.session_planner_blocks (organization_id, team_id, session_id, sort_order)
  where archived_at is null;

create table if not exists public.session_planner_record_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  record_type text not null check (record_type in ('session', 'block')),
  record_id uuid not null,
  row_version bigint not null check (row_version > 0),
  action text not null check (action in ('insert', 'update', 'archive', 'restore')),
  changed_fields text[] not null default '{}'::text[],
  before_record jsonb,
  after_record jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  request_id text check (request_id is null or char_length(request_id) <= 180),
  created_at timestamptz not null default now()
);

create index if not exists session_planner_versions_record_created_idx
  on public.session_planner_record_versions (record_type, record_id, created_at desc);
create index if not exists session_planner_versions_tenant_created_idx
  on public.session_planner_record_versions (organization_id, team_id, created_at desc);

create table if not exists public.session_planner_migration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  source_storage_key text not null default 'football-session-planner-v3'
    check (char_length(source_storage_key) between 3 and 180),
  source_revision bigint not null check (source_revision >= 0),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  mode text not null default 'dry-run' check (mode in ('dry-run', 'backfill', 'verify', 'rollback')),
  status text not null default 'planned'
    check (status in ('planned', 'processing', 'completed', 'failed', 'rolled-back')),
  session_count integer not null default 0 check (session_count >= 0),
  block_count integer not null default 0 check (block_count >= 0),
  mismatch_count integer not null default 0 check (mismatch_count >= 0),
  verification_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(verification_summary) = 'object'),
  error_message text check (error_message is null or char_length(error_message) <= 1600),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (team_id, source_storage_key, source_revision, source_hash, mode)
);

create index if not exists session_planner_migration_runs_tenant_created_idx
  on public.session_planner_migration_runs (organization_id, team_id, created_at desc);
create index if not exists session_planner_migration_runs_status_created_idx
  on public.session_planner_migration_runs (status, created_at desc);

create or replace function app_private.session_planner_validate_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  team_organization_id uuid;
  parent_session public.session_planner_sessions%rowtype;
begin
  select organization_id into team_organization_id
  from public.platform_teams
  where id = new.team_id and deleted_at is null and status = 'active';

  if team_organization_id is null or team_organization_id <> new.organization_id then
    raise exception 'Session Planner tenant scope mismatch.' using errcode = '23514';
  end if;

  if tg_table_name = 'session_planner_blocks' then
    select * into parent_session from public.session_planner_sessions where id = new.session_id;
    if not found
      or parent_session.organization_id <> new.organization_id
      or parent_session.team_id <> new.team_id then
      raise exception 'Session Planner block scope does not match its session.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.session_planner_touch_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'updated_at' - 'updated_by' - 'row_version')
      is distinct from
      (to_jsonb(old) - 'updated_at' - 'updated_by' - 'row_version') then
    new.row_version = old.row_version + 1;
    new.updated_at = clock_timestamp();
    new.updated_by = coalesce((select auth.uid()), new.updated_by);
  else
    new.updated_at = old.updated_at;
    new.updated_by = old.updated_by;
  end if;
  return new;
end;
$$;

create or replace function app_private.session_planner_log_record_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_record jsonb;
  new_record jsonb := to_jsonb(new);
  changed text[];
  next_action text;
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}'::text[])
      into changed from jsonb_object_keys(new_record) as fields(key);
    next_action := 'insert';
    old_record := null;
  else
    old_record := to_jsonb(old);
    select coalesce(array_agg(key order by key), '{}'::text[])
      into changed
      from jsonb_each(new_record) as values_next(key, value)
     where (old_record -> key) is distinct from value
       and key not in ('updated_at', 'updated_by', 'row_version');

    if coalesce(array_length(changed, 1), 0) = 0 then
      return new;
    end if;

    next_action := case
      when old.archived_at is null and new.archived_at is not null then 'archive'
      when old.archived_at is not null and new.archived_at is null then 'restore'
      else 'update'
    end;
  end if;

  insert into public.session_planner_record_versions (
    organization_id,
    team_id,
    record_type,
    record_id,
    row_version,
    action,
    changed_fields,
    before_record,
    after_record,
    actor_id
  ) values (
    new.organization_id,
    new.team_id,
    case when tg_table_name = 'session_planner_sessions' then 'session' else 'block' end,
    new.id,
    new.row_version,
    next_action,
    changed,
    old_record,
    new_record,
    (select auth.uid())
  );
  return new;
end;
$$;

create or replace function app_private.session_planner_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hard delete is disabled for Session Planner records. Use archive/restore.' using errcode = 'P0001';
end;
$$;

create or replace function app_private.can_read_session_planner_scope(
  target_organization_id uuid,
  target_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and (
      app_private.current_platform_role() = 'admin'
      or exists (
        select 1
        from public.platform_teams target_team
        join public.platform_memberships membership
          on membership.user_id = (select auth.uid())
         and membership.organization_id = target_organization_id
        where target_team.id = target_team_id
          and target_team.organization_id = target_organization_id
          and target_team.status = 'active'
          and target_team.deleted_at is null
          and membership.status = 'active'
          and membership.deleted_at is null
          and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
          and (
            (membership.scope = 'organization' and membership.organization_id = target_organization_id)
            or (
              membership.scope = 'club'
              and target_team.club_id is not null
              and membership.club_id = target_team.club_id
            )
            or (membership.scope = 'team' and membership.team_id = target_team_id)
          )
      )
    );
$$;

drop trigger if exists session_planner_sessions_validate_scope on public.session_planner_sessions;
create trigger session_planner_sessions_validate_scope
before insert or update on public.session_planner_sessions
for each row execute function app_private.session_planner_validate_scope();

drop trigger if exists session_planner_blocks_validate_scope on public.session_planner_blocks;
create trigger session_planner_blocks_validate_scope
before insert or update on public.session_planner_blocks
for each row execute function app_private.session_planner_validate_scope();

drop trigger if exists session_planner_sessions_touch on public.session_planner_sessions;
create trigger session_planner_sessions_touch
before update on public.session_planner_sessions
for each row execute function app_private.session_planner_touch_record();

drop trigger if exists session_planner_blocks_touch on public.session_planner_blocks;
create trigger session_planner_blocks_touch
before update on public.session_planner_blocks
for each row execute function app_private.session_planner_touch_record();

drop trigger if exists session_planner_sessions_log_version on public.session_planner_sessions;
create trigger session_planner_sessions_log_version
after insert or update on public.session_planner_sessions
for each row execute function app_private.session_planner_log_record_version();

drop trigger if exists session_planner_blocks_log_version on public.session_planner_blocks;
create trigger session_planner_blocks_log_version
after insert or update on public.session_planner_blocks
for each row execute function app_private.session_planner_log_record_version();

drop trigger if exists session_planner_sessions_prevent_hard_delete on public.session_planner_sessions;
create trigger session_planner_sessions_prevent_hard_delete
before delete on public.session_planner_sessions
for each row execute function app_private.session_planner_prevent_hard_delete();

drop trigger if exists session_planner_blocks_prevent_hard_delete on public.session_planner_blocks;
create trigger session_planner_blocks_prevent_hard_delete
before delete on public.session_planner_blocks
for each row execute function app_private.session_planner_prevent_hard_delete();

alter table public.session_planner_sessions enable row level security;
alter table public.session_planner_blocks enable row level security;
alter table public.session_planner_record_versions enable row level security;
alter table public.session_planner_migration_runs enable row level security;

revoke all on public.session_planner_sessions from anon, authenticated;
revoke all on public.session_planner_blocks from anon, authenticated;
revoke all on public.session_planner_record_versions from anon, authenticated;
revoke all on public.session_planner_migration_runs from anon, authenticated;

grant select, insert, update on public.session_planner_sessions to service_role;
grant select, insert, update on public.session_planner_blocks to service_role;
grant select, insert on public.session_planner_record_versions to service_role;
grant select, insert, update on public.session_planner_migration_runs to service_role;

grant select on public.session_planner_sessions to authenticated;
grant select on public.session_planner_blocks to authenticated;

drop policy if exists "session planner sessions are tenant visible" on public.session_planner_sessions;
create policy "session planner sessions are tenant visible"
on public.session_planner_sessions
for select
to authenticated
using (
  archived_at is null
  and app_private.can_read_session_planner_scope(organization_id, team_id)
);

drop policy if exists "session planner blocks are tenant visible" on public.session_planner_blocks;
create policy "session planner blocks are tenant visible"
on public.session_planner_blocks
for select
to authenticated
using (
  archived_at is null
  and app_private.can_read_session_planner_scope(organization_id, team_id)
);

revoke all on function app_private.session_planner_validate_scope() from public, anon, authenticated;
revoke all on function app_private.session_planner_touch_record() from public, anon, authenticated;
revoke all on function app_private.session_planner_log_record_version() from public, anon, authenticated;
revoke all on function app_private.session_planner_prevent_hard_delete() from public, anon, authenticated;
revoke all on function app_private.can_read_session_planner_scope(uuid, uuid) from public, anon;
grant execute on function app_private.can_read_session_planner_scope(uuid, uuid) to authenticated;

insert into public.platform_module_migration_checkpoints (
  module_id,
  source_storage_key,
  target_table,
  phase,
  reads_from_database,
  writes_to_database,
  app_state_fallback_enabled,
  owner,
  notes
) values (
  'session-planner',
  'football-session-planner-v3',
  'session_planner_sessions',
  'planned',
  false,
  false,
  true,
  'session-planner',
  'Additive typed session/block foundation. Existing app-state remains production-primary until shadow verification and rollback checks pass.'
)
on conflict (module_id, source_storage_key, target_table) do nothing;
