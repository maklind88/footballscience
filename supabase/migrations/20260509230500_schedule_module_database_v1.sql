-- Football Science Schedule Module: database safety foundation.
-- The live UI remains app-state compatible while this schema becomes the
-- durable, server-write-first source for team schedule events.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

create schema if not exists app_private;

create or replace function app_private.is_schedule_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_schedule_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach');
$$;

create or replace function app_private.is_schedule_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() = 'admin';
$$;

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  team_id uuid not null references public.squad_teams(id) on delete restrict,
  season_id uuid references public.squad_seasons(id) on delete restrict,
  legacy_event_id text check (legacy_event_id is null or char_length(legacy_event_id) <= 160),
  event_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  type text not null default 'training' check (type in ('training', 'match', 'meeting', 'travel', 'recovery', 'off')),
  title text not null check (char_length(title) between 1 and 180),
  note text check (note is null or char_length(note) <= 2000),
  location text check (location is null or char_length(location) <= 180),
  opponent text check (opponent is null or char_length(opponent) <= 180),
  status text not null default 'planned' check (status in ('draft', 'planned', 'confirmed', 'completed', 'cancelled', 'archived')),
  visibility text not null default 'team' check (visibility in ('team', 'staff', 'private')),
  source text not null default 'manual' check (source in ('manual', 'import', 'integration', 'legacy-app-state', 'system')),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 1200),
  metadata jsonb not null default '{}'::jsonb,
  constraint schedule_events_time_range_check check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create table if not exists public.schedule_event_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  team_id uuid not null references public.squad_teams(id) on delete restrict,
  season_id uuid references public.squad_seasons(id) on delete restrict,
  schedule_event_id uuid not null references public.schedule_events(id) on delete restrict,
  row_version integer not null check (row_version > 0),
  change_type text not null check (change_type in ('insert', 'update', 'archive', 'restore')),
  changed_fields text[] not null default '{}'::text[],
  before_record jsonb,
  after_record jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  team_id uuid references public.squad_teams(id) on delete restrict,
  source_key text not null check (char_length(source_key) between 1 and 160),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  actor_id uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_key, idempotency_key)
);

create table if not exists public.schedule_state_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  team_id uuid not null references public.squad_teams(id) on delete restrict,
  source_key text not null check (char_length(source_key) between 1 and 160),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  event_type text not null default 'state-snapshot' check (event_type in ('state-snapshot', 'event-saved', 'event-removed', 'events-imported')),
  event_count integer not null default 0 check (event_count >= 0),
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null check (char_length(payload_hash) = 64),
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'completed', 'failed', 'ignored')),
  processed_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 1200),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_key, idempotency_key)
);

create table if not exists public.schedule_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete restrict,
  team_id uuid references public.squad_teams(id) on delete restrict,
  schedule_event_id uuid references public.schedule_events(id) on delete restrict,
  action text not null check (char_length(action) between 2 and 120),
  before_record jsonb,
  after_record jsonb,
  changed_fields text[] not null default '{}'::text[],
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  request_id text check (request_id is null or char_length(request_id) <= 160),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists schedule_events_team_date_idx on public.schedule_events (team_id, event_date, starts_at, id) where deleted_at is null and status <> 'archived';
create index if not exists schedule_events_org_date_type_idx on public.schedule_events (organization_id, event_date, type, id) where deleted_at is null and status <> 'archived';
create unique index if not exists schedule_events_team_legacy_event_unique_idx on public.schedule_events (team_id, legacy_event_id) where legacy_event_id is not null;
create index if not exists schedule_event_versions_event_created_idx on public.schedule_event_versions (schedule_event_id, created_at desc);
create index if not exists schedule_event_versions_org_created_idx on public.schedule_event_versions (organization_id, created_at desc);
create index if not exists schedule_import_batches_org_created_idx on public.schedule_import_batches (organization_id, created_at desc);
create index if not exists schedule_state_sync_events_org_created_idx on public.schedule_state_sync_events (organization_id, created_at desc);
create index if not exists schedule_state_sync_events_status_created_idx on public.schedule_state_sync_events (processing_status, created_at desc);
create index if not exists schedule_audit_events_org_created_idx on public.schedule_audit_events (organization_id, created_at desc);
create index if not exists schedule_audit_events_event_created_idx on public.schedule_audit_events (schedule_event_id, created_at desc);

create or replace function app_private.schedule_touch_updated_at_and_row_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce((select auth.uid()), new.updated_by);
  if tg_op = 'UPDATE' and to_jsonb(new) is distinct from to_jsonb(old) then
    new.row_version = coalesce(old.row_version, 1) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_events_touch_updated_at on public.schedule_events;
create trigger schedule_events_touch_updated_at before update on public.schedule_events for each row execute function app_private.schedule_touch_updated_at_and_row_version();

drop trigger if exists schedule_import_batches_touch_updated_at on public.schedule_import_batches;
create trigger schedule_import_batches_touch_updated_at before update on public.schedule_import_batches for each row execute function app_private.schedule_touch_updated_at_and_row_version();

create or replace function app_private.schedule_log_event_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_data jsonb;
  new_data jsonb;
  changed text[];
  next_change_type text;
