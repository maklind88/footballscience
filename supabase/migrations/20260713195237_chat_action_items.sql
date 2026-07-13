create table if not exists public.chat_action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  client_action_id text check (client_action_id is null or char_length(client_action_id) <= 120),
  title text not null check (char_length(title) between 1 and 240),
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  owner_id uuid references auth.users(id) on delete set null,
  due_label text check (due_label is null or char_length(due_label) <= 120),
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (thread_id, client_action_id),
  constraint chat_action_items_completed_state_check check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done')
  ),
  constraint chat_action_items_archived_state_check check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived')
  )
);

create index if not exists chat_action_items_thread_status_idx
  on public.chat_action_items (thread_id, status, created_at desc);

create index if not exists chat_action_items_org_team_status_idx
  on public.chat_action_items (organization_id, team_id, status, created_at desc);

create index if not exists chat_action_items_owner_status_idx
  on public.chat_action_items (owner_id, status, created_at desc)
  where owner_id is not null;

create index if not exists chat_action_items_message_idx
  on public.chat_action_items (message_id)
  where message_id is not null;

drop trigger if exists chat_action_items_touch_updated_at on public.chat_action_items;
create trigger chat_action_items_touch_updated_at
before update on public.chat_action_items
for each row execute function public.chat_touch_updated_at();

alter table public.chat_action_items enable row level security;

revoke all on public.chat_action_items from anon, authenticated;
grant select on public.chat_action_items to authenticated;

drop policy if exists "chat action items are visible inside accessible threads" on public.chat_action_items;
create policy "chat action items are visible inside accessible threads"
on public.chat_action_items
for select
to authenticated
using (
  app_private.can_access_chat_thread(thread_id)
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_action_items'
    )
  then
    alter publication supabase_realtime add table public.chat_action_items;
  end if;
end;
$$;
