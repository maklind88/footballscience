-- Complete the canonical Platform Identity scope required by Leaderboard for
-- the reviewed North Carolina Courage staff population that predates Platform
-- Identity. Authorization role/status comes only from server-owned Auth app
-- metadata. User metadata is limited to reviewed legacy-tenant/display fields.

do $$
declare
  target_count integer;
  active_staff_count integer;
  reviewed_legacy_team_count integer;
  reviewed_unscoped_admin_count integer;
  profile_count integer;
  correct_profile_count integer;
  membership_count integer;
  correct_membership_count integer;
  inserted_profile_count integer;
  inserted_membership_count integer;
  target_organization_id uuid;
  target_club_id uuid;
  target_team_id uuid;
  audit_actor_id uuid;
begin
  select count(*)::integer
  into target_count
  from public.platform_teams team
  join public.platform_organizations organization
    on organization.id = team.organization_id
   and organization.status = 'active'
   and organization.deleted_at is null
  left join public.platform_clubs club
    on club.id = team.club_id
   and club.status = 'active'
   and club.deleted_at is null
  where team.status = 'active'
    and team.deleted_at is null
    and team.metadata ->> 'source' = 'leaderboard-live-qa-activation'
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live'
    and (team.club_id is null or club.id is not null);

  if target_count = 0 then
    raise notice 'Leaderboard active staff identity repair: production tenant marker is absent; no-op.';
    return;
  end if;

  if target_count <> 1 then
    raise exception 'Leaderboard active staff identity repair: canonical tenant target is ambiguous.';
  end if;

  select
    team.organization_id,
    team.club_id,
    team.id,
    coalesce(team.updated_by, team.created_by)
  into
    target_organization_id,
    target_club_id,
    target_team_id,
    audit_actor_id
  from public.platform_teams team
  join public.platform_organizations organization
    on organization.id = team.organization_id
   and organization.status = 'active'
   and organization.deleted_at is null
  left join public.platform_clubs club
    on club.id = team.club_id
   and club.status = 'active'
   and club.deleted_at is null
  where team.status = 'active'
    and team.deleted_at is null
    and team.metadata ->> 'source' = 'leaderboard-live-qa-activation'
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live'
    and (team.club_id is null or club.id is not null);

  if target_organization_id is null or target_team_id is null then
    raise exception 'Leaderboard active staff identity repair: canonical tenant target is incomplete.';
  end if;

  if audit_actor_id is null or not exists (
    select 1
    from auth.users actor
    where actor.id = audit_actor_id
      and lower(coalesce(actor.raw_app_meta_data ->> 'role', '')) = 'admin'
      and lower(coalesce(actor.raw_app_meta_data ->> 'status', 'active')) = 'active'
  ) then
    raise exception 'Leaderboard active staff identity repair: active server-owned admin audit actor is required.';
  end if;

  select count(*)::integer
  into active_staff_count
  from auth.users auth_user
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active';

  select count(*)::integer
  into reviewed_legacy_team_count
  from auth.users auth_user
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active'
    and coalesce(
      auth_user.raw_user_meta_data ->> 'teamId',
      auth_user.raw_user_meta_data ->> 'team_id',
      ''
    ) = 'team-north-carolina-courage';

  select count(*)::integer
  into reviewed_unscoped_admin_count
  from auth.users auth_user
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'admin'
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active'
    and coalesce(
      auth_user.raw_user_meta_data ->> 'teamId',
      auth_user.raw_user_meta_data ->> 'team_id',
      ''
    ) = '';

  if active_staff_count <> 20
    or reviewed_legacy_team_count <> 19
    or reviewed_unscoped_admin_count <> 1
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'admin' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 2
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'club-admin' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 0
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'team-admin' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 2
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'coach' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 7
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'scout' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 2
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'analyst' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 2
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'performance' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 3
    or (select count(*) from auth.users auth_user where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'medical' and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active') <> 2
  then
    raise exception 'Leaderboard active staff identity repair: reviewed 20/19/1 role population changed.';
  end if;

  select
    count(profile.user_id)::integer,
    count(profile.user_id) filter (
      where profile.primary_organization_id = target_organization_id
        and profile.primary_club_id is not distinct from target_club_id
        and profile.primary_team_id = target_team_id
        and profile.status = 'active'
        and profile.deleted_at is null
    )::integer
  into profile_count, correct_profile_count
  from auth.users auth_user
  left join public.platform_user_profiles profile on profile.user_id = auth_user.id
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active';

  select
    count(membership.id)::integer,
    count(membership.id) filter (
      where membership.organization_id = target_organization_id
        and membership.status = 'active'
        and membership.deleted_at is null
        and membership.role = lower(coalesce(auth_user.raw_app_meta_data ->> 'role', ''))
        and (
          (membership.role = 'admin' and membership.scope = 'organization' and membership.club_id is null and membership.team_id is null)
          or (membership.role = 'club-admin' and membership.scope = 'club' and membership.club_id = target_club_id and membership.team_id is null)
          or (membership.role not in ('admin','club-admin') and membership.scope = 'team' and membership.club_id is not distinct from target_club_id and membership.team_id = target_team_id)
        )
    )::integer
  into membership_count, correct_membership_count
  from auth.users auth_user
  left join public.platform_memberships membership on membership.user_id = auth_user.id
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active';

  if profile_count = 20
    and correct_profile_count = 20
    and membership_count = 20
    and correct_membership_count = 20 then
    raise notice 'Leaderboard active staff identity repair: all twenty active staff are already canonical; no-op.';
    return;
  end if;

  if profile_count <> 7
    or correct_profile_count <> 7
    or membership_count <> 7
    or correct_membership_count <> 7 then
    raise exception 'Leaderboard active staff identity repair: reviewed 20/7/13 identity precondition changed.';
  end if;

  insert into public.platform_user_profiles (
    user_id, primary_organization_id, primary_club_id, primary_team_id,
    display_name, first_name, last_name, email, title, department, status,
    created_by, updated_by, metadata
  )
  select
    auth_user.id,
    target_organization_id,
    target_club_id,
    target_team_id,
    left(coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'displayName', ''),
      nullif(auth_user.raw_user_meta_data ->> 'display_name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'name', ''),
      nullif(concat_ws(' ',
        nullif(auth_user.raw_user_meta_data ->> 'firstName', ''),
        nullif(auth_user.raw_user_meta_data ->> 'lastName', '')
      ), ''),
      split_part(coalesce(auth_user.email, 'Staff member'), '@', 1),
      'Staff member'
    ), 180),
    left(coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'firstName', ''),
      nullif(auth_user.raw_user_meta_data ->> 'first_name', '')
    ), 120),
    left(coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'lastName', ''),
      nullif(auth_user.raw_user_meta_data ->> 'last_name', '')
    ), 120),
    left(lower(coalesce(auth_user.email, '')), 254),
    left(coalesce(auth_user.raw_user_meta_data ->> 'title', ''), 160),
    left(coalesce(auth_user.raw_user_meta_data ->> 'department', ''), 120),
    'active',
    audit_actor_id,
    audit_actor_id,
    jsonb_build_object(
      'backfillSchema', 'footballscience-platform-identity-backfill-v1',
      'source', 'leaderboard-active-staff-identity-repair',
      'roleSource', 'app_metadata',
      'migration', '20260831200058'
    )
  from auth.users auth_user
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active'
    and not exists (
      select 1 from public.platform_user_profiles profile
      where profile.user_id = auth_user.id
    );

  get diagnostics inserted_profile_count = row_count;
  if inserted_profile_count <> 13 then
    raise exception 'Leaderboard active staff identity repair: expected thirteen new profiles, inserted %.', inserted_profile_count;
  end if;

  insert into public.platform_memberships (
    organization_id, club_id, team_id, user_id, role, scope, status,
    relationship, invited_by, accepted_at, created_by, updated_by, metadata
  )
  select
    target_organization_id,
    case
      when lower(auth_user.raw_app_meta_data ->> 'role') = 'admin' then null
      else target_club_id
    end,
    case
      when lower(auth_user.raw_app_meta_data ->> 'role') in ('admin','club-admin') then null
      else target_team_id
    end,
    auth_user.id,
    lower(auth_user.raw_app_meta_data ->> 'role'),
    case
      when lower(auth_user.raw_app_meta_data ->> 'role') = 'admin' then 'organization'
      when lower(auth_user.raw_app_meta_data ->> 'role') = 'club-admin' then 'club'
      else 'team'
    end,
    'active',
    'staff',
    audit_actor_id,
    now(),
    audit_actor_id,
    audit_actor_id,
    jsonb_build_object(
      'backfillSchema', 'footballscience-platform-identity-backfill-v1',
      'source', 'leaderboard-active-staff-identity-repair',
      'roleSource', 'app_metadata',
      'migration', '20260831200058'
    )
  from auth.users auth_user
  where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
    'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
  ])
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active'
    and not exists (
      select 1 from public.platform_memberships membership
      where membership.user_id = auth_user.id
    );

  get diagnostics inserted_membership_count = row_count;
  if inserted_membership_count <> 13 then
    raise exception 'Leaderboard active staff identity repair: expected thirteen new memberships, inserted %.', inserted_membership_count;
  end if;

  if (
    select count(*)
    from auth.users auth_user
    join public.platform_user_profiles profile
      on profile.user_id = auth_user.id
     and profile.primary_organization_id = target_organization_id
     and profile.primary_club_id is not distinct from target_club_id
     and profile.primary_team_id = target_team_id
     and profile.status = 'active'
     and profile.deleted_at is null
    join public.platform_memberships membership
      on membership.user_id = auth_user.id
     and membership.organization_id = target_organization_id
     and membership.status = 'active'
     and membership.deleted_at is null
     and membership.role = lower(coalesce(auth_user.raw_app_meta_data ->> 'role', ''))
     and (
       (membership.role = 'admin' and membership.scope = 'organization' and membership.club_id is null and membership.team_id is null)
       or (membership.role = 'club-admin' and membership.scope = 'club' and membership.club_id = target_club_id and membership.team_id is null)
       or (membership.role not in ('admin','club-admin') and membership.scope = 'team' and membership.club_id is not distinct from target_club_id and membership.team_id = target_team_id)
     )
    where lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = any(array[
      'admin','club-admin','team-admin','coach','scout','analyst','performance','medical'
    ])
      and lower(coalesce(auth_user.raw_app_meta_data ->> 'status', 'active')) = 'active'
  ) <> 20 then
    raise exception 'Leaderboard active staff identity repair: postcondition did not produce twenty canonical active staff.';
  end if;
end;
$$;
