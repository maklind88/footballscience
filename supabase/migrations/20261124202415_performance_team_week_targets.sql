-- Add week goals to the existing revision history. Existing rows and grants stay in place.
alter table public.performance_load_records
  drop constraint performance_load_records_kind_check,
  drop constraint performance_load_records_check,
  drop constraint performance_load_records_distance_m_check,
  drop constraint performance_load_records_hsr_m_check,
  drop constraint performance_load_records_sprint_m_check,
  add constraint performance_load_records_kind_check check (kind in ('baseline', 'plan', 'week-goal')),
  add constraint performance_load_records_subject_check check (
    (kind = 'baseline' and activity_id = '' and (subject_key = 'team' or subject_key ~ '^(role|player):.+$'))
    or (kind = 'plan' and activity_id <> '' and subject_key ~ '^player:.+$')
    or (kind = 'week-goal' and activity_id = '' and subject_key ~ '^week:[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  ),
  add constraint performance_load_records_distance_m_check
    check (distance_m between 0 and case when kind = 'week-goal' then 10000000 else 1000000 end),
  add constraint performance_load_records_hsr_m_check
    check (hsr_m between 0 and case when kind = 'week-goal' then 10000000 else 1000000 end),
  add constraint performance_load_records_sprint_m_check
    check (sprint_m between 0 and case when kind = 'week-goal' then 10000000 else 1000000 end);

create or replace function public.read_performance_load_records(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid,
  p_subject_keys text[], p_activity_ids text[]
) returns jsonb language plpgsql stable security invoker
set search_path = '' as $$
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','coach','performance','medical']) then
    raise exception 'Active team membership required.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', kind, 'subjectKey', subject_key, 'activityId', activity_id, 'revision', revision,
      'targets', jsonb_strip_nulls(jsonb_build_object('distance', distance_m, 'hsr', hsr_m, 'sprint', sprint_m))
    )), '[]'::jsonb)
    from (
      select distinct on (record.kind, record.subject_key, record.activity_id)
        record.kind, record.subject_key, record.activity_id, record.revision,
        record.distance_m, record.hsr_m, record.sprint_m
      from public.performance_load_records record
      where record.organization_id = p_organization_id and record.team_id = p_team_id
        and record.subject_key = any(p_subject_keys)
        and (record.kind <> 'plan' or record.activity_id = any(p_activity_ids))
      order by record.kind, record.subject_key, record.activity_id, record.revision desc
    ) current_records
  );
end;
$$;

create or replace function public.save_performance_load_records(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_records jsonb
) returns void language plpgsql security invoker
set search_path = '' as $$
declare
  edit record;
  latest integer;
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','performance']) then
    raise exception 'Performance edit access required.' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Invalid Performance records.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) not between 1 and 500 then
    raise exception 'Invalid Performance batch size.' using errcode = '22023';
  end if;

  for edit in
    select *
    from jsonb_to_recordset(p_records) as input(
      kind text, subject_key text, activity_id text, base_revision integer,
      distance_m integer, hsr_m integer, sprint_m integer
    )
    order by kind, subject_key, activity_id
  loop
    select coalesce(max(saved.revision), 0) into latest
    from public.performance_load_records saved
    where saved.organization_id = p_organization_id and saved.team_id = p_team_id
      and saved.kind = edit.kind and saved.subject_key = edit.subject_key and saved.activity_id = edit.activity_id;

    if latest is distinct from edit.base_revision then
      raise exception 'Performance record has a newer revision.' using errcode = '40001';
    end if;
    insert into public.performance_load_records (
      organization_id, team_id, kind, subject_key, activity_id, revision,
      distance_m, hsr_m, sprint_m, updated_by
    ) values (
      p_organization_id, p_team_id, edit.kind, edit.subject_key, edit.activity_id, latest + 1,
      edit.distance_m, edit.hsr_m, edit.sprint_m, p_actor_id
    );
  end loop;
end;
$$;
