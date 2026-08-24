-- FS Player Elite workstation foundation.
-- Additive only: local video remains local and existing Workstation V2 rows stay valid.

create table if not exists public.video_timelines (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  description text check (description is null or char_length(description) <= 1000),
  is_default boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  unique (team_id, match_id, title)
);

create unique index if not exists video_timelines_active_default_uidx
  on public.video_timelines (team_id, match_id)
  where is_default = true and status = 'active';

alter table if exists public.video_timeline_lanes
  add column if not exists timeline_id uuid references public.video_timelines(id) on delete restrict,
  add column if not exists color text,
  add column if not exists hidden boolean not null default false,
  add column if not exists locked boolean not null default false,
  add column if not exists query_json jsonb not null default '{}'::jsonb,
  add column if not exists revision integer not null default 1 check (revision > 0);

alter table if exists public.video_timeline_lanes
  drop constraint if exists video_timeline_lanes_source_type_check;

alter table if exists public.video_timeline_lanes
  add constraint video_timeline_lanes_source_type_check
  check (source_type in (
    'phase', 'sub_phase', 'player', 'unit', 'outcome', 'descriptor', 'custom',
    'coding', 'query', 'graphic', 'manual'
  ));

alter table if exists public.video_timeline_lanes
  drop constraint if exists video_timeline_lanes_team_id_lane_key_key;

alter table if exists public.video_timeline_lanes
  drop constraint if exists video_timeline_lanes_color_check;

alter table if exists public.video_timeline_lanes
  add constraint video_timeline_lanes_color_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

create unique index if not exists video_timeline_lanes_timeline_key_uidx
  on public.video_timeline_lanes (timeline_id, lane_key)
  where timeline_id is not null;

create unique index if not exists video_timeline_lanes_legacy_team_key_uidx
  on public.video_timeline_lanes (team_id, lane_key)
  where timeline_id is null;

create index if not exists video_timeline_lanes_timeline_order_idx
  on public.video_timeline_lanes (timeline_id, sort_order, id)
  where status = 'active';

