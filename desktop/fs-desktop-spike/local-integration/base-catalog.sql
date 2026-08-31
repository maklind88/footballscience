-- Disposable synthetic catalog only. This is not a production/staging dump.
create schema if not exists auth;
create schema if not exists app_private;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table auth.users (
  id uuid primary key,
  email text not null unique
);

create table public.platform_organizations (
  id uuid primary key,
  name text not null
);

create table public.platform_teams (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  status text not null check (status in ('active', 'paused')),
  deleted_at timestamptz
);

create table public.platform_memberships (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid references public.platform_teams(id) on delete restrict,
  role text not null,
  scope text not null check (scope in ('organization', 'team')),
  status text not null check (status in ('active', 'revoked')),
  deleted_at timestamptz
);

create table public.platform_app_state_entries (
  storage_key text primary key,
  value jsonb not null,
  revision bigint not null
);

-- Selected, reviewed subset of 20260722202605_session_planner_domain_records_v1.
-- The canonical app-state record above remains untouched and primary.
create table public.session_planner_sessions (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  session_date date not null,
  title text not null check (char_length(title) between 1 and 120),
  row_version bigint not null check (row_version > 0),
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.session_planner_blocks (
  id uuid primary key,
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  session_id uuid not null references public.session_planner_sessions(id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  row_version bigint not null check (row_version > 0),
  payload jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (session_id, sort_order)
);

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000101', 'synthetic-coach@example.invalid'),
  ('00000000-0000-4000-8000-000000000102', 'revoked-coach@example.invalid'),
  ('00000000-0000-4000-8000-000000000103', 'cross-tenant@example.invalid');

insert into public.platform_organizations(id, name) values
  ('00000000-0000-4000-8000-000000000201', 'Synthetic Organization'),
  ('00000000-0000-4000-8000-000000000202', 'Other Organization');

insert into public.platform_teams(id, organization_id, status) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000201', 'active'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000202', 'active');

insert into public.platform_memberships(id, user_id, organization_id, team_id, role, scope, status) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000401', 'coach', 'team', 'active'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000401', 'coach', 'team', 'revoked'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000402', 'coach', 'team', 'active');

insert into public.platform_app_state_entries(storage_key, value, revision) values (
  'football-session-planner-v3',
  '{"canonical":true,"selectedSessionId":"00000000-0000-4000-8000-000000001001"}'::jsonb,
  7
);

insert into public.session_planner_sessions(
  id, organization_id, team_id, session_date, title, row_version, content, updated_by
) values (
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000401',
  '2026-09-01',
  'Synthetic MD-1 Session',
  7,
  '{"source":"synthetic-selected-slice"}'::jsonb,
  '00000000-0000-4000-8000-000000000101'
);

insert into public.session_planner_blocks(
  id, organization_id, team_id, session_id, sort_order, row_version, payload, updated_by
) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000001001', 1, 7, '{"title":"Dynamic activation","durationMinutes":15}'::jsonb, '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000001001', 2, 7, '{"title":"11v11 positional game","durationMinutes":30}'::jsonb, '00000000-0000-4000-8000-000000000101');
