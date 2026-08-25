-- Football Science Leaderboard: guarded database-first monthly competition ledger with append-only audit history.
create schema if not exists app_private;
create unique index if not exists platform_clubs_id_org_leaderboard_uidx
  on public.platform_clubs (id, organization_id);
create unique index if not exists platform_teams_id_org_leaderboard_uidx
  on public.platform_teams (id, organization_id);
create unique index if not exists squad_teams_id_org_leaderboard_uidx
  on public.squad_teams (id, organization_id);
create unique index if not exists squad_players_id_org_leaderboard_uidx
  on public.squad_players (id, organization_id);
create unique index if not exists squad_roster_id_scope_player_leaderboard_uidx
  on public.squad_roster_memberships (id, organization_id, team_id, player_id);
create table public.leaderboard_competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  club_id uuid,
  team_id uuid not null,
  squad_organization_id uuid not null references public.squad_organizations(id) on delete restrict,
  squad_team_id uuid not null,
  month_start date not null,
  timezone text not null default 'UTC' check (timezone = 'UTC'),
  status text not null default 'open' check (status in ('open', 'locked', 'archived')),
  scoring_rules jsonb not null default '{"version":1,"points":"integer"}'::jsonb,
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_competitions_month_check
    check (month_start = date_trunc('month', month_start)::date),
  constraint leaderboard_competitions_platform_team_fk
    foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict,
  constraint leaderboard_competitions_platform_club_fk
    foreign key (club_id, organization_id) references public.platform_clubs(id, organization_id) on delete restrict,
  constraint leaderboard_competitions_squad_team_fk
    foreign key (squad_team_id, squad_organization_id) references public.squad_teams(id, organization_id) on delete restrict,
  unique (team_id, month_start),
  unique (id, organization_id, team_id),
  unique (id, organization_id, team_id, squad_organization_id, squad_team_id)
);
create table public.leaderboard_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  organization_id uuid not null,
  team_id uuid not null,
  squad_organization_id uuid not null,
  squad_team_id uuid not null,
  squad_player_id uuid not null,
  squad_roster_membership_id uuid not null,
  player_source_key text not null check (char_length(player_source_key) between 1 and 180),
  display_name_snapshot text not null check (char_length(display_name_snapshot) between 1 and 180),
  created_at timestamptz not null default now(),
  constraint leaderboard_participants_competition_fk
    foreign key (competition_id, organization_id, team_id, squad_organization_id, squad_team_id)
    references public.leaderboard_competitions(id, organization_id, team_id, squad_organization_id, squad_team_id) on delete restrict,
  constraint leaderboard_participants_player_fk
    foreign key (squad_player_id, squad_organization_id)
    references public.squad_players(id, organization_id) on delete restrict,
  constraint leaderboard_participants_roster_fk
    foreign key (squad_roster_membership_id, squad_organization_id, squad_team_id, squad_player_id)
    references public.squad_roster_memberships(id, organization_id, team_id, player_id) on delete restrict,
  unique (competition_id, squad_player_id),
  unique (competition_id, player_source_key),
  unique (id, competition_id, organization_id, team_id)
);
create table public.leaderboard_scoring_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  organization_id uuid not null,
  team_id uuid not null,
  occurred_on date not null,
  title text not null check (char_length(title) between 1 and 160),
  note text not null default '' check (char_length(note) <= 1200),
  status text not null default 'active' check (status in ('active', 'reversed')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 1 and 1200),
  reversal_idempotency_key text check (reversal_idempotency_key is null or char_length(reversal_idempotency_key) between 8 and 160),
  reversal_request_hash text check (reversal_request_hash is null or reversal_request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_scoring_events_competition_fk
    foreign key (competition_id, organization_id, team_id)
    references public.leaderboard_competitions(id, organization_id, team_id) on delete restrict,
  constraint leaderboard_scoring_events_reversal_check check (
    (status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null and reversal_idempotency_key is null and reversal_request_hash is null)
    or (status = 'reversed' and reversed_at is not null and reversed_by is not null and reversal_reason is not null and reversal_idempotency_key is not null and reversal_request_hash is not null)
  ),
  unique (competition_id, idempotency_key),
  unique (competition_id, reversal_idempotency_key),
  unique (id, competition_id, organization_id, team_id)
);
create table public.leaderboard_point_transactions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  event_id uuid not null,
  participant_id uuid not null,
  organization_id uuid not null,
  team_id uuid not null,
  kind text not null,
  points_delta integer not null check (points_delta between -1000 and 1000 and points_delta <> 0),
  placement integer check (placement is null or placement between 1 and 1000),
  reverses_transaction_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint leaderboard_point_transactions_kind_check check (
    (kind = 'award' and points_delta > 0 and reverses_transaction_id is null)
    or (kind = 'reversal' and points_delta < 0 and reverses_transaction_id is not null and placement is null)
  ),
  constraint leaderboard_point_transactions_event_fk
    foreign key (event_id, competition_id, organization_id, team_id)
    references public.leaderboard_scoring_events(id, competition_id, organization_id, team_id) on delete restrict,
  constraint leaderboard_point_transactions_participant_fk
    foreign key (participant_id, competition_id, organization_id, team_id)
    references public.leaderboard_participants(id, competition_id, organization_id, team_id) on delete restrict,
  constraint leaderboard_point_transactions_reversal_fk
    foreign key (reverses_transaction_id, event_id, participant_id, competition_id, organization_id, team_id)
    references public.leaderboard_point_transactions(id, event_id, participant_id, competition_id, organization_id, team_id) on delete restrict,
  unique (event_id, participant_id, kind),
  unique (id, event_id, participant_id, competition_id, organization_id, team_id),
  unique (reverses_transaction_id)
);
create table public.leaderboard_audit_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  event_id uuid,
  organization_id uuid not null,
  team_id uuid not null,
  action text not null check (action in ('award-event', 'reverse-event', 'lock-competition', 'reopen-competition')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leaderboard_audit_events_competition_fk
    foreign key (competition_id, organization_id, team_id)
    references public.leaderboard_competitions(id, organization_id, team_id) on delete restrict,
  constraint leaderboard_audit_events_event_fk
    foreign key (event_id, competition_id, organization_id, team_id)
    references public.leaderboard_scoring_events(id, competition_id, organization_id, team_id) on delete restrict,
  unique (competition_id, action, idempotency_key)
);
create index leaderboard_participants_competition_rank_idx
  on public.leaderboard_participants (competition_id, display_name_snapshot, id);
