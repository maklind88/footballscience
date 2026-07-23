-- Platform Identity atomic migration foundation.
-- Additive and inert: no runtime path calls this staging drill infrastructure.

alter table public.platform_tenant_links
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.platform_tenant_links
  drop constraint if exists platform_tenant_links_row_version_check,
  add constraint platform_tenant_links_row_version_check check (row_version > 0);

drop trigger if exists platform_tenant_links_touch_updated_at
  on public.platform_tenant_links;
create trigger platform_tenant_links_touch_updated_at
before update on public.platform_tenant_links
for each row execute function app_private.platform_touch_updated_at_and_row_version();

drop trigger if exists platform_tenant_links_prevent_hard_delete
  on public.platform_tenant_links;
create trigger platform_tenant_links_prevent_hard_delete
before delete on public.platform_tenant_links
for each row execute function app_private.platform_prevent_hard_delete();

create table if not exists public.platform_identity_migration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  target text not null check (target = 'staging'),
  project_ref text not null check (project_ref ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  operation text not null check (operation in ('backfill', 'rollback')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'rolled-back')),
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  bundle_sha256 text not null unique check (bundle_sha256 ~ '^[a-f0-9]{64}$'),
  request_id text not null unique check (char_length(request_id) between 1 and 180),
  expected_user_count integer not null check (expected_user_count >= 0),
  command_count integer not null check (command_count between 0 and 5000),
  applied_count integer not null default 0 check (applied_count >= 0),
  actor_id uuid not null references auth.users(id) on delete restrict,
  verification_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id)
);

create table if not exists public.platform_identity_migration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  table_name text not null check (
    table_name in (
      'platform_organizations',
      'platform_clubs',
      'platform_teams',
      'platform_user_profiles',
      'platform_memberships',
      'platform_tenant_links'
    )
  ),
  record_key uuid not null,
  action text not null check (
    action in (
      'create',
      'update',
      'restore',
      'restore-existing',
      'archive-created'
    )
  ),
  expected_row_version integer
    check (expected_row_version is null or expected_row_version > 0),
  before_record jsonb,
  after_record jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (run_id, organization_id)
    references public.platform_identity_migration_runs(id, organization_id)
    on delete restrict
);

create index if not exists platform_identity_migration_runs_created_idx
  on public.platform_identity_migration_runs (
    organization_id,
    created_at desc
  );
create index if not exists platform_identity_migration_runs_snapshot_idx
  on public.platform_identity_migration_runs (
    organization_id,
    snapshot_sha256,
    operation,
    status
  );
create index if not exists platform_identity_migration_events_run_idx
  on public.platform_identity_migration_events (
    organization_id,
    run_id,
    created_at,
    id
  );

alter table public.platform_identity_migration_runs enable row level security;
alter table public.platform_identity_migration_events enable row level security;

revoke all on public.platform_identity_migration_runs from anon, authenticated;
revoke all on public.platform_identity_migration_runs from public;
revoke all on public.platform_identity_migration_events from anon, authenticated;
revoke all on public.platform_identity_migration_events from public;
grant select, insert, update on public.platform_identity_migration_runs
  to service_role;
grant select, insert on public.platform_identity_migration_events
  to service_role;

create or replace function app_private.platform_identity_migration_actor_allowed(
  p_actor_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users actor
     where actor.id = p_actor_id
       and coalesce(actor.raw_app_meta_data ->> 'status', 'active') = 'active'
       and coalesce(
         actor.raw_app_meta_data ->> 'role',
         actor.raw_app_meta_data ->> 'platformRole',
         actor.raw_app_meta_data ->> 'platform_role'
       ) = 'admin'
  ) or exists (
    select 1
      from public.platform_memberships membership
     where membership.user_id = p_actor_id
       and membership.role = 'admin'
       and membership.status = 'active'
       and membership.deleted_at is null
  );
$$;

revoke all on function app_private.platform_identity_migration_actor_allowed(uuid)
  from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.platform_identity_migration_actor_allowed(uuid)
  to service_role;
