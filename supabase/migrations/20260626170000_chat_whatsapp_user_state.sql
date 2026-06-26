-- WhatsApp-style per-user chat state.
-- Global deletes still live on chat_messages.deleted_at; this table only hides a
-- message for one authenticated user.

create table if not exists public.chat_message_user_states (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (message_id, user_id)
);

create index if not exists chat_message_user_states_user_thread_hidden_idx
  on public.chat_message_user_states (user_id, thread_id, hidden_at desc)
  where hidden_at is not null;

create index if not exists chat_message_user_states_thread_user_idx
  on public.chat_message_user_states (thread_id, user_id);

drop trigger if exists chat_touch_message_user_states_updated_at on public.chat_message_user_states;
create trigger chat_touch_message_user_states_updated_at
  before update on public.chat_message_user_states
  for each row execute function public.chat_touch_updated_at();

alter table public.chat_message_user_states enable row level security;

revoke all on public.chat_message_user_states from anon, authenticated;
grant select on public.chat_message_user_states to authenticated;

drop policy if exists "chat_message_user_states_select_own_accessible" on public.chat_message_user_states;
create policy "chat_message_user_states_select_own_accessible"
  on public.chat_message_user_states
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and app_private.can_access_chat_thread(thread_id)
  );

do $$
declare
  table_name text := 'chat_message_user_states';
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-m4v',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
    where id = 'footballscience-chat-attachments';
  end if;
end $$;
