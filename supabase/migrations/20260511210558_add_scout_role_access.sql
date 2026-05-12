-- Add Scouting staff access without widening private medical access.

create schema if not exists app_private;

alter table if exists public.platform_permission_matrix
  drop constraint if exists platform_permission_matrix_roles_check;
alter table if exists public.platform_permission_matrix
  add constraint platform_permission_matrix_roles_check check (
    roles <@ array['admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest']::text[]
    and array_length(roles, 1) is not null
  );

alter table if exists public.platform_security_events
  drop constraint if exists platform_security_events_actor_role_check;
alter table if exists public.platform_security_events
  add constraint platform_security_events_actor_role_check check (
    actor_role is null
    or actor_role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'guest', 'system')
  );

alter table if exists public.chat_team_memberships
  drop constraint if exists chat_team_memberships_role_check;
alter table if exists public.chat_team_memberships
  add constraint chat_team_memberships_role_check check (
    role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical', 'player', 'guest')
  );

alter table if exists public.squad_staff_memberships
  drop constraint if exists squad_staff_memberships_role_check;
alter table if exists public.squad_staff_memberships
  add constraint squad_staff_memberships_role_check check (
    role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
  );

create or replace function app_private.is_chat_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_chat_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.is_chat_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_manage_chat_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach')
  );
$$;

create or replace function app_private.is_squad_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical');
$$;

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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical')
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
      and membership.role in ('admin', 'club-admin', 'team-admin', 'coach', 'scout')
  );
$$;

create or replace function app_private.is_schedule_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach', 'scout', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_schedule_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'club-admin', 'team-admin', 'coach');
$$;

grant execute on function app_private.is_chat_staff() to authenticated;
grant execute on function app_private.is_chat_org_member(uuid) to authenticated;
grant execute on function app_private.is_chat_team_member(uuid) to authenticated;
grant execute on function app_private.can_manage_chat_team(uuid) to authenticated;
grant execute on function app_private.is_squad_staff() to authenticated;
grant execute on function app_private.is_squad_org_member(uuid) to authenticated;
grant execute on function app_private.is_squad_team_member(uuid) to authenticated;
grant execute on function app_private.can_manage_squad_team(uuid) to authenticated;
grant execute on function app_private.is_schedule_staff() to authenticated;
grant execute on function app_private.is_schedule_manager() to authenticated;
