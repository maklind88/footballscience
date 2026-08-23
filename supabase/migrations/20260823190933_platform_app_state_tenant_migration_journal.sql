-- Journal for the one-time migration from the legacy global app-state scope to
-- one explicitly designated canonical organization. Runtime GET requests never
-- write this table and never copy legacy rows.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.platform_app_state_tenant_migrations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  source_organization_id text not null default 'global',
  target_organization_id uuid not null references public.platform_organizations(id) on delete restrict,
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'planned' check (
    status in ('planned', 'applying', 'completed', 'failed', 'rolled_back')
  ),
  source_record_count integer not null check (source_record_count >= 0),
  source_content_sha256 text not null check (source_content_sha256 ~ '^[a-f0-9]{64}$'),
  source_revision_sha256 text not null check (source_revision_sha256 ~ '^[a-f0-9]{64}$'),
  target_before_record_count integer not null default 0 check (target_before_record_count >= 0),
  target_before_content_sha256 text not null check (target_before_content_sha256 ~ '^[a-f0-9]{64}$'),
  target_before_revision_sha256 text not null check (target_before_revision_sha256 ~ '^[a-f0-9]{64}$'),
  target_after_record_count integer check (target_after_record_count is null or target_after_record_count >= 0),
  target_after_content_sha256 text check (
    target_after_content_sha256 is null or target_after_content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  target_after_revision_sha256 text check (
    target_after_revision_sha256 is null or target_after_revision_sha256 ~ '^[a-f0-9]{64}$'
  ),
  snapshot_path text not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  rolled_back_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_organization_id, target_organization_id, plan_sha256),
  constraint platform_app_state_migration_source_global check (source_organization_id = 'global'),
  constraint platform_app_state_migration_tenant_match check (organization_id = target_organization_id),
  constraint platform_app_state_migration_snapshot_path check (
    snapshot_path like 'backups/app-state-migrations/%' and
    snapshot_path not like '%..%' and
    snapshot_path not like '%?%' and
    snapshot_path not like '%#%'
  )
);

create index if not exists platform_app_state_tenant_migrations_target_status_idx
  on public.platform_app_state_tenant_migrations (organization_id, status, created_at desc);

alter table public.platform_app_state_tenant_migrations enable row level security;
alter table public.platform_app_state_tenant_migrations force row level security;
revoke all on public.platform_app_state_tenant_migrations from public, anon, authenticated;
grant select, insert, update on public.platform_app_state_tenant_migrations to service_role;

comment on table public.platform_app_state_tenant_migrations is
  'Server-only migration control journal. Never store credentials, personal data, or app-state payloads here.';
