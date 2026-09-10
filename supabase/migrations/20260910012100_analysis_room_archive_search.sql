-- Analysis Room search-only read model. No source records or browser grants are changed.
grant usage on schema app_private to service_role;
create index if not exists video_library_search_cursor_idx
  on public.video_matches (organization_id, team_id, (coalesce(match_date, date '0001-01-01')) desc, id desc)
  where status = 'active';
create index if not exists video_library_search_search_idx
  on public.video_matches using gin ((lower(title || ' ' || coalesce(opponent, '') || ' ' || coalesce(competition, '') || ' ' || coalesce(venue, ''))) extensions.gin_trgm_ops)
  where status = 'active';
create index if not exists video_library_clip_count_idx
  on public.video_clip_instances (organization_id, team_id, match_id) where status = 'active';

create or replace function app_private.video_library_match_json(m public.video_matches, p_actor text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with videos as materialized (
    select v.* from public.video_videos v where v.organization_id = m.organization_id
      and v.team_id = m.team_id and v.match_id = m.id and v.status <> 'archived'
  ), sources as materialized (
    select s.* from public.video_sources s join videos v on v.id = s.video_id
    where s.organization_id = m.organization_id and s.team_id = m.team_id
      and s.match_id = m.id and s.status <> 'archived'
  ), preferred_source as (
    select * from sources order by (created_by = p_actor) desc nulls last, created_at desc, id desc limit 1
  ), preferred_video as (
    select * from videos order by (id = (select video_id from preferred_source)) desc nulls last, created_at desc, id desc limit 1
  )
  select to_jsonb(m) || jsonb_build_object(
    'latest_source', (select to_jsonb(s) from preferred_source s),
    'latest_video', (select to_jsonb(v) from preferred_video v),
    'source_count', (select count(*) from sources),
    'video_count', (select count(*) from videos),
    'clip_count', (select count(*) from public.video_clip_instances c where c.organization_id = m.organization_id
      and c.team_id = m.team_id and c.match_id = m.id and c.status = 'active')
  );
$$;
revoke all on function app_private.video_library_match_json(public.video_matches, text) from public, anon, authenticated;
grant execute on function app_private.video_library_match_json(public.video_matches, text) to service_role;

create or replace function public.video_library_search(
  p_organization_id text, p_team_id text, p_actor_id text,
  p_search text default '', p_type text default 'all',
  p_date_from date default null, p_date_to date default null,
  p_cursor_date date default null, p_cursor_id uuid default null, p_limit integer default 8
)
returns jsonb language plpgsql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
declare result jsonb;
begin
  if coalesce(p_organization_id, '') = '' or coalesce(p_team_id, '') = ''
    or p_type is null or p_type not in ('all', 'match', 'training')
    or p_limit is null or p_limit not between 1 and 50 or p_search is null or char_length(p_search) > 120
    or (p_cursor_id is null) <> (p_cursor_date is null) then
    raise exception 'Invalid video library query' using errcode = '22023';
  end if;
  with filtered as not materialized (
    select m.* from public.video_matches m
    where m.organization_id = p_organization_id and m.team_id = p_team_id and m.status = 'active'
      and (p_date_from is null or m.match_date >= p_date_from)
      and (p_date_to is null or m.match_date <= p_date_to)
      and (p_type = 'all' or p_type = case
        when lower(coalesce(m.metadata->>'eventType', m.metadata->>'event_type')) in ('match', 'training')
          then lower(coalesce(m.metadata->>'eventType', m.metadata->>'event_type'))
        when coalesce(m.opponent, '') <> '' or lower(m.title) ~ '(\mmatch\M| vs[.]? | @ )' then 'match'
        else 'training' end)
      and (p_search = '' or lower(m.title || ' ' || coalesce(m.opponent, '') || ' ' || coalesce(m.competition, '') || ' ' || coalesce(m.venue, ''))
        like '%' || replace(replace(replace(lower(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  ), search_page as materialized (
    select m.* from filtered m where (p_cursor_id is null or (coalesce(m.match_date, date '0001-01-01'), m.id) < (p_cursor_date, p_cursor_id))
    order by coalesce(m.match_date, date '0001-01-01') desc, m.id desc limit p_limit + 1
  ), search_items as (
    select * from search_page order by coalesce(match_date, date '0001-01-01') desc, id desc limit p_limit
  )
  select jsonb_build_object(
    'matches', coalesce((select jsonb_agg(app_private.video_library_match_json(m, p_actor_id) order by coalesce(m.match_date, date '0001-01-01') desc, m.id desc)
      from public.video_matches m join search_items s on s.id = m.id
      where m.organization_id = p_organization_id and m.team_id = p_team_id), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from search_page)
  ) into result;
  return result;
end;
$$;
revoke all on function public.video_library_search(text, text, text, text, text, date, date, date, uuid, integer) from public, anon, authenticated;
grant execute on function public.video_library_search(text, text, text, text, text, date, date, date, uuid, integer) to service_role;
