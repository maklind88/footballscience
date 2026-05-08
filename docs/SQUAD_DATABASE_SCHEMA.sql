-- Readable reference for the standalone Squad database.
-- Source of truth: supabase/migrations/20260507185637_squad_module_multitenant.sql
-- Keep this compact: it is for product and architecture discussions, not deployment.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.squad_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_clubs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  country_code text,
  status text not null default 'active',
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
  slug text not null,
  name text not null,
  sport text not null default 'football',
  age_group text,
  gender text,
  status text not null default 'active',
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
  label text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, label)
);

create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  display_name text not null,
  sort_name text not null,
  date_of_birth date,
  gender text,
  nationality text,
  preferred_foot text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_roster_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  club_id uuid references public.squad_clubs(id) on delete set null,
  team_id uuid not null references public.squad_teams(id) on delete cascade,
  season_id uuid not null references public.squad_seasons(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  shirt_number text,
  position_label text,
  primary_role text,
  secondary_roles text[] not null default '{}'::text[],
  role_group text,
  preferred_side text,
  squad_status text not null default 'squad',
  availability_status text not null default 'available',
  joined_on date,
  left_on date,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, season_id, player_id)
);

create table if not exists public.squad_player_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, provider, external_id)
);

create table if not exists public.squad_player_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  source text not null default 'manual',
  profile jsonb not null default '{}'::jsonb,
  completeness_score integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_player_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  event_type text not null,
  previous_value text,
  next_value text,
  effective_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.squad_player_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.squad_organizations(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  roster_membership_id uuid references public.squad_roster_memberships(id) on delete set null,
  visibility text not null default 'staff',
  body text not null,
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
  kind text not null default 'profile_image',
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  status text not null default 'ready',
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
  source text not null default 'csv',
  status text not null default 'pending',
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
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
  action text not null,
  severity text not null default 'info',
  actor_id uuid references auth.users(id) on delete set null,
  destructive boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists squad_players_org_status_sort_idx on public.squad_players (organization_id, status, sort_name, id);
create index if not exists squad_players_display_name_trgm_idx on public.squad_players using gin (lower(display_name) gin_trgm_ops);
create index if not exists squad_roster_team_season_status_idx on public.squad_roster_memberships (team_id, season_id, status, squad_status, player_id);
create index if not exists squad_roster_team_season_role_idx on public.squad_roster_memberships (team_id, season_id, role_group, primary_role, status);
create index if not exists squad_import_batches_org_created_idx on public.squad_import_batches (organization_id, created_at desc);
create index if not exists squad_audit_events_org_created_idx on public.squad_audit_events (organization_id, created_at desc);

alter table public.squad_organizations enable row level security;
alter table public.squad_clubs enable row level security;
alter table public.squad_teams enable row level security;
alter table public.squad_seasons enable row level security;
alter table public.squad_staff_memberships enable row level security;
alter table public.squad_players enable row level security;
alter table public.squad_roster_memberships enable row level security;
alter table public.squad_player_notes enable row level security;
alter table public.squad_audit_events enable row level security;

-- Authorization data must come from app_metadata, not user_metadata.
-- Direct authenticated writes are intentionally not granted in the first rollout.
