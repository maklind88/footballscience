-- Football Science Squad Module: database-level data-loss guards.
-- This migration keeps the current app-state rollout intact while preparing
-- Squad for safe database writes: row-version checks, soft deletes, hard-delete
-- prevention, and roster rollback history.

alter table public.squad_players
  add column if not exists row_version integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.squad_roster_memberships
  add column if not exists row_version integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.squad_players
  drop constraint if exists squad_players_row_version_check,
  add constraint squad_players_row_version_check check (row_version > 0),
  drop constraint if exists squad_players_delete_reason_check,
  add constraint squad_players_delete_reason_check check (delete_reason is null or char_length(delete_reason) <= 1200);

alter table public.squad_roster_memberships
  drop constraint if exists squad_roster_memberships_row_version_check,
  add constraint squad_roster_memberships_row_version_check check (row_version > 0),
  drop constraint if exists squad_roster_memberships_delete_reason_check,
  add constraint squad_roster_memberships_delete_reason_check check (delete_reason is null or char_length(delete_reason) <= 1200);

create table if not exists public.squad_roster_membership_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  team_id uuid not null references public.squad_teams(id) on delete restrict,
  season_id uuid not null references public.squad_seasons(id) on delete restrict,
  player_id uuid not null references public.squad_players(id) on delete restrict,
  roster_membership_id uuid not null references public.squad_roster_memberships(id) on delete restrict,
  row_version integer not null check (row_version > 0),
  change_type text not null check (change_type in ('insert', 'update', 'archive', 'restore')),
  changed_fields text[] not null default '{}'::text[],
  before_record jsonb,
  after_record jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists squad_players_active_org_sort_idx
  on public.squad_players (organization_id, sort_name, id)
  where deleted_at is null and status <> 'archived';

create index if not exists squad_roster_active_team_season_idx
  on public.squad_roster_memberships (team_id, season_id, squad_status, role_group, player_id)
  where deleted_at is null and status <> 'archived';

create index if not exists squad_roster_versions_roster_created_idx
  on public.squad_roster_membership_versions (roster_membership_id, created_at desc);

create index if not exists squad_roster_versions_org_created_idx
  on public.squad_roster_membership_versions (organization_id, created_at desc);

create or replace function public.squad_touch_updated_at_and_row_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and to_jsonb(new) is distinct from to_jsonb(old) then
    new.row_version = coalesce(old.row_version, 1) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists squad_players_touch_updated_at on public.squad_players;
create trigger squad_players_touch_updated_at
before update on public.squad_players
for each row execute function public.squad_touch_updated_at_and_row_version();

drop trigger if exists squad_roster_memberships_touch_updated_at on public.squad_roster_memberships;
create trigger squad_roster_memberships_touch_updated_at
before update on public.squad_roster_memberships
for each row execute function public.squad_touch_updated_at_and_row_version();

create or replace function public.squad_log_roster_membership_version()
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
    select coalesce(array_agg(key order by key), '{}'::text[])
    into changed
    from jsonb_object_keys(new_data) as fields(key);

    insert into public.squad_roster_membership_versions (
      organization_id,
      team_id,
      season_id,
      player_id,
      roster_membership_id,
      row_version,
      change_type,
      changed_fields,
      before_record,
      after_record,
      actor_id
    )
    values (
      new.organization_id,
      new.team_id,
      new.season_id,
      new.player_id,
      new.id,
      new.row_version,
      'insert',
      changed,
      null,
      new_data,
      (select auth.uid())
    );

    return new;
  end if;

  old_data := to_jsonb(old);
  select coalesce(array_agg(key order by key), '{}'::text[])
  into changed
  from jsonb_each(new_data) as next_values(key, value)
  where (old_data -> key) is distinct from value
    and key not in ('updated_at', 'row_version');

  if coalesce(array_length(changed, 1), 0) = 0 then
    return new;
  end if;

  next_change_type := case
    when old.deleted_at is null and new.deleted_at is not null then 'archive'
    when old.deleted_at is not null and new.deleted_at is null then 'restore'
    else 'update'
  end;

  insert into public.squad_roster_membership_versions (
    organization_id,
    team_id,
    season_id,
    player_id,
    roster_membership_id,
    row_version,
    change_type,
    changed_fields,
    before_record,
    after_record,
    actor_id
  )
  values (
    new.organization_id,
    new.team_id,
    new.season_id,
    new.player_id,
    new.id,
    new.row_version,
    next_change_type,
    changed,
    old_data,
    new_data,
    (select auth.uid())
  );

  return new;
end;
$$;

drop trigger if exists squad_roster_memberships_log_version on public.squad_roster_memberships;
create trigger squad_roster_memberships_log_version
after insert or update on public.squad_roster_memberships
for each row execute function public.squad_log_roster_membership_version();

create or replace function app_private.squad_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hard delete is disabled for Squad records. Use archive/restore with deleted_at instead.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists squad_players_prevent_hard_delete on public.squad_players;
create trigger squad_players_prevent_hard_delete
before delete on public.squad_players
for each row execute function app_private.squad_prevent_hard_delete();

drop trigger if exists squad_roster_memberships_prevent_hard_delete on public.squad_roster_memberships;
create trigger squad_roster_memberships_prevent_hard_delete
before delete on public.squad_roster_memberships
for each row execute function app_private.squad_prevent_hard_delete();