create index leaderboard_scoring_events_competition_date_idx
  on public.leaderboard_scoring_events (competition_id, occurred_on desc, created_at desc);
create index leaderboard_point_transactions_participant_idx
  on public.leaderboard_point_transactions (competition_id, participant_id, created_at);
create index leaderboard_point_transactions_event_idx
  on public.leaderboard_point_transactions (event_id, kind, created_at);
create index leaderboard_audit_events_team_created_idx
  on public.leaderboard_audit_events (team_id, created_at desc);
create or replace function app_private.leaderboard_block_hard_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Hard delete is disabled for Leaderboard records.' using errcode = 'P0001';
end;
$$;
create or replace function app_private.leaderboard_block_append_only_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Leaderboard ledger records are append-only.' using errcode = 'P0001';
end;
$$;
create or replace function app_private.leaderboard_guard_event_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status <> 'active' or new.status <> 'reversed'
    or (to_jsonb(new) - array['status','reversed_at','reversed_by','reversal_reason','reversal_idempotency_key','reversal_request_hash','updated_at']::text[])
       is distinct from
       (to_jsonb(old) - array['status','reversed_at','reversed_by','reversal_reason','reversal_idempotency_key','reversal_request_hash','updated_at']::text[])
  then
    raise exception 'Scoring events are immutable except for one audited reversal.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace function app_private.leaderboard_actor_has_role(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_roles text[]) returns boolean language sql stable security invoker
set search_path = public, pg_temp as $$
  select exists (
    select 1 from platform_memberships membership
    join platform_teams team on team.id = p_team_id
    where membership.user_id = p_actor_id
      and membership.organization_id = p_organization_id
      and membership.status = 'active' and membership.deleted_at is null
      and team.organization_id = p_organization_id
      and team.status = 'active' and team.deleted_at is null
      and membership.role = any(p_roles)
      and ((membership.scope = 'organization')
        or (membership.scope = 'club' and membership.club_id = team.club_id)
        or (membership.scope = 'team' and membership.team_id = team.id))
  );
$$;
create trigger leaderboard_competitions_no_delete before delete on public.leaderboard_competitions
  for each row execute function app_private.leaderboard_block_hard_delete();
