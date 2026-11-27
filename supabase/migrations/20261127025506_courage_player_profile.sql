create table public.idp_player_publications (
  organization_id uuid not null,
  team_id uuid not null,
  player_id text not null check (char_length(player_id) between 1 and 193),
  focus text not null check (char_length(btrim(focus)) between 1 and 180),
  next_step text not null check (char_length(btrim(next_step)) between 1 and 800),
  feedback text not null default '' check (char_length(feedback) <= 1200),
  published boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  primary key (organization_id, team_id, player_id),
  foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict
);

alter table public.idp_player_publications enable row level security;
revoke all on public.idp_player_publications from public, anon, authenticated, service_role;
grant select, insert, update on public.idp_player_publications to service_role;

create index performance_player_account_user_history on public.performance_player_accounts(user_id);

create function public.manage_idp_player_publication(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_player_id text,
  p_action text, p_focus text, p_next_step text, p_feedback text, p_revision integer
) returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare
  publication public.idp_player_publications%rowtype;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin', 'club-admin', 'team-admin', 'coach']) then
    raise exception 'Active IDP publishing membership required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.performance_player_accounts account
    join public.platform_teams team on team.id = account.team_id and team.organization_id = account.organization_id
    join public.platform_organizations organization on organization.id = team.organization_id
    where account.organization_id = p_organization_id and account.team_id = p_team_id
      and account.player_id = p_player_id and account.revoked_at is null and account.demo_until is null
      and app_private.performance_eligible_account(account.user_id)
      and team.status = 'active' and team.deleted_at is null
      and organization.status = 'active' and organization.deleted_at is null
      and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
      and organization.metadata ->> 'legacyOrganization' = 'football-science-live'
  ) then
    return jsonb_build_object('state', 'unlinked');
  end if;

  if p_action = 'read' then
    select * into publication from public.idp_player_publications
      where organization_id = p_organization_id and team_id = p_team_id and player_id = p_player_id;
    if not found then return jsonb_build_object('state', 'empty'); end if;
  elsif p_action = 'publish' then
    if p_revision = 0 then
      insert into public.idp_player_publications
        (organization_id, team_id, player_id, focus, next_step, feedback, updated_by)
      values (p_organization_id, p_team_id, p_player_id, p_focus, p_next_step, p_feedback, p_actor_id)
      on conflict (organization_id, team_id, player_id) do nothing
      returning * into publication;
    else
      update public.idp_player_publications
      set focus = p_focus, next_step = p_next_step, feedback = p_feedback, published = true,
        revision = revision + 1, updated_at = now(), updated_by = p_actor_id
      where organization_id = p_organization_id and team_id = p_team_id and player_id = p_player_id
        and revision = p_revision
      returning * into publication;
    end if;
    if not found then return jsonb_build_object('state', 'conflict'); end if;
  elsif p_action = 'withdraw' then
    update public.idp_player_publications
    set published = false, revision = revision + 1, updated_at = now(), updated_by = p_actor_id
    where organization_id = p_organization_id and team_id = p_team_id and player_id = p_player_id
      and revision = p_revision and published
    returning * into publication;
    if not found then return jsonb_build_object('state', 'conflict'); end if;
  else
    raise exception 'Invalid publication action.' using errcode = '22023';
  end if;

  return jsonb_build_object('state', 'ready', 'focus', publication.focus,
    'nextStep', publication.next_step, 'feedback', publication.feedback,
    'published', publication.published, 'revision', publication.revision);
end;
$$;

create function public.read_courage_player_profile_modules(p_user_id uuid, p_week date)
returns jsonb language sql stable security invoker
set search_path = '' as $$
  select jsonb_build_object(
    'playerId', account.player_id,
    'development', (
      select jsonb_build_object('focus', publication.focus, 'nextStep', publication.next_step,
        'feedback', publication.feedback, 'publishedAt', publication.updated_at)
      from public.idp_player_publications publication
      where (publication.organization_id, publication.team_id, publication.player_id) =
        (account.organization_id, account.team_id, account.player_id)
        and publication.published
    ),
    'gps', coalesce((
      select jsonb_agg(jsonb_build_object('playerId', account.player_id,
        'activityId', item -> 'activityId', 'metrics', jsonb_build_object(
          'distance', item #> '{metrics,distance}', 'hsr', item #> '{metrics,hsr}',
          'maxSpeed', item #> '{metrics,maxSpeed}')))
      from public.performance_gps_imports gps
      join public.performance_gps_week_snapshots snapshot
      using (organization_id, team_id, dataset_sha256)
      cross join lateral jsonb_array_elements(snapshot.observations) as observations(item)
      where gps.organization_id = account.organization_id and gps.team_id = account.team_id and gps.is_current
        and snapshot.week_start = p_week and item ->> 'playerId' = account.player_id
    ), '[]'::jsonb)
  )
  from public.performance_player_accounts account
  join public.platform_teams team on team.id = account.team_id and team.organization_id = account.organization_id
  join public.platform_organizations organization on organization.id = team.organization_id
  where account.user_id = p_user_id and account.revoked_at is null and account.demo_until is null
    and app_private.performance_eligible_account(p_user_id)
    and team.status = 'active' and team.deleted_at is null
    and organization.status = 'active' and organization.deleted_at is null
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live';
$$;

revoke all on function public.manage_idp_player_publication(uuid, uuid, uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.manage_idp_player_publication(uuid, uuid, uuid, text, text, text, text, text, integer)
  to service_role;
revoke all on function public.read_courage_player_profile_modules(uuid, date) from public, anon, authenticated;
grant execute on function public.read_courage_player_profile_modules(uuid, date) to service_role;

-- Preserve recorded zeroes while enforcing the new scale for submissions.
create function app_private.performance_validate_rpe_rating()
returns trigger language plpgsql security invoker
set search_path = '' as $$
begin
  if new.rating = 0 then
    raise exception 'New RPE ratings must be between 1 and 10.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app_private.performance_validate_rpe_rating() from public, anon, authenticated;
grant execute on function app_private.performance_validate_rpe_rating() to service_role;

create trigger performance_validate_rpe_rating before insert or update of rating
on public.performance_rpe_checkins for each row execute function app_private.performance_validate_rpe_rating();
