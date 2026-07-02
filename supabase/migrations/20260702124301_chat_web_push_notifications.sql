-- Football Science Chat: durable Web Push subscriptions and delivery telemetry.
-- Push endpoints are capability URLs; clients must use /api/push-subscriptions
-- rather than reading or writing these tables through the Data API.

create extension if not exists pgcrypto;

create table if not exists public.chat_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 16 and 2048),
  endpoint_hash text not null check (char_length(endpoint_hash) = 64),
  p256dh_key text not null check (char_length(p256dh_key) between 16 and 512),
  auth_key text not null check (char_length(auth_key) between 8 and 256),
  platform text not null default 'web' check (char_length(platform) between 2 and 80),
  device_label text not null default 'Web browser' check (char_length(device_label) <= 140),
  user_agent text not null default '' check (char_length(user_agent) <= 500),
  permission text not null default 'granted' check (permission in ('default', 'denied', 'granted')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (endpoint_hash)
);

create index if not exists chat_push_subscriptions_user_active_idx
  on public.chat_push_subscriptions (user_id, organization_id, team_id, updated_at desc)
  where enabled is true and revoked_at is null;

create index if not exists chat_push_subscriptions_org_active_idx
  on public.chat_push_subscriptions (organization_id, team_id, updated_at desc)
  where enabled is true and revoked_at is null;

create table if not exists public.chat_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid references public.chat_threads(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references public.chat_push_subscriptions(id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  reason text not null default '' check (char_length(reason) <= 240),
  provider_status integer,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists chat_push_delivery_attempts_message_idx
  on public.chat_push_delivery_attempts (message_id, created_at desc);

create index if not exists chat_push_delivery_attempts_recipient_idx
  on public.chat_push_delivery_attempts (recipient_user_id, created_at desc);

create index if not exists chat_push_delivery_attempts_org_idx
  on public.chat_push_delivery_attempts (organization_id, team_id, created_at desc);

drop trigger if exists chat_push_subscriptions_touch_updated_at on public.chat_push_subscriptions;
create trigger chat_push_subscriptions_touch_updated_at
  before update on public.chat_push_subscriptions
  for each row execute function public.chat_touch_updated_at();

alter table public.chat_push_subscriptions enable row level security;
alter table public.chat_push_delivery_attempts enable row level security;

revoke all on public.chat_push_subscriptions from anon, authenticated;
revoke all on public.chat_push_delivery_attempts from anon, authenticated;

grant select, insert, update, delete on public.chat_push_subscriptions to service_role;
grant select, insert, update, delete on public.chat_push_delivery_attempts to service_role;

drop policy if exists "chat push subscriptions are service-owned" on public.chat_push_subscriptions;
create policy "chat push subscriptions are service-owned"
  on public.chat_push_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "chat push delivery attempts are service-owned" on public.chat_push_delivery_attempts;
create policy "chat push delivery attempts are service-owned"
  on public.chat_push_delivery_attempts
  for all
  to service_role
  using (true)
  with check (true);