create trigger leaderboard_participants_append_only before update or delete on public.leaderboard_participants
  for each row execute function app_private.leaderboard_block_append_only_mutation();
create trigger leaderboard_scoring_events_guard_update before update on public.leaderboard_scoring_events
  for each row execute function app_private.leaderboard_guard_event_update();
create trigger leaderboard_scoring_events_no_delete before delete on public.leaderboard_scoring_events
  for each row execute function app_private.leaderboard_block_hard_delete();
create trigger leaderboard_point_transactions_append_only before update or delete on public.leaderboard_point_transactions
  for each row execute function app_private.leaderboard_block_append_only_mutation();
create trigger leaderboard_audit_events_append_only before update or delete on public.leaderboard_audit_events
  for each row execute function app_private.leaderboard_block_append_only_mutation();
create or replace function public.leaderboard_award_batch(
  p_organization_id uuid, p_club_id uuid, p_team_id uuid,
  p_squad_organization_id uuid, p_squad_team_id uuid,
  p_month_start date, p_timezone text, p_occurred_on date,
  p_title text, p_note text, p_idempotency_key text, p_request_hash text,
  p_actor_id uuid, p_awards jsonb
) returns jsonb language plpgsql security invoker
set search_path = public, extensions, pg_temp as $$
declare
  competition leaderboard_competitions%rowtype;
  scoring_event leaderboard_scoring_events%rowtype;
  award jsonb;
  award_participant_id uuid;
  award_player_id uuid;
  roster_id uuid;
  source_key text;
  display_name text;
  points integer;
  award_placement integer;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','coach']) then
    raise exception 'Active Leaderboard manager membership is required.' using errcode = '42501'; end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request hash.' using errcode = '22023'; end if;
  if p_timezone is distinct from 'UTC' then raise exception 'Leaderboard timezone must be UTC.' using errcode = '22023'; end if;
  if p_month_start <> date_trunc('month', p_month_start)::date
    or p_occurred_on < p_month_start or p_occurred_on >= (p_month_start + interval '1 month')::date
    or p_occurred_on > (current_timestamp at time zone 'UTC')::date then
    raise exception 'Award date must belong to the competition month.' using errcode = '22023';
  end if;
  if p_awards is null or jsonb_typeof(p_awards) <> 'array' then
    raise exception 'Awards must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_awards) < 1 or jsonb_array_length(p_awards) > 100 then
    raise exception 'Award batch size must be between 1 and 100.' using errcode = '22023';
  end if;
  insert into leaderboard_competitions (
    organization_id, club_id, team_id, squad_organization_id, squad_team_id,
    month_start, timezone, created_by
  ) values (
    p_organization_id, p_club_id, p_team_id, p_squad_organization_id, p_squad_team_id,
    p_month_start, p_timezone, p_actor_id
  ) on conflict (team_id, month_start) do nothing;
  select * into competition from leaderboard_competitions
  where team_id = p_team_id and month_start = p_month_start for update;
  if competition.organization_id <> p_organization_id
    or competition.club_id is distinct from p_club_id
    or competition.squad_organization_id <> p_squad_organization_id
    or competition.squad_team_id <> p_squad_team_id or competition.timezone <> 'UTC' then
    raise exception 'Competition tenant mapping mismatch.' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_awards) as item(squad_player_id uuid, squad_roster_membership_id uuid,
      player_source_key text, display_name_snapshot text, points integer, placement integer)
    where item.points is null or item.points not between 1 and 1000 or (item.placement is not null and item.placement not between 1 and 1000)
      or coalesce(btrim(item.player_source_key), '') = '' or coalesce(btrim(item.display_name_snapshot), '') = ''
  ) then raise exception 'Invalid award payload.' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_awards) as item(squad_player_id uuid, squad_roster_membership_id uuid, player_source_key text) where not exists (
        select 1 from squad_roster_memberships roster join squad_players player
          on player.id = roster.player_id and player.organization_id = roster.organization_id
        where roster.id = item.squad_roster_membership_id and roster.organization_id = p_squad_organization_id and roster.team_id = p_squad_team_id and roster.player_id = item.squad_player_id
          and roster.status = 'active' and roster.deleted_at is null and player.status = 'active' and player.deleted_at is null
          and coalesce(nullif(player.metadata ->> 'legacyId', ''), player.id::text) = btrim(item.player_source_key)
      )
  ) then raise exception 'Award player is not an active mapped team roster member.' using errcode = '42501'; end if;
  select * into scoring_event from leaderboard_scoring_events
  where competition_id = competition.id and idempotency_key = p_idempotency_key for update;
  if found then
    if scoring_event.request_hash <> p_request_hash then
      raise exception 'Idempotency key was already used for another request.' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', scoring_event.id, 'month', to_char(competition.month_start, 'YYYY-MM'), 'replayed', true);
  end if;
  if p_month_start <> date_trunc('month', current_timestamp at time zone 'UTC')::date then
    raise exception 'Historical Leaderboard months are read-only.' using errcode = '55000'; end if;
  if competition.status <> 'open' then
    raise exception 'Competition is not open for scoring.' using errcode = '55000';
  end if;
  insert into leaderboard_scoring_events (
    competition_id, organization_id, team_id, occurred_on, title, note,
    idempotency_key, request_hash, created_by
  ) values (
    competition.id, p_organization_id, p_team_id, p_occurred_on, btrim(p_title), coalesce(btrim(p_note), ''),
    p_idempotency_key, p_request_hash, p_actor_id
  ) returning * into scoring_event;
  for award in select value from jsonb_array_elements(p_awards) loop
    award_player_id := (award ->> 'squad_player_id')::uuid;
    roster_id := (award ->> 'squad_roster_membership_id')::uuid;
    source_key := btrim(award ->> 'player_source_key');
    display_name := btrim(award ->> 'display_name_snapshot');
    points := (award ->> 'points')::integer;
    award_placement := nullif(award ->> 'placement', '')::integer;
    insert into leaderboard_participants (
      competition_id, organization_id, team_id, squad_organization_id, squad_team_id,
      squad_player_id, squad_roster_membership_id, player_source_key, display_name_snapshot
    ) values (
      competition.id, p_organization_id, p_team_id, p_squad_organization_id, p_squad_team_id,
      award_player_id, roster_id, source_key, display_name
    ) on conflict (competition_id, squad_player_id) do nothing;
    select id into award_participant_id from leaderboard_participants
    where competition_id = competition.id and squad_player_id = award_player_id;
    insert into leaderboard_point_transactions (
      competition_id, event_id, participant_id, organization_id, team_id,
      kind, points_delta, placement, created_by
    ) values (
      competition.id, scoring_event.id, award_participant_id, p_organization_id, p_team_id,
      'award', points, award_placement, p_actor_id
    );
  end loop;
  insert into leaderboard_audit_events (
    competition_id, event_id, organization_id, team_id, action, idempotency_key, actor_id, details
  ) values (
    competition.id, scoring_event.id, p_organization_id, p_team_id, 'award-event', p_idempotency_key, p_actor_id,
    jsonb_build_object('awardCount', jsonb_array_length(p_awards), 'requestHash', p_request_hash)
  );
  return jsonb_build_object('eventId', scoring_event.id, 'month', to_char(competition.month_start, 'YYYY-MM'), 'replayed', false);