create table if not exists public.video_timeline_lane_clips (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  timeline_id uuid not null references public.video_timelines(id) on delete restrict,
  lane_id uuid not null references public.video_timeline_lanes(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (lane_id, clip_instance_id)
);

create index if not exists video_timeline_lane_clips_timeline_lane_order_idx
  on public.video_timeline_lane_clips (timeline_id, lane_id, sort_order, id)
  where status = 'active';

create index if not exists video_timeline_lane_clips_clip_idx
  on public.video_timeline_lane_clips (clip_instance_id, timeline_id)
  where status = 'active';

create table if not exists public.video_analysis_collaboration_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  timeline_id uuid references public.video_timelines(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_analysis_collaboration_sessions_match_idx
  on public.video_analysis_collaboration_sessions (match_id, created_at desc)
  where status = 'active';

create unique index if not exists video_analysis_collaboration_sessions_active_uidx
  on public.video_analysis_collaboration_sessions (
    team_id,
    match_id,
    coalesce(timeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create table if not exists public.video_analysis_collaboration_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  collaboration_session_id uuid not null references public.video_analysis_collaboration_sessions(id) on delete restrict,
  actor_id text not null check (char_length(actor_id) between 1 and 160),
  actor_name text check (actor_name is null or char_length(actor_name) <= 180),
  client_id text not null check (char_length(client_id) between 8 and 160),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (collaboration_session_id, actor_id, client_id)
);

create index if not exists video_analysis_collaboration_participants_active_idx
  on public.video_analysis_collaboration_participants (collaboration_session_id, last_seen_at desc)
  where status = 'active';

create table if not exists public.video_analysis_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid references public.video_matches(id) on delete restrict,
  video_id uuid references public.video_videos(id) on delete restrict,
  timeline_id uuid references public.video_timelines(id) on delete restrict,
  collaboration_session_id uuid references public.video_analysis_collaboration_sessions(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 12 and 180),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  operation_type text not null check (char_length(operation_type) between 2 and 120),
  expected_revision integer check (expected_revision is null or expected_revision > 0),
  resulting_revision integer check (resulting_revision is null or resulting_revision > 0),
  operation_status text not null default 'applied' check (operation_status in ('applied', 'rejected', 'reverted')),
  payload jsonb not null default '{}'::jsonb,
  inverse_payload jsonb not null default '{}'::jsonb,
  actor_id text check (actor_id is null or char_length(actor_id) <= 160),
  actor_name text check (actor_name is null or char_length(actor_name) <= 180),
  client_id text check (client_id is null or char_length(client_id) <= 160),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (team_id, idempotency_key)
);

create index if not exists video_analysis_operations_match_created_idx
  on public.video_analysis_operations (match_id, created_at, id)
  where operation_status = 'applied';

create index if not exists video_analysis_operations_timeline_created_idx
  on public.video_analysis_operations (timeline_id, created_at, id)
  where operation_status = 'applied';

alter table if exists public.video_clip_instances
  add column if not exists revision integer not null default 1 check (revision > 0),
  add column if not exists updated_by text check (updated_by is null or char_length(updated_by) <= 160);

create or replace function app_private.video_analysis_increment_clip_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

revoke all on function app_private.video_analysis_increment_clip_revision() from public, anon, authenticated;
grant execute on function app_private.video_analysis_increment_clip_revision() to service_role;

drop trigger if exists video_clip_instances_increment_revision on public.video_clip_instances;
create trigger video_clip_instances_increment_revision
  before update on public.video_clip_instances
  for each row execute function app_private.video_analysis_increment_clip_revision();

alter table if exists public.video_coding_buttons
  add column if not exists exclusive_group_key text
  check (exclusive_group_key is null or char_length(exclusive_group_key) between 1 and 120);

create index if not exists video_coding_buttons_exclusive_group_idx
  on public.video_coding_buttons (template_id, exclusive_group_key, sort_order, id)
  where status = 'active' and exclusive_group_key is not null;

alter table if exists public.video_coding_button_links
  drop constraint if exists video_coding_button_links_link_type_check;

alter table if exists public.video_coding_button_links
  add constraint video_coding_button_links_link_type_check
  check (link_type in ('activates', 'suggests', 'requires', 'excludes'));

alter table public.video_timelines enable row level security;
alter table public.video_timeline_lane_clips enable row level security;
alter table public.video_analysis_collaboration_sessions enable row level security;
alter table public.video_analysis_collaboration_participants enable row level security;
alter table public.video_analysis_operations enable row level security;

revoke all on public.video_timelines from anon, authenticated;
revoke all on public.video_timeline_lane_clips from anon, authenticated;
revoke all on public.video_analysis_collaboration_sessions from anon, authenticated;
revoke all on public.video_analysis_collaboration_participants from anon, authenticated;
revoke all on public.video_analysis_operations from anon, authenticated;

grant select, insert, update, delete on public.video_timelines to service_role;
grant select, insert, update, delete on public.video_timeline_lane_clips to service_role;
grant select, insert, update, delete on public.video_analysis_collaboration_sessions to service_role;
grant select, insert, update, delete on public.video_analysis_collaboration_participants to service_role;
grant select, insert on public.video_analysis_operations to service_role;

drop trigger if exists video_timelines_touch_updated_at on public.video_timelines;
create trigger video_timelines_touch_updated_at
  before update on public.video_timelines
  for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_timeline_lane_clips_touch_updated_at on public.video_timeline_lane_clips;
create trigger video_timeline_lane_clips_touch_updated_at
  before update on public.video_timeline_lane_clips
  for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_analysis_collaboration_sessions_touch_updated_at on public.video_analysis_collaboration_sessions;
create trigger video_analysis_collaboration_sessions_touch_updated_at
  before update on public.video_analysis_collaboration_sessions
  for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_analysis_collaboration_participants_prevent_hard_delete on public.video_analysis_collaboration_participants;
create trigger video_analysis_collaboration_participants_prevent_hard_delete
  before delete on public.video_analysis_collaboration_participants
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_timelines_prevent_hard_delete on public.video_timelines;
create trigger video_timelines_prevent_hard_delete
  before delete on public.video_timelines
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_timeline_lane_clips_prevent_hard_delete on public.video_timeline_lane_clips;
create trigger video_timeline_lane_clips_prevent_hard_delete
  before delete on public.video_timeline_lane_clips
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_analysis_collaboration_sessions_prevent_hard_delete on public.video_analysis_collaboration_sessions;
create trigger video_analysis_collaboration_sessions_prevent_hard_delete
  before delete on public.video_analysis_collaboration_sessions
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_analysis_operations_prevent_hard_delete on public.video_analysis_operations;
create trigger video_analysis_operations_prevent_hard_delete
  before delete on public.video_analysis_operations
  for each row execute function app_private.video_analysis_prevent_hard_delete();

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('video-analysis', 'collaborate', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Join shared analysis sessions and create audited idempotent coding operations.'),
  ('video-analysis', 'process-local-media', array['admin','club-admin','team-admin','coach','analyst','performance'], 'team', true, true, 'Run authorized device-local media preparation, tracking, synchronization, and export jobs.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();

create or replace function app_private.video_analysis_timeline_snapshot(
  p_timeline_id uuid,
  p_team_id text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', timeline.id,
    'matchId', timeline.match_id,
    'title', timeline.title,
    'description', timeline.description,
    'isDefault', timeline.is_default,
    'revision', timeline.revision,
    'status', timeline.status,
    'updatedAt', timeline.updated_at,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', lane.id,
          'label', lane.label,
          'kind', lane.source_type,
          'color', lane.color,
          'sortOrder', lane.sort_order,
          'hidden', lane.hidden,
          'locked', lane.locked,
          'query', lane.query_json,
          'revision', lane.revision,
          'clipIds', coalesce((
            select jsonb_agg(link.clip_instance_id order by link.sort_order, link.id)
            from public.video_timeline_lane_clips link
            where link.lane_id = lane.id
              and link.team_id = p_team_id
              and link.status = 'active'
          ), '[]'::jsonb)
        ) order by lane.sort_order, lane.id
      )
      from public.video_timeline_lanes lane
      where lane.timeline_id = timeline.id
        and lane.team_id = p_team_id
        and lane.status = 'active'
    ), '[]'::jsonb)
  )
  from public.video_timelines timeline
  where timeline.id = p_timeline_id
    and timeline.team_id = p_team_id;
