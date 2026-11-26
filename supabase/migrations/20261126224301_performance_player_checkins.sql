create table public.performance_wellness_imports (
  organization_id uuid not null,
  team_id uuid not null,
  dataset_sha256 text not null check (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  is_current boolean not null default false check (not is_current or published_at is not null),
  primary key (organization_id, team_id, dataset_sha256),
  foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict
);

create unique index performance_wellness_one_current
  on public.performance_wellness_imports(organization_id, team_id) where is_current;

create table public.performance_wellness_days (
  organization_id uuid not null,
  team_id uuid not null,
  dataset_sha256 text not null,
  day date not null,
  player_id text not null check (char_length(player_id) between 1 and 193),
  score numeric(5,2) not null check (score between 0 and 100),
  sleep_duration text check (char_length(sleep_duration) between 1 and 40),
  sleep_quality text check (char_length(sleep_quality) between 1 and 40),
  stress text check (char_length(stress) between 1 and 40),
  fatigue text check (char_length(fatigue) between 1 and 40),
  soreness text check (char_length(soreness) between 1 and 40),
  source_record_id text not null check (char_length(source_record_id) between 1 and 200),
  primary key (organization_id, team_id, dataset_sha256, day, player_id),
  unique (organization_id, team_id, dataset_sha256, source_record_id),
  foreign key (organization_id, team_id, dataset_sha256)
    references public.performance_wellness_imports(organization_id, team_id, dataset_sha256) on delete restrict
);

create table public.performance_player_accounts (
  organization_id uuid not null,
  team_id uuid not null,
  player_id text not null check (char_length(player_id) between 1 and 193),
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  demo_until timestamptz,
  check (
    (demo_until is null and player_id not like 'performance-qa-%') or
    (demo_until is not null and player_id = 'performance-qa-' || user_id::text)
  ),
  primary key (organization_id, team_id, player_id, user_id),
  foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict
);

create unique index performance_player_one_active_account
  on public.performance_player_accounts(organization_id, team_id, player_id) where revoked_at is null;
create unique index performance_account_one_active_player
  on public.performance_player_accounts(user_id) where revoked_at is null;

create table public.performance_rpe_checkins (
  organization_id uuid not null,
  team_id uuid not null,
  activity_id text not null check (char_length(activity_id) between 1 and 180),
  activity_date date not null,
  player_id text not null check (char_length(player_id) between 1 and 193),
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  rating smallint check (rating between 0 and 10),
  answered_at timestamptz,
  answered_by uuid,
  check ((rating is null) = (answered_at is null)),
  primary key (organization_id, team_id, activity_id, player_id),
  foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict
);

create index performance_rpe_team_date on public.performance_rpe_checkins(organization_id, team_id, activity_date);

alter table public.performance_wellness_imports enable row level security;
alter table public.performance_wellness_days enable row level security;
alter table public.performance_player_accounts enable row level security;
alter table public.performance_rpe_checkins enable row level security;

revoke all on public.performance_wellness_imports, public.performance_wellness_days, public.performance_player_accounts, public.performance_rpe_checkins
  from public, anon, authenticated, service_role;
grant select on public.performance_wellness_imports, public.performance_wellness_days to service_role;
grant select on public.performance_player_accounts to service_role;
grant select, insert, update on public.performance_rpe_checkins to service_role;

-- Only the server may verify the native Auth account behind a player binding.
create function app_private.performance_eligible_account(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and u.raw_app_meta_data ->> 'role' = 'guest'
      and coalesce(u.raw_app_meta_data ->> 'status', 'active') = 'active'
      and not exists (
        select 1 from public.platform_memberships m
        where m.user_id = u.id and m.deleted_at is null and m.status = 'active' and m.role <> 'guest'
      )
  );
$$;

revoke all on function app_private.performance_eligible_account(uuid) from public, anon, authenticated;
grant execute on function app_private.performance_eligible_account(uuid) to service_role;

create function public.read_performance_player_checkins(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid,
  p_week date, p_player_ids text[], p_activity_ids text[]
) returns jsonb language plpgsql stable security invoker
set search_path = '' as $$
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','performance']) then
    raise exception 'Performance staff membership required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'linkedPlayerIds', coalesce((
      select jsonb_agg(account.player_id order by account.player_id)
      from public.performance_player_accounts account
      where account.organization_id = p_organization_id and account.team_id = p_team_id
        and account.player_id = any(p_player_ids) and account.revoked_at is null
        and app_private.performance_eligible_account(account.user_id)
    ), '[]'::jsonb),
    'wellness', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'playerId', day.player_id, 'date', day.day, 'score', day.score, 'sleepDuration', day.sleep_duration,
        'sleepQuality', day.sleep_quality, 'stress', day.stress, 'fatigue', day.fatigue, 'soreness', day.soreness
      )) order by day.day, day.player_id)
      from public.performance_wellness_imports as version
      join public.performance_wellness_days as day
      using (organization_id, team_id, dataset_sha256)
      where version.organization_id = p_organization_id and version.team_id = p_team_id and version.is_current
        and day.day >= p_week and day.day < p_week + 7 and day.player_id = any(p_player_ids)
    ), '[]'::jsonb),
    'rpe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', response.player_id, 'activityId', response.activity_id, 'date', response.activity_date,
        'rating', response.rating, 'answeredAt', response.answered_at
      ) order by response.activity_date, response.player_id)
      from public.performance_rpe_checkins response
      where response.organization_id = p_organization_id and response.team_id = p_team_id
        and response.activity_date >= p_week and response.activity_date < p_week + 7
        and response.activity_id = any(p_activity_ids) and response.player_id = any(p_player_ids)
    ), '[]'::jsonb)
  );