begin
  new_data := to_jsonb(new);

  if tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}'::text[]) into changed from jsonb_object_keys(new_data) as fields(key);
    insert into public.schedule_event_versions (organization_id, team_id, season_id, schedule_event_id, row_version, change_type, changed_fields, before_record, after_record, actor_id)
    values (new.organization_id, new.team_id, new.season_id, new.id, new.row_version, 'insert', changed, null, new_data, (select auth.uid()));
    insert into public.schedule_audit_events (organization_id, team_id, schedule_event_id, action, before_record, after_record, changed_fields, actor_id)
    values (new.organization_id, new.team_id, new.id, 'schedule.event.insert', null, new_data, changed, (select auth.uid()));
    return new;
  end if;

  old_data := to_jsonb(old);
  select coalesce(array_agg(key order by key), '{}'::text[]) into changed
  from jsonb_each(new_data) as next_values(key, value)
  where (old_data -> key) is distinct from value and key not in ('updated_at', 'row_version');

  if coalesce(array_length(changed, 1), 0) = 0 then
    return new;
  end if;

  next_change_type := case
    when old.deleted_at is null and new.deleted_at is not null then 'archive'
    when old.deleted_at is not null and new.deleted_at is null then 'restore'
    else 'update'
  end;

  insert into public.schedule_event_versions (organization_id, team_id, season_id, schedule_event_id, row_version, change_type, changed_fields, before_record, after_record, actor_id)
  values (new.organization_id, new.team_id, new.season_id, new.id, new.row_version, next_change_type, changed, old_data, new_data, (select auth.uid()));
  insert into public.schedule_audit_events (organization_id, team_id, schedule_event_id, action, before_record, after_record, changed_fields, actor_id)
  values (new.organization_id, new.team_id, new.id, 'schedule.event.' || next_change_type, old_data, new_data, changed, (select auth.uid()));
  return new;
end;
$$;

drop trigger if exists schedule_events_log_version on public.schedule_events;
create trigger schedule_events_log_version after insert or update on public.schedule_events for each row execute function app_private.schedule_log_event_version();

create or replace function app_private.schedule_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hard delete is disabled for Schedule records. Use archive/restore with deleted_at instead.' using errcode = 'P0001';
end;
$$;

drop trigger if exists schedule_events_prevent_hard_delete on public.schedule_events;
create trigger schedule_events_prevent_hard_delete before delete on public.schedule_events for each row execute function app_private.schedule_prevent_hard_delete();

create or replace function app_private.schedule_update_event(target_schedule_event_id uuid, expected_row_version integer, patch jsonb)
returns public.schedule_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_patch jsonb := coalesce(patch, '{}'::jsonb);
  updated_row public.schedule_events;
begin
  if expected_row_version is null or expected_row_version <= 0 then
    raise exception 'Expected row version is required for Schedule updates.' using errcode = '22023';
  end if;

  update public.schedule_events as schedule_event
     set season_id = case
           when normalized_patch ? 'seasonId' then nullif(normalized_patch ->> 'seasonId', '')::uuid
           when normalized_patch ? 'season_id' then nullif(normalized_patch ->> 'season_id', '')::uuid
           else schedule_event.season_id
         end,
         event_date = case
           when normalized_patch ? 'eventDate' then (normalized_patch ->> 'eventDate')::date
           when normalized_patch ? 'event_date' then (normalized_patch ->> 'event_date')::date
           when normalized_patch ? 'date' then (normalized_patch ->> 'date')::date
           else schedule_event.event_date
         end,
         starts_at = case
           when normalized_patch ? 'startsAt' then nullif(normalized_patch ->> 'startsAt', '')::timestamptz
           when normalized_patch ? 'starts_at' then nullif(normalized_patch ->> 'starts_at', '')::timestamptz
           else schedule_event.starts_at
         end,
         ends_at = case
           when normalized_patch ? 'endsAt' then nullif(normalized_patch ->> 'endsAt', '')::timestamptz
           when normalized_patch ? 'ends_at' then nullif(normalized_patch ->> 'ends_at', '')::timestamptz
           else schedule_event.ends_at
         end,
         type = coalesce(nullif(normalized_patch ->> 'type', ''), schedule_event.type),
         title = coalesce(nullif(normalized_patch ->> 'title', ''), schedule_event.title),
         note = case when normalized_patch ? 'note' then nullif(normalized_patch ->> 'note', '') else schedule_event.note end,
         location = case when normalized_patch ? 'location' then nullif(normalized_patch ->> 'location', '') else schedule_event.location end,
         opponent = case when normalized_patch ? 'opponent' then nullif(normalized_patch ->> 'opponent', '') else schedule_event.opponent end,
         status = coalesce(nullif(normalized_patch ->> 'status', ''), schedule_event.status),
         visibility = coalesce(nullif(normalized_patch ->> 'visibility', ''), schedule_event.visibility),
         source = coalesce(nullif(normalized_patch ->> 'source', ''), schedule_event.source),
         metadata = schedule_event.metadata || coalesce(normalized_patch -> 'metadata', '{}'::jsonb),
         updated_by = (select auth.uid())
   where schedule_event.id = target_schedule_event_id
     and schedule_event.row_version = expected_row_version
     and schedule_event.deleted_at is null
   returning * into updated_row;

  if not found then
    raise exception 'Schedule row version conflict.' using errcode = '40001';
  end if;
  return updated_row;
