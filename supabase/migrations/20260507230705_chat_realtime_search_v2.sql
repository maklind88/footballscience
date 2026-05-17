-- Chat v2: realtime publication, search support, and richer thread taxonomy.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pg_trgm set schema extensions;

alter table public.chat_threads
  drop constraint if exists chat_threads_type_check;

alter table public.chat_threads
  add constraint chat_threads_type_check
  check (type in ('team', 'group', 'dm', 'system', 'medical', 'matchday', 'training', 'announcement'));

alter table public.chat_threads
  drop constraint if exists chat_threads_visibility_check;

alter table public.chat_threads
  add constraint chat_threads_visibility_check
  check (visibility in ('members', 'staff', 'medical', 'private'));

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
          thread.type in ('team', 'group', 'matchday', 'training', 'announcement')
          and thread.team_id is not null
          and app_private.is_chat_team_member(thread.team_id)
        )
        or (
          thread.type = 'medical'
          and thread.team_id is not null
          and exists (
            select 1
            from public.chat_team_memberships membership
            where membership.team_id = thread.team_id
              and membership.user_id = (select auth.uid())
              and membership.status = 'active'
              and membership.role in ('admin', 'coach', 'medical', 'performance')
          )
        )
        or (
          thread.type in ('dm', 'system')
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

create index if not exists chat_threads_legacy_thread_idx
  on public.chat_threads ((metadata ->> 'legacyThreadId'))
  where archived_at is null;

create index if not exists chat_messages_body_trgm_idx
  on public.chat_messages
  using gin (body extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists chat_messages_thread_cursor_idx
  on public.chat_messages (thread_id, created_at desc, id desc)
  where deleted_at is null;

create index if not exists chat_attachments_thread_status_idx
  on public.chat_attachments (thread_id, status, created_at desc);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'chat_threads',
      'chat_thread_participants',
      'chat_messages',
      'chat_reactions',
      'chat_read_receipts',
      'chat_attachments'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
