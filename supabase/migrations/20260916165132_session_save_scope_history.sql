-- Inactive, server-only Sessions pilot. No route or browser calls these RPCs.
-- The caller must authenticate actor_id itself and enforce module permissions.
-- Resolving membership is NOT permission to edit Sessions or replay a write.
create function public.resolve_session_save_scope(p_actor_id uuid, p_team_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce((
    select jsonb_build_object('ok', true, 'scope', jsonb_build_object(
        'actorId', p_actor_id, 'organizationId', t.organization_id,
        'clubId', t.club_id, 'teamId', t.id),
      'roles', jsonb_agg(distinct m.role order by m.role),
      'canReadHistory', bool_or(m.role = 'admin'))
    from public.platform_teams t
    join public.platform_organizations o on o.id = t.organization_id
    join public.platform_user_profiles u on u.user_id = p_actor_id
    join public.platform_memberships m on m.user_id = u.user_id and m.organization_id = o.id
    left join public.platform_clubs c on c.id = t.club_id
    where t.id = p_team_id and t.status = 'active' and t.deleted_at is null
      and o.status = 'active' and o.deleted_at is null
      and u.status = 'active' and u.deleted_at is null
      and m.status = 'active' and m.deleted_at is null
      and (t.club_id is null or (c.organization_id = o.id and c.status = 'active' and c.deleted_at is null))
      and (m.scope = 'organization'
        or (m.scope = 'club' and m.club_id = t.club_id)
        or (m.scope = 'team' and m.team_id = t.id
          and (m.club_id is null or m.club_id = t.club_id)))
    group by t.id, t.organization_id, t.club_id
  ), jsonb_build_object('ok', false, 'status', 403, 'reason', 'Sessions scope is not active.'));
$$;

revoke all on function public.resolve_session_save_scope(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_session_save_scope(uuid, uuid) to service_role;

-- Date/revision keyset paging; do not index or return the coaching payload.
-- The existing commit RPC serializes revisions and emits one receipt per write.
create unique index session_save_receipts_history_page_idx
  on app_private.session_save_receipts
  (organization_id, team_id, (receipt->>'date'), ((receipt->>'revision')::bigint) desc);

create function public.read_session_save_history(
  p_actor_id uuid, p_team_id uuid, p_date text,
  p_before_revision bigint default null, p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  context jsonb;
  entries jsonb;
  has_more boolean;
  next_revision bigint;
begin
  -- STABLE keeps identity and evidence in the same request snapshot. Never cache
  -- this decision across RPC requests; every page must check current membership.
  context := public.resolve_session_save_scope(p_actor_id, p_team_id);
  if context->>'ok' is distinct from 'true' or context->>'canReadHistory' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'status', 403, 'reason', 'Sessions history access is not active.');
  end if;
  if p_date is null or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or to_char(p_date::date, 'YYYY-MM-DD') <> p_date
    or p_limit is null or p_limit < 1 or p_limit > 50
    or (p_before_revision is not null and p_before_revision < 1) then
    raise exception 'Invalid Sessions history page.' using errcode = '22023';
  end if;

  with candidates as materialized (
    select r.operation_id, r.actor_id, r.committed_at,
      (r.receipt->>'revision')::bigint as revision
    from app_private.session_save_receipts r
    where r.organization_id = (context->'scope'->>'organizationId')::uuid
      and r.team_id = p_team_id and r.receipt->>'date' = p_date
      and (r.receipt->>'revision')::bigint <= coalesce(p_before_revision - 1, 9223372036854775807)
    order by (r.receipt->>'revision')::bigint desc
    limit p_limit + 1
  ), page as (
    select * from candidates order by revision desc limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', operation_id, 'actorId', actor_id,
      'date', p_date, 'revision', revision, 'committedAt', committed_at) order by revision desc), '[]'::jsonb),
    (select count(*) > p_limit from candidates), min(revision)
    into entries, has_more, next_revision from page;

  return jsonb_build_object('ok', true, 'schema', 'session-save-history-page-v1',
    'scope', context->'scope', 'entries', entries, 'hasMore', has_more,
    'nextBeforeRevision', case when has_more then next_revision else null end);
end;
$$;

revoke all on function public.read_session_save_history(uuid, uuid, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.read_session_save_history(uuid, uuid, text, bigint, integer)
  to service_role;
