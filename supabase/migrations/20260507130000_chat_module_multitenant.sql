-- Football Science Chat Module: multi-tenant foundation.
-- Writes should go through /api/chat. Direct client access is limited to read paths
-- protected by RLS so realtime can be enabled safely per thread later.

create extension if not exists pgcrypto;

create schema if not exists app_private;

create or replace function app_private.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

create or replace function app_private.is_chat_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach', 'analyst', 'performance', 'medical');
$$;

create or replace function app_private.is_chat_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() in ('admin', 'coach');
$$;

create or replace function app_private.is_chat_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_app_role() = 'admin';
$$;

create table if not exists public.chat_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 120),
  sport text not null default 'football' check (char_length(sport) <= 80),
  season_label text not null default 'current' check (char_length(season_label) <= 80),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, slug)
);

create table if not exists public.chat_team_memberships (
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid not null references public.chat_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'coach', 'analyst', 'performance', 'medical', 'player', 'guest')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  relationship text not null default 'staff' check (relationship in ('staff', 'player', 'external', 'guardian')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (team_id, user_id)
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  type text not null default 'team' check (type in ('team', 'group', 'dm', 'system')),
  title text not null check (char_length(title) between 1 and 140),
  visibility text not null default 'members' check (visibility in ('members', 'staff', 'medical', 'private')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz,
  message_count bigint not null default 0 check (message_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  constraint chat_threads_team_scope_check check (
    (type = 'dm' and team_id is null)
    or (type <> 'dm')
  )
);

create table if not exists public.chat_thread_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null default 'member' check (participant_role in ('owner', 'member', 'observer')),
  notification_level text not null default 'all' check (notification_level in ('all', 'mentions', 'muted')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) <= 1600),
  body_format text not null default 'plain' check (body_format in ('plain')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'medium', 'high', 'urgent', 'critical')),
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  client_message_id text check (client_message_id is null or char_length(client_message_id) <= 120),
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (thread_id, client_message_id)
);

alter table public.chat_threads
  add constraint chat_threads_last_message_fk
  foreign key (last_message_id)
  references public.chat_messages(id)
  on delete set null
  deferrable initially deferred;

create table if not exists public.chat_message_mentions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  mentioned_user_id uuid references auth.users(id) on delete cascade,
  handle text not null check (char_length(handle) between 2 and 80),
  created_at timestamptz not null default now(),
  primary key (message_id, handle)
);

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists public.chat_read_receipts (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id uuid references public.chat_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_bucket text not null check (char_length(storage_bucket) <= 120),
  storage_path text not null check (char_length(storage_path) <= 900),
  mime_type text not null check (char_length(mime_type) <= 120),
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 52428800),
  status text not null default 'pending' check (status in ('pending', 'ready', 'blocked', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid references public.chat_threads(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  destructive boolean not null default false,
  admin_action boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_retention_policies (
  organization_id uuid primary key references public.chat_organizations(id) on delete cascade,
  active_message_days integer not null default 365 check (active_message_days between 30 and 3650),
  deleted_message_days integer not null default 30 check (deleted_message_days between 1 and 365),
  audit_days integer not null default 730 check (audit_days between 30 and 3650),
  attachment_days integer not null default 365 check (attachment_days between 30 and 3650),
  max_messages_per_thread integer not null default 5000 check (max_messages_per_thread between 100 and 50000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists chat_teams_org_status_idx on public.chat_teams (organization_id, status, updated_at desc);
create index if not exists chat_team_memberships_user_idx on public.chat_team_memberships (user_id, status, organization_id, team_id);
create index if not exists chat_team_memberships_org_team_role_idx on public.chat_team_memberships (organization_id, team_id, role, status);
create index if not exists chat_threads_org_team_updated_idx on public.chat_threads (organization_id, team_id, updated_at desc);
create index if not exists chat_threads_last_message_idx on public.chat_threads (last_message_at desc) where archived_at is null;
create index if not exists chat_thread_participants_user_idx on public.chat_thread_participants (user_id, thread_id) where left_at is null;
create index if not exists chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at desc);
create index if not exists chat_messages_org_created_idx on public.chat_messages (organization_id, created_at desc);
create index if not exists chat_messages_team_created_idx on public.chat_messages (team_id, created_at desc) where team_id is not null;
create index if not exists chat_messages_author_idx on public.chat_messages (author_id, created_at desc);
create index if not exists chat_messages_pinned_idx on public.chat_messages (thread_id, pinned_at desc) where pinned_at is not null and deleted_at is null;
create index if not exists chat_mentions_user_idx on public.chat_message_mentions (mentioned_user_id, created_at desc);
create index if not exists chat_reactions_message_idx on public.chat_reactions (message_id);
create index if not exists chat_read_receipts_user_idx on public.chat_read_receipts (user_id, last_read_at desc);
create index if not exists chat_attachments_message_idx on public.chat_attachments (message_id, status);
create index if not exists chat_audit_events_org_created_idx on public.chat_audit_events (organization_id, created_at desc);
create index if not exists chat_audit_events_actor_created_idx on public.chat_audit_events (actor_id, created_at desc);

create or replace function app_private.is_chat_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.is_chat_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach', 'analyst', 'performance', 'medical')
  );
$$;

create or replace function app_private.can_manage_chat_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('admin', 'coach')
  );
$$;

create or replace function app_private.can_access_chat_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_threads thread
    where thread.id = target_thread_id
      and thread.archived_at is null
      and app_private.is_chat_staff()
      and (
        (
          thread.type = 'team'
          and thread.team_id is not null
          and app_private.is_chat_team_member(thread.team_id)
        )
        or (
          thread.type in ('group', 'dm', 'system')
          and exists (
            select 1
            from public.chat_thread_participants participant
            where participant.thread_id = thread.id
              and participant.user_id = (select auth.uid())
              and participant.left_at is null
          )
        )
      )
  );
$$;

create or replace function app_private.can_manage_chat_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_threads thread
    where thread.id = target_thread_id
      and thread.archived_at is null
      and (
        app_private.is_chat_admin()
        or (
          thread.team_id is not null
          and app_private.can_manage_chat_team(thread.team_id)
        )
        or exists (
          select 1
          from public.chat_thread_participants participant
          where participant.thread_id = thread.id
            and participant.user_id = (select auth.uid())
            and participant.participant_role = 'owner'
            and participant.left_at is null
        )
      )
  );
