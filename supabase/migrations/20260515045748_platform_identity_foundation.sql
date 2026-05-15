-- Football Science Platform Identity Foundation.
-- Canonical multi-tenant organizations, clubs, teams, user profiles, and
-- memberships. This is additive: existing app-state, squad_*, and chat_*
-- paths remain active until each module is migrated through shadow/dual-read.

create schema if not exists app_private;
create extension if not exists pgcrypto;

create table if not exists public.platform_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.platform_clubs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 160),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, slug)
);

create table if not exists public.platform_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  club_id uuid references public.platform_clubs(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 160),
  sport text not null default 'football' check (char_length(sport) <= 80),
  age_group text check (age_group is null or char_length(age_group) <= 80),
  gender text check (gender is null or gender in ('women', 'men', 'girls', 'boys', 'mixed', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, slug)
);

create table if not exists public.platform_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_organization_id uuid references public.platform_organizations(id) on delete set null,
  primary_club_id uuid references public.platform_clubs(id) on delete set null,
  primary_team_id uuid references public.platform_teams(id) on delete set null,
  display_name text check (display_name is null or char_length(display_name) <= 180),
  first_name text check (first_name is null or char_length(first_name) <= 120),
  last_name text check (last_name is null or char_length(last_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  title text check (title is null or char_length(title) <= 160),
  department text check (department is null or char_length(department) <= 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 900),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.platform_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  club_id uuid references public.platform_clubs(id) on delete restrict,
  team_id uuid references public.platform_teams(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest')),
  scope text not null check (scope in ('organization', 'club', 'team')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  relationship text not null default 'staff' check (relationship in ('staff', 'contractor', 'external', 'guest')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_memberships_scope_target_check check (
    (scope = 'organization' and club_id is null and team_id is null)
    or (scope = 'club' and club_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);

create table if not exists public.platform_tenant_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  club_id uuid references public.platform_clubs(id) on delete restrict,
  team_id uuid references public.platform_teams(id) on delete restrict,
  module_id text not null check (module_id ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  module_table text not null check (module_table ~ '^[a-z][a-z0-9_]{1,80}$'),
  module_record_id uuid not null,
  scope text not null check (scope in ('organization', 'club', 'team')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (module_id, module_table, module_record_id),
  constraint platform_tenant_links_scope_target_check check (
    (scope = 'organization' and club_id is null and team_id is null)
    or (scope = 'club' and club_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);

create table if not exists public.platform_module_migration_checkpoints (
  module_id text not null check (module_id ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  source_storage_key text not null check (char_length(source_storage_key) between 3 and 180),
  target_table text not null check (target_table ~ '^[a-z][a-z0-9_]{1,80}$'),
  phase text not null default 'planned' check (phase in ('planned', 'shadow', 'dual-write', 'dual-read', 'database-primary', 'retired')),
  reads_from_database boolean not null default false,
  writes_to_database boolean not null default false,
  app_state_fallback_enabled boolean not null default true,
  last_verified_at timestamptz,
  verification_summary jsonb not null default '{}'::jsonb,
  owner text not null default 'platform' check (char_length(owner) <= 120),
  notes text not null default '' check (char_length(notes) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (module_id, source_storage_key, target_table)
);

create table if not exists public.platform_membership_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  club_id uuid references public.platform_clubs(id) on delete set null,
  team_id uuid references public.platform_teams(id) on delete set null,
  membership_id uuid references public.platform_memberships(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  before_record jsonb,
  after_record jsonb not null default '{}'::jsonb,
  changed_fields text[] not null default '{}'::text[],
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_organizations_status_slug_idx on public.platform_organizations (status, slug) where deleted_at is null;
create index if not exists platform_clubs_org_status_slug_idx on public.platform_clubs (organization_id, status, slug) where deleted_at is null;
create index if not exists platform_teams_org_status_slug_idx on public.platform_teams (organization_id, status, slug) where deleted_at is null;
create index if not exists platform_teams_club_status_idx on public.platform_teams (club_id, status, name) where deleted_at is null and club_id is not null;
create index if not exists platform_user_profiles_org_idx on public.platform_user_profiles (primary_organization_id, status, updated_at desc) where deleted_at is null;
create index if not exists platform_memberships_user_status_idx on public.platform_memberships (user_id, status, organization_id, club_id, team_id) where deleted_at is null;
create index if not exists platform_memberships_org_role_idx on public.platform_memberships (organization_id, role, status, updated_at desc) where deleted_at is null;
create index if not exists platform_memberships_club_role_idx on public.platform_memberships (club_id, role, status, updated_at desc) where deleted_at is null and club_id is not null;
create index if not exists platform_memberships_team_role_idx on public.platform_memberships (team_id, role, status, updated_at desc) where deleted_at is null and team_id is not null;
create unique index if not exists platform_memberships_active_org_user_role_idx on public.platform_memberships (organization_id, user_id, role) where scope = 'organization' and status = 'active' and deleted_at is null;
create unique index if not exists platform_memberships_active_club_user_role_idx on public.platform_memberships (club_id, user_id, role) where scope = 'club' and status = 'active' and deleted_at is null;
create unique index if not exists platform_memberships_active_team_user_role_idx on public.platform_memberships (team_id, user_id, role) where scope = 'team' and status = 'active' and deleted_at is null;
create index if not exists platform_tenant_links_platform_idx on public.platform_tenant_links (organization_id, club_id, team_id, module_id);
create index if not exists platform_module_migration_phase_idx on public.platform_module_migration_checkpoints (phase, module_id);
create index if not exists platform_membership_events_org_created_idx on public.platform_membership_events (organization_id, created_at desc);
create index if not exists platform_membership_events_target_created_idx on public.platform_membership_events (target_user_id, created_at desc);

create or replace function app_private.current_platform_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

create or replace function app_private.is_platform_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_platform_role() = 'admin'
    or exists (
      select 1
      from public.platform_memberships membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.deleted_at is null
    );
$$;

create or replace function app_private.is_platform_club_member(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_platform_role() = 'admin'
    or exists (
      select 1
      from public.platform_memberships membership
      where membership.club_id = target_club_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.deleted_at is null
    )
    or exists (
      select 1
      from public.platform_clubs club
      where club.id = target_club_id
        and app_private.is_platform_org_member(club.organization_id)
    );
$$;

create or replace function app_private.is_platform_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_platform_role() = 'admin'
    or exists (
      select 1
      from public.platform_memberships membership
      where membership.team_id = target_team_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.deleted_at is null
    )
    or exists (
      select 1
      from public.platform_teams team
      where team.id = target_team_id
        and (
          app_private.is_platform_club_member(team.club_id)
          or app_private.is_platform_org_member(team.organization_id)
        )
    );
$$;

create or replace function app_private.can_manage_platform_scope(
  target_organization_id uuid,
  target_club_id uuid default null,
  target_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_platform_role() = 'admin'
    or exists (
      select 1
      from public.platform_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.deleted_at is null
        and (
          (membership.scope = 'organization' and membership.organization_id = target_organization_id and membership.role = 'admin')
          or (target_club_id is not null and membership.scope = 'club' and membership.club_id = target_club_id and membership.role in ('admin', 'club-admin'))
          or (target_team_id is not null and membership.scope = 'team' and membership.team_id = target_team_id and membership.role in ('admin', 'club-admin', 'team-admin'))
        )
    );
$$;

create or replace function app_private.platform_touch_updated_at_and_row_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.row_version = coalesce(old.row_version, 1) + 1;
  if new.updated_by is null then
    new.updated_by = (select auth.uid());
  end if;
  return new;
end;
$$;

create or replace function app_private.platform_log_membership_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_data jsonb := to_jsonb(new);
  changed text[] := '{}'::text[];
  item record;
begin
  if tg_op = 'UPDATE' then
    for item in select key, value from jsonb_each(new_data)
    loop
      if old_data -> item.key is distinct from item.value and item.key not in ('updated_at', 'row_version') then
        changed := array_append(changed, item.key);
      end if;
    end loop;
  else
    changed := array['insert'];
  end if;

  insert into public.platform_membership_events (
    organization_id,
    club_id,
    team_id,
    membership_id,
    target_user_id,
    action,
    before_record,
    after_record,
    changed_fields,
    actor_id
  )
  values (
    new.organization_id,
    new.club_id,
    new.team_id,
    new.id,
    new.user_id,
    case when tg_op = 'INSERT' then 'platform.membership.insert' else 'platform.membership.update' end,
    old_data,
    new_data,
    changed,
    (select auth.uid())
  );

  return new;
end;
$$;

create or replace function app_private.platform_prevent_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hard delete is disabled for Platform Identity records. Use status/deleted_at archive fields instead.' using errcode = 'P0001';
end;
$$;

drop trigger if exists platform_organizations_touch_updated_at on public.platform_organizations;
create trigger platform_organizations_touch_updated_at before update on public.platform_organizations for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_clubs_touch_updated_at on public.platform_clubs;
create trigger platform_clubs_touch_updated_at before update on public.platform_clubs for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_teams_touch_updated_at on public.platform_teams;
create trigger platform_teams_touch_updated_at before update on public.platform_teams for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_user_profiles_touch_updated_at on public.platform_user_profiles;
create trigger platform_user_profiles_touch_updated_at before update on public.platform_user_profiles for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_memberships_touch_updated_at on public.platform_memberships;
create trigger platform_memberships_touch_updated_at before update on public.platform_memberships for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_memberships_log_event on public.platform_memberships;
create trigger platform_memberships_log_event after insert or update on public.platform_memberships for each row execute function app_private.platform_log_membership_event();

drop trigger if exists platform_organizations_prevent_hard_delete on public.platform_organizations;
create trigger platform_organizations_prevent_hard_delete before delete on public.platform_organizations for each row execute function app_private.platform_prevent_hard_delete();

drop trigger if exists platform_clubs_prevent_hard_delete on public.platform_clubs;
create trigger platform_clubs_prevent_hard_delete before delete on public.platform_clubs for each row execute function app_private.platform_prevent_hard_delete();

drop trigger if exists platform_teams_prevent_hard_delete on public.platform_teams;
create trigger platform_teams_prevent_hard_delete before delete on public.platform_teams for each row execute function app_private.platform_prevent_hard_delete();

drop trigger if exists platform_user_profiles_prevent_hard_delete on public.platform_user_profiles;
create trigger platform_user_profiles_prevent_hard_delete before delete on public.platform_user_profiles for each row execute function app_private.platform_prevent_hard_delete();

drop trigger if exists platform_memberships_prevent_hard_delete on public.platform_memberships;
create trigger platform_memberships_prevent_hard_delete before delete on public.platform_memberships for each row execute function app_private.platform_prevent_hard_delete();

alter table public.platform_organizations enable row level security;
alter table public.platform_clubs enable row level security;
alter table public.platform_teams enable row level security;
alter table public.platform_user_profiles enable row level security;
alter table public.platform_memberships enable row level security;
alter table public.platform_tenant_links enable row level security;
alter table public.platform_module_migration_checkpoints enable row level security;
alter table public.platform_membership_events enable row level security;

revoke all on public.platform_organizations from anon, authenticated;
revoke all on public.platform_clubs from anon, authenticated;
revoke all on public.platform_teams from anon, authenticated;
revoke all on public.platform_user_profiles from anon, authenticated;
revoke all on public.platform_memberships from anon, authenticated;
revoke all on public.platform_tenant_links from anon, authenticated;
revoke all on public.platform_module_migration_checkpoints from anon, authenticated;
revoke all on public.platform_membership_events from anon, authenticated;

grant select on public.platform_organizations to authenticated;
grant select on public.platform_clubs to authenticated;
grant select on public.platform_teams to authenticated;
grant select on public.platform_user_profiles to authenticated;
grant select on public.platform_memberships to authenticated;
grant select on public.platform_tenant_links to authenticated;
grant select on public.platform_module_migration_checkpoints to authenticated;
grant select on public.platform_membership_events to authenticated;

drop policy if exists "platform organizations are visible to active members" on public.platform_organizations;
create policy "platform organizations are visible to active members"
on public.platform_organizations
for select
to authenticated
using (
  deleted_at is null
  and status <> 'archived'
  and app_private.is_platform_org_member(id)
);

drop policy if exists "platform clubs are visible to active members" on public.platform_clubs;
create policy "platform clubs are visible to active members"
on public.platform_clubs
for select
to authenticated
using (
  deleted_at is null
  and status <> 'archived'
  and app_private.is_platform_org_member(organization_id)
);

drop policy if exists "platform teams are visible to active members" on public.platform_teams;
create policy "platform teams are visible to active members"
on public.platform_teams
for select
to authenticated
using (
  deleted_at is null
  and status <> 'archived'
  and (
    app_private.is_platform_org_member(organization_id)
    or app_private.is_platform_team_member(id)
  )
);

drop policy if exists "platform user profiles are visible to self and tenant managers" on public.platform_user_profiles;
create policy "platform user profiles are visible to self and tenant managers"
on public.platform_user_profiles
for select
to authenticated
using (
  deleted_at is null
  and (
    user_id = (select auth.uid())
    or (
      primary_organization_id is not null
      and app_private.can_manage_platform_scope(primary_organization_id, primary_club_id, primary_team_id)
    )
  )
);

drop policy if exists "platform memberships are visible to self and tenant managers" on public.platform_memberships;
create policy "platform memberships are visible to self and tenant managers"
on public.platform_memberships
for select
to authenticated
using (
  deleted_at is null
  and (
    user_id = (select auth.uid())
    or app_private.can_manage_platform_scope(organization_id, club_id, team_id)
  )
);

drop policy if exists "platform tenant links are visible to tenant managers" on public.platform_tenant_links;
create policy "platform tenant links are visible to tenant managers"
on public.platform_tenant_links
for select
to authenticated
using (
  status = 'active'
  and app_private.can_manage_platform_scope(organization_id, club_id, team_id)
);

drop policy if exists "platform migration checkpoints are admin visible" on public.platform_module_migration_checkpoints;
create policy "platform migration checkpoints are admin visible"
on public.platform_module_migration_checkpoints
for select
to authenticated
using (app_private.current_platform_role() = 'admin');

drop policy if exists "platform membership events are visible to tenant managers" on public.platform_membership_events;
create policy "platform membership events are visible to tenant managers"
on public.platform_membership_events
for select
to authenticated
using (
  target_user_id = (select auth.uid())
  or app_private.can_manage_platform_scope(organization_id, club_id, team_id)
);

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('platform-identity', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical','guest'], 'organization', true, false, 'Read own tenant identity, profile, and membership scope.'),
  ('platform-identity', 'write', array['admin','club-admin','team-admin'], 'organization', true, false, 'Manage platform organizations, clubs, teams, profiles, and memberships through server APIs.'),
  ('platform-identity', 'delete', array['admin'], 'organization', true, false, 'Archive platform identity records; hard delete remains disabled.'),
  ('platform-identity', 'export', array['admin'], 'organization', true, false, 'Export tenant identity records.'),
  ('platform-identity', 'restore', array['admin'], 'organization', true, false, 'Restore tenant identity records from audited backups.'),
  ('platform-identity', 'admin', array['admin'], 'organization', true, false, 'Administer global platform identity and tenant links.'),
  ('platform-identity', 'observe', array['admin'], 'organization', true, false, 'Observe platform identity migration health.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();

insert into public.platform_module_migration_checkpoints
  (module_id, source_storage_key, target_table, phase, owner, notes)
values
  ('home', 'football-dashboard-tasks-v1', 'tasks', 'planned', 'platform', 'Migrate after platform identity and server-owned task APIs are ready.'),
  ('chat', 'football-dashboard-chat-v1', 'chat_messages', 'shadow', 'platform', 'Chat schema exists; next step is server-first adapter and app-state fallback comparison.'),
  ('schedule', 'football-schedule-v1', 'schedule_events', 'shadow', 'platform', 'Schedule schema exists; keep app-state source of truth until dual-write checks pass.'),
  ('exercise-library', 'football-session-exercise-library-v1', 'exercises', 'planned', 'platform', 'Preserve every existing exercise; migrate with append/merge and snapshots.'),
  ('session-planner', 'football-session-planner-v3', 'sessions', 'planned', 'platform', 'Migrate after exercise library and block-level row-version APIs exist.'),
  ('periodization', 'football-periodization-v2', 'periodization_days', 'planned', 'platform', 'Migrate after schedule/session foundations are proven.'),
  ('medical-team', 'football-medical-team-v1', 'medical_availability_recommendations', 'planned', 'platform', 'Keep coach-safe/private split and RLS before any database-primary switch.'),
  ('player-profiles', 'football-player-profiles-v1', 'squad_players', 'shadow', 'platform', 'Squad schema exists; app-state remains fallback until server reads and restore drill are proven.'),
  ('scouting', 'football-scouting-v1', 'scouting_players', 'shadow', 'platform', 'Scouting database schema exists; next step is server-first search and import pipeline.'),
  ('game-simulator', 'football-simulator-sequence-v1', 'simulator_sequences', 'planned', 'platform', 'Migrate large sequence payloads last.')
on conflict (module_id, source_storage_key, target_table) do update
set
  phase = excluded.phase,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();
