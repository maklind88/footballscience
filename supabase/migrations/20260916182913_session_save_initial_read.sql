-- Inactive editor pilot. A null operation is an explicit read, never a seed,
-- receipt lookup, acknowledgement or permission shortcut.
create or replace function public.read_session_save_context(p_actor_id uuid, p_team_id uuid, p_change jsonb)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog
as $$
declare
  identity jsonb;
  calendar public.platform_app_state_records%rowtype;
  hub public.platform_app_state_records%rowtype;
  saved app_private.session_save_receipts%rowtype;
  matches boolean;
begin
  identity := public.resolve_session_save_scope(p_actor_id, p_team_id);
  if identity->>'ok' is distinct from 'true' then return identity; end if;
  if p_change is not null and p_change <> 'null'::jsonb
    and (jsonb_typeof(p_change) is distinct from 'object' or p_change->>'id' is null) then
    raise exception 'Invalid Sessions operation.' using errcode = '22023';
  end if;
  select * into calendar from public.platform_app_state_records
    where organization_id = identity->'scope'->>'organizationId' and state_key = 'football-session-planner-v3';
  select * into hub from public.platform_app_state_records
    where organization_id = identity->'scope'->>'organizationId' and state_key = 'football-workspace-hub-v3';
  if calendar.state_key is null or calendar.removed or calendar.module_id <> 'session-planner'
    or calendar.metadata->>'teamId' is distinct from p_team_id::text
    or hub.state_key is null or hub.removed or hub.module_id <> 'platform-shell'
    or hub.metadata->>'teamId' is distinct from p_team_id::text then
    return jsonb_build_object('ok', false, 'status', 409, 'reason', 'Sessions tenant records are not ready.');
  end if;
  select * into saved from app_private.session_save_receipts
    where organization_id = (identity->'scope'->>'organizationId')::uuid and team_id = p_team_id
      and actor_id = p_actor_id and operation_id = p_change->>'id';
  matches := saved.request_hash = encode(sha256(convert_to(p_change::text, 'UTF8')), 'hex');
  return jsonb_build_object('ok', true, 'scope', identity->'scope', 'roles', identity->'roles',
    'authorizationToken', encode(sha256(convert_to(jsonb_build_array(
      identity->'scope', identity->'roles', hub.revision, hub.value)::text, 'UTF8')), 'hex'),
    'workspaceHub', hub.value,
    'entry', jsonb_build_object('key', calendar.state_key, 'moduleId', calendar.module_id,
      'organizationId', calendar.organization_id, 'metadata', calendar.metadata, 'removed', calendar.removed,
      'value', calendar.value, 'revision', calendar.revision, 'hash', calendar.value_hash),
    'operation', jsonb_build_object('found', saved.operation_id is not null,
      'matches', coalesce(matches, false), 'receipt', case when matches then saved.receipt else null end));
end;
$$;
revoke all on function public.read_session_save_context(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.read_session_save_context(uuid, uuid, jsonb) to service_role;