end;
$$;

create function app_private.manage_performance_player_account(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_player_id text, p_email text
) returns text language plpgsql security definer
set search_path = '' as $$
declare
  target uuid;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin']) then
    raise exception 'Team administrator membership required.' using errcode = '42501';
  end if;
  if p_email is null then
    update public.performance_player_accounts
      set revoked_at = now(), revoked_by = p_actor_id
    where organization_id = p_organization_id and team_id = p_team_id
      and player_id = p_player_id and revoked_at is null;
    return 'revoked';
  end if;

  select candidates.user_id into target
  from (
    select u.id as user_id, count(*) over () as matches
    from auth.users u
    where lower(u.email) = lower(p_email) and app_private.performance_eligible_account(u.id)
  ) candidates where candidates.matches = 1;
  if target is null then return 'unavailable'; end if;

  begin
    insert into public.performance_player_accounts(organization_id, team_id, player_id, user_id, linked_by)
    values (p_organization_id, p_team_id, p_player_id, target, p_actor_id)
    on conflict (organization_id, team_id, player_id, user_id) do update
      set linked_by = excluded.linked_by, linked_at = now(), revoked_at = null, revoked_by = null
      where performance_player_accounts.revoked_at is not null;
  exception when unique_violation then
    return 'conflict';
  end;
  return 'linked';
end;
$$;

revoke all on function app_private.manage_performance_player_account(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function app_private.manage_performance_player_account(uuid, uuid, uuid, text, text) to service_role;

create function public.manage_performance_player_account(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_player_id text, p_email text
) returns text language sql security invoker set search_path = '' as $$
  select app_private.manage_performance_player_account(p_actor_id, p_organization_id, p_team_id, p_player_id, p_email);
$$;

create function public.open_performance_rpe(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_activity_id text,
  p_activity_date date, p_player_ids text[]
) returns jsonb language plpgsql security invoker
set search_path = '' as $$
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','performance']) then
    raise exception 'Performance staff membership required.' using errcode = '42501';
  end if;

  insert into public.performance_rpe_checkins(organization_id, team_id, activity_id, activity_date, player_id, issued_by)
  select p_organization_id, p_team_id, p_activity_id, p_activity_date, account.player_id, p_actor_id
    from public.performance_player_accounts account
    where account.organization_id = p_organization_id and account.team_id = p_team_id
      and account.player_id = any(p_player_ids) and account.revoked_at is null
      and app_private.performance_eligible_account(account.user_id)
  on conflict (organization_id, team_id, activity_id, player_id) do update
    set activity_date = excluded.activity_date
    where performance_rpe_checkins.rating is null
      and performance_rpe_checkins.activity_date is distinct from excluded.activity_date;

  return coalesce((
    select jsonb_agg(response.player_id order by response.player_id)
    from public.performance_rpe_checkins response
    join public.performance_player_accounts account using (organization_id, team_id, player_id)
    where response.organization_id = p_organization_id and response.team_id = p_team_id
      and response.activity_id = p_activity_id and response.activity_date = p_activity_date
      and response.player_id = any(p_player_ids) and account.revoked_at is null
      and app_private.performance_eligible_account(account.user_id)
  ), '[]'::jsonb);
end;
$$;

create function public.read_performance_player_portal(p_user_id uuid, p_week date)
returns jsonb language sql stable security invoker
set search_path = '' as $$
  select jsonb_build_object(
    'playerId', account.player_id,
    'demo', account.demo_until is not null,
    'wellness', case when account.demo_until is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'date', day.day, 'score', day.score, 'sleepDuration', day.sleep_duration, 'sleepQuality', day.sleep_quality,
        'stress', day.stress, 'fatigue', day.fatigue, 'soreness', day.soreness
      )) order by day.day)
      from public.performance_wellness_imports version
      join public.performance_wellness_days day using (organization_id, team_id, dataset_sha256)
      where version.organization_id = account.organization_id and version.team_id = account.team_id
        and version.is_current and day.day >= p_week and day.day < p_week + 7 and day.player_id = account.player_id
    ), '[]'::jsonb) end,
    'rpe', coalesce((
      select jsonb_agg(jsonb_build_object('activityId', response.activity_id, 'date', response.activity_date,
        'rating', response.rating) order by response.activity_date, response.activity_id)
      from public.performance_rpe_checkins response
      where response.organization_id = account.organization_id and response.team_id = account.team_id
        and response.player_id = account.player_id and response.activity_date >= p_week and response.activity_date < p_week + 7
    ), '[]'::jsonb)
  )
  from public.performance_player_accounts account
  join public.platform_teams team on team.id = account.team_id and team.organization_id = account.organization_id
  join public.platform_organizations organization on organization.id = team.organization_id
  where account.user_id = p_user_id and account.revoked_at is null and app_private.performance_eligible_account(p_user_id)
    and (account.demo_until is null or account.demo_until > now())
    and team.status = 'active' and team.deleted_at is null
    and organization.status = 'active' and organization.deleted_at is null
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live';
$$;

