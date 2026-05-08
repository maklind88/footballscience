-- Football Science Squad Module: multi-tenant foundation.
-- The current UI remains app-state compatible while this schema becomes the
-- durable source for organizations, clubs, teams, seasons, global players, and
-- team roster memberships.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pgcrypto set schema extensions;
alter extension pg_trgm set schema extensions;

create schema if not exists app_private;

create or replace function app_private.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

create or replace function app_private.is_squad_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_squad_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach');
$$;

create or replace function app_private.is_squad_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() = 'admin';
$$;

create table if not exists public.squad_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 140),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_clubs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 140),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, slug)
);

create table if not exists public.squad_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  club_id uuid references public.squad_clubs(id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 140),
  sport text not null default 'football' check (char_length(sport) <= 80),
  age_group text check (age_group is null or char_length(age_group) <= 80),
  gender text check (gender is null or gender in ('women', 'men', 'girls', 'boys', 'mixed', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, slug)
);

create table if not exists public.squad_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('planned', 'active', 'closed', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, label),
  constraint squad_seasons_date_range_check check (
    starts_on is null or ends_on is null or starts_on <= ends_on
  )
);

create table if not exists public.squad_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  club_id uuid references public.squad_clubs(id) on delete cascade,
  team_id uuid references public.squad_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'coach', 'analyst', 'performance', 'medical')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  scope text not null default 'team' check (scope in ('organization', 'club', 'team')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint squad_staff_memberships_scope_target_check check (
    (scope = 'organization' and club_id is null and team_id is null)
    or (scope = 'club' and club_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);

create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 180),
  sort_name text not null check (char_length(sort_name) between 1 and 180),
  date_of_birth date,
  gender text check (gender is null or gender in ('women', 'men', 'girls', 'boys', 'mixed', 'other')),
  nationality text check (nationality is null or char_length(nationality) <= 80),
  preferred_foot text check (preferred_foot is null or preferred_foot in ('left', 'right', 'both', 'unknown')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_player_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  provider text not null check (char_length(provider) between 2 and 80),
  external_id text not null check (char_length(external_id) between 1 and 160),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, provider, external_id),
  unique (player_id, provider, external_id)
);

create table if not exists public.squad_roster_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  club_id uuid references public.squad_clubs(id) on delete set null,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid not null references public.squad_seasons(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  shirt_number text check (shirt_number is null or char_length(shirt_number) <= 12),
  position_label text check (position_label is null or char_length(position_label) <= 80),
  primary_role text check (primary_role is null or char_length(primary_role) <= 24),
  secondary_roles text[] not null default '{}'::text[],
  role_group text check (role_group is null or role_group in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  preferred_side text check (preferred_side is null or preferred_side in ('left', 'center', 'right', 'both')),
  squad_status text not null default 'squad' check (squad_status in ('key', 'important', 'rotation', 'squad', 'depth', 'development', 'academy', 'trial', 'loan')),
  availability_status text not null default 'available' check (availability_status in ('available', 'managed', 'rehab', 'unavailable', 'loan', 'unknown')),
  joined_on date,
  left_on date,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, season_id, player_id),
  constraint squad_roster_memberships_dates_check check (
    joined_on is null or left_on is null or joined_on <= left_on
  )
);