$$;

revoke all on function app_private.video_analysis_timeline_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function app_private.video_analysis_timeline_snapshot(uuid, text) to service_role;

create or replace function public.video_analysis_save_timeline(
  p_organization_id text,
  p_team_id text,
  p_actor_id text,
  p_timeline jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_timeline_id uuid;
  v_match_id uuid;
  v_requested_id text := nullif(trim(p_timeline ->> 'id'), '');
  v_expected_revision integer := nullif(p_timeline ->> 'expectedRevision', '')::integer;
  v_resulting_revision integer;
  v_existing_operation_timeline_id uuid;
  v_collaboration_session_id uuid;
  v_before jsonb := '{}'::jsonb;
  v_row jsonb;
  v_row_id uuid;
  v_row_key text;
  v_row_kind text;
  v_row_color text;
  v_row_revision integer;
  v_clip_value jsonb;
  v_clip_id uuid;
  v_kept_row_ids uuid[] := '{}'::uuid[];
  v_kept_clip_ids uuid[];
begin
  if char_length(p_organization_id) not between 1 and 160
    or char_length(p_team_id) not between 1 and 160 then
    raise exception 'A valid organization and team scope is required.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 12 and 180 then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;
  if coalesce(p_timeline ->> 'matchId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'A valid match id is required.' using errcode = '22023';
  end if;
  v_match_id := (p_timeline ->> 'matchId')::uuid;
  if not exists (
    select 1 from public.video_matches
    where id = v_match_id
      and organization_id = p_organization_id
      and team_id = p_team_id
      and status = 'active'
  ) then
    raise exception 'Match not found in the active team scope.' using errcode = '22023';
  end if;
  if coalesce(p_timeline ->> 'collaborationSessionId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_collaboration_session_id := (p_timeline ->> 'collaborationSessionId')::uuid;
    if not exists (
      select 1 from public.video_analysis_collaboration_sessions session
      where session.id = v_collaboration_session_id
        and session.organization_id = p_organization_id
        and session.team_id = p_team_id
        and session.match_id = v_match_id
        and session.status = 'active'
    ) then
      raise exception 'Collaboration session not found in the active match scope.' using errcode = '22023';
    end if;
  end if;

  select operation.timeline_id
  into v_existing_operation_timeline_id
  from public.video_analysis_operations operation
  where operation.team_id = p_team_id
    and operation.idempotency_key = p_idempotency_key
  limit 1;
  if v_existing_operation_timeline_id is not null then
    return app_private.video_analysis_timeline_snapshot(v_existing_operation_timeline_id, p_team_id);
  end if;

  if coalesce((p_timeline ->> 'isDefault')::boolean, false) then
    update public.video_timelines
    set is_default = false
    where organization_id = p_organization_id
      and team_id = p_team_id
      and match_id = v_match_id
      and is_default = true
      and status = 'active';
  end if;

  if v_requested_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id, revision
    into v_timeline_id, v_resulting_revision
    from public.video_timelines
    where id = v_requested_id::uuid
      and organization_id = p_organization_id
      and team_id = p_team_id
    for update;
  end if;

  if v_timeline_id is null and v_requested_id is null then
    select id, revision
    into v_timeline_id, v_resulting_revision
    from public.video_timelines
    where organization_id = p_organization_id
      and team_id = p_team_id
      and match_id = v_match_id
      and title = left(trim(coalesce(p_timeline ->> 'title', 'Match timeline')), 180)
    for update;
  end if;

  if v_timeline_id is null then
    insert into public.video_timelines (
      organization_id,
      team_id,
      match_id,
      title,
      description,
      is_default,
      created_by,
      settings
    ) values (
      p_organization_id,
      p_team_id,
      v_match_id,
      left(trim(coalesce(p_timeline ->> 'title', 'Match timeline')), 180),
      nullif(left(trim(coalesce(p_timeline ->> 'description', '')), 1000), ''),
      coalesce((p_timeline ->> 'isDefault')::boolean, false),
      nullif(left(trim(coalesce(p_actor_id, '')), 160), ''),
      coalesce(p_timeline -> 'settings', '{}'::jsonb)
    )
    returning id, revision into v_timeline_id, v_resulting_revision;
  else
    v_before := coalesce(app_private.video_analysis_timeline_snapshot(v_timeline_id, p_team_id), '{}'::jsonb);
    if v_expected_revision is not null and v_expected_revision <> v_resulting_revision then
      raise exception 'Timeline revision conflict: expected %, current %.', v_expected_revision, v_resulting_revision
        using errcode = '40001';
    end if;
    update public.video_timelines
    set
      title = left(trim(coalesce(p_timeline ->> 'title', title)), 180),
      description = nullif(left(trim(coalesce(p_timeline ->> 'description', '')), 1000), ''),
      is_default = coalesce((p_timeline ->> 'isDefault')::boolean, is_default),
      revision = revision + 1,
      status = 'active',
      archived_at = null,
      settings = coalesce(p_timeline -> 'settings', settings)
    where id = v_timeline_id
      and organization_id = p_organization_id
      and team_id = p_team_id
    returning revision into v_resulting_revision;
  end if;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_timeline -> 'rows', '[]'::jsonb))
  loop
    v_row_id := null;
    v_row_key := left(trim(coalesce(v_row ->> 'id', v_row ->> 'label', 'row')), 120);
    if v_row_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select id into v_row_id
      from public.video_timeline_lanes
      where id = v_row_key::uuid
        and timeline_id = v_timeline_id
        and team_id = p_team_id
      for update;
    end if;
    if v_row_id is null then
      select id into v_row_id
      from public.video_timeline_lanes
      where timeline_id = v_timeline_id
        and team_id = p_team_id
        and lane_key = v_row_key
      for update;
    end if;
    v_row_kind := lower(trim(coalesce(v_row ->> 'kind', 'manual')));
    if v_row_kind not in ('phase', 'sub_phase', 'player', 'unit', 'outcome', 'descriptor', 'custom', 'coding', 'query', 'graphic', 'manual') then
      v_row_kind := 'manual';
    end if;
    v_row_color := nullif(trim(coalesce(v_row ->> 'color', '')), '');
    if v_row_color is not null and v_row_color !~ '^#[0-9A-Fa-f]{6}$' then
      v_row_color := null;
    end if;
    if v_row_id is null then
      insert into public.video_timeline_lanes (
        organization_id,
        team_id,
        timeline_id,
        lane_key,
        label,
        source_type,
        color,
        sort_order,
        hidden,
        locked,
        query_json,
        created_by
      ) values (
        p_organization_id,
        p_team_id,
        v_timeline_id,
        v_row_key,
        left(trim(coalesce(v_row ->> 'label', 'Row')), 120),
        v_row_kind,
        v_row_color,
        greatest(0, coalesce((v_row ->> 'sortOrder')::integer, 0)),
        coalesce((v_row ->> 'hidden')::boolean, false),
        coalesce((v_row ->> 'locked')::boolean, false),
        coalesce(v_row -> 'query', '{}'::jsonb),
        nullif(left(trim(coalesce(p_actor_id, '')), 160), '')
      ) returning id, revision into v_row_id, v_row_revision;
    else
      update public.video_timeline_lanes
      set
        label = left(trim(coalesce(v_row ->> 'label', label)), 120),
        source_type = v_row_kind,
        color = v_row_color,
        sort_order = greatest(0, coalesce((v_row ->> 'sortOrder')::integer, sort_order)),
        hidden = coalesce((v_row ->> 'hidden')::boolean, hidden),
        locked = coalesce((v_row ->> 'locked')::boolean, locked),
        query_json = coalesce(v_row -> 'query', query_json),
        revision = revision + 1,
        status = 'active',
        archived_at = null
      where id = v_row_id
        and timeline_id = v_timeline_id
        and team_id = p_team_id
      returning revision into v_row_revision;
    end if;
    v_kept_row_ids := array_append(v_kept_row_ids, v_row_id);
    v_kept_clip_ids := '{}'::uuid[];
    for v_clip_value in
      select value from jsonb_array_elements(coalesce(v_row -> 'clipIds', '[]'::jsonb))
    loop
      if trim(both '"' from v_clip_value::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_clip_id := trim(both '"' from v_clip_value::text)::uuid;
        if exists (
          select 1 from public.video_clip_instances clip
          where clip.id = v_clip_id
            and clip.organization_id = p_organization_id
            and clip.team_id = p_team_id
            and clip.status = 'active'
        ) then
          insert into public.video_timeline_lane_clips (
            organization_id,
            team_id,
            timeline_id,
            lane_id,
            clip_instance_id,
            sort_order,
            created_by
          ) values (
            p_organization_id,
            p_team_id,
            v_timeline_id,
            v_row_id,
            v_clip_id,
            coalesce(array_length(v_kept_clip_ids, 1), 0),
            nullif(left(trim(coalesce(p_actor_id, '')), 160), '')
          )
          on conflict (lane_id, clip_instance_id) do update
          set
            status = 'active',
            archived_at = null,
            sort_order = excluded.sort_order;
          v_kept_clip_ids := array_append(v_kept_clip_ids, v_clip_id);
        end if;
      end if;
    end loop;
    update public.video_timeline_lane_clips
    set status = 'archived', archived_at = now()
    where lane_id = v_row_id
      and team_id = p_team_id
      and status = 'active'
      and not (clip_instance_id = any(v_kept_clip_ids));
  end loop;

  update public.video_timeline_lanes
  set status = 'archived', archived_at = now()
  where timeline_id = v_timeline_id
    and team_id = p_team_id
    and status = 'active'
    and not (id = any(v_kept_row_ids));

  insert into public.video_analysis_operations (
    organization_id,
    team_id,
    match_id,
    timeline_id,
    collaboration_session_id,
    idempotency_key,
    entity_type,
    entity_id,
    operation_type,
    expected_revision,
    resulting_revision,
    payload,
    inverse_payload,
    actor_id,
    client_id,
    applied_at
  ) values (
    p_organization_id,
    p_team_id,
    v_match_id,
    v_timeline_id,
    v_collaboration_session_id,
    p_idempotency_key,
    'timeline',
    v_timeline_id,
    'timeline.save',
    v_expected_revision,
    v_resulting_revision,
    p_timeline,
    v_before,
    nullif(left(trim(coalesce(p_actor_id, '')), 160), ''),
    nullif(left(trim(coalesce(p_timeline ->> 'clientId', '')), 160), ''),
    now()
  );

  return app_private.video_analysis_timeline_snapshot(v_timeline_id, p_team_id);
end;
$$;

revoke all on function public.video_analysis_save_timeline(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.video_analysis_save_timeline(text, text, text, jsonb, text) to service_role;