end;
$$;

create or replace function public.leaderboard_reverse_event(
  p_organization_id uuid, p_team_id uuid, p_event_id uuid,
  p_reason text, p_idempotency_key text, p_request_hash text, p_actor_id uuid
) returns jsonb language plpgsql security invoker
set search_path = public, extensions, pg_temp as $$
declare
  competition leaderboard_competitions%rowtype;
  scoring_event leaderboard_scoring_events%rowtype;
  target_competition_id uuid;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','coach']) then
    raise exception 'Active Leaderboard manager membership is required.' using errcode = '42501'; end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request hash.' using errcode = '22023'; end if;
  select event.competition_id into target_competition_id from leaderboard_scoring_events event
  where event.id = p_event_id and event.organization_id = p_organization_id and event.team_id = p_team_id;
  if not found then raise exception 'Scoring event was not found in this team.' using errcode = 'P0002'; end if;
  select * into competition from leaderboard_competitions where id = target_competition_id for update;
  select event.* into scoring_event from leaderboard_scoring_events event
  where event.id = p_event_id and event.competition_id = competition.id
    and event.organization_id = p_organization_id and event.team_id = p_team_id for update;
  if scoring_event.status = 'reversed' then
    if scoring_event.reversal_idempotency_key <> p_idempotency_key
      or scoring_event.reversal_request_hash <> p_request_hash then
      raise exception 'Idempotency key was already used for another reversal request.' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', scoring_event.id, 'month', to_char(competition.month_start, 'YYYY-MM'), 'replayed', true);
  end if;
  if competition.month_start <> date_trunc('month', current_timestamp at time zone 'UTC')::date then
    raise exception 'Historical Leaderboard months are read-only.' using errcode = '55000'; end if;
  if competition.status <> 'open' then raise exception 'Competition is not open.' using errcode = '55000'; end if;

  insert into leaderboard_point_transactions (
    competition_id, event_id, participant_id, organization_id, team_id,
    kind, points_delta, reverses_transaction_id, created_by
  ) select
    tx.competition_id, tx.event_id, tx.participant_id,
    tx.organization_id, tx.team_id, 'reversal', -tx.points_delta, tx.id, p_actor_id
  from leaderboard_point_transactions tx
  where tx.event_id = scoring_event.id and tx.kind = 'award';

  update leaderboard_scoring_events set
    status = 'reversed', reversed_at = now(), reversed_by = p_actor_id,
    reversal_reason = btrim(p_reason), reversal_idempotency_key = p_idempotency_key,
    reversal_request_hash = p_request_hash, updated_at = now()
  where id = scoring_event.id;
  insert into leaderboard_audit_events (
    competition_id, event_id, organization_id, team_id, action, idempotency_key, actor_id, details
  ) values (
    competition.id, scoring_event.id, p_organization_id, p_team_id, 'reverse-event', p_idempotency_key, p_actor_id,
    jsonb_build_object('reason', btrim(p_reason), 'requestHash', p_request_hash)
  );
  return jsonb_build_object('eventId', scoring_event.id, 'month', to_char(competition.month_start, 'YYYY-MM'), 'replayed', false);
