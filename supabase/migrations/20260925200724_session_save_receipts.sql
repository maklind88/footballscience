-- Additive, server-only receipts. No source-of-truth switch or existing-data rewrite.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.session_save_receipts (
  organization_id text not null check (length(organization_id) between 1 and 120),
  state_key text not null check (state_key = 'football-session-planner-v3'),
  actor_id text not null check (length(actor_id) between 1 and 120),
  operation_id text not null check (operation_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  operation_hash text not null check (operation_hash ~ '^[a-f0-9]{64}$'),
  session_date date not null,
  accepted_revision bigint not null check (accepted_revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, state_key, actor_id, operation_id)
);

-- Immutable audit/history events are committed with the data, not delivered
-- later through a second write. Readers combine these with legacy history.
create table public.session_save_effects (
  organization_id text not null,
  state_key text not null,
  actor_id text not null,
  operation_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, state_key, actor_id, operation_id),
  foreign key (organization_id, state_key, actor_id, operation_id)
    references public.session_save_receipts (organization_id, state_key, actor_id, operation_id)
);
create index session_save_effects_recent_idx on public.session_save_effects (organization_id, created_at desc);
alter table public.session_save_receipts enable row level security;
alter table public.session_save_effects enable row level security;
revoke all on public.session_save_receipts from public, anon, authenticated;
revoke all on public.session_save_effects from public, anon, authenticated;
grant select, insert on public.session_save_receipts to service_role;
grant select, insert on public.session_save_effects to service_role;

create function public.commit_session_save(
  p_entry jsonb,
  p_base_revision bigint,
  p_operation_id text,
  p_operation_hash text,
  p_session_date date,
  p_actor_id text,
  p_effects jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  receipt public.session_save_receipts%rowtype;
  current_record public.platform_app_state_records%rowtype;
  written record;
  organization text := p_entry->>'organizationId';
  key text := p_entry->>'key';
begin
  if organization is null or length(organization) not between 1 and 120
     or key is distinct from 'football-session-planner-v3'
     or p_actor_id is null or length(p_actor_id) not between 1 and 120
     or p_actor_id is distinct from p_entry->>'updatedBy'
     or p_operation_id is null or p_operation_id !~ '^[A-Za-z0-9_-]{1,100}$'
     or p_operation_hash is null or p_operation_hash !~ '^[a-f0-9]{64}$'
     or p_session_date is null or p_base_revision is null or p_base_revision < 0
     or p_effects is null or jsonb_typeof(p_effects) <> 'object'
     or coalesce((p_entry->>'removed')::boolean, false) then
    raise exception 'Invalid Sessions commit' using errcode = '22023';
  end if;

  -- Serializes duplicate/bootstrap calls. Other state writers still share the
  -- existing row-level revision CAS; a hash collision only reduces concurrency.
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(organization, key)::text, 0));
  select * into current_record from public.platform_app_state_records r
    where r.organization_id = organization and r.state_key = key for update;
  select * into receipt from public.session_save_receipts r
    where r.organization_id = organization and r.state_key = key
      and r.actor_id = p_actor_id and r.operation_id = p_operation_id;
  if found then
    if receipt.operation_hash <> p_operation_hash or receipt.session_date <> p_session_date then
      return jsonb_build_object('status', 'identity-mismatch');
    end if;
    if current_record.revision is null or current_record.revision < receipt.accepted_revision then
      return jsonb_build_object('status', 'recovery-required');
    end if;
    return jsonb_build_object('status', 'duplicate', 'entry', to_jsonb(current_record),
      'acceptedRevision', receipt.accepted_revision);
  end if;

  select * into written from public.write_platform_app_state_record(
    organization, key, p_entry->>'moduleId', p_entry->>'mergePolicy',
    p_base_revision, p_base_revision + 1, p_entry->>'value', false,
    p_actor_id, p_entry->>'hash', coalesce(p_entry->'metadata', '{}'::jsonb)
  );
  if written.applied is distinct from true then
    return jsonb_build_object('status', 'conflict', 'currentRevision', written.revision);
  end if;

  insert into public.session_save_receipts
    (organization_id, state_key, actor_id, operation_id, operation_hash, session_date, accepted_revision)
    values (organization, key, p_actor_id, p_operation_id, p_operation_hash, p_session_date, written.revision);
  insert into public.session_save_effects
    (organization_id, state_key, actor_id, operation_id, payload)
    values (organization, key, p_actor_id, p_operation_id, p_effects);
  return jsonb_build_object('status', 'committed', 'entry', to_jsonb(written) - 'applied',
    'acceptedRevision', written.revision);
end;
$$;
revoke all on function public.commit_session_save(jsonb, bigint, text, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_session_save(jsonb, bigint, text, text, date, text, jsonb)
  to service_role;

-- One statement/snapshot, including the authoritative record and its ledger.
-- The sentinel row makes the API reject oversized exports instead of omitting rows.
create function public.snapshot_session_saves(p_organization_id text)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schema', 'session-save-backup-v1',
    'organizationId', p_organization_id,
    'entry', (select to_jsonb(r) from public.platform_app_state_records r
      where r.organization_id=p_organization_id and r.state_key='football-session-planner-v3'),
    'receipts', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select * from public.session_save_receipts where organization_id=p_organization_id
      order by actor_id, operation_id limit 100001) r),
    'effects', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
      select * from public.session_save_effects where organization_id=p_organization_id
      order by actor_id, operation_id limit 100001) r)
  );
$$;
revoke all on function public.snapshot_session_saves(text) from public, anon, authenticated;
grant execute on function public.snapshot_session_saves(text) to service_role;
commit;