create or replace function app_private.squad_update_roster_membership(
  target_roster_membership_id uuid,
  expected_row_version integer,
  patch jsonb
)
returns public.squad_roster_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_patch jsonb := coalesce(patch, '{}'::jsonb);
  next_secondary_roles text[];
  updated_row public.squad_roster_memberships;
begin
  if expected_row_version is null or expected_row_version < 1 then
    raise exception 'Missing expected Squad row version.' using errcode = '22023';
  end if;

  if normalized_patch ? 'secondary_roles' then
    if jsonb_typeof(normalized_patch -> 'secondary_roles') <> 'array' then
      raise exception 'Squad secondary_roles patch must be an array.' using errcode = '22023';
    end if;

    select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
    into next_secondary_roles
    from jsonb_array_elements_text(normalized_patch -> 'secondary_roles') with ordinality as roles(role_value, ordinal);
  end if;

  update public.squad_roster_memberships
  set
    shirt_number = case when normalized_patch ? 'shirt_number' then nullif(normalized_patch ->> 'shirt_number', '') else shirt_number end,
    position_label = case when normalized_patch ? 'position_label' then nullif(normalized_patch ->> 'position_label', '') else position_label end,
    primary_role = case when normalized_patch ? 'primary_role' then nullif(normalized_patch ->> 'primary_role', '') else primary_role end,
    secondary_roles = case when normalized_patch ? 'secondary_roles' then next_secondary_roles else secondary_roles end,
    role_group = case when normalized_patch ? 'role_group' then nullif(normalized_patch ->> 'role_group', '') else role_group end,
    preferred_side = case when normalized_patch ? 'preferred_side' then nullif(normalized_patch ->> 'preferred_side', '') else preferred_side end,
    squad_status = case when normalized_patch ? 'squad_status' then coalesce(nullif(normalized_patch ->> 'squad_status', ''), squad_status) else squad_status end,
    availability_status = case when normalized_patch ? 'availability_status' then coalesce(nullif(normalized_patch ->> 'availability_status', ''), availability_status) else availability_status end,
    metadata = case
      when jsonb_typeof(normalized_patch -> 'metadata') = 'object' then metadata || (normalized_patch -> 'metadata')
      else metadata
    end
  where id = target_roster_membership_id
    and row_version = expected_row_version
    and deleted_at is null
  returning * into updated_row;

  if not found then
    raise exception 'Squad row version conflict.' using errcode = '40001';
  end if;

  return updated_row;
end;
$$;

create or replace function app_private.squad_archive_roster_membership(
  target_roster_membership_id uuid,
  expected_row_version integer,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  archived_id uuid;
begin
  if expected_row_version is null or expected_row_version < 1 then
    raise exception 'Missing expected Squad row version.' using errcode = '22023';
  end if;

  update public.squad_roster_memberships
  set
    status = 'archived',
    deleted_at = now(),
    deleted_by = (select auth.uid()),
    delete_reason = nullif(reason, '')
  where id = target_roster_membership_id
    and row_version = expected_row_version
    and deleted_at is null
  returning id into archived_id;

  if not found then
    raise exception 'Squad row version conflict.' using errcode = '40001';
  end if;

  return archived_id;
end;
$$;

create or replace function app_private.squad_restore_roster_membership(
  target_roster_membership_id uuid,
  expected_row_version integer,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restored_id uuid;
begin
  if expected_row_version is null or expected_row_version < 1 then
    raise exception 'Missing expected Squad row version.' using errcode = '22023';
  end if;

  update public.squad_roster_memberships
  set
    status = 'active',
    deleted_at = null,
    deleted_by = null,
    delete_reason = null,
    metadata = case
      when nullif(reason, '') is null then metadata
      else metadata || jsonb_build_object('restoreReason', reason)
    end
  where id = target_roster_membership_id
    and row_version = expected_row_version
    and deleted_at is not null
  returning id into restored_id;

  if not found then
    raise exception 'Squad row version conflict.' using errcode = '40001';
  end if;

  return restored_id;
end;
$$;

alter table public.squad_roster_membership_versions enable row level security;

revoke all on public.squad_roster_membership_versions from anon, authenticated;
grant select on public.squad_roster_membership_versions to authenticated;
grant select, insert on public.squad_roster_membership_versions to service_role;
grant select, insert, update on public.squad_players, public.squad_roster_memberships to service_role;

revoke execute on function public.squad_touch_updated_at_and_row_version() from public, anon, authenticated;
revoke execute on function public.squad_log_roster_membership_version() from public, anon, authenticated;
revoke execute on function app_private.squad_prevent_hard_delete() from public, anon, authenticated;
revoke execute on function app_private.squad_update_roster_membership(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function app_private.squad_archive_roster_membership(uuid, integer, text) from public, anon, authenticated;
revoke execute on function app_private.squad_restore_roster_membership(uuid, integer, text) from public, anon, authenticated;
grant execute on function app_private.squad_update_roster_membership(uuid, integer, jsonb) to service_role;
grant execute on function app_private.squad_archive_roster_membership(uuid, integer, text) to service_role;
grant execute on function app_private.squad_restore_roster_membership(uuid, integer, text) to service_role;

drop policy if exists "squad roster versions are manager visible" on public.squad_roster_membership_versions;
create policy "squad roster versions are manager visible"
on public.squad_roster_membership_versions
for select
to authenticated
using (
  app_private.is_squad_manager()
  and app_private.is_squad_org_member(organization_id)
);