end;
$$;

create or replace function public.leaderboard_month_snapshot(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_month_start date)
returns jsonb language plpgsql stable security invoker
set search_path = public, extensions, pg_temp as $$
declare
  competition leaderboard_competitions%rowtype;
  standings jsonb;
  events jsonb;
  summary jsonb;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical']) then
    raise exception 'Active Leaderboard staff membership is required.' using errcode = '42501'; end if;
  select * into competition from leaderboard_competitions
  where organization_id = p_organization_id and team_id = p_team_id and month_start = p_month_start;
  if not found then
    return jsonb_build_object('competition', null, 'summary', jsonb_build_object('participantCount', 0, 'totalPoints', 0, 'eventCount', 0), 'standings', '[]'::jsonb, 'events', '[]'::jsonb);
  end if;

  with totals as (
    select participant.id, participant.player_source_key, participant.display_name_snapshot,
      coalesce(sum(tx.points_delta), 0)::integer as points,
      count(distinct tx.event_id) filter (where tx.kind = 'award' and event.status = 'active')::integer as award_count,
      max(event.occurred_on) filter (where event.status = 'active') as last_award_on
    from leaderboard_participants participant
    left join leaderboard_point_transactions tx on tx.participant_id = participant.id
    left join leaderboard_scoring_events event on event.id = tx.event_id
    where participant.competition_id = competition.id
    group by participant.id
  ), ranked as (
    select totals.*, rank() over (order by points desc) as leaderboard_rank from totals
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', player_source_key, 'displayName', display_name_snapshot,
    'points', points, 'rank', leaderboard_rank, 'awardCount', award_count, 'lastAwardOn', last_award_on
  ) order by leaderboard_rank, display_name_snapshot, player_source_key), '[]'::jsonb) into standings from ranked;

  select jsonb_build_object(
    'participantCount', count(*), 'totalPoints', coalesce(sum(points), 0),
    'eventCount', (select count(*) from leaderboard_scoring_events where competition_id = competition.id and status = 'active'),
    'topPoints', coalesce(max(points), 0), 'averagePoints', coalesce(round(avg(points), 2), 0)
  ) into summary from (
    select participant.id, coalesce(sum(tx.points_delta), 0)::integer as points
    from leaderboard_participants participant
    left join leaderboard_point_transactions tx on tx.participant_id = participant.id
    where participant.competition_id = competition.id group by participant.id
  ) totals;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id, 'occurredOn', event.occurred_on, 'title', event.title, 'note', event.note,
    'status', event.status, 'points', coalesce(activity.original_points, 0), 'netPoints', coalesce(activity.net_points, 0),
    'createdByName', coalesce(nullif(creator.display_name, ''), 'Staff member'), 'createdAt', event.created_at,
    'reversedAt', event.reversed_at, 'reverseReason', event.reversal_reason, 'awards', coalesce(activity.awards, '[]'::jsonb)
  ) order by event.occurred_on desc, event.created_at desc), '[]'::jsonb) into events
  from leaderboard_scoring_events event
  left join platform_user_profiles creator on creator.user_id = event.created_by and creator.deleted_at is null
  left join lateral (
    select sum(tx.points_delta) filter (where tx.kind = 'award') as original_points,
      sum(tx.points_delta) as net_points,
      coalesce(jsonb_agg(jsonb_build_object(
        'playerId', participant.player_source_key, 'playerName', participant.display_name_snapshot,
        'points', tx.points_delta, 'placement', tx.placement
      ) order by tx.placement nulls last, participant.display_name_snapshot)
        filter (where tx.kind = 'award'), '[]'::jsonb) as awards
    from leaderboard_point_transactions tx
    join leaderboard_participants participant on participant.id = tx.participant_id
    where tx.event_id = event.id
  ) activity on true where event.competition_id = competition.id;

  return jsonb_build_object(
    'competition', jsonb_build_object('id', competition.id, 'month', to_char(competition.month_start, 'YYYY-MM'), 'status', case when competition.month_start < date_trunc('month', current_timestamp at time zone 'UTC')::date then 'completed' else competition.status end, 'timezone', competition.timezone, 'updatedAt', competition.updated_at),
    'summary', summary, 'standings', standings, 'events', events
  );
