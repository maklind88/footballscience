-- Staging-only transactional acceptance. No fixtures survive the rollback.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'video_timelines', 'video_timeline_lane_clips',
    'video_analysis_collaboration_sessions', 'video_analysis_collaboration_participants',
    'video_analysis_operations', 'video_object_tracks', 'video_track_corrections',
    'video_dynamic_graphics', 'video_pitch_calibrations', 'video_pitch_calibration_frames',
    'video_portable_media_assets', 'video_portable_media_share_targets',
    'video_media_angles', 'video_export_manifests'
  ] loop
    if not exists (select 1 from pg_class where oid = to_regclass('public.' || relation_name) and relrowsecurity) then
      raise exception 'Missing RLS: %', relation_name;
    end if;
    if has_table_privilege('anon', 'public.' || relation_name, 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.' || relation_name, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Direct client access: %', relation_name;
    end if;
    if not has_table_privilege('service_role', 'public.' || relation_name, 'SELECT')
      or not has_table_privilege('service_role', 'public.' || relation_name, 'INSERT') then
      raise exception 'Missing API access: %', relation_name;
    end if;
  end loop;
  if not exists (select 1 from pg_class where oid = 'public.video_clip_analysis_facts'::regclass
      and reloptions @> array['security_invoker=true']) then
    raise exception 'Analysis view must use caller permissions.';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  fixture uuid;
  video uuid;
  clip uuid;
  track uuid;
  result jsonb;
  replay jsonb;
  operation text;
  scope_id text := 'fs-database-acceptance-' || gen_random_uuid()::text;
  operation_id text := gen_random_uuid()::text;
  revision_before integer;
  denied boolean := false;
begin
  insert into public.video_matches (organization_id, team_id, title)
    values (scope_id, scope_id, 'Transactional FS acceptance') returning id into fixture;
  insert into public.video_videos (organization_id, team_id, match_id, title, local_video_identifier)
    values (scope_id, scope_id, fixture, 'Synthetic acceptance source', scope_id) returning id into video;
  insert into public.video_clip_instances (organization_id, team_id, match_id, video_id, start_ms, end_ms, phase, sub_phase)
    values (scope_id, scope_id, fixture, video, 1000, 16000, 'In Possession', 'Build Up') returning id into clip;

  result := public.video_analysis_save_timeline(scope_id, scope_id, 'acceptance',
    jsonb_build_object('matchId', fixture, 'title', 'Acceptance', 'rows',
      jsonb_build_array(jsonb_build_object('id', 'row-a', 'label', 'Build Up', 'kind', 'manual', 'clipIds', jsonb_build_array(clip)))),
    operation_id);
  if jsonb_array_length(result -> 'rows') <> 1 then raise exception 'Timeline row was not saved.'; end if;
  replay := public.video_analysis_save_timeline(scope_id, scope_id, 'acceptance',
    jsonb_build_object('matchId', fixture, 'title', 'Acceptance'), operation_id);
  if result is distinct from replay then raise exception 'Timeline replay was not idempotent.'; end if;
  begin
    perform public.video_analysis_save_timeline(scope_id, scope_id || '-foreign', 'acceptance',
      jsonb_build_object('matchId', fixture, 'title', 'Denied'), gen_random_uuid()::text);
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'Cross-team timeline write was allowed.'; end if;

  insert into public.video_object_tracks (organization_id, team_id, match_id, video_id, clip_instance_id, start_ms, end_ms)
    values (scope_id, scope_id, fixture, video, clip, 1000, 16000) returning id, revision into track, revision_before;
  foreach operation in array array['position','identity','entity','occlusion','split','merge','identity-swap','reject','restore'] loop
    insert into public.video_track_corrections (organization_id, team_id, object_track_id, at_ms, correction_type, operation_id)
      values (scope_id, scope_id, track, 1000, operation, operation_id || '-' || operation);
  end loop;
  denied := false;
  begin
    insert into public.video_track_corrections (organization_id, team_id, object_track_id, at_ms, operation_id)
      values (scope_id, scope_id, track, 1000, operation_id || '-position');
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'Duplicate correction operation was accepted.'; end if;
  update public.video_object_tracks set status = 'archived' where id = track;
  update public.video_object_tracks set status = 'review' where id = track;
  if (select revision from public.video_object_tracks where id = track) <> revision_before + 2 then
    raise exception 'Tracking revision did not advance.';
  end if;
  update public.video_clip_instances set outcome = 'Positive' where id = clip;
  if (select revision from public.video_clip_instances where id = clip) <> 2 then
    raise exception 'Clip revision did not advance.';
  end if;
  if (select count(*) from public.video_clip_analysis_facts where id = clip) <> 1 then
    raise exception 'Analysis facts did not expose the scoped clip.';
  end if;
  denied := false;
  begin
    delete from public.video_track_corrections where object_track_id = track;
  exception when raise_exception then denied := true;
  end;
  if not denied then raise exception 'Hard-delete guard failed.'; end if;
end;
$$;
rollback;
select 'FS database acceptance passed; fixtures rolled back' as result;
