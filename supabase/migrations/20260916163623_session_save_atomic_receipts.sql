-- Additive, inactive Sessions receipt pilot. No API route calls this RPC yet.
-- Requires an explicitly migrated tenant record with metadata.teamId. Never
-- adopts global data, seeds a calendar, or replaces existing module authorization.
create schema if not exists app_private;

create table app_private.session_save_receipts (
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  team_id uuid not null references public.platform_teams(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null check (operation_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  committed_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, team_id, actor_id, operation_id)
);

create table app_private.session_save_effects (
  organization_id uuid not null,
  team_id uuid not null,
  actor_id uuid not null,
  operation_id text not null,
  source_revision bigint not null check (source_revision > 0),
  committed_revision bigint not null check (committed_revision = source_revision + 1),
  before_value jsonb not null,
  after_value jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, team_id, actor_id, operation_id),
  foreign key (organization_id, team_id, actor_id, operation_id)
    references app_private.session_save_receipts on delete restrict
);

-- Append-only transaction evidence. No consumer or retention deletion is enabled.
alter table app_private.session_save_receipts enable row level security;
alter table app_private.session_save_effects enable row level security;
revoke all on app_private.session_save_receipts from public, anon, authenticated;
revoke all on app_private.session_save_effects from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant select, insert on app_private.session_save_receipts to service_role;
grant select, insert on app_private.session_save_effects to service_role;
grant select on public.platform_organizations, public.platform_clubs, public.platform_teams,
  public.platform_user_profiles, public.platform_memberships to service_role;