end;
$$;

create or replace function app_private.schedule_archive_event(target_schedule_event_id uuid, expected_row_version integer, reason text default null)
returns public.schedule_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_row public.schedule_events;
begin
  if expected_row_version is null or expected_row_version <= 0 then
    raise exception 'Expected row version is required for Schedule archive.' using errcode = '22023';
  end if;

  update public.schedule_events as schedule_event
     set deleted_at = now(), deleted_by = (select auth.uid()), delete_reason = nullif(reason, ''), status = 'archived', updated_by = (select auth.uid())
   where schedule_event.id = target_schedule_event_id and schedule_event.row_version = expected_row_version and schedule_event.deleted_at is null
   returning * into updated_row;

  if not found then
    raise exception 'Schedule row version conflict.' using errcode = '40001';
  end if;
  return updated_row;
end;
$$;

create or replace function app_private.schedule_restore_event(target_schedule_event_id uuid, expected_row_version integer, reason text default null)
returns public.schedule_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_row public.schedule_events;
begin
  if expected_row_version is null or expected_row_version <= 0 then
    raise exception 'Expected row version is required for Schedule restore.' using errcode = '22023';
  end if;

  update public.schedule_events as schedule_event
     set deleted_at = null, deleted_by = null, delete_reason = nullif(reason, ''), status = 'planned', updated_by = (select auth.uid())
   where schedule_event.id = target_schedule_event_id and schedule_event.row_version = expected_row_version and schedule_event.deleted_at is not null
   returning * into updated_row;

  if not found then
    raise exception 'Schedule row version conflict.' using errcode = '40001';
  end if;
  return updated_row;
end;
$$;

alter table public.schedule_events enable row level security;
alter table public.schedule_event_versions enable row level security;
alter table public.schedule_import_batches enable row level security;
alter table public.schedule_state_sync_events enable row level security;
alter table public.schedule_audit_events enable row level security;

revoke all on public.schedule_events from anon, authenticated;
revoke all on public.schedule_event_versions from anon, authenticated;
revoke all on public.schedule_import_batches from anon, authenticated;
revoke all on public.schedule_state_sync_events from anon, authenticated;
revoke all on public.schedule_audit_events from anon, authenticated;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_schedule_staff() to authenticated;
grant execute on function app_private.is_schedule_manager() to authenticated;
grant execute on function app_private.is_schedule_admin() to authenticated;

grant select on public.schedule_events to authenticated;
grant select on public.schedule_event_versions to authenticated;
grant select on public.schedule_import_batches to authenticated;
grant select on public.schedule_audit_events to authenticated;

grant select, insert, update on public.schedule_events to service_role;
grant select, insert on public.schedule_event_versions to service_role;
grant select, insert, update on public.schedule_import_batches to service_role;
grant select, insert, update on public.schedule_state_sync_events to service_role;
grant select, insert on public.schedule_audit_events to service_role;

revoke execute on function app_private.schedule_touch_updated_at_and_row_version() from public, anon, authenticated;
revoke execute on function app_private.schedule_log_event_version() from public, anon, authenticated;
revoke execute on function app_private.schedule_prevent_hard_delete() from public, anon, authenticated;
revoke execute on function app_private.schedule_update_event(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function app_private.schedule_archive_event(uuid, integer, text) from public, anon, authenticated;
revoke execute on function app_private.schedule_restore_event(uuid, integer, text) from public, anon, authenticated;
grant execute on function app_private.schedule_update_event(uuid, integer, jsonb) to service_role;
grant execute on function app_private.schedule_archive_event(uuid, integer, text) to service_role;
grant execute on function app_private.schedule_restore_event(uuid, integer, text) to service_role;

drop policy if exists "schedule events are visible to active team staff" on public.schedule_events;
create policy "schedule events are visible to active team staff" on public.schedule_events for select to authenticated
using (deleted_at is null and status <> 'archived' and app_private.is_schedule_staff() and (app_private.is_squad_team_member(team_id) or app_private.is_schedule_admin()));

drop policy if exists "schedule versions are manager visible" on public.schedule_event_versions;
create policy "schedule versions are manager visible" on public.schedule_event_versions for select to authenticated
using (app_private.is_schedule_manager() and app_private.is_squad_org_member(organization_id));

drop policy if exists "schedule import batches are manager visible" on public.schedule_import_batches;
create policy "schedule import batches are manager visible" on public.schedule_import_batches for select to authenticated
using (app_private.is_schedule_manager() and app_private.is_squad_org_member(organization_id));

drop policy if exists "schedule audit events are admin visible" on public.schedule_audit_events;
create policy "schedule audit events are admin visible" on public.schedule_audit_events for select to authenticated
using (app_private.is_schedule_admin() and (organization_id is null or app_private.is_squad_org_member(organization_id)));