end;
$$;

alter table public.leaderboard_competitions enable row level security;
alter table public.leaderboard_participants enable row level security;
alter table public.leaderboard_scoring_events enable row level security;
alter table public.leaderboard_point_transactions enable row level security;
alter table public.leaderboard_audit_events enable row level security;

revoke all on public.leaderboard_competitions, public.leaderboard_participants,
  public.leaderboard_scoring_events, public.leaderboard_point_transactions,
  public.leaderboard_audit_events from public, anon, authenticated;
grant select, insert, update on public.leaderboard_competitions to service_role;
grant select, insert on public.leaderboard_participants to service_role;
grant select, insert, update on public.leaderboard_scoring_events to service_role;
grant select, insert on public.leaderboard_point_transactions, public.leaderboard_audit_events to service_role;
grant select on public.platform_memberships, public.platform_teams, public.squad_roster_memberships, public.squad_players, public.platform_user_profiles to service_role;
revoke all on function public.leaderboard_award_batch(uuid,uuid,uuid,uuid,uuid,date,text,date,text,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.leaderboard_reverse_event(uuid,uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.leaderboard_month_snapshot(uuid,uuid,uuid,date) from public, anon, authenticated;
revoke all on function app_private.leaderboard_actor_has_role(uuid,uuid,uuid,text[]) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function public.leaderboard_award_batch(uuid,uuid,uuid,uuid,uuid,date,text,date,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.leaderboard_reverse_event(uuid,uuid,uuid,text,text,text,uuid) to service_role;
grant execute on function public.leaderboard_month_snapshot(uuid,uuid,uuid,date) to service_role;
grant execute on function app_private.leaderboard_actor_has_role(uuid,uuid,uuid,text[]) to service_role;

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('leaderboard', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical'], 'team', true, true, 'Read the active team monthly Leaderboard.'),
  ('leaderboard', 'write', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Award or reverse team Leaderboard points through the guarded API.'),
  ('leaderboard', 'delete', array['admin'], 'team', true, true, 'No hard delete; administrative correction uses reversal.'),
  ('leaderboard', 'export', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Export a monthly Leaderboard snapshot.'),
  ('leaderboard', 'restore', array['admin'], 'team', true, true, 'Restore Leaderboard data through audited recovery procedures.'),
  ('leaderboard', 'admin', array['admin'], 'team', true, true, 'Administer Leaderboard competition state.'),
  ('leaderboard', 'observe', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Observe Leaderboard integrity and audit health.')
on conflict (module_id, action) do update set
  roles = excluded.roles, scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description, updated_at = now();