create function public.commit_session_save_operation(
  p_organization_id uuid, p_team_id uuid, p_actor_id uuid,
  p_operation_id text, p_change jsonb, p_expected_revision bigint, p_value text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  state_record public.platform_app_state_records%rowtype;
  saved app_private.session_save_receipts%rowtype;
  request_hash text;
  next_value jsonb;
  previous_value jsonb;
  date_key text;
  date_value jsonb;
  receipt jsonb;
begin
  if p_organization_id is null or p_team_id is null or p_actor_id is null
    or p_operation_id is null or p_operation_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_expected_revision is null or p_expected_revision < 1
    or p_change is null or jsonb_typeof(p_change) is distinct from 'object'
    or p_change->>'schema' is distinct from 'session-date-change-v1'
    or p_change->>'id' is distinct from p_operation_id
    or jsonb_typeof(p_change->'before') is distinct from 'object'
    or jsonb_typeof(p_change->'after') is distinct from 'object'
    or p_value is null or octet_length(p_value) > 12582912
    or octet_length(p_change::text) > 12582912 then
    raise exception 'Invalid Sessions operation envelope.' using errcode = '22023';
  end if;
  date_key := p_change->>'date';
  if date_key is null or date_key !~ '^\d{4}-\d{2}-\d{2}$'
    or to_char(date_key::date, 'YYYY-MM-DD') <> date_key then
    raise exception 'Invalid Sessions operation date.' using errcode = '22023';
  end if;

  -- One existing row lock serializes both this RPC and the legacy CAS writer.
  -- No select-then-insert bootstrap race and no process-local deduplication cache.
  select * into state_record from public.platform_app_state_records r
    where r.organization_id = p_organization_id::text and r.state_key = 'football-session-planner-v3'
    for update;

  -- Check identity AFTER waiting for the row. Membership is defense in depth,
  -- not the module's permission matrix.
  -- The server caller must reauthorize Sessions edit access on EVERY replay.
  if not exists (
    select 1 from public.platform_teams t
    join public.platform_organizations o on o.id = t.organization_id
    join public.platform_user_profiles u on u.user_id = p_actor_id
    join public.platform_memberships m on m.user_id = u.user_id and m.organization_id = o.id
    left join public.platform_clubs c on c.id = t.club_id
    where t.id = p_team_id and o.id = p_organization_id
      and t.status = 'active' and t.deleted_at is null
      and o.status = 'active' and o.deleted_at is null
      and u.status = 'active' and u.deleted_at is null
      and m.status = 'active' and m.deleted_at is null
      and (t.club_id is null or (c.organization_id = o.id and c.status = 'active' and c.deleted_at is null))
      and (m.scope = 'organization' or (m.scope = 'club' and m.club_id = t.club_id)
        or (m.scope = 'team' and m.team_id = t.id))
  ) then
    return jsonb_build_object('ok', false, 'status', 403, 'reason', 'Sessions scope is not active.');
  end if;

  if state_record.state_key is null or state_record.removed
    or state_record.module_id <> 'session-planner'
    or state_record.metadata->>'teamId' is distinct from p_team_id::text then
    return jsonb_build_object('ok', false, 'status', 409, 'reason', 'Sessions tenant record is not ready.');
  end if;

  request_hash := encode(sha256(convert_to(p_change::text, 'UTF8')), 'hex');
  select * into saved from app_private.session_save_receipts r
    where r.organization_id = p_organization_id and r.team_id = p_team_id
      and r.actor_id = p_actor_id and r.operation_id = p_operation_id;
  if found then
    if saved.request_hash <> request_hash then
      return jsonb_build_object('ok', false, 'status', 409, 'reason', 'Sessions operation identity was reused.');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'receipt', saved.receipt);
  end if;

  if state_record.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'status', 409, 'currentRevision', state_record.revision);
  end if;
  next_value := p_value::jsonb;
  previous_value := state_record.value::jsonb;
  if jsonb_typeof(next_value->'sessions'->date_key) is distinct from 'object' then
    raise exception 'Missing committed Sessions date.' using errcode = '22023';
  end if;
  if (next_value - 'sessions' - 'blockDeletionTombstones')
      is distinct from (previous_value - 'sessions' - 'blockDeletionTombstones')
    or ((next_value->'sessions') - date_key) is distinct from ((previous_value->'sessions') - date_key)
    or (coalesce(next_value->'blockDeletionTombstones', '{}'::jsonb) - date_key)
      is distinct from (coalesce(previous_value->'blockDeletionTombstones', '{}'::jsonb) - date_key) then
    raise exception 'Sessions operation changed unrelated dates or fields.' using errcode = '22023';
  end if;
  date_value := jsonb_build_object('session', next_value->'sessions'->date_key,
    'tombstones', coalesce(next_value->'blockDeletionTombstones'->date_key, '{}'::jsonb));

  update public.platform_app_state_records r set revision = r.revision + 1,
    value = p_value, value_hash = encode(sha256(convert_to(p_value, 'UTF8')), 'hex'),
    updated_by = p_actor_id::text, updated_at = clock_timestamp()
    where r.organization_id = p_organization_id::text and r.state_key = state_record.state_key
    returning * into state_record;
  receipt := jsonb_build_object('schema', 'session-save-receipt-v1',
    'id', p_operation_id, 'date', date_key, 'value', date_value,
    'key', state_record.state_key, 'revision', state_record.revision,
    'hash', state_record.value_hash, 'updatedAt', state_record.updated_at,
    'organizationId', p_organization_id, 'teamId', p_team_id, 'actorId', p_actor_id);
  insert into app_private.session_save_receipts
    (organization_id, team_id, actor_id, operation_id, request_hash, receipt)
    values (p_organization_id, p_team_id, p_actor_id, p_operation_id, request_hash, receipt);
  insert into app_private.session_save_effects
    (organization_id, team_id, actor_id, operation_id, source_revision, committed_revision, before_value, after_value)
    values (p_organization_id, p_team_id, p_actor_id, p_operation_id, p_expected_revision, state_record.revision,
      jsonb_build_object('session', previous_value->'sessions'->date_key,
        'tombstones', coalesce(previous_value->'blockDeletionTombstones'->date_key, '{}'::jsonb)), date_value);
  return jsonb_build_object('ok', true, 'replayed', false, 'receipt', receipt);
end;
$$;

revoke all on function public.commit_session_save_operation(uuid, uuid, uuid, text, jsonb, bigint, text)
  from public, anon, authenticated;
grant execute on function public.commit_session_save_operation(uuid, uuid, uuid, text, jsonb, bigint, text)
  to service_role;
