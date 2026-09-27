begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Read-only keyset pages. Every page must still observe the same state revision
-- and hash. Callers discard the export if a writer changes that anchor.
create function public.snapshot_session_save_page(
  p_organization_id text,
  p_revision bigint default null,
  p_hash text default null,
  p_after_actor text default null,
  p_after_operation text default null
)
returns json language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  state public.platform_app_state_records%rowtype;
  receipt_count bigint;
  effect_count bigint;
  rows json;
begin
  if p_organization_id is null or length(p_organization_id) not between 1 and 120
    or (p_revision is null) <> (p_hash is null)
    or (p_after_actor is null) <> (p_after_operation is null)
    or (p_revision is null and p_after_actor is not null) then
    raise exception 'Invalid backup page scope' using errcode = '22023';
  end if;
  select * into state from public.platform_app_state_records
    where organization_id = p_organization_id and state_key = 'football-session-planner-v3';
  if p_revision is not null and (p_revision is distinct from coalesce(state.revision, 0)
    or p_hash is distinct from coalesce(state.value_hash, '')) then
    raise exception 'Sessions changed during backup; discard partial export' using errcode = '40001';
  end if;
  select count(*) into receipt_count from public.session_save_receipts
    where organization_id = p_organization_id and state_key = 'football-session-planner-v3';
  select count(*) into effect_count from public.session_save_effects
    where organization_id = p_organization_id and state_key = 'football-session-planner-v3';
  if receipt_count <> effect_count or receipt_count > 100000
    or (state.revision is null and receipt_count > 0) then
    raise exception 'Incomplete or oversized Sessions ledger' using errcode = '22023';
  end if;
  select coalesce(json_agg(json_build_object('receipt', to_json(r), 'effect',
    (select to_json(e) from public.session_save_effects e
      where e.organization_id = r.organization_id and e.state_key = r.state_key
        and e.actor_id = r.actor_id and e.operation_id = r.operation_id))), '[]'::json)
    into rows from (
      select * from public.session_save_receipts
      where organization_id = p_organization_id and state_key = 'football-session-planner-v3'
        and (p_after_actor is null or (actor_id, operation_id) > (p_after_actor, p_after_operation))
      order by actor_id, operation_id limit 10
    ) r;
  return json_build_object('schema', 'session-save-page-v1', 'organizationId', p_organization_id,
    'revision', coalesce(state.revision, 0), 'hash', coalesce(state.value_hash, ''),
    'entry', case when p_revision is null and state.revision is not null then to_json(state) else null end,
    'receiptCount', receipt_count, 'rows', rows);
end;
$$;
revoke all on function public.snapshot_session_save_page(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.snapshot_session_save_page(text, bigint, text, text, text) to service_role;
commit;
