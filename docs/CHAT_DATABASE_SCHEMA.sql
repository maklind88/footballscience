-- Readable reference for the standalone chat database.
-- Source of truth: supabase/migrations/20260507130000_chat_module_multitenant.sql
-- Keep this file as a compact schema reference for product and architecture discussions.

create extension if not exists pgcrypto;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'team' check (type in ('team', 'group', 'dm')),
  title text not null check (char_length(title) <= 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_thread_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) <= 1600),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'medium', 'high', 'urgent', 'critical')),
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_message_mentions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  mentioned_user_id uuid references auth.users(id) on delete cascade,
  handle text not null check (char_length(handle) <= 80),
  created_at timestamptz not null default now(),
  primary key (message_id, handle)
);

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) <= 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists public.chat_read_receipts (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) <= 80),
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  actor_id uuid references auth.users(id) on delete set null,
  thread_id uuid references public.chat_threads(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_threads_updated_at_idx on public.chat_threads (updated_at desc);
create index if not exists chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at desc);
create index if not exists chat_messages_author_idx on public.chat_messages (author_id, created_at desc);
create index if not exists chat_reactions_message_idx on public.chat_reactions (message_id);
create index if not exists chat_read_receipts_user_idx on public.chat_read_receipts (user_id, last_read_at desc);
create index if not exists chat_audit_events_created_idx on public.chat_audit_events (created_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_thread_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_mentions enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_read_receipts enable row level security;
alter table public.chat_audit_events enable row level security;

-- Authorization data must come from app_metadata, not user_metadata.
-- The app currently stores role in app_metadata.role.

create policy "Staff can view team chat threads"
on public.chat_threads
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach', 'analyst', 'performance', 'medical')
  and (
    type = 'team'
    or exists (
      select 1 from public.chat_thread_participants p
      where p.thread_id = chat_threads.id
      and p.user_id = (select auth.uid())
    )
  )
);

create policy "Staff can create chat threads"
on public.chat_threads
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach', 'analyst', 'performance', 'medical')
);

create policy "Staff can view participants for accessible threads"
on public.chat_thread_participants
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach', 'analyst', 'performance', 'medical')
  and exists (
    select 1 from public.chat_threads t
    where t.id = chat_thread_participants.thread_id
  )
);

create policy "Staff can view accessible messages"
on public.chat_messages
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.chat_threads t
    where t.id = chat_messages.thread_id
  )
);

create policy "Staff can create accessible messages"
on public.chat_messages
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach', 'analyst', 'performance', 'medical')
  and exists (
    select 1 from public.chat_threads t
    where t.id = chat_messages.thread_id
  )
);

create policy "Authors can update their own messages"
on public.chat_messages
for update
to authenticated
using (
  author_id = (select auth.uid())
)
with check (
  author_id = (select auth.uid())
);

create policy "Admins and coaches can manage message priority and pins"
on public.chat_messages
for update
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'coach')
);

create policy "Staff can manage their own reactions"
on public.chat_reactions
for all
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy "Staff can manage their own read receipts"
on public.chat_read_receipts
for all
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy "Admins can view chat audit events"
on public.chat_audit_events
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
