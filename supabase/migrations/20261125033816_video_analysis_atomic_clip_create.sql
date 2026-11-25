-- Create the clip, its relations and the optional automatic phase together.
create function public.video_analysis_create_clip(
  p_organization_id text, p_team_id text, p_actor_id text,
  p_clip jsonb, p_relations jsonb, p_auto_phase boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  input public.video_clip_instances%rowtype;
  fixture public.video_matches%rowtype;
  video public.video_videos%rowtype;
  clip_id uuid;
  phase_id uuid;
  legacy_phase boolean;
  relation_name text;
  moment_key text;
  phase_visibility text;
begin
  if nullif(btrim(p_organization_id), '') is null or nullif(btrim(p_team_id), '') is null
    or nullif(btrim(p_actor_id), '') is null or p_auto_phase is null
    or jsonb_typeof(p_clip) is distinct from 'object'
    or jsonb_typeof(p_relations) is distinct from 'object' then
    raise exception 'Clip scope, actor and payload are required.' using errcode = '22023';
  end if;
  foreach relation_name in array array['players', 'tags', 'labels', 'descriptors'] loop
    if jsonb_typeof(p_relations -> relation_name) is distinct from 'array'
      or jsonb_array_length(p_relations -> relation_name) > 1000 then
      raise exception 'Invalid clip relation list.' using errcode = '22023';
    end if;
  end loop;

  input := jsonb_populate_record(null::public.video_clip_instances, p_clip);
  select * into fixture from public.video_matches where id = input.match_id and status = 'active'
    and organization_id = p_organization_id and team_id = p_team_id for share;
  if not found then raise exception 'Clip match could not be found.' using errcode = 'P0002'; end if;
  select * into video from public.video_videos where id = input.video_id and match_id = fixture.id
    and status <> 'archived' and organization_id = p_organization_id and team_id = p_team_id for share;
  if not found then raise exception 'Clip video could not be found.' using errcode = 'P0002'; end if;
  if input.coding_template_id is not null and not exists (
    select 1 from public.video_coding_templates where id = input.coding_template_id
      and organization_id = p_organization_id and team_id = p_team_id
  ) then raise exception 'Invalid clip coding template.' using errcode = '42501'; end if;
  if input.coding_button_id is not null and not exists (
    select 1 from public.video_coding_buttons where id = input.coding_button_id
      and organization_id = p_organization_id and team_id = p_team_id
      and (input.coding_template_id is null or template_id = input.coding_template_id)
  ) then raise exception 'Invalid clip coding button.' using errcode = '42501'; end if;

  moment_key := nullif(btrim(input.metadata ->> 'momentKey'), '');
  if p_auto_phase and (input.metadata ->> 'clipKind' is distinct from 'subPhase'
    or moment_key is null or char_length(moment_key) > 240) then
    raise exception 'A new sub-phase tag and its moment are required.' using errcode = '22023';
  end if;

  -- A tab opened before the release can still send the old second request.
  legacy_phase := (input.metadata ->> 'clipKind' = 'phase' and input.metadata ->> 'source' = 'auto-phase-from-sub-phase'
    and input.sub_phase = input.phase and moment_key is not null) is true;
  if p_auto_phase or legacy_phase then
    phase_visibility := coalesce(input.metadata ->> 'visibility', 'private');
    perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(
      'video-analysis-auto-phase', video.id, input.phase, input.start_ms, input.end_ms, moment_key
    )::text, 0));
    select c.id into phase_id from public.video_clip_instances c where c.organization_id = p_organization_id
      and c.team_id = p_team_id and c.match_id = fixture.id and c.video_id = video.id and c.status = 'active'
      and c.phase = input.phase and c.start_ms = input.start_ms and c.end_ms = input.end_ms
      and c.metadata ->> 'clipKind' = 'phase' and c.metadata ->> 'momentKey' = moment_key
      and coalesce(c.metadata ->> 'visibility', 'private') = phase_visibility
      and (phase_visibility <> 'private' or c.created_by = p_actor_id)
      order by c.created_at, c.id limit 1;
    if legacy_phase and phase_id is not null then
      return jsonb_build_object('clip', app_private.video_analysis_clip_snapshot(phase_id, p_organization_id, p_team_id),
        'match', to_jsonb(fixture), 'video', to_jsonb(video), 'reused', true);
    end if;
  end if;

  insert into public.video_clip_instances (
    organization_id, team_id, match_id, video_id, start_ms, end_ms, period, phase, sub_phase,
    team_principle_id, mini_game_principle_id, outcome, coding_mode, coding_template_id,
    coding_button_id, pre_roll_ms, post_roll_ms, metadata, created_by, updated_by
  ) values (
    p_organization_id, p_team_id, fixture.id, video.id, input.start_ms, input.end_ms, input.period,
    input.phase, input.sub_phase, input.team_principle_id, input.mini_game_principle_id, input.outcome,
    input.coding_mode, input.coding_template_id, input.coding_button_id, input.pre_roll_ms,
    input.post_roll_ms, input.metadata, p_actor_id, p_actor_id
  ) returning id into clip_id;

  insert into public.video_clip_players (organization_id, team_id, clip_instance_id, player_id, player_label, role)
    select p_organization_id, p_team_id, clip_id, item ->> 'playerId', item ->> 'playerLabel', item ->> 'role'
    from jsonb_array_elements(p_relations -> 'players') as items(item)
    on conflict (clip_instance_id, player_id, role) do nothing;
  insert into public.video_clip_tags (organization_id, team_id, clip_instance_id, tag)
    select p_organization_id, p_team_id, clip_id, item
    from jsonb_array_elements_text(p_relations -> 'tags') as items(item)
    on conflict (clip_instance_id, tag) do nothing;
  insert into public.video_clip_labels (organization_id, team_id, clip_instance_id, label_type, label_value, label_text, created_by)
    select p_organization_id, p_team_id, clip_id, item ->> 'type', item ->> 'value', item ->> 'label', p_actor_id
    from jsonb_array_elements(p_relations -> 'labels') as items(item)
    on conflict (clip_instance_id, label_type, label_value) do nothing;
  insert into public.video_clip_descriptors (organization_id, team_id, clip_instance_id, descriptor_type, descriptor_value, descriptor_label, created_by)
    select p_organization_id, p_team_id, clip_id, item ->> 'type', item ->> 'value', item ->> 'label', p_actor_id
    from jsonb_array_elements(p_relations -> 'descriptors') as items(item)
    on conflict (clip_instance_id, descriptor_type, descriptor_value) do nothing;
  if coalesce(p_relations ->> 'note', '') <> '' then
    insert into public.video_clip_notes (organization_id, team_id, clip_instance_id, note, created_by)
      values (p_organization_id, p_team_id, clip_id, p_relations ->> 'note', p_actor_id);
  end if;

  if p_auto_phase and phase_id is null then
    insert into public.video_clip_instances (
      organization_id, team_id, match_id, video_id, start_ms, end_ms, period, phase, sub_phase,
      outcome, coding_mode, coding_template_id, coding_button_id, pre_roll_ms,
      post_roll_ms, metadata, created_by, updated_by
    ) values (
      p_organization_id, p_team_id, fixture.id, video.id, input.start_ms, input.end_ms, input.period,
      input.phase, input.phase, input.outcome, 'instant', input.coding_template_id, input.coding_button_id, 0,
      input.end_ms - input.start_ms, input.metadata || jsonb_build_object(
        'clipKind', 'phase', 'labelOnly', true, 'source', 'auto-phase-from-sub-phase', 'sourceSubPhase', input.sub_phase
      ), p_actor_id, p_actor_id
    ) returning id into phase_id;
    insert into public.video_clip_labels (organization_id, team_id, clip_instance_id, label_type, label_value, label_text, created_by)
      values (p_organization_id, p_team_id, phase_id, 'phase', input.phase, input.phase, p_actor_id);
  else
    phase_id := null;
  end if;

  return jsonb_build_object(
    'clip', app_private.video_analysis_clip_snapshot(clip_id, p_organization_id, p_team_id),
    'phaseClip', case when phase_id is not null then app_private.video_analysis_clip_snapshot(phase_id, p_organization_id, p_team_id) end,
    'match', to_jsonb(fixture), 'video', to_jsonb(video)
  );
end;
$$;

revoke all on function public.video_analysis_create_clip(text, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.video_analysis_create_clip(text, text, text, jsonb, jsonb, boolean) to service_role;
