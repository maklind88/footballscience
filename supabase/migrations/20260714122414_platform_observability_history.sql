-- Football Science platform observability history.
-- Additive, server-owned append-only health snapshots for Admin Platform Health.

create table if not exists public.platform_observability_signals (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  organization_id uuid references public.platform_organizations(id) on delete set null,
  team_id uuid references public.platform_teams(id) on delete set null,
  signal_id text not null check (signal_id ~ '^[a-z0-9][a-z0-9-]{1,100}$'),
  signal_group text not null default 'platform' check (signal_group ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  signal_label text not null default '' check (char_length(signal_label) <= 140),
  owner text not null default 'System / Security / Release' check (char_length(owner) <= 140),
  status text not null check (status in ('pass', 'warning', 'missing')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  source text not null default 'production-monitor' check (char_length(source) <= 120),
  details text not null default '' check (char_length(details) <= 1000),
  next_step text not null default '' check (char_length(next_step) <= 700),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_release_checks (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  organization_id uuid references public.platform_organizations(id) on delete set null,
  team_id uuid references public.platform_teams(id) on delete set null,
  release_sha text check (release_sha is null or release_sha ~ '^[a-f0-9]{7,40}$'),
  environment text not null default 'unknown' check (environment in ('production', 'preview', 'development', 'local', 'unknown')),
  check_id text not null check (check_id ~ '^[a-z0-9][a-z0-9-]{1,100}$'),
  check_label text not null default '' check (char_length(check_label) <= 140),
  status text not null check (status in ('pass', 'warning', 'missing')),
  source text not null default 'production-monitor' check (char_length(source) <= 120),
  details text not null default '' check (char_length(details) <= 1000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists platform_observability_signals_observed_idx
  on public.platform_observability_signals (observed_at desc);
create index if not exists platform_observability_signals_snapshot_idx
  on public.platform_observability_signals (snapshot_id, observed_at desc);
create index if not exists platform_observability_signals_signal_idx
  on public.platform_observability_signals (signal_id, observed_at desc);
create index if not exists platform_observability_signals_status_idx
  on public.platform_observability_signals (status, observed_at desc);
create index if not exists platform_observability_signals_tenant_idx
  on public.platform_observability_signals (organization_id, team_id, observed_at desc);

create index if not exists platform_release_checks_observed_idx
  on public.platform_release_checks (observed_at desc);
create index if not exists platform_release_checks_snapshot_idx
  on public.platform_release_checks (snapshot_id, observed_at desc);
create index if not exists platform_release_checks_release_idx
  on public.platform_release_checks (release_sha, observed_at desc) where release_sha is not null;
create index if not exists platform_release_checks_check_idx
  on public.platform_release_checks (check_id, observed_at desc);
create index if not exists platform_release_checks_tenant_idx
  on public.platform_release_checks (organization_id, team_id, observed_at desc);

alter table public.platform_observability_signals enable row level security;
alter table public.platform_release_checks enable row level security;

revoke all on public.platform_observability_signals from anon, authenticated;
revoke all on public.platform_release_checks from anon, authenticated;
grant select on public.platform_observability_signals to authenticated;
grant select on public.platform_release_checks to authenticated;
grant select, insert on public.platform_observability_signals to service_role;
grant select, insert on public.platform_release_checks to service_role;

drop policy if exists "platform observability signals are admin visible by tenant"
  on public.platform_observability_signals;
create policy "platform observability signals are admin visible by tenant"
on public.platform_observability_signals
for select
to authenticated
using (
  app_private.current_app_role() = 'admin'
  and (
    organization_id is null
    or app_private.is_platform_org_member(organization_id)
  )
);

drop policy if exists "platform release checks are admin visible"
  on public.platform_release_checks;
create policy "platform release checks are admin visible"
on public.platform_release_checks
for select
to authenticated
using (
  app_private.current_app_role() = 'admin'
  and (
    organization_id is null
    or app_private.is_platform_org_member(organization_id)
  )
);