create table if not exists public.squad_player_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'import', 'integration', 'system')),
  profile jsonb not null default '{}'::jsonb,
  completeness_score integer not null default 0 check (completeness_score between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_player_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  event_type text not null check (event_type in ('joined', 'left', 'role_changed', 'squad_status_changed', 'availability_changed', 'profile_updated')),
  previous_value text,
  next_value text,
  effective_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 1200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_player_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  visibility text not null default 'staff' check (visibility in ('staff', 'coach', 'medical', 'private')),
  body text not null check (char_length(body) <= 4000),
  body_format text not null default 'plain' check (body_format in ('plain')),
  author_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_player_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  kind text not null default 'profile_image' check (kind in ('profile_image', 'document', 'video', 'other')),
  storage_bucket text not null check (char_length(storage_bucket) <= 120),
  storage_path text not null check (char_length(storage_path) <= 900),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  byte_size bigint check (byte_size is null or byte_size between 0 and 104857600),
  status text not null default 'ready' check (status in ('pending', 'ready', 'blocked', 'deleted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, storage_bucket, storage_path)
);

create table if not exists public.squad_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_id uuid references public.squad_seasons(id) on delete set null,
  source text not null default 'csv' check (source in ('csv', 'json', 'integration', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'validated', 'applied', 'failed', 'rolled_back')),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  error_report jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete cascade,
  club_id uuid references public.squad_clubs(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  season_id uuid references public.squad_seasons(id) on delete set null,
  player_id uuid references public.squad_players(id) on delete set null,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  actor_id uuid references auth.users(id) on delete set null,
  destructive boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists squad_clubs_org_status_idx on public.squad_clubs (organization_id, status, updated_at desc);
create index if not exists squad_teams_org_club_status_idx on public.squad_teams (organization_id, club_id, status, updated_at desc);
create index if not exists squad_seasons_team_status_idx on public.squad_seasons (team_id, status, starts_on desc);
create index if not exists squad_staff_memberships_user_idx on public.squad_staff_memberships (user_id, status, organization_id, team_id);
create index if not exists squad_staff_memberships_team_role_idx on public.squad_staff_memberships (organization_id, team_id, role, status);
create unique index if not exists squad_staff_org_user_unique_idx on public.squad_staff_memberships (organization_id, user_id) where scope = 'organization';
create unique index if not exists squad_staff_club_user_unique_idx on public.squad_staff_memberships (organization_id, club_id, user_id) where scope = 'club';
create unique index if not exists squad_staff_team_user_unique_idx on public.squad_staff_memberships (organization_id, team_id, user_id) where scope = 'team';
create index if not exists squad_players_org_status_sort_idx on public.squad_players (organization_id, status, sort_name, id);
create index if not exists squad_players_display_name_trgm_idx on public.squad_players using gin (lower(display_name) extensions.gin_trgm_ops);
create index if not exists squad_player_external_ids_player_idx on public.squad_player_external_ids (player_id, provider);
create index if not exists squad_roster_team_season_status_idx on public.squad_roster_memberships (team_id, season_id, status, squad_status, player_id) include (shirt_number, primary_role, availability_status);
create index if not exists squad_roster_team_season_role_idx on public.squad_roster_memberships (team_id, season_id, role_group, primary_role, status);
create index if not exists squad_roster_org_role_idx on public.squad_roster_memberships (organization_id, role_group, primary_role, status);
create index if not exists squad_roster_player_idx on public.squad_roster_memberships (player_id, status, season_id);
create index if not exists squad_profile_snapshots_player_created_idx on public.squad_player_profile_snapshots (player_id, created_at desc);
create index if not exists squad_status_events_player_effective_idx on public.squad_player_status_events (player_id, effective_at desc);
create index if not exists squad_notes_player_created_idx on public.squad_player_notes (player_id, created_at desc) where archived_at is null;
create index if not exists squad_notes_author_created_idx on public.squad_player_notes (author_id, created_at desc);
create index if not exists squad_media_player_kind_idx on public.squad_player_media (player_id, kind, status);
create index if not exists squad_import_batches_org_created_idx on public.squad_import_batches (organization_id, created_at desc);
create index if not exists squad_audit_events_org_created_idx on public.squad_audit_events (organization_id, created_at desc);
create index if not exists squad_audit_events_player_created_idx on public.squad_audit_events (player_id, created_at desc);

create or replace function app_private.is_squad_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.is_squad_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_manage_squad_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.squad_staff_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach')
  );
$$;

create or replace function app_private.can_view_squad_note(
  target_organization_id uuid,
  target_roster_membership_id uuid,
  target_visibility text,
  target_author_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app_private.is_squad_staff()
    and app_private.is_squad_org_member(target_organization_id)
    and (
      target_visibility in ('staff', 'coach')
      or (target_visibility = 'medical' and app_private.current_app_role() in ('admin', 'medical', 'performance'))
      or (target_visibility = 'private' and (target_author_id = (select auth.uid()) or app_private.is_squad_admin()))
    )
    and (
      target_roster_membership_id is null
      or exists (
        select 1
        from public.squad_roster_memberships roster
        where roster.id = target_roster_membership_id
          and app_private.is_squad_team_member(roster.team_id)
      )
      or app_private.is_squad_admin()
    );
$$;

create or replace function public.squad_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger squad_organizations_touch_updated_at
before update on public.squad_organizations
for each row execute function public.squad_touch_updated_at();

create trigger squad_clubs_touch_updated_at
before update on public.squad_clubs
for each row execute function public.squad_touch_updated_at();

create trigger squad_teams_touch_updated_at
before update on public.squad_teams
for each row execute function public.squad_touch_updated_at();

create trigger squad_seasons_touch_updated_at
before update on public.squad_seasons
for each row execute function public.squad_touch_updated_at();

create trigger squad_staff_memberships_touch_updated_at
before update on public.squad_staff_memberships
for each row execute function public.squad_touch_updated_at();

create trigger squad_players_touch_updated_at
before update on public.squad_players
for each row execute function public.squad_touch_updated_at();

create trigger squad_roster_memberships_touch_updated_at
before update on public.squad_roster_memberships
for each row execute function public.squad_touch_updated_at();

create trigger squad_player_notes_touch_updated_at
before update on public.squad_player_notes
for each row execute function public.squad_touch_updated_at();

create trigger squad_player_media_touch_updated_at
before update on public.squad_player_media
for each row execute function public.squad_touch_updated_at();

alter table public.squad_organizations enable row level security;
alter table public.squad_clubs enable row level security;
alter table public.squad_teams enable row level security;
alter table public.squad_seasons enable row level security;
alter table public.squad_staff_memberships enable row level security;
alter table public.squad_players enable row level security;
alter table public.squad_player_external_ids enable row level security;
alter table public.squad_roster_memberships enable row level security;
alter table public.squad_player_profile_snapshots enable row level security;
alter table public.squad_player_status_events enable row level security;
alter table public.squad_player_notes enable row level security;
alter table public.squad_player_media enable row level security;
alter table public.squad_import_batches enable row level security;
alter table public.squad_audit_events enable row level security;

revoke all on public.squad_organizations from anon, authenticated;
revoke all on public.squad_clubs from anon, authenticated;
revoke all on public.squad_teams from anon, authenticated;
revoke all on public.squad_seasons from anon, authenticated;
revoke all on public.squad_staff_memberships from anon, authenticated;
revoke all on public.squad_players from anon, authenticated;
revoke all on public.squad_player_external_ids from anon, authenticated;
revoke all on public.squad_roster_memberships from anon, authenticated;
revoke all on public.squad_player_profile_snapshots from anon, authenticated;
revoke all on public.squad_player_status_events from anon, authenticated;
revoke all on public.squad_player_notes from anon, authenticated;
revoke all on public.squad_player_media from anon, authenticated;
revoke all on public.squad_import_batches from anon, authenticated;
revoke all on public.squad_audit_events from anon, authenticated;

grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

grant select on public.squad_organizations to authenticated;
grant select on public.squad_clubs to authenticated;
grant select on public.squad_teams to authenticated;
grant select on public.squad_seasons to authenticated;
grant select on public.squad_staff_memberships to authenticated;
grant select on public.squad_players to authenticated;
grant select on public.squad_player_external_ids to authenticated;
grant select on public.squad_roster_memberships to authenticated;
grant select on public.squad_player_profile_snapshots to authenticated;
grant select on public.squad_player_status_events to authenticated;
grant select on public.squad_player_notes to authenticated;
grant select on public.squad_player_media to authenticated;
grant select on public.squad_import_batches to authenticated;
grant select on public.squad_audit_events to authenticated;

create policy "squad organizations are visible to active staff members"
on public.squad_organizations
for select
to authenticated
using (
  app_private.is_squad_staff()
  and status = 'active'
  and app_private.is_squad_org_member(id)
);

create policy "squad clubs are visible to active organization staff"
on public.squad_clubs
for select
to authenticated
using (
  status = 'active'
  and app_private.is_squad_org_member(organization_id)
);

create policy "squad teams are visible to active team staff"
on public.squad_teams
for select
to authenticated
using (
  status = 'active'
  and (
    app_private.is_squad_team_member(id)
    or app_private.is_squad_admin()
  )
);

create policy "squad seasons are visible to active team staff"
on public.squad_seasons
for select
to authenticated
using (
  app_private.is_squad_team_member(team_id)
  or app_private.is_squad_admin()
);

create policy "squad staff memberships are visible to self or team managers"
on public.squad_staff_memberships
for select
to authenticated
using (
  app_private.is_squad_staff()
  and status = 'active'
  and (
    user_id = (select auth.uid())
    or app_private.can_manage_squad_team(team_id)
    or app_private.is_squad_admin()
  )
);

create policy "squad players are visible to organization staff"
on public.squad_players
for select
to authenticated
using (
  status <> 'archived'
  and app_private.is_squad_org_member(organization_id)
);

create policy "squad external ids are visible with the player"
on public.squad_player_external_ids
for select
to authenticated
using (
  app_private.is_squad_org_member(organization_id)
);

create policy "squad roster memberships are visible to team staff"
on public.squad_roster_memberships
for select
to authenticated
using (
  status <> 'archived'
  and (
    app_private.is_squad_team_member(team_id)
    or app_private.is_squad_admin()
  )
);

create policy "squad profile snapshots are visible to organization staff"
on public.squad_player_profile_snapshots
for select
to authenticated
using (
  app_private.is_squad_org_member(organization_id)
);

create policy "squad player status events are visible to organization staff"
on public.squad_player_status_events
for select
to authenticated
using (
  app_private.is_squad_org_member(organization_id)
);

create policy "squad player notes respect visibility"
on public.squad_player_notes
for select
to authenticated
using (
  archived_at is null
  and app_private.can_view_squad_note(organization_id, roster_membership_id, visibility, author_id)
);

create policy "squad player media is visible with the player"
on public.squad_player_media
for select
to authenticated
using (
  status = 'ready'
  and app_private.is_squad_org_member(organization_id)
);

create policy "squad import batches are manager visible"
on public.squad_import_batches
for select
to authenticated
using (
  app_private.is_squad_manager()
  and app_private.is_squad_org_member(organization_id)
);

create policy "squad audit events are admin visible"
on public.squad_audit_events
for select
to authenticated
using (
  app_private.is_squad_admin()
  and (
    organization_id is null
    or app_private.is_squad_org_member(organization_id)
  )
);
