-- Existing clip edits are atomic. Replaced relations remain archived, never deleted.
alter table public.video_clip_players add column if not exists archived_at timestamptz;
alter table public.video_clip_tags add column if not exists archived_at timestamptz;
alter table public.video_clip_labels add column if not exists archived_at timestamptz;
alter table public.video_clip_descriptors add column if not exists archived_at timestamptz;
alter table public.video_clip_notes add column if not exists archived_at timestamptz;

create or replace function app_private.video_analysis_clip_snapshot(p_id uuid, p_organization_id text, p_team_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  result jsonb;
  relation record;
  children jsonb;
begin
  select to_jsonb(c) into result from public.video_clip_instances c
    where c.id = p_id and c.organization_id = p_organization_id and c.team_id = p_team_id;
  for relation in select * from (values
    ('video_clip_players', 'players'), ('video_clip_tags', 'tags'), ('video_clip_labels', 'labels'),
    ('video_clip_descriptors', 'descriptors'), ('video_clip_notes', 'notes')
  ) as relations(table_name, field_name) loop
    execute format('select coalesce(jsonb_agg(%s order by r.created_at, r.id), ''[]''::jsonb)
      from public.%I r where clip_instance_id = $1 and organization_id = $2 and team_id = $3 and archived_at is null',
      case when relation.field_name = 'tags' then 'to_jsonb(r.tag)' else 'to_jsonb(r)' end, relation.table_name)
      into children using p_id, p_organization_id, p_team_id;
    result := result || jsonb_build_object(relation.field_name, children);
  end loop;
  return result;
end;
$$;

revoke all on function app_private.video_analysis_clip_snapshot(uuid, text, text) from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.video_analysis_clip_snapshot(uuid, text, text) to service_role;

create or replace function public.video_analysis_update_clip(
  p_organization_id text, p_team_id text, p_actor_id text, p_id uuid,
  p_expected_revision integer, p_clip jsonb, p_relations jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous public.video_clip_instances%rowtype;
  saved public.video_clip_instances%rowtype;
  fixture public.video_matches%rowtype;
  video public.video_videos%rowtype;
  before_record jsonb;
  after_record jsonb;
  item jsonb;
  table_name text;
  mismatched boolean;
  visibility text;
begin
  if nullif(btrim(p_organization_id), '') is null or nullif(btrim(p_team_id), '') is null
    or nullif(btrim(p_actor_id), '') is null or p_id is null
    or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Clip scope, actor and expected revision are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_clip) is distinct from 'object' or jsonb_typeof(p_relations) is distinct from 'object' then
    raise exception 'Invalid clip update payload.' using errcode = '22023';
  end if;
  foreach table_name in array array['players', 'tags', 'labels', 'descriptors'] loop
    if jsonb_typeof(p_relations -> table_name) is distinct from 'array' then
      raise exception 'Invalid clip relation list.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_relations -> table_name) > 1000 then
      raise exception 'Too many clip relations.' using errcode = '22023';
    end if;
  end loop;

  select * into previous from public.video_clip_instances
    where id = p_id and organization_id = p_organization_id and team_id = p_team_id and status = 'active'
    for update;
  if not found then raise exception 'Clip could not be found.' using errcode = 'P0002'; end if;
  visibility := lower(replace(coalesce(nullif(previous.metadata ->> 'visibility', ''), 'team'), '_', '-'));
  if visibility not in ('team', 'shared', 'public', 'idp', 'player', 'player-safe', 'idp-shared')
    and p_actor_id <> coalesce(nullif(previous.metadata ->> 'ownerId', ''), nullif(previous.metadata ->> 'owner_id', ''), previous.created_by, '')
    and p_actor_id <> coalesce(previous.created_by, '') then
    raise exception 'Private clips can only be changed by their owner.' using errcode = '42501';
  end if;
  if previous.revision <> p_expected_revision then
    raise exception 'Clip revision conflict. Reload the clip before saving again.' using errcode = '40001';
  end if;
  if (p_clip ->> 'match_id')::uuid is distinct from previous.match_id
    or (p_clip ->> 'video_id')::uuid is distinct from previous.video_id then
    raise exception 'An existing clip cannot be moved to another match or video.' using errcode = '22023';
  end if;
  select * into fixture from public.video_matches where id = previous.match_id
    and organization_id = p_organization_id and team_id = p_team_id and status = 'active';
  if not found then raise exception 'Clip match could not be found.' using errcode = 'P0002'; end if;
  select * into video from public.video_videos where id = previous.video_id and match_id = previous.match_id
    and organization_id = p_organization_id and team_id = p_team_id and status <> 'archived';
  if not found then raise exception 'Clip video could not be found.' using errcode = 'P0002'; end if;
  if nullif(p_clip ->> 'coding_template_id', '') is not null and not exists (
    select 1 from public.video_coding_templates where id = (p_clip ->> 'coding_template_id')::uuid
      and organization_id = p_organization_id and team_id = p_team_id
  ) then raise exception 'Invalid clip coding template.' using errcode = '42501'; end if;
  if nullif(p_clip ->> 'coding_button_id', '') is not null and not exists (
    select 1 from public.video_coding_buttons where id = (p_clip ->> 'coding_button_id')::uuid
      and organization_id = p_organization_id and team_id = p_team_id
      and (nullif(p_clip ->> 'coding_template_id', '') is null or template_id = (p_clip ->> 'coding_template_id')::uuid)
  ) then raise exception 'Invalid clip coding button.' using errcode = '42501'; end if;

  before_record := app_private.video_analysis_clip_snapshot(p_id, p_organization_id, p_team_id);
  update public.video_clip_instances set
    start_ms = (p_clip ->> 'start_ms')::integer, end_ms = (p_clip ->> 'end_ms')::integer,
    period = p_clip ->> 'period', phase = p_clip ->> 'phase', sub_phase = p_clip ->> 'sub_phase',
    team_principle_id = p_clip ->> 'team_principle_id', mini_game_principle_id = p_clip ->> 'mini_game_principle_id',
    outcome = p_clip ->> 'outcome', coding_mode = p_clip ->> 'coding_mode',
    coding_template_id = (p_clip ->> 'coding_template_id')::uuid, coding_button_id = (p_clip ->> 'coding_button_id')::uuid,
    pre_roll_ms = (p_clip ->> 'pre_roll_ms')::integer, post_roll_ms = (p_clip ->> 'post_roll_ms')::integer,
    metadata = p_clip -> 'metadata', updated_by = p_actor_id
    where id = p_id and organization_id = p_organization_id and team_id = p_team_id returning * into saved;

  foreach table_name in array array['video_clip_players', 'video_clip_tags', 'video_clip_labels', 'video_clip_descriptors', 'video_clip_notes'] loop
    execute format('select exists (select 1 from public.%I where clip_instance_id = $1
      and (organization_id <> $2 or team_id <> $3))', table_name)
      into mismatched using p_id, p_organization_id, p_team_id;
    if mismatched then raise exception 'Clip relation scope mismatch.' using errcode = '42501'; end if;
    execute format('update public.%I set archived_at = now() where clip_instance_id = $1
      and organization_id = $2 and team_id = $3 and archived_at is null', table_name)
      using p_id, p_organization_id, p_team_id;
  end loop;
  for item in select value from jsonb_array_elements(p_relations -> 'players') loop
    insert into public.video_clip_players (organization_id, team_id, clip_instance_id, player_id, player_label, role)
      values (p_organization_id, p_team_id, p_id, item ->> 'playerId', item ->> 'playerLabel', item ->> 'role')
      on conflict (clip_instance_id, player_id, role) do update set player_label = excluded.player_label, archived_at = null;
  end loop;
  for item in select value from jsonb_array_elements(p_relations -> 'tags') loop
    insert into public.video_clip_tags (organization_id, team_id, clip_instance_id, tag)
      values (p_organization_id, p_team_id, p_id, item #>> '{}')
      on conflict (clip_instance_id, tag) do update set archived_at = null;
  end loop;
  for item in select value from jsonb_array_elements(p_relations -> 'labels') loop
    insert into public.video_clip_labels (organization_id, team_id, clip_instance_id, label_type, label_value, label_text, created_by)
      values (p_organization_id, p_team_id, p_id, item ->> 'type', item ->> 'value', item ->> 'label', p_actor_id)
      on conflict (clip_instance_id, label_type, label_value) do update set label_text = excluded.label_text, archived_at = null;
  end loop;
  for item in select value from jsonb_array_elements(p_relations -> 'descriptors') loop
    insert into public.video_clip_descriptors (organization_id, team_id, clip_instance_id, descriptor_type, descriptor_value, descriptor_label, created_by)
      values (p_organization_id, p_team_id, p_id, item ->> 'type', item ->> 'value', item ->> 'label', p_actor_id)
      on conflict (clip_instance_id, descriptor_type, descriptor_value) do update set descriptor_label = excluded.descriptor_label, archived_at = null;
  end loop;
  if coalesce(p_relations ->> 'note', '') <> '' then
    insert into public.video_clip_notes (organization_id, team_id, clip_instance_id, note, created_by)
      values (p_organization_id, p_team_id, p_id, p_relations ->> 'note', p_actor_id);
  end if;
  after_record := app_private.video_analysis_clip_snapshot(p_id, p_organization_id, p_team_id);
  insert into public.video_clip_revisions (organization_id, team_id, clip_instance_id, revision_number, change_reason, before_record, after_record, created_by)
    values (p_organization_id, p_team_id, p_id, saved.revision, 'Atomic clip edit', before_record, after_record, p_actor_id);
  return jsonb_build_object('clip', after_record, 'match', to_jsonb(fixture), 'video', to_jsonb(video));
end;
$$;

revoke all on function public.video_analysis_update_clip(text, text, text, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.video_analysis_update_clip(text, text, text, uuid, integer, jsonb, jsonb) to service_role;

-- Keep the existing read-model contract, excluding superseded relations.
create or replace view public.video_clip_analysis_facts with (security_invoker = true) as
select
  clip.id, clip.organization_id, clip.team_id, clip.match_id, clip.video_id,
  clip.start_ms, clip.end_ms, clip.period, clip.phase, clip.sub_phase,
  clip.team_principle_id, clip.mini_game_principle_id, clip.outcome, clip.created_at, clip.updated_at,
  fixture.title as match_title, fixture.match_date, fixture.opponent, video.title as video_title,
  case when lower(coalesce(fixture.metadata ->> 'eventType', fixture.metadata ->> 'event_type', '')) = 'training'
    then 'training' else 'match' end as event_type,
  coalesce((select jsonb_agg(jsonb_build_object('player_id', player.player_id,
    'player_label', coalesce(player.player_label, player.player_id), 'role', player.role)
    order by player.role, coalesce(player.player_label, player.player_id), player.id)
    from public.video_clip_players player where player.clip_instance_id = clip.id
      and player.organization_id = clip.organization_id and player.team_id = clip.team_id
      and player.archived_at is null), '[]'::jsonb) as players,
  coalesce((select jsonb_agg(jsonb_build_object('id', label.label_value,
    'label', coalesce(label.label_text, label.label_value)) order by label.created_at, label.id)
    from public.video_clip_labels label where label.clip_instance_id = clip.id
      and label.organization_id = clip.organization_id and label.team_id = clip.team_id
      and label.label_type = 'mini_game_principle' and label.archived_at is null), '[]'::jsonb) as mini_game_principles,
  coalesce((select jsonb_agg(descriptor.descriptor_value order by descriptor.created_at, descriptor.id)
    from public.video_clip_descriptors descriptor where descriptor.clip_instance_id = clip.id
      and descriptor.organization_id = clip.organization_id and descriptor.team_id = clip.team_id
      and descriptor.descriptor_type = 'unit' and descriptor.archived_at is null), '[]'::jsonb) as units,
  coalesce((select jsonb_agg(tag.tag order by tag.created_at, tag.id)
    from public.video_clip_tags tag where tag.clip_instance_id = clip.id
      and tag.organization_id = clip.organization_id and tag.team_id = clip.team_id
      and tag.archived_at is null), '[]'::jsonb) as tags,
  coalesce((select jsonb_agg(jsonb_build_object('note', note.note) order by note.created_at, note.id)
    from public.video_clip_notes note where note.clip_instance_id = clip.id
      and note.organization_id = clip.organization_id and note.team_id = clip.team_id
      and note.archived_at is null), '[]'::jsonb) as notes
from public.video_clip_instances clip
join public.video_matches fixture on fixture.id = clip.match_id
  and fixture.organization_id = clip.organization_id and fixture.team_id = clip.team_id
join public.video_videos video on video.id = clip.video_id
  and video.organization_id = clip.organization_id and video.team_id = clip.team_id
where clip.status = 'active' and fixture.status = 'active' and video.status <> 'archived';

revoke all on public.video_clip_analysis_facts from public, anon, authenticated;
grant select on public.video_clip_analysis_facts to service_role;