$$;

create or replace function public.chat_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger chat_organizations_touch_updated_at
before update on public.chat_organizations
for each row execute function public.chat_touch_updated_at();

create trigger chat_teams_touch_updated_at
before update on public.chat_teams
for each row execute function public.chat_touch_updated_at();

create trigger chat_team_memberships_touch_updated_at
before update on public.chat_team_memberships
for each row execute function public.chat_touch_updated_at();

create trigger chat_threads_touch_updated_at
before update on public.chat_threads
for each row execute function public.chat_touch_updated_at();

create trigger chat_messages_touch_updated_at
before update on public.chat_messages
for each row execute function public.chat_touch_updated_at();

create trigger chat_attachments_touch_updated_at
before update on public.chat_attachments
for each row execute function public.chat_touch_updated_at();

create trigger chat_retention_policies_touch_updated_at
before update on public.chat_retention_policies
for each row execute function public.chat_touch_updated_at();

alter table public.chat_organizations enable row level security;
alter table public.chat_teams enable row level security;
alter table public.chat_team_memberships enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_thread_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_mentions enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_read_receipts enable row level security;
alter table public.chat_attachments enable row level security;
alter table public.chat_audit_events enable row level security;
alter table public.chat_retention_policies enable row level security;

revoke all on public.chat_organizations from anon, authenticated;
revoke all on public.chat_teams from anon, authenticated;
revoke all on public.chat_team_memberships from anon, authenticated;
revoke all on public.chat_threads from anon, authenticated;
revoke all on public.chat_thread_participants from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_message_mentions from anon, authenticated;
revoke all on public.chat_reactions from anon, authenticated;
revoke all on public.chat_read_receipts from anon, authenticated;
revoke all on public.chat_attachments from anon, authenticated;
revoke all on public.chat_audit_events from anon, authenticated;
revoke all on public.chat_retention_policies from anon, authenticated;

grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

grant select on public.chat_organizations to authenticated;
grant select on public.chat_teams to authenticated;
grant select on public.chat_team_memberships to authenticated;
grant select on public.chat_threads to authenticated;
grant select on public.chat_thread_participants to authenticated;
grant select on public.chat_messages to authenticated;
grant select on public.chat_message_mentions to authenticated;
grant select on public.chat_reactions to authenticated;
grant select on public.chat_read_receipts to authenticated;
grant select on public.chat_attachments to authenticated;
grant select on public.chat_audit_events to authenticated;
grant select on public.chat_retention_policies to authenticated;

create policy "chat organizations are visible to active staff members"
on public.chat_organizations
for select
to authenticated
using (
  app_private.is_chat_staff()
  and status = 'active'
  and app_private.is_chat_org_member(id)
);

create policy "chat teams are visible to active team staff"
on public.chat_teams
for select
to authenticated
using (
  app_private.is_chat_staff()
  and status = 'active'
  and app_private.is_chat_team_member(id)
);

create policy "chat memberships are visible to the member or team managers"
on public.chat_team_memberships
for select
to authenticated
using (
  app_private.is_chat_staff()
  and status = 'active'
  and (
    user_id = (select auth.uid())
    or app_private.can_manage_chat_team(team_id)
  )
);

create policy "chat threads are visible to accessible participants"
on public.chat_threads
for select
to authenticated
using (
  app_private.can_access_chat_thread(id)
);

create policy "chat thread participants are visible inside accessible threads"
on public.chat_thread_participants
for select
to authenticated
using (
  app_private.can_access_chat_thread(thread_id)
);

create policy "chat messages are visible inside accessible threads"
on public.chat_messages
for select
to authenticated
using (
  app_private.can_access_chat_thread(thread_id)
  and (
    deleted_at is null
    or app_private.is_chat_admin()
  )
);

create policy "chat mentions are visible inside accessible threads"
on public.chat_message_mentions
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_messages message
    where message.id = chat_message_mentions.message_id
      and app_private.can_access_chat_thread(message.thread_id)
  )
);

create policy "chat reactions are visible inside accessible threads"
on public.chat_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_messages message
    where message.id = chat_reactions.message_id
      and app_private.can_access_chat_thread(message.thread_id)
  )
);

create policy "chat read receipts are visible inside accessible threads"
on public.chat_read_receipts
for select
to authenticated
using (
  app_private.can_access_chat_thread(thread_id)
);

create policy "chat attachments are visible inside accessible threads"
on public.chat_attachments
for select
to authenticated
using (
  status = 'ready'
  and app_private.can_access_chat_thread(thread_id)
);

create policy "chat audit is admin visible"
on public.chat_audit_events
for select
to authenticated
using (
  app_private.is_chat_admin()
  and (
    organization_id is null
    or app_private.is_chat_org_member(organization_id)
  )
);

create policy "chat retention is admin visible"
on public.chat_retention_policies
for select
to authenticated
using (
  app_private.is_chat_admin()
  and app_private.is_chat_org_member(organization_id)
);
