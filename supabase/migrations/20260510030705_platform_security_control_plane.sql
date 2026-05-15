-- Football Science platform security control plane.
-- This migration makes module permissions and security events first-class
-- database contracts. Runtime API enforcement lives in api/_lib/platform-security.js.

create schema if not exists app_private;

create table if not exists public.platform_permission_matrix (
  module_id text not null check (module_id ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  action text not null check (action in ('read', 'write', 'delete', 'export', 'restore', 'admin', 'observe')),
  roles text[] not null check (
    roles <@ array['admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest']::text[]
    and array_length(roles, 1) is not null
  ),
  scope text not null default 'organization' check (scope in ('global', 'organization', 'team', 'user')),
  requires_organization_scope boolean not null default true,
  requires_team_scope boolean not null default false,
  description text not null default '' check (char_length(description) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (module_id, action)
);

create table if not exists public.platform_security_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.squad_organizations(id) on delete set null,
  team_id uuid references public.squad_teams(id) on delete set null,
  module_id text not null check (char_length(module_id) between 2 and 100),
  route text not null check (char_length(route) between 1 and 160),
  action text not null check (action in ('read', 'write', 'delete', 'export', 'restore', 'admin', 'observe')),
  event_type text not null check (char_length(event_type) between 3 and 100),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  status_code integer check (status_code is null or status_code between 100 and 599),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text check (actor_role is null or actor_role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest', 'system')),
  request_id text check (request_id is null or char_length(request_id) <= 160),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent_hash text check (user_agent_hash is null or char_length(user_agent_hash) = 64),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_permission_matrix_action_idx on public.platform_permission_matrix (action, module_id);
create index if not exists platform_security_events_org_created_idx on public.platform_security_events (organization_id, created_at desc);
create index if not exists platform_security_events_team_created_idx on public.platform_security_events (team_id, created_at desc) where team_id is not null;
create index if not exists platform_security_events_route_created_idx on public.platform_security_events (route, created_at desc);
create index if not exists platform_security_events_severity_created_idx on public.platform_security_events (severity, created_at desc);

alter table public.platform_permission_matrix enable row level security;
alter table public.platform_security_events enable row level security;

revoke all on public.platform_permission_matrix from anon, authenticated;
revoke all on public.platform_security_events from anon, authenticated;
grant select on public.platform_permission_matrix to authenticated;
grant select on public.platform_security_events to authenticated;

create or replace function app_private.has_platform_permission(target_module_id text, target_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_permission_matrix permission
    where permission.module_id = target_module_id
      and permission.action = target_action
      and app_private.current_app_role() = any(permission.roles)
  );
$$;

create or replace function app_private.is_platform_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.is_squad_org_member(target_organization_id), false)
    or coalesce(app_private.is_chat_org_member(target_organization_id), false);
$$;

create or replace function app_private.is_platform_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.is_squad_team_member(target_team_id), false)
    or coalesce(app_private.is_chat_team_member(target_team_id), false);
$$;

drop policy if exists "platform permission matrix is visible to permitted roles" on public.platform_permission_matrix;
create policy "platform permission matrix is visible to permitted roles"
on public.platform_permission_matrix
for select
to authenticated
using (
  app_private.current_app_role() = 'admin'
  or app_private.current_app_role() = any(roles)
);

drop policy if exists "platform security events are admin visible by tenant" on public.platform_security_events;
create policy "platform security events are admin visible by tenant"
on public.platform_security_events
for select
to authenticated
using (
  app_private.current_app_role() = 'admin'
  and (
    organization_id is null
    or app_private.is_platform_org_member(organization_id)
  )
);

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('platform-shell', 'read', array['admin','coach','analyst','performance','medical','guest'], 'organization', true, false, 'Open platform shell and own profile chrome.'),
  ('platform-shell', 'write', array['admin'], 'organization', true, false, 'Manage shell-level platform settings.'),
  ('platform-shell', 'delete', array['admin'], 'organization', true, false, 'Remove shell-level platform settings.'),
  ('platform-shell', 'export', array['admin'], 'organization', true, false, 'Export shell configuration.'),
  ('platform-shell', 'restore', array['admin'], 'organization', true, false, 'Restore shell configuration.'),
  ('platform-shell', 'admin', array['admin'], 'organization', true, false, 'Administer platform shell.'),
  ('platform-shell', 'observe', array['admin'], 'organization', true, false, 'Observe platform shell health.'),

  ('platform-readiness', 'read', array['admin'], 'organization', true, false, 'Read platform readiness status.'),
  ('platform-readiness', 'write', array['admin'], 'organization', true, false, 'Update readiness metadata.'),
  ('platform-readiness', 'delete', array['admin'], 'organization', true, false, 'Archive readiness metadata.'),
  ('platform-readiness', 'export', array['admin'], 'organization', true, false, 'Export readiness metadata.'),
  ('platform-readiness', 'restore', array['admin'], 'organization', true, false, 'Restore readiness metadata.'),
  ('platform-readiness', 'admin', array['admin'], 'organization', true, false, 'Administer platform readiness.'),
  ('platform-readiness', 'observe', array['admin'], 'organization', true, false, 'Observe platform readiness health.'),

  ('home', 'read', array['admin','coach','analyst','performance','medical','guest'], 'team', true, true, 'View Home dashboard.'),
  ('home', 'write', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Create and update dashboard tasks and alerts.'),
  ('home', 'delete', array['admin','coach'], 'team', true, true, 'Remove dashboard tasks and alerts.'),
  ('home', 'export', array['admin'], 'team', true, true, 'Export dashboard data.'),
  ('home', 'restore', array['admin'], 'team', true, true, 'Restore dashboard data.'),
  ('home', 'admin', array['admin'], 'team', true, true, 'Administer dashboard configuration.'),
  ('home', 'observe', array['admin','coach'], 'team', true, true, 'Observe dashboard health.'),

  ('chat', 'read', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Read team and direct-message chat.'),
  ('chat', 'write', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Send chat messages, receipts, reactions, and attachments.'),
  ('chat', 'delete', array['admin','coach'], 'team', true, true, 'Moderate or soft-delete chat content.'),
  ('chat', 'export', array['admin'], 'team', true, true, 'Export chat history.'),
  ('chat', 'restore', array['admin'], 'team', true, true, 'Restore chat history.'),
  ('chat', 'admin', array['admin'], 'team', true, true, 'Administer chat retention and moderation.'),
  ('chat', 'observe', array['admin','coach'], 'team', true, true, 'Observe chat health.'),

  ('schedule', 'read', array['admin','coach','analyst','performance','medical','guest'], 'team', true, true, 'Read team schedule.'),
  ('schedule', 'write', array['admin','coach'], 'team', true, true, 'Create and update schedule events.'),
  ('schedule', 'delete', array['admin','coach'], 'team', true, true, 'Archive schedule events.'),
  ('schedule', 'export', array['admin','coach'], 'team', true, true, 'Export schedule data.'),
  ('schedule', 'restore', array['admin','coach'], 'team', true, true, 'Restore schedule data.'),
  ('schedule', 'admin', array['admin'], 'team', true, true, 'Administer schedule module.'),
  ('schedule', 'observe', array['admin','coach'], 'team', true, true, 'Observe schedule health.'),

  ('exercise-library', 'read', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Read exercise library.'),
  ('exercise-library', 'write', array['admin','coach'], 'team', true, true, 'Create and update exercises.'),
  ('exercise-library', 'delete', array['admin','coach'], 'team', true, true, 'Archive exercises.'),
  ('exercise-library', 'export', array['admin','coach'], 'team', true, true, 'Export exercise library.'),
  ('exercise-library', 'restore', array['admin','coach'], 'team', true, true, 'Restore exercise library.'),
  ('exercise-library', 'admin', array['admin'], 'team', true, true, 'Administer exercise library.'),
  ('exercise-library', 'observe', array['admin','coach'], 'team', true, true, 'Observe exercise library health.'),

  ('session-planner', 'read', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Read Session Planner.'),
  ('session-planner', 'write', array['admin','coach'], 'team', true, true, 'Create and update sessions.'),
  ('session-planner', 'delete', array['admin','coach'], 'team', true, true, 'Archive session blocks.'),
  ('session-planner', 'export', array['admin','coach'], 'team', true, true, 'Export Session Planner data.'),
  ('session-planner', 'restore', array['admin'], 'team', true, true, 'Restore Session Planner versions.'),
  ('session-planner', 'admin', array['admin'], 'team', true, true, 'Administer Session Planner.'),
  ('session-planner', 'observe', array['admin','coach'], 'team', true, true, 'Observe Session Planner health.'),

  ('periodization', 'read', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Read periodization.'),
  ('periodization', 'write', array['admin','coach','performance'], 'team', true, true, 'Update periodization.'),
  ('periodization', 'delete', array['admin','coach'], 'team', true, true, 'Archive periodization records.'),
  ('periodization', 'export', array['admin','coach','performance'], 'team', true, true, 'Export periodization.'),
  ('periodization', 'restore', array['admin','coach'], 'team', true, true, 'Restore periodization.'),
  ('periodization', 'admin', array['admin'], 'team', true, true, 'Administer periodization.'),
  ('periodization', 'observe', array['admin','coach','performance'], 'team', true, true, 'Observe periodization health.'),

  ('medical-team', 'read', array['admin','coach','performance','medical'], 'team', true, true, 'Read coach-safe medical availability.'),
  ('medical-team', 'write', array['admin','medical','performance'], 'team', true, true, 'Write medical records.'),
  ('medical-team', 'delete', array['admin','medical','performance'], 'team', true, true, 'Archive medical records.'),
  ('medical-team', 'export', array['admin','medical'], 'team', true, true, 'Export medical records.'),
  ('medical-team', 'restore', array['admin','medical'], 'team', true, true, 'Restore medical records.'),
  ('medical-team', 'admin', array['admin'], 'team', true, true, 'Administer medical module.'),
  ('medical-team', 'observe', array['admin','medical'], 'team', true, true, 'Observe medical module health.'),

  ('player-profiles', 'read', array['admin','coach','performance','medical'], 'team', true, true, 'Read squad profiles.'),
  ('player-profiles', 'write', array['admin','coach'], 'team', true, true, 'Write squad profiles.'),
  ('player-profiles', 'delete', array['admin','coach'], 'team', true, true, 'Archive squad records.'),
  ('player-profiles', 'export', array['admin','coach'], 'team', true, true, 'Export squad records.'),
  ('player-profiles', 'restore', array['admin','coach'], 'team', true, true, 'Restore squad records.'),
  ('player-profiles', 'admin', array['admin'], 'team', true, true, 'Administer squad module.'),
  ('player-profiles', 'observe', array['admin','coach'], 'team', true, true, 'Observe squad health.'),

  ('scouting', 'read', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Read scouting targets, reports, and shortlists.'),
  ('scouting', 'write', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Create and update scouting targets, reports, and shortlists.'),
  ('scouting', 'delete', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Archive scouting records.'),
  ('scouting', 'export', array['admin','coach','scout','analyst'], 'team', true, true, 'Export scouting records.'),
  ('scouting', 'restore', array['admin','coach'], 'team', true, true, 'Restore scouting records.'),
  ('scouting', 'admin', array['admin'], 'team', true, true, 'Administer scouting module.'),
  ('scouting', 'observe', array['admin','coach','scout','analyst'], 'team', true, true, 'Observe scouting health.'),

  ('game-simulator', 'read', array['admin','coach','analyst','performance'], 'team', true, true, 'Read simulator sequences.'),
  ('game-simulator', 'write', array['admin','coach','analyst'], 'team', true, true, 'Write simulator sequences.'),
  ('game-simulator', 'delete', array['admin','coach','analyst'], 'team', true, true, 'Archive simulator sequences.'),
  ('game-simulator', 'export', array['admin','coach','analyst'], 'team', true, true, 'Export simulator sequences.'),
  ('game-simulator', 'restore', array['admin','coach'], 'team', true, true, 'Restore simulator sequences.'),
  ('game-simulator', 'admin', array['admin'], 'team', true, true, 'Administer simulator module.'),
  ('game-simulator', 'observe', array['admin','coach','analyst'], 'team', true, true, 'Observe simulator health.'),

  ('app-state', 'read', array['admin','coach','analyst','performance','medical','guest'], 'organization', true, false, 'Read central app state.'),
  ('app-state', 'write', array['admin','coach','analyst','performance','medical'], 'organization', true, false, 'Write central app state.'),
  ('app-state', 'delete', array['admin','coach'], 'organization', true, false, 'Remove central app state entries.'),
  ('app-state', 'export', array['admin'], 'organization', true, false, 'Run app-state backups.'),
  ('app-state', 'restore', array['admin'], 'organization', true, false, 'Verify and restore app-state backups.'),
  ('app-state', 'admin', array['admin'], 'organization', true, false, 'Administer central app state.'),
  ('app-state', 'observe', array['admin'], 'organization', true, false, 'Observe central app state health.'),

  ('admin-users', 'read', array['admin','coach','analyst','performance','medical'], 'organization', true, false, 'Read staff directory.'),
  ('admin-users', 'write', array['admin','coach','analyst','performance','medical','guest'], 'user', false, false, 'Update own account; admin rules apply to other users.'),
  ('admin-users', 'delete', array['admin'], 'organization', true, false, 'Remove users.'),
  ('admin-users', 'export', array['admin'], 'organization', true, false, 'Export user records.'),
  ('admin-users', 'restore', array['admin'], 'organization', true, false, 'Restore user records.'),
  ('admin-users', 'admin', array['admin'], 'organization', true, false, 'Administer users and password resets.'),
  ('admin-users', 'observe', array['admin'], 'organization', true, false, 'Observe user administration health.'),

  ('profile', 'read', array['admin','coach','analyst','performance','medical','guest'], 'user', false, false, 'Read own profile.'),
  ('profile', 'write', array['admin','coach','analyst','performance','medical','guest'], 'user', false, false, 'Update own profile image.'),
  ('profile', 'delete', array['admin'], 'organization', true, false, 'Remove profile media.'),
  ('profile', 'export', array['admin'], 'organization', true, false, 'Export profile data.'),
  ('profile', 'restore', array['admin'], 'organization', true, false, 'Restore profile data.'),
  ('profile', 'admin', array['admin'], 'organization', true, false, 'Administer profile data.'),
  ('profile', 'observe', array['admin'], 'organization', true, false, 'Observe profile health.'),

  ('audit-log', 'read', array['admin'], 'organization', true, false, 'Read audit log.'),
  ('audit-log', 'write', array['admin','coach','analyst','performance','medical'], 'organization', true, false, 'Write client audit events.'),
  ('audit-log', 'delete', array['admin'], 'organization', true, false, 'Archive audit events.'),
  ('audit-log', 'export', array['admin'], 'organization', true, false, 'Export audit events.'),
  ('audit-log', 'restore', array['admin'], 'organization', true, false, 'Restore audit events.'),
  ('audit-log', 'admin', array['admin'], 'organization', true, false, 'Administer audit log.'),
  ('audit-log', 'observe', array['admin'], 'organization', true, false, 'Observe audit health.'),

  ('presence', 'read', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Read staff presence.'),
  ('presence', 'write', array['admin','coach','analyst','performance','medical'], 'team', true, true, 'Update own presence.'),
  ('presence', 'delete', array['admin'], 'team', true, true, 'Clear presence records.'),
  ('presence', 'export', array['admin'], 'team', true, true, 'Export presence records.'),
  ('presence', 'restore', array['admin'], 'team', true, true, 'Restore presence records.'),
  ('presence', 'admin', array['admin'], 'team', true, true, 'Administer presence.'),
  ('presence', 'observe', array['admin','coach'], 'team', true, true, 'Observe presence health.'),

  ('auth', 'read', array['admin','coach','analyst','performance','medical','guest'], 'user', false, false, 'Read browser-safe auth configuration.'),
  ('auth', 'write', array['admin','coach','analyst','performance','medical','guest'], 'user', false, false, 'Attempt login.'),
  ('auth', 'delete', array['admin'], 'organization', true, false, 'Revoke sessions.'),
  ('auth', 'export', array['admin'], 'organization', true, false, 'Export auth reports.'),
  ('auth', 'restore', array['admin'], 'organization', true, false, 'Restore auth data.'),
  ('auth', 'admin', array['admin'], 'organization', true, false, 'Administer auth.'),
  ('auth', 'observe', array['admin'], 'organization', true, false, 'Observe auth health.')
on conflict (module_id, action) do update
set roles = excluded.roles,
    scope = excluded.scope,
    requires_organization_scope = excluded.requires_organization_scope,
    requires_team_scope = excluded.requires_team_scope,
    description = excluded.description,
    updated_at = now();