create function public.submit_performance_rpe(
  p_user_id uuid, p_activity_id text, p_activity_date date, p_rating smallint
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  current_rating smallint;
begin
  if p_rating is null or p_rating not between 0 and 10 then return 'invalid'; end if;

  select response.rating into current_rating
  from public.performance_rpe_checkins response
  join public.performance_player_accounts account using (organization_id, team_id, player_id)
  join public.platform_teams team on team.id = account.team_id and team.organization_id = account.organization_id
  join public.platform_organizations organization on organization.id = team.organization_id
  where account.user_id = p_user_id and account.revoked_at is null and app_private.performance_eligible_account(p_user_id)
    and (account.demo_until is null or account.demo_until > now())
    and response.activity_id = p_activity_id and response.activity_date = p_activity_date
    and team.status = 'active' and team.deleted_at is null
    and organization.status = 'active' and organization.deleted_at is null
    and team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and organization.metadata ->> 'legacyOrganization' = 'football-science-live'
  for update of response;
  if not found then return 'unavailable'; end if;
  if current_rating = p_rating then return 'saved'; end if;
  if current_rating is not null then return 'answered'; end if;

  update public.performance_rpe_checkins response
    set rating = p_rating, answered_at = now(), answered_by = p_user_id
  from public.performance_player_accounts account
  where account.user_id = p_user_id and account.revoked_at is null and app_private.performance_eligible_account(p_user_id)
    and (account.demo_until is null or account.demo_until > now())
    and (response.organization_id, response.team_id, response.player_id) = (account.organization_id, account.team_id, account.player_id)
    and response.activity_id = p_activity_id and response.activity_date = p_activity_date and response.rating is null;
  return case when found then 'saved' else 'unavailable' end;
end;
$$;

revoke all on function public.read_performance_player_checkins(uuid, uuid, uuid, date, text[], text[]) from public, anon, authenticated;
revoke all on function public.manage_performance_player_account(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.open_performance_rpe(uuid, uuid, uuid, text, date, text[]) from public, anon, authenticated;
revoke all on function public.read_performance_player_portal(uuid, date) from public, anon, authenticated;
revoke all on function public.submit_performance_rpe(uuid, text, date, smallint) from public, anon, authenticated;
grant execute on function public.read_performance_player_checkins(uuid, uuid, uuid, date, text[], text[]) to service_role;
grant execute on function public.manage_performance_player_account(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.open_performance_rpe(uuid, uuid, uuid, text, date, text[]) to service_role;
grant execute on function public.read_performance_player_portal(uuid, date) to service_role;
grant execute on function public.submit_performance_rpe(uuid, text, date, smallint) to service_role;
